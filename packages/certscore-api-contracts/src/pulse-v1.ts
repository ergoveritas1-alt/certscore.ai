import { z } from "zod";

export const PULSE_API_VERSION = "v1";
export const PULSE_SCHEMA_VERSION = "0.5.3";
export const PULSE_SOURCE = "certscore.ai";

export const PULSE_PURPOSE_STATEMENT =
  "CertScore Pulse uses automated runtime analysis of public websites to detect review signals around pre-consent tracking, third-party requests, consent enforcement gaps, cookie activity, accessibility issues, and disclosure inconsistencies.";

export const PULSE_STANDARD_DISCLAIMER =
  "CertScore outputs are automated public-web observations for review. They are not legal advice, certification, or a compliance determination. Always review the underlying evidence and consult qualified experts where appropriate.";

export const PULSE_CAPABILITIES = {
  method: "automated_runtime_analysis",
  observes: [
    "pre_consent_tracking",
    "cmp_load_order",
    "third_party_requests",
    "consent_enforcement_gaps",
    "cookie_activity",
    "accessibility_signals",
    "disclosure_inconsistencies"
  ],
  doesNotProvide: ["legal_advice", "certification", "compliance_determination"]
} as const;

export const pulseFormatSchema = z.enum(["json", "markdown"]);
export const pulseDetailSchema = z.enum(["tiny", "quick", "standard", "full", "summary", "evidence"]);
export const normalizedPulseDetailSchema = z.enum(["tiny", "standard", "full", "summary", "evidence"]);
export const pulseFreshnessSchema = z.enum(["latest", "refresh"]);
export const pulseJobStatusSchema = z.enum([
  "queued",
  "running",
  "finalizing",
  "completed",
  "completed_limited",
  "failed",
  "expired",
  "rate_limited"
]);

export const pulseCapabilitiesSchema = z.object({
  method: z.literal(PULSE_CAPABILITIES.method),
  observes: z.array(z.enum(PULSE_CAPABILITIES.observes)),
  doesNotProvide: z.array(z.enum(PULSE_CAPABILITIES.doesNotProvide))
});

export const pulseAgentInterpretationSchema = z.object({
  responseClass: z.enum(["completed_pulse", "pending_pulse", "api_error", "rate_limited"]),
  safeSummaryUse: z.boolean(),
  requiresHumanReview: z.literal(true),
  doNotCallThis: z.array(z.enum(PULSE_CAPABILITIES.doesNotProvide))
});

export const pulseFeedbackSchema = z
  .object({
    prompt: z.string().optional(),
    email: z.string(),
    feedbackUrl: z.string().optional(),
    positiveUrl: z.string().optional(),
    negativeUrl: z.string().optional()
  })
  .passthrough();

export const pulseMetaSchema = z
  .object({
    apiVersion: z.string().optional(),
    schemaVersion: z.string().optional(),
    pulseVersion: z.string().optional(),
    projectionVersion: z.string().optional(),
    generatedAt: z.string().optional(),
    source: z.string().optional(),
    format: pulseFormatSchema.optional(),
    detail: normalizedPulseDetailSchema.optional()
  })
  .passthrough();

export const pulseSummarySchema = z
  .object({
    headline: z.string().optional(),
    score: z.number().int().nullable().optional(),
    riskLevel: z.string().optional(),
    benchmark: z.string().nullable().optional(),
    humanSummary: z.string().optional(),
    machineSummary: z.record(z.unknown()).optional(),
    coverageNote: z.string().optional()
  })
  .passthrough();

export const pulseCoverageInterruptionSchema = z
  .object({
    label: z.string(),
    reason: z.string(),
    reviewTitle: z.string().optional(),
    reviewReason: z.string().optional()
  })
  .passthrough();

export const pulseCoverageSchema = z
  .object({
    status: z.string().optional(),
    homepageObserved: z.boolean().optional(),
    interruptionCount: z.number().int().optional(),
    summary: z.string().optional(),
    limitations: z.array(z.string()).optional(),
    interruptions: z.array(pulseCoverageInterruptionSchema).optional()
  })
  .passthrough();

export const pulseLinksSchema = z
  .object({
    canonicalPulseUrl: z.string().optional(),
    jsonUrl: z.string().optional(),
    markdownUrl: z.string().optional(),
    summaryJsonUrl: z.string().optional(),
    evidenceJsonUrl: z.string().optional(),
    fullJsonUrl: z.string().optional(),
    scanJsonUrl: z.string().optional(),
    immutableJsonUrl: z.string().optional(),
    immutableMarkdownUrl: z.string().optional(),
    immutableFullJsonUrl: z.string().optional(),
    fullReportUrl: z.string().optional(),
    docsUrl: z.string().optional(),
    findingsReferenceUrl: z.string().optional()
  })
  .passthrough();

export const pulseEvidenceDigestSchema = z
  .object({
    basis: z.string().optional(),
    phase: z.string().nullable().optional(),
    exampleCount: z.number().int().optional(),
    examplesShown: z.number().int().optional(),
    examplesAvailable: z.number().int().optional(),
    authRequiredForExamples: z.boolean().optional(),
    hasTimingAnchor: z.boolean().optional(),
    hasVendorAnchor: z.boolean().optional(),
    hasConsentContext: z.boolean().optional(),
    hasPolicyAnchor: z.boolean().optional()
  })
  .passthrough();

export const pulseFindingSchema = z
  .object({
    id: z.string(),
    label: z.string().optional(),
    criticality: z.string().optional(),
    confidence: z.string().optional(),
    plainEnglish: z.string().optional(),
    evidenceDigest: pulseEvidenceDigestSchema.optional(),
    reviewLenses: z.array(z.string()).optional(),
    anchorUrl: z.string().optional(),
    nextStep: z.string().optional()
  })
  .passthrough();

export const pulseResponseSchema = z
  .object({
    type: z.enum(["certscore_pulse", "certscore_pulse_summary", "certscore_pulse_evidence"]),
    meta: pulseMetaSchema.optional(),
    request: z.record(z.unknown()).optional(),
    domain: z.string().optional(),
    scanId: z.string().optional(),
    scan_id: z.string().optional(),
    scanStatus: z.string().optional(),
    summary: pulseSummarySchema.optional(),
    topFindings: z.array(pulseFindingSchema).optional(),
    coverage: pulseCoverageSchema.optional(),
    links: pulseLinksSchema.optional(),
    feedback: pulseFeedbackSchema.optional(),
    capabilities: pulseCapabilitiesSchema.optional(),
    agentInterpretation: pulseAgentInterpretationSchema.optional(),
    disclaimer: z.string().optional()
  })
  .passthrough();

export const pulseStatusSchema = z
  .object({
    type: z.literal("certscore_pulse_status"),
    meta: pulseMetaSchema.optional(),
    jobId: z.string(),
    scanId: z.string().nullable().optional(),
    scan_id: z.string().nullable().optional(),
    domain: z.string().nullable().optional(),
    status: pulseJobStatusSchema,
    phase: z.string().optional(),
    message: z.string().optional(),
    resultUrl: z.string().nullable().optional(),
    reportUrl: z.string().nullable().optional(),
    retryAfterSeconds: z.number().int().nullable().optional(),
    capabilities: pulseCapabilitiesSchema.optional(),
    agentInterpretation: pulseAgentInterpretationSchema.optional(),
    disclaimer: z.string().optional()
  })
  .passthrough();

export const pulseErrorCodeSchema = z.enum([
  "invalid_url",
  "not_found",
  "pulse_throttled",
  "rate_limited",
  "internal_error",
  "scan_unavailable",
  "unauthorized",
  "forbidden"
]);

export const pulseErrorSchema = z
  .object({
    type: z.literal("certscore_pulse_error"),
    error: z
      .object({
        code: pulseErrorCodeSchema,
        message: z.string(),
        retryAfterSeconds: z.number().int().nullable().optional()
      })
      .passthrough(),
    feedback: pulseFeedbackSchema.optional(),
    resolution: z
      .object({
        label: z.string(),
        url: z.string()
      })
      .nullable()
      .optional(),
    agentInterpretation: pulseAgentInterpretationSchema.optional(),
    disclaimer: z.string().optional()
  })
  .passthrough();

export type PulseFormat = z.infer<typeof pulseFormatSchema>;
export type PulseDetail = z.infer<typeof pulseDetailSchema>;
export type NormalizedPulseDetail = z.infer<typeof normalizedPulseDetailSchema>;
export type PulseFreshness = z.infer<typeof pulseFreshnessSchema>;
export type PulseJobStatus = z.infer<typeof pulseJobStatusSchema>;
export type PulseResponse = z.infer<typeof pulseResponseSchema>;
export type PulseStatus = z.infer<typeof pulseStatusSchema>;
export type PulseError = z.infer<typeof pulseErrorSchema>;
