import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { oauthScopeString } from "@certscore/mcp-auth";
import { SiteHeader } from "../../../components/layout/site-header";
import { getCurrentUser } from "../../../server/auth";
import { bootstrapAppUserSession } from "../../../server/bootstrap-user";
import { getMcpOAuthClient, redirectUriAllowed, resolveMcpOAuthRequestedScopes } from "../../../server/oauth/mcp-oauth";

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
      <SiteHeader />
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
  const rawRequestedScopes = first(params.scope)?.split(/\s+/).filter(Boolean) ?? [];

  if (
    responseType !== "code" ||
    !clientId ||
    clientId.length > 256 ||
    !redirectUri ||
    redirectUri.length > 2_048 ||
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

  return (
    <main className="min-h-screen bg-slate-50">
      <SiteHeader />
      <section className="mx-auto max-w-xl px-6 py-20">
        <Card className="border-slate-200 bg-white shadow-none">
          <CardHeader>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">CertScore.ai MCP</p>
            <CardTitle>Connect {client.clientName}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-sm leading-7 text-slate-600">
              This app is requesting access to CertScore.ai MCP tools for {organization.name}. CertScore.ai MCP returns public-web
              risk signals for human and agentic review and does not provide legal advice or compliance certification.
            </p>
            <div className="rounded border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <p className="font-semibold text-slate-900">Requested scopes</p>
              <p className="mt-2 font-mono text-xs">{requestedScope}</p>
            </div>
            <form action="/api/v2/oauth/authorize" className="flex gap-3" method="post">
              <input name="client_id" type="hidden" value={clientId} />
              <input name="redirect_uri" type="hidden" value={redirectUri} />
              <input name="scope" type="hidden" value={requestedScope} />
              <input name="state" type="hidden" value={state} />
              <input name="code_challenge" type="hidden" value={codeChallenge} />
              <input name="code_challenge_method" type="hidden" value="S256" />
              <input name="organization_id" type="hidden" value={organization.id} />
              <input name="owner_user_id" type="hidden" value={user.id} />
              <button className="rounded bg-slate-950 px-4 py-2 text-sm font-semibold text-white" name="decision" type="submit" value="approve">
                Approve
              </button>
              <button className="rounded border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700" name="decision" type="submit" value="deny">
                Deny
              </button>
            </form>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
