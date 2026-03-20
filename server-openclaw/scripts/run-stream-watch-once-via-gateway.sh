#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
CONTAINER_NAME="${OPENCLAW_GATEWAY_CONTAINER:-openclaw-openclaw-gateway-1}"
CONFIG_PATH="${STREAM_FRAME_WATCH_CONFIG:-/opt/openclaw/config/stream-frame-watch.json}"

cd "${ROOT_DIR}"
docker exec "${CONTAINER_NAME}" sh -lc "node /opt/openclaw/services/stream-frame-watch/index.mjs once --config ${CONFIG_PATH}"
