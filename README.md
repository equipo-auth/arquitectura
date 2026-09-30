# Arquitectura - TITEC (Equipo Auth)

Este repositorio contiene la estructura base del microservicio de Autenticación, dividido en Backend (NestJS) y Frontend (React).

## Cómo levantar el proyecto en local

Como el proyecto está dividido en dos partes, necesitas abrir dos terminales distintas.

### Paso 1: Configurar Variables de Entorno
Por seguridad, las contraseñas no están en GitHub.

1. Ve a la carpeta `backend/` y busca el archivo `.env.example`.
2. Duplica el archivo y renombra la copia a `.env`.
3. Pide al Scrum Master las credenciales de desarrollo (URL de la base de datos, Keys de Keycloak, RabbitMQ, etc.) por interno y pégalas en ese archivo.
4. Asegúrate de tener los archivos `private.pem` y `public.pem` en la raíz de la carpeta `backend/`.

### Paso 2: Levantar el Backend
En la primera terminal, levanta la infraestructura y el servidor:

```bash
cd backend
docker-compose up -d
npm install
npx prisma generate
npx prisma db push
npm run start:dev
```
## Paso 3: Levantar el Frontend

En la segunda terminal, ejecutar los siguientes comandos:

```bash
cd frontend
npm install
npm start
```
## Miembros del Equipo y Roles

| Nombre | Rol |
| :--- | :--- |
| **BENJAMÍN DAVID ACEVEDO JORQUERA** | Frontend |
| **RICARDO ANDRES GIL OTALVAREZ** | Integración |
| **DIEGO ALEXANDER PEÑA GUTIÉRREZ** | QA/Master |
| **NATANIEL ENRIQUE RIQUELME VERGARA** | Backend/BD |

## Documentación y Requerimientos

Todo el detalle del proyecto, incluyendo la **Épica**, las **Reglas de Seguridad** y las **Historias de Usuario para Frontend y Backend**, se encuentra documentado en un archivo separado para mantener este espacio limpio.

