import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLegacyGdprEprivacyVersionedAssessmentInput,
  CURRENT_GDPR_EPRIVACY_SCORE_VERSION
} from "./score-assessment-projection";

const assessment = {
  coverageConfidence: "high" as const,
  coverageRatio: 0.95,
  score: 71,
  scoreKind: "gdpr_eprivacy_evidence" as const,
  scoreSource: "wc01.regulatory-coverage-score",
  scoreVersion: CURRENT_GDPR_EPRIVACY_SCORE_VERSION
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

test("versioned score fingerprint binds confirmed post-refusal scoring evidence", () => {
  const common = {
    assessment,
    scanId: "00000000-0000-4000-8000-000000000003",
    scoredAt: "2026-07-21T12:00:00.000Z",
    unifiedFindings: []
  };
  const unconfirmed = buildLegacyGdprEprivacyVersionedAssessmentInput({
    ...common,
    checklistRows: [{
      assessmentStatus: "review_signal",
      criticalEvidence: {
        retainedEvidence: {
          preConsentStorageNotClearedCount: 1,
          rejectInteractionConfirmed: false
        }
      },
      evidenceState: "observed",
      id: "post_reject_tracking_reduction",
      status: "Review signal"
    }]
  });
  const confirmed = buildLegacyGdprEprivacyVersionedAssessmentInput({
    ...common,
    checklistRows: [{
      assessmentStatus: "review_signal",
      criticalEvidence: {
        retainedEvidence: {
          preConsentStorageNotClearedCount: 1,
          rejectInteractionConfirmed: true
        }
      },
      evidenceState: "observed",
      id: "post_reject_tracking_reduction",
      status: "Review signal"
    }]
  });

  assert.notEqual(unconfirmed.inputProjectionFingerprint, confirmed.inputProjectionFingerprint);
});

test("versioned score fingerprint binds refusal-signal contradictions", () => {
  const common = {
    assessment,
    scanId: "00000000-0000-4000-8000-000000000004",
    scoredAt: "2026-08-26T12:00:00.000Z",
    unifiedFindings: [],
  };
  const withoutContradiction = buildLegacyGdprEprivacyVersionedAssessmentInput({
    ...common,
    checklistRows: [{
      assessmentStatus: "review_signal",
      criticalEvidence: { retainedEvidence: { rejectInteractionConfirmed: true } },
      evidenceState: "observed",
      id: "post_reject_tracking_reduction",
      status: "Review signal",
    }],
  });
  const withContradiction = buildLegacyGdprEprivacyVersionedAssessmentInput({
    ...common,
    checklistRows: [{
      assessmentStatus: "review_signal",
      criticalEvidence: {
        retainedEvidence: {
          refusalSignalContradictsAction: true,
          rejectInteractionConfirmed: true,
        },
      },
      evidenceState: "observed",
      id: "post_reject_tracking_reduction",
      status: "Review signal",
    }],
  });

  assert.notEqual(
    withoutContradiction.inputProjectionFingerprint,
    withContradiction.inputProjectionFingerprint,
  );
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
  assert.equal(projected.withholdingReason, "gdpr_eprivacy_posture_score_withheld:insufficient");
});
