import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { query, queryOne } from "@website-signal-risk-scanner/db";
import {
  CERTSCORE_OAUTH_CREATE_SCOPE,
  generateOpaqueToken,
  mapOAuthScopesToIntegrationScopes,
  normalizeOAuthScopes,
  oauthScopeString,
  signCertScoreAccessToken,
  type CertScoreOAuthScope
} from "@certscore/mcp-auth";
import {
  normalizeMcpOAuthClientScopes,
  resolveMcpOAuthScopeRequest,
  type McpOAuthScopeResolution
} from "./mcp-oauth-scopes";

export { normalizeMcpOAuthClientScopes, resolveMcpOAuthScopeRequest, type McpOAuthScopeResolution };

export type McpOAuthClient = {
  clientId: string;
  clientName: string;
  redirectUris: string[];
  scope: CertScoreOAuthScope[];
  tokenEndpointAuthMethod: "none";
};

type McpOAuthClientRow = {
  client_id: string;
  client_name: string;
  redirect_uris: unknown;
  scope: string[];
  token_endpoint_auth_method: "none";
};

type AuthorizationCodeRow = {
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: "S256";
  scope: string[];
  organization_id: string | null;
  owner_user_id: string | null;
  expires_at: string;
  consumed_at: string | null;
};

type RefreshTokenRow = {
  client_id: string;
  family_id: string;
  scope: string[];
  organization_id: string | null;
  owner_user_id: string | null;
  expires_at: string;
  revoked_at: string | null;
};

type McpOAuthGrantContext = {
  clientId?: string | null;
  organizationId?: string | null;
  ownerUserId?: string | null;
};

const DEFAULT_ISSUER = "https://certscore.ai";
const DEFAULT_MCP_PUBLIC_URL = "https://mcp.certscore.ai";
const AUTHORIZATION_CODE_TTL_SECONDS = 10 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;
const DCR_IP_HOURLY_LIMIT = 30;
const DCR_UNUSED_CLIENT_TTL_DAYS = 30;

function hashToken(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function getMcpOAuthIssuer() {
  return process.env.OAUTH_ISSUER?.trim() || DEFAULT_ISSUER;
}

export function getMcpPublicUrl() {
  return process.env.MCP_PUBLIC_URL?.trim() || DEFAULT_MCP_PUBLIC_URL;
}

export function getMcpJwtSecret() {
  const secret = process.env.CERTSCORE_OAUTH_JWT_SECRET?.trim() || process.env.JWT_SIGNING_KEY?.trim();
  if (!secret) {
    throw new Error("CERTSCORE_OAUTH_JWT_SECRET or JWT_SIGNING_KEY is required for CertScore MCP OAuth tokens.");
  }
  return secret;
}

export async function hasMcpOAuthScanCreateGrant(context: McpOAuthGrantContext) {
  const clientId = context.clientId?.trim() || null;
  const organizationId = context.organizationId?.trim() || null;
  const ownerUserId = context.ownerUserId?.trim() || null;
  if (!clientId && !organizationId && !ownerUserId) {
    return false;
  }
  const row = await queryOne<{ allowed: true }>(
    `select true as allowed
       from mcp_oauth_scan_create_grants
      where revoked_at is null
        and (
          (grant_kind = 'client' and grantee_id = $1)
          or (grant_kind = 'organization' and grantee_id = $2)
          or (grant_kind = 'user' and grantee_id = $3)
        )
      limit 1`,
    [clientId, organizationId, ownerUserId],
    { readOnly: true }
  );
  return Boolean(row?.allowed);
}

export async function restrictMcpOAuthScopes(scopes: string[] | readonly string[], context: McpOAuthGrantContext = {}) {
  const normalized = normalizeMcpOAuthClientScopes(scopes);
  if (!normalized.includes(CERTSCORE_OAUTH_CREATE_SCOPE)) {
    return normalized;
  }
  if (await hasMcpOAuthScanCreateGrant(context)) {
    return normalized;
  }
  return normalized.filter((scope) => scope !== CERTSCORE_OAUTH_CREATE_SCOPE);
}

export async function resolveMcpOAuthRequestedScopes(input: {
  client: Pick<McpOAuthClient, "scope">;
  requestedScopes: readonly string[];
  context: McpOAuthGrantContext;
}) {
  const resolution = resolveMcpOAuthScopeRequest({
    clientScopes: input.client.scope,
    requestedScopes: input.requestedScopes,
    scanCreateGranted: await hasMcpOAuthScanCreateGrant(input.context)
  });
  if (resolution.downgradedScopes.length > 0) {
    console.info(
      JSON.stringify({
        event: "oauth_scope_downgraded",
        source: "mcp-oauth",
        clientId: input.context.clientId ?? null,
        organizationId: input.context.organizationId ?? null,
        ownerUserId: input.context.ownerUserId ?? null,
        droppedScopes: resolution.downgradedScopes
      })
    );
  }
  return resolution;
}

export function getRequesterIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",").at(0)?.trim();
  return forwardedFor || request.headers.get("x-real-ip")?.trim() || null;
}

export function hashRequester(value: string | null) {
  return value ? hashToken(value.trim().toLowerCase()) : null;
}

function normalizeRedirectUris(value: unknown) {
  const raw = Array.isArray(value) ? value : [];
  return raw
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .filter((uri) => {
      try {
        const parsed = new URL(uri);
        return parsed.protocol === "https:" || parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
      } catch {
        return false;
      }
    })
    .slice(0, 20);
}

function mapClient(row: McpOAuthClientRow): McpOAuthClient {
  return {
    clientId: row.client_id,
    clientName: row.client_name,
    redirectUris: normalizeRedirectUris(row.redirect_uris),
    scope: normalizeOAuthScopes(row.scope),
    tokenEndpointAuthMethod: row.token_endpoint_auth_method
  };
}

export async function checkDynamicClientRegistrationLimit(requesterIpHash: string | null) {
  if (!requesterIpHash) {
    return { allowed: true as const };
  }
  const row = await queryOne<{ registration_count: number | string }>(
    `select count(*)::int as registration_count
       from mcp_oauth_clients
      where requester_ip_hash = $1
        and created_at > timezone('utc', now()) - interval '1 hour'`,
    [requesterIpHash]
  );
  const count = Number(row?.registration_count ?? 0);
  return count >= DCR_IP_HOURLY_LIMIT ? { allowed: false as const, retryAfterSeconds: 3600 } : { allowed: true as const };
}

export async function cleanupUnusedMcpOAuthClients() {
  await query(
    `delete from mcp_oauth_clients clients
      where clients.created_at < timezone('utc', now()) - ($1::int * interval '1 day')
        and clients.last_used_at is null
        and not exists (
          select 1
            from mcp_oauth_authorization_codes codes
           where codes.client_id = clients.client_id
        )
        and not exists (
          select 1
            from mcp_oauth_refresh_tokens tokens
           where tokens.client_id = clients.client_id
        )`,
    [DCR_UNUSED_CLIENT_TTL_DAYS]
  ).catch((error) => console.error("[mcp-oauth] unused client cleanup failed", error));
}

export async function registerMcpOAuthClient(input: {
  clientName: string;
  redirectUris: string[];
  requestedScopes: string[];
  requesterIpHash: string | null;
}) {
  const clientId = `mcp_client_${randomBytes(18).toString("base64url")}`;
  const scopes = normalizeMcpOAuthClientScopes(input.requestedScopes);
  await query(
    `insert into mcp_oauth_clients (
       client_id, client_name, redirect_uris, scope, requester_ip_hash
     )
     values ($1, $2, $3::jsonb, $4, $5)`,
    [clientId, input.clientName, JSON.stringify(input.redirectUris), scopes, input.requesterIpHash]
  );
  return { clientId, scopes };
}

export async function getMcpOAuthClient(clientId: string) {
  const row = await queryOne<McpOAuthClientRow>(
    `select client_id, client_name, redirect_uris, scope, token_endpoint_auth_method
       from mcp_oauth_clients
      where client_id = $1
      limit 1`,
    [clientId],
    { readOnly: true }
  );
  return row ? mapClient(row) : null;
}

export function redirectUriAllowed(client: McpOAuthClient, redirectUri: string) {
  return client.redirectUris.includes(redirectUri);
}

export async function createAuthorizationCode(input: {
  clientId: string;
  codeChallenge: string;
  organizationId: string | null;
  ownerUserId: string | null;
  redirectUri: string;
  scopes: readonly string[];
}) {
  const code = generateOpaqueToken("mcp_code");
  await query(
    `insert into mcp_oauth_authorization_codes (
       code_hash, client_id, redirect_uri, code_challenge, code_challenge_method,
       scope, organization_id, owner_user_id, expires_at
     )
     values ($1, $2, $3, $4, 'S256', $5, $6, $7, timezone('utc', now()) + ($8::int * interval '1 second'))`,
    [
      hashToken(code),
      input.clientId,
      input.redirectUri,
      input.codeChallenge,
      normalizeOAuthScopes([...input.scopes]),
      input.organizationId,
      input.ownerUserId,
      AUTHORIZATION_CODE_TTL_SECONDS
    ]
  );
  return code;
}

export async function consumeAuthorizationCode(code: string) {
  const codeHash = hashToken(code);
  const row = await queryOne<AuthorizationCodeRow>(
    `update mcp_oauth_authorization_codes
        set consumed_at = timezone('utc', now())
      where code_hash = $1
        and consumed_at is null
        and expires_at > timezone('utc', now())
      returning client_id, redirect_uri, code_challenge, code_challenge_method, scope, organization_id, owner_user_id, expires_at, consumed_at`,
    [codeHash]
  );
  return row ?? null;
}

function sha256Base64Url(value: string) {
  return createHash("sha256").update(value, "utf8").digest("base64url");
}

export function verifyPkceS256(verifier: string, expectedChallenge: string) {
  const actual = sha256Base64Url(verifier);
  const left = Buffer.from(actual);
  const right = Buffer.from(expectedChallenge);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function createRefreshToken(input: {
  clientId: string;
  familyId?: string | null;
  organizationId: string | null;
  ownerUserId: string | null;
  scopes: readonly string[];
}) {
  const refreshToken = generateOpaqueToken("mcp_refresh");
  await query(
    `insert into mcp_oauth_refresh_tokens (
       token_hash, family_id, client_id, scope, organization_id, owner_user_id, expires_at
     )
     values ($1, coalesce($2::uuid, gen_random_uuid()), $3, $4, $5, $6, timezone('utc', now()) + ($7::int * interval '1 second'))`,
    [
      hashToken(refreshToken),
      input.familyId ?? null,
      input.clientId,
      normalizeOAuthScopes([...input.scopes]),
      input.organizationId,
      input.ownerUserId,
      REFRESH_TOKEN_TTL_SECONDS
    ]
  );
  return refreshToken;
}

async function revokeRefreshTokenFamilyForReuse(tokenHash: string) {
  const reused = await queryOne<{ family_id: string }>(
    `select family_id
       from mcp_oauth_refresh_tokens
      where token_hash = $1
        and revoked_at is not null
      limit 1`,
    [tokenHash]
  );
  if (!reused) {
    return false;
  }
  await query(
    `update mcp_oauth_refresh_tokens
        set revoked_at = coalesce(revoked_at, timezone('utc', now())),
            last_used_at = timezone('utc', now())
      where family_id = $1`,
    [reused.family_id]
  );
  return true;
}

export async function rotateRefreshToken(refreshToken: string) {
  const tokenHash = hashToken(refreshToken);
  const row = await queryOne<RefreshTokenRow>(
    `update mcp_oauth_refresh_tokens
        set revoked_at = timezone('utc', now()),
            last_used_at = timezone('utc', now())
      where token_hash = $1
        and revoked_at is null
        and expires_at > timezone('utc', now())
      returning client_id, family_id, scope, organization_id, owner_user_id, expires_at, revoked_at`,
    [tokenHash]
  );
  if (!row) {
    await revokeRefreshTokenFamilyForReuse(tokenHash);
    return null;
  }
  const scopes = await restrictMcpOAuthScopes(row.scope, {
    clientId: row.client_id,
    organizationId: row.organization_id,
    ownerUserId: row.owner_user_id
  });
  const nextRefreshToken = await createRefreshToken({
    clientId: row.client_id,
    familyId: row.family_id,
    organizationId: row.organization_id,
    ownerUserId: row.owner_user_id,
    scopes
  });
  return { row: { ...row, scope: scopes }, refreshToken: nextRefreshToken };
}

export function issueMcpAccessToken(input: {
  clientId: string;
  organizationId: string | null;
  ownerUserId: string | null;
  scopes: readonly string[];
}) {
  return signCertScoreAccessToken({
    audience: getMcpPublicUrl(),
    clientId: input.clientId,
    issuer: getMcpOAuthIssuer(),
    jwtKeyId: process.env.CERTSCORE_OAUTH_JWT_KEY_ID?.trim() || undefined,
    jwtSecret: getMcpJwtSecret(),
    organizationId: input.organizationId,
    scopes: input.scopes,
    subject: input.ownerUserId ?? input.organizationId ?? input.clientId,
    userId: input.ownerUserId
  });
}

export function buildTokenResponse(input: {
  accessToken: string;
  refreshToken: string;
  scopes: readonly string[];
}) {
  return {
    access_token: input.accessToken,
    token_type: "Bearer",
    expires_in: 3600,
    refresh_token: input.refreshToken,
    scope: oauthScopeString(normalizeOAuthScopes([...input.scopes])),
    certscore_scope_mapping: mapOAuthScopesToIntegrationScopes(input.scopes)
  };
}
