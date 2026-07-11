import { z } from "zod";

const envSchema = z.object({
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
  CERTSCORE_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().optional()
});

export type McpHttpEnv = ReturnType<typeof getEnv>;

export function getEnv() {
  const parsed = envSchema.parse(process.env);
  const jwtSecret = parsed.CERTSCORE_OAUTH_JWT_SECRET ?? parsed.JWT_SIGNING_KEY;
  if (!jwtSecret) {
    throw new Error("CERTSCORE_OAUTH_JWT_SECRET or JWT_SIGNING_KEY is required.");
  }
  return {
    ...parsed,
    jwtSecret
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
