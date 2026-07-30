#!/bin/bash
# ── LabTem · lanzador de la pasada nocturna ───────────────────────────────────
#
# Esto es lo que llama la tarea de las 3:00, en vez de llamar a `docker exec`
# directamente. Existe por un motivo concreto: NO HAY OTRO MOMENTO SEGURO PARA
# ACTUALIZAR LA FÁBRICA.
#
#   - `compose.yaml` monta `hacer-proxies.sh` como ARCHIVO SUELTO, y un bind mount
#     de un archivo va por INODO: sustituirlo con `mv` deja al contenedor viendo
#     el viejo para siempre, aunque en el host se vea el nuevo. Hay que copiarlo
#     EN EL SITIO (`cp -f`, que trunca y reescribe el mismo inodo).
#   - Pero copiar en el sitio con una pasada en marcha es peor todavía: bash lee
#     el guion A MEDIDA QUE LO EJECUTA. Si el archivo cambia de tamaño bajo sus
#     pies, se le desplazan los bytes y acaba ejecutando basura.
#
# La única ventana buena es justo ANTES de arrancar, que es donde estamos aquí.
# Así que: se deja la versión nueva en `hacer-proxies.pendiente.sh` y este
# lanzador la pone en su sitio en la siguiente pasada, comprobando antes que se
# analiza sin errores y quedándose con la anterior si no.
#
# Instalar una versión nueva es, entonces, esto y nada más:
#   cat nuevo.sh > /volume5/docker/labtem-proxies/hacer-proxies.pendiente.sh
#
# Uso:  arrancar.sh ["Cliente X/Entrega mayo"]
set -u

DIR=$(cd "$(dirname "$0")" && pwd)
VIVO="$DIR/hacer-proxies.sh"
NUEVO="$DIR/hacer-proxies.pendiente.sh"
PREVIO="$DIR/hacer-proxies.anterior.sh"
DOCKER=${DOCKER:-/usr/local/bin/docker}
CAJA=${CAJA:-labtem-proxies}
REGISTRO="$DIR/estado/instalaciones.log"

nota() { mkdir -p "$(dirname "$REGISTRO")" 2>/dev/null; printf '%s %s\n' "$(date '+%F %T')" "$*" >> "$REGISTRO"; }

# ── Relevo, si hay algo esperando ────────────────────────────────────────────
if [ -s "$NUEVO" ] && ! cmp -s "$NUEVO" "$VIVO"; then
  if ! bash -n "$NUEVO" 2>/dev/null; then
    nota "pendiente DESCARTADO: no se analiza sin errores; sigue el de siempre"
  else
    cat "$VIVO" > "$PREVIO" 2>/dev/null
    # `cat >` y NO `cp -f`: hay que truncar y reescribir EL MISMO INODO. Cuando `cp -f` no
    # puede abrir el destino para escribir —pasa con las ACL de Synology— lo borra y lo crea
    # de nuevo, con inodo nuevo. Y como el compose monta este archivo suelto, el bind mount
    # se queda apuntando al inodo viejo y huérfano: el host enseña la versión nueva y el
    # contenedor ejecuta la vieja, para siempre y sin avisar. Pasó de verdad.
    if cat "$NUEVO" > "$VIVO"; then
      # Y aun así se comprueba, porque si el mount venía roto de antes esto tampoco lo
      # arregla. La única prueba que vale es preguntarle al contenedor qué ve ÉL.
      aqui=$(md5sum "$VIVO" | cut -d' ' -f1)
      alli=$("$DOCKER" exec "$CAJA" md5sum /opt/hacer-proxies.sh 2>/dev/null | cut -d' ' -f1)
      if [ "$aqui" != "$alli" ]; then
        nota "el contenedor veía otra versión (mount por inodo roto) → reiniciando"
        "$DOCKER" restart "$CAJA" >/dev/null 2>&1
        sleep 5
        alli=$("$DOCKER" exec "$CAJA" md5sum /opt/hacer-proxies.sh 2>/dev/null | cut -d' ' -f1)
      fi
      if [ "$aqui" = "$alli" ] && "$DOCKER" exec "$CAJA" bash -n /opt/hacer-proxies.sh 2>/dev/null; then
        nota "instalado · $aqui"
        rm -f "$NUEVO"
      else
        cat "$PREVIO" > "$VIVO"
        nota "REVERTIDO: el contenedor no lo ve o no lo pudo analizar"
      fi
    else
      nota "no se pudo escribir el pendiente (¿permisos?)"
    fi
  fi
fi

# ── La pasada ────────────────────────────────────────────────────────────────
exec "$DOCKER" exec "$CAJA" /opt/hacer-proxies.sh "$@"
