#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"
TEMPLATE_FILE="${ROOT_DIR}/openclaw-ui-bootstrap.template.html"
OUTPUT_FILE="${ROOT_DIR}/openclaw-ui-bootstrap.html"
SHELL_TEMPLATE_FILE="${ROOT_DIR}/openclaw-control-shell.template.html"
SHELL_OUTPUT_FILE="${ROOT_DIR}/openclaw-control-shell.html"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo ".env not found: ${ENV_FILE}"
  exit 1
fi

if [[ ! -f "${TEMPLATE_FILE}" ]]; then
  echo "template not found: ${TEMPLATE_FILE}"
  exit 1
fi

if [[ ! -f "${SHELL_TEMPLATE_FILE}" ]]; then
  echo "template not found: ${SHELL_TEMPLATE_FILE}"
  exit 1
fi

set -a
source "${ENV_FILE}"
set +a

if [[ -z "${OPENCLAW_GATEWAY_TOKEN:-}" ]]; then
  echo "OPENCLAW_GATEWAY_TOKEN is empty"
  exit 1
fi

sed "s|__OPENCLAW_GATEWAY_TOKEN__|${OPENCLAW_GATEWAY_TOKEN}|g" \
  "${TEMPLATE_FILE}" > "${OUTPUT_FILE}"

sed "s|__OPENCLAW_GATEWAY_TOKEN__|${OPENCLAW_GATEWAY_TOKEN}|g" \
  "${SHELL_TEMPLATE_FILE}" > "${SHELL_OUTPUT_FILE}"

echo "Rendered ${OUTPUT_FILE}"
echo "Rendered ${SHELL_OUTPUT_FILE}"
