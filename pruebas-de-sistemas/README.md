# TicketU — Prueba de Sistemas: Auth (material independiente)

> Este material es para **el TicketU docente** `https://pruebasdesistemauv.com/ticketu`, NO para el microservicio Auth NestJS propio. **No modifica la implementación.**
> Referencias: **Historias de Usuario (de lo implementado)**, páginas 5–6, HU-AUTH-01 a HU-AUTH-04; **Descripción de lo Implementado**, páginas 19–23. Esas fuentes requieren pruebas de API con Postman, ejecución manual en TestLink, métricas y defectos en Mantis. Los PDF no incluyen la rúbrica porcentual.
>
> **Estado: preparado, no ejecutado sobre el servidor docente.** Confirmar primero rutas, métodos y campos JSON exactos con Swagger; no confundir diferencias de contrato con defectos.

## Ubicación exacta de las pruebas

| Actividad | Archivo | Dónde se ejecuta |
|---|---|---|
| Pruebas HTTP | `postman/TicketU_Auth.postman_collection.json` | Postman Desktop/web → Import → colección → carpeta → Send |
| Casos manuales y criterios | `testlink/CASOS_AUTH.md` | TestLink del curso → proyecto TicketU → suite Auth → casos → ejecutar |
| Métricas | `metricas/SEGUIMIENTO.md` | Llenar luego de ejecuciones reales |
| Reporte de defectos | `mantis/DEFECTOS.md` | Mantis del curso → proyecto TicketU → crear incidencia solamente si se confirma defecto |

## Qué probar y en qué orden

1. **Confirma salud:** `https://pruebasdesistemauv.com/ticketu/api/health`. Si no está saludable, registrar como bloqueo y no asumir que Auth está defectuoso.
2. **Revisa Swagger:** `https://pruebasdesistemauv.com/ticketu/api/docs/`. El PDF establece reglas, pero no muestra el JSON exacto de las peticiones; comprueba si el registro usa `name`/`nombre` y `role`/`rol` y ajusta la colección ANTES de mandar las solicitudes. También revisa la respuesta exacta del login.
3. **Postman:** Importa `postman/TicketU_Auth.postman_collection.json`; crea un entorno local con `baseUrl=https://pruebasdesistemauv.com/ticketu/api`. La colección tiene valores no secretos en sus variables; establece en tu Postman los campos `registerEmail` (correo nuevo), `registerPassword`, `loginEmail`, `loginPassword`. No publiques variables sensibles o cookies.
4. Ejecuta primero solamente **`00 - Smoke seguro`** en Postman. Incluye health, endpoints protegidos sin autorización y payloads vacíos; **no crea cuentas ni provoca bloqueo**. Revisa cada aserción. Si el contrato real difiere, actualiza la prueba.
5. Ejecuta de manera **individual** la carpeta `01 - Registro` (puede crear cuentas) y `02 - Login` (puede bloquear una cuenta), luego `03 - Perfil` y `04 - Administración` (requiere permiso del docente). **No ejecutar toda la colección con Runner.**
6. Ejecuta casos manuales equivalentes en la interfaz `https://pruebasdesistemauv.com/ticketu` (rutas con `#`, diferentes de Next.js local) y registra cada Pass/Fail/Blocked/Not Run en TestLink. Adjunta evidencia sin contraseñas/JWT.
7. Solo si existe un defecto real reproducido, abre Mantis. Registra `x-request-id`, resultado esperado y real, severidad y prioridad.
8. Completa métricas con números reales. El hecho de tener cuenta TestLink/Mantis **no significa** que ya existan casos o defectos asignados.

## Ambiente compartido y límites

La guía de clase restringe pruebas de carga y uso de cuenta `admin` sin autorización del docente. No modificar datos de otros grupos ni hacer reset. La prueba de **cinco contraseñas erróneas** bloquea la cuenta quince minutos y no debe ejecutarse en Runner; usar solo cuenta descartable propia con autorización. No crear ni editar cuentas de otros estudiantes. No publicar token, correo real ajeno ni credenciales en GitHub.

## Historias y archivos

- `HU-AUTH-01`: `01 - Registro` en Postman; casos `TC-REG-*` en `testlink/CASOS_AUTH.md`.
- `HU-AUTH-02`: `02 - Login` en Postman; `TC-LOG-*`. La guía docente exige **JWT en cuerpo**, tipo Bearer, vigencia **8 horas** y bloqueo **403** tras 5 errores.
- `HU-AUTH-03`: `03 - Perfil` en Postman; `TC-ME-*`. Endpoint docente `/api/auth/me` y cerrar sesión desde la interfaz.
- `HU-AUTH-04`: `04 - Administración` en Postman; `TC-ADM-*`. Solo con permiso del docente y rol `admin`.

## Pruebas de nuestro microservicio TITEC Auth (distintas)

Desde la raíz original del repo `arquitectura/`:

```bash
cd backend
npm ci
npm run build
npm test -- --runInBand
npm run test:e2e -- --runInBand
cd ../frontend
npm ci
npm run test
npm run build
```

Archivos: `backend/src/auth/*.spec.ts`, `backend/src/keycloak/*.spec.ts`, `backend/src/internal/*.spec.ts`, `backend/test/*.e2e-spec.ts`, `frontend/src/modules/auth/*.test.ts`. En una ejecución local anterior se registraron **97 unitarios de backend, 8 E2E y 17 frontend aprobados**; esos resultados **no acreditan** el TicketU docente.
