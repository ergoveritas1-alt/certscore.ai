import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("full runtime inventory becomes vertically scrollable only above eight rows", async () => {
  const source = await readFile(
    "apps/web/components/scans/report-lab/shadow-scan-report.tsx",
    "utf8"
  );

  assert.match(source, /report\.inventory\.length > 8/);
  assert.match(source, /max-h-\[48rem\] overflow-auto/);
  assert.match(source, /data-inventory-scroll=/);
  assert.match(source, /<thead className="sticky top-0/);
});

test("preview and final reports share the vertically compressed timeline", async () => {
  const source = await readFile(
    "apps/web/components/scans/runtime-observation-sections.tsx",
    "utf8"
  );

  assert.match(source, /data-density="compact"/);
  assert.match(source, /relative pt-6/);
  assert.match(source, /top-\[2\.55rem\]/);
  assert.doesNotMatch(source, /top-\[4\.2rem\]/);
});
