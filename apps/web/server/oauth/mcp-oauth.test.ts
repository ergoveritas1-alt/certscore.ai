import assert from "node:assert/strict";
import test from "node:test";
import {
  CERTSCORE_OAUTH_CREATE_SCOPE,
  CERTSCORE_OAUTH_MCP_SCOPE,
  CERTSCORE_OAUTH_READ_SCOPE
} from "@certscore/mcp-auth";
import { isClaudeMcpOAuthClientMetadata, resolveMcpOAuthScopeRequest } from "./mcp-oauth-scopes";
import { isAllowedMcpOAuthRedirectUri } from "./mcp-oauth-scopes";
import { readFileSync } from "node:fs";

test("scan:create can be approved for a read-only registered client when a grant exists", () => {
  const resolution = resolveMcpOAuthScopeRequest({
    clientScopes: [CERTSCORE_OAUTH_READ_SCOPE, CERTSCORE_OAUTH_MCP_SCOPE],
    requestedScopes: [CERTSCORE_OAUTH_READ_SCOPE, CERTSCORE_OAUTH_CREATE_SCOPE, CERTSCORE_OAUTH_MCP_SCOPE],
    scanCreateGranted: true
  });

  assert.deepEqual(resolution.approvedScopes, [
    CERTSCORE_OAUTH_READ_SCOPE,
    CERTSCORE_OAUTH_CREATE_SCOPE,
    CERTSCORE_OAUTH_MCP_SCOPE
  ]);
  assert.deepEqual(resolution.deniedScopes, []);
  assert.deepEqual(resolution.downgradedScopes, []);
  assert.deepEqual(resolution.invalidScopes, []);
});

test("eligible Claude clients carry registered scan:create into a read-only authorization request", () => {
  const resolution = resolveMcpOAuthScopeRequest({
    autoIncludeGrantedCreateScope: true,
    clientScopes: [CERTSCORE_OAUTH_READ_SCOPE, CERTSCORE_OAUTH_CREATE_SCOPE, CERTSCORE_OAUTH_MCP_SCOPE],
    requestedScopes: [CERTSCORE_OAUTH_READ_SCOPE, CERTSCORE_OAUTH_MCP_SCOPE],
    scanCreateGranted: true
  });

  assert.deepEqual(resolution.approvedScopes, [
    CERTSCORE_OAUTH_READ_SCOPE,
    CERTSCORE_OAUTH_MCP_SCOPE,
    CERTSCORE_OAUTH_CREATE_SCOPE
  ]);
  assert.deepEqual(resolution.downgradedScopes, []);
});

test("automatic scan:create requires workspace eligibility and supports older registrations", () => {
  const notGranted = resolveMcpOAuthScopeRequest({
    autoIncludeGrantedCreateScope: true,
    clientScopes: [CERTSCORE_OAUTH_READ_SCOPE, CERTSCORE_OAUTH_CREATE_SCOPE, CERTSCORE_OAUTH_MCP_SCOPE],
    requestedScopes: [CERTSCORE_OAUTH_READ_SCOPE, CERTSCORE_OAUTH_MCP_SCOPE],
    scanCreateGranted: false
  });
  assert.deepEqual(notGranted.approvedScopes, [CERTSCORE_OAUTH_READ_SCOPE, CERTSCORE_OAUTH_MCP_SCOPE]);
  assert.deepEqual(notGranted.downgradedScopes, [CERTSCORE_OAUTH_CREATE_SCOPE]);

  const notRegistered = resolveMcpOAuthScopeRequest({
    autoIncludeGrantedCreateScope: true,
    clientScopes: [CERTSCORE_OAUTH_READ_SCOPE, CERTSCORE_OAUTH_MCP_SCOPE],
    requestedScopes: [CERTSCORE_OAUTH_READ_SCOPE, CERTSCORE_OAUTH_MCP_SCOPE],
    scanCreateGranted: true
  });
  assert.deepEqual(notRegistered.approvedScopes, [CERTSCORE_OAUTH_READ_SCOPE, CERTSCORE_OAUTH_MCP_SCOPE, CERTSCORE_OAUTH_CREATE_SCOPE]);
  assert.deepEqual(notRegistered.downgradedScopes, []);
});

test("ungranted scan:create is downgraded while default scopes proceed", () => {
  const resolution = resolveMcpOAuthScopeRequest({
    clientScopes: [CERTSCORE_OAUTH_READ_SCOPE, CERTSCORE_OAUTH_MCP_SCOPE],
    requestedScopes: [CERTSCORE_OAUTH_READ_SCOPE, CERTSCORE_OAUTH_CREATE_SCOPE, CERTSCORE_OAUTH_MCP_SCOPE],
    scanCreateGranted: false
  });

  assert.deepEqual(resolution.approvedScopes, [CERTSCORE_OAUTH_READ_SCOPE, CERTSCORE_OAUTH_MCP_SCOPE]);
  assert.deepEqual(resolution.deniedScopes, []);
  assert.deepEqual(resolution.downgradedScopes, [CERTSCORE_OAUTH_CREATE_SCOPE]);
  assert.deepEqual(resolution.invalidScopes, []);
});

test("unsupported scopes are invalid instead of silently dropped", () => {
  const resolution = resolveMcpOAuthScopeRequest({
    clientScopes: [CERTSCORE_OAUTH_READ_SCOPE, CERTSCORE_OAUTH_MCP_SCOPE],
    requestedScopes: [CERTSCORE_OAUTH_READ_SCOPE, "profile", CERTSCORE_OAUTH_MCP_SCOPE],
    scanCreateGranted: false
  });

  assert.deepEqual(resolution.approvedScopes, [CERTSCORE_OAUTH_READ_SCOPE, CERTSCORE_OAUTH_MCP_SCOPE]);
  assert.deepEqual(resolution.deniedScopes, []);
  assert.deepEqual(resolution.downgradedScopes, []);
  assert.deepEqual(resolution.invalidScopes, ["profile"]);
});

test("OAuth redirect URIs require HTTPS except for HTTP loopback clients", () => {
  assert.equal(isAllowedMcpOAuthRedirectUri("https://client.example/callback"), true);
  assert.equal(isAllowedMcpOAuthRedirectUri("http://localhost:3000/callback"), true);
  assert.equal(isAllowedMcpOAuthRedirectUri("http://127.0.0.1:4312/callback"), true);
  assert.equal(isAllowedMcpOAuthRedirectUri("http://client.example/callback"), false);
  assert.equal(isAllowedMcpOAuthRedirectUri("ftp://localhost/callback"), false);
  assert.equal(isAllowedMcpOAuthRedirectUri("https://user:pass@client.example/callback"), false);
  assert.equal(isAllowedMcpOAuthRedirectUri("https://client.example/callback#fragment"), false);
});

test("automatic scan creation eligibility is limited to Claude's HTTPS callback", () => {
  assert.equal(isClaudeMcpOAuthClientMetadata({ clientName: "Claude", redirectUris: ["https://claude.ai/api/mcp/auth_callback"] }), true);
  assert.equal(isClaudeMcpOAuthClientMetadata({
    clientName: "Claude",
    redirectUris: ["https://claude.ai/api/mcp/auth_callback", "http://localhost:4312/callback"]
  }), false);
  assert.equal(isClaudeMcpOAuthClientMetadata({ clientName: "Claude", redirectUris: [] }), false);
  assert.equal(isClaudeMcpOAuthClientMetadata({ clientName: "Claude", redirectUris: ["https://example.com/callback"] }), false);
  assert.equal(isClaudeMcpOAuthClientMetadata({ clientName: "Other", redirectUris: ["https://claude.ai/api/mcp/auth_callback"] }), false);
});

test("invalid OAuth clients cannot select an external error redirect", () => {
  const source = readFileSync(new URL("../../app/api/v2/oauth/authorize/route.ts", import.meta.url), "utf8");
  assert.match(source, /redirect\("\/developers\/mcp\?oauth_error=invalid_request"\)/);
  assert.doesNotMatch(source, /redirectWithParams\(redirectUri \|\|/);
});

test("OAuth requires consent for unfamiliar clients and reuses exact callback grants", () => {
  const page = readFileSync(new URL("../../app/oauth/authorize/page.tsx", import.meta.url), "utf8");
  assert.match(page, /<form action="\/api\/v2\/oauth\/authorize"/);
  assert.match(page, /hasReusableMcpOAuthConsent/);
  assert.match(page, /isTrustedMcpOAuthConnection/);
  assert.match(page, /name="decision" value="approve"/);
  assert.match(page, /redirect\(`\/login\?next=/);
  assert.match(page, /redirectUriAllowed\(client, redirectUri\)/);
  assert.match(page, /codeChallengeMethod !== "S256"/);
  assert.match(page, /scopeResolution.invalidScopes.length > 0/);
  assert.match(page, /scopeResolution.deniedScopes.length > 0/);
  assert.match(page, /organizationId: organization.id, ownerUserId: user.id/);
  assert.match(page, /scopes: scopeResolution.approvedScopes/);
  assert.match(page, /target.searchParams.set\("state", state\)/);
});

test("active workspace connections receive client-independent self-serve scan creation", () => {
  const registrationRoute = readFileSync(new URL("../../app/api/v2/oauth/register/route.ts", import.meta.url), "utf8");
  const server = readFileSync(new URL("./mcp-oauth.ts", import.meta.url), "utf8");

  assert.doesNotMatch(registrationRoute, /isClaudeMcpOAuthClientMetadata/);
  assert.match(registrationRoute, /requestedScopes, CERTSCORE_OAUTH_CREATE_SCOPE/);
  assert.doesNotMatch(server, /organizations\.plan =/);
  assert.match(server, /organizations\.plan_status = 'active'/);
  assert.match(server, /jsonb_array_length\(mcp_oauth_clients\.redirect_uris\) > 0/);
  assert.doesNotMatch(server, /lower\(btrim\(mcp_oauth_clients\.client_name\)\)/);
  assert.match(server, /organization_members\.user_id::text = \$3/);
  assert.match(server, /autoIncludeGrantedCreateScope: true/);
  assert.match(registrationRoute, /CERTSCORE_OAUTH_CREATE_SCOPE/);
  const authorizationRoute = readFileSync(new URL("../../app/api/v2/oauth/authorize/route.ts", import.meta.url), "utf8");
  assert.match(authorizationRoute, /recordMcpOAuthAuthorization/);
  const event = readFileSync(new URL("./mcp-oauth-authorization-event.ts", import.meta.url), "utf8");
  assert.match(event, /eventName: "oauth_authorized"/);
});


test("self-serve eligibility requires active membership on every plan and ignores manual grants", { skip: !process.env.OAUTH_TRIAL_TEST_DATABASE_URL }, async () => {
  const databaseUrl = process.env.OAUTH_TRIAL_TEST_DATABASE_URL;
  if (!databaseUrl) throw new Error("Set OAUTH_TRIAL_TEST_DATABASE_URL to a local PostgreSQL test database");
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname));
  const { default: pg } = await import("pg");
  const db = new pg.Client({ connectionString: databaseUrl });
  await db.connect();
  try {
    await db.query(`create temp table organizations(id text, plan text, plan_status text);
      create temp table organization_members(organization_id text,user_id text);
      create temp table mcp_oauth_clients(client_id text, client_name text, redirect_uris jsonb);
      create temp table mcp_oauth_scan_create_grants(grant_kind text, grantee_id text, revoked_at timestamptz);
      insert into organizations values ('trial','free','active'),('expired','free','inactive'),('paid','pro','active'),('custom','custom','active');
      insert into organization_members values ('trial','member'),('expired','member'),('paid','member'),('custom','member');
      insert into mcp_oauth_clients values ('cursor','Cursor','["https://www.cursor.com/agents/mcp/oauth/callback"]'),('generic','Other','["http://localhost:8787/callback"]');`);
    const source = readFileSync(new URL("./mcp-oauth.ts", import.meta.url), "utf8");
    const start = source.indexOf("`select true as allowed");
    const sql = source.slice(start + 1, source.indexOf("`,", start));
    for (const client of ["cursor", "generic"]) {
      assert.equal((await db.query(sql,[client,"trial","member"])).rowCount,1);
      for (const org of ["paid","custom"]) assert.equal((await db.query(sql,[client,org,"member"])).rowCount,1);
      for (const [org,user] of [["trial","outsider"],["expired","member"]]) {
        assert.equal((await db.query(sql,[client,org,user])).rowCount,0);
      }
    }
    assert.equal((await db.query(sql,["unknown","trial","member"])).rowCount,0);
    await db.query("insert into mcp_oauth_scan_create_grants values ('organization','expired',null)");
    assert.equal((await db.query(sql,["cursor","expired","member"])).rowCount,0);
    await db.query("update mcp_oauth_scan_create_grants set revoked_at=now()");
    assert.equal((await db.query(sql,["cursor","expired","member"])).rowCount,0);
  } finally { await db.end(); }
});
