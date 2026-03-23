import assert from "node:assert/strict";
import test from "node:test";
import { buildPreviewPayloadFromSnapshot } from "./build-preview-payload";

function buildSnapshot(overrides: Partial<Parameters<typeof buildPreviewPayloadFromSnapshot>[0]["snapshot"]> = {}) {
  return {
    accessibilityScore: 82,
    certscoreOverall: 79,
    contactPagePresent: false,
    cookieBannerPresent: false,
    granularPreferencesPresent: false,
    homepageFetchStatus: "ok" as const,
    pagesScanned: 2,
    partialScan: true,
    privacyPolicyPresent: true,
    privacyScore: 78,
    preconsentTrackingDetected: false,
    rejectAllPresent: false,
    termsOfServicePresent: false,
    thirdPartyCookieSetBeforeConsent: false,
    totalSignals: 12,
    trackingBeforeConsentDetected: false,
    wcagFormLabelErrorCount: 0,
    wcagMissingAltCount: 0,
    ...overrides
  };
}

test("lightweight previews suppress weak terms and contact absence findings", () => {
  const payload = buildPreviewPayloadFromSnapshot({
    hostname: "certscore.ai",
    normalizedUrl: "https://certscore.ai",
    snapshot: buildSnapshot()
  });

  assert.equal(
    payload.sampleFindings.some((finding) => finding.title === "Terms or disclosure link not detected"),
    false
  );
  assert.equal(
    payload.sampleFindings.some((finding) => finding.title === "Public contact path not detected"),
    false
  );
  assert.equal(
    payload.summaryBullets.includes(
      "This lightweight preview may not verify every secondary legal or contact route unless those pages are directly fetched during the live pass."
    ),
    true
  );
});

test("broader preview coverage can still surface missing terms and contact findings", () => {
  const payload = buildPreviewPayloadFromSnapshot({
    hostname: "example.com",
    normalizedUrl: "https://example.com",
    snapshot: buildSnapshot({
      pagesScanned: 4,
      partialScan: false
    })
  });

  assert.equal(
    payload.sampleFindings.some((finding) => finding.title === "Terms or disclosure link not detected"),
    true
  );
  assert.equal(
    payload.sampleFindings.some((finding) => finding.title === "Public contact path not detected"),
    true
  );
});
