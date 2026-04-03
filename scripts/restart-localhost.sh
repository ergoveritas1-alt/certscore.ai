#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WS01_ROOT="${WS01_ROOT:-$(cd "$ROOT_DIR/.." && pwd)/WS01}"
cd "${ROOT_DIR}"

echo "[restart-localhost] restarting WC01 control-plane + validation local stack"
echo "[restart-localhost] restarting the WS01 scanner so localhost uses the local hybrid scanner"

pkill -f "${ROOT_DIR}/scripts/run-all-dev.sh" >/dev/null 2>&1 || true
pkill -f "next dev --port 3000" >/dev/null 2>&1 || true
pkill -f "run-dev-watch.sh ./src/validation/index.ts" >/dev/null 2>&1 || true
pkill -f "${WS01_ROOT}/apps/scanner/src/index.ts" >/dev/null 2>&1 || true
pkill -f "scripts/run-ws01-scanner-dev.sh" >/dev/null 2>&1 || true

exec bash "${ROOT_DIR}/scripts/run-all-dev.sh"
