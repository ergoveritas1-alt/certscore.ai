import type { RequestedGeoTarget, ScanFrom } from "./scan-location";

export type SharedCrawlerIdentityConfig = {
  productToken?: string;
  publicUrl?: string;
};

export type SharedPost403PolicyConfig = {
  maxHomepageRetriesAfter403?: number;
  maxPassiveVerificationFetchesAfter403?: number;
  passiveOnlyAfter403?: boolean;
  stopOnHomepage403?: boolean;
  verifiedSurfaceTargetsAfter403?: string[];
};

export type SharedCrawlSeedHint = {
  confidence?: number | null;
  hintType: string;
  source: "prior_scan_hint" | "canonical_legal_surface_hint";
  sourceCompletedAt: string;
  sourceScanId: string;
  url: string;
};

export type SharedPriorDocumentSource = {
  canonicalUrl: string;
  documentText: string;
  documentType: "privacy_policy" | "terms_of_service" | "cookie_policy";
  metadata?: Record<string, unknown>;
  semanticConfidence?: number | null;
  sourceCompletedAt: string;
  sourceScanId: string;
  sourceUrl?: string | null;
  title?: string | null;
};

export type SharedPriorScanAccelerationConfig = {
  crawlSeedHintCount: number;
  crawlSeedHintTypes?: string[];
  priorHitScanProfile?: "hint_first";
  priorScanSelectionReason?: string;
  priorScanSelectionScore?: number;
  selectedDocumentSourceCount: number;
  selectedHighYieldPageCount?: number;
  sourceCompletedAt: string;
  sourceScanId: string;
};

export type SharedTrancoRankMetadata = {
  lookupHostname: string;
  lookupRegistrableDomain?: string | null;
  matchType: "exact_hostname" | "hostname_without_www" | "registrable_domain" | "candidate_hostname";
  rank: number;
  rankBand?: string | null;
  matchedHostname: string;
  source: "validation_targets";
  sourceUpdatedAt?: string | null;
};

export type SharedSiteMetadataConfig = {
  tranco?: SharedTrancoRankMetadata;
  [key: string]: unknown;
};

export type SharedCaliforniaPrivacyScanConfig = {
  exercisePrivacyChoicePath?: boolean;
  forceGpcVerification?: boolean;
};

export type SharedScanExecutionConfig = {
  crawlSeedHints?: SharedCrawlSeedHint[];
  priorDocumentSources?: SharedPriorDocumentSource[];
  priorScanAcceleration?: SharedPriorScanAccelerationConfig;
} & Record<string, unknown>;

export type SharedScanConfig = {
  californiaPrivacy?: SharedCaliforniaPrivacyScanConfig;
  crawlerIdentity?: SharedCrawlerIdentityConfig;
  execution?: SharedScanExecutionConfig;
  freshBrowserRequired?: boolean;
  hostname?: string;
  maxPages?: number;
  maxRequestedTier?: number | string;
  normalizedUrl?: string;
  post403Policy?: SharedPost403PolicyConfig;
  processor?: string;
  profile?: string;
  requestedGeo?: RequestedGeoTarget;
  scanFrom?: ScanFrom;
  siteMetadata?: SharedSiteMetadataConfig;
  source?: string;
  triggerMode?: string;
};

type BuildSharedFullScanConfigInput = {
  californiaPrivacy?: SharedCaliforniaPrivacyScanConfig;
  crawlerIdentity?: SharedCrawlerIdentityConfig;
  execution?: SharedScanExecutionConfig;
  freshBrowserRequired?: boolean;
  hostname?: string;
  maxPages: number;
  maxRequestedTier?: number | string;
  normalizedUrl?: string;
  post403Policy?: SharedPost403PolicyConfig;
  processor: string;
  profile: string;
  requestedGeo?: RequestedGeoTarget;
  scanFrom?: ScanFrom;
  siteMetadata?: SharedSiteMetadataConfig;
  source: string;
  triggerMode?: string;
};

export function buildSharedFullScanConfig(input: BuildSharedFullScanConfigInput): SharedScanConfig {
  return {
    ...(input.californiaPrivacy ? { californiaPrivacy: input.californiaPrivacy } : {}),
    ...(input.crawlerIdentity ? { crawlerIdentity: input.crawlerIdentity } : {}),
    ...(input.execution ? { execution: input.execution } : {}),
    ...(typeof input.freshBrowserRequired === "boolean" ? { freshBrowserRequired: input.freshBrowserRequired } : {}),
    ...(input.hostname ? { hostname: input.hostname } : {}),
    ...(typeof input.maxRequestedTier === "number" || typeof input.maxRequestedTier === "string"
      ? { maxRequestedTier: input.maxRequestedTier }
      : {}),
    ...(input.normalizedUrl ? { normalizedUrl: input.normalizedUrl } : {}),
    ...(input.post403Policy ? { post403Policy: input.post403Policy } : {}),
    ...(input.requestedGeo ? { requestedGeo: input.requestedGeo } : {}),
    ...(input.scanFrom ? { scanFrom: input.scanFrom } : {}),
    ...(input.siteMetadata ? { siteMetadata: input.siteMetadata } : {}),
    ...(input.triggerMode ? { triggerMode: input.triggerMode } : {}),
    maxPages: input.maxPages,
    processor: input.processor,
    profile: input.profile,
    source: input.source
  };
}
