export const CANONICAL_SHADOW_SCORE_SOURCE = "wc01.canonical-shadow-score";
export const GDPR_EPRIVACY_SHADOW_SCORE_KIND = "gdpr_eprivacy_risk_shadow";
export const CANONICAL_SHADOW_MAX_FINDINGS = 256;
export const CANONICAL_SHADOW_MAX_COVERAGE_ROWS = 256;

export type CanonicalShadowScoreSeverity = "high" | "medium" | "low";

export type CanonicalShadowScoreFinding = {
  family: string;
  findingId: string;
  severity: CanonicalShadowScoreSeverity;
};

export type CanonicalShadowCoverageRow = {
  assessmentStatus: "gap_observed" | "review_signal" | "checked" | "coverage_limitation" | "not_applicable";
  evidenceState: "observed" | "not_observed" | "not_testable" | "not_applicable";
  rowId: string;
};

export type CanonicalShadowScoreModel = {
  approvalStatus: "pending_luna" | "approved_by_luna";
  coverageRowWeights: Record<string, number>;
  criticalPostureCaps: Array<{
    capId: string;
    family?: string;
    findingId?: string;
    maxPostureScore: number;
    minimumSeverity: CanonicalShadowScoreSeverity;
  }>;
  familyMaximumRiskPoints: Record<string, number>;
  minimumCoverageRatioForNoFindingPostureScore: number;
  minimumCoverageRatioForPostureScore: number;
  postureBands: Array<{
    actionLabel: string;
    minimumScore: number;
    posture: string;
  }>;
  severityRiskPoints: Record<CanonicalShadowScoreSeverity, number>;
  version: string;
};

export type CanonicalShadowScoreResult = {
  actionLabel: string | null;
  appliedCaps: Array<{
    capId: string;
    maxPostureScore: number;
    triggeringFindingIds: string[];
  }>;
  contradictions: string[];
  coverageConfidence: "high" | "medium" | "low" | "insufficient";
  coverageBreakdown: {
    applicableWeight: number;
    coveredRowIds: string[];
    coveredWeight: number;
    limitedRows: Array<{
      assessmentStatus: CanonicalShadowCoverageRow["assessmentStatus"];
      evidenceState: CanonicalShadowCoverageRow["evidenceState"];
      rowId: string;
      weight: number;
    }>;
    notApplicableRowIds: string[];
  };
  coverageRatio: number;
  cutoverEligible: boolean;
  familyContributions: Array<{
    family: string;
    findingIds: string[];
    riskPoints: number;
    strongestSeverity: CanonicalShadowScoreSeverity;
  }>;
  inputFindingIds: string[];
  inputRowIds: string[];
  modelApprovalStatus: CanonicalShadowScoreModel["approvalStatus"];
  modelVersion: string;
  observedRiskIndex: number;
  posture: string | null;
  postureScore: number | null;
  scoreKind: typeof GDPR_EPRIVACY_SHADOW_SCORE_KIND;
  scoreSource: typeof CANONICAL_SHADOW_SCORE_SOURCE;
  withheldReasons: string[];
};

const SEVERITY_RANK: Record<CanonicalShadowScoreSeverity, number> = {
  high: 3,
  medium: 2,
  low: 1
};

function boundedRatio(value: number) {
  return Math.max(0, Math.min(1, value));
}

function boundedScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function coverageConfidence(coverageRatio: number, applicableRows: number) {
  if (applicableRows === 0) return "insufficient" as const;
  if (coverageRatio >= 0.9) return "high" as const;
  if (coverageRatio >= 0.7) return "medium" as const;
  return "low" as const;
}

function isCoverageLimited(row: CanonicalShadowCoverageRow) {
  return row.assessmentStatus === "coverage_limitation" || row.evidenceState === "not_testable";
}

function strongestSeverity(findings: CanonicalShadowScoreFinding[]) {
  return findings.reduce<CanonicalShadowScoreSeverity>(
    (strongest, finding) => SEVERITY_RANK[finding.severity] > SEVERITY_RANK[strongest] ? finding.severity : strongest,
    "low"
  );
}

function capMatchesFinding(
  cap: CanonicalShadowScoreModel["criticalPostureCaps"][number],
  finding: CanonicalShadowScoreFinding
) {
  return (
    SEVERITY_RANK[finding.severity] >= SEVERITY_RANK[cap.minimumSeverity] &&
    (cap.findingId === undefined || cap.findingId === finding.findingId) &&
    (cap.family === undefined || cap.family === finding.family)
  );
}

function requireCoverageRowWeight(model: CanonicalShadowScoreModel, rowId: string) {
  const weight = model.coverageRowWeights[rowId];
  if (weight === undefined) {
    throw new Error(`Canonical shadow score coverage row is not configured: ${rowId}`);
  }
  return weight;
}

export function auditCanonicalShadowScoreModel(input: {
  model: CanonicalShadowScoreModel;
  scoreEligibleCoverageRowIds: string[];
  scoreEligibleFamilies: string[];
}) {
  const configuredFamilies = Object.keys(input.model.familyMaximumRiskPoints);
  const configuredCoverageRows = Object.keys(input.model.coverageRowWeights);
  const scoreEligibleCoverageRowIds = [...new Set(input.scoreEligibleCoverageRowIds)].sort();
  const scoreEligibleFamilies = [...new Set(input.scoreEligibleFamilies)].sort();
  const capIds = input.model.criticalPostureCaps.map((cap) => cap.capId);
  const bandMinimums = input.model.postureBands.map((band) => band.minimumScore);
  const invalidGlobalSettings = [
    ...(!["pending_luna", "approved_by_luna"].includes(input.model.approvalStatus) ? ["approvalStatus"] : []),
    ...(!input.model.version.trim() ? ["version"] : []),
    ...(!Number.isFinite(input.model.minimumCoverageRatioForPostureScore) ||
    input.model.minimumCoverageRatioForPostureScore < 0 ||
    input.model.minimumCoverageRatioForPostureScore > 1
      ? ["minimumCoverageRatioForPostureScore"]
      : []),
    ...(!Number.isFinite(input.model.minimumCoverageRatioForNoFindingPostureScore) ||
    input.model.minimumCoverageRatioForNoFindingPostureScore < input.model.minimumCoverageRatioForPostureScore ||
    input.model.minimumCoverageRatioForNoFindingPostureScore > 1
      ? ["minimumCoverageRatioForNoFindingPostureScore"]
      : []),
    ...Object.entries(input.model.severityRiskPoints).flatMap(([severity, points]) =>
      !Number.isFinite(points) || points < 0 || points > 100 ? [`severityRiskPoints.${severity}`] : []
    ),
    ...(input.model.severityRiskPoints.high < input.model.severityRiskPoints.medium ||
    input.model.severityRiskPoints.medium < input.model.severityRiskPoints.low
      ? ["severityRiskPoints.monotonicity"]
      : []),
    ...(new Set(capIds).size !== capIds.length ? ["criticalPostureCaps.duplicate_cap_id"] : []),
    ...input.model.criticalPostureCaps.flatMap((cap) =>
      !cap.capId.trim() ||
      !Number.isFinite(cap.maxPostureScore) ||
      cap.maxPostureScore < 0 ||
      cap.maxPostureScore > 100 ||
      (!cap.family && !cap.findingId) ||
      !["high", "medium", "low"].includes(cap.minimumSeverity) ||
      (cap.family !== undefined && !configuredFamilies.includes(cap.family))
        ? [`criticalPostureCaps.${cap.capId || "missing_id"}`]
        : []
    )
  ].sort();
  return {
    invalidCoverageRowWeights: configuredCoverageRows
      .filter((rowId) => {
        const value = input.model.coverageRowWeights[rowId];
        return !rowId.trim() || value === undefined || !Number.isFinite(value) || value <= 0 || value > 100;
      })
      .sort(),
    invalidGlobalSettings,
    invalidPostureBands: [
      ...input.model.postureBands
      .filter((band) =>
        !Number.isFinite(band.minimumScore) ||
        band.minimumScore < 0 ||
        band.minimumScore > 100 ||
        !band.posture.trim() ||
        !band.actionLabel.trim()
      )
      .map((band) => String(band.minimumScore)),
      ...(input.model.postureBands.length === 0 ? ["missing_bands"] : []),
      ...(!bandMinimums.includes(0) ? ["missing_zero_floor"] : []),
      ...(new Set(bandMinimums).size !== bandMinimums.length ? ["duplicate_minimum_score"] : [])
    ].sort(),
    invalidFamilyMaximums: configuredFamilies
      .filter((family) => {
        const value = input.model.familyMaximumRiskPoints[family];
        return !family.trim() || value === undefined || !Number.isFinite(value) || value < 0 || value > 100;
      })
      .sort(),
    missingCoverageRows: scoreEligibleCoverageRowIds.filter((rowId) => input.model.coverageRowWeights[rowId] === undefined),
    missingFamilies: scoreEligibleFamilies.filter((family) => input.model.familyMaximumRiskPoints[family] === undefined),
    staleCoverageRows: configuredCoverageRows.filter((rowId) => !scoreEligibleCoverageRowIds.includes(rowId)).sort(),
    staleFamilies: configuredFamilies.filter((family) => !scoreEligibleFamilies.includes(family)).sort()
  };
}

export function deriveCanonicalShadowScore(input: {
  coverageRows: CanonicalShadowCoverageRow[];
  findings: CanonicalShadowScoreFinding[];
  model: CanonicalShadowScoreModel;
}): CanonicalShadowScoreResult {
  const allUniqueFindings = [...new Map(
    input.findings.map((finding) => [`${finding.findingId}:${finding.family}:${finding.severity}`, finding] as const)
  ).values()].sort((left, right) =>
    left.family.localeCompare(right.family) || left.findingId.localeCompare(right.findingId) || left.severity.localeCompare(right.severity)
  );
  const uniqueFindings = allUniqueFindings.slice(0, CANONICAL_SHADOW_MAX_FINDINGS);
  const sortedCoverageRows = [...input.coverageRows]
    .sort((left, right) => left.rowId.localeCompare(right.rowId))
    .slice(0, CANONICAL_SHADOW_MAX_COVERAGE_ROWS);
  const duplicateCoverageRowIds = [...new Set(
    sortedCoverageRows
      .map((row) => row.rowId)
      .filter((rowId, index, values) => values.indexOf(rowId) !== index)
  )].sort();
  const boundedCoverageRows = [...new Map(sortedCoverageRows.map((row) => [row.rowId, row] as const)).values()];
  const applicableRows = boundedCoverageRows.filter((row) => row.assessmentStatus !== "not_applicable");
  const coveredRows = applicableRows.filter((row) => !isCoverageLimited(row));
  const limitedRows = applicableRows.filter(isCoverageLimited);
  const applicableCoverageWeight = applicableRows.reduce(
    (total, row) => total + requireCoverageRowWeight(input.model, row.rowId),
    0
  );
  const coveredCoverageWeight = coveredRows.reduce(
    (total, row) => total + requireCoverageRowWeight(input.model, row.rowId),
    0
  );
  const coverageRatio = applicableCoverageWeight === 0
    ? 0
    : boundedRatio(coveredCoverageWeight / applicableCoverageWeight);
  const unconfiguredCoverageRows = [...new Set(
    boundedCoverageRows.map((row) => row.rowId).filter((rowId) => input.model.coverageRowWeights[rowId] === undefined)
  )].sort();
  const unconfiguredFamilies = [...new Set(
    uniqueFindings.map((finding) => finding.family).filter((family) => input.model.familyMaximumRiskPoints[family] === undefined)
  )].sort();

  const findingsByFamily = new Map<string, CanonicalShadowScoreFinding[]>();
  for (const finding of uniqueFindings) {
    const familyFindings = findingsByFamily.get(finding.family) ?? [];
    familyFindings.push(finding);
    findingsByFamily.set(finding.family, familyFindings);
  }

  const familyContributions = [...findingsByFamily.entries()]
    .filter(([family]) => input.model.familyMaximumRiskPoints[family] !== undefined)
    .map(([family, findings]) => {
      const strongest = strongestSeverity(findings);
      const familyMaximum = input.model.familyMaximumRiskPoints[family];
      if (familyMaximum === undefined) {
        throw new Error(`Canonical shadow score family is not configured: ${family}`);
      }
      return {
        family,
        findingIds: [...new Set(findings.map((finding) => finding.findingId))].sort(),
        riskPoints: Math.min(
          input.model.severityRiskPoints[strongest],
          familyMaximum
        ),
        strongestSeverity: strongest
      };
    })
    .sort((left, right) => right.riskPoints - left.riskPoints || left.family.localeCompare(right.family));

  const observedRiskIndex = boundedScore(
    familyContributions.reduce((total, contribution) => total + contribution.riskPoints, 0)
  );
  const appliedCaps = input.model.criticalPostureCaps.flatMap((cap) => {
    const triggeringFindingIds = uniqueFindings
      .filter((finding) => capMatchesFinding(cap, finding))
      .map((finding) => finding.findingId)
      .sort();
    return triggeringFindingIds.length > 0
      ? [{ capId: cap.capId, maxPostureScore: boundedScore(cap.maxPostureScore), triggeringFindingIds }]
      : [];
  });
  const uncappedPostureScore = boundedScore(100 - observedRiskIndex);
  const cappedPostureScore = appliedCaps.reduce(
    (score, cap) => Math.min(score, cap.maxPostureScore),
    uncappedPostureScore
  );
  const modelAudit = auditCanonicalShadowScoreModel({
    model: input.model,
    scoreEligibleCoverageRowIds: Object.keys(input.model.coverageRowWeights),
    scoreEligibleFamilies: Object.keys(input.model.familyMaximumRiskPoints)
  });
  const withheldReasons = [
    ...(Object.values(modelAudit).some((issues) => issues.length > 0)
      ? ["invalid_model_configuration"]
      : []),
    ...(allUniqueFindings.length > CANONICAL_SHADOW_MAX_FINDINGS ? ["finding_input_bound_exceeded"] : []),
    ...(input.coverageRows.length > CANONICAL_SHADOW_MAX_COVERAGE_ROWS ? ["coverage_row_input_bound_exceeded"] : []),
    ...(duplicateCoverageRowIds.length > 0
      ? [`duplicate_coverage_row_ids:${duplicateCoverageRowIds.join(",")}`]
      : []),
    ...(applicableRows.length === 0 ? ["no_applicable_coverage_rows"] : []),
    ...(coverageRatio < input.model.minimumCoverageRatioForPostureScore ? ["coverage_below_model_threshold"] : []),
    ...(familyContributions.length === 0 &&
    coverageRatio >= input.model.minimumCoverageRatioForPostureScore &&
    coverageRatio < input.model.minimumCoverageRatioForNoFindingPostureScore
      ? ["coverage_below_no_finding_threshold"]
      : []),
    ...(unconfiguredFamilies.length > 0
      ? [`unconfigured_finding_families:${unconfiguredFamilies.join(",")}`]
      : []),
    ...(unconfiguredCoverageRows.length > 0
      ? [`unconfigured_coverage_rows:${unconfiguredCoverageRows.join(",")}`]
      : [])
  ];
  // Coverage warnings remain attached to the result for transparency, but do
  // not suppress the bounded posture number. The product owner has approved
  // showing the candidate score while calibration evidence is completed.
  const scoreBlockingReasons = withheldReasons.filter((reason) =>
    !reason.startsWith("coverage_below_")
  );
  const postureScore = scoreBlockingReasons.length === 0 ? cappedPostureScore : null;
  const postureBand = postureScore === null
    ? null
    : [...input.model.postureBands]
        .sort((left, right) => right.minimumScore - left.minimumScore)
        .find((band) => postureScore >= band.minimumScore) ?? null;
  if (postureScore !== null && postureBand === null) {
    withheldReasons.push("posture_band_unconfigured");
  }
  const finalPostureScore = scoreBlockingReasons.length === 0 ? postureScore : null;
  const contradictions = [
    ...(finalPostureScore !== null && uniqueFindings.some((finding) => finding.severity === "high") && finalPostureScore >= 75
      ? ["strong_posture_score_with_high_severity_finding"]
      : []),
    ...(finalPostureScore !== null && appliedCaps.some((cap) => finalPostureScore > cap.maxPostureScore)
      ? ["critical_cap_not_enforced"]
      : [])
  ];

  return {
    actionLabel: finalPostureScore === null ? null : postureBand?.actionLabel ?? null,
    appliedCaps,
    contradictions,
    coverageBreakdown: {
      applicableWeight: applicableCoverageWeight,
      coveredRowIds: coveredRows.map((row) => row.rowId).sort(),
      coveredWeight: coveredCoverageWeight,
      limitedRows: limitedRows.map((row) => ({
        assessmentStatus: row.assessmentStatus,
        evidenceState: row.evidenceState,
        rowId: row.rowId,
        weight: requireCoverageRowWeight(input.model, row.rowId)
      })),
      notApplicableRowIds: boundedCoverageRows
        .filter((row) => row.assessmentStatus === "not_applicable")
        .map((row) => row.rowId)
        .sort()
    },
    coverageConfidence: coverageConfidence(coverageRatio, applicableRows.length),
    coverageRatio,
    cutoverEligible: input.model.approvalStatus === "approved_by_luna" && contradictions.length === 0 && finalPostureScore !== null,
    familyContributions,
    inputFindingIds: [...new Set(uniqueFindings.map((finding) => finding.findingId))].sort(),
    inputRowIds: [...new Set(boundedCoverageRows.map((row) => row.rowId))].sort(),
    modelApprovalStatus: input.model.approvalStatus,
    modelVersion: input.model.version,
    observedRiskIndex,
    posture: finalPostureScore === null ? null : postureBand?.posture ?? null,
    postureScore: finalPostureScore,
    scoreKind: GDPR_EPRIVACY_SHADOW_SCORE_KIND,
    scoreSource: CANONICAL_SHADOW_SCORE_SOURCE,
    withheldReasons
  };
}
