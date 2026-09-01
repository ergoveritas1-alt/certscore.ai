#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
expected_account="199536052647"
aws_region="us-west-1"
bucket="ergoveritas-com-static-199536052647"
distribution_id="E3334DYFHSC1PR"
files=("testar1.html" "testar2.html")

if [[ "${1:-}" != "--apply" ]]; then
  echo "Dry run: this publisher is scoped to the two ErgoVeritas post-action canaries."
  for name in "${files[@]}"; do
    source_path="${repo_root}/infra/aws/ergoveritas-canary/${name}"
    [[ -f "${source_path}" ]] || { echo "Missing source file: ${source_path}" >&2; exit 1; }
    echo "Would upload ${source_path} to s3://${bucket}/${name}"
  done
  echo "Would invalidate /testar1.html and /testar2.html on CloudFront ${distribution_id}."
  exit 0
fi

actual_account="$(aws sts get-caller-identity --query Account --output text)"
if [[ "${actual_account}" != "${expected_account}" ]]; then
  echo "Refusing deployment from AWS account ${actual_account}; expected ${expected_account}." >&2
  exit 1
fi

bucket_region="$(aws s3api get-bucket-location \
  --bucket "${bucket}" \
  --query 'LocationConstraint' \
  --output text)"
if [[ "${bucket_region}" != "${aws_region}" ]]; then
  echo "Refusing deployment to bucket region ${bucket_region}; expected ${aws_region}." >&2
  exit 1
fi

distribution_origin="$(aws cloudfront get-distribution \
  --id "${distribution_id}" \
  --query 'Distribution.DistributionConfig.Origins.Items[0].DomainName' \
  --output text)"
expected_origin="${bucket}.s3.${aws_region}.amazonaws.com"
if [[ "${distribution_origin}" != "${expected_origin}" ]]; then
  echo "Refusing deployment: CloudFront origin ${distribution_origin} does not match ${expected_origin}." >&2
  exit 1
fi

for name in "${files[@]}"; do
  source_path="${repo_root}/infra/aws/ergoveritas-canary/${name}"
  [[ -f "${source_path}" ]] || { echo "Missing source file: ${source_path}" >&2; exit 1; }
  source_sha256="$(shasum -a 256 "${source_path}" | awk '{print $1}')"
  aws s3api put-object \
    --region "${aws_region}" \
    --bucket "${bucket}" \
    --key "${name}" \
    --body "${source_path}" \
    --content-type "text/html" \
    --cache-control "public,max-age=60" \
    --server-side-encryption "AES256" \
    --metadata "source-sha256=${source_sha256}" \
    >/dev/null
  retained_sha256="$(aws s3api head-object \
    --region "${aws_region}" \
    --bucket "${bucket}" \
    --key "${name}" \
    --query 'Metadata."source-sha256"' \
    --output text)"
  if [[ "${retained_sha256}" != "${source_sha256}" ]]; then
    echo "Upload verification failed for ${name}." >&2
    exit 1
  fi
  echo "Uploaded and checksum-verified https://ergoveritas.com/${name}"
done

invalidation_id="$(aws cloudfront create-invalidation \
  --distribution-id "${distribution_id}" \
  --paths "/testar1.html" "/testar2.html" \
  --query 'Invalidation.Id' \
  --output text)"
aws cloudfront wait invalidation-completed \
  --distribution-id "${distribution_id}" \
  --id "${invalidation_id}"
echo "CloudFront invalidation ${invalidation_id} completed."

for name in "${files[@]}"; do
  source_path="${repo_root}/infra/aws/ergoveritas-canary/${name}"
  source_sha256="$(shasum -a 256 "${source_path}" | awk '{print $1}')"
  for hostname in "ergoveritas.com" "www.ergoveritas.com"; do
    live_url="https://${hostname}/${name}"
    live_sha256="$(curl --fail --location --silent --show-error "${live_url}" | shasum -a 256 | awk '{print $1}')"
    if [[ "${live_sha256}" != "${source_sha256}" ]]; then
      echo "Live verification failed for ${live_url}." >&2
      exit 1
    fi
    echo "Live checksum verified ${live_url}"
  done
done
