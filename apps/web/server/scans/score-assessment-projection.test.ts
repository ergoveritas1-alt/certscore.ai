import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLegacyGdprEprivacyVersionedAssessmentInput
} from "./score-assessment-projection";

const assessment = {
  coverageConfidence: "high" as const,
  coverageRatio: 0.95,
  score: 71,
  scoreKind: "gdpr_eprivacy_evidence" as const,
  scoreSource: "wc01.regulatory-coverage-score",
  scoreVersion: "gdpr-eprivacy-evidence.legacy-v1"
};

test("versioned legacy assessment retains only surfaced finding ids", () => {
  const projected = buildLegacyGdprEprivacyVersionedAssessmentInput({
    assessment,
    checklistRows: [
      { assessmentStatus: "checked", evidenceState: "observed", id: "privacy_notice", status: "Observed" },
      { assessmentStatus: "gap_observed", evidenceState: "not_observed", id: "reject_path", status: "Gap observed" }
    ],
    scanId: "00000000-0000-4000-8000-000000000001",
    scoredAt: "2026-07-21T12:00:00.000Z",
    unifiedFindings: [
      { presentationDecision: { status: "surface" }, unifiedFindingId: "finding-b" },
      { presentationDecision: { status: "audit_only" }, unifiedFindingId: "finding-hidden" },
      { presentationDecision: { status: "surface" }, unifiedFindingId: "finding-a" }
    ]
  });

  assert.deepEqual(projected.inputFindingIds, ["finding-a", "finding-b"]);
  assert.match(projected.inputProjectionFingerprint ?? "", /^sha256:[a-f0-9]{64}$/);
  assert.equal(projected.scoreValue, 71);
  assert.equal(projected.withholdingReason, undefined);
});

test("legacy assessment records deterministic withholding", () => {
  const projected = buildLegacyGdprEprivacyVersionedAssessmentInput({
    assessment: { ...assessment, coverageConfidence: "insufficient", score: null },
    checklistRows: [],
    scanId: "00000000-0000-4000-8000-000000000002",
    scoredAt: "2026-07-21T12:00:00.000Z",
    unifiedFindings: []
  });

  assert.equal(projected.scoreValue, null);
  assert.equal(projected.withholdingReason, "legacy_evidence_score_withheld:insufficient");
});
