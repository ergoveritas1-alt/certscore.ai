import assert from "node:assert/strict";
import test from "node:test";
import { buildCanonicalShadowScoreComparisonArtifact } from "../../lib/scans/canonical-shadow-score-artifact";
import { deriveCanonicalShadowScore, type CanonicalShadowScoreModel } from "../../lib/scans/canonical-shadow-score";
import { buildCanonicalShadowScoreProjectionComponents } from "../../lib/scans/canonical-shadow-score-projection-fingerprint";
import {
  GDPR_EPRIVACY_SHADOW_LUNA_DECISION,
  type CanonicalShadowScoreLunaDecision
} from "../../lib/scans/canonical-shadow-score-luna-decision";
import {
  buildApprovedGdprEprivacyPostureVersionedAssessmentInput,
  buildLegacyGdprEprivacyVersionedAssessmentInput,
  buildShadowGdprEprivacyVersionedAssessmentInput
} from "./score-assessment-projection";

const assessment = {
  coverageConfidence: "high" as const,
  coverageRatio: 0.95,
  score: 71,
  scoreKind: "gdpr_eprivacy_evidence" as const,
  scoreSource: "wc01.regulatory-coverage-score",
  scoreVersion: "gdpr-eprivacy-evidence.legacy-v1"
};

const shadowModel: CanonicalShadowScoreModel = {
  approvalStatus: "pending_luna",
  coverageRowWeights: { privacy_notice_availability: 1 },
  criticalPostureCaps: [],
  familyMaximumRiskPoints: { contradiction: 30 },
  minimumCoverageRatioForNoFindingPostureScore: 0.5,
  minimumCoverageRatioForPostureScore: 0.5,
  postureBands: [
    { actionLabel: "Monitor", minimumScore: 75, posture: "Clear" },
    { actionLabel: "Review", minimumScore: 50, posture: "Watch" },
    { actionLabel: "Act", minimumScore: 0, posture: "Action Needed" }
  ],
  severityRiskPoints: { high: 30, medium: 15, low: 5 },
  version: "test.pending-luna"
};

function shadowArtifact(coverageRows: Parameters<typeof deriveCanonicalShadowScore>[0]["coverageRows"]) {
  const findings = [{ family: "contradiction" as const, findingId: "finding-shadow", severity: "medium" as const }];
  return buildCanonicalShadowScoreComparisonArtifact({
    candidate: deriveCanonicalShadowScore({
      coverageRows,
      findings,
      model: shadowModel
    }),
    generatedAt: "2026-07-22T00:00:00.000Z",
    inputProjectionFingerprint: "sha256:shadow-fixture",
    inputProjectionComponents: buildCanonicalShadowScoreProjectionComponents({ coverageRows, findings }),
    legacy: {
      coverageConfidence: "high",
      coverageRatio: 1,
      reportInScopeRowCount: 1,
      reportUsableEvidenceRatio: 1,
      reportUsableRowCount: 1,
      score: 72,
      scoreKind: "gdpr_eprivacy_evidence",
      scoreSource: "wc01.regulatory-coverage-score",
      scoreVersion: "gdpr-eprivacy-evidence.legacy-v1"
    },
    scanId: "00000000-0000-4000-8000-000000000004"
  });
}

function approvedDecision(): CanonicalShadowScoreLunaDecision {
  return {
    ...GDPR_EPRIVACY_SHADOW_LUNA_DECISION,
    benchmarkCorpus: {
      canonicalSelectorArtifact: "artifacts/selector.json",
      centralContactHistoryExportArtifact: "artifacts/history.json",
      corpusId: "governed-corpus",
      governedPublicSampleArtifact: "artifacts/public.json",
      ownedCanaryArtifact: "artifacts/canary.json",
      retainedReplayArtifact: "artifacts/retained.json",
      status: "approved_by_luna"
    },
    decisionStatus: "approved_by_luna",
    expectedBandLanes: GDPR_EPRIVACY_SHADOW_LUNA_DECISION.expectedBandLanes.map((lane) => ({
      ...lane,
      status: "approved_by_luna"
    })),
    modelParameters: {
      approvedModelArtifact: "docs/scoring/gdpr-eprivacy-shadow-candidate-v3.json",
      decisionEvidenceArtifact: "artifacts/model-decision.json",
      status: "approved_by_luna"
    },
    monitoringBaselines: {
      status: "approved_by_luna",
      decisionEvidenceArtifact: "artifacts/monitoring-baselines.json",
      thresholds: {
        minimumSampleCount: 1,
        minimumComparableCount: 1,
        minimumCrossRegionGroupCount: 1,
        minimumCrossSourceGroupCount: 1,
        minimumEquivalentInputCrossSourceGroupCount: 1,
        maximumAbsoluteScoreDeltaP95: 10,
        maximumContradictionRate: 0.1,
        maximumWithheldRate: 0.1,
        maximumCrossRegionScoreRange: 5,
        maximumCrossSourceScoreRange: 5,
        maximumEquivalentInputCrossSourceScoreRange: 5
      }
    },
    signOff: {
      approvalEvidenceArtifact: "artifacts/final-signoff.json",
      approvedAt: "2026-07-22T00:00:00.000Z",
      approvedBy: "Luna",
      status: "approved_by_luna"
    }
  };
}

test("versioned legacy assessment retains only surfaced finding ids and bounded checklist semantics", () => {
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

test("versioned legacy assessment records a deterministic withholding reason", () => {
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

test("projection fingerprint is stable across input ordering", () => {
  const first = buildLegacyGdprEprivacyVersionedAssessmentInput({
    assessment,
    checklistRows: [
      { assessmentStatus: "checked", evidenceState: "observed", id: "b", status: "Observed" },
      { assessmentStatus: "checked", evidenceState: "observed", id: "a", status: "Observed" }
    ],
    scanId: "00000000-0000-4000-8000-000000000003",
    scoredAt: "2026-07-21T12:00:00.000Z",
    unifiedFindings: [
      { presentationDecision: { status: "surface" }, unifiedFindingId: "b" },
      { presentationDecision: { status: "surface" }, unifiedFindingId: "a" }
    ]
  });
  const second = buildLegacyGdprEprivacyVersionedAssessmentInput({
    assessment,
    checklistRows: [
      { assessmentStatus: "checked", evidenceState: "observed", id: "a", status: "Observed" },
      { assessmentStatus: "checked", evidenceState: "observed", id: "b", status: "Observed" }
    ],
    scanId: "00000000-0000-4000-8000-000000000003",
    scoredAt: "2026-07-21T12:00:00.000Z",
    unifiedFindings: [
      { presentationDecision: { status: "surface" }, unifiedFindingId: "a" },
      { presentationDecision: { status: "surface" }, unifiedFindingId: "b" }
    ]
  });

  assert.equal(first.inputProjectionFingerprint, second.inputProjectionFingerprint);
});

test("shadow assessment preserves candidate score, model provenance, and canonical lineage", () => {
  const projected = buildShadowGdprEprivacyVersionedAssessmentInput({
    artifact: shadowArtifact([
      { assessmentStatus: "checked", evidenceState: "observed", rowId: "privacy_notice_availability" }
    ]),
    scoredAt: "2026-07-22T00:00:00.000Z"
  });

  assert.equal(projected.scoreKind, "gdpr_eprivacy_risk_shadow");
  assert.equal(projected.scoreVersion, shadowModel.version);
  assert.equal(projected.scoreValue, 85);
  assert.deepEqual(projected.inputFindingIds, ["finding-shadow"]);
  assert.equal(projected.inputProjectionFingerprint, "sha256:shadow-fixture");
  assert.equal(projected.withholdingReason, undefined);
});

test("shadow assessment persists withheld candidates without substituting a legacy score", () => {
  const artifact = shadowArtifact([]);
  const projected = buildShadowGdprEprivacyVersionedAssessmentInput({
    artifact,
    scoredAt: "2026-07-22T00:00:00.000Z"
  });

  assert.equal(projected.scoreValue, null);
  assert.equal(projected.coverageConfidence, "insufficient");
  assert.equal(projected.withholdingReason, artifact.candidate.withheldReasons.join(","));
});

test("approved posture assessment uses Luna-selected report coverage semantics", () => {
  const decision = approvedDecision();
  const coverageRows = [
    { assessmentStatus: "checked" as const, evidenceState: "observed" as const, rowId: "privacy_notice_availability" }
  ];
  const findings = [
    { family: "contradiction" as const, findingId: "finding-shadow", severity: "medium" as const }
  ];
  const candidate = deriveCanonicalShadowScore({
    coverageRows,
    findings,
    model: { ...shadowModel, approvalStatus: "approved_by_luna", version: decision.modelVersion }
  });
  const artifact = buildCanonicalShadowScoreComparisonArtifact({
    acceptedComparisonDifferences: ["legacy_score_coverage_diverges_from_report_usable_evidence"],
    candidate,
    generatedAt: "2026-07-22T00:00:00.000Z",
    inputProjectionFingerprint: "sha256:approved",
    inputProjectionComponents: buildCanonicalShadowScoreProjectionComponents({ coverageRows, findings }),
    legacy: {
      coverageConfidence: "high",
      coverageRatio: 1,
      reportInScopeRowCount: 10,
      reportUsableEvidenceRatio: 0.8,
      reportUsableRowCount: 8,
      score: 72,
      scoreKind: "gdpr_eprivacy_evidence",
      scoreSource: "wc01.regulatory-coverage-score",
      scoreVersion: "gdpr-eprivacy-evidence.legacy-v1"
    },
    scanId: "00000000-0000-4000-8000-000000000005"
  });
  const projected = buildApprovedGdprEprivacyPostureVersionedAssessmentInput({
    artifact,
    decision,
    scoredAt: "2026-07-22T00:00:00.000Z"
  });

  assert.equal(projected.scoreKind, "gdpr_eprivacy_posture");
  assert.equal(projected.scoreValue, 85);
  assert.equal(projected.coverageRatio, 0.8);
  assert.equal(projected.coverageConfidence, "medium");
  assert.equal(projected.scoreVersion, decision.modelVersion);
});

test("pending Luna decision cannot produce a customer posture assessment", () => {
  assert.throws(
    () => buildApprovedGdprEprivacyPostureVersionedAssessmentInput({
      artifact: shadowArtifact([
        { assessmentStatus: "checked", evidenceState: "observed", rowId: "privacy_notice_availability" }
      ]),
      scoredAt: "2026-07-22T00:00:00.000Z"
    }),
    /not fully approved by Luna/
  );
});
