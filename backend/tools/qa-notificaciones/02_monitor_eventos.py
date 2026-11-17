#!/usr/bin/env python3
"""Monitor de los logs de Auth y Notificaciones sin consumir mensajes RabbitMQ."""
from __future__ import annotations
import argparse
import re
import subprocess
import sys
import threading
from titec_qa_comun import QaError

SOURCES={
    'AUTH':('ticketu-auth-service',re.compile(r'cuenta_staff|CORREO_AUTH|STAFF_INVITE|KEYCLOAK_MIRROR|Espejo creado|invitaci[oó]n|Outbox no',re.I)),
    'NOTIF':('notificaciones-notificaciones-1',re.compile(r'cuenta_staff|correo_auth|smtp|rabbitmq|error|correo',re.I)),
}
URL=re.compile(r'https?://[^\s"\']+',re.I)
SECRET=re.compile(r'(?i)(?:jwt=|token=|password=|smtp_pass=|authorization\s*[:=]|x-api-key\s*[:=])[^\s"\',;]+')


def resumen(label,s):
    if 'URL_INVITACION' in s or 'DEMO_LOCAL' in s:
        return None
    if 'Evento cuenta_staff publicado' in s:
        return '[+] AUTH publicó cuenta_staff en RabbitMQ'
    if '[CORREO_AUTH][ENTREGADO]' in s:
        return '[+] AUTH recibió confirmación exitosa de Notificaciones (verificar buzón real)'
    if '[CORREO_AUTH][REBOTADO]' in s:
        return '[!] AUTH recibió error SMTP desde Notificaciones; la respuesta RabbitMQ sí llegó'
    if '[CORREO_AUTH][PAYLOAD_INVALIDO]' in s:
        return '[!] Contrato correo_auth inválido'
    if 'pendiente de reintento' in s:
        return '[!] Worker AUTH reintentará publicar invitación'
    if 'Espejo creado' in s:
        return '[+] AUTH creó espejo de usuario administrativo en PostgreSQL'
    if 'recuperacion_cuenta' in s:
        return '[*] Evento de recuperación (no confundir con invitación inicial STAFF)'
    cleaned=SECRET.sub('[SECRETO]', URL.sub('[URL_OCULTA]',s))[:320]
    return f'[*] {label} {cleaned}'


def worker(label,name,pattern,since,stop,processes,lock):
    cmd=['docker','logs','--follow','--timestamps','--since',f'{since}m',name]
    try:
        p=subprocess.Popen(cmd,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,errors='replace',bufsize=1)
        processes.append(p)
        for line in p.stdout:
            if stop.is_set():
                break
            if pattern.search(line):
                msg=resumen(label,line.rstrip())
                if msg:
                    with lock:
                        print(msg,flush=True)
        if not stop.is_set() and p.poll() not in (None,0):
            with lock:
                print(f'[!] No se pudo leer logs de {name}',flush=True)
    except FileNotFoundError:
        with lock:
            print('[!] Docker no está disponible',flush=True)
    finally:
        if 'p' in locals() and p.poll() is None:
            p.terminate()


def main():
    parser=argparse.ArgumentParser(description='Notificaciones: escuchar logs del flujo real STAFF, sin consumir RabbitMQ')
    parser.add_argument('--since',type=int,default=1,help='Minutos anteriores a incluir (1 por defecto)')
    args=parser.parse_args()
    if not 0<=args.since<=120:
        parser.error('--since debe estar entre 0 y 120')
    print('[+] Monitor Notificaciones / TITEC iniciado')
    print('[*] Escuchando contenedores Auth y Notificaciones; solo lectura')
    print('[*] Ejecuta 01_crear_usuarios.py en otra terminal; Ctrl+C para salir.\n',flush=True)
    stop=threading.Event(); processes=[]; lock=threading.Lock(); threads=[]
    for label,(name,pattern) in SOURCES.items():
        t=threading.Thread(target=worker,args=(label,name,pattern,args.since,stop,processes,lock),daemon=True)
        t.start();threads.append(t)
    try:
        while any(t.is_alive() for t in threads):
            for t in threads:
                t.join(timeout=.3)
    except KeyboardInterrupt:
        print('\n[-] Monitor detenido. No se modificaron usuarios.',flush=True)
    finally:
        stop.set()
        for p in list(processes):
            if p.poll() is None:
                p.terminate()
        for t in threads:
            t.join(timeout=2)
    return 0

if __name__=='__main__':
    sys.exit(main())
