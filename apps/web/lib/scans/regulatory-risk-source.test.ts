import assert from "node:assert/strict";
import test from "node:test";

import { buildRegulatoryRiskAssessment } from "@website-signal-risk-scanner/shared";
import { buildRegulatoryRiskSource } from "./regulatory-risk-source";

test("camelCase preview snapshot flags feed sensitive-context regulatory risk source", () => {
  const source = buildRegulatoryRiskSource({
    hostname: "webmd.com",
    snapshot: {
      finalUrl: "https://www.webmd.com/",
      final_url: "https://www.webmd.com/",
      homepage_fetch_status: "ok",
      pages_scanned: 0,
      partial_scan: true,
      registered_domain: "webmd.com",
      trackingBeforeConsentDetected: true,
      thirdPartyCookieSetBeforeConsent: true,
      cookieBannerPresent: true,
      rejectAllPresent: false,
      granularPreferencesPresent: false
    },
    runtimeArtifacts: {
      consent_baseline_tracker_evidence_urls: [
        "https://assets.adobedtm.com/launch.js",
        "https://www.google.com/recaptcha/enterprise.js"
      ],
      initial_cookie_names: ["aam", "AMCV_16AD4362526701720A490D45%40AdobeOrg"],
      third_party_request_domains: ["assets.adobedtm.com", "www.google.com"]
    }
  });

  assert.equal(source.trackingBeforeConsentDetected, true);
  assert.equal(source.thirdPartyCookieSetBeforeConsent, true);
  assert.equal(source.cookieBannerPresent, true);
  assert.equal(source.sensitiveContextTrackingDetected, true);
  assert.equal(source.dmpVendorDetected, true);
  assert.equal(source.enterpriseDeviceRiskVendorDetected, true);

  const risk = buildRegulatoryRiskAssessment({ source });
  assert.equal(risk.riskLevel === "moderate" || risk.riskLevel === "high", true);
  assert.equal(risk.consentEnforcementRiskScore >= 70, true);
  assert.equal(risk.topRiskDrivers.some((driver) => driver.key === "tracking_before_consent"), true);
});
