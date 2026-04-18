#!/usr/bin/env bash
set -euo pipefail

web_pid=""
worker_pid=""

cleanup() {
  if [[ -n "${web_pid}" ]] && kill -0 "${web_pid}" >/dev/null 2>&1; then
    kill "${web_pid}" >/dev/null 2>&1 || true
  fi

  if [[ -n "${worker_pid}" ]] && kill -0 "${worker_pid}" >/dev/null 2>&1; then
    kill "${worker_pid}" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT INT TERM

pnpm --filter @website-signal-risk-scanner/shared build
pnpm --filter @website-signal-risk-scanner/db build
pnpm --filter @website-signal-risk-scanner/validation-shared build

pnpm --filter @website-signal-risk-scanner/web dev &
web_pid=$!

pnpm --filter @website-signal-risk-scanner/validation-worker dev &
worker_pid=$!

while true; do
  if ! kill -0 "${web_pid}" >/dev/null 2>&1; then
    wait "${web_pid}"
    exit $?
  fi

  if ! kill -0 "${worker_pid}" >/dev/null 2>&1; then
    wait "${worker_pid}"
    exit $?
  fi

  sleep 1
done
