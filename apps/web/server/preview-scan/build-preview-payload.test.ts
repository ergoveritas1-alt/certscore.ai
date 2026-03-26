import assert from "node:assert/strict";
import test from "node:test";
import { buildPreviewPayloadFromSnapshot } from "./build-preview-payload";

function buildSnapshot(overrides: Partial<Parameters<typeof buildPreviewPayloadFromSnapshot>[0]["snapshot"]> = {}) {
  return {
    accessibilityScore: 82,
    certscoreOverall: 79,
    contactPagePresent: false,
    cookieBannerPresent: false,
    finalUrl: "https://example.com",
    granularPreferencesPresent: false,
    homepageFetchStatus: "ok" as const,
    pagesScanned: 2,
    partialScan: true,
    privacyPolicyPresent: true,
    privacyScore: 78,
    preconsentTrackingDetected: false,
    rejectAllPresent: false,
    redirectCount: 0,
    registeredDomain: "example.com",
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

test("blocked or unreachable previews withhold scores and surface access blockers", () => {
  const payload = buildPreviewPayloadFromSnapshot({
    hostname: "chime.com",
    normalizedUrl: "https://chime.com",
    snapshot: buildSnapshot({
      finalUrl: "https://chime.com",
      homepageFetchStatus: "forbidden",
      pagesScanned: 0,
      partialScan: true,
      trackingBeforeConsentDetected: true
    })
  });

  assert.equal(payload.scores, undefined);
  assert.equal(payload.sampleFindings.some((finding) => finding.title === "Homepage blocked during live scan"), true);
  assert.equal(payload.sampleFindings.some((finding) => finding.title === "Tracking activity observed before consent"), false);
  assert.equal(payload.summaryBullets.includes("Preview scores are withheld because the live pass did not verify a usable homepage surface."), true);
});

test("off-domain redirects surface an explicit redirect finding", () => {
  const payload = buildPreviewPayloadFromSnapshot({
    hostname: "hyperfund.com",
    normalizedUrl: "https://hyperfund.com",
    snapshot: buildSnapshot({
      finalUrl: "https://nfund.com/",
      registeredDomain: "hyperfund.com",
      redirectCount: 1,
      homepageFetchStatus: "error",
      pagesScanned: 0
    })
  });

  assert.equal(payload.sampleFindings.some((finding) => finding.title === "Domain redirected to a different site"), true);
  assert.equal(payload.summaryBullets.some((bullet) => bullet.includes("redirected to nfund.com")), true);
});
