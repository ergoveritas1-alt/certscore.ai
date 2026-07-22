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
  criticalPostureCaps: Array<{
    capId: string;
    family?: string;
    findingId?: string;
    maxPostureScore: number;
    minimumSeverity: CanonicalShadowScoreSeverity;
  }>;
  familyMaximumRiskPoints: Record<string, number>;
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

export function auditCanonicalShadowScoreModel(input: {
  model: CanonicalShadowScoreModel;
  scoreEligibleFamilies: string[];
}) {
  const configuredFamilies = Object.keys(input.model.familyMaximumRiskPoints);
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
    missingFamilies: scoreEligibleFamilies.filter((family) => input.model.familyMaximumRiskPoints[family] === undefined),
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
  const boundedCoverageRows = [...input.coverageRows]
    .sort((left, right) => left.rowId.localeCompare(right.rowId))
    .slice(0, CANONICAL_SHADOW_MAX_COVERAGE_ROWS);
  const applicableRows = boundedCoverageRows.filter((row) => row.assessmentStatus !== "not_applicable");
  const coveredRows = applicableRows.filter((row) => !isCoverageLimited(row));
  const coverageRatio = applicableRows.length === 0 ? 0 : boundedRatio(coveredRows.length / applicableRows.length);
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
      return {
        family,
        findingIds: [...new Set(findings.map((finding) => finding.findingId))].sort(),
        riskPoints: Math.min(
          input.model.severityRiskPoints[strongest],
          input.model.familyMaximumRiskPoints[family] ?? 0
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
  const withheldReasons = [
    ...(auditCanonicalShadowScoreModel({
      model: input.model,
      scoreEligibleFamilies: Object.keys(input.model.familyMaximumRiskPoints)
    }).invalidGlobalSettings.length > 0
      ? ["invalid_model_configuration"]
      : []),
    ...(allUniqueFindings.length > CANONICAL_SHADOW_MAX_FINDINGS ? ["finding_input_bound_exceeded"] : []),
    ...(input.coverageRows.length > CANONICAL_SHADOW_MAX_COVERAGE_ROWS ? ["coverage_row_input_bound_exceeded"] : []),
    ...(applicableRows.length === 0 ? ["no_applicable_coverage_rows"] : []),
    ...(coverageRatio < input.model.minimumCoverageRatioForPostureScore ? ["coverage_below_model_threshold"] : []),
    ...(unconfiguredFamilies.length > 0
      ? [`unconfigured_finding_families:${unconfiguredFamilies.join(",")}`]
      : [])
  ];
  const postureScore = withheldReasons.length === 0 ? cappedPostureScore : null;
  const postureBand = postureScore === null
    ? null
    : [...input.model.postureBands]
        .sort((left, right) => right.minimumScore - left.minimumScore)
        .find((band) => postureScore >= band.minimumScore) ?? null;
  if (postureScore !== null && postureBand === null) {
    withheldReasons.push("posture_band_unconfigured");
  }
  const finalPostureScore = withheldReasons.length === 0 ? postureScore : null;
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
