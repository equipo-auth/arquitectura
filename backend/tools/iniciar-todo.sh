#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
command -v python3 >/dev/null || { echo 'Se requiere Python 3.' >&2; exit 1; }
command -v docker >/dev/null || { echo 'Se requiere Docker.' >&2; exit 1; }
docker info >/dev/null 2>&1 || { echo 'Docker no esta activo.' >&2; exit 1; }

# Solo se inicializa el esquema automáticamente si jamás hubo DB en este entorno.
NEW_DB=0
if ! docker volume inspect backend_postgres_data >/dev/null 2>&1 && \
   ! docker inspect ticketu-db >/dev/null 2>&1; then
  NEW_DB=1
fi
python3 backend/tools/preparar-entorno-local.py

# Un contenedor local de desarrollo existente y apagado se puede reutilizar;
# nunca arrancar automáticamente el RabbitMQ de otro proyecto.
if docker inspect ticketu-rabbitmq >/dev/null 2>&1 && \
   ! docker ps --format '{{.Names}}' | grep -Fxq 'ticketu-rabbitmq'; then
  PROJECT="$(docker inspect ticketu-rabbitmq --format '{{index .Config.Labels "com.docker.compose.project"}}')"
  if [[ "$PROJECT" == 'backend' ]]; then
    echo 'Iniciando RabbitMQ ya existente de Auth...'
    docker start ticketu-rabbitmq >/dev/null
  else
    echo "Broker detenido pertenece a '$PROJECT'. Inícialo desde su proyecto antes de continuar." >&2
    exit 1
  fi
fi

if [[ "$NEW_DB" -eq 1 ]]; then
  echo 'Instalación sin volumen/contendor de PostgreSQL previo: se inicializará el esquema Prisma.'
  bash backend/tools/iniciar-integracion.sh --inicializar-esquema
else
  echo 'Volumen o contenedor PostgreSQL existente: NO se modifica el esquema Prisma.'
  bash backend/tools/iniciar-integracion.sh
fi
bash backend/tools/verificar-integracion.sh
