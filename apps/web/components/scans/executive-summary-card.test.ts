import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildRegulatoryLenses, ExecutiveSummaryCard } from "./executive-summary-card";
import type { CertScoreFinding } from "../../lib/scans/finding-registry";

function makeFinding(
  id: CertScoreFinding["id"],
  label: string,
  overrides: Partial<CertScoreFinding> = {}
): CertScoreFinding {
  return {
    id,
    label,
    section: "Privacy & Tracking",
    defaultSurfacePriority: 100,
    whyItMatters: "test",
    remediation: "test",
    confidence: "good",
    directVsInferred: "direct",
    evidencePreview: [],
    evidenceRefs: [],
    severity: "high",
    shortSummary: label,
    ...overrides
  };
}

test("buildRegulatoryLenses treats canonical pre-consent and dark-pattern cards as regulatory risk", () => {
  const lenses = buildRegulatoryLenses(
    [
      makeFinding("pre_consent_tracking_detected", "Tracking started before consent", {
        severity: "critical",
        shortSummary: "7 third-party requests fired before any consent action."
      }),
      makeFinding("consent_dark_patterns_detected", "Dark pattern consent signals detected", {
        shortSummary: "Accept appears more prominent than reject or settings."
      }),
      makeFinding("reject_option_missing_or_hidden", "Reject option missing or hidden", {
        shortSummary: "The consent UI did not present a clear reject path."
      })
    ],
    {
      beforeConsentCookieCount: 16,
      thirdPartyRequestCount: 87
    }
  );

  assert.equal(lenses[0]?.summary, "Consent and pre-consent tracking risk is the main issue.");
  assert.equal(lenses[0]?.ratingLabel, "Needs work");
  assert.equal(lenses[1]?.summary, "Third-party collection and disclosure posture drives this score.");
  assert.equal(lenses[2]?.summary, "Choice architecture and disclosure clarity are the main FTC-style concerns.");
  assert.equal(lenses[2]?.ratingLabel, "Needs work");
});

test("ExecutiveSummaryCard renders a neutral empty state when no headline findings survive filtering", () => {
  const html = renderToStaticMarkup(
    createElement(ExecutiveSummaryCard, {
      beforeConsentCookieCount: 0,
      domainBenchmark: null,
      finalHost: "www.paypal.com",
      fingerprintReasons: [],
      fingerprintLabel: "None detected",
      fingerprintNarrative: "No strong fingerprinting signal surfaced.",
      landedOnDifferentHost: false,
      lastScannedAt: "2026-04-05T23:07:47.000Z",
      posture: "Watch",
      preConsentVendorNames: [],
      requestedHost: "paypal.com",
      resolvedVendorNames: ["Google Tag Manager"],
      score: 78,
      sessionReplayVendorNames: [],
      thirdPartyRequestCount: 85,
      thirdPartyDomains: ["www.paypalobjects.com", "www.googletagmanager.com"],
      topFindings: [],
      topObservedEntities: [{ label: "Google Tag Manager", category: "cdn_infra", requestCount: 12 }],
      trackerSummary: "1 vendor across 5 third-party domains",
      unresolvedVendorHosts: [],
      vendorCategoryCounts: { cdn_infra: 1 }
    })
  );

  assert.match(html, /Primary concerns:<\/span> No headline issue crossed the executive threshold for this scan\./);
  assert.match(html, /Highest-priority issues/);
  assert.match(html, /Review the supporting evidence below for lower-priority signals and scan context\./);
});
