#!/bin/sh
set -eu

PLUGIN_SPEC="${1:-@wecom/wecom-openclaw-plugin@1.0.11}"
EXTENSIONS_DIR="${2:-/home/node/.openclaw/extensions}"
PLUGIN_DIR="${EXTENSIONS_DIR}/wecom-openclaw-plugin"

export npm_config_cache="${npm_config_cache:-/tmp/npm-cache}"

rm -rf /tmp/wecom-reinstall
mkdir -p /tmp/wecom-reinstall
cd /tmp/wecom-reinstall

npm pack "${PLUGIN_SPEC}" >/tmp/wecom-pack.log
TARBALL="$(tail -n 1 /tmp/wecom-pack.log)"
TS="$(date +%Y%m%d%H%M%S)"

if [ -d "${PLUGIN_DIR}" ]; then
  mv "${PLUGIN_DIR}" "${PLUGIN_DIR}.bak-${TS}"
fi

tar -xzf "${TARBALL}"
mv package "${PLUGIN_DIR}"

echo "REINSTALLED:${TS}"
sed -n '1,20p' "${PLUGIN_DIR}/package.json"
