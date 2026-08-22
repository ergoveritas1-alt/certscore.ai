import { z } from "zod";
import { NextResponse } from "next/server";
import { CERTSCORE_OAUTH_CREATE_SCOPE, oauthScopeString } from "@certscore/mcp-auth";
import { CERTSCORE_OAUTH_SUPPORTED_SCOPES } from "@certscore/mcp-auth";
import {
  checkDynamicClientRegistrationLimit,
  cleanupUnusedMcpOAuthClients,
  getRequesterIp,
  hashRequester,
  isClaudeMcpOAuthClientMetadata,
  registerMcpOAuthClient
} from "../../../../../server/oauth/mcp-oauth";
import { isAllowedMcpOAuthRedirectUri } from "../../../../../server/oauth/mcp-oauth-scopes";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const registrationSchema = z.object({
  client_name: z.string().trim().min(1).max(120).optional(),
  redirect_uris: z.array(z.string().trim().min(1).max(2048)).min(1).max(20),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
  scope: z.string().optional(),
  token_endpoint_auth_method: z.string().optional()
});

function json(body: unknown, status = 200, headers?: HeadersInit) {
  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "no-store",
      ...headers
    },
    status
  });
}

function normalizeRedirectUris(values: string[]) {
  return values.filter(isAllowedMcpOAuthRedirectUri);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_client_metadata", error_description: "Request body must be valid JSON." }, 400);
  }

  const parsed = registrationSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: "invalid_client_metadata", error_description: "Client registration metadata is invalid." }, 400);
  }
  if (parsed.data.token_endpoint_auth_method && parsed.data.token_endpoint_auth_method !== "none") {
    return json({ error: "invalid_client_metadata", error_description: "Only public PKCE clients using token_endpoint_auth_method=none are supported." }, 400);
  }
  const grantTypes = parsed.data.grant_types ?? ["authorization_code", "refresh_token"];
  const responseTypes = parsed.data.response_types ?? ["code"];
  if (
    !grantTypes.includes("authorization_code") ||
    grantTypes.some((value) => value !== "authorization_code" && value !== "refresh_token") ||
    responseTypes.length !== 1 ||
    responseTypes[0] !== "code"
  ) {
    return json({ error: "invalid_client_metadata", error_description: "Only authorization code clients are supported." }, 400);
  }
  const requestedScopes = parsed.data.scope?.split(/\s+/).filter(Boolean) ?? [];
  const invalidScopes = requestedScopes.filter(
    (scope) => !CERTSCORE_OAUTH_SUPPORTED_SCOPES.includes(scope as (typeof CERTSCORE_OAUTH_SUPPORTED_SCOPES)[number])
  );
  if (invalidScopes.length > 0) {
    return json({ error: "invalid_client_metadata", error_description: "Requested OAuth scopes are not supported." }, 400);
  }
  const redirectUris = normalizeRedirectUris(parsed.data.redirect_uris);
  if (redirectUris.length !== parsed.data.redirect_uris.length) {
    return json({ error: "invalid_redirect_uri", error_description: "Redirect URIs must be HTTPS, localhost, or 127.0.0.1." }, 400);
  }

  const clientName = parsed.data.client_name ?? "MCP Client";
  const registrationScopes = isClaudeMcpOAuthClientMetadata({ clientName, redirectUris })
    ? Array.from(new Set([...requestedScopes, CERTSCORE_OAUTH_CREATE_SCOPE]))
    : requestedScopes;
  const requesterIpHash = hashRequester(getRequesterIp(request));
  await cleanupUnusedMcpOAuthClients();
  const limit = await checkDynamicClientRegistrationLimit(requesterIpHash);
  if (!limit.allowed) {
    return json(
      { error: "rate_limited", error_description: "Too many dynamic client registrations from this network." },
      429,
      { "Retry-After": String(limit.retryAfterSeconds) }
    );
  }

  const client = await registerMcpOAuthClient({
    clientName,
    redirectUris,
    requestedScopes: registrationScopes,
    requesterIpHash
  });
  const now = Math.floor(Date.now() / 1000);
  return json(
    {
      client_id: client.clientId,
      client_id_issued_at: now,
      client_name: clientName,
      redirect_uris: redirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: oauthScopeString(client.scopes)
    },
    201
  );
}
