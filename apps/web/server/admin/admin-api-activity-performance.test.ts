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

test("API Activity blocks only on its bounded paginated row query", async () => {
  const page = await readFile("apps/web/app/app/admin/pulse/page.tsx", "utf8");
  const pageFunction = page.slice(page.indexOf("export default async function AdminPulsePage"));

  assert.match(pageFunction, /const requestPage = await withServerTiming\("app\.admin\.api_activity\.rows"/);
  assert.doesNotMatch(pageFunction, /Promise\.all/);
  assert.match(pageFunction, /<Suspense fallback=\{<AdminPulseOverviewFallback \/>}/);
  assert.match(pageFunction, /<Suspense fallback=\{<AdminPulseFiltersFallback \/>}/);
});

test("API Activity times independently streamed totals and filters", async () => {
  const page = await readFile("apps/web/app/app/admin/pulse/page.tsx", "utf8");

  assert.match(page, /app\.admin\.api_activity\.counts/);
  assert.match(page, /app\.admin\.api_activity\.filters/);
  assert.match(page, /app\.admin\.api_activity\.rows/);
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
