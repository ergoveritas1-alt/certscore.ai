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
import { pulseResponseSchema, pulseStatusSchema } from "./pulse-v1.js";

export const mcpPulseDetailSchema = z.enum(["tiny", "quick", "standard", "full", "summary", "evidence"]);
export const mcpGptSafePulseDetailSchema = z.enum(["tiny", "standard", "summary"]);
export const mcpPulseFormatSchema = z.enum(["json", "markdown"]);
export const mcpPulseFreshnessSchema = z.enum(["latest", "refresh"]);
export const mcpScanFromSchema = z.enum(["eu_ie"]);

export const mcpCreateScanInputSchema = {
  url: z.string().min(1).describe("Public URL or domain to scan."),
  detail: mcpPulseDetailSchema.optional().describe("Pulse detail level. Defaults to summary."),
  format: mcpPulseFormatSchema.optional().describe("Response format for completed immediate responses. Defaults to json."),
  freshness: mcpPulseFreshnessSchema.optional().describe("Use latest to reuse recent scans or refresh to request a new scan when eligible."),
  scanFrom: mcpScanFromSchema.optional().describe("Optional scan execution context for newly queued scans.")
} as const;

export const mcpGetScanStatusInputSchema = {
  jobId: z.string().min(1).optional().describe("Pulse job ID for a just-created scan that has not yet returned a scanId."),
  scanId: z.string().min(1).optional().describe("Preferred stable CertScore scan ID for API v2 scan status.")
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
    pulse: pulseResponseSchema.nullable()
  })
  .passthrough();

export const mcpScanSiteOutputSchema = z
  .object({
    type: z.enum(["certscore_scan", "certscore_scan_job"]),
    scanId: z.string().nullable().optional(),
    jobId: z.string().optional(),
    domain: z.string().nullable().optional(),
    status: apiV2ScanStatusSchema,
    scanFrom: apiV2ScanFromSchema.optional()
  })
  .passthrough();

export const mcpScanStatusOutputSchema = z
  .object({
    type: z.enum(["certscore_scan_job", "certscore_pulse_status"]).optional(),
    jobId: z.string().optional(),
    scanId: z.string().nullable().optional(),
    scan_id: z.string().nullable().optional(),
    domain: z.string().nullable().optional(),
    status: z.union([apiV2ScanStatusSchema, pulseStatusSchema.shape.status]).optional(),
    error: mcpToolErrorPayloadSchema.shape.error.optional()
  })
  .passthrough();

export const mcpReportOutputSchema = z
  .object({
    type: z.enum(["certscore_pulse", "certscore_pulse_summary", "certscore_pulse_evidence"]).optional(),
    scanId: z.string().optional(),
    scan_id: z.string().optional(),
    value: z.string().optional()
  })
  .passthrough();

export const mcpFindingsExportOutputSchema = z
  .object({
    type: z.literal("certscore_mcp_findings_export"),
    scanId: z.string().nullable(),
    domain: z.string().nullable(),
    summary: z.unknown().nullable(),
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
    name: "create_scan",
    title: "Create CertScore Pulse scan",
    description: "Deprecated alias of scan_site. Start a CertScore Pulse scan for a public URL and return immediately with status, scan, and polling links.",
    inputSchema: mcpCreateScanInputSchema,
    outputSchema: mcpCreateScanOutputSchema,
    annotations: scanCreationAnnotations
  },
  {
    name: "scan_site",
    title: "Scan site",
    description: "Start or reuse a CertScore public-web scan for a public URL.",
    inputSchema: mcpCreateScanInputSchema,
    outputSchema: mcpScanSiteOutputSchema,
    annotations: scanCreationAnnotations
  },
  {
    name: "get_scan",
    title: "Get CertScore scan",
    description: "Retrieve the API v2 public-safe scan resource for a stable scan ID.",
    inputSchema: mcpGetScanInputSchema,
    outputSchema: apiV2ScanResourceSchema,
    annotations: readOnlyOpenWorldAnnotations
  },
  {
    name: "get_scan_status",
    title: "Get CertScore Pulse scan status",
    description: "Pass scanId (preferred, API v2). Pass jobId only for a just-created scan that has not yet returned a scanId.",
    inputSchema: mcpGetScanStatusInputSchema,
    outputSchema: mcpScanStatusOutputSchema,
    annotations: readOnlyOpenWorldAnnotations
  },
  {
    name: "get_report",
    title: "Get CertScore Pulse report",
    description: "Retrieve a summary CertScore Pulse report by stable scan ID. Use get_evidence for the larger bounded evidence packet.",
    inputSchema: mcpGetReportInputSchema,
    outputSchema: mcpReportOutputSchema,
    annotations: readOnlyOpenWorldAnnotations
  },
  {
    name: "get_evidence",
    title: "Get CertScore Pulse evidence",
    description: "Retrieve the bounded structured Evidence JSON packet for a stable scan ID. Excludes raw cookie values, raw bodies, sensitive payloads, full DOM, and unredacted query values.",
    inputSchema: mcpGetEvidenceInputSchema,
    outputSchema: pulseResponseSchema,
    annotations: readOnlyOpenWorldAnnotations
  },
  {
    name: "export_findings",
    title: "Export CertScore findings",
    description: "Return structured findings from a CertScore Pulse report for downstream review or ticketing workflows.",
    inputSchema: mcpExportFindingsInputSchema,
    outputSchema: mcpFindingsExportOutputSchema,
    annotations: readOnlyOpenWorldAnnotations
  },
  {
    name: "list_findings",
    title: "List CertScore findings",
    description: "List API v2 public-safe findings already projected for a scan.",
    inputSchema: mcpListFindingsInputSchema,
    outputSchema: mcpFindingListOutputSchema,
    annotations: readOnlyOpenWorldAnnotations
  },
  {
    name: "get_pre_consent_cookies_trackers",
    title: "Get pre-consent cookies and trackers",
    description: "Retrieve the public-safe Cookies & Trackers (Pre-consent) report table as compact JSON for a scan.",
    inputSchema: mcpGetPreConsentCookiesTrackersInputSchema,
    outputSchema: mcpPreConsentCookiesTrackersOutputSchema,
    annotations: readOnlyOpenWorldAnnotations
  },
  {
    name: "explain_finding",
    title: "Explain CertScore finding",
    description: "Explain a single CertScore finding with public evidence, caveats, and reviewer next steps.",
    inputSchema: mcpExplainFindingInputSchema,
    outputSchema: apiV2FindingDetailSchema,
    annotations: readOnlyOpenWorldAnnotations
  },
  {
    name: "get_latest_domain_scan",
    title: "Get latest domain scan",
    description: "Retrieve the latest eligible API v2 public-safe scan for a domain.",
    inputSchema: mcpGetLatestDomainScanInputSchema,
    outputSchema: apiV2DomainLatestScanSchema,
    annotations: readOnlyOpenWorldAnnotations
  },
  {
    name: "get_latest_domain_pre_consent_cookies_trackers",
    title: "Get latest domain pre-consent cookies and trackers",
    description: "Retrieve the public-safe Cookies & Trackers (Pre-consent) table from the latest eligible scan for a domain.",
    inputSchema: mcpGetLatestDomainPreConsentCookiesTrackersInputSchema,
    outputSchema: mcpPreConsentCookiesTrackersOutputSchema,
    annotations: readOnlyOpenWorldAnnotations
  }
] as const;
