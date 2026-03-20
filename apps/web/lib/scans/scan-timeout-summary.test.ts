import test from "node:test";
import assert from "node:assert/strict";
import { deriveScanExecutionSummary } from "./scan-timeout-summary";

test("reports clean completed scans as completed as planned", () => {
  const summary = deriveScanExecutionSummary({
    events: [],
    status: "completed",
    timeoutFlag: false
  });

  assert.equal(summary.title, "Scan pass completed as planned");
  assert.equal(summary.tone, "success");
  assert.equal(summary.details[0], "All recorded scan stages completed without persisted warnings or failures.");
});

test("reports timed out scans with warning details", () => {
  const summary = deriveScanExecutionSummary({
    accessibilityRuleCountTotal: 0,
    consentAuditCompleted: false,
    events: [
      {
        eventType: "runtime.browser_pass_diagnostic",
        message: "Browser pass homepage_navigation timeout.",
        metadataJson: {
          stage: "homepage_navigation",
          status: "timeout"
        }
      }
    ],
    renderModeUsed: "http_only",
    status: "completed",
    timeoutFlag: true
  });

  assert.equal(summary.title, "Scan pass completed with warnings");
  assert.equal(summary.tone, "warning");
  assert(summary.details.some((detail) => detail.includes("fell back to the HTTP/static path")));
  assert(summary.details.some((detail) => detail.includes("Homepage navigation timed out")));
});

test("reports failed scans as errors", () => {
  const summary = deriveScanExecutionSummary({
    errorMessage: "Navigation failed",
    events: [],
    status: "failed"
  });

  assert.equal(summary.title, "Scan pass encountered errors");
  assert.equal(summary.tone, "danger");
  assert(summary.details.some((detail) => detail.includes("Navigation failed")));
});

test("reports partial scans with missing target page details", () => {
  const summary = deriveScanExecutionSummary({
    events: [
      {
        eventType: "runtime.build_phase_diagnostic",
        message: "Build phase prefetch_fetch_target ok.",
        metadataJson: {
          phase: "prefetch_fetch_target",
          fetchStatus: "not_found",
          finalUrl: "https://example.com/accessibility",
          pageType: "accessibility_statement",
          status: "ok",
          targetUrl: "https://example.com/accessibility"
        }
      },
      {
        eventType: "runtime.build_phase_diagnostic",
        message: "Build phase expansion_fetch_target ok.",
        metadataJson: {
          phase: "expansion_fetch_target",
          fetchStatus: "not_found",
          finalUrl: "https://example.com/privacy",
          pageType: "privacy_policy",
          status: "ok",
          targetUrl: "https://example.com/privacy"
        }
      },
      {
        eventType: "runtime.build_phase_diagnostic",
        message: "Build phase expansion_fetch_target ok.",
        metadataJson: {
          phase: "expansion_fetch_target",
          fetchStatus: "not_found",
          finalUrl: "https://example.com/terms",
          pageType: "terms_of_service",
          status: "ok",
          targetUrl: "https://example.com/terms"
        }
      },
      {
        eventType: "crawl.page_discovery_completed",
        message: "Stages 1-6 completed.",
        metadataJson: {
          pagesScanned: 2,
          partialScan: true
        }
      }
    ],
    pagesRequested: 8,
    pagesScanned: 2,
    status: "completed",
    timeoutFlag: false
  });

  assert.equal(summary.title, "Scan pass completed with warnings");
  assert(summary.details.some((detail) => detail.includes("only 2 of 8 planned pages captured")));
  assert(summary.details.some((detail) => detail.includes("accessibility statement (https://example.com/accessibility)")));
  assert(summary.details.some((detail) => detail.includes("privacy policy (https://example.com/privacy)")));
  assert(summary.details.some((detail) => detail.includes("terms of service (https://example.com/terms)")));
  assert(summary.details.some((detail) => detail.includes("privacy-policy, legal-page, cookie-policy, terms, accessibility, and contact-page findings")));
});

test("reports provenance-aware key page discovery gaps", () => {
  const summary = deriveScanExecutionSummary({
    keyPageDiscoverySummary: {
      budgets: {
        maxAdditionalFetchAttempts: 8,
        maxCandidates: 20,
        maxFetchAttemptsPerType: 3,
        maxSameBrandCandidatesPerType: 2,
        maxSameBrandSubdomainHosts: 3,
        maxSecondHopLegalHubFetchesPerMissingType: 1,
        maxSitemapFiles: 3,
        maxSitemapIndexChildren: 2
      },
      candidates: [],
      localeHints: ["fr"],
      pageSummaries: [
        {
          attemptCount: 2,
          attemptedUrls: ["https://example.com/politique-de-confidentialite"],
          bestDiscoverySource: "sitemap",
          guessedOnly: false,
          pageType: "privacy_policy",
          stopReason: "all_attempts_failed",
          successfulUrl: null,
          successfulHostRelation: null,
          surfaceDetected: true
        },
        {
          attemptCount: 1,
          attemptedUrls: ["https://example.com/terms"],
          bestDiscoverySource: "guessed_slug",
          guessedOnly: true,
          pageType: "terms_of_service",
          stopReason: "guessed_only",
          successfulUrl: null,
          successfulHostRelation: null,
          surfaceDetected: false
        }
      ],
      sameBrandSubdomainHostsInspected: [],
      sitemapFilesFetched: ["https://example.com/sitemap.xml"],
      sitemapIndexUrlsFetched: [],
      sitemapUrls: ["https://example.com/sitemap.xml"]
    },
    status: "completed"
  });

  assert.equal(summary.title, "Scan pass completed with warnings");
  assert(summary.details.some((detail) => detail.includes("Privacy policy candidates were found via sitemap discovery")));
  assert(summary.details.some((detail) => detail.includes("Only guessed-slug candidates were available for terms of service")));
});
