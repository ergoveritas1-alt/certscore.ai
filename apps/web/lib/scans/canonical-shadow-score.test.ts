import assert from "node:assert/strict";
import test from "node:test";
import {
  auditCanonicalShadowScoreModel,
  CANONICAL_SHADOW_MAX_FINDINGS,
  deriveCanonicalShadowScore,
  type CanonicalShadowCoverageRow,
  type CanonicalShadowScoreFinding,
  type CanonicalShadowScoreModel
} from "./canonical-shadow-score";

const MODEL: CanonicalShadowScoreModel = {
  approvalStatus: "pending_luna",
  coverageRowWeights: {
    consent_surface_observed: 1,
    pre_consent_third_party_tracking: 1,
    privacy_notice_availability: 1,
    reject_all_path_availability: 1,
    retention_disclosure_observed: 1
  },
  criticalPostureCaps: [{
    capId: "critical-tracking-cap",
    family: "consent_tracking",
    maxPostureScore: 54,
    minimumSeverity: "high"
  }],
  familyMaximumRiskPoints: {
    consent_tracking: 40,
    contradiction: 30,
    policy_extraction: 15
  },
  minimumCoverageRatioForNoFindingPostureScore: 0.9,
  minimumCoverageRatioForPostureScore: 0.7,
  postureBands: [
    { actionLabel: "Monitor", minimumScore: 75, posture: "Clear" },
    { actionLabel: "Review", minimumScore: 50, posture: "Watch" },
    { actionLabel: "Act", minimumScore: 0, posture: "Action Needed" }
  ],
  severityRiskPoints: {
    high: 30,
    medium: 15,
    low: 5
  },
  version: "test-only.pending-luna"
};

const COVERAGE_ROWS: CanonicalShadowCoverageRow[] = [
  { assessmentStatus: "checked", evidenceState: "observed", rowId: "consent_surface_observed" },
  { assessmentStatus: "checked", evidenceState: "not_observed", rowId: "pre_consent_third_party_tracking" },
  { assessmentStatus: "review_signal", evidenceState: "observed", rowId: "retention_disclosure_observed" }
];

function finding(overrides: Partial<CanonicalShadowScoreFinding> = {}): CanonicalShadowScoreFinding {
  return {
    family: "consent_tracking",
    findingId: "pre_consent_tracking_detected",
    severity: "high",
    ...overrides
  };
}

test("shadow scoring deduplicates findings at the canonical family boundary", () => {
  const oneFinding = deriveCanonicalShadowScore({ coverageRows: COVERAGE_ROWS, findings: [finding()], model: MODEL });
  const siblingFindings = deriveCanonicalShadowScore({
    coverageRows: COVERAGE_ROWS,
    findings: [finding(), finding({ findingId: "third_party_tracking_pre_consent", severity: "medium" })],
    model: MODEL
  });

  assert.equal(oneFinding.observedRiskIndex, siblingFindings.observedRiskIndex);
  assert.equal(siblingFindings.familyContributions.length, 1);
  assert.deepEqual(siblingFindings.familyContributions[0]?.findingIds, [
    "pre_consent_tracking_detected",
    "third_party_tracking_pre_consent"
  ]);
});

test("adding a score-eligible finding never increases posture score", () => {
  const baseline = deriveCanonicalShadowScore({ coverageRows: COVERAGE_ROWS, findings: [], model: MODEL });
  const medium = deriveCanonicalShadowScore({
    coverageRows: COVERAGE_ROWS,
    findings: [finding({ family: "policy_extraction", findingId: "policy_clarity_risk", severity: "medium" })],
    model: MODEL
  });
  const high = deriveCanonicalShadowScore({
    coverageRows: COVERAGE_ROWS,
    findings: [
      finding({ family: "policy_extraction", findingId: "policy_clarity_risk", severity: "medium" }),
      finding()
    ],
    model: MODEL
  });

  assert.ok((medium.postureScore ?? -1) <= (baseline.postureScore ?? -1));
  assert.ok((high.postureScore ?? -1) <= (medium.postureScore ?? -1));
});

test("coverage limits withhold posture score without erasing observed risk", () => {
  const result = deriveCanonicalShadowScore({
    coverageRows: [
      COVERAGE_ROWS[0]!,
      { assessmentStatus: "coverage_limitation", evidenceState: "not_testable", rowId: "reject_all_path_availability" }
    ],
    findings: [finding()],
    model: MODEL
  });

  assert.equal(result.observedRiskIndex, 30);
  assert.equal(result.postureScore, null);
  assert.equal(result.coverageConfidence, "low");
  assert.deepEqual(result.coverageBreakdown, {
    applicableWeight: 2,
    coveredRowIds: ["consent_surface_observed"],
    coveredWeight: 1,
    limitedRows: [{
      assessmentStatus: "coverage_limitation",
      evidenceState: "not_testable",
      rowId: "reject_all_path_availability",
      weight: 1
    }],
    notApplicableRowIds: []
  });
  assert.deepEqual(result.withheldReasons, ["coverage_below_model_threshold"]);
});

test("coverage breakdown excludes not-applicable rows from the denominator", () => {
  const result = deriveCanonicalShadowScore({
    coverageRows: [
      { assessmentStatus: "checked", evidenceState: "observed", rowId: "privacy_notice_availability" },
      { assessmentStatus: "not_applicable", evidenceState: "not_applicable", rowId: "reject_all_path_availability" }
    ],
    findings: [],
    model: MODEL
  });

  assert.equal(result.coverageRatio, 1);
  assert.deepEqual(result.coverageBreakdown, {
    applicableWeight: 1,
    coveredRowIds: ["privacy_notice_availability"],
    coveredWeight: 1,
    limitedRows: [],
    notApplicableRowIds: ["reject_all_path_availability"]
  });
});

test("medium coverage cannot produce a posture score when no eligible finding anchors the result", () => {
  const result = deriveCanonicalShadowScore({
    coverageRows: [
      { assessmentStatus: "checked", evidenceState: "observed", rowId: "privacy_notice_availability" },
      { assessmentStatus: "checked", evidenceState: "not_observed", rowId: "consent_surface_observed" },
      { assessmentStatus: "checked", evidenceState: "observed", rowId: "retention_disclosure_observed" },
      { assessmentStatus: "coverage_limitation", evidenceState: "not_testable", rowId: "reject_all_path_availability" }
    ],
    findings: [],
    model: MODEL
  });

  assert.equal(result.coverageRatio, 0.75);
  assert.equal(result.observedRiskIndex, 0);
  assert.equal(result.postureScore, null);
  assert.deepEqual(result.withheldReasons, ["coverage_below_no_finding_threshold"]);
});

test("medium coverage can retain a risk-anchored posture score", () => {
  const result = deriveCanonicalShadowScore({
    coverageRows: [
      { assessmentStatus: "checked", evidenceState: "observed", rowId: "privacy_notice_availability" },
      { assessmentStatus: "checked", evidenceState: "not_observed", rowId: "consent_surface_observed" },
      { assessmentStatus: "checked", evidenceState: "observed", rowId: "retention_disclosure_observed" },
      { assessmentStatus: "coverage_limitation", evidenceState: "not_testable", rowId: "reject_all_path_availability" }
    ],
    findings: [finding()],
    model: MODEL
  });

  assert.equal(result.coverageRatio, 0.75);
  assert.equal(result.postureScore, 54);
  assert.deepEqual(result.withheldReasons, []);
});

test("critical caps prevent a supported high-severity gap from coexisting with a strong score", () => {
  const result = deriveCanonicalShadowScore({ coverageRows: COVERAGE_ROWS, findings: [finding()], model: MODEL });

  assert.equal(result.postureScore, 54);
  assert.deepEqual(result.appliedCaps.map((cap) => cap.capId), ["critical-tracking-cap"]);
  assert.deepEqual(result.contradictions, []);
});

test("unconfigured finding families fail closed", () => {
  const result = deriveCanonicalShadowScore({
    coverageRows: COVERAGE_ROWS,
    findings: [finding({ family: "new_unreviewed_family", findingId: "new_finding" })],
    model: MODEL
  });

  assert.equal(result.postureScore, null);
  assert.deepEqual(result.withheldReasons, ["unconfigured_finding_families:new_unreviewed_family"]);
});

test("a pending Luna model can generate shadow artifacts but cannot become cutover eligible", () => {
  const result = deriveCanonicalShadowScore({ coverageRows: COVERAGE_ROWS, findings: [], model: MODEL });

  assert.equal(result.postureScore, 100);
  assert.equal(result.modelApprovalStatus, "pending_luna");
  assert.equal(result.cutoverEligible, false);
  assert.equal(result.scoreKind, "gdpr_eprivacy_risk_shadow");
});

test("model audit reports missing, stale, and invalid family configuration", () => {
  const audit = auditCanonicalShadowScoreModel({
    model: {
      ...MODEL,
      familyMaximumRiskPoints: { consent_tracking: 101, stale_family: 5 }
    },
    scoreEligibleCoverageRowIds: Object.keys(MODEL.coverageRowWeights),
    scoreEligibleFamilies: ["consent_tracking", "contradiction"]
  });

  assert.deepEqual(audit, {
    invalidCoverageRowWeights: [],
    invalidGlobalSettings: [],
    invalidPostureBands: [],
    invalidFamilyMaximums: ["consent_tracking"],
    missingCoverageRows: [],
    missingFamilies: ["contradiction"],
    staleCoverageRows: [],
    staleFamilies: ["stale_family"]
  });
});

test("model audit rejects ambiguous bands, non-monotonic severity points, and unscoped caps", () => {
  const audit = auditCanonicalShadowScoreModel({
    model: {
      ...MODEL,
      criticalPostureCaps: [{
        capId: "unscoped",
        maxPostureScore: 50,
        minimumSeverity: "high"
      }],
      postureBands: [
        { actionLabel: "Monitor", minimumScore: 75, posture: "Clear" },
        { actionLabel: "Review", minimumScore: 75, posture: "Watch" }
      ],
      severityRiskPoints: { high: 10, medium: 20, low: 5 }
    },
    scoreEligibleCoverageRowIds: Object.keys(MODEL.coverageRowWeights),
    scoreEligibleFamilies: Object.keys(MODEL.familyMaximumRiskPoints)
  });

  assert.deepEqual(audit.invalidGlobalSettings, [
    "criticalPostureCaps.unscoped",
    "severityRiskPoints.monotonicity"
  ]);
  assert.deepEqual(audit.invalidPostureBands, ["duplicate_minimum_score", "missing_zero_floor"]);
});

test("model audit rejects a no-finding coverage threshold below the general threshold", () => {
  const audit = auditCanonicalShadowScoreModel({
    model: {
      ...MODEL,
      minimumCoverageRatioForNoFindingPostureScore: 0.6
    },
    scoreEligibleCoverageRowIds: Object.keys(MODEL.coverageRowWeights),
    scoreEligibleFamilies: Object.keys(MODEL.familyMaximumRiskPoints)
  });

  assert.deepEqual(audit.invalidGlobalSettings, ["minimumCoverageRatioForNoFindingPostureScore"]);
});

test("model audit reports missing, stale, and invalid coverage row weights", () => {
  const audit = auditCanonicalShadowScoreModel({
    model: {
      ...MODEL,
      coverageRowWeights: {
        consent_surface_observed: 0,
        stale_row: 1
      }
    },
    scoreEligibleCoverageRowIds: ["consent_surface_observed", "privacy_notice_availability"],
    scoreEligibleFamilies: Object.keys(MODEL.familyMaximumRiskPoints)
  });

  assert.deepEqual(audit.invalidCoverageRowWeights, ["consent_surface_observed"]);
  assert.deepEqual(audit.missingCoverageRows, ["privacy_notice_availability"]);
  assert.deepEqual(audit.staleCoverageRows, ["stale_row"]);
});

test("direct scoring fails closed for invalid coverage row weights", () => {
  const result = deriveCanonicalShadowScore({
    coverageRows: COVERAGE_ROWS,
    findings: [finding()],
    model: {
      ...MODEL,
      coverageRowWeights: {
        ...MODEL.coverageRowWeights,
        privacy_notice_availability: 0
      }
    }
  });

  assert.equal(result.postureScore, null);
  assert.deepEqual(result.withheldReasons, ["invalid_model_configuration"]);
});

test("coverage uses explicit row weights and duplicate row IDs fail closed", () => {
  const weightedModel: CanonicalShadowScoreModel = {
    ...MODEL,
    coverageRowWeights: {
      consent_surface_observed: 3,
      reject_all_path_availability: 1
    },
    minimumCoverageRatioForNoFindingPostureScore: 0.7
  };
  const rows: CanonicalShadowCoverageRow[] = [
    { assessmentStatus: "checked", evidenceState: "observed", rowId: "consent_surface_observed" },
    { assessmentStatus: "coverage_limitation", evidenceState: "not_testable", rowId: "reject_all_path_availability" }
  ];
  const weighted = deriveCanonicalShadowScore({ coverageRows: rows, findings: [finding()], model: weightedModel });
  const duplicate = deriveCanonicalShadowScore({ coverageRows: [...rows, rows[0]!], findings: [finding()], model: weightedModel });

  assert.equal(weighted.coverageRatio, 0.75);
  assert.equal(weighted.postureScore, 54);
  assert.equal(duplicate.postureScore, null);
  assert.deepEqual(duplicate.withheldReasons, ["duplicate_coverage_row_ids:consent_surface_observed"]);
});

test("the model resolves posture and action label from the same candidate score", () => {
  const result = deriveCanonicalShadowScore({ coverageRows: COVERAGE_ROWS, findings: [finding()], model: MODEL });

  assert.equal(result.postureScore, 54);
  assert.equal(result.posture, "Watch");
  assert.equal(result.actionLabel, "Review");
});

test("equivalent Lambda and browser-extension projections produce the same score artifact", () => {
  const findings = [
    finding(),
    finding({ family: "contradiction", findingId: "policy_behavior_contradiction_detected", severity: "medium" })
  ];
  const lambdaResult = deriveCanonicalShadowScore({ coverageRows: COVERAGE_ROWS, findings, model: MODEL });
  const browserExtensionResult = deriveCanonicalShadowScore({
    coverageRows: [...COVERAGE_ROWS].reverse(),
    findings: [...findings].reverse(),
    model: MODEL
  });

  assert.deepEqual(browserExtensionResult, lambdaResult);
});

test("oversized finding inputs fail closed and retain only a deterministic bounded inventory", () => {
  const findings = Array.from({ length: CANONICAL_SHADOW_MAX_FINDINGS + 1 }, (_, index) =>
    finding({ findingId: `finding_${String(index).padStart(3, "0")}`, severity: "low" })
  );
  const result = deriveCanonicalShadowScore({ coverageRows: COVERAGE_ROWS, findings, model: MODEL });

  assert.equal(result.inputFindingIds.length, CANONICAL_SHADOW_MAX_FINDINGS);
  assert.equal(result.postureScore, null);
  assert.match(result.withheldReasons.join(","), /finding_input_bound_exceeded/);
});
