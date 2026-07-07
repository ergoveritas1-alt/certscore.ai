import { redirect } from "next/navigation";
import { oauthScopeString } from "@certscore/mcp-auth";
import { getCurrentUser } from "../../../../../server/auth";
import { bootstrapAppUserSession } from "../../../../../server/bootstrap-user";
import {
  createAuthorizationCode,
  getMcpOAuthClient,
  redirectUriAllowed,
  resolveMcpOAuthRequestedScopes
} from "../../../../../server/oauth/mcp-oauth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function redirectWithParams(redirectUri: string, params: Record<string, string>): never {
  const target = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      target.searchParams.set(key, value);
    }
  }
  redirect(target.toString());
}

export async function POST(request: Request) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    redirect("/login");
  }
  const form = await request.formData();
  const clientId = String(form.get("client_id") ?? "");
  const redirectUri = String(form.get("redirect_uri") ?? "");
  const state = String(form.get("state") ?? "");
  const decision = String(form.get("decision") ?? "");
  const codeChallenge = String(form.get("code_challenge") ?? "");
  const codeChallengeMethod = String(form.get("code_challenge_method") ?? "");
  const requestedScopes = String(form.get("scope") ?? "").split(/\s+/).filter(Boolean);
  const client = clientId ? await getMcpOAuthClient(clientId) : null;

  if (!client || !redirectUri || !redirectUriAllowed(client, redirectUri) || !codeChallenge || codeChallengeMethod !== "S256") {
    redirectWithParams(redirectUri || "https://certscore.ai/developers/mcp", {
      error: "invalid_request",
      error_description: "OAuth request is invalid.",
      state
    });
  }
  if (decision !== "approve") {
    redirectWithParams(redirectUri, {
      error: "access_denied",
      state
    });
  }
  const { organization, user } = await bootstrapAppUserSession(sessionUser);
  const scopeResolution = await resolveMcpOAuthRequestedScopes({
    client,
    requestedScopes,
    context: {
      clientId,
      organizationId: organization.id,
      ownerUserId: user.id
    }
  });
  if (scopeResolution.invalidScopes.length > 0) {
    redirectWithParams(redirectUri, {
      error: "invalid_scope",
      error_description: `Requested scopes are not supported: ${scopeResolution.invalidScopes.join(" ")}.`,
      state
    });
  }
  if (scopeResolution.deniedScopes.length > 0) {
    redirectWithParams(redirectUri, {
      error: "invalid_scope",
      error_description: `Requested scopes are not available: ${oauthScopeString(scopeResolution.deniedScopes)}.`,
      state
    });
  }
  const code = await createAuthorizationCode({
    clientId,
    codeChallenge,
    organizationId: organization.id,
    ownerUserId: user.id,
    redirectUri,
    scopes: scopeResolution.approvedScopes
  });
  redirectWithParams(redirectUri, {
    code,
    scope: oauthScopeString(scopeResolution.approvedScopes),
    state
  });
}
