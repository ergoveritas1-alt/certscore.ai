import type { RuntimeRunResult } from "./core/types";
import { getHybridAutoDecision, type BrowserPassResult } from "./hybrid-auto-decision-core";

export function toHybridAutoBrowserPass(result: RuntimeRunResult): BrowserPassResult {
  const documentResponses = result.responses
    .filter((response) => response.resourceType === "document")
    .sort((left, right) => left.timestampMs - right.timestampMs);
  const initialDocumentStatus = documentResponses[0]?.status ?? result.mainDocument.status ?? null;
  const finalDocumentStatus = documentResponses.at(-1)?.status ?? result.mainDocument.status ?? null;
  const trackerVendorNames = result.preConsentVendorSummary.normalizedVendors;

  return {
    challengeLikeSignalsDetected: result.classification.challengeDetected,
    cookieCountTotal: result.cookieSnapshots.at(-1)?.cookieCount ?? 0,
    finalDocumentStatus,
    hybridRuntimeEvidence: {
      networkSummary: {
        totalRequestCount: result.networkSummary.totalRequestCount
      }
    },
    initialDocumentStatus,
    originLikelyReached: result.classification.originLikelyReached,
    thirdPartyRequestDomains: result.vendorSummary.rawDomains,
    timedOut: result.navigationOutcome === "timeout" || result.stopSummary.reason === "timeout",
    trackerVendors: trackerVendorNames.map((vendorName) => ({
      vendorName
    }))
  };
}

export function getHybridAutoDecisionForRuntime(result: RuntimeRunResult) {
  return getHybridAutoDecision(toHybridAutoBrowserPass(result));
}
