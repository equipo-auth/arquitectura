# Auth TITEC — Workstation Windows / Frontend compartido

**Rama Auth entregada:** `equipo-auth/arquitectura`, `workstation`.
**Frontend oficial de Platform:** [`FWizav/FrontendTitec`](https://github.com/FWizav/FrontendTitec).
**Esta guía SOLO levanta Auth**, no el conjunto de microservicios.

## 1. Arquitectura que se evalúa

| Componente | Responsable | Dirección en navegador (QA local) |
|---|---|---|
| Frontend único compartido | Platform / `FWizav/FrontendTitec` | `http://localhost:3000` |
| Login de compradores | `FrontendTitec` | `http://localhost:3000/auth` |
| Login administrativo | `FrontendTitec` | `http://localhost:3000/auth/admin/login` |
| API Gateway | Platform | `http://localhost:8080` |
| Backend Auth | Equipo Auth | `http://localhost:10000` |
| Auth desde el Gateway y otros contenedores | Equipo Auth | `http://auth-service:3000` en `plataforma-eventos-net` |
| Keycloak / PostgreSQL / RabbitMQ | Infraestructura propia o compartida | `8081` / `5433` / `5672` (referenciales) |

**`frontend/` dentro de nuestro repositorio es una copia local de desarrollo**, publicada opcionalmente en `3001`. **No es la interfaz común de evaluación.** No levantar ambos frontends por defecto. `-InfraExistente` fuerza omitir la copia local incluso si olvidan `-SinFrontend`.

`FrontendTitec` ya tiene en `main` las rutas `/auth` y `/auth/admin/login`, pero el **responsable de Platform debe indicar qué rama/commit usará en evaluación**. Su `docker-compose.yml` publica `3000:3000` y levanta solo el frontend; no levanta los nueve backends. Este fix NO modifica ese repositorio.

## 2. Preflight Windows (PowerShell, Docker Desktop)

Abrir Windows PowerShell 5.1/7 en la raíz del repositorio Auth. Docker Desktop debe ejecutar contenedores Linux.

```powershell
git branch --show-current
# Esperado: workstation
docker info
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
docker network inspect plataforma-eventos-net
Test-Path .\backend\.env
Test-Path .\backend\private.pem
Test-Path .\backend\public.pem
```

**Secretos:** `backend/.env`, `private.pem` y `public.pem` son privados y no están en Git. Si `backend/.env` no existe en una instalación nueva, copiar `.env.example` sin sobrescribir nada:

```powershell
if (-not (Test-Path .\backend\.env)) {
    Copy-Item .\backend\.env.example .\backend\.env
}
notepad .\backend\.env
```

Usar credenciales **reales de esa workstation** para Keycloak, `INTERNAL_API_KEY` compartida, PostgreSQL y RabbitMQ. Si faltan **ambas** llaves RSA, y la instalación es realmente nueva, generar dentro de `backend` con Node.js 22+: `node .\tools\generar-llaves.mjs`. Si ya existe alguna llave, conservarla e investigar antes de crear otra.

En `backend/.env`, configurar `FRONTEND_URL` y `COMPRADOR_FRONTEND_URL` para el frontend común usado en esa máquina, típicamente `http://localhost:3000`. Auth los usa para enlaces de invitación y recuperación. **No enviar secretos por Discord ni subirlos a Git.**

Si un script descargado aparece bloqueado, solicitar autorización para ejecutar scripts locales: `Unblock-File .\backend\tools\iniciar-integracion.ps1` y `Set-ExecutionPolicy -Scope Process RemoteSigned`. No alterar políticas globales ni evitar restricciones corporativas.

## 3. Infraestructura existente: no reiniciar servicios ajenos

El parámetro `-InfraExistente` comprueba que estén en marcha `ticketu-db`, `ticketu-keycloak` y `ticketu-rabbitmq`, y que puedan conectarse por `plataforma-eventos-net`. **No los construye, reinicia ni elimina.** El Gateway es del equipo Platform y también debe estar operativo.

```powershell
.\backend\tools\iniciar-integracion.ps1 -InfraExistente -SinFrontend
```

Si la **base Auth está completamente vacía** y el ayudante autoriza inicializar esquema y usuarios QA, solamente entonces:

```powershell
.\backend\tools\iniciar-integracion.ps1 -InfraExistente -InicializarEsquema -UsuariosQa -SinFrontend
```

Si el esquema ya está creado y faltan únicamente las cuentas de prueba:

```powershell
.\backend\tools\iniciar-integracion.ps1 -InfraExistente -UsuariosQa -SinFrontend
```

No ejecutar `-InicializarEsquema` sobre una base existente sin autorización, ni `QA_SEED_RESET=SI` sin aprobación (puede invalidar sesiones).

**Problema observado en Windows:** si aparece `ticketu-rabbitmq existe pero esta detenido`, NO ejecutar `docker compose up` de todo el entorno ni eliminar contenedores. Inspeccionar propietario:

```powershell
docker ps -a --format 'table {{.Names}}\t{{.Status}}'
$x = docker inspect ticketu-rabbitmq | ConvertFrom-Json
$x[0].Config.Labels.'com.docker.compose.project'
```

Si corresponde a la instalación propia y hay autorización, el responsable puede ejecutar `docker start ticketu-rabbitmq`. Si pertenece a otra célula, debe resolverlo el administrador de la workstation. No duplicar broker ni publicar contraseñas.

## 4. Frontend único de Platform

Si el frontend compartido YA está arriba, **no ejecutar Compose nuevamente**. Comprobar:

```powershell
curl.exe -I http://localhost:3000/auth
curl.exe -I http://localhost:3000/auth/admin/login
```

Si aún no existe, **el responsable de Platform** debe instalar o levantar [`FWizav/FrontendTitec`](https://github.com/FWizav/FrontendTitec), con la rama/commit oficialmente acordados, desde su propia carpeta y Compose. Su variable pública `NEXT_PUBLIC_GATEWAY_URL` debe apuntar a la dirección del Gateway **accesible desde el navegador** (por ejemplo, `http://localhost:8080` cuando ambos servicios se exponen en esa misma workstation). En la build de Next.js también revisar `NEXT_PUBLIC_AUTH_API_URL` si se usa para Auth, y la configuración del destino Panel. Estas variables se incorporan en tiempo de build.

El Dockerfile de `FrontendTitec/main` **no expone actualmente todas las variables de redirección como argumentos de compilación**: la existencia de `/organizador` no certifica una redirección automática a un Panel externo. Esto se debe coordinar con Platform. **No alterar `FWizav/FrontendTitec` desde el repositorio Auth.**

## 5. Comprobaciones tras instalar

```powershell
.\backend\tools\verificar-integracion.ps1 -FrontendComun
py -3 .\backend\tools\probar-9-usuarios-qa.py
```

El verificador comprueba Keycloak, health de Auth, health del Gateway y que `3000/auth` y `3000/auth/admin/login` respondan HTTP 200. **No simula un login real**. El segundo script comprueba 9 cuentas QA, cookies y roles cuando el seed está preparado; si Python está instalado como `python`, usar ese comando en lugar de `py -3`.

En navegador: entrar a `http://localhost:3000/auth` con `comprador1@ticketu.test`, y a `http://localhost:3000/auth/admin/login` con `organizador1@ticketu.test` (clave QA `TicketuQA2026!`, exclusivamente de pruebas). Comprobar cookie `jwt` HttpOnly, el rol esperado y el consumo de introspección desde el backend de Panel.

La prueba de AU1 exige respuesta real del **backend** consumidor de Panel (organizador 200, comprador 403, sin cookie 401). BR1 exige la publicación `auth.events / recuperacion_cuenta` y el retorno `notificaciones.events / correo_auth` (un error SMTP no demuestra correo entregado). GW1 **sigue pendiente** de otro backend consumidor real vía Gateway y contrato acordado: la mera publicación de `/provision` no lo acredita.

## 6. Límites y precauciones

- No usar `backend/tools/iniciar-todo.ps1` en workstation compartida; es para desarrollo aislado.
- No ejecutar `docker compose down -v`, `docker system prune`, `--remove-orphans` ni recrear contenedores de otros grupos.
- No compartir `.env`, `private.pem`, cookies JWT ni `INTERNAL_API_KEY` por canales comunes.
- No levantar la copia de `frontend/` de nuestro Auth en paralelo al frontend común salvo que se autorice una QA local separada.
- El script PowerShell no certifica Windows hasta que se ejecute en una workstation real; enviar logs sanitizados ante errores.
