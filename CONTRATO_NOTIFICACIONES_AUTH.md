# CONTRATO_NOTIFICACIONES_AUTH.md 
**Equipo Proveedor:** Autenticación

**Equipo Consumidor Principal:** Notificaciones

**Tecnología:** RabbitMQ

---
## 1. Propósito

Este documento define la estructura de los mensajes que el microservicio de Autenticación (Auth) enviará a RabbitMQ cuando ocurran cosas importantes. 

El objetivo principal es avisarle a los otros microservicios (especialmente Notificaciones) para que puedan reaccionar. Auth **no se responsabiliza** de armar el diseño de los correos ni de enviarlos al usuario final; nuestra responsabilidad termina al dejar el mensaje en el canal de RabbitMQ.

---

## 2. Eventos Definidos (Fase 1 - Acordado)

### 2.1 Recuperación de Contraseña

Este evento ocurre cuando un usuario solicita recuperar su clave y Auth le genera exitosamente un código temporal. 

*   **Buzón/Canal sugerido en RabbitMQ:** `auth_events`
*   **Etiqueta del mensaje sugerida:** `auth.clave.recuperar`

**Contenido del Mensaje (Acuerdo Vigente):**

| Campo | Tipo | Obligatorio | Descripción |
| :--- | :--- | :--- | :--- |
| `email` | string | Sí | Correo electrónico del usuario que solicita la recuperación. |
| `url_recuperacion` | string | Sí | URL completa que el usuario debe pinchar. Ya incluye el token temporal. |

**Ejemplo del JSON que enviará Auth:**
```json
{
  "email": "juan.perez@ejemplo.cl",
  "url_recuperacion": "[https://frontend.titec.cl/reset?token=abc123xyz789](https://frontend.titec.cl/reset?token=abc123xyz789)"
}
```
**Lo que debe hacer el equipo de Notificaciones:**

1. Estar leyendo los mensajes que llegan con esa etiqueta en RabbitMQ.
2. Sacar el `email` y la `url_recuperacion` del JSON.
3. Armar la plantilla visual del correo y ponerle el link.
4. Enviar el correo electrónico usando su propio sistema.

---

## 3. Reglas Generales

* **Formato:** Todos los mensajes se envían simplemente como texto en formato `JSON`.
* **Qué pasa si hay fallos (Reintentos):** Auth solo envía el mensaje a RabbitMQ y sigue trabajando (no se queda esperando respuesta). Si el microservicio de Notificaciones justo está apagado, ellos deben configurar RabbitMQ para que el mensaje no se pierda y se intente enviar de nuevo más tarde.
* **Mensajes repetidos:** Por cortes de internet o fallos de red, a veces Auth podría llegar a enviar el mismo mensaje dos veces. El equipo de Notificaciones debe tener cuidado de no mandarle el mismo correo repetido a la misma persona.

---

## 4. Pendientes a acordar con el equipo de Notificaciones

- [ ] Confirmar infraestructura: nombre definitivo del canal (Exchange) y etiquetas a usar en RabbitMQ.
- [ ] Informar y coordinar nuevo requerimiento (Creación de Staff): Auth ahora gestionará la creación manual de cuentas Staff. Acordar la estructura del JSON para que Notificaciones pueda enviarles su clave temporal y link de acceso.
- [ ] Confirmar diferenciadores en el JSON: Acordar cómo distinguir los distintos tipos de avisos (ej. agregando un campo `"rol"` o `"evento"`) para que sepan exactamente qué plantilla de correo usar ante estos nuevos cambios.
- [ ] Confirmar si requieren que emitamos un evento cuando se registre un Usuario normal (para correos de bienvenida/confirmación).
