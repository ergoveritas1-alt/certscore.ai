import { z } from "zod";

export const MCP_TELEMETRY_INTEGRATION = "certscore-mcp" as const;
export const MCP_TELEMETRY_RETENTION_DAYS = 90;

export const mcpTelemetrySurfaceSchema = z.enum([
  "mcp_light",
  "mcp_anonymous",
  "mcp_authenticated",
]);

export const mcpTelemetryEventSchema = z.object({
  actorId: z.string().regex(/^[a-f0-9]{24}$/).nullable(),
  authClass: z.enum(["anonymous", "authenticated"]),
  clientFamily: z.enum([
    "openai_chatgpt",
    "openai_codex",
    "anthropic_claude",
    "other",
    "unknown",
  ]),
  durationMs: z.number().int().min(0).max(3_600_000),
  endpoint: z.enum(["/mcp/light", "/mcp/anonymous", "/mcp"]),
  errorCode: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_.:-]+$/).nullable(),
  eventId: z.string().uuid(),
  freshness: z.enum(["latest", "refresh"]).nullable(),
  integration: z.literal(MCP_TELEMETRY_INTEGRATION),
  occurredAt: z.string().datetime(),
  outcome: z.enum(["success", "error", "rate_limited"]),
  quotaOutcome: z.enum(["allowed", "rate_limited", "not_applicable"]),
  requestId: z.string().uuid(),
  scanDecision: z.enum(["reused", "new", "unavailable", "not_applicable"]),
  scanFrom: z.enum(["eu_de", "eu_ie", "california"]).nullable(),
  scanId: z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/).nullable(),
  scanStatus: z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/).nullable(),
  sessionId: z.string().regex(/^[a-f0-9]{24}$/).nullable(),
  source: z.enum(["openai", "anthropic", "unknown"]),
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
}).strict();

export type McpTelemetryEvent = z.infer<typeof mcpTelemetryEventSchema>;
export type McpTelemetrySurface = z.infer<typeof mcpTelemetrySurfaceSchema>;

export function mcpTelemetryEndpoint(surface: McpTelemetrySurface): McpTelemetryEvent["endpoint"] {
  if (surface === "mcp_light") return "/mcp/light";
  if (surface === "mcp_anonymous") return "/mcp/anonymous";
  return "/mcp";
}
