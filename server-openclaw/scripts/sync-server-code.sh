#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE_USER="${REMOTE_USER:-root}"
REMOTE_HOST="${REMOTE_HOST:-8.147.63.36}"
REMOTE_DIR="${REMOTE_DIR:-/opt/openclaw}"
SSH_PORT="${SSH_PORT:-22}"
NODE_IMAGE="${NODE_IMAGE:-node:20-bookworm}"
MODE="${1:-apply}"

if [[ "${MODE}" != "apply" && "${MODE}" != "dry-run" ]]; then
  echo "Usage: $(basename "$0") [apply|dry-run]"
  exit 1
fi

if [[ ! -f "${ROOT_DIR}/compose.yml" || ! -f "${ROOT_DIR}/openclaw.json" ]]; then
  echo "Run this script from the server-openclaw project."
  exit 1
fi

REMOTE="${REMOTE_USER}@${REMOTE_HOST}"
SSH_CMD=(ssh -p "${SSH_PORT}" -o StrictHostKeyChecking=no "${REMOTE}")
RSYNC_RSH="ssh -p ${SSH_PORT} -o StrictHostKeyChecking=no"
RSYNC_FLAGS=(-avc --delete)

if [[ "${MODE}" == "dry-run" ]]; then
  RSYNC_FLAGS+=(-n)
fi

echo "==> Sync mode: ${MODE}"
echo "==> Local: ${ROOT_DIR}"
echo "==> Remote: ${REMOTE}:${REMOTE_DIR}"

rsync "${RSYNC_FLAGS[@]}" \
  --exclude='.git/' \
  --exclude='.env' \
  --exclude='.env.*' \
  --exclude='data/' \
  --exclude='node_modules/' \
  --exclude='config/stream-frame-watch.json' \
  -e "${RSYNC_RSH}" \
  "${ROOT_DIR}/" "${REMOTE}:${REMOTE_DIR}/"

mkdir -p "${ROOT_DIR}/data/workspace"
WORKSPACE_RSYNC_FLAGS=(-avc)

if [[ "${MODE}" == "dry-run" ]]; then
  WORKSPACE_RSYNC_FLAGS+=(-n)
fi

rsync "${WORKSPACE_RSYNC_FLAGS[@]}" \
  --exclude='reports/stream-watch/' \
  --exclude='reports/stream-watch-local/' \
  --exclude='stream-watch/cache/' \
  --exclude='stream-watch/cache-local/' \
  --exclude='stream-watch/state/' \
  -e "${RSYNC_RSH}" \
  "${ROOT_DIR}/data/workspace/" "${REMOTE}:${REMOTE_DIR}/data/workspace/"

if [[ "${MODE}" == "dry-run" ]]; then
  echo "==> Dry run complete"
  exit 0
fi

echo "==> Repairing plugin ownership, dependencies, and gateway"

"${SSH_CMD[@]}" "REMOTE_DIR='${REMOTE_DIR}' NODE_IMAGE='${NODE_IMAGE}' bash -s" <<'EOF'
set -euo pipefail

cd "${REMOTE_DIR}"

fix_owner() {
  local dir="$1"
  if [[ -d "${dir}" ]]; then
    chown -R root:root "${dir}"
  fi
}

install_plugin_deps() {
  local dir="$1"
  if [[ ! -f "${dir}/package.json" ]]; then
    return 0
  fi

  docker run --rm \
    -v "${dir}:/work" \
    -w /work \
    "${NODE_IMAGE}" \
    sh -lc 'npm install --omit=dev --silent'
}

SOCIAL_DIR="${REMOTE_DIR}/plugins/social-mcp"
WECOM_DOC_DIR="${REMOTE_DIR}/plugins/wecom-doc-mcp"
STREAM_DIR="${REMOTE_DIR}/plugins/stream-frame-watch"

fix_owner "${SOCIAL_DIR}"
fix_owner "${WECOM_DOC_DIR}"
fix_owner "${STREAM_DIR}"

install_plugin_deps "${SOCIAL_DIR}"
install_plugin_deps "${WECOM_DOC_DIR}"

fix_owner "${SOCIAL_DIR}"
fix_owner "${WECOM_DOC_DIR}"
fix_owner "${STREAM_DIR}"

docker compose up -d --force-recreate openclaw-gateway

container_id="$(docker compose ps -q openclaw-gateway)"
if [[ -z "${container_id}" ]]; then
  echo "openclaw-gateway container not found after recreate"
  exit 1
fi

for _ in $(seq 1 45); do
  status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${container_id}")"
  case "${status}" in
    healthy)
      docker ps --format 'table {{.Names}}\t{{.Status}}' | sed -n '1,10p'
      exit 0
      ;;
    starting|running|created)
      sleep 2
      ;;
    *)
      echo "Gateway unhealthy: ${status}"
      docker compose logs --tail 120 openclaw-gateway
      exit 1
      ;;
  esac
done

echo "Gateway health check timed out"
docker compose logs --tail 120 openclaw-gateway
exit 1
EOF

echo "==> Sync complete"
