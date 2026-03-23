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

pnpm --filter @website-signal-risk-scanner/web dev &
web_pid=$!

pnpm --filter @website-signal-risk-scanner/validation-worker dev &
worker_pid=$!

wait -n "${web_pid}" "${worker_pid}"
