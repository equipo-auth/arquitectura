# Parche Auth/TITEC — inicialización automática de Keycloak y Docker

Versión del parche: 1.0 · noviembre 2026 · base: `equipo-auth/arquitectura` (rama `main` al preparar el paquete).

## Por qué fallaba el registro de compradores

`AuthService.register()` guarda compradores en PostgreSQL, pero **antes** llama a
`keycloakService.emailExists(email)` para evitar correos duplicados entre los roles.
Cuando en Keycloak solo existe `master`, la consulta del realm `ticketu-realm`
devuelve 404 y Auth muestra `503 No se pudo consultar Keycloak`.

**La responsabilidad del despliegue es de Auth.** Entradas no debe crear el realm manualmente
ni hablar con PostgreSQL o Keycloak para registrar compradores.

## Qué contiene el paquete

- `aplicar_parche.py`: modifica cinco archivos existentes de forma selectiva,
  se detiene si encuentra un formato desconocido y deja respaldos `.antes-parche.bak`.
- `backend/keycloak/import/ticketu-realm-realm.json`: inicializa el realm `ticketu-realm`,
  el cliente OIDC `ticketu-backend` y los roles `STAFF` y `ORGANIZADOR`.
  El secreto se resuelve con `${KEYCLOAK_CLIENT_SECRET}`; no hay secretos reales en el paquete.
- `backend/docker-compose.yml`: añade `--import-realm`, el volumen de importación,
  variables del administrador y del cliente y la red compartida a `db` y `keycloak`.
- `backend/Dockerfile` y `backend/docker-compose.auth-service.yml`: añaden un objetivo
  Prisma **optativo**, no ejecutado automáticamente en bases existentes.
- `frontend/Dockerfile` y `frontend/docker-compose.yml`: permiten pasar `NEXT_PUBLIC_*`
  al **build** Next.js. Así la UI local en Docker puede apuntar a `localhost:10000`
  cuando el script la compila para probar Auth en una sola máquina.
- `backend/tools/iniciar-integracion.{sh,ps1}`: arrancan infraestructura, verifican el
  realm y construyen Auth y el frontend; nunca ejecutan `down -v`.
- `backend/tools/verificar-integracion.{sh,ps1}`: validan respuestas HTTP.
- `backend/tools/generar-llaves.mjs`: opcional, para una copia nueva **sin** llaves RSA.

## 1. Aplicación en el repositorio ORIGINAL

1. Extraer **el contenido** del ZIP en la raíz del repositorio `arquitectura/`,
   conservando la estructura `backend/` y `frontend/`. El ZIP no contiene reemplazos
   directos de los archivos Compose existentes; los cambios se aplican con el script.
2. Revisar cambios sin escribir:

   ```bash
   python3 aplicar_parche.py --check
   ```

3. Aplicar:

   ```bash
   python3 aplicar_parche.py
   ```

   En Windows también vale `py -3 aplicar_parche.py` si Python está instalado.
   Antes de editar, el script verifica que todas las secciones coincidan con
   lo esperado; si no coinciden, **no escribe nada**. Los cinco archivos
   editados reciben respaldo al lado con extensión `.antes-parche.bak`.

4. Confirmar modificaciones:

   ```bash
   git status --short
   git diff -- backend/docker-compose.yml backend/docker-compose.auth-service.yml backend/Dockerfile frontend/Dockerfile frontend/docker-compose.yml
   ```

5. **No subir** `.env`, `private.pem`, `public.pem`, ni los respaldos `.bak`.
   Antes de hacer `git add`, usar rutas explícitas para seleccionar el parche.

El script no altera los endpoints, el código de negocio, `.env`, las llaves, ni los
volúmenes Docker; en particular **no elimina la consulta de correo a Keycloak**.

## 2. Requisitos privados (no van en GitHub)

Desde `backend/` debe existir el `.env` real. Si es una instalación nueva,
crear **una vez** copiando `.env.example` y reemplazar todos los placeholders
con valores propios. Mantener las variables ya utilizadas en el proyecto:

```dotenv
KEYCLOAK_REALM=ticketu-realm
KEYCLOAK_CLIENT_ID=ticketu-backend
KEYCLOAK_ADMIN_USER=admin
KEYCLOAK_ADMIN_PASSWORD=CLAVE_REAL_DEL_ADMIN_DE_ESE_KEYCLOAK
KEYCLOAK_CLIENT_SECRET=SECRETO_ALEATORIO_LARGO_PARA_EL_CLIENTE
INTERNAL_API_KEY=CLAVE_INTERNA_COMPARTIDA_DE_DESARROLLO
```

El contenedor Keycloak recibe ahora las variables necesarias **desde Compose**;
`KEYCLOAK_CLIENT_SECRET` es sustituido en el archivo de importación.
En un volumen existente, `KC_BOOTSTRAP_ADMIN_PASSWORD` NO modifica la clave
que ya tenga el administrador. Si el volumen se creó con otra clave, el
`.env` debe contener esa clave real.

El backend también necesita sus llaves `private.pem` y `public.pem`. **Conservar
las actuales**; reemplazarlas invalidaría JWT existentes. Para un repositorio
nuevo que no tenga ninguna, se pueden generar localmente con Node 22+
(no ejecutar si ya existe una llave):

```bash
cd backend
node tools/generar-llaves.mjs
cd ..
```

Las llaves y `.env` nunca deben distribuirse por GitHub.

## 3. Arranque local automatizado — Linux/Parrot

Desde la raíz `arquitectura/`:

```bash
bash backend/tools/iniciar-integracion.sh
bash backend/tools/verificar-integracion.sh
```

Para una **base PostgreSQL completamente nueva y vacía**, se necesita también
inicializar el esquema. Usa esta opción **solo después de verificar respaldos**:

```bash
bash backend/tools/iniciar-integracion.sh --inicializar-esquema
```

La ejecución estándar NO modifica el esquema de bases existentes.
El servicio `prisma-init` es optativo y no se inicia con `up auth-service`.
Para un ambiente que solo requiere backend, agregar `--sin-front`.

## 4. Arranque local automatizado — Windows / Docker Desktop

Desde PowerShell en la raíz `arquitectura/`:

```powershell
.\backend\tools\iniciar-integracion.ps1
.\backend\tools\verificar-integracion.ps1
```

Para la **primera instalación con PostgreSQL vacío**:

```powershell
.\backend\tools\iniciar-integracion.ps1 -InicializarEsquema
```

Si Windows impide ejecutar scripts, usar la política que autorice tu organización
para scripts descargados, o ejecutar los comandos Docker manualmente. No es
necesario deshabilitar de forma global las políticas de seguridad.

## 5. Comandos manuales equivalentes

Desde la raíz del repositorio:

```bash
# Solo si no existe:
docker network create plataforma-eventos-net
# Validar primero (requiere backend/.env con secretos configurados):
docker compose -f backend/docker-compose.yml config --quiet
docker compose -f backend/docker-compose.auth-service.yml config --quiet
# Infra Auth. OJO: no arrancar segundo RabbitMQ cuando ya existe el oficial.
docker compose -f backend/docker-compose.yml up -d db keycloak
# Solo si NO hay un broker ticketu-rabbitmq funcionando:
docker compose -f backend/docker-compose.yml up -d rabbitmq
# Para una BD NUEVA, OPCIONAL:
docker compose -f backend/docker-compose.auth-service.yml run --rm prisma-init
# Backend:
docker compose -f backend/docker-compose.auth-service.yml up -d --build auth-service
# Frontend: usar preferentemente los scripts para que Next incorpore el endpoint en el build.
```

**El script de arranque evita duplicar `ticketu-rabbitmq`** si el broker oficial ya está
corriendo. Si el contenedor existe pero está detenido, el script se detiene para
que revises quién es su propietario. Si ya corre, se conecta de manera aditiva a la red
`plataforma-eventos-net` cuando es necesario.

Puertos locales inalterados: Auth `10000`, PostgreSQL `5433`, Keycloak `8081`,
RabbitMQ `5672/15672`, frontend compradores `3001`, Gateway externo `8080`.

## 6. Pruebas que deberían demostrar que el parche funciona

1. `http://localhost:8081/realms/ticketu-realm/.well-known/openid-configuration`
   devuelve **HTTP 200** y JSON. Comprueba además en la consola de Keycloak
   `http://localhost:8081/admin/` que existan `ticketu-backend`, `STAFF` y
   `ORGANIZADOR`.
2. `http://localhost:10000/api/health` devuelve **HTTP 200**.
3. `http://localhost:3001/auth` presenta los formularios de compradores.
4. Registrar un comprador NUEVO con RUT válido, correo único y contraseña
   de al menos 8 caracteres: **HTTP 201** en `POST /api/auth/register`.
5. Intentar registrar el mismo correo/RUT: **HTTP 409**.
6. Login con el comprador: **HTTP 200**, cookie `jwt` HttpOnly.
7. Desde **backend** Entradas, llamar `GET http://auth-service:10000/internal/validar-sesion`
   con la cookie y `x-api-key` correcta: **HTTP 200**. Sin cookie: **401**;
   con API Key ausente/incorrecta: **403**.
8. Reiniciar Keycloak y comprobar que los usuarios existentes se conservan.

Verificaciones HTTP no sustituyen pruebas reales de autenticación. **No publiques JWT,
claves, contraseñas o capturas con datos personales**.

## 7. Limitaciones deliberadas

- La importación en arranque de Keycloak **solo crea el realm si no existe**.
  No modifica ni repara automáticamente realms anteriores. No elimina usuarios.
- El JSON es un **bootstrap mínimo de desarrollo**; si un equipo requiere
  ajustes adicionales de roles, password policies o SMTP, debe acordarlos.
- Los scripts incluyen frontend en **una sola computadora**. El frontend de
  Next.js incrusta `NEXT_PUBLIC_AUTH_API_URL=http://localhost:10000` en su build
  local; desde OTRO computador, `localhost` apunta a ese otro PC.
- Para integrar ordenadores diferentes se necesita una dirección HTTPS
  alcanzable, CORS, origen adecuado para `SameSite=Strict` y Gateway/proxy.
  Este parche NO afirma resolver esos problemas de red por sí solo.
- Si otra instalación publicó 8081 mediante un contenedor Keycloak con
  nombre distinto (`keycloak`, por ejemplo), no crear uno nuevo hasta identificar
  qué Compose lo administra; evita colisiones de puertos y mezclar identidades.
- No se cambian los puertos o nombres de los servicios del Platform Team.
- **No ejecutar `docker compose down -v`, `docker volume rm` ni recrear volúmenes.**

## Origen técnico

- Código revisado: `backend/src/auth/auth.service.ts` y `backend/src/keycloak/keycloak.service.ts`.
- Documentación oficial: https://www.keycloak.org/server/importExport
- Documentación oficial Docker: https://www.keycloak.org/server/containers
