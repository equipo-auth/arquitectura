# Evaluación 3 — BR1: Auth y Notificaciones

## Ambiente
Prueba de integración local del 18/11/2026.
Servicios reales: Auth, API Gateway, RabbitMQ y Notificaciones.

## Flujo probado

1. POST /api/auth/recover mediante el Gateway.
2. Auth publica en auth.events con routing key recuperacion_cuenta.
3. Notificaciones consume el evento e intenta enviar el correo.
4. Notificaciones publica el resultado correo_auth.
5. Auth recibe y registra el resultado.

## Evidencia observada

| Verificación | Resultado |
|---|---|
| POST /api/auth/recover | HTTP 200 |
| Publicación Auth | publicado=true |
| Exchange de salida | auth.events |
| Routing key | recuperacion_cuenta |
| Respuesta recibida por Auth | correo_auth |
| Estado informado | error |
| Motivo | SMTP sin credenciales configuradas |
| Consumidor notificaciones.recuperacion_cuenta | 1 |
| Consumidor auth.correo_auth | 1 |
| Mensajes pendientes en ambas colas | 0 |

Auth registró la publicación y recepción de la respuesta
en la misma ventana temporal para comprador1@ticketu.test.

La respuesta recibida no incluyó un message_id de correlación.
Por ello, la relación entre ambas trazas se sustenta en
la cuenta QA, el flujo y la ventana temporal observada.

## Interpretación

Se observó comunicación bidireccional por RabbitMQ
entre Auth y Notificaciones.

El correo no fue entregado porque Notificaciones
informó que SMTP_USER y SMTP_PASS no estaban configuradas,
tras tres intentos fallidos.

No se afirma entrega SMTP exitosa.

## Limitaciones

- Esta evidencia corresponde al ambiente local.
- Debe reproducirse en la workstation universitaria.
- No se modificaron los servicios de otros equipos.
- No se adjuntan contraseñas, JWT ni URL con tokens.
