import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { SCHEMA_VERSION, classifyPrivacySurface } from "../packages/certscore-contracts/src/index.js";
import { runScan, scanProfiles, policySurfaceScanner, type RunScanInput } from "../packages/certscore-scan-core/src/index.js";
import { createArtifactWriter } from "../packages/certscore-scan-core/src/artifact-writer.js";
import type { PolicyNanoAssistProvider } from "../packages/certscore-scan-core/src/scanners/policy-surface-scanner.js";

type CohortTarget = {
  key: string;
  lang: string;
  url: string;
};

type Args = {
  consentFlowScreenshotMode: "auto" | "none";
  continueOnError: boolean;
  limit?: number;
  onlyKeys: Set<string>;
  outDir: string;
  preset: "news21" | "targeted";
  profile: NonNullable<RunScanInput["profile"]>;
  resume: boolean;
  scanMode: "run-scan" | "policy-surface-only";
  skipScan: boolean;
  targetsPath?: string;
};

type CohortReport = {
  reportVersion: "certscore.multilingual_privacy_evidence_local_cohort.1";
  bottlenecks: {
    blockedPolicyAccessKeys: string[];
    candidateOnlyGdprKeys: string[];
    cmpWithoutDiagnosticOrProductionSurfaceKeys: string[];
    cmpWithoutActionableSurfaceKeys: string[];
    diagnosticOnlyConsentSurfaceKeys: string[];
    slowPolicySurfaceKeys: string[];
    slowPreConsentRuntimeKeys: string[];
    surfaceOnlyPolicyKeys: string[];
    visualCapturePlaceholderKeys: string[];
  };
  byLanguage: Array<{
    blockedPolicyAccess: number;
    candidateOnlyGdpr: number;
    consentAcceptObserved: number;
    consentOptionsObserved: number;
    consentRejectObserved: number;
    diagnosticConsentAccept: number;
    diagnosticConsentOptions: number;
    diagnosticConsentReject: number;
    diagnosticConsentSites: number;
    gdprCandidateSites: number;
    lang: string;
    legacySignalSites: number;
    policyFetchedSites: number;
    slowPolicySurfaceSites: number;
    slowPreConsentRuntimeSites: number;
    total: number;
    visualCapturePlaceholderSites: number;
  }>;
  generatedAt: string;
  gdprTopicCounts: Array<{ count: number; topic: string }>;
  guardrails: string[];
  outDir: string;
  profile: string;
  rows: CohortRow[];
  selection: {
    limit?: number;
    onlyKeys: string[];
    preset: Args["preset"];
    targetsPath?: string;
  };
  totals: {
    blockedPolicyAccess: number;
    consentAcceptObserved: number;
    consentOptionsObserved: number;
    consentRejectObserved: number;
    diagnosticConsentAccept: number;
    diagnosticConsentOptions: number;
    diagnosticConsentReject: number;
    diagnosticConsentSites: number;
    failed: number;
    gdprCandidateSites: number;
    policyFetchedSites: number;
    scanned: number;
    slowPolicySurface: number;
    slowPreConsentRuntime: number;
    total: number;
    visualCapturePlaceholder: number;
  };
};

type CohortRow = {
  key: string;
  lang: string;
  url: string;
  artifactDir: string;
  status: "completed" | "failed" | "missing_bundle";
  error?: string;
  scanId?: string;
  policy: {
    fetchedCount: number;
    fetchedSurfaceTypes: string[];
    failedCount: number;
    failureStatuses: string[];
    privacyFetched: number;
    cookieFetched: number;
    gdprCandidateCount: number;
    gdprCandidateProductionCreditCount: number;
    gdprCandidateTopics: string[];
    article13SignalCount: number;
    article13SignalTypes: string[];
    observedTopics: string[];
    checklistReadiness: "blocked_access" | "candidate_evidence_retained" | "legacy_signal_retained" | "surface_only" | "missing";
  };
  consent: {
    likelyPresent: boolean | null;
    uiControlCount: number;
    uiActionTypes: string[];
    cmpRuntimeCount: number;
    geometryAccept: boolean | null;
    geometryReject: boolean | null;
    geometryOptions: boolean | null;
    geometryCmpDetected: boolean | null;
    diagnosticAcceptLabels: string[];
    diagnosticOptionsLabels: string[];
    diagnosticRejectLabels: string[];
    limitationKeys: string[];
    screenshotCount: number;
    visualCaptureFailureReason?: string;
    visualCaptureMethod?: string;
    visualCapturePlaceholder: boolean;
    visualCaptureStatus?: string;
  };
  timing: {
    policySurfaceMs?: number;
    preConsentRuntimeMs?: number;
    scanCompleteMs?: number;
    slowPhaseLabels: string[];
  };
};

const DEFAULT_NEWS_TARGETS: CohortTarget[] = [
  { lang: "de", key: "de-ntv", url: "https://www.n-tv.de" },
  { lang: "de", key: "de-spiegel", url: "https://www.spiegel.de" },
  { lang: "de", key: "de-zeit", url: "https://www.zeit.de" },
  { lang: "en", key: "en-apnews", url: "https://apnews.com" },
  { lang: "en", key: "en-guardian", url: "https://www.theguardian.com" },
  { lang: "en", key: "en-reuters", url: "https://www.reuters.com" },
  { lang: "es", key: "es-elmundo", url: "https://www.elmundo.es" },
  { lang: "es", key: "es-elpais", url: "https://elpais.com" },
  { lang: "es", key: "es-lavanguardia", url: "https://www.lavanguardia.com" },
  { lang: "fr", key: "fr-france24", url: "https://www.france24.com" },
  { lang: "fr", key: "fr-lefigaro", url: "https://www.lefigaro.fr" },
  { lang: "fr", key: "fr-lemonde", url: "https://www.lemonde.fr" },
  { lang: "it", key: "it-ansa", url: "https://www.ansa.it" },
  { lang: "it", key: "it-corriere", url: "https://www.corriere.it" },
  { lang: "it", key: "it-repubblica", url: "https://www.repubblica.it" },
  { lang: "nl", key: "nl-nos", url: "https://nos.nl" },
  { lang: "nl", key: "nl-nunl", url: "https://www.nu.nl" },
  { lang: "nl", key: "nl-volkskrant", url: "https://www.volkskrant.nl" },
  { lang: "pl", key: "pl-onet", url: "https://www.onet.pl" },
  { lang: "pl", key: "pl-tvn24", url: "https://tvn24.pl" },
  { lang: "pl", key: "pl-wyborcza", url: "https://wyborcza.pl" },
];

const TARGETED_TARGETS = DEFAULT_NEWS_TARGETS.filter((target) =>
  new Set(["en-reuters", "es-elpais", "pl-tvn24", "nl-nos", "nl-nunl", "fr-lemonde", "it-corriere", "de-zeit"])
    .has(target.key)
);

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const targets = await selectTargets(args);
  await mkdir(args.outDir, { recursive: true });
  await writeTargetsFile(args.outDir, targets);

  const rows: CohortRow[] = [];
  for (const [index, target] of targets.entries()) {
    const artifactDir = path.join(args.outDir, target.key);
    const bundlePath = path.join(artifactDir, "CanonicalEvidenceBundle.json");
    await mkdir(artifactDir, { recursive: true });

    try {
      if (!args.skipScan && !(args.resume && existsSync(bundlePath))) {
        console.log(`[${index + 1}/${targets.length}] scanning ${target.key} ${target.url}`);
        if (args.scanMode === "policy-surface-only") {
          await runPolicySurfaceOnlyScan(target.url, artifactDir);
        } else {
          await runScan({
            url: target.url,
            profile: args.profile,
            outDir: artifactDir,
            consentFlowScreenshotMode: args.consentFlowScreenshotMode,
            preConsentScreenshotMode: "always",
          });
        }
      } else {
        console.log(`[${index + 1}/${targets.length}] summarizing ${target.key}`);
      }
      rows.push(await summarizeTarget(target, artifactDir, "completed"));
    } catch (error) {
      const row = failedRow(target, artifactDir, error);
      rows.push(row);
      if (!args.continueOnError) {
        await writeReport(args, rows);
        throw error;
      }
    }
    await writeReport(args, rows);
  }
}

async function runPolicySurfaceOnlyScan(url: string, artifactDir: string) {
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const normalizedUrl = normalizeTargetUrl(url);
  const artifactWriter = await createArtifactWriter(artifactDir);
  const result = await policySurfaceScanner({
    url,
    normalizedUrl,
    scanStartedAtMs: startedAtMs,
    internalBudgetMs: scanProfiles.policy.internalBudgetMs,
    artifactWriter,
    discoveryMode: "full",
    enableNanoPolicyAssist: true,
    nanoAssistProvider: createDeterministicPolicyAssistProvider(),
  });
  const completedAt = new Date().toISOString();
  await writeFile(path.join(artifactDir, "CanonicalEvidenceBundle.json"), `${JSON.stringify({
    scanId: `local_policy_surface_${startedAtMs}_${safeHostname(normalizedUrl)}`,
    url,
    normalizedUrl,
    startedAt,
    completedAt,
    scanProfile: scanProfiles.policy,
    modulesRun: [result.moduleRun],
    runtimeTimeline: [],
    networkEvents: [],
    networkResponseEvents: [],
    cookieEvents: [],
    cookieSnapshots: [],
    storageSnapshots: [],
    scriptEvents: [],
    iframeEvents: [],
    consentUiObservations: [],
    collectionSurfaceObservations: [],
    consentInteractionEvents: [],
    consentFlowObservations: [],
    consentActionCandidates: [],
    consentActionAttempts: [],
    consentFlowComparisons: [],
    policySurfaceObservations: result.policySurfaceObservations,
    transportSecurityObservations: [],
    cmpRuntimeObservations: [],
    screenshots: [],
    domSnapshots: [],
    normalizedVendorObservations: [],
    observedJourneys: [],
    derivedRuntimeSignals: {},
    runtimeCoverage: {
      coverageStatus: "partial",
      limitationKeys: ["local_policy_surface_only_no_pre_consent_runtime"],
      notes: ["Local readiness run captured policy surfaces only; pre-consent runtime and consent controls were not evaluated."],
      sourceModulesPresent: ["policySurfaceScanner"],
    },
    artifactRefs: result.artifactRefs,
    scannerVersion: "local_policy_surface_only",
    schemaVersion: SCHEMA_VERSION,
  }, null, 2)}\n`, "utf8");
}

function createDeterministicPolicyAssistProvider(): PolicyNanoAssistProvider {
  return {
    async classifyLinks(input) {
      const rankedCandidates = input.candidates
        .map((candidate) => {
          const classification = candidate.deterministicSurfaceType !== "unknown"
            ? {
              confidence: 0.88,
              surfaceType: candidate.deterministicSurfaceType,
            }
            : classifyPrivacySurface({
              linkText: candidate.linkText,
              url: candidate.normalizedUrl,
              surroundingText: candidate.surroundingTextExcerpt,
            });
          return {
            candidateId: candidate.candidateId,
            likelySurfaceType: classification.surfaceType,
            shouldFetch: classification.surfaceType !== "unknown",
            priorityRank: deterministicDiscoveryPriority(candidate.domLocation, candidate.discoveryMethod) +
              deterministicSurfacePriority(classification.surfaceType),
            confidence: classification.surfaceType === "unknown" ? 0.1 : Math.max(0.72, classification.confidence),
            reason: "Local deterministic policy-surface readiness ranking from canonical classifier output.",
            uncertaintyNotes: [] as string[],
          };
        })
        .filter((candidate) => candidate.shouldFetch)
        .sort((left, right) =>
          left.priorityRank - right.priorityRank ||
          right.confidence - left.confidence ||
          left.candidateId.localeCompare(right.candidateId),
        )
        .slice(0, 8)
        .map((candidate, index) => ({
          ...candidate,
          priorityRank: index + 1,
        }));
      return {
        assistId: input.assistId,
        rankedCandidates,
      };
    },
  };
}

function deterministicDiscoveryPriority(
  domLocation: "footer" | "header" | "nav" | "body",
  discoveryMethod: string,
): number {
  if (domLocation === "footer") {
    return 0;
  }
  if (domLocation === "header" || domLocation === "nav") {
    return 20;
  }
  return discoveryMethod === "guessed_common_path" ? 80 : 40;
}

function deterministicSurfacePriority(surfaceType: string): number {
  const priority = [
    "privacy_policy",
    "cookie_policy",
    "your_privacy_choices",
    "consent_preferences",
    "do_not_sell_or_share",
    "notice_at_collection",
    "california_notice",
    "ai_disclosure",
    "accessibility_statement",
    "terms",
  ].indexOf(surfaceType);
  return priority >= 0 ? priority : 99;
}

async function summarizeTarget(
  target: CohortTarget,
  artifactDir: string,
  status: CohortRow["status"],
): Promise<CohortRow> {
  const bundlePath = path.join(artifactDir, "CanonicalEvidenceBundle.json");
  const bundle = existsSync(bundlePath) ? asRecord(JSON.parse(await readFile(bundlePath, "utf8")) as unknown) : null;
  if (!bundle) {
    return {
      key: target.key,
      lang: target.lang,
      url: target.url,
      artifactDir,
      status: "missing_bundle",
      policy: emptyPolicySummary(),
      consent: emptyConsentSummary(),
      timing: emptyTimingSummary(),
    };
  }

  const policySurfaces = arrayOfRecords(bundle.policySurfaceObservations);
  const fetched = policySurfaces.filter((surface) => surface.status === "fetched");
  const failed = policySurfaces.filter((surface) => typeof surface.status === "string" && surface.status !== "fetched");
  const gdprCandidates = fetched.flatMap((surface) =>
    arrayOfRecords(surface.gdprTransparencyTopicCandidates)
  );
  const article13Signals = fetched.flatMap((surface) => arrayOfRecords(surface.article13DisclosureSignals));
  const observedTopics = uniqueStrings(fetched.flatMap((surface) =>
    arrayOfStrings(surface.observedTopics)
  ));
  const consentUi = arrayOfRecords(bundle.consentUiObservations)[0];
  const consentControls = arrayOfRecords(consentUi?.controls);
  const screenshots = arrayOfRecords(bundle.screenshots);
  const visualCapture = asRecord(bundle.visualCapture);
  const geometry = await readOptionalJson(path.join(artifactDir, "ConsentControlGeometryEvidence.json"));
  const geometrySummary = asRecord(asRecord(geometry).summary);
  const geometryCandidates = arrayOfRecords(asRecord(geometry).candidates);
  const diagnosticAcceptLabels = diagnosticLabelsForIntent(geometryCandidates, "accept");
  const diagnosticOptionsLabels = diagnosticLabelsForIntent(geometryCandidates, "options");
  const diagnosticRejectLabels = diagnosticLabelsForIntent(geometryCandidates, "reject");
  const runtimeCoverage = asRecord(bundle.runtimeCoverage);
  const geometryAccept = booleanOrNull(geometrySummary.firstLayerAccept);
  const geometryReject = booleanOrNull(geometrySummary.firstLayerReject);
  const geometryOptions = booleanOrNull(geometrySummary.firstLayerOptions);
  const geometryCmpDetected = booleanOrNull(geometrySummary.cmpDetected);
  const consentLimitationKeys = consentLimitationKeysFor({
    diagnosticAcceptLabels,
    diagnosticOptionsLabels,
    diagnosticRejectLabels,
    geometryAccept,
    geometryCmpDetected,
    geometryOptions,
    geometryReject,
    runtimeLimitationKeys: arrayOfStrings(runtimeCoverage.limitationKeys),
    uiControlCount: consentControls.length,
  });
  const modulesRun = arrayOfRecords(bundle.modulesRun);
  const preConsentModule = moduleRunFor(modulesRun, "preConsentRuntimeScanner");
  const policySurfaceModule = moduleRunFor(modulesRun, "policySurfaceScanner");

  return {
    key: target.key,
    lang: target.lang,
    url: target.url,
    artifactDir,
    status,
    scanId: stringOrUndefined(bundle.scanId),
    policy: {
      fetchedCount: fetched.length,
      fetchedSurfaceTypes: uniqueStrings(fetched.map((surface) => stringOrUndefined(surface.surfaceType)).filter(isString)),
      failedCount: failed.length,
      failureStatuses: summarizeFailureStatuses(failed),
      privacyFetched: fetched.filter((surface) => surface.surfaceType === "privacy_policy").length,
      cookieFetched: fetched.filter((surface) => surface.surfaceType === "cookie_policy").length,
      gdprCandidateCount: gdprCandidates.length,
      gdprCandidateProductionCreditCount: gdprCandidates.filter((candidate) => candidate.productionCredit === true).length,
      gdprCandidateTopics: uniqueStrings(gdprCandidates.map((candidate) => stringOrUndefined(candidate.topic)).filter(isString)),
      article13SignalCount: article13Signals.length,
      article13SignalTypes: uniqueStrings(article13Signals.map((signal) =>
        stringOrUndefined(signal.disclosureType) ?? stringOrUndefined(signal.topic)
      ).filter(isString)),
      observedTopics,
      checklistReadiness: checklistReadinessFor({
        fetchedCount: fetched.length,
        failed,
        gdprCandidateCount: gdprCandidates.length,
        article13SignalCount: article13Signals.length,
      }),
    },
    consent: {
      likelyPresent: booleanOrNull(consentUi?.likelyPresent),
      uiControlCount: consentControls.length,
      uiActionTypes: uniqueStrings(consentControls.map((control) => stringOrUndefined(control.actionType)).filter(isString)),
      cmpRuntimeCount: arrayOfRecords(bundle.cmpRuntimeObservations).length,
      geometryAccept,
      geometryReject,
      geometryOptions,
      geometryCmpDetected,
      diagnosticAcceptLabels,
      diagnosticOptionsLabels,
      diagnosticRejectLabels,
      limitationKeys: consentLimitationKeys,
      screenshotCount: screenshots.length,
      visualCaptureFailureReason: stringOrUndefined(visualCapture.failureReason),
      visualCaptureMethod: stringOrUndefined(visualCapture.captureMethod),
      visualCapturePlaceholder: visualCapture.status === "placeholder" ||
        screenshots.some((screenshot) => stringOrUndefined(screenshot.captureMethod)?.includes("placeholder")),
      visualCaptureStatus: stringOrUndefined(visualCapture.status),
    },
    timing: {
      policySurfaceMs: numberOrUndefined(policySurfaceModule.durationMs),
      preConsentRuntimeMs: numberOrUndefined(preConsentModule.durationMs),
      scanCompleteMs: numberOrUndefined(bundle.durationMs),
      slowPhaseLabels: slowPhaseLabels(modulesRun),
    },
  };
}

function failedRow(target: CohortTarget, artifactDir: string, error: unknown): CohortRow {
  return {
    key: target.key,
    lang: target.lang,
    url: target.url,
    artifactDir,
    status: "failed",
    error: error instanceof Error ? error.message : String(error),
    policy: emptyPolicySummary(),
    consent: emptyConsentSummary(),
    timing: emptyTimingSummary(),
  };
}

function emptyPolicySummary(): CohortRow["policy"] {
  return {
    fetchedCount: 0,
    fetchedSurfaceTypes: [],
    failedCount: 0,
    failureStatuses: [],
    privacyFetched: 0,
    cookieFetched: 0,
    gdprCandidateCount: 0,
    gdprCandidateProductionCreditCount: 0,
    gdprCandidateTopics: [],
    article13SignalCount: 0,
    article13SignalTypes: [],
    observedTopics: [],
    checklistReadiness: "missing",
  };
}

function emptyTimingSummary(): CohortRow["timing"] {
  return {
    slowPhaseLabels: [],
  };
}

function emptyConsentSummary(): CohortRow["consent"] {
  return {
    likelyPresent: null,
    uiControlCount: 0,
    uiActionTypes: [],
    cmpRuntimeCount: 0,
    geometryAccept: null,
    geometryReject: null,
    geometryOptions: null,
    geometryCmpDetected: null,
    diagnosticAcceptLabels: [],
    diagnosticOptionsLabels: [],
    diagnosticRejectLabels: [],
    limitationKeys: [],
    screenshotCount: 0,
    visualCapturePlaceholder: false,
  };
}

async function writeReport(args: Args, rows: CohortRow[]) {
  const report: CohortReport = {
    reportVersion: "certscore.multilingual_privacy_evidence_local_cohort.1",
    bottlenecks: bottlenecksFor(rows),
    byLanguage: byLanguage(rows),
    generatedAt: new Date().toISOString(),
    gdprTopicCounts: gdprTopicCounts(rows),
    guardrails: [
      "local_no_lambda_artifact_only",
      "no_consent_clicking_runtime_behavior",
      "no_display_layer_phrase_lists",
      "no_raw_text_fallback_findings",
      "gdpr_transparency_candidates_are_scanner_diagnostics_not_production_credit",
    ],
    outDir: args.outDir,
    profile: args.profile,
    rows,
    selection: {
      ...(args.limit ? { limit: args.limit } : {}),
      onlyKeys: [...args.onlyKeys].sort(),
      preset: args.preset,
      ...(args.targetsPath ? { targetsPath: args.targetsPath } : {}),
    },
    totals: {
      blockedPolicyAccess: rows.filter((row) => row.policy.checklistReadiness === "blocked_access").length,
      consentAcceptObserved: rows.filter((row) => row.consent.geometryAccept === true).length,
      consentOptionsObserved: rows.filter((row) => row.consent.geometryOptions === true).length,
      consentRejectObserved: rows.filter((row) => row.consent.geometryReject === true).length,
      diagnosticConsentAccept: rows.filter((row) => row.consent.diagnosticAcceptLabels.length > 0).length,
      diagnosticConsentOptions: rows.filter((row) => row.consent.diagnosticOptionsLabels.length > 0).length,
      diagnosticConsentReject: rows.filter((row) => row.consent.diagnosticRejectLabels.length > 0).length,
      diagnosticConsentSites: rows.filter(hasDiagnosticConsentSurface).length,
      failed: rows.filter((row) => row.status === "failed" || row.status === "missing_bundle").length,
      gdprCandidateSites: rows.filter((row) => row.policy.gdprCandidateCount > 0).length,
      policyFetchedSites: rows.filter((row) => row.policy.fetchedCount > 0).length,
      scanned: rows.length,
      slowPolicySurface: rows.filter((row) => (row.timing.policySurfaceMs ?? 0) >= 25_000).length,
      slowPreConsentRuntime: rows.filter((row) => (row.timing.preConsentRuntimeMs ?? 0) >= 25_000).length,
      total: rows.length,
      visualCapturePlaceholder: rows.filter((row) => row.consent.visualCapturePlaceholder).length,
    },
  };

  await writeFile(path.join(args.outDir, "multilingual-local-cohort-summary.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(path.join(args.outDir, "multilingual-local-cohort-summary.tsv"), `${toTsv(rows)}\n`, "utf8");
  await writeFile(path.join(args.outDir, "multilingual-local-cohort-language-summary.tsv"), `${languageSummaryTsv(report.byLanguage)}\n`, "utf8");
}

async function writeTargetsFile(outDir: string, targets: CohortTarget[]) {
  const lines = ["lang\tkey\turl", ...targets.map((target) => `${target.lang}\t${target.key}\t${target.url}`)];
  await writeFile(path.join(outDir, "sites.tsv"), `${lines.join("\n")}\n`, "utf8");
}

function toTsv(rows: CohortRow[]) {
  const header = [
    "lang",
    "key",
    "status",
    "policyFetched",
    "policySurfaceTypes",
    "policyFailures",
    "gdprCandidates",
    "gdprProductionCreditCandidates",
    "gdprTopics",
    "article13Signals",
    "observedTopics",
    "checklistReadiness",
    "consentLikely",
    "cmpRuntime",
    "uiControls",
    "uiActions",
    "geometryAccept",
    "geometryReject",
    "geometryOptions",
    "geometryCmp",
    "diagnosticConsentReadiness",
    "diagnosticAcceptLabels",
    "diagnosticOptionsLabels",
    "diagnosticRejectLabels",
    "visualCaptureStatus",
    "visualCaptureMethod",
    "visualCaptureFailure",
    "screenshotCount",
    "visualCapturePlaceholder",
    "consentLimitations",
    "preConsentRuntimeMs",
    "policySurfaceMs",
    "slowPhases",
  ];
  return [
    header.join("\t"),
    ...rows.map((row) => [
      row.lang,
      row.key,
      row.status,
      row.policy.fetchedCount,
      row.policy.fetchedSurfaceTypes.join(","),
      row.policy.failureStatuses.join(","),
      row.policy.gdprCandidateCount,
      row.policy.gdprCandidateProductionCreditCount,
      row.policy.gdprCandidateTopics.join(","),
      row.policy.article13SignalTypes.join(","),
      row.policy.observedTopics.join(","),
      row.policy.checklistReadiness,
      row.consent.likelyPresent ?? "",
      row.consent.cmpRuntimeCount,
      row.consent.uiControlCount,
      row.consent.uiActionTypes.join(","),
      row.consent.geometryAccept ?? "",
      row.consent.geometryReject ?? "",
      row.consent.geometryOptions ?? "",
      row.consent.geometryCmpDetected ?? "",
      consentReadiness(row),
      row.consent.diagnosticAcceptLabels.join(","),
      row.consent.diagnosticOptionsLabels.join(","),
      row.consent.diagnosticRejectLabels.join(","),
      row.consent.visualCaptureStatus ?? "",
      row.consent.visualCaptureMethod ?? "",
      row.consent.visualCaptureFailureReason ?? "",
      row.consent.screenshotCount,
      row.consent.visualCapturePlaceholder,
      row.consent.limitationKeys.join(","),
      row.timing.preConsentRuntimeMs ?? "",
      row.timing.policySurfaceMs ?? "",
      row.timing.slowPhaseLabels.join(","),
    ].map(tsvCell).join("\t")),
  ].join("\n");
}

function languageSummaryTsv(rows: CohortReport["byLanguage"]) {
  return [
    [
      "lang",
      "total",
      "policyFetchedSites",
      "gdprCandidateSites",
      "legacySignalSites",
      "candidateOnlyGdpr",
      "blockedPolicyAccess",
      "consentAcceptObserved",
      "consentRejectObserved",
      "consentOptionsObserved",
      "diagnosticConsentSites",
      "slowPreConsentRuntimeSites",
      "slowPolicySurfaceSites",
      "visualCapturePlaceholderSites",
    ].join("\t"),
    ...rows.map((row) => [
      row.lang,
      row.total,
      row.policyFetchedSites,
      row.gdprCandidateSites,
      row.legacySignalSites,
      row.candidateOnlyGdpr,
      row.blockedPolicyAccess,
      row.consentAcceptObserved,
      row.consentRejectObserved,
      row.consentOptionsObserved,
      row.diagnosticConsentSites,
      row.slowPreConsentRuntimeSites,
      row.slowPolicySurfaceSites,
      row.visualCapturePlaceholderSites,
    ].join("\t")),
  ].join("\n");
}

function byLanguage(rows: CohortRow[]): CohortReport["byLanguage"] {
  const langs = uniqueStrings(rows.map((row) => row.lang));
  return langs.map((lang) => {
    const languageRows = rows.filter((row) => row.lang === lang);
    return {
      blockedPolicyAccess: languageRows.filter((row) => row.policy.checklistReadiness === "blocked_access").length,
      candidateOnlyGdpr: languageRows.filter((row) => row.policy.checklistReadiness === "candidate_evidence_retained").length,
      consentAcceptObserved: languageRows.filter((row) => row.consent.geometryAccept === true).length,
      consentOptionsObserved: languageRows.filter((row) => row.consent.geometryOptions === true).length,
      consentRejectObserved: languageRows.filter((row) => row.consent.geometryReject === true).length,
      diagnosticConsentAccept: languageRows.filter((row) => row.consent.diagnosticAcceptLabels.length > 0).length,
      diagnosticConsentOptions: languageRows.filter((row) => row.consent.diagnosticOptionsLabels.length > 0).length,
      diagnosticConsentReject: languageRows.filter((row) => row.consent.diagnosticRejectLabels.length > 0).length,
      diagnosticConsentSites: languageRows.filter(hasDiagnosticConsentSurface).length,
      gdprCandidateSites: languageRows.filter((row) => row.policy.gdprCandidateCount > 0).length,
      lang,
      legacySignalSites: languageRows.filter((row) => row.policy.article13SignalCount > 0).length,
      policyFetchedSites: languageRows.filter((row) => row.policy.fetchedCount > 0).length,
      slowPolicySurfaceSites: languageRows.filter((row) => (row.timing.policySurfaceMs ?? 0) >= 25_000).length,
      slowPreConsentRuntimeSites: languageRows.filter((row) => (row.timing.preConsentRuntimeMs ?? 0) >= 25_000).length,
      total: languageRows.length,
      visualCapturePlaceholderSites: languageRows.filter((row) => row.consent.visualCapturePlaceholder).length,
    };
  });
}

function bottlenecksFor(rows: CohortRow[]): CohortReport["bottlenecks"] {
  return {
    blockedPolicyAccessKeys: rows
      .filter((row) => row.policy.checklistReadiness === "blocked_access")
      .map((row) => row.key),
    candidateOnlyGdprKeys: rows
      .filter((row) => row.policy.checklistReadiness === "candidate_evidence_retained")
      .map((row) => row.key),
    cmpWithoutDiagnosticOrProductionSurfaceKeys: rows
      .filter((row) =>
        row.consent.geometryCmpDetected === true &&
        !hasProductionConsentSurface(row) &&
        !hasDiagnosticConsentSurface(row)
      )
      .map((row) => row.key),
    cmpWithoutActionableSurfaceKeys: rows
      .filter((row) =>
        row.consent.geometryCmpDetected === true &&
        !hasProductionConsentSurface(row)
      )
      .map((row) => row.key),
    diagnosticOnlyConsentSurfaceKeys: rows
      .filter((row) => hasDiagnosticConsentSurface(row) && !hasProductionConsentSurface(row))
      .map((row) => row.key),
    slowPolicySurfaceKeys: rows
      .filter((row) => (row.timing.policySurfaceMs ?? 0) >= 25_000)
      .map((row) => row.key),
    slowPreConsentRuntimeKeys: rows
      .filter((row) => (row.timing.preConsentRuntimeMs ?? 0) >= 25_000)
      .map((row) => row.key),
    surfaceOnlyPolicyKeys: rows
      .filter((row) => row.policy.checklistReadiness === "surface_only")
      .map((row) => row.key),
    visualCapturePlaceholderKeys: rows
      .filter((row) => row.consent.visualCapturePlaceholder)
      .map((row) => row.key),
  };
}

function gdprTopicCounts(rows: CohortRow[]): CohortReport["gdprTopicCounts"] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const topic of row.policy.gdprCandidateTopics) {
      counts.set(topic, (counts.get(topic) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([topic, count]) => ({ count, topic }))
    .sort((left, right) => right.count - left.count || left.topic.localeCompare(right.topic));
}

function hasDiagnosticConsentSurface(row: CohortRow) {
  return row.consent.diagnosticAcceptLabels.length > 0 ||
    row.consent.diagnosticOptionsLabels.length > 0 ||
    row.consent.diagnosticRejectLabels.length > 0;
}

function hasProductionConsentSurface(row: CohortRow) {
  return row.consent.uiControlCount > 0 ||
    row.consent.geometryAccept === true ||
    row.consent.geometryOptions === true ||
    row.consent.geometryReject === true;
}

function consentReadiness(row: CohortRow) {
  if (hasProductionConsentSurface(row)) {
    return "production_observed";
  }
  if (hasDiagnosticConsentSurface(row)) {
    return "diagnostic_only";
  }
  return "none";
}

function consentLimitationKeysFor(input: {
  diagnosticAcceptLabels: string[];
  diagnosticOptionsLabels: string[];
  diagnosticRejectLabels: string[];
  geometryAccept: boolean | null;
  geometryCmpDetected: boolean | null;
  geometryOptions: boolean | null;
  geometryReject: boolean | null;
  runtimeLimitationKeys: string[];
  uiControlCount: number;
}) {
  const hasProductionSurface = input.uiControlCount > 0 ||
    input.geometryAccept === true ||
    input.geometryReject === true ||
    input.geometryOptions === true;
  const hasDiagnosticSurface = input.diagnosticAcceptLabels.length > 0 ||
    input.diagnosticOptionsLabels.length > 0 ||
    input.diagnosticRejectLabels.length > 0;
  const derived = input.geometryCmpDetected === true && !hasProductionSurface
    ? [
      "geometry_cmp_without_actionable_surface",
      ...(!hasDiagnosticSurface ? ["geometry_cmp_without_diagnostic_or_production_surface"] : []),
    ]
    : [];
  return uniqueStrings([...input.runtimeLimitationKeys, ...derived]);
}

function tsvCell(value: unknown) {
  return String(value).replace(/\t/g, " ").replace(/\r?\n/g, " ").slice(0, 500);
}

function checklistReadinessFor(input: {
  article13SignalCount: number;
  failed: Record<string, unknown>[];
  fetchedCount: number;
  gdprCandidateCount: number;
}): CohortRow["policy"]["checklistReadiness"] {
  if (input.article13SignalCount > 0) {
    return "legacy_signal_retained";
  }
  if (input.gdprCandidateCount > 0) {
    return "candidate_evidence_retained";
  }
  if (input.fetchedCount > 0) {
    return "surface_only";
  }
  if (input.failed.some((surface) =>
    [401, 403, 429].includes(numberOrZero(surface.httpStatus)) ||
    isAccessChallengePolicyFailure(surface)
  )) {
    return "blocked_access";
  }
  return "missing";
}

function isAccessChallengePolicyFailure(surface: Record<string, unknown>) {
  const text = [
    stringOrUndefined(surface.title),
    stringOrUndefined(surface.textExcerpt),
  ].filter(isString).join(" ").toLowerCase();
  return (
    text.includes("client challenge") &&
    text.includes("required part of this site") &&
    text.includes("couldn")
  ) || (
    text.includes("entrez les caractères affichés") &&
    text.includes("captcha")
  );
}

function summarizeFailureStatuses(failed: Record<string, unknown>[]) {
  const counts = new Map<string, number>();
  for (const surface of failed) {
    const status = stringOrUndefined(surface.status) ?? "unknown";
    const httpStatus = surface.httpStatus === undefined || surface.httpStatus === null ? "" : String(surface.httpStatus);
    const key = [stringOrUndefined(surface.surfaceType) ?? "unknown", status, httpStatus].join(":");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].map(([key, count]) => `${key}x${count}`).sort();
}

function diagnosticLabelsForIntent(candidates: Record<string, unknown>[], intent: "accept" | "options" | "reject") {
  return candidates.flatMap((candidate) => {
    const decisionStatus = stringOrUndefined(candidate.decisionStatus);
    if (!isDiagnosticReadinessDecisionStatus(decisionStatus)) {
      return [];
    }
    const diagnostics = arrayOfRecords(candidate.diagnosticClassifications);
    const hasDiagnostic = diagnostics.some((diagnostic) => diagnostic.intent === intent);
    if (!hasDiagnostic) {
      return [];
    }
    const label = stringOrUndefined(candidate.label);
    return label ? [`${label}:${decisionStatus ?? "unknown"}`] : [];
  }).slice(0, 6);
}

function isDiagnosticReadinessDecisionStatus(status: string | undefined) {
  return status === "confirmed_visible" || status === "ambiguous";
}

async function selectTargets(args: Args) {
  const baseTargets = args.targetsPath
    ? await readTargets(args.targetsPath)
    : args.preset === "targeted"
      ? TARGETED_TARGETS
      : DEFAULT_NEWS_TARGETS;
  const selected = baseTargets
    .filter((target) => args.onlyKeys.size === 0 || args.onlyKeys.has(target.key))
    .slice(0, args.limit ?? baseTargets.length);
  if (selected.length === 0) {
    throw new Error("No cohort targets selected.");
  }
  return selected;
}

async function readTargets(filePath: string): Promise<CohortTarget[]> {
  const text = await readFile(path.resolve(filePath), "utf8");
  return text.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .flatMap((line, index) => {
      const parts = line.split(/\t|,/).map((part) => part.trim());
      if (index === 0 && parts.some((part) => /^(lang|key|url)$/i.test(part))) {
        return [];
      }
      const [lang, key, url] = parts.length >= 3 ? parts : ["unknown", parts[0], parts[1]];
      if (!key || !url) {
        return [];
      }
      return [{ lang: lang ?? "unknown", key, url: normalizeTargetUrl(url) }];
    });
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    consentFlowScreenshotMode: "none",
    continueOnError: true,
    onlyKeys: new Set(),
    outDir: path.join("artifacts", "local-no-lambda-multilingual-cohort", timestampForPath(new Date())),
    preset: "news21",
    profile: "standard",
    resume: false,
    scanMode: "run-scan",
    skipScan: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    } else if (arg === "--consent-flow-screenshot-mode") {
      args.consentFlowScreenshotMode = parseConsentFlowScreenshotMode(requiredValue(argv, ++index, arg));
    } else if (arg === "--fail-fast") {
      args.continueOnError = false;
    } else if (arg === "--limit") {
      args.limit = positiveInteger(requiredValue(argv, ++index, arg), arg);
    } else if (arg === "--only") {
      args.onlyKeys = new Set(requiredValue(argv, ++index, arg).split(",").map((value) => value.trim()).filter(Boolean));
    } else if (arg === "--out-dir") {
      args.outDir = path.resolve(requiredValue(argv, ++index, arg));
    } else if (arg === "--preset") {
      args.preset = parsePreset(requiredValue(argv, ++index, arg));
    } else if (arg === "--profile") {
      args.profile = parseProfile(requiredValue(argv, ++index, arg));
    } else if (arg === "--resume") {
      args.resume = true;
    } else if (arg === "--scan-mode") {
      args.scanMode = parseScanMode(requiredValue(argv, ++index, arg));
    } else if (arg === "--skip-scan") {
      args.skipScan = true;
    } else if (arg === "--targets") {
      args.targetsPath = requiredValue(argv, ++index, arg);
    } else if (arg === "--") {
      continue;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function printUsage() {
  console.log([
    "Usage: pnpm v2:multilingual-local-cohort -- [options]",
    "",
    "Runs a no-Lambda, artifact-only multilingual privacy evidence cohort and writes bounded summaries.",
    "",
    "Options:",
    "  --preset news21|targeted       Built-in target set. Default: news21",
    "  --targets <path>               TSV/CSV rows: lang, key, url",
    "  --profile <profile>            scan-core profile. Default: standard",
    "  --scan-mode run-scan|policy-surface-only",
    "                                  policy-surface-only is local/no-Lambda and uses deterministic canonical ranking",
    "  --out-dir <path>               Output directory under artifacts/",
    "  --limit <n>                    Limit selected targets",
    "  --only <key,key>               Run only selected target keys",
    "  --resume                       Reuse existing CanonicalEvidenceBundle.json files",
    "  --skip-scan                    Summarize existing bundles only",
    "  --fail-fast                    Stop at first scan failure",
  ].join("\n"));
}

function parsePreset(value: string): Args["preset"] {
  if (value === "news21" || value === "targeted") {
    return value;
  }
  throw new Error(`Unsupported preset: ${value}`);
}

function parseProfile(value: string): Args["profile"] {
  if (value === "tiny" || value === "quick" || value === "policy" || value === "standard" || value === "consent" || value === "consent_flow" || value === "full") {
    return value;
  }
  throw new Error(`Unsupported scan profile: ${value}`);
}

function parseConsentFlowScreenshotMode(value: string): Args["consentFlowScreenshotMode"] {
  if (value === "auto" || value === "none") {
    return value;
  }
  throw new Error(`Unsupported consent-flow screenshot mode: ${value}`);
}

function parseScanMode(value: string): Args["scanMode"] {
  if (value === "run-scan" || value === "policy-surface-only") {
    return value;
  }
  throw new Error(`Unsupported scan mode: ${value}`);
}

function requiredValue(argv: string[], index: number, flag: string) {
  const value = argv[index];
  if (!value) {
    throw new Error(`Missing value for ${flag}.`);
  }
  return value;
}

function positiveInteger(value: string, flag: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer.`);
  }
  return parsed;
}

function normalizeTargetUrl(value: string) {
  return /^https?:\/\//i.test(value) ? value : `https://${value.replace(/^\/+/, "")}`;
}

function safeHostname(value: string) {
  try {
    return new URL(value).hostname.replace(/[^a-z0-9.-]+/gi, "_");
  } catch {
    return "unknown";
  }
}

function timestampForPath(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

async function readOptionalJson(filePath: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as unknown;
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function arrayOfRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(asRecord).filter((record) => Object.keys(record).length > 0) : [];
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter(isString) : [];
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function booleanOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function moduleRunFor(modulesRun: Record<string, unknown>[], moduleName: string) {
  return modulesRun.find((moduleRun) => moduleRun.moduleName === moduleName) ?? {};
}

function slowPhaseLabels(modulesRun: Record<string, unknown>[]) {
  return modulesRun.flatMap((moduleRun) => {
    const moduleName = stringOrUndefined(moduleRun.moduleName) ?? "unknown";
    return arrayOfRecords(moduleRun.timingBreakdown)
      .filter((phase) => (numberOrUndefined(phase.durationMs) ?? 0) >= 5_000)
      .map((phase) => {
        const label = stringOrUndefined(phase.label) ?? "unknown";
        return `${moduleName}:${label}:${numberOrUndefined(phase.durationMs) ?? 0}ms`;
      });
  }).slice(0, 10);
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)].sort();
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
