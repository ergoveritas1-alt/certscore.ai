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

export type SharedScanConfig = {
  crawlerIdentity?: SharedCrawlerIdentityConfig;
  execution?: Record<string, unknown>;
  hostname?: string;
  maxPages?: number;
  maxRequestedTier?: number;
  normalizedUrl?: string;
  post403Policy?: SharedPost403PolicyConfig;
  processor?: string;
  profile?: string;
  source?: string;
  triggerMode?: string;
};

type BuildSharedFullScanConfigInput = {
  crawlerIdentity?: SharedCrawlerIdentityConfig;
  execution?: Record<string, unknown>;
  hostname?: string;
  maxPages: number;
  maxRequestedTier?: number;
  normalizedUrl?: string;
  post403Policy?: SharedPost403PolicyConfig;
  processor: string;
  profile: string;
  source: string;
  triggerMode?: string;
};

export function buildSharedFullScanConfig(input: BuildSharedFullScanConfigInput): SharedScanConfig {
  return {
    ...(input.crawlerIdentity ? { crawlerIdentity: input.crawlerIdentity } : {}),
    ...(input.execution ? { execution: input.execution } : {}),
    ...(input.hostname ? { hostname: input.hostname } : {}),
    ...(typeof input.maxRequestedTier === "number" ? { maxRequestedTier: input.maxRequestedTier } : {}),
    ...(input.normalizedUrl ? { normalizedUrl: input.normalizedUrl } : {}),
    ...(input.post403Policy ? { post403Policy: input.post403Policy } : {}),
    ...(input.triggerMode ? { triggerMode: input.triggerMode } : {}),
    maxPages: input.maxPages,
    processor: input.processor,
    profile: input.profile,
    source: input.source
  };
}
