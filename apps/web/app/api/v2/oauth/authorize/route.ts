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
import { recordMcpOAuthAuthorization } from "../../../../../server/oauth/mcp-oauth-authorization-event";
import { isTrustedMcpOAuthConnection, verifyMcpOAuthConsentProof } from "../../../../../server/oauth/mcp-oauth-consent";

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

function boundedFormValue(form: FormData, name: string, maxLength: number) {
  return String(form.get(name) ?? "").slice(0, maxLength);
}

export async function POST(request: Request) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    redirect("/login");
  }
  const form = await request.formData();
  const clientId = boundedFormValue(form, "client_id", 256);
  const redirectUri = boundedFormValue(form, "redirect_uri", 2_048);
  const state = boundedFormValue(form, "state", 1_024);
  const decision = boundedFormValue(form, "decision", 16);
  const consentExpiresAt = Number(boundedFormValue(form, "consent_expires_at", 16));
  const consentProof = boundedFormValue(form, "consent_proof", 64);
  const codeChallenge = boundedFormValue(form, "code_challenge", 128);
  const codeChallengeMethod = boundedFormValue(form, "code_challenge_method", 16);
  const requestedScopes = boundedFormValue(form, "scope", 512).split(/\s+/).filter(Boolean);
  const client = clientId ? await getMcpOAuthClient(clientId) : null;

  if (!client || !redirectUri || !redirectUriAllowed(client, redirectUri)) {
    redirect("/developers/mcp?oauth_error=invalid_request");
  }
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(codeChallenge) || codeChallengeMethod !== "S256") {
    redirect("/developers/mcp?oauth_error=invalid_request");
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
    redirect("/developers/mcp?oauth_error=invalid_scope");
  }
  if (scopeResolution.deniedScopes.length > 0) {
    redirect("/developers/mcp?oauth_error=invalid_scope");
  }
  if (!verifyMcpOAuthConsentProof({
    clientId, redirectUri, codeChallenge, state,
    scope: oauthScopeString(scopeResolution.approvedScopes),
    organizationId: organization.id, ownerUserId: user.id
  }, consentExpiresAt, consentProof)) {
    redirect("/developers/mcp?oauth_error=invalid_consent");
  }
  if (decision !== "approve") {
    if (!isTrustedMcpOAuthConnection(clientId, redirectUri)) {
      redirect("/developers/mcp?oauth_error=access_denied");
    }
    redirectWithParams(redirectUri, { error: "access_denied", state });
  }
  const code = await createAuthorizationCode({
    clientId,
    codeChallenge,
    organizationId: organization.id,
    ownerUserId: user.id,
    redirectUri,
    scopes: scopeResolution.approvedScopes
  });
  await recordMcpOAuthAuthorization({ client, sessionUser, organization, user });
  redirectWithParams(redirectUri, {
    code,
    scope: oauthScopeString(scopeResolution.approvedScopes),
    state
  });
}
