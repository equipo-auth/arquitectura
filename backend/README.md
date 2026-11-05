<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://coveralls.io/github/nestjs/nest?branch=master" target="_blank"><img src="https://coveralls.io/repos/github/nestjs/nest/badge.svg?branch=master#9" alt="Coverage" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).



---

## Evaluación 2 — integración REAL con Platform Team (sin mocks)

Esta guía complementa el README histórico. **No levantes dos RabbitMQ.** Los puertos y rutas del Gateway y del broker se toman del repositorio [FWizav/backendticketU](https://github.com/FWizav/backendticketU) (`main`). Las pruebas siguientes requieren procesos reales; una respuesta de un mock NO constituye evidencia de integración.

### 0. Puertos OFICIALES y conflictos comprobados

| Servicio | Puerto host | Puerto contenedor / destino | Observación |
|---|---:|---:|---|
| Gateway oficial | 8080 | 8080 | `ticketu-api-gateway` |
| Broker oficial RabbitMQ | 5672, 15672 | 5672, 15672 | `ticketu-rabbitmq` |
| Auth NestJS (nativo) | 10000 | — | NO modificar |
| Auth PostgreSQL (compose de Auth) | 5433 | 5432 | No ocupa 5432 en el host |
| Auth Keycloak (compose de Auth) | 8081 | 8080 | No ocupa 8080 en el host |
| Front común Next.js (Auth) | 3001 | — o 3000 en Docker | Ejecutar `npm run dev -- -p 3001` |
| Entradas (compose contraparte) | 3000 | 3000 | **Ocupación efectiva del host 3000** |
| Entradas MongoDB (compose contraparte) | 27017 | 27017 | Si otro MongoDB publica 27017, conflicto |
| Panel Organizador (compose integración) | sin publicación host | 3000 interno | No choca con Entradas en el host; otra IP de contenedor |

**Conflicto BLOQUEANTE:** `backend/docker-compose.yml` de Auth también define `ticketu-rabbitmq` en 5672/15672. No ejecutes `docker compose up -d` a secas dentro de Auth cuando corre el broker oficial. En su lugar, levanta SOLO `db` y `keycloak` (comando abajo). No se sustituye puerto alguno.

**Conflicto condicional:** la app Next.js sin `-p 3001` intenta usar 3000, que ya publica Entradas. En el repositorio Auth, el compose del frontend YA publica `3001:3000`: el equivalente nativo debe usar `-p 3001`.

### 1. Preparación

```bash
# máquina que aloja los contenedores; solo si la red no existe:
docker network inspect plataforma-eventos-net >/dev/null 2>&1 || docker network create plataforma-eventos-net

# terminal A, dentro del repo OFICIAL FWizav/backendticketU:
cd event-broker
cp -n .env.example .env
# configurar credenciales del broker; deben coincidir con RABBITMQ_URL de Auth
docker compose up -d --build

docker compose ps
# shell: comprobar health real, sin publicar secretos:
curl -fsS http://localhost:15672/api/overview -u 'ticketu:ticketu_dev' >/dev/null

El Compose oficial del broker solo levanta RabbitMQ. No garantiza por sí mismo que estén creados `auth.events`, `notificaciones.events` ni sus bindings específicos. Tras iniciar Auth/Notificaciones, verifica exchanges, colas y bindings en Management. Si faltan, coordina la declaración de topología con Platform/Notificaciones; NO levantes el segundo RabbitMQ de Auth para intentar resolverlo.
```

Si el broker ya está levantado, no lo recrees: `docker ps --format '{{.Names}} {{.Ports}}'` permite verificarlo. **No levantes el broker propio de Auth**.

### 2. Dependencias internas de Auth, sin broker duplicado

```bash
cd /ruta/al/repo-auth/backend
cp -n .env.example .env
# Configurar DATABASE_URL, KEYCLOAK_* e INTERNAL_API_KEY en .env
# NO subir .env ni llaves RSA.
docker compose up -d db keycloak
npm ci
npx prisma generate
npx prisma db push
npm run start:dev
```

**Importante:** `backend/docker-compose.yml` declara `plataforma-eventos-net` como red externa, por lo que debe existir antes de levantarlo. El compose Auth usa PostgreSQL host 5433, Keycloak host 8081; son puertos host elegidos en ESTE repositorio, diferentes de sus puertos internos Docker.

Configurar el `.env` de Auth con los valores reales del broker único:

```dotenv
PORT=10000
DATABASE_URL=postgresql://admin:***@localhost:5433/ticketu?schema=public
KEYCLOAK_URL=http://localhost:8081
RABBITMQ_URL=amqp://ticketu:***@127.0.0.1:5672/ticketu
RABBITMQ_AUTH_EXCHANGE=auth.events
RABBITMQ_NOTIFICACIONES_EXCHANGE=notificaciones.events
RABBITMQ_AUTH_INBOUND_QUEUE=auth.correo_auth
INTERNAL_API_KEY=misma-clave-compartida-del-entorno
NODE_ENV=development
FRONTEND_URL=http://localhost:3001
COMPRADOR_FRONTEND_URL=http://localhost:3001
```

No uses literalmente `***`; debes usar los valores reales, preservando el mismo vhost, nombre de usuario y contraseña entre Auth y el broker. El archivo de ejemplo de Auth contiene otros valores de desarrollo, revisarlos antes de arrancar. El servicio `rabbitmq` de este Compose NO se debe iniciar cuando está activo el broker oficial FWizav.

### 3. Gateway OFICIAL y ruta Auth

Dentro de `FWizav/backendticketU/api-gateway`:

```bash
cp -n .env.example .env
```

**No usar** `AUTH_SERVICE_URL=http://auth-service:3000` del ejemplo oficial, porque Auth se ejecuta nativamente en puerto **10000**.

En un Gateway en Docker, `localhost:10000` apunta al propio contenedor, no a Auth. En Linux (sin editar el compose oficial) configure `AUTH_SERVICE_URL=http://IP_ALCANZABLE_DEL_HOST:10000`, donde esa IP sea alcanzable desde la red Docker. Verifique firewall, ruta y que Nest escuche en una interfaz accesible. No usar una IP ficticia. En Windows/Mac con Docker Desktop suele poder usarse `http://host.docker.internal:10000`; en Linux esa entrada NO está garantizada, y necesitaría un mapeo `host-gateway` negociado en el compose oficial.

```bash
# Requiere URL del host revisada en api-gateway/.env:
docker compose up -d --build
curl -i http://localhost:8080/health
curl -i http://localhost:8080/api/auth/docs
```

`/api/auth/docs` puede devolver redirección/HTML Swagger; confirma llegada al backend, no una sesión autenticada. El Gateway NO expone `/internal/*`; cada backend consumidor habla directo con Auth usando `Cookie` y `x-api-key`.

### 4. Panel real, sin mock

El Panel requiere actualizar su cliente `backend/src/modules/auth/auth.client.ts` para incluir el header `x-api-key` (parche separado del paquete). Su `.env` o `docker-compose.integracion.yml` debe incluir `AUTH_INTERNAL_API_KEY` compartida y una `AUTH_SERVICE_URL` alcanzable desde Docker, apuntando al puerto **10000**, NO 3000. **No usar `docker-compose.yml` de desarrollo del Panel**, que levanta `mock-auth` en 4001. Usar `docker-compose.integracion.yml` solo cuando se haya aplicado el parche de Panel.

Panel backend usa 3000 **dentro del contenedor** y no lo publica; no entra en conflicto con Entradas 3000 **en el host**. Sin embargo, el Vite proxy original de Panel redirige `/api` a host 3000: si Entradas ocupa ese puerto, el frontend del Panel no funcionará de punta a punta hasta que su equipo apunte Vite a la ruta real del Gateway `/api/organizador/v1/panel/...`. Ese cambio pertenece al equipo Panel; no se cambió ningún puerto.

### 5. Entradas real

El `docker-compose.yml` de Entradas ya configura `AUTH_SERVICE_URL=http://auth-service:10000` y `x-api-key`, pero **ese nombre DNS no existe** si Auth corre nativamente. En la máquina de integración, deben configurar la URL accesible del host según su red. El compose de Entradas publica host 3000 y host 27017. No se permite iniciar otro servicio en esos mismos puertos.

### 6. Notificaciones REAL y exchanges

El broker oficial usa como ejemplo `ticketu.events`; la integración acordada Auth/Notificaciones requiere **otro exchange** `auth.events` (topic) para `cuenta_staff` y `recuperacion_cuenta`, y `notificaciones.events` para el resultado `correo_auth`. Eso NO es conflicto de puertos: son exchanges lógicos en el mismo RabbitMQ. Debe existir una cola REAL durable del consumidor Notificaciones, vinculada (`binding`) a `auth.events` con las routing keys exactas. El repositorio de Notificaciones suministrado muestra contratos, pero no el consumidor ejecutable: la integración real de correo no puede certificarse sin ese servicio.

Verifica en RabbitMQ Management `http://localhost:15672` (usuario y contraseña del broker): vhost `ticketu`, exchanges `auth.events` y `notificaciones.events`, bindings `cuenta_staff` / `recuperacion_cuenta` hacia una cola de Notificaciones, y `correo_auth` hacia `auth.correo_auth`. Asegura que Auth marque `SENT` en la outbox y que el consumidor reciba el evento. Un log `PUBLICADO` en Auth significa enviado al broker, NO correo entregado.

### 7. Pruebas efectivas para BE1 / CA1

```bash
# Una vez levantados los procesos reales
export AUTH_URL=http://localhost:10000
export GATEWAY_URL=http://localhost:8080
export INTERNAL_API_KEY='VALOR_REAL_DE_ENV'
# iniciar sesión con un comprador válido; guarde cookie localmente (no commitearla):
curl -sS -c /tmp/auth-e2e-cookies.txt -H 'Content-Type: application/json' \
  -d '{"email":"comprador@example.test","password":"CLAVE_REAL"}' \
  "$AUTH_URL/api/auth/login"
# Si la cuenta real existe y el login responde 200, usar cookie jar
export COOKIE_JAR=/tmp/auth-e2e-cookies.txt
bash /ruta/al/paquete/scripts/verificar-integracion.sh
```

Ejecutar el script desde la raíz del paquete descargado o por ruta absoluta. **No subir el cookie jar al repositorio.** Deben obtenerse efectivamente HTTP 403 sin API Key, HTTP 401 con API Key sin cookie, HTTP 200 con ambos válidos, y Gateway `/health` 200. El script corta la prueba si un código no coincide.

Para probar I2, crea un STAFF real en Keycloak, verifica su espejo en Prisma Studio, su outbox y el evento entregado en la cola real de Notificaciones. Si ese consumidor no está disponible, reportar integración parcial; no sustituir por productor/consumidor mock.

### 8. Límites de la validación

Esta guía se realizó por inspección de GitHub. No se ejecutaron contenedores Docker, base de datos ni servicios remotos desde este entorno. Los puertos y topología están verificados en los `docker-compose.yml` citados, pero el estado de red y las pruebas de ejecución necesitan la máquina de integración.

## Guía de historias e integración Auth (2026)

> Esta sección complementa el README inicial. **No despliega ni modifica otros módulos**. Historial de historias: `../HISTORIAS.md`; contrato de introspección: `../CONTRATO_INTEGRACION_AUTH.md`.

### Requisitos y puertos, sin reasignaciones

- Auth NestJS: **10000** (nativo con `npm run start:dev`).
- PostgreSQL: **5433** en el host, **5432** dentro de su contenedor.
- Keycloak: **8081** en el host, **8080** dentro del contenedor.
- Frontend Auth: **3001** (con `npm run dev -- -p 3001`).
- Gateway oficial FWizav: **8080**; RabbitMQ oficial: **5672** y administración **15672**.
- No ejecutar el `rabbitmq` de `backend/docker-compose.yml` **al mismo tiempo** que el RabbitMQ oficial: colisionan en puertos/nombre de contenedor.

### Arranque de desarrollo SOLO Auth

Desde `backend/`:

```bash
cp .env.example .env   # Solo la primera vez; no sobrescribir configuración propia
# Configurar DATABASE_URL localhost:5433, KEYCLOAK_URL localhost:8081,
# KEYCLOAK_CLIENT_SECRET, INTERNAL_API_KEY y RABBITMQ_URL reales.
docker compose up -d db keycloak
npm ci
npx prisma generate
npx prisma db push
npm run start:dev
```

**JWT RS256** requiere `backend/private.pem` y `backend/public.pem` existentes y correspondientes. Si NO hay llaves que preservar (instalación nueva local):

```bash
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out private.pem
openssl pkey -in private.pem -pubout -out public.pem
chmod 600 private.pem
```

**No reemplazar las llaves existentes**: invalidaría todas las sesiones anteriores. Las llaves no se suben a Git. Verificar el realm `ticketu-realm`, client `ticketu-backend`, credenciales y usuarios Keycloak antes de probar STAFF.

El servidor HTTP inicia tras la conexión del listener a RabbitMQ. Para el flujo de invitaciones se necesita el broker real accesible mediante `RABBITMQ_URL`. El gateway no es necesario para los unit tests de Auth.

### RabbitMQ oficial de FWizav, sin contenedores duplicados

```bash
# En el repositorio FWizav/backendticketU:
docker network inspect plataforma-eventos-net >/dev/null 2>&1 || docker network create plataforma-eventos-net
cd event-broker
cp .env.example .env   # Solo si no existe
# Mantener los puertos oficiales y credenciales que acordaron los equipos.
docker compose up -d --build
```

Comprobar el vhost `ticketu` en `http://localhost:15672` y crear/verificar la topología específica de Auth: `auth.events` (topic), `notificaciones.events` (topic), cola `auth.correo_auth` (durable), binding `notificaciones.events` → `auth.correo_auth` con `correo_auth`. El broker oficial no crea automáticamente todos los bindings de Auth. La cola consumidora de Notificaciones para `cuenta_staff` debe pertenecer a Notificaciones (no inventarla en Auth). No utilizar `backend/tools/simular-notificaciones-local.js` como evidencia CA1 de integración real.

### Endpoints de las historias, sin alterar contratos existentes

| Historia | Ruta | Seguridad/nota |
|---|---|---|
| B1 | `POST /api/auth/register` | Comprador en PostgreSQL; bcrypt y UUID |
| B2 | `POST /api/auth/login` | JWT RS256 cookie HttpOnly; comprador 2 h, staff 12 h; 5/3 fallos en 15 min |
| B3 | `POST /api/auth/logout` | Destruye cookie |
| B4 | `POST /api/auth/provision`, `/provision/reenviar` | **Solo para uso interno**, `x-api-key`; Keycloak-first + outbox |
| B5 | `POST /api/auth/recover`, `/validar-token`, `/reset-password` | Token SHA-256, un solo uso; `token_version` aumenta |
| B6 contrato actual | `GET /internal/validar-sesion` | Cookie `jwt` + `x-api-key`, JSON `valido/usuario` |
| B6 identidad histórica | `GET /internal/identidad/:uuid` | Solo `x-api-key`, JSON **únicamente** `{rut,nombre}` |
| B7 | `GET /.well-known/jwks.json` | JWK pública, sin credenciales; alias `/api/auth/.well-known/jwks.json` para Gateway |
| B8 | `POST /api/auth/revoke-session` | `x-operations-key` exclusivamente servidor-servidor; `{target_user_id,reason}` |
| B9 | `POST /api/auth/update-password` | Alias `/api/auth/cambiar-clave` con token de invitación; Keycloak |

**Roles acordados:** `COMPRADOR`, `ORGANIZADOR`, `STAFF` y ninguno más. El operador de Keycloak no tiene rol en Auth. B4 se ejecuta desde Keycloak y se sincroniza a PostgreSQL; B8 es un mantenimiento servidor-servidor con `AUTH_OPERATIONS_KEY` y `x-operations-key` (credencial de infraestructura, no rol). No enviar claves internas desde el navegador. La ruta `/admin/provision` permanece deshabilitada.

### JWKS / rotación de claves

El JWT nuevo incorpora `kid` en la cabecera, **no** en el payload (que conserva `sub`, `rol`, `token_version`, `iat`, `exp`). Para rotación controlada, conservar únicamente la **clave pública** anterior como `previous-public.pem`, instalar `private.pem/public.pem` nuevos y reiniciar el backend. La clave pública anterior queda disponible `JWT_KEY_GRACE_HOURS` (por defecto 24 horas) desde la fecha de modificación de `previous-public.pem`. Una vez terminada la gracia, eliminar ese archivo. Nunca publicar `private.pem` ni agregarlo a Dockerfile/imágenes.

### Pruebas y evidencias

```bash
npm run build
npm test -- --runInBand
npm run test:e2e -- --runInBand
# Con NestJS, PostgreSQL, Keycloak y RabbitMQ REALES levantados:
INTERNAL_API_KEY='CLAVE_REAL_LOCAL' ./tools/probar-auth-real.sh
```

Los tests Jest son mayormente unitarios y varios e2e usan `PrismaService` mock: **no equivalen a una integración con servicios reales**. Para CA1 ejecutar además `docs/postman_historias_auth.json`, usar identidades de prueba reales y guardar capturas de HTTP 200/201/401/403/404/429, `Set-Cookie`, Prisma Studio y broker. No guardar JWT, claves ni URLs temporales en Git ni en capturas públicas.

La especificación asíncrona está en `docs/asyncapi-auth.yaml`. La OpenAPI ejecutable vigente es Swagger en `http://localhost:10000/api/auth/docs`; `docs/swagger.yaml` se actualiza con las rutas HTTP actuales; contrastar cualquier cambio posterior con Swagger dinámico.
