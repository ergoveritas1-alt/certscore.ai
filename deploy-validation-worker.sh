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
database_url_secret_name="${DATABASE_URL_SECRET_NAME:-}"
database_ssl_mode="${DATABASE_SSL_MODE:-}"
openai_api_secret_name="${OPENAI_API_KEY_SECRET_NAME:-certscore-validation-worker-openai-api-key}"
validation_redis_secret_name="${VALIDATION_REDIS_URL_SECRET_NAME:-certscore-validation-worker-redis-url}"
s3_bucket="${S3_BUCKET:-}"
s3_region="${S3_REGION:-}"
s3_endpoint="${S3_ENDPOINT:-}"
s3_force_path_style="${S3_FORCE_PATH_STYLE:-}"
s3_access_key_secret_name="${S3_ACCESS_KEY_ID_SECRET_NAME:-}"
s3_secret_access_key_secret_name="${S3_SECRET_ACCESS_KEY_SECRET_NAME:-}"
web_bot_auth_private_key_secret_name="${WEB_BOT_AUTH_PRIVATE_KEY_SECRET_NAME:-}"
cloudbuild_config="$(mktemp /tmp/certscore-validation-worker-cloudbuild.XXXXXX)"

if [[ -z "${database_url_secret_name}" ]]; then
  echo "Set DATABASE_URL_SECRET_NAME before deploying the validation worker." >&2
  exit 1
fi

if [[ -z "${s3_bucket}" ]]; then
  echo "Set S3_BUCKET before deploying the validation worker." >&2
  exit 1
fi

if [[ -z "${s3_region}" ]]; then
  echo "Set S3_REGION before deploying the validation worker." >&2
  exit 1
fi

if [[ -z "${s3_access_key_secret_name}" ]]; then
  echo "Set S3_ACCESS_KEY_ID_SECRET_NAME before deploying the validation worker." >&2
  exit 1
fi

if [[ -z "${s3_secret_access_key_secret_name}" ]]; then
  echo "Set S3_SECRET_ACCESS_KEY_SECRET_NAME before deploying the validation worker." >&2
  exit 1
fi

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
  --set-env-vars "NODE_ENV=production,S3_BUCKET=${s3_bucket},S3_REGION=${s3_region},VALIDATION_PIPELINE_ENABLED=${VALIDATION_PIPELINE_ENABLED:-1},VALIDATION_SCHEDULER_POLL_MINUTES=${VALIDATION_SCHEDULER_POLL_MINUTES:-1},VALIDATION_DEFAULT_RUN_MODE=${VALIDATION_DEFAULT_RUN_MODE:-manual},VALIDATION_DEFAULT_SAMPLE_INTERVAL_MINUTES=${VALIDATION_DEFAULT_SAMPLE_INTERVAL_MINUTES:-20},VALIDATION_TRANCO_MIN_RANK=${VALIDATION_TRANCO_MIN_RANK:-10000},VALIDATION_TRANCO_MAX_RANK=${VALIDATION_TRANCO_MAX_RANK:-20000},VALIDATION_OPENAI_MODEL=${VALIDATION_OPENAI_MODEL:-gpt-5.4},WORKER_CONCURRENCY=${WORKER_CONCURRENCY:-1},PLAYWRIGHT_BROWSERS_PATH=${PLAYWRIGHT_BROWSERS_PATH:-/ms-playwright}"
  --set-secrets "DATABASE_URL=${database_url_secret_name}:latest,OPENAI_API_KEY=${openai_api_secret_name}:latest,REDIS_URL=${validation_redis_secret_name}:latest,VALIDATION_REDIS_URL=${validation_redis_secret_name}:latest,S3_ACCESS_KEY_ID=${s3_access_key_secret_name}:latest,S3_SECRET_ACCESS_KEY=${s3_secret_access_key_secret_name}:latest"
)

if [[ -n "${database_ssl_mode}" ]]; then
  deploy_args+=(--update-env-vars "DATABASE_SSL_MODE=${database_ssl_mode}")
else
  deploy_args+=(--remove-env-vars "DATABASE_SSL_MODE")
fi

if [[ -n "${s3_endpoint}" ]]; then
  deploy_args+=(--update-env-vars "S3_ENDPOINT=${s3_endpoint}")
else
  deploy_args+=(--remove-env-vars "S3_ENDPOINT")
fi

if [[ -n "${s3_force_path_style}" ]]; then
  deploy_args+=(--update-env-vars "S3_FORCE_PATH_STYLE=${s3_force_path_style}")
else
  deploy_args+=(--remove-env-vars "S3_FORCE_PATH_STYLE")
fi

if [[ -n "${web_bot_auth_private_key_secret_name}" ]]; then
  deploy_args+=(--update-secrets "WEB_BOT_AUTH_PRIVATE_KEY_PEM=${web_bot_auth_private_key_secret_name}:latest")
else
  deploy_args+=(--remove-secrets "WEB_BOT_AUTH_PRIVATE_KEY_PEM")
fi

if [[ -n "${service_account}" ]]; then
  deploy_args+=(--service-account "${service_account}")
fi

gcloud beta run worker-pools deploy "${WORKER_POOL_NAME}" "${deploy_args[@]}"

echo "Deployed ${WORKER_POOL_NAME} to ${PROJECT_ID}/${REGION} using ${IMAGE_URI}."
