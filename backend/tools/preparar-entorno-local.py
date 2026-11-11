#!/usr/bin/env python3
"""Configura SOLO una instalación de desarrollo nueva, sin secretos en Git.
No reescribe .env ni llaves existentes. Compatible con Python 3 y Docker Desktop.
"""
from __future__ import annotations
import os
import re
import secrets
import shutil
import subprocess
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
ENV = BACKEND / '.env'
EXAMPLE = BACKEND / '.env.example'
PRIVATE = BACKEND / 'private.pem'
PUBLIC = BACKEND / 'public.pem'


def docker_resource_exists(*args: str) -> bool:
    proc = subprocess.run(['docker', 'inspect', *args], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return proc.returncode == 0


def volume_exists(name: str) -> bool:
    return subprocess.run(['docker', 'volume', 'inspect', name],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0


def guarded_new_setup() -> None:
    # Evita crear otro admin/clave cuando hay datos antiguos pero falta .env.
    if (volume_exists('ticketu_keycloak_data') or volume_exists('backend_postgres_data')
            or docker_resource_exists('ticketu-keycloak') or docker_resource_exists('ticketu-db')):
        raise SystemExit(
            'Se detectaron datos/contenedores de Auth existentes y falta backend/.env. '
            'NO se generan credenciales nuevas: recupera la configuración original antes de continuar.')


def create_env() -> None:
    if ENV.exists():
        print('backend/.env existente: se conserva.')
        return
    if not EXAMPLE.exists():
        raise SystemExit('Falta backend/.env.example')
    guarded_new_setup()
    data = EXAMPLE.read_text(encoding='utf-8')
    changes = {
        'KEYCLOAK_ADMIN_PASSWORD': secrets.token_hex(24),
        'KEYCLOAK_CLIENT_SECRET': secrets.token_hex(32),
        'INTERNAL_API_KEY': secrets.token_hex(32),
        'AUTH_OPERATIONS_KEY': secrets.token_hex(32),
    }
    for key, value in changes.items():
        pattern = rf'(?m)^{re.escape(key)}=.*$'
        data, count = re.subn(pattern, f'{key}="{value}"', data)
        if count != 1:
            raise SystemExit(f'No se pudo configurar {key} en .env.example (count={count})')
    mode = 0o600
    fd = os.open(str(ENV), os.O_WRONLY | os.O_CREAT | os.O_EXCL, mode)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            f.write(data)
    except Exception:
        ENV.unlink(missing_ok=True)
        raise
    print('backend/.env de DESARROLLO generado con claves aleatorias. No subir a Git.')


def generate_keys() -> None:
    if PRIVATE.exists() and PUBLIC.exists():
        print('Llaves RSA existentes: se conservan.')
        return
    if PRIVATE.exists() != PUBLIC.exists():
        raise SystemExit('Existe solo una de las dos llaves RSA. No regenerar hasta revisar el original.')
    if not ENV.exists():
        raise SystemExit('Falta .env')
    if (volume_exists('ticketu_keycloak_data') or volume_exists('backend_postgres_data')
            or docker_resource_exists('ticketu-db')):
        raise SystemExit('Hay datos anteriores y faltan las llaves RSA: recupera las originales, no generes otras.')
    script = BACKEND / 'tools' / 'generar-llaves.mjs'
    if not script.is_file():
        raise SystemExit('Falta backend/tools/generar-llaves.mjs (parche inicial).')
    local_node = shutil.which('node')
    if local_node:
        # Usa Node local si es una versión compatible.
        output = subprocess.run([local_node, '--version'], capture_output=True, text=True)
        try:
            major = int(output.stdout.strip().lstrip('v').split('.')[0])
        except Exception:
            major = 0
        if major >= 22:
            subprocess.run([local_node, str(script)], cwd=BACKEND, check=True)
            return
    # Si no hay Node 22+ en el host, usar imagen sin instalar nada en Windows.
    if not shutil.which('docker'):
        raise SystemExit('Para generar llaves necesitas Node 22+ o Docker.')
    cmd = ['docker', 'run', '--rm']
    if hasattr(os, 'getuid'):
        cmd += ['--user', f'{os.getuid()}:{os.getgid()}']
    cmd += ['--mount', f'type=bind,source={BACKEND.resolve()},target=/app',
            'node:22-bookworm-slim', 'node', '/app/tools/generar-llaves.mjs']
    subprocess.run(cmd, check=True)


def main():
    if not shutil.which('docker'):
        raise SystemExit('Docker/Docker Desktop debe estar instalado.')
    create_env()
    generate_keys()
    print('Entorno local preparado. La base de datos y Keycloak se configuran al iniciar Docker.')


if __name__ == '__main__':
    main()
