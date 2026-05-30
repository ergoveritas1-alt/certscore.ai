import assert from "node:assert/strict";
import test from "node:test";
import { generateIntegrationApiKey, getIntegrationApiKeyPrefix, hashIntegrationApiKey, isIntegrationApiKeyScope, parseBearerToken } from "./api-keys";

test("generateIntegrationApiKey creates preview keys with stable prefixes", () => {
  const token = generateIntegrationApiKey();
  assert.match(token, /^cs_preview_[A-Za-z0-9_-]{32,}$/);
  assert.match(getIntegrationApiKeyPrefix(token), /^cs_preview_[A-Za-z0-9_-]{8}$/);
});

test("generateIntegrationApiKey supports live keys", () => {
  const token = generateIntegrationApiKey("cs_live");
  assert.match(token, /^cs_live_[A-Za-z0-9_-]{32,}$/);
  assert.match(getIntegrationApiKeyPrefix(token), /^cs_live_[A-Za-z0-9_-]{8}$/);
});

test("hashIntegrationApiKey is deterministic and does not expose the raw token", () => {
  const token = "cs_preview_testtokenabcdefghijklmnopqrstuvwxyz123456";
  const hash = hashIntegrationApiKey(token);
  assert.equal(hash, hashIntegrationApiKey(token));
  assert.equal(hash.length, 64);
  assert.doesNotMatch(hash, /testtoken/);
});

test("parseBearerToken accepts bearer authorization only", () => {
  assert.deepEqual(parseBearerToken(new Request("https://certscore.ai")), { provided: false, token: null });
  assert.deepEqual(parseBearerToken(new Request("https://certscore.ai", { headers: { authorization: "Bearer cs_preview_abc" } })), {
    provided: true,
    token: "cs_preview_abc"
  });
  assert.deepEqual(parseBearerToken(new Request("https://certscore.ai", { headers: { authorization: "Basic abc" } })), {
    provided: true,
    token: null
  });
});

test("isIntegrationApiKeyScope only accepts known scoped actions", () => {
  assert.equal(isIntegrationApiKeyScope("pulse:read"), true);
  assert.equal(isIntegrationApiKeyScope("pulse:scan"), true);
  assert.equal(isIntegrationApiKeyScope("mcp"), true);
  assert.equal(isIntegrationApiKeyScope("admin"), false);
});
