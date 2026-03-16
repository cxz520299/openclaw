#!/usr/bin/env sh
set -eu

node /opt/openclaw/okinto-openai-proxy.mjs &
node /opt/openclaw/forward-browser-ui.mjs &

exec node /app/dist/index.js gateway --bind lan --port 18789
