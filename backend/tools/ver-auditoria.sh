#!/usr/bin/env bash
set -euo pipefail
# Logs almacenados en PostgreSQL; solo metadatos seguros, sin contraseñas ni tokens.
PG_CONTAINER="${PG_CONTAINER:-ticketu-db}"
PG_USER="${PG_USER:-admin}"
PG_DATABASE="${PG_DATABASE:-ticketu}"
docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DATABASE" -P pager=off -c '
SELECT occurred_at AT TIME ZONE '\''America/Santiago'\'' AS hora_chile,
       event, outcome, COALESCE(subject_uuid::text,actor_uuid::text,'\''-'\'') AS uuid,
       COALESCE(method,'\''-'\'') AS metodo,
       COALESCE(path,'\''-'\'') AS ruta, status_code AS http,
       LEFT(COALESCE(detail,'\''-'\''),80) AS detalle
FROM audit_logs
ORDER BY occurred_at DESC LIMIT 25;'
