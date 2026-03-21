#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-certscore-ai}"
REGION="${REGION:-us-central1}"
REPOSITORY="${REPOSITORY:-certscore}"
WORKER_POOL_NAME="${WORKER_POOL_NAME:-certscore-validation-worker}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/validation-worker:${IMAGE_TAG}"
service_account="${SERVICE_ACCOUNT:-}"
supabase_service_role_secret_name="${SUPABASE_SERVICE_ROLE_SECRET_NAME:-certscore-validation-worker-supabase-service-role-key}"
openai_api_secret_name="${OPENAI_API_KEY_SECRET_NAME:-certscore-validation-worker-openai-api-key}"
validation_redis_secret_name="${VALIDATION_REDIS_URL_SECRET_NAME:-certscore-validation-worker-redis-url}"
cloudbuild_config="$(mktemp /tmp/certscore-validation-worker-cloudbuild.XXXXXX)"

required_vars=(
  NEXT_PUBLIC_SUPABASE_URL
  NEXT_PUBLIC_SUPABASE_ANON_KEY
)

for var_name in "${required_vars[@]}"; do
  if [[ -z "${!var_name:-}" ]]; then
    echo "Missing required environment variable: ${var_name}" >&2
    exit 1
  fi
done

validation_redis_host="$(python3 - <<'PY'
from urllib.parse import urlparse
import os

print(urlparse(os.environ.get("VALIDATION_REDIS_URL") or os.environ.get("REDIS_URL") or "").hostname or "")
PY
)"

if [[ -z "${validation_redis_host}" ]]; then
  echo "Missing required environment variable: VALIDATION_REDIS_URL or REDIS_URL" >&2
  exit 1
fi

if [[ "${validation_redis_host}" == "127.0.0.1" || "${validation_redis_host}" == "localhost" ]]; then
  echo "VALIDATION_REDIS_URL points at a local host (${validation_redis_host}). Refusing to deploy production validation worker." >&2
  exit 1
fi

if [[ "${validation_redis_host}" == *.upstash.io ]]; then
  echo "VALIDATION_REDIS_URL still points at Upstash (${validation_redis_host}). Refusing to deploy until production validation Redis is replaced." >&2
  exit 1
fi

export SUPABASE_PROJECT_REF="${SUPABASE_PROJECT_REF:-wgfhzyrysztmtrjbcsgy}"
echo "Running production schema audit for ${SUPABASE_PROJECT_REF}..."
pnpm supabase:audit:prod

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
      - apps/validation-worker/Dockerfile
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
  --set-env-vars "NODE_ENV=production,NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL},NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY},VALIDATION_PIPELINE_ENABLED=${VALIDATION_PIPELINE_ENABLED:-1},VALIDATION_SCHEDULER_POLL_MINUTES=${VALIDATION_SCHEDULER_POLL_MINUTES:-1},VALIDATION_DEFAULT_RUN_MODE=${VALIDATION_DEFAULT_RUN_MODE:-manual},VALIDATION_DEFAULT_SAMPLE_INTERVAL_MINUTES=${VALIDATION_DEFAULT_SAMPLE_INTERVAL_MINUTES:-20},VALIDATION_TRANCO_MIN_RANK=${VALIDATION_TRANCO_MIN_RANK:-1000},VALIDATION_TRANCO_MAX_RANK=${VALIDATION_TRANCO_MAX_RANK:-100000},VALIDATION_OPENAI_MODEL=${VALIDATION_OPENAI_MODEL:-gpt-5.4},PLAYWRIGHT_BROWSERS_PATH=${PLAYWRIGHT_BROWSERS_PATH:-/ms-playwright}"
  --set-secrets "SUPABASE_SERVICE_ROLE_KEY=${supabase_service_role_secret_name}:latest,OPENAI_API_KEY=${openai_api_secret_name}:latest,REDIS_URL=${validation_redis_secret_name}:latest,VALIDATION_REDIS_URL=${validation_redis_secret_name}:latest"
)

if [[ -n "${service_account}" ]]; then
  deploy_args+=(--service-account "${service_account}")
fi

gcloud beta run worker-pools deploy "${WORKER_POOL_NAME}" "${deploy_args[@]}"

echo "Deployed ${WORKER_POOL_NAME} to ${PROJECT_ID}/${REGION} using ${IMAGE_URI}."
