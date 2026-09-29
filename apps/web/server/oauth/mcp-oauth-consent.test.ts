import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

test("consent proof binds user, client, callback, challenge, and scopes", async () => {
  const source = fileURLToPath(new URL("./mcp-oauth-consent.ts", import.meta.url));
  const result = await build({
    stdin: { contents: `export * from ${JSON.stringify(source)};`, resolveDir: process.cwd() },
    bundle: true, write: false, format: "esm", platform: "node",
    plugins: [{ name: "mock-secret", setup(api) {
      api.onResolve({ filter: /mcp-oauth$/ }, () => ({ path: "secret", namespace: "mock" }));
      api.onLoad({ filter: /.*/, namespace: "mock" }, () => ({
        contents: `export function getMcpJwtSecret(){return 'local-test-secret';}`, loader: "js"
      }));
    } }]
  });
  const consent = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0]!.text).toString("base64")}`);
  const context = {
    clientId: "dynamic-client", redirectUri: "https://client.example/callback",
    codeChallenge: "a".repeat(43), state: "state", scope: "scan:read scan:create mcp",
    organizationId: "workspace", ownerUserId: "user"
  };
  const issued = consent.createMcpOAuthConsentProof(context, 1000);
  assert.equal(consent.verifyMcpOAuthConsentProof(context, issued.expiresAt, issued.proof, 1001), true);
  for (const [key, value] of [
    ["clientId", "another-client"], ["redirectUri", "https://attacker.example/callback"],
    ["codeChallenge", "b".repeat(43)], ["state", "other"],
    ["scope", "scan:read mcp"], ["organizationId", "other-workspace"],
    ["ownerUserId", "other-user"]
  ] as const) {
    assert.equal(consent.verifyMcpOAuthConsentProof({ ...context, [key]: value }, issued.expiresAt, issued.proof, 1001), false, key);
  }
  assert.equal(consent.verifyMcpOAuthConsentProof(context, issued.expiresAt, issued.proof, 1600), false, "expired proof");
  assert.equal(consent.verifyMcpOAuthConsentProof(context, issued.expiresAt + 1, issued.proof, 1001), false, "changed expiry");
  assert.equal(consent.isTrustedMcpOAuthConnection("certscore_cursor_hosted_oauth_v1", "https://www.cursor.com/agents/mcp/oauth/callback"), true);
  assert.equal(consent.isTrustedMcpOAuthConnection("certscore_cursor_hosted_oauth_v1", "http://localhost:8787/callback"), false);
  assert.equal(consent.isTrustedMcpOAuthConnection("dynamic-client", "https://www.cursor.com/agents/mcp/oauth/callback"), false);
});
