# Diagnóstico (solo lectura, NO instala nada). Reporta por qué el panel no aparece en Resolve.
# Copia TODO lo que sale y enviaselo a quien te dio el plugin.
$ErrorActionPreference = "SilentlyContinue"

Write-Host "==== DIAGNOSTICO · Labstream Correcciones para DaVinci Resolve ===="
Write-Host ("Fecha: {0}" -f (Get-Date))
Write-Host ""

# 1) Resolve instalado y version
$exe = "C:\Program Files\Blackmagic Design\DaVinci Resolve\Resolve.exe"
if (Test-Path $exe) {
  $v = (Get-Item $exe).VersionInfo.ProductVersion
  Write-Host ("[OK ] DaVinci Resolve instalado. Version: {0}" -f $v)
} else {
  Write-Host "[X  ] DaVinci Resolve NO esta en la ruta estandar de Program Files."
}

# 2) Studio? (el SDK de Workflow Integrations solo existe en Studio)
$node = $null
$roots = @(
  (Join-Path $env:ProgramData "Blackmagic Design\DaVinci Resolve\Support\Developer\Workflow Integrations"),
  (Join-Path $env:APPDATA "Blackmagic Design\DaVinci Resolve\Support\Developer\Workflow Integrations"),
  "C:\Program Files\Blackmagic Design\DaVinci Resolve\Developer\Workflow Integrations"
)
foreach ($r in $roots) {
  if (Test-Path $r) {
    $hit = Get-ChildItem $r -Recurse -Filter "WorkflowIntegration.node" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($hit) { $node = $hit.FullName; break }
  }
}
if ($node) {
  Write-Host ("[OK ] Es STUDIO: SDK de Workflow Integrations presente.")
  Write-Host ("       ({0})" -f $node)
} else {
  Write-Host "[X  ] NO encuentro el SDK de Workflow Integrations."
  Write-Host "       -> Probablemente es la version GRATUITA (los WI solo van en STUDIO),"
  Write-Host "          o faltan los archivos de desarrollador. Revisa Resolve > About."
}

# 3) El plugin, instalado?
$dest = Join-Path $env:ProgramData "Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins\com.labstream.correcciones"
if (Test-Path $dest) {
  Write-Host ("[OK ] Carpeta del plugin encontrada: {0}" -f $dest)
  foreach ($f in @("main.js","manifest.xml","preload.js","timecode.js","WorkflowIntegration.node")) {
    $p = Join-Path $dest $f
    if (Test-Path $p) { Write-Host ("       [ok] {0}" -f $f) } else { Write-Host ("       [FALTA] {0}" -f $f) }
  }
} else {
  Write-Host "[X  ] El plugin NO esta instalado (no existe su carpeta)."
  Write-Host "       -> Ejecuta INSTALAR-Windows.bat (doble clic) y acepta el permiso de administrador."
}

# 4) Resolve abierto ahora?
if (Get-Process -Name Resolve -ErrorAction SilentlyContinue) {
  Write-Host "[i  ] Resolve esta ABIERTO. Tras instalar hay que CERRARLO por completo y reabrirlo."
} else {
  Write-Host "[i  ] Resolve no esta abierto ahora."
}

Write-Host ""
Write-Host "==== FIN. Copia todo lo de arriba y enviaselo a quien te dio el plugin. ===="
Read-Host "Enter para cerrar" | Out-Null
