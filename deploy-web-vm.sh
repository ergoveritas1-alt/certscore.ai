#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-certscore-ai}"
REGION="${REGION:-us-central1}"
REPOSITORY="${REPOSITORY:-certscore}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/web:${IMAGE_TAG}"
BUILD_SERVICE_ACCOUNT="${BUILD_SERVICE_ACCOUNT:-}"
DEPLOY_TO_VM="${DEPLOY_TO_VM:-0}"
VM_NAME="${VM_NAME:-certscore-web-prod}"
VM_ZONE="${VM_ZONE:-us-central1-a}"
PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-https://consentcheck.site}"
CONTAINER_NAME="${CONTAINER_NAME:-certscore-web}"
CONTAINER_PORT="${CONTAINER_PORT:-3000}"
REMOTE_ENV_FILE="${REMOTE_ENV_FILE:-/etc/certscore-web.env}"
SMOKE_TIMEOUT_SECONDS="${SMOKE_TIMEOUT_SECONDS:-120}"
cloudbuild_config="$(mktemp /tmp/certscore-web-cloudbuild.XXXXXX)"

cleanup() {
  rm -f "${cloudbuild_config}"
}

trap cleanup EXIT

require_command() {
  local command_name="$1"

  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Required command is missing: ${command_name}" >&2
    exit 1
  fi
}

run_remote_script() {
  local remote_script
  remote_script="$(cat)"

  gcloud compute ssh "${VM_NAME}" \
    --zone "${VM_ZONE}" \
    --project "${PROJECT_ID}" \
    --command 'bash -se' <<EOF
${remote_script}
EOF
}

require_command gcloud

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

if [[ "${DEPLOY_TO_VM}" != "1" ]]; then
  echo
  echo "Suggested VM commands:"
  echo "  sudo docker pull ${IMAGE_URI}"
  echo "  sudo docker rm -f ${CONTAINER_NAME} || true"
  echo "  sudo docker run -d --name ${CONTAINER_NAME} --restart unless-stopped --env-file ${REMOTE_ENV_FILE} -p ${CONTAINER_PORT}:3000 ${IMAGE_URI}"
  exit 0
fi

echo "Deploying ${IMAGE_URI} to ${VM_NAME} (${VM_ZONE})"

run_remote_script <<EOF
set -euo pipefail

if sudo -n true >/dev/null 2>&1; then
  SUDO='sudo -n'
elif command -v sudo >/dev/null 2>&1; then
  echo "Remote deploy requires non-interactive sudo on ${VM_NAME}." >&2
  exit 1
else
  SUDO=''
fi

if [[ ! -f "${REMOTE_ENV_FILE}" ]]; then
  echo "Missing remote env file: ${REMOTE_ENV_FILE}" >&2
  exit 1
fi

\${SUDO} docker pull "${IMAGE_URI}"
\${SUDO} docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true
\${SUDO} docker run -d \
  --name "${CONTAINER_NAME}" \
  --restart unless-stopped \
  --env-file "${REMOTE_ENV_FILE}" \
  -p ${CONTAINER_PORT}:3000 \
  "${IMAGE_URI}"

deadline=\$((SECONDS + ${SMOKE_TIMEOUT_SECONDS}))
until curl -fsS "http://127.0.0.1:${CONTAINER_PORT}/login" >/dev/null; do
  if (( SECONDS >= deadline )); then
    echo "Timed out waiting for remote login route on ${VM_NAME}." >&2
    \${SUDO} docker logs --tail 200 "${CONTAINER_NAME}" >&2 || true
    exit 1
  fi
  sleep 2
done

curl -fsS "http://127.0.0.1:${CONTAINER_PORT}/api/health/database" >/dev/null
EOF

echo "Remote VM rollout succeeded. Running public smoke checks against ${PUBLIC_BASE_URL}"
curl -fsS -I --max-time 20 "${PUBLIC_BASE_URL}/login" >/dev/null
curl -fsS --max-time 20 "${PUBLIC_BASE_URL}/api/health/database" >/dev/null
echo "Deploy and smoke checks passed for ${PUBLIC_BASE_URL}"
