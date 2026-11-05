#!/usr/bin/env bash
set -euo pipefail

AUTH="${AUTH_BASE_URL:-http://localhost:10000}"
GATEWAY="${GATEWAY_BASE_URL:-http://localhost:8080}"

assert_http() {
  local expected="$1" url="$2" actual
  actual=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 "$url") || {
    echo "ERROR: no hay conexión a $url" >&2
    return 1
  }
  echo "HTTP $actual (esperado $expected) - $url"
  [[ "$actual" == "$expected" ]]
}

assert_http 200 "$AUTH/api/health"
assert_http 200 "$AUTH/.well-known/jwks.json"
assert_http 200 "$GATEWAY/health"
assert_http 200 "$GATEWAY/api/auth/.well-known/jwks.json"
assert_http 401 "$GATEWAY/api/auth/validar-sesion"

echo 'OK: Auth accesible directamente y a través de Gateway. No se probaron credenciales reales.'
