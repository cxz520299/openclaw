param(
    [string]$Server = "",
    [switch]$Deploy
)

$ErrorActionPreference = "Stop"

$RepoRoot = $PSScriptRoot
$SourceDir = Join-Path $RepoRoot "server-openclaw"
$EnvExamplePath = Join-Path $SourceDir ".env.example"
$EnvPath = Join-Path $SourceDir ".env"

if (-not (Test-Path $SourceDir)) {
    throw "Missing server-openclaw directory: $SourceDir"
}

if (-not (Test-Path $EnvExamplePath)) {
    throw "Missing env example file: $EnvExamplePath"
}

if (-not (Test-Path $EnvPath)) {
    Copy-Item $EnvExamplePath $EnvPath
    Write-Host "Created local env from template: $EnvPath"
}
else {
    Write-Host "Using existing env file: $EnvPath"
}

$content = Get-Content $EnvPath -Raw

if ($content -match "OPENCLAW_GATEWAY_TOKEN=replace-with-a-long-random-token") {
    $generated = [Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }))
    $content = $content.Replace("OPENCLAW_GATEWAY_TOKEN=replace-with-a-long-random-token", "OPENCLAW_GATEWAY_TOKEN=$generated")
    Set-Content -Path $EnvPath -Value $content -Encoding UTF8
    Write-Host "Generated a local OPENCLAW_GATEWAY_TOKEN in .env"
}

if ($content -match "OPENAI_API_KEY=replace-with-your-upstream-api-key") {
    Write-Host ""
    Write-Host "Next step: edit server-openclaw/.env and fill OPENAI_API_KEY before deployment."
}

if (-not $Server) {
    $Server = $env:OPENCLAW_DEPLOY_SERVER
}

if (-not $Server) {
    Write-Host ""
    Write-Host "Optional: set OPENCLAW_DEPLOY_SERVER or pass -Server root@your-host"
}
else {
    $env:OPENCLAW_DEPLOY_SERVER = $Server
    Write-Host "Deploy server set to: $Server"
}

Write-Host ""
Write-Host "Quick commands:"
Write-Host "  Deploy (Windows): .\deploy-openclaw.ps1 -Server root@your-host"
Write-Host "  Deploy (Mac/Linux): ./deploy-openclaw.sh root@your-host"
Write-Host "  Local docs: README.md"

if ($Deploy) {
    if (-not $Server) {
        throw "Deploy requested but no server was provided."
    }
    & (Join-Path $RepoRoot "deploy-openclaw.ps1") -Server $Server
}
