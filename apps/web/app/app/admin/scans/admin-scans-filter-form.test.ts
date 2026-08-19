import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("admin scan filter pending state keeps a stable translated DOM subtree", async () => {
  const source = await readFile(
    "apps/web/app/app/admin/scans/admin-scans-filter-form.tsx",
    "utf8",
  );

  assert.match(source, /translate="no"/);
  assert.match(source, /<span className=\{isPending \? "hidden" : undefined\}>Filter<\/span>/);
  assert.match(source, /<span className=\{isPending \? undefined : "hidden"\}>Filtering…<\/span>/);
  assert.doesNotMatch(source, /isPending \? <span[^\n]+: null/);
  assert.doesNotMatch(source, /isPending \? "Filtering…" : "Filter"/);
});

test("primary admin activity pages place the filter action before the filter fields", async () => {
  const [scansPage, apiActivityPage, mcpPage] = await Promise.all([
    readFile("apps/web/app/app/admin/scans/page.tsx", "utf8"),
    readFile("apps/web/app/app/admin/pulse/page.tsx", "utf8"),
    readFile("apps/web/app/app/admin/mcp/page.tsx", "utf8"),
  ]);

  assert.match(scansPage, /<AdminScansFilterForm[^>]+submitFirst>/);
  assert.match(apiActivityPage, /<AdminScansFilterForm[^>]+submitFirst>/);
  assert.match(mcpPage, /<AdminScansFilterForm[^>]+submitFirst>/);
});
