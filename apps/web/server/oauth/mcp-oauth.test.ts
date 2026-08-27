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

test("automatic scan:create remains grant-gated and registration-bounded", () => {
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
  assert.deepEqual(notRegistered.approvedScopes, [CERTSCORE_OAUTH_READ_SCOPE, CERTSCORE_OAUTH_MCP_SCOPE]);
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

test("read-only OAuth consent directs empty workspaces to their first scan", () => {
  const page = readFileSync(new URL("../../app/oauth/authorize/page.tsx", import.meta.url), "utf8");
  const server = readFileSync(new URL("./mcp-oauth.ts", import.meta.url), "utf8");

  assert.match(page, /This connection is read-only\./);
  assert.match(page, /cannot create the first scan with the requested access/);
  assert.match(page, /href="\/app#scan-a-site"/);
  assert.match(page, /CERTSCORE_OAUTH_CREATE_SCOPE/);
  assert.match(server, /getMcpOAuthWorkspaceActivity/);
  assert.match(server, /from scans where organization_id = \$1/);
});

test("active Trial Claude connections receive grant-gated scan creation", () => {
  const registrationRoute = readFileSync(new URL("../../app/api/v2/oauth/register/route.ts", import.meta.url), "utf8");
  const server = readFileSync(new URL("./mcp-oauth.ts", import.meta.url), "utf8");

  assert.match(registrationRoute, /isClaudeMcpOAuthClientMetadata/);
  assert.match(registrationRoute, /requestedScopes, CERTSCORE_OAUTH_CREATE_SCOPE/);
  assert.match(server, /organizations\.plan = 'free'/);
  assert.match(server, /organizations\.plan_status = 'active'/);
  assert.match(server, /jsonb_array_length\(mcp_oauth_clients\.redirect_uris\) > 0/);
  assert.match(server, /redirect_uri !~ '\^https:\/\/claude\\\\\.ai/);
  assert.match(server, /organization_members\.user_id::text = \$3/);
  assert.match(server, /autoIncludeGrantedCreateScope: isClaudeMcpOAuthClientMetadata\(input\.client\)/);
  assert.match(registrationRoute, /CERTSCORE_OAUTH_CREATE_SCOPE/);
  const consentPage = readFileSync(new URL("../../app/oauth/authorize/page.tsx", import.meta.url), "utf8");
  assert.match(consentPage, /Claude can start your first scan\./);
  assert.match(consentPage, /OAUTH_SCAN_CREATE_HOURLY_LIMIT/);
  assert.match(consentPage, /OAUTH_SCAN_CREATE_DAILY_LIMIT/);
  assert.match(consentPage, /Scan https:\/\/your-site\.com with CertScore and summarize the findings\./);
  const authorizationRoute = readFileSync(new URL("../../app/api/v2/oauth/authorize/route.ts", import.meta.url), "utf8");
  assert.match(authorizationRoute, /eventName: "oauth_authorized"/);
  assert.match(authorizationRoute, /persistProductAnalyticsEvent/);
});
