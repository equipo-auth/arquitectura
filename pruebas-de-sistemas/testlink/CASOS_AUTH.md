# Casos de Auth para crear y ejecutar en TestLink

**Fuente:** HU-AUTH-01 a HU-AUTH-04 (Historias de Usuario docente, páginas 5–6). Son **29 casos recomendados** para cobertura, no una cantidad exigida por rúbrica. **Ninguno ha sido ejecutado ni importado a tu TestLink.** Los campos exactos en JSON deben confirmarse contra Swagger.

En TestLink: selecciona proyecto TicketU, plan y build que te asignó el docente → Suite `Auth` → crea casos por historia → asigna pasos, precondición y resultado esperado → registra ejecuciones Pass/Fail/Blocked/Not Run. Guarda capturas y el `x-request-id` en cada fallo. Si no tienes plan/build/permisos, solicita habilitación.

| ID sugerido | Historia | Caso | Precondición | Pasos | Esperado | Restricciones |
|---|---|---|---|---|---|---|
| TC-REG-01 | HU-AUTH-01 | Registro student | Correo propio único, nombre y contraseña válidos | Crear student desde registro o POST /auth/register | 201, id/nombre/correo/rol; no clave | Manual: crea usuario |
| TC-REG-02 | HU-AUTH-01 | Registro organizer | Correo único propio, rol organizer | Registrar organizer | 201 y rol organizer | Manual: crea usuario |
| TC-REG-03 | HU-AUTH-01 | Nombre vacío o solo espacios | Correo propio único | Registrar con nombre vacío/espacios | 400; error de nombre | Manual |
| TC-REG-04 | HU-AUTH-01 | Correo mal formado | Correo sin @ | Intentar registro | 400; lista de errores | Manual |
| TC-REG-05 | HU-AUTH-01 | Contraseña de 7 caracteres | Correo único | Registrar con 7 caracteres | 400 | Manual |
| TC-REG-06 | HU-AUTH-01 | Contraseña sin letra o sin número | Correo único | Probar solamente letras y solamente dígitos | 400 ambas variantes | Manual |
| TC-REG-07 | HU-AUTH-01 | Rol fuera del conjunto | Correo único | Intentar registro con rol falso | 400 | Manual |
| TC-REG-08 | HU-AUTH-01 | Correo duplicado con capitalización diferente | Usuario propio ya registrado | Repetir correo cambiando mayúsculas | 409 | Manual |
| TC-REG-09 | HU-AUTH-01 | Múltiples datos incorrectos | Correo, nombre y clave inválidos | Enviar registro con varios errores | 400 con lista de TODOS los errores | Manual |
| TC-LOG-01 | HU-AUTH-02 | Login correcto | Usuario de prueba activo | Iniciar sesión con credenciales correctas | 200 y JWT en campo token | Manual |
| TC-LOG-02 | HU-AUTH-02 | Login sin campos | Ninguna | POST /auth/login {} | 400 | Smoke |
| TC-LOG-03 | HU-AUTH-02 | Correo inexistente | Correo ficticio no registrado | Iniciar sesión | 401 Credenciales inválidas | Manual |
| TC-LOG-04 | HU-AUTH-02 | Contraseña incorrecta | Cuenta propia activa | Iniciar sesión con clave errónea UNA vez | 401 Credenciales inválidas | Manual; evitar bloqueo |
| TC-LOG-05 | HU-AUTH-02 | Bloqueo tras cinco errores | Cuenta propia descartable + autorización | 5 fallos consecutivos y contraseña correcta | 403 y bloqueo 15 min | Manual, NO Runner |
| TC-LOG-06 | HU-AUTH-02 | Reinicio contador de intentos | Cuenta propia; antes de bloquearse | Fallar menos de 5; login correcto; fallar de nuevo | Contador reiniciado | Manual, autorizado |
| TC-LOG-07 | HU-AUTH-02 | JWT de ocho horas y claims | Login válido | Decodificar payload local sin publicar token | exp-iat 8 h; id, nombre, correo, rol | Manual |
| TC-LOG-08 | HU-AUTH-02 | Menú según rol | Sesión real | Abrir UI posterior a login | Nombre/rol y opciones visibles | UI manual |
| TC-ME-01 | HU-AUTH-03 | Perfil sin JWT | Ninguna | GET /auth/me sin autorización | 401 | Smoke |
| TC-ME-02 | HU-AUTH-03 | Perfil con token inválido/vencido | Token de prueba inválido | GET /auth/me con token falso | 401 | Manual |
| TC-ME-03 | HU-AUTH-03 | Perfil con JWT válido | JWT de usuario propio | GET /auth/me | 200 con id/nombre/correo/rol/fecha creación | Manual |
| TC-ME-04 | HU-AUTH-03 | Salir desde UI | Sesión propia iniciada | Pulsar Salir | Vuelve inicio; no sesión local | UI manual |
| TC-ME-05 | HU-AUTH-03 | 401 de otro servicio limpia sesión local | Sesión expirada | Navegar y observar respuesta 401 | UI cierra sesión local | UI manual |
| TC-ADM-01 | HU-AUTH-04 | Listar sin JWT | Ninguna | GET /auth/users | 401 | Smoke |
| TC-ADM-02 | HU-AUTH-04 | Student no puede administrar | JWT student propio | GET /auth/users | 403 | Manual |
| TC-ADM-03 | HU-AUTH-04 | Admin lista usuarios | Autorización docente + token admin | GET /auth/users | 200, lista | SOLO admin autorizado |
| TC-ADM-04 | HU-AUTH-04 | Admin crea usuario | Autorización docente; correo de prueba | POST /auth/users con rol permitido | 201 y nuevo usuario | SOLO admin autorizado |
| TC-ADM-05 | HU-AUTH-04 | Admin no crea rol inválido | Autorización docente | POST /auth/users rol inválido | 400 | SOLO admin autorizado |
| TC-ADM-06 | HU-AUTH-04 | Admin no duplica correo | Autorización docente; correo propio existente | POST /auth/users correo duplicado | 409 | SOLO admin autorizado |
| TC-ADM-07 | HU-AUTH-04 | Cuenta admin inicial | Autorización docente | Verificar bootstrap admin con docente | Admin configurable | SOLO docente |

## Modelo de ejecución en TestLink

- **ID:** TC-LOG-04; **Nombre:** Login con contraseña incorrecta.
- **Precondición:** cuenta propia activa, no bloqueada.
- **Pasos:** abrir login; introducir correo válido y contraseña incorrecta; pulsar Ingresar.
- **Resultado esperado:** 401 «Credenciales inválidas», no se crea sesión.
- **Resultado observado:** **rellenar tras probar**.
- **Estado:** Not Run, hasta que exista ejecución; luego Pass/Fail/Blocked según resultado.
- **Evidencia:** captura, fecha, código HTTP, `x-request-id`, identificador de ejecución, Mantis ID si procede.

**No confundir defectos con casos desactualizados.** La documentación describe lo que el TicketU docente debe hacer; compara contra su Swagger y la respuesta real. No uses la autenticación de nuestro TITEC Auth local para marcar estos casos como aprobados.
