import type { BrowserPassResult } from "../hybrid-auto-decision-core";

export function buildBrowserPassResult(overrides: Partial<BrowserPassResult> = {}): BrowserPassResult {
  return {
    challengeLikeSignalsDetected: false,
    cookieCountTotal: 5,
    finalDocumentStatus: 200,
    hybridRuntimeEvidence: {
      networkSummary: {
        totalRequestCount: 50
      }
    },
    initialDocumentStatus: 200,
    originLikelyReached: true,
    thirdPartyRequestDomains: ["a.example", "b.example", "c.example", "d.example"],
    timedOut: false,
    trackerVendors: [{ vendorName: "Vendor A" }, { vendorName: "Vendor B" }],
    ...overrides
  };
}
