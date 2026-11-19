# TITEC 2026-2 · Evaluación 3 — Instalación y comprobación de Auth en workstation

Esta guía es de **Auth solamente**. Su fuente operativa más extensa es [`backend/README.md`](backend/README.md). El Gateway, RabbitMQ y los otros ocho microservicios son infraestructura o servicios de **otros equipos**: **no se deben reinstalar, reconstruir, detener ni borrar sus volúmenes** desde este procedimiento.

## 1. Requisitos

- Docker Engine/Desktop y `docker compose`, Git, Python 3, `curl`.
- Rama exacta de Auth indicada en la entrega del aula virtual (debe contener este archivo y [`INTEGRACIONES.md`](INTEGRACIONES.md)).
- Red externa `plataforma-eventos-net`.
- Base PostgreSQL propia de Auth, Keycloak con realm `ticketu-realm`, claves RSA de Auth y acceso al Gateway/RabbitMQ de workstation.
- Variables privadas de Auth en `backend/.env`, creadas desde `backend/.env.example`. **No subir el archivo `.env`, llaves `private.pem`, claves Keycloak, JWT ni claves internas**.

## 2. Direcciones y puertos que deben coincidir

| Componente | Desde el equipo anfitrión (referencia de QA) | Desde contenedores en `plataforma-eventos-net` |
|---|---|---|
| Auth backend | `http://localhost:10000` | `http://auth-service:10000` |
| Auth frontend | `http://localhost:3001` | contenedor `frontend-front-1:3000` (si está desplegado) |
| API Gateway | `http://localhost:8080` | `http://ticketu-api-gateway:8080` |
| Auth PostgreSQL | `localhost:5433` | `ticketu-db:5432` |
| Keycloak | `http://localhost:8081` | `http://ticketu-keycloak:8080` |
| RabbitMQ | `localhost:5672`; consola `:15672` | `ticketu-rabbitmq:5672`, vhost `ticketu` |
| Panel Organizador | `http://localhost:5173/mis-eventos` si está instalado | **Consultar configuración del equipo Panel**, no inferir puerto solo del frontend |

Estos son valores observados en el **entorno local de integración** del 18/11. En la workstation universitaria confirmar puertos y nombres con el equipo plataforma. Los `3001–3009` del README de Gateway son ejemplos cuando cada microservicio se ejecuta fuera de Docker: no sustituyen los puertos internos reales. **En el código servidor usar variables de entorno y nombres Docker; `localhost` de esta tabla es solo para acceder desde el host/navegador.**

### Variables que debe proveer el ambiente

Configurar, sin publicarlas en Git: `DATABASE_URL`, `KEYCLOAK_URL`, `KEYCLOAK_REALM`, `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_CLIENT_SECRET`, `INTERNAL_API_KEY`, `RABBITMQ_URL`, `RABBITMQ_AUTH_EXCHANGE`, `RABBITMQ_NOTIFICACIONES_EXCHANGE`, `RABBITMQ_AUTH_INBOUND_QUEUE`, `FRONTEND_URL`, `COMPRADOR_FRONTEND_URL` y llaves RSA. En Gateway (administrado por plataforma), el valor correspondiente a Auth es `AUTH_SERVICE_URL=http://auth-service:10000`. La URL pública que emplea el navegador suele ser `NEXT_PUBLIC_AUTH_API_URL=http://localhost:8080` en QA local y debe adaptarse a la workstation. Los destinos de Entradas/Panel/Check-in del frontend de Auth son **URLs de navegación**: dependen del despliegue de cada equipo y no implican que Auth levante esos módulos.

## 3. Instalación sin intervenir otros equipos

1. Clonar la **rama entregada exacta** o hacer checkout en una copia limpia. No usar archivos temporales de `~/Downloads` como única fuente de la entrega.
2. Verificar infraestructura existente y preparar `backend/.env` y llaves RSA privadas de Auth. **No reemplazar contraseñas de contenedores existentes ni reutilizar la clave de ejemplo del `.env.example`**.

```bash
# Desde la raíz del repositorio Auth

git branch --show-current

docker network inspect plataforma-eventos-net >/dev/null && echo 'Red disponible'
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'

test -f backend/.env && echo 'Entorno privado Auth configurado'
test -s backend/private.pem && test -s backend/public.pem && echo 'Par RSA de Auth disponible'
```

3. Si Auth es la única parte que falta levantar y las dependencias ya están instaladas:

```bash
cd backend
docker compose -f docker-compose.auth-service.yml config --quiet
docker compose -f docker-compose.auth-service.yml up -d --build auth-service
cd ..
```

4. **Primera instalación de Auth en una base QA nueva:** consultar y ejecutar el procedimiento de [`backend/README.md`](backend/README.md), sección “Arranque QA en un solo comando”. En Linux/macOS:

```bash
# SOLO primera instalación sobre base de Auth NUEVA / vacía y autorizada
bash backend/tools/iniciar-integracion.sh --inicializar-esquema --usuarios-qa --sin-front
```

En una instalación posterior que ya tenga esquema y usuarios QA, **omitir** `--inicializar-esquema`. En workstation compartida coordinar la inicialización con el responsable del ambiente. No ejecutar `QA_SEED_RESET=SI` sin autorización, porque cambia contraseñas de las cuentas de prueba e invalida sesiones. Los usuarios QA no están dentro de las imágenes Docker y deben existir en el volumen PostgreSQL/Keycloak de esa workstation.

5. El frontend Auth es opcional para el backend, pero necesario si el flujo principal se evaluará visualmente. Su Docker Compose es `frontend/docker-compose.yml` y publica `3001:3000`; configurar **en el ambiente de build** `NEXT_PUBLIC_GATEWAY_URL`, `NEXT_PUBLIC_AUTH_API_URL`, `NEXT_PUBLIC_ENTRADAS_APP_URL`, `NEXT_PUBLIC_CHECKIN_APP_URL`, `NEXT_PUBLIC_ORGANIZADOR_APP_URL` con los destinos efectivos autorizados. Estas variables `NEXT_PUBLIC_*` son públicas: **nunca** poner ahí `INTERNAL_API_KEY` u otras credenciales. Ejemplo de reconstrucción **solo del frontend Auth**:

```bash
# Solo cuando corresponda reconstruir el frontend del propio equipo Auth:
cd frontend
NEXT_PUBLIC_GATEWAY_URL="${GATEWAY_PUBLIC_URL:-http://localhost:8080}" \
NEXT_PUBLIC_AUTH_API_URL="${GATEWAY_PUBLIC_URL:-http://localhost:8080}" \
NEXT_PUBLIC_ORGANIZADOR_APP_URL="${ORGANIZADOR_APP_URL:-}" \
NEXT_PUBLIC_ENTRADAS_APP_URL="${ENTRADAS_APP_URL:-}" \
NEXT_PUBLIC_CHECKIN_APP_URL="${CHECKIN_APP_URL:-}" \
docker compose -f docker-compose.yml up -d --build front
cd ..
```

**Advertencia:** no construir el frontend con destinos vacíos si el caso de uso exige redirección a otros módulos. Una URL de pantalla y un servicio API no son equivalentes.

## 4. Usuarios de prueba Auth

En workstation **de pruebas** ejecutar/validar el seed de Auth (ver paso 4). Contraseña común únicamente de cuentas ficticias: **`TicketuQA2026!`**. No utilizar estas identidades en producción.

| Rol contractual | Usuarios disponibles |
|---|---|
| `usuario` (COMPRADOR) | `comprador1@ticketu.test`, `comprador2@ticketu.test`, `comprador3@ticketu.test` |
| `staff` | `staff1@ticketu.test`, `staff2@ticketu.test`, `staff3@ticketu.test` |
| `organizador` | `organizador1@ticketu.test`, `organizador2@ticketu.test`, `organizador3@ticketu.test` |

Verificación real sin copiar JWT ni publicar secretos:

```bash
python3 backend/tools/probar-9-usuarios-qa.py
# Esperado: nueve logins, nueve cookies JWT y nueve perfiles válidos.
```

## 5. Flujo principal que puede seguir el ayudante

1. Abrir la web Auth (si está desplegada en workstation). Iniciar sesión como `organizador1@ticketu.test` con contraseña QA desde `/admin/login`.
2. Comprobar que Auth emite cookie `jwt` y que el navegador **redirige al Panel Organizador real**, sin tener que introducir manualmente el JWT. Si el frontend de Panel no está instalado en workstation, usar el API de Panel ya desplegado por Gateway y documentar la indisponibilidad de la contraparte.
3. Consultar `Mis eventos` (o endpoint protegido equivalente del contrato de Panel): organizador recibe `200`. Cerrar sesión y comprobar con `comprador1@ticketu.test` que el acceso administrativo devuelve `403`.
4. Sin cookie, comprobar `GET /api/auth/validar-sesion` → `401`; con token alterado → `401`.
5. Para comprobar el broker, solicitar recuperación de contraseña de `comprador1@ticketu.test` mediante el frontend o `POST /api/auth/recover` por Gateway y observar publicación/consumo/resultado en los logs y colas. Un `200` de recuperación **no demuestra envío de correo**. No compartir las URLs temporales.
6. **GW1**: ejecutar únicamente una integración distinta de JWT **que esté realmente acordada con otro equipo**; la opción documental preliminar `POST /api/auth/provision` necesita consumo real y contrato. Ver [`INTEGRACIONES.md`](INTEGRACIONES.md), I2. No presentar una respuesta simulada como integración probada.

## 6. Comprobaciones de salud y rutas (solo lectura)

```bash
curl -s -o /dev/null -w 'Auth health HTTP %{http_code}\n' http://localhost:10000/api/health
curl -s -o /dev/null -w 'Gateway health HTTP %{http_code}\n' http://localhost:8080/health
curl -s -o /dev/null -w 'Auth sin sesión HTTP %{http_code}\n' http://localhost:8080/api/auth/validar-sesion
curl -s -o /dev/null -w 'Auth provision sin clave HTTP %{http_code}\n' \
  -X POST -H 'Content-Type: application/json' -d '{"email":"staff1@ticketu.test"}' \
  http://localhost:8080/api/auth/provision
# Valores esperados: 200, 200, 401, 403. El último NO acredita GW1 completo.
```

```bash
# RabbitMQ: SOLO observar, nunca purgar colas
docker exec ticketu-rabbitmq rabbitmqctl list_queues \
  -p ticketu name consumers messages_ready messages_unacknowledged
```

Para validar GW1 en serio debe obtenerse una traza de **otro módulo** solicitando un servicio de Auth **que no sea emisión/validación de tokens**, a través del Gateway, y la correspondiente respuesta. Registrar cómo se invoca, desde qué contrato y dónde ver la evidencia. Si la contraparte no está desplegada, aplicar solo la excepción documentada en la pauta, sin afirmar que un test local equivale a workstation.

## 7. Integraciones y documentación para evaluación

- [`INTEGRACIONES.md`](INTEGRACIONES.md): tabla I1, I2, I3 y métodos específicos de evidencia.
- [`CONTRATO_INTEGRACION_AUTH.md`](CONTRATO_INTEGRACION_AUTH.md): contrato AU1 de introspección.
- [`CONTRATO_NOTIFICACIONES_AUTH.md`](CONTRATO_NOTIFICACIONES_AUTH.md): contrato y esquema BR1 de RabbitMQ.
- [`backend/docs/swagger.yaml`](backend/docs/swagger.yaml): API ofrecida por Auth, incluida la candidata a GW1.
- [`backend/tools/qa-notificaciones/README.md`](backend/tools/qa-notificaciones/README.md): creación controlada de invitación, monitor y limpieza de identidades temporales para QA; **evitar usar en workstation sin autorización**.

## 8. Precauciones de entrega

- Una sola rama de GitHub por equipo en el aula virtual: el enlace debe apuntar a la **rama específica entregada**, no a `main` genérico. No inferir ni crear `workstation` sin coordinar la estrategia con el equipo.
- La entrega inicial de la pauta figura para **miércoles 18/11/2026 23:59** y las correcciones para **jueves 19/11/2026 23:59**, sobre **la misma rama entregada**. Lo evaluado será el commit vigente en esa rama al cerrar las correcciones.
- No depender de imágenes QA, patches no versionados o volúmenes de una instalación local previa. No ejecutar `docker compose down -v`, no reiniciar servicios de otros equipos, no subir llaves ni `.env`.
- Antes de hacer commit: `git diff --check`, `git diff --cached --check`, revisar que `git status` no incluya `__pycache__/`, respaldos `.bak` ni scripts `aplicar_*.py`.

## 9. GW1 — Consulta a Notificaciones vía Gateway

Auth también consume `GET /api/notificaciones` desde su backend, pasando exclusivamente por la ruta del Gateway indicada en `API_GATEWAY_URL` y `NOTIFICACIONES_API_PATH`. La pantalla está en `/auth/notificaciones`; no interfiere con el login ni con el flujo principal de Auth.

- Configurar en backend Docker `API_GATEWAY_URL=http://ticketu-api-gateway:8080`, `NOTIFICACIONES_API_PATH=/api/notificaciones` y `NOTIFICACIONES_TIMEOUT_MS=3000`. Estos valores están en `backend/docker-compose.auth-service.yml` y pueden modificarse por el ambiente.
- Instalar el módulo Notificaciones en la red Docker y configurar su URL en el Gateway. Sin Notificaciones no se puede probar el elemento base de GW1, salvo la excepción de contraparte no disponible de la pauta cuando sea aplicable.
- Para QA HTTP: `python3 backend/tools/qa-gw1-notificaciones.py` (requiere Gateway público accesible y cuenta QA inicializada).
- Para UI: entrar al frontend Auth `/auth/notificaciones`; iniciar sesión si se solicita. La página indica lista vacía si Notificaciones responde `[]`.
- Evidencia: `docker logs ticketu-auth-service --since 5m | grep GW1` y `docker logs ticketu-api-gateway --since 5m | grep module=notificaciones`.
- Verificación de errores: sin sesión 401; 404/502/503/504 manejados en el controlador; no apagar infraestructura compartida para provocar fallos.
- Contrato vigente del proveedor: repositorio `Equipo8-notificaciones/notificaciones-ticketu`, rama `New/Backend`, `backend/src/routes/notificacionRoutes.js` (OpenAPI en JSDoc).

**No confundir las pruebas locales con la instalación de la workstation universitaria.**
