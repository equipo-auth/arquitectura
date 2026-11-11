# ============================================================================
# Dockerfile — imagen de producción del front-end (Next.js)
# ----------------------------------------------------------------------------
# Build multi-stage: una etapa compila el proyecto, la otra corre solo lo
# necesario para servirlo. Así la imagen final es más liviana.
# ============================================================================

# ---- Etapa 1: dependencias + build ----
FROM node:20-alpine AS builder
WORKDIR /app
# Next.js incorpora las NEXT_PUBLIC_* en tiempo de build.
# Valor por defecto: Gateway; los scripts locales eligen Auth directo.
ARG NEXT_PUBLIC_GATEWAY_URL=http://localhost:8080
ARG NEXT_PUBLIC_AUTH_API_URL=http://localhost:8080
ENV NEXT_PUBLIC_GATEWAY_URL=${NEXT_PUBLIC_GATEWAY_URL}
ENV NEXT_PUBLIC_AUTH_API_URL=${NEXT_PUBLIC_AUTH_API_URL}

COPY package*.json ./
RUN npm install

COPY . .
# La carpeta public/ es opcional en Next.js. El runner la copia, por eso
# garantizamos que exista incluso cuando el repo no tenga assets publicos.
RUN mkdir -p public
RUN npm run build

# ---- Etapa 2: imagen final, solo lo necesario para correr ----
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.js ./next.config.js

EXPOSE 3000

CMD ["npm", "run", "start"]
