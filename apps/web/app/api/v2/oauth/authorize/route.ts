import { redirect } from "next/navigation";
import { oauthScopeString } from "@certscore/mcp-auth";
import { getCurrentUser } from "../../../../../server/auth";
import { bootstrapAppUserSession } from "../../../../../server/bootstrap-user";
import { isPlatformAdminEmail } from "../../../../../server/admin/platform-admin";
import {
  createAuthorizationCode,
  getMcpOAuthClient,
  redirectUriAllowed,
  resolveMcpOAuthRequestedScopes
} from "../../../../../server/oauth/mcp-oauth";
import { isClaudeMcpOAuthClientMetadata } from "../../../../../server/oauth/mcp-oauth-scopes";
import { persistProductAnalyticsEvent } from "../../../../../server/product-analytics/repository";

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
  const codeChallenge = boundedFormValue(form, "code_challenge", 128);
  const codeChallengeMethod = boundedFormValue(form, "code_challenge_method", 16);
  const requestedScopes = boundedFormValue(form, "scope", 512).split(/\s+/).filter(Boolean);
  const client = clientId ? await getMcpOAuthClient(clientId) : null;

  if (!client || !redirectUri || !redirectUriAllowed(client, redirectUri)) {
    redirect("/developers/mcp?oauth_error=invalid_request");
  }
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(codeChallenge) || codeChallengeMethod !== "S256") {
    redirectWithParams(redirectUri, {
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
  await persistProductAnalyticsEvent({
    category: "account",
    eventName: "oauth_authorized",
    feature: isClaudeMcpOAuthClientMetadata(client) ? "mcp:claude" : "mcp:oauth",
    outcome: "success",
    route: "/oauth/authorize"
  }, {
    browserFamily: "server",
    consentState: "operational",
    countryCode: null,
    deviceClass: "unknown",
    isBot: false,
    isStaff: isPlatformAdminEmail(sessionUser.email),
    osFamily: "server",
    organizationId: organization.id,
    referringDomain: null,
    userId: user.id
  }).catch((error) => {
    console.error(JSON.stringify({
      event: "oauth_authorized.write_failed",
      clientKind: isClaudeMcpOAuthClientMetadata(client) ? "claude" : "other",
      errorClass: error instanceof Error ? error.name : "UnknownError"
    }));
  });
  redirectWithParams(redirectUri, {
    code,
    scope: oauthScopeString(scopeResolution.approvedScopes),
    state
  });
}
