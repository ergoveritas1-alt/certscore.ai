import { CertScoreClient, CertScoreTimeoutError } from "@certscore/sdk";
import { certScoreMcpToolContracts } from "@certscore/api-contracts";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CERTSCORE_MCP_VERSION } from "./version.js";
import { boundEvidencePacket, exportFindings, limitPreConsentRows, normalizeDetail, normalizeFormat, paginateFindingList, scanIdFromStatus, toToolError, toToolResult } from "./tools.js";

export interface CertScoreMcpOptions {
  apiKey?: string;
  baseUrl?: string;
  forwardedClientIp?: string | null;
  anonymousRequesterSecret?: string | null;
  timeout?: number;
}

type CertScoreMcpToolName = (typeof certScoreMcpToolContracts)[number]["name"];
type CreateScanInput = {
  url: string;
  detail?: "tiny" | "quick" | "standard" | "full" | "summary" | "evidence";
  format?: "json" | "markdown";
  freshness?: "latest" | "refresh";
  scanFrom?: "eu_ie";
  waitForCompletion?: boolean;
  maxWaitSeconds?: number;
};
type GetScanStatusInput = { jobId?: string; scanId?: string };
type GetScanInput = { scanId: string };
type GetReportInput = { scanId: string; detail?: "tiny" | "quick" | "standard" | "full" | "summary" | "evidence"; format?: "json" | "markdown" };
type GetEvidenceInput = { scanId: string };
type ExportFindingsInput = { scanId: string };
type ListFindingsInput = { limit?: number; offset?: number; scanId: string };
type GetPreConsentCookiesTrackersInput = { maxRows?: number; scanId: string };
type ExplainFindingInput = { scanId: string; findingId: string };
type GetLatestDomainScanInput = { domain: string; scanFrom?: "eu_ie" };
type GetLatestDomainPreConsentCookiesTrackersInput = { domain: string; maxRows?: number; scanFrom?: "eu_ie" };

let createScanDeprecationWarningPrinted = false;
const DEFAULT_MCP_SCAN_WAIT_MS = 45_000;

function toolContract(name: CertScoreMcpToolName): any {
  const contract = certScoreMcpToolContracts.find((candidate) => candidate.name === name);
  if (!contract) {
    throw new Error(`Missing CertScore MCP tool contract: ${name}`);
  }
  return {
    title: contract.title,
    description: contract.description,
    inputSchema: contract.inputSchema,
    outputSchema: contract.outputSchema,
    annotations: contract.annotations
  };
}

export function createCertScoreMcpServer(options: CertScoreMcpOptions = {}) {
  const client = new CertScoreClient({
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
    clientName: "mcp",
    forwardedClientIp: options.forwardedClientIp,
    anonymousRequesterSecret: options.anonymousRequesterSecret,
    timeout: options.timeout
  });

  const server = new McpServer({
    name: "certscore",
    version: CERTSCORE_MCP_VERSION
  });
  const registerTool = server.registerTool.bind(server) as any;

  async function createPulseScanTool(input: CreateScanInput) {
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
      pulse: result.pulse ?? null,
      resultDisposition: result.resultDisposition ?? result.pulse?.resultDisposition ?? null,
      noGo: result.noGo ?? result.pulse?.noGo ?? null
    };
  }

  registerTool(
    "create_scan",
    toolContract("create_scan"),
    async (input: CreateScanInput) => {
      try {
        if (!createScanDeprecationWarningPrinted) {
          createScanDeprecationWarningPrinted = true;
          console.error("[certscore-mcp] create_scan is deprecated in the 0.2.x line. Use scan_site for new integrations.");
        }
        return toToolResult(await createPulseScanTool(input));
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  registerTool(
    "scan_site",
    toolContract("scan_site"),
    async (input: CreateScanInput) => {
      try {
        const created = await client.scans.create(input.url, {
          freshness: input.freshness ?? "latest",
          scanFrom: input.scanFrom
        });
        if (input.waitForCompletion === false || created.type === "certscore_scan") {
          return toToolResult(created);
        }
        try {
          return toToolResult(await client.scans.wait(created, {
            maxWaitMs: Math.min(input.maxWaitSeconds ? input.maxWaitSeconds * 1_000 : DEFAULT_MCP_SCAN_WAIT_MS, DEFAULT_MCP_SCAN_WAIT_MS)
          }));
        } catch (error) {
          if (!(error instanceof CertScoreTimeoutError)) {
            throw error;
          }
          const scanId = created.scanId ?? created.scan_id;
          if (scanId) {
            return toToolResult(await client.scans.status(scanId));
          }
          return toToolResult(created);
        }
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  registerTool(
    "get_scan",
    toolContract("get_scan"),
    async ({ scanId }: GetScanInput) => {
      try {
        return toToolResult(await client.scans.get(scanId));
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  registerTool(
    "get_scan_status",
    toolContract("get_scan_status"),
    async ({ jobId, scanId }: GetScanStatusInput) => {
      try {
        if (scanId) {
          const status = await client.scans.status(scanId);
          const needsTerminalHydration = status.status === "completed_limited"
            ? !status.noGo || !status.resultDisposition || status.scanTimeSeconds == null
            : status.status === "completed" && status.scanTimeSeconds == null;
          if (needsTerminalHydration) {
            try {
              const scan = await client.scans.get(scanId);
              return toToolResult({
                ...status,
                type: "certscore_scan_job",
                status: scan.status,
                domain: scan.domain,
                resultDisposition: scan.resultDisposition,
                noGo: scan.noGo,
                startedAt: scan.startedAt,
                completedAt: scan.completedAt,
                scanTimeSeconds: scan.scanTimeSeconds
              });
            } catch {
              // Preserve the API status response if the terminal scan resource is
              // briefly unavailable during eventual-consistency windows.
            }
          }
          return toToolResult(status);
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

  registerTool(
    "get_report",
    toolContract("get_report"),
    async ({ scanId, detail, format }: GetReportInput) => {
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

  registerTool(
    "get_evidence",
    toolContract("get_evidence"),
    async ({ scanId }: GetEvidenceInput) => {
      try {
        return toToolResult(boundEvidencePacket(await client.getScan(scanId, { detail: "evidence", format: "json" })));
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  registerTool(
    "export_findings",
    toolContract("export_findings"),
    async ({ scanId }: ExportFindingsInput) => {
      try {
        const report = await client.getScan(scanId, { detail: "full", format: "json" });
        return toToolResult(exportFindings(report));
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  registerTool(
    "list_findings",
    toolContract("list_findings"),
    async ({ limit, offset, scanId }: ListFindingsInput) => {
      try {
        return toToolResult(paginateFindingList(await client.findings.list(scanId), { limit, offset }));
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  registerTool(
    "get_pre_consent_cookies_trackers",
    toolContract("get_pre_consent_cookies_trackers"),
    async ({ maxRows, scanId }: GetPreConsentCookiesTrackersInput) => {
      try {
        return toToolResult(limitPreConsentRows(await client.scans.preConsentCookiesTrackers(scanId), { maxRows }));
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  registerTool(
    "explain_finding",
    toolContract("explain_finding"),
    async ({ scanId, findingId }: ExplainFindingInput) => {
      try {
        return toToolResult(await client.findings.explain(scanId, findingId));
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  registerTool(
    "get_latest_domain_scan",
    toolContract("get_latest_domain_scan"),
    async ({ domain, scanFrom }: GetLatestDomainScanInput) => {
      try {
        return toToolResult(await client.domains.latest(domain, { scanFrom }));
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  registerTool(
    "get_latest_domain_pre_consent_cookies_trackers",
    toolContract("get_latest_domain_pre_consent_cookies_trackers"),
    async ({ domain, maxRows, scanFrom }: GetLatestDomainPreConsentCookiesTrackersInput) => {
      try {
        return toToolResult(limitPreConsentRows(await client.domains.latestPreConsentCookiesTrackers(domain, { scanFrom }), { maxRows }));
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  return server;
}
