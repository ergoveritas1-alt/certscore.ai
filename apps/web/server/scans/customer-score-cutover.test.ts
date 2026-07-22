import assert from "node:assert/strict";
import test from "node:test";
import type { CanonicalShadowScoreLunaDecision } from "../../lib/scans/canonical-shadow-score-luna-decision";
import { GDPR_EPRIVACY_SHADOW_LUNA_DECISION } from "../../lib/scans/canonical-shadow-score-luna-decision";
import type { StoredVersionedScoreAssessment } from "./score-assessment-repository";
import { selectCustomerGdprEprivacyScore } from "../../lib/scans/customer-score-cutover";

function assessment(input: Partial<StoredVersionedScoreAssessment> = {}): StoredVersionedScoreAssessment {
  return {
    coverageConfidence: "high",
    coverageRatio: 0.9,
    scanId: "00000000-0000-4000-8000-000000000001",
    scoreKind: "gdpr_eprivacy_evidence",
    scoreSource: "wc01.regulatory-coverage-score",
    scoreStatus: "scored",
    scoreValue: 82,
    scoreVersion: "gdpr-eprivacy-evidence.legacy-v1",
    scoredAt: "2026-07-22T00:00:00.000Z",
    withholdingReason: null,
    ...input
  };
}

function approvedDecision(): CanonicalShadowScoreLunaDecision {
  return {
    ...structuredClone(GDPR_EPRIVACY_SHADOW_LUNA_DECISION),
    decisionStatus: "approved_by_luna",
    benchmarkCorpus: {
      status: "approved_by_luna",
      corpusId: "luna-corpus-v1",
      centralContactHistoryExportArtifact: "artifacts/scoring/luna/contact-history.json",
      canonicalSelectorArtifact: "artifacts/scoring/luna/selector.json",
      retainedReplayArtifact: "artifacts/scoring/luna/retained-replay.json",
      ownedCanaryArtifact: "artifacts/scoring/luna/owned-canaries.json",
      governedPublicSampleArtifact: "artifacts/scoring/luna/public-sample.json"
    },
    expectedBandLanes: GDPR_EPRIVACY_SHADOW_LUNA_DECISION.expectedBandLanes.map((lane) => ({
      ...lane,
      status: "approved_by_luna"
    })),
    modelParameters: {
      status: "approved_by_luna",
      approvedModelArtifact: "docs/scoring/gdpr-eprivacy-shadow-candidate-v3.json",
      decisionEvidenceArtifact: "artifacts/scoring/luna/model-parameters.json"
    },
    signOff: {
      status: "approved_by_luna",
      approvedBy: "Luna",
      approvedAt: "2026-07-22T12:00:00.000Z",
      approvalEvidenceArtifact: "artifacts/scoring/luna/final-sign-off.json"
    }
  };
}

const legacy = assessment();
const candidate = assessment({
  scoreKind: "gdpr_eprivacy_posture",
  scoreSource: "wc01.canonical-shadow-score",
  scoreValue: 70,
  scoreVersion: GDPR_EPRIVACY_SHADOW_LUNA_DECISION.modelVersion
});

test("unset, legacy, and invalid modes fail closed to the legacy assessment", () => {
  for (const rawMode of [undefined, "legacy", "typo"]) {
    const selected = selectCustomerGdprEprivacyScore({ candidateAssessment: candidate, legacyAssessment: legacy, rawMode });
    assert.equal(selected.assessment, legacy);
    assert.equal(selected.effectiveMode, "legacy");
    assert.equal(selected.label, "GDPR/ePrivacy evidence");
  }
});

test("the candidate flag cannot bypass Luna approval", () => {
  const selected = selectCustomerGdprEprivacyScore({
    candidateAssessment: candidate,
    legacyAssessment: legacy,
    rawMode: "approved_candidate"
  });
  assert.equal(selected.assessment, legacy);
  assert.equal(selected.selectionReason, "luna_approval_missing");
});

test("approved mode requires the exact approved kind and version", () => {
  const decision = approvedDecision();
  for (const candidateAssessment of [
    null,
    assessment({ scoreKind: "gdpr_eprivacy_risk_shadow", scoreVersion: decision.modelVersion }),
    assessment({ scoreKind: "gdpr_eprivacy_posture", scoreVersion: "different-version" })
  ]) {
    const selected = selectCustomerGdprEprivacyScore({
      candidateAssessment,
      decision,
      legacyAssessment: legacy,
      rawMode: "approved_candidate"
    });
    assert.equal(selected.assessment, legacy);
    assert.equal(selected.effectiveMode, "legacy");
  }
});

test("an exact Luna-approved candidate is selected without becoming an overall score", () => {
  const selected = selectCustomerGdprEprivacyScore({
    candidateAssessment: candidate,
    decision: approvedDecision(),
    legacyAssessment: legacy,
    rawMode: "approved_candidate"
  });
  assert.equal(selected.assessment, candidate);
  assert.equal(selected.label, "GDPR/ePrivacy posture");
  assert.equal(selected.overallScoreStatus, "withheld_unmodeled_domains");
  assert.equal(selected.selectionReason, "approved_candidate_selected");
});

test("a Luna-approved withheld candidate remains withheld instead of falling back", () => {
  const withheld = assessment({
    scoreKind: "gdpr_eprivacy_posture",
    scoreSource: "wc01.canonical-shadow-score",
    scoreStatus: "withheld",
    scoreValue: null,
    scoreVersion: GDPR_EPRIVACY_SHADOW_LUNA_DECISION.modelVersion,
    withholdingReason: "coverage_below_model_threshold"
  });
  const selected = selectCustomerGdprEprivacyScore({
    candidateAssessment: withheld,
    decision: approvedDecision(),
    legacyAssessment: legacy,
    rawMode: "approved_candidate"
  });
  assert.equal(selected.assessment, withheld);
  assert.equal(selected.assessment?.scoreValue, null);
  assert.equal(selected.effectiveMode, "approved_candidate");
});
