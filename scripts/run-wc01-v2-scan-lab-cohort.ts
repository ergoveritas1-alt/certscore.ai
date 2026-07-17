import { existsSync, readFileSync } from "node:fs";
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { canonicalEvidenceBundleSchema, type CanonicalEvidenceBundle } from "../packages/certscore-contracts/src/index.js";
import { reviewEvidenceBundle } from "../packages/certscore-review-engine/src/index.js";
import {
  buildV2ScanLabRunPlan,
  isV2ScanLabRunProfile,
  runV2ScanLabArtifactChain,
  type V2ScanLabRunProfile,
} from "../apps/web/server/admin/v2-scan-lab-runner";
import { writeReplayCaptureHealthReport } from "../packages/certscore-scan-core/src/replay-capture-health";
import {
  buildEndpointEnrichmentOverlay,
  collectEndpointEnrichmentCandidatesFromBundle,
  createEmptyEndpointEnrichmentRegistry,
  updateEndpointEnrichmentRegistry,
  type EndpointEnrichmentRegistry,
  type EndpointEnrichmentReport,
} from "../packages/certscore-vendor-resolver/src/endpoint-enrichment-registry.js";

type Args = {
  captureReplay: boolean;
  consentDag: boolean;
  continueOnError: boolean;
  dryRun: boolean;
  endpointEnrichmentMaxHosts?: number;
  endpointEnrichmentRegistryPath: string;
  endpointEnrichmentTimeoutMs?: number;
  enrichEndpoints: boolean;
  enrichEndpointsDns: boolean;
  help?: boolean;
  limit?: number;
  outDir: string;
  profile: V2ScanLabRunProfile;
  resume: boolean;
  scanStepTimeoutMs?: number;
  startAt: number;
  urlsPath: string;
};

type CohortResult = {
  chainKey?: string;
  cohort?: string;
  completedAt: string;
  domain?: string;
  durationMs: number;
  eligibleFindingKeys: string[];
  endpointEnrichment?: EndpointEnrichmentRunSummary;
  error?: string;
  headedFallbackUsed: boolean;
  index: number;
  moduleRuns: ModuleRunSummary[];
  normalizedUrl?: string;
  privacyControlUrls: string[];
  reviewCandidateCounts: {
    eligible: number;
    notEligible: number;
    total: number;
  };
  runtime: RuntimeSummary;
  scannerRuntimeStarted: boolean;
  startedAt: string;
  status: "completed" | "failed" | "skipped";
  url: string;
};

type EndpointEnrichmentRunSummary = {
  candidatesObserved: number;
  dnsEnabled: boolean;
  enrichedRegionObserved: number;
  enrichmentFailures: number;
  newEntries: number;
  overlayPath?: string;
  overlayRegionObservedEntries: number;
  registryPath: string;
  unknownAfterEnrichment: number;
  updatedEntries: number;
};

type CohortPlanEntry = {
  expectedLanes: string[];
  privacyControlUrls: string[];
  url: string;
};

type ModuleRunSummary = {
  durationMs?: number;
  errors: string[];
  moduleName: string;
  status: string;
};

type RuntimeSummary = {
  consentBannerLikelyPresent: boolean | null;
  coverageLimitationKeys: string[];
  coverageStatus?: string;
  cookieEvents: number;
  cookiesBeforeConsent: number;
  noGoCandidate: boolean;
  noGoReasons: string[];
  observedJourneys: number;
  preConsentTrackingObserved: boolean | null;
  sessionReplayOrBehavioralAnalyticsObserved: boolean | null;
  silentEmptyRuntime: boolean;
  thirdPartyCookiesPreConsentObserved: boolean | null;
  thirdPartyRequests: number;
  vendorObservations: number;
};

type CohortSummary = {
  cohortSummaryVersion: "wc01.v2_scan_lab_cohort.1";
  completedAt?: string;
  generatedAt: string;
  input: {
    continueOnError: boolean;
    dryRun: boolean;
    captureReplay: boolean;
    consentDag: boolean;
    limit?: number;
    endpointEnrichmentMaxHosts?: number;
    endpointEnrichmentRegistryPath: string;
    endpointEnrichmentTimeoutMs?: number;
    enrichEndpoints: boolean;
    enrichEndpointsDns: boolean;
    outDir: string;
    profile: V2ScanLabRunProfile;
    resume: boolean;
    scanStepTimeoutMs?: number;
    startAt: number;
    totalUrls: number;
    urlsPath: string;
  };
  results: CohortResult[];
  totals: {
    completed: number;
    failed: number;
    headedFallbackUsed: number;
    noGoCandidates: number;
    sitesWithPreConsentTracking: number;
    sitesWithSessionReplayOrBehavioralAnalytics: number;
    sitesWithThirdPartyCookiesBeforeConsent: number;
    skipped: number;
    endpointEnrichmentCandidatesObserved: number;
    endpointEnrichmentFailures: number;
    endpointEnrichmentNewEntries: number;
    endpointEnrichmentOverlayRegionObservedEntries: number;
    endpointEnrichmentOverlaysWritten: number;
    endpointEnrichmentUnknownAfterEnrichment: number;
    endpointEnrichmentUpdatedEntries: number;
    totalRuntimeMs: number;
  };
};

const DEFAULT_URLS_PATH = "./docs/certscore-v2/calibration-urls-lab-50.txt";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const planEntries = await readCohortPlan(args.urlsPath);
  const selectedEntries = planEntries.slice(Math.max(0, args.startAt - 1));
  const limitedEntries = args.limit === undefined ? selectedEntries : selectedEntries.slice(0, args.limit);

  if (args.dryRun) {
    console.log(`WC01 v2 Scan Lab cohort dry run: ${limitedEntries.length}/${planEntries.length} URLs`);
    limitedEntries.forEach((entry, offset) => {
      const seeds = entry.privacyControlUrls.length > 0 ? ` seeds=${entry.privacyControlUrls.join(",")}` : "";
      const auxProbes = args.captureReplay ? ` aux=${captureReplayAuxiliaryProbesForEntry(args.profile, entry)}` : "";
      console.log(`${args.startAt + offset}. ${entry.url}${seeds}${auxProbes}`);
    });
    return;
  }

  await mkdir(args.outDir, { recursive: true });

  const summaryPath = path.join(args.outDir, "Wc01V2ScanLabCohort.summary.json");
  const markdownPath = path.join(args.outDir, "Wc01V2ScanLabCohort.summary.md");
  const existingSummary = args.resume && existsSync(summaryPath) ? await readJson<CohortSummary>(summaryPath) : null;
  const results = existingSummary?.results ? dedupeCohortResults(existingSummary.results) : [];
  const completedUrls = new Set(
    results.filter((result) => result.status === "completed").map((result) => result.url),
  );

  const startedAt = new Date();
  console.log(`WC01 v2 Scan Lab cohort: ${limitedEntries.length}/${planEntries.length} URLs, profile=${args.profile}`);
  console.log("Internal diagnostic only. Artifact-only; non-persistent; not customer-facing report output.");

  for (let offset = 0; offset < limitedEntries.length; offset += 1) {
    const entry = limitedEntries[offset];
    if (!entry) {
      continue;
    }
    const { url } = entry;
    const index = args.startAt + offset;
    if (args.resume && completedUrls.has(url)) {
      await writeSummaries(args, planEntries.length, results, summaryPath, markdownPath);
      console.log(`[${index}/${planEntries.length}] skipped completed ${url}`);
      continue;
    }

    const siteStartedAt = new Date();
    console.log(`[${index}/${planEntries.length}] scanning ${url}`);
    const planned = buildV2ScanLabRunPlan({
      captureReplay: args.captureReplay,
      captureReplayAuxiliaryProbes: args.captureReplay
        ? captureReplayAuxiliaryProbesForEntry(args.profile, entry)
        : undefined,
      consentScenarioDag: args.consentDag,
      now: siteStartedAt,
      privacyControlUrls: entry.privacyControlUrls,
      profile: args.profile,
      url,
      workspaceRoot: process.cwd(),
    });

    try {
      const plan = await withScanStepTimeout(args.scanStepTimeoutMs, () => runV2ScanLabArtifactChain({
        captureReplay: args.captureReplay,
        captureReplayAuxiliaryProbes: args.captureReplay
          ? captureReplayAuxiliaryProbesForEntry(args.profile, entry)
          : undefined,
        consentScenarioDag: args.consentDag,
        now: siteStartedAt,
        privacyControlUrls: entry.privacyControlUrls,
        profile: args.profile,
        url,
        workspaceRoot: process.cwd(),
      }));
      const completedAt = new Date();
      const result = await summarizeCompletedRun({
        completedAt,
        index,
        plan,
        startedAt: siteStartedAt,
        url,
      });
      if (args.enrichEndpoints) {
        result.endpointEnrichment = await enrichCompletedRunEndpoints({
          args,
          bundlePath: path.join(path.dirname(plan.timingPath), "CanonicalEvidenceBundle.json"),
        });
      }
      if (args.captureReplay) {
        await mirrorReplayManifestsToCohortOutDir({
          calibrationDir: path.dirname(plan.timingPath),
          cohortOutDir: args.outDir,
          domain: plan.domain,
        });
        await mirrorScanDiagnosticsToCohortOutDir({
          calibrationDir: path.dirname(plan.timingPath),
          cohortOutDir: args.outDir,
          domain: plan.domain,
        });
      }
      upsertCohortResult(results, result);
      await writeSummaries(args, planEntries.length, results, summaryPath, markdownPath);
      console.log(
        `[${index}/${planEntries.length}] completed ${plan.domain}: ${result.runtime.thirdPartyRequests} third-party requests, ` +
          `${result.runtime.cookiesBeforeConsent} cookies before consent, ${result.eligibleFindingKeys.length} eligible candidates`,
      );
    } catch (error) {
      const completedAt = new Date();
      const result: CohortResult = {
        chainKey: planned.chainKey,
        cohort: planned.cohort,
        completedAt: completedAt.toISOString(),
        domain: planned.domain,
        durationMs: completedAt.getTime() - siteStartedAt.getTime(),
        eligibleFindingKeys: [],
        error: formatError(error),
        headedFallbackUsed: false,
        index,
        moduleRuns: [],
        normalizedUrl: planned.normalizedUrl,
        privacyControlUrls: planned.privacyControlUrls,
        reviewCandidateCounts: { eligible: 0, notEligible: 0, total: 0 },
        runtime: emptyRuntimeSummary(),
        scannerRuntimeStarted: existsSync(path.join(path.dirname(planned.timingPath), "V2ScanCorePhases.json")),
        startedAt: siteStartedAt.toISOString(),
        status: "failed",
        url,
      };
      if (args.captureReplay) {
        await mirrorScanDiagnosticsToCohortOutDir({
          calibrationDir: path.dirname(planned.timingPath),
          cohortOutDir: args.outDir,
          domain: planned.domain,
        });
      }
      upsertCohortResult(results, result);
      await writeSummaries(args, planEntries.length, results, summaryPath, markdownPath);
      console.error(`[${index}/${planEntries.length}] failed ${url}: ${result.error}`);
      if (!args.continueOnError) {
        throw error;
      }
    }
  }

  await writeSummaries(args, planEntries.length, results, summaryPath, markdownPath, new Date());
  if (args.captureReplay) {
    await writeReplayCaptureHealth(args, planEntries.length, results);
  }
  const totalDurationSec = Math.round((Date.now() - startedAt.getTime()) / 1000);
  console.log(`WC01 v2 Scan Lab cohort finished in ${totalDurationSec}s`);
  console.log(`Wrote ${summaryPath}`);
  console.log(`Wrote ${markdownPath}`);
  if (args.captureReplay) {
    console.log(`Wrote ${path.join(args.outDir, "ReplayCaptureHealthReport.json")}`);
    console.log(`Wrote ${path.join(args.outDir, "ReplayCaptureHealthReport.md")}`);
  }
}

async function summarizeCompletedRun(input: {
  completedAt: Date;
  index: number;
  plan: ReturnType<typeof buildV2ScanLabRunPlan>;
  startedAt: Date;
  url: string;
}): Promise<CohortResult> {
  const calibrationDir = path.dirname(input.plan.timingPath);
  const bundlePath = path.join(calibrationDir, "CanonicalEvidenceBundle.json");
  const reviewPath = path.join(calibrationDir, "ReviewResult.json");
  const bundle = await readJson<Record<string, unknown>>(bundlePath);
  const review = await ensureReviewResult({ bundle, reviewPath });
  const moduleRuns = summarizeModuleRuns(bundle);
  const eligibleFindingKeys = summarizeEligibleFindingKeys(review);
  const candidateCounts = summarizeReviewCandidateCounts(review);

  return {
    chainKey: input.plan.chainKey,
    cohort: input.plan.cohort,
    completedAt: input.completedAt.toISOString(),
    domain: input.plan.domain,
    durationMs: input.completedAt.getTime() - input.startedAt.getTime(),
    eligibleFindingKeys,
    headedFallbackUsed: moduleRuns.some((run) =>
      run.errors.some((message) => message.toLowerCase().includes("headed local fallback used")),
    ),
    index: input.index,
    moduleRuns,
    normalizedUrl: input.plan.normalizedUrl,
    privacyControlUrls: input.plan.privacyControlUrls,
    reviewCandidateCounts: candidateCounts,
    runtime: summarizeRuntime(bundle, calibrationDir),
    scannerRuntimeStarted: true,
    startedAt: input.startedAt.toISOString(),
    status: "completed",
    url: input.url,
  };
}

async function ensureReviewResult(input: {
  bundle: Record<string, unknown>;
  reviewPath: string;
}): Promise<Record<string, unknown>> {
  if (existsSync(input.reviewPath)) {
    return readJson<Record<string, unknown>>(input.reviewPath);
  }

  const bundle = canonicalEvidenceBundleSchema.parse(input.bundle) as CanonicalEvidenceBundle;
  const review = await reviewEvidenceBundle(bundle);
  await writeFile(input.reviewPath, `${JSON.stringify(review, null, 2)}\n`, "utf8");
  return review as unknown as Record<string, unknown>;
}

async function enrichCompletedRunEndpoints(input: {
  args: Args;
  bundlePath: string;
}): Promise<EndpointEnrichmentRunSummary> {
  const bundle = canonicalEvidenceBundleSchema.parse(await readJson<unknown>(input.bundlePath)) as CanonicalEvidenceBundle;
  const registry = await readEndpointEnrichmentRegistry(input.args.endpointEnrichmentRegistryPath);
  const candidates = collectEndpointEnrichmentCandidatesFromBundle(bundle);
  const update = await updateEndpointEnrichmentRegistry(registry, candidates, {
    enableDnsCname: input.args.enrichEndpointsDns,
    maxHosts: input.args.endpointEnrichmentMaxHosts,
    timeoutMs: input.args.endpointEnrichmentTimeoutMs,
  });
  await mkdir(path.dirname(input.args.endpointEnrichmentRegistryPath), { recursive: true });
  await writeFile(input.args.endpointEnrichmentRegistryPath, `${JSON.stringify(update.registry, null, 2)}\n`);

  const overlay = buildEndpointEnrichmentOverlay(bundle, update.registry);
  const overlayPath = path.join(path.dirname(input.bundlePath), "EndpointEnrichmentOverlay.json");
  await writeFile(overlayPath, `${JSON.stringify(overlay, null, 2)}\n`);

  return {
    ...summarizeEndpointEnrichmentReport(update.report),
    dnsEnabled: input.args.enrichEndpointsDns,
    overlayPath,
    overlayRegionObservedEntries: overlay.endpointOverlays.length,
    registryPath: input.args.endpointEnrichmentRegistryPath,
  };
}

async function readEndpointEnrichmentRegistry(registryPath: string): Promise<EndpointEnrichmentRegistry> {
  if (!existsSync(registryPath)) {
    return createEmptyEndpointEnrichmentRegistry();
  }
  const registry = await readJson<EndpointEnrichmentRegistry>(registryPath);
  if (registry.registryVersion !== "certscore.endpoint_enrichment_registry.1" || !Array.isArray(registry.entries)) {
    throw new Error(`Unsupported endpoint enrichment registry at ${registryPath}`);
  }
  return registry;
}

function summarizeEndpointEnrichmentReport(report: EndpointEnrichmentReport) {
  return {
    candidatesObserved: report.candidatesObserved,
    enrichedRegionObserved: report.enrichedRegionObserved,
    enrichmentFailures: report.enrichmentFailures,
    newEntries: report.newEntries,
    unknownAfterEnrichment: report.unknownAfterEnrichment,
    updatedEntries: report.updatedEntries,
  };
}

function summarizeModuleRuns(bundle: Record<string, unknown>): ModuleRunSummary[] {
  const metadata = asRecord(bundle.metadata);
  const moduleRuns = asArray(bundle.modulesRun).length > 0 ? asArray(bundle.modulesRun) : asArray(metadata.moduleRuns);
  return moduleRuns.map((moduleRun) => {
    const record = asRecord(moduleRun);
    return {
      durationMs: asNumber(record.durationMs),
      errors: asStringArray(record.errors),
      moduleName: asString(record.moduleName) ?? "unknown_module",
      status: asString(record.status) ?? "unknown",
    };
  });
}

function summarizeRuntime(bundle: Record<string, unknown>, calibrationDir?: string): RuntimeSummary {
  const evidence = asRecord(bundle.evidence);
  const networkEvents = coalesceArray(bundle.networkEvents, evidence.networkEvents).map(asRecord);
  const cookieEvents = coalesceArray(bundle.cookieEvents, evidence.cookieEvents);
  const derivedRuntimeSignals = asRecord(bundle.derivedRuntimeSignals ?? evidence.derivedRuntimeSignals);
  const cookieSnapshots = coalesceArray(bundle.cookieSnapshots, evidence.cookieSnapshots);
  const runtimeCoverage = asRecord(bundle.runtimeCoverage ?? evidence.runtimeCoverage);
  const observationCounts = asRecord(runtimeCoverage.observationCounts);
  const noGoReasons = detectNoGoCandidateReasons(bundle, calibrationDir);

  return {
    consentBannerLikelyPresent: asBoolean(derivedRuntimeSignals.consentBannerLikelyPresent),
    coverageLimitationKeys: asStringArray(runtimeCoverage.limitationKeys),
    coverageStatus: asString(runtimeCoverage.coverageStatus),
    cookieEvents: asNumber(observationCounts.cookieEvents) ?? cookieEvents.length,
    cookiesBeforeConsent: asNumber(observationCounts.cookiesBeforeConsent) ?? countSnapshotCookies(cookieSnapshots),
    noGoCandidate: noGoReasons.length > 0,
    noGoReasons,
    observedJourneys:
      asNumber(observationCounts.observedJourneys) ?? coalesceArray(bundle.observedJourneys, evidence.observedJourneys).length,
    preConsentTrackingObserved: asBoolean(derivedRuntimeSignals.preConsentTrackingObserved),
    sessionReplayOrBehavioralAnalyticsObserved: asBoolean(
      derivedRuntimeSignals.sessionReplayOrBehavioralAnalyticsObserved,
    ),
    silentEmptyRuntime: runtimeCoverage.silentEmpty === true,
    thirdPartyCookiesPreConsentObserved: asBoolean(derivedRuntimeSignals.thirdPartyCookiesPreConsentObserved),
    thirdPartyRequests:
      asNumber(observationCounts.thirdPartyRequests) ?? networkEvents.filter(isThirdPartyNetworkEvent).length,
    vendorObservations:
      asNumber(observationCounts.normalizedVendors) ??
      coalesceArray(bundle.normalizedVendorObservations, evidence.normalizedVendorObservations).length,
  };
}

function summarizeEligibleFindingKeys(review: Record<string, unknown>) {
  return asArray(review.findingCandidates)
    .map(asRecord)
    .filter((candidate) => getEligibilityStatus(candidate) === "eligible")
    .map((candidate) => asString(candidate.findingKey))
    .filter((findingKey): findingKey is string => Boolean(findingKey))
    .sort();
}

function summarizeReviewCandidateCounts(review: Record<string, unknown>) {
  const candidates = asArray(review.findingCandidates).map(asRecord);
  const eligible = candidates.filter((candidate) => getEligibilityStatus(candidate) === "eligible").length;
  const notEligible = candidates.filter((candidate) => getEligibilityStatus(candidate) === "not_eligible").length;
  return {
    eligible,
    notEligible,
    total: candidates.length,
  };
}

function getEligibilityStatus(candidate: Record<string, unknown>) {
  const eligibility = candidate.eligibility;
  if (typeof eligibility === "string") {
    return eligibility;
  }
  return asString(asRecord(eligibility).status);
}

function countSnapshotCookies(cookieSnapshots: unknown[]): number {
  return cookieSnapshots.reduce<number>((sum, snapshot) => sum + asArray(asRecord(snapshot).cookies).length, 0);
}

function isThirdPartyNetworkEvent(event: Record<string, unknown>) {
  return (
    event.thirdParty === true ||
    event.isThirdParty === true ||
    event.requestParty === "third_party" ||
    event.requestParty === "third-party"
  );
}

async function writeSummaries(
  args: Args,
  totalUrls: number,
  results: CohortResult[],
  summaryPath: string,
  markdownPath: string,
  completedAt?: Date,
) {
  const summary = buildSummary(args, totalUrls, results, completedAt);
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, renderMarkdown(summary), "utf8");
}

async function writeReplayCaptureHealth(args: Args, totalUrls: number, results: CohortResult[]) {
  try {
    const attempted = results.filter((result) => result.status !== "skipped").length;
    await writeReplayCaptureHealthReport({
      outDir: args.outDir,
      summary: {
        completed: results.filter((result) => result.status === "completed").length,
        failed: results.filter((result) => result.status === "failed").length,
        results: results.map((result) => ({ status: result.status, url: result.url })),
        totalUrls: attempted || totalUrls,
      },
    });
  } catch (error) {
    console.warn(`Replay capture health report skipped: ${formatError(error)}`);
  }
}

async function mirrorReplayManifestsToCohortOutDir(input: {
  calibrationDir: string;
  cohortOutDir: string;
  domain: string;
}) {
  const entries = await readdir(input.calibrationDir, { withFileTypes: true }).catch(() => []);
  const manifestEntries = entries.filter((entry) => entry.isFile() && /^replay_.+\.manifest\.json$/i.test(entry.name));
  if (manifestEntries.length === 0) {
    return;
  }
  const replayIndexDir = path.join(input.cohortOutDir, input.domain, "replay-manifests");
  await mkdir(replayIndexDir, { recursive: true });
  for (const entry of manifestEntries) {
    await copyFile(path.join(input.calibrationDir, entry.name), path.join(replayIndexDir, entry.name));
  }
}

async function mirrorScanDiagnosticsToCohortOutDir(input: {
  calibrationDir: string;
  cohortOutDir: string;
  domain: string;
}) {
  const entries = await readdir(input.calibrationDir, { withFileTypes: true }).catch(() => []);
  const diagnosticEntries = entries.filter((entry) =>
    entry.isFile() &&
    /^(?:V2ScanCorePhases|V2ScanLabStepDiagnostics|V2ScanLabTiming)\.json$/i.test(entry.name)
  );
  if (diagnosticEntries.length === 0) {
    return;
  }
  const diagnosticsDir = path.join(input.cohortOutDir, input.domain, "scan-diagnostics");
  await mkdir(diagnosticsDir, { recursive: true });
  for (const entry of diagnosticEntries) {
    await copyFile(path.join(input.calibrationDir, entry.name), path.join(diagnosticsDir, entry.name));
  }
}

function buildSummary(args: Args, totalUrls: number, results: CohortResult[], completedAt?: Date): CohortSummary {
  const completed = results.filter((result) => result.status === "completed");
  return {
    cohortSummaryVersion: "wc01.v2_scan_lab_cohort.1",
    completedAt: completedAt?.toISOString(),
    generatedAt: new Date().toISOString(),
    input: {
      continueOnError: args.continueOnError,
      captureReplay: args.captureReplay,
      consentDag: args.consentDag,
      dryRun: args.dryRun,
      endpointEnrichmentMaxHosts: args.endpointEnrichmentMaxHosts,
      endpointEnrichmentRegistryPath: args.endpointEnrichmentRegistryPath,
      endpointEnrichmentTimeoutMs: args.endpointEnrichmentTimeoutMs,
      enrichEndpoints: args.enrichEndpoints,
      enrichEndpointsDns: args.enrichEndpointsDns,
      limit: args.limit,
      outDir: args.outDir,
      profile: args.profile,
      resume: args.resume,
      scanStepTimeoutMs: args.scanStepTimeoutMs,
      startAt: args.startAt,
      totalUrls,
      urlsPath: args.urlsPath,
    },
    results,
    totals: {
      completed: completed.length,
      failed: results.filter((result) => result.status === "failed").length,
      headedFallbackUsed: completed.filter((result) => result.headedFallbackUsed).length,
      noGoCandidates: completed.filter((result) => result.runtime.noGoCandidate === true).length,
      sitesWithPreConsentTracking: completed.filter((result) => result.runtime.preConsentTrackingObserved === true).length,
      sitesWithSessionReplayOrBehavioralAnalytics: completed.filter(
        (result) => result.runtime.sessionReplayOrBehavioralAnalyticsObserved === true,
      ).length,
      sitesWithThirdPartyCookiesBeforeConsent: completed.filter(
        (result) => result.runtime.thirdPartyCookiesPreConsentObserved === true,
      ).length,
      skipped: results.filter((result) => result.status === "skipped").length,
      endpointEnrichmentCandidatesObserved: sumEndpointEnrichment(completed, "candidatesObserved"),
      endpointEnrichmentFailures: sumEndpointEnrichment(completed, "enrichmentFailures"),
      endpointEnrichmentNewEntries: sumEndpointEnrichment(completed, "newEntries"),
      endpointEnrichmentOverlayRegionObservedEntries: sumEndpointEnrichment(completed, "overlayRegionObservedEntries"),
      endpointEnrichmentOverlaysWritten: completed.filter((result) => Boolean(result.endpointEnrichment?.overlayPath)).length,
      endpointEnrichmentUnknownAfterEnrichment: sumEndpointEnrichment(completed, "unknownAfterEnrichment"),
      endpointEnrichmentUpdatedEntries: sumEndpointEnrichment(completed, "updatedEntries"),
      totalRuntimeMs: results.reduce((sum, result) => sum + result.durationMs, 0),
    },
  };
}

async function withScanStepTimeout<T>(timeoutMs: number | undefined, operation: () => Promise<T>): Promise<T> {
  if (timeoutMs === undefined) {
    return operation();
  }
  const previous = process.env.CERTSCORE_V2_SCAN_STEP_TIMEOUT_MS;
  process.env.CERTSCORE_V2_SCAN_STEP_TIMEOUT_MS = String(timeoutMs);
  try {
    return await operation();
  } finally {
    if (previous === undefined) {
      delete process.env.CERTSCORE_V2_SCAN_STEP_TIMEOUT_MS;
    } else {
      process.env.CERTSCORE_V2_SCAN_STEP_TIMEOUT_MS = previous;
    }
  }
}

function sumEndpointEnrichment(
  results: CohortResult[],
  key: keyof Pick<
    EndpointEnrichmentRunSummary,
    | "candidatesObserved"
    | "enrichmentFailures"
    | "newEntries"
    | "overlayRegionObservedEntries"
    | "unknownAfterEnrichment"
    | "updatedEntries"
  >,
): number {
  return results.reduce((sum, result) => sum + (result.endpointEnrichment?.[key] ?? 0), 0);
}

function dedupeCohortResults(results: CohortResult[]): CohortResult[] {
  const byUrl = new Map<string, CohortResult>();
  for (const result of results) {
    const existing = byUrl.get(result.url);
    if (!existing || shouldReplaceCohortResult(existing, result)) {
      byUrl.set(result.url, result);
    }
  }
  return [...byUrl.values()].sort((left, right) => left.index - right.index);
}

function upsertCohortResult(results: CohortResult[], result: CohortResult) {
  const existingIndex = results.findIndex((entry) => entry.url === result.url);
  if (existingIndex === -1) {
    results.push(result);
  } else if (shouldReplaceCohortResult(results[existingIndex]!, result)) {
    results[existingIndex] = result;
  }
  results.sort((left, right) => left.index - right.index);
}

function shouldReplaceCohortResult(existing: CohortResult, candidate: CohortResult): boolean {
  const rank = (status: CohortResult["status"]) => {
    switch (status) {
      case "completed":
        return 3;
      case "failed":
        return 2;
      case "skipped":
        return 1;
    }
  };
  const existingRank = rank(existing.status);
  const candidateRank = rank(candidate.status);
  if (candidateRank !== existingRank) {
    return candidateRank > existingRank;
  }
  return new Date(candidate.completedAt).getTime() >= new Date(existing.completedAt).getTime();
}

function renderMarkdown(summary: CohortSummary) {
  return [
    "# WC01 v2 Scan Lab Cohort Summary",
    "",
    "Internal diagnostic only. Artifact-only. Non-persistent. Not customer-facing report output.",
    "",
    `- Profile: ${summary.input.profile}`,
    `- URL list: ${summary.input.urlsPath}`,
    `- Output dir: ${summary.input.outDir}`,
    `- Completed: ${summary.totals.completed}`,
    `- Failed: ${summary.totals.failed}`,
    `- Skipped: ${summary.totals.skipped}`,
    `- Consent DAG: ${summary.input.consentDag ? "enabled" : "disabled"}`,
    `- Headed fallback used: ${summary.totals.headedFallbackUsed}`,
    `- Blocked/no-go candidates: ${summary.totals.noGoCandidates}`,
    `- Pre-consent tracking observed: ${summary.totals.sitesWithPreConsentTracking}`,
    `- Third-party cookies before consent observed: ${summary.totals.sitesWithThirdPartyCookiesBeforeConsent}`,
    `- Session replay or behavioral analytics observed: ${summary.totals.sitesWithSessionReplayOrBehavioralAnalytics}`,
    `- Endpoint enrichment: ${summary.input.enrichEndpoints ? "enabled" : "disabled"}`,
    `- Endpoint enrichment DNS: ${summary.input.enrichEndpointsDns ? "enabled" : "disabled"}`,
    `- Endpoint enrichment candidates observed: ${summary.totals.endpointEnrichmentCandidatesObserved}`,
    `- Endpoint enrichment new/updated entries: ${summary.totals.endpointEnrichmentNewEntries}/${summary.totals.endpointEnrichmentUpdatedEntries}`,
    `- Endpoint enrichment overlay region entries: ${summary.totals.endpointEnrichmentOverlayRegionObservedEntries}`,
    `- Endpoint enrichment failures: ${summary.totals.endpointEnrichmentFailures}`,
    "",
    "## Sites",
    "",
    "| # | Domain | Status | Seeded privacy controls | Runtime coverage | No-go candidate | 3P requests | Cookies before consent | Vendors | Journeys | Eligible candidates | Endpoint enrichment | Runtime limitations |",
    "|---:|---|---|---|---|---|---:|---:|---:|---:|---:|---|---|",
    ...summary.results.map(renderSiteRow),
    "",
    "## Guardrail Posture",
    "",
    "- internal Scan Lab diagnostic only",
    "- generated artifacts remain local files",
    "- no production report cards, checklist rows, scoring, regulatory lenses, or normalized concerns are updated",
    "- v2 candidate keys are measurements for review, not customer-facing findings",
    "",
  ].join("\n");
}

function renderSiteRow(result: CohortResult) {
  const limitations = result.moduleRuns
    .filter((run) => run.status !== "completed" || run.errors.length > 0)
    .map((run) => `${run.moduleName}:${run.status}`)
    .join(", ");
  return [
    result.index,
    result.domain ?? result.url,
    result.status,
    result.privacyControlUrls.join(", "),
    result.runtime.coverageStatus ?? "",
    result.runtime.noGoCandidate === true ? result.runtime.noGoReasons.join(", ") : "",
    result.runtime.thirdPartyRequests,
    result.runtime.cookiesBeforeConsent,
    result.runtime.vendorObservations,
    result.runtime.observedJourneys,
    result.eligibleFindingKeys.length,
    endpointEnrichmentCell(result.endpointEnrichment),
    limitations || (result.error ? "chain_failed" : ""),
  ]
    .map(escapeMarkdownCell)
    .join(" | ")
    .replace(/^/, "| ")
    .replace(/$/, " |");
}

function endpointEnrichmentCell(summary: EndpointEnrichmentRunSummary | undefined) {
  if (!summary) {
    return "";
  }
  return [
    `candidates=${summary.candidatesObserved}`,
    `new=${summary.newEntries}`,
    `updated=${summary.updatedEntries}`,
    `overlayRegions=${summary.overlayRegionObservedEntries}`,
    `failures=${summary.enrichmentFailures}`,
  ].join(", ");
}

function buildSkippedResult(input: { index: number; url: string }): CohortResult {
  return {
    completedAt: new Date().toISOString(),
    durationMs: 0,
    eligibleFindingKeys: [],
    headedFallbackUsed: false,
    index: input.index,
    moduleRuns: [],
    privacyControlUrls: [],
    reviewCandidateCounts: { eligible: 0, notEligible: 0, total: 0 },
    runtime: emptyRuntimeSummary(),
    startedAt: new Date().toISOString(),
    status: "skipped",
    url: input.url,
  };
}

function emptyRuntimeSummary(): RuntimeSummary {
  return {
    consentBannerLikelyPresent: null,
    coverageLimitationKeys: [],
    coverageStatus: undefined,
    cookieEvents: 0,
    cookiesBeforeConsent: 0,
    noGoCandidate: false,
    noGoReasons: [],
    observedJourneys: 0,
    preConsentTrackingObserved: null,
    sessionReplayOrBehavioralAnalyticsObserved: null,
    silentEmptyRuntime: false,
    thirdPartyCookiesPreConsentObserved: null,
    thirdPartyRequests: 0,
    vendorObservations: 0,
  };
}

async function readCohortPlan(urlsPath: string): Promise<CohortPlanEntry[]> {
  const content = await readFile(urlsPath, "utf8");
  const entries = content
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+#.*$/, "").trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map(parseCohortPlanLine);
  const deduped = dedupePlanEntries(entries);
  if (deduped.length !== 50 && path.normalize(urlsPath) === path.normalize(DEFAULT_URLS_PATH)) {
    throw new Error(`Expected the default 50-site cohort to contain exactly 50 unique URLs, found ${deduped.length}.`);
  }
  return deduped;
}

function parseCohortPlanLine(line: string): CohortPlanEntry {
  if (!line.startsWith("{")) {
    return { expectedLanes: [], url: line, privacyControlUrls: [] };
  }
  const parsed = JSON.parse(line) as Record<string, unknown>;
  const url = asString(parsed.url) ?? asString(parsed.normalizedUrl);
  if (!url) {
    throw new Error(`Cohort plan JSON line is missing url: ${line}`);
  }
  const seedUrls = asRecord(parsed.seedUrls);
  const expectedLanes = asStringArray(parsed.expectedLanes);
  const includeSeededPrivacyOptOut = expectedLanes.length === 0 || expectedLanes.includes("privacy_opt_out_flow");
  const privacyControlUrls = [
    ...asStringArray(parsed.privacyControlUrls),
    ...asStringArray(parsed.privacyControlUrl),
    ...(includeSeededPrivacyOptOut ? asStringArray(seedUrls.privacyOptOut) : []),
    ...(includeSeededPrivacyOptOut ? asStringArray(seedUrls.privacyOptOutUrl) : []),
    ...(includeSeededPrivacyOptOut ? asStringArray(seedUrls.privacyControl) : []),
    ...(includeSeededPrivacyOptOut ? asStringArray(seedUrls.privacyControlUrl) : []),
  ];
  return {
    expectedLanes,
    url,
    privacyControlUrls: [...new Set(privacyControlUrls)],
  };
}

function dedupePlanEntries(entries: CohortPlanEntry[]): CohortPlanEntry[] {
  const byUrl = new Map<string, CohortPlanEntry>();
  for (const entry of entries) {
    const existing = byUrl.get(entry.url);
    if (!existing) {
      byUrl.set(entry.url, { ...entry, privacyControlUrls: [...entry.privacyControlUrls] });
      continue;
    }
    existing.expectedLanes = [...new Set([...existing.expectedLanes, ...entry.expectedLanes])];
    existing.privacyControlUrls = [...new Set([...existing.privacyControlUrls, ...entry.privacyControlUrls])];
  }
  return [...byUrl.values()];
}

function captureReplayAuxiliaryProbesForEntry(
  profile: V2ScanLabRunProfile,
  entry: CohortPlanEntry,
): "all" | "none" | "form" | "accessibility" {
  if (profile !== "full") {
    return "none";
  }
  const hasFormProbe = entry.expectedLanes.includes("form_collection_probe");
  const hasAccessibilityProbe = entry.expectedLanes.includes("accessibility_probe");
  if (hasFormProbe && hasAccessibilityProbe) {
    return "all";
  }
  if (hasFormProbe) {
    return "form";
  }
  if (hasAccessibilityProbe) {
    return "accessibility";
  }
  return "none";
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    continueOnError: true,
    captureReplay: false,
    consentDag: false,
    dryRun: false,
    endpointEnrichmentRegistryPath: path.join("artifacts", "v2-endpoint-enrichment-registry", "EndpointEnrichmentRegistry.json"),
    enrichEndpoints: false,
    enrichEndpointsDns: true,
    outDir: path.join("./artifacts", `v2-scan-lab-cohort-${formatRunTimestamp(new Date())}`),
    profile: "standard",
    resume: false,
    startAt: 1,
    urlsPath: DEFAULT_URLS_PATH,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) {
      continue;
    }
    if (arg === "--") {
      continue;
    } else if (arg === "--urls") {
      args.urlsPath = requiredValue(argv, ++index, arg);
    } else if (arg === "--profile") {
      const profile = requiredValue(argv, ++index, arg);
      if (!isV2ScanLabRunProfile(profile)) {
        throw new Error(`Unsupported profile: ${profile}`);
      }
      args.profile = profile;
    } else if (arg === "--out-dir") {
      args.outDir = requiredValue(argv, ++index, arg);
    } else if (arg === "--limit") {
      args.limit = parsePositiveInteger(requiredValue(argv, ++index, arg), arg);
    } else if (arg === "--start-at") {
      args.startAt = parsePositiveInteger(requiredValue(argv, ++index, arg), arg);
    } else if (arg === "--scan-step-timeout-ms") {
      args.scanStepTimeoutMs = parsePositiveInteger(requiredValue(argv, ++index, arg), arg);
    } else if (arg === "--resume") {
      args.resume = true;
    } else if (arg === "--fail-fast") {
      args.continueOnError = false;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--capture-replay") {
      args.captureReplay = true;
    } else if (arg === "--consent-dag" || arg === "--consentDag") {
      args.consentDag = true;
    } else if (arg === "--enrich-endpoints") {
      args.enrichEndpoints = true;
    } else if (arg === "--endpoint-enrichment-no-dns") {
      args.enrichEndpointsDns = false;
    } else if (arg === "--endpoint-enrichment-registry") {
      args.endpointEnrichmentRegistryPath = requiredValue(argv, ++index, arg);
    } else if (arg === "--endpoint-enrichment-timeout-ms") {
      args.endpointEnrichmentTimeoutMs = parsePositiveInteger(requiredValue(argv, ++index, arg), arg);
    } else if (arg === "--endpoint-enrichment-max-hosts") {
      args.endpointEnrichmentMaxHosts = parsePositiveInteger(requiredValue(argv, ++index, arg), arg);
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
    "  pnpm v2:wc01-scan-lab-cohort [--urls <path>] [--profile standard|tiny|policy|consent|full] [--out-dir <dir>]",
    "                                [--limit <n>] [--start-at <n>] [--resume] [--fail-fast] [--dry-run] [--capture-replay]",
    "                                [--consent-dag] [--scan-step-timeout-ms <n>]",
    "                                [--enrich-endpoints] [--endpoint-enrichment-no-dns]",
    "                                [--endpoint-enrichment-registry <path>] [--endpoint-enrichment-timeout-ms <n>]",
    "                                [--endpoint-enrichment-max-hosts <n>]",
    "",
    "Runs a sequential internal v2 Scan Lab artifact cohort and writes JSON/Markdown rollups.",
    "Default URL list: ./docs/certscore-v2/calibration-urls-lab-50.txt",
    "",
    "Artifact-only. Non-persistent. Not implementation approval. Not customer-facing report output.",
  ].join("\n");
}

function requiredValue(argv: string[], index: number, flag: string) {
  const value = argv[index];
  if (!value) {
    throw new Error(`Missing value for ${flag}.`);
  }
  return value;
}

function parsePositiveInteger(value: string, flag: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`Expected ${flag} to be a positive integer.`);
  }
  return parsed;
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function coalesceArray(...values: unknown[]) {
  for (const value of values) {
    if (Array.isArray(value)) {
      return value;
    }
  }
  return [];
}

function asString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function asStringArray(value: unknown) {
  if (typeof value === "string") {
    return [value];
  }
  return asArray(value).map((item) => String(item));
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function detectNoGoCandidateReasons(bundle: Record<string, unknown>, calibrationDir?: string) {
  const reasons = new Set<string>();
  const scanNoGoAssessment = asRecord(bundle.scanNoGoAssessment ?? bundle.scan_no_go_assessment);
  const explicitScanNoGo = asString(scanNoGoAssessment.decision) === "no_go";
  if (explicitScanNoGo) {
    for (const reasonCode of asStringArray(scanNoGoAssessment.reasonCodes)) {
      reasons.add(`scan_no_go:${reasonCode}`);
    }
  }
  const moduleRuns = coalesceArray(bundle.modulesRun, asRecord(bundle.metadata).moduleRuns).map(asRecord);
  const policyRun = moduleRuns.find((moduleRun) => asString(moduleRun.moduleName) === "policySurfaceScanner");
  const policyErrors = asStringArray(policyRun?.errors);
  const policyHomepageForbidden = policyErrors.some((error) =>
    /homepage fetch failed with status 403|forbidden|access denied/i.test(error),
  );
  const domText = readOptionalText(calibrationDir ? path.join(calibrationDir, "dom-text-pre-consent.txt") : undefined);
  const normalizedDomText = domText.replace(/\s+/g, " ").trim();
  const lowerDomText = normalizedDomText.toLowerCase();
  const blockTextMatches = [
    ["access_temporarily_restricted", "access is temporarily restricted"],
    ["automated_activity", "automated (bot) activity"],
    ["security_service_block", "this website is using a security service"],
    ["unable_to_access", "you are unable to access"],
    ["blocked_message", "you have been blocked"],
    ["human_verification", "verify you are human"],
    ["connection_security_review", "checking if the site connection is secure"],
    ["connection_security_review", "needs to review the security of your connection"],
  ].filter(([, needle]) => lowerDomText.includes(needle));

  for (const [reason] of blockTextMatches) {
    reasons.add(`block_page_text:${reason}`);
  }
  if (policyHomepageForbidden) {
    reasons.add("policy_homepage_fetch_403");
  }
  if (normalizedDomText.length === 0) {
    reasons.add("dom_text_empty");
  }

  const vendorObservations = coalesceArray(bundle.normalizedVendorObservations, asRecord(bundle.evidence).normalizedVendorObservations);
  if (vendorObservations.length === 0) {
    reasons.add("vendor_observations_zero");
  }
  const responseEvents = coalesceArray(bundle.networkResponseEvents, asRecord(bundle.evidence).networkResponseEvents).map(asRecord);
  const homepageResponseForbidden = responseEvents.some((event) => {
    const status = asNumber(event.status);
    const firstParty = event.firstParty === true;
    const pathValue = asString(event.path) ?? "";
    const responseUrl = asString(event.responseUrl) ?? asString(event.url) ?? "";
    return status === 403 && firstParty && (pathValue === "/" || /https:\/\/(?:www\.)?[^/]+\/?$/.test(responseUrl));
  });
  if (homepageResponseForbidden) {
    reasons.add("homepage_response_403");
  }
  const networkEvents = coalesceArray(bundle.networkEvents, asRecord(bundle.evidence).networkEvents).map(asRecord);
  const cloudflareChallengeObserved = networkEvents.some((event) => {
    const requestUrl = asString(event.requestUrl) ?? asString(event.url) ?? "";
    const hostname = asString(event.requestHostname) ?? asString(event.hostname) ?? "";
    const pathValue = asString(event.path) ?? "";
    const documentUrl = asString(event.documentUrl) ?? asString(event.topLevelUrl) ?? "";
    return (
      requestUrl.includes("/cdn-cgi/challenge-platform/") ||
      pathValue.includes("/cdn-cgi/challenge-platform/") ||
      documentUrl.includes("__cf_chl_rt_tk=") ||
      (hostname === "challenges.cloudflare.com" && requestUrl.includes("/turnstile/"))
    );
  });
  if (cloudflareChallengeObserved) {
    reasons.add("network_cloudflare_challenge");
  }
  const datadomeChallengeObserved = [...networkEvents, ...responseEvents].some((event) => {
    const requestUrl = asString(event.requestUrl) ?? asString(event.responseUrl) ?? asString(event.url) ?? "";
    const hostname = asString(event.requestHostname) ?? asString(event.hostname) ?? "";
    const pathValue = asString(event.path) ?? "";
    const cookieNames = asStringArray(event.cookieNamesSet);
    return (
      hostname.endsWith("captcha-delivery.com") ||
      requestUrl.includes("captcha-delivery.com/captcha") ||
      pathValue.includes("/captcha/") ||
      cookieNames.includes("datadome")
    );
  });
  if (datadomeChallengeObserved) {
    reasons.add("network_datadome_challenge");
  }

  const hasDirectBlockEvidence = [...reasons].some((reason) => reason.startsWith("block_page_text:"));
  const hasEmptyForbiddenShell =
    (policyHomepageForbidden || homepageResponseForbidden) &&
    normalizedDomText.length === 0 &&
    vendorObservations.length === 0;
  const hasEmptyCloudflareChallengeShell =
    cloudflareChallengeObserved &&
    normalizedDomText.length === 0 &&
    vendorObservations.length === 0;
  const hasEmptyDatadomeChallengeShell =
    datadomeChallengeObserved &&
    normalizedDomText.length === 0 &&
    vendorObservations.length === 0;

  if (
    !explicitScanNoGo &&
    !hasDirectBlockEvidence &&
    !hasEmptyForbiddenShell &&
    !hasEmptyCloudflareChallengeShell &&
    !hasEmptyDatadomeChallengeShell
  ) {
    return [];
  }
  return [...reasons].sort();
}

function readOptionalText(filePath: string | undefined) {
  if (!filePath || !existsSync(filePath)) {
    return "";
  }
  return readFileSync(filePath, "utf8");
}

function formatRunTimestamp(date: Date) {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "");
}

function formatError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function escapeMarkdownCell(value: unknown) {
  return String(value).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
