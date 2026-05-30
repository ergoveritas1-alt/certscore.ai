import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";

type RawEvidenceResponse = {
  browserScanId?: unknown;
  canonicalScanId?: unknown;
  events?: unknown;
  observedSignalCount?: unknown;
  observedSignalsIngestedAt?: unknown;
  sourceId?: unknown;
  sourceType?: unknown;
  status?: unknown;
  targetHostname?: unknown;
  targetUrl?: unknown;
};

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Set ${name}.`);
  }
  return value;
}

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

async function readJsonResponse(url: string, token: string) {
  const response = await fetch(url, {
    headers: {
      "x-certscore-bx01-observed-signal-token": token
    },
    signal: AbortSignal.timeout(30_000)
  });
  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}: ${bodyText}`);
  }

  return JSON.parse(bodyText) as RawEvidenceResponse;
}

function assertRawEvidence(value: RawEvidenceResponse, browserScanId: string) {
  assert.equal(value.browserScanId, browserScanId, "raw evidence browserScanId mismatch");
  assert.equal(value.sourceId, "BX01", "raw evidence sourceId mismatch");
  assert.equal(value.sourceType, "browser_extension", "raw evidence sourceType mismatch");
  assert.equal(typeof value.targetHostname, "string", "raw evidence targetHostname missing");
  assert.equal(typeof value.targetUrl, "string", "raw evidence targetUrl missing");
  assert.ok(Array.isArray(value.events), "raw evidence events missing");
  assert.ok(value.events.length > 0, "raw evidence contains no events; run the browser extension scan first");
  assert.equal(value.status, "complete", "browser scan is not complete yet");
  assert.equal(typeof value.canonicalScanId, "string", "browser scan has not materialized a canonical scan");
}

function getObservedSignalCount(value: RawEvidenceResponse) {
  return typeof value.observedSignalCount === "number" ? value.observedSignalCount : 0;
}

async function main() {
  const apiBaseUrl = normalizeBaseUrl(process.env.BX01_WC01_API_BASE_URL?.trim() || process.env.BASE_URL?.trim() || "http://localhost:3000");
  const browserScanId = requiredEnv("BX01_BROWSER_SCAN_ID");
  const token = requiredEnv("BX01_OBSERVED_SIGNAL_INGEST_TOKEN");
  const ws01Dir = path.resolve(process.cwd(), process.env.BX01_WS01_DIR?.trim() || "../WS01");
  const rawEvidenceUrl = `${apiBaseUrl}/api/browser-scans/${encodeURIComponent(browserScanId)}/raw-evidence`;

  const before = await readJsonResponse(rawEvidenceUrl, token);
  assertRawEvidence(before, browserScanId);
  console.log(
    `BX01 raw evidence ready: ${String(before.targetHostname)} ${Array.isArray(before.events) ? before.events.length : 0} events, canonical scan ${String(before.canonicalScanId)}`
  );

  if (process.env.BX01_SMOKE_SKIP_WS01 !== "1") {
    execFileSync(
      "pnpm",
      ["--dir", ws01Dir, "--filter", "@signal-scanner/scanner", "bx01-normalize-once"],
      {
        env: {
          ...process.env,
          BX01_BROWSER_SCAN_ID: browserScanId,
          BX01_OBSERVED_SIGNAL_INGEST_TOKEN: token,
          BX01_WC01_API_BASE_URL: apiBaseUrl
        },
        stdio: "inherit"
      }
    );
  }

  const after = await readJsonResponse(rawEvidenceUrl, token);
  assertRawEvidence(after, browserScanId);
  const observedSignalCount = getObservedSignalCount(after);
  assert.ok(
    observedSignalCount > 0 || typeof after.observedSignalsIngestedAt === "string",
    "WS01-normalized BX01 observed signals were not ingested"
  );

  console.log(`BX01 handoff smoke passed: ${observedSignalCount} WS01-normalized observed signals ingested.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
