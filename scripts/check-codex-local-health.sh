#!/usr/bin/env bash
set -euo pipefail

CODEX_HOME="${CODEX_HOME:-${HOME}/.codex}"
INTERVAL_SECONDS="${CODEX_HEALTH_INTERVAL_SECONDS:-30}"
WARN_WAL_MB="${CODEX_HEALTH_WARN_WAL_MB:-64}"
WATCH=0
LAST_TOTAL_WAL_BYTES=""

if [[ "${1:-}" == "--watch" ]]; then
  WATCH=1
fi

log() {
  printf '[codex-health] %s\n' "$*"
}

bytes_for_file() {
  local path="$1"

  if [[ ! -e "${path}" ]]; then
    printf '0'
    return
  fi

  stat -f '%z' "${path}"
}

human_size() {
  local path="$1"

  if [[ -e "${path}" ]]; then
    du -h "${path}" | awk '{print $1}'
  else
    printf 'missing'
  fi
}

human_bytes() {
  local bytes="$1"

  awk -v bytes="${bytes}" 'BEGIN {
    split("B KB MB GB", units, " ");
    size = bytes + 0;
    unit = 1;
    while (size >= 1024 && unit < 4) {
      size = size / 1024;
      unit++;
    }
    if (unit == 1) {
      printf "%d %s", size, units[unit];
    } else {
      printf "%.1f %s", size, units[unit];
    }
  }'
}

print_file_sizes() {
  local total_wal_bytes=0

  log "codex home: ${CODEX_HOME}"
  for path in \
    "${CODEX_HOME}/logs_2.sqlite" \
    "${CODEX_HOME}/logs_2.sqlite-wal" \
    "${CODEX_HOME}/state_5.sqlite" \
    "${CODEX_HOME}/state_5.sqlite-wal"
  do
    local size
    size="$(human_size "${path}")"
    log "$(basename "${path}"): ${size}"

    if [[ "${path}" == *-wal ]]; then
      total_wal_bytes=$((total_wal_bytes + $(bytes_for_file "${path}")))
    fi
  done

  if [[ -n "${LAST_TOTAL_WAL_BYTES}" ]]; then
    local delta=$((total_wal_bytes - LAST_TOTAL_WAL_BYTES))
    if (( delta >= 0 )); then
      log "total WAL: $(human_bytes "${total_wal_bytes}") (+$(human_bytes "${delta}") since last sample)"
    else
      log "total WAL: $(human_bytes "${total_wal_bytes}") ($(human_bytes "${delta}") since last sample)"
    fi
  else
    log "total WAL: $(human_bytes "${total_wal_bytes}")"
  fi
  LAST_TOTAL_WAL_BYTES="${total_wal_bytes}"

  local warn_bytes=$((WARN_WAL_MB * 1024 * 1024))
  if (( total_wal_bytes >= warn_bytes )); then
    log "warning: Codex WAL files are at or above ${WARN_WAL_MB} MB; consider finishing the current turn, quitting Codex, and reopening a fresh thread"
  fi
}

print_log_targets() {
  local db="${CODEX_HOME}/logs_2.sqlite"

  if [[ ! -f "${db}" ]]; then
    log "logs_2.sqlite is missing; skipping log target summary"
    return
  fi

  if ! command -v sqlite3 >/dev/null 2>&1; then
    log "sqlite3 is unavailable; skipping log target summary"
    return
  fi

  log "top retained log targets:"
  sqlite3 "${db}" "
    select
      printf('  %-38s %5d rows %6.2f MB', substr(target, 1, 38), count(*), sum(estimated_bytes) / 1024.0 / 1024.0)
    from logs
    group by target
    order by sum(estimated_bytes) desc
    limit 8;
  " || log "could not read log target summary, likely because Codex is writing to the database"
}

print_runtime_context() {
  if [[ -f "/Applications/Codex.app/Contents/Info.plist" ]]; then
    local version bundle
    version="$(defaults read /Applications/Codex.app/Contents/Info CFBundleShortVersionString 2>/dev/null || true)"
    bundle="$(defaults read /Applications/Codex.app/Contents/Info CFBundleVersion 2>/dev/null || true)"
    log "Codex.app version: ${version:-unknown} (${bundle:-unknown})"
  fi

  if command -v pmset >/dev/null 2>&1; then
    pmset -g batt | sed 's/^/[codex-health] /'
  fi

  if pgrep -f "/Applications/Codex.app" >/dev/null 2>&1; then
    log "Codex processes are running"
  else
    log "Codex processes are not running"
  fi
}

run_once() {
  print_runtime_context
  print_file_sizes
  print_log_targets
}

if (( WATCH == 1 )); then
  log "watching every ${INTERVAL_SECONDS}s; press Ctrl-C to stop"
  while true; do
    run_once
    sleep "${INTERVAL_SECONDS}"
  done
fi

run_once
