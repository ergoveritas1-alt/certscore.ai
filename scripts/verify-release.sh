#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." >/dev/null 2>&1 && pwd)"
cd "$ROOT_DIR"

CASK_PATH="Casks/certscore-mcp.rb"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

read_cask_field() {
  local field="$1"
  sed -nE "s/^[[:space:]]*${field}[[:space:]]+\"([^\"]+)\".*/\\1/p" "$CASK_PATH" | head -1
}

VERSION="$(read_cask_field version)"
SHA256="$(read_cask_field sha256)"
URL="$(read_cask_field url)"

if [[ -z "$VERSION" || -z "$SHA256" || -z "$URL" ]]; then
  echo "Unable to read version, sha256, and url from $CASK_PATH" >&2
  exit 1
fi

TARBALL="$TMP_DIR/certscore-mcp-v${VERSION}.tar.gz"
EXTRACT_DIR="$TMP_DIR/extract"

curl -fsSL "$URL" -o "$TARBALL"

ACTUAL_SHA="$(shasum -a 256 "$TARBALL" | awk '{print $1}')"
if [[ "$ACTUAL_SHA" != "$SHA256" ]]; then
  echo "Cask sha256 mismatch: expected $SHA256, got $ACTUAL_SHA" >&2
  exit 1
fi

if tar -tzf "$TARBALL" | grep -E '(^|/)\._' >/dev/null; then
  echo "Release tarball contains AppleDouble entries" >&2
  tar -tzf "$TARBALL" | grep -E '(^|/)\._' >&2
  exit 1
fi

mkdir -p "$EXTRACT_DIR"
tar -xzf "$TARBALL" -C "$EXTRACT_DIR"

BINARY="$EXTRACT_DIR/certscore-mcp-v${VERSION}/bin/certscore-mcp"
if [[ ! -x "$BINARY" ]]; then
  echo "Expected executable not found: $BINARY" >&2
  exit 1
fi

BINARY_VERSION="$("$BINARY" --version)"
if [[ "$BINARY_VERSION" != "$VERSION" ]]; then
  echo "Binary version mismatch: expected $VERSION, got $BINARY_VERSION" >&2
  exit 1
fi

"$BINARY" --help >/dev/null

VERIFY_BINARY="$BINARY" VERIFY_CASK_VERSION="$VERSION" node --input-type=module <<'NODE'
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CompatibilityCallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";

const binary = process.env.VERIFY_BINARY;
const caskVersion = process.env.VERIFY_CASK_VERSION;
assert.ok(binary, "VERIFY_BINARY is required");
assert.ok(caskVersion, "VERIFY_CASK_VERSION is required");

function extractDiscoveryString(source, marker, sectionMarker) {
  const sectionIndex = sectionMarker ? source.indexOf(sectionMarker) : 0;
  assert.notEqual(sectionIndex, -1, `Local discovery manifest should contain ${sectionMarker}`);
  const index = source.indexOf(marker, sectionIndex);
  assert.notEqual(index, -1, `Local discovery manifest should contain ${marker}`);
  const value = source.slice(index).match(/:\s*"([^"]+)"/)?.[1];
  assert.ok(value, `Local discovery manifest should contain a string for ${marker}`);
  return value;
}

function extractDiscoveryTools(source) {
  const index = source.indexOf("currentTools:");
  assert.notEqual(index, -1, "Local discovery manifest should contain currentTools");
  const start = source.indexOf("[", index);
  const end = source.indexOf("]", start);
  assert.ok(start > index && end > start, "Local discovery manifest should contain currentTools array");
  return [...source.slice(start, end).matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

function sorted(values) {
  return [...values].sort();
}

function assertNoDuplicateNonCommentLines(text, label) {
  const seen = new Map();
  text.split(/\r?\n/).forEach((line, index) => {
    const normalized = line.trim();
    if (!normalized || normalized.startsWith("#")) {
      return;
    }
    const previous = seen.get(normalized);
    assert.equal(
      previous,
      undefined,
      `${label} duplicate non-comment line: line ${index + 1} repeats line ${previous ?? "unknown"}: ${normalized}`
    );
    seen.set(normalized, index + 1);
  });
}

function assertNoNpmClaims(text, label) {
  assert.doesNotMatch(text, /\b(?:npm|npx)\b/i, `${label} should not advertise npm/npx install or execution claims`);
}

function serializedLength(value) {
  return JSON.stringify(value)?.length ?? 0;
}

const localDiscoverySource = readFileSync("apps/web/app/.well-known/certscore-ai.json/route.ts", "utf8");
const localManifestVersion = extractDiscoveryString(localDiscoverySource, "currentVersion:", "mcp: {");
const localManifestTools = extractDiscoveryTools(localDiscoverySource);
assert.equal(localManifestVersion, caskVersion, "Local manifest currentVersion must match cask version");

const transport = new StdioClientTransport({
  command: binary,
  stderr: "pipe",
  env: {
    ...process.env,
    CERTSCORE_API_KEY: "cs_dummy_release_verification_not_real",
    CERTSCORE_BASE_URL: "https://certscore.ai"
  }
});
const client = new Client({
  name: "certscore-release-verifier",
  version: "0.0.0"
});

await client.connect(transport);
try {
  const listed = await client.listTools();
  const toolNames = listed.tools.map((tool) => tool.name);
  assert.deepEqual(sorted(toolNames), sorted(localManifestTools), "tools/list names must match local manifest currentTools");
  assert.ok(toolNames.includes("certscore_get_evidence"), "tools/list must include certscore_get_evidence");
  for (const tool of listed.tools) {
    assert.ok(tool.annotations, `${tool.name} must include MCP annotations`);
  }

  const failed = await client.request({
    method: "tools/call",
    params: {
      name: "certscore_get_scan",
      arguments: {
        scanId: "00000000-0000-4000-8000-000000000000"
      }
    }
  }, CompatibilityCallToolResultSchema, { timeout: 15_000 });
  assert.equal(failed.isError, true, "Forced live API failure should return isError: true");
  const responseBody = failed.structuredContent?.error?.responseBody;
  if (responseBody !== undefined) {
    assert.ok(serializedLength(responseBody) <= 2_012, "Forced failure responseBody must stay within the 2,000-character MCP cap");
  }
} finally {
  await client.close();
}

const [liveManifestResponse, liveLlmsResponse, liveLlmsFullResponse] = await Promise.all([
  fetch("https://certscore.ai/.well-known/certscore-ai.json", { cache: "no-store" }),
  fetch("https://certscore.ai/llms.txt", { cache: "no-store" }),
  fetch("https://certscore.ai/llms-full.txt", { cache: "no-store" })
]);
assert.ok(liveManifestResponse.ok, `Live manifest fetch failed: ${liveManifestResponse.status}`);
assert.ok(liveLlmsResponse.ok, `Live llms.txt fetch failed: ${liveLlmsResponse.status}`);
assert.ok(liveLlmsFullResponse.ok, `Live llms-full.txt fetch failed: ${liveLlmsFullResponse.status}`);

const liveManifest = await liveManifestResponse.json();
const liveLlms = await liveLlmsResponse.text();
const liveLlmsFull = await liveLlmsFullResponse.text();

assert.equal(liveManifest?.mcp?.currentVersion, caskVersion, "Live manifest currentVersion must match cask version");
assert.deepEqual(sorted(liveManifest?.mcp?.currentTools ?? []), sorted(localManifestTools), "Live manifest currentTools must match local manifest currentTools");
assertNoDuplicateNonCommentLines(liveLlms, "live llms.txt");
assertNoNpmClaims(liveLlms, "live llms.txt");
assertNoNpmClaims(liveLlmsFull, "live llms-full.txt");

console.log("CertScore release verification passed.");
NODE
