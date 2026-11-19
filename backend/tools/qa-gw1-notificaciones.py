#!/usr/bin/env python3
"""GW1: prueba real de Auth -> Gateway -> Notificaciones sin conservar JWT.
Se necesita Auth y Notificaciones levantados en el mismo entorno; no crea datos.
Uso: python3 backend/tools/qa-gw1-notificaciones.py
Variables: GATEWAY_PUBLIC_URL, QA_AUTH_EMAIL, QA_AUTH_PASSWORD.
"""
import http.cookiejar
import json
import os
import urllib.request
import urllib.error
import sys

base = os.environ.get('GATEWAY_PUBLIC_URL', 'http://localhost:8080').rstrip('/')
email = os.environ.get('QA_AUTH_EMAIL', 'comprador1@ticketu.test')
password = os.environ.get('QA_AUTH_PASSWORD', 'TicketuQA2026!')
jar = http.cookiejar.CookieJar()
client = urllib.request.build_opener(urllib.request.ProxyHandler({}), urllib.request.HTTPCookieProcessor(jar))

def pedir(path, data=None):
    headers = {'Accept':'application/json'}
    if data is not None:
        headers['Content-Type'] = 'application/json'
    request = urllib.request.Request(base + path, data=json.dumps(data).encode() if data is not None else None, headers=headers)
    try:
        with client.open(request, timeout=10) as response:
            return response.status, response.read(65536)
    except urllib.error.HTTPError as e:
        return e.code, e.read(65536)

login, _ = pedir('/api/auth/login', {'email': email, 'password': password})
print('Login Auth por Gateway:', login)
if login != 200 or not any(c.name == 'jwt' for c in jar):
    sys.exit('FALLO: Auth no entregó la cookie QA')

proveedor, proveedor_body = pedir('/api/notificaciones')
print('Notificaciones directo por Gateway:', proveedor)

consumidor, body = pedir('/api/auth/mis-notificaciones')
print('Auth consume Notificaciones por Gateway:', consumidor)
if consumidor == 200:
    datos = json.loads(body)
    print('Respuesta tipo lista:', isinstance(datos, list))
    print('Notificaciones encontradas:', len(datos) if isinstance(datos, list) else 'respuesta inválida')
    if not isinstance(datos, list):
        sys.exit('FALLO: contrato JSON incompatible')
else:
    print('Error devuelto por Auth (sin exponer cookies ni JWT):', body[:300].decode(errors='replace'))
    sys.exit('FALLO GW1: verificar ruta, Gateway y Notificaciones')
if proveedor != 200:
    sys.exit('FALLO GW1: el proveedor no respondió 200')
print('GW1: flujo HTTP real verificado. Revisa logs del Gateway y del Auth.')
