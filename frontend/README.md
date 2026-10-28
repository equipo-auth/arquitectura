# Plataforma de Eventos — Front-end

Este repositorio es la **base común del front-end**, entregada por el *platform team*.
Está hecha en **Next.js** (un framework construido sobre React, que además trae el sistema
de rutas y la estructura de carpetas ya resuelta).

Cada uno de los 9 grupos trabaja en **sus propias carpetas**, sin tocar el código de los
demás. Este documento explica exactamente qué carpetas le corresponden a cada grupo.

---

## 1. Antes de empezar (modo desarrollo, sin Docker)

```bash
npm install        # instala dependencias
cp .env.example .env.local   # copia las variables de entorno
npm run dev        # levanta el proyecto en http://localhost:3000
```

Abran `.env.local` y reemplacen `NEXT_PUBLIC_GATEWAY_URL` por la URL real del API Gateway
cuando esté disponible (mientras tanto, `http://localhost:8080` sirve como valor de prueba).

Este modo (`npm run dev`) es el que van a usar el 95% del tiempo mientras programan: tiene
recarga automática al guardar cambios. La sección 8 explica cómo compilar y correr la
versión de producción, y cómo levantar el front en Docker.

---

## 2. Idea general de la estructura

Hay dos carpetas importantes dentro de `src/`, y cumplen roles distintos:

- **`src/app/`** → define **QUÉ URL** muestra **QUÉ**. Es el "mapa" de rutas de Next.js:
  cada carpeta dentro de `app/` es una página (`app/pagos/` = ruta `/pagos`). Los archivos
  acá deben ser **cortos**: solo importan y muestran el componente principal de su módulo.

- **`src/modules/`** → acá vive **TODO el trabajo real** de cada grupo: las llamadas a su
  microservicio (`api.ts`) y todos sus componentes (`components/`). Este es el lugar donde
  van a pasar el 95% del tiempo programando.

Piensen a `app/` como el "letrero de la puerta" y a `modules/` como la "oficina" donde
realmente se trabaja.

```
src/
├── app/            ← rutas (letreros de puerta) — NO programen lógica acá
├── components/     ← Header, Footer y UI compartida — NO LO TOQUEN sin acuerdo de los 9 grupos
├── modules/        ← acá programa cada grupo, en SU carpeta
└── lib/env.ts       ← URLs de los 9 microservicios, centralizadas
```

---

## 3. Qué carpetas usa cada grupo

**Regla general:** cada grupo edita **solo** `src/app/<su-ruta>/` y `src/modules/<su-módulo>/`.
No hace falta tocar nada fuera de esas dos carpetas.

| # | Grupo | Ruta (`src/app/...`) | Su carpeta de trabajo (`src/modules/...`) |
|---|-------|------------------------|---------------------------------------------|
| 1 | Auth | `app/auth/` | `modules/auth/` |
| 2 | Catálogo de eventos | `app/catalogo/` y `app/catalogo/[eventoId]/` | `modules/catalogo/` |
| 3 | Entradas / Inventario | `app/entradas/` | `modules/entradas/` (incluye un componente resumen usado por Catálogo, ver sección 4) |
| 4 | Pagos | `app/pagos/` | `modules/pagos/` |
| 5 | Check-in | `app/checkin/` | `modules/checkin/` |
| 6 | Reseñas | `app/catalogo/[eventoId]/resenas/` ⚠️ ver sección 4 | `modules/resenas/` |
| 7 | Panel organizador | `app/organizador/` | `modules/organizador/` |
| 8 | Notificaciones | `app/notificaciones/` | `modules/notificaciones/` |
| 9 | Promociones | `app/promociones/` | `modules/promociones/` (incluye un componente resumen usado por Catálogo, ver sección 4) |

Dentro de `modules/<su-módulo>/` van a encontrar:
- `api.ts` → acá van todas las llamadas `fetch` a su propio microservicio (ya viene
  configurado para leer la URL correcta desde `lib/env.ts`, no hace falta escribirla de nuevo).
- `components/` → acá van todos los componentes visuales de su módulo. Pueden crear los
  archivos y sub-carpetas que necesiten, siempre dentro de esta carpeta.

Ya dejamos un componente de ejemplo (`...Placeholder.tsx`) en cada módulo para que el
proyecto compile desde el día 1. Bórrenlo o reemplácenlo por su interfaz real.

---

## 4. Módulos que se solapan con Catálogo

La descripción del proyecto dice que Catálogo debe mostrar, además de la información
propia del evento: **promociones, reseñas y entradas disponibles, según corresponda**.
Eso significa que tres grupos distintos entregan contenido dentro de la misma página, cada
uno con un nivel de solape distinto. Léanlo con calma.

### 4.1 Caso completo: Reseñas (Grupo 6)

Las reseñas de un evento se muestran **dentro** de la página de detalle de ese evento —
por eso su URL vive anidada: `/catalogo/123/resenas`. Reseñas tiene su propia ruta,
propio formulario, propio estado — es una funcionalidad completa (crear, editar, eliminar
reseñas), no solo un dato para mostrar.

```
app/catalogo/
├── page.tsx                    ← Grupo 2 (listado/búsqueda de eventos)
├── [eventoId]/
│   ├── page.tsx                ← Grupo 2 (detalle del evento)
│   └── resenas/
│       └── page.tsx            ← Grupo 6 (reseñas de ESE evento)
```

**Reglas:**
1. El **Grupo 2** no edita `app/catalogo/[eventoId]/resenas/page.tsx`.
2. El **Grupo 6** no edita los otros `page.tsx` de `app/catalogo/`.
3. La lógica de cada grupo vive completamente separada en `modules/catalogo/` y
   `modules/resenas/` — solo se juntan visualmente en `DetalleEventoPlaceholder.tsx`.

### 4.2 Caso liviano: Entradas (Grupo 3) y Promociones (Grupo 9)

Este caso es distinto y más simple: Catálogo necesita mostrar **cuántas entradas quedan**
y **qué promociones están activas** para un evento, pero eso no requiere una ruta propia
ni un formulario — es información de solo lectura. Por eso, en vez de una ruta anidada,
Entradas y Promociones exponen un **componente resumen chico**:

- `modules/entradas/components/DisponibilidadPlaceholder.tsx`
- `modules/promociones/components/PromocionPlaceholder.tsx`

Catálogo los importa y posiciona dentro de `DetalleEventoPlaceholder.tsx`, exactamente
igual que hace con el componente de Reseñas. Revisen ese archivo para ver el patrón:

```tsx
import DisponibilidadPlaceholder from "@/modules/entradas/components/DisponibilidadPlaceholder";
import PromocionPlaceholder from "@/modules/promociones/components/PromocionPlaceholder";
import ResenasPlaceholder from "@/modules/resenas/components/ResenasPlaceholder";
```

**Reglas para Entradas y Promociones:**
1. `DisponibilidadPlaceholder.tsx` y `PromocionPlaceholder.tsx` son de **solo lectura** —
   no metan ahí el flujo completo de compra ni el formulario de creación de promociones.
   Esos flujos completos van en la página propia de cada grupo (`/entradas`,
   `/promociones`).
2. Catálogo decide dónde y cómo se posicionan estos componentes dentro de su página; el
   contenido interno de cada componente lo deciden Entradas y Promociones.
3. Si necesitan cambiar cómo se ve o qué datos trae el resumen, coordínenlo directamente
   con el Grupo 2 antes de modificarlo.

Recuerden también el límite de responsabilidad que ya viene del enunciado del proyecto:
**Catálogo solo busca/lista/consulta eventos — no crea, modifica ni elimina eventos**
(eso es el Panel organizador, Grupo 7).

---

## 5. Header y Footer (los 9 grupos)

`src/components/layout/Header.tsx` y `Footer.tsx` aparecen en **todas** las páginas de la
plataforma (se muestran una sola vez desde `src/app/layout.tsx`, el layout raíz de Next.js).

- Ya vienen con un contenido de ejemplo para que el proyecto se vea bien desde el día 1.
- El contenido final (qué logo, qué links, qué información del footer) lo **acuerdan entre
  los 9 grupos** en conjunto — no lo decide un solo grupo por su cuenta.
- Una vez acordado, **una sola persona** (o el platform team) implementa el cambio en esos
  dos archivos. Si después hace falta ajustar algo, se propone como Pull Request y lo
  revisa el platform team antes de aprobarlo — así evitamos que 9 grupos editen el mismo
  archivo al mismo tiempo y se pisen los cambios.

---

## 6. Reglas generales de trabajo en Git

1. Nunca se trabaja directo sobre `main`. Cada cambio va en un branch corto:
   `feature/<grupo>-<que-hace>` (ej. `feature/pagos-formulario-checkout`).
2. Al terminar, se abre un Pull Request contra `main`. Se recomienda que lo revise alguien
   de otro grupo o el platform team antes de aprobar el merge.
3. Traten de integrar seguido (cambios chicos y frecuentes) en vez de acumular todo el
   trabajo para el final — así los conflictos, si aparecen, son fáciles de resolver.
4. Si su cambio *solo* toca `app/<su-ruta>/` y `modules/<su-módulo>/`, prácticamente no
   deberían tener conflictos de Git con otros grupos.

---

## 7. Conectar con su microservicio: todo pasa por el API Gateway

**El front NO conoce las URLs de los 9 microservicios individuales.** Solo conoce una
única puerta de entrada: el **API Gateway**. Es el Gateway el que sabe internamente a qué
microservicio reenviar cada petición según el path (ej. `/api/pagos/*` → servicio de
Pagos, `/api/catalogo/*` → servicio de Catálogo).

Esto está resuelto en `src/lib/env.ts`, que expone una sola constante `GATEWAY_URL`.
Solo necesitan definirla en `.env.local` (ver sección 1) y usar las funciones de su propio
`modules/<su-módulo>/api.ts` para llamar a su API — cada una ya apunta al Gateway con el
path correcto para su módulo.

Ejemplo (ya armado en `modules/catalogo/api.ts`):

```ts
import { GATEWAY_URL } from "@/lib/env";

const BASE_PATH = "/api/catalogo";

export async function buscarEventos(query?: string) {
  const res = await fetch(`${GATEWAY_URL}${BASE_PATH}/eventos?q=${query ?? ""}`);
  return res.json();
}
```

**No hardcodeen la URL de un microservicio en ningún archivo, ni siquiera en `api.ts`.**
Siempre se llama a `GATEWAY_URL` + el path de su módulo. Si algún día cambia dónde vive un
microservicio, el front no se entera — es problema exclusivo del Gateway.

Esto también significa que **CORS solo se configura una vez, en el Gateway** — ningún
microservicio individual necesita configurar CORS para el front.

---

## 8. Build y ejecución (producción, sin Docker)

Para generar la versión optimizada de producción (la que realmente se entrega/despliega,
no la de desarrollo):

```bash
npm run build   # compila el proyecto para producción
npm run start   # sirve la versión compilada en http://localhost:3000
```

Diferencia clave: `npm run dev` es para programar (recarga rápido, pero es más lento en
ejecución); `npm run build` + `npm run start` es la versión final, optimizada, la misma
que corre dentro del contenedor Docker (sección 9).

Antes de hacer un Pull Request grande o entregar un avance, es buena práctica correr
`npm run build` localmente al menos una vez — si hay un error de TypeScript o de import
que `npm run dev` no mostró, `build` sí lo va a detectar.

---

## 9. Dockerización

Los 9 microservicios van a correr en Docker, cada uno con su propio `docker-compose.yml`
(uno por grupo de backend). El front también corre en Docker, con el `Dockerfile` y el
`docker-compose.yml` ya incluidos en este repo.

### Levantar el front en Docker

```bash
docker compose up --build
```

Esto compila la imagen (`npm install` + `npm run build` dentro del contenedor) y levanta
el front en `http://localhost:3000`, igual que en producción.

### La parte importante: cómo se conecta con el Gateway y los microservicios

Como cada equipo (front, Gateway, cada uno de los 9 microservicios) tiene su **propio**
`docker-compose.yml`, por defecto Docker los aísla en redes separadas — el contenedor del
front no podría "ver" al contenedor del Gateway aunque ambos estén corriendo en la misma
máquina.

Para que sí puedan comunicarse, todos deben conectarse a una **red de Docker compartida y
externa**, creada una sola vez, independiente de cualquier `docker-compose.yml` individual:

```bash
docker network create plataforma-eventos-net
```

Esto solo se hace **una vez** por máquina (o una vez en el servidor/ambiente de integración
donde levanten todo junto). Después, cada `docker-compose.yml` — el del front, el del
Gateway, y el de cada uno de los 9 microservicios — declara esa misma red como `external`
(el `docker-compose.yml` del front ya viene configurado así). Así, todos los contenedores
quedan en la misma red aunque se levanten con comandos `docker compose up` distintos, desde
carpetas distintas.

Una vez que el Gateway esté corriendo en esa red compartida, actualicen
`NEXT_PUBLIC_GATEWAY_URL` para apuntar al **nombre del servicio** del Gateway dentro de esa
red (no a `localhost`) — por ejemplo, si el servicio del Gateway se llama `gateway` en su
`docker-compose.yml`, la URL dentro de la red Docker sería algo como
`http://gateway:8080`. Pregúntenle al equipo/persona a cargo del Gateway cuál es el nombre
exacto de su servicio y en qué puerto expone la API.

**Resumen del orden para levantar todo el ecosistema:**
1. Crear la red compartida (una sola vez): `docker network create plataforma-eventos-net`
2. Levantar el API Gateway (su propio `docker-compose.yml`, conectado a esa red)
3. Levantar los 9 microservicios (cada uno con su propio `docker-compose.yml`, conectados a esa red)
4. Levantar el front: `docker compose up --build` (ya conectado a esa red)
