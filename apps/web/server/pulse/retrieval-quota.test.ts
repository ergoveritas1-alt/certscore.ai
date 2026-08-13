import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  decidePulseRetrievalQuota,
  PULSE_RETRIEVAL_DAILY_PRINCIPAL_SCAN_LIMIT,
  PULSE_RETRIEVAL_PRINCIPAL_LIMIT,
  PULSE_RETRIEVAL_PRINCIPAL_SCAN_LIMIT,
  PULSE_RETRIEVAL_SCAN_LIMIT,
  PULSE_STATUS_PRINCIPAL_SCAN_LIMIT,
  pulseRetrievalPrincipal,
  pulseRetrievalWeight
} from "./retrieval-quota";
import { logApiReadRateLimited } from "./read-rate-log";

const now = new Date("2026-08-12T16:00:00.000Z");
const oldest = "2026-08-12T15:52:00.000Z";

function usage(overrides: Partial<Parameters<typeof decidePulseRetrievalQuota>[0]["usage"]> = {}) {
  return {
    dailyPrincipalScanUnits: 0,
    oldestDailyPrincipalScanAt: "2026-08-11T17:00:00.000Z",
    oldestPrincipalAt: oldest,
    oldestPrincipalScanAt: oldest,
    oldestScanAt: oldest,
    principalScanUnits: 0,
    principalUnits: 0,
    scanUnits: 0,
    ...overrides
  };
}

test("evidence and full retrievals cost four times a summary retrieval", () => {
  assert.equal(pulseRetrievalWeight("summary"), 1);
  assert.equal(pulseRetrievalWeight("standard"), 1);
  assert.equal(pulseRetrievalWeight("evidence"), 4);
  assert.equal(pulseRetrievalWeight("full"), 4);
});

test("one principal cannot repeatedly retrieve one terminal scan", () => {
  assert.equal(decidePulseRetrievalQuota({
    detail: "evidence",
    now,
    usage: usage({ principalScanUnits: 0 })
  }).allowed, true);
  assert.equal(decidePulseRetrievalQuota({
    detail: "evidence",
    now,
    usage: usage({ principalScanUnits: 4 })
  }).allowed, true);
  const decision = decidePulseRetrievalQuota({
    detail: "evidence",
    now,
    usage: usage({ principalScanUnits: PULSE_RETRIEVAL_PRINCIPAL_SCAN_LIMIT })
  });
  assert.equal(decision.allowed, false);
  if (decision.allowed) return;
  assert.equal(decision.reason, "scan_retrieval_principal_scan_limit");
  assert.equal(decision.retryAfterSeconds, 120);
  assert.equal(decision.profile, "terminal");
  assert.equal(decision.scope, "callerTarget");
  assert.equal(decision.windowId, "burst");
  assert.equal(decision.windowSeconds, 600);
  assert.equal(decision.limitUnits, PULSE_RETRIEVAL_PRINCIPAL_SCAN_LIMIT);
  assert.equal(decision.usedUnits, PULSE_RETRIEVAL_PRINCIPAL_SCAN_LIMIT);
  assert.equal(decision.requestedUnits, 4);
});

test("rate-limit denial logs are structured and omit caller and target identifiers", () => {
  const entries: string[] = [];
  const originalWarn = console.warn;
  console.warn = (entry?: unknown) => entries.push(String(entry));
  try {
    logApiReadRateLimited({
      limitUnits: 8,
      policyVersion: "test-policy",
      profile: "terminal",
      reason: "scan_retrieval_principal_scan_limit",
      requestId: "request_1",
      requestedUnits: 4,
      retryAfterSeconds: 60,
      route: "/api/v1/pulse",
      scope: "callerTarget",
      surface: "pulse-v1",
      targetType: "scan",
      usedUnits: 8,
      windowId: "burst",
      windowSeconds: 600
    });
  } finally {
    console.warn = originalWarn;
  }
  const event = JSON.parse(entries[0] ?? "{}") as Record<string, unknown>;
  assert.equal(event.event, "api_read.rate_limited");
  assert.equal(event.level, "warn");
  assert.equal(event.retryAfterSeconds, 60);
  assert.equal(event.scope, "callerTarget");
  assert.equal("principal" in event, false);
  assert.equal("target" in event, false);
  assert.equal("token" in event, false);
});

test("one principal cannot slowly retrieve one terminal scan more than forty units per rolling day", () => {
  const decision = decidePulseRetrievalQuota({
    detail: "evidence",
    now,
    usage: usage({
      dailyPrincipalScanUnits: PULSE_RETRIEVAL_DAILY_PRINCIPAL_SCAN_LIMIT,
      principalScanUnits: 0
    })
  });
  assert.equal(decision.allowed, false);
  if (decision.allowed) return;
  assert.equal(decision.reason, "scan_retrieval_daily_principal_scan_limit");
  assert.equal(decision.retryAfterSeconds, 3_600);
});

test("one terminal scan is bounded across all callers", () => {
  const decision = decidePulseRetrievalQuota({
    detail: "summary",
    now,
    usage: usage({ scanUnits: PULSE_RETRIEVAL_SCAN_LIMIT })
  });
  assert.equal(decision.allowed, false);
  if (decision.allowed) return;
  assert.equal(decision.reason, "scan_retrieval_scan_limit");
});

test("one principal is bounded across scans", () => {
  const decision = decidePulseRetrievalQuota({
    detail: "summary",
    now,
    usage: usage({ principalUnits: PULSE_RETRIEVAL_PRINCIPAL_LIMIT })
  });
  assert.equal(decision.allowed, false);
  if (decision.allowed) return;
  assert.equal(decision.reason, "scan_retrieval_principal_limit");
});

test("status polling uses a separate bounded allowance", () => {
  assert.equal(decidePulseRetrievalQuota({
    detail: "summary",
    now,
    profile: "status",
    usage: usage({ principalScanUnits: PULSE_STATUS_PRINCIPAL_SCAN_LIMIT - 1 })
  }).allowed, true);
  assert.equal(decidePulseRetrievalQuota({
    detail: "summary",
    now,
    profile: "status",
    usage: usage({ principalScanUnits: PULSE_STATUS_PRINCIPAL_SCAN_LIMIT })
  }).allowed, false);
});

test("principal identity prefers an API key and falls back safely", () => {
  assert.equal(pulseRetrievalPrincipal({ apiKeyId: "key_1", ipHash: "hash", userId: "user_1" }), "api_key:key_1");
  assert.equal(pulseRetrievalPrincipal({ ipHash: "hash" }), "ip:hash");
  assert.equal(pulseRetrievalPrincipal({}), "anonymous:unattributed");
});

test("the Pulse route rejects excessive retrievals before activity or report work", async () => {
  const [route, repository, schema, migration] = await Promise.all([
    readFile("apps/web/app/api/v1/pulse/route.ts", "utf8"),
    readFile("apps/web/server/pulse/repository.ts", "utf8"),
    readFile("apps/web/server/pulse/schema.ts", "utf8"),
    readFile("packages/db/migrations/0178_pulse_scan_retrieval_quota_indexes.sql", "utf8")
  ]);
  const reserveAt = route.indexOf("await createPulseRequestWithRetrievalQuota");
  const projectionAt = route.indexOf("await loadPulseScanRecord(scanId)", reserveAt);
  assert.ok(reserveAt > 0);
  assert.ok(projectionAt > reserveAt);
  assert.match(route.slice(reserveAt, projectionAt), /status: 429/);
  assert.match(route.slice(reserveAt, projectionAt), /"Retry-After"/);
  assert.match(route.slice(reserveAt, projectionAt), /logApiReadRateLimited/);
  assert.match(route.slice(reserveAt, projectionAt), /rateLimit:/);
  assert.match(route.slice(reserveAt, projectionAt), /recommendedNextAction/);

  const decisionAt = repository.indexOf("const decision = decidePulseRetrievalQuota");
  const insertAt = repository.indexOf("insert into pulse_read_events", decisionAt);
  assert.ok(decisionAt > 0);
  assert.ok(insertAt > decisionAt);
  assert.match(repository.slice(decisionAt, insertAt), /if \(!decision\.allowed\) return decision/);
  for (const source of [schema, migration]) {
    assert.match(source, /pulse_read_events_principal_requested_at_idx/);
    assert.match(source, /pulse_read_events_target_requested_at_idx/);
  }
});

test("API v2 scan resource routes share the retrieval throttle", async () => {
  const routes = [
    "apps/web/app/api/v2/scans/[scanId]/route.ts",
    "apps/web/app/api/v2/scans/[scanId]/status/route.ts",
    "apps/web/app/api/v2/scans/[scanId]/pulse/route.ts",
    "apps/web/app/api/v2/scans/[scanId]/findings/route.ts",
    "apps/web/app/api/v2/scans/[scanId]/findings/[findingId]/route.ts",
    "apps/web/app/api/v2/scans/[scanId]/pre-consent-cookies-trackers/route.ts",
    "apps/web/app/api/v2/scans/[scanId]/diagnostics/route.ts",
    "apps/web/app/api/v2/domains/[domain]/latest/route.ts",
    "apps/web/app/api/v2/domains/[domain]/latest/pre-consent-cookies-trackers/route.ts"
  ];
  for (const routePath of routes) {
    const source = await readFile(routePath, "utf8");
    assert.match(source, /enforceApiV2ScanReadThrottle/, routePath);
  }
  const status = await readFile("apps/web/app/api/v2/scans/[scanId]/status/route.ts", "utf8");
  assert.match(status, /profile: "status"/);
});

test("Pulse v1 job status polling uses the shared status allowance and clear 429 contract", async () => {
  const route = await readFile("apps/web/app/api/v1/pulse/status/[jobId]/route.ts", "utf8");
  const claimAt = route.indexOf("await claimPulseReadQuota");
  const projectionAt = route.indexOf("await getPublicScanRecord", claimAt);
  assert.ok(claimAt > 0);
  assert.ok(projectionAt > claimAt);
  assert.match(route.slice(claimAt, projectionAt), /profile: "status"/);
  assert.match(route.slice(claimAt, projectionAt), /status: 429/);
  assert.match(route.slice(claimAt, projectionAt), /"Retry-After"/);
  assert.match(route.slice(claimAt, projectionAt), /logApiReadRateLimited/);
  assert.match(route.slice(claimAt, projectionAt), /recommendedNextAction/);
});
