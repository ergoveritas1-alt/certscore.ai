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
  exampleDomainDemoUrl?: string | null;
  onToolInvocation?: (observation: McpToolInvocationObservation) => void | Promise<void>;
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

export type McpToolInvocationObservation = {
  durationMs: number;
  errorCode: string | null;
  freshness: "latest" | "refresh" | null;
  outcome: "success" | "error" | "rate_limited";
  quotaOutcome: "allowed" | "rate_limited";
  scanDecision: "reused" | "new" | "unavailable" | "not_applicable";
  scanFrom: "eu_de" | "eu_ie" | "california" | null;
  scanId: string | null;
  scanStatus: string | null;
  targetHostname: string | null;
  toolName: string;
  transportOutcome: "mcp_result" | "mcp_error";
};

const DEFAULT_MCP_SCAN_WAIT_MS = 45_000;

type ExampleDomainDemoSubstitution = {
  requestedUrl: string;
  effectiveUrl: string;
  reason: "iana_example_domain";
  message: string;
};

function exampleDomainDemoSubstitution(requestedUrl: string, demoUrl: string | null | undefined): ExampleDomainDemoSubstitution | null {
  if (!demoUrl) return null;
  try {
    const parsed = new URL(requestedUrl.includes("://") ? requestedUrl : `https://${requestedUrl}`);
    const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
    const reserved = ["example.com", "example.net", "example.org"].some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
    );
    if (!reserved) return null;
    return {
      requestedUrl,
      effectiveUrl: demoUrl,
      reason: "iana_example_domain",
      message: "The requested IANA example domain is a documentation placeholder, so CertScore scanned its controlled demonstration site instead. Findings describe the effective URL, not the requested placeholder."
    };
  } catch {
    return null;
  }
}

function withExampleDomainDemo<T extends Record<string, any>>(value: T, substitution: ExampleDomainDemoSubstitution | null) {
  return substitution ? { ...value, demoSubstitution: substitution } : value;
}

function exampleDomainDemoText(value: Record<string, any>, substitution: ExampleDomainDemoSubstitution | null) {
  if (!substitution) return undefined;
  const status = typeof value.status === "string" ? ` Status=${value.status}.` : "";
  const scanId = typeof value.scanId === "string" ? ` ScanId=${value.scanId}.` : "";
  return `${substitution.message}${status}${scanId} Full result and substitution provenance are in structuredContent.`;
}

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

function boundedTelemetryToken(value: unknown, maxLength: number) {
  return typeof value === "string" && /^[a-zA-Z0-9_.:-]+$/.test(value) && value.length <= maxLength
    ? value
    : null;
}

function telemetryResultRecord(result: unknown): Record<string, any> {
  if (!result || typeof result !== "object" || Array.isArray(result)) return {};
  const toolResult = result as Record<string, any>;
  if (toolResult.structuredContent && typeof toolResult.structuredContent === "object" && !Array.isArray(toolResult.structuredContent)) {
    return toolResult.structuredContent;
  }
  const firstText = Array.isArray(toolResult.content)
    ? toolResult.content.find((item: unknown) => item && typeof item === "object" && (item as { type?: unknown }).type === "text")
    : null;
  if (!firstText || typeof (firstText as { text?: unknown }).text !== "string") return {};
  try {
    const parsed = JSON.parse((firstText as { text: string }).text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function telemetryHostname(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const parsed = new URL(value.includes("://") ? value : `https://${value}`);
    return parsed.hostname.toLowerCase().replace(/\.$/, "").slice(0, 253) || null;
  } catch {
    return null;
  }
}

export function projectMcpToolInvocationObservation(input: {
  args: unknown;
  durationMs: number;
  result: unknown;
  toolName: string;
}): McpToolInvocationObservation {
  const args = input.args && typeof input.args === "object" && !Array.isArray(input.args)
    ? input.args as Record<string, unknown>
    : {};
  const result = telemetryResultRecord(input.result);
  const error = result.error && typeof result.error === "object" && !Array.isArray(result.error)
    ? result.error as Record<string, unknown>
    : null;
  const errorCode = boundedTelemetryToken(error?.code ?? (result as Record<string, unknown>).errorCode, 100);
  const rateLimited = errorCode === "rate_limited" || result.status === "rate_limited";
  const isError = Boolean((input.result as { isError?: unknown } | null)?.isError) || Boolean(error);
  const outcome = rateLimited ? "rate_limited" : isError ? "error" : "success";
  const resultScanId = boundedTelemetryToken(result.scanId ?? result.scan_id ?? result.jobId, 128);
  const inputScanId = boundedTelemetryToken(args.scanId, 128);
  const targetHostname = input.toolName === "certscore_scan_site"
    ? telemetryHostname(args.url)
    : input.toolName === "certscore_get_latest_domain_scan"
      || input.toolName === "certscore_get_latest_domain_pre_consent_cookies_trackers"
      ? telemetryHostname(args.domain)
      : null;
  const executionMode = result.executionMode;
  const scanDecision = input.toolName !== "certscore_scan_site"
    ? "not_applicable"
    : outcome !== "success"
      ? "unavailable"
      : result.reused === true || executionMode === "reused_scan"
        ? "reused"
        : result.reused === false || executionMode === "new_scan" || result.quotaConsumed === true
          ? "new"
          : "unavailable";

  return {
    durationMs: Math.max(0, Math.min(Math.round(input.durationMs), 3_600_000)),
    errorCode: rateLimited ? "rate_limited" : errorCode,
    freshness: args.freshness === "refresh" ? "refresh" : input.toolName === "certscore_scan_site" ? "latest" : null,
    outcome,
    quotaOutcome: rateLimited ? "rate_limited" : "allowed",
    scanDecision,
    scanFrom: args.scanFrom === "eu_de" || args.scanFrom === "eu_ie" || args.scanFrom === "california"
      ? args.scanFrom
      : result.scanFrom === "eu_de" || result.scanFrom === "eu_ie" || result.scanFrom === "california"
        ? result.scanFrom
        : null,
    scanId: resultScanId ?? inputScanId,
    scanStatus: boundedTelemetryToken(result.status, 64),
    targetHostname,
    toolName: input.toolName,
    transportOutcome: isError ? "mcp_error" : "mcp_result",
  };
}

function observeToolInvocation(
  observer: CertScoreMcpOptions["onToolInvocation"],
  observation: McpToolInvocationObservation,
) {
  if (!observer) return;
  queueMicrotask(() => {
    Promise.resolve().then(() => observer(observation)).catch((error) => {
      console.error("[certscore-mcp] telemetry observer failed", {
        errorName: error instanceof Error ? error.name : "UnknownError",
        toolName: observation.toolName,
      });
    });
  });
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
    const typedHandler = handler as (input: unknown, extra: McpRequestExtra) => Promise<unknown>;
    registerMcpTool(name, contract, async (input: unknown, extra: McpRequestExtra) => {
      const startedAt = Date.now();
      try {
        const result = await typedHandler(input, extra);
        observeToolInvocation(options.onToolInvocation, projectMcpToolInvocationObservation({
          args: input,
          durationMs: Date.now() - startedAt,
          result,
          toolName: name,
        }));
        return result;
      } catch (error) {
        observeToolInvocation(options.onToolInvocation, {
          ...projectMcpToolInvocationObservation({
            args: input,
            durationMs: Date.now() - startedAt,
            result: { isError: true, structuredContent: { error: { code: "handler_exception" } } },
            toolName: name,
          }),
          errorCode: "handler_exception",
          outcome: "error",
          transportOutcome: "mcp_error",
        });
        throw error;
      }
    });
  };

  registerTool(
    "certscore_scan_site",
    toolContract("certscore_scan_site"),
    async (input: CreateScanInput, extra: McpRequestExtra) => {
      const client = clientForRequest(extra);
      const demoSubstitution = exampleDomainDemoSubstitution(input.url, options.exampleDomainDemoUrl);
      const effectiveUrl = demoSubstitution?.effectiveUrl ?? input.url;
      try {
        const created = await client.scans.create(effectiveUrl, {
          freshness: input.freshness ?? "latest",
          scanFrom: input.scanFrom
        });
        if (input.waitForCompletion === false || created.type === "certscore_scan") {
          const guided = withExampleDomainDemo(withMcpAgentGuidance(created as unknown as Record<string, any>), demoSubstitution);
          return toToolResult(guided, exampleDomainDemoText(guided, demoSubstitution));
        }
        try {
          const internalMcpOperation = { operation: "scan_site_wait" as const, scanId: created.scanId ?? created.scan_id ?? created.jobId };
          const completed = await client.scans.wait(created, {
            maxWaitMs: Math.min(input.maxWaitSeconds ? input.maxWaitSeconds * 1_000 : DEFAULT_MCP_SCAN_WAIT_MS, DEFAULT_MCP_SCAN_WAIT_MS),
            internalMcpOperation
          });
          const guided = withExampleDomainDemo(withMcpAgentGuidance({
            ...completed,
            ...scanCreationMetadata(created as unknown as Record<string, unknown>)
          }), demoSubstitution);
          return toToolResult(guided, exampleDomainDemoText(guided, demoSubstitution));
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
              const guided = withExampleDomainDemo(withMcpAgentGuidance({
                ...(await client.scans.status(scanId, { internalMcpOperation: { operation: "scan_site_wait", scanId } })),
                ...scanCreationMetadata(created as unknown as Record<string, unknown>)
              }), demoSubstitution);
              return toToolResult(guided, exampleDomainDemoText(guided, demoSubstitution));
            } catch {
              // Creation already succeeded. Preserve that stable identity when
              // the follow-up status read is briefly unavailable.
            }
          }

          // Waiting is a convenience layered on top of scan creation. Once the
          // API has accepted a scan, never turn a transient polling or hydration
          // failure into an identity-less tool error that encourages callers to
          // submit a second, non-idempotent certscore_scan_site request.
          const guided = withExampleDomainDemo(withMcpAgentGuidance(created as unknown as Record<string, any>), demoSubstitution);
          return toToolResult(guided, exampleDomainDemoText(guided, demoSubstitution));
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
