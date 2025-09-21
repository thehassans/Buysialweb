# Plesk Git post-deploy script (Windows / PowerShell)
# - Installs backend deps (production)
# - Builds frontend
# - Ensures runtime dirs exist
# - Hints IIS/iisnode/Node restart by touching tmp\restart.txt in backend

$ErrorActionPreference = 'Stop'

function Assert-Command($name){
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)){
    Write-Error "[deploy] '$name' is not available in PATH" -ErrorAction Stop
  }
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = (Resolve-Path (Join-Path $ScriptDir '..')).Path
$Backend   = Join-Path $RootDir 'backend'
$Frontend  = Join-Path $RootDir 'frontend'

Write-Host "[deploy] Repo root: $RootDir"

Assert-Command node
Assert-Command npm

if (Test-Path $Backend){
  Write-Host "[deploy] Installing backend deps (production)..."
  Push-Location $Backend
  try {
    npm ci --omit=dev
  } finally { Pop-Location }
  Write-Host "[deploy] Ensuring runtime directories..."
  New-Item -ItemType Directory -Force -Path (Join-Path $Backend 'uploads') | Out-Null
  New-Item -ItemType Directory -Force -Path (Join-Path $Backend 'wa_auth') | Out-Null
} else {
  Write-Warning "[deploy] backend directory not found at $Backend"
}

if (Test-Path $Frontend){
  Write-Host "[deploy] Installing frontend deps..."
  Push-Location $Frontend
  try {
    npm ci
    Write-Host "[deploy] Building frontend..."
    npm run build
  } finally { Pop-Location }
} else {
  Write-Warning "[deploy] frontend directory not found at $Frontend"
}

# Restart hint: iisnode/Node app often restarts when files change; we also touch a restart marker
if (Test-Path $Backend){
  $tmp = Join-Path $Backend 'tmp'
  if (-not (Test-Path $tmp)){ New-Item -ItemType Directory -Force -Path $tmp | Out-Null }
  $marker = Join-Path $tmp 'restart.txt'
  (Get-Date).ToString('o') | Set-Content -Encoding UTF8 $marker
  Write-Host "[deploy] Touched restart marker: $marker"
}

Write-Host "[deploy] Done."
