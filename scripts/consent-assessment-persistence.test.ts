import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

test("consent assessment persistence migration is additive and idempotent", async () => {
  const migration = await readFile("packages/db/migrations/0159_scan_snapshot_consent_control_assessment.sql", "utf8");
  assert.match(migration, /alter table if exists public\.scan_snapshots/);
  assert.match(migration, /add column if not exists consent_control_assessment jsonb/);
  assert.match(migration, /add column if not exists consent_assessment_source_hash text/);
  assert.match(migration, /create index if not exists/);
  assert.doesNotMatch(migration, /insert into|update public\.scan_snapshots|delete from/i);
});

test("the backfill planner is explicitly read-only and preserves unknown compatibility values", async () => {
  const source = await readFile("scripts/plan-consent-assessment-backfill.ts", "utf8");
  assert.match(source, /readOnly: true/);
  assert.match(source, /writeRequested: false/);
  assert.match(source, /state === "observed" \? true : state === "not_observed" \? false : null/);
  assert.match(source, /idempotencyKey/);
});
