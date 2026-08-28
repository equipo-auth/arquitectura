# ============================================================================
# Dockerfile — imagen de producción del front-end (Next.js)
# ----------------------------------------------------------------------------
# Build multi-stage: una etapa compila el proyecto, la otra corre solo lo
# necesario para servirlo. Así la imagen final es más liviana.
# ============================================================================

# ---- Etapa 1: dependencias + build ----
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
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
