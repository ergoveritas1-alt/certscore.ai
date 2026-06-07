import assert from "node:assert/strict";
import test from "node:test";
import { buildQueuedFullScanConfig } from "./full-scan-config";

test("queued full-scan config keeps anonymous and organization-owned scanner contract aligned", () => {
  const baseInput = {
    hostname: "example.com",
    maxPages: 3,
    normalizedUrl: "https://example.com/",
    profile: "homepage"
  };

  const anonymousConfig = buildQueuedFullScanConfig({
    ...baseInput,
    source: "marketing-anonymous-full-scan"
  });
  const organizationConfig = buildQueuedFullScanConfig({
    ...baseInput,
    source: "manual-dashboard"
  });

  assert.deepEqual(
    { ...anonymousConfig, source: "normalized-for-comparison" },
    { ...organizationConfig, source: "normalized-for-comparison" }
  );
  assert.equal(anonymousConfig.processor, "queued-full-scan-v1");
  assert.equal(anonymousConfig.maxRequestedTier, "tier5_full_scan");
  assert.equal(anonymousConfig.freshBrowserRequired, true);
});

test("queued full-scan config carries prior scan acceleration only as execution metadata", () => {
  const config = buildQueuedFullScanConfig({
    hostname: "example.com",
    maxPages: 3,
    normalizedUrl: "https://example.com/",
    priorScanAcceleration: {
      crawlSeedHints: [
        {
          confidence: 0.91,
          hintType: "privacy_policy",
          source: "prior_scan_hint",
          sourceCompletedAt: "2026-05-01T00:00:00.000Z",
          sourceScanId: "scan-prior",
          url: "https://example.com/privacy"
        },
        {
          confidence: 0.65,
          hintType: "homepage_final_url",
          source: "prior_scan_hint",
          sourceCompletedAt: "2026-05-01T00:00:00.000Z",
          sourceScanId: "scan-prior",
          url: "https://www.example.com/"
        }
      ],
      priorScan: {
        crawlSeedHintCount: 2,
        crawlSeedHintTypes: ["privacy_policy", "homepage_final_url"],
        selectedDocumentSourceCount: 1,
        selectedHighYieldPageCount: 1,
        sourceCompletedAt: "2026-05-01T00:00:00.000Z",
        sourceScanId: "scan-prior"
      }
    },
    profile: "homepage",
    source: "manual-dashboard"
  });

  assert.deepEqual(config.execution?.priorScanAcceleration, {
    crawlSeedHintCount: 2,
    crawlSeedHintTypes: ["privacy_policy", "homepage_final_url"],
    selectedDocumentSourceCount: 1,
    selectedHighYieldPageCount: 1,
    sourceCompletedAt: "2026-05-01T00:00:00.000Z",
    sourceScanId: "scan-prior"
  });
  assert.deepEqual(config.execution?.crawlSeedHints, [
    {
      confidence: 0.91,
      hintType: "privacy_policy",
      source: "prior_scan_hint",
      sourceCompletedAt: "2026-05-01T00:00:00.000Z",
      sourceScanId: "scan-prior",
      url: "https://example.com/privacy"
    },
    {
      confidence: 0.65,
      hintType: "homepage_final_url",
      source: "prior_scan_hint",
      sourceCompletedAt: "2026-05-01T00:00:00.000Z",
      sourceScanId: "scan-prior",
      url: "https://www.example.com/"
    }
  ]);
  assert.equal(Object.hasOwn(config, "findings"), false);
  assert.equal(Object.hasOwn(config, "signals"), false);
});

test("queued full-scan config carries explicit California privacy runtime flags without evidence shortcuts", () => {
  const defaultConfig = buildQueuedFullScanConfig({
    hostname: "example.com",
    maxPages: 3,
    normalizedUrl: "https://example.com/",
    profile: "homepage",
    source: "california-cohort-validation"
  });

  assert.equal(Object.hasOwn(defaultConfig, "californiaPrivacy"), false);

  const config = buildQueuedFullScanConfig({
    californiaPrivacy: {
      exercisePrivacyChoicePath: true,
      forceGpcVerification: true
    },
    hostname: "example.com",
    maxPages: 3,
    normalizedUrl: "https://example.com/",
    profile: "homepage",
    source: "california-cohort-validation"
  });

  assert.deepEqual(config.californiaPrivacy, {
    exercisePrivacyChoicePath: true,
    forceGpcVerification: true
  });
  assert.equal(Object.hasOwn(config, "findings"), false);
  assert.equal(Object.hasOwn(config, "signals"), false);
});
