import assert from "node:assert/strict";
import test from "node:test";
import {
  exportJWK,
  generateKeyPair,
  SignJWT,
  createLocalJWKSet,
  type JWTPayload
} from "jose";
import {
  createMicrosoftEntraTokenValidator,
  microsoftEntraIssuer,
  microsoftEntraJwksUrl
} from "./microsoft-entra-auth.js";

const tenantId = "11111111-1111-4111-8111-111111111111";
const audience = "22222222-2222-4222-8222-222222222222";
const allowedClientId = "33333333-3333-4333-8333-333333333333";
const kid = "microsoft-test-key";

async function fixture() {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const publicJwk = await exportJWK(publicKey);
  const getKey = createLocalJWKSet({ keys: [{ ...publicJwk, alg: "RS256", kid, use: "sig" }] });
  const validator = createMicrosoftEntraTokenValidator({
    allowedClientId,
    audience,
    requiredRole: "Mcp.Access",
    tenantId
  }, { getKey });
  const sign = async (overrides: JWTPayload = {}) => new SignJWT({
    azp: allowedClientId,
    roles: ["Mcp.Access"],
    tid: tenantId,
    ver: "2.0",
    ...overrides
  })
    .setProtectedHeader({ alg: "RS256", kid, typ: "JWT" })
    .setAudience(typeof overrides.aud === "string" ? overrides.aud : audience)
    .setIssuer(typeof overrides.iss === "string" ? overrides.iss : microsoftEntraIssuer(tenantId))
    .setIssuedAt()
    .setNotBefore(typeof overrides.nbf === "number" ? overrides.nbf : Math.floor(Date.now() / 1000) - 5)
    .setExpirationTime(typeof overrides.exp === "number" ? overrides.exp : Math.floor(Date.now() / 1000) + 300)
    .sign(privateKey);
  return { sign, validator };
}

test("Microsoft Entra endpoints are tenant-specific", () => {
  assert.equal(microsoftEntraIssuer(tenantId), `https://login.microsoftonline.com/${tenantId}/v2.0`);
  assert.equal(microsoftEntraJwksUrl(tenantId), `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`);
});

test("Microsoft Entra validator accepts only the configured app-only token", async () => {
  const { sign, validator } = await fixture();
  const result = await validator.verify(await sign());
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.clientId, allowedClientId);
    assert.equal(result.tenantId, tenantId);
    assert.deepEqual(result.claims.roles, ["Mcp.Access"]);
  }
});

test("Microsoft Entra validator fails closed for malformed and invalid claims", async () => {
  const { sign, validator } = await fixture();
  const now = Math.floor(Date.now() / 1000);
  const cases: Array<[string, string, "invalid_token" | "wrong_client" | "missing_role"]> = [
    ["malformed", "not-a-jwt", "invalid_token"],
    ["wrong issuer", await sign({ iss: microsoftEntraIssuer("44444444-4444-4444-8444-444444444444") }), "invalid_token"],
    ["wrong tenant", await sign({ tid: "44444444-4444-4444-8444-444444444444" }), "invalid_token"],
    ["wrong audience", await sign({ aud: "44444444-4444-4444-8444-444444444444" }), "invalid_token"],
    ["expired", await sign({ exp: now - 60 }), "invalid_token"],
    ["not active", await sign({ nbf: now + 60 }), "invalid_token"],
    ["wrong client", await sign({ azp: "44444444-4444-4444-8444-444444444444" }), "wrong_client"],
    ["missing role", await sign({ roles: [] }), "missing_role"],
    ["delegated token", await sign({ scp: "Mcp.Access" }), "invalid_token"],
    ["wrong token version", await sign({ ver: "1.0" }), "invalid_token"]
  ];

  for (const [name, token, reason] of cases) {
    const result = await validator.verify(token);
    assert.deepEqual(result, { ok: false, reason }, name);
  }
});
