#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
region="${AWS_REGION:-us-west-1}"
prefix="${CERTSCORE_V2_DAG_LAMBDA_DEV_PREFIX:-certscore-v2-dag-local}"
repository_name="${CERTSCORE_V2_DAG_LAMBDA_ECR_REPOSITORY:-${prefix}-lambda}"
image_tag="${CERTSCORE_V2_DAG_LAMBDA_IMAGE_TAG:-dev}"
platform="${CERTSCORE_V2_DAG_LAMBDA_IMAGE_PLATFORM:-linux/amd64}"

if [[ "$region" != "us-west-1" ]]; then
  echo "Refusing to build/push local v2 DAG Lambda image outside us-west-1." >&2
  exit 1
fi

account_id="$(aws sts get-caller-identity --query Account --output text)"
repository_uri="${account_id}.dkr.ecr.${region}.amazonaws.com/${repository_name}"
image_uri="${repository_uri}:${image_tag}"

aws ecr describe-repositories \
  --region "$region" \
  --repository-names "$repository_name" >/dev/null 2>&1 || \
  aws ecr create-repository \
    --region "$region" \
    --repository-name "$repository_name" \
    --image-scanning-configuration scanOnPush=true >/dev/null

aws ecr get-login-password --region "$region" | \
  docker login --username AWS --password-stdin "${account_id}.dkr.ecr.${region}.amazonaws.com" >/dev/null

docker build \
  --platform "$platform" \
  -f "${repo_root}/apps/v2-dag-lambda/Dockerfile" \
  -t "$image_uri" \
  "$repo_root"

docker push "$image_uri" >/dev/null

cat <<EOF
Built and pushed local v2 DAG Lambda image:
  AWS_REGION=${region}
  CERTSCORE_V2_DAG_LAMBDA_IMAGE_URI=${image_uri}
EOF
