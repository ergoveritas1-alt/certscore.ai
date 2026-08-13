import { z } from "zod";
import {
  apiV2DomainLatestScanSchema,
  apiV2FindingDetailSchema,
  apiV2FindingListSchema,
  apiV2PreConsentCookiesTrackersSchema,
  apiV2PreConsentCookiesTrackersSummarySchema,
  apiV2ScanFromSchema,
  apiV2ScanResourceSchema,
  apiV2ScanStatusSchema
} from "./api-v2.js";
import { pulseAgentInterpretationSchema, pulseResponseSchema, pulseStatusSchema } from "./pulse-v1.js";
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
  freshness: mcpPulseFreshnessSchema.optional().describe("Use latest to reuse recent scans or refresh to request a new scan when eligible."),
  scanFrom: mcpScanFromSchema.optional().describe("Optional scan execution context for newly queued scans.")
} as const;

export const mcpScanSiteInputSchema = {
  url: mcpCreateScanInputSchema.url,
  freshness: mcpCreateScanInputSchema.freshness,
  scanFrom: mcpCreateScanInputSchema.scanFrom,
  waitForCompletion: z.boolean().optional().describe("Wait for a completed scan resource in this tool call. Defaults to true. Set false only for an explicitly asynchronous workflow."),
  maxWaitSeconds: z.number().int().min(1).max(45).optional().describe("Maximum time to wait before returning the still-running job. Defaults to 45 seconds; never turns an active scan into an error.")
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
  maxBytes: z.number().int().min(5000).max(200000).optional().describe("Maximum serialized structured response size in bytes. Defaults to 50000."),
  maxFindings: z.number().int().min(1).max(50).optional().describe("Maximum compact findings to return. Defaults to 5 for summary and 20 otherwise."),
  maxPreConsentRows: z.number().int().min(1).max(50).optional().describe("Maximum pre-consent inventory rows when evidence is requested. Defaults to 20.")
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
    scoreStatus: z.enum(["provisional", "final"]).optional(),
    scoreVersion: z.string().nullable().optional(),
    scoreUpdatedAt: z.string().nullable().optional(),
    riskLevel: z.string().nullable().optional(),
    coverage: apiV2ScanResourceSchema.shape.coverage.nullable().optional(),
    error: mcpActionableErrorSchema.nullable(),
    recommendedNextTool: z.enum(["certscore_get_scan_status", "certscore_get_scan_bundle"]).nullable(),
    recommendedNextAction: z.string(),
    observationOnlyDisclaimer: z.string()
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
    status: z.union([apiV2ScanStatusSchema, pulseStatusSchema.shape.status]).optional(),
    resultDisposition: scanResultDispositionSchema.optional(),
    noGo: scanNoGoResultSchema.optional(),
    startedAt: z.string().nullable().optional(),
    createdAt: z.string().nullable().optional(),
    completedAt: z.string().nullable().optional(),
    scanTimeSeconds: z.number().nullable().optional(),
    score: z.number().int().min(0).max(100).nullable().optional(),
    scoreStatus: z.enum(["provisional", "final"]).optional(),
    scoreVersion: z.string().nullable().optional(),
    scoreUpdatedAt: z.string().nullable().optional(),
    riskLevel: z.string().nullable().optional(),
    coverage: apiV2ScanResourceSchema.shape.coverage.nullable().optional(),
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
    reportUrl: z.string().nullable().optional(),
    links: apiV2ScanResourceSchema.shape.links.optional(),
    recommendedNextTool: z.enum(["certscore_get_scan_status", "certscore_get_scan_bundle"]).nullable(),
    recommendedNextAction: z.string(),
    observationOnlyDisclaimer: z.string()
  })
  .passthrough();

export const mcpReportOutputSchema = z
  .object({
    type: z.enum(["certscore_pulse", "certscore_pulse_summary", "certscore_pulse_evidence"]).optional(),
    scanId: z.string().optional(),
    scan_id: z.string().optional(),
    resultDisposition: scanResultDispositionSchema.optional(),
    noGo: scanNoGoResultSchema.optional(),
    value: z.string().optional()
  })
  .passthrough();

export const mcpScanBundleOutputSchema = z
  .object({
    type: z.literal("certscore_scan_bundle"),
    detail: z.enum(["summary", "findings", "evidence", "full"]),
    scanId: z.string(),
    domain: z.string(),
    url: z.string().nullable(),
    status: apiV2ScanStatusSchema,
    score: z.number().int().min(0).max(100).nullable(),
    scoreStatus: z.enum(["provisional", "final"]),
    scoreVersion: z.string().nullable(),
    scoreUpdatedAt: z.string().nullable(),
    riskLevel: z.string().nullable(),
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
    }).strict(),
    summary: z.object({
      headline: z.string().nullable(),
      executiveSummary: mcpExecutiveSummarySchema.nullable(),
      counts: z.record(z.union([z.number(), z.boolean(), z.null()])).nullable(),
      agentInterpretation: pulseAgentInterpretationSchema.nullable()
    }).strict(),
    findings: z.array(apiV2FindingDetailSchema),
    findingsMetadata: z.object({
      shown: z.number().int().min(0),
      total: z.number().int().min(0),
      truncated: z.boolean()
    }).strict(),
    evidenceSummary: z.record(z.unknown()).optional(),
    fullReport: pulseResponseSchema.optional(),
    preConsentCookiesTrackers: z.record(z.unknown()).optional(),
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
      actualBytes: z.number().int().min(0),
      truncated: z.boolean(),
      truncationReason: z.string().nullable(),
      omittedSections: z.array(z.string()),
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
    disclaimer: z.string().nullable()
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
  pagination: mcpFindingListPaginationSchema.optional()
});

export const mcpPreConsentCookiesTrackersOutputSchema = apiV2PreConsentCookiesTrackersSchema.extend({
  summary: apiV2PreConsentCookiesTrackersSummarySchema.extend({
    totalRowCount: z.number().int().min(0).optional(),
    truncated: z.boolean().optional()
  })
});

export const certScoreMcpToolContracts = [
  {
    name: "certscore_scan_site",
    title: "Scan site",
    description: "First call. Starts or reuses a public-web scan and waits up to 45 seconds by default. If status is queued, running, or finalizing, retain scanId and poll certscore_get_scan_status using only that scanId. Stop polling at completed, completed_limited, failed, expired, or rate_limited. For usable completion, call certscore_get_scan_bundle. No-go and limited coverage are observations, never proof of compliance.",
    inputSchema: mcpScanSiteInputSchema,
    outputSchema: mcpScanSiteOutputSchema,
    annotations: scanCreationAnnotations
  },
  {
    name: "certscore_get_scan",
    title: "Get CertScore scan",
    description: "Retrieve the API v2 public-safe scan resource, including completed-limited no-go disposition, reason-specific guidance, and timing when available.",
    inputSchema: mcpGetScanInputSchema,
    outputSchema: apiV2ScanResourceSchema,
    annotations: readOnlyOpenWorldAnnotations
  },
  {
    name: "certscore_get_scan_status",
    title: "Get scan status",
    description: "Poll with only the stable scanId returned by certscore_scan_site. Active responses include phase, heartbeat, estimated progress, stalled state, and retry delay. Terminal responses include the canonical score, risk, coverage, timestamps, report URL, and an explicit next action. Stop polling at any terminal status.",
    inputSchema: mcpGetScanStatusInputSchema,
    outputSchema: mcpScanStatusOutputSchema,
    annotations: readOnlyOpenWorldAnnotations
  },
  {
    name: "certscore_get_report",
    title: "Get CertScore Pulse report",
    description: "Retrieve a summary Pulse report, including customer-safe no-go messaging when coverage is completed-limited. Use certscore_get_evidence for the larger bounded packet.",
    inputSchema: mcpGetReportInputSchema,
    outputSchema: mcpReportOutputSchema,
    annotations: readOnlyOpenWorldAnnotations
  },
  {
    name: "certscore_get_evidence",
    title: "Get CertScore Pulse evidence",
    description: "Retrieve the bounded structured Evidence JSON packet for a stable scan ID. Excludes raw cookie values, raw bodies, sensitive payloads, full DOM, and unredacted query values.",
    inputSchema: mcpGetEvidenceInputSchema,
    outputSchema: pulseResponseSchema,
    annotations: readOnlyOpenWorldAnnotations
  },
  {
    name: "certscore_get_scan_bundle",
    title: "Get scan bundle",
    description: "Call after completed or completed_limited status. summary returns the canonical overview without finding bodies; findings reserves space for compact findings; evidence reserves findings plus bounded evidence digests and references; full adds all available bounded sections. Every response declares detail and byte-budget metadata, omittedSections, retrieval URLs, and nextRecommendedMaxBytes when truncated. Never interpret no-go, not-observed, or limited coverage as proof of compliance.",
    inputSchema: mcpGetScanBundleInputSchema,
    outputSchema: mcpScanBundleOutputSchema,
    annotations: readOnlyOpenWorldAnnotations
  },
  {
    name: "certscore_export_findings",
    title: "Export CertScore findings",
    description: "Return structured findings plus completed-limited no-go disposition and guidance for downstream review or ticketing workflows.",
    inputSchema: mcpExportFindingsInputSchema,
    outputSchema: mcpFindingsExportOutputSchema,
    annotations: readOnlyOpenWorldAnnotations
  },
  {
    name: "certscore_list_findings",
    title: "List CertScore findings",
    description: "List API v2 public-safe findings already projected for a scan.",
    inputSchema: mcpListFindingsInputSchema,
    outputSchema: mcpFindingListOutputSchema,
    annotations: readOnlyOpenWorldAnnotations
  },
  {
    name: "certscore_get_pre_consent_cookies_trackers",
    title: "Get pre-consent cookies and trackers",
    description: "Retrieve the public-safe Cookies & Trackers (Pre-consent) report table as compact JSON for a scan.",
    inputSchema: mcpGetPreConsentCookiesTrackersInputSchema,
    outputSchema: mcpPreConsentCookiesTrackersOutputSchema,
    annotations: readOnlyOpenWorldAnnotations
  },
  {
    name: "certscore_explain_finding",
    title: "Explain CertScore finding",
    description: "Explain one projected finding with public evidence, caveats, reviewer next steps, and reason-specific no-go context when applicable.",
    inputSchema: mcpExplainFindingInputSchema,
    outputSchema: apiV2FindingDetailSchema,
    annotations: readOnlyOpenWorldAnnotations
  },
  {
    name: "certscore_get_latest_domain_scan",
    title: "Get latest domain scan",
    description: "Retrieve the latest eligible API v2 public-safe scan for a domain.",
    inputSchema: mcpGetLatestDomainScanInputSchema,
    outputSchema: apiV2DomainLatestScanSchema,
    annotations: readOnlyOpenWorldAnnotations
  },
  {
    name: "certscore_get_latest_domain_pre_consent_cookies_trackers",
    title: "Get latest domain pre-consent cookies and trackers",
    description: "Retrieve the public-safe Cookies & Trackers (Pre-consent) table from the latest eligible scan for a domain.",
    inputSchema: mcpGetLatestDomainPreConsentCookiesTrackersInputSchema,
    outputSchema: mcpPreConsentCookiesTrackersOutputSchema,
    annotations: readOnlyOpenWorldAnnotations
  }
] as const;
