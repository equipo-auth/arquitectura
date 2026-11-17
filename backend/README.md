# Backend Auth — guía de ejecución e integración TITEC

NestJS + Prisma/PostgreSQL + Keycloak + RabbitMQ. Esta guía reúne el arranque, las rutas, las pruebas y la integración con el API Gateway oficial, sin documentación temporal de parches.

## 1. Requisitos y distribución

- Docker Engine con Compose, Node.js y npm, Python 3 y curl.
- `backend/.env` basado en `.env.example`, y el par RSA `backend/private.pem` / `backend/public.pem`.
- Red Docker externa `plataforma-eventos-net`.
- Gateway oficial: repositorio [FWizav/backendticketU](https://github.com/FWizav/backendticketU), carpeta `api-gateway`.

| Componente | Host de desarrollo | Destino entre contenedores |
|---|---|---|
| Auth | `localhost:10000` | `http://auth-service:10000` |
| Gateway oficial | `localhost:8080` | `ticketu-api-gateway:8080` |
| PostgreSQL de Auth | `localhost:5433` | `ticketu-db:5432` |
| Keycloak de Auth | `localhost:8081` | `ticketu-keycloak:8080` |
| RabbitMQ compartido | `localhost:5672` | `ticketu-rabbitmq:5672` |
| Consola RabbitMQ | `localhost:15672` | Puerto de administración |
| Frontend Auth (Next.js) | `localhost:3001` | Según su Compose |
| Entradas (Compose revisado) | `localhost:3003` | `entradas-service:3000` |
| Panel Organizador (Vite, local) | `localhost:5173` | Backend separado |
| Notificaciones | Por confirmar con ese equipo | `notificaciones-service`, puerto por confirmar |

Los puertos **internos** de diferentes contenedores pueden repetirse; el conflicto se produce cuando dos servicios publican el mismo puerto **del host**. No iniciar una segunda instancia de RabbitMQ en 5672/15672.

## 2. Preparar el entorno (una sola vez)

Desde la raíz de este repositorio:

```bash
cd backend
cp -n .env.example .env
# Editar backend/.env: datos de desarrollo de PostgreSQL, Keycloak, RabbitMQ
# y la INTERNAL_API_KEY compartida del entorno.
# No sobrescribir llaves RSA ni cambiar credenciales de contenedores existentes.

docker network inspect plataforma-eventos-net >/dev/null 2>&1 || \
  docker network create plataforma-eventos-net
```

`backend/docker-compose.yml` define PostgreSQL, Keycloak **y un RabbitMQ opcional**. Si ya funciona `ticketu-rabbitmq` (oficial o compartido), levantar **solo** las dependencias de Auth:

```bash
docker compose -f docker-compose.yml up -d db keycloak
```

No ejecutar `docker compose down -v` ni `docker compose up -d` sin seleccionar servicios cuando ya hay un broker compartido. El realm `ticketu-realm` debe existir/importarse en Keycloak; las cuentas STAFF/ORGANIZADOR dependen de él.

### Auth en Docker (configuración usada en integración)

Desde `backend/`:

```bash
docker compose -f docker-compose.auth-service.yml config --quiet
docker compose -f docker-compose.auth-service.yml up -d --build auth-service
curl -i http://localhost:10000/api/health
```

Este Compose **solo** levanta Auth; no recrea las dependencias ni necesita publicar la base de datos a otros grupos. El puerto interno de NestJS es `10000`. Los archivos RSA se montan como volúmenes de solo lectura. Si se ejecuta Auth nativo con `npm run start:dev`, usar las URLs `localhost` correspondientes en su `.env` y no iniciar otra instancia en el mismo puerto.

### API Gateway oficial

En una carpeta **separada** del repositorio Auth:

```bash
mkdir -p ~/Desktop/TITEC
cd ~/Desktop/TITEC
# Clonar solo si aún no existe:
if [ ! -d backendticketU/.git ]; then
  git clone https://github.com/FWizav/backendticketU.git
fi
cd backendticketU/api-gateway
cp -n .env.example .env
```

Editar el `.env` **del Gateway**, estableciendo estos valores de desarrollo (el ejemplo oficial de Auth con puerto 3000 no corresponde a este backend):

```dotenv
PORT=8080
AUTH_SERVICE_URL=http://auth-service:10000
CORS_ORIGINS=http://localhost:3000,http://localhost:3001,http://localhost:5173
```

Levantar solo el Gateway (no duplicar RabbitMQ):

```bash
docker compose config --quiet
docker compose up -d --build gateway
curl -i http://localhost:8080/health
curl -i http://localhost:8080/api/auth/.well-known/jwks.json
```

Verificar DNS de Docker sin conflictos de comillas en Zsh:

```bash
docker exec ticketu-api-gateway node -e '
fetch("http://auth-service:10000/api/health")
  .then(r => { console.log("Auth interno HTTP:", r.status); process.exit(r.ok ? 0 : 1); })
  .catch(e => { console.error(e.message); process.exit(1); });
'
```

Se espera `Auth interno HTTP: 200`. No ejecutar `docker rm ticketu-api-gateway` si está saludable. El Gateway publica `/api/auth/*`; **no** publica `/internal/*`.

## 3. Autenticación, roles y contrato HTTP

El backend tiene únicamente los roles internos `COMPRADOR`, `STAFF`, `ORGANIZADOR`. El administrador del realm `master` de Keycloak no es un cuarto rol de Auth. Las cuentas administrativas se crean en Keycloak y se sincronizan a PostgreSQL aproximadamente cada 30 segundos, con el mismo UUID. La contraseña del personal permanece exclusivamente en Keycloak.

| Operación | Ruta | Observación |
|---|---|---|
| Registro comprador | `POST /api/auth/register` | PostgreSQL y bcrypt |
| Login | `POST /api/auth/login` | `email`, `password`; para STAFF/ORGANIZADOR añadir `"admin": true` |
| Cerrar sesión | `POST /api/auth/logout` | Invalida/limpia cookie según flujo |
| Recuperación | `POST /api/auth/recover` | Evento hacia Notificaciones |
| Validar enlace | `POST /api/auth/validar-token` | Token de recuperación/invitación |
| Restablecer clave | `POST /api/auth/reset-password` | No exponer token en logs |
| Primera clave STAFF | `POST /api/auth/update-password` | También `/api/auth/cambiar-clave` |
| Validar sesión pública | `GET /api/auth/validar-sesion` | Requiere cookie JWT |
| Introspección interna | `GET /internal/validar-sesion` | Requiere cookie JWT + `x-api-key` |
| Salud | `GET /api/health` | HTTP 200 |
| JWKS público | `GET /.well-known/jwks.json` | Alias para Gateway: `/api/auth/.well-known/jwks.json` |
| Swagger | `/api/auth/docs` | Directamente en `localhost:10000` |

El navegador recibe una cookie `jwt` firmada con RS256, `HttpOnly` y `SameSite=Strict`. La duración esperada es 2 horas para compradores y 12 horas para STAFF/ORGANIZADOR. No copiar el JWT a parámetros URL ni variables públicas del frontend.

El contrato interno [CONTRATO_INTEGRACION_AUTH.md](../CONTRATO_INTEGRACION_AUTH.md) exige:

```http
GET /internal/validar-sesion
Cookie: jwt=<TOKEN_ORIGINAL>
x-api-key: <CLAVE_INTERNA_COMPARTIDA>
```

- **200:** sesión válida, JSON `{ "valido": true, "usuario": { "id_usuario": "...", "nombre_completo": "...", "rut": "...", "correo_electronico": "...", "rol": "usuario|staff|organizador" } }`.
- **401:** cookie ausente o JWT inválido, vencido o revocado.
- **403:** clave interna ausente o incorrecta.
- **503:** indisponibilidad técnica declarada.

Solo se necesita **una `INTERNAL_API_KEY` compartida por entorno**, no una distinta por grupo. Debe estar presente en los backends consumidores autorizados y jamás en el navegador. El login público no requiere `x-api-key`. La ruta `/internal/validar-sesion` no debe publicarse mediante el Gateway.

### Comprobaciones HTTP rápidas

```bash
curl -i http://localhost:10000/api/health
curl -i http://localhost:8080/health
curl -i http://localhost:8080/api/auth/.well-known/jwks.json
curl -i http://localhost:8080/api/auth/validar-sesion   # 401 sin cookie
curl -i http://localhost:10000/internal/validar-sesion # 403 sin x-api-key
```

Para comprobar la clave interna ya configurada sin imprimirla ni pedirla manualmente:

```bash
docker exec ticketu-auth-service node -e '
const key = process.env.INTERNAL_API_KEY;
if (!key) { console.error("INTERNAL_API_KEY ausente"); process.exit(1); }
fetch("http://127.0.0.1:10000/internal/validar-sesion", {
  headers: {"x-api-key": key}
}).then(r => { console.log("HTTP con clave y sin cookie:", r.status); process.exit(r.status === 401 ? 0 : 1); })
  .catch(e => { console.error(e.message); process.exit(1); });
'
```

## 4. RabbitMQ y contrato con Notificaciones

Usar **un solo broker** en `ticketu-rabbitmq:5672`, vhost `ticketu`, unido a `plataforma-eventos-net`. Los exchanges lógicos no generan conflictos de puertos:

| Exchange tipo topic | Routing key | Flujo |
|---|---|---|
| `auth.events` | `recuperacion_cuenta` | Auth → Notificaciones |
| `auth.events` | `cuenta_staff` | Auth → Notificaciones |
| `notificaciones.events` | `correo_auth` | Notificaciones → Auth (`auth.correo_auth`) |

El evento `recuperacion_cuenta` lleva `Id_usuario` (I mayúscula), `email_destino` (string) y `url`. `cuenta_staff` lleva `email_destino` y `url`. La confirmación `correo_auth` lleva `email_destino`, `estado_envio` (`exitoso` o `error`) y `error_envio` opcional. Ver [CONTRATO_NOTIFICACIONES_AUTH.md](../CONTRATO_NOTIFICACIONES_AUTH.md).

Verificar sin modificar el broker:

```bash
docker exec ticketu-rabbitmq rabbitmqctl list_exchanges -p ticketu name type
docker exec ticketu-rabbitmq rabbitmqctl list_bindings -p ticketu
```

En la comprobación del 16/11/2026 se observaron `auth.events`, `notificaciones.events`, el binding entrante `correo_auth` y las colas de **QA** `qa.auth.staff` y `qa.auth.recuperacion`. Estas últimas **no son prueba de que el consumidor real de Notificaciones esté ejecutándose**. Un evento publicado en RabbitMQ tampoco demuestra que el correo llegó a su destinatario.

## 5. QA — nueve cuentas de desarrollo con credenciales conocidas

El 16/11/2026 se probaron **9/9 logins HTTP 200**, cookie JWT e introspección HTTP 200.
**Ese resultado corresponde a la contraseña usada durante el seed anterior.** Para que
los demás equipos puedan reproducirlo en su Docker, el seed actual establece la clave
pública fija **`TicketuQA2026!`**, solamente para las nueve cuentas `@ticketu.test`.

| Correo electrónico | Rol de Auth | Contraseña de prueba |
|---|---|---|
| `comprador1@ticketu.test` | COMPRADOR (`usuario`) | `TicketuQA2026!` |
| `comprador2@ticketu.test` | COMPRADOR (`usuario`) | `TicketuQA2026!` |
| `comprador3@ticketu.test` | COMPRADOR (`usuario`) | `TicketuQA2026!` |
| `staff1@ticketu.test` | STAFF (`staff`) | `TicketuQA2026!` |
| `staff2@ticketu.test` | STAFF (`staff`) | `TicketuQA2026!` |
| `staff3@ticketu.test` | STAFF (`staff`) | `TicketuQA2026!` |
| `organizador1@ticketu.test` | ORGANIZADOR (`organizador`) | `TicketuQA2026!` |
| `organizador2@ticketu.test` | ORGANIZADOR (`organizador`) | `TicketuQA2026!` |
| `organizador3@ticketu.test` | ORGANIZADOR (`organizador`) | `TicketuQA2026!` |

La contraseña está deliberadamente en texto plano **solo en el código y la documentación
QA**. En PostgreSQL se guarda el hash bcrypt para compradores; STAFF y ORGANIZADOR
mantienen la credencial en Keycloak. No se altera `INTERNAL_API_KEY`, secretos de Keycloak,
RabbitMQ ni usuarios externos a estas nueve identidades. **No usar este seed en producción**
ni publicar servicios de desarrollo con estas cuentas accesibles desde Internet.

### Crear o actualizar las nueve cuentas en Docker

Requisitos: PostgreSQL, Keycloak con `ticketu-realm`, RabbitMQ y Auth ya levantados, con
`backend/.env` configurado. El perfil `qa-seed` requiere los archivos
`backend/tools/crear-usuarios-qa.cjs`, `backend/docker-compose.auth-service.yml` y
la etapa `prisma-setup` del `backend/Dockerfile`.

Desde la raíz del repositorio:

```bash
cd backend
docker compose -f docker-compose.auth-service.yml --profile qa config --services | grep -Fx qa-seed
QA_SEED_ALLOW=SI docker compose -f docker-compose.auth-service.yml \
  --profile qa run --rm --build qa-seed
```

El seed **no se ejecuta automáticamente** al hacer `docker compose up`; hay que invocarlo
explícitamente. Si ya tenías estas nueve cuentas con una contraseña anterior, volver a
correr el seed **restablece su clave a `TicketuQA2026!`** e incrementa `token_version`,
invalidando las sesiones anteriores. No elimina volúmenes ni altera otras cuentas.

### Verificar las nueve cuentas sin solicitar contraseña

Con Auth, Keycloak, PostgreSQL y el Gateway funcionando, desde la raíz del repositorio:

```bash
python3 backend/tools/probar-9-usuarios-qa.py
```

El comprobador usa `TicketuQA2026!` desde el código, inicia sesión por
`http://localhost:8080/api/auth/login` y valida cada cookie JWT y perfil mediante
`http://localhost:10000/internal/validar-sesion`. Lee la `INTERNAL_API_KEY` del
contenedor Auth sin imprimirla. No modifica usuarios, contraseñas ni archivos de datos.

Resultado esperado **una vez reejecutado el seed con la contraseña fija**: `9/9`.

### Tests del proyecto

Desde `backend/`:

```bash
npm ci
npx prisma generate
npm run build
npm test -- --runInBand
npm run test:e2e -- --runInBand
bash tools/verificar-auth-gateway.sh
```

Los tests unitarios y ciertos e2e usan dependencias simuladas; no sustituyen las pruebas con Docker y servicios externos reales. Antes de hacer push, revisar `git diff --check` y `git status --short`.

## 6. Integración de otros grupos: pendientes

- **Entradas:** su Compose vigente publica `3003:3000` y apunta a `http://auth-service:10000`. Debe coincidir la `INTERNAL_API_KEY` de los backends. No reemplazar el contrato real por documentación antigua del consumidor.
- **Panel Organizador:** su cliente de introspección debe incluir `x-api-key` y apuntar a `auth-service:10000`, no a 3000. Corresponde al equipo Panel corregir su backend.
- **Notificaciones:** su consumidor debe suscribirse a `cuenta_staff` y `recuperacion_cuenta` y publicar `correo_auth` con los campos y mayúsculas acordados. La entrega real de correo sigue pendiente de validación conjunta.
- **Pagos:** comprobar su código y configuración de integración antes de dar compatibilidad por certificada.

**Evidencia completada:** Auth + Gateway + las 9 cuentas QA. **No certificada aún:** integración de punta a punta con todos los microservicios. No mostrar claves, cookies, URLs de invitación o tokens en capturas o reportes de prueba.

## 7. Frontend Auth

Desde `frontend/`:

```bash
npm ci
npm run dev -- -p 3001
```

En navegador acceder a `http://localhost:3001`. Las llamadas públicas pasan por el Gateway cuando el frontend está configurado para ello. El frontend no recibe `INTERNAL_API_KEY` ni verifica JWT internamente.

## QA de integración con Notificaciones

Las pruebas de creación de cuentas STAFF/ORGANIZADOR,
invitaciones por RabbitMQ, monitorización de eventos
y limpieza de usuarios temporales están documentadas en:

[Herramientas QA de Notificaciones](tools/qa-notificaciones/README.md)

Estas herramientas son exclusivas del entorno Docker local
de desarrollo y no forman parte del despliegue productivo.
