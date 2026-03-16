#!/usr/bin/env sh
set -eu

node /opt/openclaw/okinto-openai-proxy.mjs &
node /opt/openclaw/forward-browser-ui.mjs &

if [ -f /app/dist/index.js ]; then
  exec node /app/dist/index.js gateway --bind lan --port 18789
fi

if command -v openclaw >/dev/null 2>&1; then
  exec openclaw gateway --bind lan --port 18789
fi

echo "No gateway entrypoint found: missing /app/dist/index.js and openclaw command" >&2
exit 1
