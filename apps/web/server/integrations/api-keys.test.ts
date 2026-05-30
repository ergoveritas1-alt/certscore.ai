import assert from "node:assert/strict";
import test from "node:test";
import {
  INTEGRATION_API_KEY_DAILY_LIMIT,
  INTEGRATION_API_KEY_HOURLY_LIMIT,
  INTEGRATION_ORGANIZATION_DAILY_LIMIT,
  INTEGRATION_ORGANIZATION_HOURLY_LIMIT,
  decideIntegrationApiKeyUsageLimit,
  generateIntegrationApiKey,
  getIntegrationApiKeyPrefix,
  hashIntegrationApiKey,
  isIntegrationApiKeyScope,
  parseBearerToken
} from "./api-keys";

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

test("decideIntegrationApiKeyUsageLimit allows requests below limits", () => {
  assert.deepEqual(
    decideIntegrationApiKeyUsageLimit({
      keyHourlyCount: INTEGRATION_API_KEY_HOURLY_LIMIT - 1,
      keyDailyCount: INTEGRATION_API_KEY_DAILY_LIMIT - 1,
      organizationHourlyCount: INTEGRATION_ORGANIZATION_HOURLY_LIMIT - 1,
      organizationDailyCount: INTEGRATION_ORGANIZATION_DAILY_LIMIT - 1
    }),
    {
      allowed: true,
      retryAfterSeconds: 0,
      reason: null,
      usage: {
        keyHourlyCount: INTEGRATION_API_KEY_HOURLY_LIMIT - 1,
        keyDailyCount: INTEGRATION_API_KEY_DAILY_LIMIT - 1,
        organizationHourlyCount: INTEGRATION_ORGANIZATION_HOURLY_LIMIT - 1,
        organizationDailyCount: INTEGRATION_ORGANIZATION_DAILY_LIMIT - 1
      }
    }
  );
});

test("decideIntegrationApiKeyUsageLimit blocks key hourly usage first", () => {
  const decision = decideIntegrationApiKeyUsageLimit({
    keyHourlyCount: INTEGRATION_API_KEY_HOURLY_LIMIT,
    keyDailyCount: 0,
    organizationHourlyCount: 0,
    organizationDailyCount: 0
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "api_key_hourly_limit");
  assert.equal(decision.retryAfterSeconds, 3600);
});

test("decideIntegrationApiKeyUsageLimit blocks key daily usage", () => {
  const decision = decideIntegrationApiKeyUsageLimit({
    keyHourlyCount: 0,
    keyDailyCount: INTEGRATION_API_KEY_DAILY_LIMIT,
    organizationHourlyCount: 0,
    organizationDailyCount: 0
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "api_key_daily_limit");
  assert.equal(decision.retryAfterSeconds, 86400);
});

test("decideIntegrationApiKeyUsageLimit blocks organization usage", () => {
  assert.equal(
    decideIntegrationApiKeyUsageLimit({
      keyHourlyCount: 0,
      keyDailyCount: 0,
      organizationHourlyCount: INTEGRATION_ORGANIZATION_HOURLY_LIMIT,
      organizationDailyCount: 0
    }).reason,
    "organization_hourly_limit"
  );
  assert.equal(
    decideIntegrationApiKeyUsageLimit({
      keyHourlyCount: 0,
      keyDailyCount: 0,
      organizationHourlyCount: 0,
      organizationDailyCount: INTEGRATION_ORGANIZATION_DAILY_LIMIT
    }).reason,
    "organization_daily_limit"
  );
});
