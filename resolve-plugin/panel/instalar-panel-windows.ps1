# Instala el panel «Labstream Correcciones» (Workflow Integration) en DaVinci Resolve STUDIO.
# Recomendado: doble clic en INSTALAR-Windows.bat (que llama a este script con permisos).
# Manual: clic derecho en este .ps1 -> Ejecutar con PowerShell.
$ErrorActionPreference = "Stop"

function Pausa { Read-Host "`nEnter para cerrar" | Out-Null }

# Auto-elevación: escribir en ProgramData requiere administrador.
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Write-Host "Pidiendo permisos de administrador..." -ForegroundColor Yellow
  try {
    Start-Process powershell -Verb RunAs -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$PSCommandPath`""
  } catch {
    Write-Host "No se concedieron permisos de administrador. La instalacion los necesita." -ForegroundColor Red
    Pausa
  }
  exit
}

Write-Host "== Instalador · Labstream Correcciones para DaVinci Resolve ==" -ForegroundColor Cyan
Write-Host ""

$src = Join-Path $PSScriptRoot "com.labstream.correcciones"
if (-not (Test-Path $src)) {
  Write-Host "ERROR: no encuentro la carpeta 'com.labstream.correcciones' junto a este script." -ForegroundColor Red
  Write-Host "Descomprime TODO el zip en una carpeta (no ejecutes desde dentro del zip) y reintenta."
  Pausa; exit 1
}

# ¿Está DaVinci Resolve instalado?
$resolveExe = "C:\Program Files\Blackmagic Design\DaVinci Resolve\Resolve.exe"
if (-not (Test-Path $resolveExe)) {
  Write-Host "ERROR: no encuentro DaVinci Resolve instalado en este equipo." -ForegroundColor Red
  Write-Host "Instala DaVinci Resolve STUDIO y vuelve a ejecutar el instalador."
  Pausa; exit 1
}

# Buscar el modulo nativo de Blackmagic (WorkflowIntegration.node). Es por-plataforma, así que se
# toma del PROPIO Resolve del equipo. Se busca en varias rutas por si cambian entre versiones.
$roots = @(
  (Join-Path $env:ProgramData "Blackmagic Design\DaVinci Resolve\Support\Developer\Workflow Integrations"),
  (Join-Path $env:APPDATA "Blackmagic Design\DaVinci Resolve\Support\Developer\Workflow Integrations"),
  "C:\Program Files\Blackmagic Design\DaVinci Resolve\Developer\Workflow Integrations"
)
$node = $null
foreach ($r in $roots) {
  if (Test-Path $r) {
    $hit = Get-ChildItem -Path $r -Recurse -Filter "WorkflowIntegration.node" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($hit) { $node = $hit.FullName; break }
  }
}

if (-not $node) {
  Write-Host "No encuentro el SDK de Workflow Integrations (WorkflowIntegration.node)." -ForegroundColor Red
  Write-Host ""
  Write-Host "Esto casi siempre significa una de dos cosas:" -ForegroundColor Yellow
  Write-Host "  1) Este equipo tiene la version GRATUITA de DaVinci Resolve."
  Write-Host "     Los Workflow Integrations SOLO funcionan en DaVinci Resolve STUDIO (de pago)."
  Write-Host "  2) Es Studio pero faltan los archivos de desarrollador del SDK."
  Write-Host ""
  Write-Host "Comprueba en Resolve: menu DaVinci Resolve > About. Debe decir 'Studio'."
  Pausa; exit 1
}

$base = Join-Path $env:ProgramData "Blackmagic Design\DaVinci Resolve\Support"
$dest = Join-Path $base "Workflow Integration Plugins\com.labstream.correcciones"

# Aviso si Resolve esta abierto: los plugins se cargan al arrancar, hay que reiniciarlo.
$running = Get-Process -Name Resolve -ErrorAction SilentlyContinue
if ($running) {
  Write-Host "Aviso: DaVinci Resolve esta abierto. Tras instalar, CIERRALO por completo y vuelve a abrirlo." -ForegroundColor Yellow
  Write-Host ""
}

try {
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  Copy-Item -Force -Recurse (Join-Path $src "*") $dest
  Copy-Item -Force $node $dest
} catch {
  Write-Host "ERROR al copiar los archivos: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Verifica que aceptaste el permiso de administrador."
  Pausa; exit 1
}

# Verificacion final: los archivos clave quedaron en su sitio.
$faltan = @()
foreach ($f in @("main.js", "manifest.xml", "preload.js", "timecode.js", "WorkflowIntegration.node")) {
  if (-not (Test-Path (Join-Path $dest $f))) { $faltan += $f }
}
if ($faltan.Count -gt 0) {
  Write-Host "ERROR: la copia quedo incompleta. Faltan: $($faltan -join ', ')" -ForegroundColor Red
  Pausa; exit 1
}

Write-Host "OK. Panel instalado en:" -ForegroundColor Green
Write-Host "  $dest"
Write-Host "  (modulo de Blackmagic tomado de: $node)"
Write-Host ""
Write-Host "AHORA: cierra DaVinci Resolve por completo, vuelve a abrirlo y busca:" -ForegroundColor Cyan
Write-Host "  Workspace > Workflow Integrations > Labstream Correcciones"
Pausa
