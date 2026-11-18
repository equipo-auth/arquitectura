#!/usr/bin/env bash
set -euo pipefail
# Evidencia CA1: peticiones al backend NestJS real; NO incluye mocks ni stubs.
AUTH_URL="${AUTH_URL:-http://localhost:10000}"
GATEWAY_URL="${GATEWAY_URL:-http://localhost:8080}"
COOKIE_JAR="${COOKIE_JAR:-}"

expect_status() {
  local expected="$1"; shift
  local code
  code="$(curl -sS -o /tmp/titec-auth-probe-response.json -w '%{http_code}' "$@")"
  echo "HTTP $code (esperado $expected) - $*"
  if [ "$code" != "$expected" ]; then
    cat /tmp/titec-auth-probe-response.json
    echo >&2 'PRUEBA FALLIDA'; exit 1
  fi
}

expect_status 200 "$AUTH_URL/api/health"
expect_status 200 "$AUTH_URL/.well-known/jwks.json"
expect_status 403 "$AUTH_URL/internal/validar-sesion"
if [ -n "${INTERNAL_API_KEY:-}" ]; then
  expect_status 401 -H "x-api-key: $INTERNAL_API_KEY" "$AUTH_URL/internal/validar-sesion"
  expect_status 403 -H 'x-api-key: incorrecta' "$AUTH_URL/internal/validar-sesion"
  if [ -n "$COOKIE_JAR" ] && [ -f "$COOKIE_JAR" ]; then
    expect_status 200 -H "x-api-key: $INTERNAL_API_KEY" -b "$COOKIE_JAR" "$AUTH_URL/internal/validar-sesion"
  else
    echo 'NOTA: 200 con cookie real pendiente: define COOKIE_JAR=/ruta/cookies.txt'
  fi
else
  echo 'NOTA: define INTERNAL_API_KEY para probar el 401 y el 200 interno.'
fi
if curl -fsS "$GATEWAY_URL/health" >/dev/null; then
  echo 'Gateway real: disponible'
else
  echo 'Gateway todavía no disponible (no se considera prueba de Auth fallida).'
fi
echo 'Fin de pruebas HTTP reales. Ejecuta Jest/Postman para completar HU y CA1.'
