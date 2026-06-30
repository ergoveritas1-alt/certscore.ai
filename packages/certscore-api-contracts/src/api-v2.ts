import { z } from "zod";
import { pulseResponseSchema } from "./pulse-v1.js";

export const CERTSCORE_API_V2_VERSION = "v2";
export const CERTSCORE_API_V2_SCHEMA_VERSION = "0.1.0";

export const apiV2Disclaimer =
  "CertScore provides automated public-web observations for review. Results may be incomplete or contain errors. CertScore does not provide legal advice, certification, or compliance determinations.";

export const apiV2ScanStatusSchema = z.enum(["queued", "running", "finalizing", "completed", "completed_limited", "failed", "expired", "rate_limited"]);
export const apiV2ScanFreshnessSchema = z.enum(["latest", "refresh"]);
export const apiV2ScanFromSchema = z.enum(["eu_ie", "california"]);
export const apiV2FindingCriticalitySchema = z.enum(["critical", "high", "medium", "low", "info", "unknown"]);
export const apiV2FindingConfidenceSchema = z.enum(["strong", "moderate", "weak", "unknown"]);
export const apiV2EvidenceBasisSchema = z.enum(["runtime_observation", "policy_surface_detection", "accessibility_check", "public_report_projection"]);

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
        retryAfterSeconds: z.number().int().nullable().optional()
      })
      .passthrough(),
    links: apiV2LinksSchema.optional(),
    disclaimer: z.string().optional()
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
    status: apiV2ScanStatusSchema,
    phase: z.string().optional(),
    createdAt: z.string().optional(),
    lastUpdatedAt: z.string().optional(),
    retryAfterSeconds: z.number().int().nullable().optional(),
    links: apiV2LinksSchema.optional(),
    disclaimer: z.string().optional()
  })
  .passthrough();

export const apiV2ScanResourceSchema = z
  .object({
    type: z.literal("certscore_scan"),
    scanId: z.string(),
    domain: z.string(),
    url: z.string().nullable().optional(),
    status: apiV2ScanStatusSchema,
    scanFrom: apiV2ScanFromSchema.optional(),
    createdAt: z.string().nullable().optional(),
    startedAt: z.string().nullable().optional(),
    completedAt: z.string().nullable().optional(),
    score: z.number().int().min(0).max(100).nullable().optional(),
    riskLevel: z.string().nullable().optional(),
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
    phase: z.string().nullable().optional()
  })
  .strict();

export const apiV2EvidenceSummarySchema = z
  .object({
    basis: apiV2EvidenceBasisSchema,
    summary: z.string(),
    phase: z.string().nullable().optional(),
    exampleCount: z.number().int().min(0),
    examplesShown: z.number().int().min(0),
    examples: z.array(apiV2EvidenceEventSummarySchema).max(5).optional(),
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
    pulse: pulseResponseSchema,
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
export type ApiV2Error = z.infer<typeof apiV2ErrorSchema>;
