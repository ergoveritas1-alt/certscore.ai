const DEFAULT_MCP_PUBLIC_URL = "https://mcp.certscore.ai";
const DEFAULT_OAUTH_ISSUER = "https://certscore.ai";

type CheckResult = {
  detail?: string;
  name: string;
  ok: boolean;
};

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function getArg(name: string) {
  const prefix = `${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function origin(value: string) {
  return new URL(value).origin;
}

function env(name: string) {
  return process.env[name]?.trim() || "";
}

function decodeJwtPayload(token: string) {
  const payload = token.split(".").at(1);
  if (!payload) {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      certscore?: { scopes?: unknown };
      scope?: unknown;
    };
  } catch {
    return null;
  }
}

function tokenIncludesScope(token: string, scope: string) {
  const payload = decodeJwtPayload(token);
  const certscoreScopes = payload?.certscore?.scopes;
  if (Array.isArray(certscoreScopes) && certscoreScopes.includes(scope)) {
    return true;
  }
  return typeof payload?.scope === "string" && payload.scope.split(/\s+/).includes(scope);
}

function scopesInclude(scopes: string[] | undefined, expected: string[]) {
  return expected.every((scope) => scopes?.includes(scope));
}

async function fetchJson(url: string) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json"
    },
    signal: AbortSignal.timeout(15_000)
  });
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { response, body };
}

function ok(name: string, detail?: string): CheckResult {
  return { name, ok: true, detail };
}

function fail(name: string, detail?: string): CheckResult {
  return { name, ok: false, detail };
}

function checkLocalEnv(mcpPublicUrl: string, oauthIssuer: string, requireScanCreate: boolean) {
  const results: CheckResult[] = [];
  const jwtSecret = env("CERTSCORE_OAUTH_JWT_SECRET") || env("JWT_SIGNING_KEY");
  results.push(jwtSecret.length >= 16 ? ok("jwt signing secret present") : fail("jwt signing secret present", "Set CERTSCORE_OAUTH_JWT_SECRET or JWT_SIGNING_KEY."));
  results.push(
    origin(env("MCP_PUBLIC_URL") || mcpPublicUrl) === origin(mcpPublicUrl)
      ? ok("MCP_PUBLIC_URL matches target", origin(mcpPublicUrl))
      : fail("MCP_PUBLIC_URL matches target", `Expected ${origin(mcpPublicUrl)}, got ${env("MCP_PUBLIC_URL") || "(unset)"}.`)
  );
  results.push(
    origin(env("OAUTH_ISSUER") || oauthIssuer) === origin(oauthIssuer)
      ? ok("OAUTH_ISSUER matches target", origin(oauthIssuer))
      : fail("OAUTH_ISSUER matches target", `Expected ${origin(oauthIssuer)}, got ${env("OAUTH_ISSUER") || "(unset)"}.`)
  );
  if (requireScanCreate) {
    const bearerToken = env("CERTSCORE_MCP_HTTP_BEARER_TOKEN");
    results.push(
      bearerToken && tokenIncludesScope(bearerToken, "scan:create")
        ? ok("production OAuth token includes scan:create")
        : fail("production OAuth token includes scan:create", "Mint a token from the production reviewer/test account after adding an active DB grant.")
    );
  }
  return results;
}

async function checkLive(mcpPublicUrl: string, oauthIssuer: string, requireScanCreate: boolean) {
  const results: CheckResult[] = [];
  const protectedResourceUrl = `${origin(mcpPublicUrl)}/.well-known/oauth-protected-resource`;
  const authServerUrl = `${origin(oauthIssuer)}/.well-known/oauth-authorization-server`;
  const healthUrl = `${origin(mcpPublicUrl)}/healthz`;
  const mcpUrl = `${origin(mcpPublicUrl)}/mcp`;

  try {
    const { response, body } = await fetchJson(healthUrl);
    results.push(response.ok ? ok("healthz reachable", `${response.status}`) : fail("healthz reachable", `${response.status}`));
    results.push(response.headers.get("cache-control")?.includes("no-store") ? ok("healthz no-store") : fail("healthz no-store"));
    results.push(
      typeof body === "object" && body !== null && (body as { version?: unknown }).version
        ? ok("healthz includes version", String((body as { version?: unknown }).version))
        : fail("healthz includes version")
    );
  } catch (error) {
    results.push(fail("healthz reachable", error instanceof Error ? error.message : String(error)));
  }

  try {
    const { response, body } = await fetchJson(protectedResourceUrl);
    const metadata = body as { authorization_servers?: string[]; scopes_supported?: string[] };
    results.push(response.ok ? ok("protected resource metadata reachable", `${response.status}`) : fail("protected resource metadata reachable", `${response.status}`));
    results.push(response.headers.get("cache-control")?.includes("no-store") ? ok("protected resource no-store") : fail("protected resource no-store"));
    results.push(
      metadata.authorization_servers?.includes(origin(oauthIssuer))
        ? ok("protected resource points at OAuth issuer")
        : fail("protected resource points at OAuth issuer", JSON.stringify(metadata.authorization_servers ?? []))
    );
    const expectedScopes = requireScanCreate ? ["scan:read", "scan:create", "mcp"] : ["scan:read", "mcp"];
    results.push(
      scopesInclude(metadata.scopes_supported, expectedScopes)
        ? ok("protected resource scopes supported", JSON.stringify(metadata.scopes_supported ?? []))
        : fail("protected resource scopes supported", JSON.stringify(metadata.scopes_supported ?? []))
    );
  } catch (error) {
    results.push(fail("protected resource metadata reachable", error instanceof Error ? error.message : String(error)));
  }

  try {
    const { response, body } = await fetchJson(authServerUrl);
    const metadata = body as {
      authorization_endpoint?: string;
      code_challenge_methods_supported?: string[];
      registration_endpoint?: string;
      scopes_supported?: string[];
      token_endpoint?: string;
    };
    results.push(response.ok ? ok("authorization server metadata reachable", `${response.status}`) : fail("authorization server metadata reachable", `${response.status}`));
    results.push(response.headers.get("cache-control")?.includes("no-store") ? ok("authorization metadata no-store") : fail("authorization metadata no-store"));
    results.push(metadata.authorization_endpoint ? ok("authorization endpoint advertised") : fail("authorization endpoint advertised"));
    results.push(metadata.token_endpoint ? ok("token endpoint advertised") : fail("token endpoint advertised"));
    results.push(metadata.registration_endpoint ? ok("registration endpoint advertised") : fail("registration endpoint advertised"));
    results.push(
      metadata.code_challenge_methods_supported?.includes("S256")
        ? ok("PKCE S256 advertised")
        : fail("PKCE S256 advertised", JSON.stringify(metadata.code_challenge_methods_supported ?? []))
    );
    const expectedScopes = requireScanCreate ? ["scan:read", "scan:create", "mcp"] : ["scan:read", "mcp"];
    results.push(
      scopesInclude(metadata.scopes_supported, expectedScopes)
        ? ok("authorization metadata scopes supported", JSON.stringify(metadata.scopes_supported ?? []))
        : fail("authorization metadata scopes supported", JSON.stringify(metadata.scopes_supported ?? []))
    );
  } catch (error) {
    results.push(fail("authorization server metadata reachable", error instanceof Error ? error.message : String(error)));
  }

  try {
    const response = await fetch(mcpUrl, {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "certscore-mcp-readiness", version: "0.1.0" }
        }
      }),
      signal: AbortSignal.timeout(15_000)
    });
    results.push(response.status === 401 ? ok("unauthenticated /mcp returns 401") : fail("unauthenticated /mcp returns 401", `${response.status}`));
    results.push(response.headers.get("www-authenticate")?.includes(".well-known/oauth-protected-resource") ? ok("/mcp WWW-Authenticate metadata") : fail("/mcp WWW-Authenticate metadata"));
    results.push(response.headers.get("cache-control")?.includes("no-store") ? ok("/mcp 401 no-store") : fail("/mcp 401 no-store"));
  } catch (error) {
    results.push(fail("unauthenticated /mcp returns 401", error instanceof Error ? error.message : String(error)));
  }

  return results;
}

async function main() {
  const mcpPublicUrl = getArg("--mcp-public-url") || env("MCP_PUBLIC_URL") || DEFAULT_MCP_PUBLIC_URL;
  const oauthIssuer = getArg("--oauth-issuer") || env("OAUTH_ISSUER") || DEFAULT_OAUTH_ISSUER;
  const requireScanCreate = hasFlag("--require-scan-create");
  const live = hasFlag("--live");

  const results = [
    ...checkLocalEnv(mcpPublicUrl, oauthIssuer, requireScanCreate),
    ...(live ? await checkLive(mcpPublicUrl, oauthIssuer, requireScanCreate) : [])
  ];
  const failed = results.filter((result) => !result.ok);

  for (const result of results) {
    console.log(`${result.ok ? "[ok]" : "[error]"} ${result.name}${result.detail ? ` - ${result.detail}` : ""}`);
  }

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
