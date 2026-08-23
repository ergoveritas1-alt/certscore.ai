import { z } from "zod";

const optionalUuid = z.preprocess((value) => value === "" ? undefined : value, z.string().uuid().optional());
const optionalUrl = z.preprocess((value) => value === "" ? undefined : value, z.string().url().optional());

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3004),
  CERTSCORE_BASE_URL: z.string().url().default("https://certscore.ai"),
  OAUTH_ISSUER: z.string().url().default("https://certscore.ai"),
  MCP_PUBLIC_URL: z.string().url().default("https://mcp.certscore.ai"),
  CERTSCORE_OAUTH_JWT_SECRET: z.string().min(16).optional(),
  JWT_SIGNING_KEY: z.string().min(16).optional(),
  CERTSCORE_OAUTH_JWT_KEY_ID: z.string().optional(),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(1800),
  SESSION_MAX_COUNT: z.coerce.number().int().positive().default(500),
  CORS_ALLOWED_ORIGINS: z.string().optional(),
  CERTSCORE_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
  CERTSCORE_MICROSOFT_MCP_ENABLED: z.enum(["0", "1"]).default("0"),
  CERTSCORE_MICROSOFT_TENANT_ID: optionalUuid,
  CERTSCORE_MICROSOFT_RESOURCE_AUDIENCE: optionalUuid,
  CERTSCORE_MICROSOFT_ALLOWED_CLIENT_ID: optionalUuid,
  CERTSCORE_MICROSOFT_REQUIRED_ROLE: z.string().trim().min(1).default("Mcp.Access"),
  CERTSCORE_MICROSOFT_JWKS_URL: optionalUrl
});

export type McpHttpEnv = ReturnType<typeof getEnv>;

export function getEnv() {
  const parsed = envSchema.parse(process.env);
  const jwtSecret = parsed.CERTSCORE_OAUTH_JWT_SECRET ?? parsed.JWT_SIGNING_KEY;
  if (!jwtSecret) {
    throw new Error("CERTSCORE_OAUTH_JWT_SECRET or JWT_SIGNING_KEY is required.");
  }
  const microsoftMcpEnabled = parsed.CERTSCORE_MICROSOFT_MCP_ENABLED === "1";
  if (microsoftMcpEnabled) {
    for (const name of [
      "CERTSCORE_MICROSOFT_TENANT_ID",
      "CERTSCORE_MICROSOFT_RESOURCE_AUDIENCE",
      "CERTSCORE_MICROSOFT_ALLOWED_CLIENT_ID"
    ] as const) {
      if (!parsed[name]) {
        throw new Error(`${name} is required when CERTSCORE_MICROSOFT_MCP_ENABLED=1.`);
      }
    }
    if (parsed.CERTSCORE_MICROSOFT_JWKS_URL && parsed.NODE_ENV !== "test") {
      const expected = `https://login.microsoftonline.com/${parsed.CERTSCORE_MICROSOFT_TENANT_ID}/discovery/v2.0/keys`;
      if (parsed.CERTSCORE_MICROSOFT_JWKS_URL !== expected) {
        throw new Error("CERTSCORE_MICROSOFT_JWKS_URL may only override the tenant JWKS endpoint in NODE_ENV=test.");
      }
    }
  }
  return {
    ...parsed,
    jwtSecret,
    microsoftMcpEnabled
  };
}
export function getAllowedOrigins(env: Pick<McpHttpEnv, "CORS_ALLOWED_ORIGINS">) {
  return new Set(
    [
      "https://claude.ai",
      "https://api.anthropic.com",
      ...(env.CORS_ALLOWED_ORIGINS ?? "")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean)
    ]
  );
}
