#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-certscore-ai}"
REGION="${REGION:-us-central1}"
REPOSITORY="${REPOSITORY:-certscore}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/web:${IMAGE_TAG}"
BUILD_SERVICE_ACCOUNT="${BUILD_SERVICE_ACCOUNT:-}"
cloudbuild_config="$(mktemp /tmp/certscore-web-cloudbuild.XXXXXX)"

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
      - apps/web/Dockerfile
      - -t
      - ${IMAGE_URI}
      - .
images:
  - ${IMAGE_URI}
EOF

build_args=(
  builds
  submit
  --project "${PROJECT_ID}"
  --config "${cloudbuild_config}"
  .
)

if [[ -n "${BUILD_SERVICE_ACCOUNT}" ]]; then
  build_args+=(--service-account "projects/${PROJECT_ID}/serviceAccounts/${BUILD_SERVICE_ACCOUNT}")
fi

gcloud "${build_args[@]}"

echo "Built web image: ${IMAGE_URI}"
echo
echo "Suggested VM commands:"
echo "  sudo docker pull ${IMAGE_URI}"
echo "  sudo docker rm -f certscore-web || true"
echo "  sudo docker run -d --name certscore-web --restart unless-stopped --env-file /etc/certscore-web.env -p 3000:3000 ${IMAGE_URI}"
