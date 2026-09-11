import { mcpResponseSummarySchema } from "./mcp-response-summary";
import { mcpCallerInputSchema } from "./mcp-caller-input";
import { z } from "zod";
import { mcpTaskContextSchema, sanitizeMcpTaskContext } from "./mcp-product-context";

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

const telemetryOption = z.string().regex(/^[a-zA-Z0-9_.:-]+$/).max(128);
const telemetryCount = z.number().int().min(0).max(1_000_000);
export const mcpRequestDetailsSchema = z.object({
  version: z.literal(1),
  callerInput: mcpCallerInputSchema.optional(),
  captureBasis: z.enum(["protocol_request", "validated_arguments"]).optional(),
  taskContext: mcpTaskContextSchema.refine(value => JSON.stringify(value) === JSON.stringify(sanitizeMcpTaskContext(value)), "Question context must be sanitized before ingestion.").optional(),
  clientVersion: telemetryOption.optional(),
  timing: z.object({ startedAt: z.string().datetime(), responseGeneratedAt: z.string().datetime() }).strict().optional(),
  serverVersion: telemetryOption.optional(),
  serverRevision: z.string().regex(/^[a-f0-9]{40}$/).optional(),
  toolSchemaVersion: telemetryOption.optional(),
  response: z.object({
    bytes: z.number().int().min(0).max(10_000_000).nullable(),
    truncated: z.boolean().nullable(),
    effectiveMaxBytes: telemetryCount.optional(),
    summary: mcpResponseSummarySchema.optional(),
  }).strict().optional(),
  arguments: z.object({
    url: z.string().url().max(512).refine((value) => {
      try {
        const url = new URL(value);
        return ["http:", "https:"].includes(url.protocol) && value === url.origin;
      } catch { return false; }
    }).optional(),
    domain: z.string().max(253).regex(/^[a-z0-9.-]+$/).optional(),
    scanId: telemetryOption.optional(), jobId: telemetryOption.optional(), findingId: telemetryOption.optional(),
    freshness: z.enum(["latest", "refresh"]).optional(),
    scanFrom: z.enum(["eu_de", "eu_ie", "california"]).optional(),
    detail: z.enum(["tiny", "quick", "standard", "full", "summary", "evidence", "findings"]).optional(),
    format: z.enum(["json", "markdown"]).optional(),
    waitForCompletion: z.boolean().optional(),
    maxWaitSeconds: telemetryCount.optional(), maxBytes: telemetryCount.optional(),
    maxFindings: telemetryCount.optional(), maxPreConsentRows: telemetryCount.optional(),
    maxRows: telemetryCount.optional(), limit: telemetryCount.optional(), offset: telemetryCount.optional(),
  }).strict(),
  argumentsOmitted: z.boolean(),
  actorBasis: z.enum(["authenticated", "provider_ephemeral", "requester_binding", "unavailable"]),
  sessionBasis: z.enum(["provider_conversation", "mcp_session", "unavailable"]),
  rateLimit: z.object({
    kind: z.enum(["mcp_read", "scan_creation", "upstream"]),
    scope: telemetryOption.optional(), windowId: telemetryOption.optional(),
    profile: telemetryOption.optional(), policyVersion: telemetryOption.optional(),
    limit: telemetryCount.optional(), used: telemetryCount.optional(),
    requested: telemetryCount.optional(), windowSeconds: telemetryCount.optional(),
    retryAfterSeconds: telemetryCount.optional(),
  }).strict().nullable(),
}).strict();
export type McpRequestDetails = z.infer<typeof mcpRequestDetailsSchema>;

// PostgreSQL enforces 4096 bytes on the entire jsonb value, including its spaces.
// Pretty JSON is a conservative upper bound on that serialization's size.
export function boundMcpRequestDetails(input: McpRequestDetails): McpRequestDetails {
  const details: McpRequestDetails = { ...input, arguments: { ...input.arguments },
    ...(input.response ? { response: { ...input.response, ...(input.response.summary ? { summary: { ...input.response.summary } } : {}) } } : {}),
    ...(input.callerInput ? { callerInput: { ...input.callerInput, fields: [...input.callerInput.fields], limits: [...input.callerInput.limits] } } : {}) };
  const bytes = () => new TextEncoder().encode(JSON.stringify(details, null, 1)).length;
  while (bytes() > 4096 && details.callerInput?.fields.length) {
    details.callerInput.fields.pop();
    if (!details.callerInput.limits.includes("byte_limit")) details.callerInput.limits.push("byte_limit");
  }
  // Retain context/reasons even if a legacy argument set consumes the envelope.
  for (const key of Object.keys(details.arguments)) {
    if (bytes() <= 4096) break;
    delete (details.arguments as Record<string, unknown>)[key]; details.argumentsOmitted = true;
  }
  for (const key of ["recommendedNextAction", "message", "issues"] as const) {
    if (bytes() <= 4096 || !details.response?.summary) break;
    delete details.response.summary[key];
    details.response.summary.summaryTruncated = true;
    details.response.summary.textOmitted = true;
  }
  if (bytes() > 4096 && details.response) delete details.response.summary;
  return details;
}

export const mcpTelemetryEventSchema = z.object({
  requestDetails: mcpRequestDetailsSchema.nullable().optional(),
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
