import {
  type CanonicalEvidenceBundle,
  type ConsentFlowTraceArtifact,
  type ConsentScenarioExecutionArtifact,
  type ConsentScenarioShadowCompareArtifact,
  consentScenarioShadowCompareArtifactSchema,
} from "@certscore/contracts";

const LONG_TAIL_THRESHOLD_MS = 15_000;
const MAX_FRESH_PAIR_GAP_MS = 30 * 60 * 1000;

export interface ConsentScenarioShadowSiteInput {
  url: string;
  legacy?: CanonicalEvidenceBundle;
  planned?: CanonicalEvidenceBundle;
  legacyDurationMs?: number;
  plannedDurationMs?: number;
  plannedExecution?: ConsentScenarioExecutionArtifact;
  plannedTrace?: ConsentFlowTraceArtifact;
  failureReason?: string;
}

export function buildConsentScenarioShadowCompareArtifact(input: {
  profile: string;
  sites: ConsentScenarioShadowSiteInput[];
  generatedAt?: string;
}): ConsentScenarioShadowCompareArtifact {
  const sites = input.sites.map(compareSite);
  const completedSites = sites.filter((site) => site.status === "completed");
  const p50DurationDeltaMs = percentile(completedSites.map((site) => site.durationMs.delta), 0.5);
  const p90DurationDeltaMs = percentile(completedSites.map((site) => site.durationMs.delta), 0.9);
  const p50DurationImprovementPct = percentile(completedSites.map((site) => site.durationMs.improvementPct), 0.5);
  const p90DurationImprovementPct = percentile(completedSites.map((site) => site.durationMs.improvementPct), 0.9);
  const truePlannedRegressionSites = completedSites.filter((site) => site.validationOutcome.category === "true_planned_regression").length;
  const stalePairSites = completedSites.filter((site) => site.validationOutcome.category === "stale_pair").length;
  const liveVarianceSuspectedSites = completedSites.filter((site) => site.validationOutcome.category === "live_variance_suspected").length;
  const unstablePairRefreshSites = completedSites.filter((site) => site.validationOutcome.refreshRecommended).length;

  return consentScenarioShadowCompareArtifactSchema.parse({
    artifactVersion: "consent_scenario_shadow_compare.v1",
    sourceScanner: "consent_flow_runtime",
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    profile: input.profile,
    summary: {
      urlsScanned: sites.length,
      succeeded: completedSites.length,
      failed: sites.length - completedSites.length,
      truePlannedRegressionSites,
      stalePairSites,
      liveVarianceSuspectedSites,
      unstablePairRefreshSites,
      p50DurationDeltaMs,
      p90DurationDeltaMs,
      p50DurationImprovementPct,
      p90DurationImprovementPct,
      sameOrBetterLaneCoverage: completedSites.length > 0 &&
        completedSites.every((site) => site.laneCoverage.sameOrBetter),
      noNewProductionFacingOutputs: completedSites.length > 0 && completedSites.every((site) =>
        site.productionOutputInvariant.noNewProductionFacingOutputs
      ),
      completePlannedArtifacts: completedSites.length > 0 && completedSites.every((site) =>
        site.artifacts.plan && site.artifacts.execution && site.artifacts.trace
      ),
      traceComplete: completedSites.length > 0 && completedSites.every((site) => site.trace.complete),
      increasedAmbiguitySites: completedSites.filter((site) => site.comparisons.increasedAmbiguity).length,
    },
    sites,
    notes: [
      "Internal diagnostic artifact only. Does not change production report, scoring, regulatory rows, persisted concerns, or finding surfacing.",
    ],
  } satisfies ConsentScenarioShadowCompareArtifact);
}

export function formatConsentScenarioShadowCompareMarkdown(
  artifact: ConsentScenarioShadowCompareArtifact,
): string {
  const lines = [
    "# Consent Scenario DAG Shadow Compare",
    "",
    `Generated: ${artifact.generatedAt}`,
    `Profile: ${artifact.profile}`,
    "",
    "## Summary",
    "",
    `- URLs scanned: ${artifact.summary.urlsScanned}`,
    `- Succeeded: ${artifact.summary.succeeded}`,
    `- Failed: ${artifact.summary.failed}`,
    `- p50 duration delta: ${formatMs(artifact.summary.p50DurationDeltaMs)}`,
    `- p90 duration delta: ${formatMs(artifact.summary.p90DurationDeltaMs)}`,
    `- p50 duration improvement: ${formatPct(artifact.summary.p50DurationImprovementPct)}`,
    `- p90 duration improvement: ${formatPct(artifact.summary.p90DurationImprovementPct)}`,
    `- Same or better lane coverage: ${artifact.summary.sameOrBetterLaneCoverage ? "yes" : "no"}`,
    `- Complete planned artifacts: ${artifact.summary.completePlannedArtifacts ? "yes" : "no"}`,
    `- Trace complete: ${artifact.summary.traceComplete ? "yes" : "no"}`,
    `- Increased ambiguity sites: ${artifact.summary.increasedAmbiguitySites}`,
    `- No new production-facing outputs: ${artifact.summary.noNewProductionFacingOutputs ? "yes" : "no"}`,
    "",
    "## Sites",
    "",
    "| URL | Status | Duration delta | Improvement | Lane coverage | Comparable legacy -> planned | Bottleneck | Artifacts | Trace | Ambiguity |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
  ];
  for (const site of artifact.sites) {
    lines.push([
      `| ${site.url}`,
      site.status,
      formatMs(site.durationMs.delta),
      formatPct(site.durationMs.improvementPct),
      `${site.laneCoverage.planned.length}/${site.laneCoverage.legacy.length}`,
      `${site.comparisons.legacyComparable} -> ${site.comparisons.plannedComparable}`,
      formatBottleneck(site.longTailDiagnostic),
      site.artifacts.plan && site.artifacts.execution && site.artifacts.trace ? "complete" : "missing",
      site.trace.complete ? "complete" : "incomplete",
      site.comparisons.increasedAmbiguity ? "yes" : "no",
      "|",
    ].join(" | "));
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function compareSite(input: ConsentScenarioShadowSiteInput): ConsentScenarioShadowCompareArtifact["sites"][number] {
  if (!input.legacy || !input.planned) {
    return emptyFailedSite(input);
  }
  const legacyLanes = laneCoverage(input.legacy);
  const plannedLanes = laneCoverage(input.planned);
  const missingInPlanned = difference(legacyLanes, plannedLanes);
  const additionalInPlanned = difference(plannedLanes, legacyLanes);
  const legacyComparable = comparableComparisonCount(input.legacy);
  const plannedComparable = comparableComparisonCount(input.planned);
  const artifactSummary = plannedArtifactSummary(input.planned);
  const notTestableReasons = plannedNotTestableReasons(input.plannedExecution, input.plannedTrace);
  const increasedAmbiguity = plannedComparable < legacyComparable;
  const blockingMissingLanes = missingInPlanned.filter((lane) =>
    !isExpectedPlanningSkipLane(lane, notTestableReasons, increasedAmbiguity)
  );
  const traceSummary = {
    scenarioNodeCount: input.plannedTrace?.scenarioNodes.length ?? 0,
    coverageAreaCount: input.plannedTrace?.coverageTrace.length ?? 0,
    complete: Boolean(input.plannedTrace && input.plannedTrace.scenarioNodes.length > 0),
  };
  const productionOutputInvariant = productionOutputInvariantCheck(input.legacy, input.planned);
  const durationDelta = input.legacyDurationMs !== undefined && input.plannedDurationMs !== undefined
    ? input.plannedDurationMs - input.legacyDurationMs
    : undefined;
  const longTailDiagnostic = buildLongTailDiagnostic(input.plannedDurationMs, input.plannedExecution);
  const pairFreshness = pairFreshnessSummary(input.legacy, input.planned);
  const validationOutcome = validationOutcomeForSite({
    status: "completed",
    pairFreshness,
    sameOrBetterLaneCoverage: blockingMissingLanes.length === 0,
    increasedAmbiguity,
    productionOutputInvariant,
    artifacts: artifactSummary,
    trace: traceSummary,
    plannedLongTail: longTailDiagnostic?.plannedLongTail === true,
    legacy: input.legacy,
    planned: input.planned,
  });

  return {
    url: input.planned.url,
    normalizedUrl: input.planned.normalizedUrl,
    legacyScanId: input.legacy.scanId,
    plannedScanId: input.planned.scanId,
    status: "completed",
    durationMs: {
      legacy: input.legacyDurationMs,
      planned: input.plannedDurationMs,
      delta: durationDelta,
      improvementPct: durationDelta !== undefined && input.legacyDurationMs && input.legacyDurationMs > 0
        ? (durationDelta * -100) / input.legacyDurationMs
        : undefined,
    },
    moduleStatuses: {
      legacyConsentFlow: consentFlowModuleStatus(input.legacy),
      plannedConsentFlow: consentFlowModuleStatus(input.planned),
    },
    pairFreshness,
    laneCoverage: {
      legacy: legacyLanes,
      planned: plannedLanes,
      missingInPlanned,
      additionalInPlanned,
      sameOrBetter: blockingMissingLanes.length === 0,
    },
    actionAttempts: {
      legacy: actionAttemptSummary(input.legacy),
      planned: actionAttemptSummary(input.planned),
    },
    comparisons: {
      legacyComparable,
      plannedComparable,
      plannedNotComparableReasons: uniqueStrings(input.planned.consentFlowComparisons
        .map((comparison) => comparison.comparableMeasurement)
        .filter((measurement) => measurement && !measurement.comparable)
        .map((measurement) => measurement?.reason)
        .filter((reason): reason is string => Boolean(reason))),
      increasedAmbiguity,
    },
    artifacts: artifactSummary,
    trace: traceSummary,
    notTestableReasons,
    productionOutputInvariant,
    validationOutcome,
    longTailDiagnostic,
  };
}

function emptyFailedSite(input: ConsentScenarioShadowSiteInput): ConsentScenarioShadowCompareArtifact["sites"][number] {
  return {
    url: input.url,
    normalizedUrl: input.legacy?.normalizedUrl ?? input.planned?.normalizedUrl,
    legacyScanId: input.legacy?.scanId,
    plannedScanId: input.planned?.scanId,
    status: "failed",
    failureReason: boundedString(input.failureReason, 500),
    durationMs: {
      legacy: input.legacyDurationMs,
      planned: input.plannedDurationMs,
      delta: input.legacyDurationMs !== undefined && input.plannedDurationMs !== undefined
        ? input.plannedDurationMs - input.legacyDurationMs
        : undefined,
    },
    moduleStatuses: {
      legacyConsentFlow: input.legacy ? consentFlowModuleStatus(input.legacy) : undefined,
      plannedConsentFlow: input.planned ? consentFlowModuleStatus(input.planned) : undefined,
    },
    pairFreshness: input.legacy && input.planned
      ? pairFreshnessSummary(input.legacy, input.planned)
      : unknownPairFreshness(input.legacy, input.planned),
    laneCoverage: {
      legacy: input.legacy ? laneCoverage(input.legacy) : [],
      planned: input.planned ? laneCoverage(input.planned) : [],
      missingInPlanned: [],
      additionalInPlanned: [],
      sameOrBetter: false,
    },
    actionAttempts: {
      legacy: input.legacy ? actionAttemptSummary(input.legacy) : emptyAttemptSummary(),
      planned: input.planned ? actionAttemptSummary(input.planned) : emptyAttemptSummary(),
    },
    comparisons: {
      legacyComparable: input.legacy ? comparableComparisonCount(input.legacy) : 0,
      plannedComparable: input.planned ? comparableComparisonCount(input.planned) : 0,
      plannedNotComparableReasons: [],
      increasedAmbiguity: false,
    },
    artifacts: input.planned ? plannedArtifactSummary(input.planned) : {
      plan: false,
      execution: false,
      trace: false,
      allInternalOnly: false,
      pathsUnique: false,
    },
    trace: {
      scenarioNodeCount: input.plannedTrace?.scenarioNodes.length ?? 0,
      coverageAreaCount: input.plannedTrace?.coverageTrace.length ?? 0,
      complete: false,
    },
    notTestableReasons: [],
    productionOutputInvariant: {
      noNewProductionFacingOutputs: false,
      blockingReasons: [
        boundedString(input.failureReason ?? "shadow_compare_site_failed", 240) ?? "shadow_compare_site_failed",
      ],
    },
    validationOutcome: {
      category: "scanner_failure",
      refreshRecommended: false,
      reasonCodes: [
        "site_not_completed",
        boundedString(input.failureReason ?? "shadow_compare_site_failed", 120) ?? "shadow_compare_site_failed",
      ],
    },
    longTailDiagnostic: buildLongTailDiagnostic(input.plannedDurationMs, input.plannedExecution),
  };
}

function pairFreshnessSummary(
  legacy: CanonicalEvidenceBundle,
  planned: CanonicalEvidenceBundle,
): ConsentScenarioShadowCompareArtifact["sites"][number]["pairFreshness"] {
  const legacyStartedAtMs = Date.parse(legacy.startedAt);
  const plannedStartedAtMs = Date.parse(planned.startedAt);
  if (!Number.isFinite(legacyStartedAtMs) || !Number.isFinite(plannedStartedAtMs)) {
    return unknownPairFreshness(legacy, planned);
  }
  const captureGapMs = Math.abs(plannedStartedAtMs - legacyStartedAtMs);
  const stale = captureGapMs > MAX_FRESH_PAIR_GAP_MS;
  return {
    legacyStartedAt: legacy.startedAt,
    plannedStartedAt: planned.startedAt,
    legacyCompletedAt: legacy.completedAt,
    plannedCompletedAt: planned.completedAt,
    captureGapMs,
    maxFreshPairGapMs: MAX_FRESH_PAIR_GAP_MS,
    status: stale ? "stale_pair" : "fresh_pair",
    reasonCodes: stale ? ["capture_gap_over_threshold"] : ["capture_pair_fresh"],
  };
}

function unknownPairFreshness(
  legacy: CanonicalEvidenceBundle | undefined,
  planned: CanonicalEvidenceBundle | undefined,
): ConsentScenarioShadowCompareArtifact["sites"][number]["pairFreshness"] {
  return {
    legacyStartedAt: legacy?.startedAt,
    plannedStartedAt: planned?.startedAt,
    legacyCompletedAt: legacy?.completedAt,
    plannedCompletedAt: planned?.completedAt,
    maxFreshPairGapMs: MAX_FRESH_PAIR_GAP_MS,
    status: "unknown_pair",
    reasonCodes: ["capture_timestamp_unavailable"],
  };
}

function validationOutcomeForSite(input: {
  status: "completed" | "failed";
  pairFreshness: ConsentScenarioShadowCompareArtifact["sites"][number]["pairFreshness"];
  sameOrBetterLaneCoverage: boolean;
  increasedAmbiguity: boolean;
  productionOutputInvariant: ConsentScenarioShadowCompareArtifact["sites"][number]["productionOutputInvariant"];
  artifacts: ConsentScenarioShadowCompareArtifact["sites"][number]["artifacts"];
  trace: ConsentScenarioShadowCompareArtifact["sites"][number]["trace"];
  plannedLongTail: boolean;
  legacy: CanonicalEvidenceBundle;
  planned: CanonicalEvidenceBundle;
}): ConsentScenarioShadowCompareArtifact["sites"][number]["validationOutcome"] {
  const blockingContractIssue = !input.productionOutputInvariant.noNewProductionFacingOutputs ||
    !(input.artifacts.plan && input.artifacts.execution && input.artifacts.trace && input.artifacts.allInternalOnly && input.artifacts.pathsUnique) ||
    !input.trace.complete;
  const coverageOrAmbiguityRegression = !input.sameOrBetterLaneCoverage || input.increasedAmbiguity;
  const actionProofAsymmetry = actionProofSignature(input.legacy) !== actionProofSignature(input.planned);
  const reasonCodes = [
    ...input.pairFreshness.reasonCodes,
    coverageOrAmbiguityRegression ? "coverage_or_ambiguity_regression" : undefined,
    !input.sameOrBetterLaneCoverage ? "lane_coverage_below_legacy" : undefined,
    input.increasedAmbiguity ? "increased_ambiguity" : undefined,
    actionProofAsymmetry ? "action_proof_asymmetry" : undefined,
    blockingContractIssue ? "artifact_or_contract_issue" : undefined,
    input.plannedLongTail ? "planned_long_tail" : undefined,
  ].filter((value): value is string => Boolean(value));

  if (input.status !== "completed") {
    return { category: "scanner_failure", refreshRecommended: false, reasonCodes };
  }
  if (coverageOrAmbiguityRegression && input.pairFreshness.status !== "fresh_pair") {
    return { category: "stale_pair", refreshRecommended: true, reasonCodes };
  }
  if (coverageOrAmbiguityRegression && actionProofAsymmetry) {
    return { category: "live_variance_suspected", refreshRecommended: true, reasonCodes };
  }
  if (coverageOrAmbiguityRegression || blockingContractIssue) {
    return { category: "true_planned_regression", refreshRecommended: false, reasonCodes };
  }
  if (input.plannedLongTail) {
    return { category: "long_tail_only", refreshRecommended: false, reasonCodes };
  }
  return { category: "healthy", refreshRecommended: false, reasonCodes };
}

function actionProofSignature(bundle: CanonicalEvidenceBundle): string {
  return bundle.consentActionAttempts
    .map((attempt) => [
      attempt.scenario,
      attempt.actionType,
      attempt.attempted ? "attempted" : "not_attempted",
      attempt.succeeded ? "succeeded" : "not_succeeded",
      attempt.actionProof?.attemptedStatus ?? "no_proof_status",
      attempt.actionProof?.failureReason ?? "no_failure",
    ].join(":"))
    .sort()
    .join("|");
}

function buildLongTailDiagnostic(
  plannedDurationMs: number | undefined,
  execution: ConsentScenarioExecutionArtifact | undefined,
): ConsentScenarioShadowCompareArtifact["sites"][number]["longTailDiagnostic"] {
  const scenarioDurations = (execution?.scenarios ?? [])
    .filter((scenario) => scenario.durationMs !== undefined)
    .map((scenario) => ({
      scenario: scenario.scenario,
      status: scenario.status,
      durationMs: scenario.durationMs,
      deadlineHit: scenario.deadlineHit,
    }))
    .sort((left, right) => (right.durationMs ?? 0) - (left.durationMs ?? 0))
    .slice(0, 10);
  const phaseHotspots = (execution?.scenarios ?? [])
    .flatMap((scenario) => scenario.phaseTimings.map((phase) => ({
      scenario: scenario.scenario,
      label: phase.label,
      durationMs: phase.durationMs,
      detail: phase.detail,
    })))
    .sort((left, right) => right.durationMs - left.durationMs)
    .slice(0, 8);
  const topScenario = scenarioDurations[0];
  const topPhase = phaseHotspots[0];
  const bottleneckBuckets = phaseBucketTotals(phaseHotspots);
  const plannedLongTail = (plannedDurationMs ?? 0) > LONG_TAIL_THRESHOLD_MS;
  const reasonCodes = new Set<string>();
  if (plannedLongTail) {
    reasonCodes.add("planned_wall_time_over_threshold");
  }
  if (execution?.healthSummary.deadlineHit) {
    reasonCodes.add("execution_deadline_hit");
  }
  if (execution?.healthSummary.failed && execution.healthSummary.failed > 0) {
    reasonCodes.add("scenario_failure_present");
  }
  if (execution?.healthSummary.policyLate) {
    reasonCodes.add("policy_late");
  }
  if (topScenario) {
    reasonCodes.add(`top_scenario:${topScenario.scenario}`);
    if (topScenario.deadlineHit) {
      reasonCodes.add(`top_scenario_deadline_hit:${topScenario.scenario}`);
    }
    if (topScenario.status === "failed") {
      reasonCodes.add(`top_scenario_failed:${topScenario.scenario}`);
    }
  }
  if (topPhase) {
    reasonCodes.add(`top_phase:${phaseBucket(topPhase.label)}`);
  } else if (topScenario && (topScenario.durationMs ?? 0) > 0) {
    reasonCodes.add("top_scenario_phase_timings_missing");
  }

  return {
    plannedLongTail,
    thresholdMs: LONG_TAIL_THRESHOLD_MS,
    topScenario: topScenario?.scenario,
    topScenarioStatus: topScenario?.status,
    topScenarioDurationMs: topScenario?.durationMs,
    topPhaseScenario: topPhase?.scenario,
    topPhaseLabel: topPhase?.label,
    topPhaseDurationMs: topPhase?.durationMs,
    topPhaseDetail: boundedString(topPhase?.detail, 240),
    bottleneckReasonCodes: [...reasonCodes].sort(),
    bottleneckBuckets,
    scenarioDurations,
    phaseHotspots: phaseHotspots.map((phase) => ({
      scenario: phase.scenario,
      label: phase.label,
      durationMs: phase.durationMs,
    })),
  };
}

function phaseBucketTotals(phases: Array<{ label: string; durationMs: number }>): Array<{
  bucket: string;
  totalMs: number;
  occurrences: number;
}> {
  const totals = new Map<string, { bucket: string; totalMs: number; occurrences: number }>();
  for (const phase of phases) {
    const bucket = phaseBucket(phase.label);
    const existing = totals.get(bucket) ?? { bucket, totalMs: 0, occurrences: 0 };
    existing.totalMs += phase.durationMs;
    existing.occurrences += 1;
    totals.set(bucket, existing);
  }
  return [...totals.values()]
    .sort((left, right) => right.totalMs - left.totalMs || left.bucket.localeCompare(right.bucket))
    .slice(0, 8);
}

function phaseBucket(label: string): string {
  if (label.includes("navigate")) {
    return "navigation";
  }
  if (label.includes("network_idle") || label.includes("readiness") || label.includes("settle")) {
    return "readiness_or_settle";
  }
  if (label.includes("screenshot")) {
    return "screenshot";
  }
  if (label.includes("classification")) {
    return "classification";
  }
  if (label.includes("candidate") || label.includes("recipe")) {
    return "candidate_extraction";
  }
  if (label.includes("preference_center")) {
    return "preference_center_traversal";
  }
  if (label.includes("cookie")) {
    return "cookie_snapshot";
  }
  if (label.includes("response")) {
    return "response_capture";
  }
  if (label.includes("dom")) {
    return "dom_capture";
  }
  return "other";
}

function laneCoverage(bundle: CanonicalEvidenceBundle): string[] {
  const lanes = new Set<string>();
  for (const observation of bundle.consentFlowObservations) {
    lanes.add(observation.scenario);
  }
  for (const attempt of bundle.consentActionAttempts) {
    lanes.add(`${attempt.scenario}:${attempt.actionType}`);
  }
  for (const comparison of bundle.consentFlowComparisons) {
    if (comparison.comparableMeasurement?.comparable) {
      lanes.add(`comparison:${comparison.comparedScenarios}`);
    }
  }
  return [...lanes].sort();
}

function plannedNotTestableReasons(
  execution: ConsentScenarioExecutionArtifact | undefined,
  trace: ConsentFlowTraceArtifact | undefined,
): string[] {
  return uniqueStrings([
    ...(execution?.scenarios ?? []).flatMap((scenario) => [
      scenario.failureReason,
      ...scenario.reasonCodes,
    ]),
    ...(trace?.coverageTrace ?? []).flatMap((coverage) => coverage.limitationKeys),
  ].filter((value): value is string => Boolean(value)));
}

function isExpectedPlanningSkipLane(
  lane: string,
  notTestableReasons: string[],
  increasedAmbiguity: boolean,
): boolean {
  if (increasedAmbiguity) {
    return false;
  }
  if (lane.endsWith(":reopen_preferences")) {
    return true;
  }
  if (!notTestableReasons.includes("cmp_or_banner_not_observed")) {
    return false;
  }
  return lane === "reject_all_flow" ||
    lane === "reject_all_flow:reject_all" ||
    lane === "accept_all_flow" ||
    lane === "accept_all_flow:accept_all";
}

function actionAttemptSummary(bundle: CanonicalEvidenceBundle): ConsentScenarioShadowCompareArtifact["sites"][number]["actionAttempts"]["legacy"] {
  return {
    total: bundle.consentActionAttempts.length,
    attempted: bundle.consentActionAttempts.filter((attempt) => attempt.attempted).length,
    succeeded: bundle.consentActionAttempts.filter((attempt) => attempt.succeeded).length,
    failed: bundle.consentActionAttempts.filter((attempt) => attempt.attempted && !attempt.succeeded).length,
    notAttempted: bundle.consentActionAttempts.filter((attempt) => !attempt.attempted).length,
  };
}

function emptyAttemptSummary(): ReturnType<typeof actionAttemptSummary> {
  return {
    total: 0,
    attempted: 0,
    succeeded: 0,
    failed: 0,
    notAttempted: 0,
  };
}

function comparableComparisonCount(bundle: CanonicalEvidenceBundle): number {
  return bundle.consentFlowComparisons.filter((comparison) =>
    comparison.comparableMeasurement?.comparable
  ).length;
}

function consentFlowModuleStatus(bundle: CanonicalEvidenceBundle): string | undefined {
  return bundle.modulesRun.find((moduleRun) => moduleRun.moduleName === "consentFlowRuntimeScanner")?.status;
}

function plannedArtifactSummary(bundle: CanonicalEvidenceBundle): ConsentScenarioShadowCompareArtifact["sites"][number]["artifacts"] {
  const scenarioArtifactRefs = bundle.artifactRefs.filter((ref) =>
    ["consent_scenario_plan", "consent_scenario_execution", "consent_flow_trace"].includes(ref.artifactId)
  );
  const paths = scenarioArtifactRefs.map((ref) => ref.path).filter((value): value is string => Boolean(value));
  return {
    plan: scenarioArtifactRefs.some((ref) => ref.artifactId === "consent_scenario_plan"),
    execution: scenarioArtifactRefs.some((ref) => ref.artifactId === "consent_scenario_execution"),
    trace: scenarioArtifactRefs.some((ref) => ref.artifactId === "consent_flow_trace"),
    allInternalOnly: scenarioArtifactRefs.length > 0 && scenarioArtifactRefs.every((ref) => ref.sensitivity === "internal_only"),
    pathsUnique: paths.length === new Set(paths).size,
  };
}

function productionOutputInvariantCheck(
  legacy: CanonicalEvidenceBundle,
  planned: CanonicalEvidenceBundle,
): ConsentScenarioShadowCompareArtifact["sites"][number]["productionOutputInvariant"] {
  const blockingReasons: string[] = [];
  void legacy;
  const scenarioArtifactRefs = planned.artifactRefs.filter((ref) =>
    ["consent_scenario_plan", "consent_scenario_execution", "consent_flow_trace"].includes(ref.artifactId)
  );
  const nonInternalScenarioArtifacts = scenarioArtifactRefs.filter((ref) =>
    ref.sensitivity !== "internal_only" || ref.redactionStatus !== "internal_only"
  );
  if (nonInternalScenarioArtifacts.length > 0) {
    blockingReasons.push(
      boundedString(
        `planned_scenario_artifacts_not_internal:${nonInternalScenarioArtifacts.map((ref) => ref.artifactId).join(",")}`,
        240,
      ) ?? "planned_scenario_artifacts_not_internal",
    );
  }
  return {
    noNewProductionFacingOutputs: blockingReasons.length === 0,
    blockingReasons,
  };
}

function percentile(values: Array<number | undefined>, quantile: number): number | undefined {
  const sorted = values.filter((value): value is number => Number.isFinite(value)).sort((left, right) => left - right);
  if (sorted.length === 0) {
    return undefined;
  }
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1));
  return sorted[index];
}

function difference(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);
  return uniqueStrings(left.filter((item) => !rightSet.has(item)));
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function boundedString(value: string | undefined, maxLength: number): string | undefined {
  if (!value || value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function formatMs(value: number | undefined): string {
  return value === undefined ? "n/a" : `${value} ms`;
}

function formatPct(value: number | undefined): string {
  return value === undefined ? "n/a" : `${value.toFixed(1)}%`;
}

function formatBottleneck(
  diagnostic: ConsentScenarioShadowCompareArtifact["sites"][number]["longTailDiagnostic"],
): string {
  if (!diagnostic?.plannedLongTail) {
    return "n/a";
  }
  return [
    diagnostic.topScenario,
    diagnostic.topPhaseScenario && diagnostic.topPhaseLabel
      ? `${diagnostic.topPhaseScenario}:${diagnostic.topPhaseLabel}`
      : diagnostic.topPhaseLabel,
    diagnostic.topPhaseDurationMs !== undefined ? formatMs(diagnostic.topPhaseDurationMs) : undefined,
  ].filter(Boolean).join(" / ") || "long-tail";
}
