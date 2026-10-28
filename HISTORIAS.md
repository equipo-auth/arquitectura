# Equipo 2: Autenticación (Auth)

## Miembros del Equipo

| Nombre | Rol |
| :--- | :--- |
| BENJAMÍN DAVID ACEVEDO JORQUERA | Frontend |
| RICARDO ANDRES GIL OTALVAREZ | Integración |
| DIEGO ALEXANDER PEÑA GUTIÉRREZ | QA/Master |
| NATANIEL ENRIQUE RIQUELME VERGARA | Backend/BD |

---

## Épica del microservicio
Como plataforma, necesitamos un microservicio de autenticación desacoplado que permita a compradores registrarse e iniciar sesión de forma segura, y a organizadores y staff (provisionados manualmente por administración) acceder a paneles de gestión con controles de seguridad reforzados. 

Para garantizar la integridad de las credenciales, la trazabilidad de los accesos, la resistencia a ataques de fuerza bruta y enumeración, y la emisión de tokens de identidad que las demás células del sistema puedan verificar de forma autónoma, con la capacidad de revocar el acceso de una cuenta de forma inmediata cuando sea necesario.

---

## Reglas de Seguridad
* **Contraseñas:** hash Bcrypt.
* **Identificadores:** UUID v4.
* **Tokens:** JWT firmado con RS256, entregado vía cookie `HttpOnly; Secure; SameSite=Strict`.
* **Roles y expiración:** 
  * Comprador (auto-registro, JWT 2h)
  * Organizador (lo provisiona el Administrador de Plataforma, JWT 12h)
  * Staff (lo provisiona el Administrador de Plataforma, JWT 12h).
* **Revocación:** campo `token_version` en base de datos. Se incrementa al cambiar la clave o al ser revocado por un rol superior, invalidando de inmediato todos los JWT anteriores.
* **Rate limiting:** 5 intentos fallidos (login comprador), 3 intentos fallidos (login administrativo), ventana de 15 minutos.

---

## Historias de Usuario: Frontend

### HU-F1: Registro de Comprador
* **Historia:** Como visitante no registrado, quiero crear una cuenta con mis datos personales y una contraseña, para poder comprar entradas a eventos en la plataforma.
* **Microservicio dueño:** Auth (Frontend)
* **Depende de:** Auth (Backend)

**Criterios de Aceptación:**
* **Escenario: RUT con dígito verificador inválido:** dado un RUT con dígito verificador inválido cuando intento enviar el formulario entonces se bloquea el envío sin realizar petición HTTP al backend
* **Escenario: Email con formato inválido:** dado un email con formato inválido cuando intento enviar el formulario entonces se bloquea el envío antes de contactar al backend
* **Escenario: Envío seguro de credenciales:** dado un formulario válido cuando presiono "Registrarme" entonces el password se envía por HTTPS y no se almacena en el estado global de la aplicación
* **Escenario: Manejo de error por duplicidad:** dado un error de duplicidad (RUT o email) cuando se recibe la respuesta de error del servidor entonces se muestra un mensaje genérico sin indicar qué campo colisionó

**Definición de Terminado (equipo):**
- [ ] PR revisado
- [ ] pruebas unitarias
- [ ] linter ok
- [ ] API documentada

**Definición de Terminado (proyecto):**
- [ ] pruebas de contrato ok
- [ ] desplegado en integración
- [ ] docs centrales al día

---

### HU-F2: Login de Comprador
* **Historia:** Como usuario registrado, quiero iniciar sesión con mi email y contraseña, para poder acceder a mi cuenta y realizar compras.
* **Microservicio dueño:** Auth (Frontend)
* **Depende de:** Auth (Backend)

**Criterios de Aceptación:**
* **Escenario: Credenciales incorrectas:** dado credenciales incorrectas cuando el backend responde HTTP 401 entonces se muestra únicamente el mensaje "Credenciales inválidas"
* **Escenario: Manejo de sesión invisible:** dado un login exitoso cuando el backend responde con la cookie de sesión entonces el frontend no lee ni almacena el JWT manualmente
* **Escenario: Bloqueo por demasiados intentos:** dado que el backend responde HTTP 429 cuando ocurre el límite de intentos fallidos entonces se deshabilita el botón de envío y se muestra un mensaje de espera

**Definición de Terminado (equipo):**
- [ ] PR revisado
- [ ] pruebas unitarias
- [ ] linter ok
- [ ] API documentada

**Definición de Terminado (proyecto):**
- [ ] pruebas de contrato ok
- [ ] desplegado en integración
- [ ] docs centrales al día

---

### HU-F3: Pantalla de Login Administrativo
* **Historia:** Como organizador o staff, quiero acceder a una pantalla de login diferenciada de la de compradores (/admin/login), para autenticarme de forma segura antes de ir a mi sistema de gestión.
* **Microservicio dueño:** Auth (Frontend)
* **Depende de:** Auth (Backend)

**Criterios de Aceptación:**
* **Escenario: Carga exclusiva del formulario:** dado que un usuario navega a /admin/login cuando la ruta carga entonces solo se despliega el formulario de acceso administrativo
* **Escenario: Intento con rol incorrecto:** dado un intento de login en /admin/login (el frontend envía `admin: true` a `POST /api/auth/login`) con una cuenta rol "comprador" y credenciales válidas cuando se valida en el backend entonces responde 403 Forbidden y se rechaza el acceso en la vista. Si las credenciales son incorrectas responde 401, sin revelar el rol.
* **Escenario: Redirección posterior al login:** dado un login exitoso cuando el backend responde con la cookie de sesión entonces se redirige al módulo correspondiente: ORGANIZADOR → `/organizador`, STAFF → `/checkin`
* **Escenario: Intercepción por Primer Inicio (Nuevo):** dado un login de Staff/Organizador con credenciales válidas cuando el backend informa que la cuenta requiere cambio de clave (`primer_inicio=true`) (HTTP 403 con `primer_inicio: true` y `url: /crear-clave?token=...`) entonces el frontend retiene la redirección al panel y despliega obligatoriamente la vista de "Crear contraseña" (`/crear-clave`).

**Definición de Terminado (equipo):**
- [ ] PR revisado
- [ ] pruebas unitarias
- [ ] linter ok
- [ ] API documentada

**Definición de Terminado (proyecto):**
- [ ] pruebas de contrato ok
- [ ] desplegado en integración
- [ ] docs centrales al día

---

### HU-F4: Recuperación de Contraseña
* **Historia:** Como usuario que olvidó su contraseña, quiero solicitar un restablecimiento vía correo, para recuperar el acceso a mi cuenta.
* **Microservicio dueño:** Auth (Frontend)
* **Depende de:** Auth (Backend)

**Criterios de Aceptación:**
* **Escenario: Solicitud genérica:** dado cualquier email ingresado cuando se envía la solicitud entonces se muestra siempre el mismo mensaje genérico de confirmación
* **Escenario: Validación local:** dado un enlace de restablecimiento válido cuando el usuario define su nueva clave entonces se valida en el frontend con la misma política de contraseñas del registro
* **Escenario: Enlace expirado:** dado un enlace expirado o ya usado cuando se accede a la ruta (`/restablecer` o `/crear-clave`) entonces el frontend lo valida con `POST /api/auth/validar-token` y muestra un error genérico sin indicar el motivo
* **Escenario: Confirmación de seguridad:** dado un cambio de clave exitoso cuando se confirma la acción entonces se informa al usuario que todas sus sesiones activas fueron cerradas por seguridad

**Definición de Terminado (equipo):**
- [ ] PR revisado
- [ ] pruebas unitarias
- [ ] linter ok
- [ ] API documentada

**Definición de Terminado (proyecto):**
- [ ] pruebas de contrato ok
- [ ] desplegado en integración
- [ ] docs centrales al día

---

## Historias de Usuario: Backend

### HU-B1: API de Registro
* **Historia:** Como sistema de autenticación, quiero registrar nuevos usuarios validando unicidad y encriptando su contraseña, para garantizar la integridad de las credenciales almacenadas.
* **Microservicio dueño:** Auth (Backend)
* **Depende de:** Ninguno

**Criterios de Aceptación:**
* **Escenario: Conflicto de unicidad:** dado un RUT o email ya existentes cuando se recibe la petición entonces responde 409 Conflict con mensaje genérico, sin especificar qué campo colisionó
* **Escenario: Generación de entidad:** dado un registro válido cuando se persiste entonces el ID generado es un UUID v4 y token_version se inicializa en 0
* **Escenario: Encriptación obligatoria:** dado cualquier registro exitoso cuando el password se persiste entonces se almacena únicamente el hash Bcrypt
* **Escenario: Serialización segura:** dado cualquier respuesta de este endpoint cuando se serializa el JSON entonces nunca incluye el campo password_hash

**Definición de Terminado (equipo):**
- [ ] PR revisado
- [ ] pruebas unitarias
- [ ] linter ok
- [ ] API documentada

**Definición de Terminado (proyecto):**
- [ ] pruebas de contrato ok
- [ ] desplegado en integración
- [ ] docs centrales al día

---

### HU-B2: API de Login
* **Historia:** Como sistema de autenticación, quiero validar credenciales y emitir un JWT firmado con RS256 vía cookie segura, con expiración según el rol, para habilitar sesiones autenticadas sin exponer el token al cliente.
* **Microservicio dueño:** Auth (Backend)
* **Depende de:** Infraestructura (Keycloak)

**Criterios de Aceptación:**
* **Escenario: Prevención de descubrimiento de cuentas:** dado un email inexistente o contraseña incorrecta cuando se procesa entonces responde 401 con el mismo mensaje y tiempo de respuesta en ambos casos
* **Escenario: Expiración por roles:** dado un login exitoso de Comprador, Organizador o Staff cuando se emite el JWT entonces expira en 2 horas para el comprador, y en 12 horas para los perfiles administrativos
* **Escenario: Seguridad del Token:** dado cualquier login exitoso cuando se arma el payload y se entrega entonces contiene exclusivamente sub, rol y token_version, entregado únicamente vía cookie HttpOnly; Secure; SameSite=Strict
* **Escenario: Bloqueo por intentos fallidos:** dado el control de intentos en una ventana de 15 minutos cuando se recibe el 6to intento (comprador) o el 4to (administrativo) entonces el sistema responde HTTP 429
* **Escenario: Intercepción de Primer Inicio:** dado un usuario administrativo que ingresa credenciales temporales válidas cuando Keycloak exige la acción requerida `UPDATE_PASSWORD` entonces Auth retiene la emisión de la cookie JWT y responde con un estado indicando al Frontend que debe redirigir a la vista de cambio de clave.

**Definición de Terminado (equipo):**
- [ ] PR revisado
- [ ] pruebas unitarias
- [ ] linter ok
- [ ] API documentada

**Definición de Terminado (proyecto):**
- [ ] pruebas de contrato ok
- [ ] desplegado en integración
- [ ] docs centrales al día

---

### HU-B3: API de Cierre de Sesión (Logout)
* **Historia:** Como sistema de autenticación, quiero un endpoint que destruya la cookie de sesión activa, para evitar que otra persona acceda a la cuenta si el usuario deja un dispositivo compartido.
* **Microservicio dueño:** Auth (Backend)
* **Depende de:** Ninguno

**Criterios de Aceptación:**
* **Escenario: Destrucción de sesión:** dado un usuario autenticado que envía la petición cuando se procesa entonces responde 200 OK e instruye al navegador a destruir la cookie

**Definición de Terminado (equipo):**
- [ ] PR revisado
- [ ] pruebas unitarias
- [ ] linter ok
- [ ] API documentada

**Definición de Terminado (proyecto):**
- [ ] pruebas de contrato ok
- [ ] desplegado en integración
- [ ] docs centrales al día

---

### HU-B4: API de Provisión de Cuentas (Organizador / Staff)
* **Historia:** Como servicio interno autorizado de la plataforma, quiero crear cuentas para el Staff y Organizadores, para proveerles acceso oficial al sistema sin que pasen por el registro público.
* **Microservicio dueño:** Auth (Backend)
* **Depende de:** Notificaciones (vía RabbitMQ) e Infraestructura (Keycloak)
* **Roles válidos en Auth:** `COMPRADOR`, `ORGANIZADOR`, `STAFF`. No existe rol `ADMIN`: la administración superior se hace manualmente en la consola de Keycloak.

**Criterios de Aceptación:**
* **Escenario: Acceso interno:** dado una llamada a `POST /api/auth/provision` cuando no incluye la cabecera `x-api-key` válida (`INTERNAL_API_KEY`) entonces responde 403 Forbidden.
* **Escenario: Orden BD → Keycloak → RabbitMQ:** dado un payload válido (`rut`, `email`, `nombre`, `rol` ORGANIZADOR|STAFF, `creado_por_id` opcional) cuando se procesa entonces Auth 1) guarda el usuario (email en minúsculas, sin contraseña, `cambio_obligatorio = true`) y su token de creación de clave dentro de una transacción; 2) crea el usuario en Keycloak con el realm role correspondiente y la acción requerida `UPDATE_PASSWORD`; 3) solo si ambos pasos fueron exitosos, publica el evento.
* **Escenario: Rollback:** dado que Keycloak falla cuando se intenta crear el usuario entonces la transacción de BD se revierte, no queda el usuario en Auth y no se publica ningún evento. Si el COMMIT falla tras crear en Keycloak, Auth elimina el usuario de Keycloak (compensación).
* **Escenario: Jerarquía:** dado un `creado_por_id` cuando no corresponde a un usuario ORGANIZADOR o STAFF existente entonces responde 403.
* **Escenario: Duplicidad:** dado un RUT o email ya registrado (en BD o en Keycloak) cuando se intenta provisionar entonces responde 409 y no se publica ningún evento.
* **Escenario: Enlace de creación de clave:** dado una cuenta creada cuando se genera el token entonces es de un solo uso, se guarda hasheado (SHA-256) y vence en 72 horas. El enlace es `{FRONTEND_URL}/crear-clave?token=...`.
* **Escenario: Delegación de Notificaciones:** dado una cuenta creada exitosamente cuando se completa la transacción entonces Auth publica el evento `cuenta_staff` (JSON plano) en el exchange `auth.events` con `email_destino` y `url`, según el Contrato Auth ↔ Notificaciones v1.0.
* **Escenario: Confirmación de envío:** dado que Notificaciones publica `correo_auth` en `notificaciones.events` cuando Auth la recibe entonces registra en logs `[CORREO_AUTH][ENTREGADO]` o `[CORREO_AUTH][REBOTADO]` (con `error_envio`).

**Definición de Terminado (equipo):**
- [ ] PR revisado
- [ ] pruebas unitarias
- [ ] linter ok
- [ ] API documentada

**Definición de Terminado (proyecto):**
- [ ] pruebas de contrato ok
- [ ] desplegado en integración
- [ ] docs centrales al día

---

### HU-B5: Recuperación de Contraseña (Backend)
* **Historia:** Como sistema de autenticación, quiero generar un token de restablecimiento de un solo uso y coordinar el envío con Notificaciones, para permitir la recuperación segura de acceso.
* **Microservicio dueño:** Auth (Backend)
* **Depende de:** Notificaciones (vía RabbitMQ)

**Criterios de Aceptación:**
* **Escenario: Solicitud ofuscada:** dado cualquier email recibido cuando se procesa la solicitud entonces siempre responde 200 OK, exista o no la cuenta
* **Escenario: Vigencia del token:** dado un token generado cuando se persiste entonces expira en 15 minutos, es de un solo uso y responde 401/410 si se reutiliza
* **Escenario: Publicación asíncrona de evento:** dado un token de recuperación generado exitosamente cuando se debe notificar al usuario entonces Auth publica el evento `recuperacion_cuenta` (JSON plano) en el exchange `auth.events` de RabbitMQ, enviando únicamente `Id_usuario`, `email_destino` y `url`, según el Contrato Auth ↔ Notificaciones v1.0 (Fire-and-Forget). La confirmación de envío llega por `correo_auth` en `notificaciones.events`.
* **Escenario: Invalidación de sesiones:** dado un cambio de clave exitoso cuando se confirma en base de datos entonces token_version se incrementa en +1, invalidando intencionalmente todas las sesiones activas previas

**Definición de Terminado (equipo):**
- [ ] PR revisado
- [ ] pruebas unitarias
- [ ] linter ok
- [ ] API documentada

**Definición de Terminado (proyecto):**
- [ ] pruebas de contrato ok
- [ ] desplegado en integración
- [ ] docs centrales al día

---

### HU-B6: Consulta Interna de Identidad
* **Historia:** Como microservicio interno (ej. Célula de entradas), quiero consultar el RUT y Nombre de un usuario mediante su UUID, para usar esos datos en mis propios procesos sin que Auth exponga datos sensibles en el JWT.
* **Microservicio dueño:** Auth (Backend)
* **Depende de:** Ninguno

**Criterios de Aceptación:**
* **Escenario: Bloqueo de red pública:** dado una petición desde la red pública de internet cuando se detecta en la ruta interna entonces se rechaza con HTTP 401/403
* **Escenario: UUID no encontrado:** dado un UUID inexistente cuando se consulta entonces responde HTTP 404 sin filtrar información
* **Escenario: Respuesta de minimización de datos:** dado una consulta válida desde la red interna cuando se responde entonces el DTO devuelto contiene únicamente RUT y Nombre

**Definición de Terminado (equipo):**
- [ ] PR revisado
- [ ] pruebas unitarias
- [ ] linter ok
- [ ] API documentada

**Definición de Terminado (proyecto):**
- [ ] pruebas de contrato ok
- [ ] desplegado en integración
- [ ] docs centrales al día

---

### HU-B7: Endpoint público JWKS
* **Historia:** Como célula consumidora del ecosistema, quiero obtener la llave pública vigente de Auth, para verificar la firma de los JWT de forma autónoma.
* **Microservicio dueño:** Auth (Backend)
* **Depende de:** Ninguno

**Criterios de Aceptación:**
* **Escenario: Respuesta estándar abierta:** dado GET /.well-known/jwks.json cuando se consulta entonces responde 200 OK con la llave pública en formato JWK, sin requerir autenticación
* **Escenario: Rotación de llaves:** dado que la llave privada rota cuando ocurre entonces el JWKS expone la llave nueva y la anterior durante un período de gracia
* **Escenario: Auditoría de llaves:** dado cualquier respuesta de este endpoint cuando se audita entonces no contiene material criptográfico privado

**Definición de Terminado (equipo):**
- [ ] PR revisado
- [ ] pruebas unitarias
- [ ] linter ok
- [ ] API documentada

**Definición de Terminado (proyecto):**
- [ ] pruebas de contrato ok
- [ ] desplegado en integración
- [ ] docs centrales al día

---

### HU-B8: Revocación Administrativa de Sesión ("Botón de Pánico")
* **Historia:** Como Administrador de Plataforma, quiero forzar la invalidación de las sesiones de una cuenta en el sistema, para cortar el acceso ante una cuenta comprometida sin esperar a que expire su JWT.
* **Microservicio dueño:** Auth (Backend)
* **Depende de:** Ninguno

**Criterios de Aceptación:**
* **Escenario: Control jerárquico:** dado un solicitante sin privilegios de administrador cuando lo intenta entonces responde 403 Forbidden
* **Escenario: Invalidación forzada:** dado una solicitud autorizada cuando se procesa entonces incrementa en +1 el token_version del usuario, haciendo que cualquier JWT anterior falle de inmediato al verificarse
* **Escenario: Separación de responsabilidades:** dado que este endpoint es de backend cuando se implementa entonces Auth solo expone la API y no es responsable de la interfaz gráfica

**Definición de Terminado (equipo):**
- [ ] PR revisado
- [ ] pruebas unitarias
- [ ] linter ok
- [ ] API documentada

**Definición de Terminado (proyecto):**
- [ ] pruebas de contrato ok
- [ ] desplegado en integración
- [ ] docs centrales al día

---

### HU-B9: API de Cambio de Clave Obligatorio (Primer Inicio)
* **Historia:** Como miembro del Staff u Organizador en su primer inicio de sesión, quiero poder establecer mi contraseña definitiva, para asegurar mi cuenta y obtener acceso total al sistema.
* **Microservicio dueño:** Auth (Backend)
* **Depende de:** Infraestructura (Keycloak) y Notificaciones (RabbitMQ)

**Criterios de Aceptación:**
* **Escenario: Actualización de credenciales:** dado un usuario con la acción requerida de cambio de clave (`UPDATE_PASSWORD`) que envía su nueva contraseña al endpoint `POST /api/auth/cambiar-clave` cuando el sistema la procesa entonces actualiza la contraseña directamente en Keycloak.
* **Escenario: Liberación de la cuenta:** dado un cambio de clave exitoso cuando Keycloak confirma la actualización entonces el backend elimina la restricción, permitiendo que el usuario reciba su cookie JWT final en su próximo intento de login.
* **Escenario: Notificación de seguridad:** dado que la contraseña fue actualizada cuando el proceso termina entonces Auth publica el evento `auth.staff.primer_inicio_completado` en RabbitMQ para informar al usuario que su cuenta está configurada.
* **Escenario: Seguridad de la nueva clave:** dado que se recibe una nueva contraseña cuando se intenta guardar entonces debe cumplir con las mismas políticas de seguridad exigidas en el registro público.

**Definición de Terminado (equipo):**
- [ ] PR revisado
- [ ] pruebas unitarias
- [ ] linter ok
- [ ] API documentada

**Definición de Terminado (proyecto):**
- [ ] pruebas de contrato ok
- [ ] desplegado en integración
- [ ] docs centrales al día
