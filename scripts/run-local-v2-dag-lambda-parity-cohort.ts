import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type CohortResult = {
  artifactRoot?: string;
  counts?: {
    consentActionAttempts?: number;
    consentActionCandidates?: number;
    consentFlowComparisons?: number;
    evidenceExcerpts?: number;
    networkEvents?: number;
    networkResponseEvents?: number;
    screenshots?: number;
  };
  elapsedMs?: number;
  moduleRuns?: Array<{
    errors?: string[];
    moduleName?: string;
    status?: string;
  }>;
  resultStatus?: string;
  scanId?: string;
  scenarioQuality?: Array<{
    action?: {
      attempted?: boolean | null;
      outcome?: string | null;
    };
    artifactPresent?: boolean | null;
    counts?: {
      actionCandidatesFound?: number | null;
      activeRequestsAtClose?: number | null;
      cookiesAfterAction?: number | null;
      cookiesBeforeAction?: number | null;
      evidenceExcerpts?: number | null;
      failedRequests?: number | null;
      finalWindowRequestRatePerSecond?: number | null;
      postActionRequests?: number | null;
      requests?: number | null;
      responses?: number | null;
      storageAfterAction?: number | null;
      storageBeforeAction?: number | null;
    };
    limitationReason?: string | null;
    passStatus?: string | null;
    scenario?: string | null;
  }>;
  shardSummary?: {
    coordinatorPlannedScenarios?: string[];
    coordinatorSkippedScenarios?: Array<{
      reasonCodes?: string[];
      scenario?: string;
      skipReason?: string;
    }>;
    workerResults?: Array<{
      scanId?: string | null;
      status?: string | null;
      workerLane?: string | null;
    }>;
  };
  manifest?: {
    auxiliaryArtifactCount?: number;
    hasCoordinatorPlanSummary?: boolean;
  };
  targetUrl?: string;
};

type CohortSite = {
  expectedLanes: string[];
  primaryBucket: string;
  reasonCodes: string[];
  seedUrls?: {
    privacyOptOut?: string[];
  };
  sector: string;
  site: string;
  source: string;
  url: string;
};

type CohortRollupResult = {
  counts?: CohortResult["counts"];
  elapsedMs: number | null;
  error?: string;
  quality: ReturnType<typeof summarizeQuality>;
  qualityHandling: ReturnType<typeof summarizeQualityHandling>;
  qualityReport?: LocalLambdaQualityReport;
  resultStatus: string;
};

type FailureTaxonomy =
  | "gold_expected_lane_not_planned"
  | "coordinator_planning_miss"
  | "cmp_or_banner_not_observed"
  | "cmp_observed_without_actionable_surface"
  | "opener_not_found"
  | "privacy_control_not_observed"
  | "second_layer_not_observed"
  | "preference_center_action_not_observed"
  | "target_action_not_found"
  | "action_attempted_not_succeeded"
  | "post_action_tail_missing"
  | "near_zero_runtime_evidence"
  | "request_response_evidence_below_threshold"
  | "evidence_excerpts_below_threshold"
  | "browser_or_context_closed_before_quality_artifact"
  | "scenario_deadline_before_quality_artifact"
  | "scenario_failed_before_quality_artifact"
  | "manual_review_required_custom_privacy_form"
  | "privacy_center_surface_observed_without_verifiable_opt_out_control"
  | "privacy_control_click_without_verifiable_state_change"
  | "privacy_control_observed_without_clickable_target"
  | "privacy_control_target_closed_before_quality_artifact"
  | "planner_text_control_not_reacquired"
  | "vague_action_limitation"
  | "worker_artifact_missing"
  | "screenshot_missing_or_extra"
  | "artifact_mirror_incomplete"
  | "unknown_or_unclassified_limitation"
  | "no_relevant_action_scenarios";

type LocalLambdaQualityScenarioReport = {
  actionAttempted: boolean | null;
  actionCandidatesFound: number | null;
  actionOutcome: string | null;
  actionSucceeded: boolean | null;
  artifactPresent: boolean;
  artifactMirrorStatus: "present" | "missing_or_unknown";
  cookieStorageCounts: {
    cookiesAfterAction: number | null;
    cookiesBeforeAction: number | null;
    storageAfterAction: number | null;
    storageBeforeAction: number | null;
  };
  evidenceExcerptCount: number | null;
  expectedByGold: boolean;
  exercisedByWorker: boolean;
  failureTaxonomy: FailureTaxonomy[];
  finalWindowRequestRatePerSecond: number | null;
  goldExpectedLane: string | null;
  limitationReason: string | null;
  passStatus: string;
  plannedByCoordinator: boolean;
  postActionRequestCount: number | null;
  requestCount: number | null;
  responseCount: number | null;
  scenario: string;
  score: number;
  skippedByCoordinator: {
    reasonCodes: string[];
    skipReason: string;
  } | null;
  strictPass: boolean;
  workerLane: string | null;
};

type LocalLambdaQualityReport = {
  artifactOnly: true;
  artifactVersion: "certscore.v2.local_lambda_quality_report.v1";
  generatedAt: string;
  productionFindingIntegration: false;
  resultStatus: string;
  scanId?: string;
  score: {
    actionAttemptedRate: number;
    actionSucceededRate: number;
    scenarioAverage: number;
    strictPass: boolean;
  };
  screenshotStatus: ReturnType<typeof summarizeQualityHandling>["screenshotStatus"];
  scenarios: LocalLambdaQualityScenarioReport[];
  site: string;
  siteMetadata: CohortSite | null;
  strictQualityPassed: boolean;
  summary: {
    explicitLimitations: number;
    missingArtifacts: number;
    plannedActionScenarios: number;
    strictPassingScenarios: number;
    silentFailures: number;
    vagueActionLimitations: number;
  };
  targetUrl?: string;
  topFailureBuckets: Array<{ bucket: FailureTaxonomy; count: number }>;
  usefulRuntimeCoverage: boolean;
};

type Args = {
  artifactDir: string;
  cohort: "difficult-10" | "difficult-gold-30";
  limit: number | null;
  outPath: string;
  siteTimeoutMs: number;
  sites: CohortSite[];
  variant: string;
};

const DEFAULT_SITES = [
  "webmd.com",
  "nbcnews.com",
  "nytimes.com",
  "ikea.com",
  "target.com",
  "walmart.com",
  "cnn.com",
  "weather.com",
  "espn.com",
  "forbes.com",
];

const WEBMD_REGRESSION_SITE: CohortSite = {
  expectedLanes: ["baseline_pre_consent", "gpc_enabled", "reject_all_flow", "accept_all_flow", "policy_surface"],
  primaryBucket: "complex_reject_flow",
  reasonCodes: [
    "prior_local_lambda_parity_regression",
    "onetrust_cmp_family",
    "hidden_preference_surface_controls",
    "quality_anchor_webmd",
  ],
  sector: "health_media",
  site: "webmd.com",
  source: "local-lambda-parity-webmd-regression-anchor",
  url: "https://www.webmd.com/",
};

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printUsage();
    return;
  }
  const args = parseArgs(process.argv.slice(2));
  const workspaceRoot = process.cwd();
  const cohortId = new Date().toISOString().replace(/[:.]/g, "-");
  const cohortDir = path.resolve(workspaceRoot, args.artifactDir, cohortId);
  await mkdir(cohortDir, { recursive: true });
  const sites = args.limit === null ? args.sites : args.sites.slice(0, args.limit);
  const cohortManifest = {
    artifactOnly: true,
    architectureDiscipline: {
      noArchitectureDrift: true,
      noOneOffSiteCode: true,
      productionFindingIntegration: false,
      scope: "local/dev Lambda-parity harness only",
    },
    cohort: args.cohort,
    cohortId,
    generatedAt: new Date().toISOString(),
    productionFindingIntegration: false,
    selectionSources: [
      "docs/certscore-v2/gold-corpus-expansion-50.jsonl",
      "docs/certscore-v2/current-gold-corpus-labels.json",
      "local-lambda-parity WebMD CMP-family regression anchor",
    ],
    sites,
  };
  const cohortManifestPath = path.join(cohortDir, "cohort-manifest.json");
  await writeFile(cohortManifestPath, `${JSON.stringify(cohortManifest, null, 2)}\n`, "utf8");
  const results: Array<CohortResult & { error?: string; site: string; summaryPath: string }> = [];

  for (const siteEntry of sites) {
    const site = siteEntry.site;
    const targetUrl = normalizeTargetUrl(siteEntry.url);
    const slug = siteSlug(site);
    const scanId = `local-parity-${slug}-${cohortId}`.slice(0, 120);
    const summaryPath = path.join(cohortDir, `${slug}.json`);
    console.log(JSON.stringify({ event: "cohort_site_started", scanId, site, summaryPath, targetUrl }));
    try {
      await runCommand("pnpm", [
        "v2:local-dag-lambda-parity",
        "--",
        "--target-url",
        targetUrl,
        "--scan-id",
        scanId,
        "--variant",
        args.variant,
        ...debugOverrideArgsForSite(siteEntry),
        "--out",
        summaryPath,
      ], { timeoutMs: args.siteTimeoutMs });
      const summary = JSON.parse(await readFile(summaryPath, "utf8")) as CohortResult;
      results.push({ ...summary, site, summaryPath });
      console.log(JSON.stringify({
        elapsedMs: summary.elapsedMs,
        event: "cohort_site_completed",
        resultStatus: summary.resultStatus,
        scanId: summary.scanId,
        site,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const completedSummary = readCompletedSiteSummary(summaryPath, scanId);
      if (completedSummary) {
        results.push({ ...completedSummary, site, summaryPath });
        console.warn(JSON.stringify({
          elapsedMs: completedSummary.elapsedMs,
          event: "cohort_site_completed_after_wrapper_timeout",
          resultStatus: completedSummary.resultStatus,
          scanId: completedSummary.scanId,
          site,
          timeoutError: message,
        }));
        continue;
      }
      const failedSummary = failedSiteSummary({
        error: message,
        scanId,
        site,
        siteMetadata: siteEntry,
        summaryPath,
        targetUrl,
      });
      await writeFile(summaryPath, `${JSON.stringify(failedSummary, null, 2)}\n`, "utf8").catch(() => undefined);
      results.push({ ...failedSummary, error: message, site, summaryPath });
      console.error(JSON.stringify({ error: message, event: "cohort_site_failed", scanId, site }));
    }
  }

  const rollupResults = results.map((result) => {
    const siteMetadata = sites.find((site) => site.site === result.site) ?? null;
    const qualityHandling = summarizeQualityHandling(result, siteMetadata);
    const rollupResult = {
      counts: result.counts,
      elapsedMs: result.elapsedMs ?? null,
      error: result.error,
      quality: summarizeQuality(result),
      qualityHandling,
      resultStatus: result.resultStatus ?? "failed",
      scanId: result.scanId,
      shardSummary: result.shardSummary,
      site: result.site,
      siteMetadata,
      summaryPath: result.summaryPath,
      targetUrl: result.targetUrl,
    };
    return {
      ...rollupResult,
      qualityReport: buildLocalLambdaQualityReport({
        result,
        rollupResult,
        siteMetadata,
      }),
    };
  });
  await writePerSiteQualityReports({ cohortDir, results: rollupResults });
  const qualityRollup = buildQualityRollup({
    architectureDiscipline: cohortManifest.architectureDiscipline,
    cohortId,
    cohortManifestPath,
    generatedAt: new Date().toISOString(),
    results: rollupResults,
    variant: args.variant,
  });
  await writeFile(path.join(cohortDir, "QualityRollup.json"), `${JSON.stringify(qualityRollup, null, 2)}\n`, "utf8");
  await writeFile(path.join(cohortDir, "QualityRollup.md"), `${qualityRollupMarkdown(qualityRollup)}\n`, "utf8");
  const rollup = {
    artifactOnly: true,
    architectureDiscipline: cohortManifest.architectureDiscipline,
    cohortId,
    cohortManifestPath,
    generatedAt: new Date().toISOString(),
    productionFindingIntegration: false,
    results: rollupResults,
    sites,
    summary: summarizeCohort(rollupResults),
    qualityRollupPath: path.join(cohortDir, "QualityRollup.json"),
    variant: args.variant,
  };
  const rollupPath = path.resolve(workspaceRoot, args.outPath === "auto"
    ? path.join(cohortDir, "rollup.json")
    : args.outPath);
  await mkdir(path.dirname(rollupPath), { recursive: true });
  await writeFile(rollupPath, `${JSON.stringify(rollup, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ event: "cohort_completed", rollupPath, sites: sites.length }));
}

function summarizeQuality(result: CohortResult) {
  const scenarioQuality = result.scenarioQuality ?? [];
  const runtimeLimitations = summarizeModuleLimitations(result);
  return {
    actionCandidates: result.counts?.consentActionCandidates ?? 0,
    actionLimitations: scenarioQuality
      .filter((scenario) => scenario.passStatus === "limited")
      .map((scenario) => ({
        limitationReason: scenario.limitationReason ?? "unknown",
        scenario: scenario.scenario ?? "unknown",
      })),
    comparisons: result.counts?.consentFlowComparisons ?? 0,
    networkRows: (result.counts?.networkEvents ?? 0) + (result.counts?.networkResponseEvents ?? 0),
    passingScenarios: scenarioQuality.filter((scenario) => scenario.passStatus === "passing").length,
    runtimeLimitations,
    screenshots: result.counts?.screenshots ?? 0,
    usefulRuntimeCoverage: (result.counts?.networkEvents ?? 0) > 0 && (result.counts?.networkResponseEvents ?? 0) > 0,
  };
}

function summarizeQualityHandling(result: CohortResult, siteMetadata: CohortSite | null) {
  const goldExpectedActionScenarios = (siteMetadata?.expectedLanes ?? [])
    .filter(isActionScenario);
  const plannedActionScenarios = uniqueStrings(result.shardSummary?.coordinatorPlannedScenarios ?? [])
    .filter((scenario) => scenario === "accept_all_flow" || scenario === "reject_all_flow" || scenario === "privacy_opt_out_flow");
  const coordinatorSkippedActionScenarios = (result.shardSummary?.coordinatorSkippedScenarios ?? [])
    .filter((scenario) => typeof scenario.scenario === "string" && isActionScenario(scenario.scenario))
    .map((scenario) => ({
      reasonCodes: Array.isArray(scenario.reasonCodes) ? scenario.reasonCodes.filter((code): code is string => typeof code === "string") : [],
      scenario: scenario.scenario as string,
      skipReason: typeof scenario.skipReason === "string" ? scenario.skipReason : "unknown",
    }));
  const coordinatorSkippedScenarioSet = new Set(coordinatorSkippedActionScenarios.map((scenario) => scenario.scenario));
  const scenarioQuality = result.scenarioQuality ?? [];
  const qualityByScenario = new Map(scenarioQuality.map((scenario) => [scenario.scenario, scenario]));
  const goldExpectedButNotPlanned = goldExpectedActionScenarios
    .filter((scenario) => !plannedActionScenarios.includes(scenario) && !qualityByScenario.has(scenario))
    .map((scenario) => ({
      scenario,
      skip: coordinatorSkippedActionScenarios.find((skipped) => skipped.scenario === scenario) ?? null,
    }));
  const handledActionScenarios = uniqueStrings([
    ...plannedActionScenarios,
    ...goldExpectedActionScenarios.filter((scenario) => qualityByScenario.has(scenario)),
  ]);
  const handledScenarios = handledActionScenarios.map((scenario) => {
    const quality = qualityByScenario.get(scenario);
    if (quality) {
      return {
        artifactPresent: true,
        limitationReason: quality.limitationReason ?? null,
        passStatus: quality.passStatus ?? "unknown",
        scenario,
      };
    }
    return {
      artifactPresent: false,
      limitationReason: result.error ? "cohort_site_failed_before_scenario_quality" : "planned_action_scenario_missing_quality_artifact",
      passStatus: "limited",
      scenario,
    };
  });
  const screenshotCount = result.counts?.screenshots ?? 0;
  const runtimeLimitations = summarizeModuleLimitations(result);
  const allPlannedActionScenariosExplicit = handledScenarios.every((scenario) =>
    scenario.passStatus === "passing" ||
    (scenario.passStatus === "limited" &&
      typeof scenario.limitationReason === "string" &&
      scenario.limitationReason.length > 0 &&
      !isVagueActionLimitation(scenario.limitationReason, qualityByScenario.get(scenario.scenario)))
  );
  const screenshotStatus = {
    count: screenshotCount,
    limitationReason: screenshotCount === 1 ? null : screenshotCount === 0 ? "diagnostic_screenshot_missing" : "multiple_diagnostic_screenshots_retained",
    passStatus: screenshotCount === 1 ? "passing" : "limited",
  };
  const screenshotHandled = screenshotStatus.passStatus === "passing" ||
    (typeof screenshotStatus.limitationReason === "string" && screenshotStatus.limitationReason.length > 0);
  const runtimeHandled = runtimeLimitations.length === 0 ||
    runtimeLimitations.every((limitation) => limitation.limitationReason.length > 0);
  return {
    allPlannedActionScenariosHandled: handledScenarios.every((scenario) => scenario.artifactPresent && scenario.passStatus !== "unknown"),
    allPlannedActionScenariosExplicit,
    coordinatorSkippedActionScenarios,
    goldExpectedActionScenarios,
    goldExpectedButNotPlanned,
    handledScenarios,
    plannedActionScenarios,
    runtimeHealth: {
      limitationReason: runtimeLimitations.length > 0 ? "scanner_module_failures_observed" : null,
      passStatus: runtimeLimitations.length > 0 ? "limited" : "passing",
      runtimeLimitations,
    },
    screenshotStatus,
    siteQualityHandled: allPlannedActionScenariosExplicit &&
      screenshotHandled &&
      runtimeHandled &&
      goldExpectedButNotPlanned.every((entry) => entry.skip !== null && coordinatorSkippedScenarioSet.has(entry.scenario)),
    siteQualityPassed: handledScenarios.every((scenario) => scenario.artifactPresent && scenario.passStatus === "passing") &&
      goldExpectedButNotPlanned.length === 0 &&
      screenshotCount === 1 &&
      runtimeLimitations.length === 0,
  };
}

function summarizeCohort(results: CohortRollupResult[]) {
  const completed = results.filter((result) => !result.error && result.resultStatus === "completed");
  const usefulRuntimeCoverage = completed.filter((result) => result.quality.usefulRuntimeCoverage);
  const screenshotCoverage = completed.filter((result) => (result.counts?.screenshots ?? 0) === 1);
  const qualityHandled = completed.filter((result) => result.qualityHandling.siteQualityHandled);
  const qualityPassed = completed.filter((result) => result.qualityHandling.siteQualityPassed);
  const durations = completed
    .map((result) => result.elapsedMs)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    .sort((left, right) => left - right);
  return {
    completed: completed.length,
    failed: results.length - completed.length,
    p50ElapsedMs: percentile(durations, 0.5),
    p90ElapsedMs: percentile(durations, 0.9),
    qualityHandled: qualityHandled.length,
    qualityPassed: qualityPassed.length,
    sites: results.length,
    usefulRuntimeCoverage: usefulRuntimeCoverage.length,
    oneScreenshotRetained: screenshotCoverage.length,
  };
}

function buildLocalLambdaQualityReport(input: {
  result: CohortResult & { error?: string; site: string; summaryPath: string };
  rollupResult: Omit<CohortRollupResult, "qualityReport"> & {
    shardSummary?: CohortResult["shardSummary"];
    site?: string;
    summaryPath?: string;
    targetUrl?: string;
  };
  siteMetadata: CohortSite | null;
}): LocalLambdaQualityReport {
  const result = input.result;
  const qualityHandling = input.rollupResult.qualityHandling;
  const plannedActionScenarios = new Set(qualityHandling.plannedActionScenarios);
  const skippedByScenario = new Map(qualityHandling.coordinatorSkippedActionScenarios.map((scenario) => [scenario.scenario, scenario]));
  const qualityByScenario = new Map((result.scenarioQuality ?? [])
    .filter((scenario) => typeof scenario.scenario === "string")
    .map((scenario) => [scenario.scenario as string, scenario]));
  const expectedByGold = new Set(qualityHandling.goldExpectedActionScenarios);
  const reportScenarios = uniqueStrings([
    ...qualityHandling.plannedActionScenarios,
    ...qualityHandling.goldExpectedActionScenarios,
    ...(result.scenarioQuality ?? []).flatMap((scenario) => typeof scenario.scenario === "string" && isActionScenario(scenario.scenario) ? [scenario.scenario] : []),
  ]).filter(isActionScenario);
  const artifactMirrorStatus = (result.manifest?.auxiliaryArtifactCount ?? 0) > 0 ? "present" : "missing_or_unknown";
  const scenarios = reportScenarios.map((scenario) => {
    const quality = qualityByScenario.get(scenario);
    const skipped = skippedByScenario.get(scenario) ?? null;
    const actionAttempted = typeof quality?.action?.attempted === "boolean" ? quality.action.attempted : null;
    const actionOutcome = typeof quality?.action?.outcome === "string" ? quality.action.outcome : null;
    const scenarioExpectedByGold = expectedByGold.has(scenario);
    const scenarioPlannedByCoordinator = plannedActionScenarios.has(scenario);
    const scenarioExercisedByWorker = Boolean(quality);
    const strictPass = (scenarioPlannedByCoordinator || scenarioExercisedByWorker) &&
      quality?.artifactPresent !== false &&
      quality?.passStatus === "passing" &&
      actionOutcome === "succeeded";
    const failureTaxonomy = classifyScenarioFailure({
      actionAttempted,
      actionOutcome,
      artifactMirrorStatus,
      expectedByGold: expectedByGold.has(scenario),
      exercisedByWorker: scenarioExercisedByWorker,
      plannedByCoordinator: plannedActionScenarios.has(scenario),
      quality,
      result,
      scenario,
      screenshotStatus: qualityHandling.screenshotStatus,
      skipped,
    });
    return {
      actionAttempted,
      actionCandidatesFound: numberOrNull(quality?.counts?.actionCandidatesFound),
      actionOutcome,
      actionSucceeded: actionOutcome === "succeeded" ? true : actionOutcome ? false : null,
      artifactPresent: Boolean(quality),
      artifactMirrorStatus,
      cookieStorageCounts: {
        cookiesAfterAction: numberOrNull(quality?.counts?.cookiesAfterAction),
        cookiesBeforeAction: numberOrNull(quality?.counts?.cookiesBeforeAction),
        storageAfterAction: numberOrNull(quality?.counts?.storageAfterAction),
        storageBeforeAction: numberOrNull(quality?.counts?.storageBeforeAction),
      },
      evidenceExcerptCount: numberOrNull(quality?.counts?.evidenceExcerpts),
      expectedByGold: scenarioExpectedByGold,
      exercisedByWorker: scenarioExercisedByWorker,
      failureTaxonomy,
      finalWindowRequestRatePerSecond: numberOrNull(quality?.counts?.finalWindowRequestRatePerSecond),
      goldExpectedLane: scenarioExpectedByGold ? scenario : null,
      limitationReason: quality
        ? typeof quality.limitationReason === "string" ? quality.limitationReason : null
        : skipped?.skipReason ?? null,
      passStatus: typeof quality?.passStatus === "string" ? quality.passStatus : quality ? "unknown" : skipped ? "limited" : "missing",
      plannedByCoordinator: scenarioPlannedByCoordinator,
      postActionRequestCount: numberOrNull(quality?.counts?.postActionRequests),
      requestCount: numberOrNull(quality?.counts?.requests),
      responseCount: numberOrNull(quality?.counts?.responses),
      scenario,
      score: scenarioQualityScore({ actionOutcome, failureTaxonomy, quality, strictPass }),
      skippedByCoordinator: skipped ? {
        reasonCodes: skipped.reasonCodes,
        skipReason: skipped.skipReason,
      } : null,
      strictPass,
      workerLane: workerLaneForScenario(scenario, result.shardSummary),
    } satisfies LocalLambdaQualityScenarioReport;
  });
  const actionScenarios = scenarios.filter((scenario) => scenario.plannedByCoordinator || scenario.exercisedByWorker || scenario.expectedByGold);
  const topFailureBuckets = topFailureBucketsForReport(scenarios, actionScenarios.length);
  const attempted = actionScenarios.filter((scenario) => scenario.actionAttempted === true);
  const succeeded = actionScenarios.filter((scenario) => scenario.actionOutcome === "succeeded");
  const strictQualityPassed = qualityHandling.siteQualityPassed && actionScenarios.length > 0 && scenarios.every((scenario) =>
    (!scenario.plannedByCoordinator && !scenario.expectedByGold && !scenario.exercisedByWorker) || scenario.strictPass
  );
  return {
    artifactOnly: true,
    artifactVersion: "certscore.v2.local_lambda_quality_report.v1",
    generatedAt: new Date().toISOString(),
    productionFindingIntegration: false,
    resultStatus: input.rollupResult.resultStatus,
    scanId: result.scanId,
    score: {
      actionAttemptedRate: ratio(attempted.length, Math.max(1, actionScenarios.length)),
      actionSucceededRate: ratio(succeeded.length, Math.max(1, actionScenarios.length)),
      scenarioAverage: scenarios.length > 0 ? Math.round(scenarios.reduce((sum, scenario) => sum + scenario.score, 0) / scenarios.length) : 0,
      strictPass: strictQualityPassed,
    },
    screenshotStatus: qualityHandling.screenshotStatus,
    scenarios,
    site: result.site,
    siteMetadata: input.siteMetadata,
    strictQualityPassed,
    summary: {
      explicitLimitations: actionScenarios.filter((scenario) => scenario.passStatus === "limited" && scenario.limitationReason).length +
        (actionScenarios.length === 0 ? 1 : 0),
      missingArtifacts: actionScenarios.filter((scenario) => !scenario.artifactPresent).length,
      plannedActionScenarios: actionScenarios.length,
      strictPassingScenarios: actionScenarios.filter((scenario) => scenario.strictPass).length,
      silentFailures: actionScenarios.filter((scenario) => scenario.failureTaxonomy.includes("unknown_or_unclassified_limitation")).length,
      vagueActionLimitations: actionScenarios.filter((scenario) => scenario.failureTaxonomy.includes("vague_action_limitation")).length,
    },
    targetUrl: result.targetUrl,
    topFailureBuckets,
    usefulRuntimeCoverage: input.rollupResult.quality.usefulRuntimeCoverage,
  };
}

function classifyScenarioFailure(input: {
  actionAttempted: boolean | null;
  actionOutcome: string | null;
  artifactMirrorStatus: "present" | "missing_or_unknown";
  expectedByGold: boolean;
  exercisedByWorker: boolean;
  plannedByCoordinator: boolean;
  quality: CohortResult["scenarioQuality"] extends Array<infer T> ? T | undefined : never;
  result: CohortResult;
  scenario: string;
  screenshotStatus: ReturnType<typeof summarizeQualityHandling>["screenshotStatus"];
  skipped: { reasonCodes: string[]; scenario: string; skipReason: string } | null;
}): FailureTaxonomy[] {
  const buckets = new Set<FailureTaxonomy>();
  if (input.expectedByGold && !input.plannedByCoordinator && !input.exercisedByWorker) {
    buckets.add("gold_expected_lane_not_planned");
    buckets.add("coordinator_planning_miss");
  }
  if (input.plannedByCoordinator && !input.quality) {
    buckets.add("worker_artifact_missing");
  }
  if (input.screenshotStatus.passStatus !== "passing") {
    buckets.add("screenshot_missing_or_extra");
  }
  if (input.artifactMirrorStatus === "missing_or_unknown") {
    buckets.add("artifact_mirror_incomplete");
  }
  const reason = input.quality
    ? typeof input.quality.limitationReason === "string" ? input.quality.limitationReason : ""
    : input.skipped?.skipReason ?? "";
  const reasonCodes = input.quality ? [] : input.skipped?.reasonCodes ?? [];
  if (/cmp_or_banner_not_observed/.test(reason) || reasonCodes.includes("cmp_or_banner_not_observed")) {
    buckets.add("cmp_or_banner_not_observed");
  }
  if (/cmp_runtime_without_actionable_surface|cmp_dom_observed_without_actionable_control/.test(reason) ||
    reasonCodes.includes("cmp_runtime_without_actionable_surface")) {
    buckets.add("cmp_observed_without_actionable_surface");
  }
  if (/opener_not_found|preference.*opener/i.test(reason)) {
    buckets.add("opener_not_found");
  }
  if (/privacy_control_not_observed/.test(reason)) {
    buckets.add("privacy_control_not_observed");
  }
  if (/second_layer_not_observed/.test(reason)) {
    buckets.add("second_layer_not_observed");
  }
  if (/preference_(?:center|surface).*without_(?:accept|reject|target)_action|preference_center_(?:accept|reject)_not_observed|preference_center_reject_path_not_completed/.test(reason)) {
    buckets.add("preference_center_action_not_observed");
  }
  if (/action_not_found|candidate_not_observed|without_(accept|reject|target)_action/.test(reason)) {
    buckets.add("target_action_not_found");
  }
  if (input.actionAttempted === true && input.actionOutcome !== "succeeded") {
    buckets.add("action_attempted_not_succeeded");
  }
  if (/manual_review_required_custom_privacy_form/.test(reason)) {
    buckets.add("manual_review_required_custom_privacy_form");
  }
  if (/privacy_center_surface_observed_without_verifiable_opt_out_control/.test(reason)) {
    buckets.add("privacy_center_surface_observed_without_verifiable_opt_out_control");
  }
  if (/privacy_control_click_without_verifiable_state_change/.test(reason)) {
    buckets.add("privacy_control_click_without_verifiable_state_change");
  }
  if (/privacy_control_observed_without_clickable_target/.test(reason)) {
    buckets.add("privacy_control_observed_without_clickable_target");
  }
  if (/privacy_control_target_closed_before_quality_artifact/.test(reason)) {
    buckets.add("privacy_control_target_closed_before_quality_artifact");
  }
  if (/planner_text_control_not_reacquired/.test(reason)) {
    buckets.add("planner_text_control_not_reacquired");
  }
  if (isVagueActionLimitation(reason, input.quality)) {
    buckets.add("vague_action_limitation");
  }
  if (/post_action.*tail/.test(reason)) {
    buckets.add("post_action_tail_missing");
  }
  if (/near_zero_runtime_evidence/.test(reason)) {
    buckets.add("near_zero_runtime_evidence");
  }
  if (/request_response_evidence_below_threshold/.test(reason)) {
    buckets.add("request_response_evidence_below_threshold");
  }
  if (/evidence_excerpts_below_threshold/.test(reason)) {
    buckets.add("evidence_excerpts_below_threshold");
  }
  if (/browser_or_context_closed_before_quality_artifact/.test(reason)) {
    buckets.add("browser_or_context_closed_before_quality_artifact");
  }
  if (/scenario_deadline_before_quality_artifact/.test(reason)) {
    buckets.add("scenario_deadline_before_quality_artifact");
  }
  if (/scenario_failed_before_quality_artifact/.test(reason)) {
    buckets.add("scenario_failed_before_quality_artifact");
  }
  if (input.quality?.passStatus === "limited" && buckets.size === 0) {
    buckets.add("unknown_or_unclassified_limitation");
  }
  return [...buckets].sort();
}

function scenarioQualityScore(input: {
  actionOutcome: string | null;
  failureTaxonomy: FailureTaxonomy[];
  quality: CohortResult["scenarioQuality"] extends Array<infer T> ? T | undefined : never;
  strictPass: boolean;
}) {
  if (input.strictPass) {
    return 100;
  }
  if (!input.quality) {
    return 0;
  }
  let score = input.quality.passStatus === "passing" ? 70 : 45;
  if (input.actionOutcome === "attempted_not_succeeded") score -= 20;
  if (input.failureTaxonomy.includes("browser_or_context_closed_before_quality_artifact")) score -= 30;
  if (input.failureTaxonomy.includes("scenario_deadline_before_quality_artifact")) score -= 30;
  if (input.failureTaxonomy.includes("scenario_failed_before_quality_artifact")) score -= 30;
  if (input.failureTaxonomy.includes("preference_center_action_not_observed")) score -= 15;
  if (input.failureTaxonomy.includes("worker_artifact_missing")) score -= 40;
  if (input.failureTaxonomy.includes("unknown_or_unclassified_limitation")) score -= 15;
  if (input.failureTaxonomy.includes("vague_action_limitation")) score -= 20;
  return Math.max(0, Math.min(100, score));
}

function isVagueActionLimitation(
  reason: string,
  quality: CohortResult["scenarioQuality"] extends Array<infer T> ? T | undefined : never,
) {
  if (!reason || quality?.passStatus !== "limited") {
    return false;
  }
  const hasRuntimeEvidence = (quality.counts?.postActionRequests ?? 0) > 0 ||
    (quality.counts?.evidenceExcerpts ?? 0) > 0 ||
    (quality.counts?.requests ?? 0) >= 25 ||
    (quality.counts?.responses ?? 0) >= 10;
  const attempted = quality.action?.attempted === true;
  return attempted && hasRuntimeEvidence && /banner_still_present_after_click|action_not_completed|attempted_not_succeeded/.test(reason);
}

async function writePerSiteQualityReports(input: {
  cohortDir: string;
  results: Array<CohortRollupResult & {
    site: string;
    summaryPath: string;
    qualityReport: LocalLambdaQualityReport;
  }>;
}) {
  for (const result of input.results) {
    const report = result.qualityReport;
    const slug = siteSlug(result.site);
    const cohortJsonPath = path.join(input.cohortDir, `${slug}.LocalLambdaQualityReport.json`);
    const cohortMdPath = path.join(input.cohortDir, `${slug}.LocalLambdaQualityReport.md`);
    await writeFile(cohortJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await writeFile(cohortMdPath, `${qualityReportMarkdown(report)}\n`, "utf8");
    const artifactRoot = path.dirname(result.summaryPath).endsWith(input.cohortDir)
      ? undefined
      : undefined;
    const sourceSummary = readSummaryArtifactRoot(result.summaryPath);
    if (sourceSummary) {
      await writeFile(path.join(sourceSummary, "LocalLambdaQualityReport.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8").catch(() => undefined);
      await writeFile(path.join(sourceSummary, "LocalLambdaQualityReport.md"), `${qualityReportMarkdown(report)}\n`, "utf8").catch(() => undefined);
    }
    void artifactRoot;
  }
}

function readSummaryArtifactRoot(summaryPath: string): string | undefined {
  try {
    const summary = JSON.parse(readFileSync(summaryPath, "utf8")) as { artifactRoot?: unknown };
    return typeof summary.artifactRoot === "string" ? summary.artifactRoot : undefined;
  } catch {
    return undefined;
  }
}

function readCompletedSiteSummary(summaryPath: string, scanId: string): CohortResult | null {
  try {
    const summary = JSON.parse(readFileSync(summaryPath, "utf8")) as CohortResult;
    if (summary.scanId === scanId && summary.resultStatus === "completed") {
      return summary;
    }
  } catch {
    return null;
  }
  return null;
}

function buildQualityRollup(input: {
  architectureDiscipline: unknown;
  cohortId: string;
  cohortManifestPath: string;
  generatedAt: string;
  results: Array<CohortRollupResult & {
    qualityReport: LocalLambdaQualityReport;
    site: string;
  }>;
  variant: string;
}) {
  const reports = input.results.map((result) => result.qualityReport);
  const allBuckets = mergeFailureBucketCounts(reports.flatMap((report) => report.topFailureBuckets));
  return {
    artifactOnly: true,
    architectureDiscipline: input.architectureDiscipline,
    artifactVersion: "certscore.v2.local_lambda_quality_rollup.v1",
    cohortId: input.cohortId,
    cohortManifestPath: input.cohortManifestPath,
    generatedAt: input.generatedAt,
    productionFindingIntegration: false,
    reports: reports.map((report) => ({
      actionAttemptedRate: report.score.actionAttemptedRate,
      actionSucceededRate: report.score.actionSucceededRate,
      explicitLimitations: report.summary.explicitLimitations,
      scenarioAverage: report.score.scenarioAverage,
      site: report.site,
      strictQualityPassed: report.strictQualityPassed,
      strictPassingScenarios: report.summary.strictPassingScenarios,
      topFailureBuckets: report.topFailureBuckets,
      vagueActionLimitations: report.summary.vagueActionLimitations,
    })),
    summary: {
      explicitLimitations: reports.reduce((sum, report) => sum + report.summary.explicitLimitations, 0),
      missingArtifacts: reports.reduce((sum, report) => sum + report.summary.missingArtifacts, 0),
      scenarioAverage: reports.length > 0 ? Math.round(reports.reduce((sum, report) => sum + report.score.scenarioAverage, 0) / reports.length) : 0,
      silentFailures: reports.reduce((sum, report) => sum + report.summary.silentFailures, 0),
      sites: reports.length,
      strictQualityPassed: reports.filter((report) => report.strictQualityPassed).length,
      usefulRuntimeCoverage: reports.filter((report) => report.usefulRuntimeCoverage).length,
      vagueActionLimitations: reports.reduce((sum, report) => sum + report.summary.vagueActionLimitations, 0),
    },
    topFailureBuckets: allBuckets,
    variant: input.variant,
  };
}

function qualityReportMarkdown(report: LocalLambdaQualityReport) {
  const lines = [
    `# Local Lambda Quality Report: ${report.site}`,
    "",
    `- Scan ID: ${report.scanId ?? "unknown"}`,
    `- Result status: ${report.resultStatus}`,
    `- Strict quality passed: ${report.strictQualityPassed ? "yes" : "no"}`,
    `- Scenario average score: ${report.score.scenarioAverage}`,
    `- Action attempted rate: ${formatPct(report.score.actionAttemptedRate)}`,
    `- Action succeeded rate: ${formatPct(report.score.actionSucceededRate)}`,
    `- Useful runtime coverage: ${report.usefulRuntimeCoverage ? "yes" : "no"}`,
    `- Screenshot status: ${report.screenshotStatus.passStatus} (${report.screenshotStatus.count})`,
    "",
    "## Scenarios",
    "",
    "| Scenario | Strict pass | Status | Limitation | Buckets | Requests/Responses | Evidence | Worker |",
    "|---|---:|---|---|---|---:|---:|---|",
    ...report.scenarios.map((scenario) =>
      `| ${scenario.scenario} | ${scenario.strictPass ? "yes" : "no"} | ${scenario.passStatus} | ${scenario.limitationReason ?? ""} | ${scenario.failureTaxonomy.join(", ")} | ${scenario.requestCount ?? 0}/${scenario.responseCount ?? 0} | ${scenario.evidenceExcerptCount ?? 0} | ${scenario.workerLane ?? ""} |`
    ),
    "",
    "## Top Failure Buckets",
    "",
    ...report.topFailureBuckets.map((bucket) => `- ${bucket.bucket}: ${bucket.count}`),
  ];
  return lines.join("\n");
}

function qualityRollupMarkdown(rollup: ReturnType<typeof buildQualityRollup>) {
  const lines = [
    "# Local Lambda Quality Rollup",
    "",
    `- Cohort ID: ${rollup.cohortId}`,
    `- Variant: ${rollup.variant}`,
    `- Sites: ${rollup.summary.sites}`,
    `- Strict quality passed: ${rollup.summary.strictQualityPassed}/${rollup.summary.sites}`,
    `- Useful runtime coverage: ${rollup.summary.usefulRuntimeCoverage}/${rollup.summary.sites}`,
    `- Explicit limitations: ${rollup.summary.explicitLimitations}`,
    `- Vague action limitations: ${rollup.summary.vagueActionLimitations}`,
    `- Silent failures: ${rollup.summary.silentFailures}`,
    `- Scenario average score: ${rollup.summary.scenarioAverage}`,
    "",
    "## Sites",
    "",
    "| Site | Strict pass | Score | Attempted | Succeeded | Limitations | Top buckets |",
    "|---|---:|---:|---:|---:|---:|---|",
    ...rollup.reports.map((report) =>
      `| ${report.site} | ${report.strictQualityPassed ? "yes" : "no"} | ${report.scenarioAverage} | ${formatPct(report.actionAttemptedRate)} | ${formatPct(report.actionSucceededRate)} | ${report.explicitLimitations} | ${report.topFailureBuckets.map((bucket) => `${bucket.bucket}:${bucket.count}`).join(", ")} |`
    ),
    "",
    "## Top Failure Buckets",
    "",
    ...rollup.topFailureBuckets.map((bucket) => `- ${bucket.bucket}: ${bucket.count}`),
  ];
  return lines.join("\n");
}

function topFailureBucketsFromScenarios(scenarios: Array<{ failureTaxonomy: FailureTaxonomy[] }>) {
  const counts = new Map<FailureTaxonomy, number>();
  for (const scenario of scenarios) {
    for (const bucket of scenario.failureTaxonomy) {
      counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([bucket, count]) => ({ bucket, count }))
    .sort((left, right) => right.count - left.count || left.bucket.localeCompare(right.bucket));
}

function topFailureBucketsForReport(
  scenarios: Array<{ failureTaxonomy: FailureTaxonomy[] }>,
  actionScenarioCount: number,
) {
  const buckets = topFailureBucketsFromScenarios(scenarios);
  if (actionScenarioCount > 0) {
    return buckets;
  }
  return topFailureBucketsFromScenarios([
    ...scenarios,
    { failureTaxonomy: ["no_relevant_action_scenarios"] },
  ]);
}

function mergeFailureBucketCounts(buckets: Array<{ bucket: FailureTaxonomy; count: number }>) {
  const counts = new Map<FailureTaxonomy, number>();
  for (const bucket of buckets) {
    counts.set(bucket.bucket, (counts.get(bucket.bucket) ?? 0) + bucket.count);
  }
  return [...counts.entries()]
    .map(([bucket, count]) => ({ bucket, count }))
    .sort((left, right) => right.count - left.count || left.bucket.localeCompare(right.bucket));
}

function workerLaneForScenario(scenario: string, shardSummary?: CohortResult["shardSummary"]) {
  const workers = shardSummary?.workerResults ?? [];
  if (scenario === "accept_all_flow") {
    return workers.find((worker) => worker.workerLane === "accept_only" || worker.workerLane === "accept_gpc")?.workerLane ?? null;
  }
  if (scenario === "gpc_enabled") {
    return workers.find((worker) => worker.workerLane === "accept_gpc")?.workerLane ?? null;
  }
  if (scenario === "reject_all_flow" || scenario === "privacy_opt_out_flow") {
    return workers.find((worker) => worker.workerLane === "reject_manage" || worker.workerLane === "consent_flows")?.workerLane ?? null;
  }
  return null;
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function ratio(numerator: number, denominator: number) {
  return denominator <= 0 ? 0 : Number((numerator / denominator).toFixed(3));
}

function formatPct(value: number) {
  return `${Math.round(value * 1000) / 10}%`;
}

function summarizeModuleLimitations(result: CohortResult) {
  return (result.moduleRuns ?? [])
    .filter((moduleRun) => moduleRun.status === "failed")
    .map((moduleRun) => ({
      errors: (moduleRun.errors ?? []).slice(0, 3),
      limitationReason: "scanner_module_failed",
      moduleName: moduleRun.moduleName ?? "unknown",
    }));
}

function isActionScenario(scenario: string) {
  return scenario === "accept_all_flow" || scenario === "reject_all_flow" || scenario === "privacy_opt_out_flow";
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)];
}

function percentile(values: number[], percentileValue: number) {
  if (values.length === 0) {
    return null;
  }
  const index = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * percentileValue) - 1));
  return values[index] ?? null;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    artifactDir: "artifacts/local-v2-dag-lambda-parity/cohorts",
    cohort: "difficult-10",
    limit: null,
    outPath: "auto",
    siteTimeoutMs: 180_000,
    sites: difficult10Sites(),
    variant: "local-parity-quality-cohort",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      continue;
    } else if (arg === "--artifact-dir") {
      args.artifactDir = requiredValue(argv, ++index, arg);
    } else if (arg === "--cohort") {
      const cohort = requiredValue(argv, ++index, arg);
      if (cohort !== "difficult-10" && cohort !== "difficult-gold-30") {
        throw new Error(`Unsupported cohort: ${cohort}`);
      }
      args.cohort = cohort;
      args.sites = cohort === "difficult-gold-30"
        ? difficultGold30Sites()
        : difficult10Sites();
    } else if (arg === "--limit") {
      args.limit = Number.parseInt(requiredValue(argv, ++index, arg), 10);
      if (!Number.isFinite(args.limit) || args.limit < 1) {
        throw new Error("--limit must be a positive integer.");
      }
    } else if (arg === "--out") {
      args.outPath = requiredValue(argv, ++index, arg);
    } else if (arg === "--site-timeout-ms") {
      args.siteTimeoutMs = Number.parseInt(requiredValue(argv, ++index, arg), 10);
      if (!Number.isFinite(args.siteTimeoutMs) || args.siteTimeoutMs < 30_000) {
        throw new Error("--site-timeout-ms must be at least 30000.");
      }
    } else if (arg === "--sites") {
      args.sites = requiredValue(argv, ++index, arg).split(",").map((site) => site.trim()).filter(Boolean).map((site) =>
        goldCohortSiteForUrl(site, "cli --sites") ?? {
          expectedLanes: [],
          primaryBucket: "manual_override",
          reasonCodes: ["manual_sites_override"],
          sector: "manual",
          site: siteSlug(site).replace(/-/g, "."),
          source: "cli --sites",
          url: normalizeTargetUrl(site),
        }
      );
    } else if (arg === "--variant") {
      args.variant = requiredValue(argv, ++index, arg);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function failedSiteSummary(input: {
  error: string;
  scanId: string;
  site: string;
  siteMetadata: CohortSite;
  summaryPath: string;
  targetUrl: string;
}): CohortResult {
  const timeout = /timed out/i.test(input.error);
  return {
    counts: {
      consentActionAttempts: 0,
      consentActionCandidates: 0,
      consentFlowComparisons: 0,
      evidenceExcerpts: 0,
      networkEvents: 0,
      networkResponseEvents: 0,
      screenshots: 0,
    },
    manifest: {
      auxiliaryArtifactCount: 0,
      hasCoordinatorPlanSummary: false,
    },
    moduleRuns: [{
      errors: [input.error],
      moduleName: "local_lambda_parity_cohort_site",
      status: "failed",
    }],
    resultStatus: "failed",
    scanId: input.scanId,
    scenarioQuality: input.siteMetadata.expectedLanes
      .filter(isActionScenario)
      .map((scenario) => ({
        action: {
          attempted: false,
          outcome: "not_attempted",
        },
        artifactPresent: false,
        counts: {
          actionCandidatesFound: 0,
          activeRequestsAtClose: 0,
          cookiesAfterAction: null,
          cookiesBeforeAction: null,
          evidenceExcerpts: 0,
          failedRequests: 0,
          finalWindowRequestRatePerSecond: 0,
          postActionRequests: 0,
          requests: 0,
          responses: 0,
          storageAfterAction: null,
          storageBeforeAction: null,
        },
        limitationReason: timeout ? "cohort_site_timeout_before_scenario_quality" : "cohort_site_failed_before_scenario_quality",
        passStatus: "limited",
        scenario,
      })),
    shardSummary: {
      coordinatorPlannedScenarios: [],
      coordinatorSkippedScenarios: input.siteMetadata.expectedLanes
        .filter(isActionScenario)
        .map((scenario) => ({
          reasonCodes: ["cohort_site_failed"],
          scenario,
          skipReason: timeout ? "cohort_site_timeout" : "cohort_site_failed",
        })),
      workerResults: [],
    },
    targetUrl: input.targetUrl,
  };
}

function difficultGold30Sites(): CohortSite[] {
  const expansion = readGoldExpansionCandidates();
  const byUrl = new Map<string, CohortSite>();
  byUrl.set(normalizeTargetUrl(WEBMD_REGRESSION_SITE.url), WEBMD_REGRESSION_SITE);
  for (const candidate of expansion
    .map((entry) => ({ entry, score: goldDifficultyScore(entry) }))
    .sort((left, right) => right.score - left.score || left.entry.url.localeCompare(right.entry.url))) {
    if (byUrl.size >= 30) {
      break;
    }
    const site = siteFromUrl(candidate.entry.url);
    byUrl.set(normalizeTargetUrl(candidate.entry.url), {
      expectedLanes: candidate.entry.expectedLanes,
      primaryBucket: candidate.entry.primaryBucket,
      reasonCodes: [
        `gold_bucket:${candidate.entry.primaryBucket}`,
        `sector:${candidate.entry.sector}`,
        `difficulty_score:${candidate.score}`,
        ...(candidate.entry.expectedLanes.includes("reject_all_flow") ? ["requires_reject_flow"] : []),
        ...(candidate.entry.expectedLanes.includes("privacy_opt_out_flow") ? ["requires_privacy_opt_out_flow"] : []),
        ...(candidate.entry.expectedLanes.includes("form_collection_probe") ? ["requires_form_collection_probe"] : []),
      ],
      ...(candidate.entry.seedUrls ? { seedUrls: candidate.entry.seedUrls } : {}),
      sector: candidate.entry.sector,
      site,
      source: "docs/certscore-v2/gold-corpus-expansion-50.jsonl",
      url: normalizeTargetUrl(candidate.entry.url),
    });
  }
  return [...byUrl.values()].slice(0, 30);
}

function difficult10Sites(): CohortSite[] {
  return DEFAULT_SITES.map((site) =>
    goldCohortSiteForUrl(site, "difficult_10_gold_metadata") ?? {
      expectedLanes: [],
      primaryBucket: "difficult_10_existing",
      reasonCodes: ["existing_difficult_local_parity_cohort"],
      sector: "mixed",
      site,
      source: "scripts/run-local-v2-dag-lambda-parity-cohort.ts",
      url: normalizeTargetUrl(site),
    }
  );
}

function goldCohortSiteForUrl(siteUrl: string, source: string): CohortSite | null {
  const site = siteFromUrl(siteUrl);
  if (site === WEBMD_REGRESSION_SITE.site) {
    return { ...WEBMD_REGRESSION_SITE, source };
  }
  const candidate = readGoldExpansionCandidates().find((entry) => siteFromUrl(entry.url) === site);
  if (!candidate) {
    return null;
  }
  return {
    expectedLanes: candidate.expectedLanes,
    primaryBucket: candidate.primaryBucket,
    reasonCodes: [
      `gold_bucket:${candidate.primaryBucket}`,
      `sector:${candidate.sector}`,
      "gold_metadata_hydrated_for_local_lambda_parity",
      ...(candidate.expectedLanes.includes("reject_all_flow") ? ["requires_reject_flow"] : []),
      ...(candidate.expectedLanes.includes("accept_all_flow") ? ["requires_accept_flow"] : []),
      ...(candidate.expectedLanes.includes("privacy_opt_out_flow") ? ["requires_privacy_opt_out_flow"] : []),
    ].filter(Boolean),
    ...(candidate.seedUrls ? { seedUrls: candidate.seedUrls } : {}),
    sector: candidate.sector,
    site,
    source,
    url: normalizeTargetUrl(candidate.url),
  };
}

function readGoldExpansionCandidates(): Array<{
  expectedLanes: string[];
  primaryBucket: string;
  seedUrls?: {
    privacyOptOut?: string[];
  };
  sector: string;
  url: string;
}> {
  const filePath = path.join(process.cwd(), "docs", "certscore-v2", "gold-corpus-expansion-50.jsonl");
  try {
    return readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .map((line: string) => line.trim())
      .filter(Boolean)
      .map((line: string) => JSON.parse(line) as { expectedLanes?: unknown; primaryBucket?: unknown; sector?: unknown; seedUrls?: unknown; url?: unknown })
      .filter((entry) => typeof entry.url === "string")
      .map((entry) => ({
        expectedLanes: Array.isArray(entry.expectedLanes) ? entry.expectedLanes.filter((lane): lane is string => typeof lane === "string") : [],
        primaryBucket: typeof entry.primaryBucket === "string" ? entry.primaryBucket : "unknown",
        ...(parseGoldSeedUrls(entry.seedUrls) ? { seedUrls: parseGoldSeedUrls(entry.seedUrls) } : {}),
        sector: typeof entry.sector === "string" ? entry.sector : "unknown",
        url: entry.url as string,
      }));
  } catch {
    return [];
  }
}

function parseGoldSeedUrls(value: unknown): CohortSite["seedUrls"] | null {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const privacyOptOut = Array.isArray(record.privacyOptOut)
    ? record.privacyOptOut.filter((url): url is string => typeof url === "string" && /^https?:\/\//i.test(url)).slice(0, 3)
    : [];
  return privacyOptOut.length > 0 ? { privacyOptOut } : null;
}

function debugOverrideArgsForSite(site: CohortSite): string[] {
  const expectedConsentScenarios = site.expectedLanes.filter(isActionScenario);
  const privacyControlUrls = site.expectedLanes.includes("privacy_opt_out_flow")
    ? site.seedUrls?.privacyOptOut?.length
      ? site.seedUrls.privacyOptOut
      : fallbackPrivacyControlUrls(site.url)
    : [];
  if (expectedConsentScenarios.length === 0 && privacyControlUrls.length === 0) {
    return [];
  }
  return [
    "--debug-overrides",
    JSON.stringify({
      ...defaultLocalLambdaParityDebugOverrides(),
      expectedConsentScenarios,
      ...(privacyControlUrls.length > 0 ? { privacyControlUrls } : {}),
    }),
  ];
}

function defaultLocalLambdaParityDebugOverrides() {
  return {
    actionFinalSettleMs: 8000,
    actionSearchDeadlineMs: 12000,
    consentFlowDeadlineMs: 60000,
    oneTrustHiddenActionMode: "diagnostic",
    preActionObservationMs: 5000,
    scenarioConcurrency: 1,
    scenarioResourceMode: "cmp_safe",
    strongEvidenceMode: "webmd",
  };
}

function fallbackPrivacyControlUrls(siteUrl: string): string[] {
  let origin: string;
  try {
    origin = new URL(normalizeTargetUrl(siteUrl)).origin;
  } catch {
    return [];
  }
  return [
    "/privacy-choices",
    "/privacychoices",
    "/do-not-sell",
  ].map((pathname) => `${origin}${pathname}`);
}

function goldDifficultyScore(entry: { expectedLanes: string[]; primaryBucket: string; sector: string; url: string }) {
  const bucketScore: Record<string, number> = {
    complex_reject_flow: 100,
    sensitive_context_privacy: 90,
    privacy_opt_out_dnsmpi: 75,
    gpc_behavior: 55,
    no_banner_control: 20,
  };
  return (bucketScore[entry.primaryBucket] ?? 40) +
    (entry.expectedLanes.includes("reject_all_flow") ? 20 : 0) +
    (entry.expectedLanes.includes("accept_all_flow") ? 10 : 0) +
    (entry.expectedLanes.includes("privacy_opt_out_flow") ? 10 : 0) +
    (entry.expectedLanes.includes("form_collection_probe") ? 8 : 0) +
    (/media|health|finance|marketplace|retail/.test(entry.sector) ? 5 : 0);
}

function runCommand(command: string, args: string[], options: { timeoutMs: number }) {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    let timedOut = false;
    let killTimer: NodeJS.Timeout | undefined;
    const child = spawn(command, args, {
      cwd: process.cwd(),
      detached: process.platform !== "win32",
      env: process.env,
      stdio: "inherit",
    });
    const killChild = (signal: NodeJS.Signals) => {
      if (!child.pid) {
        return;
      }
      try {
        if (process.platform === "win32") {
          child.kill(signal);
        } else {
          process.kill(-child.pid, signal);
        }
      } catch {
        child.kill(signal);
      }
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      console.error(JSON.stringify({
        args,
        command,
        event: "cohort_site_command_timeout",
        timeoutMs: options.timeoutMs,
      }));
      killChild("SIGTERM");
      killTimer = setTimeout(() => {
        killChild("SIGKILL");
      }, 5_000);
    }, options.timeoutMs);
    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      if (killTimer) {
        clearTimeout(killTimer);
      }
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      if (killTimer) {
        clearTimeout(killTimer);
      }
      if (timedOut) {
        reject(new Error(`${command} ${args.join(" ")} timed out after ${options.timeoutMs}ms.`));
        return;
      }
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with ${code ?? "unknown"}.`));
      }
    });
  });
}

function normalizeTargetUrl(value: string) {
  return /^https?:\/\//i.test(value) ? value : `https://${value.replace(/^\/+/, "")}/`;
}

function siteSlug(value: string) {
  return value
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 48);
}

function siteFromUrl(value: string) {
  try {
    return new URL(normalizeTargetUrl(value)).hostname.replace(/^www\./i, "");
  } catch {
    return value.replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  }
}

function requiredValue(argv: string[], index: number, flag: string) {
  const value = argv[index];
  if (!value) {
    throw new Error(`Missing value for ${flag}.`);
  }
  return value;
}

function printUsage() {
  console.log([
    "Usage: pnpm v2:local-dag-lambda-parity-cohort -- [options]",
    "",
    "Runs local Lambda-parity scans across a difficult cohort and writes a quality-first rollup.",
    "",
    "Options:",
    "  --cohort difficult-10     Use the default difficult 10-site cohort.",
    "  --cohort difficult-gold-30 Use the derived 30-site gold-corpus difficult cohort.",
    "  --sites <csv>             Override sites.",
    "  --limit <n>               Run only the first n sites.",
    "  --site-timeout-ms <ms>    Per-site watchdog timeout. Default: 180000.",
    "  --artifact-dir <path>     Base output directory.",
    "  --out <path>              Rollup JSON path. Default: cohort-dir/rollup.json",
    "  --variant <label>         Variant label passed to each site run.",
  ].join("\n"));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
