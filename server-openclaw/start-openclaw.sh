#!/usr/bin/env sh
set -eu

export npm_config_cache=/tmp/openclaw-npm-cache
mkdir -p "${npm_config_cache}"

node /opt/openclaw/okinto-openai-proxy.mjs &
node /opt/openclaw/forward-browser-ui.mjs &

ensure_ffmpeg() {
  if command -v ffmpeg >/dev/null 2>&1; then
    return 0
  fi

  if [ "$(id -u)" != "0" ]; then
    echo "ffmpeg not found; skipping auto-install because current user is not root." >&2
    return 0
  fi

  export DEBIAN_FRONTEND=noninteractive
  echo "Installing ffmpeg for stream-frame-watch..."
  apt-get update >/tmp/openclaw-apt-update.log 2>&1
  apt-get install -y --no-install-recommends ffmpeg >/tmp/openclaw-apt-install.log 2>&1
}

ensure_wecom_plugin() {
  plugin_dir="${HOME}/.openclaw/extensions/wecom-openclaw-plugin"
  if [ -d "${plugin_dir}" ]; then
    return 0
  fi

  plugin_spec="${WECOM_PLUGIN_NPM_SPEC:-@wecom/wecom-openclaw-plugin@1.0.11}"
  tmp_dir="$(mktemp -d)"

  mkdir -p "${HOME}/.openclaw/extensions"
  rm -rf "${plugin_dir}"
  mkdir -p "${plugin_dir}"

  echo "Bootstrapping official WeCom OpenClaw plugin from ${plugin_spec}..."
  (
    cd "${tmp_dir}"
    npm pack "${plugin_spec}" --silent >/dev/null
    archive="$(ls -1 ./*.tgz | head -n 1)"
    tar -xzf "${archive}" -C "${plugin_dir}" --strip-components=1
  )
  (
    cd "${plugin_dir}"
    npm install --omit=dev --silent
  )
  rm -rf "${tmp_dir}"
}

patch_wecom_plugin() {
  plugin_dir="${HOME}/.openclaw/extensions/wecom-openclaw-plugin"
  patch_script="/opt/openclaw/scripts/patch-wecom-plugin.js"
  scene2_upgrade_script="/opt/openclaw/scripts/upgrade-wecom-inspection-scene2.js"

  if [ ! -d "${plugin_dir}" ]; then
    echo "WeCom plugin directory not found, skipping patch." >&2
    return 0
  fi

  if [ ! -f "${patch_script}" ]; then
    echo "WeCom patch script not found, skipping patch." >&2
    return 0
  fi

  node "${patch_script}" "${plugin_dir}"

  if [ -f "${scene2_upgrade_script}" ]; then
    node "${scene2_upgrade_script}" "${plugin_dir}"
  else
    echo "WeCom scene2 upgrade script not found, skipping scene2 upgrade." >&2
  fi
}

ensure_ffmpeg
ensure_wecom_plugin
patch_wecom_plugin

if [ -f /app/dist/index.js ]; then
  exec node /app/dist/index.js gateway --bind lan --port 18789
fi

if command -v openclaw >/dev/null 2>&1; then
  exec openclaw gateway --bind lan --port 18789
fi

echo "No gateway entrypoint found: missing /app/dist/index.js and openclaw command" >&2
exit 1
