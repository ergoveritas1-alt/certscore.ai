import assert from "node:assert/strict";
import test from "node:test";
import {
  mapOAuthScopesToIntegrationScopes,
  normalizeOAuthScopes,
  signCertScoreAccessToken,
  verifyCertScoreAccessToken
} from "./index.js";

test("OAuth scopes map onto existing CertScore integration scopes", () => {
  assert.deepEqual(normalizeOAuthScopes("scan:read mcp unknown"), ["scan:read", "mcp"]);
  assert.deepEqual(mapOAuthScopesToIntegrationScopes(["scan:read", "mcp"]), ["mcp", "pulse:read"]);
  assert.deepEqual(mapOAuthScopesToIntegrationScopes(["scan:create", "mcp"]), ["mcp", "pulse:read", "pulse:scan"]);
});

test("access tokens are signed and validated with issuer and audience", () => {
  const token = signCertScoreAccessToken({
    audience: "https://mcp.certscore.ai",
    clientId: "client_123",
    issuer: "https://certscore.ai",
    jwtSecret: "test-secret",
    organizationId: "org_123",
    scopes: ["scan:read", "mcp"],
    subject: "user_123",
    userId: "user_123"
  });
  const result = verifyCertScoreAccessToken({
    audience: "https://mcp.certscore.ai",
    issuer: "https://certscore.ai",
    jwtSecret: "test-secret",
    token
  });
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.claims.client_id, "client_123");
});
