import assert from "node:assert/strict";
import test from "node:test";
import { getHybridAutoDecision } from "./hybrid-auto-decision-core";
import { buildBrowserPassResult } from "./test-helpers/browser-pass-result";

test("challenge-like runtime wins over thin-runtime classification", () => {
  const decision = getHybridAutoDecision(
    buildBrowserPassResult({
      challengeLikeSignalsDetected: true,
      cookieCountTotal: 0,
      hybridRuntimeEvidence: {
        networkSummary: {
          totalRequestCount: 5
        }
      },
      originLikelyReached: false,
      thirdPartyRequestDomains: ["challenges.cloudflare.com"],
      trackerVendors: []
    })
  );

  assert.deepEqual(decision, {
    detail: "Challenge-like runtime observed and challenge-related host was seen: challenges.cloudflare.com.",
    reason: "verification_interstitial",
    shouldEscalate: true
  });
});

test("thin-success classification wins over origin-not-reached when both match", () => {
  const decision = getHybridAutoDecision(
    buildBrowserPassResult({
      cookieCountTotal: 0,
      hybridRuntimeEvidence: {
        networkSummary: {
          totalRequestCount: 30
        }
      },
      originLikelyReached: false,
      thirdPartyRequestDomains: ["a.example"],
      trackerVendors: [{ vendorName: "Vendor A" }]
    })
  );

  assert.deepEqual(decision, {
    detail: "Local pass reached 200 but vendor/cookie depth stayed suspiciously low.",
    reason: "thin_success",
    shouldEscalate: true
  });
});

test("healthy full runtimes do not escalate even if challenge infrastructure was contacted", () => {
  const decision = getHybridAutoDecision(
    buildBrowserPassResult({
      challengeLikeSignalsDetected: true,
      thirdPartyRequestDomains: ["a.example", "b.example", "c.example", "challenges.cloudflare.com"],
      trackerVendors: [{ vendorName: "Vendor A" }, { vendorName: "Vendor B" }]
    })
  );

  assert.deepEqual(decision, {
    detail: "Local pass looked healthy enough to keep as final.",
    reason: "not_needed",
    shouldEscalate: false
  });
});

test("challenge-like runtime falls back to generic detail without a known challenge host", () => {
  const decision = getHybridAutoDecision(
    buildBrowserPassResult({
      challengeLikeSignalsDetected: true,
      cookieCountTotal: 0,
      hybridRuntimeEvidence: {
        networkSummary: {
          totalRequestCount: 5
        }
      },
      originLikelyReached: false,
      thirdPartyRequestDomains: ["cdn.example"],
      trackerVendors: []
    })
  );

  assert.deepEqual(decision, {
    detail: "Challenge-like runtime observed during the local pass.",
    reason: "verification_interstitial",
    shouldEscalate: true
  });
});

test("timeout-driven thin runtime reports challenge host detail when present", () => {
  const decision = getHybridAutoDecision(
    buildBrowserPassResult({
      timedOut: true,
      thirdPartyRequestDomains: ["challenges.cloudflare.com"],
      trackerVendors: []
    })
  );

  assert.deepEqual(decision, {
    detail: "Local pass stayed too thin and challenge-related host was seen: challenges.cloudflare.com.",
    reason: "thin_runtime",
    shouldEscalate: true
  });
});
