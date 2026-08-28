import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  ANONYMOUS_SCAN_DAILY_LIMIT,
  LIGHT_MCP_NEW_SCAN_POLICY,
  decideAnonymousScanQuota,
  decideLightMcpScanConcurrency,
  decideLightMcpNewScanQuota,
  isAnonymousScanQuotaError,
  lightMcpScanIpKey,
  lightMcpScanRequesterKey,
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

function lightUsage(overrides: Partial<Record<"session" | "ip" | "surface", Partial<{ burstCount: number; dailyCount: number; oldestBurstAt: string | null }>>> = {}) {
  return {
    session: { burstCount: 0, dailyCount: 0, oldestBurstAt: null, ...overrides.session },
    ip: { burstCount: 0, dailyCount: 0, oldestBurstAt: null, ...overrides.ip },
    surface: { burstCount: 0, dailyCount: 0, oldestBurstAt: null, ...overrides.surface }
  };
}

test("Light MCP new scans have a sixty-per-ten-minute whole-surface burst rail", () => {
  const now = new Date("2026-08-14T12:05:00.000Z");
  assert.equal(decideLightMcpNewScanQuota({ usage: lightUsage() }).remaining, 19);
  const denied = decideLightMcpNewScanQuota({
    now,
    usage: lightUsage({ surface: { burstCount: 60, oldestBurstAt: "2026-08-14T12:00:30.000Z" } })
  });
  assert.equal(denied.allowed, false);
  if (denied.allowed) return;
  assert.equal(denied.scope, "surface");
  assert.equal(denied.window, "burst");
  assert.equal(denied.limit, LIGHT_MCP_NEW_SCAN_POLICY.surface.burstLimit);
  assert.equal(denied.retryAfterSeconds, 330);
});

test("Light MCP new scans have independent session, IP, and surface daily rails", () => {
  const denied = decideLightMcpNewScanQuota({
    now: new Date("2026-08-14T23:59:30.000Z"),
    usage: lightUsage({ session: { dailyCount: 60 } })
  });
  assert.equal(denied.allowed, false);
  if (denied.allowed) return;
  assert.equal(denied.scope, "session");
  assert.equal(denied.window, "daily");
  assert.equal(denied.limit, LIGHT_MCP_NEW_SCAN_POLICY.session.dailyLimit);
  assert.equal(denied.retryAfterSeconds, 30);
});

test("Light MCP active scans have independent concurrency rails", () => {
  const allowed = decideLightMcpScanConcurrency({ usage: { session: 3, ip: 3, surface: 3 } });
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.remaining, 0);

  const denied = decideLightMcpScanConcurrency({ usage: { session: 4, ip: 4, surface: 4 } });
  assert.equal(denied.allowed, false);
  if (denied.allowed) return;
  assert.equal(denied.scope, "session");
  assert.equal(denied.window, "concurrent");
  assert.equal(denied.limit, 4);
  assert.equal(denied.used, 4);
});

test("stable MCP sessions survive rotating provider egress while IP rails remain distinct", () => {
  assert.equal(lightMcpScanRequesterKey({ ipHash: "hash-a", network: "direct", sessionHash: "session-a" }), "session:session-a");
  assert.equal(lightMcpScanRequesterKey({ ipHash: "hash-b", network: "direct", sessionHash: "session-a" }), "session:session-a");
  assert.equal(lightMcpScanRequesterKey({ ipHash: "hash-a", network: "anthropic" }), "provider:anthropic");
  assert.equal(lightMcpScanRequesterKey({ ipHash: "hash-b", network: "anthropic" }), "provider:anthropic");
  assert.equal(lightMcpScanRequesterKey({ ipHash: "hash-a", network: "direct" }), "ip:hash-a");
  assert.equal(lightMcpScanRequesterKey({ ipHash: "hash-b", network: "direct" }), "ip:hash-b");
  assert.equal(lightMcpScanIpKey("hash-a"), "ip:hash-a");
  assert.equal(lightMcpScanIpKey("hash-b"), "ip:hash-b");
});

test("eligible reuse returns before the atomic Light new-scan claim", async () => {
  const source = await readFile("apps/web/server/scans/create-anonymous-full-scan.ts", "utf8");
  const reuseReturn = source.indexOf("reusedExistingScan: true as const");
  const quotaClaim = source.indexOf("claimLightMcpNewScanQuota", reuseReturn);
  assert.ok(reuseReturn > 0);
  assert.ok(quotaClaim > reuseReturn);

  const repository = await readFile("apps/web/server/pulse/repository.ts", "utf8");
  const lock = repository.indexOf('pg_advisory_xact_lock(hashtext($1))", ["light-mcp-new-scan-surface"]');
  const decision = repository.indexOf("decideLightMcpNewScanQuota", lock);
  const insert = repository.indexOf("insert into light_mcp_new_scan_events", decision);
  assert.ok(lock > 0 && decision > lock && insert > decision);
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
  assert.match(error.message, /No scan was created/i);
  assert.match(error.message, /2 minutes 3 seconds/i);
  assert.match(error.message, /20 genuinely new scans/);
  assert.match(error.message, /support@certscore\.ai/);
  assert.match(error.message, /login\?mode=create_account/);
  assert.match(error.message, /does not automatically change the anonymous endpoint limit/i);
  assert.equal(error.retryAfterSeconds, 123);
  assert.equal(
    error.recommendedNextAction,
    "No scan was created. Retry the same request in 2 minutes 3 seconds. If the limit continues after that delay, contact support@certscore.ai."
  );
});

test("shared Light scan quota guidance does not imply registration bypasses the active window", () => {
  const error = new AnonymousScanQuotaError(60, { limit: 60, scope: "surface", window: "burst", windowSeconds: 600 });

  assert.match(error.message, /60 genuinely new scans per 10 minutes/i);
  assert.match(error.message, /retry in 1 minute/i);
  assert.match(error.message, /shared public-Light limit/i);
  assert.match(error.message, /registering an account will not bypass/i);
  assert.doesNotMatch(error.message, /login\?mode=create_account/);
});

test("session-scoped Light quota guidance identifies the anonymous Connector limit", () => {
  const error = new AnonymousScanQuotaError(60, { lightMcp: true, limit: 20, scope: "session", window: "burst", windowSeconds: 600 });

  assert.match(error.message, /create an account at https:\/\/certscore\.ai\/login\?mode=create_account/i);
  assert.match(error.message, /does not automatically change the anonymous Light MCP limit/i);
});
