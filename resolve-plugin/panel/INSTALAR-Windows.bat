@echo off
REM Doble clic AQUI para instalar el panel Labstream Correcciones en DaVinci Resolve.
REM (Ejecutar un .ps1 con doble clic lo abre en el Bloc de notas; este .bat lo corre de verdad,
REM pidiendo permiso de administrador.)
setlocal
set "PS1=%~dp0instalar-panel-windows.ps1"
if not exist "%PS1%" (
  echo No encuentro instalar-panel-windows.ps1 junto a este archivo.
  echo Descomprime TODO el zip en una carpeta antes de ejecutar.
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%"
