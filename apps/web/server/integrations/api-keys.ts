import { createHash, randomBytes } from "node:crypto";
import { query, queryOne } from "@website-signal-risk-scanner/db";
import { verifyCertScoreAccessToken } from "@certscore/mcp-auth";

export type IntegrationApiKeyScope = "pulse:read" | "pulse:scan" | "mcp";

export type IntegrationApiKeyRecord = {
  publicId: string;
  name: string;
  tokenPrefix: string;
  scopes: IntegrationApiKeyScope[];
  status: "active" | "revoked";
  organizationId: string | null;
  ownerUserId: string | null;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
  hourlyLimit: number;
  dailyLimit: number;
  usage: IntegrationApiKeyUsageSummary;
};

export type IntegrationApiKeyUsageSummary = {
  hourlyCount: number;
  hourlyLimit: number;
  dailyCount: number;
  dailyLimit: number;
};

type IntegrationApiKeyRow = {
  public_id: string;
  name: string;
  token_prefix: string;
  scopes: string[];
  status: "active" | "revoked";
  organization_id: string | null;
  owner_user_id: string | null;
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
  revoked_at?: string | null;
  hourly_limit?: number | string | null;
  daily_limit?: number | string | null;
  hourly_count?: number | string | null;
  daily_count?: number | string | null;
};

const PREVIEW_TOKEN_PREFIX = "cs_preview";
const LIVE_TOKEN_PREFIX = "cs_live";
const READ_ONLY_TOKEN_PREFIX = "cs_ro";
const API_KEY_PATTERN = /^cs_(?:preview|live|ro)_[A-Za-z0-9_-]{32,}$/;
export const INTEGRATION_API_KEY_HOURLY_LIMIT = 60;
export const INTEGRATION_API_KEY_DAILY_LIMIT = 500;
export const INTEGRATION_ORGANIZATION_HOURLY_LIMIT = 300;
export const INTEGRATION_ORGANIZATION_DAILY_LIMIT = 2500;
export const OAUTH_SCAN_CREATE_HOURLY_LIMIT = 20;
export const OAUTH_SCAN_CREATE_DAILY_LIMIT = 100;
export const SELF_SERVE_READ_ONLY_KEY_EXPIRES_IN_DAYS = 90;
export const SELF_SERVE_READ_ONLY_EMAIL_DAILY_ISSUANCE_LIMIT = 2;
export const SELF_SERVE_READ_ONLY_EMAIL_WINDOW_ISSUANCE_LIMIT = 5;
export const SELF_SERVE_READ_ONLY_IP_DAILY_ISSUANCE_LIMIT = 3;
export const SELF_SERVE_READ_ONLY_IP_WINDOW_ISSUANCE_LIMIT = 15;

export function integrationOrganizationScanCreateLimits(publicId: string) {
  return publicId.startsWith("oauth_")
    ? { dailyLimit: OAUTH_SCAN_CREATE_DAILY_LIMIT, hourlyLimit: OAUTH_SCAN_CREATE_HOURLY_LIMIT }
    : { dailyLimit: INTEGRATION_ORGANIZATION_DAILY_LIMIT, hourlyLimit: INTEGRATION_ORGANIZATION_HOURLY_LIMIT };
}

const DISPOSABLE_EMAIL_DOMAINS = new Set([
  "10minutemail.com",
  "guerrillamail.com",
  "mailinator.com",
  "tempmail.com",
  "temp-mail.org",
  "throwawaymail.com",
  "yopmail.com"
]);

export function generateIntegrationApiKey(prefix = PREVIEW_TOKEN_PREFIX) {
  return `${prefix}_${randomBytes(32).toString("base64url")}`;
}

export function hashIntegrationApiKey(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function getIntegrationApiKeyPrefix(token: string) {
  const match = token.match(/^(cs_(?:preview|live|ro))_(.{0,8})/);
  return match?.[1] && match[2] ? `${match[1]}_${match[2]}` : token.slice(0, 20);
}

export function hashSelfServeApiKeyRequester(value: string) {
  return createHash("sha256").update(value.trim().toLowerCase(), "utf8").digest("hex");
}

export function getEmailDomain(email: string) {
  return email.trim().toLowerCase().split("@").at(1) ?? "";
}

export function isDisposableEmailDomain(email: string) {
  const domain = getEmailDomain(email);
  return DISPOSABLE_EMAIL_DOMAINS.has(domain);
}

export function parseBearerToken(request: Request) {
  const authorization = request.headers.get("authorization")?.trim();
  if (!authorization) {
    return { provided: false as const, token: null };
  }
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return { provided: true as const, token: match?.[1]?.trim() || null };
}

export function isIntegrationApiKeyScope(value: string): value is IntegrationApiKeyScope {
  return value === "pulse:read" || value === "pulse:scan" || value === "mcp";
}

function normalizeScopes(scopes: string[]): IntegrationApiKeyScope[] {
  return scopes.filter(isIntegrationApiKeyScope);
}

function mapRow(row: IntegrationApiKeyRow): IntegrationApiKeyRecord {
  return {
    publicId: row.public_id,
    name: row.name,
    tokenPrefix: row.token_prefix,
    scopes: normalizeScopes(row.scopes ?? []),
    status: row.status,
    organizationId: row.organization_id,
    ownerUserId: row.owner_user_id,
    expiresAt: row.expires_at,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
    revokedAt: row.revoked_at ?? null,
    hourlyLimit: Number(row.hourly_limit ?? INTEGRATION_API_KEY_HOURLY_LIMIT),
    dailyLimit: Number(row.daily_limit ?? INTEGRATION_API_KEY_DAILY_LIMIT),
    usage: {
      hourlyCount: Number(row.hourly_count ?? 0),
      hourlyLimit: Number(row.hourly_limit ?? INTEGRATION_API_KEY_HOURLY_LIMIT),
      dailyCount: Number(row.daily_count ?? 0),
      dailyLimit: Number(row.daily_limit ?? INTEGRATION_API_KEY_DAILY_LIMIT)
    }
  };
}

export async function createIntegrationApiKey(input: {
  name: string;
  scopes: IntegrationApiKeyScope[];
  organizationId?: string | null;
  ownerUserId?: string | null;
  createdBy?: string | null;
  expiresAt?: string | null;
  hourlyLimit?: number;
  dailyLimit?: number;
  prefix?: "preview" | "live" | "read_only";
}) {
  const hourlyLimit = input.hourlyLimit ?? INTEGRATION_API_KEY_HOURLY_LIMIT;
  const dailyLimit = input.dailyLimit ?? INTEGRATION_API_KEY_DAILY_LIMIT;
  if (!Number.isSafeInteger(hourlyLimit) || hourlyLimit <= 0 || !Number.isSafeInteger(dailyLimit) || dailyLimit <= 0) {
    throw new Error("Integration API-key quota limits must be positive integers.");
  }
  const token = generateIntegrationApiKey(
    input.prefix === "live" ? LIVE_TOKEN_PREFIX : input.prefix === "read_only" ? READ_ONLY_TOKEN_PREFIX : PREVIEW_TOKEN_PREFIX
  );
  const tokenHash = hashIntegrationApiKey(token);
  const tokenPrefix = getIntegrationApiKeyPrefix(token);
  const publicId = `api_key_${randomBytes(12).toString("base64url")}`;
  await query(
    `insert into integration_api_keys (
       public_id, name, token_prefix, token_hash, scopes,
       organization_id, owner_user_id, created_by, expires_at, hourly_limit, daily_limit
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      publicId,
      input.name,
      tokenPrefix,
      tokenHash,
      input.scopes,
      input.organizationId ?? null,
      input.ownerUserId ?? null,
      input.createdBy ?? null,
      input.expiresAt ?? null,
      hourlyLimit,
      dailyLimit
    ]
  );
  return { publicId, token, tokenPrefix, hourlyLimit, dailyLimit };
}

export type SelfServeReadOnlyApiKeyDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason: "unverified_email" | "disposable_email" | "email_cap" | "ip_cap";
      retryAfterSeconds?: number;
    };

export function decideSelfServeReadOnlyApiKeyIssuance(input: {
  emailVerified: boolean;
  disposableEmailDomain: boolean;
  emailDailyIssuedCount: number;
  emailWindowIssuedCount: number;
  ipDailyIssuedCount: number;
  ipWindowIssuedCount: number;
}): SelfServeReadOnlyApiKeyDecision {
  if (!input.emailVerified) {
    return { allowed: false, reason: "unverified_email" };
  }
  if (input.disposableEmailDomain) {
    return { allowed: false, reason: "disposable_email" };
  }
  if (
    input.emailDailyIssuedCount >= SELF_SERVE_READ_ONLY_EMAIL_DAILY_ISSUANCE_LIMIT ||
    input.emailWindowIssuedCount >= SELF_SERVE_READ_ONLY_EMAIL_WINDOW_ISSUANCE_LIMIT
  ) {
    return { allowed: false, reason: "email_cap", retryAfterSeconds: 86400 };
  }
  if (
    input.ipDailyIssuedCount >= SELF_SERVE_READ_ONLY_IP_DAILY_ISSUANCE_LIMIT ||
    input.ipWindowIssuedCount >= SELF_SERVE_READ_ONLY_IP_WINDOW_ISSUANCE_LIMIT
  ) {
    return { allowed: false, reason: "ip_cap", retryAfterSeconds: 86400 };
  }
  return { allowed: true };
}

export async function getSelfServeReadOnlyIssuanceCounts(input: {
  emailHash: string;
  requesterIpHash: string | null;
}) {
  const row = await queryOne<{
    email_daily_count: number | string | null;
    email_window_count: number | string | null;
    ip_daily_count: number | string | null;
    ip_window_count: number | string | null;
  }>(
    `select
       count(*) filter (
         where event_type = 'self_serve_read_only_issued'
           and email_hash = $1
           and created_at > timezone('utc', now()) - interval '1 day'
       )::int as email_daily_count,
       count(*) filter (
         where event_type = 'self_serve_read_only_issued'
           and email_hash = $1
           and created_at > timezone('utc', now()) - interval '30 days'
       )::int as email_window_count,
       count(*) filter (
         where event_type = 'self_serve_read_only_issued'
           and $2::text is not null
           and requester_ip_hash = $2
           and created_at > timezone('utc', now()) - interval '1 day'
       )::int as ip_daily_count,
       count(*) filter (
         where event_type = 'self_serve_read_only_issued'
           and $2::text is not null
           and requester_ip_hash = $2
           and created_at > timezone('utc', now()) - interval '30 days'
       )::int as ip_window_count
       from integration_api_key_issuance_events
      where created_at > timezone('utc', now()) - interval '30 days'
        and (
          email_hash = $1
          or ($2::text is not null and requester_ip_hash = $2)
        )`,
    [input.emailHash, input.requesterIpHash]
  );

  return {
    emailDailyIssuedCount: Number(row?.email_daily_count ?? 0),
    emailWindowIssuedCount: Number(row?.email_window_count ?? 0),
    ipDailyIssuedCount: Number(row?.ip_daily_count ?? 0),
    ipWindowIssuedCount: Number(row?.ip_window_count ?? 0)
  };
}

export async function recordSelfServeReadOnlyIssuanceEvent(input: {
  eventType:
    | "self_serve_read_only_issued"
    | "self_serve_read_only_denied_unverified_email"
    | "self_serve_read_only_denied_disposable_email"
    | "self_serve_read_only_denied_email_cap"
    | "self_serve_read_only_denied_ip_cap";
  emailHash: string;
  emailDomain: string;
  requesterIpHash: string | null;
  organizationId?: string | null;
  ownerUserId?: string | null;
  apiKeyPublicId?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const publicId = `key_event_${randomBytes(12).toString("base64url")}`;
  await query(
    `insert into integration_api_key_issuance_events (
       public_id, event_type, email_hash, email_domain, requester_ip_hash,
       organization_id, owner_user_id, api_key_public_id, reason, metadata
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
    [
      publicId,
      input.eventType,
      input.emailHash,
      input.emailDomain,
      input.requesterIpHash,
      input.organizationId ?? null,
      input.ownerUserId ?? null,
      input.apiKeyPublicId ?? null,
      input.reason ?? null,
      JSON.stringify(input.metadata ?? {})
    ]
  );
}

export async function listIntegrationApiKeysForOrganization(organizationId: string) {
  const result = await query<IntegrationApiKeyRow>(
    `select public_id, name, token_prefix, scopes, status, organization_id, owner_user_id,
            expires_at, last_used_at, created_at, null::timestamptz as revoked_at,
            hourly_limit, daily_limit,
            (
              select count(*)::int
                from pulse_requests pr
               where pr.requested_by->>'apiKeyId' = integration_api_keys.public_id
                 and pr.requested_at > timezone('utc', now()) - interval '1 hour'
            ) as hourly_count,
            (
              select count(*)::int
                from pulse_requests pr
               where pr.requested_by->>'apiKeyId' = integration_api_keys.public_id
                 and pr.requested_at > timezone('utc', now()) - interval '1 day'
            ) as daily_count
       from integration_api_keys
      where organization_id = $1
      order by created_at desc
      limit 50`,
    [organizationId]
  );
  return result.rows.map(mapRow);
}

export async function revokeIntegrationApiKey(input: {
  organizationId: string;
  publicId: string;
}) {
  const row = await queryOne<{ public_id: string }>(
    `update integration_api_keys
        set status = 'revoked'
      where public_id = $1
        and organization_id = $2
        and status = 'active'
      returning public_id`,
    [input.publicId, input.organizationId]
  );
  return Boolean(row);
}

export async function checkIntegrationApiKeyUsageLimit(input: {
  key: Pick<IntegrationApiKeyRecord, "organizationId" | "publicId" | "hourlyLimit" | "dailyLimit">;
}) {
  const result = await queryOne<{
    key_hourly_count: number;
    key_daily_count: number;
    organization_hourly_count: number;
    organization_daily_count: number;
  }>(
    `select
       count(*) filter (
         where requested_by->>'apiKeyId' = $1
           and request_context->>'quotaClass' = 'scan_create'
           and requested_at > timezone('utc', now()) - interval '1 hour'
       )::int as key_hourly_count,
       count(*) filter (
         where requested_by->>'apiKeyId' = $1
           and request_context->>'quotaClass' = 'scan_create'
           and requested_at > timezone('utc', now()) - interval '1 day'
       )::int as key_daily_count,
       count(*) filter (
         where $2::text is not null
           and requested_by->>'accountId' = $2
           and request_context->>'quotaClass' = 'scan_create'
           and requested_at > timezone('utc', now()) - interval '1 hour'
       )::int as organization_hourly_count,
       count(*) filter (
         where $2::text is not null
           and requested_by->>'accountId' = $2
           and request_context->>'quotaClass' = 'scan_create'
           and requested_at > timezone('utc', now()) - interval '1 day'
       )::int as organization_daily_count
       from pulse_requests
      where requested_at > timezone('utc', now()) - interval '1 day'
        and (
          requested_by->>'apiKeyId' = $1
          or ($2::text is not null and requested_by->>'accountId' = $2)
        )`,
    [input.key.publicId, input.key.organizationId]
  );
  const usage = {
    keyHourlyCount: Number(result?.key_hourly_count ?? 0),
    keyDailyCount: Number(result?.key_daily_count ?? 0),
    organizationHourlyCount: Number(result?.organization_hourly_count ?? 0),
    organizationDailyCount: Number(result?.organization_daily_count ?? 0)
  };
  const organizationLimits = integrationOrganizationScanCreateLimits(input.key.publicId);
  return decideIntegrationApiKeyUsageLimit({
    ...usage,
    keyHourlyLimit: input.key.hourlyLimit,
    keyDailyLimit: input.key.dailyLimit,
    organizationHourlyLimit: organizationLimits.hourlyLimit,
    organizationDailyLimit: organizationLimits.dailyLimit
  });
}

export function decideIntegrationApiKeyUsageLimit(usage: {
  keyHourlyCount: number;
  keyDailyCount: number;
  organizationHourlyCount: number;
  organizationDailyCount: number;
  keyHourlyLimit?: number;
  keyDailyLimit?: number;
  organizationHourlyLimit?: number;
  organizationDailyLimit?: number;
}) {
  const keyHourlyLimit = usage.keyHourlyLimit ?? INTEGRATION_API_KEY_HOURLY_LIMIT;
  const keyDailyLimit = usage.keyDailyLimit ?? INTEGRATION_API_KEY_DAILY_LIMIT;
  const organizationHourlyLimit = usage.organizationHourlyLimit ?? INTEGRATION_ORGANIZATION_HOURLY_LIMIT;
  const organizationDailyLimit = usage.organizationDailyLimit ?? INTEGRATION_ORGANIZATION_DAILY_LIMIT;
  if (usage.keyHourlyCount >= keyHourlyLimit) {
    return { allowed: false as const, retryAfterSeconds: 3600, reason: "api_key_hourly_limit" as const, usage };
  }
  if (usage.keyDailyCount >= keyDailyLimit) {
    return { allowed: false as const, retryAfterSeconds: 86400, reason: "api_key_daily_limit" as const, usage };
  }
  if (usage.organizationHourlyCount >= organizationHourlyLimit) {
    return { allowed: false as const, retryAfterSeconds: 3600, reason: "organization_hourly_limit" as const, usage };
  }
  if (usage.organizationDailyCount >= organizationDailyLimit) {
    return { allowed: false as const, retryAfterSeconds: 86400, reason: "organization_daily_limit" as const, usage };
  }
  return { allowed: true as const, retryAfterSeconds: 0, reason: null, usage };
}

export async function validateIntegrationApiKey(token: string, requiredScopes: IntegrationApiKeyScope[]) {
  if (!API_KEY_PATTERN.test(token)) {
    return { ok: false as const, reason: "malformed" as const };
  }
  const row = await queryOne<IntegrationApiKeyRow>(
    `select public_id, name, token_prefix, scopes, status, organization_id, owner_user_id,
            expires_at, last_used_at, created_at, null::timestamptz as revoked_at,
            hourly_limit, daily_limit, 0::int as hourly_count, 0::int as daily_count
       from integration_api_keys
      where token_hash = $1
        and status = 'active'
        and (expires_at is null or expires_at > timezone('utc', now()))
      limit 1`,
    [hashIntegrationApiKey(token)]
  );
  if (!row) {
    return { ok: false as const, reason: "not_found" as const };
  }
  const record = mapRow(row);
  const hasScopes = requiredScopes.every((scope) => record.scopes.includes(scope));
  if (!hasScopes) {
    return { ok: false as const, reason: "missing_scope" as const, key: record };
  }
  await query(`update integration_api_keys set last_used_at = timezone('utc', now()) where public_id = $1`, [record.publicId]).catch(
    (error) => console.error("[integration-api-key] last_used update failed", error)
  );
  return { ok: true as const, key: record };
}

function oauthKeyRecord(claims: {
  client_id: string;
  exp: number;
  iat: number;
  jti: string;
  certscore: {
    organizationId: string | null;
    scopes: IntegrationApiKeyScope[];
    userId: string | null;
  };
}): IntegrationApiKeyRecord {
  return {
    publicId: `oauth_${claims.client_id}_${claims.jti}`.slice(0, 96),
    name: "MCP OAuth access token",
    tokenPrefix: "oauth",
    scopes: claims.certscore.scopes,
    status: "active",
    organizationId: claims.certscore.organizationId,
    ownerUserId: claims.certscore.userId,
    expiresAt: new Date(claims.exp * 1000).toISOString(),
    lastUsedAt: null,
    createdAt: new Date(claims.iat * 1000).toISOString(),
    revokedAt: null,
    hourlyLimit: OAUTH_SCAN_CREATE_HOURLY_LIMIT,
    dailyLimit: OAUTH_SCAN_CREATE_DAILY_LIMIT,
    usage: {
      hourlyCount: 0,
      hourlyLimit: OAUTH_SCAN_CREATE_HOURLY_LIMIT,
      dailyCount: 0,
      dailyLimit: OAUTH_SCAN_CREATE_DAILY_LIMIT
    }
  };
}

/** Validates the existing cs_* API-key format or a short-lived MCP OAuth access token. */
export async function validateCertScoreBearerToken(token: string, requiredScopes: IntegrationApiKeyScope[]) {
  if (API_KEY_PATTERN.test(token)) {
    return validateIntegrationApiKey(token, requiredScopes);
  }
  const jwtSecret = process.env.CERTSCORE_OAUTH_JWT_SECRET?.trim() || process.env.JWT_SIGNING_KEY?.trim();
  if (!jwtSecret) {
    return { ok: false as const, reason: "not_found" as const };
  }
  const verified = verifyCertScoreAccessToken({
    audience: process.env.MCP_PUBLIC_URL?.trim() || "https://mcp.certscore.ai",
    issuer: process.env.OAUTH_ISSUER?.trim() || "https://certscore.ai",
    jwtSecret,
    token
  });
  if (!verified.ok) {
    return { ok: false as const, reason: "not_found" as const };
  }
  const key = oauthKeyRecord(verified.claims);
  if (!requiredScopes.every((scope) => key.scopes.includes(scope))) {
    return { ok: false as const, reason: "missing_scope" as const, key };
  }
  return { ok: true as const, key };
}
