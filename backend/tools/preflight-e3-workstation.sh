#!/usr/bin/env bash
# Solo lectura: inspección de Auth y sus dependencias. No modifica contenedores.
set -u
cd "$(dirname "$0")/../../"
fallos=0
ok(){ printf '[OK] %s\n' "$*"; }
mal(){ printf '[FALTA] %s\n' "$*"; fallos=$((fallos+1)); }
verificar_archivo(){ [[ -s "$1" ]] && ok "$1" || mal "$1"; }
verificar_http(){
  local url="$1" esperado="$2" nombre="$3" status
  status=$(curl --silent --output /dev/null --max-time 7 --write-out '%{http_code}' "$url" 2>/dev/null || true)
  [[ "$status" == "$esperado" ]] && ok "$nombre HTTP $status" || mal "$nombre HTTP $status (esperado $esperado)"
}
command -v docker >/dev/null || { echo 'No existe Docker'; exit 1; }
command -v curl >/dev/null || { echo 'No existe curl'; exit 1; }
printf '=== TITEC E3: PREFLIGHT SOLO LECTURA ===\n'
printf 'Rama: %s\n' "$(git branch --show-current 2>/dev/null || echo desconocida)"
printf 'Commit: %s\n' "$(git rev-parse --short HEAD 2>/dev/null || echo desconocido)"
verificar_archivo backend/.env
verificar_archivo backend/private.pem
verificar_archivo backend/public.pem
if docker network inspect plataforma-eventos-net >/dev/null 2>&1; then ok 'Red Docker compartida'; else mal 'Red plataforma-eventos-net'; fi
(cd backend && docker compose -f docker-compose.auth-service.yml config --quiet >/dev/null 2>&1) && ok 'Compose Auth parseable' || mal 'Compose Auth inválido'
verificar_http 'http://localhost:10000/api/health' '200' 'Auth'
verificar_http 'http://localhost:8080/health' '200' 'Gateway'
verificar_http 'http://localhost:8081/realms/ticketu-realm/.well-known/openid-configuration' '200' 'Realm Keycloak'
verificar_http 'http://localhost:8080/api/auth/validar-sesion' '401' 'Auth sin sesión'
verificar_http 'http://localhost:8080/api/notificaciones' '401' 'Notificaciones por Gateway sin sesión'
verificar_http 'http://localhost:8080/api/auth/mis-notificaciones' '401' 'GW1 Auth sin sesión'
verificar_http 'http://localhost:3001/auth/notificaciones' '200' 'Pantalla GW1 Auth'
if docker exec ticketu-rabbitmq rabbitmqctl list_queues -p ticketu name consumers messages_ready >/dev/null 2>&1; then
  ok 'RabbitMQ vhost ticketu responde';
else
  mal 'RabbitMQ vhost ticketu no responde';
fi
printf '=== RESULTADO: %d problemas ===\n' "$fallos"
exit "$((fallos > 0))"
