#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "[run-all-dev] starting legacy combined WC01 local stack"
echo "[run-all-dev] for the standalone scanner runtime, prefer WS01"

web_pid=""
scan_worker_pid=""
validation_worker_pid=""

cleanup() {
  if [[ -n "${web_pid}" ]] && kill -0 "${web_pid}" >/dev/null 2>&1; then
    kill "${web_pid}" >/dev/null 2>&1 || true
  fi

  if [[ -n "${scan_worker_pid}" ]] && kill -0 "${scan_worker_pid}" >/dev/null 2>&1; then
    kill "${scan_worker_pid}" >/dev/null 2>&1 || true
  fi

  if [[ -n "${validation_worker_pid}" ]] && kill -0 "${validation_worker_pid}" >/dev/null 2>&1; then
    kill "${validation_worker_pid}" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT INT TERM

pnpm --filter @website-signal-risk-scanner/shared build
pnpm --filter @website-signal-risk-scanner/scan-core build

pnpm --filter @website-signal-risk-scanner/web dev &
web_pid=$!

pnpm --filter @website-signal-risk-scanner/scanner dev &
scan_worker_pid=$!

pnpm --filter @website-signal-risk-scanner/validation-worker dev &
validation_worker_pid=$!

while true; do
  if ! kill -0 "${web_pid}" >/dev/null 2>&1; then
    wait "${web_pid}" || true
    break
  fi

  if ! kill -0 "${scan_worker_pid}" >/dev/null 2>&1; then
    wait "${scan_worker_pid}" || true
    break
  fi

  if ! kill -0 "${validation_worker_pid}" >/dev/null 2>&1; then
    wait "${validation_worker_pid}" || true
    break
  fi

  sleep 1
done
