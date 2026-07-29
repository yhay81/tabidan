[CmdletBinding()]
param(
    [switch]$Local
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$SqlPath = Join-Path $PSScriptRoot "product-metrics.sql"
$Wrangler = Join-Path $RepoRoot "node_modules\.bin\wrangler.cmd"
$Target = if ($Local) { "--local" } else { "--remote" }
$Sql = (Get-Content $SqlPath) -join " "

$Output = & $Wrangler d1 execute tabidan $Target --json --command $Sql
if ($LASTEXITCODE -ne 0) {
    throw "D1 metrics query failed with exit code $LASTEXITCODE"
}

$Payload = ($Output -join [Environment]::NewLine) | ConvertFrom-Json
$Row = $Payload[0].results[0]
if (-not $Row) {
    throw "D1 metrics query returned no result"
}

function Get-Percent {
    param(
        [int]$Numerator,
        [int]$Denominator
    )

    if ($Denominator -eq 0) { return 0.0 }
    return [Math]::Round(($Numerator / $Denominator) * 100, 1)
}

$Users = [int]$Row.users
$Creators = [int]$Row.creators
$Editors = [int]$Row.editors
$Sharers = [int]$Row.sharers
$Printers = [int]$Row.printers
$Exporters = [int]$Row.exporters
$Outputters = [int]$Row.outputters

[ordered]@{
    generated_at = (Get-Date).ToUniversalTime().ToString("o")
    service = "tabidan"
    environment = if ($Local) { "local" } else { "production" }
    funnel = [ordered]@{
        users = $Users
        creators = $Creators
        editors = $Editors
        sharers = $Sharers
        printers = $Printers
        exporters = $Exporters
        returned = [int]$Row.returned
        users_7d = [int]$Row.users_7d
        creators_7d = [int]$Row.creators_7d
    }
    product = [ordered]@{
        active_trips = [int]$Row.active_trips
        edited_trips = [int]$Row.edited_trips
        collaborative_trips = [int]$Row.collaborative_trips
        save_actions = [int]$Row.save_actions
    }
    rates = [ordered]@{
        create_percent = Get-Percent $Creators $Users
        edit_percent = Get-Percent $Editors $Creators
        share_percent = Get-Percent $Sharers $Creators
        output_percent = Get-Percent $Outputters $Creators
        return_percent = Get-Percent ([int]$Row.returned) $Users
    }
} | ConvertTo-Json -Depth 4
