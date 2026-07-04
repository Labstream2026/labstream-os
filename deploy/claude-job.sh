#!/bin/bash
# Deploy de Labstream OS en el NAS Synology.
# Lo ejecuta la tarea del Programador de tareas (DSM, como root):
#   bash /var/services/homes/Labstream/claude-job.sh
# Este es el archivo de referencia versionado; la copia real vive en
# /var/services/homes/Labstream/claude-job.sh (se actualiza con el bloque de
# instalación del README/chat). NO usar `set -x` (el escáner de seguridad de
# Synology bloquea scripts con salida hex/verbose).
set -e

REPO="Labstream2026/labstream-os"
BRANCH="main"
DEST="/volume1/docker/labstream-os"
PROJECT="labstream-os"
# /volume1/docker siempre existe; /home no resuelve bajo sudo/Task Scheduler.
LOG="/volume1/docker/labstream-os-deploy.log"
TMP="/tmp/lsos-deploy"

# El log nunca debe tumbar el deploy (de ahí el "|| true").
log() { echo "=== $* $(date) ===" >> "$LOG" 2>/dev/null || true; }
log "deploy inicio"

# 1) Descargar el código más reciente de GitHub (repo público).
rm -rf "$TMP"
mkdir -p "$TMP"
curl -fsSL "https://codeload.github.com/$REPO/tar.gz/refs/heads/$BRANCH" -o "$TMP/src.tgz"
tar xzf "$TMP/src.tgz" -C "$TMP"
SRC="$TMP/labstream-os-$BRANCH"

# 2) Copiar al destino SIN tocar secretos (.env) ni datos persistentes.
mkdir -p "$DEST"
rsync -a \
  --exclude '.env' \
  --exclude 'data' \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude '.git' \
  "$SRC/" "$DEST/"

# 3) Crear los directorios de bind mount (Synology no los autocrea → "Bind mount failed").
mkdir -p "$DEST/data/postgres" "$DEST/data/redis" "$DEST/data/storage"
# La carpeta de subidas debe ser escribible por el usuario del contenedor (uid 1001),
# si no, EACCES rompe TODAS las subidas (chat, avatares, fotos de inventario, archivos).
chown -R 1001:1001 "$DEST/data/storage" 2>/dev/null || true

if [ ! -f "$DEST/.env" ]; then
  log "AVISO: falta $DEST/.env (secretos de produccion)"
fi

# 4) Construir la imagen nueva SIN tocar la app que corre (la vieja sigue sirviendo).
cd "$DEST"
docker compose -p "$PROJECT" build

# 5) Aplicar migraciones de Prisma ANTES de cambiar el código, con la imagen nueva.
#    ORDEN CRÍTICO: antes se hacía `up` primero y `migrate` después; si la migración
#    fallaba (o el exec no corría), quedaba el CÓDIGO NUEVO con la BD VIEJA → errores
#    de runtime en toda la app (columnas inexistentes). Ahora, si la migración falla,
#    el `set -e` corta aquí y la app VIEJA sigue intacta (nada se rompe).
#    La salida queda en el log para diagnosticar. -T = sin TTY; -u root = permisos.
log "migraciones"
docker compose -p "$PROJECT" run --rm -T -u root app npx prisma migrate deploy >> "$LOG" 2>&1

# 6) Levantar el código nuevo (solo se llega aquí si las migraciones pasaron).
docker compose -p "$PROJECT" up -d

# 7) Limpieza: cada rebuild deja la imagen anterior como <none> y capas de caché
#    sin usar. Sin esto se acumulan gigas con cada deploy. Se purga aquí.
#    • "|| true": la limpieza nunca debe tumbar el deploy (set -e).
#    • NO se usa --volumes: los datos persistentes (Postgres, Redis, subidas) están
#      en bind mounts (./data) y quedan intactos.
log "limpieza docker"
docker image prune -f >> "$LOG" 2>&1 || true
docker builder prune -f >> "$LOG" 2>&1 || true

log "deploy OK"
echo "Deploy completado."
