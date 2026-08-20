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

# ── Un deploy a la vez ──
# En el log se veían DOS formatos de hora mezclados: dos procesos lanzando esto a la vez (la
# tarea de DSM y una ejecución a mano). Sin candado, uno hace rsync sobre $DEST mientras el otro
# construye desde ahí — el build lee un árbol a medio copiar. `mkdir` es atómico en todo sistema
# de archivos, así que sirve de candado sin depender de flock (que en DSM no siempre está).
LOCK="/tmp/lsos-deploy.lock"
if ! mkdir "$LOCK" 2>/dev/null; then
  # Candado huérfano (el proceso murió sin limpiar): a las 2 h se considera muerto y se roba.
  if [ -n "$(find "$LOCK" -maxdepth 0 -mmin +120 2>/dev/null)" ]; then
    log "AVISO: candado viejo, se descarta"
    rm -rf "$LOCK" && mkdir "$LOCK"
  else
    log "ABORTA: ya hay un deploy en marcha"
    echo "Ya hay un deploy en marcha. Espera a que termine."
    exit 1
  fi
fi
# Se suelta pase lo que pase (incluido el corte de set -e).
trap 'rm -rf "$LOCK"' EXIT

log "deploy inicio"

# 1) Descargar el código más reciente de GitHub (repo público).
rm -rf "$TMP"
mkdir -p "$TMP"
curl -fsSL "https://codeload.github.com/$REPO/tar.gz/refs/heads/$BRANCH" -o "$TMP/src.tgz"
tar xzf "$TMP/src.tgz" -C "$TMP"
SRC="$TMP/labstream-os-$BRANCH"

# ── Qué commit queda desplegado ──
# El SHA viene DENTRO del propio tarball (cabecera pax global: «comment=<sha>» en los
# primeros bytes): ni red ni cuotas. Antes se preguntaba a la API de GitHub, que sin token
# aguanta 60 consultas/hora por IP — un día de muchos deploys la agotó y produjo un
# «desconocido» en producción (2026-08-19). La API queda de RESPALDO por si el tarball
# viniera algún día sin cabecera; si todo falla, NO se tumba el deploy: queda "desconocido".
# Se escribe en public/version.txt, que el Dockerfile hornea en la imagen: /api/version lo
# enseña sin entrar al NAS, y el aviso de «recarga» de las pestañas compara contra él.
SHA=$(gunzip -c "$TMP/src.tgz" 2>/dev/null | head -c 2048 | tr -c '0-9a-f' '\n' | grep -Ex '[0-9a-f]{40}' | head -1)
[ -n "$SHA" ] || SHA=$(curl -fsSL "https://api.github.com/repos/$REPO/commits/$BRANCH" 2>/dev/null \
      | sed -n 's/.*"sha": *"\([0-9a-f]\{40\}\)".*/\1/p' | head -1)
[ -n "$SHA" ] || SHA="desconocido"
printf '%s\n%s\n' "$SHA" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$SRC/public/version.txt"
log "commit $SHA"

# 2) Copiar al destino SIN tocar secretos (.env) ni datos persistentes.
#    --delete es OBLIGATORIO: sin él, un archivo BORRADO del repo quedaba fantasma en
#    $DEST para siempre y el build lo seguía compilando (así nos tumbó el deploy
#    guiones-panel.tsx, borrado de main pero vivo en el NAS con un import ya inexistente).
#    Los --exclude protegen doble: ni se copian ni se borran (.env, data, …).
mkdir -p "$DEST"
rsync -a --delete \
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
# La salida del build TAMBIÉN al log. Sin esto, un build fallido dejaba en el log solo la línea
# "deploy inicio" y nada más: trece intentos seguidos murieron aquí de forma invisible y parecía
# que el deploy no se ejecutaba. Ahora el motivo queda escrito.
log "build"
docker compose -p "$PROJECT" build >> "$LOG" 2>&1

# 5) Aplicar migraciones de Prisma ANTES de cambiar el código, con la imagen nueva.
#    ORDEN CRÍTICO: antes se hacía `up` primero y `migrate` después; si la migración
#    fallaba (o el exec no corría), quedaba el CÓDIGO NUEVO con la BD VIEJA → errores
#    de runtime en toda la app (columnas inexistentes). Ahora, si la migración falla,
#    el `set -e` corta aquí y la app VIEJA sigue intacta (nada se rompe).
#    La salida queda en el log para diagnosticar. -T = sin TTY; -u root = permisos.
log "migraciones"
docker compose -p "$PROJECT" run --rm -T -u root app npx prisma migrate deploy >> "$LOG" 2>&1

# 6) Levantar el código nuevo (solo se llega aquí si las migraciones pasaron).
log "levantar"
docker compose -p "$PROJECT" up -d >> "$LOG" 2>&1

# 7) Limpieza: cada rebuild deja la imagen anterior como <none> y capas de caché
#    sin usar. Sin esto se acumulan gigas con cada deploy. Se purga aquí.
#    • "|| true": la limpieza nunca debe tumbar el deploy (set -e).
#    • NO se usa --volumes: los datos persistentes (Postgres, Redis, subidas) están
#      en bind mounts (./data) y quedan intactos.
#    • builder prune CON TOPE (--keep-storage, Docker 24 del NAS lo trae): la poda
#      total borraba TODA la caché en cada deploy y el siguiente build volvía a bajar
#      cada paquete de internet — de ahí salían los ECONNRESET de npm a mitad de build.
#      Con tope, la caché reciente sobrevive entre deploys y solo se poda el exceso.
#      Si el flag desapareciera en un Docker futuro, se cae a la poda total de antes
#      (peor caché es mejor que caché infinita).
log "limpieza docker"
docker image prune -f >> "$LOG" 2>&1 || true
docker builder prune -f --keep-storage 12G >> "$LOG" 2>&1 || docker builder prune -f >> "$LOG" 2>&1 || true

log "deploy OK"
echo "Deploy completado."
