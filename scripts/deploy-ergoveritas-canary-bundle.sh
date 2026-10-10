#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_root="${repo_root}/infra/aws/ergoveritas-canary/.well-known/certscore-canary"
expected_account="199536052647"
aws_region="us-west-1"
bucket="ergoveritas-com-static-199536052647"
distribution_id="E3334DYFHSC1PR"
apply=false
sentinels_only=false
for arg in "$@"; do
  case "${arg}" in
    --apply) apply=true ;;
    --sentinels-only) sentinels_only=true ;;
    *) echo "Usage: $0 [--apply] [--sentinels-only]" >&2; exit 1 ;;
  esac
done
selected_sources() {
  if [[ "${sentinels_only}" == true ]]; then
    printf '%s\n' "${source_root}/manifest.json" "${source_root}"/sentinels/*.html
  else
    find "${source_root}" -type f -print
  fi
}

if [[ "${apply}" != true ]]; then
  echo "Dry run: would publish the selected ErgoVeritas canary files to /.well-known/certscore-canary/."
  selected_sources | sort
  exit 0
fi

actual_account="$(aws sts get-caller-identity --query Account --output text)"
[[ "${actual_account}" == "${expected_account}" ]] || { echo "Refusing account ${actual_account}; expected ${expected_account}." >&2; exit 1; }

bucket_region="$(aws s3api get-bucket-location --bucket "${bucket}" --query 'LocationConstraint' --output text)"
[[ "${bucket_region}" == "${aws_region}" ]] || { echo "Refusing bucket region ${bucket_region}; expected ${aws_region}." >&2; exit 1; }

distribution_origin="$(aws cloudfront get-distribution --id "${distribution_id}" --query 'Distribution.DistributionConfig.Origins.Items[0].DomainName' --output text)"
expected_origin="${bucket}.s3.${aws_region}.amazonaws.com"
[[ "${distribution_origin}" == "${expected_origin}" ]] || { echo "Refusing origin ${distribution_origin}; expected ${expected_origin}." >&2; exit 1; }

invalidation_paths=()
while IFS= read -r source_path; do
  relative="${source_path#${source_root}/}"
  key=".well-known/certscore-canary/${relative}"
  case "${source_path}" in
    *.html|*.htm) content_type="text/html" ;;
    *.js) content_type="application/javascript" ;;
    *.css) content_type="text/css" ;;
    *.json) content_type="application/json" ;;
    *.svg) content_type="image/svg+xml" ;;
    *) content_type="application/octet-stream" ;;
  esac
  source_sha256="$(shasum -a 256 "${source_path}" | awk '{print $1}')"
  aws s3api put-object --region "${aws_region}" --bucket "${bucket}" --key "${key}" \
    --body "${source_path}" --content-type "${content_type}" --cache-control "public,max-age=60" \
    --server-side-encryption AES256 --metadata "source-sha256=${source_sha256}" >/dev/null
  retained_sha256="$(aws s3api head-object --region "${aws_region}" --bucket "${bucket}" --key "${key}" --query 'Metadata."source-sha256"' --output text)"
  [[ "${retained_sha256}" == "${source_sha256}" ]] || { echo "Checksum verification failed for ${key}." >&2; exit 1; }
  invalidation_paths+=("/${key}")
done < <(selected_sources | sort)

if [[ "${sentinels_only}" != true ]]; then
  invalidation_paths=('/.well-known/certscore-canary/*')
fi
invalidation_id="$(aws cloudfront create-invalidation --distribution-id "${distribution_id}" --paths "${invalidation_paths[@]}" --query 'Invalidation.Id' --output text)"
aws cloudfront wait invalidation-completed --distribution-id "${distribution_id}" --id "${invalidation_id}"
echo "CloudFront invalidation ${invalidation_id} completed."

for hostname in ergoveritas.com www.ergoveritas.com; do
  if [[ "${sentinels_only}" == true ]]; then
    while IFS= read -r source_path; do
      relative="${source_path#${source_root}/}"
      source_hash="$(shasum -a 256 "${source_path}" | awk '{print $1}')"
      live_hash="$(curl --fail --location --silent --show-error "https://${hostname}/.well-known/certscore-canary/${relative}" | shasum -a 256 | awk '{print $1}')"
      [[ "${live_hash}" == "${source_hash}" ]] || { echo "Live checksum verification failed for ${hostname}/${relative}." >&2; exit 1; }
      echo "Verified https://${hostname}/.well-known/certscore-canary/${relative}"
    done < <(selected_sources | sort)
  else
    curl --fail --location --silent --show-error "https://${hostname}/.well-known/certscore-canary/manifest.json" | shasum -a 256
  fi
done
echo "Live manifest verification completed."
