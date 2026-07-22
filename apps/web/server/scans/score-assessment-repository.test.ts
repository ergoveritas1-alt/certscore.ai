import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("versioned score storage is immutable, bounded, and separates score from coverage", async () => {
  const migration = await readFile("packages/db/migrations/0146_versioned_scan_score_assessments.sql", "utf8");
  const repository = await readFile("apps/web/server/scans/score-assessment-repository.ts", "utf8");

  assert.match(migration, /score_kind text not null/);
  assert.match(migration, /score_version text not null/);
  assert.match(migration, /score_source text not null/);
  assert.match(migration, /score_value integer/);
  assert.match(migration, /coverage_ratio numeric/);
  assert.match(migration, /coverage_confidence text not null/);
  assert.match(migration, /scored_at timestamptz not null/);
  assert.match(migration, /unique \(\s*scan_id,\s*score_kind,\s*score_version\s*\)/s);
  assert.match(repository, /on conflict \(scan_id, score_kind, score_version\) do nothing/);
  assert.doesNotMatch(repository, /do update/i);
  assert.match(repository, /MAX_INPUT_FINDING_IDS = 256/);
  assert.match(repository, /select distinct on \(scan_id\)/i);
  assert.match(repository, /order by scan_id, scored_at desc, created_at desc/i);
  assert.match(repository, /MAX_SCAN_IDS = 2_000/);
});

test("completed Lambda and browser scans persist the immutable legacy assessment lifecycle", async () => {
  const lifecycle = await readFile("apps/web/server/scans/score-assessment-lifecycle.ts", "utf8");
  const lambdaPoller = await readFile("apps/web/server/scans/local-v2-dag-lambda-result-poller.ts", "utf8");
  const browserRepository = await readFile("apps/web/server/browser-scans/repository.ts", "utf8");

  assert.match(lifecycle, /buildCanonicalGdprEprivacyShadowProjection/);
  assert.match(lifecycle, /buildLegacyGdprEprivacyVersionedAssessmentInput/);
  assert.match(lifecycle, /persistVersionedScoreAssessment/);
  assert.match(lambdaPoller, /persistCompletedLegacyGdprEprivacyAssessment/);
  assert.match(browserRepository, /persistCompletedLegacyGdprEprivacyAssessment/);
  assert.match(lambdaPoller, /catch \(error\)/);
  assert.match(browserRepository, /catch \(error\)/);
});
