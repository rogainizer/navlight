param(
    [string]$SqlFile = "bookings.sql",
    [string]$Service = "db",
    [string]$DbUser,
    [string]$DbPassword,
    [string]$Database,
    [string]$EnvPath = ".env"
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

if (-not (Test-Path -Path $SqlFile)) {
    throw "SQL file '$SqlFile' not found."
}

$containerId = (docker compose ps --quiet $Service).Trim()
if (-not $containerId) {
    throw "Unable to locate a running container for service '$Service'. Run 'docker compose up -d' first."
}

Write-Host "Copying $SqlFile into $Service container..."
$destination = "/tmp/db-seed.sql"
docker cp $SqlFile "${containerId}:$destination" | Out-Null

$pwLiteral = ConvertTo-ShellSingleQuoted -Value $DbPassword
$userLiteral = ConvertTo-ShellSingleQuoted -Value $DbUser
$dbLiteral = ConvertTo-ShellSingleQuoted -Value $Database

$mysqlCommand = "MYSQL_PWD=$pwLiteral mysql -u $userLiteral -D $dbLiteral < $destination"
Write-Host "Loading data into MySQL database '$Database'..."
docker exec -i $containerId sh -c $mysqlCommand

Write-Host "Seed import complete."
