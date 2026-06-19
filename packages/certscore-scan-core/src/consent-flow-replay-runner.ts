import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import { chromium } from "playwright";

export interface ConsentFlowReplayManifest {
  actionApplied?: boolean;
  actionType?: string;
  artifactPaths?: {
    controls?: string;
    frameSnapshots?: string;
    har?: string;
    originalConsentEvidence?: string;
    storageState?: string;
    trace?: string;
  };
  capturedAtMs?: number;
  frameCount?: number;
  networkEventCount?: number;
  normalizedUrl?: string;
  replayArtifactVersion?: string;
  scenario?: string;
  sourceScanner?: string;
  url?: string;
}

export interface ConsentFlowReplayValidationInput {
  corpusDir?: string;
  manifestPaths?: string[];
  outDir?: string;
  timeoutMs?: number;
}

export interface ConsentFlowReplayValidationResult {
  summary: {
    corpusDir?: string;
    evaluatedManifests: number;
    replayable: number;
    failed: number;
    missingHar: number;
    outputDir?: string;
  };
  results: ConsentFlowReplayValidationEntry[];
}

export interface ConsentFlowReplayValidationEntry {
  manifestPath: string;
  scenario?: string;
  sourceUrl?: string;
  harPath?: string;
  status: "replayable" | "failed" | "missing_har";
  finalUrl?: string;
  title?: string;
  bodyTextLength?: number;
  frameCount?: number;
  error?: string;
}

export type ConsentFlowReplayMode = "validate" | "evidence";

export type ConsentSurfaceType =
  | "first_layer_banner"
  | "iframe_banner"
  | "preference_center"
  | "footer_privacy_control"
  | "floating_privacy_control"
  | "privacy_policy_only"
  | "not_observed";

export type ReplayActionCandidateType =
  | "accept"
  | "reject"
  | "settings/manage"
  | "save/confirm"
  | "do_not_sell_share"
  | "privacy_policy_or_notice_only";

export type ReplayFailureReason =
  | "provider_observed_no_banner"
  | "banner_observed_no_reject_candidate"
  | "settings_observed_no_save_candidate"
  | "footer_link_policy_only"
  | "frame_dom_unavailable"
  | "iframe_provider_observed_candidate_missing"
  | "action_candidate_low_confidence"
  | "original_scan_missing_candidate_now_detected"
  | "original_scan_detected_candidate_now_missing"
  | "network_phase_missing"
  | "insufficient_artifacts";

export interface ReplayProviderDetectionSignal {
  provider: string;
  source: "dom" | "text" | "har" | "storage";
  signal: string;
  confidence: number;
  frameContext?: ReplayFrameContext;
}

export interface ReplayFrameContext {
  frameIndex: number;
  frameKind: "main_frame" | "sub_frame";
  frameName?: string;
  frameUrl?: string;
}

export interface ReplayEvidenceActionCandidate {
  action: ReplayActionCandidateType;
  label: string;
  frameContext?: ReplayFrameContext;
  confidence: number;
  reason: string;
  sourceScenario?: string;
}

export interface ReplayNetworkVendorSummary {
  preConsent: ReplayNetworkPhaseSummary;
  postAccept: ReplayNetworkPhaseSummary;
  postReject: ReplayNetworkPhaseSummary;
  gpcEnabled: ReplayNetworkPhaseSummary;
  privacyOptOut: ReplayNetworkPhaseSummary;
}

export interface ReplayNetworkPhaseSummary {
  vendors: string[];
  endpoints: string[];
  requestCount: number;
}

export interface ReplayPolicySurfaceSummary {
  surfaceType: string;
  url?: string;
  normalizedUrl?: string;
  linkText?: string;
  status?: string;
  httpStatus?: number;
  fetchable?: boolean;
  clickable?: boolean;
  mayLeadToConsentControls?: boolean;
  observedTopics: string[];
  mentionedVendors: string[];
  mentionedPurposes: string[];
  mentionedRights: string[];
  mentionedControls: string[];
  boundedTextExcerptIds: string[];
  confidence?: number;
}

export interface ReplayPolicyEvidenceOutcome {
  policyArtifactStatus: "present" | "missing";
  policySurfaceCount: number;
  privacyNoticeAvailability: "observed" | "not_observed";
  cookiePolicyAvailability: "observed" | "not_observed";
  noticeAtCollectionAvailability: "observed" | "not_observed";
  doNotSellShareAvailability: "observed" | "not_observed";
  privacyChoicesAvailability: "observed" | "not_observed";
  saleShareDisclosureSignals: "observed" | "not_observed";
  targetedAdvertisingDisclosureSignals: "observed" | "not_observed";
  gpcDisclosureSignals: "observed" | "not_observed";
  sensitivePersonalInformationDisclosureSignals: "observed" | "not_observed";
  consumerRightsSignals: "observed" | "not_observed";
  vendorDisclosureSignals: "observed" | "not_observed";
  consentWithdrawalSignals: "observed" | "not_observed";
  notes: string[];
}

export interface ReplayClassificationDelta {
  originalCandidateActions: string[];
  replayCandidateActions: ReplayActionCandidateType[];
  originalRejectCandidateObserved: boolean;
  replayRejectCandidateObserved: boolean;
  originalScanMissingCandidateNowDetected: boolean;
  originalScanDetectedCandidateNowMissing: boolean;
  notes: string[];
}

export interface ReplayOriginalActionAttemptSummary {
  actionType?: string;
  attempted?: boolean;
  succeeded?: boolean;
  failureReason?: string;
  candidateObserved?: boolean;
  candidateLabelText?: string;
  candidateNormalizedActionType?: string;
  actionPath?: string;
  frameUrl?: string;
}

export interface ReplayConsentBehaviorOutcome {
  cmpBanner: "observed" | "not_observed";
  privacyChoicesSurface: "observed" | "not_observed";
  optOutAction: "observed_and_testable" | "observed_not_testable" | "not_observed";
  acceptAllAction: "observed_and_testable" | "observed_not_testable" | "not_observed_not_testable";
  postRejectCookieBehavior: "established" | "not_established";
  postOptOutPrivacyBehavior: "testable" | "not_testable";
  notes: string[];
}

export type ReplayCoverageLaneStatus =
  | "testable"
  | "observed"
  | "not_observed"
  | "not_testable"
  | "needs_additional_probe";

export interface ReplayRegulatoryCoverageAssessment {
  ccpaCpra: {
    privacyNoticeAvailability: ReplayCoverageLaneStatus;
    noticeAtCollection: ReplayCoverageLaneStatus;
    doNotSellShareAvailability: ReplayCoverageLaneStatus;
    privacyChoicesAvailability: ReplayCoverageLaneStatus;
    privacyOptOutBehavior: ReplayCoverageLaneStatus;
    gpcHandling: ReplayCoverageLaneStatus;
    saleShareDisclosureSignals: ReplayCoverageLaneStatus;
    targetedAdvertisingDisclosureSignals: ReplayCoverageLaneStatus;
    sensitivePersonalInformationDisclosureSignals: ReplayCoverageLaneStatus;
    consumerRightsSignals: ReplayCoverageLaneStatus;
    sensitiveFormsWithThirdPartyTracking: ReplayCoverageLaneStatus;
    privacyControlAccessibility: ReplayCoverageLaneStatus;
  };
  gdprEprivacy: {
    consentBannerPreferenceSurface: ReplayCoverageLaneStatus;
    acceptAction: ReplayCoverageLaneStatus;
    declineRejectAction: ReplayCoverageLaneStatus;
    trackingAfterRefusal: ReplayCoverageLaneStatus;
    postAcceptBehavior: ReplayCoverageLaneStatus;
    postChoiceConsentControls: ReplayCoverageLaneStatus;
    cookiesStorageBeforeConsent: ReplayCoverageLaneStatus;
    thirdPartyTrackingBeforeConsent: ReplayCoverageLaneStatus;
    runtimeVendorDisclosureContext: ReplayCoverageLaneStatus;
    sessionReplayBehavioralAnalytics: ReplayCoverageLaneStatus;
    crossBorderEndpointReview: ReplayCoverageLaneStatus;
    consentControlAccessibility: ReplayCoverageLaneStatus;
  };
  corpusScenarios: {
    baselinePreConsent: boolean;
    acceptAllFlow: boolean;
    rejectAllFlow: boolean;
    gpcEnabled: boolean;
    privacyOptOutFlow: boolean;
    formCollectionProbe: boolean;
    accessibilityProbe: boolean;
  };
  notes: string[];
}

export interface ReplayEvidenceScenarioReport {
  manifestPath: string;
  scenario?: string;
  sourceUrl?: string;
  detectedProvider: string;
  providerDetectionSignals: ReplayProviderDetectionSignal[];
  bannerObservedCandidate: boolean;
  consentSurfaceType: ConsentSurfaceType;
  actionCandidates: ReplayEvidenceActionCandidate[];
  networkPhase: ReplayNetworkPhaseSummary;
  policySurfaces: ReplayPolicySurfaceSummary[];
  classificationDelta: ReplayClassificationDelta;
  actionAttemptSummaries: ReplayOriginalActionAttemptSummary[];
  failureReasons: ReplayFailureReason[];
  explanation: string;
  artifactStatus: {
    frameSnapshotsLoaded: boolean;
    harLoaded: boolean;
    originalConsentEvidenceLoaded: boolean;
    storageStateLoaded: boolean;
    tracePathPresent: boolean;
    controlsLoaded: boolean;
  };
}

export interface ReplayEvidenceSiteReport {
  siteId: string;
  sourceUrl?: string;
  detectedProvider: string;
  providerDetectionSignals: ReplayProviderDetectionSignal[];
  bannerObservedCandidate: boolean;
  consentSurfaceType: ConsentSurfaceType;
  actionCandidates: ReplayEvidenceActionCandidate[];
  networkVendorSummary: ReplayNetworkVendorSummary;
  policySurfaces: ReplayPolicySurfaceSummary[];
  policyEvidenceOutcome: ReplayPolicyEvidenceOutcome;
  classificationDelta: ReplayClassificationDelta;
  consentBehaviorOutcome: ReplayConsentBehaviorOutcome;
  coverageAssessment: ReplayRegulatoryCoverageAssessment;
  failureReasons: ReplayFailureReason[];
  scenarios: ReplayEvidenceScenarioReport[];
}

export interface ReplayEvidenceReport {
  summary: {
    corpusDir?: string;
    evaluatedSites: number;
    evaluatedManifests: number;
    providerCounts: Record<string, number>;
    failureFamilyCounts: Record<string, number>;
    outputDir?: string;
  };
  readiness: ReplayReadinessSummary;
  groupedByProvider: Record<string, Array<{ siteId: string; sourceUrl?: string; failureReasons: ReplayFailureReason[] }>>;
  groupedByFailureFamily: Record<string, Array<{ siteId: string; sourceUrl?: string; detectedProvider: string }>>;
  sites: ReplayEvidenceSiteReport[];
}

export interface ReplayReadinessSummary {
  recommendation: "READY_FOR_100_SITE_CAPTURE" | "NOT_READY_FOR_100_SITE_CAPTURE";
  reasons: string[];
  capturedManifestsAnalyzed: number;
  manifestsWithOriginalConsentEvidence: number;
  manifestsWithHarMetadata: number;
  manifestsWithFrameSnapshots: number;
  manifestsWithStorageMetadata: number;
  manifestsWithActionCandidates: number;
  providerDetectionCounts: Record<string, number>;
  surfaceTypeCounts: Record<string, number>;
  failureTaxonomyCounts: Record<string, number>;
  originalScanMissingCandidateNowDetected: number;
  originalScanDetectedCandidateNowMissing: number;
  insufficientArtifacts: number;
  networkPhaseMissing: number;
  coverage: {
    originalConsentEvidencePct: number;
    harMetadataPct: number;
    frameSnapshotsPct: number;
    storageMetadataPct: number;
    actionCandidatesPct: number;
  };
}

export async function validateConsentFlowReplayCorpus(
  input: ConsentFlowReplayValidationInput,
): Promise<ConsentFlowReplayValidationResult> {
  const manifestPaths = await resolveManifestPaths(input);
  const results = [];
  for (const manifestPath of manifestPaths) {
    results.push(await validateReplayManifest(manifestPath, input.timeoutMs ?? 12_000));
  }
  const result: ConsentFlowReplayValidationResult = {
    summary: {
      corpusDir: input.corpusDir ? path.resolve(input.corpusDir) : undefined,
      evaluatedManifests: results.length,
      replayable: results.filter((entry) => entry.status === "replayable").length,
      failed: results.filter((entry) => entry.status === "failed").length,
      missingHar: results.filter((entry) => entry.status === "missing_har").length,
      outputDir: input.outDir ? path.resolve(input.outDir) : undefined,
    },
    results,
  };
  if (input.outDir) {
    await writeReplayValidationArtifacts(input.outDir, result);
  }
  return result;
}

export function formatConsentFlowReplayValidationMarkdown(
  result: ConsentFlowReplayValidationResult,
): string {
  const lines = [
    "# Consent Flow Replay Validation",
    "",
    `- Evaluated manifests: ${result.summary.evaluatedManifests}`,
    `- Replayable: ${result.summary.replayable}`,
    `- Failed: ${result.summary.failed}`,
    `- Missing HAR: ${result.summary.missingHar}`,
  ];
  if (result.summary.corpusDir) {
    lines.push(`- Corpus directory: ${result.summary.corpusDir}`);
  }
  lines.push("", "## Results", "");
  for (const entry of result.results) {
    const label = [entry.scenario, entry.sourceUrl].filter(Boolean).join(" | ") || entry.manifestPath;
    lines.push(`- ${entry.status}: ${label}`);
    if (entry.error) {
      lines.push(`  - ${entry.error}`);
    }
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

export async function replayConsentFlowEvidenceCorpus(input: ConsentFlowReplayValidationInput): Promise<ReplayEvidenceReport> {
  const manifestPaths = await resolveManifestPaths(input);
  const scenarioReports = [];
  for (const manifestPath of manifestPaths) {
    scenarioReports.push(await analyzeReplayEvidenceManifest(manifestPath));
  }
  const sites = buildSiteReports(scenarioReports);
  const providerCounts: Record<string, number> = {};
  const failureFamilyCounts: Record<string, number> = {};
  const groupedByProvider: ReplayEvidenceReport["groupedByProvider"] = {};
  const groupedByFailureFamily: ReplayEvidenceReport["groupedByFailureFamily"] = {};

  for (const site of sites) {
    providerCounts[site.detectedProvider] = (providerCounts[site.detectedProvider] ?? 0) + 1;
    groupedByProvider[site.detectedProvider] ??= [];
    groupedByProvider[site.detectedProvider]?.push({
      siteId: site.siteId,
      sourceUrl: site.sourceUrl,
      failureReasons: site.failureReasons,
    });
    for (const failure of site.failureReasons) {
      failureFamilyCounts[failure] = (failureFamilyCounts[failure] ?? 0) + 1;
      groupedByFailureFamily[failure] ??= [];
      groupedByFailureFamily[failure]?.push({
        siteId: site.siteId,
        sourceUrl: site.sourceUrl,
        detectedProvider: site.detectedProvider,
      });
    }
  }

  const report: ReplayEvidenceReport = {
    summary: {
      corpusDir: input.corpusDir ? path.resolve(input.corpusDir) : undefined,
      evaluatedSites: sites.length,
      evaluatedManifests: scenarioReports.length,
      providerCounts: sortRecord(providerCounts),
      failureFamilyCounts: sortRecord(failureFamilyCounts),
      outputDir: input.outDir ? path.resolve(input.outDir) : undefined,
    },
    readiness: buildReplayReadinessSummary(sites),
    groupedByProvider,
    groupedByFailureFamily,
    sites,
  };
  if (input.outDir) {
    await writeReplayEvidenceArtifacts(input.outDir, report);
  }
  return report;
}

export function formatReplayEvidenceReportMarkdown(report: ReplayEvidenceReport): string {
  const lines = [
    "# Replay Evidence Report",
    "",
    `- Evaluated sites: ${report.summary.evaluatedSites}`,
    `- Evaluated manifests: ${report.summary.evaluatedManifests}`,
    `- Readiness: ${report.readiness.recommendation}`,
  ];
  if (report.summary.corpusDir) {
    lines.push(`- Corpus directory: ${report.summary.corpusDir}`);
  }
  lines.push("", "## Provider Summary", "");
  for (const [provider, count] of Object.entries(report.summary.providerCounts)) {
    lines.push(`- ${provider}: ${count}`);
  }
  lines.push("", "## Failure Families", "");
  for (const [failure, count] of Object.entries(report.summary.failureFamilyCounts)) {
    lines.push(`- ${failure}: ${count}`);
  }
  lines.push("", "## Replay Readiness", "");
  lines.push(`- Recommendation: ${report.readiness.recommendation}`);
  lines.push(`- Captured manifests analyzed: ${report.readiness.capturedManifestsAnalyzed}`);
  lines.push(`- Original consent evidence: ${report.readiness.manifestsWithOriginalConsentEvidence} (${formatPct(report.readiness.coverage.originalConsentEvidencePct)})`);
  lines.push(`- HAR metadata: ${report.readiness.manifestsWithHarMetadata} (${formatPct(report.readiness.coverage.harMetadataPct)})`);
  lines.push(`- Frame snapshots: ${report.readiness.manifestsWithFrameSnapshots} (${formatPct(report.readiness.coverage.frameSnapshotsPct)})`);
  lines.push(`- Storage metadata: ${report.readiness.manifestsWithStorageMetadata} (${formatPct(report.readiness.coverage.storageMetadataPct)})`);
  lines.push(`- Action candidates: ${report.readiness.manifestsWithActionCandidates} (${formatPct(report.readiness.coverage.actionCandidatesPct)})`);
  lines.push(`- original_scan_missing_candidate_now_detected: ${report.readiness.originalScanMissingCandidateNowDetected}`);
  lines.push(`- original_scan_detected_candidate_now_missing: ${report.readiness.originalScanDetectedCandidateNowMissing}`);
  lines.push(`- insufficient_artifacts: ${report.readiness.insufficientArtifacts}`);
  lines.push(`- network_phase_missing: ${report.readiness.networkPhaseMissing}`);
  lines.push("", "### Readiness Reasons", "");
  for (const reason of report.readiness.reasons.length > 0 ? report.readiness.reasons : ["No readiness blockers detected."]) {
    lines.push(`- ${reason}`);
  }
  lines.push("", "## Sites", "");
  lines.push("| Site | Provider | Surface | CMP/banner | Privacy surface | Opt-out | Accept-all | Policy | CCPA/CPRA signals | GDPR/ePrivacy signals | Corpus lanes | Post-reject cookies | Post-opt-out privacy | Failures |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const site of report.sites) {
    lines.push([
      site.sourceUrl ?? site.siteId,
      site.detectedProvider,
      site.consentSurfaceType,
      site.consentBehaviorOutcome.cmpBanner,
      site.consentBehaviorOutcome.privacyChoicesSurface,
      site.consentBehaviorOutcome.optOutAction,
      site.consentBehaviorOutcome.acceptAllAction,
      formatPolicyAvailability(site.policyEvidenceOutcome),
      formatCcpaSignals(site.policyEvidenceOutcome),
      formatGdprSignals(site.policyEvidenceOutcome),
      formatCorpusLanes(site.coverageAssessment),
      site.consentBehaviorOutcome.postRejectCookieBehavior,
      site.consentBehaviorOutcome.postOptOutPrivacyBehavior,
      site.failureReasons.join(", ") || "none",
    ].map(markdownCell).join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function analyzeReplayEvidenceManifest(manifestPath: string): Promise<ReplayEvidenceScenarioReport> {
  const resolvedManifestPath = path.resolve(manifestPath);
  const manifest = await readJsonSafely<ConsentFlowReplayManifest>(resolvedManifestPath);
  const sourceUrl = manifest?.url ?? manifest?.normalizedUrl;
  const frameSnapshotsPath = resolveArtifactPath(resolvedManifestPath, manifest?.artifactPaths?.frameSnapshots);
  const controlsPath = resolveArtifactPath(resolvedManifestPath, manifest?.artifactPaths?.controls);
  const harPath = resolveArtifactPath(resolvedManifestPath, manifest?.artifactPaths?.har);
  const storageStatePath = resolveArtifactPath(resolvedManifestPath, manifest?.artifactPaths?.storageState);
  const originalEvidencePath = resolveArtifactPath(resolvedManifestPath, manifest?.artifactPaths?.originalConsentEvidence);
  const tracePath = resolveArtifactPath(resolvedManifestPath, manifest?.artifactPaths?.trace);
  const frameSnapshotArtifact = frameSnapshotsPath ? await readJsonSafely<ReplayFrameSnapshotArtifact>(frameSnapshotsPath) : undefined;
  const controlsArtifact = controlsPath ? await readJsonSafely<ReplayControlsArtifact>(controlsPath) : undefined;
  const har = harPath ? await readJsonSafely<ReplayHar>(harPath) : undefined;
  const storageState = storageStatePath ? await readJsonSafely<unknown>(storageStatePath) : undefined;
  const originalEvidence = originalEvidencePath ? await readJsonSafely<ReplayOriginalConsentEvidence>(originalEvidencePath) : undefined;
  const policyBundle = await readPolicyBundleForManifest(resolvedManifestPath, [
    frameSnapshotsPath,
    controlsPath,
    harPath,
    storageStatePath,
    originalEvidencePath,
  ]);
  const frames = frameSnapshotArtifact?.frameSnapshots ?? [];
  const controls = controlsArtifact?.controls ?? [];
  const policySurfaces = summarizePolicySurfaceObservations(policyBundle?.policySurfaceObservations);
  const providerDetectionSignals = [
    ...detectProviderSignalsFromFrames(frames),
    ...detectProviderSignalsFromHar(har),
    ...detectProviderSignalsFromStorage(storageState),
  ];
  const detectedProvider = chooseProvider(providerDetectionSignals, frames);
  const actionCandidates = detectReplayActionCandidates(frames, controls, manifest?.scenario);
  const bannerObservedCandidate = hasBannerCandidate(frames, providerDetectionSignals, actionCandidates);
  const consentSurfaceType = detectConsentSurfaceType(frames, providerDetectionSignals, actionCandidates, bannerObservedCandidate);
  const networkPhase = summarizeHarNetworkPhase(har);
  const classificationDelta = compareReplayToOriginal(originalEvidence, actionCandidates);
  const actionAttemptSummaries = summarizeOriginalActionAttempts(originalEvidence);
  const artifactStatus = {
    frameSnapshotsLoaded: frames.length > 0,
    harLoaded: Boolean(har),
    originalConsentEvidenceLoaded: Boolean(originalEvidence),
    storageStateLoaded: Boolean(storageState),
    tracePathPresent: Boolean(tracePath && existsSync(tracePath)),
    controlsLoaded: controls.length > 0,
  };
  const failureReasons = determineFailureReasons({
    actionCandidates,
    artifactStatus,
    bannerObservedCandidate,
    classificationDelta,
    consentSurfaceType,
    frames,
    networkPhase,
    providerDetectionSignals,
  });
  return {
    manifestPath: resolvedManifestPath,
    scenario: manifest?.scenario,
    sourceUrl,
    detectedProvider,
    providerDetectionSignals,
    bannerObservedCandidate,
    consentSurfaceType,
    actionCandidates,
    networkPhase,
    policySurfaces,
    classificationDelta,
    actionAttemptSummaries,
    failureReasons,
    explanation: explainScenario({
      detectedProvider,
      consentSurfaceType,
      actionCandidates,
      failureReasons,
      providerDetectionSignals,
    }),
    artifactStatus,
  };
}

async function validateReplayManifest(
  manifestPath: string,
  timeoutMs: number,
): Promise<ConsentFlowReplayValidationEntry> {
  const resolvedManifestPath = path.resolve(manifestPath);
  try {
    const manifest = JSON.parse(await readFile(resolvedManifestPath, "utf8")) as ConsentFlowReplayManifest;
    const harPath = resolveArtifactPath(resolvedManifestPath, manifest.artifactPaths?.har);
    const sourceUrl = manifest.url ?? manifest.normalizedUrl;
    if (!harPath || !existsSync(harPath)) {
      return {
        manifestPath: resolvedManifestPath,
        scenario: manifest.scenario,
        sourceUrl,
        harPath,
        status: "missing_har",
        error: "Replay manifest does not reference an existing HAR artifact.",
      };
    }
    if (!sourceUrl) {
      return {
        manifestPath: resolvedManifestPath,
        scenario: manifest.scenario,
        harPath,
        status: "failed",
        error: "Replay manifest does not include a source URL.",
      };
    }

    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({
        ignoreHTTPSErrors: true,
        viewport: { width: 1366, height: 900 },
      });
      await context.routeFromHAR(harPath, { notFound: "abort" });
      const page = await context.newPage();
      await page.goto(sourceUrl, { timeout: timeoutMs, waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle", { timeout: Math.min(timeoutMs, 5_000) }).catch(() => undefined);
      const bodyTextLength = await page.locator("body").innerText({ timeout: 1_000 })
        .then((text) => text.replace(/\s+/g, " ").trim().length)
        .catch(() => 0);
      return {
        manifestPath: resolvedManifestPath,
        scenario: manifest.scenario,
        sourceUrl,
        harPath,
        status: "replayable",
        finalUrl: page.url(),
        title: await page.title().catch(() => undefined),
        bodyTextLength,
        frameCount: page.frames().length,
      };
    } finally {
      await browser.close();
    }
  } catch (error) {
    return {
      manifestPath: resolvedManifestPath,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

interface ReplayFrameSnapshotArtifact {
  frameSnapshots?: ReplayFrameSnapshot[];
}

interface ReplayFrameSnapshot {
  frameIndex: number;
  frameKind: "main_frame" | "sub_frame";
  frameName?: string;
  frameUrl?: string;
  htmlExcerpt?: string;
  textExcerpt?: string;
  title?: string;
}

interface ReplayControlsArtifact {
  controls?: ReplayControlSnapshot[];
}

interface ReplayControlSnapshot {
  actionType?: string;
  ariaLabel?: string;
  contextTextExcerpt?: string;
  controlIndex: number;
  frameContext?: ReplayFrameContext;
  href?: string;
  id?: string;
  labelText?: string;
  name?: string;
  normalizedLabel?: string;
  role?: string;
  tagName?: string;
  title?: string;
  type?: string;
}

interface ReplayOriginalConsentEvidence {
  actionAttempts?: Array<{
    actionType?: string;
    attempted?: boolean;
    succeeded?: boolean;
    failureReason?: string;
    actionProof?: {
      candidateObserved?: boolean;
      candidateLabelText?: string;
      candidateNormalizedActionType?: string;
      actionPath?: string;
      frameContext?: {
        frameUrl?: string;
      };
    };
  }>;
  actionCandidates?: Array<{
    actionType?: string;
    labelText?: string;
    confidence?: number;
  }>;
  networkEvents?: Array<{
    hostname?: string;
    requestUrl?: string;
    url?: string;
  }>;
}

interface ReplayPolicyBundleLike {
  policySurfaceObservations?: unknown[];
}

interface ReplayPolicySurfaceObservationLike {
  boundedTextExcerptIds?: unknown;
  clickable?: unknown;
  confidence?: unknown;
  fetchable?: unknown;
  httpStatus?: unknown;
  linkText?: unknown;
  mayLeadToConsentControls?: unknown;
  mentionedControls?: unknown;
  mentionedPurposes?: unknown;
  mentionedRights?: unknown;
  mentionedVendors?: unknown;
  normalizedUrl?: unknown;
  observedTopics?: unknown;
  status?: unknown;
  surfaceType?: unknown;
  url?: unknown;
}

interface ReplayHar {
  log?: {
    entries?: Array<{
      request?: {
        url?: string;
      };
      response?: {
        status?: number;
        headers?: Array<{ name?: string; value?: string }>;
      };
    }>;
  };
}

const providerPatterns: Array<{
  provider: string;
  confidence: number;
  patterns: RegExp[];
}> = [
  { provider: "Sourcepoint", confidence: 0.92, patterns: [/sourcepoint/i, /\bsp_message\b/i, /privacy-manager\.io/i, /sourcepoint\.mgr/i] },
  { provider: "Usercentrics", confidence: 0.9, patterns: [/usercentrics/i, /\buc-ui\b/i, /\buc_settings\b/i, /privacy-proxy\.usercentrics/i] },
  { provider: "Cookiebot/Usercentrics Cookiebot", confidence: 0.9, patterns: [/cookiebot/i, /\bcybot\b/i, /consent\.cookiebot/i] },
  { provider: "TrustArc", confidence: 0.9, patterns: [/trustarc/i, /\btruste\b/i, /notice\.trustarc/i] },
  { provider: "OneTrust", confidence: 0.91, patterns: [/onetrust/i, /optanon/i, /\bot-sdk\b/i, /cookielaw\.org/i] },
  { provider: "Didomi", confidence: 0.9, patterns: [/didomi/i] },
  { provider: "Quantcast Choice", confidence: 0.9, patterns: [/quantcast/i, /\bqc-cmp\b/i, /choice\.quantcast/i] },
  { provider: "Ketch", confidence: 0.88, patterns: [/\bketch\b/i, /ketchcdn/i] },
  { provider: "Osano", confidence: 0.88, patterns: [/osano/i] },
  { provider: "Termly", confidence: 0.88, patterns: [/termly/i] },
  { provider: "Iubenda", confidence: 0.88, patterns: [/iubenda/i] },
  { provider: "CookieYes", confidence: 0.88, patterns: [/cookieyes/i, /cookie-law-info/i] },
];

function detectProviderSignalsFromFrames(frames: ReplayFrameSnapshot[]): ReplayProviderDetectionSignal[] {
  const signals: ReplayProviderDetectionSignal[] = [];
  for (const frame of frames) {
    const frameContext = frameContextFromSnapshot(frame);
    const textSources = [
      { source: "dom" as const, value: frame.htmlExcerpt ?? "" },
      { source: "text" as const, value: frame.textExcerpt ?? "" },
      { source: "text" as const, value: `${frame.frameName ?? ""} ${frame.frameUrl ?? ""} ${frame.title ?? ""}` },
    ];
    for (const textSource of textSources) {
      for (const provider of providerPatterns) {
        const match = provider.patterns.find((pattern) => pattern.test(textSource.value));
        if (match) {
          signals.push({
            provider: provider.provider,
            source: textSource.source,
            signal: match.source,
            confidence: provider.confidence,
            frameContext,
          });
        }
      }
    }
  }
  return dedupeProviderSignals(signals);
}

function detectProviderSignalsFromHar(har: ReplayHar | undefined): ReplayProviderDetectionSignal[] {
  const signals: ReplayProviderDetectionSignal[] = [];
  const urls = har?.log?.entries?.map((entry) => entry.request?.url ?? "").filter(Boolean) ?? [];
  for (const url of urls) {
    for (const provider of providerPatterns) {
      const match = provider.patterns.find((pattern) => pattern.test(url));
      if (match) {
        signals.push({
          provider: provider.provider,
          source: "har",
          signal: trimForReport(url, 180),
          confidence: provider.confidence,
        });
      }
    }
  }
  return dedupeProviderSignals(signals);
}

function detectProviderSignalsFromStorage(storage: unknown): ReplayProviderDetectionSignal[] {
  const text = JSON.stringify(storage ?? {});
  const signals: ReplayProviderDetectionSignal[] = [];
  for (const provider of providerPatterns) {
    const match = provider.patterns.find((pattern) => pattern.test(text));
    if (match) {
      signals.push({
        provider: provider.provider,
        source: "storage",
        signal: match.source,
        confidence: provider.confidence,
      });
    }
  }
  return dedupeProviderSignals(signals);
}

function chooseProvider(signals: ReplayProviderDetectionSignal[], frames: ReplayFrameSnapshot[]): string {
  const counts = new Map<string, number>();
  for (const signal of signals) {
    counts.set(signal.provider, (counts.get(signal.provider) ?? 0) + signal.confidence);
  }
  const winner = [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
  if (winner) {
    return winner;
  }
  const combinedText = frames.map((frame) => `${frame.htmlExcerpt ?? ""} ${frame.textExcerpt ?? ""}`).join(" ");
  if (/cookie|consent|privacy preference|privacy choices|do not sell|preferences/i.test(combinedText)) {
    return "generic/unknown CMP";
  }
  return "none";
}

function detectReplayActionCandidates(
  frames: ReplayFrameSnapshot[],
  controls: ReplayControlSnapshot[],
  sourceScenario: string | undefined,
): ReplayEvidenceActionCandidate[] {
  const candidates: ReplayEvidenceActionCandidate[] = [];
  for (const control of controls) {
    const label = replayControlLabel(control);
    const labelClassified = classifyRetainedControlLabelOverride(label);
    if (labelClassified) {
      candidates.push({
        action: labelClassified.action,
        label: trimForReport(control.labelText || control.ariaLabel || control.title || control.name || label || "captured action candidate", 160),
        frameContext: control.frameContext,
        confidence: labelClassified.confidence,
        reason: labelClassified.reason,
        sourceScenario,
      });
      continue;
    }
    const actionFromControl = replayActionFromOriginalActionType(control.actionType);
    if (actionFromControl) {
      candidates.push({
        action: actionFromControl,
        label: trimForReport(control.labelText || control.ariaLabel || control.title || control.name || control.actionType || "captured action candidate", 160),
        frameContext: control.frameContext,
        confidence: 0.94,
        reason: "captured_action_candidate_type",
        sourceScenario,
      });
      continue;
    }
    const classified = classifyControlLabel(label, "controls_json");
    const legacyCandidateClassified = classified ?? classifyLegacyCapturedCandidate(control);
    if (classified) {
      candidates.push({
        action: classified.action,
        label: trimForReport(control.labelText || control.ariaLabel || control.title || control.name || label, 160),
        frameContext: control.frameContext,
        confidence: Math.min(0.96, classified.confidence + 0.04),
        reason: classified.reason,
        sourceScenario,
      });
    } else if (legacyCandidateClassified) {
      candidates.push({
        action: legacyCandidateClassified.action,
        label: trimForReport(control.labelText || control.ariaLabel || control.title || control.name || label, 160),
        frameContext: control.frameContext,
        confidence: legacyCandidateClassified.confidence,
        reason: legacyCandidateClassified.reason,
        sourceScenario,
      });
    }
  }
  for (const frame of frames) {
    const frameContext = frameContextFromSnapshot(frame);
    const controlTexts = extractControlTexts(frame);
    for (const controlText of controlTexts) {
      const classified = classifyControlLabel(controlText.label, controlText.reason);
      if (classified) {
        candidates.push({
          action: classified.action,
          label: trimForReport(controlText.label, 160),
          frameContext,
          confidence: classified.confidence,
          reason: classified.reason,
          sourceScenario,
        });
      }
    }
  }
  return dedupeActionCandidates(candidates);
}

function replayControlLabel(control: ReplayControlSnapshot): string {
  return [
    control.labelText,
    control.ariaLabel,
    control.title,
    control.name,
    control.href,
    control.contextTextExcerpt,
  ].filter((value): value is string => Boolean(value)).join(" ");
}

function classifyRetainedControlLabelOverride(
  label: string,
): { action: ReplayActionCandidateType; confidence: number; reason: string } | undefined {
  const classified = classifyControlLabel(label, "captured_action_candidate_label_override");
  if (!classified) {
    return undefined;
  }
  if (classified.action === "do_not_sell_share" || classified.action === "privacy_policy_or_notice_only") {
    return {
      ...classified,
      confidence: Math.min(0.96, classified.confidence + 0.04),
    };
  }
  return undefined;
}

function replayActionFromOriginalActionType(actionType: string | undefined): ReplayActionCandidateType | undefined {
  switch (actionType) {
    case "accept_all":
      return "accept";
    case "reject_all":
      return "reject";
    case "open_settings":
      return "settings/manage";
    case "save_preferences":
      return "save/confirm";
    case "do_not_sell_share":
      return "do_not_sell_share";
    case "manage_preferences":
      return "settings/manage";
    default:
      return undefined;
  }
}

function classifyLegacyCapturedCandidate(
  control: ReplayControlSnapshot,
): { action: ReplayActionCandidateType; confidence: number; reason: string } | undefined {
  const label = (control.normalizedLabel || control.labelText || control.ariaLabel || "").toLowerCase().replace(/\s+/g, " ").trim();
  const cameFromCapturedCandidate = control.tagName === "candidate" ||
    /ui_classification|deterministic|candidate/i.test(control.role ?? "");
  if (!cameFromCapturedCandidate) {
    return undefined;
  }
  if (/^(decline|no thanks|not now)$/.test(label)) {
    return { action: "reject", confidence: 0.86, reason: "legacy_captured_candidate_label" };
  }
  if (/^(accept|agree|ok|okay|got it)$/.test(label)) {
    return { action: "accept", confidence: 0.86, reason: "legacy_captured_candidate_label" };
  }
  return undefined;
}

function extractControlTexts(frame: ReplayFrameSnapshot): Array<{ label: string; reason: string }> {
  const html = frame.htmlExcerpt ?? "";
  const text = frame.textExcerpt ?? "";
  const labels: Array<{ label: string; reason: string }> = [];
  const tagPatterns = [
    /<button\b[^>]*>([\s\S]*?)<\/button>/gi,
    /<a\b[^>]*>([\s\S]*?)<\/a>/gi,
    /<[^>]+\brole=["']button["'][^>]*>([\s\S]*?)<\/[^>]+>/gi,
  ];
  for (const pattern of tagPatterns) {
    for (const match of html.matchAll(pattern)) {
      const label = normalizeVisibleText(stripHtml(match[1] ?? ""));
      if (label) {
        labels.push({ label, reason: "html_control_text" });
      }
    }
  }
  for (const match of html.matchAll(/<input\b[^>]*(?:type=["'](?:button|submit)["'][^>]*)?>/gi)) {
    const tag = match[0] ?? "";
    const label = attrValue(tag, "value") || attrValue(tag, "aria-label") || attrValue(tag, "title");
    if (label) {
      labels.push({ label: normalizeVisibleText(label), reason: "html_input_value" });
    }
  }
  const actionPhrase = text.match(/(?:accept all|reject all|decline all|deny all|manage preferences|cookie settings|privacy settings|save choices|confirm choices|do not sell or share|do not sell my personal information|do not share my personal information|opt out of sale|opt out of sharing|exclude my data|your privacy choices|privacy policy|privacy notice|cookie policy|cookie notice|cookie information|notice at collection|ca notice at collection)/gi) ?? [];
  for (const phrase of actionPhrase) {
    labels.push({ label: normalizeVisibleText(phrase), reason: "frame_text_phrase" });
  }
  return labels.filter((entry) => entry.label.length > 0);
}

function classifyControlLabel(label: string, reason: string): { action: ReplayActionCandidateType; confidence: number; reason: string } | undefined {
  const normalized = label.toLowerCase().replace(/\s+/g, " ").trim();
  if (/do not sell|do not share|do not sell or share|your privacy choices|privacy choices|opt out of (?:sale|sharing|targeted advertising)|exclude my data|do not use my data|limit use of my sensitive/.test(normalized)) {
    return { action: "do_not_sell_share", confidence: 0.86, reason };
  }
  if (/privacy policy|privacy notice|cookie policy|cookies policy|cookie notice|cookie information|notice at collection/.test(normalized) && !/choice|settings|preference|manage/.test(normalized)) {
    return { action: "privacy_policy_or_notice_only", confidence: 0.82, reason };
  }
  if (/reject all|decline all|deny all|refuse all|necessary only|essential only|disable all|reject/.test(normalized)) {
    return { action: "reject", confidence: 0.9, reason };
  }
  if (/accept all|allow all|agree|i agree|got it|okay|^ok$/.test(normalized)) {
    return { action: "accept", confidence: 0.88, reason };
  }
  if (/manage|settings|preferences|customi[sz]e|options|choose/.test(normalized)) {
    return { action: "settings/manage", confidence: 0.84, reason };
  }
  if (/save|confirm|submit|apply/.test(normalized) && /choice|preference|settings|selection|consent/.test(normalized)) {
    return { action: "save/confirm", confidence: 0.86, reason };
  }
  return undefined;
}

function hasBannerCandidate(
  frames: ReplayFrameSnapshot[],
  providerDetectionSignals: ReplayProviderDetectionSignal[],
  actionCandidates: ReplayEvidenceActionCandidate[],
): boolean {
  const combined = frames.map((frame) => `${frame.htmlExcerpt ?? ""} ${frame.textExcerpt ?? ""}`).join(" ");
  return /cookie banner|cookie consent|consent banner|we use cookies|privacy preference|cookie preference|manage consent|your consent/i.test(combined) ||
    providerDetectionSignals.some((signal) => signal.source === "dom" || signal.source === "text") &&
      actionCandidates.some((candidate) => candidate.action !== "privacy_policy_or_notice_only");
}

function detectConsentSurfaceType(
  frames: ReplayFrameSnapshot[],
  providerDetectionSignals: ReplayProviderDetectionSignal[],
  actionCandidates: ReplayEvidenceActionCandidate[],
  bannerObservedCandidate: boolean,
): ConsentSurfaceType {
  if (frames.length === 0) {
    return "not_observed";
  }
  const subFrameHasProvider = providerDetectionSignals.some((signal) => signal.frameContext?.frameKind === "sub_frame");
  const subFrameHasCandidate = actionCandidates.some((candidate) => candidate.frameContext?.frameKind === "sub_frame");
  if (subFrameHasProvider && subFrameHasCandidate) {
    return "iframe_banner";
  }
  if (actionCandidates.some((candidate) => candidate.action === "save/confirm") &&
    actionCandidates.some((candidate) => candidate.action === "settings/manage" || candidate.action === "reject")) {
    return "preference_center";
  }
  const onlyPolicy = actionCandidates.length > 0 && actionCandidates.every((candidate) => candidate.action === "privacy_policy_or_notice_only");
  if (onlyPolicy) {
    return "privacy_policy_only";
  }
  if (actionCandidates.some((candidate) => candidate.action === "do_not_sell_share")) {
    const text = frames.map((frame) => `${frame.htmlExcerpt ?? ""} ${frame.textExcerpt ?? ""}`).join(" ");
    return /footer|site-footer|global-footer/i.test(text) ? "footer_privacy_control" : "floating_privacy_control";
  }
  if (bannerObservedCandidate) {
    return "first_layer_banner";
  }
  return "not_observed";
}

function summarizeHarNetworkPhase(har: ReplayHar | undefined): ReplayNetworkPhaseSummary {
  const urls = (har?.log?.entries ?? [])
    .map((entry) => entry.request?.url)
    .filter((url): url is string => typeof url === "string" && /^https?:\/\//i.test(url));
  const endpoints = unique(urls.map((url) => endpointFromUrl(url)).filter(Boolean)).slice(0, 80);
  const vendors = unique(urls.map(classifyNetworkVendor).filter((vendor) => vendor !== "unknown")).sort();
  return {
    vendors,
    endpoints,
    requestCount: urls.length,
  };
}

function compareReplayToOriginal(
  originalEvidence: ReplayOriginalConsentEvidence | undefined,
  replayCandidates: ReplayEvidenceActionCandidate[],
): ReplayClassificationDelta {
  const originalCandidateActions = unique([
    ...(originalEvidence?.actionCandidates ?? []).map((candidate) =>
      replayActionFromOriginalActionType(candidate.actionType) ?? candidate.actionType
    ).filter((value): value is string => Boolean(value)),
    ...(originalEvidence?.actionAttempts ?? [])
      .filter((attempt) => attempt.actionProof?.candidateObserved)
      .map((attempt) =>
        replayActionFromOriginalActionType(attempt.actionProof?.candidateNormalizedActionType) ??
        replayActionFromOriginalActionType(attempt.actionType) ??
        attempt.actionProof?.candidateNormalizedActionType ??
        attempt.actionType
      )
      .filter((value): value is string => Boolean(value)),
  ]).sort();
  const replayCandidateActions = unique(replayCandidates.map((candidate) => candidate.action)).sort() as ReplayActionCandidateType[];
  const originalRejectCandidateObserved = originalCandidateActions.includes("reject") || originalCandidateActions.includes("reject_all");
  const replayRejectCandidateObserved = replayCandidateActions.includes("reject");
  const originalScanMissingCandidateNowDetected = replayRejectCandidateObserved && !originalRejectCandidateObserved;
  const originalScanDetectedCandidateNowMissing = originalRejectCandidateObserved && !replayRejectCandidateObserved;
  const notes = [];
  if (originalScanMissingCandidateNowDetected) {
    notes.push("Replay rules detected a reject candidate absent from the original captured proof.");
  }
  if (originalScanDetectedCandidateNowMissing) {
    notes.push("Original captured proof had a reject candidate that replay rules did not recover.");
  }
  return {
    originalCandidateActions,
    replayCandidateActions,
    originalRejectCandidateObserved,
    replayRejectCandidateObserved,
    originalScanMissingCandidateNowDetected,
    originalScanDetectedCandidateNowMissing,
    notes,
  };
}

function summarizeOriginalActionAttempts(
  originalEvidence: ReplayOriginalConsentEvidence | undefined,
): ReplayOriginalActionAttemptSummary[] {
  return (originalEvidence?.actionAttempts ?? []).map((attempt) => ({
    actionType: attempt.actionType,
    attempted: attempt.attempted,
    succeeded: attempt.succeeded,
    failureReason: attempt.failureReason,
    candidateObserved: attempt.actionProof?.candidateObserved,
    candidateLabelText: attempt.actionProof?.candidateLabelText,
    candidateNormalizedActionType: attempt.actionProof?.candidateNormalizedActionType,
    actionPath: attempt.actionProof?.actionPath,
    frameUrl: attempt.actionProof?.frameContext?.frameUrl,
  }));
}

async function readPolicyBundleForManifest(
  manifestPath: string,
  artifactPaths: Array<string | undefined>,
): Promise<ReplayPolicyBundleLike | undefined> {
  const candidateDirs = unique([
    path.dirname(manifestPath),
    ...artifactPaths
      .filter((artifactPath): artifactPath is string => Boolean(artifactPath))
      .map((artifactPath) => path.dirname(artifactPath)),
  ]);
  for (const dir of candidateDirs) {
    const bundlePath = path.join(dir, "CanonicalEvidenceBundle.json");
    const bundle = await readJsonSafely<ReplayPolicyBundleLike>(bundlePath);
    if (bundle) {
      return bundle;
    }
  }
  return undefined;
}

function summarizePolicySurfaceObservations(observations: unknown[] | undefined): ReplayPolicySurfaceSummary[] {
  const surfaces = (observations ?? [])
    .map((observation) => summarizePolicySurfaceObservation(observation))
    .filter((summary): summary is ReplayPolicySurfaceSummary => Boolean(summary));
  return dedupePolicySurfaces(surfaces);
}

function summarizePolicySurfaceObservation(observation: unknown): ReplayPolicySurfaceSummary | undefined {
  if (!observation || typeof observation !== "object" || Array.isArray(observation)) {
    return undefined;
  }
  const item = observation as ReplayPolicySurfaceObservationLike;
  const surfaceType = stringValue(item.surfaceType);
  if (!surfaceType) {
    return undefined;
  }
  return {
    surfaceType,
    url: stringValue(item.url),
    normalizedUrl: stringValue(item.normalizedUrl),
    linkText: stringValue(item.linkText),
    status: stringValue(item.status),
    httpStatus: numberValue(item.httpStatus),
    fetchable: booleanValue(item.fetchable),
    clickable: booleanValue(item.clickable),
    mayLeadToConsentControls: booleanValue(item.mayLeadToConsentControls),
    observedTopics: stringArray(item.observedTopics),
    mentionedVendors: stringArray(item.mentionedVendors),
    mentionedPurposes: stringArray(item.mentionedPurposes),
    mentionedRights: stringArray(item.mentionedRights),
    mentionedControls: stringArray(item.mentionedControls),
    boundedTextExcerptIds: stringArray(item.boundedTextExcerptIds),
    confidence: numberValue(item.confidence),
  };
}

function dedupePolicySurfaces(surfaces: ReplayPolicySurfaceSummary[]): ReplayPolicySurfaceSummary[] {
  const seen = new Set<string>();
  const deduped = [];
  for (const surface of surfaces) {
    const key = [surface.surfaceType, surface.normalizedUrl ?? surface.url ?? "", surface.linkText ?? ""].join("|");
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(surface);
    }
  }
  return deduped.sort((left, right) => policySurfacePriority(left.surfaceType) - policySurfacePriority(right.surfaceType) ||
    (right.confidence ?? 0) - (left.confidence ?? 0) ||
    left.surfaceType.localeCompare(right.surfaceType));
}

interface PolicySourceHintValue {
  raw: string;
  normalized: string;
  url?: string;
}

function policySurfacesFromRetainedHints(
  scenarios: ReplayEvidenceScenarioReport[],
): ReplayPolicySurfaceSummary[] {
  const surfacesByType = new Map<string, ReplayPolicySurfaceSummary>();
  for (const hint of collectPolicySourceHintValues(scenarios)) {
    for (const surfaceType of policySurfaceTypesForHint(hint.normalized)) {
      const surface = {
        surfaceType,
        url: hint.url,
        normalizedUrl: hint.url,
        linkText: hint.url ? undefined : trimForReport(hint.raw, 160),
        status: "observed",
        fetchable: false,
        clickable: false,
        mayLeadToConsentControls: policySurfaceHintMayLeadToControls(surfaceType),
        observedTopics: [],
        mentionedVendors: [],
        mentionedPurposes: [],
        mentionedRights: [],
        mentionedControls: [],
        boundedTextExcerptIds: [],
        confidence: 0.62,
      };
      const existing = surfacesByType.get(surfaceType);
      if (!existing || (!existing.url && surface.url)) {
        surfacesByType.set(surfaceType, surface);
      }
    }
  }
  return [...surfacesByType.values()];
}

function collectPolicySourceHintValues(
  scenarios: ReplayEvidenceScenarioReport[],
): PolicySourceHintValue[] {
  return scenarios.flatMap((scenario) => [
    scenario.sourceUrl,
    ...scenario.actionCandidates.map((candidate) => candidate.frameContext?.frameUrl),
    ...scenario.actionCandidates.map((candidate) => candidate.label),
    ...scenario.actionAttemptSummaries.map((attempt) => attempt.frameUrl),
    ...scenario.actionAttemptSummaries.map((attempt) => attempt.candidateLabelText),
  ]).filter((value): value is string => Boolean(value)).map((value) => ({
    raw: value,
    normalized: normalizePolicyHintValue(value),
    url: policyHintUrl(value),
  }));
}

function policySurfaceTypesForHint(value: string): string[] {
  const types: string[] = [];
  if (policyHintLooksLikePrivacyNotice(value)) {
    types.push("privacy_policy");
  }
  if (policyHintLooksLikeCookiePolicy(value)) {
    types.push("cookie_policy");
  }
  if (policyHintLooksLikeNoticeAtCollection(value)) {
    types.push("notice_at_collection");
  }
  if (policyHintLooksLikePrivacyChoices(value)) {
    types.push("your_privacy_choices");
  }
  if (policyHintLooksLikeCookieSettings(value)) {
    types.push("cookie_settings");
  }
  if (policyHintLooksLikeExplicitDoNotSellShare(value)) {
    types.push("do_not_sell_or_share");
  }
  return unique(types);
}

function policySurfaceHintMayLeadToControls(surfaceType: string): boolean {
  return surfaceType === "your_privacy_choices" ||
    surfaceType === "cookie_settings" ||
    surfaceType === "consent_preferences" ||
    surfaceType === "do_not_sell_or_share";
}

function policySurfacePriority(surfaceType: string): number {
  const order = [
    "privacy_policy",
    "cookie_policy",
    "notice_at_collection",
    "do_not_sell_or_share",
    "your_privacy_choices",
    "cookie_settings",
    "consent_preferences",
    "california_notice",
    "accessibility_statement",
    "terms",
    "ai_disclosure",
    "unknown",
  ];
  const index = order.indexOf(surfaceType);
  return index >= 0 ? index : order.length;
}

function determineFailureReasons(input: {
  actionCandidates: ReplayEvidenceActionCandidate[];
  artifactStatus: ReplayEvidenceScenarioReport["artifactStatus"];
  bannerObservedCandidate: boolean;
  classificationDelta: ReplayClassificationDelta;
  consentSurfaceType: ConsentSurfaceType;
  frames: ReplayFrameSnapshot[];
  networkPhase: ReplayNetworkPhaseSummary;
  providerDetectionSignals: ReplayProviderDetectionSignal[];
}): ReplayFailureReason[] {
  const reasons = new Set<ReplayFailureReason>();
  const providerObserved = input.providerDetectionSignals.length > 0;
  const hasReject = input.actionCandidates.some((candidate) => candidate.action === "reject");
  const hasSettings = input.actionCandidates.some((candidate) => candidate.action === "settings/manage");
  const hasSave = input.actionCandidates.some((candidate) => candidate.action === "save/confirm");
  if (!input.artifactStatus.frameSnapshotsLoaded && !input.artifactStatus.harLoaded) {
    reasons.add("insufficient_artifacts");
  }
  if (!input.artifactStatus.frameSnapshotsLoaded) {
    reasons.add("frame_dom_unavailable");
  }
  if (providerObserved && !input.bannerObservedCandidate && input.consentSurfaceType === "not_observed") {
    reasons.add("provider_observed_no_banner");
  }
  if (input.bannerObservedCandidate && !hasReject) {
    reasons.add("banner_observed_no_reject_candidate");
  }
  if (hasSettings && !hasSave && !hasReject) {
    reasons.add("settings_observed_no_save_candidate");
  }
  if (input.consentSurfaceType === "privacy_policy_only" || input.consentSurfaceType === "footer_privacy_control") {
    reasons.add("footer_link_policy_only");
  }
  if (providerObserved && input.providerDetectionSignals.some((signal) => signal.frameContext?.frameKind === "sub_frame") &&
    !input.actionCandidates.some((candidate) => candidate.frameContext?.frameKind === "sub_frame")) {
    reasons.add("iframe_provider_observed_candidate_missing");
  }
  if (input.actionCandidates.length > 0 && input.actionCandidates.every((candidate) => candidate.confidence < 0.75)) {
    reasons.add("action_candidate_low_confidence");
  }
  if (input.classificationDelta.originalScanMissingCandidateNowDetected) {
    reasons.add("original_scan_missing_candidate_now_detected");
  }
  if (input.classificationDelta.originalScanDetectedCandidateNowMissing) {
    reasons.add("original_scan_detected_candidate_now_missing");
  }
  if (input.networkPhase.requestCount === 0) {
    reasons.add("network_phase_missing");
  }
  return [...reasons].sort();
}

function buildSiteReports(scenarios: ReplayEvidenceScenarioReport[]): ReplayEvidenceSiteReport[] {
  const groups = new Map<string, ReplayEvidenceScenarioReport[]>();
  for (const scenario of scenarios) {
    const key = siteKeyForScenario(scenario);
    groups.set(key, [...(groups.get(key) ?? []), scenario]);
  }
  return [...groups.entries()].map(([siteId, siteScenarios]) => {
    const providerSignals = dedupeProviderSignals(siteScenarios.flatMap((scenario) => scenario.providerDetectionSignals));
    const actionCandidates = dedupeActionCandidates(siteScenarios.flatMap((scenario) => scenario.actionCandidates));
    const explicitPolicySurfaces = dedupePolicySurfaces(siteScenarios.flatMap((scenario) => scenario.policySurfaces));
    const policySurfaces = explicitPolicySurfaces.length > 0
      ? explicitPolicySurfaces
      : dedupePolicySurfaces(policySurfacesFromRetainedHints(siteScenarios));
    const detectedProvider = chooseProviderFromScenarioReports(siteScenarios);
    const classificationDelta = mergeClassificationDeltas(siteScenarios.map((scenario) => scenario.classificationDelta));
    const networkVendorSummary = {
      preConsent: mergeNetworkPhases(siteScenarios.filter((scenario) => scenario.scenario === "baseline_pre_consent").map((scenario) => scenario.networkPhase)),
      postAccept: mergeNetworkPhases(siteScenarios.filter((scenario) => scenario.scenario === "accept_all_flow").map((scenario) => scenario.networkPhase)),
      postReject: mergeNetworkPhases(siteScenarios.filter((scenario) => scenario.scenario === "reject_all_flow").map((scenario) => scenario.networkPhase)),
      gpcEnabled: mergeNetworkPhases(siteScenarios.filter((scenario) => scenario.scenario === "gpc_enabled").map((scenario) => scenario.networkPhase)),
      privacyOptOut: mergeNetworkPhases(siteScenarios.filter((scenario) => scenario.scenario === "privacy_opt_out_flow").map((scenario) => scenario.networkPhase)),
    };
    const consentBehaviorOutcome = buildConsentBehaviorOutcome({
      actionCandidates,
      classificationDelta,
      consentSurfaceType: chooseSurfaceType(siteScenarios.map((scenario) => scenario.consentSurfaceType)),
      networkVendorSummary,
      scenarios: siteScenarios,
    });
    const policyEvidenceOutcome = buildPolicyEvidenceOutcome(policySurfaces, siteScenarios);
    return {
      siteId,
      sourceUrl: siteScenarios.find((scenario) => scenario.sourceUrl)?.sourceUrl,
      detectedProvider,
      providerDetectionSignals: providerSignals,
      bannerObservedCandidate: siteScenarios.some((scenario) => scenario.bannerObservedCandidate),
      consentSurfaceType: chooseSurfaceType(siteScenarios.map((scenario) => scenario.consentSurfaceType)),
      actionCandidates,
      networkVendorSummary,
      policySurfaces,
      policyEvidenceOutcome,
      classificationDelta,
      consentBehaviorOutcome,
      coverageAssessment: buildRegulatoryCoverageAssessment({
        consentBehaviorOutcome,
        networkVendorSummary,
        policyEvidenceOutcome,
        scenarios: siteScenarios,
      }),
      failureReasons: unique(siteScenarios.flatMap((scenario) => scenario.failureReasons)).sort() as ReplayFailureReason[],
      scenarios: siteScenarios.sort((left, right) => String(left.scenario).localeCompare(String(right.scenario))),
    };
  }).sort((left, right) => left.siteId.localeCompare(right.siteId));
}

function buildRegulatoryCoverageAssessment(input: {
  consentBehaviorOutcome: ReplayConsentBehaviorOutcome;
  networkVendorSummary: ReplayNetworkVendorSummary;
  policyEvidenceOutcome: ReplayPolicyEvidenceOutcome;
  scenarios: ReplayEvidenceScenarioReport[];
}): ReplayRegulatoryCoverageAssessment {
  const scenarios = new Set(input.scenarios.map((scenario) => scenario.scenario).filter((scenario): scenario is string => Boolean(scenario)));
  const corpusScenarios = {
    baselinePreConsent: scenarios.has("baseline_pre_consent"),
    acceptAllFlow: scenarios.has("accept_all_flow"),
    rejectAllFlow: scenarios.has("reject_all_flow"),
    gpcEnabled: scenarios.has("gpc_enabled"),
    privacyOptOutFlow: scenarios.has("privacy_opt_out_flow") || input.consentBehaviorOutcome.optOutAction === "observed_and_testable",
    formCollectionProbe: scenarios.has("form_collection_probe"),
    accessibilityProbe: scenarios.has("accessibility_probe"),
  };
  const preConsentNetworkObserved = input.networkVendorSummary.preConsent.requestCount > 0;
  const thirdPartyPreConsentObserved = input.networkVendorSummary.preConsent.vendors.length > 0;
  const reviewableEndpointObserved = input.networkVendorSummary.preConsent.endpoints.length > 0;
  const reviewableRuntimeContextObserved = thirdPartyPreConsentObserved || reviewableEndpointObserved;
  const postRejectTestable = input.consentBehaviorOutcome.postRejectCookieBehavior === "established";
  const postAcceptTestable = input.consentBehaviorOutcome.acceptAllAction === "observed_and_testable" &&
    input.networkVendorSummary.postAccept.requestCount > 0;
  const gpcTestable = corpusScenarios.gpcEnabled && input.networkVendorSummary.gpcEnabled.requestCount > 0;
  const notes = [];
  if (!corpusScenarios.privacyOptOutFlow) {
    notes.push("Privacy opt-out behavior is not testable until a privacy choices / do-not-sell action path is captured.");
  }
  if (!corpusScenarios.formCollectionProbe) {
    notes.push("Notice-at-collection and sensitive-form tracking need a form/collection probe beyond homepage replay.");
  }
  if (!corpusScenarios.accessibilityProbe) {
    notes.push("Consent/privacy-control accessibility needs an explicit accessibility probe over observed controls.");
  }

  return {
    ccpaCpra: {
      privacyNoticeAvailability: observedStatus(input.policyEvidenceOutcome.privacyNoticeAvailability),
      noticeAtCollection: input.policyEvidenceOutcome.noticeAtCollectionAvailability === "observed"
        ? "observed"
        : corpusScenarios.formCollectionProbe && input.policyEvidenceOutcome.policyArtifactStatus === "present"
          ? "not_observed"
          : "needs_additional_probe",
      doNotSellShareAvailability: observedStatus(input.policyEvidenceOutcome.doNotSellShareAvailability),
      privacyChoicesAvailability: observedStatus(input.policyEvidenceOutcome.privacyChoicesAvailability),
      privacyOptOutBehavior: input.consentBehaviorOutcome.optOutAction === "observed_and_testable"
        ? "testable"
        : input.consentBehaviorOutcome.optOutAction === "observed_not_testable" || corpusScenarios.privacyOptOutFlow
          ? "not_testable"
          : input.policyEvidenceOutcome.doNotSellShareAvailability === "observed" ||
              input.policyEvidenceOutcome.privacyChoicesAvailability === "observed"
            ? "needs_additional_probe"
            : "not_observed",
      gpcHandling: gpcTestable ? "testable" : "needs_additional_probe",
      saleShareDisclosureSignals: observedStatus(input.policyEvidenceOutcome.saleShareDisclosureSignals),
      targetedAdvertisingDisclosureSignals: observedStatus(input.policyEvidenceOutcome.targetedAdvertisingDisclosureSignals),
      sensitivePersonalInformationDisclosureSignals: observedStatus(input.policyEvidenceOutcome.sensitivePersonalInformationDisclosureSignals),
      consumerRightsSignals: observedStatus(input.policyEvidenceOutcome.consumerRightsSignals),
      sensitiveFormsWithThirdPartyTracking: corpusScenarios.formCollectionProbe ? "testable" : "needs_additional_probe",
      privacyControlAccessibility: corpusScenarios.accessibilityProbe ? "testable" : "needs_additional_probe",
    },
    gdprEprivacy: {
      consentBannerPreferenceSurface: input.consentBehaviorOutcome.cmpBanner === "observed" ? "testable" : "not_observed",
      acceptAction: input.consentBehaviorOutcome.acceptAllAction === "observed_and_testable" ? "testable" : "not_testable",
      declineRejectAction: postRejectTestable ? "testable" : "not_testable",
      trackingAfterRefusal: postRejectTestable ? "testable" : "not_testable",
      postAcceptBehavior: postAcceptTestable ? "testable" : "not_testable",
      postChoiceConsentControls: input.policyEvidenceOutcome.consentWithdrawalSignals === "observed" ||
        input.policyEvidenceOutcome.privacyChoicesAvailability === "observed" ? "observed" : "not_observed",
      cookiesStorageBeforeConsent: corpusScenarios.baselinePreConsent ? "testable" : "not_testable",
      thirdPartyTrackingBeforeConsent: preConsentNetworkObserved && thirdPartyPreConsentObserved ? "testable" : corpusScenarios.baselinePreConsent ? "not_observed" : "not_testable",
      runtimeVendorDisclosureContext: input.policyEvidenceOutcome.policyArtifactStatus === "present" && reviewableRuntimeContextObserved ? "testable" : "not_testable",
      sessionReplayBehavioralAnalytics: preConsentNetworkObserved ? "testable" : "not_testable",
      crossBorderEndpointReview: reviewableRuntimeContextObserved ? "testable" : "not_testable",
      consentControlAccessibility: corpusScenarios.accessibilityProbe ? "testable" : "needs_additional_probe",
    },
    corpusScenarios,
    notes,
  };
}

function observedStatus(value: "observed" | "not_observed"): ReplayCoverageLaneStatus {
  return value === "observed" ? "observed" : "not_observed";
}

function buildPolicyEvidenceOutcome(
  policySurfaces: ReplayPolicySurfaceSummary[],
  scenarios: ReplayEvidenceScenarioReport[] = [],
): ReplayPolicyEvidenceOutcome {
  const retainedPolicySurfaces = policySurfaces.filter(policySurfaceRetained);
  const topics = new Set(retainedPolicySurfaces.flatMap((surface) => surface.observedTopics));
  const rights = new Set(retainedPolicySurfaces.flatMap((surface) => surface.mentionedRights));
  const controls = new Set(retainedPolicySurfaces.flatMap((surface) => surface.mentionedControls));
  const surfaceTypes = new Set(retainedPolicySurfaces.map((surface) => surface.surfaceType));
  const sourceUrlHints = buildPolicySourceUrlHints(scenarios);
  const notes: string[] = [];
  if (policySurfaces.length === 0) {
    notes.push("No policy surface observations were available in the replay corpus artifact root.");
  }
  if (policySurfaces.length > retainedPolicySurfaces.length) {
    notes.push("Failed, skipped, and not-observed policy/control surfaces were excluded from observed availability signals.");
  }
  const hasDoNotSell = sourceUrlHints.doNotSellShare ||
    surfaceTypes.has("do_not_sell_or_share") ||
    topics.has("do_not_sell_or_share") ||
    rights.has("do_not_sell_or_share");
  const hasPrivacyChoices = sourceUrlHints.privacyChoices ||
    surfaceTypes.has("your_privacy_choices") ||
    surfaceTypes.has("cookie_settings") ||
    surfaceTypes.has("consent_preferences") ||
    controls.has("cookie_settings") ||
    controls.has("consent_withdrawal");
  if (
    sourceUrlHints.privacyNotice ||
    sourceUrlHints.cookiePolicy ||
    sourceUrlHints.noticeAtCollection ||
    sourceUrlHints.privacyChoices ||
    sourceUrlHints.doNotSellShare
  ) {
    notes.push("Policy/control availability includes retained replay target URL hints when policy-surface observations were absent or incomplete.");
  }
  return {
    policyArtifactStatus: policySurfaces.length > 0 || sourceUrlHints.any ? "present" : "missing",
    policySurfaceCount: policySurfaces.length,
    privacyNoticeAvailability: surfaceTypes.has("privacy_policy") || sourceUrlHints.privacyNotice ? "observed" : "not_observed",
    cookiePolicyAvailability: surfaceTypes.has("cookie_policy") || sourceUrlHints.cookiePolicy ? "observed" : "not_observed",
    noticeAtCollectionAvailability: retainedPolicySurfaces.some(policySurfaceLooksLikeNoticeAtCollection) ||
      sourceUrlHints.noticeAtCollection ? "observed" : "not_observed",
    doNotSellShareAvailability: hasDoNotSell ? "observed" : "not_observed",
    privacyChoicesAvailability: hasPrivacyChoices ? "observed" : "not_observed",
    saleShareDisclosureSignals: topics.has("sale_or_share") ? "observed" : "not_observed",
    targetedAdvertisingDisclosureSignals: topics.has("targeted_advertising") ? "observed" : "not_observed",
    gpcDisclosureSignals: topics.has("global_privacy_control") || controls.has("global_privacy_control") ? "observed" : "not_observed",
    sensitivePersonalInformationDisclosureSignals: topics.has("sensitive_personal_information") ? "observed" : "not_observed",
    consumerRightsSignals: topics.has("california_privacy_rights") || rights.has("california_privacy_rights") ? "observed" : "not_observed",
    vendorDisclosureSignals: topics.has("vendor_list") || topics.has("third_party_disclosures") ||
      retainedPolicySurfaces.some((surface) => surface.mentionedVendors.length > 0) ? "observed" : "not_observed",
    consentWithdrawalSignals: topics.has("consent_withdrawal") || controls.has("consent_withdrawal") ? "observed" : "not_observed",
    notes,
  };
}

function buildPolicySourceUrlHints(scenarios: ReplayEvidenceScenarioReport[]): {
  any: boolean;
  privacyNotice: boolean;
  cookiePolicy: boolean;
  noticeAtCollection: boolean;
  privacyChoices: boolean;
  doNotSellShare: boolean;
} {
  const normalized = collectPolicySourceHintValues(scenarios).map((hint) => hint.normalized);
  const cookiePolicy = normalized.some(policyHintLooksLikeCookiePolicy);
  const noticeAtCollection = normalized.some(policyHintLooksLikeNoticeAtCollection);
  const privacyChoices = normalized.some(policyHintLooksLikePrivacyChoices) ||
    normalized.some(policyHintLooksLikeCookieSettings);
  const doNotSellShare = privacyChoices || normalized.some(policyHintLooksLikeExplicitDoNotSellShare);
  const privacyNotice = normalized.some(policyHintLooksLikePrivacyNotice);
  return {
    any: privacyNotice || cookiePolicy || noticeAtCollection || privacyChoices || doNotSellShare,
    privacyNotice,
    cookiePolicy,
    noticeAtCollection,
    privacyChoices,
    doNotSellShare,
  };
}

function normalizePolicyHintValue(value: string): string {
  try {
    const parsed = new URL(value);
    return [parsed.pathname, parsed.search].filter(Boolean).join(" ").toLowerCase().trim();
  } catch {
    return value.toLowerCase().trim();
  }
}

function policyHintUrl(value: string): string | undefined {
  try {
    return new URL(value).href;
  } catch {
    return undefined;
  }
}

function policyHintLooksLikePrivacyNotice(value: string): boolean {
  return /(^|\/)(privacy|privacy[-_/ ]?policy|privacy[-_/ ]?notice|legal\/privacy)(\/|$|\?|#)|\bprivacy (?:policy|notice)\b/.test(value);
}

function policyHintLooksLikeCookiePolicy(value: string): boolean {
  return /(^|\/)(cookie|cookies|cookie[-_/ ]?policy|cookie[-_/ ]?notice)(\/|$|\?|#)|\bcookie (?:policy|notice|information)\b|\bcookies policy\b/.test(value);
}

function policyHintLooksLikeNoticeAtCollection(value: string): boolean {
  return /notice[-_ ]?at[-_ ]?collection|notice[-_ ]?of[-_ ]?collection|collection[-_ ]?notice|ca notice at collection|california[-_ ]?notice/.test(value);
}

function policyHintLooksLikePrivacyChoices(value: string): boolean {
  return /privacy[-_/ ]?choices|your[-_/ ]?privacy[-_/ ]?choices|privacy\/your-privacy-choices/.test(value);
}

function policyHintLooksLikeCookieSettings(value: string): boolean {
  return /cookie[-_/ ]?(settings|preferences)|consent[-_/ ]?preferences/.test(value);
}

function policyHintLooksLikeExplicitDoNotSellShare(value: string): boolean {
  return /do[-_/ ]?not[-_/ ]?(sell|share)|dnsmpi|opt[-_/ ]?out|ccpa/.test(value);
}

function policySurfaceRetained(surface: ReplayPolicySurfaceSummary): boolean {
  return !["failed", "not_observed", "skipped_budget"].includes(surface.status ?? "");
}

function policySurfaceLooksLikeNoticeAtCollection(surface: ReplayPolicySurfaceSummary): boolean {
  if (surface.surfaceType === "notice_at_collection" || surface.observedTopics.includes("notice_at_collection")) {
    return true;
  }
  const text = [
    surface.linkText,
    surface.normalizedUrl,
    surface.url,
    ...surface.boundedTextExcerptIds,
  ].filter((value): value is string => Boolean(value)).join(" ").toLowerCase();
  return /notice[-_ ]?at[-_ ]?collection|notice[-_ ]?of[-_ ]?collection|collection[-_ ]?notice|california[-_ ]?notice/.test(text);
}

function formatPolicyAvailability(outcome: ReplayPolicyEvidenceOutcome): string {
  if (outcome.policyArtifactStatus === "missing") {
    return "missing";
  }
  return [
    `privacy=${outcome.privacyNoticeAvailability}`,
    `cookie=${outcome.cookiePolicyAvailability}`,
    `surfaces=${outcome.policySurfaceCount}`,
  ].join("; ");
}

function formatCcpaSignals(outcome: ReplayPolicyEvidenceOutcome): string {
  return [
    `dns=${outcome.doNotSellShareAvailability}`,
    `choices=${outcome.privacyChoicesAvailability}`,
    `sale/share=${outcome.saleShareDisclosureSignals}`,
    `targeted_ads=${outcome.targetedAdvertisingDisclosureSignals}`,
    `gpc=${outcome.gpcDisclosureSignals}`,
    `rights=${outcome.consumerRightsSignals}`,
    `sensitive=${outcome.sensitivePersonalInformationDisclosureSignals}`,
  ].join("; ");
}

function formatGdprSignals(outcome: ReplayPolicyEvidenceOutcome): string {
  return [
    `cookie_policy=${outcome.cookiePolicyAvailability}`,
    `withdrawal=${outcome.consentWithdrawalSignals}`,
    `vendors=${outcome.vendorDisclosureSignals}`,
    `purposes=${outcome.targetedAdvertisingDisclosureSignals === "observed" ? "observed" : outcome.saleShareDisclosureSignals}`,
  ].join("; ");
}

function formatCorpusLanes(assessment: ReplayRegulatoryCoverageAssessment): string {
  const lanes = assessment.corpusScenarios;
  return [
    `baseline=${lanes.baselinePreConsent ? "yes" : "no"}`,
    `accept=${lanes.acceptAllFlow ? "yes" : "no"}`,
    `reject=${lanes.rejectAllFlow ? "yes" : "no"}`,
    `gpc=${lanes.gpcEnabled ? "yes" : "no"}`,
    `privacy_opt_out=${lanes.privacyOptOutFlow ? "yes" : "no"}`,
    `forms=${lanes.formCollectionProbe ? "yes" : "no"}`,
    `a11y=${lanes.accessibilityProbe ? "yes" : "no"}`,
  ].join("; ");
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}

function buildConsentBehaviorOutcome(input: {
  actionCandidates: ReplayEvidenceActionCandidate[];
  classificationDelta: ReplayClassificationDelta;
  consentSurfaceType: ConsentSurfaceType;
  networkVendorSummary: ReplayNetworkVendorSummary;
  scenarios: ReplayEvidenceScenarioReport[];
}): ReplayConsentBehaviorOutcome {
  const notes: string[] = [];
  const originalAttempts = input.scenarios.flatMap((scenario) => scenario.actionAttemptSummaries);
  const cmpAcceptAttempts = originalAttempts.filter((attempt) =>
    (attempt.actionType === "accept_all" || attempt.candidateNormalizedActionType === "accept_all") &&
    !isPrivacyOptOutAttempt(attempt)
  );
  const cmpRejectAttempts = originalAttempts.filter((attempt) =>
    (attempt.actionType === "reject_all" || attempt.candidateNormalizedActionType === "reject_all") &&
    !isPrivacyOptOutAttempt(attempt)
  );
  const successfulCmpAccept = cmpAcceptAttempts.some((attempt) => attempt.attempted === true && attempt.succeeded === true);
  const successfulCmpReject = cmpRejectAttempts.some((attempt) => attempt.attempted === true && attempt.succeeded === true);
  const observedCmpAction = [...cmpAcceptAttempts, ...cmpRejectAttempts].some((attempt) =>
    attempt.candidateObserved === true || attempt.attempted === true
  );
  const cmpBannerObserved = input.scenarios.some((scenario) =>
    scenario.bannerObservedCandidate ||
    scenario.consentSurfaceType === "first_layer_banner" ||
    scenario.consentSurfaceType === "iframe_banner"
  ) || observedCmpAction;
  const privacyChoicesSurfaceObserved = input.consentSurfaceType === "footer_privacy_control" ||
    input.consentSurfaceType === "floating_privacy_control" ||
    input.actionCandidates.some((candidate) => candidate.action === "do_not_sell_share") ||
    input.scenarios.some((scenario) => scenario.actionAttemptSummaries.some(isPrivacyOptOutAttempt));
  const optOutAttempts = originalAttempts.filter(isPrivacyOptOutAttempt);
  const successfulOptOut = optOutAttempts.some((attempt) => attempt.attempted === true && attempt.succeeded === true);
  const observedOptOut = successfulOptOut ||
    optOutAttempts.some((attempt) => attempt.candidateObserved === true) ||
    input.actionCandidates.some((candidate) => candidate.action === "do_not_sell_share");
  const observedAccept = successfulCmpAccept || cmpAcceptAttempts.some((attempt) => attempt.candidateObserved === true);
  const postRejectCookieEstablished = cmpBannerObserved &&
    successfulCmpReject &&
    input.networkVendorSummary.postReject.requestCount > 0;
  const postOptOutPrivacyTestable = privacyChoicesSurfaceObserved && successfulOptOut && input.networkVendorSummary.privacyOptOut.requestCount > 0;

  if (privacyChoicesSurfaceObserved && successfulOptOut && !cmpBannerObserved) {
    notes.push("Legacy reject_all_flow proof maps to privacy opt-out because the observed surface was a privacy choices page/control, not a CMP banner.");
  }
  if (!observedAccept) {
    notes.push("No original accept-all proof or candidate was observed; loose replay text matches are not treated as accept-all proof.");
  }
  if (cmpBannerObserved && observedCmpAction && !input.scenarios.some((scenario) => scenario.bannerObservedCandidate)) {
    notes.push("CMP/banner observation was inferred from original captured accept/reject action proof because replay DOM parsing did not recover the banner controls.");
  }
  if (!postRejectCookieEstablished) {
    notes.push("Post-reject cookie behavior is not established without a successful CMP/banner reject action.");
  }

  return {
    cmpBanner: cmpBannerObserved ? "observed" : "not_observed",
    privacyChoicesSurface: privacyChoicesSurfaceObserved ? "observed" : "not_observed",
    optOutAction: successfulOptOut ? "observed_and_testable" : observedOptOut ? "observed_not_testable" : "not_observed",
    acceptAllAction: successfulCmpAccept ? "observed_and_testable" : observedAccept ? "observed_not_testable" : "not_observed_not_testable",
    postRejectCookieBehavior: postRejectCookieEstablished ? "established" : "not_established",
    postOptOutPrivacyBehavior: postOptOutPrivacyTestable ? "testable" : "not_testable",
    notes,
  };
}

function isPrivacyOptOutAttempt(attempt: ReplayOriginalActionAttemptSummary): boolean {
  if (attempt.actionType === "do_not_sell_share" || attempt.candidateNormalizedActionType === "do_not_sell_share") {
    return true;
  }
  const text = [
    attempt.candidateLabelText,
    attempt.actionPath,
    attempt.frameUrl,
  ].filter((value): value is string => Boolean(value)).join(" ").toLowerCase();
  return /opt\s*out|do not sell|do not share|privacy choices|privacy\/your-privacy-choices/.test(text);
}

function buildReplayReadinessSummary(sites: ReplayEvidenceSiteReport[]): ReplayReadinessSummary {
  const scenarios = sites.flatMap((site) => site.scenarios);
  const manifestCount = scenarios.length;
  const providerDetectionCounts = sortRecord(Object.fromEntries(
    Object.entries(groupCount(sites.map((site) => site.detectedProvider))),
  ));
  const surfaceTypeCounts = sortRecord(Object.fromEntries(
    Object.entries(groupCount(sites.map((site) => site.consentSurfaceType))),
  ));
  const failureTaxonomyCounts = sortRecord(Object.fromEntries(
    Object.entries(groupCount(sites.flatMap((site) => site.failureReasons))),
  ));
  const manifestsWithOriginalConsentEvidence = scenarios.filter((scenario) => scenario.artifactStatus.originalConsentEvidenceLoaded).length;
  const manifestsWithHarMetadata = scenarios.filter((scenario) => scenario.artifactStatus.harLoaded).length;
  const manifestsWithFrameSnapshots = scenarios.filter((scenario) => scenario.artifactStatus.frameSnapshotsLoaded).length;
  const manifestsWithStorageMetadata = scenarios.filter((scenario) => scenario.artifactStatus.storageStateLoaded).length;
  const manifestsWithActionCandidates = scenarios.filter((scenario) =>
    scenario.actionCandidates.length > 0 || scenario.classificationDelta.originalCandidateActions.length > 0
  ).length;
  const originalScanMissingCandidateNowDetected = scenarios.filter((scenario) =>
    scenario.failureReasons.includes("original_scan_missing_candidate_now_detected")
  ).length;
  const originalScanDetectedCandidateNowMissing = scenarios.filter((scenario) =>
    scenario.failureReasons.includes("original_scan_detected_candidate_now_missing")
  ).length;
  const insufficientArtifacts = scenarios.filter((scenario) => scenario.failureReasons.includes("insufficient_artifacts")).length;
  const networkPhaseMissing = scenarios.filter((scenario) => scenario.failureReasons.includes("network_phase_missing")).length;
  const originalConsentEvidencePct = pct(manifestsWithOriginalConsentEvidence, manifestCount);
  const harMetadataPct = pct(manifestsWithHarMetadata, manifestCount);
  const frameSnapshotsPct = pct(manifestsWithFrameSnapshots, manifestCount);
  const storageMetadataPct = pct(manifestsWithStorageMetadata, manifestCount);
  const actionCandidatesPct = pct(manifestsWithActionCandidates, manifestCount);
  const reasons: string[] = [];

  if (manifestCount === 0) {
    reasons.push("No replay manifests were analyzed.");
  }
  if (manifestCount > 0 && originalConsentEvidencePct < 0.9) {
    reasons.push(`Original consent evidence coverage is below 90% (${formatPct(originalConsentEvidencePct)}).`);
  }
  if (manifestCount > 0 && harMetadataPct < 0.9) {
    reasons.push(`HAR metadata coverage is below 90% (${formatPct(harMetadataPct)}).`);
  }
  if (manifestCount > 0 && frameSnapshotsPct < 0.9) {
    reasons.push(`Frame snapshot coverage is below 90% (${formatPct(frameSnapshotsPct)}).`);
  }
  if (manifestCount > 0 && insufficientArtifacts / manifestCount >= 0.5) {
    reasons.push("Insufficient artifacts is dominant across analyzed manifests.");
  }
  const recommendation = reasons.length === 0 ? "READY_FOR_100_SITE_CAPTURE" : "NOT_READY_FOR_100_SITE_CAPTURE";

  return {
    recommendation,
    reasons,
    capturedManifestsAnalyzed: manifestCount,
    manifestsWithOriginalConsentEvidence,
    manifestsWithHarMetadata,
    manifestsWithFrameSnapshots,
    manifestsWithStorageMetadata,
    manifestsWithActionCandidates,
    providerDetectionCounts,
    surfaceTypeCounts,
    failureTaxonomyCounts,
    originalScanMissingCandidateNowDetected,
    originalScanDetectedCandidateNowMissing,
    insufficientArtifacts,
    networkPhaseMissing,
    coverage: {
      originalConsentEvidencePct,
      harMetadataPct,
      frameSnapshotsPct,
      storageMetadataPct,
      actionCandidatesPct,
    },
  };
}

function explainScenario(input: {
  actionCandidates: ReplayEvidenceActionCandidate[];
  consentSurfaceType: ConsentSurfaceType;
  detectedProvider: string;
  failureReasons: ReplayFailureReason[];
  providerDetectionSignals: ReplayProviderDetectionSignal[];
}): string {
  const signalSources = unique(input.providerDetectionSignals.map((signal) => signal.source)).join(", ") || "no provider signals";
  const actions = unique(input.actionCandidates.map((candidate) => candidate.action)).join(", ") || "no action candidates";
  const failures = input.failureReasons.join(", ") || "no replay failure reasons";
  return `${input.detectedProvider} via ${signalSources}; surface=${input.consentSurfaceType}; actions=${actions}; failures=${failures}.`;
}

async function writeReplayEvidenceArtifacts(outDir: string, report: ReplayEvidenceReport): Promise<void> {
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, "ReplayEvidenceReport.json"), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(path.join(outDir, "ReplayEvidenceReport.md"), formatReplayEvidenceReportMarkdown(report));
  await writeFile(path.join(outDir, "ReplayReadinessReport.json"), `${JSON.stringify(report.readiness, null, 2)}\n`);
  await writeFile(path.join(outDir, "ReplayReadinessReport.md"), formatReplayReadinessMarkdown(report.readiness));
  for (const site of report.sites) {
    const siteDir = path.join(outDir, safePathSegment(site.siteId));
    await mkdir(siteDir, { recursive: true });
    await writeFile(path.join(siteDir, "replay-evidence.json"), `${JSON.stringify(site, null, 2)}\n`);
  }
}

function formatReplayReadinessMarkdown(readiness: ReplayReadinessSummary): string {
  const lines = [
    "# Replay Readiness Report",
    "",
    `- Recommendation: ${readiness.recommendation}`,
    `- Captured manifests analyzed: ${readiness.capturedManifestsAnalyzed}`,
    `- Original consent evidence: ${readiness.manifestsWithOriginalConsentEvidence} (${formatPct(readiness.coverage.originalConsentEvidencePct)})`,
    `- HAR metadata: ${readiness.manifestsWithHarMetadata} (${formatPct(readiness.coverage.harMetadataPct)})`,
    `- Frame snapshots: ${readiness.manifestsWithFrameSnapshots} (${formatPct(readiness.coverage.frameSnapshotsPct)})`,
    `- Storage metadata: ${readiness.manifestsWithStorageMetadata} (${formatPct(readiness.coverage.storageMetadataPct)})`,
    `- Action candidates: ${readiness.manifestsWithActionCandidates} (${formatPct(readiness.coverage.actionCandidatesPct)})`,
    `- original_scan_missing_candidate_now_detected: ${readiness.originalScanMissingCandidateNowDetected}`,
    `- original_scan_detected_candidate_now_missing: ${readiness.originalScanDetectedCandidateNowMissing}`,
    `- insufficient_artifacts: ${readiness.insufficientArtifacts}`,
    `- network_phase_missing: ${readiness.networkPhaseMissing}`,
    "",
    "## Reasons",
    "",
    ...(readiness.reasons.length > 0 ? readiness.reasons : ["No readiness blockers detected."]).map((reason) => `- ${reason}`),
    "",
    "## Provider Detection Counts",
    "",
    ...recordLines(readiness.providerDetectionCounts),
    "",
    "## Surface Type Counts",
    "",
    ...recordLines(readiness.surfaceTypeCounts),
    "",
    "## Failure Taxonomy Counts",
    "",
    ...recordLines(readiness.failureTaxonomyCounts),
    "",
  ];
  return `${lines.join("\n")}\n`;
}

async function readJsonSafely<T>(filePath: string): Promise<T | undefined> {
  if (!existsSync(filePath)) {
    return undefined;
  }
  try {
    const text = /\.zip$/i.test(filePath)
      ? await readJsonTextFromZip(filePath)
      : await readFile(filePath, "utf8");
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}

async function readJsonTextFromZip(filePath: string): Promise<string> {
  const buffer = await readFile(filePath);
  const entry = extractFirstZipTextEntry(buffer, /\.(?:har|json)$/i);
  if (!entry) {
    throw new Error(`No JSON-like entry found in ${filePath}`);
  }
  return entry;
}

function extractFirstZipTextEntry(buffer: Buffer, namePattern: RegExp): string | undefined {
  const endOfCentralDirectory = findEndOfCentralDirectory(buffer);
  if (endOfCentralDirectory === undefined) {
    return undefined;
  }
  const centralDirectorySize = buffer.readUInt32LE(endOfCentralDirectory + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(endOfCentralDirectory + 16);
  let offset = centralDirectoryOffset;
  const end = centralDirectoryOffset + centralDirectorySize;
  while (offset < end && buffer.readUInt32LE(offset) === 0x02014b50) {
    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraFieldLength = buffer.readUInt16LE(offset + 30);
    const fileCommentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const fileName = buffer.subarray(offset + 46, offset + 46 + fileNameLength).toString("utf8");
    if (namePattern.test(fileName)) {
      const localFileNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraFieldLength = buffer.readUInt16LE(localHeaderOffset + 28);
      const dataOffset = localHeaderOffset + 30 + localFileNameLength + localExtraFieldLength;
      const compressed = buffer.subarray(dataOffset, dataOffset + compressedSize);
      if (compressionMethod === 0) {
        return compressed.toString("utf8");
      }
      if (compressionMethod === 8) {
        return inflateRawSync(compressed).toString("utf8");
      }
      throw new Error(`Unsupported zip compression method ${compressionMethod}`);
    }
    offset += 46 + fileNameLength + extraFieldLength + fileCommentLength;
  }
  return undefined;
}

function findEndOfCentralDirectory(buffer: Buffer): number | undefined {
  const minimumOffset = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= minimumOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      return offset;
    }
  }
  return undefined;
}

function frameContextFromSnapshot(frame: ReplayFrameSnapshot): ReplayFrameContext {
  return {
    frameIndex: frame.frameIndex,
    frameKind: frame.frameKind,
    frameName: frame.frameName,
    frameUrl: frame.frameUrl,
  };
}

function dedupeProviderSignals(signals: ReplayProviderDetectionSignal[]): ReplayProviderDetectionSignal[] {
  const seen = new Set<string>();
  const deduped = [];
  for (const signal of signals) {
    const key = [
      signal.provider,
      signal.source,
      signal.signal,
      signal.frameContext?.frameIndex,
      signal.frameContext?.frameUrl,
    ].join("|");
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(signal);
    }
  }
  return deduped.sort((left, right) => right.confidence - left.confidence || left.provider.localeCompare(right.provider));
}

function dedupeActionCandidates(candidates: ReplayEvidenceActionCandidate[]): ReplayEvidenceActionCandidate[] {
  const seen = new Set<string>();
  const deduped = [];
  for (const candidate of candidates) {
    const key = [
      candidate.action,
      candidate.label.toLowerCase(),
      candidate.frameContext?.frameIndex,
      candidate.sourceScenario,
    ].join("|");
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(candidate);
    }
  }
  return deduped.sort((left, right) => right.confidence - left.confidence || left.action.localeCompare(right.action));
}

function stripHtml(value: string): string {
  return value
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'");
}

function normalizeVisibleText(value: string): string {
  return stripHtml(value).replace(/\s+/g, " ").trim();
}

function attrValue(tag: string, attribute: string): string | undefined {
  const match = tag.match(new RegExp(`${attribute}=["']([^"']+)["']`, "i"));
  return match?.[1];
}

function endpointFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`.slice(0, 180);
  } catch {
    return trimForReport(url, 180);
  }
}

function classifyNetworkVendor(url: string): string {
  const lower = url.toLowerCase();
  for (const provider of providerPatterns) {
    if (provider.patterns.some((pattern) => pattern.test(lower))) {
      return provider.provider;
    }
  }
  if (/google-analytics|googletagmanager|doubleclick|googleadservices|google\.com\/pagead/.test(lower)) {
    return "Google";
  }
  if (/clarity\.ms|bing\.com|bat\.bing\.com/.test(lower)) {
    return "Microsoft";
  }
  if (/facebook\.com|connect\.facebook|fbevents/.test(lower)) {
    return "Meta";
  }
  if (/hotjar/.test(lower)) {
    return "Hotjar";
  }
  if (/fullstory|fs\.js/.test(lower)) {
    return "FullStory";
  }
  if (/adobe|demdex|omtrdc/.test(lower)) {
    return "Adobe";
  }
  return "unknown";
}

function siteKeyForScenario(scenario: ReplayEvidenceScenarioReport): string {
  if (scenario.sourceUrl) {
    try {
      return new URL(scenario.sourceUrl).hostname.replace(/^www\./, "");
    } catch {
      return safePathSegment(scenario.sourceUrl);
    }
  }
  return safePathSegment(path.dirname(scenario.manifestPath));
}

function chooseProviderFromScenarioReports(scenarios: ReplayEvidenceScenarioReport[]): string {
  const counts = new Map<string, number>();
  for (const scenario of scenarios) {
    const weight = scenario.detectedProvider === "none" ? 0 : scenario.detectedProvider === "generic/unknown CMP" ? 0.5 : 1;
    counts.set(scenario.detectedProvider, (counts.get(scenario.detectedProvider) ?? 0) + weight);
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? "none";
}

function mergeClassificationDeltas(deltas: ReplayClassificationDelta[]): ReplayClassificationDelta {
  const originalCandidateActions = unique(deltas.flatMap((delta) => delta.originalCandidateActions)).sort();
  const replayCandidateActions = unique(deltas.flatMap((delta) => delta.replayCandidateActions)).sort() as ReplayActionCandidateType[];
  return {
    originalCandidateActions,
    replayCandidateActions,
    originalRejectCandidateObserved: deltas.some((delta) => delta.originalRejectCandidateObserved),
    replayRejectCandidateObserved: deltas.some((delta) => delta.replayRejectCandidateObserved),
    originalScanMissingCandidateNowDetected: deltas.some((delta) => delta.originalScanMissingCandidateNowDetected),
    originalScanDetectedCandidateNowMissing: deltas.some((delta) => delta.originalScanDetectedCandidateNowMissing),
    notes: unique(deltas.flatMap((delta) => delta.notes)),
  };
}

function mergeNetworkPhases(phases: ReplayNetworkPhaseSummary[]): ReplayNetworkPhaseSummary {
  return {
    vendors: unique(phases.flatMap((phase) => phase.vendors)).sort(),
    endpoints: unique(phases.flatMap((phase) => phase.endpoints)).sort().slice(0, 120),
    requestCount: phases.reduce((sum, phase) => sum + phase.requestCount, 0),
  };
}

function chooseSurfaceType(surfaceTypes: ConsentSurfaceType[]): ConsentSurfaceType {
  const priority: ConsentSurfaceType[] = [
    "iframe_banner",
    "preference_center",
    "first_layer_banner",
    "floating_privacy_control",
    "footer_privacy_control",
    "privacy_policy_only",
    "not_observed",
  ];
  return priority.find((surfaceType) => surfaceTypes.includes(surfaceType)) ?? "not_observed";
}

function markdownCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function groupCount(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function pct(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

function formatPct(value: number): string {
  return `${Math.round(value * 1000) / 10}%`;
}

function recordLines(record: Record<string, number>): string[] {
  const entries = Object.entries(record);
  return entries.length > 0 ? entries.map(([key, value]) => `- ${key}: ${value}`) : ["- none"];
}

function trimForReport(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}...` : normalized;
}

function sortRecord(record: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(record).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])));
}

function safePathSegment(value: string): string {
  return value
    .replace(/^https?:\/\//i, "")
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "unknown-site";
}

async function resolveManifestPaths(input: ConsentFlowReplayValidationInput): Promise<string[]> {
  const explicit = input.manifestPaths?.map((manifestPath) => path.resolve(manifestPath)) ?? [];
  if (!input.corpusDir) {
    return unique(explicit).sort();
  }
  const corpusManifests = await findReplayManifests(path.resolve(input.corpusDir));
  return unique([...explicit, ...corpusManifests]).sort();
}

async function findReplayManifests(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const paths: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      paths.push(...await findReplayManifests(entryPath));
    } else if (/^replay_.+\.manifest\.json$/i.test(entry.name)) {
      paths.push(entryPath);
    }
  }
  return paths;
}

function resolveArtifactPath(manifestPath: string, artifactPath: string | undefined): string | undefined {
  if (!artifactPath) {
    return undefined;
  }
  if (path.isAbsolute(artifactPath)) {
    return artifactPath;
  }
  const manifestRelative = path.resolve(path.dirname(manifestPath), artifactPath);
  if (existsSync(manifestRelative)) {
    return manifestRelative;
  }
  const workspaceRelative = path.resolve(process.cwd(), artifactPath);
  if (existsSync(workspaceRelative)) {
    return workspaceRelative;
  }
  return manifestRelative;
}

async function writeReplayValidationArtifacts(
  outDir: string,
  result: ConsentFlowReplayValidationResult,
): Promise<void> {
  await mkdir(outDir, { recursive: true });
  await writeFile(
    path.join(outDir, "ConsentFlowReplayValidationReport.json"),
    `${JSON.stringify(result, null, 2)}\n`,
  );
  await writeFile(
    path.join(outDir, "ConsentFlowReplayValidationReport.md"),
    formatConsentFlowReplayValidationMarkdown(result),
  );
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
