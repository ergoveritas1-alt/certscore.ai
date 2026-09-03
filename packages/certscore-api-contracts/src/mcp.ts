import { z } from "zod";
import {
  apiV2DomainLatestScanSchema,
  apiV2FindingDetailSchema,
  apiV2FindingListSchema,
  apiV2PreConsentCookiesTrackersSchema,
  apiV2PreConsentCookiesTrackersSummarySchema,
  apiV2PreConsentRuntimePreviewSchema,
  apiV2ScanFromSchema,
  apiV2ScanResourceSchema,
  apiV2ScanStatusSchema
} from "./api-v2.js";
import { pulseAgentInterpretationSchema, pulseResponseSchema, pulseStatusSchema, pulseTransportSecuritySchema } from "./pulse-v1.js";
import { scanNoGoResultSchema, scanResultDispositionSchema } from "./scan-no-go.js";

export const mcpPulseDetailSchema = z.enum(["tiny", "quick", "standard", "full", "summary", "evidence"]);
export const mcpGptSafePulseDetailSchema = z.enum(["tiny", "standard", "summary"]);
export const mcpPulseFormatSchema = z.enum(["json", "markdown"]);
export const mcpPulseFreshnessSchema = z.enum(["latest", "refresh"]);
// Keep MCP geo execution contexts aligned with the API v2 scanner fleet.
// EU-Ireland is exposed as `eu_ie` (the product UI labels it EU-IR).
export const mcpScanFromSchema = apiV2ScanFromSchema;

export const mcpCreateScanInputSchema = {
  url: z.string().min(1).describe("Public URL or domain to scan."),
  detail: mcpPulseDetailSchema.optional().describe("Pulse detail level. Defaults to summary."),
  format: mcpPulseFormatSchema.optional().describe("Response format for completed immediate responses. Defaults to json."),
  freshness: mcpPulseFreshnessSchema.optional().describe("Scan freshness policy. latest allows eligible recent completed-result reuse when available; refresh requests a new scan. Defaults to latest."),
  scanFrom: mcpScanFromSchema.optional().describe("Optional execution region for a newly queued scan: eu_de, eu_ie, california, or the service default when omitted.")
} as const;

export const mcpScanSiteInputSchema = {
  url: mcpCreateScanInputSchema.url,
  freshness: mcpCreateScanInputSchema.freshness,
  scanFrom: mcpCreateScanInputSchema.scanFrom,
  waitForCompletion: z.boolean().optional().describe("Deprecated compatibility field; accepted but ignored. certscore_scan_site never waits for a new scan to finish, though MCP Light may briefly wait within a bounded preview window for preliminary pre-consent observations."),
  maxWaitSeconds: z.number().int().min(1).max(45).optional().describe("Deprecated compatibility field; accepted but ignored. The bounded preliminary-preview wait is controlled by CertScore and never waits for scan completion.")
} as const;

export const mcpGetScanStatusInputSchema = {
  scanId: z.string().min(1).describe("Stable CertScore scan ID returned by certscore_scan_site.")
} as const;

export const mcpGetScanInputSchema = {
  scanId: z.string().min(1).describe("Stable CertScore scan ID.")
} as const;

export const mcpGetReportInputSchema = {
  scanId: z.string().min(1).describe("Stable CertScore scan ID."),
  detail: mcpPulseDetailSchema.optional().describe("Pulse detail level. Defaults to summary for agent-friendly JSON."),
  format: mcpPulseFormatSchema.optional().describe("Use json for structured agent work or markdown for conversational summaries.")
} as const;

export const mcpGetEvidenceInputSchema = {
  scanId: z.string().min(1).describe("Stable CertScore scan ID.")
} as const;

export const mcpGetScanBundleInputSchema = {
  scanId: z.string().min(1).describe("Stable CertScore scan ID."),
  detail: z.enum(["summary", "findings", "evidence", "full"]).optional().describe("Response detail. Defaults to summary; evidence and full opt into heavier retained context."),
  maxBytes: z.number().int().min(5000).max(200000).optional().describe("Requested serialized structured response budget in bytes. The full profile defaults to 50000. MCP Light defaults to and applies a transport-safe 25000-byte ceiling; larger Light requests are clamped and reported in response metadata."),
  maxFindings: z.number().int().min(1).max(50).optional().describe("Maximum compact findings to return. Defaults to 5 for summary and 20 otherwise."),
  maxPreConsentRows: z.number().int().min(1).max(50).optional().describe("Maximum compact pre-consent inventory rows to return. Defaults to 20.")
} as const;

export const mcpExportFindingsInputSchema = {
  scanId: z.string().min(1).describe("Stable CertScore scan ID.")
} as const;

export const mcpListFindingsInputSchema = {
  scanId: z.string().min(1).describe("Stable CertScore scan ID."),
  limit: z.number().int().min(1).max(200).optional().describe("Maximum findings to return. Defaults to 50; maximum 200."),
  offset: z.number().int().min(0).optional().describe("Zero-based finding offset. Defaults to 0.")
} as const;

export const mcpGetPreConsentCookiesTrackersInputSchema = {
  scanId: z.string().min(1).describe("Stable CertScore scan ID."),
  maxRows: z.number().int().min(1).max(200).optional().describe("Maximum inventory rows to return. Defaults to 200.")
} as const;

export const mcpExplainFindingInputSchema = {
  scanId: z.string().min(1).describe("Stable CertScore scan ID."),
  findingId: z.string().min(1).describe("Finding ID to explain.")
} as const;

export const mcpGetLatestDomainScanInputSchema = {
  domain: z.string().min(1).describe("Public domain to look up."),
  scanFrom: mcpScanFromSchema.optional().describe("Optional scan execution context for matching eligible scans.")
} as const;

export const mcpGetLatestDomainPreConsentCookiesTrackersInputSchema = {
  domain: z.string().min(1).describe("Public domain to look up."),
  scanFrom: mcpScanFromSchema.optional().describe("Optional scan execution context for matching eligible scans."),
  maxRows: z.number().int().min(1).max(200).optional().describe("Maximum inventory rows to return. Defaults to 200.")
} as const;

const scanCreationAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true
} as const;

const readOnlyInternalAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
} as const;

const accountedInternalReadAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false
} as const;

const readOnlyOpenWorldAnnotations = {
  readOnlyHint: true,
  openWorldHint: true
} as const;

export const mcpToolErrorPayloadSchema = z
  .object({
    error: z
      .object({
        name: z.string(),
        message: z.string(),
        status: z.number().int().optional(),
        code: z.string().optional(),
        retryAfterSeconds: z.number().int().optional(),
        responseBody: z.unknown().optional()
      })
      .passthrough()
  })
  .passthrough();

const mcpExecutiveSummarySchema = z.object({
  completionSummary: z.string().optional(),
  domain: z.string().optional(),
  score: z.number().int().min(0).max(100).nullable().optional(),
  scoreLabel: z.string().optional(),
  scoreMetadata: z.object({
    coverageConfidence: z.string().optional(),
    coverageRatio: z.number().nullable().optional(),
    kind: z.string().optional(),
    metricLabel: z.string().optional(),
    source: z.string().optional(),
    status: z.string().optional(),
    version: z.string().nullable().optional(),
    withholdingReason: z.string().nullable().optional()
  }).passthrough().optional(),
  riskLevel: z.string().optional(),
  actionLabel: z.string().optional(),
  issuesToReview: z.number().int().min(0).optional(),
  scanTimeSeconds: z.number().nullable().optional()
}).passthrough();

export const mcpScanProvenanceSchema = z.object({
  mode: z.enum(["new_scan_started", "existing_completed_scan_reused", "existing_scan_retrieved", "unknown"]),
  retrievalMode: z.enum(["creation_response", "scan_id_lookup", "unknown"]),
  creationDecision: z.enum(["new_scan", "reused_scan", "unknown"]),
  scanAgeSeconds: z.number().int().min(0).nullable(),
  executionMode: z.enum(["new_scan", "reused_scan"]).nullable(),
  reused: z.boolean().nullable(),
  freshnessDecision: z.string().nullable()
}).strict();

export const mcpInterpretationGuidanceSchema = z.object({
  scoreLabel: z.literal("CertScore score"),
  observableSignalsOnly: z.literal(true),
  doNotInferUnobservedTechnologies: z.literal(true),
  doNotInferLegalComplianceStatus: z.literal(true),
  statement: z.string()
}).strict();

export const mcpScanBundlePreConsentRowSchema = z.object({
  id: z.string().max(512),
  kind: apiV2PreConsentCookiesTrackersSchema.shape.rows.element.shape.kind,
  name: z.string().max(256),
  cookieNames: z.array(z.string().max(256)).max(24),
  vendor: z.string().max(160).nullable(),
  purpose: z.string().max(160).nullable(),
  category: z.string().max(160).nullable(),
  confidence: apiV2PreConsentCookiesTrackersSchema.shape.rows.element.shape.confidence.unwrap(),
  firstObservedAtMs: z.number().int().min(0).nullable(),
  domains: z.array(z.string().max(253)).max(12),
  requestCount: z.number().int().min(0).nullable(),
  evidenceClassification: z.object({
    basis: apiV2PreConsentCookiesTrackersSchema.shape.rows.element.shape.evidenceBasis,
    phase: apiV2PreConsentCookiesTrackersSchema.shape.rows.element.shape.phase,
    observedBeforeConsent: z.boolean(),
    party: apiV2PreConsentCookiesTrackersSchema.shape.rows.element.shape.party.unwrap(),
    priority: apiV2PreConsentCookiesTrackersSchema.shape.rows.element.shape.priority.unwrap()
  }).strict()
}).strict();

export const mcpScanBundlePreConsentSchema = z.object({
  summary: apiV2PreConsentCookiesTrackersSummarySchema,
  rows: z.array(mcpScanBundlePreConsentRowSchema).max(50),
  total: z.number().int().min(0),
  returned: z.number().int().min(0),
  truncated: z.boolean()
}).strict();

export const mcpScanBundleCoreFindingSchema = z.object({
  type: z.literal("certscore_finding"),
  id: z.string(),
  label: z.string(),
  criticality: apiV2FindingDetailSchema.shape.criticality,
  confidence: apiV2FindingDetailSchema.shape.confidence,
  plainEnglish: z.string(),
  nextStep: z.string().optional(),
  evidenceUrl: z.string().max(2048).nullable().optional()
}).strict();

export const mcpCreateScanOutputSchema = z
  .object({
    type: z.literal("certscore_mcp_scan_created"),
    status: z.string().nullable().optional(),
    jobId: z.string().nullable(),
    scanId: z.string().nullable(),
    completed: z.boolean(),
    statusUrl: z.string().nullable(),
    resultUrl: z.string().nullable(),
    reportUrl: z.string().nullable(),
    pulse: pulseResponseSchema.nullable(),
    resultDisposition: scanResultDispositionSchema.nullable().optional(),
    noGo: scanNoGoResultSchema.nullable().optional()
  })
  .passthrough();

export const mcpActionableErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  retryable: z.boolean(),
  retryAfterSeconds: z.number().int().nullable(),
  recommendedNextAction: z.string(),
  field: z.string().optional(),
  mcpCode: z.number().int().optional(),
  name: z.string().optional(),
  status: z.number().int().optional(),
  responseBody: z.unknown().optional()
}).strict();

const mcpRetrievedGuidanceShape = {
  scoreLabel: z.literal("CertScore score"),
  provenance: mcpScanProvenanceSchema,
  interpretationGuidance: mcpInterpretationGuidanceSchema,
  reportUrl: z.string().nullable().optional(),
  recommendedNextTool: z.enum(["certscore_get_scan_status", "certscore_get_scan_bundle"]).nullable(),
  recommendedNextAction: z.string(),
  error: mcpActionableErrorSchema.nullable(),
  observationOnlyDisclaimer: z.string()
} as const;

export const mcpScanSiteOutputSchema = z
  .object({
    type: z.enum(["certscore_scan", "certscore_scan_job", "certscore_tool_error"]),
    scanId: z.string().nullable().optional(),
    jobId: z.string().optional(),
    domain: z.string().nullable().optional(),
    status: z.union([apiV2ScanStatusSchema, z.literal("invalid_arguments")]),
    resultDisposition: scanResultDispositionSchema.optional(),
    noGo: scanNoGoResultSchema.optional(),
    scanFrom: apiV2ScanFromSchema.optional(),
    createdAt: z.string().nullable().optional(),
    startedAt: z.string().nullable().optional(),
    completedAt: z.string().nullable().optional(),
    scanTimeSeconds: z.number().nullable().optional(),
    score: z.number().int().min(0).max(100).nullable().optional(),
    scoreLabel: z.literal("CertScore score"),
    scoreStatus: z.enum(["provisional", "final"]).optional(),
    scoreVersion: z.string().nullable().optional(),
    scoreUpdatedAt: z.string().nullable().optional(),
    riskLevel: z.string().nullable().optional(),
    gpcResponse: apiV2ScanResourceSchema.shape.gpcResponse.nullable(),
    postAcceptObservation: apiV2ScanResourceSchema.shape.postAcceptObservation.nullable(),
    postRefusalObservation: apiV2ScanResourceSchema.shape.postRefusalObservation.nullable(),
    coverage: apiV2ScanResourceSchema.shape.coverage.nullable().optional(),
    preConsentPreview: apiV2PreConsentRuntimePreviewSchema.optional(),
    error: mcpActionableErrorSchema.nullable(),
    provenance: mcpScanProvenanceSchema,
    interpretationGuidance: mcpInterpretationGuidanceSchema,
    reportUrl: z.string().nullable().optional(),
    links: apiV2ScanResourceSchema.shape.links.optional(),
    recommendedNextTool: z.enum(["certscore_get_scan_status", "certscore_get_scan_bundle"]).nullable(),
    recommendedNextAction: z.string(),
    observationOnlyDisclaimer: z.string(),
    demoSubstitution: z.object({
      requestedUrl: z.string(),
      effectiveUrl: z.string().url(),
      reason: z.literal("iana_example_domain"),
      message: z.string()
    }).strict().optional()
  })
  .passthrough();

export const mcpScanStatusOutputSchema = z
  .object({
    type: z.enum(["certscore_scan_job", "certscore_pulse_status"]).optional(),
    jobId: z.string().optional(),
    scanId: z.string().nullable().optional(),
    scan_id: z.string().nullable().optional(),
    domain: z.string().nullable().optional(),
    url: z.string().nullable().optional(),
    scanFrom: apiV2ScanFromSchema.nullable().optional(),
    status: z.union([apiV2ScanStatusSchema, pulseStatusSchema.shape.status]).optional(),
    resultDisposition: scanResultDispositionSchema.optional(),
    noGo: scanNoGoResultSchema.optional(),
    startedAt: z.string().nullable().optional(),
    createdAt: z.string().nullable().optional(),
    completedAt: z.string().nullable().optional(),
    scanTimeSeconds: z.number().nullable().optional(),
    score: z.number().int().min(0).max(100).nullable().optional(),
    scoreLabel: z.literal("CertScore score"),
    scoreStatus: z.enum(["provisional", "final"]).optional(),
    scoreVersion: z.string().nullable().optional(),
    scoreUpdatedAt: z.string().nullable().optional(),
    riskLevel: z.string().nullable().optional(),
    gpcResponse: apiV2ScanResourceSchema.shape.gpcResponse.nullable(),
    postAcceptObservation: apiV2ScanResourceSchema.shape.postAcceptObservation.nullable(),
    postRefusalObservation: apiV2ScanResourceSchema.shape.postRefusalObservation.nullable(),
    coverage: apiV2ScanResourceSchema.shape.coverage.nullable().optional(),
    preConsentPreview: apiV2PreConsentRuntimePreviewSchema.optional(),
    phase: z.string().optional(),
    phaseStartedAt: z.string().nullable().optional(),
    lastUpdatedAt: z.string().optional(),
    lastHeartbeatAt: z.string().nullable().optional(),
    progressPercent: z.number().int().min(0).max(100).optional(),
    progressIsEstimate: z.boolean().optional(),
    estimatedRemainingSeconds: z.number().int().min(0).nullable().optional(),
    stalled: z.boolean().optional(),
    retryAfterSeconds: z.number().int().nullable().optional(),
    error: mcpActionableErrorSchema.nullable(),
    provenance: mcpScanProvenanceSchema,
    interpretationGuidance: mcpInterpretationGuidanceSchema,
    reportUrl: z.string().nullable().optional(),
    links: apiV2ScanResourceSchema.shape.links.optional(),
    recommendedNextTool: z.enum(["certscore_get_scan_status", "certscore_get_scan_bundle"]).nullable(),
    recommendedNextAction: z.string(),
    observationOnlyDisclaimer: z.string()
  })
  .passthrough();

export const mcpReportOutputSchema = z
  .object({
    type: z.enum(["certscore_pulse", "certscore_pulse_summary", "certscore_pulse_evidence", "certscore_pulse_markdown"]).optional(),
    scanId: z.string().optional(),
    scan_id: z.string().optional(),
    resultDisposition: scanResultDispositionSchema.optional(),
    noGo: scanNoGoResultSchema.optional(),
    value: z.string().optional(),
    ...mcpRetrievedGuidanceShape
  })
  .passthrough();

export const mcpEvidenceOutputSchema = z
  .object({
    type: z.string(),
    scanId: z.string().nullable().optional(),
    scan_id: z.string().nullable().optional(),
    mcpMetadata: z.object({
      maxSerializedChars: z.number().int().min(1),
      originalSerializedChars: z.number().int().min(0),
      strategy: z.enum(["compact_nested_values", "minimal_safe_summary", "metadata_only"]),
      truncated: z.literal(true)
    }).strict().optional(),
    ...mcpRetrievedGuidanceShape
  })
  .passthrough();

// Keep the exported declaration bounded. This schema composes the full API v2
// scan resource plus MCP-specific evidence shapes, and inferring every nested
// generic exceeds TypeScript's declaration-serialization limit.
export const mcpScanBundleOutputSchema: z.ZodType<Record<string, unknown>> = z
  .object({
    type: z.literal("certscore_scan_bundle"),
    detail: z.enum(["summary", "findings", "evidence", "full"]),
    scanId: z.string(),
    domain: z.string(),
    url: z.string().nullable(),
    scanFrom: apiV2ScanFromSchema.nullable(),
    status: apiV2ScanStatusSchema,
    score: z.number().int().min(0).max(100).nullable(),
    scoreLabel: z.literal("CertScore score"),
    scoreStatus: z.enum(["provisional", "final"]),
    scoreVersion: z.string().nullable(),
    scoreUpdatedAt: z.string().nullable(),
    riskLevel: z.string().nullable(),
    gpcResponse: apiV2ScanResourceSchema.shape.gpcResponse.nullable().optional(),
    postAcceptObservation: apiV2ScanResourceSchema.shape.postAcceptObservation.nullable(),
    postRefusalObservation: apiV2ScanResourceSchema.shape.postRefusalObservation.nullable(),
    provenance: mcpScanProvenanceSchema,
    interpretationGuidance: mcpInterpretationGuidanceSchema,
    resultDisposition: scanResultDispositionSchema.nullable().optional(),
    noGo: scanNoGoResultSchema.nullable().optional(),
    coverage: apiV2ScanResourceSchema.shape.coverage.nullable(),
    createdAt: z.string().nullable(),
    startedAt: z.string().nullable(),
    completedAt: z.string().nullable(),
    scanTimeSeconds: z.number().nullable(),
    timing: z.object({
      createdAt: z.string().nullable(),
      startedAt: z.string().nullable(),
      completedAt: z.string().nullable(),
      scanTimeSeconds: z.number().nullable()
    }).strict().optional(),
    summary: z.object({
      headline: z.string().nullable(),
      executiveSummary: mcpExecutiveSummarySchema.nullable(),
      counts: z.record(z.union([z.number(), z.boolean(), z.null()])).nullable(),
      agentInterpretation: pulseAgentInterpretationSchema.nullable()
    }).strict().optional(),
    findings: z.array(z.union([apiV2FindingDetailSchema, mcpScanBundleCoreFindingSchema])),
    findingsMetadata: z.object({
      shown: z.number().int().min(0),
      returned: z.number().int().min(0),
      total: z.number().int().min(0),
      truncated: z.boolean()
    }).strict(),
    evidenceUrlTemplate: z.literal("{contentUrls.findings}/{findingId}").optional(),
    evidenceSummary: z.record(z.unknown()).optional(),
    fullReport: pulseResponseSchema.optional(),
    preConsentCookiesTrackers: mcpScanBundlePreConsentSchema.optional(),
    transportSecurity: pulseTransportSecuritySchema,
    links: z.record(z.string()).optional(),
    reportUrl: z.string().nullable(),
    recommendedNextTool: z.enum(["certscore_get_scan_status", "certscore_get_scan_bundle"]).nullable(),
    recommendedNextAction: z.string(),
    error: mcpActionableErrorSchema.nullable(),
    mcpMetadata: z.object({
      detail: z.enum(["summary", "findings", "evidence", "full"]),
      heavyEvidenceIncluded: z.boolean(),
      findingsTruncated: z.boolean(),
      requestedMaxBytes: z.number().int().min(5000),
      effectiveMaxBytes: z.number().int().min(5000).max(200000),
      responseCeilingBytes: z.number().int().min(5000).max(200000),
      responseBudgetClamped: z.boolean(),
      actualBytes: z.number().int().min(0),
      fullPayloadBytes: z.number().int().min(0),
      truncated: z.boolean(),
      canonicalFindingsComplete: z.boolean(),
      truncationReason: z.string().nullable(),
      omittedSections: z.array(z.string()),
      deduplicatedSections: z.array(z.string()),
      nextRecommendedMaxBytes: z.number().int().min(5000).max(200000).nullable(),
      omittedContentAvailableViaUrl: z.boolean(),
      contentUrls: z.record(z.string())
    }).strict(),
    observationOnlyDisclaimer: z.string(),
    disclaimer: z.string().nullable()
  })
  .passthrough();

export const mcpFindingsExportOutputSchema = z
  .object({
    type: z.literal("certscore_mcp_findings_export"),
    scanId: z.string().nullable(),
    domain: z.string().nullable(),
    summary: z.unknown().nullable(),
    resultDisposition: scanResultDispositionSchema.nullable(),
    noGo: scanNoGoResultSchema.nullable(),
    findings: z.array(
      z
        .object({
          id: z.string(),
          label: z.string().nullable(),
          criticality: z.string().nullable(),
          confidence: z.string().nullable(),
          plainEnglish: z.string().nullable(),
          evidenceDigest: z.unknown().nullable(),
          evidenceSummary: z.string().nullable(),
          reviewLenses: z.array(z.string()),
          anchorUrl: z.string().nullable(),
          nextStep: z.string().nullable()
        })
        .passthrough()
    ),
    disclaimer: z.string().nullable(),
    ...mcpRetrievedGuidanceShape
  })
  .passthrough();

export const mcpFindingListPaginationSchema = z
  .object({
    limit: z.number().int().min(1).max(200),
    offset: z.number().int().min(0),
    returned: z.number().int().min(0),
    total: z.number().int().min(0),
    truncated: z.boolean()
  })
  .strict();

export const mcpFindingListOutputSchema = apiV2FindingListSchema.extend({
  pagination: mcpFindingListPaginationSchema.optional(),
  ...mcpRetrievedGuidanceShape
});

export const mcpPreConsentCookiesTrackersOutputSchema = apiV2PreConsentCookiesTrackersSchema.extend({
  summary: apiV2PreConsentCookiesTrackersSummarySchema.extend({
    totalRowCount: z.number().int().min(0).optional(),
    truncated: z.boolean().optional()
  }),
  evidenceMetadata: z.object({
    total: z.number().int().min(0),
    returned: z.number().int().min(0),
    truncated: z.boolean()
  }).strict(),
  ...mcpRetrievedGuidanceShape
});

export const certScoreMcpToolContracts = [
  {
    name: "certscore_scan_site",
    title: "Scan site",
    description: "Creates a public-website privacy scan or reuses an eligible recent completed scan. Coverage includes pre-consent storage, trackers, consent and CMP signals, privacy-policy disclosures, transport security, and GDPR/ePrivacy or CCPA/CPRA review signals. The response contains a stable scanId, lifecycle status, retry timing, and sometimes a bounded preliminary preConsentPreview; preliminary data contains no final findings or score. Results are automated public-web observations, not legal advice, certification, or a compliance determination. Tool and workflow documentation: https://certscore.ai/developers/mcp.",
    inputSchema: mcpScanSiteInputSchema,
    outputSchema: mcpScanSiteOutputSchema,
    annotations: { title: "Scan site", ...scanCreationAnnotations }
  },
  {
    name: "certscore_get_scan",
    title: "Get CertScore scan",
    description: "Retrieve the API v2 public-safe scan resource, including completed-limited no-go disposition, reason-specific guidance, and timing when available.",
    inputSchema: mcpGetScanInputSchema,
    outputSchema: apiV2ScanResourceSchema,
    annotations: { title: "Get CertScore scan", ...readOnlyOpenWorldAnnotations }
  },
  {
    name: "certscore_get_scan_status",
    title: "Get scan status",
    description: "Returns lifecycle status for a stable CertScore scanId. Active responses include phase, heartbeat, estimated progress, retryAfterSeconds, and sometimes a bounded preliminary preConsentPreview. Terminal responses include completion status, CertScore score and risk metadata when available, coverage, persisted execution region and timestamps, report URL, and a next-action field. Preliminary observations are distinct from completed findings.",
    inputSchema: mcpGetScanStatusInputSchema,
    outputSchema: mcpScanStatusOutputSchema,
    annotations: { title: "Get scan status", ...readOnlyInternalAnnotations }
  },
  {
    name: "certscore_get_report",
    title: "Get CertScore Pulse report",
    description: "Focused follow-up: retrieve a bounded Pulse report with high-signal TextContent and typed structuredContent, including customer-safe no-go messaging. For broad privacy questions, use certscore_get_scan_bundle first because it combines canonical findings, limitations, and pre-consent rows without redundant calls.",
    inputSchema: mcpGetReportInputSchema,
    outputSchema: mcpReportOutputSchema,
    annotations: { title: "Get CertScore Pulse report", ...readOnlyOpenWorldAnnotations }
  },
  {
    name: "certscore_get_evidence",
    title: "Get CertScore Pulse evidence",
    description: "Focused follow-up: retrieve a bounded public-safe evidence packet with a concise TextContent digest and typed structuredContent. For broad privacy questions, use certscore_get_scan_bundle first. Excludes raw cookie values, raw bodies, sensitive payloads, full DOM, and unredacted query values.",
    inputSchema: mcpGetEvidenceInputSchema,
    outputSchema: mcpEvidenceOutputSchema,
    annotations: { title: "Get CertScore Pulse evidence", ...readOnlyOpenWorldAnnotations }
  },
  {
    name: "certscore_get_scan_bundle",
    title: "Get scan bundle",
    description: "Returns the completed or completed-limited CertScore evidence bundle for a stable scanId as concise TextContent and matching structuredContent. Available sections include the canonical report overview, bounded projected findings, pre-consent cookie and tracker evidence, coverage limitations, persisted execution provenance, and retrieval URLs. Detail tiers and byte budgets control the bounded response, with explicit returned, total, truncated, and omitted-section metadata. Accept and Reject Path content is present only for confirmed, evidence-qualified post-action observations; unsupported or inconclusive outcomes remain neutral coverage limitations. Results are automated public-web observations, not legal advice, certification, or a compliance determination.",
    inputSchema: mcpGetScanBundleInputSchema,
    outputSchema: mcpScanBundleOutputSchema,
    annotations: { title: "Get scan bundle", ...accountedInternalReadAnnotations }
  },
  {
    name: "certscore_export_findings",
    title: "Export CertScore findings",
    description: "Return structured findings plus completed-limited no-go disposition and guidance for downstream review or ticketing workflows.",
    inputSchema: mcpExportFindingsInputSchema,
    outputSchema: mcpFindingsExportOutputSchema,
    annotations: { title: "Export CertScore findings", ...readOnlyOpenWorldAnnotations }
  },
  {
    name: "certscore_list_findings",
    title: "List CertScore findings",
    description: "Focused follow-up: list bounded API v2 public-safe findings already projected by the canonical pipeline, with matching high-signal TextContent and typed structuredContent. For broad privacy questions, use certscore_get_scan_bundle first.",
    inputSchema: mcpListFindingsInputSchema,
    outputSchema: mcpFindingListOutputSchema,
    annotations: { title: "List CertScore findings", ...readOnlyOpenWorldAnnotations }
  },
  {
    name: "certscore_get_pre_consent_cookies_trackers",
    title: "Get pre-consent cookies and trackers",
    description: "Focused follow-up: retrieve bounded row-level public-safe pre-consent cookie/tracker evidence with matching TextContent and typed structuredContent. For a new broad request such as checking a site for pre-consent tracking, use certscore_scan_site then certscore_get_scan_bundle first.",
    inputSchema: mcpGetPreConsentCookiesTrackersInputSchema,
    outputSchema: mcpPreConsentCookiesTrackersOutputSchema,
    annotations: { title: "Get pre-consent cookies and trackers", ...readOnlyOpenWorldAnnotations }
  },
  {
    name: "certscore_explain_finding",
    title: "Explain CertScore finding",
    description: "Explain one projected finding with public evidence, caveats, reviewer next steps, and reason-specific no-go context when applicable.",
    inputSchema: mcpExplainFindingInputSchema,
    outputSchema: apiV2FindingDetailSchema,
    annotations: { title: "Explain CertScore finding", ...readOnlyOpenWorldAnnotations }
  },
  {
    name: "certscore_get_latest_domain_scan",
    title: "Get latest domain scan",
    description: "Retrieve the latest eligible API v2 public-safe scan for a domain.",
    inputSchema: mcpGetLatestDomainScanInputSchema,
    outputSchema: apiV2DomainLatestScanSchema,
    annotations: { title: "Get latest domain scan", ...readOnlyOpenWorldAnnotations }
  },
  {
    name: "certscore_get_latest_domain_pre_consent_cookies_trackers",
    title: "Get latest domain pre-consent cookies and trackers",
    description: "Focused follow-up: retrieve bounded row-level public-safe pre-consent cookie/tracker evidence from the latest eligible scan for a domain, with matching TextContent and typed structuredContent. For a broad current-site review, use certscore_scan_site then certscore_get_scan_bundle first.",
    inputSchema: mcpGetLatestDomainPreConsentCookiesTrackersInputSchema,
    outputSchema: mcpPreConsentCookiesTrackersOutputSchema,
    annotations: { title: "Get latest domain pre-consent cookies and trackers", ...readOnlyOpenWorldAnnotations }
  }
] as const;
