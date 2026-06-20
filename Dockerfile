# ── Labstream OS · imagen Docker para el NAS Synology (x86) ──
# Multi-stage con salida standalone de Next + cliente Prisma copiado a mano
# (el trace de standalone a veces recorta el engine de Prisma).

FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# ── deps ──
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

# ── builder ──
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate && npm run build

# ── runner ──
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
# El calendario asume hora de pared en UTC; se fija aquí también para que la imagen
# sea correcta aunque se ejecute fuera de docker-compose.
ENV TZ=UTC
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# node_modules COMPLETO: el trace del output standalone de Next recorta módulos y
# rompe el CLI de prisma/tsx; con el node_modules entero funcionan migrate y seed.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json
# src/ necesario para el seed (prisma/seed.ts importa de src/lib/*)
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./tsconfig.json

# Carpeta de subidas: debe pertenecer al usuario del contenedor (uid 1001) para
# poder escribir. Sin esto, EACCES rompe TODAS las subidas (chat, avatar, fotos
# de inventario, archivos de proyecto). El bind-mount del NAS se corrige además
# en el script de deploy con un chown.
RUN mkdir -p /app/storage && chown -R nextjs:nodejs /app/storage

USER nextjs
EXPOSE 3000
# Al arrancar, aplica las migraciones pendientes (idempotente) y luego levanta el server.
# Así cada deploy crea las columnas/tablas nuevas sin paso manual. Se usa ';' (no '&&') para
# que, si el migrate fallara, la app ARRANQUE igual y no se caiga todo el servicio.
CMD ["sh", "-c", "npx prisma migrate deploy; node server.js"]
