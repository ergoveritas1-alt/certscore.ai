import { randomUUID } from "node:crypto";
import { captureMcpResponse, withResponseCapture } from "./response-capture.js";
import type { McpResponseSummary } from "@website-signal-risk-scanner/shared";
import { z } from "zod";
import { captureMcpCallerInput, type McpCallerInput } from "@website-signal-risk-scanner/shared/dist/mcp-caller-input.js";
import { CertScoreClient } from "@certscore/sdk";
import { certScoreMcpToolContracts, isCanonicalScanId } from "@certscore/api-contracts";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolRequestSchema, ErrorCode, McpError, type RequestInfo } from "@modelcontextprotocol/sdk/types.js";
import { sanitizeMcpTaskContext, type McpTaskContext } from "@website-signal-risk-scanner/shared/dist/mcp-product-context.js";
import { CERTSCORE_MCP_VERSION } from "./version.js";
import { boundEvidencePacket, buildScanBundle, exportFindings, findingListText, limitPreConsentRows, markdownReportText, MAX_EVIDENCE_PACKET_CHARS, normalizeDetail, normalizeFormat, paginateFindingList, preConsentInventoryText, pulseReportText, scanBundleText, scanSiteText, scanStatusText, toInvalidArgumentsToolError, toInvalidScanIdToolError, toToolError, toToolResult, withMcpAgentGuidance, withMcpScanProvenanceGuidance } from "./tools.js";

export interface CertScoreMcpOptions {
  apiKey?: string;
  /** Trusted host callback providing the current request's validated credential. */
  resolveApiKey?: () => string;
  baseUrl?: string;
  forwardedClientIp?: string | null;
  resolveForwardedClientIp?: (headers: RequestInfo["headers"]) => string | null;
  resolveAnonymousRequesterSession?: () => string | null;
  anonymousRequesterSecret?: string | null;
  anonymousSurface?: "mcp_light" | "mcp_anonymous" | null;
  timeout?: number;
  toolProfile?: "full" | "light";
  initialPreConsentPreviewWaitMs?: number;
  exampleDomainDemoUrl?: string | null;
  onToolInvocationStarted?: (input: { requestId: string; toolName: string; startedAt: string }) => void | Promise<void>;
  onToolInvocation?: (
    observation: McpToolInvocationObservation,
    requestContext: McpToolInvocationRequestContext,
  ) => void | Promise<void>;
}

type CertScoreMcpToolName = (typeof certScoreMcpToolContracts)[number]["name"];
type McpRequestExtra = { requestInfo?: RequestInfo };
export type McpToolInvocationRequestContext = {
  headers: RequestInfo["headers"] | null;
};
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
  requestId?: string;
  timing?: { startedAt: string; responseGeneratedAt: string };
  callerInput?: McpCallerInput;
  captureBasis?: "protocol_request";
  taskContext?: McpTaskContext;
  response?: { bytes: number | null; truncated: boolean | null; effectiveMaxBytes?: number; summary?: McpResponseSummary };
  requestArguments?: { values: Record<string, string | number | boolean>; omitted: boolean };
  rateLimit?: { kind: "scan_creation" | "upstream"; retryAfterSeconds?: number; scope?: string; windowId?: string; limit?: number; used?: number; windowSeconds?: number };
  durationMs: number;
  errorCode: string | null;
  freshness: "latest" | "refresh" | null;
  isCanary: boolean;
  outcome: "success" | "error" | "rate_limited";
  quotaOutcome: "allowed" | "rate_limited";
  requestedResource: string | null;
  requestedResourceType: "url" | "domain" | "scan_id" | "job_id" | null;
  scanDecision: "reused" | "new" | "unavailable" | "not_applicable";
  scanFrom: "eu_de" | "eu_ie" | "california" | null;
  scanId: string | null;
  scanStatus: string | null;
  targetHostname: string | null;
  toolName: string;
  transportOutcome: "mcp_result" | "mcp_error";
};

const LIGHT_MCP_BUNDLE_RESPONSE_CEILING_BYTES = 25_000;
const MCP_SCAN_SITE_TARGET_RESPONSE_MS = 11_000;
const MCP_SCAN_SITE_TARGET_RESPONSE_RESERVE_MS = 250;
const MCP_SCAN_SITE_PREVIEW_POLL_INTERVAL_MS = 750;
const MCP_SCAN_SITE_MAX_PREVIEW_WAIT_MS = 10_000;

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
  return scanSiteText(value, substitution
    ? [`${substitution.message} Substitution provenance is in structuredContent.`]
    : []);
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

function activeScan(value: Record<string, unknown>) {
  return value.status === "queued" || value.status === "running" || value.status === "finalizing";
}

function hasPreConsentPreview(value: Record<string, unknown>) {
  return Boolean(value.preConsentPreview && typeof value.preConsentPreview === "object" && !Array.isArray(value.preConsentPreview));
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
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

function telemetryUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const parsed = new URL(value.includes("://") ? value : `https://${value}`);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.origin.slice(0, 512);
  } catch {
    return null;
  }
}

function requestedTelemetryResource(args: Record<string, unknown>) {
  const scanId = boundedTelemetryToken(args.scanId, 128);
  if (scanId) return { requestedResource: scanId, requestedResourceType: "scan_id" as const };
  const jobId = boundedTelemetryToken(args.jobId, 128);
  if (jobId) return { requestedResource: jobId, requestedResourceType: "job_id" as const };
  const url = telemetryUrl(args.url);
  if (url) return { requestedResource: url, requestedResourceType: "url" as const };
  const domain = telemetryHostname(args.domain);
  if (domain) return { requestedResource: domain, requestedResourceType: "domain" as const };
  return { requestedResource: null, requestedResourceType: null };
}

function isCertScoreCanaryUrl(value: unknown) {
  if (typeof value !== "string") return false;
  try {
    const parsed = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return parsed.pathname.startsWith("/.well-known/certscore-canary/");
  } catch {
    return false;
  }
}

/** Retain only bounded tool options; URL paths, queries and unknown/free-text inputs are omitted. */
export function projectMcpTelemetryArguments(args: Record<string, unknown>) {
  const values: Record<string, string | number | boolean> = {};
  const options: Record<string, readonly string[]> = {
    freshness: ["latest", "refresh"], scanFrom: ["eu_de", "eu_ie", "california"],
    detail: ["tiny", "quick", "standard", "full", "summary", "evidence", "findings"], format: ["json", "markdown"],
  };
  for (const [key, allowed] of Object.entries(options)) {
    if (typeof args[key] === "string" && allowed.includes(args[key] as string)) values[key] = args[key] as string;
  }
  for (const key of ["scanId", "jobId", "findingId"]) {
    const token = boundedTelemetryToken(args[key], 128);
    if (token) values[key] = token;
  }
  for (const key of ["maxWaitSeconds", "maxBytes", "maxFindings", "maxPreConsentRows", "maxRows", "limit", "offset"]) {
    const value = args[key];
    if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 1_000_000) values[key] = value;
  }
  if (typeof args.waitForCompletion === "boolean") values.waitForCompletion = args.waitForCompletion;
  const url = telemetryUrl(args.url);
  if (url) values.url = url;
  const domain = telemetryHostname(args.domain);
  if (domain && /^[a-z0-9.-]+$/.test(domain)) values.domain = domain;
  const omitted = Object.keys(args).some((key) => !(key in values) || args[key] !== values[key]);
  return { values, omitted };
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
  const completedNoGo = result.status === "completed_limited"
    && result.resultDisposition === "no_go";
  // A completed no-go is a usable terminal scan result. Agent guidance embeds
  // its reason-specific remedy in `error`, but the MCP tool call itself
  // succeeded and must not be counted as a transport or invocation failure.
  const errorCode = completedNoGo
    ? null
    : boundedTelemetryToken(error?.code ?? (result as Record<string, unknown>).errorCode, 100);
  const rateLimited = errorCode === "rate_limited" || result.status === "rate_limited";
  const isError = !completedNoGo
    && (Boolean((input.result as { isError?: unknown } | null)?.isError) || Boolean(error));
  const outcome = rateLimited ? "rate_limited" : isError ? "error" : "success";
  const resultScanId = boundedTelemetryToken(result.scanId ?? result.scan_id ?? result.jobId, 128);
  const inputScanId = boundedTelemetryToken(args.scanId, 128);
  const requestedResource = requestedTelemetryResource(args);
  const targetHostname = input.toolName === "certscore_scan_site"
    ? telemetryHostname(args.url)
    : input.toolName === "certscore_get_latest_domain_scan"
      || input.toolName === "certscore_get_latest_domain_pre_consent_cookies_trackers"
      ? telemetryHostname(args.domain)
      : null;
  const isCanary = isCertScoreCanaryUrl(args.url);
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
    requestArguments: projectMcpTelemetryArguments(args),
    ...(rateLimited ? { rateLimit: projectMcpRateLimit(error ?? result) } : {}),
    durationMs: Math.max(0, Math.min(Math.round(input.durationMs), 3_600_000)),
    errorCode: rateLimited ? "rate_limited" : errorCode,
    freshness: args.freshness === "refresh" ? "refresh" : input.toolName === "certscore_scan_site" ? "latest" : null,
    isCanary,
    outcome,
    quotaOutcome: rateLimited ? "rate_limited" : "allowed",
    ...requestedResource,
    scanDecision,
    scanFrom: args.scanFrom === "eu_de" || args.scanFrom === "eu_ie" || args.scanFrom === "california"
      ? args.scanFrom
      : result.scanFrom === "eu_de" || result.scanFrom === "eu_ie" || result.scanFrom === "california"
        ? result.scanFrom
        : null,
    scanId: outcome === "error" && ["invalid_scan_id", "invalid_arguments", "invalid_url", "unknown_tool"].includes(errorCode ?? "")
      ? null : resultScanId ?? inputScanId,
    scanStatus: boundedTelemetryToken(result.status, 64),
    targetHostname,
    toolName: input.toolName,
    transportOutcome: isError ? "mcp_error" : "mcp_result",
  };
}

function projectMcpRateLimit(error: Record<string, unknown>): NonNullable<McpToolInvocationObservation["rateLimit"]> {
  const creation = error.creationRateLimit && typeof error.creationRateLimit === "object" && !Array.isArray(error.creationRateLimit)
    ? error.creationRateLimit as Record<string, unknown> : null;
  const projected: NonNullable<McpToolInvocationObservation["rateLimit"]> = { kind: creation ? "scan_creation" : "upstream" };
  for (const key of ["scope", "windowId"] as const) {
    const value = boundedTelemetryToken(creation?.[key], 128);
    if (value) projected[key] = value;
  }
  for (const key of ["retryAfterSeconds", "limit", "used", "windowSeconds"] as const) {
    const value = key === "retryAfterSeconds" ? error[key] : creation?.[key];
    if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 1_000_000) projected[key] = value;
  }
  return projected;
}

function observeToolInvocation(
  observer: CertScoreMcpOptions["onToolInvocation"],
  observation: McpToolInvocationObservation,
  requestContext: McpToolInvocationRequestContext,
) {
  if (!observer) return;
  queueMicrotask(() => {
    Promise.resolve().then(() => observer(observation, requestContext)).catch((error) => {
      console.error("[certscore-mcp] telemetry observer failed", {
        errorName: error instanceof Error ? error.name : "UnknownError",
        toolName: observation.toolName,
      });
    });
  });
}

export function createCertScoreMcpServer(options: CertScoreMcpOptions = {}) {
  const createClient = (
    forwardedClientIp: string | null | undefined,
    anonymousRequesterSession?: string | null,
    apiKey = options.apiKey
  ) => new CertScoreClient({
    apiKey,
    baseUrl: options.baseUrl,
    clientName: "mcp",
    forwardedClientIp,
    anonymousRequesterSecret: options.anonymousRequesterSecret,
    anonymousSurface: options.anonymousSurface,
    anonymousRequesterSession,
    timeout: options.timeout
  });
  const client = createClient(options.forwardedClientIp, options.resolveAnonymousRequesterSession?.());
  const clientForRequest = (extra: { requestInfo?: RequestInfo }) => {
    if (!options.resolveApiKey && !options.resolveForwardedClientIp) return client;
    const apiKey = options.resolveApiKey ? options.resolveApiKey() : options.apiKey;
    if (options.resolveApiKey && !apiKey?.trim()) {
      throw new Error("Validated MCP request credential is unavailable.");
    }
    return createClient(
      options.resolveForwardedClientIp ? options.resolveForwardedClientIp(extra.requestInfo?.headers ?? {}) : options.forwardedClientIp,
      options.resolveAnonymousRequesterSession?.(),
      apiKey
    );
  };

  const server = new McpServer({
    name: "certscore",
    version: CERTSCORE_MCP_VERSION
  });
  const sdkCreateToolError = (server as any).createToolError.bind(server) as (message: string) => ReturnType<typeof toInvalidArgumentsToolError>;
  (server as any).createToolError = (message: string) => message.includes("Input validation error:")
    ? toInvalidArgumentsToolError(message)
    : sdkCreateToolError(message);
  const registeredToolNames = new Set<string>();
  const lightTools = new Set<CertScoreMcpToolName>(["certscore_scan_site", "certscore_get_scan_status", "certscore_get_scan_bundle"]);
  const scanIdTools = new Set<CertScoreMcpToolName>([
    "certscore_explain_finding",
    "certscore_export_findings",
    "certscore_get_evidence",
    "certscore_get_pre_consent_cookies_trackers",
    "certscore_get_report",
    "certscore_get_scan",
    "certscore_get_scan_bundle",
    "certscore_get_scan_status",
    "certscore_list_findings",
  ]);
  // Intercept SDK registration through its public API so lookup/validation errors
  // and original arguments are observed once, before SDK normalization. Restore
  // the registration method after constructing this server; no private handler map.
  const registerRequest = server.server.setRequestHandler.bind(server.server);
  server.server.setRequestHandler = ((schema: unknown, handler: any) => {
    if (schema !== CallToolRequestSchema) return registerRequest(schema as any, handler);
    return registerRequest(CallToolRequestSchema, async (request, extra) => {
      const startedAt = Date.now();
      const requestId = randomUUID();
      const name = request.params.name;
      if (options.onToolInvocationStarted) {
        void Promise.resolve().then(() => options.onToolInvocationStarted!({ requestId, toolName: name, startedAt: new Date(startedAt).toISOString() }))
          .catch(() => console.error("[certscore-mcp] request-start observation failed"));
      }
      const args = request.params.arguments ?? {};
      const taskContext = sanitizeMcpTaskContext(args.taskContext);
      const forwardedRequest = name === "certscore_scan_site" && args.taskContext !== undefined && !taskContext
        ? {
            ...request,
            params: {
              ...request.params,
              arguments: Object.fromEntries(
                Object.entries(args).filter(([key]) => key !== "taskContext"),
              ),
            },
          }
        : request;
      const known = registeredToolNames.has(name);
      let result: any;
      let protocolFailure: unknown;
      try {
        if (!known) {
          result = { isError: true, structuredContent: { error: { code: "unknown_tool" } } };
          const availableTools = [...registeredToolNames];
          const recommendedNextAction = "Refresh the available tools using your MCP client's tool discovery (tools/list), then call a supported tool.";
          throw withResponseCapture(new McpError(ErrorCode.InvalidParams,
            `This tool is unavailable on this endpoint. ${recommendedNextAction} Available tools: ${availableTools.join(", ")}.`,
            { code: "unknown_tool", retryable: false, recommendedNextAction, availableTools }), { message: `This tool is unavailable on this endpoint. ${recommendedNextAction} Available tools: ${availableTools.join(", ")}.`, recommendedNextAction });
        }
        const contract = certScoreMcpToolContracts.find(candidate => candidate.name === name)!;
        const validation = z.object(contract.inputSchema).safeParse(forwardedRequest.params.arguments ?? {});
        result = validation.success
          ? await handler(forwardedRequest, extra)
          : toInvalidArgumentsToolError(`Input validation error: tool ${name}`, {
              tool: name,
              issues: validation.error.issues.map(issue => ({
                // Only schema-owned top-level names; never echo values or dynamic keys.
                field: typeof issue.path[0] === "string" && Object.hasOwn(contract.inputSchema, issue.path[0]) ? issue.path[0] : "arguments",
                code: issue.code,
                ...(issue.code === "invalid_type" && issue.received === "undefined" ? { required: true } : {}),
              })).filter((issue, index, issues) => issues.findIndex(other => other.field === issue.field) === index).slice(0, 8),
            });
        return result;
      } catch (error) {
        protocolFailure = error;
        result ??= { isError: true, structuredContent: { error: { code: "handler_exception" } } };
        throw error;
      } finally {
        try {
          const observation = projectMcpToolInvocationObservation({ args, durationMs: Date.now() - startedAt, result, toolName: name });
          if (!known) observation.errorCode = "unknown_tool";
          else if (observation.outcome === "error" && !observation.errorCode) observation.errorCode = "protocol_error";
          const payload = telemetryResultRecord(result);
          const metadata = payload.mcpMetadata as Record<string, unknown> | undefined;
          observeToolInvocation(options.onToolInvocation, {
            ...observation,
            requestId,
            timing: { startedAt: new Date(startedAt).toISOString(), responseGeneratedAt: new Date().toISOString() },
            captureBasis: "protocol_request",
            callerInput: captureMcpCallerInput(args, request.params._meta),
            ...(taskContext ? { taskContext } : {}),
            response: {
              summary: captureMcpResponse(result, protocolFailure),
              bytes: protocolFailure ? null : Math.min(10_000_000, Buffer.byteLength(JSON.stringify(result ?? null))),
              truncated: typeof metadata?.truncated === "boolean" ? metadata.truncated : null,
              ...(typeof metadata?.effectiveMaxBytes === "number" ? { effectiveMaxBytes: metadata.effectiveMaxBytes } : {}),
            },
          }, { headers: extra.requestInfo?.headers ?? null });
        } catch {
          // Best-effort telemetry must never replace a tool response or its error.
          console.error("[certscore-mcp] telemetry projection failed");
        }
      }
    });
  }) as typeof server.server.setRequestHandler;
  const registerMcpTool = server.registerTool.bind(server) as any;
  const registerTool = (name: CertScoreMcpToolName, contract: unknown, handler: unknown) => {
    if (options.toolProfile === "light" && !lightTools.has(name)) return;
    const typedHandler = handler as (input: unknown, extra: McpRequestExtra) => Promise<unknown>;
    registerMcpTool(name, contract, async (input: unknown, extra: McpRequestExtra) => {
      const scanId = input && typeof input === "object" && !Array.isArray(input)
        ? (input as { scanId?: unknown }).scanId : null;
      return scanIdTools.has(name) && !isCanonicalScanId(scanId)
        ? toInvalidScanIdToolError() : typedHandler(input, extra);
    });
    registeredToolNames.add(name);
  };

  registerTool(
    "certscore_scan_site",
    toolContract("certscore_scan_site"),
    async (input: CreateScanInput, extra: McpRequestExtra) => {
      const toolStartedAtMs = Date.now();
      const creationStartedAtMs = toolStartedAtMs;
      const client = clientForRequest(extra);
      const demoSubstitution = exampleDomainDemoSubstitution(input.url, options.exampleDomainDemoUrl);
      const effectiveUrl = demoSubstitution?.effectiveUrl ?? input.url;
      let creationCompleted = false;
      try {
        const created = await client.scans.create(effectiveUrl, {
          freshness: input.freshness ?? "latest",
          scanFrom: input.scanFrom
        });
        creationCompleted = true;
        console.log(JSON.stringify({
          event: "mcp.certscore_scan_site.creation_completed",
          durationMs: Date.now() - creationStartedAtMs,
          executionMode: created.executionMode ?? null,
          hasScanId: Boolean(created.scanId ?? created.scan_id),
          reused: created.reused === true,
          status: created.status ?? null,
        }));
        let initialResult = created as unknown as Record<string, any>;
        const stableScanId = typeof created.scanId === "string" && created.scanId
          ? created.scanId
          : typeof created.scan_id === "string" && created.scan_id
            ? created.scan_id
            : typeof created.jobId === "string" && created.jobId
              ? created.jobId
              : null;
        const configuredPreviewWaitMs = options.toolProfile === "light"
          ? Math.min(
              Math.max(0, options.initialPreConsentPreviewWaitMs ?? 10_000),
              MCP_SCAN_SITE_MAX_PREVIEW_WAIT_MS,
            )
          : 0;
        const totalRemainingMs = Math.max(
          0,
          toolStartedAtMs + MCP_SCAN_SITE_TARGET_RESPONSE_MS - MCP_SCAN_SITE_TARGET_RESPONSE_RESERVE_MS - Date.now(),
        );
        const previewWaitMs = Math.min(configuredPreviewWaitMs, totalRemainingMs);
        if (stableScanId && previewWaitMs > 0 && activeScan(initialResult)) {
          const previewWaitStartedAtMs = Date.now();
          const previewDeadlineMs = previewWaitStartedAtMs + previewWaitMs;
          let internalReadCount = 0;
          try {
            while (Date.now() < previewDeadlineMs && activeScan(initialResult) && !hasPreConsentPreview(initialResult)) {
              await delay(Math.min(MCP_SCAN_SITE_PREVIEW_POLL_INTERVAL_MS, previewDeadlineMs - Date.now()));
              const requestRemainingMs = previewDeadlineMs - Date.now();
              if (requestRemainingMs <= 0) break;
              const waitAbortController = new AbortController();
              const waitAbortTimer = setTimeout(() => waitAbortController.abort(), requestRemainingMs);
              try {
                internalReadCount += 1;
                const status = await client.scans.status(stableScanId, {
                  internalMcpOperation: { operation: "scan_site_wait", scanId: stableScanId },
                  signal: waitAbortController.signal,
                });
                initialResult = {
                  ...status,
                  ...scanCreationMetadata(created as unknown as Record<string, unknown>),
                } as Record<string, any>;
              } finally {
                clearTimeout(waitAbortTimer);
              }
            }
          } catch (error) {
            console.warn(JSON.stringify({
              event: "mcp.certscore_scan_site.preview_wait_deferred",
              durationMs: Date.now() - previewWaitStartedAtMs,
              errorName: error instanceof Error ? error.name : "UnknownError",
              hasPreview: hasPreConsentPreview(initialResult),
              internalReadCount,
              scanId: stableScanId,
            }));
          }
          console.log(JSON.stringify({
            event: "mcp.certscore_scan_site.preview_wait_completed",
            durationMs: Date.now() - previewWaitStartedAtMs,
            hasPreview: hasPreConsentPreview(initialResult),
            internalReadCount,
            scanId: stableScanId,
            status: initialResult.status ?? null,
            totalDurationMs: Date.now() - toolStartedAtMs,
          }));
        }
        const guided = withExampleDomainDemo(withMcpAgentGuidance(initialResult, "unknown", "scan_creation"), demoSubstitution);
        return toToolResult(guided, exampleDomainDemoText(guided, demoSubstitution));
      } catch (error) {
        console.warn(JSON.stringify({
          event: "mcp.certscore_scan_site.creation_failed",
          durationMs: Date.now() - creationStartedAtMs,
          errorName: error instanceof Error ? error.name : "UnknownError",
        }));
        return toToolError(error, { scanCreation: !creationCompleted });
      }
    }
  );

  registerTool(
    "certscore_get_scan",
    toolContract("certscore_get_scan"),
    async ({ scanId }: GetScanInput, extra: McpRequestExtra) => {
      const client = clientForRequest(extra);
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
          jobId: undefined,
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
    async ({ scanId, detail, format }: GetReportInput, extra: McpRequestExtra) => {
      const client = clientForRequest(extra);
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
    async ({ scanId }: GetEvidenceInput, extra: McpRequestExtra) => {
      const client = clientForRequest(extra);
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
        const responseCeilingBytes = options.toolProfile === "light"
          ? LIGHT_MCP_BUNDLE_RESPONSE_CEILING_BYTES
          : 200_000;
        const requestedMaxBytes = maxBytes ?? (options.toolProfile === "light"
          ? LIGHT_MCP_BUNDLE_RESPONSE_CEILING_BYTES
          : 50_000);
        const internalMcpOperation = { operation: "scan_bundle" as const, scanId };
        const scan = await retryTransientOriginFailure(() => client.scans.get(scanId, { internalMcpOperation }));
        if (scan.status === "completed_limited" && scan.resultDisposition === "no_go") {
          const bundle = buildScanBundle({
            detail,
            evidence: null,
            findings: { type: "certscore_finding_list", scanId, findings: [] },
            maxBytes: requestedMaxBytes,
            maxFindings,
            maxPreConsentRows,
            preConsentCookiesTrackers: null,
            report: null,
            requestedMaxBytes,
            responseCeilingBytes,
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
          maxBytes: requestedMaxBytes,
          maxFindings,
          maxPreConsentRows,
          preConsentCookiesTrackers,
          report,
          requestedMaxBytes,
          responseCeilingBytes,
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
    async ({ scanId }: ExportFindingsInput, extra: McpRequestExtra) => {
      const client = clientForRequest(extra);
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
    async ({ limit, offset, scanId }: ListFindingsInput, extra: McpRequestExtra) => {
      const client = clientForRequest(extra);
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
    async ({ maxRows, scanId }: GetPreConsentCookiesTrackersInput, extra: McpRequestExtra) => {
      const client = clientForRequest(extra);
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
    async ({ scanId, findingId }: ExplainFindingInput, extra: McpRequestExtra) => {
      const client = clientForRequest(extra);
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
    async ({ domain, scanFrom }: GetLatestDomainScanInput, extra: McpRequestExtra) => {
      const client = clientForRequest(extra);
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
    async ({ domain, maxRows, scanFrom }: GetLatestDomainPreConsentCookiesTrackersInput, extra: McpRequestExtra) => {
      const client = clientForRequest(extra);
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

  server.server.setRequestHandler = registerRequest;
  return server;
}
