#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_ENV_FILE="${ROOT_DIR}/apps/web/.env.local"
LOG_DIR="${ROOT_DIR}/tmp/local-dev"
WEB_PORT="${WEB_PORT:-3000}"
STORAGE_PORT="${STORAGE_PORT:-9000}"
FORCE_RESTART="${FORCE_RESTART:-0}"
FORCE_RESTART_SCANNER="${FORCE_RESTART_SCANNER:-0}"
SKIP_SCANNER="${SKIP_SCANNER:-0}"
SKIP_VALIDATION_WORKER="${SKIP_VALIDATION_WORKER:-0}"
STATUS_ONLY="${STATUS_ONLY:-0}"

mkdir -p "${LOG_DIR}"

log() {
  printf '[local-scan-ready] %s\n' "$*"
}

fail() {
  printf '[local-scan-ready] ERROR: %s\n' "$*" >&2
  exit 1
}

load_web_env() {
  [[ -f "${WEB_ENV_FILE}" ]] || fail "missing ${WEB_ENV_FILE}"
  set -a
  # shellcheck disable=SC1090
  source "${WEB_ENV_FILE}"
  set +a
}

is_port_listening() {
  local port="$1"
  lsof -nP -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1
}

process_lines() {
  local pattern="$1"
  ps ax -o pid=,ppid=,command= | grep -E "${pattern}" | grep -v grep | grep -v "ensure-local-scan-stack.sh" || true
}

process_count() {
  local pattern="$1"
  process_lines "${pattern}" | awk 'NF { count += 1 } END { print count + 0 }'
}

has_process() {
  [[ -n "$(process_lines "$1")" ]]
}

kill_processes() {
  local label="$1"
  local pattern="$2"
  local pids

  pids="$(process_lines "${pattern}" | awk '{print $1}' || true)"
  if [[ -z "${pids}" ]]; then
    return 0
  fi

  log "stopping ${label}: ${pids//$'\n'/ }"
  # shellcheck disable=SC2086
  kill ${pids} >/dev/null 2>&1 || true
  sleep 2

  pids="$(process_lines "${pattern}" | awk '{print $1}' || true)"
  if [[ -n "${pids}" ]]; then
    # shellcheck disable=SC2086
    kill -9 ${pids} >/dev/null 2>&1 || true
  fi
}

kill_screen_session() {
  local session_name="$1"
  screen -S "${session_name}" -X quit >/dev/null 2>&1 || true
}

start_background() {
  local label="$1"
  local logfile="$2"
  local session_name="$3"
  local runner="${LOG_DIR}/${session_name}.command.sh"
  shift 2

  : >"${logfile}"
  shift 1
  {
    printf '#!/usr/bin/env bash\n'
    printf 'set -euo pipefail\n'
    printf 'cd %q\n' "${ROOT_DIR}"
    printf 'exec'
    printf ' %q' "$@"
    printf '\n'
  } >"${runner}"
  chmod +x "${runner}"

  log "starting ${label} (log: ${logfile})"
  screen -dmS "${session_name}" bash -lc "exec ${runner} >>${logfile} 2>&1"
}

wait_for_log() {
  local label="$1"
  local logfile="$2"
  local pattern="$3"
  local timeout="${4:-60}"

  for _ in $(seq 1 "${timeout}"); do
    if [[ -f "${logfile}" ]] && grep -Eq "${pattern}" "${logfile}"; then
      log "${label} reported ready"
      return 0
    fi
    sleep 1
  done

  return 1
}

wait_for_port() {
  local label="$1"
  local port="$2"
  local timeout="${3:-45}"

  for _ in $(seq 1 "${timeout}"); do
    if is_port_listening "${port}"; then
      log "${label} is listening on ${port}"
      return 0
    fi
    sleep 1
  done

  return 1
}

wait_for_process() {
  local label="$1"
  local pattern="$2"
  local timeout="${3:-45}"

  for _ in $(seq 1 "${timeout}"); do
    if has_process "${pattern}"; then
      log "${label} process detected"
      return 0
    fi
    sleep 1
  done

  return 1
}

print_status() {
  log "status"
  log "web port ${WEB_PORT}: $(is_port_listening "${WEB_PORT}" && printf listening || printf not-listening)"
  log "storage port ${STORAGE_PORT}: $(is_port_listening "${STORAGE_PORT}" && printf listening || printf not-listening)"
  log "validation worker processes: $(process_count "@website-signal-risk-scanner/validation-worker dev|--env-file=../web/.env.local --enable-source-maps --import tsx --watch ./src/index.ts")"
  log "WS01 scanner processes: $(process_count "run-ws01-scanner-dev.sh|node --env-file=.env.local.ws01 --enable-source-maps --import tsx ./src/index.ts")"
  log "WS01_ROOT: ${WS01_ROOT:-${ROOT_DIR}/../WS01}"
  log "SCANNER_ENV_FILE: ${SCANNER_ENV_FILE:-${WS01_ROOT:-${ROOT_DIR}/../WS01}/apps/scanner/.env.local.ws01}"
  log "S3_ENDPOINT: ${S3_ENDPOINT:-unset}"
  log "S3_BUCKET: ${S3_BUCKET:-unset}"
  log "S3_FORCE_PATH_STYLE: ${S3_FORCE_PATH_STYLE:-unset}"
  log "REMOTE_CDP_WS_ENDPOINT: $(if [[ -n "${REMOTE_CDP_WS_ENDPOINT:-}" ]]; then printf set; else printf unset; fi)"
  screen -ls || true
}

database_is_local() {
  node -e '
    const value = process.env.DATABASE_URL;
    if (!value) process.exit(1);
    const url = new URL(value);
    process.exit(["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) ? 0 : 1);
  '
}

database_port() {
  node -e '
    const url = new URL(process.env.DATABASE_URL);
    console.log(url.port || "5432");
  '
}

wait_for_database() {
  local timeout="${1:-45}"

  for _ in $(seq 1 "${timeout}"); do
    if (
      cd "${ROOT_DIR}/apps/web"
      node --input-type=module <<'EOF' >/dev/null 2>&1
import { Client } from "pg";

const client = new Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  await client.query("select 1");
  await client.end();
  process.exit(0);
} catch {
  try {
    await client.end();
  } catch {}
  process.exit(1);
}
EOF
    ); then
      log "database is reachable"
      return 0
    fi
    sleep 1
  done

  return 1
}

start_local_database_if_needed() {
  if wait_for_database 3; then
    return 0
  fi

  if ! database_is_local; then
    fail "DATABASE_URL is not reachable and does not point at localhost; start the configured database manually"
  fi

  local port
  port="$(database_port)"
  log "local database is not reachable on port ${port}; attempting to start Postgres"

  if command -v brew >/dev/null 2>&1; then
    for service in postgresql@17 postgresql@16 postgresql@15 postgresql@14 postgresql; do
      if brew services list 2>/dev/null | awk '{print $1}' | grep -qx "${service}"; then
        log "starting Homebrew service ${service}"
        brew services start "${service}" >/dev/null 2>&1 || true
        if wait_for_database 20; then
          return 0
        fi
      fi
    done
  fi

  if command -v pg_ctl >/dev/null 2>&1 && [[ -n "${PGDATA:-}" ]]; then
    log "starting Postgres with pg_ctl and PGDATA=${PGDATA}"
    pg_ctl -D "${PGDATA}" start >/dev/null 2>&1 || true
    if wait_for_database 20; then
      return 0
    fi
  fi

  fail "could not start local Postgres; start it manually and rerun this script"
}

ensure_visual_evidence_storage() {
  local bucket="${S3_BUCKET:-scan-artifacts}"
  local endpoint="${S3_ENDPOINT:-}"
  local object_root="${ROOT_DIR}/tmp/minio-data/${bucket}"
  local probe_key=".local-stack-health/visual-evidence-probe.txt"
  local probe_path="${object_root}/${probe_key}"

  if [[ -z "${endpoint}" ]]; then
    fail "S3_ENDPOINT is not set; local visual evidence cannot be served"
  fi

  if [[ ! "${endpoint}" =~ ^https?://(127\.0\.0\.1|localhost|\[::1\])(:[0-9]+)?/?$ ]]; then
    log "S3_ENDPOINT=${endpoint} is not local; skipping local MinIO file probe"
  else
    mkdir -p "$(dirname "${probe_path}")"
    printf 'visual-evidence-probe %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" >"${probe_path}"
    [[ -s "${probe_path}" ]] || fail "could not write local visual evidence probe to ${probe_path}"
    log "visual evidence storage path is writable: ${object_root}"
  fi

  (
    cd "${ROOT_DIR}/apps/web"
    node --input-type=module <<'EOF'
import { Client } from "pg";

const client = new Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  const result = await client.query(`
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'scan_runtime_artifacts'
      and column_name in ('visual_evidence_artifacts', 'visual_access_review')
  `);
  await client.end();
  process.exit(result.rowCount === 2 ? 0 : 1);
} catch {
  try {
    await client.end();
  } catch {}
  process.exit(1);
}
EOF
  ) || fail "scan_runtime_artifacts is missing visual evidence columns; run migrations"

  log "visual evidence database columns are present"
}

ensure_storage() {
  local pattern="minio server .*tmp/minio-data|run-local-minio.sh"

  if [[ "${FORCE_RESTART}" == "1" ]]; then
    kill_processes "local storage" "${pattern}"
  fi

  if ! is_port_listening "${STORAGE_PORT}"; then
    start_background "local storage" "${LOG_DIR}/minio.log" certscore-minio pnpm dev:storage:local
  fi

  wait_for_port "local storage" "${STORAGE_PORT}" 45 || {
    tail -80 "${LOG_DIR}/minio.log" >&2 || true
    fail "local storage failed to start"
  }
}

ensure_web() {
  local pattern="next-server \\(v[0-9.]+\\)|next dev --turbo --port ${WEB_PORT}|next dev --port ${WEB_PORT}"

  if [[ "${FORCE_RESTART}" == "1" ]]; then
    kill_processes "web app" "${pattern}"
  fi

  if ! is_port_listening "${WEB_PORT}"; then
    start_background "web app" "${LOG_DIR}/web.log" certscore-web pnpm --filter @website-signal-risk-scanner/web dev
  fi

  wait_for_port "web app" "${WEB_PORT}" 60 || {
    tail -120 "${LOG_DIR}/web.log" >&2 || true
    fail "web app failed to start"
  }
}

ensure_validation_worker() {
  local pattern="@website-signal-risk-scanner/validation-worker dev|--env-file=../web/.env.local --enable-source-maps --import tsx --watch ./src/index.ts"

  if [[ "${SKIP_VALIDATION_WORKER}" == "1" ]]; then
    log "skipping validation worker because SKIP_VALIDATION_WORKER=1"
    return 0
  fi

  if [[ "${FORCE_RESTART}" == "1" ]]; then
    kill_processes "validation worker" "${pattern}"
  fi

  if ! has_process "${pattern}"; then
    start_background "validation worker" "${LOG_DIR}/validation-worker.log" certscore-validation-worker pnpm --filter @website-signal-risk-scanner/validation-worker dev
  fi

  wait_for_process "validation worker" "${pattern}" 45 || {
    tail -120 "${LOG_DIR}/validation-worker.log" >&2 || true
    fail "validation worker failed to start"
  }
}

ensure_scanner() {
  local pattern="run-ws01-scanner-dev.sh|node --env-file=.env.local.ws01 --enable-source-maps --import tsx ./src/index.ts"
  local scanner_process_pattern="node --env-file=.env.local.ws01 --enable-source-maps --import tsx ./src/index.ts"
  local scanner_count

  if [[ "${SKIP_SCANNER}" == "1" ]]; then
    log "skipping WS01 scanner because SKIP_SCANNER=1"
    return 0
  fi

  if [[ "${FORCE_RESTART}" == "1" || "${FORCE_RESTART_SCANNER}" == "1" ]]; then
    kill_screen_session "certscore-ws01-scanner"
    kill_processes "WS01 scanner" "${pattern}"
  fi

  scanner_count="$(process_count "${scanner_process_pattern}")"
  if [[ "${scanner_count}" -gt 1 ]]; then
    log "found ${scanner_count} WS01 scanner loops; cleaning up before restart"
    kill_screen_session "certscore-ws01-scanner"
    kill_processes "WS01 scanner" "${pattern}"
  fi

  if ! has_process "${pattern}"; then
    start_background "WS01 scanner" "${LOG_DIR}/ws01-scanner.log" certscore-ws01-scanner pnpm dev:scanner:local
  fi

  wait_for_process "WS01 scanner" "${pattern}" 60 || {
    tail -120 "${LOG_DIR}/ws01-scanner.log" >&2 || true
    fail "WS01 scanner failed to start"
  }

  wait_for_log "WS01 scanner" "${LOG_DIR}/ws01-scanner.log" "\\[scanner\\] started" 90 || {
    tail -160 "${LOG_DIR}/ws01-scanner.log" >&2 || true
    fail "WS01 scanner process exists but did not report readiness"
  }

  scanner_count="$(process_count "${scanner_process_pattern}")"
  if [[ "${scanner_count}" -ne 1 ]]; then
    process_lines "${pattern}" >&2 || true
    fail "expected exactly one WS01 scanner loop, found ${scanner_count}"
  fi
}

cd "${ROOT_DIR}"
load_web_env

command -v screen >/dev/null 2>&1 || fail "missing screen; install screen or run services manually"

if [[ "${STATUS_ONLY}" == "1" ]]; then
  print_status
  exit 0
fi

start_local_database_if_needed
log "applying local database migrations"
pnpm db:migrate

ensure_storage
ensure_visual_evidence_storage
ensure_web
ensure_validation_worker
ensure_scanner

log "running runtime checks"
pnpm --filter @website-signal-risk-scanner/web check-runtime
pnpm --filter @website-signal-risk-scanner/validation-worker check-runtime

log "scan stack is ready"
log "web: http://localhost:${WEB_PORT}"
log "storage: http://127.0.0.1:${STORAGE_PORT}"
log "logs: ${LOG_DIR}/web.log, ${LOG_DIR}/validation-worker.log, ${LOG_DIR}/minio.log, ${LOG_DIR}/ws01-scanner.log"
