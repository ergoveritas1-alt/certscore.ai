import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { GDPR_EPRIVACY_SHADOW_CANDIDATE_V0_MODEL } from "./canonical-shadow-score-model";

test("the editable Luna candidate JSON stays identical to the runtime shadow model", async () => {
  const documentedModel = JSON.parse(
    await readFile("docs/scoring/gdpr-eprivacy-shadow-candidate-v0.json", "utf8")
  );

  assert.deepEqual(documentedModel, GDPR_EPRIVACY_SHADOW_CANDIDATE_V0_MODEL);
  assert.equal(GDPR_EPRIVACY_SHADOW_CANDIDATE_V0_MODEL.approvalStatus, "pending_luna");
});
