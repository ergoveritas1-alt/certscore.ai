import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { deriveCanonicalShadowScore } from "./canonical-shadow-score";
import {
  GDPR_EPRIVACY_SHADOW_CANDIDATE_V0_MODEL,
  GDPR_EPRIVACY_SHADOW_CANDIDATE_V1_MODEL,
  GDPR_EPRIVACY_SHADOW_CANDIDATE_V2_MODEL,
  GDPR_EPRIVACY_SHADOW_CANDIDATE_V3_MODEL,
  GDPR_EPRIVACY_SHADOW_CANDIDATE_V4_MODEL,
  GDPR_EPRIVACY_SHADOW_CANDIDATE_V5_MODEL,
  GDPR_EPRIVACY_SHADOW_CANDIDATE_V6_MODEL
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

test("candidate-v4 gives ordinary reviews a small penalty and priority partial concerns stronger grouped penalties", () => {
  const rows = Object.keys(GDPR_EPRIVACY_SHADOW_CANDIDATE_V4_MODEL.coverageRowWeights).map((rowId) => ({
    assessmentStatus: (
      rowId === "pre_consent_cookies_storage" ||
      rowId === "pre_consent_third_party_tracking" ||
      rowId === "reject_all_path_availability" ||
      rowId === "international_transfers_disclosure" ||
      rowId === "processing_purposes_disclosure"
        ? "review_signal"
        : "checked"
    ) as "review_signal" | "checked",
    evidenceState: "observed" as const,
    rowId
  }));
  const result = deriveCanonicalShadowScore({
    coverageRows: rows,
    findings: [],
    model: GDPR_EPRIVACY_SHADOW_CANDIDATE_V4_MODEL
  });

  assert.equal(result.observedRiskIndex, 25);
  assert.equal(result.postureScore, 75);
  assert.equal(result.checklistReviewContributions.find((row) => row.group === "pre_consent_runtime")?.riskPoints, 15);
  assert.deepEqual(
    result.checklistReviewContributions.find((row) => row.group === "pre_consent_runtime")?.rowIds,
    ["pre_consent_cookies_storage", "pre_consent_third_party_tracking", "reject_all_path_availability"]
  );
  assert.equal(result.checklistReviewContributions.find((row) => row.group === "international_transfer_disclosure")?.riskPoints, 10);
  assert.equal(GDPR_EPRIVACY_SHADOW_CANDIDATE_V4_MODEL.approvalStatus, "pending_luna");
});

test("candidate-v5 removes posture caps and scores entirely from deterministic deductions", () => {
  const result = deriveCanonicalShadowScore({
    coverageRows: Object.keys(GDPR_EPRIVACY_SHADOW_CANDIDATE_V5_MODEL.coverageRowWeights).map((rowId) => ({
      assessmentStatus: "checked" as const,
      evidenceState: "observed" as const,
      rowId
    })),
    findings: [{
      family: "consent_tracking",
      findingId: "preconsent_tracking",
      severity: "high"
    }],
    model: GDPR_EPRIVACY_SHADOW_CANDIDATE_V5_MODEL
  });

  assert.equal(result.observedRiskIndex, 30);
  assert.equal(result.postureScore, 70);
  assert.deepEqual(result.appliedCaps, []);
  assert.deepEqual(GDPR_EPRIVACY_SHADOW_CANDIDATE_V5_MODEL.criticalPostureCaps, []);
});

test("candidate-v6 scores confirmed checklist gaps and keeps posture caps removed", () => {
  const result = deriveCanonicalShadowScore({
    coverageRows: Object.keys(GDPR_EPRIVACY_SHADOW_CANDIDATE_V6_MODEL.coverageRowWeights).map((rowId) => ({
      assessmentStatus:
        rowId === "privacy_notice_availability"
          ? "gap_observed" as const
          : rowId === "reject_all_path_availability"
            ? "review_signal" as const
            : "checked" as const,
      evidenceState:
        rowId === "privacy_notice_availability" || rowId === "reject_all_path_availability"
          ? "not_observed" as const
          : "observed" as const,
      rowId
    })),
    findings: [],
    model: GDPR_EPRIVACY_SHADOW_CANDIDATE_V6_MODEL
  });

  assert.equal(result.observedRiskIndex, 30);
  assert.equal(result.postureScore, 70);
  assert.deepEqual(result.appliedCaps, []);
  assert.deepEqual(GDPR_EPRIVACY_SHADOW_CANDIDATE_V6_MODEL.criticalPostureCaps, []);
});

test("the active Luna candidate JSON stays identical to the runtime shadow model", async () => {
  const documentedModel = JSON.parse(
    await readFile("docs/scoring/gdpr-eprivacy-shadow-candidate-v1.json", "utf8")
  );

  assert.deepEqual(documentedModel, GDPR_EPRIVACY_SHADOW_CANDIDATE_V1_MODEL);
  assert.equal(GDPR_EPRIVACY_SHADOW_CANDIDATE_V1_MODEL.approvalStatus, "pending_luna");
});
