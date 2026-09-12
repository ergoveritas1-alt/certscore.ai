import assert from "node:assert/strict";
import test from "node:test";
import type { CertScoreAccessTokenClaims } from "@certscore/mcp-auth";
import { oauthSessionIdentity, oauthSessionMismatch } from "./session-identity.js";

const claims: CertScoreAccessTokenClaims = {
  iss: "https://issuer.test", aud: "https://mcp.test", sub: "user-a", client_id: "client-a",
  iat: 10, exp: 100, jti: "first-token-identifier", scope: "mcp scan:read scan:create",
  certscore: { source: "mcp-oauth", organizationId: "org-a", userId: "user-a", scopes: ["mcp", "pulse:read", "pulse:scan"] },
};

test("OAuth session identity permits token rotation and scope reordering", () => {
  const replacement = { ...claims, jti: "replacement-token", iat: 20, exp: 200,
    scope: "scan:create  mcp scan:read mcp", certscore: { ...claims.certscore, scopes: [...claims.certscore.scopes].reverse() } };
  assert.equal(oauthSessionMismatch(oauthSessionIdentity(claims), oauthSessionIdentity(replacement)), null);
});

test("OAuth session identity isolates every principal and permission boundary", () => {
  const cases: [string, CertScoreAccessTokenClaims][] = [
    ["issuer", { ...claims, iss: "https://other.test" }],
    ["audience", { ...claims, aud: "https://other.test" }],
    ["subject", { ...claims, sub: "other" }],
    ["client", { ...claims, client_id: "other" }],
    ["organization", { ...claims, certscore: { ...claims.certscore, organizationId: null } }],
    ["user", { ...claims, certscore: { ...claims.certscore, userId: null } }],
    ["scopes", { ...claims, scope: "mcp scan:read" }],
    ["integrationScopes", { ...claims, certscore: { ...claims.certscore, scopes: ["mcp"] } }],
  ];
  for (const [field, other] of cases) {
    assert.equal(oauthSessionMismatch(oauthSessionIdentity(claims), oauthSessionIdentity(other)), field);
    assert.equal(oauthSessionMismatch(oauthSessionIdentity(other), oauthSessionIdentity(claims)), field);
  }
});
