#!/usr/bin/env bash
set -euo pipefail

check() {
  local label="$1" url="$2"
  local status
  status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 "$url" || true)"
  if [[ "$status" == '200' ]]; then
    printf 'OK  %-22s HTTP %s\n' "$label" "$status"
  else
    printf 'FALLO %-22s HTTP %s\n' "$label" "$status"
    return 1
  fi
}
check 'Keycloak realm' 'http://localhost:8081/realms/ticketu-realm/.well-known/openid-configuration'
check 'Auth /api/health' 'http://localhost:10000/api/health'
check 'Frontend /auth' 'http://localhost:3001/auth'
printf '\nVerificacion HTTP basica correcta. Todavia hay que probar registro real, login y GET /internal/validar-sesion con la cookie y x-api-key desde Entradas.\n'
