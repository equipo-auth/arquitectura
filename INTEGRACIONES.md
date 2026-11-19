# TITEC 2026-2 · Evaluación 3 — Integraciones de Auth

**Módulo evaluado:** Autenticación (Auth).
**Rama de entrega:** `workstation` (rama utilizada en el enlace de entrega del equipo).
**Infraestructura:** una instancia compartida de API Gateway y RabbitMQ en la red Docker `plataforma-eventos-net`.
**Estado:** I1 evidenciada en pruebas locales con servicios reales; I3 con publicación y retorno observados (comprobar trazas en workstation); **I2 pendiente de validar el consumo por una contraparte real y su acuerdo de contrato**. No confundir el estado local con el resultado de instalación en workstation.

> **Condición para revisar:** instalar la rama entregada, configurar servicios externos de workstation, inicializar la base de datos y ejecutar el flujo principal indicado en [`INSTALACION.md`](INSTALACION.md). Las pruebas locales, respuestas simuladas y `HTTP 200` de `/health` no sustituyen esta verificación.

## Integraciones declaradas (exactamente una por tipo)

| Integración | Tipo | Módulo contraparte | Servicio, ruta en el gateway o tópico | Cómo se evidencia | Dónde verificarlo |
|---|---|---|---|---|---|
| **I1** | **A. Autenticación (AU1)** | **Panel Organizador** (Auth es proveedor) | Login `POST /api/auth/login` a través del Gateway; posterior validación servidor-servidor `GET /internal/validar-sesion` en la red interna | Inicio de sesión con `organizador1@ticketu.test`, cookie `jwt` emitida por Auth, consulta de eventos autorizada (`200`); usuario comprador rechazado en Panel (`403`); sin cookie o token inválido (`401`) | `http://localhost:3001/admin/login` → Panel; `GET /api/organizador/v1/panel/eventos/mios` o alias `/api/v1/panel/eventos/mios`, según Gateway instalado; logs de `ticketu-auth-service` y backend de Panel. Contrato: [`CONTRATO_INTEGRACION_AUTH.md`](CONTRATO_INTEGRACION_AUTH.md), Swagger [`backend/docs/swagger.yaml`](backend/docs/swagger.yaml) |
| **I2** | **B. API Gateway (GW1)** | **Notificaciones** (Auth consumidor HTTP) | Auth `GET /api/auth/mis-notificaciones` consulta `GET /api/notificaciones` del proveedor a través de `API_GATEWAY_URL` | Pantalla `/auth/notificaciones`; script QA sin JWT manual; trazas `GW1` en Auth y `module=notificaciones` en Gateway; HTTP 200 lista (puede estar vacía) | [Procedimiento y contrato](docs/evidencias/e3/GW1_AUTH_CONSUME_NOTIFICACIONES.md); Swagger de Notificaciones en rama `New/Backend` `backend/src/routes/notificacionRoutes.js`; fuente Auth `backend/src/auth/notificaciones-gateway.controller.ts` |
| **I3** | **C. Broker (BR1)** | **Notificaciones** | Auth publica en exchange `auth.events`, clave `recuperacion_cuenta`; Notificaciones consume y responde en `notificaciones.events`, clave `correo_auth`; Auth escucha en cola `auth.correo_auth` | Solicitud real `POST /api/auth/recover` de una cuenta QA; logs `[PUBLICADO]` y `[CORREO_AUTH][ENTREGADO/REBOTADO]`; consola RabbitMQ muestra binding y consumidor, y logs/registro de Notificaciones evidencian el procesamiento | Logs de `ticketu-auth-service` y servicio Notificaciones; RabbitMQ cola `notificaciones.recuperacion_cuenta` y `auth.correo_auth`; contrato [`CONTRATO_NOTIFICACIONES_AUTH.md`](CONTRATO_NOTIFICACIONES_AUTH.md) y código `backend/src/auth/notification.service.ts`, `backend/src/auth/notificaciones.listener.ts` |

### I1 — Autenticación, rol y sesiones (AU1)

1. En workstation, levantar Auth, Gateway y Panel según las instrucciones de instalación de **cada** equipo. Crear las nueve identidades ficticias usando el procedimiento de [`INSTALACION.md`](INSTALACION.md) si el entorno es de pruebas y está autorizado.
2. Iniciar sesión como `organizador1@ticketu.test` desde el login administrativo de Auth. La respuesta de Auth emite `Set-Cookie: jwt=...` con `HttpOnly` y el navegador la reutiliza automáticamente. **No copiar ni pegar JWT** en el frontend.
3. Abrir `Mis eventos` del Panel. La API protegida debe devolver `200`. Repetir con `comprador1@ticketu.test` para confirmar `403` al intentar consultar eventos administrativos.
4. Sin cookie, `GET /api/auth/validar-sesion` por el Gateway debe devolver `401`; con cookie alterada también debe devolver `401`. Se puede comprobar sin modificar datos:

   ```bash
   curl -s -o /dev/null -w 'Auth sin cookie: HTTP %{http_code}\n' \
     "${GATEWAY_PUBLIC_URL:-http://localhost:8080}/api/auth/validar-sesion"
   curl -s -o /dev/null -w 'Auth con cookie alterada: HTTP %{http_code}\n' \
     -H 'Cookie: jwt=token-invalido-e3' \
     "${GATEWAY_PUBLIC_URL:-http://localhost:8080}/api/auth/validar-sesion"
   ```

5. El perfil interno devuelve `usuario.rol` normalizado a `usuario`, `staff` u `organizador`. Auth valida firma RS256, expiración, versión de token y vigencia de usuario. Consultar `backend/src/internal/internal.controller.ts`, `backend/src/auth/auth.service.ts` y contrato v1.1 para verificar rechazo de tokens vencidos o revocados.
6. El servicio consumidor llama a la URL privada de Auth configurada, por ejemplo `AUTH_SERVICE_URL=http://auth-service:10000`, con cookie original y `x-api-key`. Esa ruta interna **no se publica por Gateway**. Verificar que las claves sean variables privadas y que `AUTH_SERVICE_URL` no apunte a `localhost` desde contenedores.

**Evidencia local previa (18/11/2026):** 9/9 logins, 9/9 perfiles correctos; Panel `200` con organizador, `403` con comprador; Pagos y Reseñas consumieron perfiles Auth `200` y rechazaron ausencia de cookie `401`. **Repetir en workstation**: los volúmenes locales no se transfieren con las imágenes Docker.

### I2 — API Gateway, servicio distinto de tokens (GW1)

**Integración declarada:** Auth **consume** el centro de notificaciones del otro módulo (Notificaciones), no emisión ni validación de JWT. No declarar además `POST /api/auth/provision` como segunda integración I2; ese servicio continúa existiendo, pero **no** se usa para calificar GW1.

**Dependencia:** la tabla TITEC 2026-2 contempla que Auth recibe confirmaciones de Notificaciones. Esta funcionalidad amplía la consulta al centro de avisos APP, usando su API HTTP publicada. El contrato del proveedor figura en [Notificaciones, rama `New/Backend`, Swagger JSDoc `backend/src/routes/notificacionRoutes.js`](https://github.com/Equipo8-notificaciones/notificaciones-ticketu/blob/New/Backend/backend/src/routes/notificacionRoutes.js). Esa dependencia general existe, aunque la consulta HTTP no está explicitada como tal en la tabla; si se requiere acuerdo inter-módulo adicional para GW1(e), documentarlo sin inventarlo.

**Flujo real:** navegador con cookie Auth `jwt` -> `GET /api/auth/mis-notificaciones` por Gateway -> backend Auth (valida su propia sesión y reenvía únicamente `jwt`) -> `GET /api/notificaciones` por **el mismo API Gateway** -> backend Notificaciones (vuelve a validar la sesión con Auth) -> respuesta JSON de avisos -> Auth muestra lista o estado vacío. No hay llamada directa Auth→Notificaciones.

**Configuración:** `API_GATEWAY_URL`, `NOTIFICACIONES_API_PATH`, `NOTIFICACIONES_TIMEOUT_MS`; `NEXT_PUBLIC_GATEWAY_URL` para el frontend. El destino no se fija a `localhost` en el backend ni se expone clave privada en el navegador.

**Cómo verificar en workstation:**

1. Configurar e instalar el módulo Notificaciones y su ruta en Gateway. No basta con instalar Auth.
2. Ejecutar `python3 backend/tools/qa-gw1-notificaciones.py` (utiliza cookie de sesión QA en memoria, sin copiar token); se espera HTTP 200 y un JSON array, aunque esté vacío.
3. Abrir `/auth/notificaciones`; con sesión ausente se invita a iniciar sesión y volver automáticamente a esa página. Con sesión válida muestra los avisos o estado vacío, sin tokens manuales.
4. Verificar trazas con fecha: `docker logs ticketu-auth-service --since 5m | grep GW1` y `docker logs ticketu-api-gateway --since 5m | grep 'module=notificaciones'`. Comprobar que no hubo llamada directa al puerto de Notificaciones.
5. Errores en vivo: sin cookie → 401; la ruta inexistente al proveedor → 404 controlado si lo reporta Gateway; no desconectar servicios compartidos. Timeout y ausencia de Gateway verificados en `backend/src/auth/notificaciones-gateway.controller.ts` y tests `notificaciones-gateway.controller.spec.ts`.
6. Contrastar el JSON recibido con el Swagger del proveedor y verificar el enlace en [`docs/evidencias/e3/GW1_AUTH_CONSUME_NOTIFICACIONES.md`](docs/evidencias/e3/GW1_AUTH_CONSUME_NOTIFICACIONES.md).

**Estado:** preparado para pruebas reales; no declarar completado GW1(a–e) hasta comprobarlo en workstation. La integración anterior `/provision` se deja solo como evidencia histórica local, no como I2 declarado.

### I3 — Broker y Notificaciones (BR1)

**Evidencia local:** [BR1 Auth ↔ Notificaciones](docs/evidencias/e3/BR1_AUTH_NOTIFICACIONES.md).


Ruta de eventos acordada en [`CONTRATO_NOTIFICACIONES_AUTH.md`](CONTRATO_NOTIFICACIONES_AUTH.md):

```text
POST /api/auth/recover (Auth)
     -> Auth publica exchange auth.events / recuperacion_cuenta
        -> cola propia de Notificaciones / consumidor real
           -> Notificaciones intenta entregar correo y publica
              exchange notificaciones.events / correo_auth
                 -> cola auth.correo_auth / listener de Auth
                    -> [CORREO_AUTH][ENTREGADO] o [CORREO_AUTH][REBOTADO]
```

El mensaje `recuperacion_cuenta` incluye `Id_usuario`, `email_destino` y `url` temporal. La respuesta `correo_auth` incluye `email_destino`, `estado_envio` (`exitoso` o `error`) y opcionalmente `error_envio`. **Nunca imprimir el campo `url`, cookies, JWT ni secretos en evidencias compartidas.**

Para observar colas y consumidores sin consumir ni borrar mensajes:

```bash
docker exec ticketu-rabbitmq rabbitmqctl list_queues \
  -p ticketu name consumers messages_ready messages_unacknowledged

docker exec ticketu-rabbitmq rabbitmqctl list_bindings -p ticketu
```

Para generar un evento genuino **solo con una cuenta QA existente** y solo en workstation autorizada:

```bash
curl -s -o /dev/null -w 'Recovery: HTTP %{http_code}\n' \
  -H 'Content-Type: application/json' \
  -d '{"email":"comprador1@ticketu.test"}' \
  "${GATEWAY_PUBLIC_URL:-http://localhost:8080}/api/auth/recover"
```

El `200` es deliberadamente genérico; **no confirma** consumo, publicación ni email entregado. Verificar logs de Auth, broker y Notificaciones con la misma ventana horaria y correlacionar el evento por metadatos seguros. La cola `auth.correo_auth` debe tener consumidor; también debe tenerlo `notificaciones.recuperacion_cuenta`. Una respuesta `[REBOTADO]` demuestra que Auth procesó el resultado de Notificaciones, **no** que un correo llegó a un buzón. Si el consumidor no está disponible, el evento puede quedar en cola; comprobar la lógica de manejo de errores y reconexión del módulo que corresponda. El propio `NotificationService` captura y registra fallos de publicación sin derribar la solicitud.

**Evidencia local previa (18/11/2026):** dos publicaciones `[PUBLICADO]` y confirmaciones `[CORREO_AUTH][REBOTADO]` en logs de Auth; el consumidor de Notificaciones recuperó conexión tras un reinicio y sus mensajes pendientes se procesaron. No se observó entrega SMTP exitosa. Esta evidencia local **debe reproducirse en workstation**, sin usar simuladores ni consumidores de QA como sustituto del consumidor real.

## Configuración, contratos y seguridad

- Auth: `backend/.env` **privado**; `INTERNAL_API_KEY`, `DATABASE_URL`, `KEYCLOAK_URL`, `RABBITMQ_URL` y URL del frontend se definen por ambiente.
- Gateway compartido: ruta `/api/auth/*`, puerto `8080`, variable `AUTH_SERVICE_URL=http://auth-service:10000` desde su red Docker. El gateway no debe exponer `/internal/*`.
- Broker compartido: `ticketu-rabbitmq:5672`, vhost `ticketu`, `auth.events` y `notificaciones.events`; los nombres exactos se configuran mediante `RABBITMQ_AUTH_EXCHANGE`, `RABBITMQ_NOTIFICACIONES_EXCHANGE` y `RABBITMQ_AUTH_INBOUND_QUEUE`.
- Auth provee Swagger/OpenAPI en [`backend/docs/swagger.yaml`](backend/docs/swagger.yaml), con documentación operativa en [`backend/README.md`](backend/README.md).
- No usar contraseñas reales, JWT ni claves internas en capturas, commits o reportes. Los usuarios `@ticketu.test` y su contraseña de desarrollo son exclusivamente ficticios.
- No detener ni modificar los contenedores, archivos o bases de datos de otros equipos para producir evidencia.
