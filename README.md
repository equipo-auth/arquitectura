# TITEC / TicketU — Microservicio de Autenticación

Microservicio Auth del proyecto TITEC. Gestiona el registro y las sesiones de compradores, así como la autenticación de personal de organización. Está desarrollado con **NestJS, Prisma/PostgreSQL, Keycloak y RabbitMQ**; la copia frontend del equipo utiliza **Next.js**, pero **la workstation integra el frontend común [`FWizav/FrontendTitec`](https://github.com/FWizav/FrontendTitec)**.

## Arquitectura y responsabilidades

- **COMPRADOR:** se registra e inicia sesión mediante Auth; la contraseña se almacena con bcrypt en PostgreSQL.
- **STAFF y ORGANIZADOR:** las cuentas se administran en Keycloak y se sincronizan a PostgreSQL. La contraseña no se duplica en la base de Auth.
- **JWT RS256:** Auth emite una cookie `jwt` HttpOnly y valida sesiones mediante un endpoint interno protegido. Los roles del contrato son `usuario`, `staff` y `organizador`.
- **Eventos:** Auth publica solicitudes a `auth.events` y consume confirmaciones desde `notificaciones.events` utilizando el RabbitMQ compartido.
- **API Gateway:** se utiliza el Gateway oficial de [FWizav/backendticketU](https://github.com/FWizav/backendticketU); no se mantiene otro Gateway en este repositorio.

## Inicio rápido y documentación

La guía de instalación en **Windows/workstation** es [`INSTALACION_WINDOWS.md`](INSTALACION_WINDOWS.md); para desarrollo Linux/macOS, API Gateway, pruebas y usuarios QA ver [backend/README.md](backend/README.md). No es necesario aplicar los antiguos archivos README de parches para ejecutar el servicio.

La estructura principal del repositorio es:

| Ruta | Contenido |
|---|---|
| `backend/` | API Auth NestJS, Prisma, infraestructura y herramientas de prueba |
| `frontend/` | Copia Next.js para QA local del equipo Auth; **no** es el frontend común de la workstation |
| `docs/` | Diagramas y documentación técnica |
| `HISTORIAS.md` | Historias de usuario y requisitos funcionales |
| `CONTRATO_INTEGRACION_AUTH.md` | Contrato HTTP de introspección con otros servicios |
| `CONTRATO_NOTIFICACIONES_AUTH.md` | Contrato de eventos con Notificaciones |

## Cuentas QA de desarrollo (contraseña pública de prueba)

**Solo para Docker local y datos ficticios.** Las nueve cuentas utilizan la misma contraseña
predeterminada: **`TicketuQA2026!`**. Son identidades de prueba, no credenciales
internas del sistema. No reutilizar esta clave en usuarios reales ni entornos públicos.

| Rol | Correos de prueba | Contraseña |
|---|---|---|
| COMPRADOR | `comprador1@ticketu.test`, `comprador2@ticketu.test`, `comprador3@ticketu.test` | `TicketuQA2026!` |
| STAFF | `staff1@ticketu.test`, `staff2@ticketu.test`, `staff3@ticketu.test` | `TicketuQA2026!` |
| ORGANIZADOR | `organizador1@ticketu.test`, `organizador2@ticketu.test`, `organizador3@ticketu.test` | `TicketuQA2026!` |

Las cuentas no se almacenan en Git: se crean en PostgreSQL y Keycloak mediante el seed
**manual**, descrito en [backend/README.md](backend/README.md). Si ya fueron creadas
con otra contraseña, ejecutar nuevamente el seed QA actualiza **solo** esas nueve
contraseñas e invalida sus sesiones previas.

## Estado de comprobación local — 16/11/2026

En el entorno Docker de desarrollo se comprobó:

- Auth en `localhost:10000` y el Gateway oficial en `localhost:8080`, ambos respondiendo HTTP 200 en sus rutas de salud.
- Resolución de `auth-service:10000` desde el Gateway y JWKS público servido a través de `/api/auth/.well-known/jwks.json`.
- Protección interna: `403` sin `x-api-key` y `401` con clave interna válida pero sin cookie JWT.
- **Nueve cuentas QA:** 3 compradores, 3 STAFF y 3 organizadores. Las 9 completaron login HTTP 200, recibieron cookie JWT y devolvieron perfil válido HTTP 200 con el rol esperado.
- Exchanges `auth.events` y `notificaciones.events`, con sus colas de QA y el binding de respuesta `correo_auth` en el broker compartido.

Estas pruebas **no** acreditan todavía entrega real de correos ni integración completa con Entradas, Panel o Pagos. Los usuarios QA viven en los volúmenes de PostgreSQL/Keycloak de ese entorno; no se incluyen en las imágenes ni se crean automáticamente al clonar el repositorio.

## Equipo

| Integrante | Función |
|---|---|
| Benjamín David Acevedo Jorquera | Frontend |
| Ricardo Andrés Gil Otalvarez | Integración |
| Diego Alexander Peña Gutiérrez | QA / Scrum Master |
| Nataniel Enrique Riquelme Vergara | Backend / Base de datos |

## Seguridad de desarrollo

No subir archivos `.env`, llaves `*.pem`, contraseñas **reales** ni cookies JWT. La única excepción documentada es la contraseña pública de las nueve cuentas ficticias `@ticketu.test` de desarrollo local. Se utiliza **una clave interna compartida por entorno** entre los backends autorizados; no se necesitan claves individuales por microservicio. Las credenciales de desarrollo no deben reutilizarse en producción ni exponerse a Internet.
