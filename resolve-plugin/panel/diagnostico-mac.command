#!/bin/bash
# Diagnostico (solo lectura, NO instala nada). Doble clic. Copia lo que sale y enviaselo
# a quien te dio el plugin. Si macOS no lo deja: en Terminal ejecuta  bash diagnostico-mac.command
echo "==== DIAGNOSTICO · Labstream Correcciones para DaVinci Resolve ===="
echo "Fecha: $(date)"
echo

if [ -d "/Applications/DaVinci Resolve/DaVinci Resolve.app" ] || [ -d "/Applications/DaVinci Resolve.app" ]; then
  echo "[OK ] DaVinci Resolve encontrado en /Applications."
else
  echo "[X  ] No veo DaVinci Resolve en /Applications."
fi

BASE="/Library/Application Support/Blackmagic Design/DaVinci Resolve"
NODE=""
for R in \
  "$BASE/Developer/Workflow Integrations" \
  "$HOME/Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Workflow Integrations" ; do
  if [ -d "$R" ]; then
    HIT="$(find "$R" -name 'WorkflowIntegration.node' 2>/dev/null | head -n 1)"
    if [ -n "$HIT" ]; then NODE="$HIT"; break; fi
  fi
done
if [ -n "$NODE" ]; then
  echo "[OK ] Es STUDIO: SDK de Workflow Integrations presente."
  echo "       ($NODE)"
else
  echo "[X  ] NO encuentro el SDK de Workflow Integrations."
  echo "       -> Probablemente es la version GRATUITA (los WI solo van en STUDIO),"
  echo "          o faltan los archivos de desarrollador. Revisa Resolve > About."
fi

DEST="$BASE/Workflow Integration Plugins/com.labstream.correcciones"
if [ -d "$DEST" ]; then
  echo "[OK ] Carpeta del plugin encontrada: $DEST"
  for f in main.js manifest.xml preload.js timecode.js WorkflowIntegration.node; do
    if [ -f "$DEST/$f" ]; then echo "       [ok] $f"; else echo "       [FALTA] $f"; fi
  done
else
  echo "[X  ] El plugin NO esta instalado (no existe su carpeta)."
  echo "       -> Ejecuta instalar-panel-mac.command y escribe tu contrasena."
fi

if pgrep -f "DaVinci Resolve" >/dev/null 2>&1; then
  echo "[i  ] Resolve esta ABIERTO. Tras instalar hay que CERRARLO por completo y reabrirlo."
else
  echo "[i  ] Resolve no esta abierto ahora."
fi

echo
echo "==== FIN. Copia todo lo de arriba y enviaselo a quien te dio el plugin. ===="
read -p "Enter para cerrar" _
