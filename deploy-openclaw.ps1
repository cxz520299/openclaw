param(
    [string]$Server = "",
    [string]$RemoteDir = "/opt/openclaw"
)

$ErrorActionPreference = "Stop"

if (-not $Server) {
    $Server = $env:OPENCLAW_DEPLOY_SERVER
}

if (-not $Server) {
    throw "Missing deploy server. Pass -Server root@your-host or set OPENCLAW_DEPLOY_SERVER."
}

$SourceDir = Join-Path $PSScriptRoot "server-openclaw"
if (-not (Test-Path $SourceDir)) {
    throw "Source directory not found: $SourceDir"
}

function Get-DotEnvValue {
    param(
        [string]$EnvPath,
        [string]$Name
    )

    $line = Get-Content $EnvPath | Where-Object { $_ -match "^${Name}=" } | Select-Object -First 1
    if (-not $line) {
        throw "Missing $Name in $EnvPath"
    }
    return ($line -replace "^${Name}=", "").Trim()
}

function Render-TemplateFile {
    param(
        [string]$TemplatePath,
        [string]$OutputPath,
        [string]$GatewayToken
    )

    $content = Get-Content $TemplatePath -Raw
    $content = $content.Replace("__OPENCLAW_GATEWAY_TOKEN__", $GatewayToken)
    Set-Content -Path $OutputPath -Value $content -Encoding UTF8
}

$EnvPath = Join-Path $SourceDir ".env"
if (-not (Test-Path $EnvPath)) {
    throw "Missing env file: $EnvPath"
}

$GatewayToken = Get-DotEnvValue -EnvPath $EnvPath -Name "OPENCLAW_GATEWAY_TOKEN"
Render-TemplateFile `
    -TemplatePath (Join-Path $SourceDir "openclaw-ui-bootstrap.template.html") `
    -OutputPath (Join-Path $SourceDir "openclaw-ui-bootstrap.html") `
    -GatewayToken $GatewayToken
Render-TemplateFile `
    -TemplatePath (Join-Path $SourceDir "openclaw-control-shell.template.html") `
    -OutputPath (Join-Path $SourceDir "openclaw-control-shell.html") `
    -GatewayToken $GatewayToken

$Include = @(
    "Caddyfile",
    "compose.yml",
    "Dockerfile",
    "forward-browser-ui.mjs",
    "okinto-openai-proxy.mjs",
    "openclaw-control-shell.html",
    "openclaw-control-shell.template.html",
    "openclaw-ui-bootstrap.html",
    "openclaw-ui-bootstrap.template.html",
    "openclaw-ui-nginx.conf",
    "openclaw.json",
    "README.zh-CN.md",
    "serve-control-ui.mjs",
    "server.mjs",
    "start-openclaw.sh",
    ".env",
    "control-ui-dist",
    "data/workspace/AGENTS.md",
    "data/workspace/BOOTSTRAP.md",
    "data/workspace/IDENTITY.md",
    "data/workspace/SOUL.md",
    "data/workspace/TOOLS.md",
    "data/workspace/.openclaw/skills",
    "plugins",
    "scripts",
    "services",
    "social-sources"
)

Write-Host "Deploy source: $SourceDir"
Write-Host "Deploy target: ${Server}:$RemoteDir"

ssh $Server "mkdir -p $RemoteDir"

$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$BackupPath = "/root/openclaw-backup-$Timestamp.tar.gz"

Write-Host "Creating remote backup: $BackupPath"
ssh $Server "tar -czf $BackupPath -C /opt openclaw && ls -lh $BackupPath"

foreach ($item in $Include) {
    $localPath = Join-Path $SourceDir $item
    if (-not (Test-Path $localPath)) {
        Write-Warning "Skip missing path: $localPath"
        continue
    }

    Write-Host "Uploading $item"
    scp -r $localPath "${Server}:$RemoteDir/"
}

Write-Host "Validating compose configuration"
ssh $Server "cd $RemoteDir && docker compose config > /tmp/openclaw-compose.rendered.yml"

Write-Host "Restarting containers"
ssh $Server "cd $RemoteDir && docker compose up -d --build"

Write-Host "Checking container health"
ssh $Server "docker ps --format 'table {{.Names}}\t{{.Status}}' | grep openclaw"
ssh $Server "curl -fsS http://127.0.0.1:18789/healthz"

Write-Host "Deployment finished"
