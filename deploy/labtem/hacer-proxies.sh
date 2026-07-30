#!/bin/bash
# ── LabTem · fabrica las copias ligeras de la galería de entregas ──────────────
#
# Recorre el material y, junto a cada pieza, deja en la carpeta hermana `.proxy` lo
# que el cliente verá desde el navegador. Los nombres NO son negociables: son los
# que calcula src/lib/nas-galeria.ts (proxyRelFor / posterRelFor).
#
#   <carpeta>/toma.mxf   →  <carpeta>/.proxy/toma.mxf.mp4         copia para reproducir
#                           <carpeta>/.proxy/toma.mxf.poster.jpg  fotograma de la cuadrícula
#                           <carpeta>/.proxy/toma.mxf.sprite.jpg  tira para el barrido con el ratón
#   <carpeta>/foto.dng   →  <carpeta>/.proxy/foto.dng.webp        copia que el navegador sí pinta
#
# Principios (por qué está escrito así):
#   - IDEMPOTENTE. Corre cada noche sobre los mismos 7 TB: si la copia ya está y es
#     más nueva que el original, ni se abre el archivo. Una segunda pasada sobre
#     material sin cambios tarda minutos, no horas.
#   - ATÓMICO. Todo se escribe en un temporal `.tmpNNN.<ext>` y se renombra al final.
#     La app nunca puede encontrarse media copia (el `mv` dentro de la misma carpeta
#     es atómico), y el temporal no coincide con ningún nombre que ella busque.
#   - NO SE MUERE. Un archivo que falla se anota y se sigue. Un R3D o un HEIC que
#     este ffmpeg no sepa abrir no puede costar la entrega entera.
#   - NO REPITE LO IMPOSIBLE. Un fallo deja una marca `.fallo` y una decisión de
#     saltarse algo deja una marca `.omitido`. Sin ellas, cada noche se volverían a
#     intentar (y a fallar) los mismos archivos durante horas.
#
# Sirve igual DENTRO del contenedor (ver compose.yaml) o directamente en el NAS:
#   RAIZ=/volume5/Entregas_LAB ESTADO=/volume5/docker/labtem-proxies/estado \
#   FFMPEG=/var/packages/ffmpeg5/target/bin/ffmpeg \
#   FFPROBE=/var/packages/ffmpeg5/target/bin/ffprobe bash hacer-proxies.sh
#
# Uso:  hacer-proxies.sh [subcarpeta]     (subcarpeta relativa a RAIZ, opcional)

# `set -e` NO: aquí el caso normal es que algún archivo falle, y eso no puede
# terminar el lote. Los fallos se manejan a mano, uno a uno.
set -uo pipefail

# Se usan expansiones de bash 4 (`${x,,}`). DSM 7.2 trae 4.4 y debian:12-slim 5.2;
# el aviso está para que nadie lo lance con `sh` y se lleve un resultado raro.
if [ "${BASH_VERSINFO[0]:-0}" -lt 4 ]; then
  echo "FATAL: hace falta bash 4 o superior (aquí hay ${BASH_VERSION:-desconocido})." >&2
  exit 1
fi

# ── Ajustes (todos por variable de entorno, para poder probar sin editar) ──────

RAIZ="${RAIZ:-/material}"
ESTADO="${ESTADO:-/estado}"
FFMPEG="${FFMPEG:-/opt/ffmpeg/bin/ffmpeg}"
FFPROBE="${FFPROBE:-/opt/ffmpeg/bin/ffprobe}"

# Video: el destino es un cliente mirando en portátil o móvil. El 4K se queda en el
# original (que sigue ahí para descargar); la copia se topa en 1080p y NUNCA amplía.
ANCHO_MAX="${ANCHO_MAX:-1920}"
ALTO_MAX="${ALTO_MAX:-1080}"
V_BITRATE="${V_BITRATE:-6M}"      # objetivo ≈ 45 MB por minuto
V_MAXRATE="${V_MAXRATE:-8M}"      # pico
V_BUFSIZE="${V_BUFSIZE:-12M}"     # 1,5 s de pico: absorbe un plano difícil sin dispararse
A_BITRATE="${A_BITRATE:-128k}"
GOP_SEG="${GOP_SEG:-2}"           # un keyframe cada 2 s → mover la barra cae cerca

# ── HLS: la escalera de calidades que se adapta al ancho de banda ─────────────
# El MP4 de arriba se sirve entero y NUNCA cambia de calidad: quien lo abre con datos
# móviles se descarga el 1080p igual, más lento. HLS parte el video en trozos y ofrece
# varias calidades a la vez; el reproductor mide la red y salta entre ellas.
#
# Se fabrica en UNA sola pasada: se decodifica una vez en la GPU y se escala y codifica
# tres veces ahí mismo. Medido en esta máquina sobre 30 s de 1080p, frente al MP4 solo:
# +77 % de tiempo y +45 % de disco. No es gratis, pero está lejos del triple que costaría
# hacer tres pasadas.
HACER_HLS="${HACER_HLS:-1}"
# Por debajo de este minutaje no se hace: en un clip corto el reproductor no llega ni a
# medir la red antes de que termine, y son los que más abundan (reels, cortes de redes).
HLS_MIN_SEG="${HLS_MIN_SEG:-45}"
# Trozos de 6 s: el valor que recomienda Apple. Más cortos reaccionan antes al cambio de
# red pero multiplican las peticiones; más largos tardan en corregir un mal momento.
HLS_TROZO="${HLS_TROZO:-6}"

# Poster: al 15 % de la duración, nunca el primer fotograma (negro o claqueta).
POSTER_ANCHO="${POSTER_ANCHO:-1280}"
# Tira de previsualización: 20 fotogramas en UNA fila. Número FIJO a propósito: así
# el CSS la coloca por porcentaje sin leer un JSON ni saber el tamaño real.
TIRA_FOTOGRAMAS="${TIRA_FOTOGRAMAS:-20}"
TIRA_ANCHO="${TIRA_ANCHO:-240}"

# Foto: 2560 px llena una pantalla retina a pantalla completa; un DNG de 45 MP cae
# por debajo de 1 MB. Calidad 82 es donde el artefacto deja de verse en piel y cielo.
FOTO_LADO="${FOTO_LADO:-2560}"
FOTO_CALIDAD="${FOTO_CALIDAD:-82}"

# Un archivo recién copiado por SMB puede estar a medias: se exige que lleve un rato
# quieto. Sin esto, una copia nocturna en curso genera copias truncadas.
MIN_EDAD_MIN="${MIN_EDAD_MIN:-10}"
# Margen de disco. Por debajo, la pasada ni empieza: llenar el volumen del material
# es mucho peor que quedarse una noche sin copias.
MIN_LIBRE_GB="${MIN_LIBRE_GB:-50}"
# Un ffmpeg colgado no puede comerse la madrugada entera.
TIMEOUT_VIDEO="${TIMEOUT_VIDEO:-14400}"   # 4 h por video
TIMEOUT_CORTO="${TIMEOUT_CORTO:-900}"     # 15 min por foto, póster o tira

FORZAR="${FORZAR:-0}"                       # 1 = rehacer aunque esté al día
REINTENTAR_FALLOS="${REINTENTAR_FALLOS:-0}" # 1 = ignorar las marcas .fallo
SOLO_LISTAR="${SOLO_LISTAR:-0}"             # 1 = decir qué haría, sin tocar nada
LIMITE="${LIMITE:-0}"                       # nº máx. de archivos por pasada (0 = sin tope)
USAR_QSV="${USAR_QSV:-1}"                   # 0 = forzar codificación por software
# Cómo se abre la GPU. Si esta forma no arranca en la máquina, se cambia AQUÍ (por
# variable de entorno, sin tocar el script): `qsv=hw` deja que ffmpeg elija el nodo.
# El nombre del dispositivo debe seguir siendo `hw`: es al que apunta -filter_hw_device.
QSV_INIT="${QSV_INIT:-qsv=hw:/dev/dri/renderD128}"

umask "${UMASK:-002}"

# ── Registro ──────────────────────────────────────────────────────────────────

mkdir -p "$ESTADO" 2>/dev/null
LOG="$ESTADO/hacer-proxies-$(date +%Y%m%d).log"
FALLOS="$ESTADO/fallos.tsv"
INICIO=$(date +%s)

log() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "$LOG" 2>/dev/null; }

anotar_fallo() { # archivo, tarea, motivo
  printf '%s\t%s\t%s\t%s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$2" "$1" "$3" >> "$FALLOS" 2>/dev/null
  log "  ✗ $2: $1 — $3"
}

hay() { command -v "$1" >/dev/null 2>&1; }

# ── Una sola pasada a la vez ──────────────────────────────────────────────────
# `mkdir` es atómico en cualquier sistema de archivos: sirve de candado sin flock
# (que en DSM no siempre está). Si la pasada de anoche sigue viva —7 TB pueden
# tardar días— la de hoy se retira en vez de pelearse por la GPU.
LOCK="$ESTADO/.candado"
TMP_ACTUAL=""

limpiar() {
  [ -n "$TMP_ACTUAL" ] && rm -f "$TMP_ACTUAL" 2>/dev/null
  rmdir "$LOCK" 2>/dev/null
  return 0
}

if ! mkdir "$LOCK" 2>/dev/null; then
  log "Ya hay una pasada en marcha ($LOCK). Esta se retira."
  log "Si fue un corte de luz y quedó huérfano:  rmdir '$LOCK'"
  exit 0
fi
trap limpiar EXIT
trap 'log "Interrumpido: se descarta el temporal a medias."; exit 130' INT TERM

# El trabajo de madrugada no puede dejar sin aliento al NAS si alguien está copiando
# material a la vez.
hay renice && renice -n 10 -p $$ >/dev/null 2>&1
hay ionice && ionice -c2 -n7 -p $$ >/dev/null 2>&1

# ── Comprobaciones antes de empezar ───────────────────────────────────────────

[ -x "$FFMPEG" ]  || { log "FATAL: no encuentro ffmpeg en $FFMPEG";   exit 1; }
[ -x "$FFPROBE" ] || { log "FATAL: no encuentro ffprobe en $FFPROBE"; exit 1; }

SUB="${1:-}"
DESTINO="$RAIZ"
[ -n "$SUB" ] && DESTINO="$RAIZ/${SUB#/}"
[ -d "$DESTINO" ] || { log "FATAL: no existe la carpeta $DESTINO"; exit 1; }
[ -w "$DESTINO" ] || { log "FATAL: $DESTINO no es escribible (¿montado en solo lectura?)"; exit 1; }

LIBRE_GB=$(df -Pk "$DESTINO" 2>/dev/null | awk 'NR==2{printf "%d", $4/1048576}')
if [ -n "${LIBRE_GB:-}" ] && [ "$LIBRE_GB" -lt "$MIN_LIBRE_GB" ] 2>/dev/null; then
  log "FATAL: quedan ${LIBRE_GB} GB libres (mínimo $MIN_LIBRE_GB). No se empieza."
  exit 1
fi

CAPS=$("$FFMPEG" -hide_banner -encoders 2>/dev/null)
if [ "$USAR_QSV" = "1" ]; then
  if ! grep -q ' h264_qsv' <<<"$CAPS"; then
    log "AVISO: este ffmpeg no trae h264_qsv → se codifica por software (mucho más lento)."
    USAR_QSV=0
  elif [ ! -e /dev/dri/renderD128 ]; then
    log "AVISO: no veo /dev/dri/renderD128 (¿el contenedor se creó por el asistente en vez de por Proyecto?) → software."
    USAR_QSV=0
  fi
fi
# Sin libwebp no hay copias de foto: la app pide un .webp de verdad, y renombrar un
# JPEG a .webp lo rompe (el navegador rechaza el tipo declarado por el nosniff).
HACER_FOTOS=1
if ! grep -q ' libwebp' <<<"$CAPS"; then
  log "AVISO: este ffmpeg no trae libwebp → se saltan las fotos RAW/HEIC (los videos siguen)."
  HACER_FOTOS=0
fi
hay timeout || log "AVISO: no hay 'timeout': un ffmpeg colgado no se cortará solo."

log "════ Pasada iniciada · carpeta: $DESTINO · QSV: $([ "$USAR_QSV" = 1 ] && echo sí || echo no) · libre: ${LIBRE_GB:-?} GB"
[ "$SOLO_LISTAR" = "1" ] && log "MODO LISTA: no se escribe nada."

# ── Qué es cada archivo (espejo de src/lib/nas-galeria.ts) ─────────────────────

# Fotos que el navegador NO pinta y por eso necesitan copia. Las que sí (jpg, png,
# webp, avif, gif) se sirven tal cual y aquí no se tocan.
FOTO_CONVERTIR=" heic heif tif tiff bmp dng cr2 cr3 nef arw raf orf rw2 "
# RAW con mosaico PROPIETARIO: ningún ffmpeg los decodifica —cada fabricante comprime el
# sensor a su manera—. Comprobado en la máquina con un ARW de Sony: «Invalid data found
# when processing input». Para estos se va DIRECTO a la vista previa incrustada (ver
# `jpeg_incrustado`), sin gastar un intento condenado que además ensuciaría el registro
# de fallos. El DNG se queda fuera de la lista a propósito: ffmpeg sí trae decodificador
# de DNG, así que a ese conviene intentarlo de verdad primero.
FOTO_RAW_PROPIETARIO=" cr2 cr3 nef arw raf orf rw2 srw pef "
# Todo lo que la app considera video. Se mira a TODOS (mp4 y mov incluidos): un
# ProRes 4K de 800 Mbps es «reproducible» y aun así inservible por internet. Quién
# se libra de la copia lo decide `original_ya_sirve`, mirando el archivo de verdad.
VIDEO_EXT=" mp4 m4v mov webm mkv avi wmv mts m2ts mxf mpg mpeg ogv prores braw r3d "

ext_de() { local n="${1##*.}"; printf '%s' "${n,,}"; }

# ── Estado de un destino ──────────────────────────────────────────────────────

# ¿No hay nada que hacer con este destino? Lo hay cuando falta, o cuando el original
# es más nuevo (alguien reemplazó la pieza por SMB y hay que rehacerla). Las marcas
# `.fallo` y `.omitido` cuentan como «al día» hasta que el original cambie: son las
# que impiden que la pasada de cada noche repita lo que ya se sabe que no toca.
al_dia() { # destino, origen
  [ "$FORZAR" = "1" ] && return 1
  [ -f "$1" ]          && [ ! "$2" -nt "$1" ]          && return 0
  [ -f "$1.omitido" ]  && [ ! "$2" -nt "$1.omitido" ]  && return 0
  if [ "$REINTENTAR_FALLOS" != "1" ]; then
    [ -f "$1.fallo" ] && [ ! "$2" -nt "$1.fallo" ] && return 0
  fi
  return 1
}

marcar() { # destino, sufijo (fallo|omitido), motivo
  mkdir -p "$(dirname "$1")" 2>/dev/null
  printf '%s\n' "$3" > "$1.$2" 2>/dev/null
}

# ── Lanzar ffmpeg ─────────────────────────────────────────────────────────────

# Escribe a un temporal y solo entonces lo pone en su sitio. Devuelve 0 si la copia
# quedó puesta; si no, deja la marca `.fallo` con el motivo y lo anota en el registro.
correr_ffmpeg() { # destino, tarea, timeout, args-de-ffmpeg...
  local dst="$1" tarea="$2" tmo="$3"; shift 3
  local ext="${dst##*.}"
  local tmp="${dst}.tmp$$.${ext}"
  local errf="$ESTADO/.ffmpeg-err.$$"
  local rc=0
  TMP_ACTUAL="$tmp"

  if hay timeout; then
    timeout -k 30 "$tmo" "$FFMPEG" -hide_banner -nostdin -y -loglevel error "$@" "$tmp" 2>"$errf"
    rc=$?
  else
    "$FFMPEG" -hide_banner -nostdin -y -loglevel error "$@" "$tmp" 2>"$errf"
    rc=$?
  fi

  if [ $rc -ne 0 ] || [ ! -s "$tmp" ]; then
    local motivo
    motivo=$(tr '\n' ' ' < "$errf" 2>/dev/null | tail -c 300)
    [ $rc -eq 124 ] && motivo="se pasó del tiempo máximo (${tmo}s)"
    [ -z "$motivo" ] && motivo="ffmpeg salió con código $rc"
    rm -f "$tmp" "$errf"; TMP_ACTUAL=""
    marcar "$dst" fallo "$motivo"
    anotar_fallo "$dst" "$tarea" "$motivo"
    return 1
  fi

  mv -f "$tmp" "$dst"
  rm -f "$errf" "$dst.fallo" "$dst.omitido"
  TMP_ACTUAL=""
  return 0
}

# El filtro de escala, compartido. `min(iw,…)` impide ampliar (subir un 720p a 1080p
# solo engorda el archivo), `force_original_aspect_ratio=decrease` conserva la forma
# y `force_divisible_by=2` evita el «height not divisible by 2» que mata a H.264 en
# fuentes DCI o verticales raras. Las comillas simples protegen las comas de min().
escala() { # ancho, alto
  printf "scale=w='min(iw,%s)':h='min(ih,%s)':force_original_aspect_ratio=decrease:force_divisible_by=2" "$1" "$2"
}

# ── Video ─────────────────────────────────────────────────────────────────────

# Un original ya servible se deja como está: la app cae sola al original cuando no
# hay copia, y así se ahorran horas de GPU y gigas de disco. Para librarse tiene que
# cumplirlo TODO: contenedor y códec que el navegador abre, 1080p o menos, tasa
# razonable y audio AAC (o sin audio).
original_ya_sirve() { # ext, vcodec, ancho, tasa_bits, acodec
  case " mp4 m4v mov " in *" $1 "*) ;; *) return 1;; esac
  [ "$2" = "h264" ] || return 1
  [ -n "$3" ] && [ "$3" -le "$ANCHO_MAX" ] 2>/dev/null || return 1
  [ -n "$4" ] && [ "$4" -le 9000000 ]      2>/dev/null || return 1
  case "$5" in aac|mp3|"") ;; *) return 1;; esac
  return 0
}

procesar_video() { # ruta absoluta
  local src="$1"
  local dir base pd mp4 poster tira
  dir=$(dirname "$src"); base=$(basename "$src")
  pd="$dir/.proxy"
  mp4="$pd/$base.mp4"; poster="$pd/$base.poster.jpg"; tira="$pd/$base.sprite.jpg"

  # Salida rápida: si las tres piezas están resueltas, el archivo ni se abre. Esto es
  # lo que hace que la segunda noche dure minutos en vez de días.
  local falta_mp4=0 falta_poster=0 falta_tira=0
  al_dia "$mp4"    "$src" || falta_mp4=1
  al_dia "$poster" "$src" || falta_poster=1
  al_dia "$tira"   "$src" || falta_tira=1
  if [ $falta_mp4 = 0 ] && [ $falta_poster = 0 ] && [ $falta_tira = 0 ]; then
    OMITIDOS=$((OMITIDOS+1)); return 0
  fi

  # Datos del original: UNA sola lectura para decidirlo todo.
  local w="" h="" vcodec="" rfr="" dur="" tasa="" acodec="" k v
  while IFS='=' read -r k v; do
    case "$k" in
      width) w="$v";; height) h="$v";; codec_name) vcodec="$v";;
      r_frame_rate) rfr="$v";; duration) dur="$v";; bit_rate) tasa="$v";;
    esac
  done < <("$FFPROBE" -v error -select_streams v:0 \
            -show_entries "stream=width,height,codec_name,r_frame_rate:format=duration,bit_rate" \
            -of default=noprint_wrappers=1 "$src" 2>/dev/null)

  if [ -z "$vcodec" ]; then
    if [ "$SOLO_LISTAR" != "1" ]; then
      # Se marcan las TRES piezas: si solo se marcara la copia, cada noche se volvería
      # a sondear el archivo por el póster y la tira, y a anotar el mismo fallo.
      marcar "$mp4"    fallo "ffprobe no reconoce el archivo"
      marcar "$poster" fallo "ffprobe no reconoce el archivo"
      marcar "$tira"   fallo "ffprobe no reconoce el archivo"
      anotar_fallo "$src" "video" "ffprobe no reconoce el archivo (formato que este ffmpeg no abre)"
    fi
    return 1
  fi
  acodec=$("$FFPROBE" -v error -select_streams a:0 -show_entries stream=codec_name \
            -of default=nk=1:nw=1 "$src" 2>/dev/null | head -1)

  if [ "$SOLO_LISTAR" = "1" ]; then
    log "  (lista) $src · ${w}x${h} $vcodec ${dur}s · falta: mp4=$falta_mp4 poster=$falta_poster tira=$falta_tira"
    return 0
  fi

  local fallo=0
  if [ $falta_mp4 = 1 ]; then
    if [ "$FORZAR" != "1" ] && original_ya_sirve "$(ext_de "$base")" "$vcodec" "$w" "$tasa" "$acodec"; then
      # No se hace copia. Se deja constancia para no volver a analizarlo cada noche.
      marcar "$mp4" omitido "el original ya es apto para el navegador ($vcodec ${w}x${h} ${tasa} bps)"
      log "  = original ya sirve: $base"
      OMITIDOS=$((OMITIDOS+1))
    else
      mkdir -p "$pd"
      local gop
      gop=$(awk -v r="${rfr:-25}" -v s="$GOP_SEG" 'BEGIN{split(r,a,"/"); f=(a[2]&&a[2]+0>0?a[1]/a[2]:a[1]+0); if(f<=0||f>1000)f=25; g=int(f*s+0.5); if(g<24)g=24; if(g>240)g=240; print g}')
      log "  → copia de $base (${w}x${h} $vcodec, GOP $gop)"
      if codificar_video "$src" "$mp4" "$gop" "$vcodec" "$w" "$h"; then
        CREADOS_VIDEO=$((CREADOS_VIDEO+1))
      else
        fallo=1
      fi
    fi
  fi

  # El póster y la tira salen de la copia si existe: decodificar un 1080p H.264 es
  # muchísimo más barato que volver a abrir el master. Y de paso se sabe SIN volver a
  # sondear el archivo qué códec y qué tamaño tiene lo que se va a abrir, que es justo
  # lo que hace falta para decidir si la GPU puede decodificarlo (ver `hacer_tira`).
  local fuente="$src" fcodec="$vcodec" fw="$w" fh="$h"
  if [ -f "$mp4" ]; then
    fuente="$mp4"
    fcodec="h264"   # la copia siempre sale H.264, ya encajada en ANCHO_MAX×ALTO_MAX
    local dcaja
    dcaja=$(caja "$w" "$h" 2>/dev/null) && { fw="${dcaja%%:*}"; fh="${dcaja##*:}"; }
  fi

  if [ $falta_poster = 1 ]; then
    mkdir -p "$pd"
    if hacer_poster "$fuente" "$poster" "$dur" "$fcodec" "$fw" "$fh"; then CREADOS_POSTER=$((CREADOS_POSTER+1)); else fallo=1; fi
  fi
  if [ $falta_tira = 1 ]; then
    mkdir -p "$pd"
    if hacer_tira "$fuente" "$tira" "$dur" "$fcodec" "$fw" "$fh"; then CREADOS_TIRA=$((CREADOS_TIRA+1)); fi
    # Una tira que no sale no es un fallo que merezca contarse: el póster ya cubre la
    # cuadrícula y los clips de menos de 2 s no tienen nada que barrer.
  fi

  # ── Escalera HLS (adaptativa) ──
  # Va DESPUÉS del MP4 y del póster a propósito: si la madrugada se corta, lo que queda
  # hecho es lo que hace falta para que la galería se vea. El HLS es la mejora, no la base.
  # Se salta en clips cortos (no da tiempo ni a medir la red) y no cuenta como fallo si no
  # sale: el MP4 sigue sirviendo el video igual, solo que sin adaptar.
  if [ "$HACER_HLS" = "1" ] && [ "$SOLO_LISTAR" != "1" ]; then
    local hls="$pd/$base.hls"
    local largo
    largo=$(awk -v d="${dur:-0}" 'BEGIN{printf "%d", d+0}')
    if [ "$largo" -ge "$HLS_MIN_SEG" ] 2>/dev/null && { [ "$FORZAR" = "1" ] || [ ! -f "$hls/master.m3u8" ] || [ "$src" -nt "$hls/master.m3u8" ]; }; then
      local gop_hls
      gop_hls=$(awk -v r="${rfr:-25}" -v s="$HLS_TROZO" 'BEGIN{split(r,a,"/"); f=(a[2]&&a[2]+0>0?a[1]/a[2]:a[1]+0); if(f<=0||f>1000)f=25; g=int(f*s+0.5); if(g<24)g=24; if(g>360)g=360; print g}')
      log "  ⇢ escalera HLS de $base"
      if hacer_hls "$src" "$hls" "$gop_hls" "$vcodec" "$w" "$h"; then
        CREADOS_HLS=$((CREADOS_HLS+1))
      else
        log "    ↳ sin escalera (no aplica o no salió); el MP4 sigue sirviendo"
      fi
    fi
  fi
  return $fallo
}

# Dimensiones de salida, calculadas AQUÍ y no por el filtro. `scale_qsv` no tiene
# `force_original_aspect_ratio`, así que la caja se resuelve a mano: encajar dentro de
# ANCHO_MAX×ALTO_MAX conservando la forma, sin ampliar nunca, y en números pares (H.264
# no admite impares y el vertical 2160×3840 es justo el caso que lo destapa).
caja() { # ancho, alto  →  "1920:1080"
  awk -v w="$1" -v h="$2" -v W="$ANCHO_MAX" -v H="$ALTO_MAX" 'BEGIN{
    w+=0; h+=0; if(w<=0||h<=0){ exit 1 }
    r=1; if(w>W) r=W/w; if(h*r>H) r=H/h; if(r>1) r=1;
    ow=int(w*r/2)*2; oh=int(h*r/2)*2; if(ow<2)ow=2; if(oh<2)oh=2;
    printf "%d:%d", ow, oh }'
}

codificar_video() { # origen, destino, gop, códec-de-entrada, ancho, alto
  local src="$1" dst="$2" gop="$3" vcodec="${4:-}" vw="${5:-0}" vh="${6:-0}"
  local esc; esc=$(escala "$ANCHO_MAX" "$ALTO_MAX")

  if [ "$USAR_QSV" = "1" ]; then
    # ── Todo en la GPU, cuando se puede ────────────────────────────────────────
    # La UHD 630 (Gen9.5) DECODIFICA H.264, HEVC, VP9, MPEG-2 y VC-1. No sabe de
    # ProRes, DNxHD ni de los RAW de cámara —y media entrega es eso—, así que el
    # decodificador por hardware se usa solo cuando el códec de entrada está en la
    # lista; para el resto, la ruta de siempre.
    #
    # Cuando aplica, el fotograma NUNCA sale de la memoria de vídeo: se decodifica y
    # se escala ahí mismo (scale_qsv), sin subir ni bajar nada por el bus. Medido en
    # esta máquina sobre 20 s de 1080p: la CPU consumida pasa de 20,2 s a 1,9 s
    # (−90 %) y encima tarda la mitad. Eso es lo que deja al NAS libre para servir
    # archivos mientras transcodifica de madrugada.
    local dims=""
    case "$vcodec" in
      h264|hevc|vp9|mpeg2video|vc1) dims=$(caja "$vw" "$vh" 2>/dev/null) ;;
    esac
    if [ -n "$dims" ]; then
      if correr_ffmpeg "$dst" "video" "$TIMEOUT_VIDEO" \
          -init_hw_device qsv=hw:/dev/dri/renderD128 -filter_hw_device hw \
          -hwaccel qsv -hwaccel_output_format qsv \
          -i "$src" \
          -map 0:v:0 -map 0:a:0? -sn -dn \
          -vf "scale_qsv=w=${dims%%:*}:h=${dims##*:}" \
          -c:v h264_qsv -profile:v high -b:v "$V_BITRATE" -maxrate "$V_MAXRATE" -bufsize "$V_BUFSIZE" \
          -g "$gop" -bf 2 -look_ahead 0 \
          -c:a aac -b:a "$A_BITRATE" -ac 2 -ar 48000 \
          -movflags +faststart -max_muxing_queue_size 1024; then
        return 0
      fi
      # La ruta todo-GPU es la más rápida pero también la más quisquillosa (un perfil
      # raro, 10 bits que este encoder no acepta, un archivo con la cabecera tocada).
      # Si falla NO se da por perdido el video: se borra la marca y se reintenta por la
      # ruta de abajo, que decodifica por software y sigue codificando en la GPU.
      rm -f "$dst.fallo"
      log "    ↳ la decodificación por GPU no pudo con este archivo; se decodifica por software"
    fi
  fi

  if [ "$USAR_QSV" = "1" ]; then
    # DECODIFICA LA CPU, CODIFICA LA GPU. A propósito: el decodificador de la UHD 630
    # no sabe de ProRes/DNxHD/MXF y media entrega es eso; el de software los abre
    # todos, y el trabajo caro (codificar) se lo queda igualmente Quick Sync.
    #
    # OJO con el orden `format=nv12,hwupload`: al revés, el escalador automático elige
    # BGRA 4:4:4 y Gen9.5 NO codifica AVC en 4:4:4 → «Error initializing the encoder».
    # Comprobado en esta máquina (150 fotogramas a 96 fps). No lo toques.
    if correr_ffmpeg "$dst" "video" "$TIMEOUT_VIDEO" \
        -init_hw_device qsv=hw:/dev/dri/renderD128 -filter_hw_device hw \
        -i "$src" \
        -map 0:v:0 -map 0:a:0? -sn -dn \
        -vf "${esc},format=nv12,hwupload=extra_hw_frames=64" \
        -c:v h264_qsv -profile:v high -b:v "$V_BITRATE" -maxrate "$V_MAXRATE" -bufsize "$V_BUFSIZE" \
        -g "$gop" -bf 2 -look_ahead 0 \
        -c:a aac -b:a "$A_BITRATE" -ac 2 -ar 48000 \
        -movflags +faststart -max_muxing_queue_size 1024; then
      return 0
    fi
    # Tres fallos seguidos de la GPU no son culpa del archivo: es que esta noche no hay
    # Quick Sync (driver, dispositivo sin pasar, otro proceso encima). Se sigue por
    # software en vez de fallar 4.000 veces igual.
    FALLOS_QSV=$((FALLOS_QSV+1))
    if [ "$FALLOS_QSV" -ge 3 ]; then
      log "AVISO: 3 fallos seguidos de Quick Sync → el resto de la pasada va por software."
      USAR_QSV=0
    fi
    rm -f "$dst.fallo"   # se reintenta por software antes de darlo por perdido
  fi

  # Respaldo por software: mucho más lento (y libx264 puede no estar en este ffmpeg),
  # pero salva la noche si la GPU no responde.
  correr_ffmpeg "$dst" "video-sw" "$TIMEOUT_VIDEO" \
    -i "$src" \
    -map 0:v:0 -map 0:a:0? -sn -dn \
    -vf "$esc" \
    -c:v libx264 -preset veryfast -profile:v high -pix_fmt yuv420p \
    -crf 23 -maxrate "$V_MAXRATE" -bufsize "$V_BUFSIZE" -g "$gop" \
    -c:a aac -b:a "$A_BITRATE" -ac 2 -ar 48000 \
    -movflags +faststart -max_muxing_queue_size 1024
}

# ── HLS ───────────────────────────────────────────────────────────────────────

# Fabrica la escalera de calidades. El destino es una CARPETA hermana del mp4:
#   <carpeta>/.proxy/toma.mxf.hls/master.m3u8   (+ v0/ v1/ v2/ con los trozos)
#
# Los peldaños se eligen según el original: no tiene sentido ofrecer 1080p de un 720p
# —sería ampliar— ni 480p de un vertical estrecho. Se construyen de mayor a menor y se
# descarta el que no aporte. Si solo queda un peldaño, no se hace HLS: para eso ya está
# el MP4, y un HLS de una sola calidad no adapta nada.
hacer_hls() { # origen, carpeta-destino, gop, códec, ancho, alto
  local src="$1" dir="$2" gop="$3" vcodec="${4:-}" vw="${5:-0}" vh="${6:-0}"
  local maestro="$dir/master.m3u8"

  # Solo con decodificación por GPU: con decodificación por software, tres escalados y
  # tres codificaciones a la vez ponen la CPU de rodillas y la madrugada no alcanza.
  case "$vcodec" in h264|hevc|vp9|mpeg2video|vc1) ;; *) return 1 ;; esac
  [ "$vw" -gt 0 ] 2>/dev/null && [ "$vh" -gt 0 ] 2>/dev/null || return 1

  # Peldaños candidatos: alto objetivo y tasa. El ancho sale de la forma del original.
  local escalones="1080:5000k 720:2500k 480:1000k"
  local filtros="" mapas="" varmap="" n=0 lado
  # En vertical manda el ancho; en horizontal, el alto. Se compara contra el lado corto
  # para que un 1080×1920 no se considere «menor que 1080».
  lado=$([ "$vh" -ge "$vw" ] && echo "$vw" || echo "$vh")

  local partes="" ultimo=0
  for e in $escalones; do
    local alto="${e%%:*}" tasa="${e##*:}"
    local dims oh
    # El ancho se deja holgado (4× el alto) para no recortar formatos de cine: manda el
    # ALTO del peldaño, y `caja` conserva la forma y no amplía jamás.
    dims=$(ANCHO_MAX=$((alto * 4)) ALTO_MAX="$alto" caja "$vw" "$vh") || continue
    oh="${dims##*:}"
    # `caja` limita al tamaño del original, así que dos peldaños seguidos pueden acabar
    # dando lo MISMO: en un 720p, el peldaño de 1080 y el de 720 salen ambos 1280×720, y
    # se ofrecerían dos calidades idénticas. Si este no baja al menos un 10 % respecto al
    # anterior, no aporta nada y se descarta.
    if [ "$ultimo" -gt 0 ] && [ $((oh * 100)) -ge $((ultimo * 90)) ]; then continue; fi
    ultimo="$oh"
    filtros="${filtros}[s$n]scale_qsv=w=${dims%%:*}:h=${oh}[v$n];"
    mapas="$mapas -map [v$n] -c:v:$n h264_qsv -b:v:$n $tasa -maxrate:v:$n $tasa -bufsize:v:$n $tasa"
    varmap="$varmap v:$n,a:$n"
    partes="$partes[s$n]"
    n=$((n + 1))
  done
  # Con un solo peldaño no hay nada que adaptar: el MP4 ya cubre ese caso.
  [ "$n" -ge 2 ] || return 1

  # El audio se duplica una vez por variante: cada calidad lleva el suyo, que es lo que
  # espera `var_stream_map`.
  local audios="" j=0
  while [ $j -lt $n ]; do audios="$audios -map a:0?"; j=$((j + 1)); done

  # El temporal va AL LADO de la carpeta final, jamás dentro. Estuvo dentro
  # (`$dir/.parcial`) y por eso la escalera no llegó a existir NI UNA VEZ: ffmpeg la
  # generaba entera y bien, y el paso final —`mv "$dir/.parcial" "$dir"`— es mover un
  # directorio dentro de sí mismo, que falla siempre. La función devolvía 1 y el registro
  # decía «no aplica o no salió», con lo que parecía que el material no daba para escalera.
  # Tampoco se crea ya `$dir` antes de tiempo: si ffmpeg falla no debe quedar una carpeta
  # `.hls` vacía haciéndose pasar por una escalera.
  local tmp="$dir.parcial"
  rm -rf "$tmp"; mkdir -p "$tmp" || return 1
  j=0; while [ $j -lt $n ]; do mkdir -p "$tmp/v$j"; j=$((j + 1)); done

  # shellcheck disable=SC2086 -- $mapas y $audios son listas de argumentos, no una cadena
  if timeout -k 30 "$TIMEOUT_VIDEO" "$FFMPEG" -hide_banner -nostdin -y -loglevel error \
      -init_hw_device qsv=hw:/dev/dri/renderD128 -filter_hw_device hw \
      -hwaccel qsv -hwaccel_output_format qsv \
      -i "$src" \
      -filter_complex "[0:v]split=$n${partes};${filtros%;}" \
      $mapas $audios -c:a aac -b:a "$A_BITRATE" -ac 2 -ar 48000 \
      -g "$gop" -bf 2 -look_ahead 0 -sn -dn \
      -f hls -hls_time "$HLS_TROZO" -hls_playlist_type vod -hls_flags independent_segments \
      -var_stream_map "${varmap# }" -master_pl_name master.m3u8 \
      -hls_segment_filename "$tmp/v%v/seg%03d.ts" "$tmp/v%v/index.m3u8" 2>>"$LOG"; then
    # Atómico como el resto: la app nunca puede toparse media escalera. Se cambia la
    # carpeta entera de golpe.
    rm -rf "$dir.viejo"
    [ -d "$dir" ] && mv "$dir" "$dir.viejo" 2>/dev/null
    mv "$tmp" "$dir" 2>/dev/null || { rm -rf "$dir"; mv "$dir.viejo" "$dir" 2>/dev/null; rm -rf "$tmp"; return 1; }
    rm -rf "$dir.viejo"
    return 0
  fi
  rm -rf "$tmp"
  return 1
}

# ¿Puede la GPU decodificar esto y en qué tamaño lo deja? Devuelve "ancho:alto" para la
# caja pedida, o nada —y entonces se va por software—. La Gen9.5 decodifica H.264, HEVC,
# VP9, MPEG-2 y VC-1; de ProRes, DNxHD o RAW no sabe. Como el póster y la tira casi
# siempre se sacan de la copia .mp4 (H.264 y ya reducida), en la práctica esto aplica
# a casi todo. `scale_qsv` no tiene `force_original_aspect_ratio`: la caja va a mano.
caja_qsv() { # códec, ancho, alto, ancho_max, alto_max
  case "$1" in h264|hevc|vp9|mpeg2video|vc1) ;; *) return 1 ;; esac
  [ "$USAR_QSV" = "1" ] || return 1
  ANCHO_MAX="$4" ALTO_MAX="$5" caja "$2" "$3" 2>/dev/null
}

hacer_poster() { # origen, destino, duración, códec-de-entrada, ancho, alto
  local src="$1" dst="$2" dur="${3:-}" vcodec="${4:-}" vw="${5:-0}" vh="${6:-0}"
  # NUNCA el primer fotograma: casi siempre es negro, claqueta o el destello del
  # arranque de cámara. Se entra al 15 % (mínimo 1 s, máximo 60 s) y encima se deja
  # que el filtro `thumbnail` elija el más representativo de los 60 siguientes, que
  # esquiva fundidos y fotogramas movidos.
  local pos esc dims
  pos=$(awk -v d="${dur:-0}" 'BEGIN{ d=d+0; if(d<=0){print "1"; exit} p=d*0.15; if(p<1)p=(d>2?1:d/2); if(p>60)p=60; printf "%.3f", p}')
  esc=$(escala "$POSTER_ANCHO" "$POSTER_ANCHO")

  # Por GPU se reduce ANTES de bajar el fotograma a memoria normal, así que `thumbnail`
  # elige ya sobre imágenes pequeñas. Medido: 1,43 s → 0,74 s de CPU. Es la mejora más
  # pequeña de las tres porque el `-ss` ya salta casi todo el archivo; se hace igual
  # porque cada segundo de CPU que no se gasta aquí es uno que queda para servir.
  if dims=$(caja_qsv "$vcodec" "$vw" "$vh" "$POSTER_ANCHO" "$POSTER_ANCHO"); then
    if correr_ffmpeg "$dst" "poster" "$TIMEOUT_CORTO" \
        -init_hw_device qsv=hw:/dev/dri/renderD128 -filter_hw_device hw \
        -hwaccel qsv -hwaccel_output_format qsv \
        -ss "$pos" -i "$src" -an -sn -dn \
        -vf "scale_qsv=w=${dims%%:*}:h=${dims##*:},hwdownload,format=nv12,thumbnail=60" \
        -frames:v 1 -q:v 3; then
      return 0
    fi
    rm -f "$dst.fallo"   # no se da por perdido: se reintenta por software, abajo
  fi

  correr_ffmpeg "$dst" "poster" "$TIMEOUT_CORTO" \
    -ss "$pos" -i "$src" -an -sn -dn \
    -vf "thumbnail=60,${esc}" -frames:v 1 -q:v 3
}

hacer_tira() { # origen, destino, duración, códec-de-entrada, ancho, alto
  local src="$1" dst="$2" dur="${3:-}" vcodec="${4:-}" vw="${5:-0}" vh="${6:-0}"
  local d rate dims
  d=$(awk -v x="${dur:-0}" 'BEGIN{printf "%d", x+0}')
  # Menos de 2 s no tiene nada que barrer: el póster ya lo cuenta todo. Queda marcado
  # para no volver a mirarlo cada noche.
  if [ "$d" -lt 2 ] 2>/dev/null; then
    marcar "$dst" omitido "clip demasiado corto (${dur}s) para una tira"
    return 1
  fi
  rate=$(awk -v d="$dur" -v n="$TIRA_FOTOGRAMAS" 'BEGIN{ d=d+0; if(d<=0)exit 1; r=n/d; if(r>60)r=60; printf "%.6f", r}') || return 1

  # ── La pieza MÁS CARA de toda la fábrica, y la que más gana con la GPU ────────────
  # Para repartir 20 fotogramas a lo largo del video hay que RECORRERLO ENTERO: `fps=`
  # descarta casi todo, pero para descartarlo hay que decodificarlo. Medido aquí sobre
  # un vertical de 50 min: por software son 948 s de CPU (≈4,6 núcleos durante 3 min),
  # por GPU son 56 s. **−94 % de CPU.** Eso era el pico de CPU con «GPU 0 %»: no era la
  # copia —que ya iba por GPU—, era esta tira.
  #
  # `fps=` va ANTES de escalar para tirar los fotogramas cuanto antes, y sí acepta
  # fotogramas que aún están en la tarjeta. Solo baja a memoria normal (`hwdownload`)
  # lo que sobrevive: 20 imágenes pequeñas, que es lo único que `tile` sabe pegar.
  if dims=$(caja_qsv "$vcodec" "$vw" "$vh" "$TIRA_ANCHO" 100000); then
    if correr_ffmpeg "$dst" "tira" "$TIMEOUT_CORTO" \
        -init_hw_device qsv=hw:/dev/dri/renderD128 -filter_hw_device hw \
        -hwaccel qsv -hwaccel_output_format qsv \
        -i "$src" -an -sn -dn \
        -vf "fps=${rate},scale_qsv=w=${dims%%:*}:h=${dims##*:},hwdownload,format=nv12,tile=${TIRA_FOTOGRAMAS}x1" \
        -frames:v 1 -q:v 5; then
      return 0
    fi
    rm -f "$dst.fallo"
    log "    ↳ la tira por GPU no salió; se rehace por software"
  fi

  # `fps=` reparte los 20 fotogramas por igual a lo largo del video y `tile=20x1` los
  # pega en UNA fila. Si el video se queda corto, tile rellena en negro: preferible a
  # una tira con menos casillas, porque el CSS cuenta con que siempre son 20.
  correr_ffmpeg "$dst" "tira" "$TIMEOUT_CORTO" \
    -i "$src" -an -sn -dn \
    -vf "fps=${rate},scale=${TIRA_ANCHO}:-2,tile=${TIRA_FOTOGRAMAS}x1" \
    -frames:v 1 -q:v 5
}

# ── Foto ──────────────────────────────────────────────────────────────────────

# Los RAW de cámara llevan DENTRO un JPEG de vista previa —en las sin-espejo modernas, a
# resolución completa— que es un JPEG normal y corriente. Se localiza por sus marcas de
# inicio (FF D8 FF) y de fin (FF D9). Ojo: esas parejas de bytes también salen por
# casualidad entre los datos del sensor, así que no basta con encontrarlas —se prueban de
# mayor a menor y se acepta la primera que ffprobe confirme como imagen de verdad—.
# Comprobado con un ARW de Sony de 24 MB: saca el previo de 4240×2832 en 0,04 s.
jpeg_incrustado() { # origen, destino  → 0 si dejó un JPEG utilizable
  local src="$1" out="$2" o fin len pares=""
  for o in $(LC_ALL=C grep -aboP '\xff\xd8\xff' "$src" 2>/dev/null | cut -d: -f1); do
    # `-m1` corta tras la primera LÍNEA con coincidencia, no tras la primera coincidencia:
    # con `-o`, si esa línea trae varias, las imprime TODAS. Y en datos binarios apenas hay
    # saltos de línea, así que una «línea» son megas enteros. Sin el `head -n1` de abajo,
    # `fin` llegaba a valer «5734\n5959\n6634», la aritmética de la línea siguiente
    # reventaba y —esto es lo grave— se llevaba por delante el bucle del recorrido: la
    # pasada terminaba anunciando «Fin» tan tranquila, con 102 de 449 fotos hechas.
    fin=$(LC_ALL=C tail -c "+$((o + 1))" "$src" 2>/dev/null | LC_ALL=C grep -aboPm1 '\xff\xd9' | cut -d: -f1 | head -n1)
    # Y aunque ya no debería llegar nada raro, no se hace aritmética con lo que venga de un
    # archivo sin comprobarlo antes: un original corrupto no puede tumbar la noche entera.
    case "$fin" in
      ''|*[!0-9]*) continue ;;
    esac
    pares="${pares}$((fin + 2)) $o
"
  done
  [ -n "$pares" ] || return 1

  while read -r len o; do
    [ -n "$len" ] || continue
    # Por debajo de 20 KB es la miniatura de la pantalla trasera de la cámara (160×120):
    # no sirve para una galería, y aceptarla taparía al previo bueno.
    [ "$len" -ge 20000 ] 2>/dev/null || continue
    dd if="$src" of="$out" bs=1M iflag=skip_bytes,count_bytes skip="$o" count="$len" status=none 2>/dev/null || continue
    case "$("$FFPROBE" -v error -select_streams v:0 -show_entries stream=width -of csv=p=0 "$out" 2>/dev/null)" in
      ''|0|*[!0-9]*) ;;      # no era una imagen: siguiente candidato
      *) return 0 ;;
    esac
  done <<< "$(printf '%s' "$pares" | sort -rn)"

  rm -f "$out"
  return 1
}

procesar_foto() { # ruta absoluta
  local src="$1"
  local dir base pd dst esc ext emb sin_emb=0
  dir=$(dirname "$src"); base=$(basename "$src")
  pd="$dir/.proxy"; dst="$pd/$base.webp"

  al_dia "$dst" "$src" && { OMITIDOS=$((OMITIDOS+1)); return 0; }
  [ "$SOLO_LISTAR" = "1" ] && { log "  (lista) $src"; return 0; }

  mkdir -p "$pd"
  esc=$(escala "$FOTO_LADO" "$FOTO_LADO")
  ext=$(ext_de "$base")
  emb="${TMPDIR:-/tmp}/emb$$.jpg"
  log "  → copia de $base"

  # AQUÍ NO HAY GPU QUE VALGA, y no es un fallo de configuración: NO EXISTE codificador
  # WebP por hardware —ni en esta tarjeta ni en ninguna, el formato no está en ningún
  # motor de vídeo— y el mosaico de un RAW tampoco lo decodifica la GPU. Las fotos son y
  # seguirán siendo trabajo de CPU. Da lo mismo: una foto se despacha en menos de un
  # segundo, mientras que un video son minutos.

  # Los RAW propietarios (ARW, CR2, NEF…) ni se intentan por las bravas: este ffmpeg no
  # los abre —comprobado— y el intento solo gastaría tiempo y anotaría un fallo que ya
  # sabemos. Se va derecho a la vista previa que llevan dentro.
  case "$FOTO_RAW_PROPIETARIO" in
    *" $ext "*)
      if jpeg_incrustado "$src" "$emb"; then
        log "    ↳ desde la vista previa incrustada en el RAW"
        if correr_ffmpeg "$dst" "foto-raw" "$TIMEOUT_CORTO" \
            -i "$emb" -an -vf "$esc" -frames:v 1 \
            -c:v libwebp -quality "$FOTO_CALIDAD" -compression_level 6 -preset photo; then
          rm -f "$emb"; CREADOS_FOTO=$((CREADOS_FOTO+1)); return 0
        fi
      fi
      rm -f "$emb"
      sin_emb=1   # ya se probó: no repetirlo más abajo
      ;;
  esac

  if correr_ffmpeg "$dst" "foto" "$TIMEOUT_CORTO" \
      -i "$src" -an \
      -vf "$esc" -frames:v 1 \
      -c:v libwebp -quality "$FOTO_CALIDAD" -compression_level 6 -preset photo; then
    CREADOS_FOTO=$((CREADOS_FOTO+1))
    return 0
  fi

  # Plan B para todo lo demás (el DNG, un HEIC raro, un TIFF con una variante que este
  # ffmpeg abre a medias): a lo mejor también lleva un JPEG dentro.
  if [ "$sin_emb" = 0 ] && jpeg_incrustado "$src" "$emb"; then
    log "    ↳ reintento desde la vista previa incrustada"
    if correr_ffmpeg "$dst" "foto-emb" "$TIMEOUT_CORTO" \
        -i "$emb" -an -vf "$esc" -frames:v 1 \
        -c:v libwebp -quality "$FOTO_CALIDAD" -compression_level 6 -preset photo; then
      rm -f "$emb"; CREADOS_FOTO=$((CREADOS_FOTO+1)); return 0
    fi
  fi
  rm -f "$emb"

  # Plan C: la miniatura que DSM ya generó en @eaDir (solo existe si la carpeta está
  # indexada por Synology Photos). No es el original, pero el cliente ve la foto en vez
  # de un hueco.
  local eadir="$dir/@eaDir/$base" alt="" cand
  for cand in SYNOPHOTO_THUMB_XL.jpg SYNOPHOTO_THUMB_B.jpg SYNOPHOTO_THUMB_M.jpg; do
    [ -f "$eadir/$cand" ] && { alt="$eadir/$cand"; break; }
  done
  [ -z "$alt" ] && return 1
  log "    ↳ reintento desde la miniatura de DSM (@eaDir)"
  if correr_ffmpeg "$dst" "foto-eadir" "$TIMEOUT_CORTO" \
      -i "$alt" -an -vf "$esc" -frames:v 1 \
      -c:v libwebp -quality "$FOTO_CALIDAD" -compression_level 6 -preset photo; then
    CREADOS_FOTO=$((CREADOS_FOTO+1))
    return 0
  fi
  return 1
}

# ── Recorrido ─────────────────────────────────────────────────────────────────

CREADOS_VIDEO=0; CREADOS_POSTER=0; CREADOS_TIRA=0; CREADOS_FOTO=0; CREADOS_HLS=0
OMITIDOS=0; FALLOS_N=0; VISTOS=0; FALLOS_QSV=0

# Se podan las mismas carpetas que ignora la app (nas-galeria.ts → isJunkName): la
# basura de Synology/macOS/Windows y TODO lo que empiece por punto — ahí entra
# `.proxy`, y sin esa poda acabaríamos haciendo copias de las copias.
# `-mmin +N` deja fuera lo que aún se está copiando por SMB.
#
# La lista llega por el DESCRIPTOR 9, no por la entrada estándar, y eso no es manía: con
# `done < <(find …)` la entrada del bucle es la lista, y **la heredan todos los programas
# que se lancen dentro**. Basta que uno lea de su entrada para que se coma las rutas que
# quedaban, y el recorrido termina antes de tiempo sin decir ni una palabra —pasó: 449
# fotos en el disco, `find` las devolvía todas, y la pasada se paraba en 102 con cara de
# haber acabado bien—. Con un descriptor propio, lo que hagan los hijos da igual.
while IFS= read -r -d '' -u 9 f; do
  if [ "$LIMITE" -gt 0 ] && [ "$VISTOS" -ge "$LIMITE" ]; then
    log "Tope de $LIMITE archivos alcanzado; el resto queda para la próxima pasada."
    break
  fi
  nombre=$(basename "$f")
  ext=$(ext_de "$nombre")
  case "$VIDEO_EXT" in
    *" $ext "*)
      VISTOS=$((VISTOS+1))
      procesar_video "$f" || FALLOS_N=$((FALLOS_N+1))
      continue;;
  esac
  case "$FOTO_CONVERTIR" in
    *" $ext "*)
      [ "$HACER_FOTOS" = "1" ] || continue
      VISTOS=$((VISTOS+1))
      procesar_foto "$f" || FALLOS_N=$((FALLOS_N+1))
      continue;;
  esac
done 9< <(find "$DESTINO" \
           \( -name '@eaDir' -o -name '#recycle' -o -name '#snapshot' -o -name '.*' \) -prune -o \
           -type f -mmin +"$MIN_EDAD_MIN" -print0 2>/dev/null | sort -z)

# ── Cierre ────────────────────────────────────────────────────────────────────

SEGS=$(( $(date +%s) - INICIO ))
log "════ Fin en $((SEGS/3600))h $(((SEGS%3600)/60))m · vistos:$VISTOS · videos:$CREADOS_VIDEO · pósters:$CREADOS_POSTER · tiras:$CREADOS_TIRA · escaleras:$CREADOS_HLS · fotos:$CREADOS_FOTO · al día:$OMITIDOS · fallos:$FALLOS_N"
[ "$FALLOS_N" -gt 0 ] && log "Detalle de los fallos: $FALLOS"

# Registros: 14 días. Más no sirve de nada y el volumen del material no es sitio
# para basura acumulada.
find "$ESTADO" -maxdepth 1 -name 'hacer-proxies-*.log' -mtime +14 -delete 2>/dev/null

exit 0
