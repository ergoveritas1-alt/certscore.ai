import assert from "node:assert/strict";
import test from "node:test";
import { buildScanPlan } from "./scan-planner";
import type { StaticPageResult } from "./types";

function makeHomepage(overrides: Partial<StaticPageResult> = {}): StaticPageResult {
  return {
    blockedByPolicy: false,
    fetchStatus: "ok",
    finalUrl: "https://example.com/",
    forms: [],
    headers: {},
    html: "<html><body><a href='/privacy'>Privacy</a><a href='/terms'>Terms</a></body></html>",
    language: "en",
    links: [
      { href: "https://example.com/privacy", text: "Privacy" },
      { href: "https://example.com/terms", text: "Terms" }
    ],
    pageType: "homepage",
    pageUrl: "https://example.com/",
    redirected: false,
    scripts: [],
    statusCode: 200,
    textContent: "Example homepage",
    title: "Example"
  };
}

test("buildScanPlan trims discovery budget for quick static-light scans", () => {
  const plan = buildScanPlan({
    homepage: makeHomepage(),
    requestedPageCount: 3,
    robotsCrawlDelayMs: null
  });

  assert.equal(plan.profile, "static_light");
  assert.equal(plan.prefetchTargetCount, 1);
  assert.equal(plan.expansionTargetCount, 2);
  assert.equal(plan.browserProfileSweepEnabled, false);
  assert.equal(plan.consentProfileSweepEnabled, false);
  assert.equal(plan.browserRuntimeCaptureMaxAttempts, 1);
  assert.equal(plan.additionalDiscoveryMaxFetchAttemptsPerType, 1);
});

test("buildScanPlan keeps larger discovery budget for non-quick balanced scans", () => {
  const plan = buildScanPlan({
    homepage: makeHomepage({
      html: "<html><body><script src='/app.js'></script><a href='/privacy'>Privacy</a></body></html>",
      links: Array.from({ length: 40 }, (_, index) => ({
        href: `https://example.com/page-${index + 1}`,
        text: `Page ${index + 1}`
      })),
      scripts: [
        {
          contentSample: null,
          host: "example.com",
          src: "https://example.com/app.js"
        }
      ]
    }),
    requestedPageCount: 5,
    robotsCrawlDelayMs: null
  });

  assert.equal(plan.prefetchTargetCount, 3);
  assert.equal(plan.expansionTargetCount, 4);
});

test("buildScanPlan keeps richer runtime policy for deep scans", () => {
  const plan = buildScanPlan({
    homepage: makeHomepage({
      html: "<html><body><script src='/app.js'></script><a href='/privacy'>Privacy</a></body></html>",
      scripts: [
        {
          contentSample: null,
          host: "example.com",
          src: "https://example.com/app.js"
        }
      ]
    }),
    requestedPageCount: 12,
    robotsCrawlDelayMs: null
  });

  assert.equal(plan.browserProfileSweepEnabled, true);
  assert.equal(plan.consentProfileSweepEnabled, true);
  assert.equal(plan.browserRuntimeCaptureMaxAttempts, 2);
  assert.equal(plan.additionalDiscoveryMaxFetchAttemptsPerType, 3);
});
