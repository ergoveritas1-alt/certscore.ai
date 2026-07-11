import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "./route";

test("OAuth authorization-server metadata advertises PKCE and truthful endpoints", async () => {
  const response = await GET();
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  assert.equal(body.issuer, "https://certscore.ai");
  assert.equal(body.authorization_endpoint, "https://certscore.ai/oauth/authorize");
  assert.equal(body.token_endpoint, "https://certscore.ai/api/v2/oauth/token");
  assert.equal(body.registration_endpoint, "https://certscore.ai/api/v2/oauth/register");
  assert.deepEqual(body.code_challenge_methods_supported, ["S256"]);
  assert.deepEqual(body.scopes_supported, ["scan:read", "mcp"]);
  assert.deepEqual(body.grant_gated_scopes, ["scan:create"]);
});
