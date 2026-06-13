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

if [ ! -f "$DEST/.env" ]; then
  log "AVISO: falta $DEST/.env (secretos de produccion)"
fi

# 4) Reconstruir y levantar (el cambio de código invalida la caché del COPY . .).
cd "$DEST"
docker compose -p "$PROJECT" up -d --build

# 5) Aplicar migraciones de Prisma. -T = sin TTY (tarea no interactiva);
#    -u root = evita EACCES al leer /app/package.json con el usuario del contenedor.
docker compose -p "$PROJECT" exec -T -u root app npx prisma migrate deploy

log "deploy OK"
echo "Deploy completado."
