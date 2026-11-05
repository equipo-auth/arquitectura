# TITEC Auth v4.2 — portales, invitación automática y despliegue local Docker

Este documento complementa la configuración v4.1 sin cambiar los contratos base.

## 1. Reglas de negocio

**Solo tres roles** en Auth: `COMPRADOR`, `STAFF` y `ORGANIZADOR`. La persona que administra Keycloak NO es un usuario con rol `ADMIN` de Auth.

| Portal | Petición de login | Rol autorizado |
|---|---|---|
| Compradores | `POST /api/auth/login` con `{ "email", "password" }` | `COMPRADOR` |
| Administrativo (frontend externo, al integrarlo) | `POST /api/auth/login` con `{ "email", "password", "admin": true }` | `STAFF`, `ORGANIZADOR` |

- COMPRADOR en portal administrativo con contraseña correcta → **403**.
- STAFF/ORGANIZADOR en portal comprador → **401 genérico**, sin emitir cookie, sin consultar Keycloak.
- STAFF/ORGANIZADOR activado en portal administrativo → **200** con cookie JWT; 12 h.
- COMPRADOR correcto en portal comprador → **200** con cookie JWT; 2 h.
- Login con contraseña incorrecta → **401**, sujeto a bloqueo de intentos.
- El indicador `admin:true` identifica el *flujo*; no autentica un frontend específico. Un consumidor debe validar `rol` en todas sus operaciones protegidas con introspección; CORS no sustituye autorización.

## 2. ¿Se conserva el envío automático de invitaciones?

**Sí: no se reimplementa ni elimina.** El código v4.1 ya hace:

1. Operador crea `STAFF` u `ORGANIZADOR` **manualmente en Keycloak**: enabled, email, nombre, apellido, atributo `rut` válido, un único realm role `STAFF` u `ORGANIZADOR`.
2. `KeycloakSyncService` cada 30 s detecta la identidad, crea su *espejo* en PostgreSQL **con el mismo UUID**, `password_hash = null`, `cambio_obligatorio = true`, y una entrada pendiente en `staffInvitationOutbox`.
3. `StaffInvitationWorkerService` cada 10 s procesa outbox. Genera un **token de enlace de creación de contraseña**, NO una contraseña temporal, por defecto válido por 72 h.
4. Publica en RabbitMQ **exchange `auth.events`, routing key `cuenta_staff`**, exactamente el JSON `{ "email_destino": "...", "url": "http://localhost:3001/crear-clave?token=..." }`. La clave del enlace se almacena hasheada en PostgreSQL y no se publica por separado.
5. Notificaciones, cuando se integre su consumidor real, deberá enviar por SMTP el enlace. **Publicación en RabbitMQ no acredita entrega de correo**. Si no existe ninguna cola enlazada a `cuenta_staff`, RabbitMQ puede aceptar y descartar la publicación; requiere que Notificaciones declare su cola duradera y binding. Para QA se puede usar una cola temporal ligada a ese routing key.
6. Al abrir `/crear-clave`, `POST /api/auth/update-password` valida el token y establece **la contraseña definitiva en Keycloak** (`temporary:false`), elimina `UPDATE_PASSWORD`, marca `cambio_obligatorio=false` y actualiza `token_version` en PostgreSQL. No se crea `password_hash` de STAFF/ORGANIZADOR en PostgreSQL.
7. En adelante la persona usa **su portal administrativo** (cuando exista el frontend real); no registra la cuenta desde compradores. La pantalla de activación de Auth puede seguir en `3001` sin convertirse en el portal de login de STAFF.

**No reenvíes invitaciones para cuentas activadas.** Si una cuenta pendiente no recibió el evento, el operador puede usar `POST /api/auth/provision/reenviar` desde un backend autorizado con `x-api-key`. El frontend nunca conoce esa clave.

La URL de activación se controla mediante `FRONTEND_URL` en el backend, y hoy se deja `http://localhost:3001` hasta que otro equipo implemente la pantalla `/crear-clave` bajo su propio dominio.

### Tras la activación: volver al portal correcto

`frontend/src/modules/auth/components/CrearClaveForm.tsx` ahora admite:

```dotenv
# Opcional: declarar solo cuando el Panel real tenga el login integrado
NEXT_PUBLIC_ADMIN_LOGIN_URL=http://localhost:5173/login
```

Si esta variable NO está configurada, se mantiene `/admin/login` **solo como vista de QA de Auth**. No enlazar el frontend de otro equipo antes de que esté preparado. Reiniciar Next al cambiar `NEXT_PUBLIC_*`.

## 3. Integrar Auth como servicio de la red compartida

Este paquete añade `backend/docker-compose.auth-service.yml` **sin modificar el `docker-compose.yml` antiguo** (que conserva las definiciones de la infraestructura). Esta guía asume contenedores existentes:

- `ticketu-db`, Postgres interno `5432` (host `5433`)
- `ticketu-keycloak`, Keycloak interno `8080` (host `8081`)
- `ticketu-rabbitmq`, RabbitMQ interno `5672` (host `5672`)

**Primero detén exclusivamente `npm run start:dev` en el host** con Ctrl+C para evitar dos instancias de Auth, dos workers y una colisión del puerto `10000`. No detengas PostgreSQL, Keycloak o RabbitMQ.

Verifica la red (si no existe, créala):

```bash
docker network inspect plataforma-eventos-net >/dev/null 2>&1 || docker network create plataforma-eventos-net
```

Conecta **contenedores existentes**, sin recrearlos, solo si todavía no están en la red. Estos comandos fallan benignamente si ya están conectados; revisa la salida si ocurre otro error:

```bash
docker network connect plataforma-eventos-net ticketu-db 2>/dev/null || true
docker network connect plataforma-eventos-net ticketu-keycloak 2>/dev/null || true
# RabbitMQ ya suele estar conectado; verificar en el inspect de la red.
docker network inspect plataforma-eventos-net --format '{{range .Containers}}{{println .Name}}{{end}}'
```

En `backend/`, valida que existan `.env`, `private.pem`, `public.pem`, sin mostrar secretos:

```bash
test -f .env && test -f private.pem && test -f public.pem && echo 'Archivos listos'
```

**Seguridad**: las llaves se montan en solo lectura; no van dentro de la imagen. El Dockerfile ejecuta como usuario `node`, así que este usuario debe tener permiso de lectura sobre `private.pem` montado. No uses `chmod 644` en la llave privada. En Linux, el UID de `node` suele ser 1000; revisa con `id -u` y `docker run --rm node:22-bookworm-slim id -u node` si hay errores EACCES.

El Compose usa los valores locales de `.env` para client secrets, `INTERNAL_API_KEY`, `AUTH_OPERATIONS_KEY`, etc., y **sobrescribe solamente** las URLs que desde Docker deben usar hostnames internos. Si tu contraseña Postgres o RabbitMQ no coincide con la de desarrollo del Compose original, define en `backend/.env` opciones adicionales únicamente para la interpolación de Compose:

```dotenv
# Solo si cambiaste las credenciales de desarrollo; no copiar secretos a Git.
# DOCKER_DATABASE_URL="postgresql://usuario:clave@ticketu-db:5432/ticketu?schema=public"
# DOCKER_RABBITMQ_URL="amqp://usuario:clave@ticketu-rabbitmq:5672/ticketu"
```

Inicia solo el servicio Auth:

```bash
cd /home/jk1man/Desktop/Auth/arqui/arquitectura/backend
docker compose -f docker-compose.auth-service.yml config --quiet
docker compose -f docker-compose.auth-service.yml up -d --build auth-service
docker compose -f docker-compose.auth-service.yml logs --tail=90 auth-service
curl -i http://localhost:10000/api/health
```

**No uses** `docker compose up -d` sobre `backend/docker-compose.yml` completo, porque volverías a gestionar/duplicar RabbitMQ, ni `down -v` o `docker rm -v`, porque perderías datos. **No copies** ninguna clave al Dockerfile.

### 3.1. API Gateway oficial

Usa el Gateway del repo `FWizav/backendticketU`, no construyas uno nuevo. En su `api-gateway/.env` de Docker:

```dotenv
PORT=8080
CORS_ORIGINS=http://localhost:3001,http://localhost:5173
AUTH_SERVICE_URL=http://auth-service:10000
```

Gateway debe estar en `plataforma-eventos-net` igual que `auth-service`; Docker lo resuelve por nombre de servicio. Luego:

```bash
cd /ruta/a/backendticketU/api-gateway
docker compose up -d --build gateway
curl -i http://localhost:8080/health
curl -i http://localhost:8080/api/auth/.well-known/jwks.json
curl -i http://localhost:8080/api/auth/validar-sesion  # 401 sin cookie = esperado
```

**No cambies los puertos**: Gateway 8080, Keycloak **8081 en host** (8080 dentro del contenedor), Auth 10000, front compradores 3001, front administrativo de otra célula 5173.

Una vez confirmado Gateway, el frontend compradores puede usar en `.env.local`:

```dotenv
NEXT_PUBLIC_GATEWAY_URL=http://localhost:8080
NEXT_PUBLIC_AUTH_API_URL=http://localhost:8080
```

Los otros backends no deben llamar a `/internal/validar-sesion` mediante Gateway: dentro de la red llaman a `http://auth-service:10000/internal/validar-sesion` con `Cookie: jwt=...` y `x-api-key` compartida **solo en el backend**.

**Límite real de la integración**: la implementación publicada de Panel necesita incorporar `x-api-key` al cliente HTTP; eso es tarea de Panel, no se modifica en este parche. Ningún test local sustituye una prueba conjunta con el consumidor verdadero.

## 4. Pruebas y evidencias

```bash
cd /home/jk1man/Desktop/Auth/arqui/arquitectura/backend
npm run build
npm test -- --runInBand
npm run test:e2e -- --runInBand
bash tools/verificar-auth-gateway.sh
```

Pruebas nuevas específicas:

```bash
npx jest --runInBand src/auth/portal-isolation.spec.ts src/auth/portal-invitacion.spec.ts
```

El script del Gateway verifica `200` en salud y JWKS, y `401` en sesión sin cookie. No comprueba login real; utiliza además las pruebas de cookie y API Key que ya te funcionaron.

### Verificación puntual de invitación automática

1. En Keycloak crea **una cuenta de prueba nueva** con un solo realm role STAFF u ORGANIZADOR, atributo `rut`, email y nombre. No asignes contraseña temporal.
2. Observa logs de Auth: `Espejo creado ... invitación en outbox` y, después, `Evento cuenta_staff publicado`.
3. En RabbitMQ verifica `auth.events` + `cuenta_staff` y una cola de QA exclusiva de esa routing key. Como son eventos, **crear la cola después no recupera mensajes anteriores**.
4. En su mensaje verifica solo `email_destino` y `url` (no contraseña). No publiques el enlace ni el JWT de la cuenta.
5. Abre `/crear-clave` con el token, asigna la contraseña definitiva; comprueba `cambio_obligatorio=false`, `password_hash=null` en Postgres y que Keycloak autentique usando el flujo administrativo `admin:true`.
6. No confundas esta prueba local con un correo enviado: la entrega SMTP real es responsabilidad de Notificaciones.

## 5. Alcance y seguridad

- No cambia `schema.prisma`, `docker-compose.yml` preexistente, llaves, `.env`, exchanges y routing keys.
- No añade servicios ADMIN ni duplica el RabbitMQ.
- El Compose nuevo es **local y de integración**, no manifiesto de producción: usa HTTP, `NODE_ENV=development` y credenciales de desarrollo por defecto. Producción requiere HTTPS, secretos seguros y orquestación de infraestructura.
- La clave `AUTH_OPERATIONS_KEY` nunca va al navegador. `INTERNAL_API_KEY` solo pertenece a los backends autorizados.
- El frontend externo aún debe implementar su login real; este paquete prepara su contrato, no escribe código en otro repo.
