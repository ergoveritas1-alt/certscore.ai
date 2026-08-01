import "server-only";

import { GetObjectCommand, S3Client, type GetObjectCommandOutput } from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { getDomain as getTldtsDomain } from "tldts";
import {
  article13DisclosureRejectReason as sharedArticle13DisclosureRejectReason,
  classifyGdprTransparencyTopics,
  classifyConsentControlLabel,
  type ConsentControlAssessment,
  deriveConsentSurfaceInspectionOutcome,
  derivePolicySurfaceInspectionOutcome,
  evaluateLegalFrameworkValidity,
  hasStaleLegalFrameworkReference,
  policyTextEvidenceProjectionSchema,
  SUPPORTED_GDPR_TRANSPARENCY_LOCALES,
  type CanonicalEvidenceBundle,
  type NormalizedVendorObservation,
  type PolicyTextEvidenceProjection,
  type PolicySurfaceInspectionOutcome
} from "@certscore/contracts";
import {
  isCanonicalIdSyncEndpoint,
  resolveVendorDisplayCategory,
  resolveVendorObservations,
  type VendorResolverInput
} from "@certscore/vendor-resolver";
import { isScanNoGoSnapshotOutcome, resolveScanNoGoPresentation } from "@website-signal-risk-scanner/shared";
import {
  adaptGdprTransparencyTopicCandidatesForProduction,
  type GdprTransparencyTopicEvidenceAdapterResult
} from "../../lib/scans/gdpr-transparency-topic-evidence-adapter";
import {
  gdprTransparencyProductionEvidenceProfileEnabled,
  normalizeGdprTransparencyProductionEvidenceProfile,
  type GdprTransparencyProductionEvidenceProfile
} from "../../lib/scans/gdpr-transparency-production-profile";
import { getProductionPolicyModelReviewRevision } from "../../lib/scans/policy-model-review-revision";
import {
  inferDirectEndpointVendorFromUrl,
  isPromotionGradePreconsentRequestRow
} from "../../lib/scans/preconsent-public-evidence";
import { guessPrimaryLanguage } from "../../lib/scans/primary-language";
import { BoundedPromiseCache } from "../performance/bounded-promise-cache";
import { withServerTiming } from "../performance/log-server-timing";
import type { ScanDetailResponse } from "./get-scan-by-id";
import { deriveMaterializedConsentControlAssessment } from "./consent-control-assessment-projector";
import {
  LOCAL_V2_DAG_LAMBDA_AWS_REGION,
  isLocalV2DagLambdaAwsRegion,
  LOCAL_V2_DAG_SCAN_PROCESSOR,
  LOCAL_V2_DAG_WC01_PROJECTION_VERSION,
  shouldUseLocalV2DagScanTool,
  type LocalV2DagScanProfile
} from "./local-v2-dag-scan-config";
import { getScanReportProjectionGeneration } from "./scan-report-projection-generation";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getRecord(value: unknown, key: string) {
  return isRecord(value) && isRecord(value[key]) ? value[key] as Record<string, unknown> : null;
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function resolveFinalMaterializedScanOutcome(input: { existingOutcome: unknown }) {
  const existingOutcome = getString(input.existingOutcome);

  // This path runs only after the final canonical bundle did not produce a no-go.
  if (existingOutcome && isScanNoGoSnapshotOutcome(existingOutcome)) {
    return "completed_partial";
  }
  return existingOutcome ?? "completed_partial";
}

export function getLocalV2PrimaryLanguage(bundle: CanonicalEvidenceBundle) {
  const consentObservations = bundle.consentUiObservations ?? [];
  const policySurfaces = bundle.policySurfaceObservations ?? [];
  return guessPrimaryLanguage({
    declaredLanguages: (bundle.domSnapshots ?? []).map((snapshot) => snapshot.documentLanguage),
    matchedLocales: [
      ...consentObservations.flatMap((observation) =>
        (observation.controls ?? []).map((control) => control.matchedLocale)
      ),
      ...policySurfaces.flatMap((surface) =>
        (surface.gdprTransparencyTopicCandidates ?? []).map((candidate) => candidate.matchedLocale)
      ),
      ...policySurfaces.flatMap((surface) =>
        (surface.article13DisclosureSignals ?? []).map((signal) => signal.matchedLocale)
      )
    ],
    textSamples: [
      ...(bundle.domSnapshots ?? []).map((snapshot) => snapshot.textExcerpt),
      ...consentObservations.map((observation) => observation.textExcerpt),
      ...policySurfaces.flatMap((surface) => [
        surface.title,
        surface.linkText,
        surface.surroundingTextExcerpt,
        surface.textExcerpt
      ])
    ],
    urls: [
      bundle.url,
      bundle.normalizedUrl,
      ...(bundle.domSnapshots ?? []).map((snapshot) => snapshot.url),
      ...policySurfaces.flatMap((surface) => [surface.url, surface.normalizedUrl])
    ]
  });
}

type LocalV2DagLambdaPollResult = {
  handled: number;
};

type GdprTransparencyProductionEvidenceDiagnostics = {
  acceptedCandidateCount: number;
  diagnosticCandidateCount: number;
  discardedCandidateCount: number;
  productionCreditSignalCount: number;
  rejectedCandidateCount: number;
  sourceCandidateCount: number;
};

type LocalV2DagLambdaArtifactPointer = {
  sha256: string | null;
  sizeBytes: number | null;
  uri: string;
  verificationRequired: boolean;
};

function getLocalV2DagLambdaArtifactPointer(
  scanRecord: ScanDetailResponse,
  field: "manifestUri" | "scanArtifactUri"
): LocalV2DagLambdaArtifactPointer | null {
  return scanRecord.events
    .filter((event) => event.eventType === "v2_lambda_result.received")
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .map((event) => {
      const metadata = isRecord(event.metadataJson) ? event.metadataJson : null;
      if (
        metadata?.artifactOnly !== true ||
        metadata?.productionFindingIntegration !== false ||
        metadata?.processor !== LOCAL_V2_DAG_SCAN_PROCESSOR
      ) {
        return null;
      }
      const uri = getString(getRecord(metadata, "artifactPointers")?.[field]);
      if (!uri) {
        return null;
      }
      const artifactMetadata = getRecord(getRecord(metadata, "artifactMetadata"), field);
      const sizeBytes = artifactMetadata?.sizeBytes;
      const sha256 = getString(artifactMetadata?.sha256);
      const normalizedSizeBytes = typeof sizeBytes === "number" && Number.isSafeInteger(sizeBytes) && sizeBytes >= 0
        ? sizeBytes
        : null;
      const verificationRequired = getRecord(metadata, "artifactAccess")?.productionReadMode === "verified_s3";
      if (verificationRequired && (!sha256 || normalizedSizeBytes === null)) {
        return null;
      }
      return {
        sha256,
        sizeBytes: normalizedSizeBytes,
        uri,
        verificationRequired
      };
    })
    .find((pointer): pointer is LocalV2DagLambdaArtifactPointer => Boolean(pointer)) ?? null;
}

export function getLocalV2DagReportInput(scanRecord: ScanDetailResponse) {
  const config = scanRecord.scan.scanConfigJson;
  if (!isRecord(config) || config.processor !== LOCAL_V2_DAG_SCAN_PROCESSOR) {
    return null;
  }

  const execution = getRecord(config, "execution");
  const v2DagParallel = getRecord(execution, "v2DagParallel");
  if (v2DagParallel?.localOnly !== true || v2DagParallel?.artifactOnly !== true) {
    return null;
  }

  const localV2Dag = getRecord(execution, "localV2Dag");
  const v2DagLambda = getRecord(execution, "v2DagLambda");
  const outDir = getString(localV2Dag?.outDir);
  const manifestArtifact = getLocalV2DagLambdaArtifactPointer(scanRecord, "manifestUri");
  const scanArtifact = getLocalV2DagLambdaArtifactPointer(scanRecord, "scanArtifactUri");
  const lambdaResultQueueUrl = getString(v2DagLambda?.resultQueueUrl);
  const normalizedUrl = getString(config.normalizedUrl);
  const hostname = getString(config.hostname) ?? scanRecord.scan.domainHostname;
  const profile = getString(v2DagParallel.profile) ?? getString(config.profile) ?? "standard";
  const gdprTransparencyEvidenceProfile = normalizeGdprTransparencyProductionEvidenceProfile(
    getString(v2DagParallel.gdprTransparencyEvidenceProfile) ??
    getString(localV2Dag?.gdprTransparencyEvidenceProfile) ??
    getString(config.gdprTransparencyEvidenceProfile)
  );

  return {
    gdprTransparencyEvidenceProfile,
    lambdaResultQueueUrl,
    manifestArtifactSha256: manifestArtifact?.sha256 ?? null,
    manifestArtifactSizeBytes: manifestArtifact?.sizeBytes ?? null,
    manifestArtifactUri: manifestArtifact?.uri ?? null,
    outDir,
    profile: profile === "tiny" ? "tiny" as LocalV2DagScanProfile : "standard" as LocalV2DagScanProfile,
    scanArtifactSha256: scanArtifact?.sha256 ?? null,
    scanArtifactSizeBytes: scanArtifact?.sizeBytes ?? null,
    scanArtifactUri: scanArtifact?.uri ?? null,
    url: normalizedUrl ?? hostname ?? null
  };
}

export function isLocalV2DagReport(scanRecord: ScanDetailResponse) {
  return Boolean(getLocalV2DagReportInput(scanRecord));
}

export function shouldAttemptLocalV2DagLambdaResultRefresh(scanRecord: ScanDetailResponse, nowMs = Date.now()) {
  // Lambda result ingestion is owned by the validation worker. Report pages must
  // not consume SQS messages, or they can hide results until visibility timeout.
  void scanRecord;
  void nowMs;
  return false;
}

export function resetLocalV2DagLambdaResultRefreshStateForTest() {
  return;
}

export async function tryRefreshLocalV2DagLambdaResult(
  scanRecord: ScanDetailResponse,
  options: {
    nowMs?: number;
    pollResultQueue?: () => Promise<LocalV2DagLambdaPollResult>;
  } = {}
) {
  // Kept as a compatibility no-op for older callers/tests; the web tier should
  // only read already-recorded scan state.
  void scanRecord;
  void options;
  return false;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
}

function getStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

function getObjectArray(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function isPreConsentScreenshotArtifact(screenshot: NonNullable<CanonicalEvidenceBundle["screenshots"]>[number] | null | undefined) {
  return screenshot?.artifactId === "screenshot_pre_consent" ||
    screenshot?.artifactId === "screenshot_pre_consent_settled" ||
    screenshot?.artifactId === "screenshot_pre_consent_geometry_proof" ||
    screenshot?.artifactId === "screenshot_pre_consent_full_page";
}

function preConsentScreenshotRank(screenshot: NonNullable<CanonicalEvidenceBundle["screenshots"]>[number]) {
  switch (screenshot.artifactId) {
    case "screenshot_pre_consent_geometry_proof":
      return 0;
    case "screenshot_pre_consent_settled":
      return 1;
    case "screenshot_pre_consent_full_page":
      return 2;
    default:
      return 3;
  }
}

function localV2VisualEvidenceArtifactId(screenshot: NonNullable<CanonicalEvidenceBundle["screenshots"]>[number]) {
  switch (screenshot.artifactId) {
    case "screenshot_pre_consent_geometry_proof":
      return "local_v2:screenshot_pre_consent_geometry_proof";
    case "screenshot_pre_consent_settled":
      return "local_v2:screenshot_pre_consent_settled";
    case "screenshot_pre_consent_full_page":
      return "local_v2:screenshot_pre_consent_full_page";
    default:
      return "local_v2:screenshot_pre_consent";
  }
}

function isPreConsentErrorShellScreenshot(bundle: CanonicalEvidenceBundle, screenshot: NonNullable<CanonicalEvidenceBundle["screenshots"]>[number]) {
  if (!isPreConsentScreenshotArtifact(screenshot)) {
    return false;
  }

  return (bundle.consentUiObservations ?? []).some((observation) => {
    const textExcerpt = getString(observation.textExcerpt)?.toLowerCase() ?? "";
    const basis = getStringArray(observation.basis);
    return (
      observation.likelyPresent === false &&
      /^(?:unknown error|access denied|forbidden|internal server error|service unavailable)$/i.test(textExcerpt) &&
      (
        basis.includes("bounded_capture_timeout_or_failure") ||
        basis.includes("dom_text_fallback_after_consent_ui_timeout")
      )
    );
  });
}

function readPngDimensions(filePath: string): { height: number; width: number } | null {
  try {
    const header = readFileSync(filePath, { encoding: null, flag: "r" }).subarray(0, 24);
    const pngSignature = "89504e470d0a1a0a";
    if (header.length < 24 || header.subarray(0, 8).toString("hex") !== pngSignature) {
      return null;
    }
    return {
      width: header.readUInt32BE(16),
      height: header.readUInt32BE(20)
    };
  } catch {
    return null;
  }
}

function isLikelyRetainedVisualErrorShell(input: {
  bundle: CanonicalEvidenceBundle;
  lowRuntimeActivity: boolean;
  localOutDir?: string | null;
  screenshot: NonNullable<CanonicalEvidenceBundle["screenshots"]>[number] | null;
}) {
  const screenshotPath = getString(input.screenshot?.path);
  if (!screenshotPath || !isPreConsentScreenshotArtifact(input.screenshot)) {
    return false;
  }
  if (!input.lowRuntimeActivity) {
    return false;
  }

  const runtimeCounts = input.bundle.runtimeCoverage?.observationCounts;
  const noMeaningfulRuntime =
    (runtimeCounts?.thirdPartyRequests ?? 0) === 0 &&
    (runtimeCounts?.normalizedVendors ?? 0) === 0 &&
    (input.bundle.normalizedVendorObservations ?? []).length === 0;
  const noConsentSurface = !(input.bundle.consentUiObservations ?? []).some((observation) =>
    observation.likelyPresent === true ||
    (observation.visibleChoiceLabels ?? []).length > 0 ||
    (observation.controls ?? []).length > 0
  );
  if (!noMeaningfulRuntime || !noConsentSurface) {
    return false;
  }

  const errorShellTextObserved = (input.bundle.consentUiObservations ?? []).some((observation) => {
    const textExcerpt = getString(observation.textExcerpt)?.toLowerCase() ?? "";
    return observation.likelyPresent === false &&
      /^(?:unknown error|internal server error|service unavailable)$/i.test(textExcerpt);
  });
  const candidatePaths = uniqueStrings([
    screenshotPath,
    input.localOutDir ? path.join(input.localOutDir, path.basename(screenshotPath)) : null
  ]);

  for (const candidatePath of candidatePaths) {
    try {
      const fileSize = statSync(candidatePath).size;
      const dimensions = readPngDimensions(candidatePath);
      if (
        dimensions &&
        dimensions.width >= 900 &&
        dimensions.height >= 600 &&
        fileSize > 256 &&
        fileSize <= 25_000
      ) {
        return true;
      }
    } catch {
      // Try the next candidate path.
    }
  }

  if (errorShellTextObserved) {
    return Boolean(
      input.bundle.screenshots?.some((screenshot) => screenshot.artifactId === "screenshot_pre_consent") &&
      input.lowRuntimeActivity
    );
  }

  return false;
}

function hostnameFromUrl(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  try {
    return new URL(value).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return value.replace(/^https?:\/\//i, "").replace(/\/.*$/g, "").replace(/^www\./i, "").toLowerCase() || null;
  }
}

function registrableDomain(hostname: string | null | undefined) {
  if (!hostname) {
    return null;
  }
  return getTldtsDomain(hostname, { allowPrivateDomains: true }) ?? hostname;
}

function sameSite(hostname: string | null | undefined, rootDomain: string | null | undefined) {
  if (!hostname || !rootDomain) {
    return false;
  }
  const normalizedHost = hostname.replace(/^www\./i, "").toLowerCase();
  const normalizedRoot = rootDomain.replace(/^www\./i, "").toLowerCase();
  return normalizedHost === normalizedRoot || normalizedHost.endsWith(`.${normalizedRoot}`);
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function minimumNumber(...values: unknown[]) {
  const numbers = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return numbers.length > 0 ? Math.min(...numbers) : null;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function durationMsFromTimestamps(startedAt: string | null | undefined, completedAt: string | null | undefined) {
  if (!startedAt || !completedAt) {
    return null;
  }

  const startedAtMs = Date.parse(startedAt);
  const completedAtMs = Date.parse(completedAt);

  if (!Number.isFinite(startedAtMs) || !Number.isFinite(completedAtMs) || completedAtMs < startedAtMs) {
    return null;
  }

  return completedAtMs - startedAtMs;
}

function localV2ModuleOutcome(status: CanonicalEvidenceBundle["modulesRun"][number]["status"]) {
  if (status === "completed") return "success";
  if (status === "failed") return "failed";
  if (status === "partial" || status === "not_testable" || status === "skipped_budget") return "degraded";
  return "unknown";
}

export function buildLocalV2DagTimingArtifacts(bundle: CanonicalEvidenceBundle) {
  const modulesRun = Array.isArray(bundle.modulesRun) ? bundle.modulesRun : [];
  const modulePhases = modulesRun.map((moduleRun) => ({
    phase: moduleRun.moduleName.slice(0, 120),
    startedAt: moduleRun.startedAt,
    completedAt: moduleRun.completedAt ?? null,
    durationMs: moduleRun.durationMs ?? durationMsFromTimestamps(moduleRun.startedAt, moduleRun.completedAt) ?? 0,
    outcome: localV2ModuleOutcome(moduleRun.status)
  }));
  const childPhases = modulesRun
    .flatMap((moduleRun) => (moduleRun.timingBreakdown ?? []).map((timing) => ({
      phase: `${moduleRun.moduleName}:${timing.label}`.slice(0, 120),
      startedAt: null,
      completedAt: null,
      durationMs: timing.durationMs,
      outcome: localV2ModuleOutcome(moduleRun.status)
    })))
    .sort((left, right) => right.durationMs - left.durationMs)
    .slice(0, Math.max(0, 20 - modulePhases.length));
  const policyModule = modulesRun.find((moduleRun) => /policySurfaceScanner/i.test(moduleRun.moduleName));
  const policyTimings = policyModule?.timingBreakdown ?? [];
  const details = policyTimings.map((timing) => timing.detail ?? "");
  const rankedCandidateCounts = details.flatMap((detail) => {
    const match = detail.match(/Rank (\d+) (?:fallback )?policy candidates/i);
    return match?.[1] ? [Number(match[1])] : [];
  });
  const fetchGroup = details.map((detail) => detail.match(/up to (\d+).*concurrency (\d+)/i)).find(Boolean);
  const requestIndexes = new Set(policyTimings.flatMap((timing) => {
    const match = timing.label.match(/^policy (?:rendered )?fetch(?: fallback)? (\d+)$/i);
    return match?.[1] ? [match[1]] : [];
  }));
  const timeoutCount = [...(policyModule?.errors ?? []), ...details]
    .filter((value) => /timed? out|timeout/i.test(value)).length;
  const candidateCount = rankedCandidateCounts.length > 0 ? Math.max(...rankedCandidateCounts) : null;
  const fetchLimit = fetchGroup?.[1] ? Number(fetchGroup[1]) : null;
  const requestsStarted = requestIndexes.size > 0 ? requestIndexes.size : fetchLimit;

  return {
    buildPhaseSummaries: [...modulePhases, ...childPhases],
    v2DagPolicyDiscoveryDiagnostics: {
      candidatesDiscovered: candidateCount,
      candidatesAfterDeduplication: candidateCount,
      requestsStarted,
      successfulDocuments: policyModule ? bundle.policySurfaceObservations.length : null,
      timeouts: policyModule ? timeoutCount : null,
      phaseWallMs: policyModule?.durationMs ?? null,
      maxConcurrency: fetchGroup?.[2] ? Number(fetchGroup[2]) : null,
      shortCircuitReason: policyTimings.some((timing) => timing.label === "rendered discovery skipped")
        ? "static_core_policy_coverage"
        : null
    }
  };
}

function safeLocalV2DocumentUrl(...values: Array<string | null | undefined>) {
  for (const value of values) {
    if (!value) continue;
    try {
      const url = new URL(value);
      if (!/^https?:$/.test(url.protocol)) continue;
      if (/\.(?:avif|bmp|css|gif|ico|jpe?g|js|mjs|map|mp3|mp4|ogg|pdf|png|svg|webm|webp|woff2?)$/i.test(url.pathname)) continue;
      return url.toString();
    } catch {
      // Ignore malformed and non-document candidates.
    }
  }
  return null;
}

export function getLocalV2FinalDocumentUrl(bundle: CanonicalEvidenceBundle) {
  const latestDomUrl = [...(bundle.domSnapshots ?? [])]
    .sort((left, right) => right.capturedAtMs - left.capturedAtMs)
    .map((snapshot) => firstString(snapshot.url))
    .find(Boolean);
  const latestScreenshotUrl = [...(bundle.screenshots ?? [])]
    .sort((left, right) => right.capturedAtMs - left.capturedAtMs)
    .map((screenshot) => firstString(screenshot.url))
    .find(Boolean);
  const transportFinalUrl = (bundle.transportSecurityObservations ?? [])
    .map((observation) => firstString(observation.finalUrl))
    .find(Boolean);
  return safeLocalV2DocumentUrl(
    latestDomUrl,
    latestScreenshotUrl,
    transportFinalUrl,
    bundle.normalizedUrl,
    bundle.url,
  );
}

export function isThirdPartyRuntimeEventForDocument(
  event: Record<string, unknown>,
  documentUrl: string | null | undefined,
) {
  const documentRootDomain = registrableDomain(hostnameFromUrl(documentUrl));
  const eventHostname = firstString(event.hostname) ?? hostnameFromUrl(firstString(event.url, event.requestUrl));
  if (eventHostname && documentRootDomain) {
    return !sameSite(eventHostname, documentRootDomain);
  }
  return event.thirdParty === true || event.isThirdParty === true;
}

export function isAuxiliaryNavigationContextUrl(value: string | null | undefined) {
  if (!value) return false;
  try {
    const { pathname } = new URL(value);
    return /(?:^|\/)(?:callback|oauth2?\/callback|signin-oidc|authorize|authorization\.oauth2)(?:\/|$)/i.test(pathname);
  } catch {
    return false;
  }
}

export function isPrimaryAssessmentRuntimeEvent(
  event: Record<string, unknown>,
  documentUrl: string | null | undefined,
) {
  const contextUrl = firstString(event.documentUrl, event.topLevelUrl);
  const documentHost = hostnameFromUrl(documentUrl);
  if (contextUrl) {
    return sameSite(hostnameFromUrl(contextUrl), documentHost) && !isAuxiliaryNavigationContextUrl(contextUrl);
  }
  const eventUrl = firstString(event.url, event.requestUrl);
  const resourceType = firstString(event.resourceType, event.initiatorType);
  if (isAuxiliaryNavigationContextUrl(eventUrl)) return false;
  if (/^(?:document|navigation|main_frame)$/i.test(resourceType ?? "") && eventUrl) {
    return sameSite(hostnameFromUrl(eventUrl), documentHost);
  }
  return true;
}

function purposeToCategory(value: string | null | undefined) {
  switch (value) {
    case "advertising":
    case "analytics":
    case "session_replay":
    case "tracking":
      return value;
    case "tag_manager":
    case "tag_management":
      return "tag_manager";
    case "consent_management":
      return "cmp";
    case "customer_data_platform":
      return "analytics";
    default:
      return value ?? "unknown";
  }
}

function policySurfaceLabel(surfaceType: string) {
  return surfaceType
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizePolicyPageType(surfaceType: string) {
  return surfaceType === "terms" ? "terms_of_service" : surfaceType;
}

type LocalV2PolicySurface = NonNullable<CanonicalEvidenceBundle["policySurfaceObservations"]>[number];
const MIN_PRIVACY_POLICY_TEXT_CHARS_FOR_ARTICLE13 = 2_500;

type RetainedPolicyTextArtifactEvidence = {
  artifactId: string;
  fileName: string;
  text?: string;
  sha256?: string;
  sizeBytes?: number;
  uri?: string;
  verificationStatus:
    | "verified"
    | "local_unverified"
    | "missing_manifest_entry"
    | "unavailable"
    | "verification_failed";
  failureReason?: string;
};

type PolicyTextEvidenceContext = {
  artifactsById?: ReadonlyMap<string, RetainedPolicyTextArtifactEvidence>;
  generatedAt: string;
  localOutDir?: string | null;
  scanId: string;
  sourceBundle: PolicyTextEvidenceProjection["sourceBundle"];
};

function isCookiePreferenceSurfaceUrl(value: string | null | undefined) {
  return Boolean(value && /\/(?:privacy|cookie)[-_]?(?:prefs?|preferences?|settings?)(?:\/|$)/i.test(value));
}

function canonicalPolicySurfaceUrl(surface: LocalV2PolicySurface, fallbackBaseUrl: string | null) {
  const rawUrl = firstString(surface.normalizedUrl, surface.url);
  if (!rawUrl) {
    return null;
  }

  try {
    const parsed = fallbackBaseUrl ? new URL(rawUrl, fallbackBaseUrl) : new URL(rawUrl);
    const semanticFragment = /^(?:privacy-policy|cookie-policy|cookies-policy|terms-of-use|terms-and-conditions|terms-of-service)$/i.test(
      parsed.hash.replace(/^#/, "")
    ) ? parsed.hash.toLowerCase() : "";
    parsed.hash = semanticFragment;
    parsed.hostname = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    parsed.pathname = parsed.pathname.replace(/\/+$/g, "") || "/";
    parsed.pathname = parsed.pathname.replace(/^\/-\/[a-z]{2}(?:-[a-z]{2})?\//i, "/");
    if (semanticFragment && /^\/[a-z]{2}(?:-[a-z]{2})?\/policy$/i.test(parsed.pathname)) {
      parsed.pathname = "/policy";
    }
    return parsed.toString();
  } catch {
    return rawUrl.replace(/^https?:\/\/www\./i, "https://").replace(/\/+$/g, "");
  }
}

function policySurfaceDeduplicationKey(surface: LocalV2PolicySurface, fallbackBaseUrl: string | null) {
  const pageType = normalizePolicyPageType(surface.surfaceType);
  const canonicalUrl = canonicalPolicySurfaceUrl(surface, fallbackBaseUrl);
  return canonicalUrl ? `${pageType}:${canonicalUrl.toLowerCase()}` : `${pageType}:${surface.observationId ?? ""}`;
}

function hasSubstantivePolicySurfaceEvidence(surface: LocalV2PolicySurface) {
  return Boolean(
    firstString(surface.textExcerpt) ||
    (surface.observedTopics ?? []).length > 0 ||
    (surface.article13DisclosureSignals ?? []).length > 0 ||
    (surface.mentionedControls ?? []).length > 0 ||
    (surface.boundedTextExcerptIds ?? []).length > 0 ||
    (surface.evidenceRefs ?? []).length > 0 ||
    (surface.artifactRefs ?? []).length > 0
  );
}

function isEvaluatedPrivacyPolicySurface(surface: LocalV2PolicySurface) {
  return surface.surfaceType === "privacy_policy" && (
    surface.documentEvaluationState === "usable" ||
    ((surface.status === undefined || ["fetched", "observed"].includes(surface.status)) &&
      hasSubstantivePolicySurfaceEvidence(surface))
  );
}

function isReportablePolicySurface(surface: LocalV2PolicySurface) {
  const rawUrl = firstString(surface.normalizedUrl, surface.url);
  if (rawUrl) {
    try {
      const pathname = new URL(rawUrl, "https://policy.invalid").pathname.replace(/\/+$/g, "") || "/";
      if (/(?:^|\/)404(?:\/|$)/i.test(pathname)) {
        return false;
      }
    } catch {
      if (/(?:^|\/)404(?:[/?#]|$)/i.test(rawUrl)) {
        return false;
      }
    }
  }
  if (surface.status === "not_observed") {
    return false;
  }

  if (surface.status === "failed" || surface.status === "skipped_budget") {
    return surface.linkObservationState === "observed" &&
      surface.discoveryMethod !== "guessed_common_path" &&
      surface.confidence >= 0.72 &&
      Boolean(firstString(surface.normalizedUrl, surface.url));
  }

  if (surface.status === "fetched") {
    const retainedText = firstString(surface.textExcerpt)?.replace(/\s+/g, " ").trim() ?? "";
    return retainedText.length > 0 ||
      (surface.observedTopics ?? []).length > 0 ||
      (surface.article13DisclosureSignals ?? []).length > 0 ||
      (surface.retainedPolicySections ?? []).length > 0;
  }

  if (surface.surfaceType === "privacy_policy" || surface.surfaceType === "cookie_policy" || surface.surfaceType === "terms") {
    return hasSubstantivePolicySurfaceEvidence(surface);
  }

  return surface.status === "observed" || hasSubstantivePolicySurfaceEvidence(surface);
}

function policySurfaceEvidenceWeight(surface: LocalV2PolicySurface, pageUrl: string | null) {
  return [
    surface.status === "fetched" ? 100_000 : 0,
    hasSubstantivePolicySurfaceEvidence(surface) ? 10_000 : 0,
    pageUrl && !pageUrl.startsWith("/") ? 10 : 0,
    typeof surface.confidence === "number" ? surface.confidence : 0,
    firstString(surface.textExcerpt)?.length ?? 0,
    (surface.observedTopics ?? []).length,
    (surface.mentionedControls ?? []).length
  ].reduce((sum, value) => sum + value, 0);
}

export function dedupePolicySurfaces(surfaces: readonly LocalV2PolicySurface[], fallbackBaseUrl: string | null) {
  const retained = new Map<string, { pageUrl: string | null; surface: LocalV2PolicySurface; aliasUrls?: string[] }>();

  for (const surface of surfaces) {
    if (!isReportablePolicySurface(surface)) {
      continue;
    }

    const pageUrl = canonicalPolicySurfaceUrl(surface, fallbackBaseUrl);
    const rawPageUrl = firstString(surface.normalizedUrl, surface.url);
    let sourcePageUrl = pageUrl;
    if (rawPageUrl) {
      try {
        sourcePageUrl = (fallbackBaseUrl ? new URL(rawPageUrl, fallbackBaseUrl) : new URL(rawPageUrl)).toString();
      } catch {
        sourcePageUrl = rawPageUrl;
      }
    }
    const projectedSurface = isCookiePreferenceSurfaceUrl(pageUrl) && surface.surfaceType === "cookie_policy"
      ? { ...surface, surfaceType: "cookie_settings" as const }
      : surface;
    const key = policySurfaceDeduplicationKey(projectedSurface, fallbackBaseUrl);
    const existing = retained.get(key);
    const aliasUrls = uniqueStrings([
      ...(existing?.aliasUrls ?? []),
      sourcePageUrl,
    ]);
    if (!existing || policySurfaceEvidenceWeight(projectedSurface, pageUrl) > policySurfaceEvidenceWeight(existing.surface, existing.pageUrl)) {
      retained.set(key, { pageUrl, surface: projectedSurface, aliasUrls });
    } else {
      retained.set(key, { ...existing, aliasUrls });
    }
  }

  return [...retained.values()];
}

function mergePolicyEnrichmentRows(
  rows: ScanDetailResponse["policyEnrichment"],
  effectivePageUrl: string | null,
) {
  const effectiveCanonicalUrl = effectivePageUrl
    ? canonicalPolicySurfaceUrl({ normalizedUrl: effectivePageUrl } as LocalV2PolicySurface, effectivePageUrl)
    : null;
  const retained = new Map<string, ScanDetailResponse["policyEnrichment"][number]>();
  for (const row of rows) {
    const record = row as unknown as Record<string, unknown>;
    const rawUrl = firstString(
      record.policy_page_url,
      record.policyPageUrl,
      record.page_url,
      record.pageUrl,
      record.source_url,
      record.sourceUrl,
      record.url,
    );
    const canonicalUrl = rawUrl
      ? canonicalPolicySurfaceUrl({ normalizedUrl: rawUrl } as LocalV2PolicySurface, effectivePageUrl)
      : null;
    const pageType = firstString(record.policy_page_type, record.pageType, record.page_type) ?? "policy_surface";
    if (canonicalUrl && effectiveCanonicalUrl && canonicalUrl === effectiveCanonicalUrl && pageType === "policy_surface") {
      continue;
    }
    const key = `${pageType}:${canonicalUrl ?? firstString(record.id) ?? retained.size}`.toLowerCase();
    const existing = retained.get(key);
    if (!existing || JSON.stringify(row).length > JSON.stringify(existing).length) {
      retained.set(key, row);
    }
  }
  return [...retained.values()];
}

function requestUrl(row: Record<string, unknown>) {
  return firstString(row.normalizedUrl, row.requestUrl, row.url);
}

type EndpointJurisdictionVendor = {
  category?: string | null;
  hostnames: string[];
  vendorName?: string | null;
};

export function deriveEndpointJurisdictionEvidence(
  rows: Array<Record<string, unknown>>,
  vendors: EndpointJurisdictionVendor[] = []
) {
  const grouped = new Map<string, {
    confidence: "high" | "medium";
    etldPlusOne: string | null;
    firstPartyStatus: "third_party";
    host: string;
    inferenceBasis: string;
    inferredCountryCode: string | null;
    inferredRegion: string | null;
    locationLabel: string | null;
    matchedVendorCategory: string | null;
    matchedVendorName: string | null;
    requestCount: number;
    samplePaths: string[];
    scriptCount: number;
    sources: string[];
    transferReviewSignal: true;
  }>();

  for (const row of rows) {
    const thirdParty = row.thirdParty === true || row.isThirdParty === true;
    const region = firstString(row.endpointGeographyRegion);
    const jurisdiction = firstString(row.endpointGeographyJurisdiction);
    if (
      !thirdParty ||
      row.collectionEndpointObserved !== true ||
      firstString(row.endpointGeographyStatus) !== "region_observed" ||
      (!region && !jurisdiction)
    ) {
      continue;
    }
    const url = requestUrl(row);
    const host = firstString(row.hostname, row.requestHostname) ?? hostnameFromUrl(url);
    if (!host) continue;
    const normalizedHost = host.toLowerCase().replace(/^www\./, "");
    const vendor = vendors.find((candidate) => candidate.hostnames.some((hostname) =>
      normalizedHost === hostname || normalizedHost.endsWith(`.${hostname}`)
    ));
    const key = `${normalizedHost}|${region ?? ""}|${jurisdiction ?? ""}`;
    const existing = grouped.get(key);
    let pathname: string | null = null;
    if (url) {
      try {
        pathname = new URL(url).pathname.slice(0, 240);
      } catch {
        pathname = null;
      }
    }
    const resourceType = firstString(row.resourceType, row.initiatorType);
    const sources = uniqueStrings([...(existing?.sources ?? []), "request", resourceType === "script" ? "script" : null]);
    const basis = uniqueStrings(Array.isArray(row.endpointGeographyBasis)
      ? row.endpointGeographyBasis.filter((value): value is string => typeof value === "string")
      : []
    ).slice(0, 6);
    grouped.set(key, {
      confidence: jurisdiction && firstString(row.endpointGeographyPrecision) === "provider_region" ? "high" : "medium",
      etldPlusOne: getTldtsDomain(normalizedHost) ?? null,
      firstPartyStatus: "third_party",
      host: normalizedHost,
      inferenceBasis: basis.length > 0
        ? basis.join("+").slice(0, 300)
        : existing?.inferenceBasis ?? "retained_endpoint_geography",
      inferredCountryCode: jurisdiction,
      inferredRegion: region,
      locationLabel: firstString(row.endpointGeographyLocationLabel) ?? existing?.locationLabel ?? null,
      matchedVendorCategory: vendor?.category ?? null,
      matchedVendorName: vendor?.vendorName ?? null,
      requestCount: (existing?.requestCount ?? 0) + 1,
      samplePaths: uniqueStrings([...(existing?.samplePaths ?? []), pathname]).slice(0, 5),
      scriptCount: (existing?.scriptCount ?? 0) + (resourceType === "script" ? 1 : 0),
      sources,
      transferReviewSignal: true
    });
  }

  return [...grouped.values()].sort((left, right) =>
    right.requestCount - left.requestCount || left.host.localeCompare(right.host)
  ).slice(0, 50);
}

function cookieName(row: Record<string, unknown>) {
  return firstString(row.cookieName, row.name);
}

function cookieIdentity(row: Record<string, unknown>) {
  const name = cookieName(row);
  if (!name) return null;
  const domain = firstString(row.cookieDomain, row.domain, row.hostname)?.replace(/^\.+/, "").toLowerCase() ?? "unknown-domain";
  const cookiePath = firstString(row.cookiePath, row.path) ?? "/";
  return `${domain}|${cookiePath}|${name}`;
}

function networkEventIdentity(row: Record<string, unknown>) {
  return firstString(row.eventId, row.requestId) ?? [
    firstString(row.method) ?? "GET",
    requestUrl(row) ?? "unknown-url",
    typeof row.timestampMs === "number" ? row.timestampMs : "unknown-time",
  ].join("|");
}

export function countCanonicalCookieObservations(rows: Array<Record<string, unknown>>) {
  return uniqueStrings(rows.map((row) => cookieIdentity(row))).length;
}

export function summarizeRuntimeCookieEvidenceCounts(rows: Array<Record<string, unknown>>) {
  const preConsentRows = rows.filter((row) => firstString(row.consentStateAtTime, row.consent_state_at_time) === "pre_consent");
  const isSnapshot = (row: Record<string, unknown>) => /^(?:browser_snapshot|periodic_cookie_snapshot|initial_cookie_snapshot)$/i.test(firstString(row.operation, row.setMethod, row.set_method) ?? "");
  const timedWriteRows = rows.filter((row) => !isSnapshot(row));
  const timedPreConsentWriteRows = timedWriteRows.filter((row) => firstString(row.consentStateAtTime, row.consent_state_at_time) === "pre_consent");
  const initialSnapshotRows = rows.filter((row) => {
    const operation = firstString(row.operation, row.setMethod, row.set_method) ?? "";
    return /^initial_cookie_snapshot$/i.test(operation) || /^browser_snapshot$/i.test(operation) && minimumNumber(row.timestampMs, row.firstObservedAtMs, row.first_observed_at_ms) === null;
  });
  const periodicSnapshotRows = rows.filter((row) => {
    const operation = firstString(row.operation, row.setMethod, row.set_method) ?? "";
    return /^periodic_cookie_snapshot$/i.test(operation) || /^browser_snapshot$/i.test(operation) && minimumNumber(row.timestampMs, row.firstObservedAtMs, row.first_observed_at_ms) !== null;
  });
  return {
    distinctCookieCount: countCanonicalCookieObservations(rows),
    distinctPreConsentCookieCount: countCanonicalCookieObservations(preConsentRows),
    timedCookieWriteCount: countCanonicalCookieObservations(timedWriteRows),
    timedPreConsentCookieWriteCount: countCanonicalCookieObservations(timedPreConsentWriteRows),
    initialCookieSnapshotCount: countCanonicalCookieObservations(initialSnapshotRows),
    periodicCookieSnapshotCount: countCanonicalCookieObservations(periodicSnapshotRows),
  };
}

export function countCanonicalNetworkEvents(rows: Array<Record<string, unknown>>) {
  return uniqueStrings(rows.map((row) => networkEventIdentity(row))).length;
}

export function deriveCriticalCoverageLimitationKeys(input: {
  applicablePolicyCoverageComplete: boolean;
  consentCoverageComplete: boolean;
  transportCoverageComplete: boolean;
}) {
  return uniqueStrings([
    ...(!input.consentCoverageComplete ? ["consent_surface_inspection_incomplete"] : []),
    ...(!input.transportCoverageComplete ? ["transport_security_observation_incomplete"] : []),
    ...(!input.applicablePolicyCoverageComplete ? ["applicable_privacy_policy_unresolved"] : []),
  ]);
}

export function deriveApplicablePolicyCoverageComplete(input: {
  policySurfaceInspection: PolicySurfaceInspectionOutcome;
  privacyPolicyPresent: boolean;
  unresolvedObservedPrivacyPolicyCandidateCount: number;
}) {
  if (input.privacyPolicyPresent) {
    return true;
  }
  if (input.unresolvedObservedPrivacyPolicyCandidateCount > 0) {
    return false;
  }
  return input.policySurfaceInspection.outcome === "no_privacy_policy_observed_complete_coverage";
}

function v2ArtifactRoots() {
  return [
    path.resolve(process.cwd(), "artifacts/local-v2-dag-scans"),
    path.resolve(process.cwd(), "../..", "artifacts/local-v2-dag-scans")
  ];
}

function v2PolicyTextArtifactRoots() {
  return [
    ...v2ArtifactRoots(),
    path.resolve(process.cwd(), "artifacts/local-v2-dag-lambda-simulated"),
    path.resolve(process.cwd(), "../..", "artifacts/local-v2-dag-lambda-simulated")
  ];
}

function resolveLocalV2OutDir(outDir: string) {
  const resolved = path.resolve(outDir);
  const roots = v2ArtifactRoots();
  const inAllowedRoot = roots.some((root) => resolved === root || resolved.startsWith(`${root}${path.sep}`));
  if (!inAllowedRoot) {
    throw new Error("Local v2 DAG artifact path is outside artifacts/local-v2-dag-scans.");
  }
  return resolved;
}

function resolvePolicyTextArtifactPath(rawPath: string, localOutDir?: string | null) {
  const candidates = uniqueStrings([
    path.resolve(rawPath),
    localOutDir ? path.join(resolveLocalV2OutDir(localOutDir), path.basename(rawPath)) : null,
  ]);
  const roots = v2PolicyTextArtifactRoots();
  for (const resolved of candidates) {
    const inAllowedRoot = roots.some((root) => resolved === root || resolved.startsWith(`${root}${path.sep}`));
    if (!inAllowedRoot) {
      continue;
    }
    try {
      const stats = statSync(resolved);
      if (stats.isFile() && stats.size > 0 && stats.size <= 1_000_000 && path.extname(resolved).toLowerCase() === ".txt") {
        return resolved;
      }
    } catch {
      // Try the next verified local candidate.
    }
  }
  return null;
}

function policySurfaceTextArtifactReference(surface: LocalV2PolicySurface) {
  const artifactRefs = Array.isArray(surface.artifactRefs) ? surface.artifactRefs : [];
  for (const ref of artifactRefs) {
    if (!isRecord(ref)) {
      continue;
    }
    const looseRef = ref as Record<string, unknown>;
    const artifactId = firstString(looseRef.artifactId, looseRef.id);
    const label = firstString(looseRef.label, looseRef.kind, looseRef.type);
    const artifactPath = firstString(looseRef.path, looseRef.filePath);
    if (!artifactId || !artifactPath || !/policy_surface_text/i.test(`${artifactId} ${label ?? ""} ${path.basename(artifactPath)}`)) {
      continue;
    }
    return { artifactId, artifactPath, fileName: path.basename(artifactPath) };
  }
  return null;
}

function resolvePolicySurfaceTextEvidence(
  surface: LocalV2PolicySurface,
  context?: PolicyTextEvidenceContext,
): RetainedPolicyTextArtifactEvidence | null {
  const reference = policySurfaceTextArtifactReference(surface);
  if (!reference) {
    return null;
  }
  const retained = context?.artifactsById?.get(reference.artifactId);
  if (retained) {
    return retained;
  }
  const resolved = resolvePolicyTextArtifactPath(reference.artifactPath, context?.localOutDir);
  if (resolved) {
    try {
      const text = readFileSync(resolved, "utf8").replace(/\s+/g, " ").trim();
      return {
        artifactId: reference.artifactId,
        fileName: reference.fileName,
        text,
        sha256: createHash("sha256").update(text).digest("hex"),
        sizeBytes: Buffer.byteLength(text),
        verificationStatus: "local_unverified",
      };
    } catch {
      return {
        artifactId: reference.artifactId,
        fileName: reference.fileName,
        verificationStatus: "unavailable",
        failureReason: "policy_text_local_artifact_unreadable",
      };
    }
  }
  return {
    artifactId: reference.artifactId,
    fileName: reference.fileName,
    verificationStatus: context?.sourceBundle.verificationStatus === "verified"
      ? "missing_manifest_entry"
      : "unavailable",
    failureReason: context?.sourceBundle.verificationStatus === "verified"
      ? "policy_text_artifact_missing_from_verified_manifest"
      : "policy_text_artifact_unavailable",
  };
}

function readPolicySurfaceTextArtifact(surface: LocalV2PolicySurface, context?: PolicyTextEvidenceContext) {
  return resolvePolicySurfaceTextEvidence(surface, context)?.text ?? null;
}

function findCaseInsensitiveTextIndex(source: string, needle: string) {
  return source.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase());
}

function alignPolicyEvidenceTextToCompleteSentence(evidenceText: string) {
  const normalized = evidenceText.replace(/\s+/g, " ").trim();
  const sentenceStart = normalized.search(/[.!?]\s+(?=[A-Z0-9"“])/);
  if (
    sentenceStart >= 0 &&
    sentenceStart < 120 &&
    /^[a-z][a-z\s-]{0,80}$/i.test(normalized.slice(0, sentenceStart).replace(/[^a-z\s-]/gi, "")) &&
    normalized.slice(sentenceStart + 2).trim().length >= 48
  ) {
    return normalized.slice(sentenceStart + 2).trim();
  }
  return normalized;
}

function policySentenceBoundaries(text: string) {
  const boundaries = [0];
  const boundaryPattern = /[.!?]\s+(?=[A-Z0-9"“])/g;
  let match: RegExpExecArray | null;
  while ((match = boundaryPattern.exec(text)) !== null) {
    boundaries.push(match.index + match[0].length);
  }
  if (boundaries.at(-1) !== text.length) {
    boundaries.push(text.length);
  }
  return boundaries;
}

function buildPolicyEvidenceContextExcerpt(source: string, evidenceText: string) {
  const normalizedSource = source.replace(/\s+/g, " ").trim();
  const normalizedEvidence = alignPolicyEvidenceTextToCompleteSentence(evidenceText);
  if (!normalizedSource || normalizedEvidence.length < 24) {
    return null;
  }

  const exactIndex = findCaseInsensitiveTextIndex(normalizedSource, normalizedEvidence);
  const fallbackNeedles = normalizedEvidence
    .split(/(?<=[.!?;:])\s+|,\s+(?=(?:to|or|and|you|we|including|such as|however)\b)/i)
    .map((piece) => piece.replace(/^[.;:,]+|[.;:,]+$/g, "").trim())
    .filter((piece) => piece.length >= 48)
    .sort((left, right) => right.length - left.length);
  const fallbackMatch = exactIndex >= 0
    ? null
    : fallbackNeedles
        .map((needle) => ({ index: findCaseInsensitiveTextIndex(normalizedSource, needle), needle }))
        .find((candidate) => candidate.index >= 0);
  const matchStart = exactIndex >= 0 ? exactIndex : fallbackMatch?.index ?? -1;
  const matchEnd = matchStart >= 0
    ? matchStart + (exactIndex >= 0 ? normalizedEvidence.length : fallbackMatch?.needle.length ?? 0)
    : -1;
  if (matchStart < 0 || matchEnd <= matchStart) {
    return null;
  }

  const boundaries = policySentenceBoundaries(normalizedSource);
  let startBoundaryIndex = 0;
  for (let index = boundaries.length - 1; index >= 0; index -= 1) {
    if ((boundaries[index] ?? 0) <= matchStart) {
      startBoundaryIndex = index;
      break;
    }
  }
  const nextBoundaryIndex = boundaries.findIndex((boundary) => boundary >= matchEnd);
  const endBoundaryIndex = nextBoundaryIndex >= 0 ? nextBoundaryIndex : boundaries.length - 1;
  const start = boundaries[Math.max(0, startBoundaryIndex - 7)] ?? 0;
  const end = boundaries[Math.min(boundaries.length - 1, endBoundaryIndex + 8)] ?? normalizedSource.length;
  let excerpt = normalizedSource.slice(start, end).trim();
  const nextSectionIndex = excerpt.search(/\s(?:Cookies|Cookie Policy|Terms of Service|Children'?s Privacy Policy|California|US State Supplement|Contact Us)\s+(?:What are|Last updated|Overview|Your|How|If|This|We)\b/);
  if (nextSectionIndex > 120 && nextSectionIndex > matchEnd - start) {
    excerpt = excerpt.slice(0, nextSectionIndex).trim();
  }
  const maxContextChars = 5_000;
  if (excerpt.length > maxContextChars) {
    const localStart = Math.max(0, matchStart - start - 2_000);
    const localEnd = Math.min(excerpt.length, matchEnd - start + 2_000);
    excerpt = excerpt.slice(localStart, localEnd).trim();
  }
  return `${start > 0 ? "... " : ""}${excerpt}${end < normalizedSource.length ? " ..." : ""}`;
}

function normalizePolicyExcerptForDedupe(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function policyExcerptsOverlap(left: string | null | undefined, right: string | null | undefined) {
  const normalizedLeft = normalizePolicyExcerptForDedupe(left);
  const normalizedRight = normalizePolicyExcerptForDedupe(right);
  if (normalizedLeft.length < 24 || normalizedRight.length < 24) {
    return normalizedLeft.length > 0 && normalizedLeft === normalizedRight;
  }
  if (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)) {
    return true;
  }
  const leftTokens = policyExcerptContentTokens(normalizedLeft);
  const rightTokens = policyExcerptContentTokens(normalizedRight);
  if (leftTokens.length < 4 || rightTokens.length < 4) {
    return false;
  }
  const smaller = leftTokens.length <= rightTokens.length ? leftTokens : rightTokens;
  const larger = new Set(leftTokens.length <= rightTokens.length ? rightTokens : leftTokens);
  const shared = smaller.filter((token) => larger.has(token)).length;
  return shared / smaller.length >= 0.75;
}

function policyExcerptContentTokens(normalizedExcerpt: string) {
  const stopwords = new Set([
    "a",
    "an",
    "and",
    "of",
    "or",
    "the",
    "to",
    "we",
    "you",
    "your"
  ]);
  return uniqueStrings(normalizedExcerpt
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !stopwords.has(token)));
}

function article13EvidenceStrengthScore(value: string | null | undefined) {
  switch (value) {
    case "strong":
      return 30;
    case "moderate":
      return 20;
    case "limited":
      return 5;
    default:
      return 0;
  }
}

function article13StatusScore(value: string | null | undefined) {
  switch (value) {
    case "observed":
      return 100;
    case "partial":
      return 50;
    case "not_confirmed":
      return 10;
    default:
      return 0;
  }
}

function policyDisclosureRowScore(row: Record<string, unknown>) {
  const status = firstString(row.status, row.signalObserved);
  const strength = firstString(row.selectedEvidenceStrength);
  const confidence = typeof row.confidence === "number" && Number.isFinite(row.confidence)
    ? row.confidence
    : 0;
  const excerpt = firstString(row.selectedPolicySectionExcerpt, row.evidenceText) ?? "";
  return article13StatusScore(status) +
    article13EvidenceStrengthScore(strength) +
    confidence +
    Math.min(excerpt.length / 1_000, 5);
}

function dedupePolicyDisclosureRows<T extends Record<string, unknown>>(
  rows: T[],
  options: {
    excerptKeys: string[];
    typeKeys: string[];
  }
) {
  const retained: T[] = [];
  for (const row of rows) {
    const rowType = firstString(...options.typeKeys.map((key) => row[key]));
    const rowExcerpt = firstString(...options.excerptKeys.map((key) => row[key]));
    const duplicateIndex = retained.findIndex((candidate) => {
      const candidateType = firstString(...options.typeKeys.map((key) => candidate[key]));
      const candidateExcerpt = firstString(...options.excerptKeys.map((key) => candidate[key]));
      return rowType === candidateType && policyExcerptsOverlap(rowExcerpt, candidateExcerpt);
    });
    if (duplicateIndex < 0) {
      retained.push(row);
      continue;
    }
    const existing = retained[duplicateIndex];
    if (existing && policyDisclosureRowScore(row) > policyDisclosureRowScore(existing)) {
      retained[duplicateIndex] = row;
    }
  }
  return retained;
}

function extractSupervisoryAuthoritySupportingContactContext(value: string) {
  const text = value.replace(/\s+/g, " ").trim();
  if (
    !/\b(?:supervisory authority|data protection authorit(?:y|ies)|privacy regulator|regulatory authority|lodge a complaint|right to complain|right to contact)\b/i.test(text) ||
    !/\b(?:further details|more information|help|contact(?:ing)? us|privacy center|contact form|privacy team|data protection officer|dpo)\b/i.test(text)
  ) {
    return null;
  }
  const emailMatch = text.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
  if (emailMatch?.[0]) {
    return emailMatch[0];
  }
  const contactMatch = text.match(/\b(?:privacy center|privacy team|data protection officer|dpo|contact form|contacting us by email|contact us)\b.{0,180}/i);
  return contactMatch?.[0] ? contactMatch[0].trim() : null;
}

async function readLocalV2DagBundle(outDir: string): Promise<CanonicalEvidenceBundle | null> {
  try {
    const raw = await readFile(path.join(resolveLocalV2OutDir(outDir), "CanonicalEvidenceBundle.json"), "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (
      !isRecord(parsed) ||
      (parsed.schemaVersion !== "certscore.v2.canonical-evidence-bundle.v1" &&
        parsed.schemaVersion !== "certscore.v2.alpha.1")
    ) {
      return null;
    }
    return parsed as CanonicalEvidenceBundle;
  } catch {
    return null;
  }
}

async function readLocalV2DagManifest(outDir: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await readFile(path.join(resolveLocalV2OutDir(outDir), "LocalV2DagLambdaManifest.json"), "utf8");
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function readLocalV2ConsentControlGeometry(outDir: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await readFile(path.join(resolveLocalV2OutDir(outDir), "ConsentControlGeometryEvidence.json"), "utf8");
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function parseS3Uri(uri: string) {
  if (!uri.startsWith("s3://")) {
    throw new Error("Local v2 DAG Lambda scan artifact URI must be s3://.");
  }
  const withoutScheme = uri.slice("s3://".length);
  const slashIndex = withoutScheme.indexOf("/");
  if (slashIndex <= 0 || slashIndex === withoutScheme.length - 1) {
    throw new Error("Local v2 DAG Lambda scan artifact URI is missing bucket or key.");
  }
  return {
    bucket: withoutScheme.slice(0, slashIndex),
    key: withoutScheme.slice(slashIndex + 1)
  };
}

function localV2ScreenshotStoragePointer(input: {
  scanArtifactUri?: string | null;
  scanId: string;
  screenshotPath: string;
}): { bucket: string | null; key: string } {
  const screenshotPath = input.screenshotPath.trim();
  if (screenshotPath.startsWith("s3://")) {
    const { bucket, key } = parseS3Uri(screenshotPath);
    return { bucket, key };
  }

  const normalizedPath = screenshotPath.replace(/\\/g, "/").replace(/^\/+/, "");
  const localV2Index = normalizedPath.indexOf("local-v2-dag-scans/");
  if (localV2Index >= 0) {
    return { bucket: null, key: normalizedPath.slice(localV2Index) };
  }

  if (input.scanArtifactUri) {
    try {
      const { bucket, key } = parseS3Uri(input.scanArtifactUri);
      const fileName = path.posix.basename(normalizedPath);
      if (fileName && fileName !== "." && fileName !== "/") {
        return {
          bucket,
          key: `${path.posix.dirname(key)}/auxiliary/${fileName}`
        };
      }
    } catch {
      // Fall through to the legacy local artifact key below.
    }
  }

  const fileName = path.posix.basename(normalizedPath) || "screenshot-pre-consent.png";
  return {
    bucket: null,
    key: `local-v2-dag-scans/${input.scanId}/${fileName}`
  };
}

export function inferS3ArtifactRegion(bucket: string) {
  const match = bucket.match(/(?:^|-)(eu-central-1|eu-west-1|us-west-2)(?:-|$)/);
  const region = match?.[1] ?? null;
  return isLocalV2DagLambdaAwsRegion(region) ? region : LOCAL_V2_DAG_LAMBDA_AWS_REGION;
}

async function streamToBuffer(body: GetObjectCommandOutput["Body"]) {
  if (!body) {
    throw new Error("Local v2 DAG Lambda scan artifact did not include a body.");
  }
  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }
  if (body instanceof Readable) {
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  if (typeof body === "object" && "transformToByteArray" in body && typeof body.transformToByteArray === "function") {
    return Buffer.from(await body.transformToByteArray());
  }
  throw new Error("Unsupported local v2 DAG Lambda scan artifact response body.");
}

export function verifyLocalV2DagLambdaArtifactBody(input: {
  body: Buffer;
  expectedSha256?: string | null;
  expectedSizeBytes?: number | null;
}) {
  if (input.expectedSizeBytes !== null && input.expectedSizeBytes !== undefined && input.body.byteLength !== input.expectedSizeBytes) {
    throw new Error("Local v2 DAG Lambda S3 artifact size mismatch.");
  }
  if (
    input.expectedSha256 &&
    createHash("sha256").update(input.body).digest("hex") !== input.expectedSha256
  ) {
    throw new Error("Local v2 DAG Lambda S3 artifact checksum mismatch.");
  }
  return input.body;
}

async function readLocalV2DagJsonArtifactFromS3(input: {
  expectedSha256?: string | null;
  expectedSizeBytes?: number | null;
  uri: string;
}) {
  const { bucket, key } = parseS3Uri(input.uri);
  const response = await getLocalV2DagS3Client(inferS3ArtifactRegion(bucket)).send(
    new GetObjectCommand({ Bucket: bucket, Key: key })
  );
  const body = verifyLocalV2DagLambdaArtifactBody({
    body: await streamToBuffer(response.Body),
    expectedSha256: input.expectedSha256,
    expectedSizeBytes: input.expectedSizeBytes
  });
  return JSON.parse(body.toString("utf8")) as unknown;
}

const localV2DagS3Clients = new Map<string, S3Client>();

function getLocalV2DagS3Client(region: string) {
  const cached = localV2DagS3Clients.get(region);
  if (cached) {
    return cached;
  }
  const client = new S3Client({ region });
  localV2DagS3Clients.set(region, client);
  return client;
}

async function readLocalV2DagBundleFromS3(input: {
  expectedSha256?: string | null;
  expectedSizeBytes?: number | null;
  uri: string;
}): Promise<CanonicalEvidenceBundle | null> {
  try {
    const parsed = await readLocalV2DagJsonArtifactFromS3(input);
    if (
      !isRecord(parsed) ||
      (parsed.schemaVersion !== "certscore.v2.canonical-evidence-bundle.v1" &&
        parsed.schemaVersion !== "certscore.v2.alpha.1")
    ) {
      return null;
    }
    return parsed as CanonicalEvidenceBundle;
  } catch {
    return null;
  }
}

async function readLocalV2DagManifestFromS3(input: {
  expectedSha256?: string | null;
  expectedSizeBytes?: number | null;
  uri: string;
}): Promise<Record<string, unknown> | null> {
  try {
    const parsed = await readLocalV2DagJsonArtifactFromS3(input);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function getLocalV2DagAuxiliaryArtifact(
  manifest: Record<string, unknown> | null,
  fileName: string
): LocalV2DagLambdaArtifactPointer | null {
  const artifacts = Array.isArray(manifest?.auxiliaryArtifacts) ? manifest.auxiliaryArtifacts : [];
  for (const value of artifacts) {
    const artifact = isRecord(value) ? value : null;
    const uri = getString(artifact?.uri);
    if (artifact?.fileName !== fileName || !uri) {
      continue;
    }
    const sizeBytes = artifact.sizeBytes;
    const sha256 = getString(artifact.sha256);
    const normalizedSizeBytes = typeof sizeBytes === "number" && Number.isSafeInteger(sizeBytes) && sizeBytes >= 0
      ? sizeBytes
      : null;
    if (!sha256 || normalizedSizeBytes === null) {
      return null;
    }
    return {
      sha256,
      sizeBytes: normalizedSizeBytes,
      uri,
      verificationRequired: true
    };
  }
  return null;
}

async function readLocalV2DagPolicyTextArtifactFromS3(
  pointer: LocalV2DagLambdaArtifactPointer,
): Promise<{ text: string; sha256: string; sizeBytes: number }> {
  if (pointer.sizeBytes === null || pointer.sizeBytes <= 0 || pointer.sizeBytes > 1_000_000 || !pointer.sha256) {
    throw new Error("Policy text artifact metadata is missing or outside the retained size bound.");
  }
  const { bucket, key } = parseS3Uri(pointer.uri);
  const response = await getLocalV2DagS3Client(inferS3ArtifactRegion(bucket)).send(
    new GetObjectCommand({ Bucket: bucket, Key: key })
  );
  const body = verifyLocalV2DagLambdaArtifactBody({
    body: await streamToBuffer(response.Body),
    expectedSha256: pointer.sha256,
    expectedSizeBytes: pointer.sizeBytes,
  });
  if (body.includes(0)) {
    throw new Error("Policy text artifact is not valid bounded UTF-8 text.");
  }
  return {
    text: body.toString("utf8").replace(/\s+/g, " ").trim(),
    sha256: pointer.sha256,
    sizeBytes: body.byteLength,
  };
}

async function loadVerifiedPolicyTextArtifacts(input: {
  bundle: CanonicalEvidenceBundle;
  manifest: Record<string, unknown> | null;
}) {
  const references = [...new Map(input.bundle.policySurfaceObservations.flatMap((surface) => {
    const reference = policySurfaceTextArtifactReference(surface);
    return reference ? [[reference.artifactId, reference] as const] : [];
  })).values()].slice(0, 16);
  const entries = await Promise.all(references.map(async (reference) => {
    const pointer = getLocalV2DagAuxiliaryArtifact(input.manifest, reference.fileName);
    if (!pointer) {
      return [reference.artifactId, {
        artifactId: reference.artifactId,
        fileName: reference.fileName,
        verificationStatus: "missing_manifest_entry",
        failureReason: "policy_text_artifact_missing_from_verified_manifest",
      } satisfies RetainedPolicyTextArtifactEvidence] as const;
    }
    try {
      const retained = await readLocalV2DagPolicyTextArtifactFromS3(pointer);
      return [reference.artifactId, {
        artifactId: reference.artifactId,
        fileName: reference.fileName,
        text: retained.text,
        sha256: retained.sha256,
        sizeBytes: retained.sizeBytes,
        uri: pointer.uri,
        verificationStatus: "verified",
      } satisfies RetainedPolicyTextArtifactEvidence] as const;
    } catch {
      return [reference.artifactId, {
        artifactId: reference.artifactId,
        fileName: reference.fileName,
        sha256: pointer.sha256 ?? undefined,
        sizeBytes: pointer.sizeBytes ?? undefined,
        uri: pointer.uri,
        verificationStatus: "verification_failed",
        failureReason: "policy_text_artifact_verification_failed",
      } satisfies RetainedPolicyTextArtifactEvidence] as const;
    }
  }));
  return new Map<string, RetainedPolicyTextArtifactEvidence>(entries);
}

const LOCAL_V2_VISUAL_EVIDENCE_FILE_NAMES = {
  "local_v2:screenshot_pre_consent": "screenshot-pre-consent.png",
  "local_v2:screenshot_pre_consent_settled": "screenshot-pre-consent-settled.png",
  "local_v2:screenshot_pre_consent_full_page": "screenshot-pre-consent-full-page.jpg",
  "local_v2:screenshot_pre_consent_geometry_proof": "screenshot-pre-consent-geometry-proof.png"
} as const;

const LOCAL_V2_VISUAL_EVIDENCE_ALTERNATE_FILE_NAMES: Partial<Record<
  keyof typeof LOCAL_V2_VISUAL_EVIDENCE_FILE_NAMES,
  readonly string[]
>> = {
  "local_v2:screenshot_pre_consent_full_page": [
    "screenshot-pre-consent-full-page.jpg",
    "screenshot-pre-consent-full-page.png",
  ],
};

function localV2VisualEvidenceFileNames(id: keyof typeof LOCAL_V2_VISUAL_EVIDENCE_FILE_NAMES) {
  return LOCAL_V2_VISUAL_EVIDENCE_ALTERNATE_FILE_NAMES[id] ?? [LOCAL_V2_VISUAL_EVIDENCE_FILE_NAMES[id]];
}

function localV2VisualEvidenceMimeType(fileName: string): "image/png" | "image/jpeg" {
  return fileName.toLowerCase().endsWith(".jpg") || fileName.toLowerCase().endsWith(".jpeg")
    ? "image/jpeg"
    : "image/png";
}

export type LocalV2DagVisualEvidencePointer = {
  bucket: string | null;
  id: keyof typeof LOCAL_V2_VISUAL_EVIDENCE_FILE_NAMES;
  key: string;
  mimeType: "image/png" | "image/jpeg";
  status: "available";
};

export async function resolveLocalV2DagVisualEvidencePointer(
  scanRecord: ScanDetailResponse,
  artifactId: string
): Promise<LocalV2DagVisualEvidencePointer | null> {
  const input = getLocalV2DagReportInput(scanRecord);
  if (
    !input ||
    scanRecord.scan.status !== "completed" ||
    !Object.prototype.hasOwnProperty.call(LOCAL_V2_VISUAL_EVIDENCE_FILE_NAMES, artifactId)
  ) {
    return null;
  }

  const id = artifactId as keyof typeof LOCAL_V2_VISUAL_EVIDENCE_FILE_NAMES;
  const fileNames = localV2VisualEvidenceFileNames(id);
  const shouldReadLocalOutDir = Boolean(input.outDir && shouldUseLocalV2DagScanTool());
  if (shouldReadLocalOutDir && input.outDir) {
    for (const fileName of fileNames) {
      try {
        const localPath = path.join(resolveLocalV2OutDir(input.outDir), fileName);
        if (statSync(localPath).isFile()) {
          return {
            bucket: null,
            id,
            key: `local-v2-dag-scans/${scanRecord.scan.id}/${fileName}`,
            mimeType: localV2VisualEvidenceMimeType(fileName),
            status: "available"
          };
        }
      } catch {
        // Fall through to the verified manifest pointer when the local mirror is unavailable.
      }
    }
  }

  const localManifest = shouldReadLocalOutDir && input.outDir
    ? await readLocalV2DagManifest(input.outDir)
    : null;
  const manifest = localManifest ?? (input.manifestArtifactUri
    ? await readLocalV2DagManifestFromS3({
        expectedSha256: input.manifestArtifactSha256,
        expectedSizeBytes: input.manifestArtifactSizeBytes,
        uri: input.manifestArtifactUri
      })
    : null);
  const screenshotArtifact = fileNames
    .map((fileName) => getLocalV2DagAuxiliaryArtifact(manifest, fileName))
    .find((artifact): artifact is LocalV2DagLambdaArtifactPointer => Boolean(artifact));
  if (!screenshotArtifact) {
    return null;
  }

  try {
    const { bucket, key } = parseS3Uri(screenshotArtifact.uri);
    return {
      bucket,
      id,
      key,
      mimeType: localV2VisualEvidenceMimeType(screenshotArtifact.uri),
      status: "available"
    };
  } catch {
    return null;
  }
}

async function readLocalV2ConsentControlGeometryFromS3(
  artifact: LocalV2DagLambdaArtifactPointer
): Promise<Record<string, unknown> | null> {
  try {
    const parsed = await readLocalV2DagJsonArtifactFromS3({
      expectedSha256: artifact.sha256,
      expectedSizeBytes: artifact.sizeBytes,
      uri: artifact.uri
    });
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function buildVendorResolverInputs(bundle: CanonicalEvidenceBundle): VendorResolverInput[] {
  return [
    ...(bundle.networkEvents ?? []).map((event) => ({
      consentStateAtTime: event.consentStateAtTime,
      evidenceId: event.eventId,
      evidenceRef: {
        refId: `ref_${event.eventId}`,
        eventId: event.eventId,
        eventType: event.eventType,
        url: requestUrl(event as Record<string, unknown>) ?? undefined
      },
      hostname: event.hostname ?? hostnameFromUrl(requestUrl(event as Record<string, unknown>)) ?? undefined,
      matchSource: "network_request" as const,
      scenario: event.scenario,
      sourceEventType: event.eventType,
      sourceScanner: event.sourceScanner,
      type: "request" as const,
      url: requestUrl(event as Record<string, unknown>) ?? undefined
    })),
    ...(bundle.scriptEvents ?? []).map((event) => ({
      consentStateAtTime: event.consentStateAtTime,
      evidenceId: event.eventId,
      evidenceRef: {
        refId: `ref_${event.eventId}`,
        eventId: event.eventId,
        eventType: event.eventType,
        url: firstString(event.scriptUrl, event.url) ?? undefined
      },
      hostname: event.hostname ?? hostnameFromUrl(firstString(event.scriptUrl, event.url)) ?? undefined,
      matchSource: "script_url" as const,
      scenario: event.scenario,
      sourceEventType: event.eventType,
      sourceScanner: event.sourceScanner,
      type: "script" as const,
      url: firstString(event.scriptUrl, event.url) ?? undefined
    })),
    ...(bundle.iframeEvents ?? []).map((event) => ({
      consentStateAtTime: event.consentStateAtTime,
      evidenceId: event.eventId,
      evidenceRef: {
        refId: `ref_${event.eventId}`,
        eventId: event.eventId,
        eventType: event.eventType,
        url: firstString(event.frameUrl, event.url) ?? undefined
      },
      hostname: event.hostname ?? hostnameFromUrl(firstString(event.frameUrl, event.url)) ?? undefined,
      matchSource: "iframe_url" as const,
      scenario: event.scenario,
      sourceEventType: event.eventType,
      sourceScanner: event.sourceScanner,
      type: "iframe" as const,
      url: firstString(event.frameUrl, event.url) ?? undefined
    })),
    ...(bundle.cookieEvents ?? []).map((event) => ({
      consentStateAtTime: event.consentStateAtTime,
      cookieName: event.cookieName,
      evidenceId: event.eventId,
      evidenceRef: {
        refId: `ref_${event.eventId}`,
        eventId: event.eventId,
        eventType: event.eventType,
        url: event.url
      },
      hostname: event.cookieDomain ?? event.hostname,
      matchSource: "cookie_name" as const,
      scenario: event.scenario,
      sourceEventType: event.eventType,
      sourceScanner: event.sourceScanner,
      type: "cookie" as const,
      url: event.url
    }))
  ];
}

export function hasConcreteCanonicalVendorAnchor(vendor: NormalizedVendorObservation) {
    const matchedUrls = uniqueStrings([
      ...(vendor.matchedUrls ?? []),
      ...(vendor.matchedEvidenceRefs ?? []).map((ref) => ref.url)
    ]);
    const matchedHostnames = uniqueStrings([
      ...(vendor.matchedHostnames ?? []),
      ...matchedUrls.map(hostnameFromUrl)
    ]);
    const resolverInputs: VendorResolverInput[] = [
      ...matchedUrls.map((url) => ({
        type: "request" as const,
        url,
        hostname: hostnameFromUrl(url) ?? undefined,
        matchSource: "network_request" as const
      })),
      ...(vendor.matchedCookieNames ?? []).flatMap((cookieName) =>
        (matchedHostnames.length > 0 ? matchedHostnames : [undefined]).map((hostname) => ({
          type: "cookie" as const,
          cookieName,
          hostname,
          matchSource: "cookie_name" as const
        }))
      )
    ];
    const concreteMatches = resolveVendorObservations(resolverInputs);
    if (concreteMatches.some((match) => match.entity === vendor.entity)) {
      return true;
    }
    const nonLabelRuntimeBasis = (vendor.basis ?? []).some((basis) =>
      /(?:global|storage_key|dom_selector)_match/i.test(basis)
    );
    return nonLabelRuntimeBasis && (vendor.matchedEvidenceIds?.length ?? 0) > 0;
}

function buildVendorEvidence(bundle: CanonicalEvidenceBundle) {
  const retainedNormalizedVendors = (bundle.normalizedVendorObservations ?? [])
    .filter(hasConcreteCanonicalVendorAnchor);
  const vendors = [
    ...retainedNormalizedVendors,
    ...resolveVendorObservations(buildVendorResolverInputs(bundle))
  ];
  return vendors.map((vendor) => {
    const vendorName = firstString(vendor.product, vendor.vendor, vendor.entity) ?? "Unknown vendor";
    const category = purposeToCategory(firstString(vendor.purpose));
    const displayCategory = resolveVendorDisplayCategory({
      product: vendor.product,
      purpose: vendor.purpose,
      regulatoryRelevance: vendor.regulatoryRelevance,
      vendor: vendor.vendor
    });
    const matchedHostnames = uniqueStrings([
      ...(vendor.matchedHostnames ?? []),
      ...(vendor.matchedEvidenceRefs ?? []).map((ref) => hostnameFromUrl(ref.url ?? ref.label) ?? ref.label)
    ].map((value) => {
      if (!value || /^https?:\/\//i.test(value)) {
        return hostnameFromUrl(value);
      }
      return value.toLowerCase();
    }));
    const evidenceHost = matchedHostnames[0] ?? null;
    const relatedJourneyFirstSeenMs = minimumNumber(
      ...(bundle.observedJourneys ?? [])
        .filter((journey) =>
          journey.relatedVendorObservationIds?.includes(vendor.observationId) ||
          journey.relatedVendors?.some((value) => value === vendor.vendor || value === vendor.product || value === vendorName) ||
          journey.vendor === vendor.vendor ||
          journey.displayName === vendor.product ||
          journey.displayName === vendorName
        )
        .map((journey) => journey.firstObservedAtMs)
    );
    const matchedEventIds = new Set([
      ...(vendor.matchedEvidenceIds ?? []),
      ...(vendor.matchedEvidenceRefs ?? []).map((ref) => ref.eventId)
    ].filter((value): value is string => typeof value === "string" && value.length > 0));
    const relatedEventFirstSeenMs = minimumNumber(
      ...[
        ...(bundle.networkEvents ?? []),
        ...(bundle.scriptEvents ?? []),
        ...(bundle.iframeEvents ?? [])
      ]
        .filter((event) => matchedEventIds.has(event.eventId))
        .map((event) => event.timestampMs)
    );
    const observedVia = uniqueStrings((vendor.matchSources ?? []).map((source) => {
      const matchSource = firstString(source.source, source.sourceEventType)?.toLowerCase();
      if (!matchSource) {
        return null;
      }
      if (/cookie/.test(matchSource)) {
        return "cookie";
      }
      if (/script/.test(matchSource)) {
        return "script";
      }
      if (/iframe|frame/.test(matchSource)) {
        return "iframe";
      }
      if (/storage/.test(matchSource)) {
        return "storage";
      }
      if (/request|response|url|host/.test(matchSource)) {
        return "request";
      }
      if (/cmp|dom|global/.test(matchSource)) {
        return "runtime probe";
      }
      return matchSource.replace(/_/g, " ");
    }));
    return {
      beforeConsent: true,
      collectionEndpointType: "direct_third_party",
      confidence: typeof vendor.confidence === "number" ? vendor.confidence : 0.85,
      detectionSource: "local_v2_dag_runtime",
      firstSeenMs: minimumNumber(relatedJourneyFirstSeenMs, relatedEventFirstSeenMs),
      firstPartyOrThirdParty: "third_party",
      matchedSignatureId: vendor.observationId ?? null,
      matchedEventIds,
      matchedHostnames,
      matchedCookieNames: vendor.matchedCookieNames ?? [],
      matchedUrls: vendor.matchedUrls ?? [],
      attributionSignatures: vendor.basis ?? [],
      observedVia,
      regulatoryRelevance: vendor.regulatoryRelevance ?? [],
      scriptHost: evidenceHost,
      vendorDisplayCategory: displayCategory,
      vendorCategory: category,
      vendorName
    };
  });
}

function vendorRowsForCategories(
  vendors: ReturnType<typeof buildVendorEvidence>,
  categories: string[]
) {
  const categorySet = new Set(categories);
  return vendors.filter((vendor) => categorySet.has(vendor.vendorCategory));
}

function uniqueVendorRows(vendors: ReturnType<typeof buildVendorEvidence>) {
  const selected = new Map<string, ReturnType<typeof buildVendorEvidence>[number]>();
  for (const vendor of vendors) {
    selected.set(`${vendor.vendorName}:${vendor.scriptHost ?? ""}:${vendor.vendorCategory}`, vendor);
  }
  return [...selected.values()];
}

function vendorRowsForBehavioralAdvertising(vendors: ReturnType<typeof buildVendorEvidence>) {
  return vendors.filter((vendor) => {
    const relevance = vendor.regulatoryRelevance.join(" ").toLowerCase();
    const label = `${vendor.vendorCategory} ${vendor.vendorName} ${vendor.scriptHost ?? ""}`.toLowerCase();
    return vendor.vendorCategory === "retargeting" ||
      /cross_site_tracking|identity_resolution|audience_management|audience_segmentation|audience_matching|profile_activation/.test(relevance) ||
      /\b(retarget|remarket|audience|identity sync|idsync|pixel|meta pixel|facebook pixel|linkedin insight|tiktok pixel|pinterest tag)\b/.test(label);
  });
}

function vendorRowsForAdvertisingInfrastructure(vendors: ReturnType<typeof buildVendorEvidence>) {
  return vendors.filter((vendor) => {
    const relevance = vendor.regulatoryRelevance.join(" ").toLowerCase();
    return vendor.vendorCategory === "advertising" ||
      /advertising|ad_measurement|ad_verification|brand_safety|programmatic_ads|content_recommendation|video_ad_measurement|audience_measurement|attribution|tv_attribution/.test(relevance);
  });
}

function sanitizeIframeEvents(bundle: CanonicalEvidenceBundle, rootDomain: string | null) {
  return (bundle.iframeEvents ?? []).slice(0, 75).map((event) => {
    const frameUrl = firstString(event.frameUrl);
    const hostname = hostnameFromUrl(frameUrl);
    return {
      consentStateAtTime: event.consentStateAtTime,
      frameName: firstString(event.frameName),
      frameUrl,
      hostname,
      preConsent: event.consentStateAtTime === "pre_consent",
      thirdParty: hostname ? !sameSite(hostname, rootDomain) : false,
      timestampMs: event.timestampMs
    };
  });
}

const EMBEDDED_CONTENT_HOST_PATTERNS = [
  /(^|\.)youtube(?:-nocookie)?\.com$/i,
  /(^|\.)youtu\.be$/i,
  /(^|\.)vimeo\.com$/i,
  /(^|\.)google\.[a-z.]+$/i,
  /(^|\.)googleapis\.com$/i,
  /(^|\.)openstreetmap\.org$/i,
  /(^|\.)spotify\.com$/i,
  /(^|\.)soundcloud\.com$/i,
  /(^|\.)twitter\.com$/i,
  /(^|\.)x\.com$/i,
  /(^|\.)platform\.twitter\.com$/i,
  /(^|\.)static\.ads-twitter\.com$/i,
  /(^|\.)analytics\.twitter\.com$/i,
  /(^|\.)t\.co$/i,
  /(^|\.)instagram\.com$/i,
  /(^|\.)cdninstagram\.com$/i,
  /(^|\.)facebook\.com$/i,
  /(^|\.)connect\.facebook\.net$/i,
  /(^|\.)tiktok\.com$/i,
  /(^|\.)analytics\.tiktok\.com$/i,
  /(^|\.)tiktokw\.us$/i,
  /(^|\.)linkedin\.com$/i,
  /(^|\.)px\.ads\.linkedin\.com$/i,
  /(^|\.)dc\.ads\.linkedin\.com$/i,
  /(^|\.)pinterest\.com$/i,
  /(^|\.)assets\.pinterest\.com$/i,
  /(^|\.)ct\.pinterest\.com$/i,
  /(^|\.)reddit\.com$/i,
  /(^|\.)redditstatic\.com$/i,
  /(^|\.)pixel-config\.reddit\.com$/i,
  /(^|\.)alb\.reddit\.com$/i,
  /(^|\.)disqus\.com$/i,
  /(^|\.)ssp\.disqus\.com$/i,
  /(^|\.)pixel\.byspotify\.com$/i,
  /(^|\.)typeform\.com$/i,
  /(^|\.)calendly\.com$/i,
  /(^|\.)hubspot(?:usercontent)?\.com$/i
];

const EMBEDDED_CONTENT_PATH_PATTERN = /\/embed\/|\/plugins\/|\/maps\/embed|\/widgets?\//i;
const SESSION_REPLAY_URL_PATTERN =
  /clarity\.ms|hotjar\.com|hotjar\.io|fullstory\.com|logrocket\.com|mouseflow\.com|contentsquare\.(?:com|net)|smartlook\.com|inspectlet\.com|luckyorange\.com|quantummetric\.com|sessioncam\.com/i;
const SESSION_REPLAY_VENDOR_PATTERN =
  /microsoft clarity|clarity|hotjar|fullstory|logrocket|mouseflow|contentsquare|smartlook|inspectlet|lucky orange|quantum metric|sessioncam/i;

function classifyEmbeddedContentPurpose(hostname: string | null | undefined, url?: string | null) {
  const text = `${hostname ?? ""} ${url ?? ""}`.toLowerCase();
  if (/imasdk\.googleapis\.com|ima3\.js|googletagservices\.com|gampad|doubleclick\.net|googleads\.g\.doubleclick\.net|brightline\.tv|freewheel|ad[-.]tech|video.*ad|ad.*video/.test(text)) {
    return "videoAdSdk";
  }
  if (/fonts\.googleapis\.com|fonts\.gstatic\.com|typekit\.net|use\.typekit\.net|ajax\.googleapis\.com|unpkg\.com|cdn\.jsdelivr\.net/.test(text)) {
    return "fontStaticResource";
  }
  if (/youtube(?:-nocookie)?\.com|youtu\.be|vimeo\.com|spotify\.com|soundcloud\.com/.test(text)) {
    return "mediaEmbed";
  }
  if (/maps\/embed|google\.[a-z.]+\/maps|openstreetmap\.org/.test(text)) {
    return "mapEmbed";
  }
  if (/facebook\.com|connect\.facebook\.net|instagram\.com|cdninstagram\.com|tiktok\.com|analytics\.tiktok\.com|tiktokw\.us|linkedin\.com|px\.ads\.linkedin\.com|dc\.ads\.linkedin\.com|twitter\.com|x\.com|platform\.twitter\.com|static\.ads-twitter\.com|analytics\.twitter\.com|t\.co|pinterest\.com|assets\.pinterest\.com|ct\.pinterest\.com|reddit\.com|redditstatic\.com|pixel-config\.reddit\.com|alb\.reddit\.com|disqus\.com|ssp\.disqus\.com/.test(text)) {
    return "socialEmbed";
  }
  if (/typeform\.com|calendly\.com|hubspot(?:usercontent)?\.com|chat|widget/.test(text)) {
    return "formOrChatWidget";
  }
  return "otherEmbeddedContent";
}

function buildEmbeddedContentPurposeBuckets(observations: Array<{ hostname: string | null; frameUrl?: string | null; requestUrl?: string | null }>) {
  const buckets: Record<string, string[]> = {
    fontStaticResource: [],
    formOrChatWidget: [],
    mapEmbed: [],
    mediaEmbed: [],
    otherEmbeddedContent: [],
    socialEmbed: [],
    videoAdSdk: []
  };
  const addBucketHost = (bucket: string, host: string) => {
    if (bucket === "otherEmbeddedContent") {
      const alreadyClassified = Object.entries(buckets).some(([existingBucket, existingHosts]) =>
        existingBucket !== "otherEmbeddedContent" && existingHosts.includes(host)
      );
      if (alreadyClassified) {
        return;
      }
    } else {
      buckets.otherEmbeddedContent = (buckets.otherEmbeddedContent ?? []).filter((existingHost) => existingHost !== host);
    }
    buckets[bucket] = uniqueStrings([...(buckets[bucket] ?? []), host]);
  };
  for (const observation of observations) {
    const host = observation.hostname;
    if (!host) {
      continue;
    }
    const bucket = classifyEmbeddedContentPurpose(host, observation.frameUrl ?? observation.requestUrl ?? null);
    addBucketHost(bucket, host);
  }
  return buckets;
}

function isKnownEmbeddedContentUrl(url: string | null | undefined, hostnameFallback?: string | null) {
  const hostname = hostnameFromUrl(url) ?? hostnameFallback ?? null;
  if (!hostname || !EMBEDDED_CONTENT_HOST_PATTERNS.some((pattern) => pattern.test(hostname))) {
    return false;
  }
  return EMBEDDED_CONTENT_PATH_PATTERN.test(url ?? "") || !/(^|\.)google\.[a-z.]+$/i.test(hostname);
}

function summarizeEmbeddedContentEvidence(
  preconsentIframeEvents: ReturnType<typeof sanitizeIframeEvents>,
  preconsentRequests: CanonicalEvidenceBundle["networkEvents"],
) {
  const iframeObservations = preconsentIframeEvents
    .filter((event) => event.thirdParty && isKnownEmbeddedContentUrl(event.frameUrl, event.hostname))
    .map((event) => ({
      evidenceType: "iframe",
      frameUrl: event.frameUrl,
      hostname: event.hostname,
      initiatorType: "iframe",
      resourceType: "iframe",
      timestampMs: event.timestampMs
    }));
  const networkObservations = (preconsentRequests ?? [])
    .filter((event) => event.thirdParty === true || event.isThirdParty === true)
    .filter((event) => isKnownEmbeddedContentUrl(requestUrl(event), event.hostname ?? null))
    .filter((event) => {
      const url = requestUrl(event);
      const host = event.hostname ?? hostnameFromUrl(url);
      if (!/(?:^|\.)youtube(?:-nocookie)?\.com$/i.test(host ?? "")) return true;
      return /\/embed(?:\/|\?|$)/i.test(url ?? "") || /^(?:iframe|media|subdocument|video)$/i.test(event.resourceType ?? event.initiatorType ?? "");
    })
    .map((event) => ({
      evidenceType: "network_request",
      hostname: event.hostname ?? hostnameFromUrl(requestUrl(event)),
      initiatorType: event.initiatorType ?? event.resourceType,
      pageUrlSharedViaReferrer: typeof event.requestHeaders?.referer === "string" &&
        Boolean(hostnameFromUrl(event.topLevelUrl) && event.requestHeaders.referer.includes(hostnameFromUrl(event.topLevelUrl) ?? "")),
      referrerSent: Boolean(event.requestHeaders?.referer),
      requestUrl: requestUrl(event),
      resourceType: event.resourceType,
      timestampMs: event.timestampMs
    }));
  const observations = [...iframeObservations, ...networkObservations].slice(0, 25);
  const embeddedContentPurposeBuckets = buildEmbeddedContentPurposeBuckets(observations);

  return {
    coverageRetained: true,
    embeddedContentHosts: uniqueStrings(observations.map((event) => event.hostname)),
    embeddedContentObservationCount: observations.length,
    embeddedContentObserved: observations.length > 0,
    embeddedContentPurposeBuckets,
    embedded_content_purpose_buckets: embeddedContentPurposeBuckets,
    iframeObservationCount: iframeObservations.length,
    networkObservationCount: networkObservations.length,
    observations
  };
}

function browserApiAccessRows(bundle: CanonicalEvidenceBundle) {
  return (bundle.runtimeTimeline ?? [])
    .filter((event) => event.eventType === "browser_api_access")
    .map((event) => {
      const ref = event.evidenceRefs?.[0];
      const apiName = firstString(ref?.label)?.replace(/^Browser API access:\s*/i, "") ?? "browser_api_access";
      const category = firstString(ref?.excerpt) ?? "browser_api";
      return {
        apiName,
        category,
        consentStateAtTime: event.consentStateAtTime,
        fingerprintAttributeCategories: [category],
        highEntropySignals: [apiName],
        host: event.hostname ?? hostnameFromUrl(event.url),
        preConsent: event.consentStateAtTime === "pre_consent",
        timestampMs: event.timestampMs
      };
    });
}

function browserApiProbeInstalled(bundle: CanonicalEvidenceBundle) {
  return (bundle.modulesRun ?? []).some((moduleRun) =>
    (moduleRun.timingBreakdown ?? []).some((timing) =>
      timing.label === "browser api probe install"
    )
  );
}

function summarizeFingerprintingEvidence(bundle: CanonicalEvidenceBundle) {
  const rows = browserApiAccessRows(bundle);
  const apiProbeRetained = browserApiProbeInstalled(bundle) || rows.length > 0;
  // Browser API access is inventory. Promotion requires a separate typed
  // transmission, identifier-linkage, known-library, or device-payload signal.
  const strongCorroboratorObserved = false;
  return {
    apiProbeRetained,
    artifactCount: rows.length,
    coverageRetained: apiProbeRetained,
    fingerprintAttributeCategories: uniqueStrings(rows.flatMap((row) => row.fingerprintAttributeCategories)),
    fingerprintingObserved: strongCorroboratorObserved,
    highEntropySignals: uniqueStrings(rows.flatMap((row) => row.highEntropySignals)).slice(0, 12),
    hosts: uniqueStrings(rows.map((row) => row.host)),
    preConsentObserved: strongCorroboratorObserved && rows.some((row) => row.preConsent),
    strongCorroboratorObserved
  };
}

function isSessionReplayRequestRow(row: Record<string, unknown>) {
  const vendor = firstString(row.vendorName, row.vendor);
  const url = requestUrl(row);
  const category = firstString(row.category, row.vendorCategory);
  return (
    category === "session_replay" ||
    SESSION_REPLAY_VENDOR_PATTERN.test(vendor ?? "") ||
    SESSION_REPLAY_URL_PATTERN.test(url ?? "")
  );
}

function summarizeSessionReplayEvidence(
  vendorRows: ReturnType<typeof buildVendorEvidence>,
  preconsentRequests: CanonicalEvidenceBundle["networkEvents"],
  requestPurposeRows: Array<Record<string, unknown>>,
) {
  const sessionReplayVendors = vendorRowsForCategories(vendorRows, ["session_replay"])
    .filter((vendor) => SESSION_REPLAY_VENDOR_PATTERN.test(vendor.vendorName) || vendor.vendorCategory === "session_replay");
  const requestRows = [
    ...(preconsentRequests ?? []).filter(isSessionReplayRequestRow),
    ...requestPurposeRows.filter(isSessionReplayRequestRow)
  ] as Array<Record<string, unknown>>;
  const requestUrls = uniqueStrings(requestRows.map((row) => requestUrl(row)));
  const vendors = uniqueStrings([
    ...sessionReplayVendors.map((vendor) => vendor.vendorName),
    ...requestRows.map((row) => firstString(row.vendorName, row.vendor))
  ]).filter((vendor) => SESSION_REPLAY_VENDOR_PATTERN.test(vendor));
  const firstSeenMs = minimumNumber(...requestRows.map((row) => minimumNumber(row.timestampMs, row.tsMs)));
  const observed = vendors.length > 0 || requestUrls.length > 0;

  return {
    artifactCount: Math.max(vendors.length, requestUrls.length),
    collectionEndpointObserved: requestUrls.some((url) => /\/collect|\/events?|\/track|\/ingest|clarity\.ms\/collect/i.test(url)),
    consentStates: observed ? ["pre_consent"] : [],
    coverageRetained: true,
    firstSeenMs,
    libraryOnly: observed && requestUrls.every((url) => /(?:script|tag|recorder|hotjar|fullstory|logrocket|clarity\.ms\/tag)/i.test(url)),
    preConsentObserved: observed,
    requestUrls: requestUrls.slice(0, 10),
    vendors: vendors.slice(0, 10)
  };
}

export function summarizePolicySurfaces(
  policySurfaces: ReturnType<typeof dedupePolicySurfaces>,
  rootDomain: string | null,
  options: {
    discoveredPolicySurfaces?: readonly LocalV2PolicySurface[];
    gdprTransparencyEvidenceProfile?: GdprTransparencyProductionEvidenceProfile | string | null;
    homepageNoGo?: boolean;
    policyTextEvidenceContext?: PolicyTextEvidenceContext;
    primaryLanguage?: string | null;
    scanStartedAt?: string | null;
  } = {}
) {
  const gdprTransparencyEvidenceProfile = normalizeGdprTransparencyProductionEvidenceProfile(
    options.gdprTransparencyEvidenceProfile
  );
  const gdprTransparencyProductionEvidenceEnabled =
    gdprTransparencyProductionEvidenceProfileEnabled(gdprTransparencyEvidenceProfile);
  const privacySurfaces = policySurfaces.filter((row) => row.surface.surfaceType === "privacy_policy");
  const cookieSurfaces = policySurfaces.filter((row) =>
    row.surface.surfaceType === "cookie_policy" || row.surface.surfaceType === "cookie_settings"
  );
  const cookiePolicyText = cookieSurfaces
    .map((row) => firstString(row.surface.textExcerpt))
    .filter(Boolean)
    .join("\n");
  const policyCookieDisclosures = [
    ...new Map(
      cookieSurfaces
        .flatMap((row) =>
          (row.surface.policyCookieDisclosures ?? []).map((disclosure) => ({
            ...disclosure,
            sourceUrl:
              firstString(
                disclosure.sourceUrl,
                row.pageUrl,
                row.surface.normalizedUrl,
                row.surface.url,
              ) ?? disclosure.sourceUrl,
          }))
        )
        .map((disclosure) => [
          `${disclosure.sourceUrl.toLowerCase()}|${disclosure.cookieName.toLowerCase()}`,
          disclosure,
        ])
    ).values(),
  ].slice(0, 250);
  const discoveredPrivacySurfaces = (options.discoveredPolicySurfaces ?? [])
    .filter((surface) => surface.surfaceType === "privacy_policy")
    .filter((surface) => {
      const observedLink = surface.linkObservationState === "observed";
      if (surface.discoveryMethod === "guessed_common_path" && !observedLink) {
        return false;
      }
      if (surface.status === "failed" && !observedLink) {
        return false;
      }
      return true;
    });
  const targetRelevantDiscoveredPrivacySurfaces = discoveredPrivacySurfaces.filter((surface) =>
    !isGenericThirdPartyPrivacySurface({
      pageUrl: canonicalPolicySurfaceUrl(surface, null),
      surface,
    }, rootDomain, { homepageNoGo: options.homepageNoGo === true })
  );
  const evaluatedPrivacySurfaces = privacySurfaces.filter((row) =>
    isEvaluatedPrivacyPolicySurface(row.surface) &&
    !isGenericThirdPartyPrivacySurface(row, rootDomain, { homepageNoGo: options.homepageNoGo === true })
  );
  const article13Surfaces = selectArticle13PrivacySurfaces(
    evaluatedPrivacySurfaces.filter((row) =>
      !isSpecializedPrivacySurfaceForDifferentAudience(row, rootDomain)
    )
  );
  const text = article13Surfaces
    .map((row) => readPolicySurfaceTextArtifact(row.surface, options.policyTextEvidenceContext))
    .filter(Boolean)
    .join("\n");
  const policyPrimaryLanguage = guessPrimaryLanguage({
    matchedLocales: article13Surfaces.flatMap((row) => [
      ...(row.surface.gdprTransparencyTopicCandidates ?? []).map((candidate) => candidate.matchedLocale),
      ...(row.surface.article13DisclosureSignals ?? []).map((signal) => signal.matchedLocale),
    ]),
    textSamples: article13Surfaces.flatMap((row) => [
      row.surface.title,
      row.surface.linkText,
      row.surface.textExcerpt,
    ]),
    urls: article13Surfaces.flatMap((row) => [
      row.pageUrl,
      row.surface.normalizedUrl,
      row.surface.url,
    ]),
  });
  const policyTextQuality = assessRetainedPolicyTextQuality(text, { multilingual: true });
  const gdprTransparencyPolicyTextQuality = gdprTransparencyProductionEvidenceEnabled
    ? assessRetainedPolicyTextQuality(text, { multilingual: true })
    : policyTextQuality;
  const observedPolicyTopicHints = uniqueStrings(article13Surfaces.flatMap((row) => row.surface.observedTopics ?? []));
  const article13SignalCandidates = article13Surfaces.flatMap((row) => {
    const fullPolicyText = readPolicySurfaceTextArtifact(row.surface, options.policyTextEvidenceContext);
    return (row.surface.article13DisclosureSignals ?? []).map((signal) => {
      const evidenceText = firstString(signal.evidenceText);
      const retainedPolicyContext = evidenceText && fullPolicyText
        ? buildPolicyEvidenceContextExcerpt(fullPolicyText, evidenceText)
        : null;
      const supportingContactContext = signal.disclosureType === "supervisory_authority"
        ? extractSupervisoryAuthoritySupportingContactContext(retainedPolicyContext ?? evidenceText ?? "")
        : null;
      return {
        confidence: signal.confidence,
        disclosureType: signal.disclosureType,
        evidenceText,
        evidenceSource: signal.evidenceSource,
        source: signal.source,
        status: signal.status,
        selectedEvidenceStrength: retainedPolicyContext ? "strong" : signal.selectedEvidenceStrength,
        selectedPolicySectionExcerpt: retainedPolicyContext ?? firstString(signal.selectedPolicySectionExcerpt),
        selectedPolicySectionHeading: retainedPolicyContext ? "Policy text context" : firstString(signal.selectedPolicySectionHeading),
        selectedPolicySectionUrl: firstString(signal.selectedPolicySectionUrl) ?? row.pageUrl ?? row.surface.normalizedUrl ?? row.surface.url,
        supportingContactContext,
        surfaceUrl: row.pageUrl ?? row.surface.normalizedUrl ?? row.surface.url
      };
    });
  });
  const gdprTransparencyAdapterResults = article13Surfaces.map((row) => ({
    result: adaptGdprTransparencyTopicCandidatesForProduction({
      isTargetRelevantPrivacyPolicy: true,
      pageUrl: row.pageUrl ?? row.surface.normalizedUrl ?? row.surface.url,
      policyTextQuality: { usable: gdprTransparencyPolicyTextQuality.usable },
      profile: gdprTransparencyEvidenceProfile,
      surface: row.surface
    }),
    row
  }));
  const gdprTransparencyProductionEvidenceDiagnostics =
    gdprTransparencyAdapterDiagnostics(gdprTransparencyAdapterResults.map((row) => row.result));
  const gdprTransparencyAcceptedArticle13Signals = gdprTransparencyAdapterResults.flatMap(({ result }) =>
    result.acceptedProductionSignals.map((signal) => ({
      classifierProvenance: signal.classifierProvenance,
      classifierReasonCodes: signal.classifierReasonCodes,
      confidence: signal.confidence,
      disclosureType: signal.disclosureType,
      evidenceSource: signal.evidenceSource,
      evidenceText: signal.evidenceText,
      matchStrength: signal.matchStrength,
      matchedLocale: signal.matchedLocale,
      matchedTerm: signal.matchedTerm,
      productionCredit: signal.productionCredit,
      productionCreditProfile: signal.productionCreditProfile,
      selectedEvidenceStrength: signal.selectedEvidenceStrength,
      selectedPolicySectionExcerpt: signal.selectedPolicySectionExcerpt,
      selectedPolicySectionHeading: "GDPR Transparency topic classifier evidence",
      selectedPolicySectionUrl: signal.selectedPolicySectionUrl,
      source: signal.source,
      sourceCandidateProductionCredit: signal.sourceCandidateProductionCredit,
      status: signal.status,
      supportingContactContext: undefined,
      surfaceUrl: signal.sourceUrl
    }))
  );
  const validatedArticle13DisclosureSignals = [
    ...(policyTextQuality.usable
      ? article13SignalCandidates.filter((signal) => retainedArticle13SignalRejectReason(signal.evidenceText ?? "", signal.disclosureType) === null)
      : []),
    ...gdprTransparencyAcceptedArticle13Signals
  ];
  const dedupedArticle13DisclosureSignals = dedupePolicyDisclosureRows(validatedArticle13DisclosureSignals, {
    excerptKeys: ["selectedPolicySectionExcerpt", "evidenceText"],
    typeKeys: ["disclosureType"]
  });
  const discardedArticle13DisclosureSignals = [
    ...article13Surfaces.flatMap((row) =>
      (row.surface.discardedArticle13DisclosureSignals ?? []).map((signal) => ({
        confidence: signal.confidence,
        disclosureType: signal.disclosureType,
        evidenceText: firstString(signal.evidenceText),
        rejectReason: signal.rejectReason,
        source: signal.source,
        surfaceUrl: row.pageUrl ?? row.surface.normalizedUrl ?? row.surface.url
      }))
    ),
    ...article13SignalCandidates.flatMap((signal) => {
      const rejectReason = policyTextQuality.usable
        ? retainedArticle13SignalRejectReason(signal.evidenceText ?? "", signal.disclosureType)
        : "code_or_non_policy_excerpt" as const;
      return rejectReason
        ? [{
            confidence: signal.confidence,
            disclosureType: signal.disclosureType,
            evidenceText: signal.evidenceText,
            rejectReason,
            source: signal.source,
            surfaceUrl: signal.surfaceUrl
          }]
        : [];
    })
  ].slice(0, 40);
  const mentionedControls = uniqueStrings(policySurfaces.flatMap((row) => row.surface.mentionedControls ?? []));
  const processingErrorObserved = /processing error|privacy center.*error/i.test(text);
  const policyTextEvidenceProjection = buildPolicyTextEvidenceProjection(
    article13Surfaces,
    options.policyTextEvidenceContext,
  );
  const policyTextExtractionHealth = buildPolicyTextExtractionHealth(
    article13Surfaces,
    text,
    processingErrorObserved,
    policyPrimaryLanguage,
    options.primaryLanguage,
    policyTextEvidenceProjection,
  );
  const discoveredPrivacyPolicyUrls = uniqueStrings(targetRelevantDiscoveredPrivacySurfaces
    .map((surface) => firstString(surface.normalizedUrl, surface.url))
    .filter(Boolean));
  const discoveredPrivacyPolicyStatuses = uniqueStrings(targetRelevantDiscoveredPrivacySurfaces
    .map((surface) => firstString(surface.status))
    .filter(Boolean));
  const discoveredPrivacyPolicyDetails = targetRelevantDiscoveredPrivacySurfaces.map((surface) => ({
    documentEvaluationState: surface.documentEvaluationState ?? "not_attempted",
    documentFetchState: surface.documentFetchState ?? (
      surface.status === "fetched" ? "fetched" :
      surface.status === "failed" ? "failed" :
      surface.status === "skipped_budget" ? "skipped_budget" : "not_attempted"
    ),
    fetchFailureReason: surface.fetchFailureReason ?? null,
    linkObservationState: surface.linkObservationState ?? (
      surface.status === "observed" ? "observed" : "candidate"
    ),
    status: surface.status,
    url: firstString(surface.finalUrl, surface.normalizedUrl, surface.url),
  })).filter((surface) => Boolean(surface.url));
  const privacyPolicyEvaluationState = article13Surfaces.length > 0
    ? policyTextExtractionHealth.policyTextExtractionStatus === "ok"
      ? "fetched_usable"
      : "fetched_insufficient"
    : targetRelevantDiscoveredPrivacySurfaces.some((surface) =>
        surface.documentFetchState === "fetched" &&
        surface.documentEvaluationState === "insufficient"
      )
      ? "fetched_insufficient"
    : targetRelevantDiscoveredPrivacySurfaces.some((surface) => surface.status === "skipped_budget")
      ? "discovered_skipped_budget"
      : targetRelevantDiscoveredPrivacySurfaces.some((surface) => surface.status === "failed")
        ? "discovered_fetch_failed"
        : targetRelevantDiscoveredPrivacySurfaces.length > 0
          ? "discovered_not_evaluated"
          : "not_discovered";
  const retainedPolicySections = article13Surfaces.flatMap((row) =>
    (row.surface.retainedPolicySections ?? []).map((section) => ({
      charEnd: section.charEnd,
      charStart: section.charStart,
      heading: section.heading,
      quality: section.quality,
      sourceUrl: section.sourceUrl,
      textExcerpt: section.textExcerpt,
    }))
  ).slice(0, 80);
  const legalFrameworkValidityMatches = [
    ...new Map(
      article13Surfaces.flatMap((row) => {
        const sourceUrl =
          row.pageUrl ?? row.surface.normalizedUrl ?? row.surface.url;
        const policyTexts = uniqueStrings([
          readPolicySurfaceTextArtifact(row.surface, options.policyTextEvidenceContext),
          firstString(row.surface.textExcerpt),
          ...(row.surface.retainedPolicySections ?? []).map((section) =>
            firstString(section.textExcerpt)
          ),
          ...(row.surface.article13DisclosureSignals ?? []).map((signal) =>
            firstString(signal.evidenceText)
          ),
          ...(row.surface.discardedArticle13DisclosureSignals ?? []).map((signal) =>
            firstString(signal.evidenceText)
          ),
        ]);
        return policyTexts.flatMap((policyText) =>
          evaluateLegalFrameworkValidity(policyText, options.scanStartedAt).map((match) => ({
            ...match,
            evidenceText:
              buildPolicyEvidenceContextExcerpt(policyText, match.matchedAlias) ??
              match.matchedAlias,
            sourceUrl,
          }))
        );
      }).map((match) => [
        `${match.canonicalId}\u0000${match.statusAtScan}\u0000${match.sourceUrl}`,
        match,
      ])
    ).values(),
  ].slice(0, 20);
  const retainedArticle13SectionEvidence = dedupePolicyDisclosureRows(article13Surfaces.flatMap((row) =>
    (row.surface.retainedArticle13SectionEvidence ?? []).map((evidence) => ({
      coverageArea: evidence.coverageArea,
      evidenceSource: evidence.evidenceSource,
      extractionLimitation: evidence.extractionLimitation,
      selectedEvidenceStrength: evidence.selectedEvidenceStrength,
      selectedPolicySectionExcerpt: evidence.selectedPolicySectionExcerpt,
      selectedPolicySectionHeading: evidence.selectedPolicySectionHeading,
      selectedPolicySectionUrl: evidence.selectedPolicySectionUrl,
      signalObserved: evidence.signalObserved,
      surfaceUrl: row.pageUrl ?? row.surface.normalizedUrl ?? row.surface.url
    }))
  ), {
    excerptKeys: ["selectedPolicySectionExcerpt"],
    typeKeys: ["coverageArea"]
  }).slice(0, 40);
  const retainedPolicySectionHeadings = uniqueStrings(retainedPolicySections.map((section) => firstString(section.heading)).filter(Boolean));
  const policyLastUpdatedTexts = uniqueStrings(policySurfaces
    .map((row) => firstString(row.surface.lastUpdatedText))
    .filter(Boolean));
  const selectedPrivacyPolicyDocument = article13Surfaces
    .filter((row) =>
      row.surface.traversalDepth === 1 &&
      row.surface.documentEvaluationState === "usable"
    )
    .sort((left, right) => right.surface.confidence - left.surface.confidence)[0] ?? null;
  const privacyPolicyEvidencePaths = article13Surfaces
    .filter((row) => row.surface.traversalDepth === 1)
    .map((row) => ({
      childObservationId: row.surface.observationId,
      documentEvaluationState: row.surface.documentEvaluationState ?? "not_attempted",
      documentFetchState: row.surface.documentFetchState ?? "not_attempted",
      documentUrl: row.pageUrl ?? row.surface.normalizedUrl ?? row.surface.url,
      parentObservationId: row.surface.parentObservationId ?? null,
      parentSurfaceUrl: row.surface.parentSurfaceUrl ?? null,
      selectionReasonCodes: row.surface.selectionReasonCodes ?? [],
      traversalDepth: row.surface.traversalDepth,
    }));
  const expectedPolicySectionHeadings = [
    "Your privacy controls",
    "Exporting and deleting your information",
    "Retaining your information",
    "Compliance and cooperation with regulators",
    "European requirements",
    "Data transfers"
  ];
  const missingExpectedPolicySections = expectedPolicySectionHeadings.filter((heading) =>
    !retainedPolicySectionHeadings.some((retainedHeading) => retainedHeading.toLowerCase().includes(heading.toLowerCase()))
  );
  return {
    article13DisclosureSignals: dedupedArticle13DisclosureSignals,
    article13DisclosureTypesObserved: uniqueStrings(dedupedArticle13DisclosureSignals
      .filter((signal) => signal.status === "observed")
      .map((signal) => signal.disclosureType)),
    article13DisclosureTypesPartial: uniqueStrings(dedupedArticle13DisclosureSignals
      .filter((signal) => signal.status === "partial")
      .map((signal) => signal.disclosureType)),
    discardedArticle13DisclosureSignals,
    legalFrameworkValidityMatches,
    staleLegalFrameworkReferenceObserved:
      hasStaleLegalFrameworkReference(legalFrameworkValidityMatches),
    gdprTransparencyEvidenceProfile,
    gdprTransparencyProductionEvidenceDiagnostics,
    gdprTransparencyProductionEvidenceEnabled,
    retainedArticle13SectionEvidence,
    retainedPolicySections,
    mentionedControls,
    observedPolicyTopicHints,
    observedTopics: observedPolicyTopicHints,
    missingExpectedPolicySections,
    policySectionCount: retainedPolicySections.length,
    policyTextCoverageMode: retainedPolicySections.length > 1 ? "section_targeted" : text.length > 0 ? "front_loaded" : "none",
    retainedPolicySectionHeadings,
    policySurfaceCount: policySurfaces.length,
    policyLastUpdatedTexts,
    cookiePolicyPresent: cookieSurfaces.length > 0,
    cookiePolicyUrls: uniqueStrings(cookieSurfaces.map((row) => row.pageUrl ?? row.surface.normalizedUrl ?? row.surface.url)),
    cookieDisclosures: policyCookieDisclosures,
    cookie_disclosures: policyCookieDisclosures,
    policyCookieDisclosures,
    policy_cookie_disclosures: policyCookieDisclosures,
    evaluatedPrivacyPolicySurfaceCount: evaluatedPrivacySurfaces.length,
    policyTextExtractionHealth,
    policy_text_extraction_health: policyTextExtractionHealth,
    policyTextEvidenceProjection,
    policy_text_evidence_projection: policyTextEvidenceProjection,
    privacyPolicyPresent: article13Surfaces.length > 0,
    privacyPolicyDiscovered: targetRelevantDiscoveredPrivacySurfaces.length > 0 || article13Surfaces.length > 0,
    privacyPolicyEvaluationState,
    privacyPolicyEvidencePaths,
    selectedPrivacyPolicyDocument: selectedPrivacyPolicyDocument ? {
      documentUrl:
        selectedPrivacyPolicyDocument.pageUrl ??
        selectedPrivacyPolicyDocument.surface.normalizedUrl ??
        selectedPrivacyPolicyDocument.surface.url,
      observationId: selectedPrivacyPolicyDocument.surface.observationId,
      parentObservationId: selectedPrivacyPolicyDocument.surface.parentObservationId ?? null,
      parentSurfaceUrl: selectedPrivacyPolicyDocument.surface.parentSurfaceUrl ?? null,
      selectionReasonCodes: selectedPrivacyPolicyDocument.surface.selectionReasonCodes ?? [],
      traversalDepth: selectedPrivacyPolicyDocument.surface.traversalDepth,
    } : null,
    discoveredPrivacyPolicyStatuses,
    discoveredPrivacyPolicyDetails,
    discoveredPrivacyPolicyUrls,
    privacyPolicyTextCharacterCount: text.length,
    privacyPolicyUrls: uniqueStrings(article13Surfaces.map((row) => row.pageUrl ?? row.surface.normalizedUrl ?? row.surface.url)),
    processingErrorObserved,
    scanStartedAt: options.scanStartedAt ?? null,
    retainedCookiePolicyTextExcerpt: buildRetainedPolicyDisclosureText(cookiePolicyText),
    retainedPrivacyPolicyTextExcerpt: buildRetainedPolicyDisclosureText(text),
    validatedDisclosureTypesObserved: uniqueStrings(dedupedArticle13DisclosureSignals
      .filter((signal) => signal.status === "observed")
      .map((signal) => signal.disclosureType)),
    validatedDisclosureTypesPartial: uniqueStrings(dedupedArticle13DisclosureSignals
      .filter((signal) => signal.status === "partial")
      .map((signal) => signal.disclosureType))
  };
}

const MAX_RETAINED_POLICY_DISCLOSURE_TEXT_CHARS = 40_000;

function gdprTransparencyAdapterDiagnostics(
  results: GdprTransparencyTopicEvidenceAdapterResult[]
): GdprTransparencyProductionEvidenceDiagnostics {
  const acceptedCandidateCount = results.reduce((count, result) =>
    count + result.dispositions.filter((disposition) => disposition.disposition === "accepted").length, 0);
  const diagnosticCandidateCount = results.reduce((count, result) =>
    count + result.dispositions.filter((disposition) => disposition.disposition === "diagnostic_only").length, 0);
  const discardedCandidateCount = results.reduce((count, result) =>
    count + result.dispositions.filter((disposition) => disposition.disposition === "discarded").length, 0);
  return {
    acceptedCandidateCount,
    diagnosticCandidateCount,
    discardedCandidateCount,
    productionCreditSignalCount: results.reduce((count, result) => count + result.acceptedProductionSignals.length, 0),
    rejectedCandidateCount: diagnosticCandidateCount + discardedCandidateCount,
    sourceCandidateCount: results.reduce((count, result) => count + result.dispositions.length, 0)
  };
}

function buildRetainedPolicyDisclosureText(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= MAX_RETAINED_POLICY_DISCLOSURE_TEXT_CHARS) {
    return normalized;
  }
  return normalized.slice(0, MAX_RETAINED_POLICY_DISCLOSURE_TEXT_CHARS).trimEnd();
}

function buildPolicyTextEvidenceProjection(
  article13Surfaces: ReturnType<typeof dedupePolicySurfaces>,
  context?: PolicyTextEvidenceContext,
): PolicyTextEvidenceProjection {
  const sourceBundle = context?.sourceBundle ?? {
    schemaVersion: "unknown",
    verificationStatus: "local_unverified" as const,
  };
  const documents: PolicyTextEvidenceProjection["documents"] = article13Surfaces.slice(0, 16).map((row) => {
    const surface = row.surface;
    const reference = policySurfaceTextArtifactReference(surface);
    const retained = resolvePolicySurfaceTextEvidence(surface, context);
    const text = retained?.text ?? "";
    const textQuality = assessRetainedPolicyTextQuality(text, { multilingual: true });
    const relationship = surface.targetRelationship ?? "unknown";
    const documentFetchState = surface.documentFetchState ?? (
      surface.status === "fetched" ? "fetched" :
      surface.status === "failed" ? "failed" :
      surface.status === "skipped_budget" ? "skipped_budget" : "not_attempted"
    );
    const documentEvaluationState = surface.documentEvaluationState ?? (
      surface.status === "fetched" ? "usable" :
      surface.fetchFailureReason === "low_quality_access_challenge" ? "blocked" :
      surface.fetchFailureReason === "insufficient_policy_text" ||
        surface.fetchFailureReason === "consent_settings_shell" ? "insufficient" : "not_attempted"
    );
    const documentTextCoverage = surface.documentTextCoverage ?? {
      status: text && surface.contentCoverage?.sourceTextChars === text.length
        ? "complete" as const
        : text && (surface.contentCoverage?.sourceTextChars ?? 0) > text.length
          ? "truncated" as const
          : "unavailable" as const,
      sourceTextChars: surface.contentCoverage?.sourceTextChars ?? 0,
      retainedTextChars: text.length,
      limitationKeys: ["policy_document_text_coverage_derived_for_legacy_observation"],
    };
    const limitationKeys = uniqueStrings([
      !reference ? "policy_text_artifact_reference_missing" : null,
      retained?.failureReason,
      !text ? "policy_text_artifact_text_unavailable" : null,
      documentFetchState !== "fetched" ? `policy_document_fetch_${documentFetchState}` : null,
      documentEvaluationState !== "usable" ? `policy_document_evaluation_${documentEvaluationState}` : null,
      !["target_controller", "first_party_brand"].includes(relationship)
        ? "policy_document_target_ownership_unverified"
        : null,
      !surface.contentCoverage ? "policy_content_coverage_missing" : null,
      ...documentTextCoverage.limitationKeys,
      !firstString(surface.url, row.pageUrl) ? "policy_document_requested_url_missing" : null,
      ...(surface.contentCoverage?.limitationKeys ?? []),
      text.length > 0 && text.length < MIN_PRIVACY_POLICY_TEXT_CHARS_FOR_ARTICLE13
        ? "policy_text_below_minimum_length"
        : null,
      !textQuality.usable ? textQuality.reason : null,
    ]);
    const extractionStatus: PolicyTextEvidenceProjection["documents"][number]["extractionStatus"] =
      documentEvaluationState === "blocked"
        ? "blocked"
        : !text || retained?.verificationStatus === "verification_failed"
          ? "unavailable"
          : !textQuality.usable
            ? "low_quality"
            : documentTextCoverage.status === "truncated"
                ? "truncated"
              : documentTextCoverage.status === "unavailable"
                ? "unavailable"
                : text.length < MIN_PRIVACY_POLICY_TEXT_CHARS_FOR_ARTICLE13
                  ? "thin"
                : documentTextCoverage.status === "complete" &&
                    documentFetchState === "fetched" &&
                    documentEvaluationState === "usable" &&
                    ["target_controller", "first_party_brand"].includes(relationship) &&
                    text.length >= MIN_PRIVACY_POLICY_TEXT_CHARS_FOR_ARTICLE13
                    ? "complete"
                    : "unavailable";
    return {
      observationId: surface.observationId,
      artifactId: reference?.artifactId,
      artifactFileName: retained?.fileName ?? reference?.fileName,
      artifactSha256: retained?.sha256,
      artifactSizeBytes: retained?.sizeBytes,
      artifactUri: retained?.uri,
      artifactVerificationStatus: retained?.verificationStatus ?? "missing_reference",
      failureReason: retained?.failureReason,
      requestedUrl: firstString(surface.url, row.pageUrl) ?? "about:blank",
      finalUrl: surface.finalUrl,
      redirectChain: surface.redirectChain ?? [],
      documentFormat: surface.documentFormat ?? (/\.pdf(?:$|[?#])/i.test(surface.finalUrl ?? surface.url) ? "pdf" : "unknown"),
      contentType: surface.contentType,
      documentFetchState,
      documentEvaluationState,
      documentRole: surface.documentRole ?? "unknown",
      documentOwnerEntity: surface.documentOwnerEntity,
      targetRelationship: relationship,
      ownershipConfidence: surface.ownershipConfidence,
      contentCoverage: surface.contentCoverage,
      documentTextCoverage,
      retainedTextChars: text.length,
      retainedTextSha256: text ? createHash("sha256").update(text).digest("hex") : undefined,
      extractionStatus,
      limitationKeys,
    };
  });
  const verifiedDocuments = documents.filter((document) => document.artifactVerificationStatus === "verified");
  const completeDocuments = documents.filter((document) => document.extractionStatus === "complete");
  const projectionStatus: PolicyTextEvidenceProjection["projectionStatus"] =
    sourceBundle.verificationStatus === "verified"
      ? completeDocuments.length > 0 && verifiedDocuments.length === documents.length
        ? "verified_complete"
        : "verified_partial"
      : sourceBundle.verificationStatus === "local_unverified"
        ? "local_unverified"
        : "unavailable";
  return policyTextEvidenceProjectionSchema.parse({
    contractVersion: "certscore.policy-text-evidence-projection.v1",
    generatedAt: context?.generatedAt ?? "1970-01-01T00:00:00.000Z",
    scanId: context?.scanId ?? "unbound-policy-summary",
    sourceBundle,
    projectionStatus,
    documents,
    limitationKeys: uniqueStrings(documents.flatMap((document) => document.limitationKeys)),
  });
}

function buildPolicyTextExtractionHealth(
  article13Surfaces: ReturnType<typeof dedupePolicySurfaces>,
  text: string,
  processingErrorObserved: boolean,
  policyPrimaryLanguage?: string | null,
  sitePrimaryLanguage?: string | null,
  projection?: PolicyTextEvidenceProjection,
) {
  const policySurfaceObserved = article13Surfaces.length > 0;
  const policyUrls = uniqueStrings(article13Surfaces.map((row) => row.pageUrl ?? row.surface.normalizedUrl ?? row.surface.url));
  const extractedTextLength = text.length;
  const nanoInvoked = article13Surfaces.some((row) =>
    (row.surface.assistMetadata ?? []).some((metadata) => metadata.modelAssistProvider === "nano")
  );
  const projectedDocuments = projection?.documents ?? [];
  const hasCompleteDocument = projectedDocuments.some((document) => document.extractionStatus === "complete");
  const hasRetainedDocumentText = projectedDocuments.some((document) => document.retainedTextChars > 0);
  const hasBlockedSurface = projectedDocuments.some((document) => document.extractionStatus === "blocked");
  const hasTruncatedDocument = projectedDocuments.some((document) => document.extractionStatus === "truncated");
  const hasPartialDocument = projectedDocuments.some((document) => document.extractionStatus === "partial");
  const hasThinDocument = projectedDocuments.some((document) => document.extractionStatus === "thin");
  const hasMalformedDocument = projectedDocuments.some((document) => document.extractionStatus === "malformed");
  const textQuality = assessRetainedPolicyTextQuality(text, { multilingual: true });
  const retainedTextQualityStatus = textQuality.reason === "empty_policy_text"
    ? "empty_policy_text"
    : textQuality.reason === "low_quality_access_challenge"
      ? "low_quality_access_challenge"
      : textQuality.reason === "low_quality_non_policy_text"
        ? "low_quality_non_policy_text"
        : "low_quality_extracted_code_or_config";
  const normalizedPolicyLanguage = policyPrimaryLanguage?.trim().toLowerCase().split(/[-_]/)[0] ?? null;
  const normalizedSiteLanguage = sitePrimaryLanguage?.trim().toLowerCase().split(/[-_]/)[0] ?? null;
  const detectedPolicyLanguage = normalizedPolicyLanguage ?? normalizedSiteLanguage;
  const detectedPolicyLanguageSource = normalizedPolicyLanguage
    ? "policy_surface"
    : normalizedSiteLanguage
      ? "site_fallback"
      : null;
  const transparencyLanguageSupported = detectedPolicyLanguage === null
    ? null
    : SUPPORTED_GDPR_TRANSPARENCY_LOCALES.includes(
      detectedPolicyLanguage as (typeof SUPPORTED_GDPR_TRANSPARENCY_LOCALES)[number],
    );
  const policyTextExtractionStatus =
    !policySurfaceObserved
      ? "not_attempted"
      : processingErrorObserved
        ? "errored"
        : hasBlockedSurface
          ? "blocked"
        : !hasRetainedDocumentText
          ? "artifact_unavailable"
          : transparencyLanguageSupported === false
            ? "unsupported_language"
          : !textQuality.usable
            ? retainedTextQualityStatus
          : transparencyLanguageSupported === null
            ? "language_unknown"
          : hasCompleteDocument
            ? "ok"
          : hasMalformedDocument
            ? "malformed"
          : hasTruncatedDocument
            ? "truncated"
          : hasPartialDocument
            ? "partial"
          : hasThinDocument
            ? "thin"
            : "artifact_unavailable";
  const extractionFailureReason =
    policyTextExtractionStatus === "ok"
      ? undefined
      : policyTextExtractionStatus === "not_attempted"
        ? "privacy_policy_surface_not_observed"
        : policyTextExtractionStatus === "blocked"
          ? "privacy_policy_fetch_blocked"
        : policyTextExtractionStatus === "errored"
          ? "privacy_policy_text_processing_error"
          : policyTextExtractionStatus === "unsupported_language"
            ? "privacy_policy_language_unsupported"
          : policyTextExtractionStatus === "language_unknown"
            ? "privacy_policy_language_unknown"
          : policyTextExtractionStatus === "empty_policy_text"
            ? "privacy_policy_text_not_retained"
          : policyTextExtractionStatus === "low_quality_access_challenge"
            ? "privacy_policy_access_challenge_retained"
          : policyTextExtractionStatus === "low_quality_extracted_code_or_config"
            ? "privacy_policy_text_extracted_code_or_config"
          : policyTextExtractionStatus === "low_quality_non_policy_text"
            ? "privacy_policy_text_non_policy_content"
          : policyTextExtractionStatus === "malformed"
            ? "privacy_policy_content_malformed"
          : policyTextExtractionStatus === "truncated"
            ? "privacy_policy_content_truncated"
          : policyTextExtractionStatus === "partial"
            ? "privacy_policy_content_partial"
          : policyTextExtractionStatus === "thin"
            ? "privacy_policy_text_below_minimum_length"
              : "privacy_policy_verified_text_artifact_unavailable";

  return {
    contractVersion: "certscore.policy-text-extraction-health.v2",
    extractedTextLength,
    extractionFailureReason,
    minimumTextLengthRequired: MIN_PRIVACY_POLICY_TEXT_CHARS_FOR_ARTICLE13,
    nanoInvoked,
    nanoSkipReason: policyTextExtractionStatus === "ok" || nanoInvoked ? undefined : "policy_text_input_limited",
    policySurfaceObserved,
    detectedPolicyLanguage,
    detectedPolicyLanguageSource,
    gdprTransparencyLanguageSupported: transparencyLanguageSupported,
    supportedGdprTransparencyLocales: [...SUPPORTED_GDPR_TRANSPARENCY_LOCALES],
    policyTextQuality: textQuality,
    policyTextExtractionStatus,
    policyTextEvidenceProjectionContractVersion: projection?.contractVersion ?? null,
    policyTextEvidenceProjectionStatus: projection?.projectionStatus ?? "unavailable",
    verifiedPolicyDocumentCount: projectedDocuments.filter((document) => document.artifactVerificationStatus === "verified").length,
    policyUrlRetained: policyUrls.length > 0,
    policyUrls
  };
}

function assessRetainedPolicyTextQuality(value: string, options: { multilingual?: boolean } = {}) {
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) {
    return {
      alphabeticWordRatio: 0,
      codeSignalCount: 0,
      codeSymbolRatio: 0,
      naturalLanguageSentenceCount: 0,
      policyTermCount: 0,
      reason: "empty_policy_text",
      usable: false
    };
  }
  const lower = text.toLowerCase();
  const codeSignals = [
    /this\.gbar_/i,
    /\bCONFIG:\s*\[\[\[/,
    /Copyright The Closure Library/i,
    /SPDX-License-Identifier/i,
    /\b(?:var|const|let)\s+[A-Za-z_$][\w$]*\s*=/,
    /function\s*\(/,
    /=>/,
    /_\.[A-Za-z_$][\w$]*\s*=/,
    /Object\.definePropert(?:y|ies)/
  ].reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
  const codeSymbolRatio = (text.match(/[{}[\];=<>]/g) ?? []).length / Math.max(text.length, 1);
  const totalTokens = text.split(/\s+/).filter(Boolean).length;
  const alphabeticWords = options.multilingual
    ? text.match(/\p{L}[\p{L}'-]{2,}/gu) ?? []
    : text.match(/\b[A-Za-z][A-Za-z'-]{2,}\b/g) ?? [];
  const alphabeticWordRatio = alphabeticWords.length / Math.max(totalTokens, 1);
  const naturalLanguageSentencePattern = options.multilingual
    ? /\b(?:we|you|your|our|users?|individuals?|customers?|visitors?|people|usted(?:es)?|sus?|nuestro|nuestra|usuarios?|personas?|interesados?|datos personales|traitement|données personnelles|personenbezogene daten|dati personali|persoonsgegevens|dane osobowe|nós|você|vocês|seus?|suas?|usuários?|titulares?|dados pessoais|tratamento de dados)\b[^.!?]{20,}[.!?]/giu
    : /\b(?:we|you|your|our|users?|individuals?|customers?|visitors?|people)\b[^.!?]{20,}[.!?]/gi;
  const naturalLanguageSentenceCount = (text.match(naturalLanguageSentencePattern) ?? []).length;
  const policyTermPattern = options.multilingual
    ? /\b(?:privacy|collect|use|information|personal data|personal information|data|retain|delete|share|rights|contact|transfer|consent|controller|processor|legal basis|lawful basis|privacidad|datos personales|protección de datos|tratamiento|responsable|delegado|derechos|reclamación|confidentialit[eé]|donn[eé]es personnelles|responsable du traitement|protection des donn[eé]es|droits|datenschutz|personenbezogene daten|verarbeitung|verantwortlicher|rechte|beschwerde|privacy|dati personali|trattamento|titolare|diritti|reclamo|privacybeleid|persoonsgegevens|verwerking|verwerkingsverantwoordelijke|rechten|klacht|prywatno[śs][ćc]|dane osobowe|przetwarzania|administrator|prawa|skargi|privacidade|dados pessoais|proteção de dados|tratamento|controlador|encarregado|direitos|reclamação|retenção|conservação|transferências)\b/giu
    : /\b(?:privacy|collect|use|information|personal data|personal information|data|retain|delete|share|rights|contact|transfer|consent|controller|processor|legal basis|lawful basis)\b/g;
  const policyTermCount = uniqueStrings((text.match(policyTermPattern) ?? []).map((value) => value.toLowerCase())).length;
  const gdprTransparencyTopicMatchCount = options.multilingual
    ? classifyGdprTransparencyTopics({ text: text.slice(0, 40_000) }).matches.length
    : 0;
  const escapedUrlCount = (text.match(/\\x2f|\\u003c|\\u003e|https?:\\\/\\\//gi) ?? []).length;
  const minifiedTokenCount = (text.match(/[A-Za-z_$][\w$]{0,8}\s*[=:]\s*\S{40,}/g) ?? []).length;
  const accessChallengeSignalCount = [
    /\bclient challenge\b/i,
    /\ba required part of this site couldn[’']t load\b/i,
    /\bdisable any ad blockers\b/i,
    /\bplease check your connection\b/i,
    /\bentrez les caract[èe]res affich[ée]s\b/i,
    /\bt[ée]l[ée]charger le captcha audio\b/i,
    /\bcaptcha\b/i,
  ].filter((pattern) => pattern.test(text)).length;
  const reason =
    accessChallengeSignalCount >= 2
      ? "low_quality_access_challenge"
      : /\bthis\.gbar_|\bCONFIG:\s*\[\[\[|Copyright The Closure Library|SPDX-License-Identifier/i.test(text) ||
    (codeSignals >= 2 && naturalLanguageSentenceCount < 3) ||
    (codeSymbolRatio > 0.12 && naturalLanguageSentenceCount < 4) ||
    (escapedUrlCount >= 8 && naturalLanguageSentenceCount < 3) ||
    (minifiedTokenCount >= 2 && naturalLanguageSentenceCount < 4) ||
    (text.length >= 500 && alphabeticWordRatio < 0.42)
        ? "low_quality_extracted_code_or_config"
      : text.length >= 500 && policyTermCount < 2 && gdprTransparencyTopicMatchCount < 1 && naturalLanguageSentenceCount < 2
        ? "low_quality_non_policy_text"
        : undefined;
  return {
    accessChallengeSignalCount,
    alphabeticWordRatio,
    codeSignalCount: codeSignals,
    codeSymbolRatio,
    naturalLanguageSentenceCount,
    policyTermCount,
    reason,
    usable: !reason
  };
}

function retainedArticle13SignalIsUsable(value: string, disclosureType: string | undefined) {
  return retainedArticle13SignalRejectReason(value, disclosureType) === null;
}

function retainedArticle13SignalRejectReason(value: string, disclosureType: string | undefined) {
  return sharedArticle13DisclosureRejectReason(value, disclosureType, { mode: "retained_report" });
}

function isGenericThirdPartyPrivacySurface(
  row: ReturnType<typeof dedupePolicySurfaces>[number],
  rootDomain: string | null,
  options: { homepageNoGo?: boolean } = {}
) {
  const hostname = hostnameFromUrl(row.pageUrl ?? row.surface.normalizedUrl ?? row.surface.url);
  if (!hostname || sameSite(hostname, rootDomain)) {
    return false;
  }

  if (options.homepageNoGo === true) {
    return true;
  }

  const linkContext = [
    row.surface.linkText,
    row.surface.title,
    row.surface.surroundingTextExcerpt,
  ].filter(Boolean).join(" ");

  if (
    /learn more about (?:this|the) (?:provider|vendor)/i.test(linkContext) ||
    /(?:provider|vendor)(?:'s|’s)? privacy (?:policy|notice)/i.test(linkContext) ||
    /powered by.{0,120}privacy (?:policy|notice)/i.test(linkContext)
  ) {
    return true;
  }

  return [
    "policies.google.com",
    "privacy.google.com",
    "privacy.truste.com",
    "trustarc.com",
    "privacy.trustarc.com",
    "www.trustarc.com"
  ].includes(hostname);
}

function selectArticle13PrivacySurfaces(
  privacySurfaces: ReturnType<typeof dedupePolicySurfaces>
) {
  const generalPrivacySurfaces = privacySurfaces.filter((row) => !isCookieSpecificPrivacySurface(row));
  const policyDocuments = generalPrivacySurfaces.filter((row) => row.surface.documentRole !== "policy_index");
  const scopedPrivacySurfaces = policyDocuments.length > 0 ? policyDocuments : generalPrivacySurfaces;
  const canonicalPrivacyNotices = scopedPrivacySurfaces.filter(isCanonicalPrivacyNoticeSurface);
  const prioritizeGeneralScope = (rows: typeof generalPrivacySurfaces) => rows
    .map((row, index) => ({ index, row }))
    .sort((left, right) =>
      Number(isExplicitGeneralPrivacyNotice(right.row)) - Number(isExplicitGeneralPrivacyNotice(left.row)) ||
      left.index - right.index
    )
    .map(({ row }) => row);
  if (canonicalPrivacyNotices.length > 0) {
    return prioritizeGeneralScope(scopedPrivacySurfaces.filter((row) =>
      !isPrivacyServiceMarketingSurface(row) &&
      !isNonPolicyEditorialSurface(row)
    ));
  }
  return prioritizeGeneralScope(scopedPrivacySurfaces.length > 0 ? scopedPrivacySurfaces : privacySurfaces);
}

function isExplicitGeneralPrivacyNotice(row: ReturnType<typeof dedupePolicySurfaces>[number]) {
  return (row.surface.classifierReasonCodes ?? []).includes("variant_general_scope");
}

function isPrivacyServiceMarketingSurface(row: ReturnType<typeof dedupePolicySurfaces>[number]) {
  const evidence = [
    row.surface.title,
    row.surface.linkText,
    row.surface.textExcerpt,
    row.pageUrl,
    row.surface.normalizedUrl,
    row.surface.url,
  ].filter(Boolean).join(" ");
  return /(?:DPO|data protection officer)[-\s]*(?:as a service|service)|(?:data privacy|data protection)\s+(?:services?|solutions?|consulting)|(?:our|managed)\s+(?:DPO|data protection)\s+services?/i.test(evidence);
}

function isNonPolicyEditorialSurface(row: ReturnType<typeof dedupePolicySurfaces>[number]) {
  const url = [
    row.pageUrl,
    row.surface.normalizedUrl,
    row.surface.url,
  ].filter(Boolean).join(" ");
  const label = [
    row.surface.title,
    row.surface.linkText,
    row.surface.surroundingTextExcerpt,
  ].filter(Boolean).join(" ");
  return /\/(?:customer-stories|customer-story|case-studies|case-study|success-stories|blog|news|insights)(?:\/|$)/i.test(url) ||
    /\b(?:customer story|case study|success story)\b/i.test(label);
}

function isCanonicalPrivacyNoticeSurface(row: ReturnType<typeof dedupePolicySurfaces>[number]) {
  const evidence = [
    row.pageUrl,
    row.surface.normalizedUrl,
    row.surface.url,
    row.surface.title,
    row.surface.linkText,
  ].filter(Boolean).join(" ");
  return /(?:privacy|data[-_\s]*protection)[-_\s]*(?:policy|notice|statement)|datenschutzerkl[aä]rung|politique[-_\s]*de[-_\s]*confidentialit[eé]|pol[ií]tica[-_\s]*de[-_\s]*privacidad/i.test(evidence);
}

function isSpecializedPrivacySurfaceForDifferentAudience(
  row: ReturnType<typeof dedupePolicySurfaces>[number],
  rootDomain: string | null
) {
  const evidence = [
    row.surface.title,
    row.surface.linkText,
    row.pageUrl,
    row.surface.normalizedUrl,
    row.surface.url,
  ].filter(Boolean).join(" ").replace(/\s+/g, " ").toLowerCase();
  const target = (rootDomain ?? "").toLowerCase();
  const targetLooksChildDirected = /(?:^|[.-])(?:kids?|children|child|junior|cartoon)(?:[.-]|$)/i.test(target);
  if (!targetLooksChildDirected && (
    /children(?:'s)? privacy policy|child(?:ren)?-directed services|services aimed at children/.test(evidence)
  )) {
    return true;
  }
  return /employee privacy (?:notice|policy)|applicant privacy (?:notice|policy)|recruit(?:ment|ing) privacy (?:notice|policy)/.test(evidence);
}

function isCookieSpecificPrivacySurface(row: ReturnType<typeof dedupePolicySurfaces>[number]) {
  const url = [
    row.pageUrl,
    row.surface.normalizedUrl,
    row.surface.url
  ].filter(Boolean).join(" ");
  const title = firstString(row.surface.title);
  const linkText = firstString(row.surface.linkText);
  const combined = `${url} ${title} ${linkText}`.toLowerCase();
  return /(?:^|[/?#&._-])cookies?(?:$|[/?#&._-])|cookie[-_\s]*(?:policy|notice|statement|declaration)|(?:privacy|legal)[/?#&._-]+cookies?/i.test(combined);
}

function summarizeCollectionSurfaces(bundle: CanonicalEvidenceBundle) {
  const inventoryRetained = Array.isArray(bundle.collectionSurfaceObservations);
  const observations = (bundle.collectionSurfaceObservations ?? []).slice(0, 25);
  const surfaceTypes = uniqueStrings(observations.map((row) => row.surfaceType));
  return {
    collectionSurfaceCount: observations.length,
    collectionSurfacesObserved: observations.length > 0,
    fieldTypes: uniqueStrings(observations.flatMap((row) => row.fieldTypes ?? [])),
    hasEmailField: observations.some((row) => row.hasEmailField),
    hasSensitiveFieldHint: observations.some((row) => row.hasSensitiveFieldHint),
    inventoryRetained,
    labels: uniqueStrings(observations.flatMap((row) => row.labels ?? [])).slice(0, 12),
    surfaceTypes
  };
}

export function deriveSensitiveThirdPartyTrackingCorrelation(input: {
  collectionSurfaceObservations: Array<Record<string, unknown>> | null;
  requestPurposeRows: Array<Record<string, unknown>>;
  runtimeCoverageRetained: boolean;
}) {
  const inventoryRetained = Array.isArray(input.collectionSurfaceObservations);
  const sensitiveRows = (input.collectionSurfaceObservations ?? []).filter((row) => row.hasSensitiveFieldHint === true);
  const contextKey = (value: unknown) => {
    const url = firstString(value);
    if (!url) return null;
    try {
      const parsed = new URL(url);
      return `${parsed.hostname.toLowerCase()}${parsed.pathname.replace(/\/$/, "") || "/"}`;
    } catch {
      return null;
    }
  };
  const sensitiveContextKeys = new Set(sensitiveRows.map((row) => contextKey(row.pageUrl)).filter(Boolean));
  const samePageTrackingRows = input.requestPurposeRows.filter((row) => {
    const key = contextKey(row.pageUrl);
    return Boolean(key && sensitiveContextKeys.has(key));
  });
  const coverageUsable = inventoryRetained && input.runtimeCoverageRetained;
  const labels = uniqueStrings(sensitiveRows.flatMap((row) =>
    Array.isArray(row.labels) ? row.labels.filter((value): value is string => typeof value === "string") : []
  )).slice(0, 12);
  const fieldTypes = uniqueStrings(sensitiveRows.flatMap((row) =>
    Array.isArray(row.fieldTypes) ? row.fieldTypes.filter((value): value is string => typeof value === "string") : []
  )).slice(0, 12);
  const sensitiveFormUrls = uniqueStrings(sensitiveRows.map((row) => firstString(row.pageUrl))).slice(0, 5);
  const trackingVendors = uniqueStrings(samePageTrackingRows.map((row) => firstString(row.vendor, row.vendorName))).slice(0, 8);
  const trackingDomains = uniqueStrings(samePageTrackingRows.map((row) => firstString(row.hostname))).slice(0, 8);
  const trackingCategories = uniqueStrings(samePageTrackingRows.map((row) => firstString(row.category))).slice(0, 8);

  return {
    analyticsObserved: trackingCategories.some((category) => /analytics|measurement/i.test(category)),
    correlationMethod: "direct",
    coverageStatus: coverageUsable ? "usable" : "limited",
    directVsInferred: "direct",
    eligibleSensitiveFieldCount: sensitiveRows.length,
    eligibleSensitiveFieldObserved: sensitiveRows.length > 0,
    evidenceConfidence: coverageUsable ? "moderate" : "low",
    evidenceStrengthFlags: coverageUsable ? ["direct_runtime"] : ["coverage_limited"],
    highSensitivityDataCollectionDetected: sensitiveRows.length > 0,
    rawSensitiveFieldCount: sensitiveRows.length,
    samePageOrFlow: samePageTrackingRows.length > 0,
    samePageTrackingObserved: samePageTrackingRows.length > 0,
    sensitiveCollectionSurfaceObserved: sensitiveRows.length > 0,
    sensitiveFieldLabels: labels,
    sensitiveFieldTypes: fieldTypes,
    sensitiveFormUrls,
    status: coverageUsable ? "ok" : "limited",
    tagManagerObserved: trackingCategories.some((category) => /tag[_ -]?manager/i.test(category)),
    thirdPartyTrackingActiveInSameContext: samePageTrackingRows.length > 0,
    thirdPartyTrackingCategories: trackingCategories,
    thirdPartyTrackingDomains: trackingDomains,
    thirdPartyTrackingRequestCount: samePageTrackingRows.length,
    thirdPartyTrackingVendors: trackingVendors
  };
}

function summarizeTransportSecurity(bundle: CanonicalEvidenceBundle) {
  const observation = (bundle.transportSecurityObservations ?? [])[0] ?? null;
  if (!observation) {
    return {
      evidenceRetained: false,
      evidenceRefs: [],
      formTransportCount: 0,
      insecureFormTransportObserved: null,
      mixedContentObserved: null,
      observedCount: 0,
      pageHttpsObserved: null,
      sampledPageUrls: [],
      tlsCertificateObservations: [],
      validTlsCertificate: null,
      httpRedirectsToHttps: null,
    };
  }

  const mixedContent = observation.mixedContent ?? {
    blockedHttpSubresources: [],
    loadedHttpSubresources: [],
    observedCount: 0
  };
  const formTransports = observation.formTransports ?? [];
  const evidenceRefs = (observation.evidenceRefs ?? []).map((ref) => ref.refId).filter(Boolean);
  const retainedTransportEvidence =
    evidenceRefs.length > 0 ||
    observation.httpProbe?.attempted === true ||
    observation.tlsProbe?.attempted === true ||
    observation.finalScheme === "http" ||
    observation.finalScheme === "https";
  return {
    evidenceRetained: retainedTransportEvidence,
    evidenceRefs,
    finalScheme: observation.finalScheme,
    finalUrl: observation.finalUrl,
    formTransportCount: formTransports.length,
    httpProbeAttempted: observation.httpProbe?.attempted === true,
    httpProbeFinalUrl: observation.httpProbe?.finalUrl,
    httpRedirectsToHttps: observation.summary?.httpRedirectsToHttps ?? null,
    insecureFormTransportObserved: observation.summary?.insecureFormTransportObserved ?? false,
    insecureFormTransports: formTransports
      .filter((form) => form.insecureTransportObserved)
      .slice(0, 12)
      .map((form) => ({
        actionScheme: form.actionScheme,
        actionUrl: form.actionUrl,
        fieldTypes: form.fieldTypes,
        hasEmailField: form.hasEmailField,
        hasSensitiveFieldHint: form.hasSensitiveFieldHint,
        method: form.method,
        pageScheme: form.pageScheme,
        pageUrl: form.pageUrl
      })),
    mixedContentObserved: observation.summary?.mixedContentObserved ?? false,
    mixedContentObservedCount: mixedContent.observedCount ?? 0,
    mixedContentSamples: [
      ...(mixedContent.loadedHttpSubresources ?? []),
      ...(mixedContent.blockedHttpSubresources ?? [])
    ].slice(0, 12).map((resource) => ({
      disposition: resource.disposition,
      evidenceSource: resource.evidenceSource,
      hostname: resource.hostname,
      pageUrl: resource.pageUrl,
      resourceType: resource.resourceType,
      url: resource.url
    })),
    observedCount: 1,
    pageHttpsObserved: observation.pageHttpsObserved,
    requestedScheme: observation.requestedScheme,
    sampledPageUrls: observation.sampledPageUrls ?? [],
    tlsProbeAttempted: observation.tlsProbe?.attempted === true,
    tlsProbeErrorCategory: observation.tlsProbe?.errorCategory,
    tlsProbeErrorMessage: observation.tlsProbe?.errorMessage,
    tlsCertificateObservations: (observation.tlsCertificateObservations ?? []).slice(0, 4),
    validTlsCertificate: observation.summary?.validTlsCertificate ?? null,
  };
}

function consentGeometrySummary(geometryEvidence: Record<string, unknown> | null | undefined) {
  return isRecord(geometryEvidence?.summary) ? geometryEvidence.summary : null;
}

type ConsentGeometryAssessmentStatus =
  | "complete"
  | "document_mismatch"
  | "incomplete";

function canonicalConsentDocumentIdentity(value: unknown) {
  const raw = getString(value);
  if (!raw) {
    return null;
  }
  try {
    const url = new URL(raw);
    if (!/^https?:$/.test(url.protocol)) {
      return null;
    }
    const pathname = url.pathname.replace(/\/+$/, "") || "/";
    return `${url.protocol}//${url.host.toLowerCase()}${pathname}`;
  } catch {
    return null;
  }
}

function consentGeometryAssessmentStatus(
  bundle: CanonicalEvidenceBundle,
  geometryEvidence: Record<string, unknown> | null | undefined
): ConsentGeometryAssessmentStatus {
  const summary = consentGeometrySummary(geometryEvidence);
  const access = getRecord(geometryEvidence, "access");
  const geometryDocument = canonicalConsentDocumentIdentity(geometryEvidence?.pageUrl);
  const finalDocument = canonicalConsentDocumentIdentity(getLocalV2FinalDocumentUrl(bundle));
  const complete =
    typeof summary?.firstLayerAccept === "boolean" &&
    typeof summary.firstLayerReject === "boolean" &&
    typeof summary.firstLayerOptions === "boolean" &&
    typeof summary.confidence === "number" &&
    summary.confidence > 0 &&
    Array.isArray(geometryEvidence?.candidates) &&
    (access === null || getString(access.status) === "loaded") &&
    geometryDocument !== null &&
    finalDocument !== null;
  if (!complete) {
    return "incomplete";
  }

  return geometryDocument !== finalDocument
    ? "document_mismatch"
    : "complete";
}

function consentGeometryCmpName(geometryEvidence: Record<string, unknown> | null | undefined) {
  const summary = consentGeometrySummary(geometryEvidence);
  if (summary?.cmpDetected !== true) {
    return null;
  }
  return getString(summary.cmpName);
}

function positiveGeometryBox(candidate: Record<string, unknown>) {
  const boundingBox = isRecord(candidate.boundingBox) ? candidate.boundingBox : null;
  return (
    typeof boundingBox?.width === "number" &&
    typeof boundingBox.height === "number" &&
    boundingBox.width > 0 &&
    boundingBox.height > 0
  );
}

function actionTypeFromRetainedGeometryCandidate(candidate: Record<string, unknown>, hasConsentContext: boolean) {
  const originalActionType = getString(candidate.actionType);
  const label = getString(candidate.label) ?? "";
  const classification = classifyConsentControlLabel({
    ariaLabel: getString(candidate.ariaLabel) ?? undefined,
    hasConsentContext,
    label,
    title: getString(candidate.title) ?? undefined,
    value: getString(candidate.value) ?? undefined
  });
  const classifiedActionType =
    classification.intent === "accept"
      ? "accept_all"
      : classification.intent === "reject"
        ? classification.variant === "reject_with_subscription" || classification.variant === "reject_with_payment"
          ? "other"
          : "reject_all"
        : classification.intent === "options"
          ? classification.variant === "save_preferences" ? "save_preferences" : "manage_preferences"
          : classification.intent === "privacy_opt_out"
            ? "do_not_sell_share"
            : null;
  return {
    actionType: classifiedActionType ?? originalActionType,
    classification
  };
}

function geometryCandidateMatchesDocument(
  candidate: Record<string, unknown>,
  geometryEvidence: Record<string, unknown>
) {
  const frameContext = getRecord(candidate, "frameContext");
  const frameDocument = canonicalConsentDocumentIdentity(frameContext?.frameUrl);
  const geometryDocument = canonicalConsentDocumentIdentity(geometryEvidence.pageUrl);
  return !frameDocument || !geometryDocument || frameDocument === geometryDocument;
}

function geometryCandidateIsConfirmedVisible(
  candidate: Record<string, unknown>,
  geometryEvidence: Record<string, unknown>
) {
  const computedStyle = getRecord(candidate, "computedStyle");
  return (
    getString(candidate.decisionStatus) === "confirmed_visible" &&
    candidate.enabled !== false &&
    candidate.intersectsViewport === true &&
    positiveGeometryBox(candidate) &&
    computedStyle?.display !== "none" &&
    computedStyle?.visibility !== "hidden" &&
    computedStyle?.pointerEvents !== "none" &&
    !(typeof computedStyle?.opacity === "string" && Number.parseFloat(computedStyle.opacity) <= 0.05) &&
    candidate.clippedByScrollableAncestor !== true &&
    geometryCandidateMatchesDocument(candidate, geometryEvidence)
  );
}

function hasStrongConsentModalContainerEvidence(container: Record<string, unknown>) {
  const context = [
    getString(container.selectorHint),
    getString(container.id),
    getString(container.classes),
    getString(container.role),
    getString(container.ariaLabel),
    getString(container.textExcerpt),
    getString(container.htmlExcerpt)
  ].filter(Boolean).join(" ");
  const hasConsentContext =
    /cookie|cookies|consent|privacy|preferences?|settings|choices?|tracking|advertising|marketing|personal data/i.test(context);
  const hasModalSemantics =
    /\b(?:alert)?dialog\b|aria-modal\s*=\s*["']?true|data-borlabs-cookie-consent-required/i.test(context);
  const hasOverlayStyling =
    /(?:position\s*:\s*fixed|\bfixed\b|w-screen|h-screen|inset-0|z-max|dialog-backdrop|cookiebox)/i.test(context);
  return hasConsentContext && (hasModalSemantics || hasOverlayStyling);
}

function reconciledConsentModalContainerIds(
  geometryEvidence: Record<string, unknown> | null | undefined
) {
  const reconciled = new Set<string>();
  if (!geometryEvidence) {
    return reconciled;
  }
  const summary = consentGeometrySummary(geometryEvidence);
  const hasConsentContext = summary?.cmpDetected === true ||
    getObjectArray(geometryEvidence.containers).some((container) =>
      /cookie|cookies|consent|privacy|preferences?|settings|choices?|tracking|advertising|marketing|personal data/i.test(
        getString(container.textExcerpt) ?? ""
      )
    );
  const containersById = new Map(
    getObjectArray(geometryEvidence.containers).flatMap((container) => {
      const containerId = getString(container.containerId);
      return containerId ? [[containerId, container] as const] : [];
    })
  );
  const actionsByContainer = new Map<string, Set<string>>();
  for (const candidate of getObjectArray(geometryEvidence.candidates)) {
    const containerId = getString(candidate.containerId);
    if (
      !containerId ||
      candidate.layer !== "page_body" ||
      !geometryCandidateIsConfirmedVisible(candidate, geometryEvidence)
    ) {
      continue;
    }
    const { actionType } = actionTypeFromRetainedGeometryCandidate(candidate, hasConsentContext);
    if (
      actionType !== "accept_all" &&
      actionType !== "reject_all" &&
      actionType !== "manage_preferences"
    ) {
      continue;
    }
    const actions = actionsByContainer.get(containerId) ?? new Set<string>();
    actions.add(actionType);
    actionsByContainer.set(containerId, actions);
  }
  for (const [containerId, actions] of actionsByContainer) {
    const container = containersById.get(containerId);
    if (
      container &&
      hasStrongConsentModalContainerEvidence(container) &&
      actions.has("accept_all") &&
      (actions.has("reject_all") || actions.has("manage_preferences"))
    ) {
      reconciled.add(containerId);
    }
  }
  return reconciled;
}

function hasAmbiguousVisibleConsentControlCandidate(
  geometryEvidence: Record<string, unknown> | null | undefined
) {
  if (!geometryEvidence) {
    return false;
  }
  const summary = consentGeometrySummary(geometryEvidence);
  const hasConsentContext = summary?.cmpDetected === true ||
    getObjectArray(geometryEvidence.containers).some((container) =>
      /cookie|cookies|consent|privacy|preferences?|settings|choices?|tracking|advertising|marketing|personal data/i.test(
        getString(container.textExcerpt) ?? ""
      )
    );
  const reconciledContainerIds = reconciledConsentModalContainerIds(geometryEvidence);
  return getObjectArray(geometryEvidence.candidates).some((candidate) => {
    const { actionType } = actionTypeFromRetainedGeometryCandidate(candidate, hasConsentContext);
    const containerId = getString(candidate.containerId);
    const canonicalAction =
      actionType === "accept_all" ||
      actionType === "reject_all" ||
      actionType === "manage_preferences" ||
      actionType === "save_preferences";
    return (
      canonicalAction &&
      candidate.layer !== "first_layer" &&
      (!containerId || !reconciledContainerIds.has(containerId)) &&
      geometryCandidateIsConfirmedVisible(candidate, geometryEvidence)
    );
  });
}

function summarizeGeometryFirstLayerConsentChoices(
  geometryEvidence: Record<string, unknown> | null | undefined
) {
  const summary = consentGeometrySummary(geometryEvidence);
  if (!geometryEvidence) {
    return null;
  }
  const hasConsentContext = summary?.cmpDetected === true ||
    getObjectArray(geometryEvidence?.containers).some((container) =>
      /cookie|cookies|consent|privacy|preferences?|settings|choices?|tracking|advertising|marketing|personal data/i.test(
        getString(container.textExcerpt) ?? ""
      )
    );
  const reconciledContainerIds = reconciledConsentModalContainerIds(geometryEvidence);
  const controls = getObjectArray(geometryEvidence?.candidates)
    .map((candidate) => {
      const label = getString(candidate.label);
      const { actionType, classification } = actionTypeFromRetainedGeometryCandidate(candidate, hasConsentContext);
      const containerId = getString(candidate.containerId);
      const geometryVisible =
        (
          candidate.layer === "first_layer" ||
          Boolean(containerId && reconciledContainerIds.has(containerId))
        ) &&
        geometryCandidateIsConfirmedVisible(candidate, geometryEvidence);
      const retainedDecision = getString(candidate.decisionStatus);
      const canonicalAction =
        actionType === "accept_all" ||
        actionType === "reject_all" ||
        actionType === "manage_preferences" ||
        actionType === "save_preferences"
          ? actionType
          : null;
      const visible =
        geometryVisible &&
        retainedDecision === "confirmed_visible";
      return label && visible && canonicalAction
        ? {
            actionType: canonicalAction,
            classifierReasonCodes: classification.reasonCodes,
            label,
            matchedLocale: classification.matchedLocale,
            matchedTerm: classification.matchedTerm,
            matchStrength: classification.matchStrength,
            presentationType: getString(candidate.presentationType) ?? "unknown",
            role: getString(candidate.role) ?? undefined,
            selectorHint: getString(candidate.selectorHint) ?? undefined,
            tagName: getString(candidate.tagName) ?? undefined,
            variant: classification.variant
          }
        : null;
    })
    .filter((control): control is NonNullable<typeof control> => control !== null);
  const acceptLabels = uniqueStrings(controls
    .filter((control) => control.actionType === "accept_all")
    .map((control) => control.label));
  const rejectLabels = uniqueStrings(controls
    .filter((control) => control.actionType === "reject_all")
    .map((control) => control.label));
  const preferenceLabels = uniqueStrings(controls
    .filter((control) => control.actionType === "manage_preferences" || control.actionType === "save_preferences")
    .map((control) => control.label));
  const visibleChoiceLabels = uniqueStrings(controls.map((control) => control.label)).slice(0, 12);
  return {
    acceptControlObserved: acceptLabels.length > 0,
    acceptLabels,
    actionableControlInventoryRetained: controls.length > 0 || visibleChoiceLabels.length > 0,
    capturedBeforeInteraction: true,
    controls: controls.slice(0, 12),
    defaultTogglePurposeLabels: [],
    defaultToggleStatesObserved: null,
    layerInspected: controls.length > 0 ? "first_layer" : "unknown",
    managePreferencesControlObserved: preferenceLabels.length > 0,
    nonEssentialDefaultsOff: null,
    preferenceLabels,
    precheckedOptionalPurposeCount: 0,
    precheckedOptionalPurposeLabels: [],
    rejectControlObserved: rejectLabels.length > 0,
    rejectLabels,
    visibleChoiceLabels,
    geometryAssessment: "complete" as const
  };
}

function summarizeConsentDefaultToggleEvidence(observation: CanonicalEvidenceBundle["consentUiObservations"][number] | null | undefined) {
  const defaultToggleStatesObserved = typeof observation?.defaultToggleStatesObserved === "boolean"
    ? observation.defaultToggleStatesObserved
    : null;
  const nonEssentialDefaultsOff = typeof observation?.nonEssentialDefaultsOff === "boolean"
    ? observation.nonEssentialDefaultsOff
    : null;
  return {
    defaultTogglePurposeLabels: uniqueStrings(getStringArray(observation?.defaultTogglePurposeLabels)).slice(0, 12),
    defaultToggleStatesObserved,
    nonEssentialDefaultsOff,
    precheckedOptionalPurposeCount: typeof observation?.precheckedOptionalPurposeCount === "number"
      ? Math.max(0, observation.precheckedOptionalPurposeCount)
      : 0,
    precheckedOptionalPurposeLabels: uniqueStrings(getStringArray(observation?.precheckedOptionalPurposeLabels)).slice(0, 10)
  };
}

function hasCompletedCanonicalFirstLayerControlInventory(
  observation: CanonicalEvidenceBundle["consentUiObservations"][number] | null | undefined
) {
  if (
    !observation ||
    observation.likelyPresent !== true ||
    observation.layerInspected !== "first_layer"
  ) {
    return false;
  }

  const diagnostics = isRecord(observation.inventoryDiagnostics)
    ? observation.inventoryDiagnostics
    : null;
  const controls = (observation.controls ?? []).filter((control) =>
    control.visible !== false &&
    (
      control.actionType === "accept_all" ||
      control.actionType === "reject_all" ||
      control.actionType === "manage_preferences" ||
      control.actionType === "save_preferences"
    )
  );
  const retainedControlCount = diagnostics?.retainedControlCount;
  const rejectionReasons = Array.isArray(diagnostics?.rejectionReasons)
    ? diagnostics.rejectionReasons
    : null;

  return (
    controls.length > 0 &&
    typeof retainedControlCount === "number" &&
    retainedControlCount >= controls.length &&
    rejectionReasons !== null &&
    rejectionReasons.length === 0
  );
}

function mergeCompletedFirstLayerConsentChoices(
  canonicalChoices: Record<string, unknown>,
  geometryChoices: Record<string, unknown>
) {
  const controls = [
    ...getObjectArray(geometryChoices.controls),
    ...getObjectArray(canonicalChoices.controls)
  ].filter((control, index, all) => {
    const key = `${getString(control.actionType) ?? "other"}:${getString(control.label)?.toLowerCase() ?? ""}`;
    return all.findIndex((candidate) =>
      `${getString(candidate.actionType) ?? "other"}:${getString(candidate.label)?.toLowerCase() ?? ""}` === key
    ) === index;
  }).slice(0, 12);
  const labelsFor = (...actionTypes: string[]) => uniqueStrings(controls
    .filter((control) => actionTypes.includes(getString(control.actionType) ?? ""))
    .map((control) => getString(control.label)));
  const acceptLabels = labelsFor("accept_all");
  const rejectLabels = labelsFor("reject_all");
  const preferenceLabels = labelsFor("manage_preferences", "save_preferences");

  return {
    ...canonicalChoices,
    ...geometryChoices,
    acceptControlObserved: acceptLabels.length > 0,
    acceptLabels,
    actionableControlInventoryRetained: controls.length > 0,
    controls,
    layerInspected: "first_layer" as const,
    managePreferencesControlObserved: preferenceLabels.length > 0,
    preferenceLabels,
    rejectControlObserved: rejectLabels.length > 0,
    rejectLabels,
    visibleChoiceLabels: uniqueStrings(controls.map((control) => getString(control.label))).slice(0, 12)
  };
}

export function summarizeFirstLayerConsentChoices(
  bundle: CanonicalEvidenceBundle,
  geometryEvidence?: Record<string, unknown> | null
) {
  const observation = (bundle.consentUiObservations ?? []).find((row) => row.likelyPresent) ??
    (bundle.consentUiObservations ?? [])[0] ??
    null;
  const defaultToggleEvidence = summarizeConsentDefaultToggleEvidence(observation);
  const geometryChoices = summarizeGeometryFirstLayerConsentChoices(geometryEvidence);
  const geometryStatus = consentGeometryAssessmentStatus(bundle, geometryEvidence);
  const controls = (observation?.controls ?? []).flatMap((control) => {
    const label = getString(control?.label);
    return label && control?.visible !== false ? [{ ...control, label }] : [];
  });
  const visibleChoiceLabels = uniqueStrings(controls.map((control) => control.label)).slice(0, 12);
  const acceptLabels = uniqueStrings(controls
    .filter((control) => control.actionType === "accept_all")
    .map((control) => control.label));
  const rejectLabels = uniqueStrings(controls
    .filter((control) => control.actionType === "reject_all")
    .map((control) => control.label));
  const preferenceLabels = uniqueStrings(controls
    .filter((control) => control.actionType === "manage_preferences" || control.actionType === "save_preferences")
    .map((control) => control.label));

  if (!observation) {
    return geometryChoices
      ? {
          ...geometryChoices,
          ...defaultToggleEvidence
        }
      : null;
  }

  const canonicalChoices = {
    acceptControlObserved: acceptLabels.length > 0,
    acceptLabels,
    actionableControlInventoryRetained: controls.length > 0 || visibleChoiceLabels.length > 0,
    capturedBeforeInteraction: true,
    controls: controls.slice(0, 12).map((control) => ({
      actionType: control.actionType,
      classifierReasonCodes: control.classifierReasonCodes,
      label: control.label,
      matchedLocale: control.matchedLocale,
      matchedTerm: control.matchedTerm,
      matchStrength: control.matchStrength,
      role: control.role,
      selectorHint: control.selectorHint,
      tagName: control.tagName,
      variant: control.classifierVariant,
      visible: control.visible === true
    })),
    ...defaultToggleEvidence,
    layerInspected: observation.layerInspected ?? (visibleChoiceLabels.length > 0 ? "first_layer" : "unknown"),
    managePreferencesControlObserved: preferenceLabels.length > 0,
    preferenceLabels,
    rejectControlObserved: rejectLabels.length > 0,
    rejectLabels,
    observedAtMs: observation.observedAtMs,
    policyLinks: uniqueStrings((observation.evidenceRefs ?? [])
      .map((evidenceRef) => evidenceRef.url)
      .filter((url): url is string => Boolean(url && /privacy|cookie|consent|policy/i.test(url))))
      .slice(0, 6),
    textSnippet: boundedTextExcerpt(observation.textExcerpt),
    visibleChoiceLabels
  };
  if (geometryStatus === "document_mismatch") {
    return {
      acceptControlObserved: false,
      acceptLabels: [],
      actionableControlInventoryRetained: false,
      capturedBeforeInteraction: true,
      controls: [],
      ...defaultToggleEvidence,
      geometryAssessment: "document_mismatch" as const,
      layerInspected: "unknown" as const,
      managePreferencesControlObserved: false,
      preferenceLabels: [],
      rejectControlObserved: false,
      rejectLabels: [],
      visibleChoiceLabels: []
    };
  }
  if (geometryStatus === "incomplete") {
    // Geometry is an auxiliary corroboration channel. A late or budget-limited
    // geometry capture must not erase an already completed canonical DOM
    // inventory from the same pre-consent document.
    if (hasCompletedCanonicalFirstLayerControlInventory(observation)) {
      return {
        ...canonicalChoices,
        geometryAssessment: "incomplete" as const
      };
    }
    return {
      acceptControlObserved: false,
      acceptLabels: [],
      actionableControlInventoryRetained: false,
      capturedBeforeInteraction: true,
      controls: [],
      defaultTogglePurposeLabels: [],
      defaultToggleStatesObserved: null,
      geometryAssessment: "incomplete" as const,
      layerInspected: "unknown" as const,
      managePreferencesControlObserved: false,
      nonEssentialDefaultsOff: null,
      preferenceLabels: [],
      precheckedOptionalPurposeCount: 0,
      precheckedOptionalPurposeLabels: [],
      rejectControlObserved: false,
      rejectLabels: [],
      visibleChoiceLabels: []
    };
  }
  if (geometryStatus === "complete" && geometryChoices) {
    if (hasCompletedCanonicalFirstLayerControlInventory(observation)) {
      return mergeCompletedFirstLayerConsentChoices(
        canonicalChoices,
        geometryChoices as Record<string, unknown>
      );
    }
    return {
      ...geometryChoices,
      ...defaultToggleEvidence
    };
  }
  return canonicalChoices;
}

export function reconcileConsentSurfaceInspectionWithGeometry(
  bundle: CanonicalEvidenceBundle,
  geometryEvidence: Record<string, unknown> | null | undefined,
  inspection: ReturnType<typeof deriveConsentSurfaceInspectionOutcome>
) {
  // The canonical bundle may already contain a completed, geometry-backed
  // consent observation. A missing optional auxiliary mirror must not erase
  // that retained structured evidence.
  if (!geometryEvidence) {
    const completedCanonicalFirstLayerInventory =
      inspection.inspectionCompleted === true &&
      inspection.coverageStatus === "complete" &&
      inspection.consentSurfaceObserved === true &&
      inspection.actionableControlObserved === true &&
      (bundle.consentUiObservations ?? []).some((observation) =>
        observation.likelyPresent === true &&
        observation.layerInspected === "first_layer" &&
        (observation.controls ?? []).some((control) =>
          control.visible !== false &&
          (
            control.actionType === "accept_all" ||
            control.actionType === "reject_all" ||
            control.actionType === "manage_preferences" ||
            control.actionType === "save_preferences"
          )
        )
      );
    if (
      completedCanonicalFirstLayerInventory ||
      (!inspection.consentSurfaceObserved && !inspection.actionableControlObserved)
    ) {
      return inspection;
    }
    return {
      ...inspection,
      outcome: "indeterminate_limited_coverage" as const,
      coverageStatus: "limited" as const,
      inspectionCompleted: false,
      consentSurfaceObserved: false,
      actionableControlObserved: false,
      limitationKeys: uniqueStrings([
        ...inspection.limitationKeys,
        "consent_control_geometry_incomplete"
      ])
    };
  }
  const geometryStatus = consentGeometryAssessmentStatus(bundle, geometryEvidence);
  if (geometryStatus === "incomplete") {
    const completedCanonicalFirstLayerInventory =
      (bundle.consentUiObservations ?? []).some((observation) =>
        hasCompletedCanonicalFirstLayerControlInventory(observation)
      );
    if (completedCanonicalFirstLayerInventory) {
      return {
        ...inspection,
        outcome: "actionable_surface_observed" as const,
        consentSurfaceObserved: true,
        actionableControlObserved: true
      };
    }
    if (!inspection.consentSurfaceObserved && !inspection.actionableControlObserved) {
      return inspection;
    }
    return {
      ...inspection,
      outcome: "indeterminate_limited_coverage" as const,
      coverageStatus: "limited" as const,
      inspectionCompleted: false,
      consentSurfaceObserved: false,
      actionableControlObserved: false,
      limitationKeys: uniqueStrings([
        ...inspection.limitationKeys,
        "consent_control_geometry_incomplete"
      ])
    };
  }
  if (geometryStatus === "document_mismatch") {
    return {
      ...inspection,
      outcome: "indeterminate_limited_coverage" as const,
      coverageStatus: "limited" as const,
      inspectionCompleted: false,
      consentSurfaceObserved: false,
      actionableControlObserved: false,
      limitationKeys: uniqueStrings([
        ...inspection.limitationKeys,
        "consent_control_geometry_document_mismatch"
      ])
    };
  }

  const choices = summarizeGeometryFirstLayerConsentChoices(geometryEvidence);
  const actionableControlObserved = choices?.actionableControlInventoryRetained === true;
  if (actionableControlObserved) {
    return {
      ...inspection,
      outcome: "actionable_surface_observed" as const,
      consentSurfaceObserved: true,
      actionableControlObserved: true
    };
  }

  const ambiguousVisibleConsentControlCandidate =
    hasAmbiguousVisibleConsentControlCandidate(geometryEvidence);
  if (ambiguousVisibleConsentControlCandidate) {
    return {
      ...inspection,
      outcome: "indeterminate_limited_coverage" as const,
      coverageStatus: "limited" as const,
      inspectionCompleted: false,
      consentSurfaceObserved: false,
      actionableControlObserved: false,
      limitationKeys: uniqueStrings([
        ...inspection.limitationKeys,
        "consent_control_geometry_visible_candidate_layer_ambiguous"
      ])
    };
  }

  const geometryResolvedLimitationKeys = new Set([
    "consent_ui_capture_timed_out",
    "cmp_runtime_without_actionable_surface",
    "consent_surface_inspection_observation_incomplete",
    "consent_surface_inspection_settled_inventory_missing"
  ]);
  const inspectionAlreadyComplete =
    inspection.inspectionCompleted &&
    inspection.coverageStatus === "complete";
  const geometryResolvesEveryLimitation =
    inspection.limitationKeys.length > 0 &&
    inspection.limitationKeys.every((key) => geometryResolvedLimitationKeys.has(key));
  if (!inspectionAlreadyComplete && !geometryResolvesEveryLimitation) {
    return {
      ...inspection,
      outcome: "indeterminate_limited_coverage" as const,
      consentSurfaceObserved: false,
      actionableControlObserved: false
    };
  }

  return {
    ...inspection,
    outcome: "no_surface_observed_complete_coverage" as const,
    coverageStatus: "complete" as const,
    inspectionCompleted: true,
    inspectedPreInteraction: true,
    consentSurfaceObserved: false,
    actionableControlObserved: false,
    evidenceSources: uniqueStrings([...inspection.evidenceSources, "geometry"]),
    limitationKeys: inspection.limitationKeys.filter((key) => !geometryResolvedLimitationKeys.has(key))
  };
}

function hasRetainedFirstLayerConsentControlInventory(choices: ReturnType<typeof summarizeFirstLayerConsentChoices>) {
  if (!choices) {
    return false;
  }
  return (
    choices.layerInspected === "first_layer" &&
    (
      choices.actionableControlInventoryRetained === true ||
      choices.acceptControlObserved === true ||
      choices.rejectControlObserved === true ||
      choices.managePreferencesControlObserved === true ||
      choices.visibleChoiceLabels.length > 0
    )
  );
}

export function selectBoundedPreconsentRequestPurposeRows(
  rows: Array<Record<string, unknown>>,
  limit = 25
) {
  if (rows.length <= limit) {
    return rows;
  }
  const promotionGradeRows = rows.filter(isPromotionGradePreconsentRequestRow);
  const otherRows = rows.filter((row) => !isPromotionGradePreconsentRequestRow(row));
  return [...promotionGradeRows, ...otherRows]
    .slice(0, limit)
    .sort((left, right) => {
      const leftTs = typeof left.tsMs === "number" ? left.tsMs : Number.POSITIVE_INFINITY;
      const rightTs = typeof right.tsMs === "number" ? right.tsMs : Number.POSITIVE_INFINITY;
      return leftTs - rightTs;
    });
}

export function firstPromotionGradePreconsentRequestMs(rows: Array<Record<string, unknown>>) {
  return firstNumber(
    ...rows
      .filter(isPromotionGradePreconsentRequestRow)
      .map((row) => row.tsMs)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
      .sort((left, right) => left - right)
  );
}

export function classifyRetainedRequestActivity(input: {
  category: string;
  collectionEndpointObserved: boolean;
  regulatoryRelevance?: string[];
  resourceType?: string | null;
  url?: string | null;
}) {
  const relevance = (input.regulatoryRelevance ?? []).join(" ").toLowerCase();
  const url = input.url ?? "";
  const hostname = hostnameFromUrl(url);
  const canonicalVendorEndpointObserved = Boolean(
    inferDirectEndpointVendorFromUrl(url) &&
    /^(?:beacon|fetch|xhr)$/i.test(input.resourceType ?? "")
  );
  const collectionEndpointObserved = input.collectionEndpointObserved || canonicalVendorEndpointObserved;
  if (
    isCanonicalIdSyncEndpoint(hostname) ||
    /identifier_sync|identity_resolution|cookie_sync/.test(relevance) ||
    /(?:user|id|cookie)[_-]?sync|sync(?:\.gif|\/)|setuid|getuid/i.test(url)
  ) {
    return "identifier_synchronization";
  }
  if (collectionEndpointObserved && /advertising|adtech|retargeting|marketing/i.test(input.category)) {
    return "ad_request";
  }
  if (collectionEndpointObserved) {
    return "tracker_beacon";
  }
  return "library";
}

function retainedRequestPathSample(value: string | null | undefined) {
  if (!value) return null;
  try {
    return new URL(value).pathname.slice(0, 240);
  } catch {
    return null;
  }
}

function retainedRequestUrlSample(value: string | null | undefined) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    const redactedQuery = [...parsed.searchParams.keys()]
      .slice(0, 16)
      .map((key) => `${encodeURIComponent(key)}=[redacted]`)
      .join("&");
    return `${parsed.origin}${parsed.pathname}${redactedQuery ? `?${redactedQuery}` : ""}`.slice(0, 640);
  } catch {
    return null;
  }
}

const LOCAL_V2_HARD_NO_GO_TEXT_PATTERN =
  /access to this site has been denied|access denied|forbidden|http\s*403|403\s*-\s*forbidden|unable to give you access to (?:our|this) site|unable to access (?:www\.)?[a-z0-9.-]+|security issue was automatically identified|security service to protect itself from online attacks|request blocked|bot protection|you(?:'|’)?ve been blocked|you have been blocked|cloudflare ray id|vercel security checkpoint|vercel sicherheitskontrollpunkt|checking your browser|wir überprüfen ihren browser|performing security verification|security check|protected by kasada|x-kpsdk|detected unusual behaviour[^.]{0,180}(?:bot|browser)|resembles that of a bot|verif(?:y|ies|ying)[^.]{0,120}not a bot|domain(?:s)? (?:is |are )?(?:for sale|may be for sale)|placeholder page|\bno company found\b|couldn['’]t find your company|missing (?:tenant|company|account) (?:slug|identifier)|(?:click|klicke)\s+(?:the|auf die)\s+(?:button|schaltfläche)\s+(?:below|unten)[^.]{0,140}(?:continue\s+(?:shopping|to proceed)|(?:mit dem )?einkauf\s+fortzufahren)/i;
const LOCAL_V2_CHALLENGE_NO_GO_TEXT_PATTERN = /(?:click|klicke)\s+(?:the|auf die)\s+(?:button|schaltfläche)\s+(?:below|unten)[^.]{0,140}(?:continue\s+(?:shopping|to proceed)|(?:mit dem )?einkauf\s+fortzufahren)/i;
const LOCAL_V2_VERCEL_SECURITY_CHALLENGE_PATTERN =
  /(?:^|\/)\.well-known\/vercel\/security\/|\/request-challenge(?:$|[?#])|challenge\.v2\.(?:min\.js|wasm)(?:$|[?#])|\/cdn-cgi\/challenge-platform\/|\/cdn-cgi\/challenge|challenges\.cloudflare\.com/i;
const LOCAL_V2_SCREENSHOT_PLACEHOLDER_PATTERN =
  /1x1 screenshot placeholder used|screenshot placeholder/i;
const LOCAL_V2_PAGE_CONTEXT_CLOSED_PATTERN =
  /page\/context closed|target page, context or browser has been closed|page\.screenshot: target page/i;

function boundedTextExcerpt(value: string | null | undefined) {
  return value ? value.replace(/\s+/g, " ").trim().slice(0, 240) : null;
}

function collectLocalV2NoGoTextCandidates(bundle: CanonicalEvidenceBundle) {
  return uniqueStrings([
    ...(bundle.domSnapshots ?? []).map((snapshot) => boundedTextExcerpt(snapshot.textExcerpt)),
    ...(bundle.consentUiObservations ?? []).map((observation) => boundedTextExcerpt(observation.textExcerpt)),
    ...(bundle.policySurfaceObservations ?? []).map((observation) => boundedTextExcerpt(observation.textExcerpt)),
    ...(bundle.screenshots ?? []).map((screenshot) => boundedTextExcerpt(screenshot.url))
  ]);
}

function collectLocalV2ModuleErrors(bundle: CanonicalEvidenceBundle) {
  return uniqueStrings((bundle.modulesRun ?? []).flatMap((moduleRun) => moduleRun.errors ?? []));
}

function getNetworkEventUrl(event: NonNullable<CanonicalEvidenceBundle["networkEvents"]>[number]) {
  return getString((event as { requestUrl?: unknown }).requestUrl) ?? getString(event.url);
}

function isLocalV2SecurityChallengeRequest(event: NonNullable<CanonicalEvidenceBundle["networkEvents"]>[number]) {
  const url = getNetworkEventUrl(event);
  return Boolean(url && LOCAL_V2_VERCEL_SECURITY_CHALLENGE_PATTERN.test(url));
}

function localV2VisualCapture(bundle: CanonicalEvidenceBundle) {
  const visualCapture = isRecord((bundle as { visualCapture?: unknown }).visualCapture)
    ? (bundle as { visualCapture?: Record<string, unknown> }).visualCapture
    : null;
  const status = getString(visualCapture?.status);
  const failureReason = getString(visualCapture?.failureReason);
  const captureMethod = getString(visualCapture?.captureMethod);
  const notes = Array.isArray(visualCapture?.notes)
    ? uniqueStrings(visualCapture.notes.map((note) => getString(note)).filter((note): note is string => Boolean(note)))
    : [];
  return {
    captureMethod,
    failureReason,
    notes,
    status
  };
}

function getProvidedLocalV2ScanNoGoAssessment(bundle: CanonicalEvidenceBundle) {
  const scanNoGoAssessment = bundle.scan_no_go_assessment ?? bundle.scanNoGoAssessment ?? null;
  const visualAccessReview = bundle.visual_access_review ?? bundle.visualAccessReview ?? null;
  if (scanNoGoAssessment?.decision !== "no_go" || visualAccessReview?.go_no_go !== "NO_GO") {
    return null;
  }
  const primaryReasonCode =
    scanNoGoAssessment.reasonCodes[0] ??
    visualAccessReview.reason_code ??
    "scan_no_go_assessment";
  const pageState = visualAccessReview.page_state;
  return {
    matchedText: visualAccessReview.short_explanation,
    pageState,
    primaryReasonCode,
    scanNoGoAssessment,
    visualAccessReview
  };
}

export function buildLocalV2ScanNoGoAssessment(input: {
  bundle: CanonicalEvidenceBundle;
  consentSurfaceLikelyPresent: boolean;
  finalUrl?: string | null;
  localOutDir?: string | null;
  runtimeActivityObserved: boolean;
  lowRuntimeActivity: boolean;
  requestedUrl?: string | null;
}) {
  const providedAssessment = input.bundle.scan_no_go_assessment ?? input.bundle.scanNoGoAssessment ?? null;
  const providedScanNoGo = getProvidedLocalV2ScanNoGoAssessment(input.bundle);
  if (providedScanNoGo) {
    return providedScanNoGo;
  }
  if (providedAssessment) {
    return null;
  }

  const textCandidates = collectLocalV2NoGoTextCandidates(input.bundle);
  const matchedText = textCandidates.find((text) => LOCAL_V2_HARD_NO_GO_TEXT_PATTERN.test(text));
  const matchedPlaceholderText = matchedText && /domain(?:s)? (?:is |are )?(?:for sale|may be for sale)|placeholder page/i.test(matchedText)
    ? matchedText
    : null;
  const matchedWrongSiteText = matchedText && /\bno company found\b|couldn['’]t find your company|missing (?:tenant|company|account) (?:slug|identifier)/i.test(matchedText)
    ? matchedText
    : null;
  const requestedRootDomain = registrableDomain(hostnameFromUrl(input.requestedUrl));
  const finalRootDomain = registrableDomain(hostnameFromUrl(input.finalUrl));
  const crossRegistrableDomainNavigation = Boolean(
    requestedRootDomain &&
    finalRootDomain &&
    requestedRootDomain !== finalRootDomain,
  );
  const crossDomainEvidenceText = crossRegistrableDomainNavigation
    ? `The scan landed on ${finalRootDomain} instead of the requested ${requestedRootDomain}.`
    : null;
  const moduleErrors = collectLocalV2ModuleErrors(input.bundle);
  const visualCapture = localV2VisualCapture(input.bundle);
  const screenshot = (input.bundle.screenshots ?? [])
    .filter(isPreConsentScreenshotArtifact)
    .sort((left, right) => preConsentScreenshotRank(left) - preConsentScreenshotRank(right))[0] ?? null;
  const screenshotPlaceholderUsed = visualCapture.status === "placeholder" ||
    visualCapture.failureReason === "placeholder_used" ||
    moduleErrors.some((error) => LOCAL_V2_SCREENSHOT_PLACEHOLDER_PATTERN.test(error));
  const pageContextClosed = moduleErrors.some((error) => LOCAL_V2_PAGE_CONTEXT_CLOSED_PATTERN.test(error));
  const visualCaptureFailed = screenshotPlaceholderUsed && (pageContextClosed || visualCapture.failureReason === "placeholder_used");
  const retainedVisualErrorShell = isLikelyRetainedVisualErrorShell({
    bundle: input.bundle,
    localOutDir: input.localOutDir,
    lowRuntimeActivity: input.lowRuntimeActivity,
    screenshot
  });
  if (!matchedText && !visualCaptureFailed && !retainedVisualErrorShell) {
    return null;
  }

  const primaryReasonCode = matchedPlaceholderText
    ? "parked_or_placeholder"
    : matchedWrongSiteText
      ? "wrong_site_or_soft_404"
      : matchedText
        ? LOCAL_V2_CHALLENGE_NO_GO_TEXT_PATTERN.test(matchedText)
          ? "captcha_or_challenge"
          : "access_denied_or_forbidden_page"
    : retainedVisualErrorShell
      ? "retained_visual_error_shell"
      : "visual_capture_failed_or_placeholder";
  const visualPageState = matchedPlaceholderText
    ? "parked_or_placeholder"
    : matchedWrongSiteText
      ? "wrong_site_or_soft_404"
      : matchedText
        ? LOCAL_V2_CHALLENGE_NO_GO_TEXT_PATTERN.test(matchedText) ? "captcha_or_challenge" : "access_blocked"
        : retainedVisualErrorShell ? "visual_error_shell" : "capture_failed";
  const evidenceText = matchedText ??
    crossDomainEvidenceText ??
    (retainedVisualErrorShell
      ? "The retained pre-consent screenshot appears to be a full-viewport visual error shell with negligible runtime evidence, not the normal public site."
      : "The pre-consent runtime scanner retained only a 1x1 screenshot placeholder after page/context closure and screenshot capture failures.");
  const evidenceRefs = [
    "scan_runtime_artifacts.scan_no_go_assessment",
    "scan_runtime_artifacts.visual_access_review",
    screenshot ? "scan_runtime_artifacts.visual_evidence_artifacts" : null
  ].filter((value): value is string => Boolean(value));
  const shortExplanation = matchedPlaceholderText
    ? `The retained initial-load evidence showed a parked or placeholder page instead of the normal public site: "${matchedPlaceholderText}"`
    : matchedWrongSiteText
      ? `The retained initial-load evidence showed an application error or wrong-site page instead of the normal public site: "${matchedWrongSiteText}"`
      : matchedText
    ? `The retained initial-load evidence showed a ${LOCAL_V2_CHALLENGE_NO_GO_TEXT_PATTERN.test(matchedText) ? "security challenge" : "access-denied or forbidden page"} instead of the normal public site: "${matchedText}"`
    : evidenceText;
  const visualAccessReview = {
    artifact_ref: screenshot ? "local_v2:screenshot_pre_consent" : null,
    confidence: 0.95,
    go_no_go: "NO_GO",
    key_visual_evidence: [evidenceText],
    page_state: visualPageState,
    reason_code: primaryReasonCode,
    short_explanation: shortExplanation,
    status: "available",
    version: "visual-access-review-v1"
  };
  const scanNoGoAssessment = {
    status: "available",
    version: "scan-no-go-assessment-v1",
    decision: "no_go",
    scanNoGoConfidence: 0.95,
    visualScreenshotNoGoConfidence: 0.95,
    reasonCodes: [primaryReasonCode, "scan_no_go_corroborated"],
    corroboratorCodes: [
      matchedText ? "access_block_text_observed" : null,
      crossRegistrableDomainNavigation ? "final_registrable_domain_differed" : null,
      visualCaptureFailed ? "visual_capture_failed" : null,
      screenshotPlaceholderUsed ? "screenshot_placeholder_used" : null,
      pageContextClosed ? "page_context_closed" : null,
      input.lowRuntimeActivity ? "low_runtime_activity" : null,
      input.runtimeActivityObserved && !input.lowRuntimeActivity ? "runtime_activity_observed_on_block_page" : null,
      screenshot ? "retained_visual_artifact_available" : null
    ].filter((value): value is string => Boolean(value)),
    contradictorCodes: [],
    supportingSignals: {
      challengeSignalsDetected: true,
      consentOrTrackerEvidenceObserved: input.consentSurfaceLikelyPresent,
      documentStatusBlocked: Boolean(matchedText),
      domContentLow: true,
      expectedOriginReached: !crossRegistrableDomainNavigation,
      firstPartyIdentityObserved: !crossRegistrableDomainNavigation,
      lowRuntimeActivity: input.lowRuntimeActivity,
      pageContextClosed,
      retainedVisualErrorShell,
      runtimeActivityObserved: input.runtimeActivityObserved,
      retainedVisualArtifactAvailable: Boolean(screenshot),
      screenshotPlaceholderUsed,
      visualCaptureFailed,
      visualCaptureFailureReason: visualCapture.failureReason,
      visualCaptureStatus: visualCapture.status,
      visualHardNoGoPageState: true,
      visualNoGo: true,
      visualPageState
    },
    evidenceRefs
  };

  return {
    matchedText: evidenceText,
    pageState: visualPageState,
    primaryReasonCode,
    scanNoGoAssessment,
    visualAccessReview
  };
}

export function buildLocalV2NoGoSnapshotFields(reasonCode: string, pageState: string) {
  const presentation = resolveScanNoGoPresentation(reasonCode, pageState);
  return {
    access_posture_class: "early_loss",
    block_page_classification: presentation.snapshotBlockPageClassification,
    blocked_flag: true,
    challenge_suspected: presentation.limitationKind === "scanner_access_limitation",
    coverage_level: "limited_none",
    homepage_fetch_status: presentation.snapshotHomepageFetchStatus,
    scan_outcome: presentation.snapshotScanOutcome,
    stop_reason_code: presentation.snapshotStopReasonCode,
    stop_reason_detail: presentation.snapshotStopReasonDetail,
    stop_reason_label: presentation.snapshotStopReasonLabel,
  } as const;
}

function buildMaterializedLocalV2Detail(
  scanRecord: ScanDetailResponse,
  bundle: CanonicalEvidenceBundle,
  options: {
    consentControlGeometryEvidence?: Record<string, unknown> | null;
    gdprTransparencyEvidenceProfile?: GdprTransparencyProductionEvidenceProfile | string | null;
    localOutDir?: string | null;
    policyTextEvidenceContext?: PolicyTextEvidenceContext;
    scanArtifactUri?: string | null;
  } = {}
): ScanDetailResponse {
  const requestedHost = scanRecord.scan.domainHostname ?? hostnameFromUrl(bundle.normalizedUrl ?? bundle.url);
  const finalDocumentUrl = getLocalV2FinalDocumentUrl(bundle);
  const requestedDocumentUrl = safeLocalV2DocumentUrl(
    bundle.normalizedUrl,
    bundle.url,
    requestedHost ? `https://${requestedHost}/` : null
  );
  const canonicalDocumentUrl = safeLocalV2DocumentUrl(
    finalDocumentUrl &&
      !isAuxiliaryNavigationContextUrl(finalDocumentUrl)
      ? finalDocumentUrl
      : null,
    requestedDocumentUrl,
    requestedHost ? `https://${requestedHost}/` : null
  );
  const documentHost = hostnameFromUrl(canonicalDocumentUrl) ?? requestedHost;
  const rootDomain = registrableDomain(documentHost);
  const networkEvents = (bundle.networkEvents ?? []).filter((event) =>
    isPrimaryAssessmentRuntimeEvent(event, canonicalDocumentUrl)
  );
  const networkResponseEvents = (bundle.networkResponseEvents ?? []).filter((event) =>
    isPrimaryAssessmentRuntimeEvent(event, canonicalDocumentUrl)
  );
  const cookieEvents = (bundle.cookieEvents ?? []).filter((event) =>
    isPrimaryAssessmentRuntimeEvent(event, canonicalDocumentUrl)
  );
  const allVendorRows = buildVendorEvidence(bundle);
  const vendorRows = allVendorRows.filter((vendor) => vendor.vendorCategory !== "cmp");
  const thirdPartyRequests = networkEvents.filter((event) =>
    isThirdPartyRuntimeEventForDocument(event, canonicalDocumentUrl)
  );
  const thirdPartyDomains = uniqueStrings(thirdPartyRequests.map((event) => event.hostname ?? hostnameFromUrl(event.url)));
  const preconsentRequests = thirdPartyRequests.filter((event) => event.consentStateAtTime === "pre_consent");
  const preconsentRequestUrls = uniqueStrings(preconsentRequests.map((event) => requestUrl(event)));
  const preconsentCookies = cookieEvents.filter((event) => event.consentStateAtTime === "pre_consent");
  const cookieNames = uniqueStrings(cookieEvents.map((event) => cookieName(event)));
  const preconsentCookieNames = uniqueStrings(preconsentCookies.map((event) => cookieName(event)));
  const cookieIdentityCount = countCanonicalCookieObservations(cookieEvents);
  const preconsentCookieIdentityCount = countCanonicalCookieObservations(preconsentCookies);
  const cookieEvidenceCounts = summarizeRuntimeCookieEvidenceCounts(cookieEvents);
  const initialSnapshotCookieEvents = cookieEvents.filter((event) =>
    /^initial_cookie_snapshot$/i.test(event.operation ?? "") ||
    /^browser_snapshot$/i.test(event.operation ?? "") && minimumNumber(event.timestampMs) === null
  );
  const iframeEvents = sanitizeIframeEvents(bundle, rootDomain);
  const preconsentIframeEvents = iframeEvents.filter((event) => event.preConsent);
  const cmp = bundle.cmpRuntimeObservations?.[0] ?? null;
  const geometryCmpName = consentGeometryCmpName(options.consentControlGeometryEvidence);
  const cmpVendorName = firstString(cmp?.product, cmp?.vendor, cmp?.entity, geometryCmpName);
  const cmpSignalLabels = uniqueStrings((cmp?.signals ?? []).map((signal) =>
    firstString(signal.matchedValueRedacted, signal.matchedField, signal.signalType)
  ).concat(geometryCmpName));
  const firstLayerConsentChoices = summarizeFirstLayerConsentChoices(bundle, options.consentControlGeometryEvidence);
  const firstLayerConsentControlInventoryRetained = hasRetainedFirstLayerConsentControlInventory(firstLayerConsentChoices);
  const retainedConsentSurfaceObservations = (bundle.consentUiObservations ?? []).filter(
    (observation) => observation.likelyPresent
  );
  const firstConsentSurfaceVisibleMs = firstNumber(
    ...retainedConsentSurfaceObservations
      .map((observation) => observation.observedAtMs)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
      .sort((left, right) => left - right)
  );
  const consentSurfaceLikelyPresent = Boolean(
    bundle.derivedRuntimeSignals?.consentBannerLikelyPresent === true ||
    firstLayerConsentControlInventoryRetained ||
    retainedConsentSurfaceObservations.length > 0
  );
  const runtimeCoverageStatus = bundle.runtimeCoverage?.coverageStatus ?? null;
  const runtimeLimitationKeys = bundle.runtimeCoverage?.limitationKeys ?? [];
  const runtimeObservationCounts = bundle.runtimeCoverage?.observationCounts;
  const preConsentRuntimeFailed = runtimeLimitationKeys.includes("pre_consent_runtime_failed");
  const meaningfulRuntimeSignalsRetained =
    (runtimeObservationCounts?.thirdPartyRequests ?? 0) > 0 ||
    (runtimeObservationCounts?.cookiesBeforeConsent ?? 0) > 0 ||
    preconsentCookies.length > 0 ||
    (runtimeObservationCounts?.normalizedVendors ?? 0) > 0 ||
    (runtimeCoverageStatus === null && (preconsentRequests.length > 0 || vendorRows.length > 0));
  const visualCapture = localV2VisualCapture(bundle);
  const retainedPreConsentScreenshot = (bundle.screenshots ?? []).some(isPreConsentScreenshotArtifact);
  const preConsentRuntimeReliable = !preConsentRuntimeFailed || retainedPreConsentScreenshot || visualCapture.status === "available";
  const runtimeCountsRetained =
    !preConsentRuntimeFailed &&
    preConsentRuntimeReliable &&
    (runtimeCoverageStatus === "usable" || meaningfulRuntimeSignalsRetained);
  const successfulResponseObserved = networkResponseEvents.some((event) =>
    typeof event.status === "number" && event.status >= 200 && event.status < 400
  );
  const substantiveDomObserved = (bundle.domSnapshots ?? []).some((snapshot) =>
    (getString(snapshot.textExcerpt)?.replace(/\s+/g, " ").trim().length ?? 0) >= 80
  );
  const meaningfulDocumentEvidenceObserved = successfulResponseObserved || substantiveDomObserved;
  const runtimeActivityObserved =
    meaningfulDocumentEvidenceObserved ||
    preconsentCookies.length > 0 ||
    vendorRows.length > 0 ||
    thirdPartyRequests.length > 0 ||
    cookieEvents.length > 0;
  const lowRuntimeActivity =
    !meaningfulDocumentEvidenceObserved &&
    thirdPartyRequests.length === 0 &&
    vendorRows.length === 0 &&
    cookieEvents.every((event) => event.thirdParty !== true && event.cookieParty !== "third_party");
  const localV2NoGo = buildLocalV2ScanNoGoAssessment({
    bundle,
    consentSurfaceLikelyPresent,
    finalUrl: canonicalDocumentUrl,
    localOutDir: options.localOutDir,
    runtimeActivityObserved,
    lowRuntimeActivity,
    requestedUrl: requestedDocumentUrl,
  });
  const providedScanNoGoAssessment = bundle.scan_no_go_assessment ?? bundle.scanNoGoAssessment ?? null;
  const providedVisualAccessReview = bundle.visual_access_review ?? bundle.visualAccessReview ?? null;
  const scanEvidenceLaneAssessment = bundle.scan_evidence_lane_assessment ?? bundle.scanEvidenceLaneAssessment ?? null;
  const policyOnlyPartial = Boolean(
    localV2NoGo && scanEvidenceLaneAssessment?.outcome === "partial_with_diagnostics"
  );
  const visualCaptureUnavailable = !localV2NoGo &&
    (visualCapture.status === "failed" || visualCapture.status === "unavailable") &&
    (bundle.screenshots ?? []).length === 0;
  const effectiveRuntimeCoverageStatus = localV2NoGo ? "limited_none" : runtimeCoverageStatus;
  const effectiveRuntimeCountsRetained = localV2NoGo ? false : runtimeCountsRetained;
  const effectiveRuntimeLimitationKeys = localV2NoGo
    ? uniqueStrings([...runtimeLimitationKeys, localV2NoGo.primaryReasonCode])
    : visualCaptureUnavailable || !preConsentRuntimeReliable
      ? uniqueStrings([...runtimeLimitationKeys, "visual_capture_unavailable"])
      : runtimeLimitationKeys;
  const consentRuntimeEvidenceReportable = !localV2NoGo && preConsentRuntimeReliable;
  const runtimeEvidenceReportable = !localV2NoGo && effectiveRuntimeCountsRetained;
  const consentSurfaceInspection = reconcileConsentSurfaceInspectionWithGeometry(
    bundle,
    options.consentControlGeometryEvidence,
    deriveConsentSurfaceInspectionOutcome({
      cmpRuntimeObservations: bundle.cmpRuntimeObservations,
      consentUiObservations: bundle.consentUiObservations,
      domSnapshots: bundle.domSnapshots,
      modulesRun: bundle.modulesRun,
      runtimeCoverage: bundle.runtimeCoverage
        ? {
            ...bundle.runtimeCoverage,
            coverageStatus: effectiveRuntimeCoverageStatus ?? bundle.runtimeCoverage.coverageStatus,
            limitationKeys: effectiveRuntimeLimitationKeys,
          }
        : undefined,
      screenshots: bundle.screenshots,
      visualCapture: bundle.visualCapture,
    })
  );
  const primaryAssessmentEventIds = new Set([
    ...networkEvents.map((event) => event.eventId),
    ...cookieEvents.map((event) => event.eventId),
  ]);
  const primaryAssessmentHosts = new Set(uniqueStrings([
    ...networkEvents.map((event) => event.hostname ?? hostnameFromUrl(event.url)),
    ...cookieEvents.map((event) => event.hostname ?? event.cookieDomain),
  ]));
  const vendorRowsForPrimaryContext = (rows: typeof vendorRows) => rows.filter((vendor) => {
    if ([...vendor.matchedEventIds].some((eventId) => primaryAssessmentEventIds.has(eventId))) return true;
    if (vendor.matchedEventIds.size > 0) return false;
    if (!vendor.scriptHost) return true;
    return [...primaryAssessmentHosts].some((host) =>
      host === vendor.scriptHost || host.endsWith(`.${vendor.scriptHost}`) || vendor.scriptHost?.endsWith(`.${host}`)
    );
  });
  const vendorEvidenceReportable = runtimeEvidenceReportable ||
    (!localV2NoGo && preConsentRuntimeReliable && runtimeCoverageStatus === null && meaningfulRuntimeSignalsRetained);
  const reportableVendorRows = vendorEvidenceReportable ? vendorRowsForPrimaryContext(vendorRows) : [];
  const inventoryVendorRows = vendorEvidenceReportable ? vendorRowsForPrimaryContext(allVendorRows) : [];
  const advertisingVendors = vendorRowsForAdvertisingInfrastructure(reportableVendorRows);
  const retargetingBehavioralAdvertisingVendors = vendorRowsForBehavioralAdvertising(reportableVendorRows);
  const advertisingRetargetingVendors = uniqueVendorRows([
    ...advertisingVendors,
    ...retargetingBehavioralAdvertisingVendors,
    ...vendorRowsForCategories(reportableVendorRows, ["adtech", "marketing"])
  ]);
  const analyticsVendors = vendorRowsForCategories(reportableVendorRows, ["analytics", "measurement"]);
  const retainedFirstLayerConsentChoices = firstLayerConsentChoices ?? {
    acceptControlObserved: false,
    acceptLabels: [],
    actionableControlInventoryRetained: false,
    capturedBeforeInteraction: true,
    defaultTogglePurposeLabels: [],
    defaultToggleStatesObserved: null,
    layerInspected: "unknown",
    managePreferencesControlObserved: false,
    nonEssentialDefaultsOff: null,
    preferenceLabels: [],
    precheckedOptionalPurposeCount: 0,
    precheckedOptionalPurposeLabels: [],
    rejectControlObserved: false,
    rejectLabels: [],
    visibleChoiceLabels: []
  };
  const completeFirstLayerConsentChoices = {
    ...retainedFirstLayerConsentChoices,
    postClickEnforcementTested: false,
    controlInventoryComplete:
      consentSurfaceInspection.inspectionCompleted === true &&
      retainedFirstLayerConsentChoices.layerInspected === "first_layer" &&
      retainedFirstLayerConsentChoices.actionableControlInventoryRetained === true,
    screenshotRefs: (bundle.screenshots ?? [])
      .filter(isPreConsentScreenshotArtifact)
      .slice(0, 6)
      .map((screenshot) => ({
        capturedAtMs: screenshot.capturedAtMs,
        id: localV2VisualEvidenceArtifactId(screenshot),
        url: safeLocalV2DocumentUrl(screenshot.url, canonicalDocumentUrl)
      }))
  };
  const consentControlAssessment: ConsentControlAssessment = deriveMaterializedConsentControlAssessment({
    bundle,
    consentControlGeometryEvidence: options.consentControlGeometryEvidence,
    consentSurfaceInspection,
    finalUrl: canonicalDocumentUrl,
    noGo: Boolean(localV2NoGo) ||
      providedScanNoGoAssessment?.decision === "no_go" ||
      providedVisualAccessReview?.go_no_go === "NO_GO",
    noGoReasonCodes: uniqueStrings([
      ...(localV2NoGo?.scanNoGoAssessment.reasonCodes ?? []),
      ...(providedScanNoGoAssessment?.reasonCodes ?? []),
    ]),
    requestedUrl: requestedDocumentUrl,
    scanId: scanRecord.scan.id,
  });
  const policySurfaces = dedupePolicySurfaces(
    bundle.policySurfaceObservations ?? [],
    canonicalDocumentUrl
  );
  const gdprTransparencyEvidenceProfile = normalizeGdprTransparencyProductionEvidenceProfile(
    options.gdprTransparencyEvidenceProfile
  );
  const policySurfaceSummary = summarizePolicySurfaces(policySurfaces, rootDomain, {
    discoveredPolicySurfaces: bundle.policySurfaceObservations ?? [],
    gdprTransparencyEvidenceProfile,
    homepageNoGo: Boolean(localV2NoGo),
    policyTextEvidenceContext: options.policyTextEvidenceContext,
    primaryLanguage: getLocalV2PrimaryLanguage(bundle),
    scanStartedAt: bundle.startedAt,
  });
  const policyTextProjection = policySurfaceSummary.policyTextEvidenceProjection;
  const policyTextProjectionDocuments = policyTextProjection.documents;
  console.warn(JSON.stringify({
    event: "app.scan_detail.policy_text_projection",
    scanId: scanRecord.scan.id,
    sourceBundleVerificationStatus: policyTextProjection.sourceBundle.verificationStatus,
    projectionStatus: policyTextProjection.projectionStatus,
    policyDocumentCount: policyTextProjectionDocuments.length,
    verifiedPolicyDocumentCount: policyTextProjectionDocuments.filter((document) =>
      document.artifactVerificationStatus === "verified"
    ).length,
    completePolicyDocumentCount: policyTextProjectionDocuments.filter((document) =>
      document.extractionStatus === "complete"
    ).length,
    unavailablePolicyDocumentCount: policyTextProjectionDocuments.filter((document) =>
      document.extractionStatus === "unavailable"
    ).length,
    pdfPolicyDocumentCount: policyTextProjectionDocuments.filter((document) =>
      document.documentFormat === "pdf"
    ).length,
    failedPdfPolicyDocumentCount: policyTextProjectionDocuments.filter((document) =>
      document.documentFormat === "pdf" && document.extractionStatus !== "complete"
    ).length,
    limitationKeys: policyTextProjection.limitationKeys,
  }));
  const verifiedPolicySurfaces = policySurfaces.filter((row) =>
    row.surface.surfaceType !== "privacy_policy" || isEvaluatedPrivacyPolicySurface(row.surface)
  );
  const targetRelevantVerifiedPolicySurfaces = verifiedPolicySurfaces.filter((row) =>
    row.surface.surfaceType !== "privacy_policy" ||
    !isGenericThirdPartyPrivacySurface(row, rootDomain, { homepageNoGo: Boolean(localV2NoGo) })
  );
  const collectionSurfaceSummary = summarizeCollectionSurfaces(bundle);
  const transportSecuritySummary = summarizeTransportSecurity(bundle);
  const privacySurface = targetRelevantVerifiedPolicySurfaces.find((row) => row.surface.surfaceType === "privacy_policy");
  const termsSurface = verifiedPolicySurfaces.find((row) => row.surface.surfaceType === "terms");
  const cookieSurface = verifiedPolicySurfaces.find((row) =>
    row.surface.surfaceType === "cookie_policy" ||
    row.surface.surfaceType === "cookie_settings"
  );
  const findObservedVendor = (
    event: (typeof networkEvents)[number] | (typeof cookieEvents)[number],
    candidates = reportableVendorRows,
  ) =>
    candidates.find((vendor) => vendor.matchedEventIds.has(event.eventId)) ??
    candidates.find((vendor) => {
      const host = hostnameFromUrl(event.hostname ?? event.url);
      return Boolean(host && vendor.matchedHostnames.some((matchedHost) =>
        host === matchedHost || host.endsWith(`.${matchedHost}`)
      ));
    }) ?? null;
  const thirdPartyRequestCount = countCanonicalNetworkEvents(thirdPartyRequests);
  // Customer-facing cookie totals use canonical domain + path + name identity.
  // Raw Set-Cookie and browser-snapshot events remain available as evidence.
  const cookiesBeforeConsentCount = preconsentCookieIdentityCount;
  const vendorCategoryCounts = reportableVendorRows.reduce<Record<string, number>>((counts, vendor) => {
    counts[vendor.vendorCategory] = (counts[vendor.vendorCategory] ?? 0) + 1;
    return counts;
  }, {});
  const requestPurposeRows = (preconsentRequests
    .map((event) => {
      const matchedVendor = findObservedVendor(event);
      const url = requestUrl(event);
      const hostname = event.hostname ?? hostnameFromUrl(url);
      return matchedVendor && url && hostname
        ? {
            category: matchedVendor.vendorCategory,
            classification: classifyRetainedRequestActivity({
              category: matchedVendor.vendorCategory,
              collectionEndpointObserved: event.collectionEndpointObserved === true,
              regulatoryRelevance: matchedVendor.regulatoryRelevance,
              resourceType: event.resourceType,
              url
            }),
            classificationBasis: "local_v2_dag_runtime_vendor_observation",
            collectionEndpointObserved: event.collectionEndpointObserved === true,
            collectionEndpointType: matchedVendor.collectionEndpointType,
            confidence: matchedVendor.confidence,
            essentiality: "non_essential",
            firstPartyOrThirdParty: sameSite(hostname, rootDomain) ? "first_party" : "third_party",
            hostname,
            initiatorType: event.initiatorType ?? event.resourceType,
            matchedSignatureId: matchedVendor.matchedSignatureId,
            pageUrl: safeLocalV2DocumentUrl(event.documentUrl, event.topLevelUrl, canonicalDocumentUrl),
            pageUrlSharedViaReferrer: typeof event.requestHeaders?.referer === "string" &&
              Boolean(hostnameFromUrl(event.topLevelUrl) && event.requestHeaders.referer.includes(hostnameFromUrl(event.topLevelUrl) ?? "")),
            referrerSent: Boolean(event.requestHeaders?.referer),
            requestUrl: url,
            regulatoryRelevance: matchedVendor.regulatoryRelevance,
            resourceType: event.resourceType,
            runtimePhase: "pre_consent",
            tsMs: event.timestampMs,
            vendor: matchedVendor.vendorName,
            vendorName: matchedVendor.vendorName
          }
        : null;
    })
    .filter((row) => row !== null) as Array<Record<string, unknown>>);
  const endpointJurisdictionEvidence = deriveEndpointJurisdictionEvidence(
    networkEvents as Array<Record<string, unknown>>,
    reportableVendorRows.map((vendor) => ({
      category: vendor.vendorCategory,
      hostnames: vendor.matchedHostnames,
      vendorName: vendor.vendorName
    }))
  );
  const boundedRequestPurposeRows = selectBoundedPreconsentRequestPurposeRows(requestPurposeRows, 50);
  const rtbCookieSyncObservations = boundedRequestPurposeRows
    .filter((row) => row.classification === "identifier_synchronization")
    .map((row) => {
      const hostname = firstString(row.hostname);
      const knownEndpoint = isCanonicalIdSyncEndpoint(hostname);
      return {
        category: "identity_sync",
        consentStateAtTime: "pre_consent",
        hostname,
        pathSample: retainedRequestPathSample(firstString(row.requestUrl)),
        queryKeysSample: (() => {
        const value = firstString(row.requestUrl);
        if (!value) return [];
        try {
          return [...new URL(value).searchParams.keys()].slice(0, 16);
        } catch {
          return [];
        }
        })(),
        reason: knownEndpoint ? "known_sync_endpoint" : "sync_path",
        registrableDomain: registrableDomain(hostname),
        requestUrl: retainedRequestUrlSample(firstString(row.requestUrl)),
        timestampMs: row.tsMs,
        vendorName: row.vendorName ?? null,
        evidenceBasis: knownEndpoint ? "canonical_id_sync_endpoint" : "retained_sync_request_shape",
      };
    });
  const promotionGradeRequestPurposeRows = boundedRequestPurposeRows.filter(isPromotionGradePreconsentRequestRow);
  const sensitiveThirdPartyTrackingCorrelation = deriveSensitiveThirdPartyTrackingCorrelation({
    collectionSurfaceObservations: Array.isArray(bundle.collectionSurfaceObservations)
      ? bundle.collectionSurfaceObservations as Array<Record<string, unknown>>
      : null,
    requestPurposeRows: promotionGradeRequestPurposeRows,
    runtimeCoverageRetained: runtimeCountsRetained
  });
  const promotionGradePreconsentRequestUrls = uniqueStrings(
    promotionGradeRequestPurposeRows.map((row) => firstString(row.requestUrl)).filter(Boolean)
  );
  const promotionGradeVendorNames = uniqueStrings(
    promotionGradeRequestPurposeRows.map((row) => firstString(row.vendor, row.vendorName)).filter(Boolean)
  );
  const hasPromotionGradePreconsentTracking = promotionGradeRequestPurposeRows.length > 0;
  const promotionGradePreconsentCookieNames = uniqueStrings(preconsentCookies
    .filter((event) => event.cookiePurpose === "analytics" || event.cookiePurpose === "advertising")
    .map((event) => cookieName(event)));
  const hasPromotionGradePreconsentCookies = promotionGradePreconsentCookieNames.length > 0;
  const unresolvedObservedPrivacyPolicyCandidates = (bundle.policySurfaceObservations ?? [])
    .filter((surface) =>
      surface.surfaceType === "privacy_policy" &&
      surface.linkObservationState === "observed" &&
      surface.status !== "fetched" &&
      surface.status !== "observed"
    );
  const policySurfaceInspection = bundle.policySurfaceInspection ?? derivePolicySurfaceInspectionOutcome({
    modulesRun: bundle.modulesRun,
    policySurfaceObservations: bundle.policySurfaceObservations,
  });
  const consentCoverageComplete = consentSurfaceInspection.inspectionCompleted === true &&
    consentSurfaceInspection.coverageStatus === "complete";
  const assessedConsentSurfaceObserved = consentSurfaceInspection.consentSurfaceObserved === true
    ? true
    : consentCoverageComplete
      ? false
      : null;
  const assessedConsentActionableChoiceObserved = consentSurfaceInspection.actionableControlObserved === true
    ? true
    : consentCoverageComplete
      ? false
      : null;
  const transportCoverageComplete = transportSecuritySummary.evidenceRetained === true &&
    transportSecuritySummary.pageHttpsObserved !== null &&
    transportSecuritySummary.httpProbeAttempted === true &&
    transportSecuritySummary.tlsProbeAttempted === true;
  const applicablePolicyCoverageComplete = deriveApplicablePolicyCoverageComplete({
    policySurfaceInspection,
    privacyPolicyPresent: policySurfaceSummary.privacyPolicyPresent === true,
    unresolvedObservedPrivacyPolicyCandidateCount: unresolvedObservedPrivacyPolicyCandidates.length,
  });
  const criticalCoverageLimitationKeys = deriveCriticalCoverageLimitationKeys({
    applicablePolicyCoverageComplete,
    consentCoverageComplete,
    transportCoverageComplete,
  });
  const criticalCoverageComplete = criticalCoverageLimitationKeys.length === 0;
  const scoreConfidence = !runtimeCountsRetained
    ? "withheld_incomplete_runtime_coverage"
    : !criticalCoverageComplete
      ? "withheld_incomplete_critical_coverage"
      : "supported_by_retained_runtime_evidence";
  const score =
    !runtimeCountsRetained || !criticalCoverageComplete
      ? null
      : hasPromotionGradePreconsentTracking || hasPromotionGradePreconsentCookies
        ? Math.max(35, Math.min(72, 82 - Math.min(24, promotionGradeRequestPurposeRows.length) - Math.min(18, promotionGradePreconsentCookieNames.length)))
        : 88;
  const embeddedContentSummary = summarizeEmbeddedContentEvidence(preconsentIframeEvents, preconsentRequests);
  const fingerprintingRuntimeEvidence = browserApiAccessRows(bundle);
  const fingerprintingEvidenceSummary = summarizeFingerprintingEvidence(bundle);
  const sessionReplayEvidenceSummary = summarizeSessionReplayEvidence(reportableVendorRows, preconsentRequests, boundedRequestPurposeRows);
  const cookieWriteObservations = cookieEvents.map((event) => {
    const matchedVendor = findObservedVendor(event, inventoryVendorRows);
    const snapshot = /^(?:browser_snapshot|periodic_cookie_snapshot|initial_cookie_snapshot)$/i.test(event.operation ?? "");
    const initialSnapshot = /^initial_cookie_snapshot$/i.test(event.operation ?? "") ||
      /^browser_snapshot$/i.test(event.operation ?? "") && minimumNumber(event.timestampMs) === null;
    const eventHost = hostnameFromUrl(event.url) ?? event.hostname ?? event.cookieDomain ?? null;
    const matchedVendorHostAligned = Boolean(matchedVendor && eventHost && matchedVendor.matchedHostnames.some((matchedHost) =>
      eventHost === matchedHost || eventHost.endsWith(`.${matchedHost}`) || matchedHost.endsWith(`.${eventHost}`)
    ));
    const category = event.cookiePurpose && event.cookiePurpose !== "unknown"
      ? event.cookiePurpose
      : matchedVendor?.vendorCategory ?? "unknown";
    const initiatorUrl = event.setterScriptUrl ?? event.initiatorChain?.[0] ?? event.initiatorUrl ?? null;
    const initiatorDomain = hostnameFromUrl(initiatorUrl) ?? null;
    return {
      beforeConsent: event.consentStateAtTime === "pre_consent",
      category,
      cookieName: event.cookieName,
      domain: (event.cookieDomain ?? event.hostname)?.replace(/^\.+/, ""),
      expiresAt: event.expires ?? null,
      firstObservedAtMs: event.timestampMs,
      initiatorChain: event.initiatorChain ?? [],
      initiatorDomain,
      initiatorUrl,
      initiatorVendor: snapshot || !matchedVendorHostAligned ? null : matchedVendor?.vendorName ?? null,
      lifespanSeconds: event.lifespanSeconds ?? null,
      lifespanSource: event.lifespanSource ?? null,
      description: event.description ?? null,
      dataTypes: event.dataTypes ?? [],
      nonEssential: /^(?:advertising|analytics|fingerprinting|marketing|measurement|personalization|session_replay)$/i.test(category),
      party: event.cookieParty ?? (event.thirdParty ? "third_party" : "first_party"),
      setByThirdPartyScript: event.setByThirdPartyScript === true,
      set_by_third_party_script: event.setByThirdPartyScript === true,
      setterScriptUrl: event.setterScriptUrl ?? null,
      setAtMs: snapshot ? null : event.timestampMs,
      setMethod: event.operation ?? "cookie_event",
      thirdParty: event.thirdParty === true || event.cookieParty === "third_party",
      timestampMs: event.timestampMs,
      timingEvidence: snapshot
        ? initialSnapshot ? "initial_cookie_snapshot" : "periodic_cookie_snapshot"
        : event.consentStateAtTime === "pre_consent" ? "before_consent_cookie_write" : "observed_cookie_write"
    };
  });
  const hybridRuntimeEvidence = {
    consentControlAssessment,
    consent_control_assessment: consentControlAssessment,
    consentSummary: {
      bannerPresent: assessedConsentSurfaceObserved,
      consentSurfaceObserved: assessedConsentSurfaceObserved,
      firstVisibleMs: firstNumber(cmp?.observedAtMs, firstConsentSurfaceVisibleMs),
      cmpFrameworkSignalObserved: Boolean(cmpVendorName),
      cmpDetected: Boolean(cmpVendorName),
      cmpName: cmpVendorName,
      cmpRuntimeSignalLabels: cmpSignalLabels,
      cookieNoticeObserved: assessedConsentSurfaceObserved,
      requestsBeforeAnyConsentAction: preconsentRequests.length > 0,
      postClickEnforcementTested: false,
      userConsentActionObserved: false
    },
    consentSurfaceInspection,
    cookieNoticeObserved: assessedConsentSurfaceObserved,
    cmpFrameworkSignalObserved: Boolean(cmpVendorName),
    cmpRuntimeSignalLabels: cmpSignalLabels,
    ...(consentRuntimeEvidenceReportable ? {
      firstLayerConsentChoices: completeFirstLayerConsentChoices,
      first_layer_consent_choices: completeFirstLayerConsentChoices
    } : {}),
    cookieWriteObservations,
    rtbCookieSyncObserved: rtbCookieSyncObservations.length > 0,
    rtb_cookie_sync_observed: rtbCookieSyncObservations.length > 0,
    rtbCookieSyncObservations,
    rtb_cookie_sync_observations: rtbCookieSyncObservations,
    networkSummary: {
      metricBasis: "retained_unique_request_events",
      observedRawRequestEventCount: runtimeObservationCounts?.networkEvents ?? null,
      preConsentRequestCount: networkEvents.filter((event) => event.consentStateAtTime === "pre_consent").length,
      preConsentThirdPartyRequestCount: countCanonicalNetworkEvents(preconsentRequests),
      retainedRequestEventCount: networkEvents.length,
      thirdPartyDomainCount: thirdPartyDomains.length,
      thirdPartyRequestCount,
      totalRequestCount: networkEvents.length
    },
    requestObservations: networkEvents.slice(0, 200).map((event) => ({
      collectionEndpointObserved: event.collectionEndpointObserved === true,
      idSyncEndpoint: event.idSyncEndpoint === true,
      networkDestination: event.networkDestination ?? null,
      domain: event.hostname ?? hostnameFromUrl(event.url),
      initiatorType: event.initiatorType ?? event.resourceType,
      documentUrl: safeLocalV2DocumentUrl(event.documentUrl, event.topLevelUrl, canonicalDocumentUrl),
      pageContextId: event.frameContext?.isMainFrame === false ? "subframe" : "primary_document",
      pageUrlSharedViaReferrer: typeof event.requestHeaders?.referer === "string" &&
        Boolean(hostnameFromUrl(event.topLevelUrl) && event.requestHeaders.referer.includes(hostnameFromUrl(event.topLevelUrl) ?? "")),
      preConsent: event.consentStateAtTime === "pre_consent",
      referrerSent: Boolean(event.requestHeaders?.referer),
      requestUrl: requestUrl(event),
      resourceType: event.resourceType,
      thirdParty: event.thirdParty === true || event.isThirdParty === true,
      timestampMs: event.timestampMs,
      url: requestUrl(event)
    })),
    endpointJurisdictionEvidence,
    sensitiveThirdPartyTrackingCorrelation,
    requestPurposeClassificationConfidence: boundedRequestPurposeRows,
    requestToVendorObservations: reportableVendorRows.map((vendor) => ({
      category: vendor.vendorCategory,
      hostname: vendor.scriptHost,
      observedVia: vendor.observedVia,
      preConsent: true,
      regulatoryRelevance: vendor.regulatoryRelevance,
      vendor: vendor.vendorName
    })),
    embeddedContentSummary,
    embedded_content_summary: embeddedContentSummary,
    fingerprintingEvidenceSummary,
    fingerprinting_evidence_summary: fingerprintingEvidenceSummary,
    fingerprintingRuntimeEvidence,
    fingerprinting_runtime_evidence: fingerprintingRuntimeEvidence,
    iframeSummary: {
      frameHostnames: uniqueStrings(preconsentIframeEvents.map((event) => event.hostname)),
      iframeEvents: preconsentIframeEvents,
      preConsentIframeCount: preconsentIframeEvents.length,
      thirdPartyPreConsentIframeCount: preconsentIframeEvents.filter((event) => event.thirdParty).length
    },
    sessionReplayEvidenceSummary,
    session_replay_evidence_summary: sessionReplayEvidenceSummary,
    storageSummary: {
      metricBasis: "unique_cookie_domain_path_name_identity",
      cookiesBeforeConsentCount,
      cookiesSeenCount: cookieIdentityCount,
      ...cookieEvidenceCounts,
      retainedCookieEventCount: cookieEvents.length,
      thirdPartyCookieBeforeConsentCount: uniqueStrings(preconsentCookies
        .filter((event) => event.cookieParty === "third_party" || event.thirdParty === true)
        .map((event) => cookieIdentity(event))).length
    },
    timelineMarkers: {
      firstCmpVisibleMs: cmp?.observedAtMs ?? null,
      firstConsentSurfaceVisibleMs,
      firstNonEssentialRequestMs: firstPromotionGradePreconsentRequestMs(requestPurposeRows),
      firstThirdPartyRequestMs: minimumNumber(...thirdPartyRequests.map((event) => event.timestampMs)),
      firstRequestMs: minimumNumber(...networkEvents.map((event) => event.timestampMs)),
      firstTrackingCookieSetMs: minimumNumber(...preconsentCookies.map((event) => event.timestampMs)),
      timelineConfidence: "direct_v2_runtime"
    },
    navigationSummary: {
      effectiveScannedPageUrl: canonicalDocumentUrl,
      finalUrl: canonicalDocumentUrl,
      landedOnDifferentHost: Boolean(
        requestedDocumentUrl && canonicalDocumentUrl &&
        hostnameFromUrl(requestedDocumentUrl) !== hostnameFromUrl(canonicalDocumentUrl)
      ),
      redirectChain: uniqueStrings([
        requestedDocumentUrl,
        ...(bundle.transportSecurityObservations ?? []).flatMap((observation) =>
          observation.httpProbe?.redirectChain ?? []
        ),
        canonicalDocumentUrl
      ]),
      requestedUrl: requestedDocumentUrl,
      status: canonicalDocumentUrl ? "completed" : "not_testable"
    },
    vendorSummary: {
      advertisingVendors: uniqueStrings(advertisingVendors.map((vendor) => vendor.vendorName)),
      advertisingRetargetingVendors: uniqueStrings(advertisingRetargetingVendors.map((vendor) => vendor.vendorName)),
      analyticsVendors: uniqueStrings(analyticsVendors.map((vendor) => vendor.vendorName)),
      normalizedVendors: uniqueStrings(reportableVendorRows.map((vendor) => vendor.vendorName)),
      preConsentVendorCount: reportableVendorRows.length,
      retargetingBehavioralAdvertisingVendors: uniqueStrings(retargetingBehavioralAdvertisingVendors.map((vendor) => vendor.vendorName)),
      rawThirdPartyDomains: thirdPartyDomains,
      vendorCategoryCounts
    }
  };
  const timingArtifacts = buildLocalV2DagTimingArtifacts(bundle);
  const runtimeArtifacts = {
    ...(scanRecord.runtimeArtifacts ?? {}),
    ...timingArtifacts,
    local_v2_dag_scan_core_duration_ms: durationMsFromTimestamps(bundle.startedAt, bundle.completedAt),
    wc01ProductionProjection: {
      approved: true,
      artifactBoundaryPreserved: true,
      pipeline: "normalized_concern_policy_unified_finding",
      version: LOCAL_V2_DAG_WC01_PROJECTION_VERSION
    },
    ...(providedScanNoGoAssessment ? {
      scanNoGoAssessment: providedScanNoGoAssessment,
      scan_no_go_assessment: providedScanNoGoAssessment,
    } : {}),
    ...(providedVisualAccessReview ? {
      visualAccessReview: providedVisualAccessReview,
      visual_access_review: providedVisualAccessReview,
    } : {}),
    ...(scanEvidenceLaneAssessment ? {
      scanEvidenceLaneAssessment,
      scan_evidence_lane_assessment: scanEvidenceLaneAssessment,
    } : {}),
    ...(localV2NoGo ? {
      scanNoGoAssessment: localV2NoGo.scanNoGoAssessment,
      scan_no_go_assessment: localV2NoGo.scanNoGoAssessment,
      visualAccessReview: localV2NoGo.visualAccessReview,
      visual_access_review: localV2NoGo.visualAccessReview
    } : {}),
    consent_audit_completed: true,
    consentControlAssessment,
    consent_control_assessment: consentControlAssessment,
    consent_baseline_tracker_evidence_urls: runtimeEvidenceReportable ? promotionGradePreconsentRequestUrls : [],
    consent_baseline_tracker_vendor_names: runtimeEvidenceReportable ? promotionGradeVendorNames : [],
    consent_preconsent_violation_count: runtimeEvidenceReportable ? promotionGradeRequestPurposeRows.length : 0,
    collection_surface_count: collectionSurfaceSummary.collectionSurfaceCount,
    collection_surface_observed: collectionSurfaceSummary.collectionSurfacesObserved,
    collectionSurfaceSummary,
    collection_surface_summary: collectionSurfaceSummary,
    transportSecuritySummary,
    transport_security_summary: transportSecuritySummary,
    consentActionableChoiceObserved: consentRuntimeEvidenceReportable ? assessedConsentActionableChoiceObserved : null,
    consentSurfaceObserved: consentRuntimeEvidenceReportable ? assessedConsentSurfaceObserved : null,
    consentSurfaceInspection,
    consent_actionable_choice_observed: consentRuntimeEvidenceReportable ? assessedConsentActionableChoiceObserved : null,
    consent_surface_observed: consentRuntimeEvidenceReportable ? assessedConsentSurfaceObserved : null,
    consent_surface_inspection: consentSurfaceInspection,
    cookieNoticeObserved: consentRuntimeEvidenceReportable ? assessedConsentSurfaceObserved : null,
    cookie_notice_observed: consentRuntimeEvidenceReportable ? assessedConsentSurfaceObserved : null,
    ...(cookieSurface ? { cookiePolicyPresent: true, cookie_policy_present: true } : {}),
    ...(consentRuntimeEvidenceReportable && cmpVendorName ? {
      consentPlatform: cmpVendorName,
      consent_platform: cmpVendorName,
      cmpFrameworkSignalObserved: true,
      cmpRuntimeSignalLabels: cmpSignalLabels,
      cmp_framework_signal_observed: true,
      cmp_runtime_signal_labels: cmpSignalLabels,
      cmp_vendor_name: cmpVendorName
    } : {}),
    ...(consentRuntimeEvidenceReportable ? {
      consentSummary: hybridRuntimeEvidence.consentSummary,
      consent_summary: hybridRuntimeEvidence.consentSummary,
      firstLayerConsentChoices: completeFirstLayerConsentChoices,
      first_layer_consent_choices: completeFirstLayerConsentChoices,
      rejectPathDepthAndAvailability: {
        completeRejectPathAvailable: completeFirstLayerConsentChoices.rejectControlObserved,
        completeRejectPathDetected: completeFirstLayerConsentChoices.rejectControlObserved,
        firstLayerCookieConsentBannerObserved: firstLayerConsentControlInventoryRetained,
        firstLayerConsentChoices: completeFirstLayerConsentChoices,
        gdprEprivacyConsentSurfaceObserved: firstLayerConsentControlInventoryRetained ? "confirmed" : "unconfirmed",
        layerInspected: completeFirstLayerConsentChoices.layerInspected,
        rejectAvailableOnFirstLayer: completeFirstLayerConsentChoices.rejectControlObserved,
        rejectEquivalentFound: completeFirstLayerConsentChoices.rejectControlObserved,
        rejectControlObserved: completeFirstLayerConsentChoices.rejectControlObserved,
        visibleRejectLabels: completeFirstLayerConsentChoices.rejectLabels
      },
      reject_path_depth_and_availability: {
        complete_reject_path_available: completeFirstLayerConsentChoices.rejectControlObserved,
        complete_reject_path_detected: completeFirstLayerConsentChoices.rejectControlObserved,
        first_layer_cookie_consent_banner_observed: firstLayerConsentControlInventoryRetained,
        first_layer_consent_choices: completeFirstLayerConsentChoices,
        gdpr_eprivacy_consent_surface_observed: firstLayerConsentControlInventoryRetained ? "confirmed" : "unconfirmed",
        layer_inspected: completeFirstLayerConsentChoices.layerInspected,
        reject_available_on_first_layer: completeFirstLayerConsentChoices.rejectControlObserved,
        reject_equivalent_found: completeFirstLayerConsentChoices.rejectControlObserved,
        reject_control_observed: completeFirstLayerConsentChoices.rejectControlObserved,
        visible_reject_labels: completeFirstLayerConsentChoices.rejectLabels
      }
    } : {}),
    consentTimeline: hybridRuntimeEvidence.timelineMarkers,
    consent_timeline: hybridRuntimeEvidence.timelineMarkers,
    advertising_vendor_count: advertisingVendors.length,
    advertising_vendor_names: uniqueStrings(advertisingVendors.map((vendor) => vendor.vendorName)),
    advertisingRetargetingVendorCount: advertisingRetargetingVendors.length,
    advertisingRetargetingVendorNames: uniqueStrings(advertisingRetargetingVendors.map((vendor) => vendor.vendorName)),
    advertising_retargeting_vendor_count: advertisingRetargetingVendors.length,
    advertising_retargeting_vendor_names: uniqueStrings(advertisingRetargetingVendors.map((vendor) => vendor.vendorName)),
    retargeting_behavioral_advertising_vendor_count: retargetingBehavioralAdvertisingVendors.length,
    retargeting_behavioral_advertising_vendor_names: uniqueStrings(retargetingBehavioralAdvertisingVendors.map((vendor) => vendor.vendorName)),
    retargetingBehavioralAdvertisingVendorCount: retargetingBehavioralAdvertisingVendors.length,
    retargetingBehavioralAdvertisingVendorNames: uniqueStrings(retargetingBehavioralAdvertisingVendors.map((vendor) => vendor.vendorName)),
    analytics_vendor_count: analyticsVendors.length,
    analytics_vendor_names: uniqueStrings(analyticsVendors.map((vendor) => vendor.vendorName)),
    domainVendorRegistry: reportableVendorRows.map((vendor) => ({
      endpointHostname: vendor.scriptHost,
      observedVia: vendor.observedVia,
      vendorDisplayCategory: vendor.vendorDisplayCategory,
      vendorCategory: vendor.vendorCategory,
      vendorName: vendor.vendorName
    })),
    embeddedContentSummary,
    embedded_content_summary: embeddedContentSummary,
    fingerprintingEvidenceSummary,
    fingerprinting_evidence_summary: fingerprintingEvidenceSummary,
    fingerprintingRuntimeEvidence,
    fingerprinting_runtime_evidence: fingerprintingRuntimeEvidence,
    hybridRuntimeEvidence: hybridRuntimeEvidence,
    hybrid_runtime_evidence: hybridRuntimeEvidence,
    navigationSummary: hybridRuntimeEvidence.navigationSummary,
    navigation_summary: hybridRuntimeEvidence.navigationSummary,
    networkSummary: hybridRuntimeEvidence.networkSummary,
    network_summary: hybridRuntimeEvidence.networkSummary,
    storageSummary: hybridRuntimeEvidence.storageSummary,
    storage_summary: hybridRuntimeEvidence.storageSummary,
    iframeEvents,
    iframe_events: iframeEvents,
    initial_cookie_count: cookieEvidenceCounts.initialCookieSnapshotCount,
    initial_cookie_domains: uniqueStrings(initialSnapshotCookieEvents.map((event) => event.cookieDomain ?? event.hostname)),
    initial_cookie_names: uniqueStrings(initialSnapshotCookieEvents.map((event) => cookieName(event))),
    cookies_before_consent_count: cookiesBeforeConsentCount,
    cookieWriteObservations,
    cookie_write_observations: cookieWriteObservations,
    key_page_discovery_summary: {
      pageSummaries: [privacySurface, termsSurface, cookieSurface]
        .filter((row): row is NonNullable<typeof row> => Boolean(row))
        .map(({ pageUrl, surface, aliasUrls }) => ({
          bestCandidateUrl: pageUrl ?? surface.normalizedUrl ?? surface.url,
          pageType: surface.surfaceType,
          successfulUrl: pageUrl ?? surface.normalizedUrl ?? surface.url,
          aliasUrls,
          surfaceDetected: true,
          surfaceState: "linked_and_verified"
        }))
    },
    requestPurposeClassificationConfidence: requestPurposeRows,
    request_purpose_classification_confidence: requestPurposeRows,
    sessionReplayEvidenceSummary,
    session_replay_evidence_summary: sessionReplayEvidenceSummary,
    gdprTransparencyEvidenceProfile: policySurfaceSummary.gdprTransparencyEvidenceProfile,
    gdprTransparencyProductionEvidenceDiagnostics: policySurfaceSummary.gdprTransparencyProductionEvidenceDiagnostics,
    gdprTransparencyProductionEvidenceEnabled: policySurfaceSummary.gdprTransparencyProductionEvidenceEnabled,
    gdpr_transparency_evidence_profile: policySurfaceSummary.gdprTransparencyEvidenceProfile,
    gdpr_transparency_production_evidence_diagnostics: policySurfaceSummary.gdprTransparencyProductionEvidenceDiagnostics,
    gdpr_transparency_production_evidence_enabled: policySurfaceSummary.gdprTransparencyProductionEvidenceEnabled,
    policyDisclosureSummary: policySurfaceSummary,
    policy_disclosure_summary: policySurfaceSummary,
    policySurfaceInspection,
    policy_surface_inspection: policySurfaceInspection,
    runtimeCoverageStatus: effectiveRuntimeCoverageStatus,
    runtime_coverage_status: effectiveRuntimeCoverageStatus,
    runtimeCountsRetained: effectiveRuntimeCountsRetained,
    runtime_counts_retained: effectiveRuntimeCountsRetained,
    runtimeLimitationKeys: effectiveRuntimeLimitationKeys,
    runtime_limitation_keys: effectiveRuntimeLimitationKeys,
    criticalCoverageComplete,
    criticalCoverageLimitationKeys,
    critical_coverage_complete: criticalCoverageComplete,
    critical_coverage_limitation_keys: criticalCoverageLimitationKeys,
    scoreConfidence,
    score_confidence: scoreConfidence,
    visualCaptureFailureReason: visualCapture.failureReason,
    visualCaptureMethod: visualCapture.captureMethod,
    visualCaptureNotes: visualCapture.notes,
    visualCaptureStatus: visualCapture.status,
    visual_capture_failure_reason: visualCapture.failureReason,
    visual_capture_method: visualCapture.captureMethod,
    visual_capture_notes: visualCapture.notes,
    visual_capture_status: visualCapture.status,
    visual_capture_technical_limit: visualCaptureUnavailable,
    thirdPartyRequestCount: thirdPartyRequestCount,
    thirdPartyRequestDomains: thirdPartyDomains,
    third_party_request_count: thirdPartyRequestCount,
    third_party_request_domains: thirdPartyDomains,
    visual_evidence_artifacts: (bundle.screenshots ?? [])
      .filter(isPreConsentScreenshotArtifact)
      .sort((left, right) => preConsentScreenshotRank(left) - preConsentScreenshotRank(right))
      .flatMap((screenshot) => {
      if (!isPreConsentScreenshotArtifact(screenshot)) {
        return [];
      }
      const capturedErrorShell = isPreConsentErrorShellScreenshot(bundle, screenshot);
      const storagePointer = localV2ScreenshotStoragePointer({
        scanArtifactUri: options.scanArtifactUri,
        scanId: scanRecord.scan.id,
        screenshotPath: screenshot.path
      });
      return [{
        bucket: storagePointer.bucket,
        capture_method: getString((screenshot as { captureMethod?: unknown }).captureMethod) ?? visualCapture.captureMethod ?? null,
        capture_step: "initial_load",
        consent_state: screenshot.consentStateAtTime ?? "pre_consent",
        final_url: safeLocalV2DocumentUrl(screenshot.url, canonicalDocumentUrl),
        id: localV2VisualEvidenceArtifactId(screenshot),
        interaction_state: "none",
        key: capturedErrorShell ? null : storagePointer.key,
        mime_type: "image/png",
        page_url: safeLocalV2DocumentUrl(screenshot.url, canonicalDocumentUrl),
        status: capturedErrorShell ? "capture_failed" : "available",
        status_reason: capturedErrorShell ? "pre_consent_error_shell_captured" : null
      }];
    })
  };
  const snapshot = {
    ...(scanRecord.snapshot ?? {}),
    certscore_overall: localV2NoGo ? null : score,
    consent_maturity_score: localV2NoGo || score === null ? null : Math.max(0, score - 5),
    consent_score: localV2NoGo || score === null ? null : Math.max(0, score - 10),
    cookie_banner_present: consentRuntimeEvidenceReportable ? assessedConsentSurfaceObserved : null,
    cookie_count_total: runtimeEvidenceReportable ? cookieIdentityCount : 0,
    cookies_before_consent_count: runtimeEvidenceReportable ? cookiesBeforeConsentCount : 0,
    data_collection_risk_score: runtimeEvidenceReportable ? Math.min(100, Math.max(20, thirdPartyRequestCount)) : null,
    domain: requestedHost,
    final_effective_url: canonicalDocumentUrl,
    final_url: canonicalDocumentUrl,
    ...(policyOnlyPartial ? {
      access_posture_class: "homepage_limited_policy_verified",
      block_page_classification: localV2NoGo?.pageState ?? "access_blocked",
      blocked_flag: true,
      challenge_suspected: localV2NoGo?.primaryReasonCode === "captcha_or_challenge",
      coverage_level: "limited_partial",
      homepage_fetch_status: "blocked",
      scan_outcome: "completed_partial",
      stop_reason_code: "homepage_unavailable_policy_evidence_retained",
      stop_reason_detail: "Homepage runtime was unavailable, but independently fetched first-party policy evidence was retained.",
      stop_reason_label: "Homepage unavailable; policy evidence retained",
    } : localV2NoGo ? buildLocalV2NoGoSnapshotFields(localV2NoGo.primaryReasonCode, localV2NoGo.pageState) : {
      homepage_fetch_status: "success",
      scan_outcome: resolveFinalMaterializedScanOutcome({
        existingOutcome: scanRecord.snapshot?.scan_outcome,
      })
    }),
    legal_coverage_score: localV2NoGo ? null : score,
    pages_scanned: localV2NoGo ? 0 : Math.max(scanRecord.scan.pagesScanned, 1),
    partial_scan: true,
    preconsent_tracking_detected: runtimeEvidenceReportable ? hasPromotionGradePreconsentTracking : false,
    privacy_policy_present: Boolean(privacySurface),
    privacy_score: localV2NoGo ? null : score,
    score_confidence: scoreConfidence,
    site_language_primary: getLocalV2PrimaryLanguage(bundle),
    registered_domain: rootDomain,
    runtime_counts_retained: effectiveRuntimeCountsRetained,
    runtime_coverage_status: effectiveRuntimeCoverageStatus,
    runtime_limitation_keys: effectiveRuntimeLimitationKeys,
    third_party_cookie_count: runtimeEvidenceReportable ? uniqueStrings(preconsentCookies
      .filter((event) => event.cookieParty === "third_party" || event.thirdParty === true)
      .map((event) => cookieIdentity(event))).length : 0,
    third_party_cookie_set_before_consent: runtimeEvidenceReportable
      ? preconsentCookies.some((event) => event.cookieParty === "third_party" || event.thirdParty === true)
      : false,
    third_party_request_count: runtimeEvidenceReportable ? thirdPartyRequestCount : 0,
    third_party_script_domain_count: runtimeEvidenceReportable ? thirdPartyDomains.length : 0,
    tracker_count_total: runtimeEvidenceReportable ? promotionGradeRequestPurposeRows.length : 0,
    tracker_vendor_count: runtimeEvidenceReportable ? promotionGradeVendorNames.length : 0,
    tracking_before_consent_detected: runtimeEvidenceReportable ? hasPromotionGradePreconsentTracking : false,
    verified_public_surfaces_count: localV2NoGo && !policyOnlyPartial
      ? 0
      : uniqueStrings([
          ...(!localV2NoGo ? [canonicalDocumentUrl] : []),
          ...verifiedPolicySurfaces.map(({ pageUrl, surface }) => pageUrl ?? surface.normalizedUrl ?? surface.url)
        ]).length,
    ...(consentRuntimeEvidenceReportable && cmpVendorName ? { cmp_vendor_name: cmpVendorName } : {}),
    ...(cookieSurface ? { cookie_policy_present: true } : {}),
    ...(termsSurface ? { terms_of_service_present: true } : {})
  };
  const policyEnrichmentRows = verifiedPolicySurfaces.map(({ pageUrl, surface, aliasUrls }) => ({
    id: `local-v2-${surface.observationId}`,
    pageType: normalizePolicyPageType(surface.surfaceType),
    pageUrl: pageUrl ?? surface.normalizedUrl ?? surface.url,
    page_type: normalizePolicyPageType(surface.surfaceType),
    page_url: pageUrl ?? surface.normalizedUrl ?? surface.url,
    policyAliasUrls: aliasUrls,
    policy_alias_urls: aliasUrls,
    parentObservationId: surface.parentObservationId ?? null,
    parent_observation_id: surface.parentObservationId ?? null,
    parentSurfaceUrl: surface.parentSurfaceUrl ?? null,
    parent_surface_url: surface.parentSurfaceUrl ?? null,
    traversalDepth: surface.traversalDepth,
    traversal_depth: surface.traversalDepth,
    selectionReasonCodes: surface.selectionReasonCodes ?? [],
    selection_reason_codes: surface.selectionReasonCodes ?? [],
    lastUpdatedText: surface.lastUpdatedText ?? null,
    policy_last_updated_text: surface.lastUpdatedText ?? null,
    policyActionableFlags: surface.mentionedControls ?? [],
    policyMentions: (surface.observedTopics ?? []).map((topic) => ({ topic })),
    gdprTransparencyTopicCandidateSummary: (surface.gdprTransparencyTopicCandidates ?? []).slice(0, 16).map((candidate) => ({
      classifierProvenance: candidate.classifierProvenance,
      confidence: candidate.confidence,
      matchedLocale: candidate.matchedLocale,
      matchStrength: candidate.matchStrength,
      productionCredit: candidate.productionCredit,
      topic: candidate.topic
    })),
    policySummaryShort: surface.textExcerpt ?? `${policySurfaceLabel(surface.surfaceType)} retained by local v2 DAG scan.`,
    policy_actionable_flags: surface.mentionedControls ?? [],
    policy_mentions: (surface.observedTopics ?? []).map((topic) => ({ topic })),
    policy_summary_short: surface.textExcerpt ?? `${policySurfaceLabel(surface.surfaceType)} retained by local v2 DAG scan.`
  }));
  const signalRows = (runtimeEvidenceReportable && hasPromotionGradePreconsentTracking ? [
    {
      category: "privacy",
      key: "privacy.preconsent_tracking_detected",
      label: "Pre-consent tracking detected",
      primaryCategory: "privacy_consent_user_choice",
      primaryCategoryDescription: "Consent, preference, and user-choice signals",
      primaryCategoryLabel: "Privacy consent & user choice",
      subcategory: "consent",
      value: true,
      valueType: "boolean"
    },
    {
      category: "privacy",
      key: "tracking_before_consent_detected",
      label: "Tracking before consent detected",
      primaryCategory: "privacy_consent_user_choice",
      primaryCategoryDescription: "Consent, preference, and user-choice signals",
      primaryCategoryLabel: "Privacy consent & user choice",
      subcategory: "consent",
      value: true,
      valueType: "boolean"
    }
  ] : []) satisfies ScanDetailResponse["signals"];
  const unreliableRuntimeSignalKeys = new Set([
    "privacy.preconsent_tracking_detected",
    "tracking_before_consent_detected",
    "third_party_cookie_set_before_consent"
  ]);
  const baseSignals = runtimeEvidenceReportable
    ? scanRecord.signals
    : scanRecord.signals.filter((signal) => !unreliableRuntimeSignalKeys.has(signal.key));
  const existingSignalKeys = new Set(baseSignals.map((signal) => signal.key));
  const materializedSignals = [
    ...baseSignals,
    ...signalRows.filter((signal) => !existingSignalKeys.has(signal.key))
  ];
  const preconsentViolations = runtimeEvidenceReportable ? reportableVendorRows
    .filter((vendor) => promotionGradeVendorNames.includes(vendor.vendorName))
    .map((vendor) => ({
    collectionEndpointType: vendor.collectionEndpointType,
    confidence: vendor.confidence,
    detectionSource: vendor.detectionSource,
    evidenceUrls: preconsentRequestUrls.filter((url) => vendor.scriptHost && url.includes(vendor.scriptHost)).slice(0, 5),
    firstPartyOrThirdParty: vendor.firstPartyOrThirdParty,
    matchedSignatureId: vendor.matchedSignatureId,
    observedVia: vendor.observedVia,
    scriptHost: vendor.scriptHost,
    vendorDisplayCategory: vendor.vendorDisplayCategory,
    vendorCategory: vendor.vendorCategory,
    vendorName: vendor.vendorName
  })) : [];

  return {
    ...scanRecord,
    accessPostureSummary: !localV2NoGo
      ? {
          ...scanRecord.accessPostureSummary,
          accessPostureClass: "tolerant",
          blockPageClassification: null,
          blockVendorGuess: null,
          homepageFetchStatus: "success",
          pagesScanned: Math.max(scanRecord.scan.pagesScanned, 1),
          finalEffectiveUrl: canonicalDocumentUrl,
          stopTier: null,
          stopOutcomeTitle: null,
          stopReason: null,
          stopReviewTitle: null,
          whatThisMeans: [],
          interruptionLabel: null,
          interruptionReason: null
        }
      : scanRecord.accessPostureSummary,
    pageEvidence: scanRecord.pageEvidence,
    policyEnrichment: mergePolicyEnrichmentRows(
      [...scanRecord.policyEnrichment, ...policyEnrichmentRows],
      canonicalDocumentUrl,
    ),
    preconsentViolations: runtimeEvidenceReportable
      ? (scanRecord.preconsentViolations.length > 0 ? scanRecord.preconsentViolations : preconsentViolations)
      : [],
    primaryPolicyEnrichment: scanRecord.primaryPolicyEnrichment ?? policyEnrichmentRows.find((row) => row.pageType === "privacy_policy") ?? policyEnrichmentRows[0] ?? null,
    runtimeArtifacts,
    scan: {
      ...scanRecord.scan,
      pagesScanned: localV2NoGo && !policyOnlyPartial ? 0 : Math.max(scanRecord.scan.pagesScanned, 1)
    },
    signals: materializedSignals,
    snapshot,
    trackerVendors: runtimeEvidenceReportable
      ? (inventoryVendorRows.length > 0 ? inventoryVendorRows : scanRecord.trackerVendors)
      : []
  };
}

// Bump whenever materialization semantics change. This cache contains the
// fully derived report detail, so retaining an older entry can cause a
// projection repair to persist stale evidence even after the projector is
// deployed.
const LOCAL_V2_DAG_REPORT_MATERIALIZATION_CACHE_VERSION = "local-v2-report-materialization-v7";
const LOCAL_V2_DAG_REPORT_MATERIALIZATION_CACHE_TTL_MS = 60 * 60 * 1_000;
const LOCAL_V2_DAG_REPORT_MATERIALIZATION_CACHE_MAX_ENTRIES = 6;
const localV2DagReportMaterializationCache = new BoundedPromiseCache<string, ScanDetailResponse>({
  maxEntries: LOCAL_V2_DAG_REPORT_MATERIALIZATION_CACHE_MAX_ENTRIES,
  onEvent: ({ key, outcome, size }) => {
    console.warn(JSON.stringify({
      cacheKeyHash: createHash("sha256").update(key).digest("hex").slice(0, 12),
      cacheSize: size,
      event: "app.scan_detail.local_v2_cache",
      outcome
    }));
  },
  ttlMs: LOCAL_V2_DAG_REPORT_MATERIALIZATION_CACHE_TTL_MS
});

async function loadLocalV2DagRemoteArtifacts(input: {
  readBundle: () => Promise<CanonicalEvidenceBundle | null>;
  readGeometry: (manifest: Record<string, unknown> | null) => Promise<Record<string, unknown> | null>;
  readManifest: () => Promise<Record<string, unknown> | null>;
}) {
  // Start the largest object immediately. The geometry pointer depends on the
  // small manifest, but geometry itself does not depend on the bundle. Starting
  // it as soon as the manifest resolves removes a full S3 request from the
  // critical path.
  const bundlePromise = input.readBundle();
  const manifest = await input.readManifest();
  const geometryPromise = input.readGeometry(manifest);
  const [bundle, consentControlGeometryEvidence] = await Promise.all([
    bundlePromise,
    geometryPromise
  ]);
  return {
    bundle,
    consentControlGeometryEvidence,
    manifest
  };
}

async function materializeLocalV2DagScanDetailUncached(
  scanRecord: ScanDetailResponse,
  options: { requireBundle?: boolean } = {}
): Promise<ScanDetailResponse> {
  const input = getLocalV2DagReportInput(scanRecord);
  if (!input || scanRecord.scan.status !== "completed") {
    return scanRecord;
  }
  const shouldReadLocalOutDir = Boolean(input.outDir && shouldUseLocalV2DagScanTool());
  let bundle: CanonicalEvidenceBundle | null;
  let consentControlGeometryEvidence: Record<string, unknown> | null;
  let remoteManifest: Record<string, unknown> | null = null;
  let policyTextArtifactsById: ReadonlyMap<string, RetainedPolicyTextArtifactEvidence> | undefined;
  if (shouldReadLocalOutDir && input.outDir) {
    [bundle, consentControlGeometryEvidence] = await withServerTiming(
      "app.scan_detail.local_v2_artifacts.local",
      async () => {
        const [localBundle, localGeometryEvidence] = await Promise.all([
          readLocalV2DagBundle(input.outDir!),
          readLocalV2ConsentControlGeometry(input.outDir!)
        ]);
        return [localBundle, localGeometryEvidence] as const;
      }
    );
  } else {
    const remoteArtifacts = await withServerTiming(
      "app.scan_detail.local_v2_artifacts.remote",
      () => loadLocalV2DagRemoteArtifacts({
        readBundle: () => input.scanArtifactUri
          ? withServerTiming("app.scan_detail.local_v2_artifact.bundle", () =>
              readLocalV2DagBundleFromS3({
                expectedSha256: input.scanArtifactSha256,
                expectedSizeBytes: input.scanArtifactSizeBytes,
                uri: input.scanArtifactUri!
              })
            )
          : Promise.resolve(null),
        readGeometry: (manifest) => {
          const geometryArtifact = getLocalV2DagAuxiliaryArtifact(
            manifest,
            "ConsentControlGeometryEvidence.json"
          );
          return geometryArtifact
            ? withServerTiming("app.scan_detail.local_v2_artifact.geometry", () =>
                readLocalV2ConsentControlGeometryFromS3(geometryArtifact)
              )
            : Promise.resolve(null);
        },
        readManifest: () => input.manifestArtifactUri
          ? withServerTiming("app.scan_detail.local_v2_artifact.manifest", () =>
              readLocalV2DagManifestFromS3({
                expectedSha256: input.manifestArtifactSha256,
                expectedSizeBytes: input.manifestArtifactSizeBytes,
                uri: input.manifestArtifactUri!
              })
            )
          : Promise.resolve(null)
      })
    );
    bundle = remoteArtifacts.bundle;
    consentControlGeometryEvidence = remoteArtifacts.consentControlGeometryEvidence;
    remoteManifest = remoteArtifacts.manifest;
    if (bundle) {
      policyTextArtifactsById = await withServerTiming(
        "app.scan_detail.local_v2_artifact.policy_text",
        () => loadVerifiedPolicyTextArtifacts({ bundle: bundle!, manifest: remoteManifest })
      );
    }
  }
  if (
    !bundle &&
    (
      options.requireBundle ||
      (!shouldReadLocalOutDir && Boolean(input.scanArtifactUri && input.scanArtifactSha256))
    )
  ) {
    throw new Error(`Required local v2 DAG evidence bundle was unavailable for scan ${scanRecord.scan.id}.`);
  }
  return bundle
    ? withServerTiming("app.scan_detail.local_v2_projection", async () =>
        buildMaterializedLocalV2Detail(scanRecord, bundle, {
          consentControlGeometryEvidence,
          gdprTransparencyEvidenceProfile: input.gdprTransparencyEvidenceProfile,
          localOutDir: shouldReadLocalOutDir ? input.outDir : null,
          policyTextEvidenceContext: {
            artifactsById: policyTextArtifactsById,
            generatedAt: bundle.completedAt,
            localOutDir: shouldReadLocalOutDir ? input.outDir : null,
            scanId: bundle.scanId,
            sourceBundle: shouldReadLocalOutDir
              ? {
                  schemaVersion: bundle.schemaVersion,
                  verificationStatus: "local_unverified",
                }
              : input.scanArtifactSha256 && input.scanArtifactSizeBytes !== null && input.scanArtifactUri
                ? {
                    schemaVersion: bundle.schemaVersion,
                    sha256: input.scanArtifactSha256,
                    sizeBytes: input.scanArtifactSizeBytes,
                    uri: input.scanArtifactUri,
                    verificationStatus: "verified",
                  }
                : {
                    schemaVersion: bundle.schemaVersion,
                    verificationStatus: "unavailable",
                  },
          },
          scanArtifactUri: input.scanArtifactUri
        })
      )
    : scanRecord;
}

export async function materializeLocalV2DagScanDetail(
  scanRecord: ScanDetailResponse,
  options: { requireBundle?: boolean } = {}
): Promise<ScanDetailResponse> {
  const input = getLocalV2DagReportInput(scanRecord);
  if (!input || scanRecord.scan.status !== "completed") {
    return scanRecord;
  }

  // Production Lambda artifacts are immutable once their verified SHA is
  // recorded. Deduplicate the derived report in-process by scan and artifact
  // version so report navigation does not reread S3 and repeat the full
  // projection. The record is intentionally not sent through Next's data cache:
  // evidence-rich scans can exceed that cache's 2 MB item limit. Local/test
  // records without a verified artifact identity stay uncached so fixtures and
  // local out-dir development remain fully deterministic.
  const localOutDirActive = Boolean(input.outDir && shouldUseLocalV2DagScanTool());
  if (localOutDirActive || !input.scanArtifactUri || !input.scanArtifactSha256) {
    return materializeLocalV2DagScanDetailUncached(scanRecord, options);
  }

  const reportGeneration = getScanReportProjectionGeneration(scanRecord);
  const cacheKey = [
    LOCAL_V2_DAG_REPORT_MATERIALIZATION_CACHE_VERSION,
    scanRecord.scan.id,
    input.scanArtifactSha256,
    input.manifestArtifactSha256 ?? "no-manifest",
    getProductionPolicyModelReviewRevision(scanRecord.runtimeArtifacts),
    reportGeneration.eventCount,
    reportGeneration.latestEventId ?? "no-events",
    options.requireBundle === true ? "required" : "optional"
  ].join(":");
  return localV2DagReportMaterializationCache.getOrCreate(
    cacheKey,
    () => materializeLocalV2DagScanDetailUncached(scanRecord, options)
  );
}

export const localV2DagReportPerformanceTestHelpers = {
  loadLocalV2DagRemoteArtifacts
};
