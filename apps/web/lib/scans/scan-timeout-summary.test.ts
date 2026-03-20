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
  assert(summary.details.some((detail) => detail.includes("accessibility, privacy-policy, terms findings")));
});

test("suppresses resolved key page types from partial-scan 404 understatement warnings", () => {
  const summary = deriveScanExecutionSummary({
    events: [
      {
        eventType: "runtime.build_phase_diagnostic",
        message: "Build phase prefetch_fetch_target ok.",
        metadataJson: {
          phase: "prefetch_fetch_target",
          fetchStatus: "not_found",
          finalUrl: "https://www.liveinternet.ru/privacybeleid",
          pageType: "privacy_policy",
          status: "ok",
          targetUrl: "https://www.liveinternet.ru/privacybeleid"
        }
      },
      {
        eventType: "runtime.build_phase_diagnostic",
        message: "Build phase prefetch_fetch_target ok.",
        metadataJson: {
          phase: "prefetch_fetch_target",
          fetchStatus: "not_found",
          finalUrl: "https://www.liveinternet.ru/gebruiksvoorwaarden",
          pageType: "terms_of_service",
          status: "ok",
          targetUrl: "https://www.liveinternet.ru/gebruiksvoorwaarden"
        }
      },
      {
        eventType: "runtime.build_phase_diagnostic",
        message: "Build phase prefetch_fetch_target ok.",
        metadataJson: {
          phase: "prefetch_fetch_target",
          fetchStatus: "not_found",
          finalUrl: "http://wiki.liveinternet.ru/ServisDnevnikovLiveInternet/cookies",
          pageType: "cookie_policy",
          status: "ok",
          targetUrl: "http://wiki.liveinternet.ru/ServisDnevnikovLiveInternet/cookies"
        }
      },
      {
        eventType: "runtime.build_phase_diagnostic",
        message: "Build phase prefetch_fetch_target ok.",
        metadataJson: {
          phase: "prefetch_fetch_target",
          fetchStatus: "not_found",
          finalUrl: "http://wiki.liveinternet.ru/ServisDnevnikovLiveInternet/accessibility",
          pageType: "accessibility_statement",
          status: "ok",
          targetUrl: "http://wiki.liveinternet.ru/ServisDnevnikovLiveInternet/accessibility"
        }
      },
      {
        eventType: "crawl.page_discovery_completed",
        message: "Stages 1-6 completed.",
        metadataJson: {
          pagesScanned: 4,
          partialScan: true
        }
      }
    ],
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
      localeHints: ["en", "nl", "ru"],
      pageSummaries: [
        {
          attemptCount: 1,
          attemptedUrls: ["https://www.liveinternet.ru/privacybeleid"],
          bestDiscoverySource: "same_brand_subdomain",
          guessedOnly: false,
          pageType: "privacy_policy",
          stopReason: "covered",
          successfulUrl: "http://wiki.liveinternet.ru/ServisDnevnikovLiveInternet/PrivacyPolicy",
          successfulHostRelation: "same_brand_subdomain",
          surfaceDetected: true
        },
        {
          attemptCount: 2,
          attemptedUrls: [
            "https://www.liveinternet.ru/gebruiksvoorwaarden",
            "http://wiki.liveinternet.ru/ServisDnevnikovLiveInternet/Pravila"
          ],
          bestDiscoverySource: "same_brand_subdomain",
          guessedOnly: false,
          pageType: "terms_of_service",
          stopReason: "covered",
          successfulUrl: "http://wiki.liveinternet.ru/ServisDnevnikovLiveInternet/Pravila",
          successfulHostRelation: "same_brand_subdomain",
          surfaceDetected: true
        },
        {
          attemptCount: 1,
          attemptedUrls: ["http://wiki.liveinternet.ru/ServisDnevnikovLiveInternet/cookies"],
          bestDiscoverySource: "same_brand_subdomain",
          guessedOnly: false,
          pageType: "cookie_policy",
          stopReason: "all_attempts_failed",
          successfulUrl: null,
          successfulHostRelation: null,
          surfaceDetected: true
        },
        {
          attemptCount: 1,
          attemptedUrls: ["http://wiki.liveinternet.ru/ServisDnevnikovLiveInternet/accessibility"],
          bestDiscoverySource: "guessed_slug",
          guessedOnly: false,
          pageType: "accessibility_statement",
          stopReason: "all_attempts_failed",
          successfulUrl: null,
          successfulHostRelation: null,
          surfaceDetected: true
        }
      ],
      sameBrandSubdomainHostsInspected: ["https://wiki.liveinternet.ru/"],
      sitemapFilesFetched: [],
      sitemapIndexUrlsFetched: [],
      sitemapUrls: []
    },
    pagesRequested: 8,
    pagesScanned: 4,
    status: "completed",
    timeoutFlag: false
  });

  const combined = summary.details.join("\n");
  assert.doesNotMatch(combined, /privacy policy \(https:\/\/www\.liveinternet\.ru\/privacybeleid\)/i);
  assert.doesNotMatch(combined, /terms of service \(https:\/\/www\.liveinternet\.ru\/gebruiksvoorwaarden\)/i);
  assert.match(combined, /cookie policy \(http:\/\/wiki\.liveinternet\.ru\/ServisDnevnikovLiveInternet\/cookies\)/i);
  assert.match(combined, /accessibility statement \(http:\/\/wiki\.liveinternet\.ru\/ServisDnevnikovLiveInternet\/accessibility\)/i);
  assert.match(combined, /may understate cookie-policy, accessibility findings/i);
  assert.doesNotMatch(combined, /may understate .*privacy-policy/i);
  assert.doesNotMatch(combined, /may understate .*terms/i);
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
