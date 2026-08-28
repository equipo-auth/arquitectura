# Arquitectura Monorepo - TITEC (Equipo Auth)

Este repositorio contiene la estructura base del microservicio de Autenticación, dividido en Backend (NestJS) y Frontend (React/Vite).

## Cómo levantar el proyecto en local

Como el proyecto está dividido en dos partes, necesitas abrir **dos terminales** distintas.

### Paso 1: Configurar Variables de Entorno
Por seguridad, las contraseñas no están en GitHub.
1. Ve a la carpeta `backend/` y busca el archivo `.env.example`.
2. Duplicar y renombrar la copia a `.env`.
3. Pedir al Scrum Master las credenciales de desarrollo (URL de Neon DB, etc.) por interno y pegarlas en ese archivo.

### Paso 2: Levantar el Backend
En la primera terminal, ejecutar:
```bash
cd backend
npm install
npm run start:dev
```
### Paso 3: Levantar el Frontend
En la segunda terminal, ejecutar:
```bash
cd backend
npm install
npm run start:dev
```
---

## Miembros del Equipo
| Nombre | Rol |
| :--- | :--- |
| BENJAMÍN DAVID ACEVEDO JORQUERA | Frontend |
| RICARDO ANDRES GIL OTALVAREZ | Integración |
| DIEGO ALEXANDER PEÑA GUTIÉRREZ | QA/Master |
| NATANIEL ENRIQUE RIQUELME VERGARA | Backend/BD |

---

## Documentación y Requerimientos
Todo el detalle del proyecto (Épica, Reglas de Seguridad y las Historias de Usuario para Frontend y Backend) se encuentra documentado en un archivo separado para mantener este espacio limpio.

**[Historias de Usuario y Reglas de Seguridad](./HISTORIAS.md)**
