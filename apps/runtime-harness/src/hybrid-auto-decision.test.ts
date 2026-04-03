import assert from "node:assert/strict";
import test from "node:test";
import { getHybridAutoDecisionForRuntime, toHybridAutoBrowserPass } from "./hybrid-auto-decision";
import { buildRuntimeRunResult } from "./test-helpers/runtime-run-result";

test("toHybridAutoBrowserPass maps the runtime into the hybrid auto decision contract", () => {
  const pass = toHybridAutoBrowserPass(buildRuntimeRunResult());

  assert.equal(pass.initialDocumentStatus, 200);
  assert.equal(pass.finalDocumentStatus, 200);
  assert.equal(pass.cookieCountTotal, 5);
  assert.equal(pass.hybridRuntimeEvidence?.networkSummary.totalRequestCount, 50);
  assert.deepEqual(pass.thirdPartyRequestDomains, ["a.example", "b.example", "c.example", "d.example"]);
  assert.deepEqual(pass.trackerVendors, [{ vendorName: "Vendor A" }, { vendorName: "Vendor B" }]);
});

test("getHybridAutoDecisionForRuntime uses the canonical hybrid auto decision logic", () => {
  const decision = getHybridAutoDecisionForRuntime(buildRuntimeRunResult());

  assert.deepEqual(decision, {
    detail: "Local pass looked healthy enough to keep as final.",
    reason: "not_needed",
    shouldEscalate: false
  });
});

test("getHybridAutoDecisionForRuntime escalates challenge-like runtimes", () => {
  const base = buildRuntimeRunResult();
  const decision = getHybridAutoDecisionForRuntime(
    buildRuntimeRunResult({
      classification: {
        ...base.classification,
        challengeDetected: true,
        originLikelyReached: false
      },
      networkSummary: {
        ...base.networkSummary,
        thirdPartyDomainCount: 1,
        thirdPartyRequestCount: 1,
        totalRequestCount: 5
      },
      thirdPartyDomainCount: 1,
      vendorSummary: {
        ...base.vendorSummary,
        normalizedVendors: [],
        rawDomains: ["challenges.cloudflare.com"],
        vendorCounts: {}
      },
      preConsentVendorSummary: {
        ...base.preConsentVendorSummary,
        normalizedVendors: [],
        vendorCounts: {}
      }
    })
  );

  assert.deepEqual(decision, {
    detail: "Challenge-like runtime observed and challenge-related host was seen: challenges.cloudflare.com.",
    reason: "verification_interstitial",
    shouldEscalate: true
  });
});

test("getHybridAutoDecisionForRuntime escalates thin runtimes", () => {
  const base = buildRuntimeRunResult();
  const decision = getHybridAutoDecisionForRuntime(
    buildRuntimeRunResult({
      networkSummary: {
        ...base.networkSummary,
        thirdPartyDomainCount: 1,
        thirdPartyRequestCount: 1,
        totalRequestCount: 10
      },
      thirdPartyDomainCount: 1,
      vendorSummary: {
        ...base.vendorSummary,
        rawDomains: ["cdn.example"]
      }
    })
  );

  assert.deepEqual(decision, {
    detail: "Local pass did not collect enough runtime depth.",
    reason: "thin_runtime",
    shouldEscalate: true
  });
});

test("getHybridAutoDecisionForRuntime escalates thin successful runtimes", () => {
  const base = buildRuntimeRunResult();
  const decision = getHybridAutoDecisionForRuntime(
    buildRuntimeRunResult({
      cookieSnapshots: [
        {
          cookieCount: 0,
          cookies: [],
          label: "final",
          timestampMs: 10_000
        }
      ],
      vendorSummary: {
        ...base.vendorSummary,
        normalizedVendors: ["Vendor A"],
        rawDomains: ["a.example"],
        vendorCounts: {
          "Vendor A": 1
        }
      },
      preConsentVendorSummary: {
        ...base.preConsentVendorSummary,
        normalizedVendors: ["Vendor A"],
        vendorCounts: {
          "Vendor A": 1
        }
      },
      networkSummary: {
        ...base.networkSummary,
        thirdPartyDomainCount: 1,
        thirdPartyRequestCount: 3,
        totalRequestCount: 30
      },
      thirdPartyDomainCount: 1
    })
  );

  assert.deepEqual(decision, {
    detail: "Local pass reached 200 but vendor/cookie depth stayed suspiciously low.",
    reason: "thin_success",
    shouldEscalate: true
  });
});

test("getHybridAutoDecisionForRuntime escalates block-status runtimes", () => {
  const base = buildRuntimeRunResult();
  const decision = getHybridAutoDecisionForRuntime(
    buildRuntimeRunResult({
      mainDocument: {
        ...base.mainDocument,
        status: 403
      },
      responses: [
        {
          frameUrl: "https://example.com",
          headers: null,
          requestId: "1",
          resourceType: "document",
          setCookieHeaders: null,
          status: 403,
          timestampMs: 0,
          url: "https://example.com"
        }
      ]
    })
  );

  assert.deepEqual(decision, {
    detail: "Local main document returned 403.",
    reason: "http_block_status",
    shouldEscalate: true
  });
});

test("getHybridAutoDecisionForRuntime escalates when origin was not reached cleanly", () => {
  const base = buildRuntimeRunResult();
  const decision = getHybridAutoDecisionForRuntime(
    buildRuntimeRunResult({
      cookieSnapshots: [
        {
          cookieCount: 2,
          cookies: [],
          label: "final",
          timestampMs: 10_000
        }
      ],
      classification: {
        ...base.classification,
        originLikelyReached: false
      },
      networkSummary: {
        ...base.networkSummary,
        thirdPartyDomainCount: 2,
        thirdPartyRequestCount: 2,
        totalRequestCount: 25
      },
      thirdPartyDomainCount: 2,
      vendorSummary: {
        ...base.vendorSummary,
        normalizedVendors: ["Vendor A", "Vendor B"],
        rawDomains: ["a.example", "b.example"],
        vendorCounts: {
          "Vendor A": 1,
          "Vendor B": 1
        }
      },
      preConsentVendorSummary: {
        ...base.preConsentVendorSummary,
        normalizedVendors: ["Vendor A", "Vendor B"],
        vendorCounts: {
          "Vendor A": 1,
          "Vendor B": 1
        }
      }
    })
  );

  assert.deepEqual(decision, {
    detail: "Local pass did not appear to reach the requested origin cleanly.",
    reason: "origin_not_reached",
    shouldEscalate: true
  });
});
