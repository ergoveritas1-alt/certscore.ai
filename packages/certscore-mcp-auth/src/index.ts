import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const CERTSCORE_OAUTH_READ_SCOPE = "scan:read";
export const CERTSCORE_OAUTH_CREATE_SCOPE = "scan:create";
export const CERTSCORE_OAUTH_MCP_SCOPE = "mcp";
export const CERTSCORE_OAUTH_SUPPORTED_SCOPES = [
  CERTSCORE_OAUTH_READ_SCOPE,
  CERTSCORE_OAUTH_CREATE_SCOPE,
  CERTSCORE_OAUTH_MCP_SCOPE
] as const;

export type CertScoreOAuthScope = (typeof CERTSCORE_OAUTH_SUPPORTED_SCOPES)[number];
export type CertScoreIntegrationScope = "pulse:read" | "pulse:scan" | "mcp";

export type CertScoreAccessTokenClaims = {
  aud: string;
  client_id: string;
  exp: number;
  iat: number;
  iss: string;
  jti: string;
  scope: string;
  sub: string;
  certscore: {
    organizationId: string | null;
    scopes: CertScoreIntegrationScope[];
    source: "mcp-oauth";
    userId: string | null;
  };
};

const accessTokenClaimsSchema = z.object({
  aud: z.string().min(1),
  client_id: z.string().min(1),
  exp: z.number().int().positive(),
  iat: z.number().int().positive(),
  iss: z.string().url(),
  jti: z.string().min(12),
  scope: z.string(),
  sub: z.string().min(1),
  certscore: z.object({
    organizationId: z.string().nullable(),
    scopes: z.array(z.enum(["pulse:read", "pulse:scan", "mcp"])),
    source: z.literal("mcp-oauth"),
    userId: z.string().nullable()
  })
});

const accessTokenHeaderSchema = z.object({
  alg: z.literal("HS256"),
  typ: z.literal("JWT"),
  kid: z.string().min(1).max(128).optional()
});

const MAX_ACCESS_TOKEN_CHARS = 16_384;
const MAX_IAT_CLOCK_SKEW_SECONDS = 60;

function base64UrlEncode(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

function base64UrlDecodeJson(value: string) {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
}

function sign(message: string, secret: string) {
  return createHmac("sha256", secret).update(message).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function generateOpaqueToken(prefix: string) {
  return `${prefix}_${randomBytes(32).toString("base64url")}`;
}

export function normalizeOAuthScopes(value: string | string[] | undefined | null): CertScoreOAuthScope[] {
  const raw = Array.isArray(value) ? value.join(" ") : value ?? "";
  const scopes = raw
    .split(/\s+/)
    .map((scope) => scope.trim())
    .filter(Boolean)
    .filter((scope): scope is CertScoreOAuthScope => CERTSCORE_OAUTH_SUPPORTED_SCOPES.includes(scope as CertScoreOAuthScope));
  const unique = Array.from(new Set(scopes));
  return unique.length > 0 ? unique : [CERTSCORE_OAUTH_READ_SCOPE, CERTSCORE_OAUTH_MCP_SCOPE];
}

export function oauthScopeString(scopes: readonly string[]) {
  return Array.from(new Set(scopes)).join(" ");
}

export function mapOAuthScopesToIntegrationScopes(scopes: readonly string[]): CertScoreIntegrationScope[] {
  const normalized = normalizeOAuthScopes([...scopes]);
  const mapped = new Set<CertScoreIntegrationScope>(["mcp"]);
  if (normalized.includes(CERTSCORE_OAUTH_READ_SCOPE) || normalized.includes(CERTSCORE_OAUTH_CREATE_SCOPE)) {
    mapped.add("pulse:read");
  }
  if (normalized.includes(CERTSCORE_OAUTH_CREATE_SCOPE)) {
    mapped.add("pulse:scan");
  }
  return Array.from(mapped);
}

export function signCertScoreAccessToken(input: {
  audience: string;
  clientId: string;
  expiresInSeconds?: number;
  issuer: string;
  jwtKeyId?: string;
  jwtSecret: string;
  organizationId: string | null;
  scopes: readonly string[];
  subject: string;
  userId: string | null;
}) {
  const now = Math.floor(Date.now() / 1000);
  const normalizedScopes = normalizeOAuthScopes([...input.scopes]);
  const claims: CertScoreAccessTokenClaims = {
    aud: input.audience,
    client_id: input.clientId,
    exp: now + (input.expiresInSeconds ?? 3600),
    iat: now,
    iss: input.issuer,
    jti: randomBytes(16).toString("base64url"),
    scope: oauthScopeString(normalizedScopes),
    sub: input.subject,
    certscore: {
      organizationId: input.organizationId,
      scopes: mapOAuthScopesToIntegrationScopes(normalizedScopes),
      source: "mcp-oauth",
      userId: input.userId
    }
  };
  const header = {
    alg: "HS256",
    typ: "JWT",
    ...(input.jwtKeyId ? { kid: input.jwtKeyId } : {})
  };
  const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(claims))}`;
  return `${signingInput}.${sign(signingInput, input.jwtSecret)}`;
}

export function verifyCertScoreAccessToken(input: {
  audience: string;
  issuer: string;
  jwtSecret: string;
  nowSeconds?: number;
  token: string;
}) {
  if (!input.token || input.token.length > MAX_ACCESS_TOKEN_CHARS) {
    return { ok: false as const, reason: "malformed" as const };
  }
  const parts = input.token.split(".");
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    return { ok: false as const, reason: "malformed" as const };
  }
  const signingInput = `${parts[0]}.${parts[1]}`;
  const expected = sign(signingInput, input.jwtSecret);
  if (!safeEqual(parts[2], expected)) {
    return { ok: false as const, reason: "bad_signature" as const };
  }
  let claims: CertScoreAccessTokenClaims;
  try {
    accessTokenHeaderSchema.parse(base64UrlDecodeJson(parts[0]));
    claims = accessTokenClaimsSchema.parse(base64UrlDecodeJson(parts[1]));
  } catch {
    return { ok: false as const, reason: "invalid_claims" as const };
  }
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (claims.iss !== input.issuer || claims.aud !== input.audience) {
    return { ok: false as const, reason: "wrong_issuer_or_audience" as const };
  }
  if (claims.exp <= now) {
    return { ok: false as const, reason: "expired" as const };
  }
  if (claims.iat > now + MAX_IAT_CLOCK_SKEW_SECONDS || claims.exp <= claims.iat) {
    return { ok: false as const, reason: "invalid_claims" as const };
  }
  return { ok: true as const, claims };
}
