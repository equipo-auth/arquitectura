# Contrato de interfaz: Microservicios Core ↔ Auth

**Versión:** 1.1 — propuesta de actualización (28/10/2026)  
**Equipo proveedor:** Autenticación (Auth)  
**Equipos consumidores:** Todo microservicio de TITEC/TicketU que necesite autenticar a un usuario.  
**Protocolo:** HTTP/REST, comunicación interna entre backends.  
**Referencia de infraestructura:** [Backend compartido del Platform Team](https://github.com/FWizav/backendticketU).

---

## 1. Propósito y arquitectura

Auth es la **autoridad central de autenticación**: emite el JWT, comprueba su autenticidad y vigencia, detecta sesiones revocadas y entrega un perfil unificado del usuario.

Los microservicios consumidores **no validan, decodifican ni firman el JWT por su cuenta para autenticar usuarios**. Cuando necesitan una identidad autenticada, llaman al endpoint interno de Auth. Cada consumidor es responsable de **autorizar** las operaciones de su propio dominio usando el perfil devuelto.

### 1.1. Separación de componentes

| Componente | Responsabilidad | Ubicación |
|---|---|---|
| Frontend | Envía solicitudes con la cookie de sesión | Navegador |
| API Gateway compartido | Enruta peticiones públicas conservando el path | Infraestructura del Platform Team |
| Backend consumidor | Consulta a Auth y aplica permisos de negocio | Microservicio de cada equipo |
| Backend Auth | Autentica, valida JWT y devuelve identidad vigente | Proyecto `auth/backend/` |
| PostgreSQL y Keycloak de Auth | Mantienen identidades y credenciales según el tipo de usuario | Dependencias administradas por Auth |

El código, la configuración y los documentos que administra el equipo Auth permanecen en su proyecto `auth/`. **No se duplica el API Gateway compartido dentro de Auth.**

### 1.2. Rutas públicas e internas

| Origen → destino | Ruta | Tipo |
|---|---|---|
| Navegador → Gateway → Auth | `/api/auth/*` | Pública según las reglas de cada endpoint |
| Navegador → Gateway → microservicio consumidor | `/api/<modulo>/*` | Pública o protegida según el módulo |
| Backend consumidor → Auth | `GET /internal/validar-sesion` | **Privada, servidor a servidor** |

El Gateway compartido enruta `/api/*` al servicio de destino **sin modificar el path**. La ruta `/internal/validar-sesion` **no se expone mediante el Gateway público**: se invoca directamente por la red interna.

### 1.3. Flujo general

```text
1. Usuario inicia sesión en Auth y recibe la cookie jwt.
2. Frontend envía una solicitud a un módulo por el API Gateway.
3. El backend consumidor recibe la cookie original.
4. Antes de ejecutar una operación protegida, el consumidor consulta a Auth:
      GET /internal/validar-sesion
      Cookie: jwt=<JWT_ORIGINAL>
      x-api-key: <CLAVE_INTERNA>
5. Auth valida la clave del servicio y el JWT; consulta la identidad vigente.
6. Auth devuelve HTTP 200 y el perfil, o un error de autenticación/disponibilidad.
7. El consumidor autoriza la acción de su dominio y responde al frontend.
```

---

## 2. Sesión JWT

### 2.1. Emisión y transporte

Auth emite un JWT firmado con **RS256** y lo entrega al navegador mediante una cookie llamada **`jwt`**.

| Propiedad | Política |
|---|---|
| Nombre de cookie | `jwt` |
| `HttpOnly` | Obligatorio |
| `SameSite` | `Strict` |
| `Secure` | Obligatorio en producción con HTTPS; en desarrollo HTTP local se configura según entorno |
| Duración para compradores | 2 horas |
| Duración para Staff/Organizadores | 12 horas |

El JWT **no debe exponerse al código JavaScript del frontend** ni enviarse en parámetros de URL. En solicitudes entre distintos orígenes, el frontend deberá utilizar `credentials: 'include'` y la infraestructura deberá permitir credenciales únicamente para orígenes autorizados. El proxy debe conservar las cabeceras `Cookie` y `Set-Cookie`.

### 2.2. Claims internos (solo referencia técnica)

```json
{
  "sub": "3f1e2c1a-4b8d-4a2e-9c3f-7d1e2f9b2d4a",
  "rol": "COMPRADOR",
  "token_version": 1,
  "iat": 1793220000,
  "exp": 1793227200
}
```

- `sub`: UUID del usuario.
- `rol`: rol interno al momento de emitir el token.
- `token_version`: versión de sesión usada para revocación.
- `iat` / `exp`: emisión y vencimiento del JWT.

**Los consumidores no deben interpretar estos claims.** La identidad y el rol contractual que pueden utilizar se obtienen exclusivamente de la respuesta de introspección.

---

## 3. Operación: validar sesión

### 3.1. Endpoint

```http
GET /internal/validar-sesion
```

**Acceso:** solamente desde backends autorizados en la red interna. No debe invocarse directamente desde el navegador.

### 3.2. Petición y cabeceras obligatorias

| Header | Obligatorio | Descripción |
|---|---|---|
| `Cookie` | Sí | Cabecera original que contiene `jwt=<TOKEN>` emitido por Auth |
| `x-api-key` | Sí | Clave secreta compartida para autorizar consultas internas en el entorno |

```http
GET /internal/validar-sesion HTTP/1.1
Host: auth-service:10000
Cookie: jwt=<JWT_ORIGINAL_EMITIDO_POR_AUTH>
x-api-key: <CLAVE_INTERNA_COMPARTIDA>
```

En esta versión el JWT se transporta **únicamente mediante la cookie `jwt`**. No se acepta `Authorization: Bearer`, el campo `token_sesion` en el cuerpo, ni un JWT generado por otro servicio. Si un backend llama a otro en representación del usuario, debe conservar y reenviar la cookie original conforme al contrato entre esos backends.

El hostname `auth-service:10000` es ilustrativo para una red Docker; cada ambiente debe configurar una dirección interna real y alcanzable. **No se debe llamar a `/internal/validar-sesion` a través de `http://gateway:8080/api/auth/...`.**

### 3.3. Validaciones realizadas por Auth

1. Comprueba que la `x-api-key` coincida con la configurada en Auth.
2. Extrae el JWT desde la cookie `jwt`.
3. Verifica firma **RS256**, estructura y vencimiento (`exp`).
4. Comprueba que el usuario exista, esté activo y tenga una cuenta habilitada para iniciar sesión.
5. Compara `token_version` del JWT con la versión vigente en la base de identidad de Auth.
6. Devuelve el perfil disponible y el rol vigente normalizado desde Auth, sin confiar en el rol histórico del JWT como autorización definitiva.

Los consumidores **no deben** acceder directamente a las bases de datos de Auth ni a la administración de Keycloak.

### 3.4. Respuesta exitosa: `200 OK`

```http
HTTP/1.1 200 OK
Content-Type: application/json
Cache-Control: no-store
```

```json
{
  "valido": true,
  "usuario": {
    "id_usuario": "3f1e2c1a-4b8d-4a2e-9c3f-7d1e2f9b2d4a",
    "nombre_completo": "Camila Pérez",
    "rut": "12.345.678-5",
    "correo_electronico": "camila@example.com",
    "rol": "organizador"
  }
}
```

| Campo | Tipo | Descripción |
|---|---|---|
| `valido` | boolean | Siempre `true` en una respuesta `200` exitosa |
| `usuario.id_usuario` | UUID (string) | Identificador autenticado que debe utilizar el consumidor |
| `usuario.nombre_completo` | string | Nombre y apellidos |
| `usuario.rut` | string | RUT con puntos, guion y dígito verificador válido |
| `usuario.correo_electronico` | string | Correo electrónico |
| `usuario.rol` | string | `usuario`, `organizador` o `staff` |

**Formato oficial del RUT:** con puntos y guion, por ejemplo `12.345.678-5`. El dígito verificador `K` se representa en mayúscula. El servicio Auth es responsable de normalizar este dato antes de entregarlo. Los consumidores no deben suponer que se entrega sin separadores.

**Fuente de identidad:** `id_usuario` y `usuario.rol` devueltos en esta respuesta son los valores de referencia para la solicitud. No deben sustituirse por IDs, roles o correos suministrados por el frontend.

### 3.5. Respuestas de error

Formato del error del endpoint interno:

```json
{
  "valido": false,
  "codigo_http": 401,
  "error": "unauthorized",
  "mensaje": "Sesión ausente, inválida, expirada o revocada"
}
```

| HTTP | Significado | Acción exigida al consumidor |
|---|---|---|
| `200` | Sesión válida | Continuar; comprobar autorización del dominio |
| `401` | Cookie/JWT ausente, inválido, vencido, revocado o usuario inactivo | Detener la operación; devolver `401` al cliente |
| `403` | `x-api-key` ausente o incorrecta | Bloquear la operación; registrar error de configuración/autorización |
| `500` | Error interno de Auth | Detener la operación; informar error técnico sin revelar secretos |
| `503` | Auth declara indisponibilidad | Detener la operación; informar indisponibilidad temporal |

La ausencia de `x-api-key` es un error de autenticación **del servicio consumidor**, no una contraseña incorrecta del usuario. La ausencia de una sesión válida es `401`, no `403`.

---

## 4. Cuándo consultar a Auth

La introspección es obligatoria **por cada solicitud protegida que requiera identidad o rol**, antes de ejecutar su lógica de negocio. Esto incluye:

- Mutaciones autenticadas (`POST`, `PUT`, `PATCH`, `DELETE`).
- Lecturas privadas (`GET`) que muestran datos, recursos o historial de un usuario.
- Operaciones que dependen del rol o de los permisos del usuario.

**No se requiere introspección** para rutas públicas anónimas, recursos estáticos o navegación que no necesita identidad.

Una vez validada la sesión, el consumidor puede usar ese resultado durante **la misma petición**; no debe llamar a Auth por cada consulta SQL o por cada cambio de estado interno. No se permite reutilizar indefinidamente validaciones de peticiones anteriores: así se preserva la revocación de sesiones y los cambios de rol.

Auth proporciona **autenticación**; los consumidores implementan **autorización de negocio** y comprueban propiedad de recursos, permisos, estados y restricciones propios.

---

## 5. Clave interna compartida: `x-api-key`

En esta versión se utilizará **una única clave secreta por entorno** (desarrollo, integración o producción) entre Auth y los backends consumidores autorizados. **No se exige una clave distinta por microservicio.**

La clave se genera de forma aleatoria, se distribuye por un canal privado y se guarda exclusivamente en variables de entorno de los servidores. Nunca debe subirse a Git, enviarse al navegador ni incluirse en variables públicas.

Ejemplo en el backend Auth:

```dotenv
INTERNAL_API_KEY="<CLAVE_SECRETA_GENERADA_PARA_ESTE_ENTORNO>"
```

Ejemplo en el backend consumidor (el nombre local de la variable puede variar):

```dotenv
AUTH_INTERNAL_API_KEY="<MISMA_CLAVE_SECRETA_DEL_ENTORNO>"
AUTH_SERVICE_URL="http://auth-service:10000"
```

El consumidor toma su secreto del entorno y lo añade al header `x-api-key` **solamente al llamar a Auth desde su backend**. El frontend jamás debe conocerlo.

Auth rechazará con `403` una clave ausente o incorrecta. La clave compartida demuestra que quien consulta **conoce el secreto autorizado**, pero **no identifica individualmente a cada microservicio**. Por ello, la red privada, el control de acceso y el resguardo del secreto siguen siendo necesarios.

Si la clave se filtra, debe cambiarse en Auth y en todos los consumidores autorizados del mismo entorno, mediante una coordinación de despliegue.

---

## 6. Disponibilidad, timeouts y reintentos

### 6.1. Timeouts independientes

- **Gateway → backend público:** el Gateway compartido usa un timeout de proxy configurable (`PROXY_TIMEOUT_MS`, **5000 ms por defecto** en el repositorio de referencia). Ante un fallo de conexión/proxy devuelve normalmente `502`; si el servicio no está configurado, devuelve `503`.
- **Backend consumidor → Auth:** cada consumidor define un timeout de introspección. Se recomienda **1000 ms como valor inicial configurable**, que debe verificarse durante integración.

**No se establece un SLA garantizado de latencia para Auth en esta versión.** El timeout de un consumidor es una decisión de protección frente a esperas prolongadas, no una garantía de respuesta del proveedor.

### 6.2. Política de fallo seguro (*fail-secure*)

Si Auth no responde, vence el timeout, la conexión falla o se produce un error técnico:

1. El consumidor **no debe dar por válida la sesión**.
2. Debe **cancelar la operación protegida**, sin modificar recursos ni ejecutar efectos de negocio.
3. Ante timeout o indisponibilidad, debe responder **HTTP 503 Service Unavailable** a su cliente, con un mensaje genérico.
4. La falla de la consulta no implica que el proceso de todos los microservicios deba detenerse. Las rutas públicas pueden continuar funcionando.

**Reintentos:** no realizar reintentos automáticos por defecto en la integración inicial. Nunca reintentar automáticamente por un `401` o `403`. Una futura política de reintentos de la consulta interna deberá ser acotada y mantenerse dentro de un timeout total. Las operaciones de negocio con efectos no deben repetirse automáticamente como consecuencia de un fallo de introspección.

Si Auth vuelve a estar disponible, el usuario puede volver a solicitar la operación; si su sesión no ha vencido ni sido revocada, no necesita iniciar sesión otra vez.

---

## 7. Seguridad y responsabilidades

### 7.1. Responsabilidades de Auth

- Emitir y verificar JWT de acuerdo con la política de sesión.
- Controlar vigencia, revocación, estado de cuenta y rol normalizado.
- Proteger `/internal/validar-sesion` con red privada y `x-api-key`.
- Entregar `Cache-Control: no-store` y el perfil contractual establecido.
- Proteger las credenciales y datos personales en su propia infraestructura.

### 7.2. Responsabilidades de los consumidores

- Enviar la cookie original y la `x-api-key` en cada introspección requerida.
- Configurar de manera segura la URL interna de Auth y el secreto compartido.
- Utilizar únicamente `id_usuario` y `rol` obtenidos de Auth para identificar y autorizar al usuario.
- Aplicar las reglas de negocio de su propio dominio.
- Respetar timeouts y política *fail-secure*.
- No registrar en logs las cookies completas, JWT, claves internas, contraseñas o enlaces temporales con tokens.

### 7.3. Seguridad del despliegue

`/internal/validar-sesion` debe estar disponible solo mediante una red privada de servicios. El API Gateway público no debe exponer ese endpoint. En producción las comunicaciones que transporten credenciales deben estar protegidas por canales cifrados; la cookie `Secure` exige HTTPS.

Las solicitudes autenticadas con cookie también requieren medidas adecuadas contra CSRF, además de `SameSite=Strict`. Deben mantenerse las configuraciones correctas de dominio, CORS y reenvío de cookies.

---

## 8. Pruebas mínimas de integración

Todo consumidor de una operación protegida debe verificar:

1. Con cookie válida y clave interna correcta, Auth responde `200` y devuelve todos los campos del perfil.
2. Sin cookie o con JWT inválido/expirado, Auth responde `401` y la operación no se ejecuta.
3. Sin `x-api-key` o con una clave incorrecta, Auth responde `403` y la operación no se ejecuta.
4. Cuando Auth está caído o excede el timeout, el consumidor devuelve `503` sin ejecutar la operación protegida.
5. Un cambio de versión de sesión o deshabilitación de cuenta invalida la sesión anterior según las reglas de Auth.
6. El RUT se entrega con puntos y guion y el rol se entrega normalizado.
7. Ni el frontend ni los logs exponen el JWT completo o la API Key.

Ejemplo de diagnóstico local para backends autorizados:

```bash
curl -i http://localhost:10000/internal/validar-sesion \
  -H 'Cookie: jwt=<JWT_REAL>' \
  -H 'x-api-key: <CLAVE_INTERNA_REAL>'
```

En Docker, reemplazar `localhost:10000` por la URL interna alcanzable del servicio Auth. Este endpoint no debe ser llamado por JavaScript del navegador.

---

## 9. Versionado y cambios

Los nombres de rutas, el transporte por cookie, la exigencia de `x-api-key`, los códigos de error y los campos/roles de la respuesta forman parte del contrato. Cualquier cambio incompatible exige una nueva versión, comunicación previa y coordinación con los consumidores.

Las comunicaciones asíncronas y los contratos de eventos se mantienen **fuera del alcance** de este documento; no se modifican por esta actualización.

### Cambios frente a la versión anterior

1. Se formaliza `x-api-key` obligatoria y **una clave compartida por entorno**.
2. Se diferencia la ruta pública del Gateway de la consulta privada directa a Auth.
3. Se mantiene **solo** la cookie `jwt` como transporte contractual.
4. Se precisan los claims internos reales sin convertirlos en dependencia de los consumidores.
5. Se define explícitamente el RUT con puntos y guion.
6. Se recomienda un timeout configurable de 1000 ms para introspección, sin establecer SLA.
7. Se formalizan los fallos seguros y la ausencia de reintentos automáticos por defecto.
8. Se exige validar cada solicitud protegida, sin consultar Auth por cada paso interno.

**Pendientes para declarar la versión vigente:** comprobar RUT formateado en la implementación y los datos existentes; confirmar URL interna y conectividad según el despliegue; distribuir el secreto de forma segura; ejecutar pruebas de integración; comunicar la nueva versión a los equipos.
