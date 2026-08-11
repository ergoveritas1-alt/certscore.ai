import { CertScoreClient, CertScoreTimeoutError } from "@certscore/sdk";
import { certScoreMcpToolContracts } from "@certscore/api-contracts";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CERTSCORE_MCP_VERSION } from "./version.js";
import { boundEvidencePacket, buildScanBundle, exportFindings, limitPreConsentRows, normalizeDetail, normalizeFormat, paginateFindingList, toInvalidArgumentsToolError, toToolError, toToolResult, withMcpAgentGuidance } from "./tools.js";

export interface CertScoreMcpOptions {
  apiKey?: string;
  baseUrl?: string;
  forwardedClientIp?: string | null;
  anonymousRequesterSecret?: string | null;
  timeout?: number;
  toolProfile?: "full" | "light";
}

type CertScoreMcpToolName = (typeof certScoreMcpToolContracts)[number]["name"];
type CreateScanInput = {
  url: string;
  detail?: "tiny" | "quick" | "standard" | "full" | "summary" | "evidence";
  format?: "json" | "markdown";
  freshness?: "latest" | "refresh";
  scanFrom?: "eu_de" | "eu_ie" | "california";
  waitForCompletion?: boolean;
  maxWaitSeconds?: number;
};
type GetScanStatusInput = { scanId: string };
type GetScanInput = { scanId: string };
type GetReportInput = { scanId: string; detail?: "tiny" | "quick" | "standard" | "full" | "summary" | "evidence"; format?: "json" | "markdown" };
type GetEvidenceInput = { scanId: string };
type GetScanBundleInput = {
  scanId: string;
  detail?: "summary" | "findings" | "evidence" | "full";
  maxBytes?: number;
  maxFindings?: number;
  maxPreConsentRows?: number;
};
type ExportFindingsInput = { scanId: string };
type ListFindingsInput = { limit?: number; offset?: number; scanId: string };
type GetPreConsentCookiesTrackersInput = { maxRows?: number; scanId: string };
type ExplainFindingInput = { scanId: string; findingId: string };
type GetLatestDomainScanInput = { domain: string; scanFrom?: "eu_de" | "eu_ie" | "california" };
type GetLatestDomainPreConsentCookiesTrackersInput = { domain: string; maxRows?: number; scanFrom?: "eu_de" | "eu_ie" | "california" };

let createScanDeprecationWarningPrinted = false;
const DEFAULT_MCP_SCAN_WAIT_MS = 45_000;

async function retryTransientOriginFailure<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const retryable = error instanceof Error && "status" in error && [502, 503, 504].includes(Number((error as { status?: unknown }).status));
    if (!retryable) {
      throw error;
    }
    return operation();
  }
}

function scanCreationMetadata(value: Record<string, unknown>) {
  return {
    executionMode: value.executionMode,
    reused: value.reused,
    reusedScanAgeSeconds: value.reusedScanAgeSeconds,
    freshnessDecision: value.freshnessDecision,
    quotaConsumed: value.quotaConsumed,
    anonymousQuotaLimit: value.anonymousQuotaLimit,
    anonymousQuotaRemaining: value.anonymousQuotaRemaining,
    anonymousQuotaResetAt: value.anonymousQuotaResetAt,
    upgradeSupportEmail: value.upgradeSupportEmail,
    upgradeMessage: value.upgradeMessage
  };
}

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
  const sdkCreateToolError = (server as any).createToolError.bind(server) as (message: string) => ReturnType<typeof toInvalidArgumentsToolError>;
  (server as any).createToolError = (message: string) => message.includes("Input validation error:")
    ? toInvalidArgumentsToolError(message)
    : sdkCreateToolError(message);
  const lightTools = new Set<CertScoreMcpToolName>(["scan_site", "get_scan_status", "get_scan_bundle"]);
  const registerMcpTool = server.registerTool.bind(server) as any;
  const registerTool = (name: CertScoreMcpToolName, contract: unknown, handler: unknown) => {
    if (options.toolProfile === "light" && !lightTools.has(name)) {
      return;
    }
    registerMcpTool(name, contract, handler);
  };

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
          return toToolResult(withMcpAgentGuidance(created as unknown as Record<string, any>));
        }
        try {
          const completed = await client.scans.wait(created, {
            maxWaitMs: Math.min(input.maxWaitSeconds ? input.maxWaitSeconds * 1_000 : DEFAULT_MCP_SCAN_WAIT_MS, DEFAULT_MCP_SCAN_WAIT_MS)
          });
          return toToolResult(withMcpAgentGuidance({
            ...completed,
            ...scanCreationMetadata(created as unknown as Record<string, unknown>)
          }));
        } catch (error) {
          const scanId = created.scanId ?? created.scan_id;
          console.warn(JSON.stringify({
            event: "mcp.scan_site.wait_deferred",
            errorName: error instanceof Error ? error.name : "UnknownError",
            jobId: created.jobId ?? null,
            scanId: scanId ?? null,
            status: created.status ?? null
          }));
          if (error instanceof CertScoreTimeoutError && scanId) {
            try {
              return toToolResult(withMcpAgentGuidance({
                ...(await client.scans.status(scanId)),
                ...scanCreationMetadata(created as unknown as Record<string, unknown>)
              }));
            } catch {
              // Creation already succeeded. Preserve that stable identity when
              // the follow-up status read is briefly unavailable.
            }
          }

          // Waiting is a convenience layered on top of scan creation. Once the
          // API has accepted a scan, never turn a transient polling or hydration
          // failure into an identity-less tool error that encourages callers to
          // submit a second, non-idempotent scan_site request.
          return toToolResult(withMcpAgentGuidance(created as unknown as Record<string, any>));
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
    async ({ scanId }: GetScanStatusInput) => {
      try {
        const status = await client.scans.status(scanId);
        const needsTerminalHydration = status.status === "completed" || status.status === "completed_limited";
        if (needsTerminalHydration) {
          try {
            const scan = await client.scans.get(scanId);
            return toToolResult(withMcpAgentGuidance({
              ...status,
              type: "certscore_scan_job",
              status: scan.status,
              domain: scan.domain,
              url: scan.url ?? null,
              resultDisposition: scan.resultDisposition,
              noGo: scan.noGo,
              createdAt: scan.createdAt ?? null,
              startedAt: scan.startedAt,
              completedAt: scan.completedAt,
              scanTimeSeconds: scan.scanTimeSeconds,
              score: scan.score ?? null,
              scoreStatus: scan.scoreStatus,
              scoreVersion: scan.scoreVersion ?? null,
              scoreUpdatedAt: scan.scoreUpdatedAt ?? null,
              riskLevel: scan.riskLevel ?? null,
              coverage: scan.coverage ?? null,
              reportUrl: scan.links?.report ?? status.reportUrl ?? null,
              links: { ...status.links, ...scan.links }
            }));
          } catch {
            // Preserve the API status response if the terminal scan resource is
            // briefly unavailable during eventual-consistency windows.
          }
        }
        return toToolResult(withMcpAgentGuidance(status as unknown as Record<string, any>));
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
    "get_scan_bundle",
    toolContract("get_scan_bundle"),
    async ({ scanId, detail = "summary", maxBytes, maxFindings, maxPreConsentRows }: GetScanBundleInput) => {
      try {
        const scan = await retryTransientOriginFailure(() => client.scans.get(scanId));
        if (scan.status === "completed_limited" && scan.resultDisposition === "no_go") {
          return toToolResult(buildScanBundle({
            detail,
            evidence: null,
            findings: { type: "certscore_finding_list", scanId, findings: [] },
            maxBytes,
            maxFindings,
            maxPreConsentRows,
            preConsentCookiesTrackers: null,
            report: null,
            scan
          }));
        }
        const includeEvidence = detail === "evidence" || detail === "full";
        const [report, findings, evidence, preConsentCookiesTrackers] = await Promise.all([
          retryTransientOriginFailure(() => client.getScan(scanId, { detail: detail === "full" ? "full" : "summary", format: "json" })),
          retryTransientOriginFailure(() => client.findings.list(scanId)),
          includeEvidence
            ? retryTransientOriginFailure(() => client.getScan(scanId, { detail: "evidence", format: "json" }))
            : Promise.resolve(null),
          includeEvidence
            ? retryTransientOriginFailure(() => client.scans.preConsentCookiesTrackers(scanId))
            : Promise.resolve(null)
        ]);
        return toToolResult(buildScanBundle({
          detail,
          evidence,
          findings,
          maxBytes,
          maxFindings,
          maxPreConsentRows,
          preConsentCookiesTrackers,
          report,
          scan
        }));
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
