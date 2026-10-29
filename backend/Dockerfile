# ETAPA 1: Compilación
FROM node:22-bookworm-slim AS builder

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY prisma ./prisma

RUN npm ci

COPY . .

RUN npx prisma generate \
    && npm run build \
    && npm prune --omit=dev

# ETAPA 2: Ejecución
FROM node:22-bookworm-slim AS production

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=10000

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/package.json ./package.json

# Ejecutar sin privilegios de root
USER node

# Puerto del microservicio Auth
EXPOSE 10000

# Comprobación automática de disponibilidad
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD node -e "require('node:http').get('http://127.0.0.1:' + (process.env.PORT || '10000') + '/api/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "dist/main.js"]

