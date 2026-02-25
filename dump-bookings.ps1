param(
    [string]$Output = "bookings-dump.sql",
    [string]$Service = "db",
    [string]$DbUser,
    [string]$DbPassword,
    [string]$Database,
    [string]$EnvPath = "Navlight-Booking-Server/.env"
)

$ErrorActionPreference = "Stop"

function Get-DotEnvValues {
    param([string]$Path)
    $values = @{}
    if (-not (Test-Path -Path $Path)) {
        return $values
    }
    foreach ($line in Get-Content -Path $Path) {
        if ($line -match '^\s*#' -or -not $line.Trim()) {
            continue
        }
        $parts = $line -split '=', 2
        if ($parts.Count -ne 2) { continue }
        $key = $parts[0].Trim()
        $value = $parts[1].Trim()
        $value = $value.Trim('"').Trim("'")
        $values[$key] = $value
    }
    return $values
}

function ConvertTo-ShellSingleQuoted {
    param([string]$Value)
    if ($null -eq $Value) { return "''" }
    return "'" + ($Value -replace "'", "'""'""'") + "'"
}

$envValues = Get-DotEnvValues -Path $EnvPath

if (-not $DbUser) { $DbUser = $envValues['DB_USER'] }
if (-not $DbPassword) { $DbPassword = $envValues['DB_PASSWORD'] }
if (-not $Database) { $Database = $envValues['DB_NAME'] }

if (-not $DbUser -or -not $DbPassword -or -not $Database) {
    throw "Database credentials are not fully specified. Provide them via parameters or ensure $EnvPath defines DB_USER, DB_PASSWORD, and DB_NAME."
}

$containerId = (docker compose ps --quiet $Service).Trim()
if (-not $containerId) {
    throw "Unable to locate a running container for service '$Service'. Run 'docker compose up -d' first."
}

$pwLiteral = ConvertTo-ShellSingleQuoted -Value $DbPassword
$userLiteral = ConvertTo-ShellSingleQuoted -Value $DbUser
$dbLiteral = ConvertTo-ShellSingleQuoted -Value $Database

$dumpCommand = "MYSQL_PWD=$pwLiteral mysqldump -u $userLiteral $dbLiteral bookings --skip-lock-tables"
Write-Host "Exporting bookings table from '$Database'..."
$dump = docker exec -i $containerId sh -c $dumpCommand

Set-Content -Path $Output -Value $dump -Encoding UTF8
Write-Host "Dump written to $Output"
