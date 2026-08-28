import { z } from "zod";
import { pulseResponseSchema } from "./pulse-v1.js";
import { scanNoGoResultSchema, scanResultDispositionSchema } from "./scan-no-go.js";

export const CANONICAL_SCAN_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isCanonicalScanId(value: unknown): value is string {
  return typeof value === "string" && CANONICAL_SCAN_ID_PATTERN.test(value);
}

export const CERTSCORE_API_V2_VERSION = "v2";
export const CERTSCORE_API_V2_SCHEMA_VERSION = "0.1.7";

export const apiV2Disclaimer =
  "CertScore outputs are automated public-web observations for human and agentic review. They are not legal advice, certification, or a compliance determination.";

export const apiV2ScanStatusSchema = z.enum(["queued", "running", "finalizing", "completed", "completed_limited", "failed", "expired", "rate_limited"]);
export const apiV2PostRefusalObservationSchema = z.object({
  status: z.enum([
    "confirmed_observation",
    "confirmed_clean",
    "unconfirmed",
    "not_attempted",
    "unsupported",
    "aborted",
  ]),
  refusalExercised: z.boolean(),
  observationCount: z.number().int().min(0),
  productionProjectable: z.boolean(),
  completedAt: z.string().nullable(),
  limitations: z.array(z.string()).max(24),
}).strict();
export const apiV2ScanFreshnessSchema = z.enum(["latest", "refresh"]);
export const apiV2ScanFromSchema = z.enum(["eu_de", "eu_ie", "california"]);
export const apiV2FindingCriticalitySchema = z.enum(["critical", "high", "medium", "low", "info", "unknown"]);
export const apiV2FindingConfidenceSchema = z.enum(["strong", "good", "moderate", "weak", "unknown"]);
export const apiV2EvidenceBasisSchema = z.enum(["runtime_observation", "policy_surface_detection", "accessibility_check", "public_report_projection"]);
export const apiV2PreConsentInventoryKindSchema = z.enum(["cookie", "tracker", "request", "storage", "unknown"]);
export const apiV2PreConsentInventoryPhaseSchema = z.literal("pre_consent");
export const apiV2PreConsentInventoryPrioritySchema = z.enum(["high", "medium", "review_needed", "contextual", "unknown"]);
export const apiV2PreConsentInventoryConfidenceSchema = z.enum(["high", "medium", "low", "unknown"]);

const apiV2ScanCreationMetadataShape = {
  executionMode: z.enum(["new_scan", "reused_scan"]).optional(),
  reused: z.boolean().optional(),
  reusedScanAgeSeconds: z.number().int().min(0).nullable().optional(),
  freshnessDecision: z.string().optional(),
  quotaConsumed: z.boolean().optional(),
  anonymousQuotaLimit: z.number().int().min(0).nullable().optional(),
  anonymousQuotaRemaining: z.number().int().min(0).nullable().optional(),
  anonymousQuotaResetAt: z.string().nullable().optional(),
  upgradeSupportEmail: z.string().email().nullable().optional(),
  upgradeMessage: z.string().nullable().optional(),
  recommendedNextTool: z.enum(["certscore_get_scan_status", "certscore_get_scan_bundle"]).optional()
} as const;

export const apiV2LinksSchema = z
  .object({
    self: z.string().optional(),
    status: z.string().optional(),
    findings: z.string().optional(),
    pulse: z.string().optional(),
    report: z.string().optional(),
    latestDomainScan: z.string().optional(),
    docs: z.string().optional()
  })
  .passthrough();

export const apiV2ErrorSchema = z
  .object({
    type: z.literal("certscore_api_error"),
    error: z
      .object({
        code: z.enum(["invalid_request", "invalid_url", "not_found", "rate_limited", "unauthorized", "forbidden", "scan_unavailable", "internal_error"]),
        message: z.string(),
        retryable: z.boolean(),
        retryAfterSeconds: z.number().int().nullable(),
        recommendedNextAction: z.string(),
        rateLimit: z
          .object({
            limitUnits: z.number().int().positive(),
            policyVersion: z.string(),
            profile: z.enum(["terminal", "status"]),
            requestedUnits: z.number().int().positive(),
            scope: z.enum(["callerTarget", "target", "caller"]),
            usedUnits: z.number().int().nonnegative(),
            windowId: z.enum(["burst", "daily"]),
            windowSeconds: z.number().int().positive()
          })
          .optional(),
        creationRateLimit: z
          .object({
            kind: z.enum(["new_scan", "concurrency"]),
            limit: z.number().int().positive(),
            remaining: z.number().int().nonnegative(),
            scope: z.enum(["session", "ip", "surface", "requester"]),
            used: z.number().int().nonnegative(),
            windowId: z.enum(["burst", "daily", "concurrent"]),
            windowSeconds: z.number().int().positive().nullable()
          })
          .optional()
      })
      .passthrough(),
    links: apiV2LinksSchema.optional(),
    disclaimer: z.string().optional(),
    ...apiV2ScanCreationMetadataShape
  })
  .passthrough();

export const apiV2CreateScanRequestSchema = z
  .object({
    url: z.string().min(1),
    freshness: apiV2ScanFreshnessSchema.default("latest").optional(),
    scanFrom: apiV2ScanFromSchema.default("eu_ie").optional(),
    callbackUrl: z.string().url().optional(),
    metadata: z.record(z.string()).optional()
  })
  .strict();

export const apiV2ScanJobSchema = z
  .object({
    type: z.literal("certscore_scan_job"),
    jobId: z.string(),
    scanId: z.string().nullable().optional(),
    domain: z.string().nullable().optional(),
    url: z.string().nullable().optional(),
    scanFrom: apiV2ScanFromSchema.optional(),
    status: apiV2ScanStatusSchema,
    resultDisposition: scanResultDispositionSchema.optional(),
    noGo: scanNoGoResultSchema.optional(),
    phase: z.string().optional(),
    createdAt: z.string().optional(),
    startedAt: z.string().nullable().optional(),
    completedAt: z.string().nullable().optional(),
    scanTimeSeconds: z.number().nullable().optional(),
    score: z.number().int().min(0).max(100).nullable().optional(),
    scoreStatus: z.enum(["provisional", "final"]).optional(),
    scoreVersion: z.string().nullable().optional(),
    scoreUpdatedAt: z.string().nullable().optional(),
    riskLevel: z.string().nullable().optional(),
    postRefusalObservation: apiV2PostRefusalObservationSchema.nullable().optional(),
    coverage: z
      .object({
        status: z.string().optional(),
        summary: z.string().optional(),
        limitations: z.array(z.string()).optional()
      })
      .passthrough()
      .nullable()
      .optional(),
    lastUpdatedAt: z.string().optional(),
    phaseStartedAt: z.string().nullable().optional(),
    lastHeartbeatAt: z.string().nullable().optional(),
    progressPercent: z.number().int().min(0).max(100).optional(),
    progressIsEstimate: z.boolean().optional(),
    estimatedRemainingSeconds: z.number().int().min(0).nullable().optional(),
    stalled: z.boolean().optional(),
    retryAfterSeconds: z.number().int().nullable().optional(),
    error: z
      .object({
        code: z.string(),
        message: z.string(),
        retryable: z.boolean(),
        retryAfterSeconds: z.number().int().nullable(),
        recommendedNextAction: z.string()
      })
      .strict()
      .optional(),
    reportUrl: z.string().nullable().optional(),
    recommendedNextAction: z.string().optional(),
    links: apiV2LinksSchema.optional(),
    disclaimer: z.string().optional(),
    ...apiV2ScanCreationMetadataShape
  })
  .passthrough();

export const apiV2ScanResourceSchema = z
  .object({
    type: z.literal("certscore_scan"),
    scanId: z.string(),
    domain: z.string(),
    url: z.string().nullable().optional(),
    status: apiV2ScanStatusSchema,
    resultDisposition: scanResultDispositionSchema.optional(),
    noGo: scanNoGoResultSchema.optional(),
    scanFrom: apiV2ScanFromSchema.optional(),
    createdAt: z.string().nullable().optional(),
    startedAt: z.string().nullable().optional(),
    completedAt: z.string().nullable().optional(),
    scanTimeSeconds: z.number().nullable().optional(),
    score: z.number().int().min(0).max(100).nullable().optional(),
    scoreStatus: z.enum(["provisional", "final"]).optional(),
    scoreVersion: z.string().nullable().optional(),
    scoreUpdatedAt: z.string().nullable().optional(),
    riskLevel: z.string().nullable().optional(),
    postRefusalObservation: apiV2PostRefusalObservationSchema.nullable().optional(),
    coverage: z
      .object({
        status: z.string().optional(),
        summary: z.string().optional(),
        limitations: z.array(z.string()).optional()
      })
      .passthrough()
      .optional(),
    links: apiV2LinksSchema.optional(),
    disclaimer: z.string().optional()
  })
  .passthrough();

export const apiV2EvidenceEventSummarySchema = z
  .object({
    type: z.enum(["request", "page", "accessibility_check", "policy_surface"]),
    vendor: z.string().nullable().optional(),
    urlHost: z.string().nullable().optional(),
    registrableDomain: z.string().nullable().optional(),
    observedAtMs: z.number().int().nullable().optional(),
    phase: z.string().nullable().optional(),
    documentUrl: z.string().max(2048).nullable().optional(),
    pageContextId: z.string().max(120).nullable().optional(),
    requestUrl: z.string().max(2048).nullable().optional(),
    rawObservedVendor: z.string().max(160).nullable().optional(),
    rawObservedVendorCategory: z.string().max(120).nullable().optional(),
    resolvedEndpointVendor: z.string().max(160).nullable().optional(),
    resolvedEndpointVendorCategory: z.string().max(120).nullable().optional(),
    vendorAttributionBasis: z.string().max(120).nullable().optional(),
    relatedOrInitiatingVendor: z.string().max(160).nullable().optional(),
    resourceType: z.string().max(80).nullable().optional(),
    scannedPageUrl: z.string().max(2048).nullable().optional(),
    frameUrl: z.string().max(2048).nullable().optional(),
    finalUrl: z.string().max(2048).nullable().optional(),
    initiatorHost: z.string().max(253).nullable().optional(),
    initiatorType: z.string().max(80).nullable().optional(),
    initiatorUrl: z.string().max(2048).nullable().optional(),
    redirectChain: z.array(z.string().max(2048)).max(10).optional(),
    projectionWarnings: z.array(z.string().max(120)).max(12).optional()
  })
  .strict();

export const apiV2EvidenceSummarySchema = z
  .object({
    basis: apiV2EvidenceBasisSchema,
    summary: z.string(),
    phase: z.string().nullable().optional(),
    exampleCount: z.number().int().min(0),
    examplesShown: z.number().int().min(0),
    examplesAvailable: z.number().int().min(0).optional(),
    authRequiredForExamples: z.boolean().optional(),
    examples: z.array(apiV2EvidenceEventSummarySchema).max(5).optional(),
    projectionWarnings: z.array(z.string().max(120)).max(20).optional(),
    excerpt: z
      .object({
        excerpt: z.string(),
        isTruncated: z.boolean(),
        truncationMarker: z.string().nullable(),
        sourceUrl: z.string().max(2048).nullable(),
        evidenceUrl: z.string().max(2048)
      })
      .strict()
      .optional(),
    hasTimingAnchor: z.boolean().optional(),
    hasVendorAnchor: z.boolean().optional(),
    hasConsentContext: z.boolean().optional(),
    hasPolicyAnchor: z.boolean().optional()
  })
  .strict();

export const apiV2FindingSummarySchema = z
  .object({
    type: z.literal("certscore_finding"),
    id: z.string(),
    scanId: z.string(),
    label: z.string(),
    criticality: apiV2FindingCriticalitySchema,
    confidence: apiV2FindingConfidenceSchema,
    plainEnglish: z.string(),
    resultDisposition: scanResultDispositionSchema.optional(),
    noGo: scanNoGoResultSchema.optional(),
    reviewLenses: z.array(z.string()).default([]),
    evidence: apiV2EvidenceSummarySchema,
    nextStep: z.string().nullable().optional(),
    links: apiV2LinksSchema.optional(),
    disclaimer: z.string().optional()
  })
  .passthrough();

export const apiV2FindingListSchema = z
  .object({
    type: z.literal("certscore_finding_list"),
    scanId: z.string(),
    findings: z.array(apiV2FindingSummarySchema),
    links: apiV2LinksSchema.optional(),
    disclaimer: z.string().optional()
  })
  .passthrough();

export const apiV2FindingDetailSchema = apiV2FindingSummarySchema.extend({
  detail: z
    .object({
      caveats: z.array(z.string()).optional(),
      recommendedReviewerQuestions: z.array(z.string()).optional()
    })
    .passthrough()
    .optional()
});

export const apiV2DomainLatestScanSchema = z
  .object({
    type: z.literal("certscore_domain_latest_scan"),
    domain: z.string(),
    scan: apiV2ScanResourceSchema.nullable(),
    links: apiV2LinksSchema.optional(),
    disclaimer: z.string().optional()
  })
  .passthrough();

export const apiV2ScanPulseSchema = z
  .object({
    type: z.literal("certscore_scan_pulse"),
    scanId: z.string(),
    resultDisposition: scanResultDispositionSchema.optional(),
    noGo: scanNoGoResultSchema.optional(),
    pulse: pulseResponseSchema,
    links: apiV2LinksSchema.optional(),
    disclaimer: z.string().optional()
  })
  .passthrough();

export const apiV2ScanDiagnosticPhaseSchema = z
  .object({
    name: z.string().max(120),
    lane: z.enum(["scanner", "browser", "policy", "persistence"]),
    startedAtMs: z.number().int().min(0).nullable(),
    completedAtMs: z.number().int().min(0).nullable(),
    durationMs: z.number().int().min(0),
    outcome: z.enum(["success", "degraded", "failed", "unknown"])
  })
  .strict();

export const apiV2ScanLaneRunSchema = z.object({
  laneId: z.enum(["consent_proof", "runtime_evidence", "policy_evidence"]),
  physicalInvocationId: z.string().max(160),
  region: z.string().max(80),
  phaseName: z.enum(["preConsentRuntimeScanner", "policySurfaceScanner"]),
  startedAt: z.string(),
  firstResponse: z.object({
    at: z.string(),
    offsetMs: z.number().int().min(0),
    httpStatus: z.number().int().min(100).max(599),
    effectiveUrl: z.string().max(500).nullable(),
  }).strict().nullable(),
  navigationCount: z.number().int().min(0),
  challengeDetection: z.object({
    detected: z.boolean(),
    type: z.string().max(120).nullable(),
  }).strict(),
  executionOutcome: z.enum(["success", "degraded", "failed"]),
  accessOutcome: z.enum([
    "representative_page",
    "bot_challenge",
    "access_denied",
    "blank_or_unusable",
    "navigation_failed",
    "unknown",
  ]),
  completedAt: z.string().nullable(),
  durationMs: z.number().int().min(0),
}).strict();

export const apiV2PolicyDiscoveryDiagnosticsSchema = z
  .object({
    candidatesDiscovered: z.number().int().min(0).nullable(),
    candidatesAfterDeduplication: z.number().int().min(0).nullable(),
    requestsStarted: z.number().int().min(0).nullable(),
    successfulDocuments: z.number().int().min(0).nullable(),
    timeouts: z.number().int().min(0).nullable(),
    phaseWallMs: z.number().int().min(0).nullable(),
    maxConcurrency: z.number().int().min(1).max(16).nullable(),
    shortCircuitReason: z.string().max(160).nullable()
  })
  .strict();

export const apiV2ScanDiagnosticsSchema = z
  .object({
    type: z.literal("certscore_scan_diagnostics"),
    schemaVersion: z.literal("scan-diagnostics.v1"),
    scanId: z.string(),
    generatedAt: z.string().nullable(),
    totalWallMs: z.number().int().min(0).nullable(),
    phases: z.array(apiV2ScanDiagnosticPhaseSchema).max(20),
    lanes: z.array(apiV2ScanLaneRunSchema).max(8).default([]),
    policyDiscovery: apiV2PolicyDiscoveryDiagnosticsSchema,
    links: apiV2LinksSchema.optional(),
    disclaimer: z.string().optional()
  })
  .strict();

export const apiV2PreConsentCookiesTrackersRowSchema = z
  .object({
    id: z.string(),
    kind: apiV2PreConsentInventoryKindSchema,
    name: z.string(),
    vendor: z.string().nullable().optional(),
    host: z.string().nullable().optional(),
    registrableDomain: z.string().nullable().optional(),
    category: z.string().nullable().optional(),
    purpose: z.string().nullable().optional(),
    priority: apiV2PreConsentInventoryPrioritySchema.optional(),
    confidence: apiV2PreConsentInventoryConfidenceSchema.optional(),
    party: z.enum(["first_party", "third_party", "mixed", "unknown"]).optional(),
    setByThirdPartyScript: z.boolean().optional(),
    set_by_third_party_script: z.boolean().optional(),
    cookieDetails: z.array(z.object({
      name: z.string(),
      domain: z.string().nullable(),
      category: z.string(),
      essentiality: z.enum(["essential", "non_essential", "unknown"]),
      essentialityConfidence: z.number().min(0).max(1).nullable(),
      essentialityReasonCodes: z.array(z.string().max(120)).max(20),
      essentialitySource: z.enum(["canonical_registry", "deterministic_classifier", "retained_explicit_classification", "unknown"]),
      description: z.string(),
      dataTypes: z.array(z.string()),
      expiresAt: z.string().nullable(),
      lifespanSeconds: z.number().int().min(0).nullable(),
      lifespanSource: z.string().nullable(),
      longLived: z.boolean(),
      setByThirdPartyScript: z.boolean(),
      set_by_third_party_script: z.boolean(),
      setterScriptUrl: z.string().nullable(),
      initiatorChain: z.array(z.string()),
    }).strict()).optional(),
    requestDetails: z.array(z.object({
      cookieNamesSent: z.array(z.string().max(256)).max(24),
      essentiality: z.enum(["non_essential", "unknown"]),
      hostname: z.string().max(253).nullable(),
      identifierParameterNames: z.array(z.string().max(256)).max(24),
      initiatorUrl: z.string().max(500).nullable(),
      method: z.string().max(24).nullable(),
      path: z.string().max(2_000).nullable(),
      responseCookieNamesSet: z.array(z.string().max(256)).max(24),
      responseObserved: z.boolean(),
      responseStorageAttempted: z.boolean(),
      vendor: z.string().max(160).nullable()
    }).strict()).max(50).optional(),
    canonicalEntity: z.string().nullable().optional(),
    purposes: z.array(z.string()).optional(),
    domains: z.array(z.string()).optional(),
    products: z.array(z.string()).optional(),
    dataFlows: z.array(z.object({
      endpoint: z.string(),
      idSync: z.boolean(),
      networkDestination: z.object({
        ip: z.string().nullable(),
        country: z.string().nullable(),
        countryCode: z.string().nullable(),
        asn: z.number().int().positive().nullable(),
        provider: z.string().nullable(),
        label: z.literal("server location (may be CDN edge)")
      }).strict(),
      controllingEntity: z.object({
        legalEntity: z.string().nullable(),
        headquartersCountry: z.string().nullable()
      }).strict(),
      transferMechanism: z.object({
        mechanism: z.enum(["adequacy_decision", "dpf_certified", "sccs_assumed_unverified", "unknown"]),
        basis: z.string(),
        verifiedAsOf: z.string()
      }).strict()
    }).strict()).optional(),
    requestCount: z.number().int().min(0).nullable().optional(),
    phase: apiV2PreConsentInventoryPhaseSchema,
    observedBeforeConsent: z.boolean(),
    evidenceBasis: z.literal("public_report_projection"),
    firstObservedAtMs: z.number().int().min(0).nullable().optional(),
    pageUrlHost: z.string().nullable().optional()
  })
  .strict();

export const apiV2PreConsentCookiesTrackersSummarySchema = z
  .object({
    rowCount: z.number().int().min(0),
    trackerCount: z.number().int().min(0),
    cookieCount: z.number().int().min(0),
    requestCount: z.number().int().min(0),
    vendorCount: z.number().int().min(0).default(0),
    domainCount: z.number().int().min(0).default(0)
  })
  .strict();

export const apiV2PreConsentCookiesTrackersSchema = z
  .object({
    type: z.literal("certscore_pre_consent_cookies_trackers"),
    scanId: z.string(),
    domain: z.string(),
    generatedAt: z.string().nullable().optional(),
    summary: apiV2PreConsentCookiesTrackersSummarySchema,
    rows: z.array(apiV2PreConsentCookiesTrackersRowSchema),
    links: apiV2LinksSchema.optional(),
    disclaimer: z.string().optional()
  })
  .passthrough();

export type ApiV2CreateScanRequest = z.infer<typeof apiV2CreateScanRequestSchema>;
export type ApiV2ScanJob = z.infer<typeof apiV2ScanJobSchema>;
export type ApiV2ScanResource = z.infer<typeof apiV2ScanResourceSchema>;
export type ApiV2FindingSummary = z.infer<typeof apiV2FindingSummarySchema>;
export type ApiV2FindingDetail = z.infer<typeof apiV2FindingDetailSchema>;
export type ApiV2FindingList = z.infer<typeof apiV2FindingListSchema>;
export type ApiV2DomainLatestScan = z.infer<typeof apiV2DomainLatestScanSchema>;
export type ApiV2ScanPulse = z.infer<typeof apiV2ScanPulseSchema>;
export type ApiV2ScanDiagnostics = z.infer<typeof apiV2ScanDiagnosticsSchema>;
export type ApiV2PreConsentCookiesTrackers = z.infer<typeof apiV2PreConsentCookiesTrackersSchema>;
export type ApiV2Error = z.infer<typeof apiV2ErrorSchema>;
