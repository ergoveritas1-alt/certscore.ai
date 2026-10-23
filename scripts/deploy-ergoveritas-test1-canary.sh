#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
canary_root="${repo_root}/infra/aws/ergoveritas-canary"
assets=(certscore-showcase-canary.js test1-privacy-policy.html test1.html)
expected_account="199536052647"
aws_region="us-west-1"
bucket="ergoveritas-com-static-199536052647"
distribution_id="E3334DYFHSC1PR"
apply=false
for arg in "$@"; do
  case "${arg}" in
    --apply) apply=true ;;
    *) echo "Usage: bash $0 [--apply]" >&2; exit 1 ;;
  esac
done

if [[ "${apply}" != true ]]; then
  echo "Dry run: verify committed source and the existing AWS canary origin/runtime; publish only ${assets[*]}; invalidate only those paths."
  exit 0
fi

[[ -z "$(git -C "${repo_root}" status --porcelain)" ]] || { echo "Refusing publication from a dirty worktree." >&2; exit 1; }
for asset in "${assets[@]}" certscore-review-canary.js; do
  git -C "${repo_root}" ls-files --error-unmatch "infra/aws/ergoveritas-canary/${asset}" >/dev/null
done
revision="$(git -C "${repo_root}" rev-parse HEAD)"
actual_account="$(aws sts get-caller-identity --query Account --output text)"
[[ "${actual_account}" == "${expected_account}" ]] || { echo "Unexpected AWS account: ${actual_account}" >&2; exit 1; }
bucket_region="$(aws s3api get-bucket-location --bucket "${bucket}" --query LocationConstraint --output text)"
[[ "${bucket_region}" == "${aws_region}" ]] || { echo "Unexpected bucket region: ${bucket_region}" >&2; exit 1; }
versioning="$(aws s3api get-bucket-versioning --bucket "${bucket}" --query Status --output text)"
[[ "${versioning}" == "Enabled" ]] || { echo "Refusing publication without existing S3 rollback versions." >&2; exit 1; }
origin="$(aws cloudfront get-distribution --id "${distribution_id}" --query 'Distribution.DistributionConfig.Origins.Items[0].DomainName' --output text)"
[[ "${origin}" == "${bucket}.s3.${aws_region}.amazonaws.com" ]] || { echo "Unexpected CloudFront origin: ${origin}" >&2; exit 1; }

retained_runtime="$(mktemp)"
trap 'rm -f "${retained_runtime}"' EXIT
aws s3api get-object --region "${aws_region}" --bucket "${bucket}" --key certscore-review-canary.js "${retained_runtime}" >/dev/null
runtime_hash="$(shasum -a 256 "${canary_root}/certscore-review-canary.js" | awk '{print $1}')"
[[ "$(shasum -a 256 "${retained_runtime}" | awk '{print $1}')" == "${runtime_hash}" ]] || { echo "Shared runtime differs; review before publication." >&2; exit 1; }
previous_version="$(aws s3api head-object --region "${aws_region}" --bucket "${bucket}" --key test1.html --query VersionId --output text)"
echo "Publishing ${revision}; previous test1.html S3 version: ${previous_version}"

paths=()
for asset in "${assets[@]}"; do
  source_path="${canary_root}/${asset}"
  source_hash="$(shasum -a 256 "${source_path}" | awk '{print $1}')"
  content_type="text/html"
  [[ "${asset}" == *.js ]] && content_type="text/javascript"
  aws s3api put-object --region "${aws_region}" --bucket "${bucket}" --key "${asset}" \
    --body "${source_path}" --content-type "${content_type}" --cache-control "public,max-age=60" \
    --server-side-encryption AES256 --metadata "source-sha256=${source_hash},source-revision=${revision}" >/dev/null
  stored_hash="$(aws s3api head-object --region "${aws_region}" --bucket "${bucket}" --key "${asset}" --query 'Metadata."source-sha256"' --output text)"
  [[ "${stored_hash}" == "${source_hash}" ]] || { echo "S3 verification failed for ${asset}" >&2; exit 1; }
  paths+=("/${asset}")
done
invalidation_id="$(aws cloudfront create-invalidation --distribution-id "${distribution_id}" --paths "${paths[@]}" --query 'Invalidation.Id' --output text)"
aws cloudfront wait invalidation-completed --distribution-id "${distribution_id}" --id "${invalidation_id}"
for hostname in ergoveritas.com www.ergoveritas.com; do
  for asset in "${assets[@]}"; do
    source_hash="$(shasum -a 256 "${canary_root}/${asset}" | awk '{print $1}')"
    live_hash="$(curl --fail --location --silent --show-error "https://${hostname}/${asset}" | shasum -a 256 | awk '{print $1}')"
    [[ "${live_hash}" == "${source_hash}" ]] || { echo "Live verification failed for ${hostname}/${asset}" >&2; exit 1; }
    echo "Verified https://${hostname}/${asset}"
  done
done
