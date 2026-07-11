import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("system health reads recent scan activity from the bounded scans table", async () => {
  const source = await readFile("apps/web/server/health/get-system-health.ts", "utf8");

  assert.match(source, /from public\.scans/);
  assert.match(source, /coalesce\(completed_at, started_at, created_at\)/);
  assert.doesNotMatch(source, /from public\.scan_events/);
});
