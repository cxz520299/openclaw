param(
    [string]$Server = "root@8.147.63.36",
    [string]$RemoteDir = "/opt/openclaw"
)

$ErrorActionPreference = "Stop"

$SourceDir = Join-Path $PSScriptRoot "server-openclaw"
if (-not (Test-Path $SourceDir)) {
    throw "Source directory not found: $SourceDir"
}

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
