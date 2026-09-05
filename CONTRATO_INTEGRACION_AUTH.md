# CONTRATO_INTEGRACION_AUTH.md

**Equipo Proveedor:** Autenticación (Auth)  
**Equipos Consumidores:** Todos los microservicios core (Check-in, Catálogo, Panel Organizador, Pagos, Reseñas, etc.)  
**Protocolo:** HTTP/REST (Red Interna)  
**Basado en:** 
- Épica de Seguridad del Microservicio Auth.
- **HU-B2:** Emisión de JWT estandarizado.
- **HU-B6:** Consulta Interna de Identidad (Introspección).
---
## 1. Propósito y Arquitectura

Auth opera bajo un modelo de **Introspección Centralizada de Sesión**.

Los microservicios consumidores NO deben decodificar ni validar los tokens JWT por su cuenta. Para autenticar al usuario antes de ejecutar acciones críticas o extraer datos de identidad, el consumidor debe delegar la validación de la sesión a Auth.

Auth maneja la identidad de la plataforma abstrayendo la complejidad de las fuentes de datos, retornando siempre un perfil de usuario unificado y estandarizado.

> **Nota Crítica sobre Autorización:** La validación de sesión realizada por Auth confirma la **identidad** y la **vigencia** de la sesión (Autenticación). La autorización específica sobre recursos y operaciones de negocio (ej. "¿Puede este organizador editar *este* evento?") continúa siendo responsabilidad del microservicio consumidor, salvo que se defina explícitamente lo contrario.

---
## 2. Estructura interna del Token JWT

El JWT es entregado al navegador mediante una cookie configurada con los flags `HttpOnly`, `Secure` y `SameSite=Strict`, evitando su exposición directa al código JavaScript del Frontend y mitigando vectores de ataque.

El payload es minimalista y **no expone datos personales sensibles**.
### 2.1 Claims

| Claim | Tipo | Descripción |
| :--- | :--- | :--- |
| `id` | string | Identificador único del usuario (UUID v4). |
| `rol` | string | Nivel de acceso al momento del login (`usuario`, `organizador`, `staff`). |
| `tokenVersion` | number | Versión de la sesión al momento de emisión del JWT. Auth la contrasta contra la versión vigente almacenada para detectar revocaciones. |
| `iat` | number | Timestamp de emisión del token. |
| `exp` | number | Timestamp de expiración (2 h compradores, 12 h administrativos). |
### 2.2 Ejemplo de la estructura

```json
{
  "id": "3f1e2c1a-4b8d-4a2e-9c3f-7d1e2f9b2d4a",
  "rol": "usuario",
  "tokenVersion": 1,
  "iat": 1715769000,
  "exp": 1715776200
}
```
### 2.3 Reglas de la fuente de verdad

> El rol retornado por el endpoint de introspección corresponde al rol vigente del usuario según la fuente de identidad (BD/Keycloak). El `rol` contenido en el JWT representa el rol al momento de emisión del token y no debe utilizarse como fuente definitiva para autorización.

> El consumidor debe utilizar el perfil retornado por Auth como fuente de identidad vigente para ejecutar las reglas de autorización propias de su dominio.

---
## 3. Operación: Validar Sesión

La operación de introspección permite a los microservicios consumidores validar la identidad, vigencia y estado de la sesión de un usuario mediante Auth.
### 3.1 Descripción y momento exacto de validación

El consumidor debe llamar a este endpoint interno inmediatamente al recibir una petición del Frontend, antes de procesar cualquier lógica de negocio que requiera autenticación.

#### Reglas de uso: Validación por demanda

- **Acciones de lectura menor:** No es necesario consultar a Auth por cada clic de navegación pública.

- **Acciones críticas / obtención de datos:** Es obligatorio consultar a Auth antes de realizar mutaciones (`POST`, `PUT`, `PATCH`, `DELETE`) o cuando el microservicio necesite la identidad real del usuario.
### 3.2 Endpoint

Este es el único endpoint necesario para validar completamente la identidad, vigencia y estado de la sesión.

**HTTP**

```http
GET /internal/validar-sesion
```
### 3.3 Request (Petición)

El microservicio consumidor debe interceptar la cookie de la petición entrante del Frontend y adjuntarla intacta en los headers de su llamada HTTP interna hacia Auth.

**Parámetros de Cabecera (Headers):**

| Header | Obligatorio | Descripción |
| :--- | :--- | :--- |
| `Cookie` | Sí | Debe contener el atributo del token original (`jwt=...`). |

**Ejemplo de Petición HTTP Cruda:**

```http
GET /internal/validar-sesion HTTP/1.1
Host: auth-service.internal
Cookie: jwt=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```
> **Importante:** El consumidor no debe extraer, modificar, regenerar ni reconstruir el JWT. Debe reenviar la cookie original recibida desde el Frontend.
### 3.4 Response exitoso — 200 OK

Si la sesión es válida y vigente, Auth retorna el perfil normalizado. 
Auth incluirá la cabecera HTTP `Cache-Control: no-store` en su respuesta para evitar que proxies o gateways intermedios almacenen accidentalmente estos datos personales.

El consumidor debe extraer únicamente los campos que necesita para ejecutar su lógica de negocio.

**Response API:**
```http
HTTP/1.1 200 OK
Content-Type: application/json
Cache-Control: no-store

{
  "valido": true,
  "usuario": {
    "id_usuario": "3f1e2c1a-4b8d-4a2e-9c3f-7d1e2f9b2d4a",
    "nombre_completo": "Javier Romero",
    "rut": "21.xxx.xxx-x",
    "correo_electronico": "javier@ejemplo.cl",
    "rol": "usuario"
  }
}
```
### 3.5 Response de error y Disparadores

Los errores de autenticación se responden con HTTP `401 Unauthorized`.

El código `403 Forbidden` se reserva para solicitudes que no cumplen las políticas de acceso al endpoint interno.

Se asume un `401 Unauthorized` bajo cualquiera de las siguientes condiciones:

- Cabecera `Cookie` ausente.
- Cabecera `Cookie` presente, pero sin el atributo `jwt`.
- Token mal formado o sin firma.
- Firma criptográfica inválida.
- Token expirado temporalmente (`exp`).
- Sesión revocada (`tokenVersion` del JWT no coincide con `token_version` vigente en la fuente de verdad).
- Usuario eliminado, bloqueado o inexistente en BD/Keycloak.

**Ejemplo de respuesta:**

```json
{
  "valido": false,
  "codigo_http": 401,
  "error": "unauthorized",
  "mensaje": "La sesión ha expirado, es inválida o fue revocada."
}
```
### 3.6 Flujo de errores y redirección al Login

El consumidor debe propagar los errores hacia su propio Frontend según esta tabla:

| Código de Auth | Qué debe programar el Backend Consumidor | Qué debe programar el Frontend Consumidor |
|---|---|---|
| `200 OK` | Extraer `id_usuario` y continuar con la lógica de negocio. | Mostrar la vista solicitada. |
| `401 Unauthorized` | Detener el proceso y retornar HTTP `401`. | Interceptar el `401` y redirigir a `/login`. |
| `403 Forbidden` | Bloquear la petición y retornar HTTP `403`. | Mostrar pantalla de Acceso Denegado. |
| `500 Server Error` | Abortar el proceso y retornar HTTP `500`. | Mostrar mensaje temporal de indisponibilidad. |
| `503 Service Unavailable` | Abortar la operación protegida y retornar HTTP `503`. | Mostrar mensaje temporal de indisponibilidad. |
### 3.7 Timeout / Indisponibilidad de Auth

Si el microservicio consumidor no puede obtener respuesta de Auth debido a un timeout, conexión rechazada o caída del servicio:

- Debe asumir que la identidad no pudo ser validada (**Fail-Secure**).
- **NO** debe asumir que la sesión es válida.
- Debe abortar la operación protegida y responder HTTP `503 Service Unavailable` a su Frontend.

---
## 4. Responsabilidades de los Microservicios Consumidores
### 4.1 Autenticación y Autorización

- Utilizar el `id_usuario` retornado por Auth como **única** identidad autenticada para ejecutar las operaciones de negocio.
- **Prohibido:** Utilizar un `id_usuario` proveniente directamente del Frontend para determinar la identidad del usuario que ejecuta la acción.
- Aplicar las reglas de autorización propias del dominio utilizando la identidad validada por Auth.
- El rol retornado por Auth debe considerarse como el rol vigente del usuario para las decisiones de autorización que correspondan al microservicio.

---
## 5. Responsabilidades del Servicio Auth
### 5.1 Validación JWT y Revocación

- Validar la presencia, estructura, firma criptográfica y vigencia temporal (`exp`) del token.

- Contrastar el `tokenVersion` del JWT contra el `token_version` vigente en la fuente de verdad.

- Si las versiones no coinciden, rechazar la sesión con HTTP `401 Unauthorized`.
### 5.2 Identidad y Normalización

- Extraer los datos actualizados del usuario desde la fuente de verdad.

- Retornar un perfil estandarizado y unificado para todos los microservicios consumidores.

- El rol retornado debe corresponder al estado vigente del usuario y no depender exclusivamente del rol histórico contenido en el JWT.

---
## 6. Consideraciones de Seguridad Perimetral

### 6.1 Red Interna
- El endpoint `/internal/validar-sesion` es estrictamente interno. No debe estar expuesto a Internet ni ser accesible directamente por el Frontend.

### 6.2 Cookie y Logs
- La cookie será configurada por Auth estrictamente como `HttpOnly`, `Secure` y `SameSite=Strict`.
- Ningún microservicio debe registrar el token completo en texto plano en sus logs o sistemas de monitoreo.
- Los datos personales retornados por Auth deben tratarse como información sensible.
---
## 7. Resumen del Flujo

```text
┌─────────────┐
│  Frontend   │
└──────┬──────┘
       │ Request + Cookie (jwt=...)
       ▼
┌───────────────────────┐
│ Microservicio         │
│ Consumidor            │
└─────────┬─────────────┘
          │ GET /internal/validar-sesion
          │ + Header Cookie
          ▼
┌───────────────────────┐
│        Auth           │
│ Introspección sesión  │
└─────────┬─────────────┘
          │
          ├── 200 → Perfil normalizado
          ├── 401 → Sesión inválida / expirada / revocada
          ├── 403 → Servicio no autorizado
          ├── 500 → Error interno de Auth
          └── 503 → Auth no disponible / timeout
          │
          ▼
┌───────────────────────┐
│ Microservicio         │
│ Consumidor            │
└─────────┬─────────────┘
          │ (Evalúa respuesta o Timeout)
          ▼
┌─────────────┐
│  Frontend   │
│ 200 / error │
└─────────────┘
```
## 8. Contrato Resumido

| Concepto | Definición Oficial |
|---|---|
| **Endpoint** | `GET /internal/validar-sesion` |
| **Cabecera Requerida** | `Cookie` conteniendo `jwt=...` |
| **Acceso** | Exclusivo Red Interna. No expuesto a Internet ni al Frontend. |
| **Respuesta `200 OK`** | Sesión válida. Utilizar identidad y perfil retornados por Auth. |
| **Respuesta `401`** | Token inválido, expirado, ausente, revocado o usuario inexistente/bloqueado. |
| **Respuesta `403`** | Servicio no autorizado para acceder al endpoint interno. |
| **Respuesta `500`** | Error interno de Auth. |
| **Timeout / Caída Auth** | Retornar `503 Service Unavailable` al Frontend. |
| **Validación JWT** | Delegada 100% a Auth. Los consumidores no deben realizar validación local. |
| **Regla de Identidad** | Ignorar IDs de identidad enviados por el Frontend; utilizar el `id_usuario` retornado por Auth. |
| **Regla de Rol** | Utilizar el rol vigente retornado por Auth para las decisiones de autorización. |
| **Revocación** | Auth debe rechazar sesiones cuyo `tokenVersion` no coincida con `token_version` vigente. |

---
