#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

stop_by_pattern() {
  local pattern="$1"

  if pgrep -f "$pattern" >/dev/null 2>&1; then
    pkill -f "$pattern" >/dev/null 2>&1 || true
  fi
}

if command -v lsof >/dev/null 2>&1; then
  port_pids="$(lsof -tiTCP:3000 -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "${port_pids}" ]]; then
    kill ${port_pids} >/dev/null 2>&1 || true
  fi
fi

stop_by_pattern "${ROOT_DIR}.*turbo run dev --parallel"
stop_by_pattern "${ROOT_DIR}/apps/web.*next dev"
stop_by_pattern "${ROOT_DIR}/apps/worker.*tsx --watch ./src/index.ts"

# Give the OS a moment to release the port before starting the stack again.
sleep 1

cd "${ROOT_DIR}"
exec pnpm dev
