import assert from "node:assert/strict";
import test from "node:test";
import { hasCompleteObservedActionSources, observedActionSourceProofSchema, validateObservedActionSourceProof } from "@certscore/contracts";
import { z } from "zod";
import { buildActionWriteCoverage } from "./action-main-document-write-coverage.js";
import { buildObservedActionSourceProof } from "./observed-action-source-proof.js";
const writeCoverage = buildActionWriteCoverage({ metadata: { observedLifetimeCount: 0, ringEvictedCount: 0,
  readbackOmittedCount: 0, cookieHookHealthy: true, storageHookHealthy: true,
  documentUrl: "https://example.com/", documentTimeOriginMs: 10 }, targetUrl: "https://example.com/",
  windowStartedAtMs: 100, windowEndedAtMs: 200, windowCompleted: true,
  retainedWindowCount: 0, eligibleWindowCount: 0, retainedEligibleCount: 0, unresolvedWindowCount: 0 });
const input = { authorization: { kind: "loopback" as const, authorizationId: "loopback_local_lab", scanId: "test", requestedTargetSha256: "a".repeat(64), authorizedBeforeAction: true as const }, scanClockOriginAtMs: 0, writeCoverage, hookInstalledAtMs: 20, actionDocumentStable: true,
  requestListenerInstalledBeforeAction: true, requestWindowStartedAtMs: 50, configuredWindowMs: 100,
  cancelled: false, semanticDecisionConfirmed: true, retention: { requestsObserved: 0, requestsRetained: 0 },
  pendingCount: 0, retainedRequestIds: [], rows: [] };
const packet = (proof = buildObservedActionSourceProof(input)) => ({ observedActionSourceProof: proof,
  storage: { mainDocumentWriteCoverage: writeCoverage } });

test("prospective complete empty declared sources remain narrowly scoped and historical packets fail closed", () => {
  const proof = buildObservedActionSourceProof(input);
  assert.equal(observedActionSourceProofSchema.safeParse(proof).success, true);
  assert.equal(hasCompleteObservedActionSources(packet(proof)), true);
  assert.ok(proof.excludedChannels.includes("response_set_cookie"));
  assert.ok(proof.excludedChannels.includes("storage_named_properties"));
  assert.equal(hasCompleteObservedActionSources({ storage: packet().storage }), false);
});

test("loss, pending work, unknown classification/identity and projection omissions independently prevent scoped completeness", () => {
  const base = buildObservedActionSourceProof({ ...input, retention: { requestsObserved: 1, requestsRetained: 1 },
    retainedRequestIds: ["r1"], rows: [{ hostname: "example.com", purpose: "infrastructure" }] });
  for (const key of ["pendingCount", "unresolvedIdentityCount", "unresolvedClassificationCount", "projectionOmittedCount"] as const) {
    assert.equal(hasCompleteObservedActionSources(packet({ ...base, requests: { ...base.requests, [key]: 1 } })), false, key);
  }
  const loss = buildObservedActionSourceProof({ ...input, retention: { requestsObserved: 1, requestsRetained: 0 } });
  assert.equal(hasCompleteObservedActionSources(packet(loss)), false);
  for (const patch of [{ cancelled: true }, { actionDocumentStable: false }, { semanticDecisionConfirmed: false },
    { requestListenerInstalledBeforeAction: false }, { hookInstalledAtMs: undefined }, { hookInstalledAtMs: 51 },
    { configuredWindowMs: 101 }]) assert.equal(hasCompleteObservedActionSources(packet(buildObservedActionSourceProof({ ...input, ...patch }))), false);
});

test("bound contract rejects forged counters, registration clocks, decision and early-exit completion", () => {
  const proof = buildObservedActionSourceProof(input);
  const source = { scanId: "test", navigationAuthorized: true, targetSha256: writeCoverage.targetUrlSha256, dispatchedAtMs: 50, registeredAtMs: 100,
    endedAtMs: 200, scanStartedAtMs: 0, configuredWindowMs: 100, exitReason: "window_elapsed",
    confirmed: true, decisionConfirmed: true, clickCompleted: true, writeCoverage,
    retention: { requestsObserved: 0, requestsRetained: 0 }, requests: [] };
  const check = (p = proof, s = source) => z.unknown().superRefine((_, ctx) => validateObservedActionSourceProof(p, ctx, s)).safeParse({}).success;
  assert.equal(check(), true);
  for (const patch of [{ scanId: "wrong_scan" }, { navigationAuthorized: false }, { targetSha256: "f".repeat(64) }, { registeredAtMs: 98 }, { endedAtMs: 198 },
    { configuredWindowMs: 101 }, { exitReason: "non_essential_request_observed" }, { decisionConfirmed: false },
    { clickCompleted: false }]) assert.equal(check(proof, { ...source, ...patch }), false);
  assert.equal(observedActionSourceProofSchema.safeParse({ ...proof, excludedChannels: [] }).success, false);
  assert.equal(observedActionSourceProofSchema.safeParse({ ...proof, requests: { ...proof.requests, handlerReceivedCount: 1 } }).success, false);
});

test("late completion remains pending at frozen boundary and identity membership cannot silently drop a row", () => {
  const proof = buildObservedActionSourceProof({ ...input, retention: { requestsObserved: 1, requestsRetained: 1 }, pendingCount: 1,
    retainedRequestIds: ["r1"], rows: [{ hostname: "example.com", purpose: "infrastructure" }] });
  const source = { scanId: "test", navigationAuthorized: true, targetSha256: writeCoverage.targetUrlSha256, dispatchedAtMs: 50, registeredAtMs: 100,
    endedAtMs: 200, scanStartedAtMs: 0, configuredWindowMs: 100, exitReason: "window_elapsed",
    confirmed: true, decisionConfirmed: true, clickCompleted: true, writeCoverage,
    retention: { requestsObserved: 1, requestsRetained: 1 }, requests: [{ requestId: "r1", startedAtMs: 60,
      completedAtMs: 201, hostname: "example.com", purpose: "infrastructure" }] };
  const check = (p = proof) => z.unknown().superRefine((_, ctx) => validateObservedActionSourceProof(p, ctx, source)).safeParse({}).success;
  assert.equal(check(), true);
  assert.equal(check({ ...proof, requests: { ...proof.requests, pendingCount: 0 } }), false);
  assert.equal(check({ ...proof, requests: { ...proof.requests, retainedRequestIds: ["missing"] } }), false);
});

test("literal unknown purpose is unresolved even when nonEssential is false", () => {
  const proof = buildObservedActionSourceProof({ ...input, retention: { requestsObserved: 1, requestsRetained: 1 },
    retainedRequestIds: ["r1"], rows: [{ hostname: "example.com", purpose: "unknown", nonEssential: false } as { hostname: string; purpose: string }] });
  assert.equal(proof.requests.unresolvedClassificationCount, 1);
  assert.equal(hasCompleteObservedActionSources(packet(proof)), false);
  const source = { scanId: "test", navigationAuthorized: true, targetSha256: writeCoverage.targetUrlSha256,
    dispatchedAtMs: 50, registeredAtMs: 100, endedAtMs: 200, scanStartedAtMs: 0, configuredWindowMs: 100,
    exitReason: "window_elapsed", confirmed: true, decisionConfirmed: true, clickCompleted: true, writeCoverage,
    retention: { requestsObserved: 1, requestsRetained: 1 }, requests: [{ requestId: "r1", startedAtMs: 60,
      completedAtMs: 70, hostname: "example.com", purpose: "unknown" }] };
  const forged = { ...proof, requests: { ...proof.requests, unresolvedClassificationCount: 0 } };
  assert.equal(z.unknown().superRefine((_, ctx) => validateObservedActionSourceProof(forged, ctx, source)).safeParse({}).success, false);
});
