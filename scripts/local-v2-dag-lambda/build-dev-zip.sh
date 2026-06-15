#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
out_zip_input="${1:-${repo_root}/artifacts/local-v2-dag-lambda/certscore-v2-dag-local-lambda.zip}"
mkdir -p "$(dirname "$out_zip_input")"
out_zip_dir="$(cd "$(dirname "$out_zip_input")" && pwd)"
out_zip="${out_zip_dir}/$(basename "$out_zip_input")"
work_dir="${repo_root}/tmp/local-v2-dag-lambda-package"
deploy_dir="${work_dir}/deploy"

mkdir -p "$work_dir"
rm -rf "$deploy_dir" "$out_zip"

cd "$repo_root"

pnpm --filter @certscore/contracts build
pnpm --filter @certscore/vendor-resolver build
pnpm --filter @certscore/review-engine build
pnpm --filter @certscore/report-adapter build
pnpm --filter @certscore/scan-core build
pnpm --filter @website-signal-risk-scanner/v2-dag-lambda clean
pnpm --filter @website-signal-risk-scanner/v2-dag-lambda build
pnpm --filter @website-signal-risk-scanner/v2-dag-lambda --prod deploy --legacy "$deploy_dir"

rm -rf "${deploy_dir}/src"
mkdir -p "${deploy_dir}/src"
cp "${repo_root}/apps/v2-dag-lambda/dist/apps/v2-dag-lambda/src/handler.js" "${deploy_dir}/src/handler.js"

for package_name in contracts vendor-resolver review-engine report-adapter scan-core; do
  package_dir="${deploy_dir}/node_modules/@certscore/${package_name}"
  if [[ -d "${repo_root}/packages/certscore-${package_name}/dist" && -d "$package_dir" ]]; then
    rm -rf "${package_dir}/dist"
    cp -R "${repo_root}/packages/certscore-${package_name}/dist" "${package_dir}/dist"
  fi
done

(
  cd "$deploy_dir"
  zip -qr "$out_zip" .
)

echo "Built local v2 DAG Lambda zip: ${out_zip}"
echo "Handler: src/handler.handler"
