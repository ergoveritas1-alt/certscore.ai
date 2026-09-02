import {
  buildSharedFullScanConfig,
  getScanFromDefinition,
  normalizeScanFrom,
  type SharedCrawlSeedHint,
  type SharedPriorDocumentSource,
  type SharedPriorScanAccelerationConfig,
  type SharedScanConfig,
  type SharedTrancoRankMetadata,
  type ScanFrom
} from "@website-signal-risk-scanner/shared";
import {
  applyLocalV2DagScanConfig,
  type LocalV2DagLambdaDebugOverrides,
  type LocalV2DagScanEnv,
  type LocalV2DagScanProfile
} from "./local-v2-dag-scan-config";
import type { CampaignAttribution } from "../../lib/attribution/campaign-attribution";

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
  campaignAttribution?: CampaignAttribution | null;
  env?: LocalV2DagScanEnv;
  hostname: string;
  localV2DagScanProfile?: LocalV2DagScanProfile | null;
  localV2DagLambdaDebugOverrides?: LocalV2DagLambdaDebugOverrides | null;
  localV2DagRunViaLambda?: boolean | null;
  maxPages: number;
  normalizedUrl: string;
  priorScanAcceleration?: QueuedFullScanPriorScanAcceleration | null;
  profile: string;
  scanFrom?: ScanFrom;
  source: string;
  trancoRankMetadata?: SharedTrancoRankMetadata | null;
};

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

export function buildQueuedFullScanConfig(input: BuildQueuedFullScanConfigInput): SharedScanConfig {
  const env = input.env ?? process.env;
  const scanFrom = normalizeScanFrom(input.scanFrom);
  const scanFromDefinition = getScanFromDefinition(scanFrom);
  const crawlSeedHints = [
    ...(input.priorScanAcceleration?.crawlSeedHints ?? []),
    ...buildCanonicalLegalSurfaceHints({ normalizedUrl: input.normalizedUrl })
  ];
  return applyLocalV2DagScanConfig(buildSharedFullScanConfig({
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
    ...(input.campaignAttribution ? { campaignAttribution: input.campaignAttribution } : {}),
    ...(input.trancoRankMetadata
      ? {
          siteMetadata: {
            tranco: input.trancoRankMetadata
          }
        }
      : {}),
    source: input.source
  }), env, {
    lambdaDebugOverrides: input.localV2DagLambdaDebugOverrides,
    profile: input.localV2DagScanProfile,
    runViaLambda: env.NODE_ENV === "production" ? true : input.localV2DagRunViaLambda,
    scanFrom
  });
}
