# Evaluación 3 — GW1: servicio provisto por Auth

## Servicio verificado

- Método: POST
- Ruta: /api/auth/provision
- Acceso: mediante API Gateway compartido.
- Autenticación interna: cabecera privada x-api-key.
- Contrato: backend/docs/swagger.yaml.
- Función: sincronizar una identidad STAFF u ORGANIZADOR
  existente en Keycloak hacia PostgreSQL de Auth.

## Resultados locales

| Prueba | Resultado |
|---|---|
| Cuenta STAFF existente con clave válida | HTTP 201 |
| Petición sin x-api-key | HTTP 403 |
| Correo con formato inválido y clave válida | HTTP 400 |
| Registro de la ruta en API Gateway | Confirmado |

Para una cuenta ya provisionada, Auth responde:
- creada: false
- invitacionProgramada: false

## Alcance y limitaciones

Las pruebas demuestran el servicio proveedor real y su
acceso por Gateway.

No constituyen, por sí solas, evidencia de que otro
microservicio lo consuma.

Pendiente: documentar un consumidor real y su acuerdo
de integración o acreditar la condición de excepción
que permita la pauta de Evaluación 3.

No se registran tokens, cookies ni claves privadas.
