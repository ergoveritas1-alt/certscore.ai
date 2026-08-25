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

test("API Activity loads its bounded snapshot and paginated rows in parallel", async () => {
  const page = await readFile("apps/web/app/app/admin/pulse/page.tsx", "utf8");
  const pageFunction = page.slice(page.indexOf("export default async function AdminPulsePage"));

  assert.match(pageFunction, /const \[operationalSnapshot, requestPage\] = await Promise\.all/);
  assert.match(pageFunction, /app\.admin\.api_activity\.operational_snapshot/);
  assert.match(pageFunction, /app\.admin\.api_activity\.rows/);
  assert.doesNotMatch(pageFunction, /AdminPulseOverviewFallback/);
  assert.match(pageFunction, /<Suspense fallback=\{<AdminPulseFiltersFallback \/>}/);
});

test("API Activity times snapshot, filters, and rows independently", async () => {
  const page = await readFile("apps/web/app/app/admin/pulse/page.tsx", "utf8");

  assert.match(page, /app\.admin\.api_activity\.operational_snapshot/);
  assert.match(page, /app\.admin\.api_activity\.filters/);
  assert.match(page, /app\.admin\.api_activity\.rows/);
});

test("API Activity snapshot is bounded, bucketed, and traffic-aware", async () => {
  const page = await readFile("apps/web/app/app/admin/pulse/page.tsx", "utf8");
  const source = await readFile("apps/web/server/admin/list-pulse-requests.ts", "utf8");
  const contract = await readFile("apps/web/lib/admin/admin-operational-snapshot.ts", "utf8");

  assert.match(page, /<AdminOperationalSnapshot/);
  assert.match(page, /Logical API requests/);
  assert.match(page, /snapshotPeriods = \["1h", "24h", "7d", "30d", "1y"\]/);
  assert.match(page, /operationalSnapshot\.trend\.map/);
  assert.match(page, /operationalSnapshot\.routes\.map/);
  assert.match(source, /ADMIN_OPERATIONAL_SNAPSHOT_CONFIG/);
  assert.match(source, /visible_requests as materialized/);
  assert.match(contract, /date_bin\('5 minutes'/);
  assert.match(contract, /date_trunc\('month'/);
  assert.match(source, /America\/Los_Angeles/);
  assert.match(source, /pulseInternalQaTrafficSql/);
  assert.match(source, /MAC_MINI_SCAN_BOT_API_KEY_NAMES/);
  assert.match(source, /revalidate: 30/);
});

test("API Activity read functions rely on migrations rather than runtime schema DDL", async () => {
  const source = await readFile("apps/web/server/admin/list-pulse-requests.ts", "utf8");
  const listSource = exportedFunctionSource(source, "listAdminPulseRequestsPage", "listAdminPulseRequests");
  const countSource = exportedFunctionSource(source, "countAdminPulseRequests", "getAdminPulseFilterOptions");
  const detailSource = exportedFunctionSource(source, "getAdminPulseRequestDetail", "listAdminPulseRequestsForScan");

  assert.doesNotMatch(source, /ensurePulseTables/);
  assert.doesNotMatch(listSource, /ensurePulseTables/);
  assert.doesNotMatch(countSource, /ensurePulseTables/);
  assert.doesNotMatch(detailSource, /ensurePulseTables/);
});
