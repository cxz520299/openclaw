#!/usr/bin/env sh
set -eu

SOURCE_URL="${1:-https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_4x3/gear1/prog_index.m3u8}"
OUTPUT_PATH="${2:-${HOME:-/home/node}/.openclaw/workspace/stream-watch/public-hls-sample/baseline.png}"
OFFSET_SECONDS="${3:-0}"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg is required but was not found in PATH." >&2
  exit 1
fi

mkdir -p "$(dirname "${OUTPUT_PATH}")"

ffmpeg \
  -hide_banner \
  -loglevel error \
  -y \
  -ss "${OFFSET_SECONDS}" \
  -i "${SOURCE_URL}" \
  -frames:v 1 \
  "${OUTPUT_PATH}"

printf 'baseline saved: %s\n' "${OUTPUT_PATH}"
printf 'source: %s\n' "${SOURCE_URL}"
printf 'offset_seconds: %s\n' "${OFFSET_SECONDS}"
