#!/usr/bin/env python3
"""Utilidades compartidas para los tres programas QA de invitaciones TITEC.
No almacena credenciales, contraseñas, tokens JWT ni tokens de invitación.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

STATE_FILE = Path.home() / '.local' / 'state' / 'titec-notificaciones-qa-v2' / 'registro.json'
KEYCLOAK = 'http://127.0.0.1:8081'
AUTH = 'http://127.0.0.1:10000'
REALM = 'ticketu-realm'
MARK = 'TITEC_NOTIFICACIONES_QA_V2'
EMAIL_RE = re.compile(r'^[A-Za-z0-9][A-Za-z0-9._+\-]*@[A-Za-z0-9][A-Za-z0-9.\-]*\.[A-Za-z]{2,}$')
UUID_RE = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', re.I)
RUT_RE = re.compile(r'^\d{2}\.\d{3}\.\d{3}-[0-9K]$')

class QaError(Exception):
    pass

def ahora():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')

def assert_local_endpoint(url: str, port: int):
    u = urllib.parse.urlsplit(url)
    if (u.scheme != 'http' or u.hostname not in {'127.0.0.1', 'localhost'} or
        u.port != port or u.path not in {'', '/'} or u.query or u.fragment or u.username or u.password):
        raise QaError(f'Solo se permite localhost:{port} (entorno Docker QA).')
    return url.rstrip('/')

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise QaError('Redirección HTTP no permitida para evitar enviar credenciales a otro destino')

HTTP = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())

def http(base: str, path: str, *, method='GET', data=None, bearer=None, api_key=None, form=False):
    if base not in (KEYCLOAK, AUTH):
        raise QaError('URL fuera del entorno local permitido')
    headers = {'Accept': 'application/json'}
    body = None
    if bearer:
        headers['Authorization'] = 'Bearer ' + bearer
    if api_key:
        headers['x-api-key'] = api_key
    if data is not None:
        if form:
            headers['Content-Type'] = 'application/x-www-form-urlencoded'
            body = urllib.parse.urlencode(data).encode('utf8')
        else:
            headers['Content-Type'] = 'application/json'
            body = json.dumps(data).encode('utf8')
    req = urllib.request.Request(base + path, data=body, headers=headers, method=method)
    try:
        with HTTP.open(req, timeout=15) as resp:
            raw = resp.read()
            return resp.status, json.loads(raw) if raw and 'json' in resp.headers.get('Content-Type','') else None
    except urllib.error.HTTPError as exc:
        raise QaError(f'{method} {path.split("?", 1)[0]} devolvió HTTP {exc.code}') from None
    except (urllib.error.URLError, ConnectionError, TimeoutError, OSError):
        raise QaError(f'No se puede acceder a {base}; confirma que Docker esté levantado.') from None

def dotenv(path: Path):
    if not path.is_file():
        raise QaError(f'No existe el .env de Auth: {path}')
    result = {}
    for line in path.read_text(encoding='utf-8').splitlines():
        s = line.strip()
        if not s or s.startswith('#'):
            continue
        if s.startswith('export '):
            s = s[7:].strip()
        if '=' not in s:
            continue
        k, val = s.split('=', 1)
        k, val = k.strip(), val.strip()
        if not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*', k):
            continue
        if len(val) >= 2 and val[0] in ('"', "'") and val[-1] == val[0]:
            val = val[1:-1]
        else:
            val = re.split(r'\s+#', val, maxsplit=1)[0].strip()
        result[k] = val
    return result

def env_file_path(raw=None):
    options = ([Path(raw).expanduser()] if raw else [
        Path(__file__).resolve().parents[2] / '.env',
        Path.home() / 'Desktop' / 'Auth' / 'arqui' / 'arquitectura' / 'backend' / '.env',
        Path.cwd() / 'backend' / '.env',
        Path.cwd() / '.env',
    ])
    selected = next((p for p in options if p.is_file()), None)
    if selected is None:
        raise QaError('Indica --env-file /ruta/a/arquitectura/backend/.env')
    return selected

def cargar_registro():
    if not STATE_FILE.exists():
        return {'version': 1, 'cuentas': []}
    try:
        d = json.loads(STATE_FILE.read_text(encoding='utf8'))
        if d.get('version') != 1 or not isinstance(d.get('cuentas'), list):
            raise ValueError('formato desconocido')
        return d
    except (ValueError, OSError) as e:
        raise QaError(f'Archivo de registro inválido: {e}') from None

def guardar_registro(d):
    folder = STATE_FILE.parent
    folder.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(folder, 0o700)
    fd, path = tempfile.mkstemp(prefix='.registro-', suffix='.tmp', dir=folder)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, 'w', encoding='utf8') as file:
            json.dump(d, file, indent=2, ensure_ascii=False)
            file.write('\n')
            file.flush()
            os.fsync(file.fileno())
        os.replace(path, STATE_FILE)
        os.chmod(STATE_FILE, 0o600)
    finally:
        if os.path.exists(path):
            os.unlink(path)

def validar_identidad(email, rut, uuid=None):
    if not EMAIL_RE.fullmatch(email) or len(email) > 254:
        raise QaError('Email inválido')
    if not RUT_RE.fullmatch(rut):
        raise QaError('RUT de QA inválido')
    if uuid is not None and not UUID_RE.fullmatch(uuid):
        raise QaError('UUID no válido')

def rut_qa(n):
    # Valor aleatorio, dígito verificador módulo 11; no representa identidad verificada.
    digits = str(n)
    factor, total = 2, 0
    for ch in reversed(digits):
        total += int(ch) * factor
        factor = 2 if factor == 7 else factor + 1
    dv = 11 - total % 11
    dv = '0' if dv == 11 else 'K' if dv == 10 else str(dv)
    return f'{digits[:-6]}.{digits[-6:-3]}.{digits[-3:]}-{dv}'

def admin_auth(config):
    if config.get('KEYCLOAK_REALM', REALM) != REALM:
        raise QaError('Se permite solamente el realm de desarrollo ticketu-realm')
    password = config.get('KEYCLOAK_ADMIN_PASSWORD') or ''
    if not password:
        raise QaError('Falta KEYCLOAK_ADMIN_PASSWORD en backend/.env')
    _, obj = http(KEYCLOAK, '/realms/master/protocol/openid-connect/token', method='POST', form=True, data={
        'grant_type':'password', 'client_id':'admin-cli',
        'username':config.get('KEYCLOAK_ADMIN_USER','admin'), 'password':password
    })
    access = (obj or {}).get('access_token')
    if not access:
        raise QaError('Keycloak no devolvió token administrativo')
    return access

def raiz_kc():
    return '/admin/realms/' + REALM

def buscar_kc(email, token):
    query = urllib.parse.urlencode({'email': email, 'exact':'true'})
    _, users = http(KEYCLOAK, f'{raiz_kc()}/users?{query}', bearer=token)
    matches = [u for u in (users or []) if u.get('email','').lower() == email.lower()]
    if len(matches) > 1:
        raise QaError('Múltiples usuarios con el mismo correo en Keycloak')
    return matches[0] if matches else None

def kc_por_id(id, token):
    _, data = http(KEYCLOAK, f'{raiz_kc()}/users/{id}', bearer=token)
    return data

def marca_valida(kc_user, marca):
    # Compatibilidad de nombre. V2 emplea GRUPOS Keycloak como marca real,
    # pues User Profile puede descartar atributos personalizados arbitrarios.
    return False


def attr_rut(kc_user):
    value = (kc_user.get('attributes') or {}).get('rut', [])
    return value[0] if isinstance(value, list) and value else value


def obtener_grupo(group_id, token):
    if not UUID_RE.fullmatch(group_id):
        raise QaError('UUID del grupo QA inválido')
    _, group = http(KEYCLOAK, f'{raiz_kc()}/groups/{group_id}', bearer=token)
    return group or {}


def miembros_grupo(group_id, token):
    if not UUID_RE.fullmatch(group_id):
        raise QaError('UUID del grupo QA inválido')
    _, members = http(KEYCLOAK, f'{raiz_kc()}/groups/{group_id}/members?first=0&max=100', bearer=token)
    return members or []


def grupos_usuario(user_id, token):
    if not UUID_RE.fullmatch(user_id):
        raise QaError('UUID usuario Keycloak inválido')
    _, groups = http(KEYCLOAK, f'{raiz_kc()}/users/{user_id}/groups?first=0&max=100', bearer=token)
    return groups or []


def marca_grupo_valida(user_id, group_id, group_name, token):
    group = obtener_grupo(group_id, token)
    if group.get('name') != group_name or group.get('id') != group_id:
        return False
    return any(g.get('id') == group_id for g in grupos_usuario(user_id, token))

def sql_quote(v):
    return "'" + str(v).replace("'", "''") + "'"

def postgres_sql(sql):
    # Consulta EXCLUSIVAMENTE a PostgreSQL del entorno local de Auth.
    command = [
        'docker', 'exec', '-i', 'ticketu-db', 'sh', '-c',
        'PGPASSWORD="${POSTGRES_PASSWORD:-}" exec psql -X -q -t -A -v ON_ERROR_STOP=1 '
        '-U "${POSTGRES_USER:-admin}" -d "${POSTGRES_DB:-ticketu}"'
    ]
    try:
        completed = subprocess.run(command, input=sql, text=True, capture_output=True, timeout=25, check=False)
    except (FileNotFoundError, subprocess.TimeoutExpired):
        raise QaError('No fue posible ejecutar psql en ticketu-db (Docker local).') from None
    if completed.returncode != 0:
        raise QaError('PostgreSQL rechazó la operación; revisa si ticketu-db pertenece al entorno QA y está accesible.')
    return completed.stdout.strip()

def fila_pg(c):
    uid = c.get('uuid')
    if not uid:
        return 0
    validar_identidad(c['email'], c['rut'], uid)
    sql = (f'SELECT count(*) FROM public.users WHERE uuid={sql_quote(uid)}::uuid '
           f'AND email={sql_quote(c["email"])} AND rut={sql_quote(c["rut"])} '
           f'AND rol={sql_quote(c["rol"])};')
    out = postgres_sql(sql).splitlines()
    return int(out[-1])


def comprobar_docker_qa(requerir_auth=True):
    """Bloquea ejecución por accidente contra contenedores no pertenecientes al QA local."""
    required = ['ticketu-db', 'ticketu-keycloak']
    if requerir_auth:
        required.append('ticketu-auth-service')
    for name in required:
        try:
            p = subprocess.run(['docker','inspect','--format','{{.State.Running}}',name],
                               text=True,capture_output=True,timeout=10)
        except (FileNotFoundError, subprocess.TimeoutExpired):
            raise QaError('Docker local no está disponible.') from None
        if p.returncode or p.stdout.strip() != 'true':
            raise QaError(f'El contenedor local QA {name} no está ejecutándose.')
    if requerir_auth:
        p = subprocess.run(['docker','exec','ticketu-auth-service','node','-e',
                            'process.stdout.write(process.env.NODE_ENV || "")'],
                           text=True,capture_output=True,timeout=10)
        if p.returncode or p.stdout.strip() != 'development':
            raise QaError('Auth no se está ejecutando con NODE_ENV=development; operación prohibida.')
