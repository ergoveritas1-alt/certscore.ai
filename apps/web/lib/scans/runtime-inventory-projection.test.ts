import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRuntimeInventoryGroupRows,
  buildTrackerInventoryRows,
} from "./runtime-inventory-projection";

test("projects Adobe Launch host as tag management instead of unknown tracker", () => {
  const rows = buildTrackerInventoryRows({
    domains: ["assets.adobedtm.com"],
    firstPartyDomain: "nvidia.com",
    preConsentVendors: ["assets.adobedtm.com"],
    resolvedVendors: [],
    sessionReplayVendors: [],
    trackerVendors: [],
    topObservedEntities: [
      {
        category: "unknown",
        label: "assets.adobedtm.com",
        requestCount: 2,
      },
    ],
    unresolvedHosts: [],
  });

  const groupedRows = buildRuntimeInventoryGroupRows({ cookieRows: [], trackerRows: rows });
  const adobeRow = groupedRows.find((row) => row.type === "tracker" && row.vendor === "assets.adobedtm.com");

  assert.equal(adobeRow?.purpose, "Tag management");
  assert.equal(adobeRow?.priority, "medium");
  assert.equal(adobeRow?.party, "3rd");
});

test("keeps first-party Akamai security tracker inventory contextual", () => {
  const rows = buildTrackerInventoryRows({
    domains: [],
    firstPartyDomain: "nvidia.com",
    preConsentVendors: ["Akamai Bot Manager / Edge"],
    resolvedVendors: [],
    sessionReplayVendors: [],
    trackerVendors: [
      {
        beforeConsent: true,
        confidence: 0.9,
        detectionSource: "vendor resolver",
        observedVia: ["cookie"],
        scriptHost: "nvidia.com",
        vendorCategory: "security",
        vendorName: "Akamai Bot Manager / Edge",
      },
    ] as never,
    topObservedEntities: [],
    unresolvedHosts: [],
  });

  const groupedRows = buildRuntimeInventoryGroupRows({ cookieRows: [], trackerRows: rows });
  const akamaiRow = groupedRows.find((row) => row.type === "tracker" && row.vendor === "Akamai Bot Manager / Edge");

  assert.equal(akamaiRow?.purpose, "Security");
  assert.equal(akamaiRow?.priority, "contextual");
  assert.equal(akamaiRow?.party, "—");
});
