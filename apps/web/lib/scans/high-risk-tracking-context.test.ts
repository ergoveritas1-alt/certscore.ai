import assert from "node:assert/strict";
import test from "node:test";
import { deriveHighRiskTrackingContext } from "./high-risk-tracking-context";

test("deriveHighRiskTrackingContext resolves CMP vendors through shared registry", () => {
  const context = deriveHighRiskTrackingContext({
    evidenceUrls: [
      "https://cdn-cookieyes.com/client_data/example/script.js",
      "https://cdn.transcend-cdn.com/cm/airgap.js"
    ],
    runtimeArtifacts: {
      initial_cookie_names: ["cookieyes-consent"],
      local_storage_keys: ["airgap"]
    },
    thirdPartyDomains: [
      "consent-api.service.consent.usercentrics.eu",
      "privacy-center-api.transcend.io",
      "log.cookieyes.com"
    ]
  });

  assert.equal(context.cmpVendorName, "CookieYes");
  assert.ok(context.cmpVendors.some((vendor) => vendor.name === "CookieYes"));
  assert.ok(context.cmpVendors.some((vendor) => vendor.name === "Usercentrics"));
  assert.ok(context.cmpVendors.some((vendor) => vendor.name === "Transcend"));
  assert.equal(context.highRiskVendors.some((vendor) => vendor.category === "cmp"), false);
});
