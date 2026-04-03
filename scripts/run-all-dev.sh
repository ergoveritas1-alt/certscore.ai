#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "[run-all-dev] starting WC01 control-plane + validation local stack"
echo "[run-all-dev] starting WS01 scanner so localhost scans use the local hybrid scanner"

web_pid=""
validation_worker_pid=""
scanner_pid=""

cleanup() {
  if [[ -n "${web_pid}" ]] && kill -0 "${web_pid}" >/dev/null 2>&1; then
    kill "${web_pid}" >/dev/null 2>&1 || true
  fi

  if [[ -n "${validation_worker_pid}" ]] && kill -0 "${validation_worker_pid}" >/dev/null 2>&1; then
    kill "${validation_worker_pid}" >/dev/null 2>&1 || true
  fi

  if [[ -n "${scanner_pid}" ]] && kill -0 "${scanner_pid}" >/dev/null 2>&1; then
    kill "${scanner_pid}" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT INT TERM

pnpm --filter @website-signal-risk-scanner/shared build

pnpm --filter @website-signal-risk-scanner/web dev &
web_pid=$!

pnpm --filter @website-signal-risk-scanner/validation-worker dev &
validation_worker_pid=$!

bash "${ROOT_DIR}/scripts/run-ws01-scanner-dev.sh" &
scanner_pid=$!

while true; do
  if ! kill -0 "${web_pid}" >/dev/null 2>&1; then
    wait "${web_pid}" || true
    break
  fi

  if ! kill -0 "${validation_worker_pid}" >/dev/null 2>&1; then
    wait "${validation_worker_pid}" || true
    break
  fi

  if ! kill -0 "${scanner_pid}" >/dev/null 2>&1; then
    wait "${scanner_pid}" || true
    break
  fi

  sleep 1
done
