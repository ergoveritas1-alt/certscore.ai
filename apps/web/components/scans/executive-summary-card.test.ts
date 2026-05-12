import assert from "node:assert/strict";
import test from "node:test";
import type { AgencyMapping, RegulatoryRiskAssessment } from "@website-signal-risk-scanner/shared";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  buildRegulatoryLenses,
  buildRegulatoryLensesFromUnifiedPackets,
  deriveBenchmarkScoreExplanation,
  ExecutiveSummaryCard
} from "./executive-summary-card";
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
      whyThisMatters: "Automated accessibility issues can create usability and ADA review risk."
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

  const gdprLens = lenses.find((lens) => lens.acronym === "GDPR / ePrivacy");
  const cpraLens = lenses.find((lens) => lens.acronym === "CCPA / CPRA / CIPA");
  const ftcLens = lenses.find((lens) => lens.acronym === "FTC");

  assert.equal(gdprLens?.summary, "Consent and pre-consent tracking risk is the main issue.");
  assert.equal(gdprLens?.ratingLabel, "Needs work");
  assert.equal(cpraLens?.summary, "Third-party collection and disclosure posture drives this score.");
  assert.equal(ftcLens?.summary, "Choice architecture and disclosure clarity are the main FTC-style concerns.");
  assert.equal(ftcLens?.ratingLabel, "Needs work");
  assert.ok(ftcLens?.findings.some((finding) => finding.id === "pre_consent_tracking_detected"));
  assert.ok(gdprLens?.findings.some((finding) => finding.id === "consent_dark_patterns_detected"));
});

test("buildRegulatoryLenses keeps pre-consent tracking out of FTC unless paired with choice or disclosure context", () => {
  const lenses = buildRegulatoryLenses(
    [
      makeFinding("pre_consent_tracking_detected", "Tracking started before consent", {
        severity: "critical",
        shortSummary: "7 third-party requests fired before any consent action."
      })
    ],
    {
      beforeConsentCookieCount: 20,
      thirdPartyRequestCount: 7
    }
  );

  const gdprLens = lenses.find((lens) => lens.acronym === "GDPR / ePrivacy");
  const ftcLens = lenses.find((lens) => lens.acronym === "FTC");

  assert.ok(gdprLens?.findings.some((finding) => finding.id === "pre_consent_tracking_detected"));
  assert.equal(ftcLens?.findings.some((finding) => finding.id === "pre_consent_tracking_detected"), false);
});

test("buildRegulatoryLenses retains reject-path tracking failure as dedicated regulatory evidence", () => {
  const lenses = buildRegulatoryLenses([
    makeFinding("reject_tracking_persists_after_reject", "Non-essential tracking continued after reject", {
      confidence: "strong",
      directVsInferred: "direct",
      evidenceDetails: {
        counts: {
          consentBaselineThirdPartyCookieCount: 4,
          consentPostRejectThirdPartyCookieCount: 4
        },
        runtimeRequestUrls: [
          "https://example.com/baseline.js",
          "https://example.com/post-reject.js"
        ],
        runtimeVendors: ["Google Ads", "Adobe Analytics"]
      },
      severity: "critical",
      shortSummary: "Tracking requests still appeared after the reject interaction, suggesting the consent outcome did not suppress non-essential vendors."
    })
  ], {
    beforeConsentCookieCount: 0,
    thirdPartyRequestCount: 2
  });

  const gdprLens = lenses.find((lens) => lens.acronym === "GDPR / ePrivacy");
  const ftcLens = lenses.find((lens) => lens.acronym === "FTC");

  assert.ok(gdprLens?.findings.some((finding) => /reject interaction/i.test(finding.label)));
  assert.ok(ftcLens?.findings.some((finding) => /reject interaction/i.test(finding.label)));
});

test("buildRegulatoryLenses maps CPRA CBA opt-out missing into the CCPA CPRA lens", () => {
  const lenses = buildRegulatoryLenses(
    [
      makeFinding("cpra_cba_opt_out_missing", "CPRA opt-out missing for advertising sharing", {
        shortSummary: "Cross-context behavioral advertising vendor evidence was retained."
      })
    ],
    {
      beforeConsentCookieCount: 20,
      thirdPartyRequestCount: 42
    }
  );

  const cpraLens = lenses.find((lens) => lens.acronym === "CCPA / CPRA / CIPA");

  assert.equal(cpraLens?.summary, "Cross-context behavioral advertising and CPRA opt-out posture drive this score.");
  assert.ok(regulatoryFindingLabels(cpraLens?.findings ?? []).includes("CPRA opt-out missing for advertising sharing"));
});

test("buildRegulatoryLenses maps cross-domain identifiers to GDPR only with tracking or device context", () => {
  const baseLenses = buildRegulatoryLenses(
    [
      makeFinding("cross_domain_identifier_sharing_observed", "Identifiers shared across domains", {
        shortSummary: "Identifier-like values were observed in cross-domain requests."
      })
    ],
    {
      beforeConsentCookieCount: 0,
      thirdPartyRequestCount: 4
    }
  );
  const trackingLenses = buildRegulatoryLenses(
    [
      makeFinding("cross_domain_identifier_sharing_observed", "Identifiers shared across domains", {
        shortSummary: "Identifier-like values were observed in cross-domain requests."
      }),
      makeFinding("rtb_cookie_sync_observed", "RTB cookie sync observed", {
        shortSummary: "RTB sync evidence was retained."
      })
    ],
    {
      beforeConsentCookieCount: 0,
      thirdPartyRequestCount: 4
    }
  );

  assert.equal(
    baseLenses.find((lens) => lens.acronym === "GDPR / ePrivacy")?.findings.some((finding) => finding.id === "cross_domain_identifier_sharing_observed"),
    false
  );
  assert.ok(
    baseLenses.find((lens) => lens.acronym === "CCPA / CPRA / CIPA")?.findings.some((finding) => finding.id === "cross_domain_identifier_sharing_observed")
  );
  assert.ok(
    trackingLenses.find((lens) => lens.acronym === "GDPR / ePrivacy")?.findings.some((finding) => finding.id === "cross_domain_identifier_sharing_observed")
  );
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
  assert.equal(financialLens, undefined);
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

  const gdprLens = lenses.find((lens) => lens.acronym === "GDPR / ePrivacy");

  assert.equal(gdprLens?.summary, "Consent and pre-consent tracking risk is the main issue.");
  assert.notEqual(gdprLens?.summary, "No major consent-triggering issue surfaced in the top findings.");
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

  const gdprLens = lenses.find((lens) => lens.acronym === "GDPR / ePrivacy");
  const cpraLens = lenses.find((lens) => lens.acronym === "CCPA / CPRA / CIPA");

  assert.equal(gdprLens?.summary, "Consent and pre-consent tracking risk is the main issue.");
  assert.equal(cpraLens?.summary, "Third-party collection and disclosure posture drives this score.");
  assert.notEqual(gdprLens?.summary, "No major consent-triggering issue surfaced in the top findings.");
  assert.notEqual(cpraLens?.summary, "No strong sale/share-style signal surfaced in the top findings.");
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

test("buildRegulatoryLenses maps consent-choice review signals into GDPR without lowering the tracking score", () => {
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

  const gdprLens = lenses.find((lens) => lens.acronym === "GDPR / ePrivacy");
  const ftcLens = lenses.find((lens) => lens.acronym === "FTC");

  assert.equal(gdprLens?.summary, "No major consent-triggering issue surfaced in the top findings.");
  assert.equal(gdprLens?.ratingLabel, "Strong");
  assert.deepEqual(regulatoryFindingLabels(gdprLens?.findings ?? []), [
    "Promotional or choice architecture may need closer disclosure review.",
    "Promotional or choice architecture may need closer disclosure review."
  ]);
  assert.equal(ftcLens?.detailTitle, "Choice architecture review signals");
  assert.equal(ftcLens?.summary, "Consent-choice design should be reviewed for clarity.");
  assert.doesNotMatch(ftcLens?.detailTitle ?? "", /Dark pattern/i);
});

test("buildRegulatoryLenses maps dark-pattern umbrella to FTC by default and GDPR only with tracking context", () => {
  const baseLenses = buildRegulatoryLenses(
    [
      makeFinding("consent_dark_patterns_detected", "Dark pattern consent signals detected", {
        shortSummary: "Accept appears more prominent than reject or settings."
      })
    ],
    {
      beforeConsentCookieCount: 0,
      thirdPartyRequestCount: 0
    }
  );
  const trackingLenses = buildRegulatoryLenses(
    [
      makeFinding("consent_dark_patterns_detected", "Dark pattern consent signals detected", {
        shortSummary: "Accept appears more prominent than reject or settings."
      })
    ],
    {
      beforeConsentCookieCount: 2,
      thirdPartyRequestCount: 0
    }
  );

  assert.equal(
    baseLenses.find((lens) => lens.acronym === "GDPR / ePrivacy")?.findings.some((finding) => finding.id === "consent_dark_patterns_detected"),
    false
  );
  assert.ok(baseLenses.find((lens) => lens.acronym === "FTC")?.findings.some((finding) => finding.id === "consent_dark_patterns_detected"));
  assert.ok(
    trackingLenses.find((lens) => lens.acronym === "GDPR / ePrivacy")?.findings.some((finding) => finding.id === "consent_dark_patterns_detected")
  );
});

test("buildRegulatoryLenses maps session recording to CCPA only with sensitive or disclosure context", () => {
  const baseLenses = buildRegulatoryLenses(
    [
      makeFinding("session_recording_services_detected", "Session recording services detected", {
        shortSummary: "Session replay tooling was observed."
      })
    ],
    {
      beforeConsentCookieCount: 0,
      thirdPartyRequestCount: 3
    }
  );
  const sensitiveLenses = buildRegulatoryLenses(
    [
      makeFinding("session_recording_services_detected", "Session recording services detected", {
        shortSummary: "Session replay tooling was observed."
      }),
      makeFinding("possible_session_replay_on_sensitive_input_surface", "Possible session replay on a sensitive input surface", {
        shortSummary: "Session replay appeared near a sensitive input surface."
      })
    ],
    {
      beforeConsentCookieCount: 0,
      thirdPartyRequestCount: 3
    }
  );

  assert.equal(
    baseLenses.find((lens) => lens.acronym === "CCPA / CPRA / CIPA")?.findings.some((finding) => finding.id === "session_recording_services_detected"),
    false
  );
  assert.ok(
    sensitiveLenses.find((lens) => lens.acronym === "CCPA / CPRA / CIPA")?.findings.some((finding) => finding.id === "session_recording_services_detected")
  );
});

test("buildRegulatoryLenses maps probable fingerprinting to FTC only with sensitive or deceptive context", () => {
  const baseLenses = buildRegulatoryLenses(
    [
      makeFinding("probable_fingerprinting", "Probable browser/device fingerprinting behavior", {
        shortSummary: "Probable fingerprinting behavior was observed."
      })
    ],
    {
      beforeConsentCookieCount: 0,
      thirdPartyRequestCount: 3
    }
  );
  const disclosureLenses = buildRegulatoryLenses(
    [
      makeFinding("probable_fingerprinting", "Probable browser/device fingerprinting behavior", {
        shortSummary: "Probable fingerprinting behavior was observed."
      }),
      makeFinding("cookie_disclosure_gap", "Cookie disclosure gap", {
        shortSummary: "Observed cookie activity was not covered by retained policy evidence."
      })
    ],
    {
      beforeConsentCookieCount: 0,
      thirdPartyRequestCount: 3
    }
  );

  assert.ok(baseLenses.find((lens) => lens.acronym === "GDPR / ePrivacy")?.findings.some((finding) => finding.id === "probable_fingerprinting"));
  assert.equal(baseLenses.find((lens) => lens.acronym === "FTC")?.findings.some((finding) => finding.id === "probable_fingerprinting"), false);
  assert.ok(disclosureLenses.find((lens) => lens.acronym === "FTC")?.findings.some((finding) => finding.id === "probable_fingerprinting"));
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

test("buildRegulatoryLenses surfaces scored ADA lens when any WCAG errors are present", () => {
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
  assert.ok(!adaLens?.minimal);
  assert.equal(adaLens?.ratingLabel, "Strong");
  assert.equal(typeof adaLens?.score, "number");
  assert.equal(adaLens?.summary, "Accessibility barriers and disclosure gaps are the main issue.");
  assert.equal(financialLens, undefined);
});

test("buildRegulatoryLenses keeps ADA minimal and omits blank financial claims when accessibility signals remain low-signal", () => {
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
  assert.equal(adaLens?.minimal, true);
  assert.equal(adaLens?.ratingLabel, "Audit-only");
  assert.equal(adaLens?.score, null);
  assert.equal(adaLens?.summary, "");
  assert.equal(financialLens, undefined);
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
        summary: "Automated accessibility issues were retained from axe examples."
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

test("benchmark score explanation uses surfaced findings without percentile claims", () => {
  const explanation = deriveBenchmarkScoreExplanation({
    benchmark: {
      confidence: "medium",
      estimatedRankLabel: "Typical",
      expectedCookiesBeforeConsent: 1,
      expectedOverallScore: 82,
      expectedThirdPartyRequests: 8,
      industry: "Entertainment ticketing",
      rationale: "Matched to an entertainment benchmark."
    },
    findings: [
      makeFinding("pre_consent_tracking_detected", "Tracking started before consent", {
        shortSummary: "pre-consent tracking"
      }),
      makeFinding("third_party_cookie_pre_consent", "Third-party cookies before consent", {
        shortSummary: "cookie activity before consent"
      }),
      makeFinding("rtb_cookie_sync_observed", "RTB cookie sync observed", {
        shortSummary: "RTB sync"
      }),
      makeFinding("policy_behavior_contradiction_detected", "Policy/runtime alignment review", {
        shortSummary: "policy states a long raw quote that should not be copied into the score note"
      })
    ],
    score: 61,
    vendorNames: ["Adobe Analytics", "DoubleClick", "Meta Pixel"]
  });

  assert.equal(
    explanation,
    "This score is below the Entertainment ticketing benchmark expectation mainly because retained evidence showed tracking before consent, pre-consent tracking cookies, RTB cookie-sync activity, and a policy/runtime review issue. Representative observed vendors included Adobe Analytics, DoubleClick, and Meta Pixel."
  );
  assert.doesNotMatch(explanation ?? "", /policy states a long raw quote/i);
  assert.doesNotMatch(explanation ?? "", /percent|peer/i);
});

test("ExecutiveSummaryCard explains interruption-backed limited coverage only when events are provided", () => {
  const baseProps = {
    accessLimitationNotice: null,
    beforeConsentCookieCount: 0,
    domainBenchmark: null,
    finalHost: "example.com",
    fingerprintReasons: [],
    fingerprintLabel: "None detected",
    fingerprintNarrative: "No fingerprinting evidence detected.",
    landedOnDifferentHost: false,
    lastScannedAt: "2026-04-21T17:07:47.000Z",
    posture: "Watch" as const,
    preConsentVendorNames: [],
    requestedHost: "example.com",
    resolvedVendorNames: [],
    score: 72,
    sessionReplayVendorNames: [],
    thirdPartyRequestCount: 0,
    thirdPartyDomains: [],
    topFindings: [
      makeFinding("accessibility_risk_score", "Automated accessibility issues observed", {
        section: "Accessibility"
      })
    ],
    topObservedEntities: [],
    trackerSummary: "No meaningful third-party footprint observed",
    unifiedFindings: [],
    unresolvedVendorHosts: [],
    vendorCategoryCounts: {}
  };
  const withInterruption = renderToStaticMarkup(createElement(ExecutiveSummaryCard, {
    ...baseProps,
    scanInterruptions: [{ label: "Captcha/security challenge", details: ["Challenge suspected."] }]
  }));
  const withoutInterruption = renderToStaticMarkup(createElement(ExecutiveSummaryCard, baseProps));

  assert.match(withInterruption, /Coverage was limited by site protections/);
  assert.match(withInterruption, /Findings shown here are based on retained observable evidence/);
  assert.match(withInterruption, /1 interruption event retained/);
  assert.match(withInterruption, /Captcha\/security challenge/);
  assert.doesNotMatch(withoutInterruption, /Coverage was limited by site protections/);
});

test("ExecutiveSummaryCard renders limited review for latimes-style interrupted clear scans", () => {
  const html = renderToStaticMarkup(
    createElement(ExecutiveSummaryCard, {
      accessLimitationNotice: null,
      allFindings: [],
      beforeConsentCookieCount: 4,
      domainBenchmark: {
        confidence: "medium",
        estimatedRankLabel: "Typical",
        expectedCookiesBeforeConsent: 4,
        expectedOverallScore: 78,
        expectedThirdPartyRequests: 55,
        industry: "Media / publisher sites",
        rationale: "Matched to a media benchmark."
      },
      finalHost: "www.latimes.com",
      fingerprintReasons: [],
      fingerprintLabel: "None detected",
      fingerprintNarrative: "No strong fingerprinting signal surfaced.",
      landedOnDifferentHost: false,
      lastScannedAt: "2026-05-10T12:00:00.000Z",
      coverageLevel: "limited_partial",
      pagesScanned: 3,
      policyEnrichmentCount: 2,
      posture: "Clear",
      preConsentVendorNames: [],
      requestedHost: "latimes.com",
      resolvedVendorNames: ["Google Ad Manager", "Permutive", "Piano"],
      score: 74,
      scanInterruptions: [
        { label: "Captcha/security challenge", details: ["Challenge suspected."] },
        { label: "Authentication wall", details: ["The homepage presented an authentication wall."] }
      ],
      sessionReplayVendorNames: [],
      thirdPartyRequestCount: 81,
      thirdPartyDomains: [
        "securepubads.g.doubleclick.net",
        "cdn.permutive.com",
        "experience.tinypass.com"
      ],
      topFindings: [],
      topObservedEntities: [
        { label: "Google Ad Manager", category: "advertising", requestCount: 18 },
        { label: "Permutive", category: "advertising", requestCount: 9 }
      ],
      trackerSummary: "5 vendors across 11 third-party domains",
      unifiedFindings: [],
      unresolvedVendorHosts: ["example-ad-host.test", "metrics.example.test"],
      vendorCategoryCounts: { advertising: 3, analytics: 2 },
      verifiedPublicSurfacesCount: 2,
      policySurfaces: [
        {
          pageLabel: "Privacy Policy",
          pageUrl: "https://www.latimes.com/privacy-policy",
          details: ["Privacy choices and advertising disclosures retained."]
        },
        {
          pageLabel: "Terms of Service",
          pageUrl: "https://www.latimes.com/terms-of-service",
          details: []
        }
      ]
    })
  );

  assert.match(html, /Limited review/);
  assert.doesNotMatch(html, /data-testid="executive-posture-badge"[^>]*>Clear</);
  assert.match(html, /Runtime coverage was limited by site protections/);
  assert.match(html, /CertScore did not confirm a headline homepage issue from retained evidence/);
  assert.match(html, /Observed vendor and request counts may be incomplete/);
  assert.match(html, /This scan has incomplete coverage/);
  assert.match(html, /No headline homepage issue was confirmed from retained evidence/);
  assert.match(html, /Observed footprint may be incomplete because site protections interrupted runtime collection/);
  assert.match(html, /\+26 above expected for Media \/ publisher sites/);
  assert.doesNotMatch(html, /View evidence/);
  assert.doesNotMatch(html, /Audit finding/);
});

test("ExecutiveSummaryCard keeps clean well-covered scans clear", () => {
  const html = renderToStaticMarkup(
    createElement(ExecutiveSummaryCard, {
      accessLimitationNotice: null,
      allFindings: [],
      beforeConsentCookieCount: 0,
      domainBenchmark: {
        confidence: "medium",
        estimatedRankLabel: "Typical",
        expectedCookiesBeforeConsent: 2,
        expectedOverallScore: 82,
        expectedThirdPartyRequests: 55,
        industry: "Media / publisher sites",
        rationale: "Matched to a media benchmark."
      },
      finalHost: "example.com",
      fingerprintReasons: [],
      fingerprintLabel: "None detected",
      fingerprintNarrative: "No strong fingerprinting signal surfaced.",
      landedOnDifferentHost: false,
      lastScannedAt: "2026-05-10T12:00:00.000Z",
      legalCoverageScore: 30,
      pagesScanned: 5,
      policyEnrichmentCount: 2,
      posture: "Clear",
      preConsentVendorNames: [],
      requestedHost: "example.com",
      resolvedVendorNames: [],
      score: 86,
      sessionReplayVendorNames: [],
      thirdPartyRequestCount: 12,
      thirdPartyDomains: [],
      topFindings: [],
      topObservedEntities: [],
      trackerSummary: "No meaningful third-party footprint observed",
      unifiedFindings: [],
      unresolvedVendorHosts: [],
      vendorCategoryCounts: {},
      verifiedPublicSurfacesCount: 2
    })
  );

  assert.match(html, /data-testid="executive-posture-badge"[^>]*>Clear</);
  assert.doesNotMatch(html, /Limited review/);
  assert.doesNotMatch(html, /Runtime coverage was limited by site protections/);
  assert.doesNotMatch(html, /This scan has incomplete coverage/);
});

test("ExecutiveSummaryCard suppresses broad incomplete warning when partial coverage still retained substantial findings", () => {
  const html = renderToStaticMarkup(
    createElement(ExecutiveSummaryCard, {
      accessLimitationNotice: null,
      allFindings: [],
      beforeConsentCookieCount: 3,
      coverageLevel: "limited_partial",
      domainBenchmark: null,
      finalHost: "kbdlab.io",
      fingerprintReasons: [],
      fingerprintLabel: "None detected",
      fingerprintNarrative: "No strong fingerprinting signal surfaced.",
      landedOnDifferentHost: false,
      lastScannedAt: "2026-05-10T12:00:00.000Z",
      pagesScanned: 3,
      posture: "Watch",
      preConsentVendorNames: ["Google Analytics"],
      requestedHost: "kbdlab.io",
      resolvedVendorNames: ["Google Analytics", "Google Tag Manager"],
      score: 66,
      sessionReplayVendorNames: [],
      thirdPartyRequestCount: 42,
      thirdPartyDomains: ["google-analytics.com", "googletagmanager.com"],
      topFindings: [
        makeFinding("pre_consent_tracking_detected", "Tracking started before consent"),
        makeFinding("tracking_technologies_disclosure_present", "Tracking disclosure present", { severity: "medium" }),
        makeFinding("privacy_contact_available", "Privacy contact available", { severity: "low" })
      ],
      topObservedEntities: [],
      trackerSummary: "2 vendors across 2 third-party domains",
      unifiedFindings: [],
      unresolvedVendorHosts: [],
      vendorCategoryCounts: { analytics: 2 },
      policySurfaces: [
        { pageLabel: "Privacy Policy", pageUrl: "https://kbdlab.io/privacy", details: [] },
        { pageLabel: "Terms of Service", pageUrl: "https://kbdlab.io/terms", details: [] }
      ]
    })
  );

  assert.doesNotMatch(html, /This scan has incomplete coverage/);
});

test("ExecutiveSummaryCard treats interruption-only scans as coverage limited without inventing findings", () => {
  const html = renderToStaticMarkup(
    createElement(ExecutiveSummaryCard, {
      accessLimitationNotice: null,
      allFindings: [],
      beforeConsentCookieCount: 0,
      coverageLevel: "limited_partial",
      domainBenchmark: null,
      finalHost: "example.com",
      fingerprintReasons: [],
      fingerprintLabel: "None detected",
      fingerprintNarrative: "No strong fingerprinting signal surfaced.",
      landedOnDifferentHost: false,
      lastScannedAt: "2026-05-10T12:00:00.000Z",
      posture: "Clear",
      preConsentVendorNames: [],
      requestedHost: "example.com",
      resolvedVendorNames: [],
      score: 72,
      scanInterruptions: [{ label: "Captcha/security challenge", details: ["Challenge suspected."] }],
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

  assert.match(html, /Limited review/);
  assert.match(html, /Runtime coverage was limited by site protections/);
  assert.match(html, /This scan has incomplete coverage/);
  assert.match(html, /No headline homepage issue was confirmed from retained evidence/);
  assert.doesNotMatch(html, /View evidence/);
  assert.doesNotMatch(html, /Audit finding/);
});

test("ExecutiveSummaryCard frames external coverage context as supplemental only", () => {
  const html = renderToStaticMarkup(
    createElement(ExecutiveSummaryCard, {
      accessLimitationNotice: null,
      allFindings: [],
      beforeConsentCookieCount: 0,
      domainBenchmark: null,
      externalCoverageContextAvailable: true,
      finalHost: "example.com",
      fingerprintReasons: [],
      fingerprintLabel: "None detected",
      fingerprintNarrative: "No strong fingerprinting signal surfaced.",
      landedOnDifferentHost: false,
      lastScannedAt: "2026-05-10T12:00:00.000Z",
      posture: "Clear",
      preConsentVendorNames: [],
      requestedHost: "example.com",
      resolvedVendorNames: [],
      score: 72,
      scanInterruptions: [{ label: "Authentication wall", details: ["Auth wall suspected."] }],
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

  assert.match(html, /External public scans may show broader page activity/);
  assert.match(html, /not a CertScore-confirmed finding/);
  assert.doesNotMatch(html, /Tracking started before consent/);
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
      beforeConsentCookieCount: 20,
      domainBenchmark: {
        confidence: "medium",
        estimatedRankLabel: "Typical",
        expectedCookiesBeforeConsent: 4,
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
      thirdPartyRequestCount: 132,
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
  assert.match(html, /Score note:<\/span>/);
  assert.match(html, /line-clamp-2/);
  assert.match(html, /132 third-party requests/);
  assert.match(html, /\+124 above expected for Web portal \/ News &amp; Media \/ Internet services/);
  assert.match(html, /20 cookies before consent/);
  assert.match(html, /\+16 above expected for Web portal \/ News &amp; Media \/ Internet services/);
  assert.doesNotMatch(html, /Scanned Apr/);
  assert.ok(html.indexOf("Action Needed") < html.indexOf("Benchmark: Web portal"));
});

test("buildRegulatoryLenses promotes retained financial-promotion findings into the financial claims lens", () => {
  const lenses = buildRegulatoryLenses(
    [
      makeFinding("high_risk_product_risk_disclosure_missing", "High-risk product risk disclosure missing", {
        section: "Financial & Claims",
        severity: "medium",
        shortSummary: "High-risk product marketing surfaced without nearby risk disclosure."
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
  assert.match(regulatoryFindingLabels(financialLens?.findings ?? []).join(" "), /High-risk product marketing surfaced/i);
});

test("buildRegulatoryLenses places financial claims directly below DOJ / ADA accessibility in regulatory findings", () => {
  const lenses = buildRegulatoryLenses(
    [
      makeFinding("simulated_performance_without_disclosure", "Simulated performance without disclosure", {
        severity: "medium",
        shortSummary: "Backtested performance language surfaced without nearby disclosure."
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
    ["CCPA / CPRA / CIPA", "GDPR / ePrivacy", "FTC", "DOJ / ADA accessibility", "Financial & commercial claims"]
  );

  const financialLens = lenses.at(-1);
  assert.equal(financialLens?.detailTitle, "Claims, urgency, and pricing disclosures");
  assert.match(financialLens?.summary ?? "", /claims|pricing/i);
  assert.equal(financialLens?.minimal, undefined);
  assert.match(regulatoryFindingLabels(financialLens?.findings ?? []).join(" "), /Simulated or hypothetical performance language surfaced/);
});

test("ExecutiveSummaryCard builds regulatory lenses from all findings instead of only top findings", () => {
  const html = renderToStaticMarkup(
    createElement(ExecutiveSummaryCard, {
      accessLimitationNotice: null,
      allFindings: [
        makeFinding("simulated_performance_without_disclosure", "Simulated performance without disclosure", {
          section: "Privacy & Tracking",
          defaultSurfacePriority: 97,
          severity: "high",
          shortSummary: "Backtested performance language surfaced without nearby disclosure."
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
  assert.match(html, /Simulated or hypothetical performance language surfaced without nearby disclosure\./);
});

test("ExecutiveSummaryCard keeps four or more top findings in a scrollable top-findings list", () => {
  const html = renderToStaticMarkup(
    createElement(ExecutiveSummaryCard, {
      accessLimitationNotice: null,
      allFindings: [],
      beforeConsentCookieCount: 1,
      domainBenchmark: null,
      finalHost: "inc.com",
      fingerprintReasons: [],
      fingerprintLabel: "None detected",
      fingerprintNarrative: "No fingerprinting evidence detected.",
      landedOnDifferentHost: false,
      lastScannedAt: "2026-04-21T17:07:47.000Z",
      posture: "Action Needed",
      preConsentVendorNames: ["Google Ads"],
      requestedHost: "inc.com",
      resolvedVendorNames: ["Google Ads", "Microsoft Clarity"],
      score: 58,
      sessionReplayVendorNames: ["Microsoft Clarity"],
      thirdPartyRequestCount: 64,
      thirdPartyDomains: ["securepubads.g.doubleclick.net"],
      topFindings: [
        makeFinding("pre_consent_tracking_detected", "Tracking started before consent", {
          severity: "critical"
        }),
        makeFinding("reject_tracking_persists_after_reject", "Non-essential tracking continued after reject"),
        makeFinding("session_recording_services_detected", "Session recording services detected"),
        makeFinding("accessibility_risk_score", "Automated accessibility issues observed", {
          section: "Accessibility"
        })
      ],
      accessibilitySignals: {
        accessibilityStatementPresent: true,
        wcagErrorCountTotal: 60
      },
      agencyMappings: [],
      regulatoryRisk: makeRegulatoryRisk(),
      topObservedEntities: [{ label: "Google Ads", category: "ads", requestCount: 12 }],
      trackerSummary: "2 vendors across 1 third-party domain",
      unresolvedVendorHosts: [],
      vendorCategoryCounts: { ads: 1 }
    })
  );

  assert.match(html, /data-testid="executive-top-findings-list"/);
  assert.match(html, /max-h-\[31\.5rem\]/);
  assert.match(html, /Tracking started before consent/);
  assert.match(html, /Non-essential tracking continued after reject/);
  assert.match(html, /Session recording services detected/);
  assert.match(html, /Automated accessibility issues observed/);
});

test("ExecutiveSummaryCard renders directional finding-density context for surfaced top findings", () => {
  const html = renderToStaticMarkup(
    createElement(ExecutiveSummaryCard, {
      accessLimitationNotice: null,
      allFindings: [],
      beforeConsentCookieCount: 1,
      domainBenchmark: null,
      finalHost: "inc.com",
      fingerprintReasons: [],
      fingerprintLabel: "None detected",
      fingerprintNarrative: "No fingerprinting evidence detected.",
      landedOnDifferentHost: false,
      lastScannedAt: "2026-04-21T17:07:47.000Z",
      posture: "Action Needed",
      preConsentVendorNames: ["Google Ads"],
      requestedHost: "inc.com",
      resolvedVendorNames: ["Google Ads", "Microsoft Clarity"],
      score: 58,
      sessionReplayVendorNames: ["Microsoft Clarity"],
      thirdPartyRequestCount: 64,
      thirdPartyDomains: ["securepubads.g.doubleclick.net"],
      topFindings: [
        makeFinding("pre_consent_tracking_detected", "Tracking started before consent", {
          confidence: "good",
          severity: "critical"
        }),
        makeFinding("session_recording_services_detected", "Session recording services detected", {
          confidence: "strong",
          severity: "high"
        })
      ],
      accessibilitySignals: {
        accessibilityStatementPresent: true,
        wcagErrorCountTotal: 0
      },
      agencyMappings: [],
      regulatoryRisk: makeRegulatoryRisk(),
      topObservedEntities: [{ label: "Google Ads", category: "ads", requestCount: 12 }],
      trackerSummary: "2 vendors across 1 third-party domain",
      unresolvedVendorHosts: [],
      vendorCategoryCounts: { ads: 1 }
    })
  );

  assert.match(html, /critical/);
  assert.match(html, /Consent timing/);
  assert.match(html, /Good evidence/);
  assert.match(html, /Good evidence means the signal is supported/);
  assert.match(html, /Seen on ~18% of sites/);
  assert.match(html, /Seen on ~12% of sites/);
  assert.match(html, /directional market context/);
  assert.match(html, /not a compliance benchmark or legal conclusion/);
  assert.doesNotMatch(html, /View evidence/);
  assert.doesNotMatch(html, /Audit finding/);
  assert.match(html, /Next step: confirm whether these vendors are necessary before consent/);
  assert.equal(html.match(/Seen on ~18% of sites/g)?.length, 2);
  assert.equal(html.match(/Seen on ~12% of sites/g)?.length, 2);

  const nonBenchmarkedHtml = renderToStaticMarkup(
    createElement(ExecutiveSummaryCard, {
      accessLimitationNotice: null,
      allFindings: [],
      beforeConsentCookieCount: 0,
      domainBenchmark: null,
      finalHost: "inc.com",
      fingerprintReasons: [],
      fingerprintLabel: "None detected",
      fingerprintNarrative: "No fingerprinting evidence detected.",
      landedOnDifferentHost: false,
      lastScannedAt: "2026-04-21T17:07:47.000Z",
      posture: "Action Needed",
      preConsentVendorNames: [],
      requestedHost: "inc.com",
      resolvedVendorNames: ["Microsoft Clarity"],
      score: 72,
      sessionReplayVendorNames: ["Microsoft Clarity"],
      thirdPartyRequestCount: 12,
      thirdPartyDomains: ["www.clarity.ms"],
      topFindings: [
        makeFinding("accessibility_risk_score", "Automated accessibility issues observed", {
          confidence: "strong",
          severity: "medium"
        })
      ],
      accessibilitySignals: {
        accessibilityStatementPresent: true,
        wcagErrorCountTotal: 0
      },
      agencyMappings: [],
      regulatoryRisk: makeRegulatoryRisk(),
      topObservedEntities: [{ label: "Microsoft Clarity", category: "analytics", requestCount: 5 }],
      trackerSummary: "1 vendor across 1 third-party domain",
      unresolvedVendorHosts: [],
      vendorCategoryCounts: { analytics: 1 }
    })
  );

  assert.doesNotMatch(nonBenchmarkedHtml, /Seen on ~/);
});

test("ExecutiveSummaryCard renders display criticality independently from confidence and canonical severity", () => {
  const html = renderToStaticMarkup(
    createElement(ExecutiveSummaryCard, {
      accessLimitationNotice: null,
      allFindings: [],
      beforeConsentCookieCount: 0,
      domainBenchmark: null,
      finalHost: "inc.com",
      fingerprintReasons: [],
      fingerprintLabel: "None detected",
      fingerprintNarrative: "No fingerprinting evidence detected.",
      landedOnDifferentHost: false,
      lastScannedAt: "2026-04-21T17:07:47.000Z",
      posture: "Action Needed",
      preConsentVendorNames: [],
      requestedHost: "inc.com",
      resolvedVendorNames: ["Microsoft Clarity"],
      score: 72,
      sessionReplayVendorNames: ["Microsoft Clarity"],
      thirdPartyRequestCount: 12,
      thirdPartyDomains: ["www.clarity.ms"],
      topFindings: [
        makeFinding("session_recording_services_detected", "Session recording services detected", {
          confidence: "strong",
          severity: "high",
          shortSummary: "Session recording was observed on the scanned path."
        })
      ],
      accessibilitySignals: {
        accessibilityStatementPresent: true,
        wcagErrorCountTotal: 0
      },
      agencyMappings: [],
      regulatoryRisk: makeRegulatoryRisk(),
      topObservedEntities: [{ label: "Microsoft Clarity", category: "analytics", requestCount: 5 }],
      trackerSummary: "1 vendor across 1 third-party domain",
      unresolvedVendorHosts: [],
      vendorCategoryCounts: { analytics: 1 }
    })
  );

  assert.match(html, /medium/);
  assert.match(html, /Strong evidence/);
  assert.match(html, /&quot;severity&quot;: &quot;high&quot;/);
});

test("ExecutiveSummaryCard exposes strong fingerprinting primitives inline", () => {
  const html = renderToStaticMarkup(
    createElement(ExecutiveSummaryCard, {
      accessLimitationNotice: null,
      allFindings: [],
      beforeConsentCookieCount: 1,
      domainBenchmark: null,
      finalHost: "petdesk.com",
      fingerprintReasons: ["audio", "canvas_webgl", "fonts_plugins"],
      fingerprintLabel: "Possible",
      fingerprintNarrative: "Possible",
      landedOnDifferentHost: false,
      lastScannedAt: "2026-05-07T17:07:47.000Z",
      posture: "Action Needed",
      preConsentVendorNames: [],
      requestedHost: "petdesk.com",
      resolvedVendorNames: [],
      score: 58,
      sessionReplayVendorNames: [],
      thirdPartyRequestCount: 12,
      thirdPartyDomains: ["example.test"],
      topFindings: [
        makeFinding("probable_fingerprinting", "Probable fingerprinting behavior", {
          section: "Fingerprinting",
          shortSummary:
            "Runtime collection included multiple browser/device fingerprinting-related primitives beyond ordinary analytics telemetry, including canvas/WebGL access, audio environment access, and font/plugin enumeration.",
          evidenceDetails: {
            telemetryEvidence: {
              observed: true,
              basis: "Runtime collection included multiple browser/device fingerprinting-related primitives beyond ordinary analytics telemetry.",
              strongFingerprintSignalLabels: [
                "canvas/WebGL access",
                "audio environment access",
                "font/plugin enumeration",
                "hardware/device attribute collection"
              ],
              genericFingerprintSignalLabels: [
                "timezone/locale",
                "screen/viewport",
                "storage capability",
                "touch/input capability"
              ],
              confidenceExplanation: "Multiple high-entropy browser/device collection primitives observed."
            }
          }
        })
      ],
      accessibilitySignals: {
        accessibilityStatementPresent: true,
        wcagErrorCountTotal: 0
      },
      agencyMappings: [],
      regulatoryRisk: makeRegulatoryRisk(),
      topObservedEntities: [],
      trackerSummary: "No meaningful third-party footprint observed",
      unresolvedVendorHosts: [],
      vendorCategoryCounts: {}
    })
  );

  assert.match(html, /Stronger retained primitives/);
  assert.match(html, /canvas\/WebGL access/);
  assert.match(html, /audio environment access/);
  assert.match(html, /font\/plugin enumeration/);
  assert.match(html, /hardware\/device attribute collection/);
  assert.match(html, /Generic browser context/);
  assert.match(html, /timezone\/locale/);
  assert.match(html, /Multiple high-entropy browser\/device collection primitives observed/);
  assert.match(html, /This does not independently establish unlawful tracking or legal liability/);
});

test("ExecutiveSummaryCard renders compact reject-path JSON evidence", () => {
  const html = renderToStaticMarkup(
    createElement(ExecutiveSummaryCard, {
      accessLimitationNotice: null,
      allFindings: [],
      beforeConsentCookieCount: 1,
      domainBenchmark: null,
      finalHost: "inc.com",
      fingerprintReasons: [],
      fingerprintLabel: "None detected",
      fingerprintNarrative: "No fingerprinting evidence detected.",
      landedOnDifferentHost: false,
      lastScannedAt: "2026-04-21T17:07:47.000Z",
      posture: "Action Needed",
      preConsentVendorNames: ["Google Ads"],
      requestedHost: "inc.com",
      resolvedVendorNames: ["Google Ads", "Microsoft Clarity"],
      score: 58,
      sessionReplayVendorNames: ["Microsoft Clarity"],
      thirdPartyRequestCount: 64,
      thirdPartyDomains: ["securepubads.g.doubleclick.net"],
      topFindings: [
        makeFinding("reject_tracking_persists_after_reject", "Non-essential tracking continued after reject", {
          confidence: "good",
          evidenceDetails: {
            counts: {
              consentOptOutClicks: 1,
              firstPostRejectMs: 43
            },
            evidenceFlags: [
              "reject_evidence_confirmed",
              "explicit_policy_snippet_retained",
              "reject_path_tracking_not_reduced"
            ],
            runtimeVendors: [
              "Google Ads",
              "{\"vendor\":\"Google Ads\",\"sampleUrls\":[\"https://example.com/verbose.js\"]}"
            ],
            consentInteraction: {
              success: true,
              selector: "a[aria-label=\"Read more\"]",
              action_type: "reject_all",
              clicked_label: "Reject all",
              clicked_at_ms: 5470,
              page_url_at_click: "https://www.inc.com/"
            },
            rejectEvidenceDiff: {
              baseline_vendors: ["Google Ads", "Microsoft Clarity"],
              post_reject_vendors: ["Google Ads"],
              persisting_after_reject_vendors: ["Google Ads"],
              baseline_request_count: 123,
              post_reject_request_count: 52,
              baseline_reconstruction_status: "reconciled"
            },
            postRejectNonEssentialRequests: [
              {
                vendor: "Google Ads",
                category: "advertising",
                hostname: "securepubads.g.doubleclick.net",
                ms_after_reject: 1226,
                resource_type: "script",
                url: "https://securepubads.g.doubleclick.net/pagead/managed/js/gpt.js",
                why_non_essential: "Google Ads is classified as advertising.",
                ts_ms: 6696
              }
            ],
            suppressionChecks: {
              reject_click_confirmed: true,
              non_essential_vendor_after_reject: true
            },
            scanContext: {
              pageUrl: "https://www.inc.com/",
              scanMode: "initial_page_load",
              interactionBeforeFinding: true
            },
            rejectInteraction: {
              observed: true,
              actionType: "reject"
            },
            postRejectEvidence: {
              trackingPersistedAfterReject: true,
              postRejectNonEssentialRequestCount: 1,
              basis: "A reject interaction and post-reject non-essential tracking evidence were retained."
            },
            requestSelectionNote: "Representative post-reject requests are capped examples and are not exhaustive.",
            vendors: [
              {
                name: "Google Ads",
                category: "advertising",
                preConsent: false,
                representativeUrl: "https://securepubads.g.doubleclick.net/pagead/managed/js/gpt.js",
                firstSeenMs: 6696
              }
            ],
            representativeRequests: [
              {
                url: "https://securepubads.g.doubleclick.net/pagead/managed/js/gpt.js",
                hostname: "securepubads.g.doubleclick.net",
                vendor: "Google Ads",
                category: "advertising",
                resourceType: "script",
                firstSeenMs: 6696,
                thirdParty: true,
                preConsent: false,
                identifierLike: false,
                deviceDataLike: false,
                queryKeysSample: []
              }
            ],
            policyEvidence: { evaluated: false },
            legalRelevance: {
              cipaPenRegisterTheorySupport: "not_evaluated",
              gdprEprivacyConsentSupport: "possible",
              cpraSharingSupport: "not_evaluated",
              ftcDarkPatternOrDeceptionSupport: "support_only"
            },
            limitations: ["Automated scan does not determine legal liability."]
          },
          evidenceRefs: ["https://securepubads.g.doubleclick.net/pagead/managed/js/gpt.js"],
          evidenceVersion: "1.1",
          shortSummary: "Non-essential tracking requests fired after the reject interaction for Google Ads."
        })
      ],
      accessibilitySignals: {
        accessibilityStatementPresent: true,
        wcagErrorCountTotal: 0
      },
      agencyMappings: [],
      regulatoryRisk: makeRegulatoryRisk(),
      topObservedEntities: [{ label: "Google Ads", category: "ads", requestCount: 12 }],
      trackerSummary: "1 vendor across 1 third-party domain",
      unresolvedVendorHosts: [],
      vendorCategoryCounts: { ads: 1 }
    })
  );

  assert.match(html, /postRejectNonEssentialRequests/);
  assert.match(html, /evidenceVersion/);
  assert.match(html, /evidenceDetails/);
  assert.match(html, /postRejectEvidence/);
  assert.match(html, /policyEvidence/);
  assert.match(html, /ms_after_reject/);
  assert.match(html, /reject_path_tracking_not_reduced/);
  assert.doesNotMatch(html, /why_non_essential/);
  assert.doesNotMatch(html, /sampleUrls/);
  assert.doesNotMatch(html, /baseline_reconstruction_status/);
});

test("ExecutiveSummaryCard renders structured pre-consent JSON evidence", () => {
  const html = renderToStaticMarkup(
    createElement(ExecutiveSummaryCard, {
      accessLimitationNotice: null,
      allFindings: [],
      beforeConsentCookieCount: 0,
      domainBenchmark: null,
      finalHost: "petdesk.com",
      fingerprintReasons: [],
      fingerprintLabel: "None detected",
      fingerprintNarrative: "No fingerprinting evidence detected.",
      landedOnDifferentHost: false,
      lastScannedAt: "2026-04-21T17:07:47.000Z",
      posture: "Action Needed",
      preConsentVendorNames: ["Google Tag Manager", "HubSpot"],
      requestedHost: "petdesk.com",
      resolvedVendorNames: ["Google Tag Manager", "HubSpot"],
      score: 58,
      sessionReplayVendorNames: [],
      thirdPartyRequestCount: 7,
      thirdPartyDomains: ["googletagmanager.com", "js.hs-scripts.com"],
      topFindings: [
        makeFinding("pre_consent_tracking_detected", "Tracking started before consent", {
          confidence: "strong",
          severity: "critical",
          shortSummary: "Third-party tracking began before any recorded consent choice. The first classified tracking request occurred at 1500ms, with representative vendors including Google Tag Manager and HubSpot.",
          evidenceDetails: {
            scanContext: {
              pageUrl: "https://petdesk.com/",
              scanMode: "initial_page_load",
              interactionBeforeFinding: false
            },
            consentState: {
              cmpDetected: true,
              cmpVisibleMs: 0,
              userConsentActionObserved: false,
              consentActionType: null,
              trackingOccurredBeforeConsentChoice: true
            },
            consentBasis: "No accept, reject, manage, or close interaction was recorded before the listed tracking requests.",
            timingAnalysis: {
              trackingBeforeConsentWindow: true,
              basis: "First third-party tracking request (1500ms) occurred after CMP became visible (0ms) and before any recorded consent interaction."
            },
            timing: {
              pageStartMs: 0,
              firstRequestMs: 712,
              firstThirdPartyRequestMs: 1500,
              firstThirdPartyTrackingRequestMs: 1500,
              firstCookieSeenMs: 0,
              firstTrackingCookieSeenMs: null
            },
            counts: {
              totalPreConsentThirdPartyTrackingRequests: 7,
              representativePreConsentTrackingRequests: 2,
              uniquePreConsentTrackingVendorsObserved: 2,
              preConsentTrackingCookies: 0,
              identifierLikeRequests: 0
            },
            requestSelectionNote: "Representative requests are capped examples and are not exhaustive.",
            vendors: [
              {
                name: "Google Tag Manager",
                category: "tag_manager",
                preConsent: true,
                representativeUrl: "https://www.googletagmanager.com/gtm.js",
                firstSeenMs: 1500
              },
              {
                name: "HubSpot",
                category: "marketing_automation",
                preConsent: true,
                representativeUrl: "https://js.hs-scripts.com/20193302.js",
                firstSeenMs: null
              }
            ],
            representativeRequests: [
              {
                url: "https://www.googletagmanager.com/gtm.js",
                hostname: "googletagmanager.com",
                vendor: "Google Tag Manager",
                category: "tag_manager",
                resourceType: "script",
                firstSeenMs: 1500,
                thirdParty: true,
                preConsent: true,
                identifierLike: false,
                deviceDataLike: false,
                queryKeysSample: []
              },
              {
                url: "https://js.hs-scripts.com/20193302.js",
                hostname: "js.hs-scripts.com",
                vendor: "HubSpot",
                category: "marketing_automation",
                resourceType: "script",
                firstSeenMs: null,
                thirdParty: true,
                preConsent: true,
                identifierLike: false,
                deviceDataLike: false,
                queryKeysSample: []
              }
            ],
            identifierEvidence: {
              addressingOrSignalingTransmittedByRequest: true,
              basis: ["third_party_http_requests", "ip_address_transmitted_by_network_request"],
              interpretation: "Standard browser HTTP requests to third-party domains transmit network-level addressing information required for routing.",
              identifierLikeRequestCount: 0,
              deviceDataLikeRequestCount: 0
            },
            policyEvidence: { evaluated: false },
            legalRelevance: {
              cipaPenRegisterTheorySupport: "supportive_runtime_signal",
              gdprEprivacyConsentSupport: "strong_consent_timing_signal",
              cpraSharingSupport: "possible",
              ftcDarkPatternOrDeceptionSupport: "support_only"
            },
            limitations: ["Automated scan does not determine legal liability."]
          },
          evidencePreview: ["Representative pre-consent tracking request: https://www.googletagmanager.com/gtm.js"],
          evidenceRefs: ["https://www.googletagmanager.com/gtm.js"]
        })
      ],
      accessibilitySignals: {
        accessibilityStatementPresent: true,
        wcagErrorCountTotal: 0
      },
      agencyMappings: [],
      regulatoryRisk: makeRegulatoryRisk(),
      topObservedEntities: [{ label: "Google Tag Manager", category: "tag_manager", requestCount: 1 }],
      trackerSummary: "2 vendors across 2 third-party domains",
      unresolvedVendorHosts: [],
      vendorCategoryCounts: { tag_manager: 1 }
    })
  );

  assert.match(html, /consentState/);
  assert.match(html, /evidenceVersion/);
  assert.match(html, /timingAnalysis/);
  assert.match(html, /requestSelectionNote/);
  assert.match(html, /consentBasis/);
  assert.match(html, /representativeRequests/);
  assert.match(html, /identifierEvidence/);
  assert.match(html, /interpretation/);
  assert.match(html, /uniquePreConsentTrackingVendorsObserved/);
  assert.doesNotMatch(html, /preConsentTrackingVendors/);
  assert.match(html, /Representative pre-consent tracking request/);
  assert.match(html, /userConsentActionObserved/);
  assert.doesNotMatch(html, /runtimeRequestUrls/);
  assert.doesNotMatch(html, /sourceUrls/);
  assert.doesNotMatch(html, /pageUrls/);
  assert.doesNotMatch(html, /CIPA violation confirmed|legal liability confirmed/i);
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
  assert.match(html, /CCPA \/ CPRA/);
  assert.match(html, /<span class="block text-xl font-semibold tracking-tight text-slate-900">82<\/span>/);
  assert.match(html, /No strong sale\/share-style signal surfaced in the top findings\./);
  assert.match(html, /FTC/);
  assert.match(html, /<span class="block text-xl font-semibold tracking-tight text-slate-900">80<\/span>/);
  assert.match(html, /No strong unfairness\/deception cue surfaced in the top findings\./);
  assert.doesNotMatch(html, /Consent and pre-consent tracking risk is the main issue\./);
  assert.doesNotMatch(html, /Pre-consent tracking and third-party collection should be reviewed for unfairness or deception risk\./);
});

test("ExecutiveSummaryCard assigns distinct themed icons to sensitive-data and accessibility top findings", () => {
  const html = renderToStaticMarkup(
    createElement(ExecutiveSummaryCard, {
      accessLimitationNotice: null,
      allFindings: [
        makeFinding("sensitive_data_collection_with_third_party_tracking_present", "Sensitive input surfaces detected alongside third-party tracking", {
          severity: "medium",
          shortSummary: "Sensitive input evidence was retained alongside third-party tracking."
        }),
        makeFinding("accessibility_risk_score", "Automated accessibility issues observed", {
          section: "Accessibility",
          severity: "low",
          shortSummary: "Automated accessibility issues were retained."
        })
      ],
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
      score: 72,
      sessionReplayVendorNames: [],
      thirdPartyRequestCount: 1,
      thirdPartyDomains: ["log.intellimize.co"],
      topFindings: [
        makeFinding("sensitive_data_collection_with_third_party_tracking_present", "Sensitive input surfaces detected alongside third-party tracking", {
          severity: "medium",
          shortSummary: "Sensitive input evidence was retained alongside third-party tracking."
        }),
        makeFinding("accessibility_risk_score", "Automated accessibility issues observed", {
          section: "Accessibility",
          severity: "low",
          shortSummary: "Automated accessibility issues were retained."
        })
      ],
      topObservedEntities: [],
      trackerSummary: "1 vendor across 1 third-party domain",
      unresolvedVendorHosts: [],
      vendorCategoryCounts: {}
    })
  );

  assert.match(html, /data-finding-icon=\"shield-network\"/);
  assert.match(html, /data-finding-icon=\"accessibility-figure\"/);
});

test("ExecutiveSummaryCard assigns unique icons across top findings with shared preferred icons", () => {
  const html = renderToStaticMarkup(
    createElement(ExecutiveSummaryCard, {
      accessLimitationNotice: null,
      allFindings: [
        makeFinding("pre_consent_tracking_detected", "Tracking started before consent"),
        makeFinding("reject_tracking_persists_after_reject", "Non-essential tracking continued after reject"),
        makeFinding("cpra_cba_opt_out_missing", "CPRA opt-out missing for advertising sharing")
      ],
      beforeConsentCookieCount: 0,
      domainBenchmark: null,
      finalHost: "example.com",
      fingerprintReasons: [],
      fingerprintLabel: "None detected",
      fingerprintNarrative: "No strong fingerprinting signal surfaced.",
      landedOnDifferentHost: false,
      lastScannedAt: "2026-04-21T17:07:47.000Z",
      posture: "Action Needed",
      preConsentVendorNames: ["Google Ads"],
      requestedHost: "example.com",
      resolvedVendorNames: ["Google Ads"],
      score: 62,
      sessionReplayVendorNames: [],
      thirdPartyRequestCount: 12,
      thirdPartyDomains: ["googleadservices.com"],
      topFindings: [
        makeFinding("pre_consent_tracking_detected", "Tracking started before consent"),
        makeFinding("reject_tracking_persists_after_reject", "Non-essential tracking continued after reject"),
        makeFinding("cpra_cba_opt_out_missing", "CPRA opt-out missing for advertising sharing")
      ],
      topObservedEntities: [],
      trackerSummary: "1 vendor across 1 third-party domain",
      unresolvedVendorHosts: [],
      vendorCategoryCounts: { ads: 1 }
    })
  );

  const iconKeys = [...html.matchAll(/data-finding-icon="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(iconKeys, ["pulse-tracking", "circle-x", "privacy-choice"]);
  assert.equal(new Set(iconKeys).size, iconKeys.length);
});

test("ExecutiveSummaryCard assigns specific icons to accessibility and policy runtime findings", () => {
  const html = renderToStaticMarkup(
    createElement(ExecutiveSummaryCard, {
      accessLimitationNotice: null,
      allFindings: [],
      beforeConsentCookieCount: 0,
      domainBenchmark: null,
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
      score: 62,
      sessionReplayVendorNames: [],
      thirdPartyRequestCount: 12,
      thirdPartyDomains: ["googleadservices.com"],
      topFindings: [
        makeFinding("keyboard_navigation_accessibility_issue", "Keyboard navigation accessibility issue", {
          section: "Accessibility"
        }),
        makeFinding("policy_behavior_contradiction_detected", "Policy/runtime behavior conflict"),
        makeFinding("visual_contrast_accessibility_issue", "Visual contrast accessibility issue", {
          section: "Accessibility"
        })
      ],
      topObservedEntities: [],
      trackerSummary: "1 vendor across 1 third-party domain",
      unresolvedVendorHosts: [],
      vendorCategoryCounts: { ads: 1 }
    })
  );

  const iconKeys = [...html.matchAll(/data-finding-icon="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(iconKeys, ["keyboard-key", "policy-sync", "contrast-circle"]);
  assert.equal(new Set(iconKeys).size, iconKeys.length);
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
  assert.match(html, /Coverage note:<\/span> These are automated observations from the public scan\. Review the evidence before taking action\. Tracking started before consent/);
  assert.match(html, /Automated homepage findings/);
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
  assert.match(html, /Coverage note:<\/span> These are automated observations from the public scan\. Review the evidence before taking action\. Tracking started before consent/);
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
  assert.match(html, /Coverage note:<\/span> These are automated observations from the public scan\. Review the evidence before taking action\. Tracking started before consent/);
  assert.doesNotMatch(html, /Immediate privacy and consent issues detected/);
});

test("ExecutiveSummaryCard names financial claims in limited-coverage hero copy", () => {
  const html = renderToStaticMarkup(
    createElement(ExecutiveSummaryCard, {
      accessLimitationNotice: null,
      beforeConsentCookieCount: 0,
      coverageLevel: "limited_partial",
      domainBenchmark: null,
      finalHost: "forexprofita.com",
      fingerprintReasons: [],
      fingerprintLabel: "None detected",
      fingerprintNarrative: "No strong fingerprinting signal surfaced.",
      landedOnDifferentHost: false,
      lastScannedAt: "2026-04-18T21:03:44.000Z",
      legalCoverageScore: 0,
      pagesScanned: 2,
      policyEnrichmentCount: 1,
      posture: "Action Needed",
      preConsentVendorNames: [],
      requestedHost: "forexprofita.com",
      resolvedVendorNames: [],
      score: 76,
      scanOutcome: "completed_partial",
      sessionReplayVendorNames: [],
      thirdPartyRequestCount: 11,
      thirdPartyDomains: [],
      topFindings: [
        makeFinding("guaranteed_outcome_claim_detected", "Guaranteed outcome claim detected", {
          section: "Financial & Claims",
          shortSummary: "Guaranteed outcome claim detected."
        }),
        makeFinding("regulatory_registration_disclosure_absent", "Regulatory registration disclosure absent", {
          section: "Financial & Claims",
          shortSummary: "Regulatory registration disclosure absent."
        })
      ],
      topObservedEntities: [],
      trackerSummary: "No third-party domains observed",
      unresolvedVendorHosts: [],
      vendorCategoryCounts: {},
      verifiedPublicSurfacesCount: 1
    })
  );

  assert.match(html, /Limited scan coverage surfaced possible financial-claims concerns/);
  assert.doesNotMatch(html, /Limited scan coverage surfaced possible homepage privacy concerns/);
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
  assert.doesNotMatch(html, /Review lenses/);
});
