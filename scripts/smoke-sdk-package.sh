#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." >/dev/null 2>&1 && pwd)"
SDK_DIR="$REPO_ROOT/packages/certscore-sdk"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"; rm -f "$SDK_DIR"/certscore-sdk-*.tgz' EXIT

pnpm --filter @certscore/sdk build >/dev/null

PACK_JSON="$(cd "$SDK_DIR" && npm pack --ignore-scripts --json)"
TARBALL="$(node -e 'const data = JSON.parse(process.argv[1]); console.log(data[0].filename)' "$PACK_JSON")"

cd "$TMP_DIR"
npm init -y >/dev/null
npm pkg set type=module >/dev/null
npm install "$SDK_DIR/$TARBALL" >/dev/null

{
  echo 'declare const process: { env: Record<string, string | undefined> };'
  cat "$REPO_ROOT/packages/certscore-sdk/examples/canonical-resource-workflow.ts"
} > canonical-resource-workflow.ts

node "$REPO_ROOT/node_modules/typescript/lib/tsc.js" \
  --target ES2022 \
  --module NodeNext \
  --moduleResolution NodeNext \
  --strict \
  --skipLibCheck \
  --noEmit \
  canonical-resource-workflow.ts

node --input-type=module <<'NODE'
import { CertScoreClient, CertScoreScanFailedError, CertScoreTimeoutError } from "@certscore/sdk";

if (typeof CertScoreClient !== "function") {
  throw new Error("CertScoreClient export missing");
}
if (typeof CertScoreTimeoutError !== "function" || typeof CertScoreScanFailedError !== "function") {
  throw new Error("Typed SDK error exports missing");
}
NODE

echo "CertScore SDK package smoke passed for $TARBALL."
