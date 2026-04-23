#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_ENV_FILE="$ROOT_DIR/apps/web/.env.local"
MINIO_DATA_DIR="${MINIO_DATA_DIR:-$ROOT_DIR/tmp/minio-data}"

if [[ ! -f "$WEB_ENV_FILE" ]]; then
  echo "[run-local-minio] missing $WEB_ENV_FILE" >&2
  exit 1
fi

set -a
source "$WEB_ENV_FILE"
set +a

required_vars=(
  S3_BUCKET
  S3_REGION
  S3_ACCESS_KEY_ID
  S3_SECRET_ACCESS_KEY
  S3_ENDPOINT
)

for var_name in "${required_vars[@]}"; do
  if [[ -z "${!var_name:-}" ]]; then
    echo "[run-local-minio] missing $var_name in $WEB_ENV_FILE" >&2
    exit 1
  fi
done

endpoint_host="$(node -p "new URL(process.argv[1]).hostname" "$S3_ENDPOINT")"
endpoint_port="$(node -p "new URL(process.argv[1]).port || (new URL(process.argv[1]).protocol === 'https:' ? '443' : '80')" "$S3_ENDPOINT")"

if [[ "$endpoint_host" != "127.0.0.1" && "$endpoint_host" != "localhost" ]]; then
  echo "[run-local-minio] refusing to start local MinIO for non-local S3 endpoint $S3_ENDPOINT" >&2
  exit 1
fi

if ! command -v minio >/dev/null 2>&1; then
  echo "[run-local-minio] missing 'minio' binary. Install MinIO locally before using this helper." >&2
  exit 1
fi

ensure_bucket() {
  (
    cd "$ROOT_DIR/apps/web"
    node --input-type=module <<'EOF'
import { CreateBucketCommand, HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";

const bucket = process.env.S3_BUCKET;
const client = new S3Client({
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY
  },
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle:
    process.env.S3_FORCE_PATH_STYLE === "true" || process.env.S3_FORCE_PATH_STYLE === "1",
  region: process.env.S3_REGION
});

try {
  await client.send(new HeadBucketCommand({ Bucket: bucket }));
  console.log(`[run-local-minio] bucket ${bucket} is reachable`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.log(`[run-local-minio] creating bucket ${bucket} after head-bucket failure: ${message}`);
  await client.send(new CreateBucketCommand({ Bucket: bucket }));
  console.log(`[run-local-minio] bucket ${bucket} created`);
}
EOF
  )
}

if curl --silent --fail "http://${endpoint_host}:${endpoint_port}/minio/health/live" >/dev/null 2>&1; then
  echo "[run-local-minio] MinIO already reachable at $S3_ENDPOINT"
  ensure_bucket
  exit 0
fi

mkdir -p "$MINIO_DATA_DIR"

export MINIO_ROOT_USER="$S3_ACCESS_KEY_ID"
export MINIO_ROOT_PASSWORD="$S3_SECRET_ACCESS_KEY"

console_port="${MINIO_CONSOLE_PORT:-9001}"

echo "[run-local-minio] starting MinIO at $S3_ENDPOINT with data dir $MINIO_DATA_DIR"
minio server "$MINIO_DATA_DIR" --address "${endpoint_host}:${endpoint_port}" --console-address "127.0.0.1:${console_port}" &
minio_pid=$!

cleanup() {
  if kill -0 "$minio_pid" >/dev/null 2>&1; then
    kill "$minio_pid" >/dev/null 2>&1 || true
    wait "$minio_pid" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

for _ in {1..30}; do
  if curl --silent --fail "http://${endpoint_host}:${endpoint_port}/minio/health/live" >/dev/null 2>&1; then
    ensure_bucket
    echo "[run-local-minio] MinIO is ready"
    wait "$minio_pid"
    exit $?
  fi

  sleep 1
done

echo "[run-local-minio] MinIO did not become ready at $S3_ENDPOINT within 30 seconds" >&2
exit 1
