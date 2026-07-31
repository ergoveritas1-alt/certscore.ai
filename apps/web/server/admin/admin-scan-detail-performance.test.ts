import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

function exportedFunctionSource(source: string, name: string, nextName?: string) {
  const start = source.indexOf(`export async function ${name}`);
  const end = nextName ? source.indexOf(`export async function ${nextName}`, start + 1) : source.length;

  assert.ok(start >= 0, `${name} should exist`);
  assert.ok(end > start, `${name} should have a bounded source range`);
  return source.slice(start, end);
}

test("admin scan detail renders its summary before deferred diagnostics", async () => {
  const page = await readFile("apps/web/app/app/admin/scans/[scanId]/page.tsx", "utf8");
  const diagnostics = await readFile("apps/web/app/app/admin/scans/[scanId]/scan-diagnostic-sections.tsx", "utf8");

  assert.match(page, /const record = await getAdminScanSummary\(scanId\)/);
  assert.doesNotMatch(page, /Promise\.all/);
  assert.doesNotMatch(page, /listAdminPulseRequestsForScan/);
  assert.match(page, /<AdminScanDeferredSections/);
  assert.equal((diagnostics.match(/<Suspense /g) ?? []).length, 4);
  assert.match(diagnostics, /getAdminScanRuntimeDiagnostics\(scanId\)/);
  assert.match(diagnostics, /getAdminScanReviewDiagnostics\(scanId\)/);
  assert.match(diagnostics, /getAdminScanInventoryDiagnostics\(scanId\)/);
  assert.match(diagnostics, /listAdminPulseRequestsForScan\(scanId\)/);
});

test("admin scan summary uses one bounded database round trip", async () => {
  const repository = await readFile("apps/web/server/admin/repository.ts", "utf8");
  const summarySource = exportedFunctionSource(
    repository,
    "loadAdminScanDetailSummaryData",
    "loadAdminScanRuntimeDiagnosticsData"
  );

  assert.equal((summarySource.match(/queryOne</g) ?? []).length, 1);
  assert.doesNotMatch(summarySource, /Promise\.all/);
  assert.match(summarySource, /left join domains/);
  assert.match(summarySource, /left join organizations/);
  assert.match(summarySource, /left join scan_snapshots/);
  assert.match(summarySource, /count\(\*\)::int from scan_tracker_vendors/);
  assert.match(summarySource, /count\(\*\)::int from scan_accessibility_rule_counts/);
  assert.match(summarySource, /count\(\*\)::int from scan_pages/);
  assert.match(summarySource, /count\(\*\)::int from compliance_change_events/);
});

test("admin scan detail diagnostics are bounded and omit unused policy enrichment", async () => {
  const repository = await readFile("apps/web/server/admin/repository.ts", "utf8");
  const detailLoaderSource = repository.slice(
    repository.indexOf("export async function loadAdminScanDetailSummaryData"),
    repository.indexOf("export async function loadAdminUsersData")
  );

  assert.doesNotMatch(detailLoaderSource, /policy_enrichment/);
  assert.match(detailLoaderSource, /limit 1/);
  assert.match(detailLoaderSource, /limit 25/);
  assert.match(detailLoaderSource, /limit 100/);
  assert.match(detailLoaderSource, /limit 250/);
});

test("admin scan detail reads never run Pulse schema DDL", async () => {
  const pulseRequests = await readFile("apps/web/server/admin/list-pulse-requests.ts", "utf8");
  const scanReadSource = exportedFunctionSource(pulseRequests, "listAdminPulseRequestsForScan");

  assert.doesNotMatch(scanReadSource, /ensurePulseTables/);
  assert.match(scanReadSource, /app\.admin\.scan-detail\.pulse/);
});

test("admin scan detail logs each independently streamed data stage", async () => {
  const source = await readFile("apps/web/server/admin/get-admin-scan-detail.ts", "utf8");

  assert.match(source, /app\.admin\.scan-detail\.summary/);
  assert.match(source, /app\.admin\.scan-detail\.runtime/);
  assert.match(source, /app\.admin\.scan-detail\.review/);
  assert.match(source, /app\.admin\.scan-detail\.inventory/);
});
