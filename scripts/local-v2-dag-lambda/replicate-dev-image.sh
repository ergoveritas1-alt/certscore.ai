#!/usr/bin/env bash
set -euo pipefail

source_image_uri="${1:-}"
target_region="${AWS_REGION:-}"
runtime_base_source_uri="${2:-}"
prefix="${CERTSCORE_V2_DAG_LAMBDA_DEV_PREFIX:-certscore-v2-dag-local}"
repository_name="${CERTSCORE_V2_DAG_LAMBDA_ECR_REPOSITORY:-${prefix}-lambda}"

if [[ -z "$source_image_uri" || -z "$target_region" ]]; then
  echo "Usage: AWS_REGION=<target-region> $0 <source-image-uri> [source-runtime-base-uri]" >&2
  exit 1
fi

case "$target_region" in
  eu-central-1|eu-west-1|us-west-1) ;;
  *)
    echo "Unsupported local v2 DAG Lambda image region: ${target_region}." >&2
    exit 1
    ;;
esac

account_id="$(aws sts get-caller-identity --query Account --output text)"
source_registry="${source_image_uri%%/*}"
if [[ "$source_registry" =~ \.ecr\.([a-z0-9-]+)\.amazonaws\.com$ ]]; then
  source_region="${BASH_REMATCH[1]}"
else
  echo "Source image must use an AWS ECR registry: ${source_image_uri}" >&2
  exit 1
fi
target_repository_uri="${account_id}.dkr.ecr.${target_region}.amazonaws.com/${repository_name}"
image_tag="${source_image_uri##*:}"
target_image_uri="${target_repository_uri}:${image_tag}"

aws ecr describe-repositories \
  --region "$target_region" \
  --repository-names "$repository_name" >/dev/null 2>&1 || \
  aws ecr create-repository \
    --region "$target_region" \
    --repository-name "$repository_name" \
    --image-scanning-configuration scanOnPush=true >/dev/null

aws ecr get-login-password --region "$target_region" | \
  docker login --username AWS --password-stdin "${account_id}.dkr.ecr.${target_region}.amazonaws.com" >/dev/null
if [[ "$source_registry" != "${account_id}.dkr.ecr.${target_region}.amazonaws.com" ]]; then
  aws ecr get-login-password --region "$source_region" | \
    docker login --username AWS --password-stdin "$source_registry" >/dev/null
fi

replicate_image() {
  local source_uri="$1"
  local target_uri="$2"
  local target_repository="${target_uri#*/}"
  target_repository="${target_repository%:*}"
  local target_tag="${target_uri##*:}"

  docker pull --platform linux/amd64 "$source_uri" >/dev/null
  docker tag "$source_uri" "$target_uri"
  docker push "$target_uri" >/dev/null

  local target_digest
  target_digest="$(aws ecr describe-images \
    --region "$target_region" \
    --repository-name "$target_repository" \
    --image-ids "imageTag=${target_tag}" \
    --query 'imageDetails[0].imageDigest' \
    --output text)"
  if ! [[ "$target_digest" =~ ^sha256:[a-f0-9]{64}$ ]]; then
    echo "Could not resolve a bounded replicated image digest for ${target_uri}." >&2
    exit 1
  fi
  printf '%s\n' "$target_digest"
}

image_digest="$(replicate_image "$source_image_uri" "$target_image_uri" | tail -n 1)"

if [[ -n "$runtime_base_source_uri" ]]; then
  runtime_base_target_uri="${target_repository_uri}:runtime-base"
  runtime_base_digest="$(replicate_image "$runtime_base_source_uri" "$runtime_base_target_uri" | tail -n 1)"
  printf 'Replicated runtime base to %s (%s)\n' "$runtime_base_target_uri" "$runtime_base_digest"
fi

printf 'Replicated scanner image to %s (%s)\n' "$target_image_uri" "$image_digest"
