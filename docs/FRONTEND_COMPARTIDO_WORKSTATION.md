# Mapa de integración del frontend común — TITEC E3

## Ownership

- **Backend Auth:** [`equipo-auth/arquitectura` rama `workstation`](https://github.com/equipo-auth/arquitectura/tree/workstation). Compila y ejecuta `ticketu-auth-service` en `10000`.
- **Frontend compartido:** [`FWizav/FrontendTitec`](https://github.com/FWizav/FrontendTitec), propiedad de Platform; contiene rutas de todos los equipos. La rama de despliegue la determina Platform.
- **Gateway:** backend de Platform, puerto `8080`, enruta `/api/auth/*` hacia `auth-service:10000`.
- **Frontend de este repositorio `frontend/`:** QA local independiente, puerto host `3001`, **no requerido** para workstation.

## Acceso por navegador y rutas reales observadas en FrontendTitec/main

| Uso | URL local de desarrollo |
|---|---|
| Portada compartida | `http://localhost:3000/` |
| Login comprador | `http://localhost:3000/auth` |
| Login administrativo | `http://localhost:3000/auth/admin/login` |
| Recuperación comprador | `http://localhost:3000/auth/recuperar` |
| Organizador (vista común) | `http://localhost:3000/organizador` |

El repositorio compartido **no** usa `/admin/login` a secas como ruta de Auth. **La copia local de este repositorio sí usa `/admin/login`** en `localhost:3001`; no confundir ambas rutas. Los `3000` y `8080` aquí son puertos del **host de QA**. Un backend dentro de Docker no debe usar `localhost:8080` para comunicarse con el Gateway: debe emplear un nombre DNS Docker de su red; el navegador sí usa una URL pública accesible.

## Contratos y diferencias de despliegue

1. El frontend llama al API Gateway por `NEXT_PUBLIC_GATEWAY_URL` (y puede usar `NEXT_PUBLIC_AUTH_API_URL` en la implementación de Auth); nunca contiene `INTERNAL_API_KEY` ni llaves JWT privadas.
2. Auth genera enlaces `auth/crear-clave` y `auth/restablecer` usando `FRONTEND_URL` y `COMPRADOR_FRONTEND_URL` del **backend**; apuntarlos al origen del frontend común en `backend/.env` de la workstation.
3. En `FrontendTitec/main`, el login administrativo invoca `homeForRole` para redirigir según rol; una redirección al frontend externo de Panel depende de `NEXT_PUBLIC_PANEL_URL` y de que Platform la incorpore durante el build. **No asumir que existe ni modificar el frontend ajeno sin acuerdo.**
4. No ejecutar el Compose del frontend común desde la carpeta `frontend/` de Auth: son dos repositorios y archivos Docker diferentes.
5. La instalación de Auth en workstation se limita a `backend/docker-compose.auth-service.yml` o a `backend/tools/iniciar-integracion.ps1 -InfraExistente -SinFrontend`; la infraestructura debe estar instalada y autorizada.
6. `backend/tools/verificar-integracion.ps1 -FrontendComun` comprueba solo rutas HTTP; pruebas de roles y AU1 requieren login/consultas reales del backend Panel.

## Pendientes externos que no debe ocultar un fix Auth

- Plataforma determina la rama/commit definitivo de `FrontendTitec` y configura build, Gateway y destino del Panel.
- Al configurar Keycloak, RabbitMQ y PostgreSQL, los archivos `.env`/PEM locales de Auth deben existir. Nunca versionarlos.
- Un RabbitMQ preexistente detenido requiere que su responsable lo inicie. No duplicarlo ni borrar volúmenes.
- **GW1 sigue pendiente de una integración no JWT real entre backends vía Gateway y acuerdo contractual**, no de una página de frontend añadida artificialmente.
