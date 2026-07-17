#!/bin/bash
# Instala el panel «Labstream Correcciones» en DaVinci Resolve (usuario actual, Mac).
# Doble clic para ejecutar (la primera vez: clic derecho -> Abrir).
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
DEST="$HOME/Library/Application Support/Blackmagic Design/DaVinci Resolve/Fusion/Scripts/Utility"
mkdir -p "$DEST"
cp -f "$DIR/labstream_correcciones.py" "$DEST/"
echo
echo "✅ Instalado en:"
echo "   $DEST"
echo
echo "Abre (o reinicia) DaVinci Resolve y ve a: Workspace ▸ Scripts ▸ labstream_correcciones"
if ! command -v python3 >/dev/null 2>&1; then
  echo
  echo "⚠️  No se detecta Python 3. Resolve lo necesita para correr el panel:"
  echo "   instala las herramientas con:  xcode-select --install"
  echo "   (o desde python.org — en ese caso ejecuta también su Install Certificates.command)"
fi
echo
read -p "Enter para cerrar" _
