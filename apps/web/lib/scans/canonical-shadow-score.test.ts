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

test("shadow scoring adds severity-aware increments for distinct findings in one family", () => {
  const oneFinding = deriveCanonicalShadowScore({ coverageRows: COVERAGE_ROWS, findings: [finding()], model: MODEL });
  const siblingFindings = deriveCanonicalShadowScore({
    coverageRows: COVERAGE_ROWS,
    findings: [finding(), finding({ findingId: "third_party_tracking_pre_consent", severity: "medium" })],
    model: MODEL
  });

  assert.equal(oneFinding.observedRiskIndex, 30);
  assert.equal(siblingFindings.observedRiskIndex, 35);
  assert.equal(
    deriveCanonicalShadowScore({
      coverageRows: COVERAGE_ROWS,
      findings: [finding(), finding({ findingId: "second_high", severity: "high" })],
      model: MODEL
    }).observedRiskIndex,
    40
  );
  assert.equal(
    deriveCanonicalShadowScore({
      coverageRows: COVERAGE_ROWS,
      findings: [finding(), finding({ findingId: "low_signal", severity: "low" })],
      model: MODEL
    }).observedRiskIndex,
    32
  );
  assert.equal(siblingFindings.familyContributions.length, 1);
  assert.deepEqual(siblingFindings.familyContributions[0]?.findingIds, [
    "pre_consent_tracking_detected",
    "third_party_tracking_pre_consent"
  ]);
});

test("specific finding overrides can tune qualitative severity without changing the family cap", () => {
  const result = deriveCanonicalShadowScore({
    coverageRows: COVERAGE_ROWS,
    findings: [
      finding({ findingId: "high_impact_medium", severity: "medium" }),
      finding({ findingId: "low_impact_high", severity: "high" })
    ],
    model: {
      ...MODEL,
      findingRiskPointOverrides: {
        high_impact_medium: 24,
        low_impact_high: 8
      }
    }
  });

  assert.equal(result.observedRiskIndex, 27);
  assert.equal(result.familyContributions[0]?.riskPoints, 27);
});

test("checklist review signals apply bounded deterministic penalties without stacking related rows", () => {
  const model: CanonicalShadowScoreModel = {
    ...MODEL,
    checklistReviewRisk: {
      defaultRiskPoints: 1,
      maximumRiskPoints: 25,
      rowOverrides: {
        international_transfers_disclosure: {
          group: "international_transfer_disclosure",
          riskPoints: 10
        },
        pre_consent_cookies_storage: {
          coveredByFindingFamily: "consent_tracking",
          group: "pre_consent_runtime",
          riskPoints: 12
        },
        pre_consent_third_party_tracking: {
          coveredByFindingFamily: "consent_tracking",
          group: "pre_consent_runtime",
          riskPoints: 15
        },
        reject_all_path_availability: {
          coveredByFindingFamily: "consent_tracking",
          group: "pre_consent_runtime",
          riskPoints: 10
        }
      }
    },
    coverageRowWeights: {
      ...MODEL.coverageRowWeights,
      international_transfers_disclosure: 1,
      pre_consent_cookies_storage: 1
    }
  };
  const rows: CanonicalShadowCoverageRow[] = [
    { assessmentStatus: "review_signal", evidenceState: "observed", rowId: "pre_consent_cookies_storage" },
    { assessmentStatus: "review_signal", evidenceState: "observed", rowId: "pre_consent_third_party_tracking" },
    { assessmentStatus: "review_signal", evidenceState: "not_observed", rowId: "reject_all_path_availability" },
    { assessmentStatus: "review_signal", evidenceState: "observed", rowId: "international_transfers_disclosure" },
    { assessmentStatus: "review_signal", evidenceState: "observed", rowId: "retention_disclosure_observed" }
  ];
  const result = deriveCanonicalShadowScore({ coverageRows: rows, findings: [], model });

  assert.equal(result.observedRiskIndex, 25);
  assert.equal(result.postureScore, 75);
  assert.equal(result.checklistReviewRiskPoints, 25);
  assert.deepEqual(result.checklistReviewContributions, [
    {
      group: "pre_consent_runtime",
      riskPoints: 15,
      rowIds: ["pre_consent_cookies_storage", "pre_consent_third_party_tracking", "reject_all_path_availability"]
    },
    {
      group: "international_transfer_disclosure",
      riskPoints: 10,
      rowIds: ["international_transfers_disclosure"]
    },
    {
      group: "row:retention_disclosure_observed",
      riskPoints: 1,
      rowIds: ["retention_disclosure_observed"]
    }
  ]);
});

test("confirmed checklist gaps deduct deterministic risk without stacking related rows", () => {
  const model: CanonicalShadowScoreModel = {
    ...MODEL,
    checklistReviewRisk: {
      defaultRiskPoints: 1,
      gapRiskMultiplier: 1.5,
      maximumRiskPoints: 100,
      rowOverrides: {
        cookie_notice_policy_availability: {
          group: "policy_surface_absence",
          riskPoints: 10
        },
        privacy_notice_availability: {
          group: "policy_surface_absence",
          riskPoints: 12
        },
        reject_all_path_availability: {
          group: "consent_control_availability",
          riskPoints: 12
        }
      }
    },
    coverageRowWeights: {
      ...MODEL.coverageRowWeights,
      cookie_notice_policy_availability: 1,
      privacy_notice_availability: 1
    }
  };
  const rows: CanonicalShadowCoverageRow[] = [
    { assessmentStatus: "gap_observed", evidenceState: "not_observed", rowId: "privacy_notice_availability" },
    { assessmentStatus: "gap_observed", evidenceState: "not_observed", rowId: "cookie_notice_policy_availability" },
    { assessmentStatus: "review_signal", evidenceState: "not_observed", rowId: "reject_all_path_availability" }
  ];
  const result = deriveCanonicalShadowScore({ coverageRows: rows, findings: [], model });

  assert.equal(result.observedRiskIndex, 30);
  assert.equal(result.postureScore, 70);
  assert.deepEqual(result.checklistReviewContributions, [
    {
      group: "policy_surface_absence",
      riskPoints: 18,
      rowIds: ["cookie_notice_policy_availability", "privacy_notice_availability"]
    },
    {
      group: "consent_control_availability",
      riskPoints: 12,
      rowIds: ["reject_all_path_availability"]
    }
  ]);
});

test("a scored consent-tracking finding replaces the related checklist review penalty", () => {
  const result = deriveCanonicalShadowScore({
    coverageRows: [{
      assessmentStatus: "review_signal",
      evidenceState: "observed",
      rowId: "pre_consent_third_party_tracking"
    }],
    findings: [finding({ severity: "medium" })],
    model: {
      ...MODEL,
      checklistReviewRisk: {
        defaultRiskPoints: 1,
        maximumRiskPoints: 25,
        rowOverrides: {
          pre_consent_third_party_tracking: {
            coveredByFindingFamily: "consent_tracking",
            group: "pre_consent_runtime",
            riskPoints: 15
          }
        }
      }
    }
  });

  assert.equal(result.observedRiskIndex, 15);
  assert.deepEqual(result.checklistReviewContributions, []);
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

test("coverage limits retain a posture score and an explicit coverage warning", () => {
  const result = deriveCanonicalShadowScore({
    coverageRows: [
      COVERAGE_ROWS[0]!,
      { assessmentStatus: "coverage_limitation", evidenceState: "not_testable", rowId: "reject_all_path_availability" }
    ],
    findings: [finding()],
    model: MODEL
  });

  assert.equal(result.observedRiskIndex, 30);
  assert.equal(result.postureScore, 54);
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

test("medium coverage retains a no-finding posture score with an explicit coverage warning", () => {
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
  assert.equal(result.postureScore, 100);
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

test("an Admixer-style cluster of pre-consent tracker findings cannot retain a high posture score", () => {
  const result = deriveCanonicalShadowScore({
    coverageRows: COVERAGE_ROWS,
    findings: [
      finding({ findingId: "pre_consent_tracking_detected", severity: "high" }),
      finding({ findingId: "third_party_tracking_pre_consent", severity: "high" }),
      finding({ findingId: "third_party_cookie_pre_consent", severity: "medium" })
    ],
    model: MODEL
  });

  assert.equal(result.postureScore, 54);
  assert.ok((result.postureScore ?? 100) < 60);
  assert.deepEqual(result.familyContributions[0]?.findingIds, [
    "pre_consent_tracking_detected",
    "third_party_cookie_pre_consent",
    "third_party_tracking_pre_consent"
  ]);
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

test("unconfigured coverage rows fail closed without a fallback weight", () => {
  assert.throws(
    () => deriveCanonicalShadowScore({
      coverageRows: [{ assessmentStatus: "checked", evidenceState: "observed", rowId: "unknown_row" }],
      findings: [],
      model: MODEL
    }),
    /coverage row is not configured: unknown_row/
  );
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
