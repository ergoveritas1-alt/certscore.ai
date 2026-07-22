import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("deliberate pair registration is bounded, source-specific, and target-exact", async () => {
  const repository = await readFile(new URL("./canonical-shadow-score-pair-repository.ts", import.meta.url), "utf8");
  const migration = await readFile(
    new URL("../../../../packages/db/migrations/0151_score_shadow_collection_pairs.sql", import.meta.url),
    "utf8"
  );
  const adminAction = await readFile(new URL("../admin/register-score-shadow-pair.ts", import.meta.url), "utf8");

  assert.match(repository, /comparison_target_key = lambda\.comparison_target_key/);
  assert.match(repository, /browser_extension', 'local_extension'/);
  assert.match(repository, /'default', 'eu_de', 'eu_ie', 'california', 'lambda'/);
  assert.match(repository, /coverage_projection_fingerprint is not null/);
  assert.match(repository, /finding_projection_fingerprint is not null/);
  assert.match(repository, /Pair registration failed closed/);
  assert.match(migration, /unique \(scan_id, model_version\)/);
  assert.match(migration, /source_family in \('lambda', 'browser_extension'\)/);
  assert.doesNotMatch(migration, /domain_name|raw_url|browser_region/);
  assert.match(adminAction, /requirePlatformAdminContext/);
  assert.match(adminAction, /GDPR_EPRIVACY_SHADOW_CANDIDATE_V3_MODEL\.version/);
  assert.match(adminAction, /certscore-score-source-pair\.v1/);
});
