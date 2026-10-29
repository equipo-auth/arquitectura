#!/usr/bin/env bash
set -u
check_http() {
  local name="$1" url="$2" expected="${3:-200}"
  local code
  code="$(curl --max-time 5 -s -o /dev/null -w '%{http_code}' "$url" || true)"
  if [ "$code" = "$expected" ]; then printf '[OK] %-20s HTTP %s\n' "$name" "$code";
  else printf '[!] %-20s HTTP %s (esperado %s)\n' "$name" "$code" "$expected"; fi
}
printf '%s\n' '--- INFRAESTRUCTURA DOCKER ---'
docker compose ps 2>/dev/null || echo 'No se pudo acceder a Docker Compose.'
printf '\n%s\n' '--- POSTGRESQL ---'
docker exec ticketu-db pg_isready -U admin -d ticketu || true
printf '\n%s\n' '--- RABBITMQ ---'
docker exec ticketu-rabbitmq rabbitmq-diagnostics -q ping || true
printf '\n%s\n' '--- SERVICIOS HTTP ---'
check_http 'Keycloak realm' 'http://localhost:8081/realms/ticketu-realm/.well-known/openid-configuration'
check_http 'Auth NestJS' 'http://localhost:10000/api/health'
check_http 'Frontend Next.js' 'http://localhost:3000/admin/login'
check_http 'Panel (opcional)' 'http://localhost:5173'
printf '\n%s\n' '--- OUTBOX ---'
docker exec ticketu-db psql -U admin -d ticketu -c 'SELECT status,COUNT(*) FROM staff_invitation_outbox GROUP BY status ORDER BY status;' 2>/dev/null || echo 'No se pudo consultar la tabla outbox; ejecuta prisma db push.'
