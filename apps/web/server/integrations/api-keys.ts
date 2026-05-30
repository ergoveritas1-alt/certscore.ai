import { createHash, randomBytes } from "node:crypto";
import { query, queryOne } from "@website-signal-risk-scanner/db";

export type IntegrationApiKeyScope = "pulse:read" | "pulse:scan" | "mcp";

export type IntegrationApiKeyRecord = {
  publicId: string;
  name: string;
  tokenPrefix: string;
  scopes: IntegrationApiKeyScope[];
  organizationId: string | null;
  ownerUserId: string | null;
  expiresAt: string | null;
};

type IntegrationApiKeyRow = {
  public_id: string;
  name: string;
  token_prefix: string;
  scopes: string[];
  organization_id: string | null;
  owner_user_id: string | null;
  expires_at: string | null;
};

const TOKEN_PREFIX = "cs_preview";
const API_KEY_PATTERN = /^cs_(?:preview|live)_[A-Za-z0-9_-]{32,}$/;

export function generateIntegrationApiKey(prefix = TOKEN_PREFIX) {
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
    organizationId: row.organization_id,
    ownerUserId: row.owner_user_id,
    expiresAt: row.expires_at
  };
}

export async function createIntegrationApiKey(input: {
  name: string;
  scopes: IntegrationApiKeyScope[];
  organizationId?: string | null;
  ownerUserId?: string | null;
  createdBy?: string | null;
  expiresAt?: string | null;
}) {
  const token = generateIntegrationApiKey();
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

export async function validateIntegrationApiKey(token: string, requiredScopes: IntegrationApiKeyScope[]) {
  if (!API_KEY_PATTERN.test(token)) {
    return { ok: false as const, reason: "malformed" as const };
  }
  const row = await queryOne<IntegrationApiKeyRow>(
    `select public_id, name, token_prefix, scopes, organization_id, owner_user_id, expires_at
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
