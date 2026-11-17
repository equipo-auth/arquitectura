#!/usr/bin/env python3
"""Borra solo cuentas creadas por el kit V2, verificando registro local + grupo Keycloak.
No afecta usuarios QA originales, contraseñas ajenas, infraestructura ni auditoría.
"""
from __future__ import annotations
import argparse
import sys
from titec_qa_comun import (
    KEYCLOAK,MARK,QaError,admin_auth,buscar_kc,cargar_registro,comprobar_docker_qa,
    dotenv,env_file_path,fila_pg,guardar_registro,http,kc_por_id,
    marca_grupo_valida,obtener_grupo,miembros_grupo,attr_rut,postgres_sql,
    raiz_kc,sql_quote,validar_identidad,UUID_RE,
)


def activos(reg):
    return [c for c in reg['cuentas'] if c.get('estado')!='eliminado']


def mostrar(reg):
    print('[+] Cuentas creadas por el kit Notificaciones V2')
    if not reg['cuentas']:
        print('[-] No hay cuentas registradas')
    for c in reg['cuentas']:
        print(f'[*] {c.get("estado", "?"):20} {c.get("rol", "?"):12} {c.get("email", "?")}')


def preflight_pg(c):
    email,rut,uid,rol=c['email'],c['rut'],c['uuid'],c['rol']
    sql=(f'SELECT count(*) FROM public.users WHERE (email={sql_quote(email)} '
         f'OR rut={sql_quote(rut)}) AND uuid<>{sql_quote(uid)}::uuid;')
    rows=postgres_sql(sql).splitlines()
    if not rows or int(rows[-1])!=0:
        raise QaError('Hay un registro PostgreSQL con el mismo correo/RUT y diferente UUID. Se bloquea limpieza.')
    return fila_pg(c)


def borrar(c,token,reg):
    if c.get('fuente') != MARK:
        raise QaError('Registro no pertenece a la versión 2; no se borra')
    validar_identidad(c['email'],c['rut'],c.get('uuid'))
    gid=c.get('grupo_id')
    gname=c.get('grupo_nombre','')
    if not gname.startswith('TITEC_NOTIF_QA_') or len(gname)!=len('TITEC_NOTIF_QA_')+16:
        raise QaError('Falta marca de grupo exclusiva de este kit')
    # Usuario creado inicialmente antes de asociarlo al grupo: no hay prueba
    # independiente de pertenencia; bloquear limpieza de ese usuario.
    actual=buscar_kc(c['email'],token)
    if actual and (not gid or not UUID_RE.fullmatch(gid)):
        raise QaError('Cuenta parcial sin grupo registrado; revisión manual, no se toca')
    if gid:
        group=obtener_grupo(gid,token)
        if group.get('id')!=gid or group.get('name')!=gname:
            raise QaError('El grupo de marca no coincide; NO se borra')
    if actual:
        uid=actual.get('id')
        if not uid or uid != c.get('uuid'):
            raise QaError('UUID de Keycloak difiere del registro local')
        full=kc_por_id(uid,token)
        # Si User Profile descartó `rut`, el registro quedó solo en estado
        # 'marcado'. La membresía del grupo + UUID + identidad aún protegen el borrado.
        rut_actual=attr_rut(full)
        rut_correcto=(rut_actual==c['rut'] or
                      (c['estado']=='marcado' and not rut_actual))
        if not (full.get('email','').lower()==c['email'] and
                full.get('firstName')==c['nombre'] and full.get('lastName')==c['apellido'] and
                rut_correcto):
            raise QaError('Perfil de usuario no coincide: no se borra')
        if not marca_grupo_valida(uid,gid,gname,token):
            raise QaError('No se confirmó membresía en el grupo QA; no se borra')
        members=miembros_grupo(gid,token)
        if len(members)!=1 or members[0].get('id')!=uid:
            raise QaError('El grupo de marca contiene miembros inesperados; no se borra')
        if c['estado'] in ('rol_asignado','provisionado'):
            _,roles=http(KEYCLOAK,f'{raiz_kc()}/users/{uid}/role-mappings/realm/composite',bearer=token)
            names={r.get('name','').upper() for r in (roles or [])}
            if c['rol'] not in names or any(r in names for r in ({'STAFF','ORGANIZADOR'}-{c['rol']})):
                raise QaError('Roles cambiados desde la creación: bloqueo de limpieza')
    elif gid:
        if miembros_grupo(gid,token):
            raise QaError('Grupo con miembros pero usuario no encontrado; no se borra')
    # No eliminar un espejo PG si el UUID no está registrado y verificado.
    if c.get('uuid'):
        preflight_pg(c)
    if actual:
        status,_=http(KEYCLOAK,f'{raiz_kc()}/users/{c["uuid"]}',method='DELETE',bearer=token)
        if status!=204:
            raise QaError(f'Keycloak no confirmó DELETE (HTTP {status})')
        c['estado']='keycloak_eliminado';guardar_registro(reg)
        print(f'[+] Usuario Keycloak eliminado: {c["email"]}')
    if c.get('uuid') and fila_pg(c)==1:
        # La BD Auth almacena tokens/outbox con FK CASCADE respecto a users.
        sql=(f'DELETE FROM public.users WHERE uuid={sql_quote(c["uuid"])}::uuid '
             f'AND email={sql_quote(c["email"])} AND rut={sql_quote(c["rut"])} '
             f'AND rol={sql_quote(c["rol"])};')
        postgres_sql(sql)
        if fila_pg(c)!=0:
            raise QaError('PostgreSQL todavía conserva la cuenta, revisar manualmente')
        print('[+] Espejo PostgreSQL eliminado')
    if gid:
        members=miembros_grupo(gid,token)
        if members:
            raise QaError('Grupo aún con miembros; se conserva para revisión')
        status,_=http(KEYCLOAK,f'{raiz_kc()}/groups/{gid}',method='DELETE',bearer=token)
        if status!=204:
            raise QaError(f'Keycloak no eliminó grupo QA (HTTP {status})')
        print('[+] Grupo de trazabilidad eliminado')
    c['estado']='eliminado';guardar_registro(reg)
    print(f'[+] Limpieza terminada: {c["email"]}')


def main():
    p=argparse.ArgumentParser(description='Notificaciones: borrar solo cuentas creadas y marcadas por kit V2')
    p.add_argument('--list',action='store_true',help='Mostrar el registro local, sin cambios')
    p.add_argument('--delete',action='store_true',help='Eliminar cuentas del registro tras confirmación')
    p.add_argument('--env-file',help='Ruta al .env del backend Auth local')
    args=p.parse_args()
    reg=cargar_registro();mostrar(reg)
    pendientes=activos(reg)
    if not args.delete or args.list:
        print('[-] Solo consulta. Usa --delete para iniciar limpieza.')
        return 0
    if not pendientes:
        print('[-] No hay cuentas pendientes')
        return 0
    print('[!] Se eliminarán cuentas Keycloak y espejo PG registrados por este kit solamente.')
    print('[!] Tokens e invitaciones asociados se eliminarán; se conservan logs de auditoría.')
    phrase='ELIMINAR '+str(len(pendientes))
    if input(f'[?] Escribe exactamente {phrase}: ').strip()!=phrase:
        print('[-] Cancelado; no se modificó nada')
        return 0
    comprobar_docker_qa(requerir_auth=False)
    token=admin_auth(dotenv(env_file_path(args.env_file)))
    errores=0
    for c in pendientes:
        try:
            borrar(c,token,reg)
        except QaError as e:
            errores+=1
            print(f'[!] {c.get("email","?")}: {e}',file=sys.stderr)
    print(f'[*] Finalizado: {len(pendientes)-errores} completados, {errores} pendientes')
    return 1 if errores else 0

if __name__=='__main__':
    try:
        sys.exit(main())
    except (QaError,EOFError,KeyboardInterrupt) as e:
        print(f'[!] {str(e) or "Cancelado"}',file=sys.stderr)
        sys.exit(1)
