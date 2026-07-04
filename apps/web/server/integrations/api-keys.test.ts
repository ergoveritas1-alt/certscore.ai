import assert from "node:assert/strict";
import test from "node:test";
import {
  INTEGRATION_API_KEY_DAILY_LIMIT,
  INTEGRATION_API_KEY_HOURLY_LIMIT,
  INTEGRATION_ORGANIZATION_DAILY_LIMIT,
  INTEGRATION_ORGANIZATION_HOURLY_LIMIT,
  SELF_SERVE_READ_ONLY_EMAIL_DAILY_ISSUANCE_LIMIT,
  SELF_SERVE_READ_ONLY_EMAIL_WINDOW_ISSUANCE_LIMIT,
  SELF_SERVE_READ_ONLY_IP_DAILY_ISSUANCE_LIMIT,
  SELF_SERVE_READ_ONLY_IP_WINDOW_ISSUANCE_LIMIT,
  decideIntegrationApiKeyUsageLimit,
  decideSelfServeReadOnlyApiKeyIssuance,
  generateIntegrationApiKey,
  getEmailDomain,
  getIntegrationApiKeyPrefix,
  hashIntegrationApiKey,
  hashSelfServeApiKeyRequester,
  isDisposableEmailDomain,
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

test("generateIntegrationApiKey supports read-only self-serve keys", () => {
  const token = generateIntegrationApiKey("cs_ro");
  assert.match(token, /^cs_ro_[A-Za-z0-9_-]{32,}$/);
  assert.match(getIntegrationApiKeyPrefix(token), /^cs_ro_[A-Za-z0-9_-]{8}$/);
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

test("self-serve requester hashing and disposable-domain checks are normalized", () => {
  assert.equal(hashSelfServeApiKeyRequester("User@Example.COM"), hashSelfServeApiKeyRequester(" user@example.com "));
  assert.equal(getEmailDomain("User@Example.COM"), "example.com");
  assert.equal(isDisposableEmailDomain("person@mailinator.com"), true);
  assert.equal(isDisposableEmailDomain("person@example.com"), false);
});

test("decideSelfServeReadOnlyApiKeyIssuance requires verified non-disposable email", () => {
  assert.deepEqual(
    decideSelfServeReadOnlyApiKeyIssuance({
      disposableEmailDomain: false,
      emailDailyIssuedCount: 0,
      emailVerified: false,
      emailWindowIssuedCount: 0,
      ipDailyIssuedCount: 0,
      ipWindowIssuedCount: 0
    }),
    { allowed: false, reason: "unverified_email" }
  );
  assert.deepEqual(
    decideSelfServeReadOnlyApiKeyIssuance({
      disposableEmailDomain: true,
      emailDailyIssuedCount: 0,
      emailVerified: true,
      emailWindowIssuedCount: 0,
      ipDailyIssuedCount: 0,
      ipWindowIssuedCount: 0
    }),
    { allowed: false, reason: "disposable_email" }
  );
});

test("decideSelfServeReadOnlyApiKeyIssuance enforces email and IP issuance caps", () => {
  assert.deepEqual(
    decideSelfServeReadOnlyApiKeyIssuance({
      disposableEmailDomain: false,
      emailDailyIssuedCount: SELF_SERVE_READ_ONLY_EMAIL_DAILY_ISSUANCE_LIMIT,
      emailVerified: true,
      emailWindowIssuedCount: 0,
      ipDailyIssuedCount: 0,
      ipWindowIssuedCount: 0
    }),
    { allowed: false, reason: "email_cap", retryAfterSeconds: 86400 }
  );
  assert.deepEqual(
    decideSelfServeReadOnlyApiKeyIssuance({
      disposableEmailDomain: false,
      emailDailyIssuedCount: 0,
      emailVerified: true,
      emailWindowIssuedCount: SELF_SERVE_READ_ONLY_EMAIL_WINDOW_ISSUANCE_LIMIT,
      ipDailyIssuedCount: 0,
      ipWindowIssuedCount: 0
    }),
    { allowed: false, reason: "email_cap", retryAfterSeconds: 86400 }
  );
  assert.deepEqual(
    decideSelfServeReadOnlyApiKeyIssuance({
      disposableEmailDomain: false,
      emailDailyIssuedCount: 0,
      emailVerified: true,
      emailWindowIssuedCount: 0,
      ipDailyIssuedCount: SELF_SERVE_READ_ONLY_IP_DAILY_ISSUANCE_LIMIT,
      ipWindowIssuedCount: 0
    }),
    { allowed: false, reason: "ip_cap", retryAfterSeconds: 86400 }
  );
  assert.deepEqual(
    decideSelfServeReadOnlyApiKeyIssuance({
      disposableEmailDomain: false,
      emailDailyIssuedCount: 0,
      emailVerified: true,
      emailWindowIssuedCount: 0,
      ipDailyIssuedCount: 0,
      ipWindowIssuedCount: SELF_SERVE_READ_ONLY_IP_WINDOW_ISSUANCE_LIMIT
    }),
    { allowed: false, reason: "ip_cap", retryAfterSeconds: 86400 }
  );
});

test("decideSelfServeReadOnlyApiKeyIssuance allows verified requests below caps", () => {
  assert.deepEqual(
    decideSelfServeReadOnlyApiKeyIssuance({
      disposableEmailDomain: false,
      emailDailyIssuedCount: SELF_SERVE_READ_ONLY_EMAIL_DAILY_ISSUANCE_LIMIT - 1,
      emailVerified: true,
      emailWindowIssuedCount: SELF_SERVE_READ_ONLY_EMAIL_WINDOW_ISSUANCE_LIMIT - 1,
      ipDailyIssuedCount: SELF_SERVE_READ_ONLY_IP_DAILY_ISSUANCE_LIMIT - 1,
      ipWindowIssuedCount: SELF_SERVE_READ_ONLY_IP_WINDOW_ISSUANCE_LIMIT - 1
    }),
    { allowed: true }
  );
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
