import assert from "node:assert/strict";
import test from "node:test";
import {
  CERTSCORE_OAUTH_CREATE_SCOPE,
  CERTSCORE_OAUTH_MCP_SCOPE,
  CERTSCORE_OAUTH_READ_SCOPE
} from "@certscore/mcp-auth";
import { resolveMcpOAuthScopeRequest } from "./mcp-oauth-scopes";

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
});

test("scan:create is denied explicitly instead of silently dropped when no grant exists", () => {
  const resolution = resolveMcpOAuthScopeRequest({
    clientScopes: [CERTSCORE_OAUTH_READ_SCOPE, CERTSCORE_OAUTH_MCP_SCOPE],
    requestedScopes: [CERTSCORE_OAUTH_READ_SCOPE, CERTSCORE_OAUTH_CREATE_SCOPE, CERTSCORE_OAUTH_MCP_SCOPE],
    scanCreateGranted: false
  });

  assert.deepEqual(resolution.approvedScopes, [CERTSCORE_OAUTH_READ_SCOPE, CERTSCORE_OAUTH_MCP_SCOPE]);
  assert.deepEqual(resolution.deniedScopes, [CERTSCORE_OAUTH_CREATE_SCOPE]);
});
