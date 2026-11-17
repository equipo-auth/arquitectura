#!/usr/bin/env python3
"""Prueba HTTP real de las 9 cuentas QA TicketU, sin modificar bases ni guardar cookies.

Uso: python3 backend/tools/probar-9-usuarios-qa.py
Prerequisitos: Gateway en localhost:8080, Auth en localhost:10000, Docker activo.
"""
import json
import subprocess
import sys
import urllib.error
import urllib.request

GATEWAY = 'http://localhost:8080'
AUTH = 'http://localhost:10000'
QA_PASSWORD = 'TicketuQA2026!'  # Pública, SOLO usuarios de demostración @ticketu.test

# El seed QA estableció una misma contraseña para las nueve cuentas.
ACCOUNTS = [
    (f'comprador{i}@ticketu.test', 'usuario', False) for i in range(1, 4)
] + [
    (f'staff{i}@ticketu.test', 'staff', True) for i in range(1, 4)
] + [
    (f'organizador{i}@ticketu.test', 'organizador', True) for i in range(1, 4)
]


def http(method, url, body=None, headers=None):
    h = dict(headers or {})
    data = None
    if body is not None:
        data = json.dumps(body).encode('utf-8')
        h['Content-Type'] = 'application/json'
    req = urllib.request.Request(url, data=data, headers=h, method=method)
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(req, timeout=8) as response:
            content = response.read(256 * 1024)
            return response.status, response.headers, content
    except urllib.error.HTTPError as e:
        return e.code, e.headers, e.read(256 * 1024)


def get_shared_key():
    # El valor se obtiene del contenedor en memoria; nunca se imprime.
    proc = subprocess.run(
        ['docker', 'exec', 'ticketu-auth-service', 'node', '-e',
         'process.stdout.write(process.env.INTERNAL_API_KEY || "")'],
        capture_output=True, text=True, timeout=8, check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError('No se puede leer la configuración del contenedor Auth; comprueba docker ps')
    if not proc.stdout:
        raise RuntimeError('INTERNAL_API_KEY no está configurada en el contenedor Auth')
    return proc.stdout


def parse_json(blob):
    try:
        result = json.loads(blob.decode('utf-8'))
        return result if isinstance(result, dict) else {}
    except (UnicodeDecodeError, json.JSONDecodeError):
        return {}


def jwt_from_headers(headers):
    from http.cookies import SimpleCookie
    for header in headers.get_all('Set-Cookie', []):
        parsed = SimpleCookie()
        try:
            parsed.load(header)
        except Exception:
            continue
        if 'jwt' in parsed:
            cookie = parsed['jwt'].value
            flags_ok = 'httponly' in header.lower() and 'samesite=strict' in header.lower()
            return cookie, flags_ok
    return None, False


def main():
    print('TITEC — comprobación REAL de las 9 cuentas QA (solo lectura)')
    print('No se crearán usuarios ni se cambiarán contraseñas; no se guardarán cookies.\n')
    try:
        for name, url in [('Gateway', GATEWAY + '/health'), ('Auth', AUTH + '/api/health')]:
            code, _, _ = http('GET', url)
            if code != 200:
                raise RuntimeError(f'{name}: HTTP {code} en {url} (esperado 200)')
        key = get_shared_key()
    except (OSError, TimeoutError, RuntimeError, urllib.error.URLError, subprocess.TimeoutExpired) as exc:
        print(f'[ERROR DE INFRAESTRUCTURA] {exc}', file=sys.stderr)
        return 2

    password = QA_PASSWORD

    print('\nCuenta                               Login  JWT  Perfil  Rol        Estado')
    print('-' * 87)
    ok = 0
    for email, expected_role, is_admin in ACCOUNTS:
        try:
            status, headers, blob = http('POST', GATEWAY + '/api/auth/login', {
                'email': email, 'password': password, 'admin': is_admin,
            })
            token, flags_ok = jwt_from_headers(headers)
            if status != 200 or not token:
                result = parse_json(blob)
                reason = 'primer_inicio' if result.get('primer_inicio') else (result.get('error') or result.get('message') or 'sin JWT')
                print(f'{email:<36} {status:<6} NO   --      --         FALLÓ ({str(reason)[:60]})')
                continue

            internal_status, _, internal_blob = http('GET', AUTH + '/internal/validar-sesion', headers={
                'Cookie': 'jwt=' + token,
                'x-api-key': key,
            })
            profile = parse_json(internal_blob)
            user = profile.get('usuario') if isinstance(profile.get('usuario'), dict) else {}
            role = user.get('rol', '--')
            matched = (
                internal_status == 200 and profile.get('valido') is True
                and role == expected_role and user.get('correo_electronico', '').lower() == email
                and bool(user.get('id_usuario')) and flags_ok
            )
            state = 'OK' if matched else 'FALLÓ'
            print(f'{email:<36} {status:<6} SÍ   {internal_status:<7} {role:<10} {state}')
            if matched:
                ok += 1
            elif not flags_ok:
                print('  Motivo: faltan HttpOnly o SameSite=Strict en la cookie JWT')
        except (OSError, TimeoutError, urllib.error.URLError) as exc:
            print(f'{email:<36} --     --   --      --         ERROR DE RED ({type(exc).__name__})')

    print(f'\nRESULTADO: {ok}/9 cuentas con login, cookie y perfil contractual correctos.')
    print('JWT y clave interna no se mostraron ni se guardaron; la clave QA pública consta en los README.')
    return 0 if ok == len(ACCOUNTS) else 1


if __name__ == '__main__':
    sys.exit(main())
