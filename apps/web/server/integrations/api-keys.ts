import { createHash, randomBytes } from "node:crypto";
import { query, queryOne } from "@website-signal-risk-scanner/db";

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
  hourly_count?: number | string | null;
  daily_count?: number | string | null;
};

const PREVIEW_TOKEN_PREFIX = "cs_preview";
const LIVE_TOKEN_PREFIX = "cs_live";
const API_KEY_PATTERN = /^cs_(?:preview|live)_[A-Za-z0-9_-]{32,}$/;
export const INTEGRATION_API_KEY_HOURLY_LIMIT = 60;
export const INTEGRATION_API_KEY_DAILY_LIMIT = 500;
export const INTEGRATION_ORGANIZATION_HOURLY_LIMIT = 300;
export const INTEGRATION_ORGANIZATION_DAILY_LIMIT = 2500;

export function generateIntegrationApiKey(prefix = PREVIEW_TOKEN_PREFIX) {
  return `${prefix}_${randomBytes(32).toString("base64url")}`;
}

export function hashIntegrationApiKey(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function getIntegrationApiKeyPrefix(token: string) {
  const parts = token.split("_");
  return parts.length >= 3 ? `${parts[0]}_${parts[1]}_${parts[2]?.slice(0, 8)}` : token.slice(0, 20);
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
    usage: {
      hourlyCount: Number(row.hourly_count ?? 0),
      hourlyLimit: INTEGRATION_API_KEY_HOURLY_LIMIT,
      dailyCount: Number(row.daily_count ?? 0),
      dailyLimit: INTEGRATION_API_KEY_DAILY_LIMIT
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
  prefix?: "preview" | "live";
}) {
  const token = generateIntegrationApiKey(input.prefix === "live" ? LIVE_TOKEN_PREFIX : PREVIEW_TOKEN_PREFIX);
  const tokenHash = hashIntegrationApiKey(token);
  const tokenPrefix = getIntegrationApiKeyPrefix(token);
  const publicId = `api_key_${randomBytes(12).toString("base64url")}`;
  await query(
    `insert into integration_api_keys (
       public_id, name, token_prefix, token_hash, scopes,
       organization_id, owner_user_id, created_by, expires_at
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      publicId,
      input.name,
      tokenPrefix,
      tokenHash,
      input.scopes,
      input.organizationId ?? null,
      input.ownerUserId ?? null,
      input.createdBy ?? null,
      input.expiresAt ?? null
    ]
  );
  return { publicId, token, tokenPrefix };
}

export async function listIntegrationApiKeysForOrganization(organizationId: string) {
  const result = await query<IntegrationApiKeyRow>(
    `select public_id, name, token_prefix, scopes, status, organization_id, owner_user_id,
            expires_at, last_used_at, created_at, null::timestamptz as revoked_at,
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
  key: Pick<IntegrationApiKeyRecord, "organizationId" | "publicId">;
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
           and requested_at > timezone('utc', now()) - interval '1 hour'
       )::int as key_hourly_count,
       count(*) filter (
         where requested_by->>'apiKeyId' = $1
           and requested_at > timezone('utc', now()) - interval '1 day'
       )::int as key_daily_count,
       count(*) filter (
         where $2::text is not null
           and requested_by->>'accountId' = $2
           and requested_at > timezone('utc', now()) - interval '1 hour'
       )::int as organization_hourly_count,
       count(*) filter (
         where $2::text is not null
           and requested_by->>'accountId' = $2
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
  return decideIntegrationApiKeyUsageLimit(usage);
}

export function decideIntegrationApiKeyUsageLimit(usage: {
  keyHourlyCount: number;
  keyDailyCount: number;
  organizationHourlyCount: number;
  organizationDailyCount: number;
}) {
  if (usage.keyHourlyCount >= INTEGRATION_API_KEY_HOURLY_LIMIT) {
    return { allowed: false as const, retryAfterSeconds: 3600, reason: "api_key_hourly_limit" as const, usage };
  }
  if (usage.keyDailyCount >= INTEGRATION_API_KEY_DAILY_LIMIT) {
    return { allowed: false as const, retryAfterSeconds: 86400, reason: "api_key_daily_limit" as const, usage };
  }
  if (usage.organizationHourlyCount >= INTEGRATION_ORGANIZATION_HOURLY_LIMIT) {
    return { allowed: false as const, retryAfterSeconds: 3600, reason: "organization_hourly_limit" as const, usage };
  }
  if (usage.organizationDailyCount >= INTEGRATION_ORGANIZATION_DAILY_LIMIT) {
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
            expires_at, last_used_at, created_at, 0::int as hourly_count, 0::int as daily_count
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
