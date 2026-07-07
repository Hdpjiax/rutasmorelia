# Bootstrap local Valhalla graph for Via Morelia route alignment.
param(
    [string]$PbfUrl = "https://download.geofabrik.de/north-america/mexico/michoacan-latest.osm.pbf",
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$venv = Join-Path $Root ".venv-valhalla"
$python = Join-Path $venv "Scripts\python.exe"

if (-not (Test-Path $python)) {
    Write-Host "Creando entorno .venv-valhalla..."
    python -m venv $venv
}

Write-Host "Instalando pyvalhalla..."
& $python -m pip install --upgrade pip
& $python -m pip install -r requirements-valhalla.txt

$args = @("-m", "route_pipeline", "bootstrap-map", "--download-url", $PbfUrl)
if ($Force) { $args += "--force" }

Write-Host "Construyendo grafo Valhalla (puede tardar 20-60 min)..."
& $python @args

Write-Host "Listo. Usa:"
Write-Host "  .\.venv-valhalla\Scripts\python.exe -m route_pipeline build --route <slug>"