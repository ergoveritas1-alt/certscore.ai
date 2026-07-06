import { redirect } from "next/navigation";
import { normalizeOAuthScopes, oauthScopeString } from "@certscore/mcp-auth";
import { getCurrentUser } from "../../../../../server/auth";
import { bootstrapAppUserSession } from "../../../../../server/bootstrap-user";
import {
  createAuthorizationCode,
  getMcpOAuthClient,
  redirectUriAllowed,
  restrictMcpOAuthScopes
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
  const requestedScopes = normalizeOAuthScopes(String(form.get("scope") ?? ""));
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
  const scopes = await restrictMcpOAuthScopes(requestedScopes.filter((scope) => client.scope.includes(scope)), {
    clientId,
    organizationId: organization.id,
    ownerUserId: user.id
  });
  const code = await createAuthorizationCode({
    clientId,
    codeChallenge,
    organizationId: organization.id,
    ownerUserId: user.id,
    redirectUri,
    scopes
  });
  redirectWithParams(redirectUri, {
    code,
    scope: oauthScopeString(scopes),
    state
  });
}
