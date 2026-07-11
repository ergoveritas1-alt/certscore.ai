import assert from "node:assert/strict";
import test from "node:test";
import {
  CERTSCORE_OAUTH_CREATE_SCOPE,
  CERTSCORE_OAUTH_MCP_SCOPE,
  CERTSCORE_OAUTH_READ_SCOPE
} from "@certscore/mcp-auth";
import { resolveMcpOAuthScopeRequest } from "./mcp-oauth-scopes";
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

test("invalid OAuth clients cannot select an external error redirect", () => {
  const source = readFileSync(new URL("../../app/api/v2/oauth/authorize/route.ts", import.meta.url), "utf8");
  assert.match(source, /redirect\("\/developers\/mcp\?oauth_error=invalid_request"\)/);
  assert.doesNotMatch(source, /redirectWithParams\(redirectUri \|\|/);
});
