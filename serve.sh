#!/usr/bin/env bash
# Serve the game locally and open it in your browser.
set -euo pipefail
cd "$(dirname "$0")"
PORT="${1:-8765}"
echo "Animal Guesser -> http://localhost:$PORT/web/"
echo "Press Ctrl-C to stop."
( sleep 1; open "http://localhost:$PORT/web/" 2>/dev/null || true ) &
exec python3 -m http.server "$PORT" --bind 127.0.0.1
