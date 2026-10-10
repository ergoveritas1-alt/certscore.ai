#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
runtime_source="${repo_root}/infra/aws/ergoveritas-canary/certscore-review-canary.js"
canary_root="${repo_root}/infra/aws/ergoveritas-canary"
pages=(test2.html test2-do-not-sell-or-share.html test2-privacy-choices.html test2-cookie-settings.html test2-notice-at-collection.html test2-privacy-policy.html test2-cookie-policy.html)
assets=("${pages[@]}" test2-choice-runtime.js)
expected_account="199536052647"
aws_region="us-west-1"
bucket="ergoveritas-com-static-199536052647"
distribution_id="E3334DYFHSC1PR"
apply=false
page_only=false
for arg in "$@"; do
  case "${arg}" in
    --apply) apply=true ;;
    --page-only) page_only=true ;;
    *) echo "Usage: $0 [--apply] [--page-only]" >&2; exit 1 ;;
  esac
done
if [[ "${page_only}" == true ]]; then
  assets=(test2.html)
fi

[[ -f "${runtime_source}" ]] || { echo "Missing source file: ${runtime_source}" >&2; exit 1; }
for asset in "${assets[@]}"; do
  [[ -f "${canary_root}/${asset}" ]] || { echo "Missing source file: ${canary_root}/${asset}" >&2; exit 1; }
done

if [[ "${apply}" != true ]]; then
  echo "Dry run: would verify the existing shared canary runtime, upload ${assets[*]}, then invalidate only those paths."
  exit 0
fi

actual_account="$(aws sts get-caller-identity --query Account --output text)"
[[ "${actual_account}" == "${expected_account}" ]] || { echo "Unexpected AWS account: ${actual_account}" >&2; exit 1; }

bucket_region="$(aws s3api get-bucket-location --bucket "${bucket}" --query LocationConstraint --output text)"
[[ "${bucket_region}" == "${aws_region}" ]] || { echo "Unexpected bucket region: ${bucket_region}" >&2; exit 1; }

distribution_origin="$(aws cloudfront get-distribution --id "${distribution_id}" --query 'Distribution.DistributionConfig.Origins.Items[0].DomainName' --output text)"
[[ "${distribution_origin}" == "${bucket}.s3.${aws_region}.amazonaws.com" ]] || { echo "Unexpected CloudFront origin: ${distribution_origin}" >&2; exit 1; }

retained_runtime="$(mktemp)"
trap 'rm -f "${retained_runtime}"' EXIT
aws s3api get-object --region "${aws_region}" --bucket "${bucket}" --key certscore-review-canary.js "${retained_runtime}" >/dev/null
runtime_hash="$(shasum -a 256 "${runtime_source}" | awk '{print $1}')"
retained_hash="$(shasum -a 256 "${retained_runtime}" | awk '{print $1}')"
[[ "${runtime_hash}" == "${retained_hash}" ]] || { echo "Existing shared canary runtime has changed; review it before publishing test2.html." >&2; exit 1; }

invalidation_paths=()
for asset in "${assets[@]}"; do
  source_path="${canary_root}/${asset}"
  source_hash="$(shasum -a 256 "${source_path}" | awk '{print $1}')"
  content_type="text/html"
  [[ "${asset}" == *.js ]] && content_type="text/javascript"
  aws s3api put-object --region "${aws_region}" --bucket "${bucket}" --key "${asset}" \
    --body "${source_path}" --content-type "${content_type}" --cache-control "public,max-age=60" \
    --server-side-encryption "AES256" --metadata "source-sha256=${source_hash}" >/dev/null
  stored_hash="$(aws s3api head-object --region "${aws_region}" --bucket "${bucket}" --key "${asset}" --query 'Metadata."source-sha256"' --output text)"
  [[ "${stored_hash}" == "${source_hash}" ]] || { echo "S3 upload verification failed for ${asset}." >&2; exit 1; }
  invalidation_paths+=("/${asset}")
done

invalidation_id="$(aws cloudfront create-invalidation --distribution-id "${distribution_id}" --paths "${invalidation_paths[@]}" --query 'Invalidation.Id' --output text)"
aws cloudfront wait invalidation-completed --distribution-id "${distribution_id}" --id "${invalidation_id}"
for hostname in ergoveritas.com www.ergoveritas.com; do
  for asset in "${assets[@]}"; do
    source_hash="$(shasum -a 256 "${canary_root}/${asset}" | awk '{print $1}')"
    live_hash="$(curl --fail --location --silent --show-error "https://${hostname}/${asset}" | shasum -a 256 | awk '{print $1}')"
    [[ "${live_hash}" == "${source_hash}" ]] || { echo "Live checksum verification failed for ${hostname}/${asset}." >&2; exit 1; }
    echo "Verified https://${hostname}/${asset}"
  done
done
