export type ApiReadRateProfile = "terminal" | "status";
export type ApiReadRateScope = "callerTarget" | "target" | "caller";
export type ApiReadRateWindowId = "burst" | "daily";
export type ApiReadRateCostClass =
  | "ordinary"
  | "evidence"
  | "full"
  | "diagnostics"
  | "export"
  | "bundle";

type ApiReadRateWindowPolicy = {
  id: ApiReadRateWindowId;
  windowSeconds: number;
  limits: Partial<Record<ApiReadRateScope, number>>;
  /** Hard aggregate for verified shared-provider MCP traffic; not a per-user identity. */
  mcpProviderLimit?: number;
};

type ApiReadRatePolicy = {
  version: string;
  weights: Record<ApiReadRateCostClass, number>;
  profiles: Record<ApiReadRateProfile, {
    windows: readonly ApiReadRateWindowPolicy[];
  }>;
};

/**
 * Canonical read-rate policy for CertScore API and MCP scan retrievals.
 *
 * Keep operational enforcement and storage in the owning service, but do not
 * duplicate these windows, limits, or weights in service-local code.
 */
export const API_READ_RATE_POLICY = {
  version: "2026-08-14",
  weights: {
    ordinary: 1,
    evidence: 4,
    full: 4,
    diagnostics: 4,
    export: 4,
    bundle: 4
  },
  profiles: {
    terminal: {
      windows: [
        {
          id: "burst",
          windowSeconds: 10 * 60,
          limits: {
            callerTarget: 120,
            target: 4_000,
            caller: 480
          },
          mcpProviderLimit: 8_000
        },
        {
          id: "daily",
          windowSeconds: 24 * 60 * 60,
          limits: {
            callerTarget: 1_200
          },
          mcpProviderLimit: 40_000
        }
      ]
    },
    status: {
      windows: [
        {
          id: "burst",
          windowSeconds: 10 * 60,
          limits: {
            callerTarget: 120,
            target: 10_000,
            caller: 600
          },
          mcpProviderLimit: 20_000
        }
      ]
    }
  }
} as const satisfies ApiReadRatePolicy;

export function apiReadRateUnits(costClass: ApiReadRateCostClass) {
  return API_READ_RATE_POLICY.weights[costClass];
}

export function apiReadRateWindow<
  Profile extends ApiReadRateProfile,
  Id extends (typeof API_READ_RATE_POLICY.profiles)[Profile]["windows"][number]["id"]
>(profile: Profile, id: Id): Extract<
  (typeof API_READ_RATE_POLICY.profiles)[Profile]["windows"][number],
  { id: Id }
> {
  const windows: readonly ApiReadRateWindowPolicy[] = API_READ_RATE_POLICY.profiles[profile].windows;
  const window = windows.find((candidate) => candidate.id === id);
  if (!window) throw new Error(`Missing ${profile} API read-rate ${id} window`);
  return window as Extract<
    (typeof API_READ_RATE_POLICY.profiles)[Profile]["windows"][number],
    { id: Id }
  >;
}

export const API_READ_RATE_MAX_WINDOW_SECONDS = Math.max(
  ...Object.values(API_READ_RATE_POLICY.profiles).flatMap((profile) =>
    profile.windows.map((window) => window.windowSeconds)
  )
);

/** Public, machine-readable projection embedded in the API v1 and v2 OpenAPI documents. */
export const API_READ_RATE_POLICY_OPENAPI_EXTENSION = {
  policyVersion: API_READ_RATE_POLICY.version,
  windowSemantics: "rolling",
  unitWeights: API_READ_RATE_POLICY.weights,
  profiles: API_READ_RATE_POLICY.profiles,
  scopeDefinitions: {
    callerTarget: "One authenticated caller or anonymous requester identity retrieving one scan or domain resource.",
    target: "One scan or domain resource across all callers.",
    caller: "One authenticated caller or anonymous requester identity across resources."
  },
  throttledResponse: {
    status: 429,
    retryHeader: "Retry-After",
    instruction: "Wait for Retry-After before retrying. Do not poll terminal scan resources."
  }
} as const;

const API_READ_RATE_PROFILE_COPY = {
  terminal: {
    message: "Completed scan resource read limit exceeded for this caller and/or resource.",
    recommendedNextAction: "Wait for Retry-After, then make one bounded retrieval. Do not poll terminal scan resources."
  },
  status: {
    message: "Scan status read limit exceeded for this caller and/or scan.",
    recommendedNextAction: "Wait for Retry-After before polling again. Stop polling when the scan reaches a terminal status."
  }
} as const satisfies Record<ApiReadRateProfile, { message: string; recommendedNextAction: string }>;

/** Canonical bot-facing copy for API and MCP 429 responses. */
export function apiReadRateLimitGuidance(profile: ApiReadRateProfile, retryAfterSeconds: number) {
  const copy = API_READ_RATE_PROFILE_COPY[profile];
  return {
    message: `${copy.message} Retry after ${retryAfterSeconds} seconds.`,
    recommendedNextAction: copy.recommendedNextAction
  };
}
