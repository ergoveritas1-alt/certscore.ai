import { NextResponse } from "next/server";
import {
  buildTokenResponse,
  consumeAuthorizationCode,
  createRefreshToken,
  getMcpOAuthClient,
  issueMcpAccessToken,
  redirectUriAllowed,
  rotateRefreshToken,
  verifyPkceS256
} from "../../../../../server/oauth/mcp-oauth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "no-store",
      Pragma: "no-cache"
    },
    status
  });
}

function error(error: string, description: string, status = 400) {
  return json({ error, error_description: description }, status);
}

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  if (!form) {
    return error("invalid_request", "Token requests must use application/x-www-form-urlencoded form data.");
  }
  const grantType = String(form.get("grant_type") ?? "");
  const clientId = String(form.get("client_id") ?? "");
  const client = clientId ? await getMcpOAuthClient(clientId) : null;
  if (!client) {
    return error("invalid_client", "Unknown OAuth client.", 401);
  }

  if (grantType === "authorization_code") {
    const code = String(form.get("code") ?? "");
    const redirectUri = String(form.get("redirect_uri") ?? "");
    const codeVerifier = String(form.get("code_verifier") ?? "");
    if (!code || !redirectUri || !codeVerifier) {
      return error("invalid_request", "code, redirect_uri, and code_verifier are required.");
    }
    if (!redirectUriAllowed(client, redirectUri)) {
      return error("invalid_grant", "Redirect URI is not registered for this client.");
    }
    const authorizationCode = await consumeAuthorizationCode(code);
    if (!authorizationCode || authorizationCode.client_id !== client.clientId || authorizationCode.redirect_uri !== redirectUri) {
      return error("invalid_grant", "Authorization code is invalid, expired, or already used.");
    }
    if (!verifyPkceS256(codeVerifier, authorizationCode.code_challenge)) {
      return error("invalid_grant", "PKCE verifier did not match the authorization code challenge.");
    }
    const refreshToken = await createRefreshToken({
      clientId: client.clientId,
      organizationId: authorizationCode.organization_id,
      ownerUserId: authorizationCode.owner_user_id,
      scopes: authorizationCode.scope
    });
    const accessToken = issueMcpAccessToken({
      clientId: client.clientId,
      organizationId: authorizationCode.organization_id,
      ownerUserId: authorizationCode.owner_user_id,
      scopes: authorizationCode.scope
    });
    return json(buildTokenResponse({ accessToken, refreshToken, scopes: authorizationCode.scope }));
  }

  if (grantType === "refresh_token") {
    const refreshToken = String(form.get("refresh_token") ?? "");
    if (!refreshToken) {
      return error("invalid_request", "refresh_token is required.");
    }
    const rotated = await rotateRefreshToken(refreshToken);
    if (!rotated || rotated.row.client_id !== client.clientId) {
      return error("invalid_grant", "Refresh token is invalid, expired, or revoked.");
    }
    const accessToken = issueMcpAccessToken({
      clientId: client.clientId,
      organizationId: rotated.row.organization_id,
      ownerUserId: rotated.row.owner_user_id,
      scopes: rotated.row.scope
    });
    return json(buildTokenResponse({ accessToken, refreshToken: rotated.refreshToken, scopes: rotated.row.scope }));
  }

  return error("unsupported_grant_type", "Only authorization_code and refresh_token grants are supported.");
}
