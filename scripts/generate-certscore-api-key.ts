import { createIntegrationApiKey, type IntegrationApiKeyScope } from "../apps/web/server/integrations/api-keys";

function readArg(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() : undefined;
}

function parseScopes(value: string | undefined): IntegrationApiKeyScope[] {
  const rawScopes = (value ?? "pulse:read,pulse:scan,mcp")
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);
  for (const scope of rawScopes) {
    if (scope !== "pulse:read" && scope !== "pulse:scan" && scope !== "mcp") {
      throw new Error(`Unsupported scope: ${scope}`);
    }
  }
  return rawScopes as IntegrationApiKeyScope[];
}

async function main() {
  const name = readArg("--name") ?? "CertScore MCP preview";
  const scopes = parseScopes(readArg("--scopes"));
  const organizationId = readArg("--organization-id") ?? null;
  const ownerUserId = readArg("--owner-user-id") ?? null;
  const expiresAt = readArg("--expires-at") ?? null;
  const createdBy = process.env.USER ?? "operator";
  const key = await createIntegrationApiKey({
    name,
    scopes,
    organizationId,
    ownerUserId,
    expiresAt,
    createdBy
  });
  console.log(JSON.stringify({ ...key, name, scopes, organizationId, ownerUserId, expiresAt }, null, 2));
  console.error("Store token securely. It is shown once and only the hash is stored.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
