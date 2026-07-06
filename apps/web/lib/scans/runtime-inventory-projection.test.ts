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
  const adobeRow = groupedRows.find((row) => row.type === "tracker" && row.purpose === "Tag management");

  assert.equal(adobeRow?.purpose, "Tag management");
  assert.equal(adobeRow?.priority, "medium");
  assert.equal(adobeRow?.party, "3rd");
});

test("projects Fable CDN hosts from top observed entities through the canonical resolver", () => {
  const rows = buildTrackerInventoryRows({
    domains: ["cdn.datatables.net", "scontent-sea5-1.cdninstagram.com", "code.jquery.com"],
    firstPartyDomain: "caltech.edu",
    preConsentVendors: [],
    resolvedVendors: [],
    sessionReplayVendors: [],
    trackerVendors: [],
    topObservedEntities: [
      { category: "unknown", label: "cdn.datatables.net", requestCount: 5 },
      { category: "unknown", label: "scontent-sea5-1.cdninstagram.com", requestCount: 4 },
      { category: "unknown", label: "code.jquery.com", requestCount: 1 },
    ],
    unresolvedHosts: [],
  });

  const groupedRows = buildRuntimeInventoryGroupRows({ cookieRows: [], trackerRows: rows });
  const byVendor = new Map(groupedRows.map((row) => [row.vendor, row]));

  assert.equal(byVendor.get("DataTables CDN")?.purpose, "CDN");
  assert.equal(byVendor.get("DataTables CDN")?.priority, "contextual");
  assert.equal(byVendor.get("Instagram CDN")?.purpose, "CDN");
  assert.equal(byVendor.get("Instagram CDN")?.priority, "contextual");
  assert.equal(byVendor.get("jQuery CDN")?.purpose, "CDN");
  assert.equal(byVendor.get("jQuery CDN")?.priority, "contextual");
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
