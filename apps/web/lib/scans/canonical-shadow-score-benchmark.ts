import {
  deriveCanonicalShadowScore,
  type CanonicalShadowCoverageRow,
  type CanonicalShadowScoreFinding,
  type CanonicalShadowScoreModel,
  type CanonicalShadowScoreResult
} from "./canonical-shadow-score";
import {
  LUNA_EXPECTED_BAND_LANE_IDS,
  type LunaExpectedBandLaneId
} from "./canonical-shadow-score-benchmark-lanes";
import {
  GDPR_EPRIVACY_SHADOW_LUNA_DECISION,
  isLunaScoreDecisionApprovedForModel
} from "./canonical-shadow-score-luna-decision";
import { GDPR_EPRIVACY_SHADOW_CANDIDATE_V3_MODEL } from "./canonical-shadow-score-model";

export const CANONICAL_SHADOW_BENCHMARK_SCHEMA_VERSION = "canonical-shadow-score-benchmark.v1";
export const CANONICAL_SHADOW_MAX_BENCHMARK_CASES = 32;

type BenchmarkCase = {
  caseId: string;
  excludedDomainFamilies: string[];
  findings: CanonicalShadowScoreFinding[];
  laneId: LunaExpectedBandLaneId;
  region: string;
  scanSource: string;
  rows: CanonicalShadowCoverageRow[];
};

function completeRows(): CanonicalShadowCoverageRow[] {
  return Object.keys(GDPR_EPRIVACY_SHADOW_CANDIDATE_V3_MODEL.coverageRowWeights).map((rowId) => ({
    assessmentStatus: "checked",
    evidenceState: "observed",
    rowId
  }));
}

function limitedRows(): CanonicalShadowCoverageRow[] {
  return Object.keys(GDPR_EPRIVACY_SHADOW_CANDIDATE_V3_MODEL.coverageRowWeights).map((rowId) => ({
    assessmentStatus: "coverage_limitation",
    evidenceState: "not_testable",
    rowId
  }));
}

function finding(
  family: CanonicalShadowScoreFinding["family"],
  findingId: string,
  severity: CanonicalShadowScoreFinding["severity"] = "high"
): CanonicalShadowScoreFinding {
  return { family, findingId, severity };
}

export const GDPR_EPRIVACY_SHADOW_BENCHMARK_CASES: BenchmarkCase[] = [
  {
    caseId: "low-signal-complete-coverage",
    excludedDomainFamilies: [],
    findings: [],
    laneId: "low_signal",
    region: "eu-west-1",
    scanSource: "lambda",
    rows: completeRows()
  },
  {
    caseId: "strong-consent-controls-no-supported-gap",
    excludedDomainFamilies: [],
    findings: [],
    laneId: "strong_consent_controls",
    region: "eu-west-1",
    scanSource: "lambda",
    rows: completeRows()
  },
  {
    caseId: "pre-consent-tracking-and-storage",
    excludedDomainFamilies: [],
    findings: [finding("consent_tracking", "preconsent_tracking")],
    laneId: "pre_consent_tracking_storage",
    region: "eu-west-1",
    scanSource: "lambda",
    rows: completeRows()
  },
  {
    caseId: "policy-rights-gap",
    excludedDomainFamilies: [],
    findings: [finding("rights_gap", "data_subject_rights_disclosure_gap")],
    laneId: "policy_gaps",
    region: "eu-west-1",
    scanSource: "lambda",
    rows: completeRows()
  },
  {
    caseId: "session-replay-fingerprinting-contradiction",
    excludedDomainFamilies: [],
    findings: [finding("contradiction", "session_replay_fingerprinting_disclosure_contradiction")],
    laneId: "session_replay_fingerprinting",
    region: "eu-west-1",
    scanSource: "lambda",
    rows: completeRows()
  },
  {
    caseId: "sensitive-context-third-party-tracking",
    excludedDomainFamilies: [],
    findings: [finding("sensitive_data", "sensitive_data_collection_with_third_party_tracking_present")],
    laneId: "sensitive_contexts",
    region: "eu-west-1",
    scanSource: "lambda",
    rows: completeRows()
  },
  {
    caseId: "accessibility-findings-outside-gdpr-score",
    excludedDomainFamilies: ["accessibility"],
    findings: [],
    laneId: "accessibility",
    region: "eu-west-1",
    scanSource: "lambda",
    rows: completeRows()
  },
  {
    caseId: "transport-security-findings-outside-gdpr-risk-score",
    excludedDomainFamilies: ["transport_security"],
    findings: [],
    laneId: "transport_security",
    region: "eu-west-1",
    scanSource: "lambda",
    rows: completeRows()
  },
  {
    caseId: "consumer-protection-findings-outside-gdpr-score",
    excludedDomainFamilies: ["consumer_protection"],
    findings: [],
    laneId: "consumer_protection",
    region: "eu-west-1",
    scanSource: "lambda",
    rows: completeRows()
  },
  {
    caseId: "access-limited-score-withheld",
    excludedDomainFamilies: [],
    findings: [],
    laneId: "access_limited_no_go",
    region: "eu-west-1",
    scanSource: "lambda",
    rows: limitedRows()
  },
  {
    caseId: "cross-region-eu",
    excludedDomainFamilies: [],
    findings: [finding("consent_tracking", "preconsent_tracking")],
    laneId: "cross_region_equivalence",
    region: "eu-west-1",
    scanSource: "lambda",
    rows: completeRows()
  },
  {
    caseId: "cross-region-us",
    excludedDomainFamilies: [],
    findings: [finding("consent_tracking", "preconsent_tracking")],
    laneId: "cross_region_equivalence",
    region: "us-west-2",
    scanSource: "lambda",
    rows: completeRows().reverse()
  },
  {
    caseId: "source-equivalence-lambda",
    excludedDomainFamilies: [],
    findings: [finding("contradiction", "policy_runtime_contradiction", "medium")],
    laneId: "source_equivalence",
    region: "eu-west-1",
    scanSource: "lambda",
    rows: completeRows()
  },
  {
    caseId: "source-equivalence-browser-extension",
    excludedDomainFamilies: [],
    findings: [finding("contradiction", "policy_runtime_contradiction", "medium")],
    laneId: "source_equivalence",
    region: "eu-west-1",
    scanSource: "browser_extension",
    rows: completeRows().reverse()
  }
];

function resultSignature(result: CanonicalShadowScoreResult) {
  return JSON.stringify({
    actionLabel: result.actionLabel,
    appliedCaps: result.appliedCaps,
    coverageRatio: result.coverageRatio,
    observedRiskIndex: result.observedRiskIndex,
    posture: result.posture,
    postureScore: result.postureScore,
    withheldReasons: result.withheldReasons
  });
}

export function buildCanonicalShadowScoreBenchmarkArtifact(
  generatedAt: string,
  model: CanonicalShadowScoreModel = GDPR_EPRIVACY_SHADOW_CANDIDATE_V3_MODEL
) {
  const boundedCases = GDPR_EPRIVACY_SHADOW_BENCHMARK_CASES.slice(0, CANONICAL_SHADOW_MAX_BENCHMARK_CASES);
  const cases = boundedCases.map((benchmarkCase) => ({
    caseId: benchmarkCase.caseId,
    excludedDomainFamilies: benchmarkCase.excludedDomainFamilies,
    inputFindings: benchmarkCase.findings.map((entry) => ({
      family: entry.family,
      findingId: entry.findingId,
      severity: entry.severity
    })),
    laneId: benchmarkCase.laneId,
    region: benchmarkCase.region,
    result: deriveCanonicalShadowScore({
      coverageRows: benchmarkCase.rows,
      findings: benchmarkCase.findings,
      model
    }),
    scanSource: benchmarkCase.scanSource
  }));
  const representedLaneIds = [...new Set(cases.map((entry) => entry.laneId))].sort();
  const missingLaneIds = LUNA_EXPECTED_BAND_LANE_IDS.filter((laneId) => !representedLaneIds.includes(laneId));
  const extraLaneIds = representedLaneIds.filter((laneId) => !LUNA_EXPECTED_BAND_LANE_IDS.includes(laneId as LunaExpectedBandLaneId));
  const sourceCases = cases.filter((entry) => entry.laneId === "source_equivalence");
  const regionCases = cases.filter((entry) => entry.laneId === "cross_region_equivalence");
  const sourceEquivalent = sourceCases.length >= 2 && new Set(sourceCases.map((entry) => resultSignature(entry.result))).size === 1;
  const regionEquivalent = regionCases.length >= 2 && new Set(regionCases.map((entry) => resultSignature(entry.result))).size === 1;
  const lunaLaneDecisions = GDPR_EPRIVACY_SHADOW_LUNA_DECISION.expectedBandLanes.map((lane) => ({
    evidenceArtifact: lane.evidenceArtifact,
    expectedPostureBand: lane.expectedPostureBand,
    laneId: lane.laneId,
    status: lane.status
  }));
  const invariantFailures = [
    ...(GDPR_EPRIVACY_SHADOW_BENCHMARK_CASES.length > CANONICAL_SHADOW_MAX_BENCHMARK_CASES ? ["benchmark_case_bound_exceeded"] : []),
    ...missingLaneIds.map((laneId) => `missing_lane:${laneId}`),
    ...extraLaneIds.map((laneId) => `extra_lane:${laneId}`),
    ...(!sourceEquivalent ? ["source_equivalence_failed"] : []),
    ...(!regionEquivalent ? ["cross_region_equivalence_failed"] : []),
    ...(cases.some((entry) => entry.result.cutoverEligible) ? ["pending_model_case_became_cutover_eligible"] : [])
  ].sort();
  const candidateContradictions = cases.flatMap((entry) =>
    entry.inputFindings.some((finding) => finding.severity === "high") && entry.result.posture === "Clear"
      ? [`supported_high_severity_gap_has_clear_posture:${entry.caseId}`]
      : []
  ).sort();
  const expectedBandMismatches = cases.flatMap((entry) => {
    const laneDecision = GDPR_EPRIVACY_SHADOW_LUNA_DECISION.expectedBandLanes.find(
      (lane) => lane.laneId === entry.laneId
    );
    const actualBand = entry.result.posture ?? "Withheld";
    return laneDecision?.expectedPostureBand && laneDecision.expectedPostureBand !== actualBand
      ? [`expected_band_mismatch:${entry.caseId}:${laneDecision.expectedPostureBand}->${actualBand}`]
      : [];
  }).sort();
  const lunaApproved = isLunaScoreDecisionApprovedForModel(
    GDPR_EPRIVACY_SHADOW_LUNA_DECISION,
    model.version
  );

  return {
    cases,
    generatedAt,
    acceptanceBlockers: [...invariantFailures, ...candidateContradictions, ...expectedBandMismatches].sort(),
    candidateContradictions,
    expectedBandMismatches,
    gdprEprivacyCutoverEligible: lunaApproved && invariantFailures.length === 0 && candidateContradictions.length === 0 && expectedBandMismatches.length === 0,
    invariantFailures,
    invariants: {
      allRequiredLanesRepresented: missingLaneIds.length === 0 && extraLaneIds.length === 0,
      crossRegionEquivalent: regionEquivalent,
      sourceEquivalent
    },
    lunaLaneDecisions,
    modelApprovalStatus: model.approvalStatus,
    modelVersion: model.version,
    overallScoreStatus: "withheld_unmodeled_domains" as const,
    schemaVersion: CANONICAL_SHADOW_BENCHMARK_SCHEMA_VERSION
  };
}
