import { existsSync } from "node:fs";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  regulatoryReviewToProductionChecklistModel,
  type V2CaliforniaPrivacyChecklistItem,
  type V2GdprEprivacyChecklistItem,
} from "../packages/certscore-report-adapter/src/regulatory-review-beta-adapter.js";
import { reviewEvidenceBundle } from "../packages/certscore-review-engine/src/index.js";

type Args = {
  help: boolean;
  outDir: string;
  stage1Dir: string;
  stage2Dir: string;
  stage3Dir: string;
};

type PromotedGoldExamples = {
  examples?: GoldExample[];
};

type GoldExample = {
  artifactPaths?: Record<string, string>;
  domain?: string;
  lane?: string;
  profile?: string;
  promotionStatus?: string;
  url?: string;
};

type ReviewerQueue = {
  items?: Array<{
    artifactPaths?: Record<string, string>;
    domain?: string;
    lane?: string;
    missingSignalTags?: string[];
    profile?: string;
    reason?: string | string[];
    reviewType?: string;
    url?: string;
  }>;
};

type Stage1ArtifactIndex = {
  latestByTargetProfile?: Array<{
    artifactPaths?: Record<string, string>;
    domain?: string;
    knownLimitations?: string[];
    scanProfile?: string;
    scanStatus?: string;
    url?: string;
  }>;
};

type SyntheticFixtureIndex = {
  entries?: Array<{
    artifactPaths?: Record<string, string>;
    calibrationRole?: "positive" | "control";
    fixtureId?: string;
    lane?: string;
    status?: string;
    title?: string;
  }>;
};

type CandidateSnapshot = {
  confidence: number;
  demotionReasons: string[];
  directVsInferred: string;
  eligibilityStatus: string;
  findingKey: string;
  matchedCriteria: string[];
  missingCorroborators: string[];
  sourceModulesPresent: string[];
  sourceModulesRequired: string[];
};

type ExampleSnapshot = {
  artifactPath: string;
  candidates: CandidateSnapshot[];
  debugConfidenceRows: DebugConfidenceSnapshot[];
  domain: string;
  lane: string;
  lanes: string[];
  profile: string;
  promotionStatus: string;
  url: string;
};

type DebugConfidenceArea = "california_ccpa_cpra" | "gdpr_eprivacy";

type DebugConfidenceSnapshot = {
  area: DebugConfidenceArea;
  artifactPath: string;
  domain: string;
  evidenceState: string;
  firstImprovementSuggestion: string;
  improvementSuggestions: string[];
  label: string;
  lane: string;
  limitationClass: "scanner_coverage_gap" | "missing_source_evidence" | "weak_or_incomplete_evidence" | "sufficient_for_debug";
  missingSourceSignals: string[];
  profile: string;
  rowId: string;
  score: number;
  scoreBucket: string;
  status: string;
  url: string;
};

type FindingSummary = {
  averageConfidence: number;
  buckets: Record<string, number>;
  eligible: number;
  findingKey: string;
  maxConfidence: number;
  medianConfidence: number;
  minConfidence: number;
  notEligible: number;
  observed: number;
  topDemotionReasons: CountEntry[];
  topMatchedCriteria: CountEntry[];
  topMissingCorroborators: CountEntry[];
};

type LaneSummary = {
  averageMaxConfidence: number;
  candidateExamples: number;
  lane: string;
  maxConfidence: number;
  medianMaxConfidence: number;
  minMaxConfidence: number;
};

type DebugConfidenceRowSummary = {
  area: DebugConfidenceArea;
  averageScore: number;
  coverageGapRows: number;
  lowConfidenceRows: number;
  medianScore: number;
  rowId: string;
  scoreBuckets: Record<string, number>;
  statuses: CountEntry[];
  topImprovementSuggestions: CountEntry[];
  totalRows: number;
};

type DebugConfidenceGate = {
  checks: Array<{
    detail: string;
    name: string;
    status: "pass" | "fail";
  }>;
  status: "pass" | "fail";
};

type DebugConfidenceReport = {
  reportVersion: "wc01.v2_regulatory_debug_confidence.1";
  generatedAt: string;
  guardrails: string[];
  gate: DebugConfidenceGate;
  coverageGapRows: DebugConfidenceSnapshot[];
  lowConfidenceRows: DebugConfidenceSnapshot[];
  rowSummaries: DebugConfidenceRowSummary[];
  scoreBuckets: Record<string, number>;
  summary: {
    coverageGapRows: number;
    lowConfidenceRows: number;
    rawSuggestionRows: number;
    rows: number;
  };
  topImprovementSuggestions: CountEntry[];
};

type CountEntry = {
  count: number;
  value: string;
};

type NearMissDetail = {
  artifactPath: string;
  classification: "evidence_absent" | "weak_evidence" | "likely_calibratable" | "module_not_run";
  domain: string;
  lane: string;
  missingModules: string[];
  profile: string;
  relevantCandidates: CandidateSnapshot[];
  reviewReason: string[];
  url: string;
};

type NearMissRerunPlan = {
  planVersion: "wc01.v2_regulatory_near_miss_rerun_plan.1";
  generatedAt: string;
  guardrails: string[];
  runLists: Record<string, {
    command: string;
    path: string;
    profile: string;
    urls: string[];
  }>;
  summary: {
    lanes: CountEntry[];
    plannedRuns: number;
    profiles: CountEntry[];
    sourceNearMissLanes: number;
    urls: number;
  };
  targets: NearMissRerunTarget[];
};

type NearMissRerunFailure = {
  domain: string;
  failedModules: string[];
  failureClass: "latest_module_failed" | "coverage_not_attempted";
  lanes: string[];
  latestArtifactPath?: string;
  profile: string;
  url: string;
};

type NearMissRerunTarget = {
  domain: string;
  lanes: string[];
  missingModules: string[];
  profile: string;
  sourceArtifacts: string[];
  url: string;
};

type CoverageAreaFollowUpCapturePlan = {
  planVersion: "wc01.v2_regulatory_coverage_area_follow_up_capture_plan.1";
  generatedAt: string;
  guardrails: string[];
  runLists: Record<string, {
    command: string;
    path: string;
    profile: string;
    urls: string[];
  }>;
  summary: {
    coverageGapRows: number;
    plannedRuns: number;
    profiles: CountEntry[];
    rows: CountEntry[];
    urls: number;
  };
  targets: CoverageAreaFollowUpCaptureTarget[];
};

type CoverageAreaFollowUpCaptureTarget = {
  area: DebugConfidenceArea;
  artifactPath: string;
  currentProfile: string;
  domain: string;
  reason: string;
  recommendedProfile: string;
  rowId: string;
  url: string;
};

type CalibrationReport = {
  analysisVersion: "wc01.v2_regulatory_confidence_calibration.1";
  generatedAt: string;
  guardrails: string[];
  input: {
    promotedExamples: number;
    reviewerQueueItems: number;
    stage2Dir: string;
  };
  summary: {
    analyzedExamples: number;
    candidateSnapshots: number;
    eligibleCandidateSnapshots: number;
    nearMissItems: number;
  };
  findingSummaries: FindingSummary[];
  laneSummaries: LaneSummary[];
  coverageAreaImprovementReview: CoverageAreaImprovementReview;
  coverageAreaFollowUpCapturePlan: CoverageAreaFollowUpCapturePlan;
  nearMissDetails: NearMissDetail[];
  nearMissDetailSummary: CountEntry[];
  nearMissPatterns: CountEntry[];
  regulatoryDebugConfidence: DebugConfidenceReport;
  rerunFailures: NearMissRerunFailure[];
  rerunPlan: NearMissRerunPlan;
  examples: ExampleSnapshot[];
};

type CoverageAreaImprovementStatus =
  | "needs_follow_up_capture"
  | "needs_evidence_contract"
  | "needs_threshold_or_fixture_review"
  | "ready_for_monitoring";

type CoverageAreaImprovementReview = {
  reportVersion: "wc01.v2_regulatory_coverage_area_improvement_review.1";
  generatedAt: string;
  guardrails: string[];
  areas: CoverageAreaImprovementArea[];
  summary: {
    areas: number;
    statuses: CountEntry[];
    topPriorityAreas: Array<{
      priorityScore: number;
      rowId: string;
      status: CoverageAreaImprovementStatus;
    }>;
  };
};

type CoverageAreaImprovementArea = {
  area: DebugConfidenceArea;
  attributesChecked: string[];
  dominantBlocker: string;
  exitCriteria: string[];
  findingKeys: string[];
  laneAliases: string[];
  metrics: {
    coverageGapRows: number;
    lowConfidenceRows: number;
    medianDebugConfidence: number;
    nearMissClassifications: CountEntry[];
    residualRerunFailures: number;
    totalRows: number;
  };
  nextAction: string;
  priorityScore: number;
  rowId: string;
  status: CoverageAreaImprovementStatus;
  topDemotionReasons: CountEntry[];
  topImprovementSuggestions: CountEntry[];
  topMatchedCriteria: CountEntry[];
  topMissingCorroborators: CountEntry[];
};

const DEFAULT_STAGE2_DIR = path.join("artifacts", "gold-corpus", "v2-20260613-stage2");
const DEFAULT_STAGE3_DIR = path.join("artifacts", "gold-corpus", "v2-20260613-stage3-fixtures");
const DEFAULT_STAGE1_DIR = path.join("artifacts", "gold-corpus", "v2-20260613-stage1");
const DEFAULT_OUT_DIR = path.join(DEFAULT_STAGE2_DIR, "calibration");

const REGULATORY_FINDING_KEYS = [
  "pre_consent_tracking_detected",
  "third_party_cookie_pre_consent",
  "vendor_associated_cookie_pre_consent",
  "non_essential_storage_pre_consent",
  "consent_banner_observed_or_not_observed",
  "reject_control_observed_or_not_observed",
  "reject_action_succeeded_or_not_testable",
  "post_choice_consent_control_observed",
  "tracking_after_refusal_review_signal",
  "reject_did_not_reduce_tracking_review_signal",
  "vendors_persist_after_reject_review_signal",
  "cookies_persist_after_reject_review_signal",
  "accept_reject_runtime_delta_observed",
  "cookie_policy_observed_or_not_observed",
  "endpoint_transfer_review_signal",
  "session_replay_or_behavioral_analytics_observed",
  "policy_runtime_vendor_alignment_review_signal",
  "privacy_notice_observed_or_not_observed",
  "notice_at_collection_observed",
  "do_not_sell_or_share_link_observed",
  "gpc_disclosure_observed",
  "gpc_runtime_probe_with_disclosure_observed",
  "targeted_advertising_runtime_signal",
  "post_opt_out_targeted_advertising_behavior_signal",
] as const;

const REGULATORY_FINDING_KEY_SET = new Set<string>(REGULATORY_FINDING_KEYS);

const LANE_FINDING_KEYS: Record<string, string[]> = {
  ccpa_cpra_do_not_sell_or_share_availability: ["do_not_sell_or_share_link_observed"],
  cookie_notice_availability: ["cookie_policy_observed_or_not_observed"],
  gdpr_eprivacy_consent_surface_observed: ["consent_banner_observed_or_not_observed"],
  gpc_opt_out_signal_handling: [
    "gpc_disclosure_observed",
    "gpc_runtime_probe_with_disclosure_observed",
  ],
  notice_at_collection: ["notice_at_collection_observed"],
  post_choice_consent_controls: ["post_choice_consent_control_observed"],
  post_opt_out_tracking_behavior: ["post_opt_out_targeted_advertising_behavior_signal"],
  reject_decline_option_availability: [
    "reject_control_observed_or_not_observed",
    "reject_action_succeeded_or_not_testable",
  ],
  session_replay_fingerprinting_review: ["session_replay_or_behavioral_analytics_observed"],
  targeted_advertising_signals: ["targeted_advertising_runtime_signal"],
  tracking_after_refusal: [
    "tracking_after_refusal_review_signal",
    "reject_did_not_reduce_tracking_review_signal",
    "vendors_persist_after_reject_review_signal",
    "cookies_persist_after_reject_review_signal",
  ],
  weak_or_no_consent_surface: ["consent_banner_observed_or_not_observed"],
};

const RERUN_PLAN_TARGET_LANES = Object.keys(LANE_FINDING_KEYS);

void main();

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const promoted = await readRequiredJson<PromotedGoldExamples>(args.stage2Dir, "promoted-gold-examples.json");
  const reviewerQueue = await readRequiredJson<ReviewerQueue>(args.stage2Dir, "reviewer-queue.json");
  const stage1Index = await readOptionalJson<Stage1ArtifactIndex>(args.stage1Dir, "artifact-index.json");
  const syntheticFixtures = await readOptionalJson<SyntheticFixtureIndex>(args.stage3Dir, "synthetic-fixture-index.json");
  const examples = await buildExampleSnapshots(promoted.examples ?? []);
  const fixtureExamples = await buildFixtureExampleSnapshots(syntheticFixtures);
  const nearMissExamples = await buildNearMissExampleSnapshots(reviewerQueue.items ?? []);
  const report = buildReport(args, promoted, reviewerQueue, examples, fixtureExamples, nearMissExamples, stage1Index);
  const runListDir = path.join(args.outDir, "run-lists");

  await mkdir(args.outDir, { recursive: true });
  await mkdir(runListDir, { recursive: true });
  await writeJson(path.join(args.outDir, "regulatory-confidence-calibration.json"), report);
  await writeJson(path.join(args.outDir, "regulatory-near-miss-detail.json"), {
    analysisVersion: "wc01.v2_regulatory_near_miss_detail.1",
    generatedAt: report.generatedAt,
    guardrails: report.guardrails,
    summary: {
      nearMissItems: report.summary.nearMissItems,
      classifiedNearMissLanes: report.nearMissDetails.length,
      classifications: report.nearMissDetailSummary,
    },
    details: report.nearMissDetails,
  });
  await writeJson(path.join(args.outDir, "near-miss-rerun-plan.json"), report.rerunPlan);
  await writeJson(path.join(args.outDir, "regulatory-debug-confidence.json"), report.regulatoryDebugConfidence);
  await writeJson(path.join(args.outDir, "regulatory-coverage-area-improvement-review.json"), report.coverageAreaImprovementReview);
  await writeJson(path.join(args.outDir, "coverage-area-follow-up-capture-plan.json"), report.coverageAreaFollowUpCapturePlan);
  await writeJson(path.join(args.outDir, "near-miss-rerun-failures.json"), {
    analysisVersion: "wc01.v2_regulatory_near_miss_rerun_failures.1",
    generatedAt: report.generatedAt,
    guardrails: report.guardrails,
    summary: {
      failures: report.rerunFailures.length,
      failureClasses: topCounts(report.rerunFailures.map((failure) => failure.failureClass), 8),
      failedModules: topCounts(report.rerunFailures.flatMap((failure) => failure.failedModules), 8),
    },
    failures: report.rerunFailures,
  });
  await writeRerunRunLists(runListDir, report.rerunPlan);
  await writeCoverageAreaRunLists(path.join(runListDir, "coverage-area"), report.coverageAreaFollowUpCapturePlan);
  await writeFile(
    path.join(args.outDir, "regulatory-confidence-calibration.md"),
    renderMarkdown(report),
  );
  await writeFile(
    path.join(args.outDir, "regulatory-near-miss-detail.md"),
    renderNearMissMarkdown(report),
  );
  await writeFile(
    path.join(args.outDir, "near-miss-rerun-plan.md"),
    renderRerunPlanMarkdown(report.rerunPlan),
  );
  await writeFile(
    path.join(args.outDir, "regulatory-debug-confidence.md"),
    renderDebugConfidenceMarkdown(report.regulatoryDebugConfidence),
  );
  await writeFile(
    path.join(args.outDir, "regulatory-coverage-area-improvement-review.md"),
    renderCoverageAreaImprovementMarkdown(report.coverageAreaImprovementReview),
  );
  await writeFile(
    path.join(args.outDir, "coverage-area-follow-up-capture-plan.md"),
    renderCoverageAreaCapturePlanMarkdown(report.coverageAreaFollowUpCapturePlan),
  );
  await writeFile(
    path.join(args.outDir, "near-miss-rerun-failures.md"),
    renderRerunFailuresMarkdown(report.rerunFailures),
  );

  console.log(JSON.stringify({
    outDir: args.outDir,
    analyzedExamples: report.summary.analyzedExamples,
    candidateSnapshots: report.summary.candidateSnapshots,
    debugConfidenceGate: report.regulatoryDebugConfidence.gate.status,
    eligibleCandidateSnapshots: report.summary.eligibleCandidateSnapshots,
  }, null, 2));

  if (report.regulatoryDebugConfidence.gate.status !== "pass") {
    throw new Error("Regulatory debug confidence gate failed; see regulatory-debug-confidence.json for details.");
  }
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    help: false,
    outDir: DEFAULT_OUT_DIR,
    stage1Dir: DEFAULT_STAGE1_DIR,
    stage2Dir: DEFAULT_STAGE2_DIR,
    stage3Dir: DEFAULT_STAGE3_DIR,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--stage2-dir") {
      args.stage2Dir = requiredValue(argv, ++index, arg);
    } else if (arg === "--stage1-dir") {
      args.stage1Dir = requiredValue(argv, ++index, arg);
    } else if (arg === "--stage3-dir") {
      args.stage3Dir = requiredValue(argv, ++index, arg);
    } else if (arg === "--out-dir") {
      args.outDir = requiredValue(argv, ++index, arg);
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}\n\n${usage()}`);
    }
  }
  return args;
}

function usage() {
  return [
    "Usage:",
    "  node --import tsx scripts/analyze-v2-regulatory-confidence.ts [--stage1-dir <dir>] [--stage2-dir <dir>] [--out-dir <dir>]",
    "",
    "Recomputes v2 review results from Stage 2 promoted CanonicalEvidenceBundle artifacts and writes",
    "artifact-only confidence and near-miss summaries for GDPR/ePrivacy and CCPA/CPRA diagnostic candidates.",
  ].join("\n");
}

async function readRequiredJson<T>(dir: string, fileName: string): Promise<T> {
  const filePath = path.join(dir, fileName);
  if (!existsSync(filePath)) {
    throw new Error(`Missing required input: ${filePath}`);
  }
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

async function readOptionalJson<T>(dir: string, fileName: string): Promise<T | undefined> {
  const filePath = path.join(dir, fileName);
  if (!existsSync(filePath)) {
    return undefined;
  }
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

async function buildExampleSnapshots(examples: GoldExample[]): Promise<ExampleSnapshot[]> {
  const snapshots: ExampleSnapshot[] = [];
  const seenBundlePaths = new Set<string>();
  const lanesByBundlePath = new Map<string, Set<string>>();
  for (const example of examples) {
    const bundlePath = example.artifactPaths?.canonicalEvidenceBundle;
    if (!bundlePath || !existsSync(bundlePath)) {
      continue;
    }
    const lanes = lanesByBundlePath.get(bundlePath) ?? new Set<string>();
    lanes.add(example.lane ?? "unknown");
    lanesByBundlePath.set(bundlePath, lanes);
  }
  for (const example of examples) {
    const bundlePath = example.artifactPaths?.canonicalEvidenceBundle;
    if (!bundlePath || seenBundlePaths.has(bundlePath) || !existsSync(bundlePath)) {
      continue;
    }
    seenBundlePaths.add(bundlePath);
    const bundle = JSON.parse(await readFile(bundlePath, "utf8"));
    const review = await reviewEvidenceBundle(bundle);
    const debugConfidenceRows = buildDebugConfidenceSnapshots(
      review.regulatoryReview,
      {
        artifactPath: bundlePath,
        domain: example.domain ?? "unknown",
        lane: example.lane ?? "unknown",
        profile: example.profile ?? "unknown",
        url: example.url ?? review.url,
      },
    );
    const candidates = review.findingCandidates
      .filter((candidate) => REGULATORY_FINDING_KEY_SET.has(candidate.findingKey))
      .map((candidate): CandidateSnapshot => ({
        confidence: round(candidate.confidence),
        demotionReasons: candidate.demotionReasons,
        directVsInferred: candidate.directVsInferred,
        eligibilityStatus: candidate.eligibility.status,
        findingKey: candidate.findingKey,
        matchedCriteria: candidate.matchedCriteria,
        missingCorroborators: candidate.missingCorroborators,
        sourceModulesPresent: candidate.sourceModulesPresent,
        sourceModulesRequired: candidate.sourceModulesRequired,
      }));
    snapshots.push({
      artifactPath: bundlePath,
      candidates,
      debugConfidenceRows,
      domain: example.domain ?? "unknown",
      lane: example.lane ?? "unknown",
      lanes: [...(lanesByBundlePath.get(bundlePath) ?? new Set([example.lane ?? "unknown"]))].sort(),
      profile: example.profile ?? "unknown",
      promotionStatus: example.promotionStatus ?? "unknown",
      url: example.url ?? review.url,
    });
  }
  return snapshots;
}

async function buildNearMissExampleSnapshots(items: NonNullable<ReviewerQueue["items"]>): Promise<ExampleSnapshot[]> {
  const examples: GoldExample[] = items
    .filter((item) => item.reviewType === "near_miss_review")
    .map((item) => ({
      artifactPaths: item.artifactPaths,
      domain: item.domain,
      lane: item.lane ?? "near_miss_review",
      profile: item.profile,
      promotionStatus: item.reviewType,
      url: item.url,
    }));
  return buildExampleSnapshots(examples);
}

async function buildFixtureExampleSnapshots(index: SyntheticFixtureIndex | undefined): Promise<ExampleSnapshot[]> {
  const examples: GoldExample[] = (index?.entries ?? [])
    .filter((entry) => entry.status === "pass")
    .filter((entry) => (entry.calibrationRole ?? "positive") === "positive")
    .map((entry) => ({
      artifactPaths: entry.artifactPaths,
      domain: entry.fixtureId ? `fixture:${entry.fixtureId}` : "fixture:unknown",
      lane: entry.lane ?? "synthetic_fixture",
      profile: "synthetic_fixture",
      promotionStatus: "synthetic_fixture",
      url: entry.fixtureId ? `fixture://${entry.fixtureId}` : "fixture://unknown",
    }));
  return buildExampleSnapshots(examples);
}

function buildReport(
  args: Args,
  promoted: PromotedGoldExamples,
  reviewerQueue: ReviewerQueue,
  examples: ExampleSnapshot[],
  fixtureExamples: ExampleSnapshot[],
  nearMissExamples: ExampleSnapshot[],
  stage1Index: Stage1ArtifactIndex | undefined,
): CalibrationReport {
  const candidateSnapshots = examples.flatMap((example) => example.candidates);
  const debugConfidence = buildDebugConfidenceReport(examples);
  const nearMissItems = (reviewerQueue.items ?? []).filter((item) => item.reviewType === "near_miss_review");
  const nearMissDetails = buildNearMissDetails(nearMissItems, nearMissExamples);
  const rerunPlan = buildNearMissRerunPlan(args, nearMissDetails, stage1Index);
  const rerunFailures = buildNearMissRerunFailures(rerunPlan, stage1Index);
  const findingSummaries = buildFindingSummaries(candidateSnapshots);
  const coverageAreaImprovementReview = buildCoverageAreaImprovementReview({
    debugConfidence,
    examples,
    fixtureExamples,
    nearMissDetails,
    rerunFailures,
    stage1Index,
  });
  const coverageAreaFollowUpCapturePlan = buildCoverageAreaFollowUpCapturePlan(args, debugConfidence, stage1Index);
  return {
    analysisVersion: "wc01.v2_regulatory_confidence_calibration.1",
    generatedAt: new Date().toISOString(),
    guardrails: [
      "Internal diagnostic artifact only.",
      "Does not create, persist, or promote WC01 production findings.",
      "Does not emit legal conclusions or customer-facing report copy.",
      "Summaries omit raw cookies, request bodies, query values, and unbounded policy text.",
    ],
    input: {
      promotedExamples: promoted.examples?.length ?? 0,
      reviewerQueueItems: reviewerQueue.items?.length ?? 0,
      stage2Dir: args.stage2Dir,
    },
    summary: {
      analyzedExamples: examples.length,
      candidateSnapshots: candidateSnapshots.length,
      eligibleCandidateSnapshots: candidateSnapshots.filter((candidate) => candidate.eligibilityStatus === "eligible").length,
      nearMissItems: nearMissItems.length,
    },
    findingSummaries,
    laneSummaries: buildLaneSummaries(examples),
    coverageAreaImprovementReview,
    coverageAreaFollowUpCapturePlan,
    nearMissDetails,
    nearMissDetailSummary: topCounts(nearMissDetails.map((detail) => detail.classification), 8),
    nearMissPatterns: topCounts(
      nearMissItems.flatMap((item) => item.missingSignalTags ?? []),
      12,
    ),
    regulatoryDebugConfidence: debugConfidence,
    rerunFailures,
    rerunPlan,
    examples,
  };
}

function buildDebugConfidenceSnapshots(
  regulatoryReview: Awaited<ReturnType<typeof reviewEvidenceBundle>>["regulatoryReview"],
  context: {
    artifactPath: string;
    domain: string;
    lane: string;
    profile: string;
    url: string;
  },
): DebugConfidenceSnapshot[] {
  const checklist = regulatoryReviewToProductionChecklistModel(regulatoryReview);
  const gdprRows = checklist.gdprEprivacyItems.map((item) =>
    debugSnapshotForItem("gdpr_eprivacy", item, context)
  );
  const californiaRows = checklist.californiaPrivacyItems.map((item) =>
    debugSnapshotForItem("california_ccpa_cpra", item, context)
  );
  return [...gdprRows, ...californiaRows];
}

function debugSnapshotForItem(
  area: DebugConfidenceArea,
  item: V2GdprEprivacyChecklistItem | V2CaliforniaPrivacyChecklistItem,
  context: {
    artifactPath: string;
    domain: string;
    lane: string;
    profile: string;
    url: string;
  },
): DebugConfidenceSnapshot {
  const missingSourceSignals = item.criticalEvidence.missingOrIncompleteSourceSignals
    .map((gap) => String(gap.whyNeeded));
  return {
    area,
    artifactPath: context.artifactPath,
    domain: context.domain,
    evidenceState: item.evidenceState,
    firstImprovementSuggestion: item.debugConfidence.improveConfidence[0] ?? "",
    improvementSuggestions: item.debugConfidence.improveConfidence,
    label: item.label,
    lane: context.lane,
    limitationClass: debugLimitationClass(item.debugConfidence.score, missingSourceSignals, item.evidenceRefs),
    missingSourceSignals,
    profile: context.profile,
    rowId: item.id,
    score: item.debugConfidence.score,
    scoreBucket: bucketDebugScore(item.debugConfidence.score),
    status: "statusLabel" in item ? item.statusLabel : item.status,
    url: context.url,
  };
}

function buildDebugConfidenceReport(examples: ExampleSnapshot[]): DebugConfidenceReport {
  const rows = examples.flatMap((example) => example.debugConfidenceRows);
  const gate = buildDebugConfidenceGate(rows);
  return {
    reportVersion: "wc01.v2_regulatory_debug_confidence.1",
    generatedAt: new Date().toISOString(),
    guardrails: [
      "Internal diagnostic artifact only.",
      "Summarizes beta adapter debug confidence only; does not change production report behavior.",
      "Does not create, persist, or promote WC01 production findings.",
      "Does not emit legal conclusions or customer-facing report copy.",
    ],
    gate,
    coverageGapRows: rows
      .filter((row) => row.limitationClass === "scanner_coverage_gap")
      .sort(compareDebugRows),
    lowConfidenceRows: rows
      .filter((row) => row.score <= 3)
      .sort(compareDebugRows)
      .slice(0, 80),
    rowSummaries: buildDebugConfidenceRowSummaries(rows),
    scoreBuckets: countScoreBuckets(rows),
    summary: {
      coverageGapRows: rows.filter((row) => row.limitationClass === "scanner_coverage_gap").length,
      lowConfidenceRows: rows.filter((row) => row.score <= 3).length,
      rawSuggestionRows: rows.filter((row) =>
        row.improvementSuggestions.some((suggestion) => hasRawDebugSuggestionToken(suggestion))
      ).length,
      rows: rows.length,
    },
    topImprovementSuggestions: topCounts(rows.flatMap((row) => row.improvementSuggestions), 20),
  };
}

function buildCoverageAreaImprovementReview(input: {
  debugConfidence: DebugConfidenceReport;
  examples: ExampleSnapshot[];
  fixtureExamples: ExampleSnapshot[];
  nearMissDetails: NearMissDetail[];
  rerunFailures: NearMissRerunFailure[];
  stage1Index: Stage1ArtifactIndex | undefined;
}): CoverageAreaImprovementReview {
  const areas = COVERAGE_AREA_IMPROVEMENT_DEFINITIONS.map((definition) =>
    buildCoverageAreaImprovementArea(definition, input)
  ).sort((left, right) =>
    right.priorityScore - left.priorityScore ||
    left.area.localeCompare(right.area) ||
    left.rowId.localeCompare(right.rowId)
  );
  return {
    reportVersion: "wc01.v2_regulatory_coverage_area_improvement_review.1",
    generatedAt: new Date().toISOString(),
    guardrails: [
      "Internal diagnostic artifact only.",
      "Does not create, persist, or promote WC01 production findings.",
      "Does not change production report behavior or scoring.",
      "Coverage area statuses are calibration workflow labels, not legal conclusions.",
    ],
    areas,
    summary: {
      areas: areas.length,
      statuses: topCounts(areas.map((area) => area.status), 8),
      topPriorityAreas: areas.slice(0, 8).map((area) => ({
        priorityScore: area.priorityScore,
        rowId: area.rowId,
        status: area.status,
      })),
    },
  };
}

function buildCoverageAreaImprovementArea(
  definition: CoverageAreaImprovementDefinition,
  input: {
    debugConfidence: DebugConfidenceReport;
    examples: ExampleSnapshot[];
    fixtureExamples: ExampleSnapshot[];
    nearMissDetails: NearMissDetail[];
    rerunFailures: NearMissRerunFailure[];
    stage1Index: Stage1ArtifactIndex | undefined;
  },
): CoverageAreaImprovementArea {
  const reviewExamples = [...input.examples, ...input.fixtureExamples];
  const laneExamples = reviewExamples.filter((example) =>
    example.lanes.some((lane) => definition.laneAliases.includes(lane))
  );
  const rowScope = laneExamples.length > 0 ? laneExamples : reviewExamples;
  const candidateScope = laneExamples.length > 0 ? laneExamples : reviewExamples;
  const scopedRows = rowScope
    .flatMap((example) => example.debugConfidenceRows)
    .filter((row) => row.area === definition.area && row.rowId === definition.rowId);
  const actionableRows = scopedRows.filter(isActionableCoverageAreaRow);
  const rowSummary = summarizeDebugConfidenceRows(
    actionableRows,
    definition.area,
    definition.rowId,
  );
  const nearMisses = input.nearMissDetails.filter((detail) =>
    definition.laneAliases.includes(detail.lane)
  );
  const rerunFailures = input.rerunFailures.filter((failure) =>
    failure.lanes.some((lane) => definition.laneAliases.includes(lane))
  );
  const findingSummaries = buildFindingSummaries(
    candidateScope
      .flatMap((example) => example.candidates)
      .filter((candidate) => definition.findingKeys.includes(candidate.findingKey))
  );
  const coverageGapRows = rowSummary?.coverageGapRows ?? 0;
  const actionableCoverageGapRows = actionableRows
    .filter((row) => row.limitationClass === "scanner_coverage_gap")
    .filter((row) => !hasCompletedCoverageAreaProfile(row, followUpProfileForCoverageGap(row), input.stage1Index))
    .length;
  const lowConfidenceRows = rowSummary?.lowConfidenceRows ?? 0;
  const totalRows = rowSummary?.totalRows ?? 0;
  const nearMissClassifications = topCounts(nearMisses.map((detail) => detail.classification), 8);
  const status = coverageAreaStatus({
    coverageGapRows: actionableCoverageGapRows,
    lowConfidenceRows,
    medianDebugConfidence: rowSummary?.medianScore ?? 0,
    nearMissClassifications,
    rerunFailures: rerunFailures.length,
    totalRows,
  });
  const dominantBlocker = coverageAreaDominantBlocker(status, nearMissClassifications, rerunFailures.length);
  const priorityScore = coverageAreaPriorityScore({
    coverageGapRows,
    lowConfidenceRows,
    nearMisses: nearMisses.length,
    rerunFailures: rerunFailures.length,
    totalRows,
  });

  return {
    area: definition.area,
    attributesChecked: definition.attributesChecked,
    dominantBlocker,
    exitCriteria: definition.exitCriteria,
    findingKeys: definition.findingKeys,
    laneAliases: definition.laneAliases,
    metrics: {
      coverageGapRows,
      lowConfidenceRows,
      medianDebugConfidence: rowSummary?.medianScore ?? 0,
      nearMissClassifications,
      residualRerunFailures: rerunFailures.length,
      totalRows,
    },
    nextAction: coverageAreaNextAction(definition, status, dominantBlocker),
    priorityScore,
    rowId: definition.rowId,
    status,
    topDemotionReasons: topCounts(findingSummaries.flatMap((summary) =>
      summary.topDemotionReasons.flatMap((entry) => Array.from({ length: entry.count }, () => entry.value))
    ), 8),
    topImprovementSuggestions: rowSummary?.topImprovementSuggestions ?? [],
    topMatchedCriteria: topCounts(findingSummaries.flatMap((summary) =>
      summary.topMatchedCriteria.flatMap((entry) => Array.from({ length: entry.count }, () => entry.value))
    ), 8),
    topMissingCorroborators: topCounts(findingSummaries.flatMap((summary) =>
      summary.topMissingCorroborators.flatMap((entry) => Array.from({ length: entry.count }, () => entry.value))
    ), 8),
  };
}

function isActionableCoverageAreaRow(row: DebugConfidenceSnapshot) {
  return !isCleanNotTestableControlRow(row);
}

function isCleanNotTestableControlRow(row: DebugConfidenceSnapshot) {
  return row.status === "Not testable" &&
    row.missingSourceSignals.length === 0 &&
    row.limitationClass !== "scanner_coverage_gap";
}

function buildCoverageAreaFollowUpCapturePlan(
  args: Args,
  debugConfidence: DebugConfidenceReport,
  stage1Index: Stage1ArtifactIndex | undefined,
): CoverageAreaFollowUpCapturePlan {
  const rowIds = new Set(COVERAGE_AREA_IMPROVEMENT_DEFINITIONS.map((definition) => definition.rowId));
  const coverageGapRows = debugConfidence.coverageGapRows
    .filter((row) => rowIds.has(row.rowId))
    .filter((row) => {
      const recommendedProfile = followUpProfileForCoverageGap(row);
      return !hasCompletedCoverageAreaProfile(row, recommendedProfile, stage1Index);
    });
  const targetByKey = new Map<string, CoverageAreaFollowUpCaptureTarget>();
  for (const row of coverageGapRows) {
    const recommendedProfile = followUpProfileForCoverageGap(row);
    const key = `${row.rowId}\t${recommendedProfile}\t${row.url}`;
    if (targetByKey.has(key)) {
      continue;
    }
    targetByKey.set(key, {
      area: row.area,
      artifactPath: row.artifactPath,
      currentProfile: row.profile,
      domain: row.domain,
      reason: row.firstImprovementSuggestion,
      recommendedProfile,
      rowId: row.rowId,
      url: row.url,
    });
  }

  const targets = [...targetByKey.values()].sort((left, right) =>
    left.recommendedProfile.localeCompare(right.recommendedProfile) ||
    left.rowId.localeCompare(right.rowId) ||
    left.domain.localeCompare(right.domain) ||
    left.url.localeCompare(right.url)
  );
  const profiles = unique(targets.map((target) => target.recommendedProfile)).sort();
  const runLists: CoverageAreaFollowUpCapturePlan["runLists"] = {};
  for (const profile of profiles) {
    const urls = unique(targets
      .filter((target) => target.recommendedProfile === profile)
      .map((target) => target.url)).sort();
    const listPath = path.join(args.outDir, "run-lists", "coverage-area", `${profile}-coverage-area-follow-up.urls.txt`);
    runLists[profile] = {
      command: `pnpm v2:wc01-scan-lab-cohort --urls ${listPath} --profile ${profile} --resume --out-dir ${path.join("artifacts", "gold-corpus", "v2-20260613-stage1", "runs", `${profile}-coverage-area-follow-up`)}`,
      path: listPath,
      profile,
      urls,
    };
  }

  return {
    planVersion: "wc01.v2_regulatory_coverage_area_follow_up_capture_plan.1",
    generatedAt: new Date().toISOString(),
    guardrails: [
      "Internal diagnostic artifact only.",
      "Does not run live scans by itself.",
      "Does not create, persist, or promote WC01 production findings.",
      "Use only for bounded v2 coverage-area capture improvement.",
    ],
    runLists,
    summary: {
      coverageGapRows: coverageGapRows.length,
      plannedRuns: targets.length,
      profiles: topCounts(targets.map((target) => target.recommendedProfile), 8),
      rows: topCounts(targets.map((target) => target.rowId), 12),
      urls: new Set(targets.map((target) => target.url)).size,
    },
    targets,
  };
}

function hasCompletedCoverageAreaProfile(
  row: DebugConfidenceSnapshot,
  recommendedProfile: string,
  stage1Index: Stage1ArtifactIndex | undefined,
) {
  const coverageRecord = stage1Index?.latestByTargetProfile?.find((record) =>
    record.domain === row.domain &&
    record.scanProfile === recommendedProfile &&
    record.scanStatus === "completed"
  );
  if (!coverageRecord) {
    return false;
  }
  const knownLimitations = coverageRecord.knownLimitations ?? [];
  const requiredModules = requiredModulesForCoverageAreaFollowUp(row.rowId, recommendedProfile);
  return requiredModules.every((moduleName) =>
    !knownLimitations.includes(`${moduleName}:failed`) &&
    !knownLimitations.includes(`${moduleName}:not_run`)
  );
}

function requiredModulesForCoverageAreaFollowUp(rowId: string, recommendedProfile: string) {
  if (recommendedProfile === "policy") {
    return ["policySurfaceScanner"];
  }
  if (recommendedProfile === "consent") {
    return ["consentFlowRuntimeScanner"];
  }
  if (rowId === "policy_runtime_vendor_alignment_review") {
    return ["preConsentRuntimeScanner", "policySurfaceScanner"];
  }
  if (rowId === "gpc_opt_out_signal_handling") {
    return ["consentFlowRuntimeScanner", "policySurfaceScanner"];
  }
  if (rowId === "post_opt_out_tracking_behavior" || rowId === "post_reject_tracking_reduction") {
    return ["consentFlowRuntimeScanner"];
  }
  if (rowId === "targeted_advertising_signals") {
    return ["preConsentRuntimeScanner"];
  }
  return ["preConsentRuntimeScanner", "consentFlowRuntimeScanner", "policySurfaceScanner"];
}

function followUpProfileForCoverageGap(row: DebugConfidenceSnapshot) {
  if (row.rowId === "reject_all_path_availability" || row.rowId === "post_reject_tracking_reduction") {
    return "consent";
  }
  if (
    row.rowId === "gpc_opt_out_signal_handling" ||
    row.rowId === "post_opt_out_tracking_behavior" ||
    row.rowId === "policy_runtime_vendor_alignment_review" ||
    row.rowId === "targeted_advertising_signals"
  ) {
    return "full";
  }
  if (
    row.rowId === "cookie_notice_availability" ||
    row.rowId === "do_not_sell_share_availability" ||
    row.rowId === "notice_at_collection"
  ) {
    return "policy";
  }
  if (row.improvementSuggestions.some((suggestion) => /consent-flow|reject|post-choice/i.test(suggestion))) {
    return "consent";
  }
  if (row.improvementSuggestions.some((suggestion) => /runtime|tracking|request|vendor/i.test(suggestion))) {
    return "full";
  }
  return "policy";
}

type CoverageAreaImprovementDefinition = {
  area: DebugConfidenceArea;
  attributesChecked: string[];
  exitCriteria: string[];
  findingKeys: string[];
  laneAliases: string[];
  rowId: string;
};

const COVERAGE_AREA_IMPROVEMENT_DEFINITIONS: CoverageAreaImprovementDefinition[] = [
  {
    area: "california_ccpa_cpra",
    attributesChecked: [
      "policy GPC disclosure retained",
      "GPC-enabled runtime probe retained",
      "post-signal request/cookie behavior comparable",
      "direct signal evidence retained without legal conclusion",
    ],
    exitCriteria: [
      "Policy disclosure and runtime probe are represented separately when confidence is high.",
      "Rows without one side remain coverage-missing or weak evidence.",
      "No GPC row emits raw suggestion tokens or production eligibility.",
    ],
    findingKeys: ["gpc_disclosure_observed", "gpc_runtime_probe_with_disclosure_observed"],
    laneAliases: ["gpc_opt_out_signal_handling"],
    rowId: "gpc_opt_out_signal_handling",
  },
  {
    area: "gdpr_eprivacy",
    attributesChecked: [
      "policySurfaceScanner coverage",
      "bounded policy/vendor mention excerpt retained",
      "runtime vendors resolved through canonical resolver",
      "mismatch remains review-only",
    ],
    exitCriteria: [
      "Policy and runtime modules both ran for reviewed examples.",
      "Bounded vendor mention evidence and runtime vendor refs are retained.",
      "No raw vendor registry shortcuts or production gap mapping.",
    ],
    findingKeys: ["policy_runtime_vendor_alignment_review_signal"],
    laneAliases: ["policy_runtime_vendor_alignment_review"],
    rowId: "policy_runtime_vendor_alignment_review",
  },
  {
    area: "california_ccpa_cpra",
    attributesChecked: [
      "collection-context page identified",
      "notice/disclosure near data-entry surface retained",
      "generic policy mention remains lower confidence",
      "bounded text/link/screenshot evidence retained",
    ],
    exitCriteria: [
      "Generic policy-only mentions remain demoted.",
      "Contextual notice-at-collection surfaces have bounded evidence refs.",
      "No legal applicability conclusion is emitted.",
    ],
    findingKeys: ["notice_at_collection_observed"],
    laneAliases: ["notice_at_collection"],
    rowId: "notice_at_collection",
  },
  {
    area: "california_ccpa_cpra",
    attributesChecked: [
      "opt-out or GPC action proof retained",
      "before/after runtime snapshots comparable",
      "post-choice timing retained",
      "advertising-purpose vendors classified",
    ],
    exitCriteria: [
      "Post-opt-out rows require direct opt-out/GPC proof.",
      "Comparisons require comparable measurement metadata.",
      "Persistence/suppression remains review signal only.",
    ],
    findingKeys: ["post_opt_out_targeted_advertising_behavior_signal"],
    laneAliases: ["post_opt_out_tracking_behavior"],
    rowId: "post_opt_out_tracking_behavior",
  },
  {
    area: "california_ccpa_cpra",
    attributesChecked: [
      "policySurfaceScanner coverage",
      "explicit Do Not Sell/Share or privacy choices path retained",
      "link text and URL retained",
      "sale/share or targeted advertising context retained",
    ],
    exitCriteria: [
      "Generic privacy link alone does not qualify as strong evidence.",
      "Privacy Choices needs sale/share context or policy corroboration.",
      "Bounded opt-out path refs are retained.",
    ],
    findingKeys: ["do_not_sell_or_share_link_observed"],
    laneAliases: ["ccpa_cpra_do_not_sell_or_share_availability"],
    rowId: "do_not_sell_share_availability",
  },
  {
    area: "gdpr_eprivacy",
    attributesChecked: [
      "policySurfaceScanner coverage",
      "cookie notice or cookie policy surface retained",
      "bounded cookie-use excerpt retained",
      "URL/link text retained",
    ],
    exitCriteria: [
      "Generic privacy policy cookie mentions remain lower confidence.",
      "Cookie-specific notice/policy evidence has bounded refs.",
      "No raw policy text is copied into diagnostic artifacts.",
    ],
    findingKeys: ["cookie_policy_observed_or_not_observed"],
    laneAliases: ["cookie_notice_availability"],
    rowId: "cookie_notice_availability",
  },
  {
    area: "gdpr_eprivacy",
    attributesChecked: [
      "consent surface observed",
      "visible reject/decline control retained",
      "reject path reachability retained",
      "successful interaction or explicit not-testable reason retained",
    ],
    exitCriteria: [
      "Weak reject candidates remain demoted.",
      "Preference-center reject paths require traversal proof.",
      "Completed reject action proof is retained before confidence increases.",
    ],
    findingKeys: ["reject_control_observed_or_not_observed", "reject_action_succeeded_or_not_testable"],
    laneAliases: ["reject_decline_option_availability"],
    rowId: "reject_all_path_availability",
  },
  {
    area: "gdpr_eprivacy",
    attributesChecked: [
      "successful reject action proof retained",
      "before/after reject runtime comparison retained",
      "comparison windows comparable",
      "persisted vendors/cookies classified",
    ],
    exitCriteria: [
      "Post-reject persistence requires confident successful reject comparison.",
      "Delta-only/no-action-proof rows remain not testable or weak evidence.",
      "Rows stay review-only and do not become production gaps.",
    ],
    findingKeys: [
      "tracking_after_refusal_review_signal",
      "reject_did_not_reduce_tracking_review_signal",
      "vendors_persist_after_reject_review_signal",
      "cookies_persist_after_reject_review_signal",
    ],
    laneAliases: ["tracking_after_refusal"],
    rowId: "post_reject_tracking_reduction",
  },
  {
    area: "california_ccpa_cpra",
    attributesChecked: [
      "advertising-purpose runtime evidence retained",
      "vendor attribution resolved",
      "third-party request evidence directness",
      "diagnostic-only vendors suppressed where appropriate",
    ],
    exitCriteria: [
      "Advertising-purpose signals have direct runtime evidence.",
      "Evidence-absent rows remain not observed or weak evidence.",
      "No tag-management-only support becomes a target advertising signal.",
    ],
    findingKeys: ["targeted_advertising_runtime_signal"],
    laneAliases: ["targeted_advertising_signals"],
    rowId: "targeted_advertising_signals",
  },
];

function coverageAreaStatus(input: {
  coverageGapRows: number;
  lowConfidenceRows: number;
  medianDebugConfidence: number;
  nearMissClassifications: CountEntry[];
  rerunFailures: number;
  totalRows: number;
}): CoverageAreaImprovementStatus {
  const moduleNotRun = input.nearMissClassifications.find((entry) => entry.value === "module_not_run")?.count ?? 0;
  const evidenceAbsent = input.nearMissClassifications.find((entry) => entry.value === "evidence_absent")?.count ?? 0;
  const weakEvidence = input.nearMissClassifications.find((entry) => entry.value === "weak_evidence")?.count ?? 0;
  const coverageGapRate = input.coverageGapRows / Math.max(1, input.totalRows);
  if (input.rerunFailures > 0 || coverageGapRate >= 0.25 || (input.coverageGapRows > 0 && moduleNotRun > evidenceAbsent)) {
    return "needs_follow_up_capture";
  }
  if (
    input.totalRows > 0 &&
    input.coverageGapRows === 0 &&
    input.lowConfidenceRows === 0 &&
    input.rerunFailures === 0 &&
    input.medianDebugConfidence >= 7
  ) {
    return "ready_for_monitoring";
  }
  if (evidenceAbsent > 0 || input.lowConfidenceRows > Math.max(1, Math.floor(input.totalRows * 0.25))) {
    return "needs_evidence_contract";
  }
  if (weakEvidence > 0 || input.lowConfidenceRows > 0) {
    return "needs_threshold_or_fixture_review";
  }
  return "ready_for_monitoring";
}

function coverageAreaDominantBlocker(
  status: CoverageAreaImprovementStatus,
  nearMissClassifications: CountEntry[],
  rerunFailures: number,
) {
  if (rerunFailures > 0) {
    return "latest module rerun still failed";
  }
  const topNearMiss = nearMissClassifications[0]?.value;
  if (status === "needs_follow_up_capture") {
    return topNearMiss === "module_not_run" ? "required scanner module did not run" : "scanner coverage gaps remain";
  }
  if (status === "needs_evidence_contract") {
    return topNearMiss === "evidence_absent" ? "required evidence is absent from retained artifacts" : "low-confidence evidence needs stronger retained context";
  }
  if (status === "needs_threshold_or_fixture_review") {
    return "weak evidence needs threshold or fixture review";
  }
  return "meets current internal diagnostic monitoring criteria";
}

function coverageAreaNextAction(
  definition: CoverageAreaImprovementDefinition,
  status: CoverageAreaImprovementStatus,
  dominantBlocker: string,
) {
  if (status === "needs_follow_up_capture") {
    if (definition.rowId === "gpc_opt_out_signal_handling") {
      return "Run full follow-up captures when both GPC disclosure and runtime probe coverage are missing; otherwise use policy for disclosure-only gaps or consent/full for runtime probe gaps.";
    }
    if (/policy/i.test(dominantBlocker) || definition.findingKeys.some((key) =>
      /policy|privacy_notice|cookie_policy|do_not_sell|gpc_disclosure|notice_at_collection/i.test(key)
    )) {
      return "Run targeted policy/full follow-up captures, then verify bounded policy-surface evidence.";
    }
    if (definition.findingKeys.some((key) => /reject|tracking_after|post_opt_out|gpc_runtime/i.test(key))) {
      return "Run consent/full follow-up captures, then verify retained interaction and comparison evidence.";
    }
    return "Run the narrowest scan profile that covers the missing source module.";
  }
  if (status === "needs_evidence_contract") {
    return "Inspect retained artifacts and add fixture-backed evidence contract improvements for absent source context.";
  }
  if (status === "needs_threshold_or_fixture_review") {
    return "Add or update deterministic fixtures and keep weak candidates demoted until evidence is direct enough.";
  }
  return "Keep monitoring this lane in the calibration artifact; no immediate implementation change required.";
}

function coverageAreaPriorityScore(input: {
  coverageGapRows: number;
  lowConfidenceRows: number;
  nearMisses: number;
  rerunFailures: number;
  totalRows: number;
}) {
  const total = Math.max(1, input.totalRows);
  return round(
    (input.coverageGapRows / total) * 45 +
    (input.lowConfidenceRows / total) * 35 +
    input.nearMisses * 2 +
    input.rerunFailures * 8,
  );
}

function buildDebugConfidenceGate(rows: DebugConfidenceSnapshot[]): DebugConfidenceGate {
  const checks: DebugConfidenceGate["checks"] = [];
  const rawRows = rows.filter((row) =>
    row.improvementSuggestions.some((suggestion) => hasRawDebugSuggestionToken(suggestion))
  );
  checks.push({
    detail: rawRows.length === 0
      ? "No raw scanner-module or missing-source tokens appeared in debug confidence suggestions."
      : rawRows.slice(0, 8).map((row) => `${row.rowId}@${row.domain}`).join(", "),
    name: "debug_suggestions_display_safe",
    status: rawRows.length === 0 ? "pass" : "fail",
  });

  for (const expectation of DEBUG_CONFIDENCE_ROW_EXPECTATIONS) {
    const matchingRows = rows.filter((row) =>
      row.rowId === expectation.rowId &&
      row.limitationClass === "scanner_coverage_gap"
    );
    const failingRows = matchingRows.filter((row) =>
      !row.improvementSuggestions.some((suggestion) =>
        expectation.expectedSuggestions.includes(suggestion)
      )
    );
    checks.push({
      detail: matchingRows.length === 0
        ? `No scanner-coverage-gap rows observed for ${expectation.rowId}; gate is vacuously satisfied for this corpus run.`
        : failingRows.length === 0
          ? `${matchingRows.length} scanner-coverage-gap rows used the row-aware suggestion.`
          : failingRows.slice(0, 8).map((row) => `${row.rowId}@${row.domain}:${row.firstImprovementSuggestion}`).join(", "),
      name: `${expectation.rowId}_row_aware_coverage_suggestion`,
      status: failingRows.length === 0 ? "pass" : "fail",
    });
  }

  return {
    checks,
    status: checks.every((check) => check.status === "pass") ? "pass" : "fail",
  };
}

const DEBUG_CONFIDENCE_ROW_EXPECTATIONS: Array<{
  expectedSuggestions: string[];
  rowId: string;
}> = [
  {
    expectedSuggestions: ["Run policy-surface coverage for cookie notice or cookie policy evidence"],
    rowId: "cookie_notice_availability",
  },
  {
    expectedSuggestions: ["Use internal retained/replay review for reject/decline path evidence"],
    rowId: "reject_all_path_availability",
  },
  {
    expectedSuggestions: ["Run policy-surface coverage for sale/share opt-out evidence"],
    rowId: "do_not_sell_share_availability",
  },
  {
    expectedSuggestions: [
      "Run policy-surface coverage for GPC disclosure evidence",
      "Run GPC-enabled runtime coverage for opt-out signal handling",
    ],
    rowId: "gpc_opt_out_signal_handling",
  },
];

function buildDebugConfidenceRowSummaries(rows: DebugConfidenceSnapshot[]): DebugConfidenceRowSummary[] {
  const rowKeys = unique(rows.map((row) => `${row.area}\t${row.rowId}`)).sort();
  return rowKeys.map((key) => {
    const [area, rowId] = key.split("\t") as [DebugConfidenceArea, string];
    const matchingRows = rows.filter((row) => row.area === area && row.rowId === rowId);
    return summarizeDebugConfidenceRows(matchingRows, area, rowId);
  });
}

function summarizeDebugConfidenceRows(
  rows: DebugConfidenceSnapshot[],
  area: DebugConfidenceArea,
  rowId: string,
): DebugConfidenceRowSummary {
  const scores = rows.map((row) => row.score).sort((left, right) => left - right);
  return {
    area,
    averageScore: round(average(scores)),
    coverageGapRows: rows.filter((row) => row.limitationClass === "scanner_coverage_gap").length,
    lowConfidenceRows: rows.filter((row) => row.score <= 3).length,
    medianScore: round(median(scores)),
    rowId,
    scoreBuckets: countScoreBuckets(rows),
    statuses: topCounts(rows.map((row) => row.status), 8),
    topImprovementSuggestions: topCounts(rows.flatMap((row) => row.improvementSuggestions), 8),
    totalRows: rows.length,
  };
}

function debugLimitationClass(
  score: number,
  missingSourceSignals: string[],
  evidenceRefs: string[],
): DebugConfidenceSnapshot["limitationClass"] {
  if (missingSourceSignals.some((signal) =>
    /policysurfacescanner|consentflowruntimescanner|preconsentruntimescanner|scanner did not run|required_source_module_not_run/i.test(signal)
  )) {
    return "scanner_coverage_gap";
  }
  if (evidenceRefs.length === 0) {
    return "missing_source_evidence";
  }
  if (score <= 6 || missingSourceSignals.length > 0) {
    return "weak_or_incomplete_evidence";
  }
  return "sufficient_for_debug";
}

function bucketDebugScore(score: number) {
  if (score <= 2) {
    return "1-2";
  }
  if (score <= 4) {
    return "3-4";
  }
  if (score <= 6) {
    return "5-6";
  }
  if (score <= 8) {
    return "7-8";
  }
  return "9-10";
}

function countScoreBuckets(rows: DebugConfidenceSnapshot[]) {
  const buckets: Record<string, number> = {
    "1-2": 0,
    "3-4": 0,
    "5-6": 0,
    "7-8": 0,
    "9-10": 0,
  };
  for (const row of rows) {
    buckets[row.scoreBucket] += 1;
  }
  return buckets;
}

function hasRawDebugSuggestionToken(value: string) {
  return (
    /required_source_module_not_run/.test(value) ||
    /required .*module .*not run/i.test(value) ||
    /policySurfaceScanner|consentFlowRuntimeScanner|preConsentRuntimeScanner/.test(value) ||
    /[a-z]+_[a-z]+_[a-z]+/.test(value)
  );
}

function compareDebugRows(left: DebugConfidenceSnapshot, right: DebugConfidenceSnapshot) {
  return (
    left.score - right.score ||
    left.area.localeCompare(right.area) ||
    left.rowId.localeCompare(right.rowId) ||
    left.domain.localeCompare(right.domain) ||
    left.profile.localeCompare(right.profile)
  );
}

function buildNearMissDetails(
  nearMissItems: NonNullable<ReviewerQueue["items"]>,
  promotedExamples: ExampleSnapshot[],
): NearMissDetail[] {
  const promotedByArtifactPath = new Map(promotedExamples.map((example) => [example.artifactPath, example]));
  const details: NearMissDetail[] = [];
  for (const item of nearMissItems) {
    const artifactPath = item.artifactPaths?.canonicalEvidenceBundle;
    if (!artifactPath) {
      continue;
    }
    const matchingExample = promotedByArtifactPath.get(artifactPath);
    if (!matchingExample) {
      continue;
    }
    for (const lane of item.missingSignalTags ?? []) {
      const findingKeys = LANE_FINDING_KEYS[lane] ?? [];
      const relevantCandidates = matchingExample.candidates.filter((candidate) =>
        findingKeys.includes(candidate.findingKey)
      );
      details.push({
        artifactPath,
        classification: classifyNearMiss(relevantCandidates),
        domain: item.domain ?? matchingExample.domain,
        lane,
        missingModules: missingModulesForCandidates(relevantCandidates),
        profile: item.profile ?? matchingExample.profile,
        relevantCandidates,
        reviewReason: Array.isArray(item.reason) ? item.reason : item.reason ? [item.reason] : [],
        url: item.url ?? matchingExample.url,
      });
    }
  }
  return details.sort((left, right) =>
    left.classification.localeCompare(right.classification) ||
    left.lane.localeCompare(right.lane) ||
    left.domain.localeCompare(right.domain) ||
    left.profile.localeCompare(right.profile)
  );
}

function classifyNearMiss(
  candidates: CandidateSnapshot[],
): NearMissDetail["classification"] {
  if (candidates.length === 0) {
    return "evidence_absent";
  }
  if (candidates.some((candidate) =>
    candidate.sourceModulesRequired.some((requiredModule) => !candidate.sourceModulesPresent.includes(requiredModule)) ||
    candidate.eligibilityStatus === "deferred"
  )) {
    return "module_not_run";
  }
  if (candidates.some((candidate) =>
    candidate.eligibilityStatus === "eligible" &&
    candidate.confidence >= 0.7 &&
    (candidate.missingCorroborators.length > 0 || candidate.demotionReasons.length > 0)
  )) {
    return "likely_calibratable";
  }
  if (candidates.some((candidate) =>
    candidate.confidence >= 0.5 || candidate.matchedCriteria.length > 0 || candidate.eligibilityStatus === "eligible"
  )) {
    return "weak_evidence";
  }
  return "evidence_absent";
}

function missingModulesForCandidates(candidates: CandidateSnapshot[]) {
  return unique(candidates.flatMap((candidate) =>
    candidate.sourceModulesRequired.filter((requiredModule) =>
      !candidate.sourceModulesPresent.includes(requiredModule)
    )
  )).sort();
}

function buildNearMissRerunPlan(
  args: Args,
  details: NearMissDetail[],
  stage1Index: Stage1ArtifactIndex | undefined,
): NearMissRerunPlan {
  const targetByKey = new Map<string, NearMissRerunTarget>();
  const rerunnableDetails = details.filter((detail) =>
    detail.classification === "module_not_run" &&
    detail.missingModules.length > 0 &&
    (RERUN_PLAN_TARGET_LANES as readonly string[]).includes(detail.lane) &&
    !hasCompletedModuleCoverage(detail, stage1Index)
  );

  for (const detail of rerunnableDetails) {
    const profile = rerunProfileForMissingModules(detail.missingModules);
    const key = `${profile}\t${detail.url}`;
    const existing = targetByKey.get(key);
    if (existing) {
      existing.lanes = unique([...existing.lanes, detail.lane]).sort();
      existing.missingModules = unique([...existing.missingModules, ...detail.missingModules]).sort();
      existing.sourceArtifacts = unique([...existing.sourceArtifacts, detail.artifactPath]).sort();
      continue;
    }
    targetByKey.set(key, {
      domain: detail.domain,
      lanes: [detail.lane],
      missingModules: detail.missingModules,
      profile,
      sourceArtifacts: [detail.artifactPath],
      url: detail.url,
    });
  }

  const targets = [...targetByKey.values()].sort((left, right) =>
    left.profile.localeCompare(right.profile) ||
    left.domain.localeCompare(right.domain) ||
    left.url.localeCompare(right.url)
  );
  const profiles = unique(targets.map((target) => target.profile)).sort();
  const runLists: NearMissRerunPlan["runLists"] = {};
  for (const profile of profiles) {
    const urls = unique(targets
      .filter((target) => target.profile === profile)
      .map((target) => target.url)).sort();
    const listPath = path.join(args.outDir, "run-lists", `${runListSlugForProfile(profile)}.urls.txt`);
    runLists[profile] = {
      command: `pnpm v2:wc01-scan-lab-cohort --urls ${listPath} --profile ${profile} --resume --out-dir ${path.join("artifacts", "gold-corpus", "v2-20260613-stage1", "runs", `${profile}-near-miss-rerun`)}`,
      path: listPath,
      profile,
      urls,
    };
  }

  return {
    planVersion: "wc01.v2_regulatory_near_miss_rerun_plan.1",
    generatedAt: new Date().toISOString(),
    guardrails: [
      "Internal diagnostic artifact only.",
      "Does not run live scans by itself.",
      "Does not create, persist, or promote WC01 production findings.",
      "Use only for bounded v2 corpus coverage capture.",
    ],
    runLists,
    summary: {
      lanes: topCounts(targets.flatMap((target) => target.lanes), 12),
      plannedRuns: targets.length,
      profiles: topCounts(targets.map((target) => target.profile), 8),
      sourceNearMissLanes: rerunnableDetails.length,
      urls: new Set(targets.map((target) => target.url)).size,
    },
    targets,
  };
}

function hasCompletedModuleCoverage(
  detail: NearMissDetail,
  stage1Index: Stage1ArtifactIndex | undefined,
) {
  const profile = rerunProfileForMissingModules(detail.missingModules);
  const coverageRecord = stage1Index?.latestByTargetProfile?.find((record) =>
    record.domain === detail.domain &&
    record.scanProfile === profile &&
    record.scanStatus === "completed"
  );
  if (!coverageRecord) {
    return false;
  }
  const knownLimitations = coverageRecord.knownLimitations ?? [];
  return detail.missingModules.every((moduleName) =>
    !knownLimitations.includes(`${moduleName}:failed`)
  );
}

function buildNearMissRerunFailures(
  plan: NearMissRerunPlan,
  stage1Index: Stage1ArtifactIndex | undefined,
): NearMissRerunFailure[] {
  return plan.targets.map((target) => {
    const coverageRecord = stage1Index?.latestByTargetProfile?.find((record) =>
      record.domain === target.domain &&
      record.scanProfile === target.profile &&
      record.scanStatus === "completed"
    );
    const knownLimitations = coverageRecord?.knownLimitations ?? [];
    const failedModules = target.missingModules.filter((moduleName) =>
      knownLimitations.includes(`${moduleName}:failed`)
    );
    return {
      domain: target.domain,
      failedModules: failedModules.length > 0 ? failedModules : target.missingModules,
      failureClass: failedModules.length > 0 ? "latest_module_failed" : "coverage_not_attempted",
      lanes: target.lanes,
      latestArtifactPath: coverageRecord?.artifactPaths?.canonicalEvidenceBundle,
      profile: target.profile,
      url: target.url,
    };
  });
}

function rerunProfileForMissingModules(missingModules: string[]) {
  const needsConsent = missingModules.includes("consentFlowRuntimeScanner");
  const needsPolicy = missingModules.includes("policySurfaceScanner");
  if (needsConsent && needsPolicy) {
    return "full";
  }
  if (needsConsent) {
    return "consent";
  }
  if (needsPolicy) {
    return "policy";
  }
  return "full";
}

function runListSlugForProfile(profile: string) {
  if (profile === "policy") {
    return "policy-surface-near-miss";
  }
  if (profile === "consent") {
    return "consent-flow-near-miss";
  }
  return `${profile}-near-miss`;
}

function buildFindingSummaries(candidates: CandidateSnapshot[]): FindingSummary[] {
  return REGULATORY_FINDING_KEYS.map((findingKey) => {
    const matching = candidates.filter((candidate) => candidate.findingKey === findingKey);
    const confidences = matching.map((candidate) => candidate.confidence).sort((left, right) => left - right);
    return {
      averageConfidence: round(average(confidences)),
      buckets: bucketConfidences(confidences),
      eligible: matching.filter((candidate) => candidate.eligibilityStatus === "eligible").length,
      findingKey,
      maxConfidence: round(confidences.at(-1) ?? 0),
      medianConfidence: round(median(confidences)),
      minConfidence: round(confidences[0] ?? 0),
      notEligible: matching.filter((candidate) => candidate.eligibilityStatus !== "eligible").length,
      observed: matching.length,
      topDemotionReasons: topCounts(matching.flatMap((candidate) => candidate.demotionReasons), 8),
      topMatchedCriteria: topCounts(matching.flatMap((candidate) => candidate.matchedCriteria), 8),
      topMissingCorroborators: topCounts(matching.flatMap((candidate) => candidate.missingCorroborators), 8),
    };
  });
}

function buildLaneSummaries(examples: ExampleSnapshot[]): LaneSummary[] {
  const lanes = [...new Set(examples.map((example) => example.lane))].sort();
  return lanes.map((lane) => {
    const matching = examples.filter((example) => example.lane === lane);
    const maxConfidences = matching
      .map((example) => Math.max(0, ...example.candidates.map((candidate) => candidate.confidence)))
      .sort((left, right) => left - right);
    return {
      averageMaxConfidence: round(average(maxConfidences)),
      candidateExamples: matching.length,
      lane,
      maxConfidence: round(maxConfidences.at(-1) ?? 0),
      medianMaxConfidence: round(median(maxConfidences)),
      minMaxConfidence: round(maxConfidences[0] ?? 0),
    };
  });
}

function bucketConfidences(confidences: number[]) {
  const buckets: Record<string, number> = {
    "0.00-0.24": 0,
    "0.25-0.49": 0,
    "0.50-0.69": 0,
    "0.70-0.84": 0,
    "0.85-1.00": 0,
  };
  for (const confidence of confidences) {
    if (confidence < 0.25) {
      buckets["0.00-0.24"] += 1;
    } else if (confidence < 0.5) {
      buckets["0.25-0.49"] += 1;
    } else if (confidence < 0.7) {
      buckets["0.50-0.69"] += 1;
    } else if (confidence < 0.85) {
      buckets["0.70-0.84"] += 1;
    } else {
      buckets["0.85-1.00"] += 1;
    }
  }
  return buckets;
}

function topCounts(values: string[], limit: number): CountEntry[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([value, count]) => ({ count, value }));
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]) {
  if (values.length === 0) {
    return 0;
  }
  return values[Math.floor(values.length / 2)] ?? 0;
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}

async function writeJson(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeRerunRunLists(runListDir: string, plan: NearMissRerunPlan) {
  const expectedFiles = [
    "consent-flow-near-miss.urls.txt",
    "full-near-miss.urls.txt",
    "policy-surface-near-miss.urls.txt",
  ].map((fileName) => path.join(runListDir, fileName));
  const staleFiles = [
    "consent-near-miss.urls.txt",
    "policy-near-miss.urls.txt",
  ].map((fileName) => path.join(runListDir, fileName));
  for (const filePath of staleFiles) {
    await unlink(filePath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") {
        throw error;
      }
    });
  }
  for (const filePath of expectedFiles) {
    await writeFile(filePath, "");
  }
  for (const runList of Object.values(plan.runLists)) {
    await writeFile(runList.path, runList.urls.length > 0 ? `${runList.urls.join("\n")}\n` : "");
  }
}

async function writeCoverageAreaRunLists(runListDir: string, plan: CoverageAreaFollowUpCapturePlan) {
  await mkdir(runListDir, { recursive: true });
  const expectedFiles = [
    "consent-coverage-area-follow-up.urls.txt",
    "full-coverage-area-follow-up.urls.txt",
    "policy-coverage-area-follow-up.urls.txt",
  ].map((fileName) => path.join(runListDir, fileName));
  for (const filePath of expectedFiles) {
    await writeFile(filePath, "");
  }
  for (const runList of Object.values(plan.runLists)) {
    await writeFile(runList.path, runList.urls.length > 0 ? `${runList.urls.join("\n")}\n` : "");
  }
}

function renderMarkdown(report: CalibrationReport) {
  const lines = [
    "# v2 Regulatory Confidence Calibration",
    "",
    "Internal diagnostic artifact only. This report does not create production findings, report copy, scores, persisted concerns, or legal conclusions.",
    "",
    "## Summary",
    "",
    `- Analyzed examples: ${report.summary.analyzedExamples}`,
    `- Candidate snapshots: ${report.summary.candidateSnapshots}`,
    `- Eligible candidate snapshots: ${report.summary.eligibleCandidateSnapshots}`,
    `- Near-miss review items: ${report.summary.nearMissItems}`,
    `- Debug confidence gate: ${report.regulatoryDebugConfidence.gate.status}`,
    "",
    "## Finding Confidence",
    "",
    "| Finding key | Eligible | Median | Average | Top missing corroborator | Top demotion reason |",
    "|---|---:|---:|---:|---|---|",
    ...report.findingSummaries.map((summary) => [
      summary.findingKey,
      String(summary.eligible),
      summary.medianConfidence.toFixed(2),
      summary.averageConfidence.toFixed(2),
      summary.topMissingCorroborators[0]?.value ?? "",
      summary.topDemotionReasons[0]?.value ?? "",
    ].join(" | ")).map((row) => `| ${row} |`),
    "",
    "## Lane Confidence",
    "",
    "| Lane | Examples | Median max | Average max |",
    "|---|---:|---:|---:|",
    ...report.laneSummaries.map((summary) =>
      `| ${summary.lane} | ${summary.candidateExamples} | ${summary.medianMaxConfidence.toFixed(2)} | ${summary.averageMaxConfidence.toFixed(2)} |`
    ),
    "",
    "## Near-Miss Patterns",
    "",
    ...report.nearMissPatterns.map((entry) => `- ${entry.value}: ${entry.count}`),
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function renderDebugConfidenceMarkdown(report: DebugConfidenceReport) {
  const lines = [
    "# v2 Regulatory Debug Confidence",
    "",
    "Internal diagnostic artifact only. This report summarizes beta adapter confidence pills and improvement suggestions; it does not create production findings, report copy, scores, persisted concerns, or legal conclusions.",
    "",
    "## Summary",
    "",
    `- Rows: ${report.summary.rows}`,
    `- Low-confidence rows: ${report.summary.lowConfidenceRows}`,
    `- Scanner coverage gap rows: ${report.summary.coverageGapRows}`,
    `- Rows with raw suggestion tokens: ${report.summary.rawSuggestionRows}`,
    `- Gate: ${report.gate.status}`,
    "",
    "## Gate Checks",
    "",
    "| Check | Status | Detail |",
    "|---|---|---|",
    ...report.gate.checks.map((check) =>
      `| ${check.name} | ${check.status} | ${check.detail} |`
    ),
    "",
    "## Score Buckets",
    "",
    ...Object.entries(report.scoreBuckets).map(([bucket, count]) => `- ${bucket}: ${count}`),
    "",
    "## Row Summaries",
    "",
    "| Area | Row | Rows | Low | Coverage gaps | Median | Average | Top suggestion |",
    "|---|---|---:|---:|---:|---:|---:|---|",
    ...report.rowSummaries.map((summary) => [
      summary.area,
      summary.rowId,
      String(summary.totalRows),
      String(summary.lowConfidenceRows),
      String(summary.coverageGapRows),
      summary.medianScore.toFixed(1),
      summary.averageScore.toFixed(1),
      summary.topImprovementSuggestions[0]?.value ?? "",
    ].join(" | ")).map((row) => `| ${row} |`),
    "",
    "## Low-Confidence Rows",
    "",
    "| Score | Area | Row | Domain | Profile | Class | First suggestion |",
    "|---:|---|---|---|---|---|---|",
    ...report.lowConfidenceRows.slice(0, 40).map((row) => [
      String(row.score),
      row.area,
      row.rowId,
      row.domain,
      row.profile,
      row.limitationClass,
      row.firstImprovementSuggestion,
    ].join(" | ")).map((row) => `| ${row} |`),
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function renderCoverageAreaCapturePlanMarkdown(plan: CoverageAreaFollowUpCapturePlan) {
  const lines = [
    "# v2 Regulatory Coverage-Area Follow-Up Capture Plan",
    "",
    "Internal diagnostic artifact only. This plan does not run live scans, create production findings, change report behavior, or make legal conclusions.",
    "",
    "## Summary",
    "",
    `- Scanner coverage-gap rows: ${plan.summary.coverageGapRows}`,
    `- Planned profile/url/row runs: ${plan.summary.plannedRuns}`,
    `- Distinct URLs: ${plan.summary.urls}`,
    ...plan.summary.profiles.map((entry) => `- ${entry.value}: ${entry.count}`),
    "",
    "## Run Lists",
    "",
    ...Object.values(plan.runLists).flatMap((runList) => [
      `### ${runList.profile}`,
      "",
      `- URL list: \`${runList.path}\``,
      `- URLs: ${runList.urls.length}`,
      "",
      "```bash",
      runList.command,
      "```",
      "",
    ]),
    "## Targets",
    "",
    "| Profile | Area | Row | Domain | URL | Current profile | Reason |",
    "|---|---|---|---|---|---|---|",
    ...plan.targets.map((target) =>
      `| ${target.recommendedProfile} | ${target.area} | ${target.rowId} | ${target.domain} | ${target.url} | ${target.currentProfile} | ${target.reason} |`
    ),
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function renderCoverageAreaImprovementMarkdown(report: CoverageAreaImprovementReview) {
  const lines = [
    "# v2 Regulatory Coverage Area Improvement Review",
    "",
    "Internal diagnostic artifact only. This report loops through regulatory coverage areas using retained v2 gold-corpus evidence. It does not create production findings, alter scoring, persist concerns, or make legal conclusions.",
    "",
    "## Summary",
    "",
    `- Coverage areas reviewed: ${report.summary.areas}`,
    ...report.summary.statuses.map((entry) => `- ${entry.value}: ${entry.count}`),
    "",
    "## Priority Order",
    "",
    "| Priority | Area | Row | Status | Coverage gaps | Low confidence | Near misses | Dominant blocker | Next action |",
    "|---:|---|---|---|---:|---:|---|---|---|",
    ...report.areas.map((area, index) => [
      String(index + 1),
      area.area,
      area.rowId,
      area.status,
      String(area.metrics.coverageGapRows),
      String(area.metrics.lowConfidenceRows),
      area.metrics.nearMissClassifications.map((entry) => `${entry.value}:${entry.count}`).join("<br>"),
      area.dominantBlocker,
      area.nextAction,
    ].join(" | ")).map((row) => `| ${row} |`),
    "",
    "## Coverage Area Detail",
    "",
    ...report.areas.flatMap((area) => [
      `### ${area.rowId}`,
      "",
      `- Area: ${area.area}`,
      `- Status: ${area.status}`,
      `- Priority score: ${area.priorityScore.toFixed(3)}`,
      `- Dominant blocker: ${area.dominantBlocker}`,
      `- Rows: ${area.metrics.totalRows}`,
      `- Coverage gaps: ${area.metrics.coverageGapRows}`,
      `- Low confidence: ${area.metrics.lowConfidenceRows}`,
      `- Median debug confidence: ${area.metrics.medianDebugConfidence}`,
      `- Residual rerun failures: ${area.metrics.residualRerunFailures}`,
      `- Finding keys: ${area.findingKeys.join(", ")}`,
      "",
      "Attributes checked:",
      ...area.attributesChecked.map((attribute) => `- ${attribute}`),
      "",
      "Exit criteria:",
      ...area.exitCriteria.map((criterion) => `- ${criterion}`),
      "",
      "Top signals:",
      ...[
        ...area.topImprovementSuggestions.slice(0, 3).map((entry) => `- improvement: ${entry.value} (${entry.count})`),
        ...area.topMissingCorroborators.slice(0, 3).map((entry) => `- missing corroborator: ${entry.value} (${entry.count})`),
        ...area.topDemotionReasons.slice(0, 3).map((entry) => `- demotion: ${entry.value} (${entry.count})`),
      ],
      "",
    ]),
  ];
  return `${lines.join("\n")}\n`;
}

function renderRerunPlanMarkdown(plan: NearMissRerunPlan) {
  const lines = [
    "# v2 Regulatory Near-Miss Rerun Plan",
    "",
    "Internal diagnostic artifact only. This plan does not run live scans, create production findings, change report behavior, or make legal conclusions.",
    "",
    "## Summary",
    "",
    `- Planned profile/url runs: ${plan.summary.plannedRuns}`,
    `- Distinct URLs: ${plan.summary.urls}`,
    `- Source module-not-run near-miss lanes: ${plan.summary.sourceNearMissLanes}`,
    ...plan.summary.profiles.map((entry) => `- ${entry.value}: ${entry.count}`),
    "",
    "## Run Lists",
    "",
    ...Object.values(plan.runLists).flatMap((runList) => [
      `### ${runList.profile}`,
      "",
      `- URL list: \`${runList.path}\``,
      `- URLs: ${runList.urls.length}`,
      "",
      "```bash",
      runList.command,
      "```",
      "",
    ]),
    "## Targets",
    "",
    "| Profile | Domain | URL | Missing modules | Lanes |",
    "|---|---|---|---|---|",
    ...plan.targets.map((target) => [
      target.profile,
      target.domain,
      target.url,
      target.missingModules.join("<br>"),
      target.lanes.join("<br>"),
    ].join(" | ")).map((row) => `| ${row} |`),
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function renderRerunFailuresMarkdown(failures: NearMissRerunFailure[]) {
  const lines = [
    "# v2 Regulatory Near-Miss Rerun Failures",
    "",
    "Internal diagnostic artifact only. This report describes residual module-coverage failures and does not create production findings, report copy, scores, persisted concerns, or legal conclusions.",
    "",
    "## Summary",
    "",
    `- Residual failures: ${failures.length}`,
    ...topCounts(failures.map((failure) => failure.failureClass), 8)
      .map((entry) => `- ${entry.value}: ${entry.count}`),
    "",
    "## Failures",
    "",
    "| Failure class | Profile | Domain | Failed modules | Lanes | Latest artifact |",
    "|---|---|---|---|---|---|",
    ...failures.map((failure) => [
      failure.failureClass,
      failure.profile,
      failure.domain,
      failure.failedModules.join("<br>"),
      failure.lanes.join("<br>"),
      failure.latestArtifactPath ?? "",
    ].join(" | ")).map((row) => `| ${row} |`),
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function renderNearMissMarkdown(report: CalibrationReport) {
  const lines = [
    "# v2 Regulatory Near-Miss Detail",
    "",
    "Internal diagnostic artifact only. This report does not create production findings, report copy, scores, persisted concerns, or legal conclusions.",
    "",
    "## Summary",
    "",
    `- Near-miss review items: ${report.summary.nearMissItems}`,
    `- Classified near-miss lanes: ${report.nearMissDetails.length}`,
    ...report.nearMissDetailSummary.map((entry) => `- ${entry.value}: ${entry.count}`),
    "",
    "## Detail",
    "",
    "| Classification | Lane | Domain | Profile | Relevant candidates | Top missing/demotion signals |",
    "|---|---|---|---|---|---|",
    ...report.nearMissDetails.map((detail) => [
      detail.classification,
      detail.lane,
      detail.domain,
      detail.profile,
      renderCandidateCells(detail.relevantCandidates),
      renderSignalCells(detail),
    ].join(" | ")).map((row) => `| ${row} |`),
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function renderCandidateCells(candidates: CandidateSnapshot[]) {
  if (candidates.length === 0) {
    return "(none)";
  }
  return candidates.map((candidate) =>
    `${candidate.findingKey}:${candidate.eligibilityStatus}@${candidate.confidence.toFixed(2)}`
  ).join("<br>");
}

function renderSignalCells(detail: NearMissDetail) {
  const moduleSignals = detail.missingModules.map((moduleName) => `missing_module:${moduleName}`);
  const candidateSignals = detail.relevantCandidates.flatMap((candidate) => [
    ...candidate.missingCorroborators.slice(0, 2),
    ...candidate.demotionReasons.slice(0, 2),
  ]);
  const signals = unique([...moduleSignals, ...candidateSignals]);
  return signals.length > 0 ? signals.join("<br>") : "";
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function requiredValue(argv: string[], index: number, flag: string) {
  const value = argv[index];
  if (!value) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}
