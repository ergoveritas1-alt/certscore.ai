import { createHmac, randomUUID } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";
import shared from "@website-signal-risk-scanner/shared";
import type { McpTelemetryEvent, McpTelemetrySurface } from "@website-signal-risk-scanner/shared";
import type { McpToolInvocationObservation } from "@certscore/mcp/server";
import type { AnonymousRequesterNetwork } from "@website-signal-risk-scanner/shared";

const { MCP_TELEMETRY_INTEGRATION, mcpTelemetryEndpoint, mcpTelemetryEventSchema } = shared;

type TelemetryLogger = Pick<Console, "error">;

type LightMcpClientContext = {
  actorId: string | null;
  authClass: McpTelemetryEvent["authClass"];
  clientFamily: McpTelemetryEvent["clientFamily"];
  source: McpTelemetryEvent["source"];
  sourceAttribution: McpTelemetryEvent["sourceAttribution"];
};

type CreateHostedMcpTelemetryInput = {
  authenticatedActorBinding?: string | null;
  baseUrl: string;
  clientInfoBody?: unknown;
  fetch?: typeof fetch;
  headers: IncomingHttpHeaders;
  logger?: TelemetryLogger;
  requesterBinding?: string | null;
  requesterNetwork?: AnonymousRequesterNetwork;
  secret: string;
  sessionId: () => string | null;
  surface: McpTelemetrySurface;
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
  const clientInfo = (params as Record<string, unknown>).clientInfo;
  if (!clientInfo || typeof clientInfo !== "object" || Array.isArray(clientInfo)) return null;
  const name = (clientInfo as Record<string, unknown>).name;
  return typeof name === "string" ? name.trim().toLowerCase().slice(0, 100) : null;
}

function clientFamily(name: string | null): McpTelemetryEvent["clientFamily"] {
  if (!name) return "unknown";
  if (/codex/i.test(name)) return "openai_codex";
  if (/chatgpt|openai/i.test(name)) return "openai_chatgpt";
  if (/claude|anthropic/i.test(name)) return "anthropic_claude";
  return "other";
}

export function classifyHostedMcpClient(input: {
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
    : hasOpenAiHeaderClaim || family === "openai_chatgpt" || family === "openai_codex"
      ? "openai"
      : family === "anthropic_claude"
        ? "anthropic"
        : "unknown";
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

  return {
    actorId: hashOpaque(input.secret, "actor", actorSource),
    authClass: input.surface === "mcp_authenticated" ? "authenticated" : "anonymous",
    clientFamily: verifiedAnthropic && family === "unknown" ? "anthropic_claude" : family,
    source,
    sourceAttribution,
  };
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

function isCertScoreCanaryUrl(value: unknown) {
  if (typeof value !== "string") return false;
  try {
    const parsed = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return parsed.pathname.startsWith("/.well-known/certscore-canary/");
  } catch {
    return false;
  }
}

export function createHostedMcpTelemetry(input: CreateHostedMcpTelemetryInput) {
  const fetchImpl = input.fetch ?? globalThis.fetch;
  const logger = input.logger ?? console;
  const client = classifyHostedMcpClient(input);
  const conversationId = firstHeader(input.headers, "openai-conversation-id");
  const ingestionUrl = new URL("/api/internal/mcp-telemetry", input.baseUrl);

  const report = (observation: Omit<McpToolInvocationObservation, "transportOutcome"> & {
    transportOutcome: McpTelemetryEvent["transportOutcome"];
  }) => {
    const sessionValue = conversationId ?? input.sessionId();
    const parsed = mcpTelemetryEventSchema.safeParse({
      actorId: client.actorId,
      authClass: client.authClass,
      clientFamily: client.clientFamily,
      durationMs: observation.durationMs,
      endpoint: mcpTelemetryEndpoint(input.surface),
      errorCode: observation.errorCode,
      eventId: randomUUID(),
      freshness: observation.freshness,
      integration: MCP_TELEMETRY_INTEGRATION,
      isCanary: observation.isCanary,
      occurredAt: new Date().toISOString(),
      outcome: observation.outcome,
      quotaOutcome: observation.quotaOutcome,
      requestId: randomUUID(),
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
        surface: input.surface,
        toolName: sanitizedTransportToolName(observation.toolName),
      }));
      return;
    }
    const event = parsed.data;
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
        surface: input.surface,
        toolName: event.toolName,
      }));
    });
  };

  return {
    observeToolInvocation(observation: McpToolInvocationObservation) {
      report(observation);
    },
    observeTransportRateLimit(input: { body: unknown; durationMs: number; scanId?: string | null; toolName: string }) {
      const args = parsedToolArguments(input.body);
      report({
        durationMs: input.durationMs,
        errorCode: "rate_limited",
        freshness: args.freshness === "refresh" ? "refresh" : input.toolName === "certscore_scan_site" ? "latest" : null,
        isCanary: isCertScoreCanaryUrl(args.url),
        outcome: "rate_limited",
        quotaOutcome: "rate_limited",
        scanDecision: input.toolName === "certscore_scan_site" ? "unavailable" : "not_applicable",
        scanFrom: args.scanFrom === "eu_de" || args.scanFrom === "eu_ie" || args.scanFrom === "california" ? args.scanFrom : null,
        scanId: typeof input.scanId === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(input.scanId) ? input.scanId : null,
        scanStatus: "rate_limited",
        targetHostname: null,
        toolName: input.toolName,
        transportOutcome: "http_429",
      });
    },
  };
}

export const mcpTelemetryTesting = {
  hashOpaque,
  telemetrySignature,
};
