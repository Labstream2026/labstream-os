#!/bin/bash
# Instala el panel «Labstream Correcciones» (Workflow Integration) en DaVinci Resolve STUDIO (Mac).
# Doble clic para ejecutar. Si macOS no lo deja: abre Terminal y ejecuta:  bash instalar-panel-mac.command
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
SRC="$DIR/com.labstream.correcciones"
BASE="/Library/Application Support/Blackmagic Design/DaVinci Resolve"
DEST="$BASE/Workflow Integration Plugins/com.labstream.correcciones"

echo "== Instalador · Labstream Correcciones para DaVinci Resolve =="
echo

if [ ! -d "$SRC" ]; then
  echo "ERROR: no encuentro 'com.labstream.correcciones' junto a este script."
  echo "Descomprime TODO el zip en una carpeta y reintenta."
  read -p "Enter para cerrar" _; exit 1
fi

if [ ! -d "/Applications/DaVinci Resolve/DaVinci Resolve.app" ] && [ ! -d "/Applications/DaVinci Resolve.app" ]; then
  echo "AVISO: no veo DaVinci Resolve en /Applications (continuo igual, por si esta en otra ruta)."
fi

# Busca el modulo nativo de Blackmagic (por-plataforma) en el propio Resolve del equipo.
NODE=""
for R in \
  "$BASE/Developer/Workflow Integrations" \
  "$HOME/Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Workflow Integrations" ; do
  if [ -d "$R" ]; then
    HIT="$(find "$R" -name 'WorkflowIntegration.node' 2>/dev/null | head -n 1)"
    if [ -n "$HIT" ]; then NODE="$HIT"; break; fi
  fi
done

if [ -z "$NODE" ]; then
  echo "No encuentro el SDK de Workflow Integrations (WorkflowIntegration.node)."
  echo
  echo "Esto casi siempre significa una de dos cosas:"
  echo "  1) Este Mac tiene la version GRATUITA de DaVinci Resolve."
  echo "     Los Workflow Integrations SOLO funcionan en DaVinci Resolve STUDIO (de pago)."
  echo "  2) Es Studio pero faltan los archivos de desarrollador del SDK."
  echo
  echo "Comprueba en Resolve: menu DaVinci Resolve > About. Debe decir 'Studio'."
  read -p "Enter para cerrar" _; exit 1
fi

if pgrep -x "Resolve" >/dev/null 2>&1 || pgrep -f "DaVinci Resolve" >/dev/null 2>&1; then
  echo "Aviso: DaVinci Resolve esta abierto. Tras instalar, CIERRALO por completo y vuelve a abrirlo."
  echo
fi

echo "Se necesita tu contrasena para copiar el panel a /Library (sudo)..."
sudo mkdir -p "$DEST"
sudo cp -Rf "$SRC/." "$DEST/"
sudo cp -f "$NODE" "$DEST/"

# Verificacion final.
FALTAN=""
for f in main.js manifest.xml preload.js timecode.js WorkflowIntegration.node; do
  [ -f "$DEST/$f" ] || FALTAN="$FALTAN $f"
done
if [ -n "$FALTAN" ]; then
  echo "ERROR: copia incompleta. Faltan:$FALTAN"
  read -p "Enter para cerrar" _; exit 1
fi

echo
echo "OK. Panel instalado en:"
echo "   $DEST"
echo "   (modulo de Blackmagic tomado de: $NODE)"
echo
echo "AHORA: cierra DaVinci Resolve por completo, vuelve a abrirlo y busca:"
echo "   Workspace > Workflow Integrations > Labstream Correcciones"
read -p "Enter para cerrar" _
