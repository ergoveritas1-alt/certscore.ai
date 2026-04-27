import assert from "node:assert/strict";
import test from "node:test";
import type { AgencyMapping, RegulatoryRiskAssessment } from "@website-signal-risk-scanner/shared";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildRegulatoryLenses, buildRegulatoryLensesFromUnifiedPackets, ExecutiveSummaryCard } from "./executive-summary-card";
import { ADA_ACCESSIBILITY_FIXTURES } from "../../lib/scans/ada-accessibility.fixtures";
import type { CertScoreFinding } from "../../lib/scans/finding-registry";
import type { UnifiedFindingDisplayPacket } from "../../lib/scans/unified-findings";

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

function regulatoryFindingLabels(findings: Array<{ label: string }>) {
  return findings.map((finding) => finding.label);
}

function makeUnifiedPacket(
  unifiedFindingId: string,
  overrides: Partial<UnifiedFindingDisplayPacket> = {}
): UnifiedFindingDisplayPacket {
  return {
    affectedPageCount: 1,
    categoryAlignments: [],
    confidenceBand: "moderate",
    confidenceInputs: {
      evidenceQualityFlags: [],
      hasConcretePayloadEvidence: false,
      hasCorroboratedPositiveSurfaceEvidence: false,
      hasDirectRuntimeEvidence: false,
      hasKeyPageDiscoveryEvidence: false,
      hasMultipleHumanFacingUrls: false,
      hasPageAttribution: true,
      hasPacketBackedEvidence: true,
      hasPolicyTextEvidence: false,
      hasReadableSurfaceSnippetEvidence: true,
      hasStructuredValidationEvidence: true,
      isFallbackOnly: false,
      issueCount: 0,
      signalCount: 1,
      sourceCount: 1,
      sourceKinds: ["validation"],
      validationCount: 1
    },
    details: { family: "accessibility", kind: unifiedFindingId },
    linkedValidationFinding: null,
    observedValue: null,
    presentation: {
      findingName: unifiedFindingId,
      suggestedFix: "Review retained axe examples.",
      whyThisMatters: "Representative accessibility barriers can create usability and ADA review risk."
    },
    presentationDecision: {
      confidenceRationale: "test",
      downgradeReasons: [],
      rationale: "test",
      status: "surface",
      verificationLabel: "Verified",
      verificationState: "verified"
    },
    primaryPageUrl: "https://example.com/",
    referenceLabel: undefined,
    referenceUrl: undefined,
    severity: "medium",
    sourceLabel: undefined,
    sourceRefs: [],
    sourceUrl: undefined,
    summary: `${unifiedFindingId} summary`,
    surfacingDecision: {
      appliedRules: [],
      decisionReasons: [],
      decisionState: "confirmed",
      family: "accessibility",
      policyVersion: "test",
      reportable: true,
      reportLane: "main",
      supports: [],
      surfaceTier: "headline",
      unifiedFindingId,
      usedFamilyDefault: false,
      usedFindingOverride: false
    },
    title: unifiedFindingId,
    unifiedFindingId,
    ...overrides
  } satisfies UnifiedFindingDisplayPacket;
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

test("buildRegulatoryLenses uses gambling-specific FTC copy for sensitive tracking on sportsbook benchmarks", () => {
  const lenses = buildRegulatoryLenses(
    [
      makeFinding("pre_consent_tracking_detected", "Tracking started before consent", {
        shortSummary: "Pre-consent tracking was observed on a sports betting or gambling site."
      }),
      makeFinding("session_recording_services_detected", "Session recording services detected", {
        shortSummary: "FullStory session replay was observed before consent."
      })
    ],
    {
      beforeConsentCookieCount: 0,
      thirdPartyRequestCount: 95
    },
    {
      benchmarkIndustry: "Sports betting / gambling",
      regulatoryRisk: makeRegulatoryRisk({
        topRiskDrivers: [{ key: "sensitive_context_tracking", label: "Sensitive-context tracking before consent", impact: 26 }]
      })
    }
  );

  const ftcLens = lenses.find((lens) => lens.acronym === "FTC");
  assert.match(ftcLens?.summary ?? "", /High-risk gambling, financial-behavior, and advertising flows/i);
  assert.doesNotMatch(ftcLens?.summary ?? "", /Health-context/i);
});

test("buildRegulatoryLenses does not activate financial claims lens from gambling-sensitive tracking alone", () => {
  const lenses = buildRegulatoryLenses(
    [
      makeFinding("pre_consent_tracking_detected", "Tracking started before consent", {
        severity: "critical",
        shortSummary: "Pre-consent tracking was observed on a sports betting or gambling site."
      }),
      makeFinding("session_recording_services_detected", "Session recording services detected", {
        severity: "high",
        shortSummary: "FullStory session replay was observed before consent."
      })
    ],
    {
      beforeConsentCookieCount: 0,
      thirdPartyRequestCount: 95
    },
    {
      benchmarkIndustry: "Sports betting / gambling",
      regulatoryRisk: makeRegulatoryRisk({
        topRiskDrivers: [{ key: "sensitive_context_tracking", label: "Sensitive-context tracking before consent", impact: 26 }]
      })
    }
  );

  const financialLens = lenses.find((lens) => lens.acronym === "Financial & commercial claims");
  assert.ok(financialLens);
  assert.equal(financialLens?.minimal, true);
  assert.equal(financialLens?.ratingLabel, "Audit-only");
  assert.equal(financialLens?.findings.length, 0);
});

test("buildRegulatoryLenses treats pre-consent cookie findings as GDPR tracking risk", () => {
  const lenses = buildRegulatoryLenses(
    [
      makeFinding("third_party_cookie_pre_consent", "Third-party cookies before consent", {
        severity: "high",
        shortSummary: "64 third-party cookies were observed before any consent action."
      })
    ],
    {
      beforeConsentCookieCount: 64,
      thirdPartyRequestCount: 52
    }
  );

  assert.equal(lenses[0]?.summary, "Consent and pre-consent tracking risk is the main issue.");
  assert.notEqual(lenses[0]?.summary, "No major consent-triggering issue surfaced in the top findings.");
});

test("buildRegulatoryLenses treats pre-consent cookie counts as regulatory tracking risk", () => {
  const lenses = buildRegulatoryLenses(
    [
      makeFinding("policy_runtime_conflict", "Policy and runtime behavior conflict", {
        severity: "high",
        shortSummary: "The consent policy and runtime behavior appear inconsistent."
      })
    ],
    {
      beforeConsentCookieCount: 12,
      thirdPartyRequestCount: 52
    }
  );

  assert.equal(lenses[0]?.summary, "Consent and pre-consent tracking risk is the main issue.");
  assert.equal(lenses[1]?.summary, "Third-party collection and disclosure posture drives this score.");
  assert.notEqual(lenses[0]?.summary, "No major consent-triggering issue surfaced in the top findings.");
  assert.notEqual(lenses[1]?.summary, "No strong sale/share-style signal surfaced in the top findings.");
});

test("buildRegulatoryLensesFromUnifiedPackets carries cookie vendors into count evidence", () => {
  const lenses = buildRegulatoryLensesFromUnifiedPackets(
    [
      makeUnifiedPacket("preconsent_tracking", {
        details: {
          family: "consent_tracking",
          kind: "preconsent_tracking",
          vendors: ["Google Analytics", "Meta Pixel"]
        },
        evidence: {
          counts: {},
          entities: {
            preconsent_cookie_categories: ["analytics", "advertising"],
            preconsent_cookie_initiator_domains: ["www.google-analytics.com", "connect.facebook.net"],
            preconsent_cookie_initiator_urls: ["https://www.google-analytics.com/analytics.js", "https://connect.facebook.net/en_US/fbevents.js"],
            preconsent_cookie_initiator_vendors: ["Google Analytics", "Meta Pixel"],
            preconsent_cookie_names: ["_ga", "_fbp"],
            preconsent_cookie_timing_evidence: ["before_consent_cookie_write"],
            preconsent_nonessential_cookie_names: ["_ga", "_fbp"]
          },
          fetchQuality: null,
          flags: ["privacy.preconsent_tracking_detected"],
          pageUrls: [],
          snippets: [],
          sourceUrls: []
        },
        summary: "Observed before a clear user choice was made."
      })
    ],
    {
      beforeConsentCookieCount: 0,
      thirdPartyRequestCount: 0
    }
  );

  const gdprLens = lenses.find((lens) => lens.acronym === "GDPR / ePrivacy");
  const cookieFinding = gdprLens?.findings.find((finding) => finding.id === "before_consent_cookie_count");

  assert.equal(cookieFinding?.evidence.count, 2);
  assert.deepEqual(cookieFinding?.evidence.cookieNames, ["_ga", "_fbp"]);
  assert.deepEqual(cookieFinding?.evidence.cookieVendors, ["Google Analytics", "Meta Pixel"]);
  assert.deepEqual(cookieFinding?.evidence.initiatorDomains, ["www.google-analytics.com", "connect.facebook.net"]);
});

test("buildRegulatoryLenses does not overstate consent-only review signals as GDPR tracking issues", () => {
  const lenses = buildRegulatoryLenses(
    [
      makeFinding("reject_option_missing_or_hidden", "Reject option missing or hidden", {
        severity: "medium",
        shortSummary: "Promotional or choice architecture may need closer disclosure review."
      }),
      makeFinding("forced_consent_interaction", "Consent interaction was forced", {
        severity: "medium",
        shortSummary: "Promotional or choice architecture may need closer disclosure review."
      })
    ],
    {
      beforeConsentCookieCount: 0,
      thirdPartyRequestCount: 0
    }
  );

  assert.equal(lenses[0]?.summary, "No major consent-triggering issue surfaced in the top findings.");
  assert.equal(lenses[0]?.ratingLabel, "Strong");
  assert.deepEqual(lenses[0]?.findings, []);
  assert.equal(lenses[2]?.detailTitle, "Choice architecture review signals");
  assert.equal(lenses[2]?.summary, "Consent-choice design should be reviewed for clarity.");
  assert.doesNotMatch(lenses[2]?.detailTitle ?? "", /Dark pattern/i);
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
  assert.match(regulatoryFindingLabels(adaLens?.findings ?? []).join(" "), /Automated WCAG issues detected: 27/);
  assert.match(regulatoryFindingLabels(adaLens?.findings ?? []).join(" "), /Keyboard navigation issues surfaced/);
  assert.match(regulatoryFindingLabels(adaLens?.findings ?? []).join(" "), /Accessibility statement not detected/);
  assert.equal(
    regulatoryFindingLabels(adaLens?.findings ?? []).filter((item) => /accessibility statement/i.test(item)).length,
    1
  );
});

test("buildRegulatoryLenses keeps ADA minimal when accessibility statement is the only missing signal", () => {
  const lenses = buildRegulatoryLenses(
    [],
    {
      beforeConsentCookieCount: 0,
      thirdPartyRequestCount: 0
    },
    {
      accessibilitySignals: {
        accessibilityStatementPresent: false,
        wcagErrorCountTotal: 0,
        wcagFormLabelErrorCount: 0,
        wcagKeyboardNavigationIssueCount: 0,
        wcagMissingAltCount: 0
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
  assert.ok(adaLens);
  assert.equal(adaLens?.minimal, true);
  assert.equal(adaLens?.ratingLabel, "Audit-only");
  assert.equal(adaLens?.score, null);
  assert.equal(adaLens?.summary, "");
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
  assert.equal(adaLens?.ratingLabel, "Audit-only");
  assert.equal(adaLens?.score, null);
  assert.equal(adaLens?.summary, "");
  assert.equal(financialLens?.ratingLabel, "Audit-only");
  assert.equal(financialLens?.score, null);
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
  assert.equal(adaLens?.ratingLabel, "Audit-only");
  assert.equal(adaLens?.score, null);
  assert.equal(adaLens?.summary, "");
  assert.equal(financialLens?.ratingLabel, "Audit-only");
  assert.equal(financialLens?.score, null);
  assert.equal(financialLens?.summary, "");
});

test("buildRegulatoryLensesFromUnifiedPackets explains representative DOJ ADA axe coverage", () => {
  const lenses = buildRegulatoryLensesFromUnifiedPackets(
    [
      makeUnifiedPacket("accessibility_risk_score", {
        evidence: {
          counts: {
            representativeAxeExampleCount: 2,
            representativeAxePageCount: 2,
            representativeAxeRuleCount: 2
          },
          entities: { maxAxeImpact: ["serious"] },
          fetchQuality: null,
          flags: ["representative_accessibility_examples_retained"],
          pageUrls: ["https://example.com/", "https://example.com/products"],
          snippets: ["Representative axe examples: 2 rules across 2 pages; max impact: serious."],
          sourceUrls: []
        },
        summary: "Representative accessibility barriers were retained from axe examples."
      })
    ],
    {
      beforeConsentCookieCount: 0,
      thirdPartyRequestCount: 0
    }
  );

  const adaLens = lenses.find((lens) => lens.acronym === "DOJ / ADA accessibility");

  assert.ok(adaLens);
  assert.equal(adaLens?.minimal, undefined);
  assert.match(regulatoryFindingLabels(adaLens?.findings ?? []).join(" "), /Representative axe examples: 2 rules across 2 pages; max impact: serious\./);
});

test("ExecutiveSummaryCard renders score-only ADA accessibility as audit-only without the stale 88 rating", () => {
  const html = renderToStaticMarkup(
    createElement(ExecutiveSummaryCard, {
      accessLimitationNotice: null,
      beforeConsentCookieCount: 0,
      domainBenchmark: null,
      finalHost: "example.com",
      fingerprintReasons: [],
      fingerprintLabel: "None detected",
      fingerprintNarrative: "No strong fingerprinting signal surfaced.",
      landedOnDifferentHost: false,
      lastScannedAt: "2026-04-21T17:07:47.000Z",
      posture: "Watch",
      preConsentVendorNames: [],
      requestedHost: "example.com",
      resolvedVendorNames: [],
      score: ADA_ACCESSIBILITY_FIXTURES.scoreOnlySnapshot.value,
      sessionReplayVendorNames: [],
      thirdPartyRequestCount: 0,
      thirdPartyDomains: [],
      topFindings: [],
      topObservedEntities: [],
      trackerSummary: "No meaningful third-party footprint observed",
      unifiedFindings: [
        makeUnifiedPacket("accessibility_risk_score", {
          evidence: {
            counts: {},
            entities: {},
            fetchQuality: null,
            flags: [],
            pageUrls: [ADA_ACCESSIBILITY_FIXTURES.scoreOnlySnapshot.pageUrl],
            snippets: [`Accessibility risk score: ${ADA_ACCESSIBILITY_FIXTURES.scoreOnlySnapshot.value}.`],
            sourceUrls: []
          },
          presentationDecision: {
            confidenceRationale: "Score-only accessibility signal remains audit-only.",
            downgradeReasons: ["No representative axe examples were retained."],
            rationale: "Score-only accessibility signal remains audit-only.",
            status: "audit_only",
            verificationLabel: "Audit only",
            verificationState: "triage"
          }
        })
      ],
      unresolvedVendorHosts: [],
      vendorCategoryCounts: {}
    })
  );

  assert.match(html, /DOJ \/ ADA accessibility/);
  assert.match(html, /Audit-only/);
  const adaStart = html.indexOf("DOJ / ADA accessibility");
  const financialStart = html.indexOf("Financial &amp; commercial claims");
  assert.ok(adaStart >= 0);
  const adaMarkup = html.slice(adaStart, financialStart > adaStart ? financialStart : undefined);
  assert.doesNotMatch(adaMarkup, /Not applicable/);
  assert.doesNotMatch(adaMarkup, />88</);
});

test("ExecutiveSummaryCard shows benchmark beside posture without scanned timestamp pill", () => {
  const html = renderToStaticMarkup(
    createElement(ExecutiveSummaryCard, {
      accessLimitationNotice: null,
      beforeConsentCookieCount: 0,
      domainBenchmark: {
        confidence: "medium",
        estimatedRankLabel: "Typical",
        expectedCookiesBeforeConsent: 0,
        expectedOverallScore: 82,
        expectedThirdPartyRequests: 8,
        industry: "Web portal / News & Media / Internet services",
        rationale: "Matched to a portal benchmark."
      },
      finalHost: "example.com",
      fingerprintReasons: [],
      fingerprintLabel: "None detected",
      fingerprintNarrative: "No strong fingerprinting signal surfaced.",
      landedOnDifferentHost: false,
      lastScannedAt: "2026-04-21T17:07:47.000Z",
      posture: "Action Needed",
      preConsentVendorNames: [],
      requestedHost: "example.com",
      resolvedVendorNames: [],
      score: 69,
      sessionReplayVendorNames: [],
      thirdPartyRequestCount: 0,
      thirdPartyDomains: [],
      topFindings: [],
      topObservedEntities: [],
      trackerSummary: "No meaningful third-party footprint observed",
      unifiedFindings: [],
      unresolvedVendorHosts: [],
      vendorCategoryCounts: {}
    })
  );

  assert.match(html, /Action Needed/);
  assert.match(html, /Benchmark: Web portal \/ News &amp; Media \/ Internet services/);
  assert.doesNotMatch(html, /Scanned Apr/);
  assert.ok(html.indexOf("Action Needed") < html.indexOf("Benchmark: Web portal"));
});

test("buildRegulatoryLenses promotes retained financial-promotion findings into the financial claims lens", () => {
  const lenses = buildRegulatoryLenses(
    [
      makeFinding("leveraged_or_high_risk_product_promotion", "Leveraged or high-risk product promotion", {
        section: "Financial & Claims",
        severity: "medium",
        shortSummary: "Leverage language present on a public-facing financial promotion surface."
      })
    ],
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

  const financialLens = lenses.find((lens) => lens.acronym === "Financial & commercial claims");
  assert.ok(financialLens);
  assert.equal(financialLens?.minimal, undefined);
  assert.equal(financialLens?.ratingLabel, "Watch");
  assert.match(financialLens?.summary ?? "", /Commercial claims and pricing language should be reviewed/i);
  assert.match(regulatoryFindingLabels(financialLens?.findings ?? []).join(" "), /High-risk financial product promotion language surfaced/i);
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
    ["GDPR / ePrivacy", "CCPA / CPRA", "FTC", "CFTC", "SEC", "DOJ / ADA accessibility", "Financial & commercial claims"]
  );

  const financialLens = lenses.at(-1);
  assert.equal(financialLens?.detailTitle, "Claims, urgency, and pricing disclosures");
  assert.match(financialLens?.summary ?? "", /claims|pricing/i);
  assert.equal(financialLens?.minimal, undefined);
  assert.match(regulatoryFindingLabels(financialLens?.findings ?? []).join(" "), /Earnings-style claim surfaced/);
  assert.match(regulatoryFindingLabels(financialLens?.findings ?? []).join(" "), /Pricing or fee disclosure remains unclear/);
});

test("ExecutiveSummaryCard builds regulatory lenses from all findings instead of only top findings", () => {
  const html = renderToStaticMarkup(
    createElement(ExecutiveSummaryCard, {
      accessLimitationNotice: null,
      allFindings: [
        makeFinding("earnings_claim_without_adjacent_disclosure", "Earnings claim without nearby disclosure", {
          section: "Privacy & Tracking",
          defaultSurfacePriority: 97,
          severity: "high",
          shortSummary: "Earn up to $5,000 per month language surfaced near signup copy."
        })
      ],
      beforeConsentCookieCount: 12,
      domainBenchmark: null,
      finalHost: "fxculturetrading.com",
      fingerprintReasons: [],
      fingerprintLabel: "Possible",
      fingerprintNarrative: "Identity-rich telemetry observed.",
      landedOnDifferentHost: false,
      lastScannedAt: "2026-04-21T17:07:47.000Z",
      posture: "Action Needed",
      preConsentVendorNames: ["Meta Pixel"],
      requestedHost: "fxculturetrading.com",
      resolvedVendorNames: ["Meta Pixel"],
      score: 62,
      sessionReplayVendorNames: [],
      thirdPartyRequestCount: 20,
      thirdPartyDomains: ["connect.facebook.net"],
      topFindings: [
        makeFinding("pre_consent_tracking_detected", "Tracking started before consent", {
          severity: "critical",
          shortSummary: "12 third-party requests fired before any consent action."
        })
      ],
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
      topObservedEntities: [{ label: "Meta Pixel", category: "ads", requestCount: 12 }],
      trackerSummary: "1 vendor across 1 third-party domain",
      unresolvedVendorHosts: [],
      vendorCategoryCounts: { ads: 1 }
    })
  );

  assert.match(html, /Financial &amp; commercial claims/);
  assert.match(html, /Earnings-style claim surfaced without nearby balancing disclosure\./);
});

test("ExecutiveSummaryCard renders fractional regulatory rating bar segments", () => {
  const html = renderToStaticMarkup(
    createElement(ExecutiveSummaryCard, {
      accessLimitationNotice: null,
      allFindings: [],
      beforeConsentCookieCount: 1,
      domainBenchmark: null,
      finalHost: "example.com",
      fingerprintReasons: [],
      fingerprintLabel: "Possible",
      fingerprintNarrative: "Identity-rich telemetry observed.",
      landedOnDifferentHost: false,
      lastScannedAt: "2026-04-21T17:07:47.000Z",
      posture: "Watch",
      preConsentVendorNames: ["Meta Pixel"],
      requestedHost: "example.com",
      resolvedVendorNames: ["Meta Pixel"],
      score: 62,
      sessionReplayVendorNames: [],
      thirdPartyRequestCount: 1,
      thirdPartyDomains: ["connect.facebook.net"],
      topFindings: [
        makeFinding("pre_consent_tracking_detected", "Tracking started before consent", {
          severity: "medium",
          shortSummary: "One third-party request fired before any consent action."
        })
      ],
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
      topObservedEntities: [],
      trackerSummary: "1 vendor across 1 third-party domain",
      unresolvedVendorHosts: [],
      vendorCategoryCounts: {}
    })
  );

  assert.match(html, /width:10%/);
});

test("ExecutiveSummaryCard keeps tracker disclosure counts aligned with the full domain inventory", () => {
  const domains = Array.from({ length: 13 }, (_, index) => `tracker-${index + 1}.example`);
  const html = renderToStaticMarkup(
    createElement(ExecutiveSummaryCard, {
      accessLimitationNotice: null,
      allFindings: [],
      beforeConsentCookieCount: 0,
      domainBenchmark: null,
      finalHost: "fandango.com",
      fingerprintReasons: [],
      fingerprintLabel: "None detected",
      fingerprintNarrative: "None detected",
      landedOnDifferentHost: false,
      lastScannedAt: "2026-04-21T17:07:47.000Z",
      posture: "Watch",
      preConsentVendorNames: [],
      requestedHost: "fandango.com",
      resolvedVendorNames: ["Google Ads"],
      score: 70,
      sessionReplayVendorNames: [],
      thirdPartyRequestCount: 52,
      thirdPartyDomains: domains,
      topFindings: [],
      topObservedEntities: [{ label: "Google Ads", category: "ads", requestCount: 13 }],
      trackerSummary: "1 vendor observed across 13 third-party domains",
      unresolvedVendorHosts: [],
      vendorCategoryCounts: { ads: 1 }
    })
  );

  assert.match(html, /1 vendor observed across 13 third-party domains/);
  assert.match(html, /1 vendor names and 13 third-party domains/);
});

test("ExecutiveSummaryCard keeps regulatory copy packet-derived when unified findings are present", () => {
  const html = renderToStaticMarkup(
    createElement(ExecutiveSummaryCard, {
      accessLimitationNotice: null,
      allFindings: [
        makeFinding("third_party_cookie_pre_consent", "Third-party cookies before consent", {
          severity: "high",
          shortSummary: "64 third-party cookies were observed before any consent action."
        })
      ],
      beforeConsentCookieCount: 64,
      domainBenchmark: null,
      finalHost: "fandango.com",
      fingerprintReasons: [],
      fingerprintLabel: "None detected",
      fingerprintNarrative: "None detected",
      landedOnDifferentHost: false,
      lastScannedAt: "2026-04-21T17:07:47.000Z",
      posture: "Watch",
      preConsentVendorNames: [],
      requestedHost: "fandango.com",
      resolvedVendorNames: ["Google Ads"],
      score: 70,
      sessionReplayVendorNames: [],
      thirdPartyRequestCount: 52,
      thirdPartyDomains: ["doubleclick.net"],
      topFindings: [
        makeFinding("third_party_cookie_pre_consent", "Third-party cookies before consent", {
          severity: "high",
          shortSummary: "64 third-party cookies were observed before any consent action."
        })
      ],
      topObservedEntities: [{ label: "Google Ads", category: "ads", requestCount: 13 }],
      trackerSummary: "1 vendor observed across 1 third-party domain",
      unifiedFindings: [makeUnifiedPacket("privacy_policy_present", { details: { family: "context", kind: "privacy_policy_present" } })],
      unresolvedVendorHosts: [],
      vendorCategoryCounts: { ads: 1 }
    })
  );

  assert.match(html, /No major consent-triggering issue surfaced in the top findings\./);
  assert.match(html, /CCPA \/ CPRA[\s\S]*?<p class="text-xl font-semibold tracking-tight text-slate-900">82<\/p>/);
  assert.match(html, /No strong sale\/share-style signal surfaced in the top findings\./);
  assert.match(html, /FTC[\s\S]*?<p class="text-xl font-semibold tracking-tight text-slate-900">80<\/p>/);
  assert.match(html, /No strong unfairness\/deception cue surfaced in the top findings\./);
  assert.doesNotMatch(html, /Consent and pre-consent tracking risk is the main issue\./);
  assert.doesNotMatch(html, /Pre-consent tracking and third-party collection should be reviewed for unfairness or deception risk\./);
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
      topObservedEntities: [{ label: "Google Tag Manager", category: "cdn_infra", requestCount: 12 }],
      trackerSummary: "1 vendor across 5 third-party domains",
      unresolvedVendorHosts: [],
      vendorCategoryCounts: { cdn_infra: 1 }
    })
  );

  assert.match(html, /Primary concerns:<\/span> No headline findings surfaced from the available scan coverage\./);
  assert.match(html, /Highest-priority issues/);
  assert.match(html, /Review the supporting evidence below for lower-priority signals and scan context\./);
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
