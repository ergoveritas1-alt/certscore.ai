type SharedPost403Policy = {
  maxHomepageRetriesAfter403: number;
  maxPassiveVerificationFetchesAfter403: number;
  passiveOnlyAfter403: boolean;
  stopOnHomepage403: boolean;
  verifiedSurfaceTargetsAfter403: string[];
};

export type SharedScanConfigOptions = {
  crawlerIdentity?: {
    productToken?: string | null;
    publicUrl?: string | null;
  };
  execution?: {
    mode?: string;
    runtimeMode?: string;
    scanPlanProfileOverride?: string;
  };
  frequency?: string;
  hostname?: string;
  maxPages: number;
  maxRequestedTier?: string;
  normalizedUrl?: string;
  post403Policy?: Partial<SharedPost403Policy>;
  processor: string;
  profile: string;
  source: string;
  triggerMode?: string;
};

const DEFAULT_POST_403_POLICY: SharedPost403Policy = {
  maxHomepageRetriesAfter403: 0,
  maxPassiveVerificationFetchesAfter403: 4,
  passiveOnlyAfter403: true,
  stopOnHomepage403: true,
  verifiedSurfaceTargetsAfter403: ["privacy_policy", "terms_of_service", "cookie_policy", "contact_page"]
};

export function buildSharedFullScanConfig(input: SharedScanConfigOptions) {
  const config: Record<string, unknown> = {
    freshBrowserRequired: true,
    maxPages: input.maxPages,
    maxRequestedTier: input.maxRequestedTier ?? "tier5_full_scan",
    post403Policy: {
      ...DEFAULT_POST_403_POLICY,
      ...input.post403Policy
    },
    processor: input.processor,
    profile: input.profile,
    source: input.source
  };

  if (input.hostname) {
    config.hostname = input.hostname;
  }

  if (input.normalizedUrl) {
    config.normalizedUrl = input.normalizedUrl;
  }

  if (input.frequency) {
    config.frequency = input.frequency;
  }

  if (input.triggerMode) {
    config.triggerMode = input.triggerMode;
  }

  if (input.crawlerIdentity) {
    config.crawlerIdentity = input.crawlerIdentity;
  }

  if (input.execution) {
    config.execution = input.execution;
  }

  return config;
}
