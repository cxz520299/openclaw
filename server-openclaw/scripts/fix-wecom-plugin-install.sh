#!/bin/sh
set -eu

EXTENSIONS_DIR="${1:-/home/node/.openclaw/extensions}"
PLUGIN_DIR="${EXTENSIONS_DIR}/wecom-openclaw-plugin"
BACKUP_DIR="${2:-/home/node/.openclaw/extension-backups}"

mkdir -p "${BACKUP_DIR}"

for d in "${EXTENSIONS_DIR}"/wecom-openclaw-plugin.bak-*; do
  [ -d "${d}" ] || continue
  mv "${d}" "${BACKUP_DIR}/"
done

cd "${PLUGIN_DIR}"
export npm_config_cache="${npm_config_cache:-/tmp/npm-cache}"
npm install --omit=dev
