# Instala el panel «Labstream Correcciones» (Workflow Integration) en DaVinci Resolve STUDIO.
# Uso: clic derecho -> Ejecutar con PowerShell. Pide permisos de administrador (escribe en ProgramData).
$ErrorActionPreference = "Stop"

# Auto-elevación: ProgramData requiere admin.
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Start-Process powershell -Verb RunAs -ArgumentList "-ExecutionPolicy", "Bypass", "-File", "`"$PSCommandPath`""
  exit
}

$src  = Join-Path $PSScriptRoot "com.labstream.correcciones"
$base = Join-Path $env:ProgramData "Blackmagic Design\DaVinci Resolve\Support"
$dest = Join-Path $base "Workflow Integration Plugins\com.labstream.correcciones"
$node = Join-Path $base "Developer\Workflow Integrations\Examples\SamplePlugin\WorkflowIntegration.node"

if (-not (Test-Path $src)) { Write-Host "No encuentro la carpeta com.labstream.correcciones junto a este script." -ForegroundColor Red; Read-Host "Enter para cerrar"; exit 1 }
if (-not (Test-Path $node)) {
  Write-Host "No encuentro el SDK de Workflow Integrations de Resolve." -ForegroundColor Red
  Write-Host "Este panel requiere DaVinci Resolve STUDIO (el gratuito no carga Workflow Integrations)."
  Read-Host "Enter para cerrar"; exit 1
}

New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item -Force -Recurse (Join-Path $src "*") $dest
# El módulo nativo de Blackmagic se toma del PROPIO Resolve instalado (es por-plataforma).
Copy-Item -Force $node $dest

Write-Host ""
Write-Host "Panel instalado en:" -ForegroundColor Green
Write-Host "  $dest"
Write-Host ""
Write-Host "Cierra y abre DaVinci Resolve, y busca: Workspace > Workflow Integrations > Labstream Correcciones"
Read-Host "Enter para cerrar"
