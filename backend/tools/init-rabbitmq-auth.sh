#!/usr/bin/env bash
set -eu

until rabbitmq-diagnostics -q ping >/dev/null 2>&1; do
  sleep 2
done

RABBITMQ_ADMIN="$(command -v rabbitmqadmin || true)"
if [ -z "$RABBITMQ_ADMIN" ]; then
  for candidate in \
    /usr/local/bin/rabbitmqadmin \
    /usr/bin/rabbitmqadmin \
    /usr/lib/rabbitmq/bin/rabbitmqadmin; do
    if [ -x "$candidate" ]; then
      RABBITMQ_ADMIN="$candidate"
      break
    fi
  done
fi

if [ -z "$RABBITMQ_ADMIN" ]; then
  echo "rabbitmqadmin no está disponible; no se pudieron inicializar exchange/cola de RabbitMQ" >&2
  exit 1
fi

RABBITMQ_USER="${RABBITMQ_DEFAULT_USER:-ticketu}"
RABBITMQ_PASS="${RABBITMQ_DEFAULT_PASS:-ticketu_dev}"
RABBITMQ_VHOST="${RABBITMQ_DEFAULT_VHOST:-ticketu}"

for attempt in $(seq 1 30); do
  if "$RABBITMQ_ADMIN" \
    --host localhost \
    --port 15672 \
    --vhost "$RABBITMQ_VHOST" \
    --username "$RABBITMQ_USER" \
    --password "$RABBITMQ_PASS" \
    list vhosts >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

if ! "$RABBITMQ_ADMIN" \
  --host localhost \
  --port 15672 \
  --vhost "$RABBITMQ_VHOST" \
  --username "$RABBITMQ_USER" \
  --password "$RABBITMQ_PASS" \
  list vhosts >/dev/null 2>&1; then
  echo "RabbitMQ Management API no respondió en el tiempo esperado" >&2
  exit 1
fi

"$RABBITMQ_ADMIN" \
  --host localhost \
  --port 15672 \
  --vhost "$RABBITMQ_VHOST" \
  --username "$RABBITMQ_USER" \
  --password "$RABBITMQ_PASS" \
  declare exchange name=auth.events type=topic durable=true

"$RABBITMQ_ADMIN" \
  --host localhost \
  --port 15672 \
  --vhost "$RABBITMQ_VHOST" \
  --username "$RABBITMQ_USER" \
  --password "$RABBITMQ_PASS" \
  declare exchange name=notificaciones.events type=topic durable=true

"$RABBITMQ_ADMIN" \
  --host localhost \
  --port 15672 \
  --vhost "$RABBITMQ_VHOST" \
  --username "$RABBITMQ_USER" \
  --password "$RABBITMQ_PASS" \
  declare queue name=auth.correo_auth durable=true auto_delete=false arguments='{"x-queue-type":"classic"}'

"$RABBITMQ_ADMIN" \
  --host localhost \
  --port 15672 \
  --vhost "$RABBITMQ_VHOST" \
  --username "$RABBITMQ_USER" \
  --password "$RABBITMQ_PASS" \
  declare binding source=notificaciones.events destination_type=queue destination=auth.correo_auth routing_key=correo_auth

echo "RabbitMQ inicializado para Auth + Notificaciones"
