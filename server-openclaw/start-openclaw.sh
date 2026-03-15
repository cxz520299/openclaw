#!/usr/bin/env sh
set -eu

node /opt/openclaw/okinto-openai-proxy.mjs &
node /opt/openclaw/forward-browser-ui.mjs &

exec openclaw gateway --bind lan --port 18789
