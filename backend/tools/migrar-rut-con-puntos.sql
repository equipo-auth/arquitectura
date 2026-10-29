-- Migración no destructiva; ejecutar con psql -v ON_ERROR_STOP=1 -1.
-- No modifica UUID, contraseñas, roles, Keycloak ni eventos RabbitMQ.
-- Precondición: respaldar PostgreSQL y detener NestJS durante la migración.
DO $$
DECLARE
  malformed int;
  duplicates int;
BEGIN
  SELECT COUNT(*) INTO malformed FROM users
  WHERE upper(regexp_replace(rut, '[.[:space:]]', '', 'g')) !~ '^[0-9]{7,8}-[0-9K]$';
  IF malformed > 0 THEN
    RAISE EXCEPTION 'Abortada: % RUT con formato inesperado. Revisar la tabla users.', malformed;
  END IF;

  SELECT COUNT(*) INTO duplicates
  FROM (
    SELECT upper(regexp_replace(rut, '[.[:space:]]', '', 'g'))
    FROM users GROUP BY 1 HAVING COUNT(*) > 1
  ) as repeated;
  IF duplicates > 0 THEN
    RAISE EXCEPTION 'Abortada: % RUT duplicados al normalizar. Resolver antes de migrar.', duplicates;
  END IF;
END $$;

UPDATE users SET rut = regexp_replace(
  upper(regexp_replace(rut, '[.[:space:]]', '', 'g')),
  '^([0-9]{1,2})([0-9]{3})([0-9]{3})-([0-9K])$',
  '\1.\2.\3-\4'
)
WHERE rut IS DISTINCT FROM regexp_replace(
  upper(regexp_replace(rut, '[.[:space:]]', '', 'g')),
  '^([0-9]{1,2})([0-9]{3})([0-9]{3})-([0-9K])$',
  '\1.\2.\3-\4'
);
