import { createHmac, randomUUID } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";
import shared from "@website-signal-risk-scanner/shared";
import type { McpActivationStage, McpTelemetryEvent, McpTelemetrySurface } from "@website-signal-risk-scanner/shared";
import { projectMcpToolInvocationObservation, type McpToolInvocationObservation } from "@certscore/mcp/server";
import type { AnonymousRequesterNetwork } from "@website-signal-risk-scanner/shared";

const {
  MCP_CALLER_ATTRIBUTION_RULESET_VERSION,
  MCP_TELEMETRY_INTEGRATION,
  mcpActivationEventSchema,
  mcpTelemetryEndpoint,
  mcpTelemetryEventSchema,
} = shared;

type TelemetryLogger = Pick<Console, "error">;

type LightMcpClientContext = {
  actorId: string | null;
  attributionConfidence: McpTelemetryEvent["attributionConfidence"];
  attributionRulesetVersion: McpTelemetryEvent["attributionRulesetVersion"];
  attributionSignals: McpTelemetryEvent["attributionSignals"];
  authClass: McpTelemetryEvent["authClass"];
  callerProduct: McpTelemetryEvent["callerProduct"];
  clientFamily: McpTelemetryEvent["clientFamily"];
  clientName: string | null;
  executionChannel: McpTelemetryEvent["executionChannel"];
  installationOrigin: McpTelemetryEvent["installationOrigin"];
  source: McpTelemetryEvent["source"];
  sourceAttribution: McpTelemetryEvent["sourceAttribution"];
};

type CreateHostedMcpTelemetryInput = {
  authenticatedActorId?: string | null;
  authenticatedActorBinding?: string | null;
  authenticatedOrganizationId?: string | null;
  authenticatedUserId?: string | null;
  baseUrl: string;
  clientInfoBody?: unknown;
  fetch?: typeof fetch;
  headers: IncomingHttpHeaders;
  logger?: TelemetryLogger;
  requesterBinding?: string | null;
  requesterIp?: string | null;
  requesterNetwork?: AnonymousRequesterNetwork;
  secret: string;
  sessionId: () => string | null;
  surface: McpTelemetrySurface;
};

type ToolRequestContext = {
  requesterIp?: string | null;
  requesterNetwork?: AnonymousRequesterNetwork;
};

function firstHeader(headers: IncomingHttpHeaders, name: string) {
  const value = headers[name];
  return Array.isArray(value) ? value[0]?.trim() || null : value?.trim() || null;
}

function hashOpaque(secret: string, namespace: string, value: string | null | undefined) {
  if (!value) return null;
  return createHmac("sha256", secret)
    .update(`mcp-telemetry:v1:${namespace}:${value}`, "utf8")
    .digest("hex")
    .slice(0, 24);
}

function declaredClientName(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const params = (body as Record<string, unknown>).params;
  if (!params || typeof params !== "object" || Array.isArray(params)) return null;
  const meta = (params as Record<string, unknown>)._meta;
  const perRequestClientInfo = meta && typeof meta === "object" && !Array.isArray(meta)
    ? (meta as Record<string, unknown>)["io.modelcontextprotocol/clientInfo"]
    : null;
  const clientInfo = (params as Record<string, unknown>).clientInfo ?? perRequestClientInfo;
  if (!clientInfo || typeof clientInfo !== "object" || Array.isArray(clientInfo)) return null;
  const name = (clientInfo as Record<string, unknown>).name;
  if (typeof name !== "string") return null;
  const normalized = name.trim().toLowerCase()
    .replace(/[^a-z0-9 ._:/+@()-]+/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 100)
    .trim();
  return normalized || null;
}

function clientFamily(name: string | null): McpTelemetryEvent["clientFamily"] {
  if (!name) return "unknown";
  if (/codex/i.test(name)) return "openai_codex";
  if (/chatgpt|openai/i.test(name)) return "openai_chatgpt";
  if (/claude[\s._-]*code/i.test(name)) return "anthropic_claude_code";
  if (/claude|anthropic/i.test(name)) return "anthropic_claude";
  if (/gemini/i.test(name)) return "google_gemini_cli";
  if (/grok|\bxai\b/i.test(name)) return "xai_grok";
  return "other";
}

function callerProduct(family: McpTelemetryEvent["clientFamily"]): McpTelemetryEvent["callerProduct"] {
  if (family === "openai_chatgpt") return "chatgpt";
  if (family === "openai_codex") return "codex";
  if (family === "anthropic_claude") return "claude";
  if (family === "anthropic_claude_code") return "claude_code";
  if (family === "google_gemini_cli") return "gemini_cli";
  if (family === "xai_grok") return "grok";
  return family === "other" ? "other" : "unknown";
}

function declaredProvider(family: McpTelemetryEvent["clientFamily"]): McpTelemetryEvent["source"] {
  if (family === "openai_chatgpt" || family === "openai_codex") return "openai";
  if (family === "anthropic_claude" || family === "anthropic_claude_code") return "anthropic";
  if (family === "google_gemini_cli") return "google";
  if (family === "xai_grok") return "xai";
  return "unknown";
}

export function classifyHostedMcpClient(input: {
  authenticatedActorId?: string | null;
  authenticatedActorBinding?: string | null;
  clientInfoBody?: unknown;
  headers: IncomingHttpHeaders;
  requesterBinding?: string | null;
  requesterNetwork?: AnonymousRequesterNetwork;
  secret: string;
  surface: McpTelemetrySurface;
}): LightMcpClientContext {
  const conversationId = firstHeader(input.headers, "openai-conversation-id");
  const ephemeralUserId = firstHeader(input.headers, "openai-ephemeral-user-id");
  const family = clientFamily(declaredClientName(input.clientInfoBody));
  const hasOpenAiHeaderClaim = Boolean(conversationId || ephemeralUserId);
  const verifiedAnthropic = input.requesterNetwork === "anthropic";
  const source = verifiedAnthropic
    ? "anthropic"
    : hasOpenAiHeaderClaim
      ? "openai"
      : declaredProvider(family);
  const sourceAttribution = verifiedAnthropic
    ? "verified_network"
    : hasOpenAiHeaderClaim
      ? "self_declared_header"
      : family !== "unknown" && family !== "other"
        ? "self_declared_client"
        : "unknown";
  const actorSource = input.authenticatedActorBinding
    ?? ephemeralUserId
    ?? (verifiedAnthropic ? null : input.requesterBinding);

  const attributionSignals: McpTelemetryEvent["attributionSignals"] = [];
  if (verifiedAnthropic) attributionSignals.push("anthropic_connector_network");
  if (family !== "unknown") attributionSignals.push("declared_client_info");
  if (hasOpenAiHeaderClaim) attributionSignals.push("openai_header_claim");
  const networkAndDeclarationAgree = verifiedAnthropic
    && (family === "anthropic_claude" || family === "anthropic_claude_code");
  const attributionConfidence: McpTelemetryEvent["attributionConfidence"] = networkAndDeclarationAgree
    ? "corroborated"
    : verifiedAnthropic || hasOpenAiHeaderClaim
      ? "inferred"
      : family !== "unknown"
        ? "declared"
        : "unknown";
  const product = verifiedAnthropic && family === "unknown" ? "claude" : callerProduct(family);

  return {
    actorId: input.authenticatedActorId && /^[a-f0-9]{24}$/.test(input.authenticatedActorId)
      ? input.authenticatedActorId
      : hashOpaque(input.secret, "actor", actorSource),
    attributionConfidence,
    attributionRulesetVersion: MCP_CALLER_ATTRIBUTION_RULESET_VERSION,
    attributionSignals,
    authClass: input.surface === "mcp_authenticated" ? "authenticated" : "anonymous",
    callerProduct: product,
    clientFamily: verifiedAnthropic && family === "unknown" ? "anthropic_claude" : family,
    clientName: declaredClientName(input.clientInfoBody),
    executionChannel: verifiedAnthropic ? "hosted_connector" : product === "codex" || product === "claude_code" || product === "gemini_cli" ? "desktop_cli" : "unknown",
    installationOrigin: "unknown",
    source,
    sourceAttribution,
  };
}

function requesterIpHash(secret: string, value: string | null | undefined) {
  if (!value) return null;
  return createHmac("sha256", secret)
    .update(`mcp-telemetry:v1:requester-ip:${value}`, "utf8")
    .digest("hex");
}

function telemetrySignature(secret: string, timestamp: string, body: string) {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${body}`, "utf8")
    .digest("base64url");
}

function sanitizedTransportToolName(value: string) {
  return /^[a-zA-Z0-9_.:-]{1,100}$/.test(value) ? value : "unknown_tool";
}

function parsedToolArguments(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return {};
  const params = (body as Record<string, unknown>).params;
  if (!params || typeof params !== "object" || Array.isArray(params)) return {};
  const args = (params as Record<string, unknown>).arguments;
  return args && typeof args === "object" && !Array.isArray(args) ? args as Record<string, unknown> : {};
}

export function createHostedMcpTelemetry(input: CreateHostedMcpTelemetryInput) {
  const fetchImpl = input.fetch ?? globalThis.fetch;
  const logger = input.logger ?? console;
  const client = classifyHostedMcpClient(input);
  const conversationId = firstHeader(input.headers, "openai-conversation-id");
  const ingestionUrl = new URL("/api/internal/mcp-telemetry", input.baseUrl);
  const sentActivationStages = new Set<McpActivationStage>();

  const deliver = (event: { eventId: string }, context: { stage?: string; toolName?: string }) => {
    const body = JSON.stringify(event);
    const timestamp = String(Math.floor(Date.now() / 1_000));
    void Promise.resolve().then(() => fetchImpl(ingestionUrl, {
        body,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "x-certscore-mcp-telemetry-proof": telemetrySignature(input.secret, timestamp, body),
          "x-certscore-mcp-telemetry-timestamp": timestamp,
        },
        method: "POST",
        signal: AbortSignal.timeout(1_500),
      })).then((response) => {
      if (!response.ok) throw new Error(`Telemetry ingestion returned HTTP ${response.status}.`);
    }).catch((error) => {
      logger.error(JSON.stringify({
        event: "mcp.telemetry_write_failed",
        errorName: error instanceof Error ? error.name : "UnknownError",
        stage: context.stage ?? null,
        surface: input.surface,
        toolName: context.toolName ?? null,
      }));
    });
  };

  const reportActivation = (stage: McpActivationStage) => {
    if (!input.authenticatedUserId || !client.actorId) return;
    if (sentActivationStages.has(stage)) return;
    const parsed = mcpActivationEventSchema.safeParse({
      actorId: client.actorId,
      callerProduct: client.callerProduct,
      clientName: client.clientName,
      eventId: randomUUID(),
      eventType: "activation",
      occurredAt: new Date().toISOString(),
      organizationId: input.authenticatedOrganizationId ?? null,
      source: client.source,
      stage,
      userId: input.authenticatedUserId,
    });
    if (!parsed.success) {
      logger.error(JSON.stringify({
        event: "mcp.activation_event_rejected",
        issues: parsed.error.issues.map((issue) => ({ code: issue.code, path: issue.path.join(".") })).slice(0, 8),
        stage,
        surface: input.surface,
      }));
      return;
    }
    sentActivationStages.add(stage);
    deliver(parsed.data, { stage });
  };

  const report = (observation: Omit<McpToolInvocationObservation, "transportOutcome"> & {
    transportOutcome: McpTelemetryEvent["transportOutcome"];
  }, requestContext?: ToolRequestContext) => {
    const sessionValue = conversationId ?? input.sessionId();
    const eventRequesterIp = requestContext?.requesterIp ?? input.requesterIp ?? null;
    const parsed = mcpTelemetryEventSchema.safeParse({
      actorId: client.actorId,
      attributionConfidence: client.attributionConfidence,
      attributionRulesetVersion: client.attributionRulesetVersion,
      attributionSignals: client.attributionSignals,
      authClass: client.authClass,
      callerProduct: client.callerProduct,
      clientName: client.clientName,
      clientFamily: client.clientFamily,
      durationMs: observation.durationMs,
      endpoint: mcpTelemetryEndpoint(input.surface),
      errorCode: observation.errorCode,
      eventId: randomUUID(),
      freshness: observation.freshness,
      integration: MCP_TELEMETRY_INTEGRATION,
      executionChannel: client.executionChannel,
      installationOrigin: client.installationOrigin,
      isCanary: observation.isCanary,
      occurredAt: new Date().toISOString(),
      outcome: observation.outcome,
      quotaOutcome: observation.quotaOutcome,
      requestId: randomUUID(),
      requestedResource: observation.requestedResource,
      requestedResourceType: observation.requestedResourceType,
      requesterIp: eventRequesterIp,
      requesterIpHash: requesterIpHash(input.secret, eventRequesterIp),
      requesterNetwork: requestContext?.requesterNetwork ?? input.requesterNetwork ?? "unknown",
      scanDecision: observation.scanDecision,
      scanFrom: observation.scanFrom,
      scanId: observation.scanId,
      scanStatus: observation.scanStatus,
      sessionId: hashOpaque(input.secret, "session", sessionValue),
      source: client.source,
      sourceAttribution: client.sourceAttribution,
      surface: input.surface,
      targetHostname: observation.targetHostname,
      toolName: sanitizedTransportToolName(observation.toolName),
      transportOutcome: observation.transportOutcome,
    });
    if (!parsed.success) {
      logger.error(JSON.stringify({
        event: "mcp.telemetry_event_rejected",
        issues: parsed.error.issues.map((issue) => ({
          code: issue.code,
          keys: "keys" in issue ? issue.keys.slice(0, 8) : undefined,
          path: issue.path.join("."),
        })).slice(0, 8),
        surface: input.surface,
        toolName: sanitizedTransportToolName(observation.toolName),
      }));
      return;
    }
    deliver(parsed.data, { toolName: parsed.data.toolName });
    if (input.surface === "mcp_authenticated") {
      reportActivation("mcp_first_tool_invoked");
      if (observation.toolName === "certscore_scan_site") {
        reportActivation("mcp_scan_requested");
      }
    }
  };

  return {
    observeActivation(stage: McpActivationStage) {
      reportActivation(stage);
    },
    observeToolInvocation(observation: McpToolInvocationObservation, requestContext?: ToolRequestContext) {
      report(observation, requestContext);
    },
    observeTransportRateLimit(input: { body: unknown; durationMs: number; requesterIp?: string | null; requesterNetwork?: AnonymousRequesterNetwork; scanId?: string | null; toolName: string }) {
      const args = parsedToolArguments(input.body);
      const projected = projectMcpToolInvocationObservation({
        args,
        durationMs: input.durationMs,
        result: { isError: true, structuredContent: { error: { code: "rate_limited" }, status: "rate_limited" } },
        toolName: input.toolName,
      });
      report({
        ...projected,
        errorCode: "rate_limited",
        outcome: "rate_limited",
        quotaOutcome: "rate_limited",
        scanDecision: input.toolName === "certscore_scan_site" ? "unavailable" : "not_applicable",
        scanId: typeof input.scanId === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(input.scanId) ? input.scanId : projected.scanId,
        scanStatus: "rate_limited",
        transportOutcome: "http_429",
      }, { requesterIp: input.requesterIp, requesterNetwork: input.requesterNetwork });
    },
  };
}

export const mcpTelemetryTesting = {
  hashOpaque,
  telemetrySignature,
};
