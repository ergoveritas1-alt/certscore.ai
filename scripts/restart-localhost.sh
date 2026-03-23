#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

echo "[restart-localhost] restarting legacy combined WC01 local stack"
echo "[restart-localhost] for the standalone scanner runtime, prefer WS01"

pkill -f "${ROOT_DIR}/scripts/run-all-dev.sh" >/dev/null 2>&1 || true
pkill -f "next dev --port 3000" >/dev/null 2>&1 || true
pkill -f "run-dev-watch.sh ./src/index.ts" >/dev/null 2>&1 || true
pkill -f "run-dev-watch.sh ./src/validation/index.ts" >/dev/null 2>&1 || true

exec bash "${ROOT_DIR}/scripts/run-all-dev.sh"
