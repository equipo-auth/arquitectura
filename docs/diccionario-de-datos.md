# Diccionario de Datos - Módulo de Autenticación (`Auth Squad`)

## 1. Visión General
Este diccionario de datos describe las entidades, campos, tipos de datos, restricciones y reglas de negocio de la base de datos relacional de la aplicación `TicketU`. El esquema está implementado en **PostgreSQL** y administrado mediante **Prisma ORM**.

---

## 2. Convenciones Generales
* **Identificadores (PK):** Todos los registros utilizan `UUID` v4 generado automáticamente.
* **Manejo de Fechas:** Campos de tiempo en formato `Timestamptz` (Timestamp con zona horaria UTC).
* **Nomenclatura:** Nombres de tablas e índices en minúsculas en plural o Snake_case (mapeados mediante `@@map`).
* **Reglas de Borrado:** Las dependencias hacia los tokens y revocaciones aplican `ON DELETE CASCADE`.

---

## 3. Catálogo de Tablas

### 3.1 Tabla: `users`
* **Nombre Físico:** `users`
* **Descripción:** Almacena los datos de identidad, roles, jerarquía y estado de seguridad de los usuarios del sistema.

| Nombre del Campo | Tipo de Dato (PostgreSQL) | Nulo / Obligatorio | Llave | Valor por Defecto | Descripción y Reglas de Negocio |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `uuid` | `UUID` | **NOT NULL** | **PK** | `uuid()` | Identificador único universal del usuario. |
| `rut` | `VARCHAR(20)` | **NOT NULL** | **UK** | *Ninguno* | Rol Único Tributario del usuario. Debe ser único en todo el sistema. |
| `email` | `VARCHAR(255)` | **NOT NULL** | **UK** | *Ninguno* | Correo electrónico de acceso y notificaciones. Debe ser único. |
| `password_hash` | `VARCHAR(255)` | **NULLABLE** `(*)` | - | `NULL` | Hash de la contraseña del usuario (ej. bcrypt/argon2). `(*)` Es opcional/nulo (`String?`) para soportar la integración con Keycloak (SSO) y aquellos registros donde el servicio de autenticación no almacena la contraseña localmente. |
| `nombre` | `VARCHAR(150)` | **NOT NULL** | - | *Ninguno* | Nombre completo del usuario. |
| `rol` | `VARCHAR(50)` | **NOT NULL** | - | *Ninguno* | Rol de perfilamiento. Valores permitidos: `ADMIN`, `SUPERVISOR`, `AGENTE`, `CLIENTE`. |
| `token_version` | `INTEGER` | **NOT NULL** | - | `0` | Contador para invalidar JWTs emitidos previamente. Se incrementa al cerrar sesión globalmente o cambiar contraseña. |
| `cambio_obligatorio`| `BOOLEAN` | **NOT NULL** | - | `false` | Indica si el usuario debe cambiar su contraseña obligatoriamente en su próximo inicio de sesión. |
| `creado_por_id` | `UUID` | **NULLABLE** | **FK** | `NULL` | ID del usuario que creó a este usuario. Referencia autorreferencial `users(uuid)` para jerarquías. |
| `created_at` | `TIMESTAMPTZ` | **NOT NULL** | - | `now()` | Fecha y hora de creación del registro. |
| `updated_at` | `TIMESTAMPTZ` | **NOT NULL** | - | `now()` | Fecha y hora de la última actualización (actualizado automáticamente vía `@updatedAt`). |

---

### 3.2 Tabla: `password_reset_tokens`
* **Nombre Físico:** `password_reset_tokens`
* **Descripción:** Almacena los tokens temporales generados para la recuperación y restablecimiento de contraseña.

| Nombre del Campo | Tipo de Dato (PostgreSQL) | Nulo / Obligatorio | Llave | Valor por Defecto | Descripción y Reglas de Negocio |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | **NOT NULL** | **PK** | `uuid()` | Identificador único del registro de token. |
| `user_uuid` | `UUID` | **NOT NULL** | **FK** | *Ninguno* | ID del usuario solicitante. Clave foránea referenciada a `users(uuid)` con eliminación en cascada (`CASCADE`). |
| `token_hash` | `VARCHAR(255)` | **NOT NULL** | **UK** | *Ninguno* | Hash seguro del token enviado al usuario. Debe ser único. |
| `expires_at` | `TIMESTAMPTZ` | **NOT NULL** | - | *Ninguno* | Fecha y hora de caducidad del token. |
| `used_at` | `TIMESTAMPTZ` | **NULLABLE** | - | `NULL` | Fecha y hora de consumo del token. Si es `NULL`, el token aún no ha sido utilizado. |
| `created_at` | `TIMESTAMPTZ` | **NOT NULL** | - | `now()` | Fecha y hora de emisión del token. |

---

### 3.3 Tabla: `session_revocada`
* **Nombre Físico:** `session_revocada`
* **Descripción:** Registro de auditoría de revocaciones explícitas de sesiones o tokens ejecutadas por administradores o por el sistema de seguridad.

| Nombre del Campo | Tipo de Dato (PostgreSQL) | Nulo / Obligatorio | Llave | Valor por Defecto | Descripción y Reglas de Negocio |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | **NOT NULL** | **PK** | `uuid()` | Identificador único del evento de revocación. |
| `target_user_id` | `UUID` | **NOT NULL** | **FK** | *Ninguno* | ID del usuario cuya sesión o token fue revocado. Referencia a `users(uuid)` (`CASCADE`). |
| `revoked_by` | `UUID` | **NOT NULL** | **FK** | *Ninguno* | ID del usuario (ej. Administrador) que ordenó la revocación. Referencia a `users(uuid)` (`CASCADE`). |
| `reason` | `TEXT` | **NOT NULL** | - | *Ninguno* | Justificación o motivo textual por el cual se invalidó la sesión. |
| `revoked_at` | `TIMESTAMPTZ` | **NOT NULL** | - | `now()` | Fecha y hora exacta de la revocación. |

---

## 4. Matriz de Relaciones y Cardinalidad

| Tabla Origen | Campo Origen | Tabla Destino | Campo Destino | Tipo de Relación | Acción ON DELETE |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `users` | `creado_por_id` | `users` | `uuid` | **1 : N** (Autorreferencial) | No restricción directa |
| `password_reset_tokens` | `user_uuid` | `users` | `uuid` | **N : 1** | `CASCADE` |
| `session_revocada` | `target_user_id` | `users` | `uuid` | **N : 1** | `CASCADE` |
| `session_revocada` | `revoked_by` | `users` | `uuid` | **N : 1** | `CASCADE` |
