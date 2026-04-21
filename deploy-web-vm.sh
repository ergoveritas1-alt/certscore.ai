#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-certscore-ai}"
REGION="${REGION:-us-central1}"
REPOSITORY="${REPOSITORY:-certscore}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/web:${IMAGE_TAG}"
BUILD_SERVICE_ACCOUNT="${BUILD_SERVICE_ACCOUNT:-}"
BUILD_STRATEGY="${BUILD_STRATEGY:-cloud-build}"
DEPLOY_TO_VM="${DEPLOY_TO_VM:-0}"
ENSURE_ARTIFACT_REPOSITORY="${ENSURE_ARTIFACT_REPOSITORY:-0}"
VM_NAME="${VM_NAME:-certscore-web-prod}"
VM_ZONE="${VM_ZONE:-us-central1-a}"
PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-https://consentcheck.site}"
CONTAINER_NAME="${CONTAINER_NAME:-certscore-web}"
CONTAINER_PORT="${CONTAINER_PORT:-3000}"
REMOTE_ENV_FILE="${REMOTE_ENV_FILE:-/etc/certscore-web.env}"
REMOTE_DEPLOY_WRAPPER="${REMOTE_DEPLOY_WRAPPER:-/usr/local/bin/deploy-certscore-web}"
SMOKE_TIMEOUT_SECONDS="${SMOKE_TIMEOUT_SECONDS:-120}"
BUILD_GIT_SHA="${BUILD_GIT_SHA:-${IMAGE_TAG}}"
BUILD_GIT_REF="${BUILD_GIT_REF:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)}"
BUILD_RUNTIME_TARGET="${BUILD_RUNTIME_TARGET:-gcp-vm}"
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

if [[ "${ENSURE_ARTIFACT_REPOSITORY}" == "1" ]]; then
  if ! gcloud artifacts repositories describe "${REPOSITORY}" \
    --location "${REGION}" \
    --project "${PROJECT_ID}" >/dev/null 2>&1; then
    gcloud artifacts repositories create "${REPOSITORY}" \
      --repository-format docker \
      --location "${REGION}" \
      --project "${PROJECT_ID}"
  fi
fi

case "${BUILD_STRATEGY}" in
  cloud-build)
    cat > "${cloudbuild_config}" <<EOF
options:
  logging: CLOUD_LOGGING_ONLY
steps:
  - name: gcr.io/cloud-builders/docker
    args:
      - build
      - -f
      - apps/web/Dockerfile
      - --build-arg
      - BUILD_GIT_REF=${BUILD_GIT_REF}
      - --build-arg
      - BUILD_GIT_SHA=${BUILD_GIT_SHA}
      - --build-arg
      - BUILD_IMAGE_TAG=${IMAGE_TAG}
      - --build-arg
      - BUILD_RUNTIME_TARGET=${BUILD_RUNTIME_TARGET}
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
    ;;
  docker)
    require_command docker
    gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet >/dev/null
    docker build \
      -f apps/web/Dockerfile \
      --build-arg "BUILD_GIT_REF=${BUILD_GIT_REF}" \
      --build-arg "BUILD_GIT_SHA=${BUILD_GIT_SHA}" \
      --build-arg "BUILD_IMAGE_TAG=${IMAGE_TAG}" \
      --build-arg "BUILD_RUNTIME_TARGET=${BUILD_RUNTIME_TARGET}" \
      -t "${IMAGE_URI}" .
    docker push "${IMAGE_URI}"
    ;;
  *)
    echo "Unsupported BUILD_STRATEGY: ${BUILD_STRATEGY}" >&2
    exit 1
    ;;
esac

echo "Built web image: ${IMAGE_URI}"

if [[ "${DEPLOY_TO_VM}" != "1" ]]; then
  echo
  echo "Suggested VM commands:"
  echo "  sudo ${REMOTE_DEPLOY_WRAPPER} ${IMAGE_URI}"
  exit 0
fi

echo "Deploying ${IMAGE_URI} to ${VM_NAME} (${VM_ZONE})"

run_remote_script <<EOF
set -euo pipefail

if [[ ! -x "${REMOTE_DEPLOY_WRAPPER}" ]]; then
  echo "Missing remote deploy wrapper: ${REMOTE_DEPLOY_WRAPPER}" >&2
  exit 1
fi

if [[ -f "${REMOTE_ENV_FILE}" ]]; then
  sudo sed -i \
    -e '/^BUILD_GIT_REF=/d' \
    -e '/^BUILD_GIT_SHA=/d' \
    -e '/^BUILD_IMAGE_TAG=/d' \
    -e '/^BUILD_RUNTIME_TARGET=/d' \
    "${REMOTE_ENV_FILE}"
fi

sudo -n "${REMOTE_DEPLOY_WRAPPER}" "${IMAGE_URI}"
EOF

echo "Inspecting runtime metadata on ${VM_NAME}"
run_remote_script <<'EOF'
set -euo pipefail

sudo docker exec certscore-web cat /app/.build-info.json || true
echo
sudo docker exec certscore-web curl -fsS http://127.0.0.1:3000/api/version || true
echo
EOF

echo "Remote VM rollout succeeded. Running public smoke checks against ${PUBLIC_BASE_URL}"
curl -fsS -I --max-time 20 "${PUBLIC_BASE_URL}/login" >/dev/null
curl -fsS --max-time 20 "${PUBLIC_BASE_URL}/api/health/database" >/dev/null
version_payload="$(curl -fsS --max-time 20 "${PUBLIC_BASE_URL}/api/version")"
version_git_sha="$(printf '%s' "${version_payload}" | jq -r '.gitSha // empty')"

if [[ "${version_git_sha}" != "${BUILD_GIT_SHA}" ]]; then
  echo "Live version mismatch after deploy: expected ${BUILD_GIT_SHA}, got ${version_git_sha:-unknown}" >&2
  exit 1
fi

echo "Deploy and smoke checks passed for ${PUBLIC_BASE_URL}"
