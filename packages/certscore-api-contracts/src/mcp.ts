import { z } from "zod";

export const mcpPulseDetailSchema = z.enum(["tiny", "quick", "standard", "full"]);
export const mcpGptSafePulseDetailSchema = z.enum(["tiny", "standard"]);
export const mcpPulseFormatSchema = z.enum(["json", "markdown"]);
export const mcpPulseFreshnessSchema = z.enum(["latest", "refresh"]);
export const mcpScanFromSchema = z.enum(["eu_ie", "california"]);

export const mcpCreateScanInputSchema = {
  url: z.string().min(1).describe("Public URL or domain to scan."),
  detail: mcpPulseDetailSchema.optional().describe("Pulse detail level. Defaults to standard."),
  format: mcpPulseFormatSchema.optional().describe("Response format for completed immediate responses. Defaults to json."),
  freshness: mcpPulseFreshnessSchema.optional().describe("Use latest to reuse recent scans or refresh to request a new scan when eligible."),
  scanFrom: mcpScanFromSchema.optional().describe("Optional scan execution context for newly queued scans.")
} as const;

export const mcpGetScanStatusInputSchema = {
  jobId: z.string().min(1).optional().describe("Pulse job ID returned by create_scan or scan_site."),
  scanId: z.string().min(1).optional().describe("Stable CertScore scan ID for API v2 scan status.")
} as const;

export const mcpGetScanInputSchema = {
  scanId: z.string().min(1).describe("Stable CertScore scan ID.")
} as const;

export const mcpGetReportInputSchema = {
  scanId: z.string().min(1).describe("Stable CertScore scan ID."),
  detail: mcpPulseDetailSchema.optional().describe("Pulse detail level. Defaults to standard."),
  format: mcpPulseFormatSchema.optional().describe("Use json for structured agent work or markdown for conversational summaries.")
} as const;

export const mcpExportFindingsInputSchema = {
  scanId: z.string().min(1).describe("Stable CertScore scan ID.")
} as const;

export const mcpListFindingsInputSchema = {
  scanId: z.string().min(1).describe("Stable CertScore scan ID.")
} as const;

export const mcpExplainFindingInputSchema = {
  scanId: z.string().min(1).describe("Stable CertScore scan ID."),
  findingId: z.string().min(1).describe("Finding ID to explain.")
} as const;

export const mcpGetLatestDomainScanInputSchema = {
  domain: z.string().min(1).describe("Public domain to look up."),
  scanFrom: mcpScanFromSchema.optional().describe("Optional scan execution context for matching eligible scans.")
} as const;

export const certScoreMcpToolContracts = [
  {
    name: "create_scan",
    title: "Create CertScore Pulse scan",
    description: "Start a CertScore Pulse scan for a public URL and return immediately with status, scan, and polling links.",
    inputSchema: mcpCreateScanInputSchema
  },
  {
    name: "scan_site",
    title: "Scan site",
    description: "Start or reuse a CertScore public-web scan for a public URL. Compatibility alias for create_scan with an agent-friendly name.",
    inputSchema: mcpCreateScanInputSchema
  },
  {
    name: "get_scan",
    title: "Get CertScore scan",
    description: "Retrieve the API v2 public-safe scan resource for a stable scan ID.",
    inputSchema: mcpGetScanInputSchema
  },
  {
    name: "get_scan_status",
    title: "Get CertScore Pulse scan status",
    description: "Check public-safe status for an existing Pulse jobId or API v2 scanId.",
    inputSchema: mcpGetScanStatusInputSchema
  },
  {
    name: "get_report",
    title: "Get CertScore Pulse report",
    description: "Retrieve an evidence-backed CertScore Pulse report by stable scan ID.",
    inputSchema: mcpGetReportInputSchema
  },
  {
    name: "export_findings",
    title: "Export CertScore findings",
    description: "Return structured findings from a CertScore Pulse report for downstream review or ticketing workflows.",
    inputSchema: mcpExportFindingsInputSchema
  },
  {
    name: "list_findings",
    title: "List CertScore findings",
    description: "List API v2 public-safe findings already projected for a scan.",
    inputSchema: mcpListFindingsInputSchema
  },
  {
    name: "explain_finding",
    title: "Explain CertScore finding",
    description: "Explain a single CertScore finding with public evidence, caveats, and reviewer next steps.",
    inputSchema: mcpExplainFindingInputSchema
  },
  {
    name: "get_latest_domain_scan",
    title: "Get latest domain scan",
    description: "Retrieve the latest eligible API v2 public-safe scan for a domain.",
    inputSchema: mcpGetLatestDomainScanInputSchema
  }
] as const;
