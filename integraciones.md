# Integraciones del módulo Auth

El módulo Auth entrega autenticación centralizada a los demás módulos y además consume/produce integraciones con sistemas externos del ecosistema TicketU.

| Integración | Tipo (A, B o C) | Módulo contraparte | Servicio, endpoint o tópico | Contrato (ruta en el repo) | Ítem en GitHub |
|---|---|---|---|---|---|
| I1 | B | Panel Organizador | GET /internal/validar-sesion | docs/CONTRATO_PANEL_AUTH.md | por agregar |
| I2 | C | Notificaciones | notificaciones.events -> auth.correo_auth (routing key: correo_auth) | CONTRATO_NOTIFICACIONES_AUTH.md | por agregar |