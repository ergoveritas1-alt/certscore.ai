import { recordMcpOAuthAuthorization } from "../../../server/oauth/mcp-oauth-authorization-event";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { oauthScopeString } from "@certscore/mcp-auth";
import { getCurrentUser } from "../../../server/auth";
import { bootstrapAppUserSession } from "../../../server/bootstrap-user";
import {
  createAuthorizationCode,
  getMcpOAuthClient,
  hasReusableMcpOAuthConsent,
  redirectUriAllowed,
  resolveMcpOAuthRequestedScopes
} from "../../../server/oauth/mcp-oauth";
import { createMcpOAuthConsentProof, isTrustedMcpOAuthConnection } from "../../../server/oauth/mcp-oauth-consent";

export const dynamic = "force-dynamic";

type AuthorizePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function currentAuthorizePath(params: Record<string, string | string[] | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const item = first(value);
    if (item) {
      search.set(key, item);
    }
  }
  return `/oauth/authorize?${search.toString()}`;
}

function invalidRequest(message: string) {
  return (
    <main className="min-h-screen bg-slate-50">
      <header className="px-6 py-5"><Link href="/" className="font-semibold text-slate-900">CertScore.ai</Link></header>
      <section className="mx-auto max-w-xl px-6 py-20">
        <Card className="border-slate-200 bg-white shadow-none">
          <CardHeader>
            <CardTitle>OAuth request unavailable</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-7 text-slate-600">{message}</p>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

export default async function AuthorizePage({ searchParams }: AuthorizePageProps) {
  const params = (await searchParams) ?? {};
  const responseType = first(params.response_type);
  const clientId = first(params.client_id);
  const redirectUri = first(params.redirect_uri);
  const codeChallenge = first(params.code_challenge);
  const codeChallengeMethod = first(params.code_challenge_method);
  const state = first(params.state) ?? "";
  const prompt = first(params.prompt);
  const rawScope = first(params.scope) ?? "";
  const rawRequestedScopes = rawScope.split(/\s+/).filter(Boolean);

  if (
    responseType !== "code" ||
    !clientId ||
    clientId.length > 256 ||
    !redirectUri ||
    redirectUri.length > 2_048 ||
    state.length > 1_024 ||
    rawScope.length > 512 ||
    !codeChallenge ||
    !/^[A-Za-z0-9_-]{43,128}$/.test(codeChallenge) ||
    codeChallengeMethod !== "S256"
  ) {
    return invalidRequest("This OAuth request is missing a valid client, redirect URI, or PKCE S256 challenge.");
  }
  const client = await getMcpOAuthClient(clientId);
  if (!client || !redirectUriAllowed(client, redirectUri)) {
    return invalidRequest("This OAuth client is not registered for the requested redirect URI.");
  }
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    redirect(`/login?next=${encodeURIComponent(currentAuthorizePath(params))}`);
  }
  const { organization, user } = await bootstrapAppUserSession(sessionUser);
  const scopeResolution = await resolveMcpOAuthRequestedScopes({
    client,
    requestedScopes: rawRequestedScopes,
    context: {
      clientId,
      organizationId: organization.id,
      ownerUserId: user.id
    }
  });
  if (scopeResolution.invalidScopes.length > 0) {
    return invalidRequest(
      `This OAuth client requested unsupported scopes: ${scopeResolution.invalidScopes.join(" ")}.`
    );
  }
  if (scopeResolution.deniedScopes.length > 0) {
    return invalidRequest(
      `This OAuth client requested scopes that are not available for this account: ${oauthScopeString(scopeResolution.deniedScopes)}.`
    );
  }
  const requestedScope = oauthScopeString(scopeResolution.approvedScopes);
  const trusted = isTrustedMcpOAuthConnection(clientId, redirectUri);
  const reusable = prompt !== "consent" && !trusted && await hasReusableMcpOAuthConsent({
    clientId, organizationId: organization.id, ownerUserId: user.id,
    redirectUri, scopes: scopeResolution.approvedScopes
  });
  if (prompt === "consent" || (!trusted && !reusable)) {
    const consent = createMcpOAuthConsentProof({
      clientId, redirectUri, codeChallenge, state, scope: requestedScope,
      organizationId: organization.id, ownerUserId: user.id
    });
    return (
      <main className="min-h-screen bg-slate-50">
        <header className="px-6 py-5"><Link href="/" className="font-semibold text-slate-900">CertScore.ai</Link></header>
        <section className="mx-auto max-w-xl px-6 py-16">
          <Card className="border-slate-200 bg-white shadow-none">
            <CardHeader><CardTitle>Connect an MCP client?</CardTitle></CardHeader>
            <CardContent className="space-y-5 text-sm text-slate-700">
              <p><strong>{client.clientName}</strong> wants access to your CertScore workspace. Client names are supplied by the client and are not verified.</p>
              <div>
                <p className="font-semibold text-slate-900">Connection destination</p>
                <p className="break-all">{redirectUri}</p>
              </div>
              <div>
                <p className="font-semibold text-slate-900">Access requested</p>
                <ul className="list-disc pl-5">
                  {scopeResolution.approvedScopes.includes("scan:read") && <li>Read your workspace scans and reports</li>}
                  {scopeResolution.approvedScopes.includes("scan:create") && <li>Start scans in your workspace</li>}
                  {scopeResolution.approvedScopes.includes("mcp") && <li>Use CertScore MCP tools</li>}
                </ul>
              </div>
              <form action="/api/v2/oauth/authorize" method="post" className="flex flex-wrap gap-3 pt-2">
                <input type="hidden" name="client_id" value={clientId} />
                <input type="hidden" name="redirect_uri" value={redirectUri} />
                <input type="hidden" name="code_challenge" value={codeChallenge} />
                <input type="hidden" name="code_challenge_method" value={codeChallengeMethod} />
                <input type="hidden" name="scope" value={requestedScope} />
                <input type="hidden" name="state" value={state} />
                <input type="hidden" name="consent_expires_at" value={consent.expiresAt} />
                <input type="hidden" name="consent_proof" value={consent.proof} />
                <button type="submit" name="decision" value="approve" className="rounded-md bg-slate-900 px-5 py-2 font-semibold text-white">Connect</button>
                <button type="submit" name="decision" value="deny" className="rounded-md border border-slate-300 px-5 py-2 font-semibold text-slate-900">Cancel</button>
              </form>
            </CardContent>
          </Card>
        </section>
      </main>
    );
  }
  const code = await createAuthorizationCode({
    clientId, organizationId: organization.id, ownerUserId: user.id,
    redirectUri, codeChallenge, scopes: scopeResolution.approvedScopes
  });
  await recordMcpOAuthAuthorization({ client, sessionUser, organization, user });
  const target = new URL(redirectUri);
  target.searchParams.set("code", code);
  target.searchParams.set("scope", requestedScope);
  if (state) target.searchParams.set("state", state);
  redirect(target.toString());
}
