#!/usr/bin/env bash
set -euo pipefail
# Ejecutar UNA SOLA VEZ, antes de levantar el Compose nuevo, si ya hay datos
# en ticketu-keycloak SIN volumen persistente.
container='ticketu-keycloak'
volume='ticketu_keycloak_data'
if ! docker container inspect "$container" >/dev/null 2>&1; then
  echo 'Sin contenedor previo; Docker Compose creará el volumen nuevo.'
  exit 0
fi
if docker volume inspect "$volume" >/dev/null 2>&1; then
  echo "El volumen $volume ya existe; no sobrescribiremos datos. Revisa su contenido manualmente."
  exit 1
fi
if docker inspect "$container" --format '{{json .Mounts}}' | grep -q '"Destination":"/opt/keycloak/data"'; then
  echo 'El contenedor ya tiene almacenamiento persistente Keycloak; no migres sin revisar.'
  exit 1
fi
backup="$(pwd)/keycloak-respaldo-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$backup"
echo 'Deteniendo Keycloak para obtener una copia consistente de la base de desarrollo...'
docker stop "$container" >/dev/null
docker cp "$container:/opt/keycloak/data/." "$backup/"
if [ -z "$(ls -A "$backup")" ]; then
  echo 'La copia quedó vacía; no se creará volumen. Revisa el contenedor original.' >&2
  exit 1
fi
echo "Respaldo local conservado en: $backup"
docker volume create "$volume" >/dev/null
docker run --rm -v "$volume:/target" -v "$backup:/backup:ro" postgres:15 sh -ec 'cp -a /backup/. /target/'
echo "Volumen $volume preparado. Ahora puedes ejecutar docker compose up -d."
echo 'NO subas el directorio de respaldo a Git: contiene credenciales y datos del realm.'
