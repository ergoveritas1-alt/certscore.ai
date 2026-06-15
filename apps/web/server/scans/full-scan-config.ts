import {
  buildSharedFullScanConfig,
  getScanFromDefinition,
  normalizeScanFrom,
  type SharedCaliforniaPrivacyScanConfig,
  type SharedCrawlSeedHint,
  type SharedPriorDocumentSource,
  type SharedPriorScanAccelerationConfig,
  type SharedScanConfig,
  type ScanFrom
} from "@website-signal-risk-scanner/shared";
import {
  applyLocalV2DagScanConfig,
  type LocalV2DagScanEnv,
  type LocalV2DagScanProfile
} from "./local-v2-dag-scan-config";

export const QUEUED_FULL_SCAN_PROCESSOR = "queued-full-scan-v1";
export const QUEUED_FULL_SCAN_MAX_REQUESTED_TIER = "tier5_full_scan";

export const QUEUED_FULL_SCAN_POST_403_POLICY = {
  maxHomepageRetriesAfter403: 0,
  maxPassiveVerificationFetchesAfter403: 4,
  passiveOnlyAfter403: true,
  stopOnHomepage403: true,
  verifiedSurfaceTargetsAfter403: ["privacy_policy", "terms_of_service", "cookie_policy", "contact_page"]
};

export type BuildQueuedFullScanConfigInput = {
  californiaPrivacy?: QueuedFullScanCaliforniaPrivacyConfig | null;
  env?: LocalV2DagScanEnv;
  hostname: string;
  localV2DagScanProfile?: LocalV2DagScanProfile | null;
  localV2DagRunViaLambda?: boolean | null;
  maxPages: number;
  normalizedUrl: string;
  priorScanAcceleration?: QueuedFullScanPriorScanAcceleration | null;
  profile: string;
  scanFrom?: ScanFrom;
  source: string;
};

export type QueuedFullScanCaliforniaPrivacyConfig = SharedCaliforniaPrivacyScanConfig;

export type QueuedFullScanPriorScanAcceleration = {
  crawlSeedHints: SharedCrawlSeedHint[];
  priorDocumentSources?: SharedPriorDocumentSource[];
  priorScan: SharedPriorScanAccelerationConfig;
};

const CANONICAL_LEGAL_SURFACE_HINT_SOURCE_ID = "canonical-legal-surface-hints-v1";
const CANONICAL_LEGAL_SURFACE_HINT_SOURCE_COMPLETED_AT = "1970-01-01T00:00:00.000Z";
const CANONICAL_LEGAL_SURFACE_PATHS: Array<{ hintType: string; path: string; confidence: number }> = [
  { hintType: "privacy_policy", path: "/privacy", confidence: 0.62 },
  { hintType: "privacy_policy", path: "/privacy-policy", confidence: 0.68 },
  { hintType: "privacy_policy", path: "/privacy-notice", confidence: 0.66 },
  { hintType: "privacy_policy", path: "/legal/privacy", confidence: 0.58 },
  { hintType: "cookie_policy", path: "/cookies", confidence: 0.62 },
  { hintType: "cookie_policy", path: "/cookie-policy", confidence: 0.66 },
  { hintType: "privacy_choice", path: "/privacy/choices", confidence: 0.54 },
  { hintType: "privacy_choice", path: "/privacy-rights", confidence: 0.54 }
];

function buildCanonicalLegalSurfaceHints(input: { normalizedUrl: string }): SharedCrawlSeedHint[] {
  let origin: string;
  try {
    origin = new URL(input.normalizedUrl).origin;
  } catch {
    return [];
  }

  return CANONICAL_LEGAL_SURFACE_PATHS.map((candidate) => ({
    confidence: candidate.confidence,
    hintType: candidate.hintType,
    source: "canonical_legal_surface_hint",
    sourceCompletedAt: CANONICAL_LEGAL_SURFACE_HINT_SOURCE_COMPLETED_AT,
    sourceScanId: CANONICAL_LEGAL_SURFACE_HINT_SOURCE_ID,
    url: `${origin}${candidate.path}`
  }));
}

function normalizeQueuedCaliforniaPrivacyConfig(
  config: QueuedFullScanCaliforniaPrivacyConfig | null | undefined,
  input?: { scanFrom?: ScanFrom }
): QueuedFullScanCaliforniaPrivacyConfig | undefined {
  const scanFrom = normalizeScanFrom(input?.scanFrom);
  const shouldRunBoundedCaliforniaGpcPass =
    scanFrom === "california" ||
    config?.exercisePrivacyChoicePath === true ||
    config?.forceGpcVerification === true;

  if (!config && !shouldRunBoundedCaliforniaGpcPass) {
    return undefined;
  }

  const normalized: QueuedFullScanCaliforniaPrivacyConfig = {};

  if (
    config?.exercisePrivacyChoicePath === true ||
    (config?.exercisePrivacyChoicePath !== false && scanFrom === "california")
  ) {
    normalized.exercisePrivacyChoicePath = true;
  }

  if (config?.forceGpcVerification === true || (config?.forceGpcVerification !== false && shouldRunBoundedCaliforniaGpcPass)) {
    normalized.forceGpcVerification = true;
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

export function requiresFreshScanForCaliforniaRuntime(input: {
  californiaPrivacy?: QueuedFullScanCaliforniaPrivacyConfig | null;
  scanFrom?: ScanFrom;
}) {
  const californiaPrivacy = normalizeQueuedCaliforniaPrivacyConfig(input.californiaPrivacy, {
    scanFrom: input.scanFrom
  });
  return Boolean(californiaPrivacy?.exercisePrivacyChoicePath || californiaPrivacy?.forceGpcVerification);
}

export function buildQueuedFullScanConfig(input: BuildQueuedFullScanConfigInput): SharedScanConfig {
  const scanFrom = normalizeScanFrom(input.scanFrom);
  const scanFromDefinition = getScanFromDefinition(scanFrom);
  const californiaPrivacy = normalizeQueuedCaliforniaPrivacyConfig(input.californiaPrivacy, { scanFrom });
  const crawlSeedHints = [
    ...(input.priorScanAcceleration?.crawlSeedHints ?? []),
    ...buildCanonicalLegalSurfaceHints({ normalizedUrl: input.normalizedUrl })
  ];
  return applyLocalV2DagScanConfig(buildSharedFullScanConfig({
    ...(californiaPrivacy ? { californiaPrivacy } : {}),
    ...(crawlSeedHints.length > 0 || input.priorScanAcceleration
      ? {
          execution: {
            ...(crawlSeedHints.length > 0 ? { crawlSeedHints } : {}),
            ...(input.priorScanAcceleration?.priorDocumentSources?.length
              ? { priorDocumentSources: input.priorScanAcceleration.priorDocumentSources }
              : {}),
            ...(input.priorScanAcceleration ? { priorScanAcceleration: input.priorScanAcceleration.priorScan } : {})
          }
        }
      : {}),
    freshBrowserRequired: true,
    hostname: input.hostname,
    maxPages: input.maxPages,
    maxRequestedTier: QUEUED_FULL_SCAN_MAX_REQUESTED_TIER,
    normalizedUrl: input.normalizedUrl,
    post403Policy: QUEUED_FULL_SCAN_POST_403_POLICY,
    processor: QUEUED_FULL_SCAN_PROCESSOR,
    profile: input.profile,
    requestedGeo: scanFromDefinition.requestedGeo,
    scanFrom,
    source: input.source
  }), input.env, {
    profile: input.localV2DagScanProfile,
    runViaLambda: input.localV2DagRunViaLambda
  });
}
