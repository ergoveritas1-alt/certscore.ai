#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

echo "[restart-localhost] restarting WC01 control-plane + validation local stack"
echo "[restart-localhost] scanner runtime remains in WS01"

pkill -f "${ROOT_DIR}/scripts/run-all-dev.sh" >/dev/null 2>&1 || true
pkill -f "next dev --port 3000" >/dev/null 2>&1 || true
pkill -f "run-dev-watch.sh ./src/validation/index.ts" >/dev/null 2>&1 || true

exec bash "${ROOT_DIR}/scripts/run-all-dev.sh"
