import { z } from "zod";

export const MCP_TELEMETRY_INTEGRATION = "certscore-mcp" as const;
export const MCP_TELEMETRY_RETENTION_DAYS = 90;
export const MCP_CALLER_ATTRIBUTION_RULESET_VERSION = "2026-08-20.1" as const;

export const mcpCallerProviderSchema = z.enum([
  "openai",
  "anthropic",
  "google",
  "xai",
  "other",
  "unknown",
]);

export const mcpCallerProductSchema = z.enum([
  "chatgpt",
  "codex",
  "claude",
  "claude_code",
  "gemini_cli",
  "grok",
  "other",
  "unknown",
]);

export const mcpCallerConfidenceSchema = z.enum([
  "verified",
  "corroborated",
  "declared",
  "inferred",
  "unknown",
]);

export const mcpCallerExecutionChannelSchema = z.enum([
  "hosted_connector",
  "api_managed_mcp",
  "desktop_cli",
  "custom_mcp",
  "unknown",
]);

export const mcpInstallationOriginSchema = z.enum([
  "openai_directory",
  "anthropic_directory",
  "xai_catalog",
  "direct",
  "unknown",
]);

export const mcpAttributionSignalSchema = z.enum([
  "anthropic_connector_network",
  "declared_client_info",
  "openai_header_claim",
]);

export const mcpTelemetrySurfaceSchema = z.enum([
  "mcp_light",
  "mcp_anonymous",
  "mcp_authenticated",
]);

export const mcpActivationStageSchema = z.enum([
  "mcp_initialized",
  "mcp_tools_listed",
  "mcp_first_tool_invoked",
  "mcp_scan_requested",
]);

export const mcpActivationEventSchema = z.object({
  actorId: z.string().regex(/^[a-f0-9]{24}$/).nullable(),
  authClass: z.enum(["anonymous", "authenticated"]),
  attributionConfidence: mcpCallerConfidenceSchema,
  attributionRulesetVersion: z.literal(MCP_CALLER_ATTRIBUTION_RULESET_VERSION),
  attributionSignals: z.array(mcpAttributionSignalSchema).max(8),
  callerProduct: mcpCallerProductSchema,
  clientFamily: z.enum([
    "openai_chatgpt",
    "openai_codex",
    "anthropic_claude",
    "anthropic_claude_code",
    "google_gemini_cli",
    "xai_grok",
    "other",
    "unknown",
  ]),
  clientName: z.string().min(1).max(100).regex(/^[a-zA-Z0-9][a-zA-Z0-9 ._:/+@()-]*$/).nullable(),
  eventId: z.string().uuid(),
  eventType: z.literal("activation"),
  executionChannel: mcpCallerExecutionChannelSchema,
  installationOrigin: mcpInstallationOriginSchema,
  occurredAt: z.string().datetime(),
  organizationId: z.string().uuid().nullable(),
  sessionId: z.string().regex(/^[a-f0-9]{24}$/).nullable(),
  source: mcpCallerProviderSchema,
  sourceAttribution: z.enum([
    "verified_network",
    "self_declared_header",
    "self_declared_client",
    "unknown",
  ]),
  stage: mcpActivationStageSchema,
  surface: mcpTelemetrySurfaceSchema,
  userId: z.string().uuid().nullable(),
}).strict().refine(
  (event) => Boolean(event.actorId || event.sessionId),
  { message: "Activation requires an opaque actor or session identity.", path: ["actorId"] },
).refine(
  (event) => event.surface === "mcp_authenticated"
    ? event.authClass === "authenticated"
    : event.authClass === "anonymous" && event.organizationId === null && event.userId === null,
  { message: "Activation identity must match the hosted MCP surface.", path: ["authClass"] },
);

export const mcpTelemetryEventSchema = z.object({
  actorId: z.string().regex(/^[a-f0-9]{24}$/).nullable(),
  authClass: z.enum(["anonymous", "authenticated"]),
  clientName: z.string().min(1).max(100).regex(/^[a-zA-Z0-9][a-zA-Z0-9 ._:/+@()-]*$/).nullable(),
  clientFamily: z.enum([
    "openai_chatgpt",
    "openai_codex",
    "anthropic_claude",
    "anthropic_claude_code",
    "google_gemini_cli",
    "xai_grok",
    "other",
    "unknown",
  ]),
  attributionConfidence: mcpCallerConfidenceSchema,
  attributionRulesetVersion: z.literal(MCP_CALLER_ATTRIBUTION_RULESET_VERSION),
  attributionSignals: z.array(mcpAttributionSignalSchema).max(8),
  callerProduct: mcpCallerProductSchema,
  executionChannel: mcpCallerExecutionChannelSchema,
  installationOrigin: mcpInstallationOriginSchema,
  durationMs: z.number().int().min(0).max(3_600_000),
  endpoint: z.enum(["/mcp/light", "/mcp/anonymous", "/mcp"]),
  errorCode: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_.:-]+$/).nullable(),
  eventId: z.string().uuid(),
  freshness: z.enum(["latest", "refresh"]).nullable(),
  integration: z.literal(MCP_TELEMETRY_INTEGRATION),
  isCanary: z.boolean(),
  occurredAt: z.string().datetime(),
  outcome: z.enum(["success", "error", "rate_limited"]),
  quotaOutcome: z.enum(["allowed", "rate_limited", "not_applicable"]),
  requestId: z.string().uuid(),
  requestedResource: z.string().min(1).max(512).nullable(),
  requestedResourceType: z.enum(["url", "domain", "scan_id", "job_id"]).nullable(),
  requesterIp: z.string().ip().nullable(),
  requesterIpHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  requesterNetwork: z.enum(["anthropic", "direct", "unknown"]),
  scanDecision: z.enum(["reused", "new", "unavailable", "not_applicable"]),
  scanFrom: z.enum(["eu_de", "eu_ie", "california"]).nullable(),
  scanId: z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/).nullable(),
  scanStatus: z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/).nullable(),
  sessionId: z.string().regex(/^[a-f0-9]{24}$/).nullable(),
  source: mcpCallerProviderSchema,
  sourceAttribution: z.enum([
    "verified_network",
    "self_declared_header",
    "self_declared_client",
    "unknown",
  ]),
  surface: mcpTelemetrySurfaceSchema,
  targetHostname: z.string().min(1).max(253).nullable(),
  toolName: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_.:-]+$/),
  transportOutcome: z.enum(["mcp_result", "mcp_error", "http_429"]),
}).strict().refine(
  (event) => Boolean(event.requestedResource) === Boolean(event.requestedResourceType),
  { message: "Requested resource and type must be retained together.", path: ["requestedResource"] },
).refine(
  (event) => Boolean(event.requesterIp) === Boolean(event.requesterIpHash),
  { message: "Requester IP and hash must be retained together.", path: ["requesterIp"] },
);

export type McpTelemetryEvent = z.infer<typeof mcpTelemetryEventSchema>;
export type McpActivationEvent = z.infer<typeof mcpActivationEventSchema>;
export type McpActivationStage = z.infer<typeof mcpActivationStageSchema>;
export type McpTelemetrySurface = z.infer<typeof mcpTelemetrySurfaceSchema>;

export function mcpTelemetryEndpoint(surface: McpTelemetrySurface): McpTelemetryEvent["endpoint"] {
  if (surface === "mcp_light") return "/mcp/light";
  if (surface === "mcp_anonymous") return "/mcp/anonymous";
  return "/mcp";
}
