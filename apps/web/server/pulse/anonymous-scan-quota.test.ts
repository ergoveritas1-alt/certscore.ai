import assert from "node:assert/strict";
import test from "node:test";
import {
  ANONYMOUS_SCAN_DAILY_LIMIT,
  decideAnonymousScanQuota,
  isAnonymousScanQuotaError,
  retryAfterNextUtcDay,
  AnonymousScanQuotaError
} from "./anonymous-scan-quota";

test("anonymous scans allow up to the daily limit and report remaining capacity", () => {
  assert.deepEqual(decideAnonymousScanQuota({ currentCount: 0 }), {
    allowed: true,
    remaining: ANONYMOUS_SCAN_DAILY_LIMIT - 1,
    retryAfterSeconds: 0
  });
  assert.deepEqual(decideAnonymousScanQuota({ currentCount: ANONYMOUS_SCAN_DAILY_LIMIT - 1 }), {
    allowed: true,
    remaining: 0,
    retryAfterSeconds: 0
  });
});

test("anonymous scans reject at the daily limit until the next UTC day", () => {
  const now = new Date("2026-07-15T23:59:30.000Z");
  const decision = decideAnonymousScanQuota({ currentCount: ANONYMOUS_SCAN_DAILY_LIMIT, now });

  assert.equal(decision.allowed, false);
  assert.equal(decision.remaining, 0);
  assert.equal(decision.retryAfterSeconds, retryAfterNextUtcDay(now));
});

test("anonymous scan quota errors are identifiable without exposing requester data", () => {
  const error = new AnonymousScanQuotaError(123);

  assert.equal(isAnonymousScanQuotaError(error), true);
  assert.equal(error.message.includes("123"), false);
  assert.equal(error.retryAfterSeconds, 123);
});
