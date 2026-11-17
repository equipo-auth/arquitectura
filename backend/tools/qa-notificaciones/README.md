# QA de integración — Auth ↔ RabbitMQ ↔ Notificaciones

Herramientas de **desarrollo local** para comprobar el flujo real de invitación de usuarios `STAFF` / `ORGANIZADOR` de TITEC. No alteran el código de Auth ni publican eventos sintéticos en RabbitMQ: crean una cuenta nueva en Keycloak y dejan que **Auth** programe y publique la invitación.

```text
01_crear_usuarios.py
  └─ Crea STAFF/ORGANIZADOR en Keycloak (realm ticketu-realm)
      └─ Auth /api/auth/provision → PostgreSQL + outbox
          └─ Auth publica auth.events / cuenta_staff
              └─ Notificaciones consume e intenta enviar el correo
                  └─ Notificaciones publica notificaciones.events / correo_auth
                      └─ Auth registra ENTREGADO / REBOTADO
```

**Importante:** intercambiar mensajes correctamente no prueba que el correo llegue a un buzón ni que el usuario haya cambiado su contraseña. Esas comprobaciones requieren SMTP real, un correo autorizado y el frontend `/crear-clave`.

## Requisitos

- Python 3 y Docker CLI. No requiere instalar paquetes con `pip`.
- Ejecutar en Docker **local de desarrollo** con autorización de la persona responsable de Auth; nunca contra producción.
- Contenedores locales: `ticketu-db`, `ticketu-keycloak`, `ticketu-auth-service`, `ticketu-rabbitmq` y `notificaciones-notificaciones-1`.
- Auth en `127.0.0.1:10000`; Keycloak en `127.0.0.1:8081`; realm `ticketu-realm`; `NODE_ENV=development`.
- `backend/.env` con `KEYCLOAK_ADMIN_USER`, `KEYCLOAK_ADMIN_PASSWORD` e `INTERNAL_API_KEY` configuradas para ese entorno. **No subir ni compartir el `.env`** con el equipo Notificaciones.
- En Keycloak debe existir el realm role `STAFF` (o `ORGANIZADOR`) y admitirse el atributo de usuario `rut`.

Desde la raíz del repositorio `arquitectura/`, comprobar infraestructura:

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}'
curl -fsS http://127.0.0.1:10000/api/health
curl -fsS http://127.0.0.1:8081/realms/ticketu-realm/.well-known/openid-configuration > /dev/null
```

Si Keycloak, RabbitMQ o PostgreSQL están apagados, **arranca los contenedores existentes**. No ejecutar `docker compose down -v` ni borrar volúmenes para estas pruebas.

## Uso — tres terminales

Todos los comandos siguientes se ejecutan desde la raíz del repositorio.

### Terminal 1: monitor (solo lectura)

```bash
python3 backend/tools/qa-notificaciones/02_monitor_eventos.py
```

Muestra los logs relacionados con `cuenta_staff` y `correo_auth`. No consume mensajes de RabbitMQ ni modifica usuarios o colas. Detener con `Ctrl+C`.

Para observar también los últimos 10 minutos:

```bash
python3 backend/tools/qa-notificaciones/02_monitor_eventos.py --since 10
```

### Terminal 2: crear un STAFF temporal

```bash
python3 backend/tools/qa-notificaciones/01_crear_usuarios.py --env-file backend/.env
```

Solo pregunta **nombre**, **apellido**, **correo** (opcional; Enter genera uno ficticio `nombre.apellido.xxxxxx@ticketu.test`) y una **confirmación final**. Genera automáticamente RUT con dígito verificador válido. El rol por defecto es `STAFF`; también acepta `ORGANIZADOR`.

Modo no interactivo (solo en entorno QA autorizado):

```bash
python3 backend/tools/qa-notificaciones/01_crear_usuarios.py \
  --env-file backend/.env \
  --nombre Claudio \
  --apellido Perez \
  --rol STAFF \
  --confirmar
```

Opcionalmente se puede añadir `--correo DIRECCION_CONTROLADA_POR_EL_EQUIPO` para una prueba con buzón real **solo si tienes permiso de usarlo**. Si SMTP está activo, podría enviarse una invitación. Nunca utilizar correos de terceros sin autorización.

El script **no establece contraseñas**. Agrega un usuario nuevo al grupo de trazabilidad Keycloak `TITEC_NOTIF_QA_...`, solicita `POST /api/auth/provision` y deja que el worker genere el token y publique `cuenta_staff`. No modifica las nueve cuentas QA del seed y no desactiva `cambio_obligatorio`.

### Terminal 3: listar y eliminar lo creado

```bash
python3 backend/tools/qa-notificaciones/03_limpiar_usuarios.py --list
```

Al finalizar la prueba:

```bash
python3 backend/tools/qa-notificaciones/03_limpiar_usuarios.py \
  --env-file backend/.env \
  --delete
```

El programa muestra las cuentas del kit y exige escribir exactamente `ELIMINAR N`, con N igual al número pendiente. Para cada cuenta verifica **UUID, correo, RUT, nombre, rol, registro local y membresía del grupo exclusivo** antes de borrar usuario Keycloak, espejo PostgreSQL y grupo. Los tokens y la invitación vinculados a ese usuario se eliminan por cascada; los registros de auditoría permanecen.

**No borra usuarios preexistentes, las nueve cuentas QA del seed, colas, servicios ni volúmenes.** Si la cuenta se creó parcialmente y no tiene su marca de grupo, el borrador se niega a eliminarla: requiere revisión manual.

## Verificar RabbitMQ

El monitor de arriba **lee logs**, no actúa como consumidor RabbitMQ. Para comprobar colas y consumidores:

```bash
docker exec ticketu-rabbitmq rabbitmqctl list_queues \
  -p ticketu name consumers messages_ready messages_unacknowledged
```

Se esperan consumidores activos para `notificaciones.cuenta_staff` y `auth.correo_auth`.

Con SMTP sin configurar, el resultado normal es:

```text
[+] AUTH publicó cuenta_staff en RabbitMQ
[!] AUTH recibió error SMTP desde Notificaciones; la respuesta RabbitMQ sí llegó
```

También puede verse en logs de Auth:

```text
[CORREO_AUTH][REBOTADO] ... estado_envio=error ... SMTP no configurado
```

Esto prueba **publicación → consumo → respuesta**; no significa que se haya entregado un mensaje de correo. Cuando SMTP esté configurado, comprobar `estado_envio=exitoso` y recepción real en el buzón.

Las colas `qa.auth.staff` y `qa.auth.recuperacion` son de observación y pueden acumular mensajes con cero consumidores; este kit no las vacía.

## Resultado observado el 17-11-2026

Se comprobó en Docker local:

- Alta de un STAFF temporal con RUT ficticio y role `STAFF` en Keycloak.
- Provisionamiento correcto en Auth, creación de outbox y publicación `auth.events` / `cuenta_staff`.
- Consumo por Notificaciones y respuesta `notificaciones.events` / `correo_auth` recibida por Auth como `REBOTADO`, porque faltaban `SMTP_USER` y `SMTP_PASS`.
- Tras reiniciar Notificaciones, su cola pasó de **0 consumidores y 1 mensaje pendiente** a **1 consumidor y 0 pendientes**. Esto indica un problema de recuperación del consumidor después de una interrupción de RabbitMQ; el equipo Notificaciones debe revisar la reconexión automática.
- Limpieza correcta del usuario de prueba en Keycloak, PostgreSQL y el grupo de trazabilidad, sin fallos reportados.

**Pendientes compartidos:** envío SMTP y llegada al buzón, apertura de `/crear-clave`, actualización de contraseña, inicio de sesión y uso único del token.

## Seguridad y datos temporales

- Las cuentas son temporales **por finalidad**, pero **persisten** en Keycloak y PostgreSQL hasta ejecutar la limpieza del programa 3.
- El estado de las pruebas se almacena fuera del repositorio en `~/.local/state/titec-notificaciones-qa-v2/registro.json` con permisos restringidos; no almacena contraseñas ni tokens. Hay que limpiar con el **mismo usuario Linux** que creó la cuenta para conservar el registro.
- No subir: `.env`, credenciales, llaves `.pem`, JWT, URL completas con tokens, logs sensibles ni el archivo local de estado.
- Solo usar con contenedores locales previstos y `NODE_ENV=development`. No ejecutar en producción ni sobre una base compartida de usuarios reales.
- Los scripts anteriores a esta versión podían dejar usuarios huérfanos sin grupo de trazabilidad. La limpieza actual **no los adopta ni los borra automáticamente**.
- Si el equipo Notificaciones no tiene acceso administrativo a Auth/Keycloak, el responsable de Auth ejecuta creación/limpieza mientras el equipo Notificaciones observa los logs y comprueba SMTP.
- No ejecutar `crear-usuarios-qa.cjs` para probar invitaciones nuevas: ese seed prepara nueve cuentas con login directo y desactiva su primer cambio obligatorio.

## Archivos

| Archivo | Función |
|---|---|
| `01_crear_usuarios.py` | Crear un usuario STAFF/ORGANIZADOR de prueba y provisionarlo en Auth. |
| `02_monitor_eventos.py` | Mostrar los mensajes de Auth y Notificaciones, en paralelo y sin consumir RabbitMQ. |
| `03_limpiar_usuarios.py` | Listar y eliminar solo usuarios creados y marcados por este kit. |
| `titec_qa_comun.py` | Funciones de Keycloak, HTTP, PostgreSQL y registro local. |

Validación de sintaxis, sin tocar usuarios ni Docker:

```bash
python3 -m compileall -q backend/tools/qa-notificaciones
```

No se requieren dependencias adicionales.
