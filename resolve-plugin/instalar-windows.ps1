# Instala el panel «Labstream Correcciones» en DaVinci Resolve (usuario actual).
# Uso: clic derecho -> Ejecutar con PowerShell (o: powershell -ExecutionPolicy Bypass -File instalar-windows.ps1)
$ErrorActionPreference = "Stop"

$dest = Join-Path $env:APPDATA "Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts\Utility"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item -Force (Join-Path $PSScriptRoot "labstream_correcciones.py") $dest

Write-Host ""
Write-Host "Instalado en:" -ForegroundColor Green
Write-Host "  $dest"
Write-Host ""
Write-Host "Abre (o reinicia) DaVinci Resolve y ve a: Workspace > Scripts > labstream_correcciones"

# Aviso si no hay Python de verdad (el alias de la Microsoft Store no cuenta).
$py = Get-Command python -ErrorAction SilentlyContinue
$realPython = $false
if ($py -and $py.Source -notlike "*WindowsApps*") { $realPython = $true }
if (-not $realPython) {
  $py3 = Get-Command py -ErrorAction SilentlyContinue
  if ($py3) { $realPython = $true }
}
if (-not $realPython) {
  Write-Host ""
  Write-Host "AVISO: no se detecta Python 3 instalado." -ForegroundColor Yellow
  Write-Host "Resolve lo necesita para correr el panel: instala desde https://www.python.org/downloads/"
  Write-Host "marcando 'Add python.exe to PATH', y reinicia Resolve."
}
Read-Host "Enter para cerrar"
