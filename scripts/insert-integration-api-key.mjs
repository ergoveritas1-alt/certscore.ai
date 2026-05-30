import pg from "pg";

const { Client } = pg;

function getRequiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Set ${name}.`);
  }
  return value;
}

function getOptionalEnv(name) {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : null;
}

function parseScopes(value) {
  const scopes = value
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);
  for (const scope of scopes) {
    if (scope !== "pulse:read" && scope !== "pulse:scan" && scope !== "mcp") {
      throw new Error(`Unsupported scope: ${scope}`);
    }
  }
  return scopes;
}

function getSslConfig(mode) {
  switch (mode) {
    case "disable":
      return false;
    case "prefer":
      return undefined;
    case "require":
      return { rejectUnauthorized: false };
    case "verify-ca":
    case "verify-full":
      return { rejectUnauthorized: true };
    default:
      return undefined;
  }
}

async function main() {
  const connectionString = getRequiredEnv("DATABASE_URL");
  const client = new Client({
    connectionString,
    ssl: getSslConfig(process.env.DATABASE_SSL_MODE?.trim())
  });

  const publicId = getRequiredEnv("API_KEY_PUBLIC_ID");
  const name = getRequiredEnv("API_KEY_NAME");
  const tokenPrefix = getRequiredEnv("API_KEY_TOKEN_PREFIX");
  const tokenHash = getRequiredEnv("API_KEY_TOKEN_HASH");
  const scopes = parseScopes(getRequiredEnv("API_KEY_SCOPES"));
  const organizationId = getOptionalEnv("API_KEY_ORGANIZATION_ID");
  const ownerUserId = getOptionalEnv("API_KEY_OWNER_USER_ID");
  const createdBy = getOptionalEnv("API_KEY_CREATED_BY") ?? "github-actions";
  const expiresAt = getOptionalEnv("API_KEY_EXPIRES_AT");

  await client.connect();
  try {
    await client.query(
      `insert into integration_api_keys (
         public_id, name, token_prefix, token_hash, scopes,
         organization_id, owner_user_id, created_by, expires_at
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       on conflict (token_hash) do update
       set name = excluded.name,
           scopes = excluded.scopes,
           organization_id = excluded.organization_id,
           owner_user_id = excluded.owner_user_id,
           created_by = excluded.created_by,
           expires_at = excluded.expires_at,
           status = 'active',
           updated_at = timezone('utc', now())`,
      [publicId, name, tokenPrefix, tokenHash, scopes, organizationId, ownerUserId, createdBy, expiresAt]
    );
    console.info(
      JSON.stringify(
        {
          expiresAt,
          name,
          publicId,
          scopes,
          status: "inserted",
          tokenPrefix
        },
        null,
        2
      )
    );
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
