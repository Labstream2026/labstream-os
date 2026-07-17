#!/bin/bash
# Instala el panel «Labstream Correcciones» (Workflow Integration) en DaVinci Resolve STUDIO (Mac).
# Doble clic para ejecutar (la primera vez: clic derecho -> Abrir). Pide la contraseña (sudo):
# escribe en /Library.
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
SRC="$DIR/com.labstream.correcciones"
BASE="/Library/Application Support/Blackmagic Design/DaVinci Resolve"
DEST="$BASE/Workflow Integration Plugins/com.labstream.correcciones"
NODE="$BASE/Developer/Workflow Integrations/Examples/SamplePlugin/WorkflowIntegration.node"

if [ ! -d "$SRC" ]; then echo "❌ No encuentro com.labstream.correcciones junto a este script."; read -p "Enter para cerrar" _; exit 1; fi
if [ ! -f "$NODE" ]; then
  echo "❌ No encuentro el SDK de Workflow Integrations de Resolve."
  echo "   Este panel requiere DaVinci Resolve STUDIO (el gratuito no carga Workflow Integrations)."
  read -p "Enter para cerrar" _; exit 1
fi

echo "Se necesita tu contraseña para copiar el panel a /Library (sudo)…"
sudo mkdir -p "$DEST"
sudo cp -Rf "$SRC/." "$DEST/"
# El módulo nativo de Blackmagic se toma del PROPIO Resolve instalado (es por-plataforma).
sudo cp -f "$NODE" "$DEST/"

echo
echo "✅ Panel instalado en:"
echo "   $DEST"
echo
echo "Cierra y abre DaVinci Resolve, y busca: Workspace ▸ Workflow Integrations ▸ Labstream Correcciones"
read -p "Enter para cerrar" _
