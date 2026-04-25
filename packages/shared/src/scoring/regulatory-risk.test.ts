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

test("elevates sensitive-context pre-consent identity and data-broker tracking", () => {
  const result = buildRegulatoryRiskAssessment({
    source: {
      homepageFetchStatus: "ok",
      pagesScanned: 3,
      trackingBeforeConsentDetected: true,
      thirdPartyCookieSetBeforeConsent: true,
      cookieBannerPresent: true,
      sensitiveContextTrackingDetected: true,
      highRiskDataBrokerDetected: true,
      highRiskIdentityVendorDetected: true,
      healthAdtechVendorDetected: true,
      thirdPartyRequestDomainCount: 52
    }
  });

  assert.equal(result.riskLevel === "moderate" || result.riskLevel === "high", true);
  assert.equal(result.topRiskDrivers.some((driver) => driver.key === "tracking_before_consent"), true);
  assert.equal(result.topRiskDrivers.some((driver) => driver.key === "sensitive_context_tracking" || driver.key === "sensitive_context_preconsent"), true);
  assert.equal(result.consentEnforcementRiskScore >= 70, true);
  assert.equal(result.dataExposureRiskScore >= 60, true);
});
