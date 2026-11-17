#!/usr/bin/env python3
"""Notificaciones: crea una cuenta administrativa para probar invitación real de Auth.
Sin alterar usuarios del seed. Marca procedencia mediante grupo exclusivo en Keycloak.
"""
from __future__ import annotations

import argparse
import re
import secrets
import sys
import unicodedata
import urllib.parse

from titec_qa_comun import (
    AUTH, KEYCLOAK, MARK, QaError, admin_auth, ahora, buscar_kc,
    cargar_registro, comprobar_docker_qa, dotenv, env_file_path,
    guardar_registro, http, kc_por_id, attr_rut, obtener_grupo, grupos_usuario,
    postgres_sql, raiz_kc, rut_qa, sql_quote, validar_identidad,
)


def simple(s):
    s = unicodedata.normalize('NFKD', s)
    s = ''.join(c for c in s if not unicodedata.combining(c))
    return re.sub(r'[^a-z0-9]+', '.', s.lower()).strip('.')


def datos(args):
    nombre = (args.nombre or input('Nombre [Prueba]: ').strip() or 'Prueba').strip()
    apellido = (args.apellido or input('Apellido [Staff]: ').strip() or 'Staff').strip()
    if not nombre or not apellido or len(nombre) > 65 or len(apellido) > 65 or any(x in nombre + apellido for x in '\r\n\t'):
        raise QaError('Nombre y apellido deben ser textos breves válidos')
    rol = args.rol.upper()
    if rol not in {'STAFF','ORGANIZADOR'}:
        raise QaError('Rol inválido; utiliza STAFF u ORGANIZADOR')
    sufijo = secrets.token_hex(3)
    sugerido = f'{simple(nombre)}.{simple(apellido)}.{sufijo}@ticketu.test'
    email = (args.correo or input(f'Correo [Enter = {sugerido}]: ').strip() or sugerido).lower()
    if email in {f'{r}{i}@ticketu.test' for r in ('staff','organizador','comprador') for i in range(1,4)}:
        raise QaError('El correo corresponde a una de las nueve cuentas QA; no se permite modificarla.')
    rut = rut_qa(99500000 + secrets.randbelow(400000))
    validar_identidad(email, rut)
    return {'fuente':MARK,'email':email,'nombre':nombre,'apellido':apellido,
            'rol':rol,'rut':rut,'estado':'planificado','creado_en':ahora(),
            'uuid':None,'grupo_id':None,'grupo_nombre':'TITEC_NOTIF_QA_' + secrets.token_hex(8).upper(),
            'invitacion_programada':False}


def preflight(config, c):
    if config.get('KEYCLOAK_REALM', 'ticketu-realm') != 'ticketu-realm':
        raise QaError('Se permite solo ticketu-realm local')
    if len(config.get('INTERNAL_API_KEY') or '') < 12:
        raise QaError('Falta INTERNAL_API_KEY en .env de Auth')
    comprobar_docker_qa()
    status,_ = http(AUTH,'/api/health')
    if status != 200:
        raise QaError('Auth no devuelve HTTP 200 en /api/health')
    token = admin_auth(config)
    _,role = http(KEYCLOAK,f'{raiz_kc()}/roles/{c["rol"]}',bearer=token)
    if not role or role.get('name') != c['rol']:
        raise QaError('Falta realm role ' + c['rol'])
    if buscar_kc(c['email'],token):
        raise QaError('Ya existe el correo en Keycloak: no se modificará el usuario existente')
    sql = (f'SELECT count(*) FROM public.users WHERE email={sql_quote(c["email"])} '
           f'OR rut={sql_quote(c["rut"])};')
    out = postgres_sql(sql).strip().splitlines()
    if not out or int(out[-1]) != 0:
        raise QaError('Colisión de correo o RUT en PostgreSQL')
    reg=cargar_registro()
    if any(x.get('email')==c['email'] and x.get('estado')!='eliminado' for x in reg['cuentas']):
        raise QaError('Ya está en el registro de este kit. Revisa 03_limpiar_usuarios.py --list')
    return token,role


def buscar_grupo_exacto(nombre, token):
    qs = urllib.parse.urlencode({'search':nombre,'exact':'true','first':0,'max':100})
    _, groups = http(KEYCLOAK,f'{raiz_kc()}/groups?{qs}',bearer=token)
    return [g for g in (groups or []) if g.get('name')==nombre]


def ejecutar(c, token, role, config, reg):
    # Cada usuario lleva una marca QUE NO depende de atributos opcionales del User Profile.
    if buscar_grupo_exacto(c['grupo_nombre'], token):
        raise QaError('Colisión improbable de nombre de grupo; no se creó usuario.')
    status,_ = http(KEYCLOAK,f'{raiz_kc()}/groups',method='POST',
                     data={'name':c['grupo_nombre']},bearer=token)
    if status!=201:
        raise QaError(f'Keycloak no creó grupo QA (HTTP {status})')
    groups=buscar_grupo_exacto(c['grupo_nombre'],token)
    if len(groups)!=1 or not groups[0].get('id'):
        raise QaError('No se pudo localizar el grupo QA recién creado')
    c['grupo_id']=groups[0]['id']
    c['estado']='grupo_creado'
    guardar_registro(reg)
    print('[+] Identificador seguro del test creado en Keycloak')

    status,_=http(KEYCLOAK,f'{raiz_kc()}/users',method='POST',bearer=token,data={
        'username':c['email'],'email':c['email'],'enabled':True,
        'emailVerified':True,'firstName':c['nombre'],'lastName':c['apellido'],
        'requiredActions':[],'attributes':{'rut':[c['rut']]}
    })
    if status!=201:
        raise QaError(f'Keycloak no creó cuenta (HTTP {status})')
    kc=buscar_kc(c['email'],token)
    if not kc or not kc.get('id'):
        raise QaError('Cuenta creada pero no se encontró UUID: usar lista y revisar manualmente')
    c['uuid']=kc['id']
    c['estado']='usuario_creado'
    guardar_registro(reg)

    # Asociar la marca mediante la membresía de grupo (Keycloak la conserva aunque
    # su perfil de usuario rechace atributos arbitrarios de test).
    status,_=http(KEYCLOAK,
        f'{raiz_kc()}/users/{c["uuid"]}/groups/{c["grupo_id"]}',
        method='PUT',bearer=token)
    if status!=204:
        raise QaError('Falló asignación de grupo de trazabilidad, se detiene por seguridad')
    member_groups=grupos_usuario(c['uuid'],token)
    if not any(x.get('id')==c['grupo_id'] for x in member_groups):
        raise QaError('Keycloak no confirmó pertenencia al grupo QA')
    c['estado']='marcado'
    guardar_registro(reg)
    print('[+] Cuenta creada y marcada para limpieza segura')

    full=kc_por_id(c['uuid'],token)
    if attr_rut(full)!=c['rut']:
        # Algunos Keycloak rechazan atributos no declarados en User Profile.
        # Reintentar PUT sin modificar la configuración global del realm.
        newattrs=dict(full.get('attributes') or {})
        newattrs['rut']=[c['rut']]
        status,_=http(KEYCLOAK,f'{raiz_kc()}/users/{c["uuid"]}',method='PUT',bearer=token,
                      data={'attributes':newattrs})
        full=kc_por_id(c['uuid'],token)
        if attr_rut(full)!=c['rut']:
            raise QaError('Keycloak no acepta atributo rut. Revisar User Profile del realm; '
                          'la cuenta está registrada para limpiar con el programa 03.')
    print('[+] RUT de prueba confirmado en Keycloak')

    status,_=http(KEYCLOAK,f'{raiz_kc()}/users/{c["uuid"]}/role-mappings/realm',
                  method='POST',data=[role],bearer=token)
    if status!=204:
        raise QaError('No se pudo asignar el rol de realm; usar limpieza')
    c['estado']='rol_asignado'
    guardar_registro(reg)
    print(f'[+] Realm role {c["rol"]} asignado')

    status,response=http(AUTH,'/api/auth/provision',method='POST',
                         data={'email':c['email']},api_key=config['INTERNAL_API_KEY'])
    if status!=201:
        raise QaError(f'Auth no provisionó (HTTP {status})')
    c['estado']='provisionado'
    c['invitacion_programada']=bool((response or {}).get('invitacionProgramada'))
    guardar_registro(reg)
    print('[+] Auth aceptó el provisionamiento')
    if c['invitacion_programada']:
        print('[+] Invitación programada: el worker publicará cuenta_staff en RabbitMQ')
    else:
        print('[!] Es posible que el sincronizador de Auth haya creado la invitación antes: mirar el monitor')


def main():
    p=argparse.ArgumentParser(description='Notificaciones / TITEC: crear STAFF para prueba de invitación')
    p.add_argument('--env-file',help='Ruta al .env del backend Auth local')
    p.add_argument('--nombre',help='Nombre (evita pregunta interactiva)')
    p.add_argument('--apellido',help='Apellido (evita pregunta interactiva)')
    p.add_argument('--correo',help='Buzón controlado por el equipo; omitir para usar @ticketu.test')
    p.add_argument('--rol',choices=('STAFF','ORGANIZADOR'),default='STAFF')
    p.add_argument('--confirmar',action='store_true',help='Confirma creación y posible correo a destino indicado')
    args=p.parse_args()
    print('[*] Prueba real de invitaciones TITEC / Notificaciones')
    print('[*] Sin crear contraseñas ni modificar las nueve cuentas QA existentes.\n')
    c=datos(args)
    print(f'[+] {c["rol"]} | {c["nombre"]} {c["apellido"]} | {c["email"]} | RUT: {c["rut"]}')
    if not c['email'].endswith('@ticketu.test'):
        print('[!] Si SMTP está habilitado, Notificaciones intentará enviar correo a esta dirección.')
        print('[!] Utiliza únicamente un buzón tuyo o del equipo, con permiso para la prueba.')
    if not args.confirmar:
        if input('[?] ¿Crear y probar esta cuenta? [s/N]: ').strip().lower() not in ('s','si','sí'):
            print('[-] Cancelado. No se creó ningún usuario.')
            return 0
    config=dotenv(env_file_path(args.env_file))
    token,role=preflight(config,c)
    reg=cargar_registro()
    reg['cuentas'].append(c)
    guardar_registro(reg)
    try:
        ejecutar(c,token,role,config,reg)
    finally:
        guardar_registro(reg)
    print(f'\n[+] Listo. Correo: {c["email"]}')
    print('[*] Revisa 02_monitor_eventos.py en otra terminal.')
    print('[*] Sin SMTP pueden aparecer confirmaciones de error: RabbitMQ igual puede estar correcto.')
    print('[*] Limpieza: python3 03_limpiar_usuarios.py --list / --delete')
    return 0

if __name__=='__main__':
    try:
        sys.exit(main())
    except (QaError,EOFError,KeyboardInterrupt) as e:
        print(f'\n[!] {str(e) or "Operación cancelada"}',file=sys.stderr)
        print('[*] Si se alcanzó a crear una cuenta, consúltala con 03_limpiar_usuarios.py --list',file=sys.stderr)
        sys.exit(1)
