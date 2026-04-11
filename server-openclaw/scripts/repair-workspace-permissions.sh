#!/usr/bin/env sh
set -eu

TARGET_USER="${OPENCLAW_RUNTIME_USER:-node}"
TARGET_UID="${OPENCLAW_RUNTIME_UID:-}"
TARGET_GID="${OPENCLAW_RUNTIME_GID:-}"

if [ -z "${TARGET_UID}" ]; then
  if id -u "${TARGET_USER}" >/dev/null 2>&1; then
    TARGET_UID="$(id -u "${TARGET_USER}")"
  else
    TARGET_UID="1000"
  fi
fi

if [ -z "${TARGET_GID}" ]; then
  if id -g "${TARGET_USER}" >/dev/null 2>&1; then
    TARGET_GID="$(id -g "${TARGET_USER}")"
  else
    TARGET_GID="1000"
  fi
fi

WORKSPACE_ROOT="${OPENCLAW_WORKSPACE_ROOT:-/home/node/.openclaw/workspace}"
REPORTS_ROOT="${OPENCLAW_REPORTS_ROOT:-${WORKSPACE_ROOT}/reports}"
STREAM_STATE_ROOT="${STREAM_FRAME_WATCH_STATE_DIR:-${WORKSPACE_ROOT}/stream-watch/state}"
STREAM_CACHE_ROOT="${STREAM_FRAME_WATCH_CACHE_DIR:-${WORKSPACE_ROOT}/stream-watch/cache}"
STREAM_OUTPUT_ROOT="${STREAM_FRAME_WATCH_OUTPUT_DIR:-${REPORTS_ROOT}/stream-watch}"

ensure_dir() {
  dir_path="$1"
  mkdir -p "${dir_path}"
  chown -R "${TARGET_UID}:${TARGET_GID}" "${dir_path}"
}

ensure_dir "${WORKSPACE_ROOT}"
ensure_dir "${REPORTS_ROOT}"
ensure_dir "${STREAM_OUTPUT_ROOT}"
ensure_dir "$(dirname "${STREAM_STATE_ROOT}")"
ensure_dir "${STREAM_STATE_ROOT}"
ensure_dir "$(dirname "${STREAM_CACHE_ROOT}")"
ensure_dir "${STREAM_CACHE_ROOT}"

echo "workspace permissions repaired for uid=${TARGET_UID} gid=${TARGET_GID}"
