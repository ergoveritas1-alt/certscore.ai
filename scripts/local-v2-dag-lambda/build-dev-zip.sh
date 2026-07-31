#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
out_zip_input="${1:-${repo_root}/artifacts/local-v2-dag-lambda/certscore-v2-dag-local-lambda.zip}"
mkdir -p "$(dirname "$out_zip_input")"
out_zip_dir="$(cd "$(dirname "$out_zip_input")" && pwd)"
out_zip="${out_zip_dir}/$(basename "$out_zip_input")"
work_dir="${repo_root}/tmp/local-v2-dag-lambda-package"
deploy_dir="${work_dir}/deploy"
deps_dir="${work_dir}/deps"

mkdir -p "$work_dir"
rm -rf "$deploy_dir" "$deps_dir" "$out_zip"

cd "$repo_root"

pnpm --filter @website-signal-risk-scanner/v2-dag-lambda clean
pnpm --filter @website-signal-risk-scanner/v2-dag-lambda bundle
pnpm --filter @website-signal-risk-scanner/v2-dag-lambda --prod deploy --legacy "$deps_dir"

mkdir -p "${deploy_dir}/src"
mkdir -p "${deploy_dir}/node_modules"
mkdir -p "${deploy_dir}/node_modules/@napi-rs"
cp "${repo_root}/apps/v2-dag-lambda/dist-bundle/src/handler.js" "${deploy_dir}/src/handler.js"
cp -R "${deps_dir}/node_modules/pdf-parse" "${deploy_dir}/node_modules/pdf-parse"
cp -R "${deps_dir}/node_modules/pdfjs-dist" "${deploy_dir}/node_modules/pdfjs-dist"
cp -R "${deps_dir}/node_modules/@napi-rs/canvas" "${deploy_dir}/node_modules/@napi-rs/canvas"
cp -R "${deps_dir}/node_modules/playwright" "${deploy_dir}/node_modules/playwright"
cp -R "${deps_dir}/node_modules/playwright-core" "${deploy_dir}/node_modules/playwright-core"

(
  cd "$deploy_dir"
  zip -qr "$out_zip" .
)

echo "Built local v2 DAG Lambda zip: ${out_zip}"
echo "Handler: src/handler.handler"
