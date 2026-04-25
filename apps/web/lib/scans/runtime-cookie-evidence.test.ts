import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCookieDisclosureGapEvidence,
  buildRuntimeCookieInventory,
  classifyRuntimeCookieCategory
} from "./runtime-cookie-evidence";

test("classifies expanded non-essential cookie families", () => {
  assert.equal(classifyRuntimeCookieCategory("_vwo_uuid_v2", ".example.com"), "advertising");
  assert.equal(classifyRuntimeCookieCategory("analytics_session_id", ".example.com"), "analytics");
  assert.equal(classifyRuntimeCookieCategory("_hjSession_123", ".example.com"), "session_replay");
  assert.equal(classifyRuntimeCookieCategory("__cf_bm", ".example.com"), "necessary");
});

test("builds cookie inventory with initiator provenance and before-consent timing", () => {
  const inventory = buildRuntimeCookieInventory({
    hybridRuntimeEvidence: {
      cookieWriteObservations: [
        {
          beforeConsent: true,
          cookieInitiatorDomain: "connect.facebook.net",
          cookieInitiatorUrl: "https://connect.facebook.net/fbevents.js",
          cookieInitiatorVendor: "Meta Pixel",
          cookieName: "_fbp",
          cookieSetMethod: "document_cookie",
          domain: ".example.com",
          setAtMs: 120
        },
        {
          cookieName: "__cf_bm",
          cookieSetMethod: "http_header",
          domain: ".example.com",
          setAtMs: 180
        }
      ],
      timelineMarkers: {
        consentBannerDetectedMs: 300
      },
      unmatchedCookieNames: ["_fbp"]
    },
    runtimeArtifacts: {
      initial_cookie_domains: [".example.com"],
      initial_cookie_names: ["_ga"]
    }
  });

  assert.deepEqual(inventory.beforeConsentCookieNames, ["_fbp", "__cf_bm"]);
  assert.deepEqual(inventory.nonEssentialCookieNames, ["_fbp", "_ga"]);
  assert.deepEqual(inventory.unmatchedCookieNames, ["_fbp"]);
  assert.equal(inventory.rows.find((row) => row.cookieName === "_fbp")?.initiatorUrl, "https://connect.facebook.net/fbevents.js");
});

test("builds cookie disclosure gap evidence from runtime and policy inventory", () => {
  const inventory = buildRuntimeCookieInventory({
    hybridRuntimeEvidence: {
      cookieWriteObservations: [
        {
          cookieName: "_ga",
          domain: ".example.com",
          thirdParty: false
        },
        {
          cookieName: "_fbp",
          cookieInitiatorVendor: "Meta Pixel",
          domain: ".example.com",
          thirdParty: true
        },
        {
          cookieName: "__cf_bm",
          domain: ".example.com",
          thirdParty: false
        }
      ]
    }
  });

  const evidence = buildCookieDisclosureGapEvidence({
    cookiePolicyUrl: "https://example.com/cookie-policy",
    disclosures: [{ cookie_name: "_ga", provider: "Google", purpose: "analytics" }],
    inventory
  });

  assert.deepEqual(evidence.runtime_cookie_names, ["_ga", "_fbp", "__cf_bm"]);
  assert.deepEqual(evidence.disclosed_cookie_names, ["_ga"]);
  assert.deepEqual(evidence.unmatched_cookie_names, ["_fbp"]);
  assert.deepEqual(evidence.unmatched_cookie_vendors, ["Meta Pixel"]);
  assert.equal(evidence.unmatched_cookie_count, 1);
  assert.equal(evidence.unmatched_third_party_cookie_count, 1);
});
