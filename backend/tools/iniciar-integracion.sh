#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

PREPARAR_ESQUEMA=0
SIN_FRONT=0
for arg in "$@"; do
  case "$arg" in
    --inicializar-esquema) PREPARAR_ESQUEMA=1 ;;
    --sin-front) SIN_FRONT=1 ;;
    *) echo "Opcion desconocida: $arg" >&2; exit 2 ;;
  esac
done

command -v docker >/dev/null || { echo 'Docker no esta instalado.' >&2; exit 1; }
docker info >/dev/null 2>&1 || { echo 'Docker no esta activo.' >&2; exit 1; }
for file in backend/.env backend/private.pem backend/public.pem; do
  [[ -f "$file" ]] || { echo "Falta $file. Ver README-PARCHE-AUTH-DOCKER.md" >&2; exit 1; }
done
for variable in KEYCLOAK_ADMIN_PASSWORD KEYCLOAK_CLIENT_SECRET INTERNAL_API_KEY; do
  value="$(sed -nE "s/^${variable}=[\"']?([^\"'#]*)[\"']?.*/\1/p" backend/.env | tail -n 1)"
  [[ -n "$value" && "$value" != '<CONFIGURAR_EN_ENTORNO>' ]] || {
    echo "Configura $variable en backend/.env; no uses el placeholder." >&2
    exit 1
  }
done

if ! docker network inspect plataforma-eventos-net >/dev/null 2>&1; then
  docker network create plataforma-eventos-net
fi

echo '[1/5] Levantando PostgreSQL y Keycloak (sin borrar volúmenes)...'
docker compose -f backend/docker-compose.yml config --quiet
docker compose -f backend/docker-compose.auth-service.yml config --quiet
docker compose -f backend/docker-compose.yml up -d db keycloak

# Evitar colisionar con el RabbitMQ oficial del Platform Team.
if docker ps --format '{{.Names}}' | grep -Fxq 'ticketu-rabbitmq'; then
  echo '[2/5] Utilizando RabbitMQ ya levantado (no se duplica).'
elif docker ps -a --format '{{.Names}}' | grep -Fxq 'ticketu-rabbitmq'; then
  echo 'RabbitMQ existe pero esta detenido; revisa quien lo administra antes de iniciarlo.' >&2
  exit 1
else
  echo '[2/5] No existe ticketu-rabbitmq; levantando broker de desarrollo de Auth.'
  docker compose -f backend/docker-compose.yml up -d rabbitmq
fi
if ! docker network inspect plataforma-eventos-net --format '{{range .Containers}}{{println .Name}}{{end}}' | grep -Fxq 'ticketu-rabbitmq'; then
  docker network connect plataforma-eventos-net ticketu-rabbitmq
fi

# No iniciar Auth antes de que el broker y PostgreSQL realmente acepten conexiones.
POSTGRES_READY=0
BROKER_READY=0
for _ in $(seq 1 70); do
  if docker exec ticketu-db pg_isready -U admin -d ticketu >/dev/null 2>&1; then POSTGRES_READY=1; fi
  if docker exec ticketu-rabbitmq rabbitmq-diagnostics -q ping >/dev/null 2>&1; then BROKER_READY=1; fi
  if [[ "$POSTGRES_READY" -eq 1 && "$BROKER_READY" -eq 1 ]]; then break; fi
  sleep 2
done
[[ "$POSTGRES_READY" -eq 1 ]] || { echo 'PostgreSQL no responde. Revisa docker logs ticketu-db.' >&2; exit 1; }
[[ "$BROKER_READY" -eq 1 ]] || { echo 'RabbitMQ no responde. Revisa docker logs ticketu-rabbitmq.' >&2; exit 1; }

echo '[3/5] Esperando a que exista el realm ticketu-realm...'
READY=0
for _ in $(seq 1 75); do
  if curl --silent --show-error --fail --max-time 3 \
      'http://localhost:8081/realms/ticketu-realm/.well-known/openid-configuration' \
      >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 2
done
if [[ "$READY" -ne 1 ]]; then
  echo 'El realm no responde. Revisa docker logs --tail 100 ticketu-keycloak.' >&2
  exit 1
fi

if [[ "$PREPARAR_ESQUEMA" -eq 1 ]]; then
  echo '[4/5] Preparando esquema Prisma (solicitado; no usar sin respaldo en BD existente)...'
  docker compose -f backend/docker-compose.auth-service.yml run --rm prisma-init
else
  echo '[4/5] Esquema Prisma sin cambios. Para una BD nueva, usa --inicializar-esquema.'
fi

docker compose -f backend/docker-compose.auth-service.yml up -d --build auth-service
if [[ "$SIN_FRONT" -eq 0 ]]; then
  # Solamente para demostraciones HTTP de un mismo PC; la variable se incrusta durante next build.
  echo '[5/5] Construyendo frontend para localhost (puerto 3001)...'
  NEXT_PUBLIC_AUTH_API_URL='http://localhost:10000' \
  NEXT_PUBLIC_GATEWAY_URL='http://localhost:8080' \
    docker compose -f frontend/docker-compose.yml up -d --build front
else
  echo '[5/5] Frontend omitido (--sin-front).'
fi

echo 'Listo: comprueba http://localhost:8081/realms/ticketu-realm/.well-known/openid-configuration'
echo '      http://localhost:10000/api/health'
if [[ "$SIN_FRONT" -eq 0 ]]; then echo '      http://localhost:3001/auth'; fi
