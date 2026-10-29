// No sembrar identidades administrativas en PostgreSQL: son exclusivas de Keycloak.
console.error('Seed deshabilitado: crea STAFF/ORGANIZADOR manualmente en Keycloak. Auth los sincroniza automáticamente.');
process.exitCode = 1;
