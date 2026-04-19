#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-certscore-ai}"
REGION="${REGION:-us-central1}"
REPOSITORY="${REPOSITORY:-certscore-validation}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/validation-worker:${IMAGE_TAG}"
BUILD_SERVICE_ACCOUNT="${BUILD_SERVICE_ACCOUNT:-certscore-build-sa@${PROJECT_ID}.iam.gserviceaccount.com}"
cloudbuild_config="$(mktemp /tmp/validation-worker-cloudbuild.XXXXXX)"

required_vars=(
  DATABASE_URL
  VALIDATION_REDIS_URL
  OPENAI_API_KEY
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

print(urlparse(os.environ["VALIDATION_REDIS_URL"]).hostname or "")
PY
)"

if [[ "${validation_redis_host}" == "127.0.0.1" || "${validation_redis_host}" == "localhost" ]]; then
  echo "VALIDATION_REDIS_URL points at a local host (${validation_redis_host}). Refusing to build a production validation image." >&2
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
  --service-account "projects/${PROJECT_ID}/serviceAccounts/${BUILD_SERVICE_ACCOUNT}" \
  --config "${cloudbuild_config}" \
  .

echo "Built validation worker image: ${IMAGE_URI}"
echo
echo "Suggested VM commands:"
echo "  docker pull ${IMAGE_URI}"
echo "  docker run -d --name validation-worker --restart unless-stopped --env-file /etc/validation-worker.env ${IMAGE_URI} pnpm --filter @website-signal-risk-scanner/validation-worker start"
echo "  docker run -d --name validation-scheduler --restart unless-stopped --env-file /etc/validation-worker.env ${IMAGE_URI} pnpm --filter @website-signal-risk-scanner/validation-worker start:scheduler"
