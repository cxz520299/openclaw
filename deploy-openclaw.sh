#!/usr/bin/env bash
set -euo pipefail

SERVER="${1:-${OPENCLAW_DEPLOY_SERVER:-}}"
REMOTE_DIR="${2:-/opt/openclaw}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="${SCRIPT_DIR}/server-openclaw"
ENV_PATH="${SOURCE_DIR}/.env"

if [[ -z "${SERVER}" ]]; then
  echo "Missing deploy server. Usage: ./deploy-openclaw.sh root@your-host [/opt/openclaw]" >&2
  echo "Or set OPENCLAW_DEPLOY_SERVER in your shell environment." >&2
  exit 1
fi

if [[ ! -d "${SOURCE_DIR}" ]]; then
  echo "Source directory not found: ${SOURCE_DIR}" >&2
  exit 1
fi

if [[ ! -f "${ENV_PATH}" ]]; then
  echo "Missing env file: ${ENV_PATH}" >&2
  exit 1
fi

gateway_token="$(grep -E '^OPENCLAW_GATEWAY_TOKEN=' "${ENV_PATH}" | head -n 1 | cut -d= -f2-)"
if [[ -z "${gateway_token}" ]]; then
  echo "OPENCLAW_GATEWAY_TOKEN is missing in ${ENV_PATH}" >&2
  exit 1
fi

python3 - <<'PY' "${SOURCE_DIR}" "${gateway_token}"
from pathlib import Path
import sys

source_dir = Path(sys.argv[1])
token = sys.argv[2]
for template_name, output_name in [
    ("openclaw-ui-bootstrap.template.html", "openclaw-ui-bootstrap.html"),
    ("openclaw-control-shell.template.html", "openclaw-control-shell.html"),
]:
    template = (source_dir / template_name).read_text(encoding="utf-8")
    (source_dir / output_name).write_text(
        template.replace("__OPENCLAW_GATEWAY_TOKEN__", token),
        encoding="utf-8",
    )
PY

include_items=(
  "Caddyfile"
  "compose.yml"
  "Dockerfile"
  "forward-browser-ui.mjs"
  "okinto-openai-proxy.mjs"
  "openclaw-control-shell.html"
  "openclaw-control-shell.template.html"
  "openclaw-ui-bootstrap.html"
  "openclaw-ui-bootstrap.template.html"
  "openclaw-ui-nginx.conf"
  "openclaw.json"
  "README.zh-CN.md"
  "serve-control-ui.mjs"
  "server.mjs"
  "start-openclaw.sh"
  ".env"
  "control-ui-dist"
  "data/workspace/AGENTS.md"
  "data/workspace/BOOTSTRAP.md"
  "data/workspace/IDENTITY.md"
  "data/workspace/SOUL.md"
  "data/workspace/TOOLS.md"
  "data/workspace/.openclaw/skills"
  "plugins"
  "scripts"
  "services"
  "social-sources"
)

echo "Deploy source: ${SOURCE_DIR}"
echo "Deploy target: ${SERVER}:${REMOTE_DIR}"

ssh "${SERVER}" "mkdir -p '${REMOTE_DIR}'"

timestamp="$(date +%Y%m%d-%H%M%S)"
backup_path="/root/openclaw-backup-${timestamp}.tar.gz"

echo "Creating remote backup: ${backup_path}"
ssh "${SERVER}" "tar -czf '${backup_path}' -C /opt openclaw && ls -lh '${backup_path}'"

for item in "${include_items[@]}"; do
  local_path="${SOURCE_DIR}/${item}"
  if [[ ! -e "${local_path}" ]]; then
    echo "Skip missing path: ${local_path}" >&2
    continue
  fi
  echo "Uploading ${item}"
  scp -r "${local_path}" "${SERVER}:${REMOTE_DIR}/"
done

echo "Validating compose configuration"
ssh "${SERVER}" "cd '${REMOTE_DIR}' && docker compose config > /tmp/openclaw-compose.rendered.yml"

echo "Restarting containers"
ssh "${SERVER}" "cd '${REMOTE_DIR}' && docker compose up -d --build"

echo "Checking container health"
ssh "${SERVER}" "docker ps --format 'table {{.Names}}\t{{.Status}}' | grep openclaw"
ssh "${SERVER}" "curl -fsS http://127.0.0.1:18789/healthz"

echo "Deployment finished"
