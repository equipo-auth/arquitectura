# Auth TITEC - workstation Windows (PowerShell + Docker Desktop)

Esta guia es para **Windows**, no Linux. Docker Desktop ejecuta contenedores Linux; PowerShell 5.1 o 7 administra Docker Compose.

**Alcance:** instalar SOLO Auth. No reiniciar, eliminar ni recrear el Gateway, RabbitMQ u otras celulas. Prohibidos `docker compose down -v`, `--remove-orphans` y `docker system prune` en el ambiente compartido.

## 1. Obtener la rama exacta

Desde PowerShell en el repositorio clonado:

```powershell
git branch --show-current # workstation
docker info
docker network inspect plataforma-eventos-net
docker ps --format 'table {{.Names}}\\t{{.Status}}\\t{{.Ports}}'
```

La entrega es `https://github.com/equipo-auth/arquitectura/tree/workstation`. Confirmar puertos, nombres y credenciales con plataforma; un contenedor en marcha no implica que la base Auth este inicializada.

## 2. Preparar configuracion privada

```powershell
if (-not (Test-Path .\\backend\\.env)) { Copy-Item .\\backend\\.env.example .\\backend\\.env }
notepad .\\backend\\.env
Test-Path .\\backend\\private.pem
Test-Path .\\backend\\public.pem
```

Configurar `KEYCLOAK_ADMIN_PASSWORD`, `KEYCLOAK_CLIENT_SECRET`, `INTERNAL_API_KEY`, DB y RabbitMQ para **esta workstation**. Los secretos y llaves RSA **NO** se suben a GitHub. Si faltan AMBAS llaves RSA en un despliegue nuevo, crear desde `backend`: `node .\\tools\\generar-llaves.mjs` (Node 22+). Si ya existe alguna llave, revisar antes de generar, para no invalidar sesiones.

## 3. Arranque sin alterar infraestructura compartida

El parametro `-InfraExistente` evita `docker compose up` de PostgreSQL/Keycloak/RabbitMQ y valida su disponibilidad. Desde la raiz:

```powershell
.\\backend\\tools\\iniciar-integracion.ps1 -InfraExistente -SinFrontend
```

Si la base Auth es nueva y el ayudante autoriza crear el esquema y las nueve cuentas QA:

```powershell
.\\backend\\tools\\iniciar-integracion.ps1 -InfraExistente -InicializarEsquema -UsuariosQa -SinFrontend
```

Si el esquema existe y faltan solo usuarios QA: `-InfraExistente -UsuariosQa -SinFrontend` (sin `-InicializarEsquema`). No ejecutar `QA_SEED_RESET=SI` sin autorizacion. Para un ambiente completamente aislado de desarrollo se puede omitir `-InfraExistente`, pero no en la workstation compartida.

Si Windows bloquea scripts PowerShell, coordinar con el ayudante la politica permitida; `Set-ExecutionPolicy -Scope Process RemoteSigned` solo modifica esa sesion, no la politica global.

## 4. Frontend Auth y puerto 3001

Notificaciones u otro frontend podria usar el puerto 3001. Comprobar si esta libre antes de iniciar. Para evitar colision, el puerto del frontend Auth se puede cambiar a `3010` con `AUTH_FRONT_PORT`, **sin reiniciar otros equipos**. Ajustar `FRONTEND_URL` y `COMPRADOR_FRONTEND_URL` en `backend/.env` al puerto real.

```powershell
$env:AUTH_FRONT_PORT = '3001'       # o 3010, si el 3001 esta ocupado
$env:NEXT_PUBLIC_GATEWAY_URL = 'http://localhost:8080'
$env:NEXT_PUBLIC_AUTH_API_URL = 'http://localhost:8080'
$env:NEXT_PUBLIC_ORGANIZADOR_APP_URL = 'http://localhost:5173' # adaptar
$env:NEXT_PUBLIC_ENTRADAS_APP_URL = 'http://localhost:3000'    # adaptar
docker compose -p frontend -f .\\frontend\\docker-compose.yml up -d --build front
```

Las variables `NEXT_PUBLIC_*` se incorporan durante el build. No colocar claves internas en variables publicas. Consultar con cada equipo los puertos efectivamente utilizados en la workstation.

## 5. Verificacion en PowerShell

En PowerShell 5.1 `curl` puede ser alias de `Invoke-WebRequest`; usar **`curl.exe`**:

```powershell
curl.exe -s -o NUL -w 'Auth HTTP %{http_code}\\n' http://localhost:10000/api/health
curl.exe -s -o NUL -w 'Gateway HTTP %{http_code}\\n' http://localhost:8080/health
curl.exe -s -o NUL -w 'Sin sesion HTTP %{http_code}\\n' http://localhost:8080/api/auth/validar-sesion
curl.exe -s -o NUL -w 'Provision sin clave HTTP %{http_code}\\n' -X POST http://localhost:8080/api/auth/provision
py -3 .\\backend\\tools\\probar-9-usuarios-qa.py
.\\backend\\tools\\verificar-integracion.ps1
```

Esperado: 200, 200, 401, 403 y 9/9 QA si el seed se ejecuta. Si no existe `py`, usar `python` con Python 3 instalado.

**Para la evaluacion:** AU1 requiere un backend consumidor real (Panel); BR1 requiere logs de eventos y respuesta mas `audit_logs`. **GW1 sigue PENDIENTE:** `/provision` es una operacion no JWT, pero aun no se demostro un consumidor real a traves del Gateway. Se retiro la pantalla experimental "Mis notificaciones" porque no corresponde al alcance funcional de Auth. No declarar GW1 logrado sin evidencia de otro modulo, contrato y trazas.
