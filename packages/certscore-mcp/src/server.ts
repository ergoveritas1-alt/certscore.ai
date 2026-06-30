import { CertScoreClient } from "@certscore/sdk";
import {
  mcpCreateScanInputSchema,
  mcpExplainFindingInputSchema,
  mcpExportFindingsInputSchema,
  mcpGetLatestDomainScanInputSchema,
  mcpGetLatestDomainPreConsentCookiesTrackersInputSchema,
  mcpGetPreConsentCookiesTrackersInputSchema,
  mcpGetReportInputSchema,
  mcpGetScanInputSchema,
  mcpGetScanStatusInputSchema,
  mcpListFindingsInputSchema
} from "@certscore/api-contracts";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { exportFindings, normalizeDetail, normalizeFormat, scanIdFromStatus, toToolError, toToolResult } from "./tools.js";

export interface CertScoreMcpOptions {
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;
}

export function createCertScoreMcpServer(options: CertScoreMcpOptions = {}) {
  const client = new CertScoreClient({
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
    timeout: options.timeout
  });

  const server = new McpServer({
    name: "certscore-pulse",
    version: "0.1.1"
  });

  async function createPulseScanTool(input: { url: string; detail?: "tiny" | "quick" | "standard" | "full"; format?: "json" | "markdown"; freshness?: "latest" | "refresh"; scanFrom?: "eu_ie" | "california" }) {
    const result = await client.submitScan(input.url, {
      detail: normalizeDetail(input.detail),
      format: normalizeFormat(input.format),
      freshness: input.freshness ?? "latest",
      scanFrom: input.scanFrom
    });
    return {
      type: "certscore_mcp_scan_created",
      status: result.status,
      jobId: result.jobId ?? null,
      scanId: result.scanId ?? result.scan_id ?? null,
      completed: result.completed ?? false,
      statusUrl: result.statusUrl ?? result.nextCheckUrl ?? null,
      resultUrl: result.resultUrl ?? null,
      reportUrl: result.reportUrl ?? null,
      pulse: result.pulse ?? null
    };
  }

  server.registerTool(
    "create_scan",
    {
      title: "Create CertScore Pulse scan",
      description: "Start a CertScore Pulse scan for a public URL and return immediately with status, scan, and polling links.",
      inputSchema: mcpCreateScanInputSchema
    },
    async (input) => {
      try {
        return toToolResult(await createPulseScanTool(input));
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  server.registerTool(
    "scan_site",
    {
      title: "Scan site",
      description: "Start or reuse a CertScore public-web scan for a public URL.",
      inputSchema: mcpCreateScanInputSchema
    },
    async (input) => {
      try {
        return toToolResult(
          await client.scans.create(input.url, {
            freshness: input.freshness ?? "latest",
            scanFrom: input.scanFrom
          })
        );
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  server.registerTool(
    "get_scan",
    {
      title: "Get CertScore scan",
      description: "Retrieve the API v2 public-safe scan resource for a stable scan ID.",
      inputSchema: mcpGetScanInputSchema
    },
    async ({ scanId }) => {
      try {
        return toToolResult(await client.scans.get(scanId));
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  server.registerTool(
    "get_scan_status",
    {
      title: "Get CertScore Pulse scan status",
      description: "Check public-safe status for an existing Pulse jobId or API v2 scanId.",
      inputSchema: mcpGetScanStatusInputSchema
    },
    async ({ jobId, scanId }) => {
      try {
        if (scanId) {
          return toToolResult(await client.scans.status(scanId));
        }
        if (!jobId) {
          return toToolResult({
            error: {
              name: "InvalidToolInput",
              message: "Provide either scanId for API v2 scan status or jobId for Pulse job status."
            }
          });
        }
        const status = await client.getJobStatus(jobId);
        return toToolResult({
          ...status,
          scanId: scanIdFromStatus(status)
        });
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  server.registerTool(
    "get_report",
    {
      title: "Get CertScore Pulse report",
      description: "Retrieve an evidence-backed CertScore Pulse report by stable scan ID.",
      inputSchema: mcpGetReportInputSchema
    },
    async ({ scanId, detail, format }) => {
      try {
        const normalizedFormat = normalizeFormat(format);
        const result =
          normalizedFormat === "markdown"
            ? await client.getScan(scanId, {
                detail: normalizeDetail(detail),
                format: "markdown"
              })
            : await client.getScan(scanId, {
                detail: normalizeDetail(detail),
                format: "json"
              });
        return toToolResult(result);
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  server.registerTool(
    "export_findings",
    {
      title: "Export CertScore findings",
      description: "Return structured findings from a CertScore Pulse report for downstream review or ticketing workflows.",
      inputSchema: mcpExportFindingsInputSchema
    },
    async ({ scanId }) => {
      try {
        const report = await client.getScan(scanId, { detail: "full", format: "json" });
        return toToolResult(exportFindings(report));
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  server.registerTool(
    "list_findings",
    {
      title: "List CertScore findings",
      description: "List API v2 public-safe findings already projected for a scan.",
      inputSchema: mcpListFindingsInputSchema
    },
    async ({ scanId }) => {
      try {
        return toToolResult(await client.findings.list(scanId));
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  server.registerTool(
    "get_pre_consent_cookies_trackers",
    {
      title: "Get pre-consent cookies and trackers",
      description: "Retrieve the public-safe Cookies & Trackers (Pre-consent) report table as compact JSON for a scan.",
      inputSchema: mcpGetPreConsentCookiesTrackersInputSchema
    },
    async ({ scanId }) => {
      try {
        return toToolResult(await client.scans.preConsentCookiesTrackers(scanId));
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  server.registerTool(
    "explain_finding",
    {
      title: "Explain CertScore finding",
      description: "Explain a single CertScore finding with public evidence, caveats, and reviewer next steps.",
      inputSchema: mcpExplainFindingInputSchema
    },
    async ({ scanId, findingId }) => {
      try {
        return toToolResult(await client.findings.explain(scanId, findingId));
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  server.registerTool(
    "get_latest_domain_scan",
    {
      title: "Get latest domain scan",
      description: "Retrieve the latest eligible API v2 public-safe scan for a domain.",
      inputSchema: mcpGetLatestDomainScanInputSchema
    },
    async ({ domain, scanFrom }) => {
      try {
        return toToolResult(await client.domains.latest(domain, { scanFrom }));
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  server.registerTool(
    "get_latest_domain_pre_consent_cookies_trackers",
    {
      title: "Get latest domain pre-consent cookies and trackers",
      description: "Retrieve the public-safe Cookies & Trackers (Pre-consent) table from the latest eligible scan for a domain.",
      inputSchema: mcpGetLatestDomainPreConsentCookiesTrackersInputSchema
    },
    async ({ domain, scanFrom }) => {
      try {
        return toToolResult(await client.domains.latestPreConsentCookiesTrackers(domain, { scanFrom }));
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  return server;
}
