#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_ENV_FILE="$ROOT_DIR/apps/web/.env.local"
WS01_ROOT="${WS01_ROOT:-$(cd "$ROOT_DIR/.." && pwd)/WS01}"
WS01_SCANNER_DIR="$WS01_ROOT/apps/scanner"

if [[ ! -d "$WS01_SCANNER_DIR" ]]; then
  echo "[run-ws01-scanner-dev] expected WS01 scanner workspace at $WS01_SCANNER_DIR" >&2
  exit 1
fi

if [[ ! -f "$WEB_ENV_FILE" ]]; then
  echo "[run-ws01-scanner-dev] missing $WEB_ENV_FILE" >&2
  exit 1
fi

set -a
source "$WEB_ENV_FILE"
set +a

required_vars=(
  DATABASE_URL
)

for var_name in "${required_vars[@]}"; do
  if [[ -z "${!var_name:-}" ]]; then
    echo "[run-ws01-scanner-dev] missing $var_name in $WEB_ENV_FILE" >&2
    exit 1
  fi
done

export WORKER_CONCURRENCY="${WORKER_CONCURRENCY:-3}"
export SCANNER_POLL_INTERVAL_MS="${SCANNER_POLL_INTERVAL_MS:-3000}"
export SCANNER_STALE_SCAN_THRESHOLD_MS="${SCANNER_STALE_SCAN_THRESHOLD_MS:-3600000}"
export SCANNER_CRAWLER_NAME="${SCANNER_CRAWLER_NAME:-SignalScannerBot}"
export SCANNER_CRAWLER_PUBLIC_URL="${SCANNER_CRAWLER_PUBLIC_URL:-https://mycrawler.cloud}"
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/Library/Caches/ms-playwright}"
export S3_BUCKET="${S3_BUCKET:-scan-artifacts}"
export SUPABASE_STORAGE_BUCKET="${SUPABASE_STORAGE_BUCKET:-$S3_BUCKET}"
export SUPABASE_STORAGE_BUCKET_SCREENSHOTS="${SUPABASE_STORAGE_BUCKET_SCREENSHOTS:-$S3_BUCKET}"
export SUPABASE_STORAGE_BUCKET_ARTIFACTS="${SUPABASE_STORAGE_BUCKET_ARTIFACTS:-$S3_BUCKET}"

echo "[run-ws01-scanner-dev] starting WS01 scanner with database host from DATABASE_URL"

cd "$WS01_SCANNER_DIR"
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR_VERSION="$(node -p 'process.versions.node.split(".")[0]')"
else
  NODE_MAJOR_VERSION=""
fi

if [[ -n "$NODE_MAJOR_VERSION" && "$NODE_MAJOR_VERSION" -ge 22 ]]; then
  exec node --enable-source-maps --import tsx \
    --watch-path=./src \
    --watch-path=../../packages/scan-core/src \
    ./src/index.ts
fi

exec npx -y node@22 --enable-source-maps --import tsx \
  --watch-path=./src \
  --watch-path=../../packages/scan-core/src \
  ./src/index.ts
