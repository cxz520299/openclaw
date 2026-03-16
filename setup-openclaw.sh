#!/usr/bin/env bash
set -euo pipefail

SERVER="${1:-${OPENCLAW_DEPLOY_SERVER:-}}"
DEPLOY_FLAG="${2:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="${SCRIPT_DIR}/server-openclaw"
ENV_EXAMPLE_PATH="${SOURCE_DIR}/.env.example"
ENV_PATH="${SOURCE_DIR}/.env"

if [[ ! -d "${SOURCE_DIR}" ]]; then
  echo "Missing server-openclaw directory: ${SOURCE_DIR}" >&2
  exit 1
fi

if [[ ! -f "${ENV_EXAMPLE_PATH}" ]]; then
  echo "Missing env example file: ${ENV_EXAMPLE_PATH}" >&2
  exit 1
fi

if [[ ! -f "${ENV_PATH}" ]]; then
  cp "${ENV_EXAMPLE_PATH}" "${ENV_PATH}"
  echo "Created local env from template: ${ENV_PATH}"
else
  echo "Using existing env file: ${ENV_PATH}"
fi

python3 - <<'PY' "${ENV_PATH}"
from pathlib import Path
import base64
import os
import sys

env_path = Path(sys.argv[1])
text = env_path.read_text(encoding="utf-8")
placeholder = "OPENCLAW_GATEWAY_TOKEN=replace-with-a-long-random-token"
if placeholder in text:
    token = base64.b64encode(os.urandom(48)).decode("ascii")
    text = text.replace(placeholder, f"OPENCLAW_GATEWAY_TOKEN={token}", 1)
    env_path.write_text(text, encoding="utf-8")
    print("Generated a local OPENCLAW_GATEWAY_TOKEN in .env")
PY

if grep -q '^OPENAI_API_KEY=replace-with-your-upstream-api-key$' "${ENV_PATH}"; then
  echo
  echo "Next step: edit server-openclaw/.env and fill OPENAI_API_KEY before deployment."
fi

if [[ -n "${SERVER}" ]]; then
  export OPENCLAW_DEPLOY_SERVER="${SERVER}"
  echo "Deploy server set to: ${SERVER}"
else
  echo
  echo "Optional: set OPENCLAW_DEPLOY_SERVER or run ./setup-openclaw.sh root@your-host"
fi

echo
echo "Quick commands:"
echo "  Deploy (Mac/Linux): ./deploy-openclaw.sh root@your-host"
echo "  Deploy (Windows): .\\deploy-openclaw.ps1 -Server root@your-host"
echo "  Local docs: README.md"

if [[ "${DEPLOY_FLAG}" == "--deploy" ]]; then
  if [[ -z "${SERVER}" ]]; then
    echo "Deploy requested but no server was provided." >&2
    exit 1
  fi
  "${SCRIPT_DIR}/deploy-openclaw.sh" "${SERVER}"
fi
