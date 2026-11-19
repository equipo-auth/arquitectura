# TITEC 2026-2 · Evaluación 3 — Integraciones de Auth

**Módulo evaluado:** Autenticación (Auth).
**Rama de entrega:** `workstation` (rama utilizada en el enlace de entrega del equipo).
**Infraestructura:** una instancia compartida de API Gateway y RabbitMQ en la red Docker `plataforma-eventos-net`.
**Estado:** I1 evidenciada en pruebas locales con servicios reales; I3 con publicación y retorno observados (comprobar trazas en workstation); **I2 pendiente de validar el consumo por una contraparte real y su acuerdo de contrato**. No confundir el estado local con el resultado de instalación en workstation.

> **Condición para revisar:** instalar la rama entregada, configurar servicios externos de workstation, inicializar la base de datos y ejecutar el flujo principal indicado en [`INSTALACION_WINDOWS.md`](INSTALACION_WINDOWS.md). El frontend común (puerto 3000) lo administra Platform; Auth despliega solo backend (10000). Las pruebas locales, respuestas simuladas y `HTTP 200` de `/health` no sustituyen esta verificación.

## Integraciones declaradas (exactamente una por tipo)

| Integración | Tipo | Módulo contraparte | Servicio, ruta en el gateway o tópico | Cómo se evidencia | Dónde verificarlo |
|---|---|---|---|---|---|
| **I1** | **A. Autenticación (AU1)** | **Panel Organizador** (Auth es proveedor) | Login `POST /api/auth/login` a través del Gateway; posterior validación servidor-servidor `GET /internal/validar-sesion` en la red interna | Inicio de sesión con `organizador1@ticketu.test`, cookie `jwt` emitida por Auth, consulta de eventos autorizada (`200`); usuario comprador rechazado en Panel (`403`); sin cookie o token inválido (`401`) | `http://localhost:3000/auth/admin/login` (frontend común de Platform) → módulo Organizador/Panel configurado; `3001/admin/login` solo QA local; `GET /api/organizador/v1/panel/eventos/mios` o alias `/api/v1/panel/eventos/mios`, según Gateway instalado; logs de `ticketu-auth-service` y backend de Panel. Contrato: [`CONTRATO_INTEGRACION_AUTH.md`](CONTRATO_INTEGRACION_AUTH.md), Swagger [`backend/docs/swagger.yaml`](backend/docs/swagger.yaml) |
| **I2** | **B. API Gateway (GW1)** | **Por acordar formalmente con un equipo consumidor; candidato: Panel Organizador** | Servicio **no JWT** ofrecido por Auth: `POST /api/auth/provision` vía `http://<gateway-workstation>:8080/api/auth/provision`, con `x-api-key` privada enviada solo por backend | **Pendiente**: debe existir petición desde el módulo consumidor real, observada por Gateway, y respuesta contractual de Auth. La prueba sin clave (`403`) acredita publicación/protección de ruta, **no** acredita por sí sola el elemento base GW1 | Gateway `GET /health` confirma prefijo `/api/auth`; registro de solicitudes del Gateway y Auth; Swagger [`backend/docs/swagger.yaml`](backend/docs/swagger.yaml), `AuthController.provision` y `AuthService.provisionStaff`. Contrato y dependencia con contraparte deben quedar acordados (ver sección I2) |
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
6. El servicio consumidor llama a la URL privada de Auth configurada, por ejemplo `AUTH_SERVICE_URL=http://auth-service:3000`, con cookie original y `x-api-key`. Usar la red Docker compartida y configurar la clave en variables privadas del backend.

**Evidencia local previa (18/11/2026):** 9/9 logins, 9/9 perfiles correctos; Panel `200` con organizador, `403` con comprador; Pagos y Reseñas consumieron perfiles Auth `200` y rechazaron ausencia de cookie `401`. **Repetir en workstation**: los volúmenes locales no se transfieren con las imágenes Docker.

### I2 — API Gateway, servicio distinto de tokens (GW1)

**Evidencia local:** [GW1 Auth proveedor](docs/evidencias/e3/GW1_AUTH_PROVEEDOR.md).


**Candidato implementado y documentado por Auth:** `POST /api/auth/provision`. El servicio sincroniza una identidad `STAFF` u `ORGANIZADOR` **ya existente en Keycloak** hacia PostgreSQL y programa una invitación mediante outbox solo si corresponde. No emite ni valida un JWT. La operación está protegida por `x-api-key` de servidor, y se documenta en `backend/docs/swagger.yaml`.

**Aún falta acreditar la integración entre módulos:** debe acordarse qué otro equipo invoca esa operación y registrarlo en el contrato de dependencia. No se debe afirmar que Panel consume `/provision` mientras no exista código/flujo/registro que lo demuestre. La presencia del endpoint y el guard no satisface por sí sola GW1(a). **No publicar `INTERNAL_API_KEY` en variables `NEXT_PUBLIC_*`, código frontend ni ejemplos Git.**

Comprobación **segura y sin mutaciones** de publicación y guard desde el host de workstation:

```bash
curl -s -o /dev/null -w 'Gateway provision sin clave: HTTP %{http_code}\n' \
  -X POST -H 'Content-Type: application/json' \
  -d '{"email":"staff1@ticketu.test"}' \
  "${GATEWAY_PUBLIC_URL:-http://localhost:8080}/api/auth/provision"
# Esperado: 403; demuestra que el Gateway resuelve la ruta y Auth exige la clave.
```

**Para cerrar GW1(a–e)** antes de evaluar: (a) probar solicitud originada por el backend consumidor real —no curl aislado ni herramienta del propio Auth—; (b) observar el tránsito por Gateway; (c) configurar su URL mediante variable de entorno; (d) verificar errores y timeout (sin apagar servicios de otros equipos); (e) adjuntar acuerdo contractual con la contraparte y Swagger concordante. Si el consumidor no se instala en workstation, documentar explícitamente la excepción de contraparte no disponible de la pauta y mostrar respuesta real de Auth por Gateway, sin usar mocks.

**Alternativas posibles, no declaradas aquí como segunda I2:** `POST /api/auth/update-password` en un flujo real de activación con Panel, o `GET /internal/identidad/:uuid` solo si se diseña una ruta aprobada por Gateway y un módulo contraparte la consume. **No exponer rutas `/internal/*` como público ni afirmar que ya existen esas integraciones.**

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
- Gateway compartido: ruta `/api/auth/*`, puerto `8080`, variable `AUTH_SERVICE_URL=http://auth-service:3000` desde su red Docker. El gateway no debe exponer `/internal/*`.
- Trazabilidad: usar el mismo `X-Request-ID` (UUID) para buscar una solicitud en los registros del Gateway y de Auth. Auth devuelve y guarda ese identificador. Si llega sin UUID válido, genera uno para su auditoría.
- Broker compartido: `ticketu-rabbitmq:5672`, vhost `ticketu`, `auth.events` y `notificaciones.events`; los nombres exactos se configuran mediante `RABBITMQ_AUTH_EXCHANGE`, `RABBITMQ_NOTIFICACIONES_EXCHANGE` y `RABBITMQ_AUTH_INBOUND_QUEUE`.
- Auth provee Swagger/OpenAPI en [`backend/docs/swagger.yaml`](backend/docs/swagger.yaml), con documentación operativa en [`backend/README.md`](backend/README.md).
- No usar contraseñas reales, JWT ni claves internas en capturas, commits o reportes. Los usuarios `@ticketu.test` y su contraseña de desarrollo son exclusivamente ficticios.
- No detener ni modificar los contenedores, archivos o bases de datos de otros equipos para producir evidencia.
