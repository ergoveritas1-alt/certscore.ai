#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${ROOT_DIR}/tmp/local-dev"
WEB_PORT="${WEB_PORT:-3000}"
STORAGE_PORT="${STORAGE_PORT:-9000}"

mkdir -p "${LOG_DIR}"

log() {
  printf '[local-scan-ready] %s\n' "$*"
}

is_port_listening() {
  local port="$1"
  lsof -nP -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1
}

has_process() {
  local pattern="$1"
  pgrep -af "${pattern}" >/dev/null 2>&1
}

start_background() {
  local name="$1"
  local logfile="$2"
  shift 2

  log "starting ${name} (log: ${logfile})"
  nohup "$@" >"${logfile}" 2>&1 &
}

wait_for_port() {
  local label="$1"
  local port="$2"

  for _ in {1..45}; do
    if is_port_listening "${port}"; then
      log "${label} is listening on ${port}"
      return 0
    fi
    sleep 1
  done

  log "${label} failed to start on ${port}"
  return 1
}

wait_for_process() {
  local label="$1"
  local pattern="$2"

  for _ in {1..30}; do
    if has_process "${pattern}"; then
      log "${label} process detected"
      return 0
    fi
    sleep 1
  done

  log "${label} process was not detected"
  return 1
}

cd "${ROOT_DIR}"

if ! is_port_listening "${STORAGE_PORT}"; then
  start_background "local storage" "${LOG_DIR}/minio.log" pnpm dev:storage:local
fi
wait_for_port "local storage" "${STORAGE_PORT}"

if ! is_port_listening "${WEB_PORT}" || ! has_process "validation-worker"; then
  start_background "WC01 web + validation worker" "${LOG_DIR}/wc01-localhost.log" pnpm restart:localhost
fi
wait_for_port "web app" "${WEB_PORT}"
wait_for_process "validation worker" "validation-worker"

if ! has_process "@signal-scanner/scanner|run-ws01-scanner-dev.sh|scan-core/src ./src/index.ts"; then
  start_background "WS01 scan worker" "${LOG_DIR}/ws01-scanner.log" pnpm dev:scanner:local
fi
wait_for_process "WS01 scan worker" "@signal-scanner/scanner|run-ws01-scanner-dev.sh|scan-core/src ./src/index.ts"

log "running runtime checks"
pnpm --filter @website-signal-risk-scanner/web check-runtime
pnpm --filter @website-signal-risk-scanner/validation-worker check-runtime

log "scan stack is ready"
log "web: http://localhost:${WEB_PORT}"
log "logs: ${LOG_DIR}/minio.log, ${LOG_DIR}/wc01-localhost.log, ${LOG_DIR}/ws01-scanner.log"
