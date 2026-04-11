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

reinstall_wecom_plugin() {
  plugin_dir="${HOME}/.openclaw/extensions/wecom-openclaw-plugin"
  plugin_spec="${WECOM_PLUGIN_NPM_SPEC:-@wecom/wecom-openclaw-plugin@1.0.11}"

  echo "Reinstalling WeCom OpenClaw plugin from ${plugin_spec}..."
  rm -rf "${plugin_dir}"
  ensure_wecom_plugin
}

patch_wecom_plugin() {
  plugin_dir="${HOME}/.openclaw/extensions/wecom-openclaw-plugin"
  patch_script="/opt/openclaw/scripts/patch-wecom-plugin.js"
  scene2_upgrade_script="/opt/openclaw/scripts/upgrade-wecom-inspection-scene2.js"
  dedupe_script="/opt/openclaw/scripts/dedupe-wecom-plugin-helpers.js"

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

  if [ -f "${dedupe_script}" ]; then
    node "${dedupe_script}" "${plugin_dir}"
  else
    echo "WeCom helper dedupe script not found, skipping helper cleanup." >&2
  fi
}

verify_wecom_plugin_patch() {
  plugin_dir="${HOME}/.openclaw/extensions/wecom-openclaw-plugin"
  verify_script="/opt/openclaw/scripts/verify-wecom-plugin-patch.js"

  if [ ! -d "${plugin_dir}" ]; then
    echo "WeCom plugin directory not found, skipping verification." >&2
    return 0
  fi

  if [ ! -f "${verify_script}" ]; then
    echo "WeCom verify script not found, skipping verification." >&2
    return 0
  fi

  node "${verify_script}" "${plugin_dir}"
}

ensure_wecom_plugin_ready() {
  if [ -z "${WECOM_BOT_ID:-}" ] || [ -z "${WECOM_BOT_SECRET:-}" ]; then
    ensure_wecom_plugin
    patch_wecom_plugin
    return 0
  fi

  ensure_wecom_plugin
  patch_wecom_plugin
  if verify_wecom_plugin_patch; then
    return 0
  fi

  echo "WeCom plugin verification failed; retrying with a clean reinstall..." >&2
  reinstall_wecom_plugin
  patch_wecom_plugin
  verify_wecom_plugin_patch
}

repair_session_files() {
  repair_script="/opt/openclaw/scripts/repair-session-files.js"

  if [ ! -f "${repair_script}" ]; then
    echo "Session repair script not found, skipping repair." >&2
    return 0
  fi

  node "${repair_script}"
}

ensure_ffmpeg
ensure_wecom_plugin_ready
repair_session_files

if [ -f /app/dist/index.js ]; then
  exec node /app/dist/index.js gateway --bind lan --port 18789
fi

if command -v openclaw >/dev/null 2>&1; then
  exec openclaw gateway --bind lan --port 18789
fi

echo "No gateway entrypoint found: missing /app/dist/index.js and openclaw command" >&2
exit 1
