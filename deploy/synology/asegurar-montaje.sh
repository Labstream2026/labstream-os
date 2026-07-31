#!/bin/sh
# ── Vigilante del montaje de LabTem en PRODUCCIÓN ────────────────────────────────────────
#
# Repone /volume1/entregas-labtem (los originales de Entregas_LAB, servidos por NFS desde
# LabTem) cuando no está. Existe porque NADA lo reponía: el montaje se hace a mano, DSM
# reescribe /etc/fstab a su antojo, y ninguna tarea programada lo cubría — un reinicio de
# producción dejaba la galería a oscuras hasta que alguien se acordara de la orden exacta.
#
# Corre cada 5 minutos desde /etc/crontab (campos con TAB, o DSM lo ignora):
#   */5	*	*	*	*	root	/volume1/docker/labstream-os/deploy/asegurar-montaje.sh
#
# No es solo para reinicios: también recupera una caída del NFS (LabTem reiniciado, red).
# Cuando el montaje está bien no hace NADA — ni una escritura, ni una línea de registro —,
# así que puede correr para siempre sin ensuciar nada.
#
# En LECTURA-ESCRITURA a propósito: la app escribe en ese disco desde el 30-jul-2026 (subidas,
# carpetas de cliente, papelera). Las guardas están en la app (permiso `escribir_discos` +
# centinela `.labstream-escritura`), no en el montaje. Ver deploy/labtem/README.md.

PUNTO=/volume1/entregas-labtem
ORIGEN=192.168.0.223:/volume5/Entregas_LAB
REGISTRO=/var/log/asegurar-montaje.log

# ¿Ya está montado? Nada que hacer. `mountpoint` existe en DSM 7; si faltara, la señal de
# respaldo es que el centinela de escritura solo existe en el disco REAL de LabTem — la
# carpeta local vacía que queda debajo cuando el montaje se cae no lo tiene.
if mountpoint -q "$PUNTO" 2>/dev/null || [ -f "$PUNTO/.labstream-escritura" ]; then
  exit 0
fi

mkdir -p "$PUNTO" 2>/dev/null
if mount -t nfs -o rw,nolock,vers=3 "$ORIGEN" "$PUNTO" 2>>"$REGISTRO"; then
  echo "$(date '+%Y-%m-%d %H:%M:%S')  montaje repuesto: $ORIGEN → $PUNTO" >>"$REGISTRO"
else
  # LabTem apagado o la red caída: se anota y se reintenta en 5 minutos. La app mientras
  # tanto se comporta como si LabTem no existiera (la sección no aparece), que es lo diseñado.
  echo "$(date '+%Y-%m-%d %H:%M:%S')  no se pudo montar (¿LabTem apagado?)" >>"$REGISTRO"
fi
