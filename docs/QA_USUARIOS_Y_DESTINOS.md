# TITEC Auth — 9 usuarios de integración y destinos por rol

> **Exclusivamente QA local, activación MANUAL.** No crea cuentas al arrancar Docker, no se ejecuta en producción y no almacena contraseñas en GitHub. **Tampoco reemplaza el primer acceso por invitación de los usuarios reales:** en estas 9 identidades sintéticas se habilita el login de QA sin pasar por correo, y se invalidan los enlaces de activación en curso.

## Usuarios de prueba (se crean al ejecutar el perfil de QA)

| Rol interno | Correos | Sistema fuente |
|---|---|---|
| COMPRADOR (`rol=usuario` para otros equipos) | `comprador1@ticketu.test`, `comprador2@ticketu.test`, `comprador3@ticketu.test` | PostgreSQL (Prisma) |
| STAFF (`rol=staff`) | `staff1@ticketu.test`, `staff2@ticketu.test`, `staff3@ticketu.test` | Keycloak, espejo PostgreSQL |
| ORGANIZADOR (`rol=organizador`) | `organizador1@ticketu.test`, `organizador2@ticketu.test`, `organizador3@ticketu.test` | Keycloak, espejo PostgreSQL |

El mismo secreto de QA que proporcionas en la terminal se asigna a las 9 cuentas. El script verifica al final los nueve logins (HTTP 200, cookie JWT y rol de sesión) usando el backend real. Debe tener **12 o más caracteres, letras y números**, no guardarse en el repositorio. Si repites el script, comprueba la identidad existente y *restablece* esa contraseña de QA para las nueve cuentas, revocando sesiones anteriores. Solo actúa sobre esos nueve correos exactos y sus RUT sintéticos correspondientes. No toca otros usuarios.

## Preparación de Docker

1. El contenedor `ticketu-db` debe tener el esquema Prisma, Keycloak `ticketu-keycloak` debe tener importado el realm `ticketu-realm` con roles `STAFF` y `ORGANIZADOR`, y Auth `ticketu-auth-service` debe responder en **10000**. Asegura la red compartida `plataforma-eventos-net`. Mantén los puertos oficiales y un solo RabbitMQ.
2. Configura en `backend/.env` (sin subirlo) las variables habituales `KEYCLOAK_ADMIN_USER`, `KEYCLOAK_ADMIN_PASSWORD`, `KEYCLOAK_REALM`, `INTERNAL_API_KEY`, `KEYCLOAK_CLIENT_SECRET`; usa credenciales de un entorno de pruebas.
3. Desde la raíz del repo:

```bash
cd backend
# No muestres la clave por pantalla y no la agregues al historial de bash/zsh:
export QA_SEED_PASSWORD="$(python3 -c 'import getpass; print(getpass.getpass("Contraseña QA (12+ caracteres): "))')"
export QA_SEED_ALLOW=SI

docker compose -f docker-compose.auth-service.yml --profile qa run --rm --build qa-seed
unset QA_SEED_PASSWORD QA_SEED_ALLOW
```

En **Windows con PowerShell** (en `backend/`, usando el mismo Dockerfile/Compose), la carga opcional se puede lanzar así:

```powershell
$segura = Read-Host 'Contraseña QA (12+ caracteres)' -AsSecureString
$env:QA_SEED_PASSWORD = [System.Net.NetworkCredential]::new('', $segura).Password
$env:QA_SEED_ALLOW = 'SI'
docker compose -f docker-compose.auth-service.yml --profile qa run --rm --build qa-seed
Remove-Item Env:QA_SEED_PASSWORD, Env:QA_SEED_ALLOW
```

Solo crea las cuentas en la instancia de BD/Keycloak **a la que apunta el Docker Compose de ese equipo**; no viajan automáticamente a otras instalaciones.

**No uses `docker compose up` con el perfil `qa`**: el contenedor de pruebas se usa exclusivamente con `run --rm`, cuando Auth/BD/Keycloak ya están activos. No borres volúmenes ni reinicies bases para repetir el script.

Alternativa sin perfil Docker, si ejecutas Node.js local con `backend/node_modules` instalado y `backend/.env` apunta a localhost:

```bash
cd backend
export QA_SEED_PASSWORD="$(python3 -c 'import getpass; print(getpass.getpass("Contraseña QA: "))')"
export QA_SEED_ALLOW=SI
node tools/crear-usuarios-qa.cjs
unset QA_SEED_PASSWORD QA_SEED_ALLOW
```

Si una cuenta ya existe con RUT/rol/nombre incompatibles, el script se detiene sin sobrescribir esa identidad. Si existe una cuenta en Keycloak de QA pero la sincronización falló, diagnostica con `docker logs ticketu-auth-service`. Para ambos grupos administrativos, el script utiliza el endpoint interno `/api/auth/provision` con `INTERNAL_API_KEY` **solo desde la red de Docker**.

**Comprobar los usuarios:**

```bash
cd backend
# Ejecuta Prisma Studio si tu backend/.env se conecta a PostgreSQL (local en 5433)
npx prisma studio
```

En `users` deben aparecer 9 nuevos registros y los administrativos deben tener `password_hash=NULL`, `cambio_obligatorio=false` y `activo=true`. Para QA se cancelan las invitaciones pendientes y se invalidan los tokens de invitación de estas nueve identidades. En Keycloak debe verse el RUT en `attributes.rut` y exactamente un realm role para cada usuario administrativo.

## Redirección **después del login en el navegador**

**Estas son URLs de FRONTEND accesibles desde el navegador, NO direcciones de servicios Docker ni puertos internos del Gateway.**

| Cuenta | Ruta de respaldo en front común 3001 | Variable opcional para frontend del otro equipo |
|---|---|---|
| STAFF | `/checkin` | `NEXT_PUBLIC_CHECKIN_APP_URL` |
| ORGANIZADOR | `/organizador` | `NEXT_PUBLIC_ORGANIZADOR_APP_URL` |
| COMPRADOR | `/entradas` | `NEXT_PUBLIC_ENTRADAS_APP_URL` |

En `frontend/.env.local` (ejecución con `npm run dev -- -p 3001`), especifica el puerto **web** que realmente publicó cada equipo:

```dotenv
NEXT_PUBLIC_AUTH_API_URL=http://localhost:10000
# Ejemplos: reemplazar los marcadores por los puertos WEB acordados
NEXT_PUBLIC_CHECKIN_APP_URL=http://localhost:PUERTO_WEB_CHECKIN/
NEXT_PUBLIC_ORGANIZADOR_APP_URL=http://localhost:5173/
NEXT_PUBLIC_ENTRADAS_APP_URL=http://localhost:PUERTO_WEB_ENTRADAS/
```

Por compatibilidad, si no defines `NEXT_PUBLIC_ORGANIZADOR_APP_URL`, sigue leyendo el antiguo `NEXT_PUBLIC_PANEL_URL`; si este solo apuntaba a la portada del propio front, cae en `/organizador`. Si no conoces los puertos o los tres módulos están integrados en el front común Next.js, deja vacías las tres variables; se usará `http://localhost:3001/checkin`, `/organizador`, `/entradas`. En el código del proyecto esas páginas son **placeholders** salvo que los otros equipos las hayan implementado. En nuestra documentación anterior, Entradas utiliza host **3000 para su backend**; **no** asumir que es la URL web. El Panel tiene una referencia local a 5173, pero confirma el puerto con el equipo.

Si ejecutas el front en **Docker**, configura esas tres variables en el entorno desde el que haces el build y recompila:

```bash
cd frontend
export NEXT_PUBLIC_CHECKIN_APP_URL='http://localhost:PUERTO_WEB_CHECKIN/'
export NEXT_PUBLIC_ORGANIZADOR_APP_URL='http://localhost:5173/'
export NEXT_PUBLIC_ENTRADAS_APP_URL='http://localhost:PUERTO_WEB_ENTRADAS/'
docker compose up -d --build
```

Estas variables `NEXT_PUBLIC_*` se incrustan en `next build`; cambiarlas en un contenedor ya construido no actualiza el navegador. La URL debe ser alcanzable desde **el equipo donde se abre el navegador**, por ejemplo no usar `localhost` si se accede desde el PC de otra persona. Para redes remotas usar HTTPS o un mismo gateway/dominio.

**Compatibilidad:** compradores conservan el parámetro `?volver=` solo para rutas del mismo origen, como pidió Pagos. Si no está, redirigen a Entradas. Los roles administrativos se leen después de `/api/auth/validar-sesion` y se redirigen únicamente si corresponden a STAFF u ORGANIZADOR; `ADMIN` no existe. Las URL inválidas o con protocolo inseguro se rechazan en favor de las rutas locales.

**Sesión entre aplicaciones:** navegar a otro puerto **no inicia sesión automáticamente en otro backend**. Las cookies HTTP están ligadas a host/dominio, ruta y atributos, no al puerto; funciona en `localhost` entre varios puertos solo si todos usan el mismo hostname y validan la cookie `jwt` con el Auth correspondiente. No equivale a SSO entre dominios ni transfiere un JWT a una app distinta. En Check-in y Entradas deben consumir `/internal/validar-sesion` con cookie y `x-api-key` desde su backend (o Gateway autorizado), no colocar la API Key en JavaScript. CORS, SameSite y `Secure` requieren configuración apropiada en integración. **No pasar JWT por querystring.**

## Validaciones recomendadas

1. Crear las 9 cuentas con el perfil QA y comprobar 9 registros en PostgreSQL y 6 en Keycloak.
2. Desde `http://localhost:3001/auth` hacer login con los tres compradores. Deben navegar a la web de Entradas o fallback `/entradas`.
3. Desde `http://localhost:3001/admin/login` iniciar sesión con los tres STAFF. Deben navegar a la web Check-in o fallback `/checkin`.
4. Repetir con los tres ORGANIZADOR. Deben navegar al Panel o fallback `/organizador`.
5. Repetir con rol incorrecto en portal equivocado: Auth debe seguir rechazando acceso; no cambiar seguridad para facilitar demos.
6. Verificar desde Check-in y Entradas que la cookie puede validarse a través de la integración REAL, no solo que carga la página.
7. Ejecutar `cd frontend && npm run test && npm run build` y `cd backend && npm test -- --runInBand && npm run build`.

## Alcance de QA

Este mecanismo de cuentas precargadas es **optativo** y está aislado del seed habitual `prisma/seed.js` (que intencionalmente continúa deshabilitado). No debe activarse en producción ni en un ambiente con identidades reales. Nunca enviar contraseñas o API Keys a canales públicos; generar una clave de QA por entorno y compartirla por vía privada.
