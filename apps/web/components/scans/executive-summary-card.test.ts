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
import { buildRegulatoryGapTopFindings } from "../../lib/scans/regulatory-gap-top-findings";
import { EXECUTIVE_SUMMARY_TOP_FINDING_IDS } from "../../lib/scans/rank-findings";
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
      makeFinding("reject_option_missing_or_hidden", "Reject/refusal option not observed or nested", {
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

  assert.equal(gdprLens?.summary, "Pre-consent third-party activity is the main review item.");
  assert.equal(gdprLens?.ratingLabel, "Needs work");
  assert.equal(cpraLens?.summary, "Third-party collection and disclosure posture drives this score.");
  assert.equal(ftcLens?.summary, "Choice architecture and disclosure clarity are the main FTC-style concerns.");
  assert.equal(ftcLens?.ratingLabel, "Needs work");
  assert.ok(ftcLens?.findings.some((finding) => finding.id === "pre_consent_tracking_detected"));
  assert.ok(gdprLens?.findings.some((finding) => finding.id === "consent_dark_patterns_detected"));
});

test("buildRegulatoryLenses leads GDPR summary with consent timing when no first-layer banner is confirmed", () => {
  const lenses = buildRegulatoryLenses(
    [
      makeFinding("pre_consent_tracking_detected", "Tracking started before consent", {
        severity: "critical",
        shortSummary: "Advertising and analytics requests fired before any consent action."
      }),
      makeFinding("sensitive_data_collection_with_third_party_tracking_present", "Sensitive-surface tracking requires review", {
        severity: "medium",
        shortSummary: "Sensitive-surface/tracking correlation requires review."
      })
    ],
    {
      beforeConsentCookieCount: 15,
      thirdPartyRequestCount: 46
    },
    {
      unifiedContext: {
        beforeConsentCookieCount: 15,
        cookieBannerPresent: false,
        hasTrackingConcern: true,
        thirdPartyRequestCount: 46
      }
    }
  );

  const gdprLens = lenses.find((lens) => lens.acronym === "GDPR / ePrivacy");
  assert.equal(gdprLens?.summary, "First-layer reject availability and pre-consent third-party activity are the main review items.");
});

test("buildRegulatoryLenses does not call zero-footprint cookie evidence pre-consent tracking", () => {
  const lenses = buildRegulatoryLenses(
    [
      makeFinding("cookie_disclosure_gap", "Cookie notice / cookie policy availability", {
        severity: "medium",
        shortSummary: "Cookie/storage evidence was retained, but no durable cookie settings surface was retained."
      })
    ],
    {
      beforeConsentCookieCount: 14,
      thirdPartyRequestCount: 0
    },
    {
      unifiedContext: {
        beforeConsentCookieCount: 14,
        cookieBannerPresent: true,
        hasTrackingConcern: true,
        thirdPartyRequestCount: 0
      }
    }
  );

  const gdprLens = lenses.find((lens) => lens.acronym === "GDPR / ePrivacy");
  assert.equal(gdprLens?.summary, "Consent and pre-consent cookie/storage evidence are the main issue.");
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

test("buildRegulatoryLenses explains degraded lenses even without mapped top-level findings", () => {
  const lenses = buildRegulatoryLenses(
    [],
    {
      beforeConsentCookieCount: 0,
      thirdPartyRequestCount: 0
    },
    {
      unifiedContext: {
        hasTrackingConcern: true
      }
    }
  );

  const cpraLens = lenses.find((lens) => lens.acronym === "CCPA / CPRA / CIPA");
  const ftcLens = lenses.find((lens) => lens.acronym === "FTC");

  assert.equal(cpraLens?.ratingLabel, "Watch");
  assert.match(regulatoryFindingLabels(cpraLens?.findings ?? []).join(" "), /Score driver: retained tracking evidence/);
  assert.equal(ftcLens?.ratingLabel, "Watch");
  assert.match(regulatoryFindingLabels(ftcLens?.findings ?? []).join(" "), /Score driver: pre-consent tracking/);
});

test("buildRegulatoryLenses keeps post-reject tracking out of GDPR/FTC production lenses while deferred", () => {
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

  assert.equal(gdprLens?.findings.some((finding) => /Non-essential tracking continued after reject/i.test(finding.label)), false);
  assert.equal(ftcLens?.findings.some((finding) => /Non-essential tracking continued after reject/i.test(finding.label)), false);
});

test("buildRegulatoryLenses keeps CPRA CBA opt-out evidence in deferred lens context", () => {
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
  assert.equal(regulatoryFindingLabels(cpraLens?.findings ?? []).includes("CPRA / privacy choice opt-out review signal"), false);
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
      makeFinding("rtb_cookie_sync_observed", "Adtech identity sync-like request observed", {
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
      makeFinding("session_recording_services_detected", "Session replay service signal observed", {
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
      makeFinding("session_recording_services_detected", "Session replay service signal observed", {
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

  assert.equal(gdprLens?.summary, "Pre-consent third-party activity is the main review item.");
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

  assert.equal(gdprLens?.summary, "Pre-consent third-party activity is the main review item.");
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
      beforeConsentCookieCount: 2,
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

test("buildRegulatoryLensesFromUnifiedPackets labels classified and raw cookie count semantics separately", () => {
  const cookieNames = Array.from({ length: 13 }, (_, index) => `cookie_${index + 1}`);
  const lenses = buildRegulatoryLensesFromUnifiedPackets(
    [
      makeUnifiedPacket("preconsent_tracking", {
        details: {
          family: "consent_tracking",
          kind: "preconsent_tracking",
          vendors: ["Microsoft Clarity"]
        },
        evidence: {
          counts: {},
          entities: {
            preconsent_cookie_categories: ["analytics"],
            preconsent_cookie_initiator_vendors: ["Microsoft Clarity"],
            preconsent_cookie_names: cookieNames,
            preconsent_cookie_timing_evidence: ["before_consent_cookie_write"],
            preconsent_nonessential_cookie_names: cookieNames
          },
          fetchQuality: null,
          flags: ["privacy.preconsent_tracking_detected"],
          pageUrls: [],
          snippets: [],
          sourceUrls: []
        },
        summary: "Cookie timing context was retained for review."
      })
    ],
    {
      beforeConsentCookieCount: 15,
      thirdPartyRequestCount: 0
    }
  );

  const gdprLens = lenses.find((lens) => lens.acronym === "GDPR / ePrivacy");
  const cookieFinding = gdprLens?.findings.find((finding) => finding.id === "before_consent_cookie_count");

  assert.equal(cookieFinding?.label, "15 classified cookie records were observed before consent.");
  assert.equal(cookieFinding?.evidence.classifiedCookieCount, 15);
  assert.equal(cookieFinding?.evidence.rawObservationCount, 13);
  assert.deepEqual(cookieFinding?.evidence.cookieNames, cookieNames);
});

test("buildRegulatoryLenses uses metric-specific retained-context explanations when no top-level tracking finding promotes", () => {
  const lenses = buildRegulatoryLenses(
    [
      makeFinding("accessibility_risk_score", "Automated accessibility signals are the main review area", {
        section: "Accessibility",
        severity: "medium"
      })
    ],
    {
      beforeConsentCookieCount: 4,
      thirdPartyRequestCount: 18
    }
  );

  const gdprLens = lenses.find((lens) => lens.acronym === "GDPR / ePrivacy");
  const cpraLens = lenses.find((lens) => lens.acronym === "CCPA / CPRA / CIPA");
  const cookieFinding = gdprLens?.findings.find((finding) => finding.id === "before_consent_cookie_count");
  const requestFinding = cpraLens?.findings.find((finding) => finding.id === "third_party_request_count");

  assert.equal(cookieFinding?.reviewContextLabel, "Why not top-level?");
  assert.equal(
    cookieFinding?.reviewContextCopy,
    "Cookie timing context was retained, but CertScore did not retain enough classified non-essential tracking/vendor evidence to promote this into a top-level pre-consent tracking finding."
  );
  assert.equal(requestFinding?.label, "18 third-party request records were observed on the initial path.");
  assert.equal(requestFinding?.reviewContextLabel, "Why not top-level?");
  assert.equal(
    requestFinding?.reviewContextCopy,
    "Third-party request context was retained, but CertScore did not retain enough classified advertising, sharing, sale/share, or disclosure-gap evidence to promote this into a top-level third-party tracking or sharing finding."
  );
});

test("buildRegulatoryLenses softens cookie timing copy when attribution arrays are empty", () => {
  const lenses = buildRegulatoryLenses([], {
    beforeConsentCookieCount: 19,
    thirdPartyRequestCount: 0
  });
  const gdprLens = lenses.find((lens) => lens.acronym === "GDPR / ePrivacy");
  const cookieFinding = gdprLens?.findings.find((finding) => finding.id === "before_consent_cookie_count");

  assert.equal(
    cookieFinding?.label,
    "19 cookie timing records were retained before consent; vendor/category attribution was not retained."
  );
  assert.doesNotMatch(cookieFinding?.label ?? "", /classified cookies/i);
});

test("buildRegulatoryLenses omits empty cookie attribution arrays from count-only evidence", () => {
  const lenses = buildRegulatoryLenses(
    [],
    {
      beforeConsentCookieCount: 12,
      thirdPartyRequestCount: 0
    },
    {
      unifiedContext: {
        beforeConsentCookieCount: 12,
        beforeConsentCookieEvidence: {
          cookieNames: [],
          cookieCategories: [],
          cookieTimingEvidence: [],
          cookieVendors: [],
          initiatorDomains: [],
          initiatorUrls: [],
          sourceFindingIds: ["preconsent_tracking"],
          rawObservationCount: 0,
          classifiedCookieCount: 12
        },
        hasTrackingConcern: true,
        thirdPartyRequestCount: 0
      }
    }
  );

  const gdprLens = lenses.find((lens) => lens.acronym === "GDPR / ePrivacy");
  const cookieFinding = gdprLens?.findings.find((finding) => finding.id === "before_consent_cookie_count");

  assert.equal(
    cookieFinding?.label,
    "12 cookie timing records were retained before consent; vendor/category attribution was not retained."
  );
  assert.equal(cookieFinding?.evidence.count, 12);
  assert.equal(cookieFinding?.evidence.classifiedCookieCount, 12);
  assert.deepEqual(cookieFinding?.evidence.sourceFindingIds, ["preconsent_tracking"]);
  assert.equal("cookieNames" in (cookieFinding?.evidence ?? {}), false);
  assert.equal("cookieCategories" in (cookieFinding?.evidence ?? {}), false);
  assert.equal("cookieTimingEvidence" in (cookieFinding?.evidence ?? {}), false);
  assert.equal("cookieVendors" in (cookieFinding?.evidence ?? {}), false);
  assert.equal("initiatorDomains" in (cookieFinding?.evidence ?? {}), false);
  assert.equal("initiatorUrls" in (cookieFinding?.evidence ?? {}), false);
});

test("buildRegulatoryLenses caps count-only privacy lenses at Watch", () => {
  const lenses = buildRegulatoryLenses(
    [],
    {
      beforeConsentCookieCount: 19,
      thirdPartyRequestCount: 131
    },
    {
      unifiedContext: {
        beforeConsentCookieCount: 19,
        beforeConsentCookieEvidence: {
          cookieNames: [],
          cookieCategories: [],
          cookieVendors: [],
          initiatorDomains: [],
          initiatorUrls: [],
          sourceFindingIds: []
        },
        hasTrackingConcern: true,
        thirdPartyRequestCount: 131
      }
    }
  );

  const gdprLens = lenses.find((lens) => lens.acronym === "GDPR / ePrivacy");
  const cpraLens = lenses.find((lens) => lens.acronym === "CCPA / CPRA / CIPA");

  assert.equal(gdprLens?.ratingLabel, "Watch");
  assert.equal(cpraLens?.ratingLabel, "Watch");
  assert.match(regulatoryFindingLabels(gdprLens?.findings ?? []).join(" "), /cookie timing records were retained before consent/i);
  assert.match(regulatoryFindingLabels(cpraLens?.findings ?? []).join(" "), /131 third-party request records were observed/i);
  assert.equal(
    cpraLens?.findings.find((finding) => finding.id === "third_party_request_count")?.reviewContextCopy,
    "Third-party request context was retained, but CertScore did not retain enough classified advertising, sharing, sale/share, or disclosure-gap evidence to promote this into a top-level third-party tracking or sharing finding."
  );
});

test("buildRegulatoryLensesFromUnifiedPackets does not convert raw cookie observations into issue copy when canonical count is zero", () => {
  const lenses = buildRegulatoryLensesFromUnifiedPackets(
    [
      makeUnifiedPacket("preconsent_tracking", {
        details: {
          family: "consent_tracking",
          kind: "preconsent_tracking",
          vendors: ["Google Analytics"]
        },
        evidence: {
          counts: {},
          entities: {
            preconsent_cookie_categories: ["necessary", "analytics"],
            preconsent_cookie_initiator_vendors: ["Google Analytics"],
            preconsent_cookie_names: ["_ga", "__cf_bm"],
            preconsent_cookie_timing_evidence: ["initial_cookie_snapshot"],
            preconsent_nonessential_cookie_names: ["_ga"]
          },
          fetchQuality: null,
          flags: ["privacy.preconsent_tracking_detected"],
          pageUrls: [],
          snippets: [],
          sourceUrls: []
        },
        summary: "Raw storage observations were retained for review."
      })
    ],
    {
      beforeConsentCookieCount: 0,
      thirdPartyRequestCount: 10
    }
  );

  const labels = lenses.flatMap((lens) => regulatoryFindingLabels(lens.findings));

  assert.equal(labels.some((label) => /cookies were observed before consent/i.test(label)), false);
  assert.equal(labels.some((label) => /classified cookies were observed before consent/i.test(label)), false);
  assert.ok(labels.some((label) => /third-party request records were observed/i.test(label)));
});

test("buildRegulatoryLensesFromUnifiedPackets ignores downgraded cookie packets for regulatory issue copy", () => {
  const lenses = buildRegulatoryLensesFromUnifiedPackets(
    [
      makeUnifiedPacket("preconsent_tracking", {
        details: {
          family: "consent_tracking",
          kind: "preconsent_tracking",
          vendors: ["Meta Pixel"]
        },
        evidence: {
          counts: {},
          entities: {
            preconsent_cookie_categories: ["advertising"],
            preconsent_cookie_initiator_vendors: ["Meta Pixel"],
            preconsent_cookie_names: ["_fbp"],
            preconsent_cookie_timing_evidence: ["before_consent_cookie_write"],
            preconsent_nonessential_cookie_names: ["_fbp"]
          },
          fetchQuality: null,
          flags: ["privacy.preconsent_tracking_detected"],
          pageUrls: [],
          snippets: [],
          sourceUrls: []
        },
        presentationDecision: {
          confidenceRationale: "Cookie evidence was downgraded by the evidence contract.",
          downgradeReasons: ["Functional or unclassified storage only."],
          rationale: "Cookie evidence was downgraded by the evidence contract.",
          status: "audit_only",
          verificationLabel: "Audit only",
          verificationState: "triage"
        },
        summary: "Downgraded cookie evidence retained for audit only."
      })
    ],
    {
      beforeConsentCookieCount: 0,
      thirdPartyRequestCount: 0
    }
  );

  const labels = lenses.flatMap((lens) => regulatoryFindingLabels(lens.findings));

  assert.equal(labels.some((label) => /cookie/i.test(label)), false);
});

test("buildRegulatoryLenses maps consent-choice review signals into GDPR without lowering the tracking score", () => {
  const lenses = buildRegulatoryLenses(
    [
      makeFinding("reject_option_missing_or_hidden", "Reject/refusal option not observed or nested", {
        severity: "medium",
        shortSummary: "Promotional or choice architecture may need closer disclosure review."
      }),
      makeFinding("forced_consent_interaction", "Consent prompt appeared to require interaction", {
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
    "Reject/refusal option not observed or nested",
    "Consent prompt appeared to require interaction"
  ]);
  assert.equal(ftcLens?.detailTitle, "Choice architecture review signals");
  assert.equal(ftcLens?.summary, "Consent-choice design should be reviewed for clarity.");
  assert.doesNotMatch(ftcLens?.detailTitle ?? "", /Dark pattern/i);
});

test("buildRegulatoryLenses restricts EU-specific note pills outside FTC lens", () => {
  const lenses = buildRegulatoryLenses(
    [
      makeFinding("reject_option_missing_or_hidden", "Reject/refusal option not observed or nested", {
        severity: "medium",
        shortSummary: "Reject choice was not retained as visible on the first consent layer."
      })
    ],
    {
      beforeConsentCookieCount: 3,
      thirdPartyRequestCount: 0
    }
  );
  const ftcFinding = lenses.find((lens) => lens.acronym === "FTC")?.findings.find((finding) => finding.id === "reject_option_missing_or_hidden");
  const gdprFinding = lenses.find((lens) => lens.acronym === "GDPR / ePrivacy")?.findings.find((finding) => finding.id === "reject_option_missing_or_hidden");

  assert.equal(ftcFinding?.reviewContextChips?.some((chip) => /GDPR|ePrivacy|Article 5/i.test(chip)), false);
  assert.ok(gdprFinding?.reviewContextChips?.some((chip) => /GDPR|ePrivacy|Article 5|consent/i.test(chip)));
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
      makeFinding("session_recording_services_detected", "Session replay service signal observed", {
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
      makeFinding("session_recording_services_detected", "Session replay service signal observed", {
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
          triggeredSignals: [{ key: "accessibility.representative_axe_examples", label: "Representative axe examples" }]
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
  assert.equal(adaLens?.summary, "Automated accessibility signals are the main review area.");
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
      makeFinding("rtb_cookie_sync_observed", "Adtech identity sync-like request observed", {
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

test("benchmark score explanation leads with unconfirmed banner plus pre-consent tracking storage", () => {
  const explanation = deriveBenchmarkScoreExplanation({
    benchmark: {
      confidence: "medium",
      estimatedRankLabel: "Typical",
      expectedCookiesBeforeConsent: 2,
      expectedOverallScore: 72,
      expectedThirdPartyRequests: 24,
      industry: "SaaS / web application",
      rationale: "Matched to a SaaS benchmark."
    },
    cookieBannerPresent: false,
    findings: [
      makeFinding("pre_consent_tracking_detected", "Tracking started before consent", {
        shortSummary: "pre-consent tracking"
      }),
      makeFinding("third_party_cookie_pre_consent", "Third-party cookies before consent", {
        shortSummary: "cookie activity before consent"
      }),
      makeFinding("sensitive_data_collection_with_third_party_tracking_present", "Sensitive tracking finding retained elsewhere", {
        shortSummary: "Sensitive surface evidence was retained elsewhere."
      })
    ],
    score: 61,
    vendorNames: ["Google Analytics"]
  });

  assert.equal(
    explanation,
    "First-layer reject availability and pre-consent third-party activity are the main review items. CertScore did not confirm a first-layer GDPR/ePrivacy cookie consent banner, while advertising/analytics storage and tracking were observed before any recorded consent choice. Footer privacy/ad-choice controls were observed, but they do not establish a GDPR/ePrivacy accept/reject consent surface."
  );
});

test("benchmark score explanation does not claim advertising tracking without vendor context", () => {
  const explanation = deriveBenchmarkScoreExplanation({
    benchmark: {
      confidence: "medium",
      estimatedRankLabel: "Typical",
      expectedCookiesBeforeConsent: 2,
      expectedOverallScore: 72,
      expectedThirdPartyRequests: 24,
      industry: "SaaS / web application",
      rationale: "Matched to a SaaS benchmark."
    },
    cookieBannerPresent: false,
    findings: [
      makeFinding("third_party_cookie_pre_consent", "Third-party cookies before consent", {
        shortSummary: "cookie activity before consent"
      })
    ],
    score: 61,
    vendorNames: []
  });

  assert.doesNotMatch(explanation ?? "", /advertising\/analytics storage and tracking were observed/i);
  assert.doesNotMatch(explanation ?? "", /Consent and pre-consent tracking risk is the main issue/i);
});

test("benchmark score explanation treats tiny negative deltas as near benchmark", () => {
  const explanation = deriveBenchmarkScoreExplanation({
    benchmark: {
      confidence: "medium",
      estimatedRankLabel: "Typical",
      expectedCookiesBeforeConsent: 2,
      expectedOverallScore: 72,
      expectedThirdPartyRequests: 24,
      industry: "SaaS / web application",
      rationale: "Matched to a SaaS benchmark."
    },
    findings: [
      makeFinding("wcag_color_contrast_issue", "Visual contrast accessibility issue", {
        section: "Accessibility",
        severity: "medium"
      })
    ],
    score: 70,
    vendorNames: []
  });

  assert.equal(
    explanation,
    "This score is near the SaaS / web application benchmark expectation, with retained review context concentrated in accessibility."
  );
  assert.doesNotMatch(explanation ?? "", /below the SaaS \/ web application benchmark expectation/i);
});

test("benchmark score explanation names consent UX review even when score remains above benchmark", () => {
  const explanation = deriveBenchmarkScoreExplanation({
    benchmark: {
      confidence: "medium",
      estimatedRankLabel: "Typical",
      expectedCookiesBeforeConsent: 8,
      expectedOverallScore: 62,
      expectedThirdPartyRequests: 55,
      industry: "Media / publisher sites",
      rationale: "Matched to a media benchmark."
    },
    findings: [
      makeFinding("reject_option_missing_or_hidden", "Reject/refusal option not observed or nested", {
        shortSummary: "Consent UI requires review."
      })
    ],
    score: 67,
    vendorNames: []
  });

  assert.match(explanation ?? "", /above the Media \/ publisher sites benchmark expectation/);
  assert.match(explanation ?? "", /Overall score remains near benchmark, but consent UX findings require review\./);
});

test("benchmark score explanation avoids vendor score-driver copy for accessibility-only findings", () => {
  const explanation = deriveBenchmarkScoreExplanation({
    benchmark: {
      confidence: "medium",
      estimatedRankLabel: "Typical",
      expectedCookiesBeforeConsent: 2,
      expectedOverallScore: 78,
      expectedThirdPartyRequests: 24,
      industry: "Media / publisher",
      rationale: "Matched to a media benchmark."
    },
    findings: [
      makeFinding("visual_contrast_accessibility_issue", "Visual contrast accessibility issue", {
        section: "Accessibility",
        shortSummary: "Retained evidence showed accessibility issues."
      })
    ],
    score: 61,
    vendorNames: ["Google Ads", "Amazon Ads"]
  });

  assert.equal(
    explanation,
    "This score is below the Media / publisher benchmark expectation mainly because retained evidence showed accessibility. Third-party and cookie context was retained for review but did not promote to a top-level privacy finding."
  );
  assert.doesNotMatch(explanation ?? "", /Representative observed vendors/i);
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

  assert.doesNotMatch(withInterruption, /Coverage was limited by site protections/);
  assert.doesNotMatch(withInterruption, /Findings shown here are based on retained observable evidence/);
  assert.doesNotMatch(withInterruption, /1 interruption event retained/);
  assert.doesNotMatch(withInterruption, /Captcha\/security challenge/);
  assert.match(withInterruption, /Observed footprint may be incomplete because site protections interrupted runtime collection/);
  assert.doesNotMatch(withoutInterruption, /Coverage was limited by site protections/);
});

test("ExecutiveSummaryCard hides review lenses when viewer access disallows them", () => {
  const html = renderToStaticMarkup(createElement(ExecutiveSummaryCard, {
    accessLimitationNotice: null,
    beforeConsentCookieCount: 0,
    domainBenchmark: null,
    finalHost: "example.com",
    fingerprintReasons: [],
    fingerprintLabel: "None detected",
    fingerprintNarrative: "No fingerprinting evidence detected.",
    landedOnDifferentHost: false,
    lastScannedAt: "2026-04-21T17:07:47.000Z",
    posture: "Watch",
    preConsentVendorNames: [],
    requestedHost: "example.com",
    resolvedVendorNames: [],
    scanDurationMs: 12000,
    scanTimelineEvents: [
      { atMs: 1200, label: "Consent banner", tone: "emerald" },
      { atMs: 2400, label: "Ad vendor", tone: "rose" },
      { atMs: 3600, label: "Analytics", tone: "sky" },
      { atMs: 5200, label: "Session replay", tone: "rose" }
    ],
    score: 72,
    sessionReplayVendorNames: [],
    showReviewLenses: false,
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
  }));

  assert.match(html, /Signal snapshot/);
  assert.match(html, /data-executive-timeline-pane/);
  assert.match(html, /Scan Timeline/);
  assert.match(html, /Scan start @ 0s/);
  assert.match(html, /Consent banner/);
  assert.match(html, /Ad vendor/);
  assert.match(html, /Analytics/);
  assert.match(html, /Session replay/);
  assert.match(html, /first observed at 1.2s/);
  assert.match(html, /End @ 12s/);
  assert.doesNotMatch(html, /Captured/);
  assert.doesNotMatch(html, /Runtime/);
  assert.doesNotMatch(html, /Review lenses/);
  assert.match(html, /Consent platform/);
  assert.match(html, /h-7 w-7 shrink-0 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-700/);
  assert.doesNotMatch(html, /h-10 w-10 shrink-0 items-center justify-center rounded-xl/);
});

test("ExecutiveSummaryCard hides scan interruption and fingerprinting snapshot cards when disabled", () => {
  const html = renderToStaticMarkup(createElement(ExecutiveSummaryCard, {
    accessLimitationNotice: null,
    beforeConsentCookieCount: 0,
    domainBenchmark: null,
    finalHost: "example.com",
    fingerprintReasons: ["canvas_webgl"],
    fingerprintLabel: "Possible",
    fingerprintNarrative: "Possible fingerprinting indicators retained.",
    landedOnDifferentHost: false,
    lastScannedAt: "2026-04-21T17:07:47.000Z",
    posture: "Watch",
    preConsentVendorNames: [],
    requestedHost: "example.com",
    resolvedVendorNames: [],
    scanInterruptions: [{ label: "Captcha/security challenge", details: ["Challenge suspected."] }],
    score: 72,
    sessionReplayVendorNames: [],
    showFingerprintingSnapshot: false,
    showScanInterruptionSnapshot: false,
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
  }));

  assert.match(html, /Signal snapshot/);
  assert.doesNotMatch(html, /Scan Interruption/);
  assert.doesNotMatch(html, /Captcha\/security challenge/);
  assert.doesNotMatch(html, /Fingerprinting/);
  assert.match(html, /Consent platform/);
});

test("ExecutiveSummaryCard renders real vendor logo lookups in vendor badges", () => {
  const html = renderToStaticMarkup(createElement(ExecutiveSummaryCard, {
    accessLimitationNotice: null,
    beforeConsentCookieCount: 0,
    domainBenchmark: null,
    finalHost: "example.com",
    fingerprintReasons: [],
    fingerprintLabel: "None detected",
    fingerprintNarrative: "No fingerprinting evidence detected.",
    landedOnDifferentHost: false,
    lastScannedAt: "2026-05-24T17:07:47.000Z",
    posture: "Watch",
    preConsentVendorNames: [],
    requestedHost: "example.com",
    resolvedVendorNames: ["OneTrust", "Google Ads", "DoubleVerify", "Magnite / Rubicon", "Hotjar"],
    score: 72,
    sessionReplayVendorNames: [],
    thirdPartyRequestCount: 12,
    thirdPartyDomains: ["cdn.cookielaw.org", "securepubads.g.doubleclick.net", "vtrk.dv.tech", "micro.rubiconproject.com"],
    topFindings: [],
    topObservedEntities: [
      { label: "OneTrust", category: "cmp", requestCount: 2 },
      { label: "Google Ads", category: "ads", requestCount: 10 }
    ],
    trackerSummary: "2 vendors across 2 third-party domains",
    unifiedFindings: [],
    unresolvedVendorHosts: [],
    vendorCategoryCounts: { ads: 1, cmp: 1 }
  }));

  assert.doesNotMatch(html, /Vendor mix/);
  assert.match(html, /Tracker footprint/);
  assert.doesNotMatch(html, /View observed vendors and domains/);
  assert.match(html, /Tracker footprint \(9\)/);
  assert.match(html, /5 vendors, 4 domains/);
  assert.match(html, /OneTrust/);
  assert.match(html, /Google Ads/);
  assert.match(html, /\/vendor-logos\/onetrust\.png/);
  assert.match(html, /\/vendor-logos\/google\.png/);
  assert.match(html, /\/vendor-logos\/doubleverify\.png/);
  assert.match(html, /\/vendor-logos\/magnite\.png/);
  assert.match(html, /\/vendor-logos\/hotjar\.png/);
  assert.doesNotMatch(html, /cmp · 2 req/);
});

test("ExecutiveSummaryCard distinguishes cookie-only runtime observations from tracker footprint", () => {
  const html = renderToStaticMarkup(createElement(ExecutiveSummaryCard, {
    accessLimitationNotice: null,
    allFindings: [],
    beforeConsentCookieCount: 4,
    domainBenchmark: null,
    finalHost: "cnn.com",
    fingerprintReasons: [],
    fingerprintLabel: "None detected",
    fingerprintNarrative: "No strong fingerprinting signal surfaced.",
    landedOnDifferentHost: false,
    lastScannedAt: "2026-06-17T14:10:00.000Z",
    policySurfaces: [],
    posture: "Clear",
    preConsentVendorNames: [],
    requestedHost: "cnn.com",
    resolvedVendorNames: [],
    score: 72,
    sessionReplayVendorNames: [],
    thirdPartyRequestCount: 0,
    thirdPartyDomains: [],
    topFindings: [],
    topObservedEntities: [],
    trackerSummary: "No meaningful third-party footprint observed",
    unifiedFindings: [],
    unresolvedVendorHosts: [],
    vendorCategoryCounts: {}
  }));

  assert.match(html, /Tracker footprint/);
  assert.match(html, /0 vendors, 0 domains/);
  assert.match(html, /4 cookies were observed before consent/);
  assert.match(html, /No third-party tracker vendors or domains were resolved/);
});

test("ExecutiveSummaryCard renders logo badges for observed tracker vendors and domains", () => {
  const html = renderToStaticMarkup(createElement(ExecutiveSummaryCard, {
    accessLimitationNotice: null,
    beforeConsentCookieCount: 0,
    domainBenchmark: null,
    finalHost: "fandango.com",
    fingerprintReasons: [],
    fingerprintLabel: "None detected",
    fingerprintNarrative: "No fingerprinting evidence detected.",
    landedOnDifferentHost: false,
    lastScannedAt: "2026-05-24T17:07:47.000Z",
    posture: "Watch",
    preConsentVendorNames: [],
    requestedHost: "fandango.com",
    resolvedVendorNames: ["DoubleVerify", "Google Ads", "Magnite", "Magnite / Rubicon", "Meta Pixel", "OneTrust"],
    score: 54,
    sessionReplayVendorNames: [],
    thirdPartyRequestCount: 54,
    thirdPartyDomains: [
      "ajax.googleapis.com",
      "assets.adobedtm.com",
      "cdn.jwplayer.com",
      "images2.vudu.com",
      "maps.googleapis.com",
      "app.mps.vsnt.net",
      "securepubads.g.doubleclick.net",
      "pub.doubleverify.com",
      "vtrk.dv.tech",
      "micro.rubiconproject.com"
    ],
    topFindings: [],
    topObservedEntities: [],
    trackerSummary: "6 vendors across 10 third-party domains",
    unifiedFindings: [],
    unresolvedVendorHosts: [],
    vendorCategoryCounts: {}
  }));

  assert.doesNotMatch(html, /View observed vendors and domains/);
  assert.doesNotMatch(html, />Observed vendors and domains</);
  assert.match(html, /\/vendor-logos\/doubleverify\.png/);
  assert.match(html, /\/vendor-logos\/google\.png/);
  assert.match(html, /\/vendor-logos\/magnite\.png/);
  assert.match(html, /\/vendor-logos\/facebook\.png/);
  assert.match(html, /\/vendor-logos\/onetrust\.png/);
  assert.match(html, /Tracker footprint \(16\)/);
  assert.match(html, /6 vendors, 10 domains/);
  assert.doesNotMatch(html, /13 more\.\.\./);
  assert.match(html, /\/vendor-logos\/adobe\.png/);
  assert.match(html, /\/vendor-logos\/jwplayer\.png/);
  assert.match(html, /\/vendor-logos\/vudu\.png/);
});

test("ExecutiveSummaryCard hides protected-route interruptions for non-admin viewers while keeping posture soft", () => {
  const html = renderToStaticMarkup(
    createElement(ExecutiveSummaryCard, {
      accessLimitationNotice: null,
      allFindings: [],
      beforeConsentCookieCount: 0,
      domainBenchmark: null,
      finalHost: "certscore.ai",
      fingerprintReasons: [],
      fingerprintLabel: "None detected",
      fingerprintNarrative: "No strong fingerprinting signal surfaced.",
      landedOnDifferentHost: false,
      lastScannedAt: "2026-05-14T23:18:11.000Z",
      pagesScanned: 2,
      policyEnrichmentCount: 1,
      posture: "Clear",
      preConsentVendorNames: [],
      requestedHost: "certscore.ai",
      resolvedVendorNames: ["Google Tag Manager"],
      score: 68,
      scanInterruptions: [
        {
          label: "Protected route encountered",
          details: [
            "Some protected routes were encountered outside the public homepage.",
            "Homepage findings are based on observable public-page evidence."
          ]
        }
      ],
      sessionReplayVendorNames: [],
      thirdPartyRequestCount: 10,
      thirdPartyDomains: ["www.googletagmanager.com"],
      topFindings: [],
      topObservedEntities: [],
      trackerSummary: "3 vendors across 10 third-party requests",
      unifiedFindings: [],
      unresolvedVendorHosts: [],
      vendorCategoryCounts: { analytics: 1 },
      verifiedPublicSurfacesCount: 1
    })
  );

  assert.match(html, /data-testid="executive-posture-badge"[^>]*>Complete</);
  assert.doesNotMatch(html, /Protected route encountered/);
  assert.doesNotMatch(html, /Homepage findings are based on observable public-page evidence/);
  assert.doesNotMatch(html, /Runtime coverage was limited by site protections/);
  assert.doesNotMatch(html, /Coverage was limited by site protections/);
});

test("ExecutiveSummaryCard shows protected-route interruptions for admin diagnostics", () => {
  const html = renderToStaticMarkup(
    createElement(ExecutiveSummaryCard, {
      accessLimitationNotice: null,
      allFindings: [],
      beforeConsentCookieCount: 0,
      domainBenchmark: null,
      finalHost: "certscore.ai",
      fingerprintReasons: [],
      fingerprintLabel: "None detected",
      fingerprintNarrative: "No strong fingerprinting signal surfaced.",
      landedOnDifferentHost: false,
      lastScannedAt: "2026-05-14T23:18:11.000Z",
      pagesScanned: 2,
      policyEnrichmentCount: 1,
      posture: "Clear",
      preConsentVendorNames: [],
      requestedHost: "certscore.ai",
      resolvedVendorNames: ["Google Tag Manager"],
      score: 68,
      scanInterruptions: [
        {
          label: "Protected route encountered",
          details: [
            "Some protected routes were encountered outside the public homepage.",
            "Homepage findings are based on observable public-page evidence."
          ]
        }
      ],
      sessionReplayVendorNames: [],
      showProtectedRouteInterruptions: true,
      thirdPartyRequestCount: 10,
      thirdPartyDomains: ["www.googletagmanager.com"],
      topFindings: [],
      topObservedEntities: [],
      trackerSummary: "3 vendors across 10 third-party requests",
      unifiedFindings: [],
      unresolvedVendorHosts: [],
      vendorCategoryCounts: { analytics: 1 },
      verifiedPublicSurfacesCount: 1
    })
  );

  assert.doesNotMatch(html, /Protected route encountered/);
  assert.doesNotMatch(html, /Homepage findings are based on observable public-page evidence/);
});

test("ExecutiveSummaryCard qualifies incomplete protected-route scans when homepage evidence is retained", () => {
  const html = renderToStaticMarkup(
    createElement(ExecutiveSummaryCard, {
      accessLimitationNotice: null,
      allFindings: [],
      beforeConsentCookieCount: 0,
      domainBenchmark: null,
      finalHost: "kbdlab.io",
      fingerprintReasons: [],
      fingerprintLabel: "None detected",
      fingerprintNarrative: "No strong fingerprinting signal surfaced.",
      landedOnDifferentHost: false,
      lastScannedAt: "2026-05-14T23:18:11.000Z",
      pagesScanned: 1,
      policyEnrichmentCount: 1,
      posture: "Action Needed",
      preConsentVendorNames: ["Microsoft Clarity"],
      requestedHost: "kbdlab.io",
      resolvedVendorNames: ["Microsoft Clarity"],
      score: 52,
      scanOutcome: "incomplete",
      status: "incomplete",
      scanInterruptions: [
        {
          label: "Protected route encountered",
          details: ["Some non-homepage routes were protected or unavailable."]
        }
      ],
      sessionReplayVendorNames: ["Microsoft Clarity"],
      thirdPartyRequestCount: 12,
      thirdPartyDomains: ["www.clarity.ms"],
      topFindings: [
        makeFinding("session_recording_services_detected", "Session recording service detected", {
          shortSummary: "Microsoft Clarity session recording service observed."
        })
      ],
      topObservedEntities: [],
      trackerSummary: "1 vendor across 12 third-party requests",
      unifiedFindings: [],
      unresolvedVendorHosts: [],
      vendorCategoryCounts: { session_replay: 1 },
      verifiedPublicSurfacesCount: 1
    })
  );

  assert.doesNotMatch(html, /Homepage evidence was retained; some non-homepage routes were protected or unavailable\./);
  assert.match(html, /Session replay service signal observed/);
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
  assert.doesNotMatch(html, /data-testid="executive-posture-badge"[^>]*>Complete</);
  assert.doesNotMatch(html, /Runtime coverage was limited by site protections/);
  assert.doesNotMatch(html, /CertScore did not confirm a headline homepage issue from retained evidence/);
  assert.doesNotMatch(html, /Observed vendor and request counts may be incomplete/);
  assert.doesNotMatch(html, /This scan has incomplete coverage/);
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

  assert.match(html, /data-testid="executive-posture-badge"[^>]*>Complete</);
  assert.doesNotMatch(html, /Limited review/);
  assert.doesNotMatch(html, /Runtime coverage was limited by site protections/);
  assert.doesNotMatch(html, /This scan has incomplete coverage/);
});

test("ExecutiveSummaryCard surfaces under-observed ecosystem coverage diagnostics", () => {
  const html = renderToStaticMarkup(
    createElement(ExecutiveSummaryCard, {
      accessLimitationNotice: null,
      allFindings: [],
      beforeConsentCookieCount: 19,
      coverageDiagnosticIndicators: [
        {
          id: "likely_incomplete_tracking_ecosystem",
          label: "Likely incomplete ecosystem",
          message:
            "Coverage diagnostic: Observed request volume was unusually low for this benchmark while cookies/interruption signals were present. Some deferred or protected tracking paths may not have been fully observable.",
          severity: "review",
          evidence: {
            beforeConsentCookieCount: 19,
            expectedThirdPartyRequests: 55,
            observedThirdPartyDomainCount: 3,
            observedThirdPartyRequestCount: 9,
            observedVendorCount: 0,
            requestObservationRatio: 9 / 55
          },
          suspectedCauses: [
            "blocked_ad_exchange_or_protected_cdn_route",
            "cookie_state_outpaced_observed_network",
            "deferred_adtech_execution",
            "lazy_loaded_monetization"
          ]
        }
      ],
      domainBenchmark: {
        confidence: "medium",
        estimatedRankLabel: "Typical",
        expectedCookiesBeforeConsent: 2,
        expectedOverallScore: 82,
        expectedThirdPartyRequests: 55,
        industry: "Media / publisher sites",
        rationale: "Matched to a media benchmark."
      },
      finalHost: "www.cnn.com",
      fingerprintReasons: [],
      fingerprintLabel: "None detected",
      fingerprintNarrative: "No strong fingerprinting signal surfaced.",
      landedOnDifferentHost: false,
      lastScannedAt: "2026-05-10T12:00:00.000Z",
      legalCoverageScore: 30,
      pagesScanned: 1,
      policyEnrichmentCount: 1,
      posture: "Clear",
      preConsentVendorNames: [],
      requestedHost: "cnn.com",
      resolvedVendorNames: [],
      scanInterruptions: [
        {
          label: "Captcha/security challenge",
          details: ["The public homepage scan was interrupted by a challenge."]
        }
      ],
      score: 76,
      sessionReplayVendorNames: [],
      thirdPartyRequestCount: 9,
      thirdPartyDomains: ["cdn.optimizely.com", "turner.map.fastly.net", "cnn.com"],
      topFindings: [],
      topObservedEntities: [],
      trackerSummary: "3 third-party domains observed",
      unifiedFindings: [],
      unresolvedVendorHosts: [],
      vendorCategoryCounts: {},
      verifiedPublicSurfacesCount: 1
    })
  );

  assert.match(html, /Limited review/);
  assert.doesNotMatch(html, /Runtime coverage was limited by site protections/);
  assert.doesNotMatch(html, /Likely incomplete ecosystem/);
  assert.doesNotMatch(html, /Coverage diagnostic: Observed request volume was unusually low for this benchmark/);
  assert.doesNotMatch(html, /Observed vendor and request counts may be incomplete/);
  assert.doesNotMatch(html, /tracking was missed|blocked trackers detected|non-compliant|hidden tracking/i);
  assert.doesNotMatch(html, /data-testid="executive-posture-badge"[^>]*>Complete</);
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

test("ExecutiveSummaryCard suppresses broad incomplete warning for protected-route-only partial scans", () => {
  const html = renderToStaticMarkup(
    createElement(ExecutiveSummaryCard, {
      accessLimitationNotice: null,
      allFindings: [makeFinding("wcag_color_contrast_issue", "Visual contrast accessibility issue")],
      beforeConsentCookieCount: 0,
      coverageLevel: "limited_partial",
      domainBenchmark: null,
      finalHost: "certscore.ai",
      fingerprintReasons: [],
      fingerprintLabel: "None detected",
      fingerprintNarrative: "No strong fingerprinting signal surfaced.",
      landedOnDifferentHost: false,
      lastScannedAt: "2026-05-10T12:00:00.000Z",
      pagesScanned: 2,
      posture: "Action Needed",
      preConsentVendorNames: [],
      requestedHost: "certscore.ai",
      resolvedVendorNames: [],
      scanInterruptions: [
        {
          label: "Protected route encountered",
          details: [
            "Some protected routes were encountered outside the public homepage.",
            "Homepage findings are based on observable public-page evidence."
          ]
        }
      ],
      scanOutcome: "completed_partial",
      score: 75,
      sessionReplayVendorNames: [],
      status: "completed",
      thirdPartyRequestCount: 1,
      thirdPartyDomains: ["static.cloudflareinsights.com"],
      topFindings: [makeFinding("wcag_color_contrast_issue", "Visual contrast accessibility issue")],
      topObservedEntities: [],
      trackerSummary: "1 third-party domain observed",
      unifiedFindings: [],
      unresolvedVendorHosts: [],
      vendorCategoryCounts: {},
      verifiedPublicSurfacesCount: 1
    })
  );

  assert.doesNotMatch(html, /This scan has incomplete coverage/);
});

test("ExecutiveSummaryCard suppresses broad incomplete warning from projected findings even when page-count props are incomplete", () => {
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
      posture: "Watch",
      preConsentVendorNames: ["Google Analytics"],
      requestedHost: "kbdlab.io",
      resolvedVendorNames: ["Google Analytics", "Google Tag Manager"],
      scanOutcome: "completed_partial",
      score: 66,
      sessionReplayVendorNames: [],
      status: "completed",
      thirdPartyRequestCount: 42,
      thirdPartyDomains: ["google-analytics.com", "googletagmanager.com"],
      topFindings: [
        makeFinding("pre_consent_tracking_detected", "Tracking started before consent"),
        makeFinding("third_party_cookie_pre_consent", "Tracking cookies set before consent"),
        makeFinding("session_recording_services_detected", "Session replay service signal observed")
      ],
      topObservedEntities: [],
      trackerSummary: "2 vendors across 2 third-party domains",
      unifiedFindings: [],
      unresolvedVendorHosts: [],
      vendorCategoryCounts: { analytics: 2 }
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
  assert.doesNotMatch(html, /Runtime coverage was limited by site protections/);
  assert.doesNotMatch(html, /This scan has incomplete coverage/);
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

  assert.doesNotMatch(html, /DOJ \/ ADA accessibility/);
  assert.doesNotMatch(html, /Audit-only/);
  const adaStart = html.indexOf("DOJ / ADA accessibility");
  const financialStart = html.indexOf("Financial &amp; commercial claims");
  assert.equal(adaStart, -1);
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
  assert.match(html, /Benchmark: Web portal/);
  assert.doesNotMatch(html, /Benchmark: Web portal \/ News &amp; Media \/ Internet services/);
  assert.doesNotMatch(html, /Score note:/);
  assert.doesNotMatch(html, /132 3rd-party requests/);
  assert.match(html, /\+124 above expected for Web portal \/ News &amp; Media \/ Internet services/);
  assert.doesNotMatch(html, /20 cookies before consent/);
  assert.match(html, /\+16 above expected for Web portal \/ News &amp; Media \/ Internet services/);
  assert.doesNotMatch(html, /Scanned Apr/);
  assert.ok(html.indexOf("Action Needed") < html.indexOf("Benchmark: Web portal"));
});

test("ExecutiveSummaryCard withholds scores when the captured page is not representative", () => {
  const html = renderToStaticMarkup(
    createElement(ExecutiveSummaryCard, {
      accessLimitationNotice: null,
      beforeConsentCookieCount: 46,
      domainBenchmark: {
        confidence: "medium",
        estimatedRankLabel: "Typical",
        expectedCookiesBeforeConsent: 4,
        expectedOverallScore: 78,
        expectedThirdPartyRequests: 12,
        industry: "SaaS / web application",
        rationale: "Matched to a SaaS benchmark."
      },
      finalHost: "www.grammarly.com",
      fingerprintReasons: [],
      fingerprintLabel: "None detected",
      fingerprintNarrative: "No strong fingerprinting signal surfaced.",
      landedOnDifferentHost: false,
      lastScannedAt: "2026-06-01T19:28:00.000Z",
      posture: "Action Needed",
      preConsentVendorNames: ["Google Tag Manager"],
      requestedHost: "grammarly.com",
      resolvedVendorNames: ["Google Tag Manager"],
      score: 63,
      scanOutcome: "completed_partial",
      sessionReplayVendorNames: [],
      thirdPartyRequestCount: 77,
      thirdPartyDomains: ["www.googletagmanager.com"],
      topFindings: [
        makeFinding("scan_quality_visual_no_go", "Normal public site was not reached", {
          section: "Runtime & Diagnostics",
          severity: "high",
          shortSummary: "The retained initial-load evidence did not show the normal public site."
        })
      ],
      topObservedEntities: [{ label: "Google Tag Manager", category: "analytics", requestCount: 5 }],
      trackerSummary: "1 vendor across 1 third-party domain",
      unifiedFindings: [],
      unresolvedVendorHosts: [],
      vendorCategoryCounts: { analytics: 1 }
    })
  );

  assert.match(html, /Scan not representative/);
  assert.match(html, /Automated scan could not evaluate this site/);
  assert.match(html, /Scores, regulatory projections, and substantive findings are withheld for this scan/);
  assert.match(html, /Not scored/);
  assert.match(html, /Scores and regulatory projections were withheld for this scan/);
  assert.match(html, /Scan quality snapshot/);
  assert.doesNotMatch(html, /Top findings/);
  assert.doesNotMatch(html, /Why this scan was not scored/);
  assert.doesNotMatch(html, /Public page access/);
  assert.doesNotMatch(html, /Representative page not captured/);
  assert.doesNotMatch(html, /retained visual evidence showed/);
  assert.doesNotMatch(html, /Overall score/);
  assert.doesNotMatch(html, /63\/100 overall score/);
  assert.doesNotMatch(html, /Review lenses/);
  assert.doesNotMatch(html, /CCPA \/ CPRA \/ CIPA/);
  assert.doesNotMatch(html, /Review signal/);
  assert.doesNotMatch(html, /Good evidence/);
  assert.doesNotMatch(html, /Normal public site was not reached/);
  assert.doesNotMatch(html, /Representative domains/);
  assert.doesNotMatch(html, /Review focus/);
  assert.doesNotMatch(html, /Evidence details/);
  assert.doesNotMatch(html, /no-go/i);
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

  assert.doesNotMatch(html, /Financial &amp; commercial claims/);
  assert.doesNotMatch(html, /Simulated or hypothetical performance language surfaced without nearby disclosure\./);
});

test("ExecutiveSummaryCard links mapped findings to registry interpretation context", () => {
  const html = renderToStaticMarkup(
    createElement(ExecutiveSummaryCard, {
      accessLimitationNotice: null,
      allFindings: [
        makeFinding("pre_consent_tracking_detected", "Tracking started before consent", {
          severity: "critical",
          shortSummary: "Third-party tracking began before any recorded consent choice.",
          evidenceDetails: {
            scanContext: {
              pageUrl: "https://example.com/"
            },
            timing: {
              firstThirdPartyTrackingRequestMs: 1234
            },
            representativeRequests: [
              {
                hostname: "googletagmanager.com",
                vendorName: "Google Tag Manager",
                runtimePhase: "pre_consent"
              }
            ]
          } as CertScoreFinding["evidenceDetails"]
        })
      ],
      beforeConsentCookieCount: 0,
      domainBenchmark: null,
      finalHost: "example.com",
      fingerprintReasons: [],
      fingerprintLabel: "None detected",
      fingerprintNarrative: "No fingerprinting evidence detected.",
      landedOnDifferentHost: false,
      lastScannedAt: "2026-04-21T17:07:47.000Z",
      posture: "Action Needed",
      preConsentVendorNames: ["Google Tag Manager"],
      requestedHost: "example.com",
      resolvedVendorNames: ["Google Tag Manager"],
      score: 58,
      sessionReplayVendorNames: [],
      thirdPartyRequestCount: 14,
      thirdPartyDomains: ["googletagmanager.com"],
      topFindings: [
        makeFinding("pre_consent_tracking_detected", "Tracking started before consent", {
          severity: "critical",
          shortSummary: "Third-party tracking began before any recorded consent choice.",
          evidenceDetails: {
            scanContext: {
              pageUrl: "https://example.com/"
            },
            timing: {
              firstThirdPartyTrackingRequestMs: 1234
            },
            representativeRequests: [
              {
                hostname: "googletagmanager.com",
                vendorName: "Google Tag Manager",
                runtimePhase: "pre_consent"
              }
            ]
          } as CertScoreFinding["evidenceDetails"]
        })
      ],
      accessibilitySignals: {
        accessibilityStatementPresent: true,
        wcagErrorCountTotal: 0
      },
      agencyMappings: [],
      regulatoryRisk: makeRegulatoryRisk(),
      topObservedEntities: [{ label: "Google Tag Manager", category: "analytics", requestCount: 4 }],
      trackerSummary: "1 vendor across 1 third-party domain",
      unresolvedVendorHosts: [],
      vendorCategoryCounts: { analytics: 1 }
    })
  );

  assert.doesNotMatch(html, /Regulatory review context/);
  assert.match(html, /Consent timing: tracking before recorded choice/);
  assert.match(html, /Evidence details/);
  assert.match(html, /M7 4L13 10L7 16/);
  assert.doesNotMatch(html, /M8 4 4 12l4 8/);
  assert.doesNotMatch(html, /Learn how this finding is interpreted/);
  assert.match(html, /Learn more/);
  assert.match(html, /href="\/findings\/pre_consent_tracking_detected"/);
  assert.match(
    html,
    /href="\/findings\/pre_consent_tracking_detected" target="_blank" rel="noreferrer"/
  );
});

test("ExecutiveSummaryCard keeps four or more top findings in an expandable top-findings list", () => {
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
        makeFinding("session_recording_services_detected", "Session replay service signal observed"),
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
  assert.match(html, /data-executive-top-findings-list="true"/);
  assert.match(html, /data-executive-snapshot-pane="true"/);
  assert.doesNotMatch(html, /max-h-\[38\.375rem\]/);
  assert.match(html, /overflow-y-auto/);
  assert.match(html, /Third-party tracking observed before recorded consent/);
  assert.match(html, /4 high-priority issues/);
  assert.match(html, /Non-essential tracking continued after reject/);
  assert.match(html, /Session replay service signal observed/);
  assert.match(html, /Automated accessibility issues observed/);
});

test("ExecutiveSummaryCard renders GDPR gap-observed checklist rows as top findings", () => {
  const regulatoryGapFindings = buildRegulatoryGapTopFindings({
    gdprEprivacyArea: {
      id: "gdpr_eprivacy",
      title: "GDPR / ePrivacy",
      rows: [
        {
          assessmentStatus: "gap_observed",
          evidenceRefs: ["gdpr-row-ref"],
          id: "pre_consent_third_party_tracking",
          label: "Pre-consent third-party tracking",
          note: "Advertising and analytics requests were observed before consent."
        },
        {
          assessmentStatus: "review_signal",
          evidenceState: "observed",
          id: "retargeting_behavioral_advertising_signal_observed",
          label: "Retargeting / behavioral advertising signal",
          note: "Behavioral advertising evidence was retained for purpose review.",
          status: "Review signal"
        },
        {
          assessmentStatus: "review_signal",
          id: "runtime_vendor_disclosure_alignment",
          label: "Runtime vendor disclosure mismatch",
          note: "Review signal only."
        },
        {
          assessmentStatus: "checked",
          evidenceState: "not_observed",
          id: "retention_disclosure",
          label: "Retention disclosure",
          note: "Not confirmed from retained policy-surface evidence.",
          status: "Not confirmed"
        }
      ]
    }
  });
  const html = renderToStaticMarkup(
    createElement(ExecutiveSummaryCard, {
      accessLimitationNotice: null,
      allFindings: regulatoryGapFindings,
      beforeConsentCookieCount: 1,
      domainBenchmark: null,
      finalHost: "example.com",
      fingerprintReasons: [],
      fingerprintLabel: "None detected",
      fingerprintNarrative: "No fingerprinting evidence detected.",
      landedOnDifferentHost: false,
      lastScannedAt: "2026-04-21T17:07:47.000Z",
      posture: "Action Needed",
      preConsentVendorNames: [],
      requestedHost: "example.com",
      resolvedVendorNames: [],
      score: 72,
      sessionReplayVendorNames: [],
      thirdPartyRequestCount: 2,
      thirdPartyDomains: ["analytics.example"],
      topFindings: regulatoryGapFindings,
      accessibilitySignals: {
        accessibilityStatementPresent: true,
        wcagErrorCountTotal: 0
      },
      agencyMappings: [],
      regulatoryRisk: makeRegulatoryRisk(),
      topObservedEntities: [],
      trackerSummary: "1 third-party domain",
      unresolvedVendorHosts: [],
      vendorCategoryCounts: {}
    })
  );

  assert.match(html, /Top findings/);
  assert.doesNotMatch(html, />Regulatory gap</);
  assert.doesNotMatch(html, />Regulatory checklist gap</);
  assert.doesNotMatch(html, />high<span/);
  assert.doesNotMatch(html, /Regulatory gap/);
  assert.doesNotMatch(html, /Regulatory checklist gap/);
  assert.match(html, /Pre-consent third-party tracking/);
  assert.match(html, /Retargeting \/ behavioral advertising signal/);
  assert.doesNotMatch(html, /data-finding-icon=/);
  assert.match(html, /aria-label="Potential gap"/);
  assert.match(html, /aria-label="Potential concern"/);
  assert.ok(
    html.indexOf("Pre-consent third-party tracking") <
      html.indexOf("Retargeting / behavioral advertising signal")
  );
  assert.doesNotMatch(html, /GDPR\/ePrivacy potential concern: Pre-consent third-party tracking/);
  assert.match(html, /Advertising and analytics requests were observed before consent/);
  assert.match(html, /Retention disclosure/);
  assert.match(html, /Partial rating/);
  assert.match(html, /Not confirmed from retained policy-surface evidence/);
  assert.match(html, /do not treat it as a legal conclusion/);
  assert.doesNotMatch(html, /Runtime vendor disclosure mismatch/);
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
        makeFinding("session_recording_services_detected", "Session replay service signal observed", {
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

  assert.doesNotMatch(html, /critical/);
  assert.doesNotMatch(html, />Consent timing</);
  assert.doesNotMatch(html, /Evidence quality: Good evidence/);
  assert.doesNotMatch(html, /<span[^>]*>\s*Good evidence\s*<\/span>/);
  assert.match(html, /Seen on ~18% of scanned top sites/);
  assert.match(html, /Seen on ~9% of scanned top sites/);
  assert.match(html, /directional market context/);
  assert.match(html, /not a compliance benchmark or legal conclusion/);
  assert.doesNotMatch(html, /View evidence/);
  assert.doesNotMatch(html, /Audit finding/);
  assert.match(html, /Confirm whether the classified third-party tracking signal is intentionally allowed before consent or should be gated by consent controls/);
  assert.doesNotMatch(html, /Review and remediation starting points/);
  assert.equal(html.match(/Seen on ~18% of scanned top sites/g)?.length, 2);
  assert.equal(html.match(/Seen on ~9% of scanned top sites/g)?.length, 2);

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
        makeFinding("session_recording_services_detected", "Session replay service signal observed", {
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

  assert.match(html, /Session replay service signal observed/);
  assert.doesNotMatch(html, />medium</);
  assert.doesNotMatch(html, /Strong evidence/);
  assert.doesNotMatch(html, /Evidence details/);
  assert.doesNotMatch(html, /\{\} JSON evidence|&quot;severity&quot;: &quot;high&quot;/);
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
  assert.match(html, /This does not independently establish a legal determination/);
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
              "reject_reduced_some_tracking_but_nonessential_vendor_persisted",
              "nonessential_vendor_persisted_after_reject"
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
            rejectSuppressionOutcome: {
              overallTrackingReducedAfterReject: true,
              nonEssentialVendorsPersistedAfterReject: true,
              persistingNonEssentialVendors: ["Google Ads"],
              postRejectNonEssentialRequestCount: 1,
              firstPostRejectNonEssentialRequestMs: 1226,
              interpretation: "Reject reduced some tracking overall, but at least one classified non-essential vendor still fired after reject."
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
            limitations: ["Automated scan does not determine legal status."]
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
  assert.doesNotMatch(html, /postRejectEvidence/);
  assert.match(html, /rejectSuppressionOutcome/);
  assert.doesNotMatch(html, /policyEvidence/);
  assert.match(html, /ms_after_reject/);
  assert.match(html, /reject_reduced_some_tracking_but_nonessential_vendor_persisted/);
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
        makeFinding("pre_consent_tracking_detected", "Third-party tracking observed before recorded consent", {
          confidence: "strong",
          severity: "critical",
          shortSummary: "Observed runtime behavior showed third-party tracking before any recorded consent choice. The first classified tracking request occurred at 1500ms, with representative vendors including Google Tag Manager and HubSpot.",
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
            limitations: ["Automated scan does not determine legal status."]
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
  assert.match(html, /Evidence details/);
  assert.match(html, /Regulatory context/);
  assert.match(html, /GDPR \/ ePrivacy/);
  assert.doesNotMatch(html, /CCPA \/ CPRA/);
  assert.match(html, /View applicability notes/);
  assert.match(html, /regulatory review context for the scanned report finding/);
  assert.match(html, /Google Tag Manager and HubSpot appeared before recorded consent; first classified signal at 1500ms after page load\. Tracking before a clear user choice can undermine consent expectations\./);
  assert.match(html, /Confirm whether these services are intentionally allowed before consent or should be gated by consent controls\./);
  assert.match(html, /Learn more/);
  assert.doesNotMatch(html, /Evidence basis/);
  assert.doesNotMatch(html, /No accept, reject, manage, or close interaction was recorded before the retained request evidence\. Representative vendors: Google Tag Manager and HubSpot\. Automated public-web observation for review; not legal advice, certification, or a compliance determination\./);
  assert.doesNotMatch(html, /Why this matters/);
  assert.doesNotMatch(html, /Review and remediation starting points/);
  assert.doesNotMatch(html, /Observed runtime behavior:/);
  assert.doesNotMatch(html, /First classified non-essential\/tracker request timestamp: 1500ms\./);
  assert.doesNotMatch(html, /title="Runtime requests: Strong"/);
  assert.doesNotMatch(html, /title="Vendor attribution: Strong"/);
  assert.doesNotMatch(html, /title="Cookie timing: Partial"/);
  assert.doesNotMatch(html, /title="Consent state: Strong"/);
  assert.doesNotMatch(html, /title="Policy context: Not evaluated"/);
  assert.match(html, /evidenceVersion/);
  assert.match(html, /timingAnalysis/);
  assert.match(html, /requestSelectionNote/);
  assert.match(html, /consentBasis/);
  assert.match(html, /representativeRequests/);
  assert.match(html, /identifierEvidence/);
  assert.match(html, /interpretation/);
  assert.match(html, /uniquePreConsentTrackingVendorsObserved/);
  assert.doesNotMatch(html, /preConsentTrackingVendors/);
  assert.match(html, /googletagmanager\.com/);
  assert.match(html, /userConsentActionObserved/);
  assert.doesNotMatch(html, /runtimeRequestUrls/);
  assert.doesNotMatch(html, /sourceUrls/);
  assert.doesNotMatch(html, /pageUrls/);
  assert.doesNotMatch(html, /\{\} JSON evidence/);
  assert.doesNotMatch(
    html,
    new RegExp([
      `CIPA ${"viol"}ation confirmed`,
      "legal liability",
      `${"viol"}ates?`,
      `${"ill"}egal`,
      "deceptive",
      "manipulative",
      "non-compliant"
    ].join("|"), "i")
  );
});

test("ExecutiveSummaryCard explains executive and finding cookie count differences", () => {
  const cookieFinding = makeFinding("third_party_cookie_pre_consent", "Third-party tracking cookie before consent", {
    confidence: "strong",
    evidenceDetails: {
      counts: {
        preConsentTrackingCookies: 13,
        total_cookie_count: 10
      },
      cookieEvidence: {
        observed: true,
        cookieCount: 13,
        trackingCookieWritesBeforeConsent: 13,
        totalUniqueCookiesObserved: 10,
        cookieWriteEvidence: [{ cookieName: "_clck", timingStatus: "pre_consent" }],
        storageEvidence: [{ cookieName: "_clck", timingStatus: "pre_consent" }]
      },
      scanContext: {
        pageUrl: "https://www.kbdlab.io/",
        scanMode: "initial_page_load",
        interactionBeforeFinding: false
      },
      policyEvidence: { evaluated: false }
    },
    severity: "high",
    shortSummary: "Tracking cookie writes were retained before consent."
  });
  const html = renderToStaticMarkup(
    createElement(ExecutiveSummaryCard, {
      accessLimitationNotice: null,
      allFindings: [cookieFinding],
      beforeConsentCookieCount: 15,
      domainBenchmark: null,
      finalHost: "kbdlab.io",
      fingerprintReasons: [],
      fingerprintLabel: "None detected",
      fingerprintNarrative: "No strong fingerprinting signal surfaced.",
      landedOnDifferentHost: false,
      lastScannedAt: "2026-05-17T20:00:00.000Z",
      posture: "Action Needed",
      preConsentVendorNames: ["Microsoft Clarity"],
      requestedHost: "kbdlab.io",
      resolvedVendorNames: ["Microsoft Clarity"],
      score: 48,
      sessionReplayVendorNames: ["Microsoft Clarity"],
      thirdPartyRequestCount: 20,
      thirdPartyDomains: ["www.clarity.ms"],
      topFindings: [cookieFinding],
      topObservedEntities: [{ label: "Microsoft Clarity", category: "session_replay", requestCount: 4 }],
      trackerSummary: "1 vendor across 20 third-party requests",
      unresolvedVendorHosts: [],
      vendorCategoryCounts: { session_replay: 1 }
    })
  );

  assert.match(html, /Cookies pre-consent/);
  assert.doesNotMatch(html, /Cookies before consent/);
  assert.doesNotMatch(html, /15 cookies before consent/);
  assert.match(html, /Executive metric includes all retained cookie timing records; this finding shows the subset attributed to tracking\/storage evidence\./);
  assert.match(html, /trackingCookieWritesBeforeConsent/);
  assert.match(html, /totalUniqueCookiesObserved/);
  assert.match(html, /Retained counts: 13 preConsentTrackingCookies; 10 total cookie count\./);
  assert.doesNotMatch(html, /Partial means some timing evidence was retained directly/);
});

test("ExecutiveSummaryCard uses accessibility-specific evidence basis rows", () => {
  const finding = makeFinding("visual_contrast_accessibility_issue", "Visual contrast accessibility issue", {
    section: "Accessibility",
    confidence: "good",
    evidenceDetails: {
      accessibilityEvidence: {
        observed: true,
        affectedNodes: 11,
        axeRuleId: "color-contrast",
        impact: "critical",
        pageCount: 1
      },
      pageUrls: ["https://certscore.ai/"]
    },
    severity: "critical",
    shortSummary: "Automated contrast issue retained from axe evidence."
  });
  const html = renderToStaticMarkup(
    createElement(ExecutiveSummaryCard, {
      accessLimitationNotice: null,
      allFindings: [finding],
      beforeConsentCookieCount: 0,
      domainBenchmark: null,
      finalHost: "certscore.ai",
      fingerprintReasons: [],
      fingerprintLabel: "None detected",
      fingerprintNarrative: "No strong fingerprinting signal surfaced.",
      landedOnDifferentHost: false,
      lastScannedAt: "2026-05-17T20:00:00.000Z",
      posture: "Watch",
      preConsentVendorNames: [],
      requestedHost: "certscore.ai",
      resolvedVendorNames: [],
      score: 91,
      sessionReplayVendorNames: [],
      thirdPartyRequestCount: 0,
      thirdPartyDomains: [],
      topFindings: [finding],
      topObservedEntities: [],
      trackerSummary: "No meaningful third-party footprint observed",
      unresolvedVendorHosts: [],
      vendorCategoryCounts: {}
    })
  );

  assert.doesNotMatch(html, /title="Axe rule retained: Strong"/);
  assert.doesNotMatch(html, /title="Affected nodes: 11"/);
  assert.doesNotMatch(html, /title="Page coverage: 1 page"/);
  assert.doesNotMatch(html, /title="Impact\/severity: Critical"/);
  assert.doesNotMatch(html, /title="Manual verification: Recommended"/);
  assert.doesNotMatch(html, /title="Runtime requests:/);
  assert.doesNotMatch(html, /title="Vendor attribution:/);
  assert.doesNotMatch(html, /title="Cookie timing:/);
  assert.doesNotMatch(html, /title="Consent state:/);
  assert.match(
    html,
    /Visual contrast accessibility issue was retained for manual accessibility review, with 11 affected elements across 1 page\. The highest retained impact was critical\./
  );
  assert.match(
    html,
    /Review the affected elements with keyboard navigation and screen-reader checks\. Confirm that labels, focus order, accessible names, instructions, and error states match the intended user flow/
  );
  assert.doesNotMatch(html, /Retained counts:/);
  assert.doesNotMatch(html, /representativeAxeExampleCount/);
});

test("ExecutiveSummaryCard hides evidence detail toggle when retained JSON would be metadata-only", () => {
  const html = renderToStaticMarkup(
    createElement(ExecutiveSummaryCard, {
      accessLimitationNotice: null,
      allFindings: [],
      beforeConsentCookieCount: 0,
      domainBenchmark: null,
      finalHost: "cnn.com",
      fingerprintReasons: [],
      fingerprintLabel: "None detected",
      fingerprintNarrative: "No strong fingerprinting signal surfaced.",
      landedOnDifferentHost: false,
      lastScannedAt: "2026-05-10T12:00:00.000Z",
      posture: "Action Needed",
      preConsentVendorNames: [],
      requestedHost: "cnn.com",
      resolvedVendorNames: [],
      score: 67,
      sessionReplayVendorNames: [],
      thirdPartyRequestCount: 9,
      thirdPartyDomains: [],
      topFindings: [
        makeFinding("consent_dark_patterns_detected", "Consent UX requires review", {
          shortSummary: "Consent UX requires review."
        })
      ],
      topObservedEntities: [],
      trackerSummary: "No third-party domains observed",
      unifiedFindings: [],
      unresolvedVendorHosts: [],
      vendorCategoryCounts: {}
    })
  );

  assert.match(html, /Retained consent-surface evidence showed choice-architecture signals/);
  assert.doesNotMatch(html, /Evidence details/);
  assert.doesNotMatch(html, /\{\} JSON evidence|>\{\}<\/pre>/);
});

test("ExecutiveSummaryCard omits top-finding regulatory context for unmapped findings", () => {
  const html = renderToStaticMarkup(
    createElement(ExecutiveSummaryCard, {
      accessLimitationNotice: null,
      allFindings: [],
      beforeConsentCookieCount: 0,
      domainBenchmark: null,
      finalHost: "example.com",
      fingerprintReasons: [],
      fingerprintLabel: "None detected",
      fingerprintNarrative: "No fingerprinting evidence detected.",
      landedOnDifferentHost: false,
      lastScannedAt: "2026-05-10T12:00:00.000Z",
      posture: "Clear",
      preConsentVendorNames: [],
      requestedHost: "example.com",
      resolvedVendorNames: [],
      score: 92,
      sessionReplayVendorNames: [],
      thirdPartyRequestCount: 0,
      thirdPartyDomains: [],
      topFindings: [
        makeFinding("bounded_key_page_discovery_unresolved" as CertScoreFinding["id"], "Unmapped diagnostic finding", {
          shortSummary: "Unmapped diagnostic finding."
        })
      ],
      topObservedEntities: [],
      trackerSummary: "No third-party domains observed",
      unifiedFindings: [],
      unresolvedVendorHosts: [],
      vendorCategoryCounts: {}
    })
  );

  assert.doesNotMatch(html, /Regulatory context/);
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

  assert.doesNotMatch(html, /13 third-party domains observed; 1 classified tracker vendor identified\./);
  assert.match(html, /Tracker footprint \(14\)/);
  assert.match(html, /1 vendor, 13 domains/);
  assert.doesNotMatch(html, /11 more\.\.\./);
  assert.doesNotMatch(html, /1 vendor names and 13 third-party domains/);
  assert.doesNotMatch(html, /ads 1/);
});

test("ExecutiveSummaryCard uses domain-only tracker expand copy when no classified vendors are present", () => {
  const html = renderToStaticMarkup(
    createElement(ExecutiveSummaryCard, {
      accessLimitationNotice: null,
      allFindings: [],
      beforeConsentCookieCount: 0,
      domainBenchmark: null,
      finalHost: "certscore.ai",
      fingerprintReasons: [],
      fingerprintLabel: "None detected",
      fingerprintNarrative: "No strong fingerprinting signal surfaced.",
      landedOnDifferentHost: false,
      lastScannedAt: "2026-05-10T12:00:00.000Z",
      posture: "Watch",
      preConsentVendorNames: [],
      requestedHost: "certscore.ai",
      resolvedVendorNames: [],
      score: 82,
      sessionReplayVendorNames: [],
      thirdPartyRequestCount: 1,
      thirdPartyDomains: ["static.cloudflareinsights.com"],
      topFindings: [],
      topObservedEntities: [],
      trackerSummary: "1 third-party domain observed",
      unifiedFindings: [],
      unresolvedVendorHosts: [],
      vendorCategoryCounts: {}
    })
  );

  assert.doesNotMatch(html, /1 third-party domain observed; no classified tracker vendors identified\./);
  assert.match(html, /Tracker footprint \(1\)/);
  assert.match(html, /0 vendors, 1 domain/);
  assert.doesNotMatch(html, /View observed vendors and domains/);
});

test("ExecutiveSummaryCard summarizes recognized and unknown consent platforms from retained snapshot evidence", () => {
  const recognizedHtml = renderToStaticMarkup(
    createElement(ExecutiveSummaryCard, {
      accessLimitationNotice: null,
      allFindings: [],
      beforeConsentCookieCount: 0,
      cmpVendorName: "OneTrust",
      cookieBannerPresent: true,
      domainBenchmark: null,
      finalHost: "example.com",
      fingerprintReasons: [],
      fingerprintLabel: "None detected",
      fingerprintNarrative: "No strong fingerprinting signal surfaced.",
      landedOnDifferentHost: false,
      lastScannedAt: "2026-05-10T12:00:00.000Z",
      posture: "Watch",
      preConsentVendorNames: [],
      requestedHost: "example.com",
      resolvedVendorNames: [],
      score: 82,
      sessionReplayVendorNames: [],
      thirdPartyRequestCount: 0,
      thirdPartyDomains: [],
      topFindings: [],
      topObservedEntities: [],
      trackerSummary: "No third-party domains observed",
      unifiedFindings: [],
      unresolvedVendorHosts: [],
      vendorCategoryCounts: {}
    })
  );
  const unknownHtml = renderToStaticMarkup(
    createElement(ExecutiveSummaryCard, {
      accessLimitationNotice: null,
      allFindings: [],
      beforeConsentCookieCount: 0,
      cookieBannerPresent: true,
      domainBenchmark: null,
      finalHost: "example.com",
      fingerprintReasons: [],
      fingerprintLabel: "None detected",
      fingerprintNarrative: "No strong fingerprinting signal surfaced.",
      landedOnDifferentHost: false,
      lastScannedAt: "2026-05-10T12:00:00.000Z",
      posture: "Watch",
      preConsentVendorNames: [],
      requestedHost: "example.com",
      resolvedVendorNames: [],
      score: 82,
      sessionReplayVendorNames: [],
      thirdPartyRequestCount: 0,
      thirdPartyDomains: [],
      topFindings: [],
      topObservedEntities: [],
      trackerSummary: "No third-party domains observed",
      unifiedFindings: [],
      unresolvedVendorHosts: [],
      vendorCategoryCounts: {}
    })
  );

  assert.match(recognizedHtml, /Consent platform/);
  assert.match(recognizedHtml, /OneTrust/);
  assert.match(recognizedHtml, /\/vendor-logos\/onetrust\.png/);
  assert.doesNotMatch(recognizedHtml, /CMP recognized from scan evidence/);
  assert.doesNotMatch(recognizedHtml, /recognized CMP/);
  assert.match(unknownHtml, /Unknown CMP \/ consent banner/);
  assert.doesNotMatch(unknownHtml, /Consent banner; CMP vendor not recognized/);
  assert.doesNotMatch(unknownHtml, /No working consent banner was retained for this scan/);
});

test("ExecutiveSummaryCard labels truncated observed domain lists", () => {
  const domains = Array.from({ length: 11 }, (_, index) => `observed-${index + 1}.example`);
  const html = renderToStaticMarkup(
    createElement(ExecutiveSummaryCard, {
      accessLimitationNotice: null,
      allFindings: [],
      beforeConsentCookieCount: 0,
      domainBenchmark: null,
      finalHost: "cnn.com",
      fingerprintReasons: [],
      fingerprintLabel: "None detected",
      fingerprintNarrative: "No strong fingerprinting signal surfaced.",
      landedOnDifferentHost: false,
      lastScannedAt: "2026-05-10T12:00:00.000Z",
      posture: "Watch",
      preConsentVendorNames: [],
      requestedHost: "cnn.com",
      resolvedVendorNames: [],
      score: 82,
      sessionReplayVendorNames: [],
      thirdPartyRequestCount: 9,
      thirdPartyDomains: domains,
      topFindings: [],
      topObservedEntities: [],
      trackerSummary: "11 third-party domains observed",
      unifiedFindings: [],
      unresolvedVendorHosts: [],
      vendorCategoryCounts: {}
    })
  );

  assert.doesNotMatch(html, /11 third-party domains observed; no classified tracker vendors identified\./);
  assert.match(html, /Tracker footprint \(11\)/);
  assert.match(html, /0 vendors, 11 domains/);
  assert.doesNotMatch(html, /8 more\.\.\./);
  assert.match(html, /observed-10\.example/);
  assert.match(html, /observed-11\.example/);
});

test("ExecutiveSummaryCard keeps vendor-and-domain tracker expand copy when classified vendors are present", () => {
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
      lastScannedAt: "2026-05-10T12:00:00.000Z",
      posture: "Watch",
      preConsentVendorNames: [],
      requestedHost: "example.com",
      resolvedVendorNames: ["Google Ads", "Microsoft Clarity"],
      score: 70,
      sessionReplayVendorNames: [],
      thirdPartyRequestCount: 3,
      thirdPartyDomains: ["googleadservices.com", "clarity.ms", "doubleclick.net"],
      topFindings: [],
      topObservedEntities: [],
      trackerSummary: "2 vendors across 3 third-party domains",
      unifiedFindings: [],
      unresolvedVendorHosts: [],
      vendorCategoryCounts: { ads: 1, analytics: 1 }
    })
  );

  assert.doesNotMatch(html, /3 third-party domains observed; 2 classified tracker vendors identified\./);
  assert.doesNotMatch(html, /View observed vendors and domains/);
  assert.doesNotMatch(html, /analytics 1/);
});

test("ExecutiveSummaryCard omits policy URL count summary across multiple disclosure types", () => {
  const html = renderToStaticMarkup(
    createElement(ExecutiveSummaryCard, {
      accessLimitationNotice: null,
      allFindings: [],
      beforeConsentCookieCount: 0,
      domainBenchmark: null,
      finalHost: "certscore.ai",
      fingerprintReasons: [],
      fingerprintLabel: "None detected",
      fingerprintNarrative: "No strong fingerprinting signal surfaced.",
      landedOnDifferentHost: false,
      lastScannedAt: "2026-05-10T12:00:00.000Z",
      policySurfaces: [
        { pageLabel: "Cookie policy", pageUrl: "https://certscore.ai/privacy", details: [] },
        { pageLabel: "Privacy policy", pageUrl: "https://certscore.ai/privacy", details: [] }
      ],
      posture: "Clear",
      preConsentVendorNames: [],
      requestedHost: "certscore.ai",
      resolvedVendorNames: [],
      score: 88,
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

  assert.doesNotMatch(html, /1 policy URL covered across cookie\/privacy disclosures/);
  assert.match(html, /Cookie policy/);
  assert.match(html, /Privacy policy/);
  assert.doesNotMatch(html, /1 surface URL covered/);
});

test("ExecutiveSummaryCard omits multiple covered policy URL summary", () => {
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
      lastScannedAt: "2026-05-10T12:00:00.000Z",
      policySurfaces: [
        { pageLabel: "Privacy policy", pageUrl: "https://example.com/privacy", details: [] },
        { pageLabel: "Cookie policy", pageUrl: "https://example.com/cookies", details: [] }
      ],
      posture: "Clear",
      preConsentVendorNames: [],
      requestedHost: "example.com",
      resolvedVendorNames: [],
      score: 88,
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

  assert.doesNotMatch(html, /2 policy URLs covered/);
  assert.match(html, /Privacy policy/);
  assert.match(html, /Cookie policy/);
  assert.doesNotMatch(html, /2 surface URLs covered/);
});

test("ExecutiveSummaryCard clarifies when disclosure labels share a policy URL", () => {
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
      lastScannedAt: "2026-05-10T12:00:00.000Z",
      policySurfaces: [
        { pageLabel: "Privacy policy", pageUrl: "https://example.com/privacy", details: [] },
        { pageLabel: "Terms of service", pageUrl: "https://example.com/terms", details: [] },
        { pageLabel: "Cookie policy", pageUrl: "https://example.com/privacy", details: [] }
      ],
      posture: "Clear",
      preConsentVendorNames: [],
      requestedHost: "example.com",
      resolvedVendorNames: [],
      score: 88,
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

  assert.doesNotMatch(html, /2 policy URLs covered across 3 disclosure types/);
  assert.match(html, /This URL is shared by Privacy policy and Cookie policy/);
});

test("ExecutiveSummaryCard renders accessibility-only self-scan copy without privacy overstatement", () => {
  const html = renderToStaticMarkup(
    createElement(ExecutiveSummaryCard, {
      accessLimitationNotice: null,
      accessibilitySignals: {
        accessibilityStatementPresent: true,
        wcagErrorCountTotal: 1
      },
      agencyMappings: [
        makeAgencyMapping({
          relevanceLevel: "limited",
          triggeredSignals: [{ key: "accessibility.representative_axe_examples", label: "Representative axe examples" }]
        })
      ],
      allFindings: [
        makeFinding("wcag_color_contrast_issue", "Visual contrast accessibility issue", {
          section: "Accessibility",
          severity: "medium"
        })
      ],
      beforeConsentCookieCount: 0,
      domainBenchmark: {
        confidence: "medium",
        estimatedRankLabel: "Typical",
        expectedCookiesBeforeConsent: 2,
        expectedOverallScore: 72,
        expectedThirdPartyRequests: 24,
        industry: "SaaS / web application",
        rationale: "Matched to a SaaS benchmark."
      },
      finalHost: "certscore.ai",
      fingerprintReasons: [],
      fingerprintLabel: "None detected",
      fingerprintNarrative: "No strong fingerprinting signal surfaced.",
      landedOnDifferentHost: false,
      lastScannedAt: "2026-05-10T12:00:00.000Z",
      posture: "Action Needed",
      preConsentVendorNames: [],
      requestedHost: "certscore.ai",
      resolvedVendorNames: [],
      score: 70,
      sessionReplayVendorNames: [],
      thirdPartyRequestCount: 1,
      thirdPartyDomains: ["static.cloudflareinsights.com"],
      topFindings: [
        makeFinding("wcag_color_contrast_issue", "Visual contrast accessibility issue", {
          section: "Accessibility",
          severity: "medium"
        })
      ],
      topObservedEntities: [],
      trackerSummary: "1 third-party domain observed",
      unifiedFindings: [],
      unresolvedVendorHosts: [],
      vendorCategoryCounts: {},
      verifiedPublicSurfacesCount: 1
    })
  );

  assert.doesNotMatch(html, /Accessibility issue detected/);
  assert.doesNotMatch(html, /Immediate privacy and consent issues detected/);
  assert.doesNotMatch(html, /Primary concerns:/);
  assert.match(
    html,
    /Review the affected elements with keyboard navigation and screen-reader checks\. Confirm that labels, focus order, accessible names, instructions, and error states match the intended user flow/
  );
  assert.doesNotMatch(html, /Next step: review affected text\/background color pairs/);
  assert.doesNotMatch(html, /Automated accessibility signals are the main review area\./);
  assert.doesNotMatch(html, /1 third-party domain observed; no classified tracker vendors identified\./);
  assert.match(html, /Tracker footprint \(1\)/);
  assert.match(html, /0 vendors, 1 domain/);
  assert.doesNotMatch(html, /View observed vendors and domains/);
  assert.equal(
    (html.match(/1 third-party domain observed; no classified tracker vendors identified\./g) ?? []).length,
    0
  );
  assert.doesNotMatch(
    html,
    /This score is near the SaaS \/ web application benchmark expectation, with retained review context concentrated in accessibility\./
  );
  assert.doesNotMatch(html, /This score is below the SaaS \/ web application benchmark expectation based on surfaced findings/);
  assert.doesNotMatch(html, />\{\}<\/pre>|JSON evidence/);
});

test("ExecutiveSummaryCard keeps regulatory cookie copy aligned with canonical classified counts when unified findings are present", () => {
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

  assert.doesNotMatch(html, /Consent and pre-consent tracking risk is the main issue\./);
  assert.doesNotMatch(html, /CCPA \/ CPRA/);
  assert.doesNotMatch(html, /<span class="block text-xl font-semibold tracking-tight text-slate-900">70<\/span>/);
  assert.doesNotMatch(html, /Third-party collection and disclosure posture drives this score\./);
  assert.doesNotMatch(html, /FTC/);
  assert.doesNotMatch(html, /Pre-consent tracking and third-party collection should be reviewed for consumer-protection context\./);
  assert.doesNotMatch(html, /64 cookie timing records were retained before consent; vendor\/category attribution was not retained\./);
  assert.doesNotMatch(html, /64 classified cookie records were observed before consent\./);
  assert.doesNotMatch(html, /64 cookies were observed before consent\./);
});

test("ExecutiveSummaryCard omits generic title icons from sensitive-data and accessibility top findings", () => {
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

  assert.match(html, /Sensitive input surface with third-party tracking context/);
  assert.match(html, /Automated accessibility issues observed/);
  assert.doesNotMatch(html, /data-finding-icon=/);
});

test("ExecutiveSummaryCard omits generic title icons across top findings with shared preferred icons", () => {
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

  assert.match(html, /Third-party tracking observed before recorded consent/);
  assert.match(html, /Non-essential tracking continued after reject/);
  assert.match(html, /CPRA opt-out missing for advertising sharing/);
  assert.doesNotMatch(html, /data-finding-icon=/);
});

test("ExecutiveSummaryCard omits generic title icons from accessibility and policy runtime findings", () => {
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

  assert.match(html, /Keyboard navigation accessibility issue/);
  assert.match(html, /Policy\/runtime behavior conflict/);
  assert.match(html, /Visual contrast accessibility issue/);
  assert.doesNotMatch(html, /data-finding-icon=/);
});

test("ExecutiveSummaryCard omits generic title icons across executive top finding ids", () => {
  const topFindings = [
    ...EXECUTIVE_SUMMARY_TOP_FINDING_IDS
      .filter((id) => id !== "scan_quality_visual_no_go")
      .map((id) => makeFinding(id, id, {
        section: id.includes("accessibility") || id.includes("keyboard") || id.includes("contrast") || id.includes("focus") || id.includes("semantic") || id.includes("alternative")
          ? "Accessibility"
          : "Privacy & Tracking"
      })),
    makeFinding("policy_clarity_risk", "Disclosure clarity remains weak")
  ];
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
      topFindings,
      topObservedEntities: [],
      trackerSummary: "1 vendor across 1 third-party domain",
      unresolvedVendorHosts: [],
      vendorCategoryCounts: { ads: 1 }
    })
  );

  assert.match(html, /Disclosure clarity remains weak/);
  assert.doesNotMatch(html, /data-finding-icon=/);
  assert.doesNotMatch(html, /default-circle/);
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

  assert.doesNotMatch(html, /Primary concerns:/);
  assert.match(html, /High-priority issues/);
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

  assert.doesNotMatch(html, /Limited scan coverage surfaced possible homepage privacy concerns/);
  assert.doesNotMatch(html, /Coverage note:/);
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

  assert.doesNotMatch(html, /Limited scan coverage surfaced possible homepage privacy concerns/);
  assert.doesNotMatch(html, /Coverage note:/);
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

  assert.doesNotMatch(html, /Limited scan coverage surfaced possible homepage privacy concerns/);
  assert.doesNotMatch(html, /Coverage note:/);
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

  assert.doesNotMatch(html, /Limited scan coverage surfaced possible financial-claims concerns/);
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

  assert.doesNotMatch(html, /Requested domain resolved to a different host during this scan/);
  assert.doesNotMatch(html, /Scope note:/);
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
  assert.doesNotMatch(html, /Scan limitation:/);
  assert.match(html, /Scan not representative/);
  assert.match(html, /Scores, regulatory projections, and substantive findings are withheld for this scan/);
  assert.match(html, /Report status/);
  assert.match(html, /Not scored/);
  assert.doesNotMatch(html, /Score note:/);
  assert.doesNotMatch(html, /Top findings/);
  assert.doesNotMatch(html, /Access limitation/);
  assert.doesNotMatch(html, /This run was blocked before it established a trustworthy public browsing path/);
  assert.doesNotMatch(html, /Regulatory findings/);
  assert.doesNotMatch(html, /Review lenses/);
});
