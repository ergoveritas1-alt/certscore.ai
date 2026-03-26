import assert from "node:assert/strict";
import test from "node:test";

import { buildRegulatoryRiskAssessment } from "./regulatory-risk";

test("adds reachability risk for unreachable homepage scans", () => {
  const result = buildRegulatoryRiskAssessment({
    source: {
      homepageFetchStatus: "error",
      pagesScanned: 0,
      partialScan: true
    }
  });

  assert.equal(result.topRiskDrivers.some((driver) => driver.key === "site_unreachable"), true);
  assert.equal(result.confidence < 0.45, true);
});

test("adds redirect risk when the scanned domain resolves to a different site", () => {
  const result = buildRegulatoryRiskAssessment({
    source: {
      homepageFetchStatus: "error",
      pagesScanned: 0,
      finalUrl: "https://nfund.com/",
      registeredDomain: "hyperfund.com"
    }
  });

  assert.equal(result.topRiskDrivers.some((driver) => driver.key === "off_domain_redirect"), true);
  assert.equal(result.consumerProtectionRiskScore >= 40, true);
});
