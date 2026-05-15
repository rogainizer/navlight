param(
  [switch]$SkipDockerDb,
  [switch]$InstallDependencies
)

$ErrorActionPreference = 'Stop'

function Test-CommandAvailable {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Test-PortInUse {
  param(
    [Parameter(Mandatory = $true)]
    [int]$Port
  )

  return $null -ne (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Test-DockerDaemonAvailable {
  try {
    docker info | Out-Null
    return $true
  }
  catch {
    return $false
  }
}

function Ensure-FileFromTemplate {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [Parameter(Mandatory = $true)]
    [string]$TemplatePath,
    [string]$Description
  )

  if (Test-Path -LiteralPath $Path) {
    return
  }

  Copy-Item -LiteralPath $TemplatePath -Destination $Path
  Write-Host ("Created {0} at {1} from {2}" -f $Description, $Path, $TemplatePath)
}

function Ensure-FileContent {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [Parameter(Mandatory = $true)]
    [string]$Content,
    [string]$Description,
    [switch]$Overwrite
  )

  if ((Test-Path -LiteralPath $Path) -and -not $Overwrite) {
    return
  }

  Set-Content -LiteralPath $Path -Value $Content
  Write-Host ("Created {0} at {1}" -f $Description, $Path)
}

function Ensure-Dependencies {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectDir,
    [Parameter(Mandatory = $true)]
    [string]$ProjectName
  )

  if (Test-Path -LiteralPath (Join-Path $ProjectDir 'node_modules')) {
    return
  }

  if (-not $InstallDependencies) {
    throw ("{0} dependencies are missing. Re-run with -InstallDependencies or run npm install in {1} first." -f $ProjectName, $ProjectDir)
  }

  Write-Host ("Installing dependencies for {0}..." -f $ProjectName)
  Push-Location $ProjectDir
  try {
    npm install
  }
  finally {
    Pop-Location
  }
}

function Start-DevTerminal {
  param(
    [Parameter(Mandatory = $true)]
    [string]$WorkingDirectory,
    [Parameter(Mandatory = $true)]
    [string]$Title,
    [Parameter(Mandatory = $true)]
    [string]$Command
  )

  $pwshPath = Join-Path $env:ProgramFiles 'PowerShell\7\pwsh.exe'

  $shell = if (Test-Path -LiteralPath $pwshPath) {
    $pwshPath
  }
  else {
    'powershell.exe'
  }

  $escapedDirectory = $WorkingDirectory.Replace("'", "''")
  $commandText = "`$Host.UI.RawUI.WindowTitle = '{0}'; Set-Location -LiteralPath '{1}'; {2}" -f $Title, $escapedDirectory, $Command
  Start-Process -FilePath $shell -ArgumentList @('-NoExit', '-Command', $commandText) | Out-Null
}

$repoRoot = $PSScriptRoot
$frontendDir = Join-Path $repoRoot 'Navlight-Booking'
$backendDir = Join-Path $repoRoot 'Navlight-Booking-Server'
$rootEnvPath = Join-Path $repoRoot '.env'
$backendEnvPath = Join-Path $backendDir '.env'
$backendEnvExamplePath = Join-Path $backendDir '.env.example'
$frontendEnvLocalPath = Join-Path $frontendDir '.env.local'

if (-not $repoRoot) {
  throw 'Unable to determine the repository root from start-dev.ps1.'
}

if (-not (Test-CommandAvailable -Name 'npm')) {
  throw 'npm is required but was not found in PATH.'
}

if (Test-PortInUse -Port 3001) {
  throw 'Port 3001 is already in use. Stop the existing process or run .\stop-port-safe.ps1 -Port 3001 -Force.'
}

if (Test-PortInUse -Port 5173) {
  throw 'Port 5173 is already in use. Stop the existing process or run .\stop-port-safe.ps1 -Port 5173 -Force.'
}

Ensure-FileFromTemplate -Path $backendEnvPath -TemplatePath $backendEnvExamplePath -Description 'backend .env'
Ensure-FileContent -Path $frontendEnvLocalPath -Description 'frontend .env.local' -Content "VITE_API_URL=http://localhost:3001/api" -Overwrite

if (-not (Test-Path -LiteralPath $backendEnvPath)) {
  throw "Expected backend env file at $backendEnvPath but it was not created."
}

if (-not (Test-Path -LiteralPath $frontendEnvLocalPath)) {
  throw "Expected frontend env file at $frontendEnvLocalPath but it was not created."
}

Ensure-Dependencies -ProjectDir $backendDir -ProjectName 'backend'
Ensure-Dependencies -ProjectDir $frontendDir -ProjectName 'frontend'

if (-not $SkipDockerDb) {
  if (-not (Test-Path -LiteralPath $rootEnvPath)) {
    throw "Docker database startup requires $rootEnvPath to exist. Re-run with -SkipDockerDb to use a local MySQL instance instead."
  }

  if (-not (Test-CommandAvailable -Name 'docker')) {
    throw 'Docker is required to start the local MySQL container. Re-run with -SkipDockerDb to use a local MySQL instance instead.'
  }

  if (-not (Test-DockerDaemonAvailable)) {
    throw 'Docker Desktop is installed but the Docker daemon is not available. Start Docker Desktop, wait for it to finish booting, then run .\start-dev.ps1 again.'
  }

  Write-Host 'Starting MySQL container via docker compose...'
  Push-Location $repoRoot
  try {
    docker compose up -d db
  }
  finally {
    Pop-Location
  }
}
else {
  Write-Host 'Skipping docker-managed MySQL startup.'
}

Start-DevTerminal -WorkingDirectory $backendDir -Title 'Navlight Backend' -Command 'npm start'
Start-DevTerminal -WorkingDirectory $frontendDir -Title 'Navlight Frontend' -Command 'npm run dev -- --host 0.0.0.0'

Write-Host 'Started backend and frontend dev terminals.'
Write-Host 'Frontend: http://localhost:5173'
Write-Host 'Backend:  http://localhost:3001'
if (-not $SkipDockerDb) {
  Write-Host 'MySQL:    docker compose service "db" on localhost:3306'
}