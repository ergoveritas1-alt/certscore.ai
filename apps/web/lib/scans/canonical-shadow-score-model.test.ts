import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { deriveCanonicalShadowScore } from "./canonical-shadow-score";
import {
  GDPR_EPRIVACY_SHADOW_CANDIDATE_V0_MODEL,
  GDPR_EPRIVACY_SHADOW_CANDIDATE_V1_MODEL,
  GDPR_EPRIVACY_SHADOW_CANDIDATE_V2_MODEL
} from "./canonical-shadow-score-model";

test("the editable Luna candidate JSON stays identical to the runtime shadow model", async () => {
  const documentedModel = JSON.parse(
    await readFile("docs/scoring/gdpr-eprivacy-shadow-candidate-v0.json", "utf8")
  );

  assert.deepEqual(documentedModel, GDPR_EPRIVACY_SHADOW_CANDIDATE_V0_MODEL);
  assert.equal(GDPR_EPRIVACY_SHADOW_CANDIDATE_V0_MODEL.approvalStatus, "pending_luna");
});

test("the active Luna candidate-v2 JSON stays identical to the runtime shadow model", async () => {
  const documentedModel = JSON.parse(
    await readFile("docs/scoring/gdpr-eprivacy-shadow-candidate-v2.json", "utf8")
  );

  assert.deepEqual(documentedModel, GDPR_EPRIVACY_SHADOW_CANDIDATE_V2_MODEL);
  assert.equal(GDPR_EPRIVACY_SHADOW_CANDIDATE_V2_MODEL.approvalStatus, "pending_luna");
  assert.equal("policy_extraction" in GDPR_EPRIVACY_SHADOW_CANDIDATE_V2_MODEL.familyMaximumRiskPoints, false);
  assert.equal(GDPR_EPRIVACY_SHADOW_CANDIDATE_V2_MODEL.familyMaximumRiskPoints.sensitive_data, 35);
});

test("candidate-v2 makes high-severity sensitive-data risk score-eligible and enforces its cap", () => {
  const result = deriveCanonicalShadowScore({
    coverageRows: Object.keys(GDPR_EPRIVACY_SHADOW_CANDIDATE_V2_MODEL.coverageRowWeights).map((rowId) => ({
      assessmentStatus: "checked" as const,
      evidenceState: "observed" as const,
      rowId
    })),
    findings: [{
      family: "sensitive_data",
      findingId: "sensitive_data_collection_with_third_party_tracking_present",
      severity: "high"
    }],
    model: GDPR_EPRIVACY_SHADOW_CANDIDATE_V2_MODEL
  });

  assert.equal(result.observedRiskIndex, 30);
  assert.equal(result.postureScore, 49);
  assert.deepEqual(result.appliedCaps.map((cap) => cap.capId), ["high-sensitive-data-cap"]);
});

test("the active Luna candidate JSON stays identical to the runtime shadow model", async () => {
  const documentedModel = JSON.parse(
    await readFile("docs/scoring/gdpr-eprivacy-shadow-candidate-v1.json", "utf8")
  );

  assert.deepEqual(documentedModel, GDPR_EPRIVACY_SHADOW_CANDIDATE_V1_MODEL);
  assert.equal(GDPR_EPRIVACY_SHADOW_CANDIDATE_V1_MODEL.approvalStatus, "pending_luna");
});
