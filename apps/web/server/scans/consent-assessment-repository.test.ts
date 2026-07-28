import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

test("consent assessment repository validates, upserts idempotently, and keeps compatibility values tri-state", async () => {
  const source = await readFile("apps/web/server/scans/consent-assessment-repository.ts", "utf8");
  assert.match(source, /consentControlAssessmentSchema\.parse/);
  assert.match(source, /update public\.scan_snapshots/);
  assert.doesNotMatch(source, /insert into public\.scan_snapshots/);
  assert.match(source, /consent_assessment_source_hash is distinct from \$6/);
  assert.match(source, /state === "observed" \? true : state === "not_observed" \? false : null/);
  assert.match(source, /consent_assessment_computed_at is null/);
});
