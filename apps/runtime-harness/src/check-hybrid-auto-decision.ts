import { getHybridAutoDecision } from "./hybrid-auto-decision-core";

function main() {
  const decision = getHybridAutoDecision({
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
    trackerVendors: [{ vendorName: "Vendor A" }, { vendorName: "Vendor B" }]
  });

  console.info(
    JSON.stringify(
      {
        ok: true,
        reason: decision.reason,
        shouldEscalate: decision.shouldEscalate
      },
      null,
      2
    )
  );
}

main();
