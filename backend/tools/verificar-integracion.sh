#!/usr/bin/env bash
set -euo pipefail

# Sin argumento: comprobar backend + Gateway + Keycloak.
# --frontend-comun: comprobar frontend oficial FWizav/FrontendTitec (3000).
# --frontend-local: comprobar copia QA Auth (3001).
MODE="${1:-}"
if [[ $# -gt 1 || ( "$MODE" != '' && "$MODE" != '--frontend-comun' && "$MODE" != '--frontend-local' ) ]]; then
  echo 'Uso: verificar-integracion.sh [--frontend-comun|--frontend-local]' >&2
  exit 2
fi

check() {
  local label="$1" url="$2" status
  status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 "$url" || true)"
  if [[ "$status" == '200' ]]; then
    printf 'OK  %-30s HTTP %s\n' "$label" "$status"
  else
    printf 'FALLO %-30s HTTP %s\n' "$label" "$status" >&2
    return 1
  fi
}
check 'Keycloak realm' 'http://localhost:8081/realms/ticketu-realm/.well-known/openid-configuration'
check 'Auth /api/health' 'http://localhost:10000/api/health'
check 'Gateway /health' 'http://localhost:8080/health'
if [[ "$MODE" == '--frontend-comun' ]]; then
  check 'FrontendTitec /auth' 'http://localhost:3000/auth'
  check 'FrontendTitec admin' 'http://localhost:3000/auth/admin/login'
elif [[ "$MODE" == '--frontend-local' ]]; then
  check 'Auth local /auth' 'http://localhost:3001/auth'
  check 'Auth local admin' 'http://localhost:3001/admin/login'
fi
printf '\nRutas disponibles; falta probar login real, roles e introspeccion de Panel.\n'
