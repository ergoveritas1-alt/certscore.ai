import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { deriveCanonicalShadowScore } from "./canonical-shadow-score";
import {
  GDPR_EPRIVACY_SHADOW_CANDIDATE_V0_MODEL,
  GDPR_EPRIVACY_SHADOW_CANDIDATE_V1_MODEL,
  GDPR_EPRIVACY_SHADOW_CANDIDATE_V2_MODEL,
  GDPR_EPRIVACY_SHADOW_CANDIDATE_V3_MODEL
} from "./canonical-shadow-score-model";

test("the editable Luna candidate JSON stays identical to the runtime shadow model", async () => {
  const documentedModel = JSON.parse(
    await readFile("docs/scoring/gdpr-eprivacy-shadow-candidate-v0.json", "utf8")
  );

  assert.deepEqual(documentedModel, GDPR_EPRIVACY_SHADOW_CANDIDATE_V0_MODEL);
  assert.equal(GDPR_EPRIVACY_SHADOW_CANDIDATE_V0_MODEL.approvalStatus, "pending_luna");
});

test("the historical candidate-v2 JSON stays identical to its runtime model", async () => {
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

test("the selected Luna calibration candidate-v3 JSON matches runtime and resolves the rights-gap contradiction", async () => {
  const documentedModel = JSON.parse(
    await readFile("docs/scoring/gdpr-eprivacy-shadow-candidate-v3.json", "utf8")
  );
  assert.deepEqual(documentedModel, GDPR_EPRIVACY_SHADOW_CANDIDATE_V3_MODEL);
  assert.equal(GDPR_EPRIVACY_SHADOW_CANDIDATE_V3_MODEL.approvalStatus, "pending_luna");
  assert.equal(GDPR_EPRIVACY_SHADOW_CANDIDATE_V3_MODEL.familyMaximumRiskPoints.rights_gap, 30);

  const result = deriveCanonicalShadowScore({
    coverageRows: Object.keys(GDPR_EPRIVACY_SHADOW_CANDIDATE_V3_MODEL.coverageRowWeights).map((rowId) => ({
      assessmentStatus: "checked" as const,
      evidenceState: "observed" as const,
      rowId
    })),
    findings: [{
      family: "rights_gap",
      findingId: "data_subject_rights_disclosure_gap",
      severity: "high"
    }],
    model: GDPR_EPRIVACY_SHADOW_CANDIDATE_V3_MODEL
  });
  assert.deepEqual(
    { action: result.actionLabel, posture: result.posture, risk: result.observedRiskIndex, score: result.postureScore },
    { action: "Review", posture: "Watch", risk: 30, score: 70 }
  );
});

test("the active Luna candidate JSON stays identical to the runtime shadow model", async () => {
  const documentedModel = JSON.parse(
    await readFile("docs/scoring/gdpr-eprivacy-shadow-candidate-v1.json", "utf8")
  );

  assert.deepEqual(documentedModel, GDPR_EPRIVACY_SHADOW_CANDIDATE_V1_MODEL);
  assert.equal(GDPR_EPRIVACY_SHADOW_CANDIDATE_V1_MODEL.approvalStatus, "pending_luna");
});
