#!/bin/bash
# ── Generador de copias ligeras para la galería — corre EN LABTEM, no en producción ──
#
# Recorre Entregas_LAB y, junto a cada pieza, fabrica en la carpeta hermana `.proxy/`:
#   video  «toma.mxf»  → .proxy/toma.mxf.mp4          (H.264 720p por Quick Sync, iGPU UHD 630)
#                      → .proxy/toma.mxf.poster.jpg   (fotograma para la cuadrícula)
#   foto   «foto.tif»  → .proxy/foto.tif.webp         (para RAW/TIFF/HEIC que el navegador no pinta)
#
# La app de Labstream OS solo LEE estos ficheros (nas-galeria.ts: proxyRelFor/posterRelFor).
# Sin ellos, la pieza sale como «preparando»; el original siempre queda intacto.
#
# Instalación (una vez, en DSM de LabTem → Panel de control → Programador de tareas):
#   Tarea programada → script de usuario (root), cada 10 minutos:
#     flock -n /tmp/genera-proxies.lock bash /volume1/homes/admin/genera-proxies.sh
#   (flock evita que dos corridas se pisen si una tanda larga no terminó.)
#
# Requiere el FFmpeg de jellyfin (ya instalado en LabTem) con soporte QSV. Si Quick Sync
# fallara (driver, permisos de /dev/dri), cae solo a libx264 por CPU: más lento, mismo archivo.
set -u

# ── Configuración ──
RAIZ="${RAIZ:-/volume5/Entregas_LAB}"          # raíz de la galería en LabTem
FFMPEG="${FFMPEG:-/var/packages/ffmpeg7/target/bin/ffmpeg}" # el de jellyfin (SynoCommunity); ajusta si vive en otra ruta
ALTO=720                                        # altura de la copia ligera
CALIDAD=23                                      # global_quality QSV / CRF x264 (menor = mejor)
LOG="${LOG:-/var/log/genera-proxies.log}"
MAX_POR_TANDA="${MAX_POR_TANDA:-40}"            # tope por corrida: tandas cortas y frecuentes

log() { echo "[$(date '+%F %T')] $*" >> "$LOG"; }

[ -x "$FFMPEG" ] || { log "ERROR: no encuentro ffmpeg en $FFMPEG"; exit 1; }
[ -d "$RAIZ" ] || { log "ERROR: no existe la raíz $RAIZ"; exit 1; }

# ¿Sirve Quick Sync? Prueba una vez por corrida; si no, todo por CPU.
QSV=0
if "$FFMPEG" -hide_banner -v error -init_hw_device qsv=hw -f lavfi -i nullsrc=s=64x64:d=0.1 \
     -vf hwupload=extra_hw_frames=8,format=qsv -c:v h264_qsv -f null - >/dev/null 2>&1; then
  QSV=1
fi
log "tanda inicia (qsv=$QSV)"

hechos=0

# Un proxy se fabrica primero con nombre temporal y se renombra al final: si la tanda muere a
# medias, la app nunca ve un .mp4 mocho (lo trataría como copia buena y el cliente vería un
# video cortado).
video_proxy() { # $1=original  $2=destino.mp4
  local tmp="${2}.parcial"
  if [ "$QSV" = 1 ]; then
    "$FFMPEG" -hide_banner -v error -y -init_hw_device qsv=hw -i "$1" \
      -map 0:v:0 -map 0:a:0? -vf "scale=-2:${ALTO}" \
      -c:v h264_qsv -global_quality "$CALIDAD" -preset veryfast \
      -c:a aac -b:a 128k -movflags +faststart -f mp4 "$tmp" 2>>"$LOG" || return 1
  else
    "$FFMPEG" -hide_banner -v error -y -i "$1" \
      -map 0:v:0 -map 0:a:0? -vf "scale=-2:${ALTO}" \
      -c:v libx264 -crf "$CALIDAD" -preset veryfast \
      -c:a aac -b:a 128k -movflags +faststart -f mp4 "$tmp" 2>>"$LOG" || return 1
  fi
  mv -f "$tmp" "$2"
}

poster() { # $1=original  $2=destino.jpg — fotograma del segundo 1 (o 0 si el clip es más corto)
  local tmp="${2}.parcial"
  "$FFMPEG" -hide_banner -v error -y -ss 1 -i "$1" -frames:v 1 -vf "scale=-2:${ALTO}" -q:v 4 -f image2 "$tmp" 2>/dev/null \
    || "$FFMPEG" -hide_banner -v error -y -i "$1" -frames:v 1 -vf "scale=-2:${ALTO}" -q:v 4 -f image2 "$tmp" 2>>"$LOG" || return 1
  mv -f "$tmp" "$2"
}

foto_webp() { # $1=original  $2=destino.webp — TIFF/HEIC y varios RAW; si ffmpeg no puede, se salta
  local tmp="${2}.parcial"
  "$FFMPEG" -hide_banner -v error -y -i "$1" -frames:v 1 -vf "scale='min(1600,iw)':-2" -c:v libwebp -q:v 80 -f image2 "$tmp" 2>>"$LOG" || return 1
  mv -f "$tmp" "$2"
}

# find sin -print0 raro: nombres con espacios sí, saltos de línea en nombres no (nadie los usa).
# Se excluyen las carpetas internas (.proxy, papelera, Synology).
find "$RAIZ" -type f \
  ! -path "*/.proxy/*" ! -path "*/#recycle/*" ! -path "*/@eaDir/*" ! -path "*/#snapshot/*" \
  ! -name ".*" ! -name "*.parcial" | while IFS= read -r f; do
  [ "$hechos" -ge "$MAX_POR_TANDA" ] && break
  dir=$(dirname "$f"); base=$(basename "$f")
  ext="${base##*.}"; ext=$(echo "$ext" | tr "[:upper:]" "[:lower:]")
  pdir="$dir/.proxy"

  case "$ext" in
    mp4|m4v|mov|webm|mkv|avi|wmv|mts|m2ts|mxf|mpg|mpeg|ogv)
      mkdir -p "$pdir"
      if [ ! -f "$pdir/$base.mp4" ]; then
        if video_proxy "$f" "$pdir/$base.mp4"; then log "proxy OK: $f"; hechos=$((hechos+1)); else log "proxy FALLO: $f"; fi
      fi
      if [ ! -f "$pdir/$base.poster.jpg" ]; then
        poster "$f" "$pdir/$base.poster.jpg" || log "poster FALLO: $f"
      fi
      ;;
    tif|tiff|heic|heif|bmp|dng|cr2|cr3|nef|arw|raf|orf|rw2)
      # OJO: ffmpeg abre TIFF/HEIC/BMP y ALGUNOS RAW (según build). Los RAW que no pueda se
      # quedan como «preparando» — para cubrirlos haría falta dcraw/darktable (pendiente).
      mkdir -p "$pdir"
      if [ ! -f "$pdir/$base.webp" ]; then
        if foto_webp "$f" "$pdir/$base.webp"; then log "webp OK: $f"; hechos=$((hechos+1)); else log "webp no pudo (formato): $f"; fi
      fi
      ;;
  esac
done

log "tanda termina"
