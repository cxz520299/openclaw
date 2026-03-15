#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo ".env not found. Copy .env.example to .env first."
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg lsb-release

if ! command -v docker >/dev/null 2>&1; then
  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  sudo chmod a+r /etc/apt/keyrings/docker.gpg
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "${VERSION_CODENAME}") stable" | \
    sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
  sudo apt-get update
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

if ! groups "${USER}" | grep -q '\bdocker\b'; then
  sudo usermod -aG docker "${USER}" || true
fi

set -a
source "${ENV_FILE}"
set +a

mkdir -p "${OPENCLAW_DATA_DIR}"

if [[ ! -d "${OPENCLAW_DATA_DIR}/workspace" ]]; then
  mkdir -p "${OPENCLAW_DATA_DIR}/workspace"
fi

bash "${ROOT_DIR}/scripts/render-bootstrap.sh"

docker compose -f "${ROOT_DIR}/compose.yml" build --pull
docker compose -f "${ROOT_DIR}/compose.yml" up -d openclaw-gateway

echo
echo "OpenClaw is starting."
echo "Local server URL: http://${OPENCLAW_BIND_IP:-127.0.0.1}:${OPENCLAW_GATEWAY_PORT:-18789}"
echo "Use your OPENCLAW_GATEWAY_TOKEN in the Control UI."
