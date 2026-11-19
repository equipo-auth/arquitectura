# GW1 — Auth consume Notificaciones a través de API Gateway

**Estado:** implementación preparada para verificación. **No se afirma una prueba exitosa en workstation.**

## Justificación

La tabla de dependencias TITEC 2026-2 indica confirmación de Notificaciones a Auth. Además del resultado `correo_auth` por broker (BR1), Auth incorpora una vista de notificaciones APP del usuario autenticado (GW1); esta operación HTTP es distinta de emitir o validar tokens. La ampliación del consumo HTTP del centro de notificaciones debe validarse contra el contrato vigente de Notificaciones; si el ayudante exige acuerdo específico adicional, no considerarlo acreditado sin ese acuerdo.

## Ruta y contrato

- Consumidor: Auth (`GET /api/auth/mis-notificaciones`).
- Proveedor: Notificaciones (`GET /api/notificaciones`).
- Gateway compartido: `<GATEWAY>/api/notificaciones`, prefijo `/api/notificaciones`.
- Código del proveedor: https://github.com/Equipo8-notificaciones/notificaciones-ticketu/blob/New/Backend/backend/src/routes/notificacionRoutes.js (Swagger JSDoc, GET /api/notificaciones).
- Implementación proveedor: `backend/app.js` y `backend/src/routes/notificacionRoutes.js` de Notificaciones, rama `New/Backend`.
- Configuración de Auth: `API_GATEWAY_URL`, `NOTIFICACIONES_API_PATH`, `NOTIFICACIONES_TIMEOUT_MS` (3 s).
- JWT: cookie HttpOnly original emitida por Auth; solo se reenvía `jwt`, no claves internas. Notificaciones valida la sesión por su propio middleware con Auth.
- Resultado: JSON arreglo (puede estar vacío cuando el usuario no tiene avisos).

## Cómo verificar en workstation

Primero ejecutar `bash backend/tools/preflight-e3-workstation.sh` desde la raíz de Auth. Es una inspección de solo lectura (Docker, HTTP, claves locales presentes y Gateway), no una prueba sustituta del flujo completo.

1. Confirmar que el Gateway enruta `/api/notificaciones` al contenedor de Notificaciones y que el proveedor está instalado.
2. Auth frontend: abrir `http://<front-auth>/auth/notificaciones`. Si no hay sesión, seguir el enlace de inicio de sesión y volver a esta pantalla con `volver=/auth/notificaciones`.
3. Ejecutar `python3 backend/tools/qa-gw1-notificaciones.py` con `GATEWAY_PUBLIC_URL` y cuentas QA del ambiente.
4. Verificar trazas `docker logs ticketu-api-gateway --since 5m | grep 'module=notificaciones'`, `docker logs ticketu-auth-service --since 5m | grep 'GW1'`. Debe observarse la invocación `GET /api/notificaciones` con resultado HTTP 200 desde Auth (no desde un script externo a Auth).
5. Probar `curl -i <GATEWAY_PUBLIC_URL>/api/auth/mis-notificaciones` sin cookie → 401; con sesión real → 200 arreglo.
6. Verificar errores mediante código de `backend/src/auth/notificaciones-gateway.controller.ts` y su spec: 401/403, 404, timeout, 502/503 y respuesta inválida. **No detener Notificaciones, Gateway ni RabbitMQ compartidos para provocar una falla.**
7. El acceso de Auth a Notificaciones se hace exclusivamente por el Gateway; Notificaciones a su vez valida la cookie por Auth según su contrato AU1 (la consulta de autenticación no es GW1).

## Restricciones y límites

- Esta ruta solo consulta, no crea notificaciones ni requiere otro cambio de base de datos.
- El resultado vacío (`[]`) es válido, pero conviene contar con una notificación APP real de QA para evidenciarla en pantalla.
- **No** utilizar esta prueba local como sustituto de workstation.
- Para el elemento contractual GW1(e), la tabla documenta relación Auth/Notificaciones, aunque la operación HTTP de centro de avisos no está explícita en la tabla. Si se exige un acuerdo específico, obtenerlo y documentarlo; no inventarlo.
