import { CertScoreClient, CertScoreTimeoutError } from "@certscore/sdk";
import { certScoreMcpToolContracts } from "@certscore/api-contracts";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RequestInfo } from "@modelcontextprotocol/sdk/types.js";
import { CERTSCORE_MCP_VERSION } from "./version.js";
import { boundEvidencePacket, buildScanBundle, exportFindings, findingListText, limitPreConsentRows, markdownReportText, MAX_EVIDENCE_PACKET_CHARS, normalizeDetail, normalizeFormat, paginateFindingList, preConsentInventoryText, pulseReportText, scanBundleText, scanStatusText, toInvalidArgumentsToolError, toToolError, toToolResult, withMcpAgentGuidance, withMcpScanProvenanceGuidance } from "./tools.js";

export interface CertScoreMcpOptions {
  apiKey?: string;
  baseUrl?: string;
  forwardedClientIp?: string | null;
  resolveForwardedClientIp?: (headers: RequestInfo["headers"]) => string | null;
  anonymousRequesterSecret?: string | null;
  anonymousSurface?: "mcp_light" | "mcp_anonymous" | null;
  timeout?: number;
  toolProfile?: "full" | "light";
}

type CertScoreMcpToolName = (typeof certScoreMcpToolContracts)[number]["name"];
type McpRequestExtra = { requestInfo?: RequestInfo };
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
  const createClient = (forwardedClientIp: string | null | undefined) => new CertScoreClient({
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
    clientName: "mcp",
    forwardedClientIp,
    anonymousRequesterSecret: options.anonymousRequesterSecret,
    anonymousSurface: options.anonymousSurface,
    timeout: options.timeout
  });
  const client = createClient(options.forwardedClientIp);
  const clientForRequest = (extra: { requestInfo?: RequestInfo }) => options.resolveForwardedClientIp
    ? createClient(options.resolveForwardedClientIp(extra.requestInfo?.headers ?? {}))
    : client;

  const server = new McpServer({
    name: "certscore",
    version: CERTSCORE_MCP_VERSION
  });
  const sdkCreateToolError = (server as any).createToolError.bind(server) as (message: string) => ReturnType<typeof toInvalidArgumentsToolError>;
  (server as any).createToolError = (message: string) => message.includes("Input validation error:")
    ? toInvalidArgumentsToolError(message)
    : sdkCreateToolError(message);
  const lightTools = new Set<CertScoreMcpToolName>(["certscore_scan_site", "certscore_get_scan_status", "certscore_get_scan_bundle"]);
  const registerMcpTool = server.registerTool.bind(server) as any;
  const registerTool = (name: CertScoreMcpToolName, contract: unknown, handler: unknown) => {
    if (options.toolProfile === "light" && !lightTools.has(name)) {
      return;
    }
    registerMcpTool(name, contract, handler);
  };

  registerTool(
    "certscore_scan_site",
    toolContract("certscore_scan_site"),
    async (input: CreateScanInput, extra: McpRequestExtra) => {
      const client = clientForRequest(extra);
      try {
        const created = await client.scans.create(input.url, {
          freshness: input.freshness ?? "latest",
          scanFrom: input.scanFrom
        });
        if (input.waitForCompletion === false || created.type === "certscore_scan") {
          return toToolResult(withMcpAgentGuidance(created as unknown as Record<string, any>));
        }
        try {
          const internalMcpOperation = { operation: "scan_site_wait" as const, scanId: created.scanId ?? created.scan_id ?? created.jobId };
          const completed = await client.scans.wait(created, {
            maxWaitMs: Math.min(input.maxWaitSeconds ? input.maxWaitSeconds * 1_000 : DEFAULT_MCP_SCAN_WAIT_MS, DEFAULT_MCP_SCAN_WAIT_MS),
            internalMcpOperation
          });
          return toToolResult(withMcpAgentGuidance({
            ...completed,
            ...scanCreationMetadata(created as unknown as Record<string, unknown>)
          }));
        } catch (error) {
          const scanId = created.scanId ?? created.scan_id;
          console.warn(JSON.stringify({
            event: "mcp.certscore_scan_site.wait_deferred",
            errorName: error instanceof Error ? error.name : "UnknownError",
            jobId: created.jobId ?? null,
            scanId: scanId ?? null,
            status: created.status ?? null
          }));
          if (error instanceof CertScoreTimeoutError && scanId) {
            try {
              return toToolResult(withMcpAgentGuidance({
                ...(await client.scans.status(scanId, { internalMcpOperation: { operation: "scan_site_wait", scanId } })),
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
          // submit a second, non-idempotent certscore_scan_site request.
          return toToolResult(withMcpAgentGuidance(created as unknown as Record<string, any>));
        }
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  registerTool(
    "certscore_get_scan",
    toolContract("certscore_get_scan"),
    async ({ scanId }: GetScanInput) => {
      try {
        return toToolResult(await client.scans.get(scanId));
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  registerTool(
    "certscore_get_scan_status",
    toolContract("certscore_get_scan_status"),
    async ({ scanId }: GetScanStatusInput, extra: McpRequestExtra) => {
      const client = clientForRequest(extra);
      try {
        const internalMcpOperation = { operation: "scan_status" as const, scanId };
        const status = await client.scans.status(scanId, { internalMcpOperation });
        const needsTerminalHydration = status.status === "completed" || status.status === "completed_limited";
        if (needsTerminalHydration) {
          try {
            const scan = await client.scans.get(scanId, { internalMcpOperation });
            const guided = withMcpScanProvenanceGuidance({
              ...status,
              type: "certscore_scan_job",
              status: scan.status,
              domain: scan.domain,
              url: scan.url ?? null,
              scanFrom: scan.scanFrom ?? null,
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
            }, "existing_scan_retrieved");
            return toToolResult(guided, scanStatusText(guided));
          } catch {
            // Preserve the API status response if the terminal scan resource is
            // briefly unavailable during eventual-consistency windows.
          }
        }
        const guided = withMcpScanProvenanceGuidance({
          ...status,
          scanFrom: status.scanFrom ?? null
        } as unknown as Record<string, any>, "existing_scan_retrieved");
        return toToolResult(guided, scanStatusText(guided));
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  registerTool(
    "certscore_get_report",
    toolContract("certscore_get_report"),
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
        if (typeof result === "string") {
          const guided = withMcpAgentGuidance({
            type: "certscore_pulse_markdown",
            scanId,
            value: result
          }, "existing_scan_retrieved");
          return toToolResult(guided, markdownReportText(guided));
        }
        const guided = withMcpAgentGuidance(result as unknown as Record<string, any>, "existing_scan_retrieved");
        return toToolResult(guided, pulseReportText(guided));
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  registerTool(
    "certscore_get_evidence",
    toolContract("certscore_get_evidence"),
    async ({ scanId }: GetEvidenceInput) => {
      try {
        const bounded = boundEvidencePacket(
          await client.getScan(scanId, { detail: "evidence", format: "json" }),
          MAX_EVIDENCE_PACKET_CHARS - 2_500
        ) as Record<string, any>;
        const guided = withMcpAgentGuidance(bounded, "existing_scan_retrieved");
        return toToolResult(guided, pulseReportText(guided, "CertScore evidence result"));
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  registerTool(
    "certscore_get_scan_bundle",
    toolContract("certscore_get_scan_bundle"),
    async ({ scanId, detail = "summary", maxBytes, maxFindings, maxPreConsentRows }: GetScanBundleInput, extra: McpRequestExtra) => {
      const client = clientForRequest(extra);
      try {
        const internalMcpOperation = { operation: "scan_bundle" as const, scanId };
        const scan = await retryTransientOriginFailure(() => client.scans.get(scanId, { internalMcpOperation }));
        if (scan.status === "completed_limited" && scan.resultDisposition === "no_go") {
          const bundle = buildScanBundle({
            detail,
            evidence: null,
            findings: { type: "certscore_finding_list", scanId, findings: [] },
            maxBytes,
            maxFindings,
            maxPreConsentRows,
            preConsentCookiesTrackers: null,
            report: null,
            scan
          });
          return toToolResult(bundle, scanBundleText(bundle));
        }
        const includeEvidence = detail === "evidence" || detail === "full";
        const reportDetail = detail === "full" ? "full" : includeEvidence ? "evidence" : "summary";
        const [report, findings, preConsentCookiesTrackers] = await Promise.all([
          retryTransientOriginFailure(() => client.getScan(scanId, { detail: reportDetail, format: "json", internalMcpOperation })),
          retryTransientOriginFailure(() => client.findings.list(scanId, { internalMcpOperation })),
          scan.status === "completed"
            ? retryTransientOriginFailure(() => client.scans.preConsentCookiesTrackers(scanId, { internalMcpOperation }))
            : Promise.resolve(null)
        ]);
        const evidence = includeEvidence ? report : null;
        const bundle = buildScanBundle({
          detail,
          evidence,
          findings,
          maxBytes,
          maxFindings,
          maxPreConsentRows,
          preConsentCookiesTrackers,
          report,
          scan
        });
        return toToolResult(bundle, scanBundleText(bundle));
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  registerTool(
    "certscore_export_findings",
    toolContract("certscore_export_findings"),
    async ({ scanId }: ExportFindingsInput) => {
      try {
        const report = await client.getScan(scanId, { detail: "full", format: "json" });
        const guided = withMcpAgentGuidance(exportFindings(report), "existing_scan_retrieved");
        return toToolResult(guided, findingListText(guided, "Exported canonical projected findings"));
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  registerTool(
    "certscore_list_findings",
    toolContract("certscore_list_findings"),
    async ({ limit, offset, scanId }: ListFindingsInput) => {
      try {
        const guided = withMcpAgentGuidance(
          paginateFindingList(await client.findings.list(scanId), { limit, offset }),
          "existing_scan_retrieved"
        );
        return toToolResult(guided, findingListText(guided));
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  registerTool(
    "certscore_get_pre_consent_cookies_trackers",
    toolContract("certscore_get_pre_consent_cookies_trackers"),
    async ({ maxRows, scanId }: GetPreConsentCookiesTrackersInput) => {
      try {
        const guided = withMcpAgentGuidance(
          limitPreConsentRows(await client.scans.preConsentCookiesTrackers(scanId), { maxRows }),
          "existing_scan_retrieved"
        );
        return toToolResult(guided, preConsentInventoryText(guided));
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  registerTool(
    "certscore_explain_finding",
    toolContract("certscore_explain_finding"),
    async ({ scanId, findingId }: ExplainFindingInput) => {
      try {
        return toToolResult(await client.findings.explain(scanId, findingId));
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  registerTool(
    "certscore_get_latest_domain_scan",
    toolContract("certscore_get_latest_domain_scan"),
    async ({ domain, scanFrom }: GetLatestDomainScanInput) => {
      try {
        return toToolResult(await client.domains.latest(domain, { scanFrom }));
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  registerTool(
    "certscore_get_latest_domain_pre_consent_cookies_trackers",
    toolContract("certscore_get_latest_domain_pre_consent_cookies_trackers"),
    async ({ domain, maxRows, scanFrom }: GetLatestDomainPreConsentCookiesTrackersInput) => {
      try {
        const guided = withMcpAgentGuidance(
          limitPreConsentRows(await client.domains.latestPreConsentCookiesTrackers(domain, { scanFrom }), { maxRows }),
          "existing_scan_retrieved"
        );
        return toToolResult(guided, preConsentInventoryText(guided));
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  return server;
}
