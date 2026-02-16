param(
  [Parameter(Mandatory = $true)]
  [ValidateRange(1, 65535)]
  [int]$Port,

  [switch]$Force
)

$connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue

if (-not $connections) {
  Write-Host "No listening process found on port $Port."
  exit 0
}

$pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique

Write-Host "Port $Port is in use by the following process(es):"
foreach ($processId in $pids) {
  try {
    $process = Get-Process -Id $processId -ErrorAction Stop
    $path = $null
    try {
      $path = $process.Path
    } catch {
      $path = '<access denied or unavailable>'
    }

    [PSCustomObject]@{
      PID         = $process.Id
      ProcessName = $process.ProcessName
      Path        = $path
    } | Format-Table -AutoSize
  }
  catch {
    Write-Host "PID $processId (process details unavailable)"
  }
}

$shouldStop = $Force
if (-not $Force) {
  $confirm = Read-Host "Stop all listed process(es) on port $Port? (y/n)"
  $shouldStop = $confirm -eq 'y'
}

if (-not $shouldStop) {
  Write-Host 'Cancelled. No process was stopped.'
  exit 0
}

foreach ($processId in $pids) {
  try {
    Stop-Process -Id $processId -Force -ErrorAction Stop
    Write-Host "Stopped PID $processId"
  }
  catch {
    Write-Host "Failed to stop PID $processId $($_.Exception.Message)"
  }
}
