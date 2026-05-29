import {
  buildSharedFullScanConfig,
  getScanFromDefinition,
  normalizeScanFrom,
  type SharedCrawlSeedHint,
  type SharedPriorScanAccelerationConfig,
  type SharedScanConfig,
  type ScanFrom
} from "@website-signal-risk-scanner/shared";

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
  hostname: string;
  maxPages: number;
  normalizedUrl: string;
  priorScanAcceleration?: QueuedFullScanPriorScanAcceleration | null;
  profile: string;
  scanFrom?: ScanFrom;
  source: string;
};

export type QueuedFullScanPriorScanAcceleration = {
  crawlSeedHints: SharedCrawlSeedHint[];
  priorScan: SharedPriorScanAccelerationConfig;
};

export function buildQueuedFullScanConfig(input: BuildQueuedFullScanConfigInput): SharedScanConfig {
  const scanFrom = normalizeScanFrom(input.scanFrom);
  const scanFromDefinition = getScanFromDefinition(scanFrom);
  return buildSharedFullScanConfig({
    ...(input.priorScanAcceleration
      ? {
          execution: {
            crawlSeedHints: input.priorScanAcceleration.crawlSeedHints,
            priorScanAcceleration: input.priorScanAcceleration.priorScan
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
  });
}
