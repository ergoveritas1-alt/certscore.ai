#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-certscore-ai}"
REGION="${REGION:-us-central1}"
REPOSITORY="${REPOSITORY:-certscore}"
WORKER_POOL_NAME="${WORKER_POOL_NAME:-certscore-validation-worker}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/validation-worker:${IMAGE_TAG}"
build_service_account="${BUILD_SERVICE_ACCOUNT:-certscore-build-sa@${PROJECT_ID}.iam.gserviceaccount.com}"
service_account="${SERVICE_ACCOUNT:-certscore-validation-worker-sa@${PROJECT_ID}.iam.gserviceaccount.com}"
prod_supabase_url="${NEXT_PUBLIC_SUPABASE_URL:-https://wgfhzyrysztmtrjbcsgy.supabase.co}"
prod_supabase_anon_key="${NEXT_PUBLIC_SUPABASE_ANON_KEY:-sb_publishable_5IJ4sZwcahADQtkyMq2rgA_g6NaYJxS}"
supabase_service_role_secret_name="${SUPABASE_SERVICE_ROLE_SECRET_NAME:-certscore-validation-worker-supabase-service-role-key}"
openai_api_secret_name="${OPENAI_API_KEY_SECRET_NAME:-certscore-validation-worker-openai-api-key}"
validation_redis_secret_name="${VALIDATION_REDIS_URL_SECRET_NAME:-certscore-validation-worker-redis-url}"
cloudbuild_config="$(mktemp /tmp/certscore-validation-worker-cloudbuild.XXXXXX)"

validation_redis_url="$(gcloud secrets versions access latest \
  --project "${PROJECT_ID}" \
  --secret "${validation_redis_secret_name}")"

validation_redis_host="$(VALIDATION_REDIS_URL="${validation_redis_url}" python3 - <<'PY'
from urllib.parse import urlparse
import os

print(urlparse(os.environ["VALIDATION_REDIS_URL"]).hostname or "")
PY
)"

if [[ -z "${validation_redis_host}" ]]; then
  echo "Validation Redis secret ${validation_redis_secret_name} is empty or invalid." >&2
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
options:
  logging: CLOUD_LOGGING_ONLY
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
  --service-account "projects/${PROJECT_ID}/serviceAccounts/${build_service_account}" \
  --config "${cloudbuild_config}" \
  .

deploy_args=(
  --project "${PROJECT_ID}"
  --region "${REGION}"
  --image "${IMAGE_URI}"
  --instances 1
  --memory 2Gi
  --cpu 2
  --set-env-vars "NODE_ENV=production,NEXT_PUBLIC_SUPABASE_URL=${prod_supabase_url},NEXT_PUBLIC_SUPABASE_ANON_KEY=${prod_supabase_anon_key},VALIDATION_PIPELINE_ENABLED=${VALIDATION_PIPELINE_ENABLED:-1},VALIDATION_SCHEDULER_POLL_MINUTES=${VALIDATION_SCHEDULER_POLL_MINUTES:-1},VALIDATION_DEFAULT_RUN_MODE=${VALIDATION_DEFAULT_RUN_MODE:-manual},VALIDATION_DEFAULT_SAMPLE_INTERVAL_MINUTES=${VALIDATION_DEFAULT_SAMPLE_INTERVAL_MINUTES:-20},VALIDATION_TRANCO_MIN_RANK=${VALIDATION_TRANCO_MIN_RANK:-10000},VALIDATION_TRANCO_MAX_RANK=${VALIDATION_TRANCO_MAX_RANK:-20000},VALIDATION_OPENAI_MODEL=${VALIDATION_OPENAI_MODEL:-gpt-5.4},PLAYWRIGHT_BROWSERS_PATH=${PLAYWRIGHT_BROWSERS_PATH:-/ms-playwright}"
  --set-secrets "SUPABASE_SERVICE_ROLE_KEY=${supabase_service_role_secret_name}:latest,OPENAI_API_KEY=${openai_api_secret_name}:latest,REDIS_URL=${validation_redis_secret_name}:latest,VALIDATION_REDIS_URL=${validation_redis_secret_name}:latest"
)

if [[ -n "${service_account}" ]]; then
  deploy_args+=(--service-account "${service_account}")
fi

gcloud beta run worker-pools deploy "${WORKER_POOL_NAME}" "${deploy_args[@]}"

echo "Deployed ${WORKER_POOL_NAME} to ${PROJECT_ID}/${REGION} using ${IMAGE_URI}."
