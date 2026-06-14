import {
  type CanonicalEvidenceBundle,
  type ConsentFlowTraceArtifact,
  type ConsentScenarioExecutionArtifact,
  type ConsentScenarioShadowCompareArtifact,
  consentScenarioShadowCompareArtifactSchema,
} from "@certscore/contracts";

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

    return consentScenarioShadowCompareArtifactSchema.parse({
    artifactVersion: "consent_scenario_shadow_compare.v1",
    sourceScanner: "consent_flow_runtime",
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    profile: input.profile,
    summary: {
      urlsScanned: sites.length,
      succeeded: completedSites.length,
      failed: sites.length - completedSites.length,
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
    "| URL | Status | Duration delta | Improvement | Lane coverage | Comparable legacy -> planned | Artifacts | Trace | Ambiguity |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|",
  ];
  for (const site of artifact.sites) {
    lines.push([
      `| ${site.url}`,
      site.status,
      formatMs(site.durationMs.delta),
      formatPct(site.durationMs.improvementPct),
      `${site.laneCoverage.planned.length}/${site.laneCoverage.legacy.length}`,
      `${site.comparisons.legacyComparable} -> ${site.comparisons.plannedComparable}`,
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
  const traceSummary = {
    scenarioNodeCount: input.plannedTrace?.scenarioNodes.length ?? 0,
    coverageAreaCount: input.plannedTrace?.coverageTrace.length ?? 0,
    complete: Boolean(input.plannedTrace && input.plannedTrace.scenarioNodes.length > 0),
  };
  const productionOutputInvariant = productionOutputInvariantCheck(input.legacy, input.planned);
  const durationDelta = input.legacyDurationMs !== undefined && input.plannedDurationMs !== undefined
    ? input.plannedDurationMs - input.legacyDurationMs
    : undefined;

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
    laneCoverage: {
      legacy: legacyLanes,
      planned: plannedLanes,
      missingInPlanned,
      additionalInPlanned,
      sameOrBetter: missingInPlanned.length === 0,
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
      increasedAmbiguity: plannedComparable < legacyComparable,
    },
    artifacts: artifactSummary,
    trace: traceSummary,
    notTestableReasons: uniqueStrings([
      ...(input.plannedExecution?.scenarios ?? []).flatMap((scenario) => [
        scenario.failureReason,
        ...scenario.reasonCodes,
      ]),
      ...(input.plannedTrace?.coverageTrace ?? []).flatMap((coverage) => coverage.limitationKeys),
    ].filter((value): value is string => Boolean(value))),
    productionOutputInvariant,
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
  };
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
