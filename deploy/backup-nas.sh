#!/bin/bash
# ── Copia de seguridad NOCTURNA de Labstream OS en el NAS Synology ──
# La ejecuta el Programador de tareas de DSM (como root), todas las noches:
#   bash /volume1/docker/labstream-os/deploy/backup-nas.sh
# (El deploy rsync-ea el repo a /volume1/docker/labstream-os, así que este script
#  se actualiza solo con cada deploy — no hay copia aparte que mantener.)
#
# Qué produce: UN archivo autosuficiente por noche en OTRO volumen,
#   labstream-backup-AAAA-MM-DD_HHMM.tar.gz
# con TODO lo irreproducible de la app:
#   • db/labstream_os.dump  — pg_dump CONSISTENTE de Postgres (formato custom)
#   • data/storage/         — archivos subidos (sin ./chunked, que es transitorio)
#   • .env                  — secretos de producción (¡el backup contiene secretos!)
#   • docker-compose.yml    — el stack tal como corre
#   • redis/dump.rdb        — mejor esfuerzo (solo cachés/colas)
#   • restaurar.sh + LEEME-RESTAURAR.md — descomprimir y correr UN comando restaura todo
# El código NO va (vive en GitHub); restaurar.sh lo re-descarga y reconstruye la imagen.
# NO se copia data/postgres en crudo: un Postgres vivo copiado a mano queda corrupto;
# el dump es el artefacto correcto y se restaura con pg_restore.
#
# Rotación: se conservan las 5 más recientes; al crear (y VERIFICAR) la nueva,
# se borra la más vieja. Un backup fallido nunca borra nada.
# NO usar `set -x` (el escáner de seguridad de Synology bloquea salida verbose).
set -e
set -o pipefail

# ── Configuración ──
PROJECT="labstream-os"
APPDIR="/volume1/docker/labstream-os"
# OTRO volumen (volumen 5, junto a Operaciones_LAB). Ajustar si el share se llama distinto.
BACKUP_DEST="/volume5/Operaciones_LAB/Backups_LabstreamOS"
RETAIN=5
LOG="$BACKUP_DEST/backup.log"
STAMP="$(date +%F_%H%M)"
NAME="labstream-backup-$STAMP"
STAGE="/tmp/lsos-backup-$STAMP"

# Aviso en el escritorio de DSM (mejor esfuerzo; nunca tumba el backup).
notify() { synodsmnotify @administrators "Backup Labstream OS" "$1" >/dev/null 2>&1 || true; }
log() { echo "[$(date '+%F %T')] $*" >> "$LOG" 2>/dev/null || echo "[$(date '+%F %T')] $*"; }

fail() {
  trap - ERR
  log "ERROR: $1"
  notify "FALLÓ el backup: $1"
  rm -rf "$STAGE" "$BACKUP_DEST/$NAME.tar.gz.parcial" 2>/dev/null || true
  exit 1
}
trap 'fail "el script terminó de forma inesperada (línea $LINENO)"' ERR

# ── Comprobaciones previas ──
# El volumen destino debe EXISTIR (si el volumen 5 no está montado, mejor fallar con
# aviso que "respaldar" en el mismo volumen de la app sin darse cuenta).
VOLROOT="$(echo "$BACKUP_DEST" | cut -d/ -f1-2)"   # → /volume5
[ -d "$VOLROOT" ] || fail "no existe $VOLROOT — revisa BACKUP_DEST en deploy/backup-nas.sh"
mkdir -p "$BACKUP_DEST"
[ -d "$APPDIR/data/storage" ] || fail "no existe $APPDIR/data/storage"
[ -f "$APPDIR/.env" ] || fail "no existe $APPDIR/.env (secretos): un backup sin .env no restaura"

# Solo una corrida a la vez.
if ! mkdir "$STAGE" 2>/dev/null; then fail "ya hay un backup en curso ($STAGE existe)"; fi

log "── backup inicio → $NAME ──"

# Espacio libre en destino: tamaño del storage (sin chunked) + 1 GB de margen para BD y demás.
# (du sin --exclude, que no existe en busybox: se resta chunked/ aparte.)
STORAGE_KB=$(du -sk "$APPDIR/data/storage" 2>/dev/null | cut -f1); STORAGE_KB=${STORAGE_KB:-0}
CHUNK_KB=$(du -sk "$APPDIR/data/storage/chunked" 2>/dev/null | cut -f1); CHUNK_KB=${CHUNK_KB:-0}
STORAGE_KB=$((STORAGE_KB - CHUNK_KB))
FREE_KB=$(df -Pk "$BACKUP_DEST" | awk 'NR==2 {print $4}')
NEED_KB=$((STORAGE_KB + 1048576))
[ "$FREE_KB" -gt "$NEED_KB" ] || fail "espacio insuficiente en $BACKUP_DEST (libre $((FREE_KB/1024)) MB, se necesitan ~$((NEED_KB/1024)) MB)"

cd "$APPDIR"

# ── 1) Postgres: dump consistente (formato custom, ya comprimido) ──
mkdir -p "$STAGE/db" "$STAGE/redis"
docker compose -p "$PROJECT" exec -T postgres \
  pg_dump -U labstream -Fc labstream_os > "$STAGE/db/labstream_os.dump" \
  || fail "pg_dump falló (¿Postgres está corriendo?)"
[ -s "$STAGE/db/labstream_os.dump" ] || fail "el dump de Postgres salió vacío"

# ── 2) Redis: instantánea (mejor esfuerzo — solo pierde cachés/colas si falta) ──
docker compose -p "$PROJECT" exec -T redis redis-cli BGSAVE >/dev/null 2>&1 || true
sleep 5
cp "$APPDIR/data/redis/dump.rdb" "$STAGE/redis/dump.rdb" 2>/dev/null || true

# ── 3) Guía + script de restauración DENTRO del backup ──
cat > "$STAGE/restaurar.sh" <<'RESTORE'
#!/bin/bash
# Restaura Labstream OS desde ESTA carpeta descomprimida. Ejecutar como root:
#   bash restaurar.sh
# Requiere: Docker/Container Manager e internet (para re-descargar el código de GitHub
# y reconstruir la imagen; datos, archivos y secretos ya están aquí).
set -e
REPO="Labstream2026/labstream-os"
BRANCH="main"
DEST="/volume1/docker/labstream-os"
PROJECT="labstream-os"
HERE="$(cd "$(dirname "$0")" && pwd)"

echo "── 1/5 Código desde GitHub → $DEST"
TMP=/tmp/lsos-restore; rm -rf "$TMP"; mkdir -p "$TMP"
curl -fsSL "https://codeload.github.com/$REPO/tar.gz/refs/heads/$BRANCH" -o "$TMP/src.tgz"
tar xzf "$TMP/src.tgz" -C "$TMP"
mkdir -p "$DEST"
rsync -a --exclude '.env' --exclude 'data' "$TMP/labstream-os-$BRANCH/" "$DEST/"

echo "── 2/5 Secretos + archivos subidos"
cp "$HERE/.env" "$DEST/.env"
mkdir -p "$DEST/data/postgres" "$DEST/data/redis" "$DEST/data/storage"
rsync -a "$HERE/data/storage/" "$DEST/data/storage/"
chown -R 1001:1001 "$DEST/data/storage" 2>/dev/null || true
[ -f "$HERE/redis/dump.rdb" ] && cp "$HERE/redis/dump.rdb" "$DEST/data/redis/dump.rdb" || true

echo "── 3/5 Base de datos (Postgres + pg_restore)"
cd "$DEST"
docker compose -p "$PROJECT" up -d postgres redis
for i in $(seq 1 30); do
  docker compose -p "$PROJECT" exec -T postgres pg_isready -U labstream -d labstream_os >/dev/null 2>&1 && break
  sleep 2
done
docker compose -p "$PROJECT" exec -T postgres \
  pg_restore -U labstream -d labstream_os --clean --if-exists --no-owner < "$HERE/db/labstream_os.dump"

echo "── 4/5 Imagen de la app + migraciones pendientes"
docker compose -p "$PROJECT" build
docker compose -p "$PROJECT" run --rm -T -u root app npx prisma migrate deploy

echo "── 5/5 Arrancar todo"
docker compose -p "$PROJECT" up -d
echo "Listo. Revisa LEEME-RESTAURAR.md para lo que DSM guarda aparte (proxy inverso, tareas programadas)."
RESTORE
chmod +x "$STAGE/restaurar.sh"

cat > "$STAGE/LEEME-RESTAURAR.md" <<'LEEME'
# Restaurar Labstream OS desde este backup

1. Descomprime este archivo en el NAS (File Station lo abre con doble clic).
2. Entra a la carpeta descomprimida y ejecuta como root:  `bash restaurar.sh`
   (re-descarga el código de GitHub, reconstruye la imagen, restaura base de datos,
   archivos subidos y secretos, y arranca la app).

## Qué contiene
- `db/labstream_os.dump` — base de datos completa (proyectos, tareas, chat, usuarios…)
- `data/storage/` — archivos subidos por la app (sin `chunked/`, que son subidas a medias)
- `.env` — SECRETOS de producción (¡trata este backup como confidencial!)
- `docker-compose.yml` — el stack tal como corría
- `redis/dump.rdb` — cachés/colas (opcional; si falta no se pierde nada importante)

## Lo que DSM guarda APARTE (configurar a mano si el NAS es nuevo)
- Proxy inverso: os.labstreamsas.com → 127.0.0.1:3200 (y certificado SSL).
- Programador de tareas: deploy (`claude-job.sh`), este backup (`deploy/backup-nas.sh`)
  y los crons de la app (recurring-tasks / calendar-sync / marcebot con su
  `Authorization: Bearer $CRON_SECRET`).
- Contenedores vecinos que no son de este stack (OnlyOffice, Evolution/WhatsApp…).

## Notas
- NUNCA regeneres NEXTAUTH_SECRET del .env: cambiaría las llaves y dejaría ilegibles
  los secretos ya cifrados en la base de datos.
- `data/postgres` en crudo NO viaja en el backup a propósito: copiar un Postgres vivo
  da archivos corruptos; el dump + pg_restore es la restauración correcta.
LEEME

# ── 4) Reporte de pesos (queda dentro del backup y en el log) ──
DB_MB=$(du -sm "$STAGE/db" | cut -f1)
ST_MB=$((STORAGE_KB / 1024))
{
  echo "Backup: $NAME"
  echo "Fecha:  $(date '+%F %T')"
  echo "Base de datos (dump -Fc): ${DB_MB} MB"
  echo "Archivos (data/storage sin chunked): ${ST_MB} MB"
  echo "Imágenes docker (no viajan; se reconstruyen de GitHub):"
  { docker image ls --format '  {{.Repository}}:{{.Tag}} {{.Size}}' 2>/dev/null | head -5; } || true
} > "$STAGE/backup-info.txt"
log "pesos: BD dump ${DB_MB} MB · storage ${ST_MB} MB"

# ── 5) Empaquetar TODO en un solo archivo (primero .parcial; se renombra al verificar) ──
OUT="$BACKUP_DEST/$NAME.tar.gz"
# tar puede salir con código 1 si un archivo cambió mientras lo leía (app viva de noche):
# eso NO invalida el backup — solo un código >1 es fallo real.
set +e
nice -n 19 tar czf "$OUT.parcial" \
  --warning=no-file-changed \
  --exclude='data/storage/chunked' \
  --exclude='@eaDir' \
  --exclude='.DS_Store' \
  .env docker-compose.yml data/storage \
  -C "$STAGE" LEEME-RESTAURAR.md restaurar.sh backup-info.txt db redis
TAR_RC=$?
set -e
[ "$TAR_RC" -le 1 ] || fail "tar falló (código $TAR_RC)"

# Verificación de integridad antes de dar nada por bueno (y antes de borrar viejos).
gzip -t "$OUT.parcial" || fail "el archivo generado no pasa la verificación gzip"
mv "$OUT.parcial" "$OUT"
FINAL_MB=$(du -sm "$OUT" | cut -f1)
log "creado $NAME.tar.gz (${FINAL_MB} MB)"

# ── 6) Rotación: conservar las $RETAIN más recientes ──
cd "$BACKUP_DEST"
TOTAL=$(ls -1 labstream-backup-*.tar.gz 2>/dev/null | wc -l)
if [ "$TOTAL" -gt "$RETAIN" ]; then
  ls -1 labstream-backup-*.tar.gz | sort | head -n $((TOTAL - RETAIN)) | while read -r old; do
    rm -f "$old"
    log "rotación: borrado $old"
  done
fi

rm -rf "$STAGE"
log "── backup OK: $NAME.tar.gz (${FINAL_MB} MB) · $(ls -1 labstream-backup-*.tar.gz | wc -l) versiones en $BACKUP_DEST ──"
notify "Backup OK: $NAME.tar.gz (${FINAL_MB} MB)"
