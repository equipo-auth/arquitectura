# Corrección Docker Auth v2 — frontend + primera instalación

Basado en el parche `parche_auth_keycloak_docker.zip` **ya aplicado** al repositorio
`equipo-auth/arquitectura`. Se instala como complemento; **no reemplaza** el parche anterior.

## Causa del fallo observado

El build NestJS y Keycloak se completaron correctamente (realm HTTP 200, Auth health HTTP 200).
El frontend falló en `COPY --from=builder /app/public ./public` porque no existe una carpeta
`frontend/public` en el repositorio. Next.js no exige esa carpeta, pero el Dockerfile sí.
Además, se transfirieron alrededor de 510 MB al build por ausencia de `.dockerignore`.

## Aplicar a tu repositorio actual

1. Descomprime **el contenido** del ZIP en la raíz `~/Desktop/Auth/arqui/arquitectura/`
   (o la raíz del repo en Windows), **no** dentro de `backend` ni `frontend`.
2. Comprueba y aplica sin forzar:
   ```bash
   python3 aplicar_correccion.py --check
   python3 aplicar_correccion.py
   ```
3. Reinicia la construcción del frontend sin tocar contenedores de datos:
   ```bash
   NEXT_PUBLIC_AUTH_API_URL=http://localhost:10000 NEXT_PUBLIC_GATEWAY_URL=http://localhost:8080 \
     docker compose -f frontend/docker-compose.yml up -d --build front
   bash backend/tools/verificar-integracion.sh
   ```

## Para compañeros de Entradas con una copia NUEVA de tu repositorio

**Requieren Docker/Desktop y Python 3** (o `py -3` en Windows). También deben tener
el **parche anterior confirmado en GitHub**: importa el realm, configura redes y añade
la opción Prisma, scripts y `generar-llaves.mjs`. Este ZIP complementario no incluye
los otros archivos ni levanta servicios por sí solo.

Linux (desde la raíz del repo):
```bash
bash backend/tools/iniciar-todo.sh
```
Windows PowerShell (desde la raíz del repo):
```powershell
.\backend\tools\iniciar-todo.ps1
```

En una instalación totalmente nueva, los scripts generan un `.env` con claves
aleatorias y un par RSA de desarrollo, crean la red de Docker, inician PostgreSQL,
Keycloak, RabbitMQ, Auth y frontend e inicializan el esquema Prisma (solo cuando no
existe el volumen/contendor previo). **No usan valores privados del equipo de Auth**.

**Si ya existen contenedores o volúmenes:** los scripts preservan `.env`, llaves RSA
y datos. No aplican cambios automáticos de Prisma a un volumen existente. Si falta
un `.env` en una instalación con datos previos, se detienen para evitar generar
secretos incompatibles. Si hay un broker externo apagado, solicitan iniciarlo desde
su proyecto. No utilizan `down -v` ni eliminan volúmenes.

## Qué se requiere en GitHub

Los **Dockerfile NO arrancan varios servicios**: solo construyen imágenes. Publica
los Compose (`backend/docker-compose*.yml`, `frontend/docker-compose.yml`), el JSON
`backend/keycloak/import/ticketu-realm-realm.json`, los scripts de ambos parches,
este parche de `frontend/Dockerfile` y `frontend/.dockerignore`.

Nunca publiques `.env`, `.pem`, `.bak`, secretos o llaves privadas.

## URLs en el PC donde corra el stack de desarrollo

- Keycloak realm: http://localhost:8081/realms/ticketu-realm/.well-known/openid-configuration
- Backend Auth: http://localhost:10000/api/health
- Compradores: http://localhost:3001/auth

El login de compradores llama a localhost:10000 en **el navegador del PC que ejecutó**
`iniciar-todo`. Si Entradas está en otra PC y pretende consumir tu Auth remotamente,
este stack local no resuelve TLS, CORS, cookies SameSite=Strict ni alcance de red.
Para esa integración hace falta URL HTTPS compartida/proxy y pruebas extremo a extremo.

## Verificaciones

1. `docker compose -f backend/docker-compose.yml config --quiet`
2. `docker compose -f backend/docker-compose.auth-service.yml config --quiet`
3. `docker compose -f frontend/docker-compose.yml config --quiet`
4. `bash backend/tools/verificar-integracion.sh` (o equivalente PS1)
5. Registro comprador (HTTP 201), login (200), cookie `jwt` y validación S2S
   desde Entradas con `x-api-key` **solo desde el backend**.

Si el formulario no registra compradores pese al estado HTTP 200, consultar los logs
`docker logs --tail 100 ticketu-auth-service` y comprobar que la configuración de
Keycloak y la BD son las que se esperan. HTTP 200 no verifica credenciales ni registros.
