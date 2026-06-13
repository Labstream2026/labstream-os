# Labstream OS

Sistema operativo colaborativo para producción audiovisual de **Labstream Studio**.
Gestiona el flujo: Cliente → Proyecto → Entregables → Tareas → Archivos → Revisión → Aprobación → Entrega.

> **Fase 0 (actual):** cimientos — layout de 3 columnas (Notion/Linear/Slack/Frame.io),
> sistema de diseño claro/oscuro, esquema base (usuarios, roles, permisos, clientes,
> proyectos) y empaquetado Docker listo para el NAS. Ver el roadmap por fases abajo.

## Stack

- **Next.js 16** (App Router) + TypeScript + Tailwind v4 + shadcn-style UI
- **Prisma 6 + PostgreSQL 16**
- Auth (Auth.js) · Redis + worker (Socket.IO/BullMQ) · FFmpeg — fases siguientes

## Desarrollo local (Mac)

Requisitos: Node 20+, PostgreSQL 16 (Homebrew).

```bash
# 1. Postgres
brew services start postgresql@16
createdb labstream_os_dev

# 2. Dependencias y entorno
npm install
cp .env.example .env        # ajusta DATABASE_URL a tu usuario local

# 3. Base de datos
npm run db:migrate          # aplica migraciones
npm run db:seed             # carga roles, permisos, equipo, clientes y proyectos demo

# 4. Arrancar
npm run dev                 # http://localhost:3200
```

### Scripts

| Script | Acción |
|---|---|
| `npm run dev` | Dev server en el puerto 3200 |
| `npm run build` | `prisma generate` + build de producción |
| `npm run db:migrate` | Migraciones de desarrollo |
| `npm run db:push` | Sincroniza el esquema sin crear migración |
| `npm run db:seed` | Carga datos de ejemplo |
| `npm run db:reset` | Reinicia la BD y vuelve a sembrar |

## Despliegue en el NAS Synology (Docker)

```bash
# En el build dir del NAS (p.ej. /volume1/docker/labstream-os)
docker compose -p labstream-os up -d --build
docker compose -p labstream-os exec app npx prisma migrate deploy
```

- La app expone **3200 → 3000**; el reverse proxy de DSM sirve `os.labstreamsas.com`.
- Datos persistentes en `./data/{postgres,redis,storage}` (bind mounts).
- Variables en `.env` (junto al `docker-compose.yml`): `POSTGRES_PASSWORD`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`.

### Backup / restore de la BD

```bash
# Backup
docker compose -p labstream-os exec postgres pg_dump -U labstream labstream_os > backup_$(date +%F).sql
# Restore
cat backup.sql | docker compose -p labstream-os exec -T postgres psql -U labstream -d labstream_os
```

## Roadmap por fases

- **F0 — Cimientos** ✅ layout, diseño, esquema base, Docker.
- **F1 — Auth + esqueleto desplegable** · login real, roles/permisos, clientes y proyectos CRUD, **primer deploy al NAS**.
- **F2 — Núcleo de producción** · plantillas, tareas, entregables, archivos, automatizaciones v1.
- **F3 — Comunicación** · chat realtime (worker + Socket.IO), offline, mensaje→acción.
- **F4 — Calendario + Cotizaciones + Notificaciones** · = MVP completo.
- **F5 — Revisión audiovisual + Portal de cliente** · Frame.io-like, links públicos, biblioteca.
- **F6 — Integraciones + IA** · Google Calendar/Drive, Claude API, email/push.
- **F7 — App de escritorio** · Tauri (opcional).
