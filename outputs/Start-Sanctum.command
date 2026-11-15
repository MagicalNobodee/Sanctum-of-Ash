#!/bin/bash
cd "$(dirname "$0")/.." || exit 1
NODE_BIN="$(command -v node || true)"
if [ -z "$NODE_BIN" ]; then
  for candidate in /opt/homebrew/bin/node /usr/local/bin/node "$HOME"/.nvm/versions/node/*/bin/node; do
    if [ -x "$candidate" ]; then NODE_BIN="$candidate"; fi
  done
fi
if [ -z "$NODE_BIN" ]; then
  echo 'Node.js 20+ is required for multiplayer. Opening the offline game.'
  echo 'Install Node.js LTS from https://nodejs.org then run this launcher again.'
  open "outputs/sanctum-of-ash.html"
  exit 0
fi
echo 'Keep this window open while hosting multiplayer. Press Ctrl+C to stop.'
exec "$NODE_BIN" lan-server.mjs --open "$@"
