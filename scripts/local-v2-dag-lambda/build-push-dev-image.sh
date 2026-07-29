#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
region="${AWS_REGION:-eu-central-1}"
prefix="${CERTSCORE_V2_DAG_LAMBDA_DEV_PREFIX:-certscore-v2-dag-local}"
repository_name="${CERTSCORE_V2_DAG_LAMBDA_ECR_REPOSITORY:-${prefix}-lambda}"
image_tag="${CERTSCORE_V2_DAG_LAMBDA_IMAGE_TAG:-dev}"
build_git_sha="${BUILD_GIT_SHA:-$(git -C "$repo_root" rev-parse HEAD 2>/dev/null || true)}"
build_image_tag="${BUILD_IMAGE_TAG:-${image_tag}}"
scanner_runtime_version="${SCANNER_RUNTIME_VERSION:-certscore-v2-dag-parallel-path}"
platform="${CERTSCORE_V2_DAG_LAMBDA_IMAGE_PLATFORM:-linux/amd64}"
runtime_base_tag="${CERTSCORE_V2_DAG_LAMBDA_RUNTIME_BASE_TAG:-runtime-base}"
push_runtime_base="${CERTSCORE_V2_DAG_LAMBDA_PUSH_RUNTIME_BASE:-false}"
use_runtime_base="${CERTSCORE_V2_DAG_LAMBDA_USE_RUNTIME_BASE:-true}"
build_cache_tag="${CERTSCORE_V2_DAG_LAMBDA_BUILD_CACHE_TAG:-buildcache}"
runtime_base_cache_tag="${CERTSCORE_V2_DAG_LAMBDA_RUNTIME_BASE_CACHE_TAG:-runtime-base-cache}"
skip_build_cache_push="${CERTSCORE_V2_DAG_LAMBDA_SKIP_BUILD_CACHE_PUSH:-false}"
auth_only="${CERTSCORE_V2_DAG_LAMBDA_ECR_AUTH_ONLY:-false}"
skip_ecr_login="${CERTSCORE_V2_DAG_LAMBDA_SKIP_ECR_LOGIN:-false}"

if [[ -n "${DOCKER_CONFIG:-}" ]]; then
  mkdir -p "$DOCKER_CONFIG"
  if [[ -x "/Applications/Docker.app/Contents/Resources/cli-plugins/docker-buildx" ]]; then
    mkdir -p "$DOCKER_CONFIG/cli-plugins"
    ln -sf "/Applications/Docker.app/Contents/Resources/cli-plugins/docker-buildx" "$DOCKER_CONFIG/cli-plugins/docker-buildx"
  fi
fi

case "$region" in
  eu-central-1|eu-west-1|us-west-2) ;;
  *)
    echo "Unsupported local v2 DAG Lambda image region: ${region}. Use eu-central-1, eu-west-1, or us-west-2." >&2
    exit 1
    ;;
esac

account_id="$(aws sts get-caller-identity --query Account --output text)"
repository_uri="${account_id}.dkr.ecr.${region}.amazonaws.com/${repository_name}"
image_uri="${repository_uri}:${image_tag}"
runtime_base_image_uri="${CERTSCORE_V2_DAG_LAMBDA_RUNTIME_BASE_IMAGE_URI:-${repository_uri}:${runtime_base_tag}}"
build_cache_image_uri="${CERTSCORE_V2_DAG_LAMBDA_BUILD_CACHE_IMAGE_URI:-${repository_uri}:${build_cache_tag}}"
runtime_base_cache_image_uri="${CERTSCORE_V2_DAG_LAMBDA_RUNTIME_BASE_CACHE_IMAGE_URI:-${repository_uri}:${runtime_base_cache_tag}}"

aws ecr describe-repositories \
  --region "$region" \
  --repository-names "$repository_name" >/dev/null 2>&1 || \
  aws ecr create-repository \
    --region "$region" \
    --repository-name "$repository_name" \
    --image-scanning-configuration scanOnPush=true >/dev/null

case "${skip_ecr_login}" in
  1|true|TRUE|yes|YES) ;;
  *)
    aws ecr get-login-password --region "$region" | \
      docker login --username AWS --password-stdin "${account_id}.dkr.ecr.${region}.amazonaws.com" >/dev/null
    ;;
esac

case "${auth_only}" in
  1|true|TRUE|yes|YES)
    echo "Authenticated Docker to ${account_id}.dkr.ecr.${region}.amazonaws.com"
    exit 0
    ;;
esac

runtime_base_action="not-used"
case "${push_runtime_base}" in
  1|true|TRUE|yes|YES)
    runtime_base_action="built-and-pushed"
    use_runtime_base="true"
    docker buildx build \
      --platform "$platform" \
      --provenance=false \
      --sbom=false \
      --target lambda-runtime-base \
      --cache-from "type=registry,ref=${runtime_base_cache_image_uri}" \
      --cache-to "type=registry,ref=${runtime_base_cache_image_uri},mode=max" \
      -f "${repo_root}/apps/v2-dag-lambda/Dockerfile" \
      -t "$runtime_base_image_uri" \
      --push \
      "$repo_root"
    ;;
esac

runtime_base_build_args=()
case "${use_runtime_base}" in
  1|true|TRUE|yes|YES)
    if [[ "$runtime_base_action" != "built-and-pushed" ]]; then
      if ! aws ecr describe-images \
        --region "$region" \
        --repository-name "$repository_name" \
        --image-ids "imageTag=${runtime_base_tag}" >/dev/null 2>&1; then
        cat >&2 <<EOF
Runtime base image not found: ${runtime_base_image_uri}

Routine scanner deploys reuse this prebuilt Chromium base by default.
Bootstrap it once with:
  CERTSCORE_V2_DAG_LAMBDA_PUSH_RUNTIME_BASE=true $0

Or build Chromium inside the app image for this run with:
  CERTSCORE_V2_DAG_LAMBDA_USE_RUNTIME_BASE=false $0
EOF
        exit 1
      fi
      runtime_base_action="reused-existing"
    fi
    runtime_base_build_args+=(--build-arg "CERTSCORE_LAMBDA_RUNTIME_BASE=${runtime_base_image_uri}")
    ;;
esac

build_cache_push_args=()
case "${skip_build_cache_push}" in
  1|true|TRUE|yes|YES) ;;
  *) build_cache_push_args+=(--cache-to "type=registry,ref=${build_cache_image_uri},mode=max") ;;
esac

if [[ ${#runtime_base_build_args[@]} -gt 0 ]]; then
  docker buildx build \
    --platform "$platform" \
    --provenance=false \
    --sbom=false \
    "${runtime_base_build_args[@]}" \
    --build-arg "BUILD_GIT_SHA=${build_git_sha}" \
    --build-arg "BUILD_IMAGE_TAG=${build_image_tag}" \
    --build-arg "SCANNER_RUNTIME_VERSION=${scanner_runtime_version}" \
    --cache-from "type=registry,ref=${build_cache_image_uri}" \
    "${build_cache_push_args[@]}" \
    -f "${repo_root}/apps/v2-dag-lambda/Dockerfile" \
    -t "$image_uri" \
    --push \
    "$repo_root"
else
  docker buildx build \
    --platform "$platform" \
    --provenance=false \
    --sbom=false \
    --build-arg "BUILD_GIT_SHA=${build_git_sha}" \
    --build-arg "BUILD_IMAGE_TAG=${build_image_tag}" \
    --build-arg "SCANNER_RUNTIME_VERSION=${scanner_runtime_version}" \
    --cache-from "type=registry,ref=${build_cache_image_uri}" \
    "${build_cache_push_args[@]}" \
    -f "${repo_root}/apps/v2-dag-lambda/Dockerfile" \
    -t "$image_uri" \
    --push \
    "$repo_root"
fi

cat <<EOF
Built and pushed local v2 DAG Lambda image:
  AWS_REGION=${region}
  CERTSCORE_V2_DAG_LAMBDA_IMAGE_URI=${image_uri}
  CERTSCORE_V2_DAG_LAMBDA_RUNTIME_BASE_IMAGE_URI=${runtime_base_image_uri}
  CERTSCORE_V2_DAG_LAMBDA_RUNTIME_BASE_ACTION=${runtime_base_action}
  BUILD_GIT_SHA=${build_git_sha}
  BUILD_IMAGE_TAG=${build_image_tag}
  SCANNER_RUNTIME_VERSION=${scanner_runtime_version}
  CERTSCORE_V2_DAG_LAMBDA_BUILD_CACHE_IMAGE_URI=${build_cache_image_uri}
  CERTSCORE_V2_DAG_LAMBDA_RUNTIME_BASE_CACHE_IMAGE_URI=${runtime_base_cache_image_uri}
EOF
