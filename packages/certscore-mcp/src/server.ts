import { CertScoreClient } from "@certscore/sdk";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { explainFinding, exportFindings, normalizeDetail, normalizeFormat, scanIdFromStatus, toToolError, toToolResult } from "./tools.js";

const detailSchema = z.enum(["tiny", "quick", "standard", "full"]).optional();
const formatSchema = z.enum(["json", "markdown"]).optional();
const freshnessSchema = z.enum(["latest", "refresh"]).optional();

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
    version: "0.1.0"
  });

  server.registerTool(
    "create_scan",
    {
      title: "Create CertScore Pulse scan",
      description: "Start a CertScore Pulse scan for a public URL and return immediately with status, scan, and polling links.",
      inputSchema: {
        url: z.string().min(1).describe("Public URL or domain to scan."),
        detail: detailSchema.describe("Pulse detail level. Defaults to standard."),
        format: formatSchema.describe("Response format for completed immediate responses. Defaults to json."),
        freshness: freshnessSchema.describe("Use latest to reuse recent scans or refresh to request a new scan when eligible.")
      }
    },
    async ({ url, detail, format, freshness }) => {
      try {
        const result = await client.submitScan(url, {
          detail: normalizeDetail(detail),
          format: normalizeFormat(format),
          freshness: freshness ?? "latest"
        });
        return toToolResult({
          type: "certscore_mcp_scan_created",
          status: result.status,
          jobId: result.jobId ?? null,
          scanId: result.scanId ?? result.scan_id ?? null,
          completed: result.completed ?? false,
          statusUrl: result.statusUrl ?? result.nextCheckUrl ?? null,
          resultUrl: result.resultUrl ?? null,
          reportUrl: result.reportUrl ?? null,
          pulse: result.pulse ?? null
        });
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  server.registerTool(
    "get_scan_status",
    {
      title: "Get CertScore Pulse scan status",
      description: "Check the public-safe status for an existing CertScore Pulse job.",
      inputSchema: {
        jobId: z.string().min(1).describe("Pulse job ID returned by create_scan.")
      }
    },
    async ({ jobId }) => {
      try {
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
      inputSchema: {
        scanId: z.string().min(1).describe("Stable CertScore scan ID."),
        detail: detailSchema.describe("Pulse detail level. Defaults to standard."),
        format: formatSchema.describe("Use json for structured agent work or markdown for conversational summaries.")
      }
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
      inputSchema: {
        scanId: z.string().min(1).describe("Stable CertScore scan ID.")
      }
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
    "explain_finding",
    {
      title: "Explain CertScore finding",
      description: "Explain a single CertScore finding with public evidence, caveats, and reviewer next steps.",
      inputSchema: {
        scanId: z.string().min(1).describe("Stable CertScore scan ID."),
        findingId: z.string().min(1).describe("Finding ID to explain.")
      }
    },
    async ({ scanId, findingId }) => {
      try {
        const report = await client.getScan(scanId, { detail: "full", format: "json" });
        return toToolResult(explainFinding(report, findingId));
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  return server;
}
