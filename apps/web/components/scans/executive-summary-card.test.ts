import assert from "node:assert/strict";
import test from "node:test";
import type { AgencyMapping, RegulatoryRiskAssessment } from "@website-signal-risk-scanner/shared";
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

function makeRegulatoryRisk(overrides: Partial<RegulatoryRiskAssessment> = {}): RegulatoryRiskAssessment {
  return {
    overallScore: 50,
    riskLevel: "moderate",
    confidence: 0.8,
    topRiskDrivers: [],
    topMitigatingControls: [],
    trendVsPreviousScan: {
      delta: null,
      direction: "unknown",
      label: "No prior risk baseline"
    },
    privacyEnforcementRiskScore: 40,
    consentEnforcementRiskScore: 42,
    consumerProtectionRiskScore: 38,
    accessibilityEnforcementRiskScore: 55,
    dataExposureRiskScore: 24,
    ...overrides
  };
}

function makeAgencyMapping(overrides: Partial<AgencyMapping> = {}): AgencyMapping {
  return {
    agencyKey: "doj_ada",
    agencyLabel: "U.S. Department of Justice",
    shortLabel: "DOJ / ADA",
    category: "accessibility",
    relevanceLevel: "moderate",
    relevanceScore: 8,
    rationale: "This scan surfaced accessibility signals that fit most closely with ADA-related expectations.",
    helperLabel: "Accessibility and ADA-related web expectations",
    triggeredSignals: [{ key: "wcagErrorCountTotal", label: "High automated WCAG issue count" }],
    contributingSubscores: [{ key: "accessibilityEnforcementRiskScore", label: "Accessibility", score: 55 }],
    topAgencyRiskDrivers: ["High automated WCAG issue count", "Accessibility subscore"],
    relatedOverallRiskLevel: "moderate",
    isPrimaryAgency: true,
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

test("buildRegulatoryLenses adds DOJ / ADA accessibility when the shared accessibility overlay is materially triggered", () => {
  const lenses = buildRegulatoryLenses(
    [],
    {
      beforeConsentCookieCount: 0,
      thirdPartyRequestCount: 0
    },
    {
      accessibilitySignals: {
        accessibilityClaimMismatchDetected: true,
        accessibilityLitigationRiskScore: 61,
        accessibilityStatementPresent: false,
        wcagErrorCountTotal: 27,
        wcagFormLabelErrorCount: 4,
        wcagKeyboardNavigationIssueCount: 3,
        wcagMissingAltCount: 7
      },
      agencyMappings: [makeAgencyMapping()],
      regulatoryRisk: makeRegulatoryRisk({
        accessibilityEnforcementRiskScore: 61
      })
    }
  );

  const adaLens = lenses.find((lens) => lens.acronym === "DOJ / ADA accessibility");
  assert.ok(adaLens);
  assert.equal(adaLens?.summary, "Accessibility claims appear inconsistent with observed barriers.");
  assert.match(adaLens?.findings.join(" "), /Automated WCAG issues detected: 27/);
  assert.match(adaLens?.findings.join(" "), /Keyboard navigation issues surfaced/);
  assert.match(adaLens?.findings.join(" "), /Accessibility statement not detected/);
  assert.equal(
    adaLens?.findings.filter((item) => /accessibility statement/i.test(item)).length,
    1
  );
});

test("buildRegulatoryLenses keeps ADA and financial claims as minimal cards when no significant findings are present", () => {
  const lenses = buildRegulatoryLenses(
    [],
    {
      beforeConsentCookieCount: 0,
      thirdPartyRequestCount: 0
    },
    {
      accessibilitySignals: {
        accessibilityStatementPresent: true,
        wcagErrorCountTotal: 2
      },
      agencyMappings: [
        makeAgencyMapping({
          relevanceLevel: "limited",
          triggeredSignals: [{ key: "accessibilityStatementPresent", label: "Accessibility statement missing" }]
        })
      ],
      regulatoryRisk: makeRegulatoryRisk({
        accessibilityEnforcementRiskScore: 18
      })
    }
  );

  const adaLens = lenses.find((lens) => lens.acronym === "DOJ / ADA accessibility");
  const financialLens = lenses.find((lens) => lens.acronym === "Financial & commercial claims");
  assert.ok(adaLens);
  assert.ok(financialLens);
  assert.equal(adaLens?.minimal, true);
  assert.equal(financialLens?.minimal, true);
  assert.equal(adaLens?.summary, "No significant accessibility issues found.");
  assert.equal(financialLens?.ratingLabel, "Not applicable");
  assert.equal(financialLens?.summary, "");
});

test("buildRegulatoryLenses keeps ADA and financial claims minimal when accessibility signals remain low-signal", () => {
  const lenses = buildRegulatoryLenses(
    [],
    {
      beforeConsentCookieCount: 0,
      thirdPartyRequestCount: 0
    },
    {
      accessibilitySignals: {
        accessibilityStatementPresent: true,
        wcagErrorCountTotal: 0
      },
      agencyMappings: [
        makeAgencyMapping({
          relevanceLevel: "limited",
          triggeredSignals: []
        })
      ],
      regulatoryRisk: makeRegulatoryRisk({
        accessibilityEnforcementRiskScore: 18
      })
    }
  );

  const adaLens = lenses.find((lens) => lens.acronym === "DOJ / ADA accessibility");
  const financialLens = lenses.find((lens) => lens.acronym === "Financial & commercial claims");
  assert.ok(adaLens);
  assert.ok(financialLens);
  assert.equal(adaLens?.minimal, true);
  assert.equal(financialLens?.minimal, true);
  assert.equal(financialLens?.ratingLabel, "Not applicable");
  assert.equal(financialLens?.summary, "");
});

test("buildRegulatoryLenses places financial claims directly below DOJ / ADA accessibility in regulatory findings", () => {
  const lenses = buildRegulatoryLenses(
    [
      makeFinding("earnings_claim_without_adjacent_disclosure", "Earnings claim without nearby disclosure", {
        severity: "high",
        shortSummary: "Earn up to $5,000 per month language surfaced near signup copy."
      }),
      makeFinding("pricing_or_fee_transparency_unclear", "Pricing or fee transparency unclear", {
        severity: "medium",
        shortSummary: "Pricing details were not clearly visible near the conversion path."
      })
    ],
    {
      beforeConsentCookieCount: 0,
      thirdPartyRequestCount: 0
    },
    {
      accessibilitySignals: {
        accessibilityStatementPresent: true,
        wcagErrorCountTotal: 2
      },
      agencyMappings: [makeAgencyMapping()],
      regulatoryRisk: makeRegulatoryRisk({
        accessibilityEnforcementRiskScore: 18
      })
    }
  );

  assert.deepEqual(
    lenses.map((lens) => lens.acronym),
    ["GDPR / ePrivacy", "CCPA / CPRA", "FTC", "DOJ / ADA accessibility", "Financial & commercial claims"]
  );

  const financialLens = lenses.at(-1);
  assert.equal(financialLens?.detailTitle, "Claims, urgency, and pricing disclosures");
  assert.match(financialLens?.summary ?? "", /claims|pricing/i);
  assert.equal(financialLens?.minimal, undefined);
  assert.match(financialLens?.findings.join(" ") ?? "", /Earnings-style claim surfaced/);
  assert.match(financialLens?.findings.join(" ") ?? "", /Pricing or fee disclosure remains unclear/);
});

test("ExecutiveSummaryCard renders a neutral empty state when no headline findings survive filtering", () => {
  const html = renderToStaticMarkup(
    createElement(ExecutiveSummaryCard, {
      accessLimitationNotice: null,
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
      accessibilitySignals: {
        accessibilityStatementPresent: true,
        wcagErrorCountTotal: 0
      },
      agencyMappings: [
        makeAgencyMapping({
          relevanceLevel: "limited",
          triggeredSignals: []
        })
      ],
      regulatoryRisk: makeRegulatoryRisk({
        accessibilityEnforcementRiskScore: 18
      }),
      topObservedEntities: [{ label: "Google Tag Manager", category: "cdn_infra", requestCount: 12 }],
      trackerSummary: "1 vendor across 5 third-party domains",
      unresolvedVendorHosts: [],
      vendorCategoryCounts: { cdn_infra: 1 }
    })
  );

  assert.match(html, /Primary concerns:<\/span> No headline findings surfaced from the available scan coverage\./);
  assert.match(html, /Highest-priority issues/);
  assert.match(html, /Review the supporting evidence below for lower-priority signals and scan context\./);
  assert.match(html, /DOJ \/ ADA accessibility/);
  assert.match(html, /Financial &amp; commercial claims/);
  assert.match(html, /No significant accessibility issues found\./);
  assert.match(html, /Not applicable/);
  assert.doesNotMatch(html, /No significant financial or commercial claims issues found\./);
});

test("ExecutiveSummaryCard scopes the hero copy when scan coverage is thin", () => {
  const html = renderToStaticMarkup(
    createElement(ExecutiveSummaryCard, {
      accessLimitationNotice: null,
      beforeConsentCookieCount: 6,
      domainBenchmark: null,
      finalHost: "www.ford.com",
      fingerprintReasons: [],
      fingerprintLabel: "None detected",
      fingerprintNarrative: "No strong fingerprinting signal surfaced.",
      landedOnDifferentHost: false,
      lastScannedAt: "2026-04-18T19:31:00.000Z",
      legalCoverageScore: 0,
      pagesScanned: 1,
      policyEnrichmentCount: 0,
      posture: "Action Needed",
      preConsentVendorNames: [],
      requestedHost: "ford.com",
      resolvedVendorNames: ["Google Tag Manager"],
      score: 67,
      sessionReplayVendorNames: [],
      thirdPartyRequestCount: 20,
      thirdPartyDomains: ["www.googletagmanager.com"],
      topFindings: [
        makeFinding("pre_consent_tracking_detected", "Tracking started before consent", {
          severity: "critical",
          shortSummary: "Tracking started before consent."
        })
      ],
      topObservedEntities: [{ label: "Google Tag Manager", category: "analytics", requestCount: 5 }],
      trackerSummary: "1 vendor across 1 third-party domain",
      unresolvedVendorHosts: [],
      vendorCategoryCounts: { analytics: 1 },
      verifiedPublicSurfacesCount: 0
    })
  );

  assert.match(html, /Limited scan coverage surfaced possible homepage privacy concerns/);
  assert.match(html, /Coverage note:<\/span> Possible homepage findings were retained from limited public coverage\. Tracking started before consent/);
  assert.match(html, /Possible homepage issues/);
  assert.doesNotMatch(html, /Immediate privacy and consent issues detected/);
});

test("ExecutiveSummaryCard scopes the hero copy when the scan outcome shows blocked partial access", () => {
  const html = renderToStaticMarkup(
    createElement(ExecutiveSummaryCard, {
      accessLimitationNotice: null,
      beforeConsentCookieCount: 6,
      domainBenchmark: null,
      finalHost: "www.nytimes.com",
      fingerprintReasons: [],
      fingerprintLabel: "None detected",
      fingerprintNarrative: "No strong fingerprinting signal surfaced.",
      landedOnDifferentHost: false,
      lastScannedAt: "2026-04-18T21:02:19.000Z",
      legalCoverageScore: 0,
      pagesScanned: 4,
      policyEnrichmentCount: 3,
      posture: "Action Needed",
      preConsentVendorNames: [],
      requestedHost: "nytimes.com",
      resolvedVendorNames: ["Google Tag Manager"],
      score: 67,
      scanOutcome: "reachability_blocked_captcha",
      sessionReplayVendorNames: [],
      thirdPartyRequestCount: 20,
      thirdPartyDomains: ["www.googletagmanager.com"],
      topFindings: [
        makeFinding("pre_consent_tracking_detected", "Tracking started before consent", {
          severity: "critical",
          shortSummary: "Tracking started before consent."
        })
      ],
      topObservedEntities: [{ label: "Google Tag Manager", category: "analytics", requestCount: 5 }],
      trackerSummary: "1 vendor across 1 third-party domain",
      unresolvedVendorHosts: [],
      vendorCategoryCounts: { analytics: 1 },
      verifiedPublicSurfacesCount: 3
    })
  );

  assert.match(html, /Limited scan coverage surfaced possible homepage privacy concerns/);
  assert.match(html, /Coverage note:<\/span> Possible homepage findings were retained from limited public coverage\. Tracking started before consent/);
  assert.doesNotMatch(html, /Immediate privacy and consent issues detected/);
});

test("ExecutiveSummaryCard scopes the hero copy when coverage level is limited partial", () => {
  const html = renderToStaticMarkup(
    createElement(ExecutiveSummaryCard, {
      accessLimitationNotice: null,
      beforeConsentCookieCount: 6,
      coverageLevel: "limited_partial",
      domainBenchmark: null,
      finalHost: "www.nist.gov",
      fingerprintReasons: [],
      fingerprintLabel: "None detected",
      fingerprintNarrative: "No strong fingerprinting signal surfaced.",
      landedOnDifferentHost: false,
      lastScannedAt: "2026-04-18T21:03:44.000Z",
      legalCoverageScore: 0,
      pagesScanned: 3,
      policyEnrichmentCount: 1,
      posture: "Action Needed",
      preConsentVendorNames: [],
      requestedHost: "nist.gov",
      resolvedVendorNames: ["Google Analytics"],
      score: 65,
      scanOutcome: "completed_partial",
      sessionReplayVendorNames: [],
      thirdPartyRequestCount: 20,
      thirdPartyDomains: ["www.google-analytics.com"],
      topFindings: [
        makeFinding("pre_consent_tracking_detected", "Tracking started before consent", {
          severity: "critical",
          shortSummary: "Tracking started before consent."
        })
      ],
      topObservedEntities: [{ label: "Google Analytics", category: "analytics", requestCount: 5 }],
      trackerSummary: "1 vendor across 1 third-party domain",
      unresolvedVendorHosts: [],
      vendorCategoryCounts: { analytics: 1 },
      verifiedPublicSurfacesCount: 2
    })
  );

  assert.match(html, /Limited scan coverage surfaced possible homepage privacy concerns/);
  assert.match(html, /Coverage note:<\/span> Possible homepage findings were retained from limited public coverage\. Tracking started before consent/);
  assert.doesNotMatch(html, /Immediate privacy and consent issues detected/);
});

test("ExecutiveSummaryCard switches to host-resolution scope language when the request lands on a different host", () => {
  const html = renderToStaticMarkup(
    createElement(ExecutiveSummaryCard, {
      accessLimitationNotice: null,
      beforeConsentCookieCount: 6,
      domainBenchmark: null,
      finalHost: "www.brandforce.com",
      fingerprintReasons: [],
      fingerprintLabel: "None detected",
      fingerprintNarrative: "No strong fingerprinting signal surfaced.",
      landedOnDifferentHost: true,
      lastScannedAt: "2026-04-18T20:02:33.000Z",
      legalCoverageScore: 0,
      pagesScanned: 1,
      policyEnrichmentCount: 0,
      posture: "Action Needed",
      preConsentVendorNames: [],
      requestedHost: "helio.com",
      resolvedVendorNames: ["Google Analytics"],
      score: 65,
      sessionReplayVendorNames: [],
      thirdPartyRequestCount: 20,
      thirdPartyDomains: ["www.google-analytics.com"],
      topFindings: [
        makeFinding("pre_consent_tracking_detected", "Tracking started before consent", {
          severity: "critical",
          shortSummary: "Tracking started before consent."
        })
      ],
      topObservedEntities: [{ label: "Google Analytics", category: "analytics", requestCount: 5 }],
      trackerSummary: "1 vendor across 1 third-party domain",
      unresolvedVendorHosts: [],
      vendorCategoryCounts: { analytics: 1 },
      verifiedPublicSurfacesCount: 0
    })
  );

  assert.match(html, /Requested domain resolved to a different host during this scan/);
  assert.match(html, /Scope note:<\/span> Observed runtime and disclosure signals came from www\.brandforce\.com, not helio\.com\./);
  assert.match(html, /Observed on landed host/);
  assert.doesNotMatch(html, /Limited scan coverage surfaced possible homepage privacy concerns/);
  assert.doesNotMatch(html, /Immediate privacy and consent issues detected/);
});

test("ExecutiveSummaryCard switches to blocked-access language when no reliable findings were retained", () => {
  const html = renderToStaticMarkup(
    createElement(ExecutiveSummaryCard, {
      accessLimitationNotice: {
        coverageLabel: "No public verification available",
        guidance: ["Retry from a normal browsing session."],
        headline: "Public site access was limited during this scan",
        message: "No reliable privacy or consent findings were retained because the scan could not verify a usable public page.",
        recommendationTitle: "Recommended next step",
        reason: "Reason: homepage request was blocked with HTTP 403.",
        title: "Access limited by site protections",
        whatThisMeans: ["This run does not support trustworthy privacy conclusions."]
      },
      beforeConsentCookieCount: 18,
      domainBenchmark: null,
      finalHost: "www.adidas.com",
      fingerprintReasons: [],
      fingerprintLabel: "None detected",
      fingerprintNarrative: "No strong fingerprinting signal surfaced.",
      landedOnDifferentHost: false,
      lastScannedAt: "2026-04-05T23:19:47.000Z",
      posture: "Watch",
      preConsentVendorNames: [],
      requestedHost: "adidas.com",
      resolvedVendorNames: [],
      score: 73,
      sessionReplayVendorNames: [],
      thirdPartyRequestCount: 0,
      thirdPartyDomains: [],
      topFindings: [
        makeFinding("access_limited_no_reliable_findings", "Public site access was limited", {
          section: "Runtime & Diagnostics",
          severity: "medium",
          confidence: "strong",
          shortSummary: "This run could not fully verify public pages because the site limited automated access from the scan environment."
        })
      ],
      topObservedEntities: [],
      trackerSummary: "No meaningful third-party footprint observed",
      unresolvedVendorHosts: [],
      vendorCategoryCounts: {}
    })
  );

  assert.match(html, /Public site access was limited during this scan/);
  assert.match(html, /Scan limitation:<\/span> No reliable privacy or consent findings were retained because the scan could not verify a usable public page\./);
  assert.match(html, /Access limitation/);
  assert.match(html, /This run was blocked before it established a trustworthy public browsing path/);
  assert.doesNotMatch(html, /Regulatory findings/);
});

test("ExecutiveSummaryCard renders DOJ / ADA accessibility with accessibility-specific evidence", () => {
  const html = renderToStaticMarkup(
    createElement(ExecutiveSummaryCard, {
      accessLimitationNotice: null,
      accessibilitySignals: {
        accessibilityClaimMismatchDetected: true,
        accessibilityLitigationRiskScore: 61,
        accessibilityStatementPresent: false,
        wcagErrorCountTotal: 27,
        wcagFormLabelErrorCount: 4,
        wcagKeyboardNavigationIssueCount: 3,
        wcagMissingAltCount: 7
      },
      agencyMappings: [makeAgencyMapping()],
      beforeConsentCookieCount: 0,
      domainBenchmark: null,
      finalHost: "www.example.com",
      fingerprintReasons: [],
      fingerprintLabel: "None detected",
      fingerprintNarrative: "No strong fingerprinting signal surfaced.",
      landedOnDifferentHost: false,
      lastScannedAt: "2026-04-20T17:19:47.000Z",
      posture: "Watch",
      preConsentVendorNames: [],
      regulatoryRisk: makeRegulatoryRisk({
        accessibilityEnforcementRiskScore: 61
      }),
      requestedHost: "example.com",
      resolvedVendorNames: [],
      score: 73,
      sessionReplayVendorNames: [],
      thirdPartyRequestCount: 0,
      thirdPartyDomains: [],
      topFindings: [],
      topObservedEntities: [],
      trackerSummary: "No meaningful third-party footprint observed",
      unresolvedVendorHosts: [],
      vendorCategoryCounts: {}
    })
  );

  assert.match(html, /DOJ \/ ADA accessibility/);
  assert.match(html, /Accessibility claims appear inconsistent with observed barriers\./);
  assert.match(html, /Automated WCAG issues detected: 27/);
  assert.match(html, /Keyboard navigation issues surfaced/);
  assert.match(html, /Accessibility statement not detected/);
  assert.doesNotMatch(html, /Third-party collection and disclosure posture drives this score\./);
});

test("ExecutiveSummaryCard renders regulatory score bars with fractional segment fill", () => {
  const html = renderToStaticMarkup(
    createElement(ExecutiveSummaryCard, {
      accessLimitationNotice: null,
      beforeConsentCookieCount: 0,
      domainBenchmark: {
        confidence: "medium",
        estimatedRankLabel: "Top 10k",
        expectedCookiesBeforeConsent: 1,
        expectedOverallScore: 60,
        expectedThirdPartyRequests: 12,
        industry: "Social",
        rationale: "test"
      },
      finalHost: "facebook.com",
      fingerprintReasons: [],
      fingerprintLabel: "Low",
      fingerprintNarrative: "No notable fingerprinting indicators.",
      landedOnDifferentHost: false,
      lastScannedAt: "2026-04-20T17:00:00.000Z",
      posture: "Watch",
      preConsentVendorNames: [],
      requestedHost: "facebook.com",
      resolvedVendorNames: [],
      score: 53,
      sessionReplayVendorNames: [],
      thirdPartyDomains: [],
      thirdPartyRequestCount: 46,
      topFindings: [],
      topObservedEntities: [],
      trackerSummary: "Minimal footprint",
      unresolvedVendorHosts: [],
      vendorCategoryCounts: {}
    })
  );

  assert.match(html, /width:20(?:\.\d+)?%/);
});
