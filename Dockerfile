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
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# node_modules COMPLETO: el trace del output standalone de Next recorta módulos y
# rompe el CLI de prisma/tsx; con el node_modules entero funcionan migrate y seed.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
