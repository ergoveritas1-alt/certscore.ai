#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-certscore-ai}"
REGION="${REGION:-us-central1}"
REPOSITORY="${REPOSITORY:-certscore}"
WORKER_POOL_NAME="${WORKER_POOL_NAME:-certscore-worker}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/worker:${IMAGE_TAG}"
service_account="${SERVICE_ACCOUNT:-}"
cloudbuild_config="$(mktemp /tmp/certscore-worker-cloudbuild.XXXXXX)"

required_vars=(
  NEXT_PUBLIC_SUPABASE_URL
  NEXT_PUBLIC_SUPABASE_ANON_KEY
  SUPABASE_SERVICE_ROLE_KEY
  REDIS_URL
  SUPABASE_STORAGE_BUCKET
)

for var_name in "${required_vars[@]}"; do
  if [[ -z "${!var_name:-}" ]]; then
    echo "Missing required environment variable: ${var_name}" >&2
    exit 1
  fi
done

redis_host="$(python3 - <<'PY'
from urllib.parse import urlparse
import os

print(urlparse(os.environ["REDIS_URL"]).hostname or "")
PY
)"

if [[ "${redis_host}" == "127.0.0.1" || "${redis_host}" == "localhost" ]]; then
  echo "REDIS_URL points at a local host (${redis_host}). Refusing to deploy production worker." >&2
  exit 1
fi

if [[ "${redis_host}" == *.upstash.io ]]; then
  echo "REDIS_URL still points at Upstash (${redis_host}). Refusing to deploy until production Redis is replaced." >&2
  exit 1
fi

cleanup() {
  rm -f "${cloudbuild_config}"
}

trap cleanup EXIT

if ! gcloud artifacts repositories describe "${REPOSITORY}" \
  --location "${REGION}" \
  --project "${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud artifacts repositories create "${REPOSITORY}" \
    --repository-format docker \
    --location "${REGION}" \
    --project "${PROJECT_ID}"
fi

cat > "${cloudbuild_config}" <<EOF
steps:
  - name: gcr.io/cloud-builders/docker
    args:
      - build
      - -f
      - apps/worker/Dockerfile
      - -t
      - ${IMAGE_URI}
      - .
images:
  - ${IMAGE_URI}
EOF

gcloud builds submit \
  --project "${PROJECT_ID}" \
  --config "${cloudbuild_config}" \
  .

deploy_args=(
  --project "${PROJECT_ID}"
  --region "${REGION}"
  --image "${IMAGE_URI}"
  --instances 1
  --memory 2Gi
  --cpu 2
  --set-env-vars "NODE_ENV=production,NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL},NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY},SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY},REDIS_URL=${REDIS_URL},SUPABASE_STORAGE_BUCKET=${SUPABASE_STORAGE_BUCKET},SUPABASE_STORAGE_BUCKET_SCREENSHOTS=${SUPABASE_STORAGE_BUCKET_SCREENSHOTS:-scan-screenshots},SUPABASE_STORAGE_BUCKET_ARTIFACTS=${SUPABASE_STORAGE_BUCKET_ARTIFACTS:-scan-artifacts},WORKER_CONCURRENCY=${WORKER_CONCURRENCY:-2},PLAYWRIGHT_BROWSERS_PATH=${PLAYWRIGHT_BROWSERS_PATH:-/ms-playwright},OPENAI_API_KEY=${OPENAI_API_KEY:-},LLM_ENRICHMENT_ENABLED=${LLM_ENRICHMENT_ENABLED:-0},LLM_ENRICHMENT_TIMEOUT_MS=${LLM_ENRICHMENT_TIMEOUT_MS:-15000},LLM_ENRICHMENT_MAX_ATTEMPTS=${LLM_ENRICHMENT_MAX_ATTEMPTS:-3},LLM_ENRICHMENT_MAX_CHUNKS=${LLM_ENRICHMENT_MAX_CHUNKS:-5},LLM_ENRICHMENT_FORCE_LAST_CHUNK=${LLM_ENRICHMENT_FORCE_LAST_CHUNK:-1},RESEND_API_KEY=${RESEND_API_KEY:-}"
)

if [[ -n "${service_account}" ]]; then
  deploy_args+=(--service-account "${service_account}")
fi

gcloud beta run worker-pools deploy "${WORKER_POOL_NAME}" "${deploy_args[@]}"

echo "Deployed ${WORKER_POOL_NAME} to ${PROJECT_ID}/${REGION} using ${IMAGE_URI}."
