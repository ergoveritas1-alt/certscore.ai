#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-certscore-ai}"
REGION="${REGION:-us-central1}"
REPOSITORY="${REPOSITORY:-certscore}"
WORKER_POOL_NAME="${WORKER_POOL_NAME:-certscore-worker}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/worker:${IMAGE_TAG}"
build_service_account="${BUILD_SERVICE_ACCOUNT:-certscore-build-sa@${PROJECT_ID}.iam.gserviceaccount.com}"
service_account="${SERVICE_ACCOUNT:-certscore-worker-sa@${PROJECT_ID}.iam.gserviceaccount.com}"
prod_supabase_url="${NEXT_PUBLIC_SUPABASE_URL:-https://wgfhzyrysztmtrjbcsgy.supabase.co}"
prod_supabase_anon_key="${NEXT_PUBLIC_SUPABASE_ANON_KEY:-sb_publishable_5IJ4sZwcahADQtkyMq2rgA_g6NaYJxS}"
prod_storage_bucket="${SUPABASE_STORAGE_BUCKET:-scan-reports}"
prod_storage_bucket_screenshots="${SUPABASE_STORAGE_BUCKET_SCREENSHOTS:-scan-screenshots}"
prod_storage_bucket_artifacts="${SUPABASE_STORAGE_BUCKET_ARTIFACTS:-scan-artifacts}"
supabase_service_role_secret_name="${SUPABASE_SERVICE_ROLE_SECRET_NAME:-certscore-worker-supabase-service-role-key}"
redis_secret_name="${REDIS_URL_SECRET_NAME:-certscore-worker-redis-url}"
openai_api_secret_name="${OPENAI_API_KEY_SECRET_NAME:-certscore-worker-openai-api-key}"
resend_api_secret_name="${RESEND_API_KEY_SECRET_NAME:-certscore-worker-resend-api-key}"
cloudbuild_config="$(mktemp /tmp/certscore-worker-cloudbuild.XXXXXX)"

redis_url="$(gcloud secrets versions access latest \
  --project "${PROJECT_ID}" \
  --secret "${redis_secret_name}")"

redis_host="$(REDIS_URL="${redis_url}" python3 - <<'PY'
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
      - apps/worker/Dockerfile
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
  --set-env-vars "NODE_ENV=production,NEXT_PUBLIC_SUPABASE_URL=${prod_supabase_url},NEXT_PUBLIC_SUPABASE_ANON_KEY=${prod_supabase_anon_key},SUPABASE_STORAGE_BUCKET=${prod_storage_bucket},SUPABASE_STORAGE_BUCKET_SCREENSHOTS=${prod_storage_bucket_screenshots},SUPABASE_STORAGE_BUCKET_ARTIFACTS=${prod_storage_bucket_artifacts},WORKER_CONCURRENCY=${WORKER_CONCURRENCY:-2},PLAYWRIGHT_BROWSERS_PATH=${PLAYWRIGHT_BROWSERS_PATH:-/ms-playwright},LLM_ENRICHMENT_ENABLED=${LLM_ENRICHMENT_ENABLED:-0},LLM_ENRICHMENT_TIMEOUT_MS=${LLM_ENRICHMENT_TIMEOUT_MS:-15000},LLM_ENRICHMENT_MAX_ATTEMPTS=${LLM_ENRICHMENT_MAX_ATTEMPTS:-3},LLM_ENRICHMENT_MAX_CHUNKS=${LLM_ENRICHMENT_MAX_CHUNKS:-5},LLM_ENRICHMENT_FORCE_LAST_CHUNK=${LLM_ENRICHMENT_FORCE_LAST_CHUNK:-1}"
  --set-secrets "SUPABASE_SERVICE_ROLE_KEY=${supabase_service_role_secret_name}:latest,REDIS_URL=${redis_secret_name}:latest,OPENAI_API_KEY=${openai_api_secret_name}:latest,RESEND_API_KEY=${resend_api_secret_name}:latest"
)

if [[ -n "${service_account}" ]]; then
  deploy_args+=(--service-account "${service_account}")
fi

gcloud beta run worker-pools deploy "${WORKER_POOL_NAME}" "${deploy_args[@]}"

echo "Deployed ${WORKER_POOL_NAME} to ${PROJECT_ID}/${REGION} using ${IMAGE_URI}."
