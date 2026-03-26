import assert from "node:assert/strict";
import test from "node:test";
import {
  buildUnifiedFindingDisplayPackets,
  buildUnifiedFindingPackets,
  getUnifiedFindingCategoryRelation,
  getUnifiedFindingOwnerCategoryId,
  type UnifiedFindingCandidate
} from "./unified-findings";
import type { ScanValidationFinding } from "./validation-review-linking";

function makeValidationFinding(
  input: Partial<ScanValidationFinding> & Pick<ScanValidationFinding, "id" | "ruleKey" | "title">
): ScanValidationFinding {
  return {
    agreementScore: null,
    category: null,
    description: null,
    evidence: null,
    findingFamily: null,
    findingScope: null,
    findingSource: null,
    findingSubject: null,
    model: null,
    modelConfidence: null,
    pageUrl: null,
    promptVersion: null,
    rationale: null,
    severity: null,
    subtype: null,
    systemConfidenceBand: null,
    systemConfidenceExplanation: null,
    systemConfidenceScore: null,
    verdict: null,
    ...input
  };
}

test("collapses signal, issue, and validation sources into one unified finding packet", () => {
  const linkedValidation = makeValidationFinding({
    id: "val-1",
    ruleKey: "privacy.trackers_before_consent_detected",
    severity: "high",
    title: "Trackers observed before consent"
  });

  const candidates: UnifiedFindingCandidate[] = [
    {
      description: "Observed before a clear user choice was made.",
      fallbackEvidence: {
        signalKey: "privacy.preconsent_tracking_detected",
        signalValue: true
      },
      linkedValidationFinding: linkedValidation,
      observedValue: "Yes",
      severity: "high",
      signalKey: "privacy.preconsent_tracking_detected",
      signalLabel: "Pre-consent tracking detected",
      signalSource: "snapshot_signal",
      sourceType: "signal",
      title: "Pre-consent tracking detected"
    },
    {
      description: "The first page render triggered tracking activity before a consent interaction was completed.",
      evidence: ["https://example.com/collect"],
      observedValue: "high severity",
      severity: "high",
      sourceType: "issue",
      title: "Trackers fired before consent interaction"
    }
  ];

  const packets = buildUnifiedFindingPackets({
    reviewFindingCandidates: candidates,
    validationFindings: [linkedValidation]
  });

  assert.equal(packets.length, 1);
  assert.equal(packets[0]?.unifiedFindingId, "preconsent_tracking");
  assert.equal(packets[0]?.severity, "high");
  assert.equal(packets[0]?.confidenceBand, "high");
  assert.ok(packets[0]?.sourceRefs.some((row) => row.kind === "signal"));
  assert.ok(packets[0]?.sourceRefs.some((row) => row.kind === "issue"));
  assert.ok(packets[0]?.sourceRefs.some((row) => row.kind === "validation"));
  assert.equal(packets[0]?.confidenceInputs.validationCount, 1);
  assert.equal(packets[0]?.confidenceInputs.hasStructuredValidationEvidence, true);
  assert.equal(packets[0]?.confidenceInputs.hasDirectRuntimeEvidence, false);
  assert.deepEqual(
    packets[0]?.concernContext?.originTypes.sort(),
    ["compatibility_signal", "snapshot_signal", "validation_rule"]
  );
  assert.ok(packets[0]?.concernContext?.assertionLevels.includes("moderate"));
});

test("resolves validation-backed unified findings without a direct signal candidate", () => {
  const validationFinding = makeValidationFinding({
    id: "val-2",
    description: "No transfer mechanism was noted in the policy text.",
    ruleKey: "section_review.no_transfer_mechanism_noted",
    severity: "medium",
    title: "No transfer mechanism noted"
  });

  const packets = buildUnifiedFindingPackets({
    reviewFindingCandidates: [],
    validationFindings: [validationFinding]
  });

  assert.equal(packets.length, 1);
  assert.equal(packets[0]?.unifiedFindingId, "missing_transfer_disclosure");
  assert.equal(packets[0]?.severity, "medium");
  assert.equal(packets[0]?.confidenceBand, "high");
  assert.equal(packets[0]?.confidenceInputs.validationCount, 1);
});

test("resolves financial-review validation findings into the matching unified finding packet", () => {
  const validationFinding = makeValidationFinding({
    id: "val-fin-1",
    description: "The scan retained explicit fee disclosure text on a public-facing pricing or offer page.",
    evidence: {
      financialJudgeVerdict: {
        buyerFacingEligible: false,
        confidence: 0.58,
        evidenceStrength: "moderate",
        rationaleCode: "thin_single_source_evidence",
        retained: true,
        verdict: "keep_audit_only"
      },
      matchedPhrase: "monthly fee",
      matchedSnippet: "A monthly fee of $25 applies to premium managed accounts.",
      pageClassification: "pricing_or_fees",
      pageType: "pricing_page",
      pageUrl: "https://www.example.com/pricing",
      policySnippets: ["A monthly fee of $25 applies to premium managed accounts."],
      signalKey: "commercial.explicit_fee_disclosure_text_present",
      sourceUrls: ["https://www.example.com/pricing"],
      supportingSignals: ["commercial.explicit_fee_disclosure_text_present"],
      unifiedFindingId: "fee_disclosure_present"
    },
    pageUrl: "https://www.example.com/pricing",
    ruleKey: "financial_review.fee_disclosure_present",
    severity: "medium",
    title: "Fee disclosure present",
    verdict: "inconclusive"
  });

  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [],
    validationFindings: [validationFinding],
    validationFindingLookup: new Map([[validationFinding.ruleKey, validationFinding]])
  });

  assert.equal(packet?.unifiedFindingId, "fee_disclosure_present");
  assert.equal(packet?.linkedValidationFinding?.ruleKey, "financial_review.fee_disclosure_present");
  assert.equal(packet?.presentationDecision.status, "audit_only");
});

test("surfaces privacy-control unified findings from finding-family packets before legacy signal reconstruction", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [],
    scanEvents: [
      {
        eventType: "runtime.build_phase_diagnostic",
        metadataJson: {
          phase: "finding_family_packets",
          packets: [
            {
              familyId: "privacy_controls",
              canonicalTargets: [
                {
                  canonicalUrl: "https://www.example.com/privacy-center",
                  snippet: "Manage Cookies and Your Privacy Choices",
                  supportedSurfaceTypes: ["cookie_policy_or_settings", "privacy_choices"],
                  title: "Privacy Center"
                }
              ],
              supportedUnifiedFindings: [
                {
                  evidenceUrls: ["https://www.example.com/privacy-center"],
                  findingId: "cookie_policy_present",
                  reason: "Verified privacy-controls evidence includes cookie policy or settings language.",
                  sourceSurfaceTypes: ["cookie_policy_or_settings"]
                },
                {
                  evidenceUrls: ["https://www.example.com/privacy-center"],
                  findingId: "targeted_advertising_choices_present",
                  reason: "Verified privacy-controls evidence includes privacy choices or opt-out language.",
                  sourceSurfaceTypes: ["privacy_choices"]
                }
              ]
            }
          ]
        }
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  const cookiePacket = packets.find((packet) => packet.unifiedFindingId === "cookie_policy_present");
  const choicesPacket = packets.find((packet) => packet.unifiedFindingId === "targeted_advertising_choices_present");

  assert.ok(cookiePacket);
  assert.ok(choicesPacket);
  assert.equal(cookiePacket?.primaryPageUrl, "https://www.example.com/privacy-center");
  assert.equal(choicesPacket?.primaryPageUrl, "https://www.example.com/privacy-center");
  assert.equal(cookiePacket?.presentationDecision.status, "surface");
  assert.equal(choicesPacket?.presentationDecision.status, "surface");
  assert.ok(cookiePacket?.evidence?.snippets?.includes("Manage Cookies and Your Privacy Choices"));
  assert.ok(choicesPacket?.evidence?.snippets?.includes("Manage Cookies and Your Privacy Choices"));
});

test("prefers family-packet candidates over legacy signal candidates for the same packetized finding", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "Legacy signal-based cookie policy finding.",
        fallbackEvidence: {
          pageUrl: "https://www.example.com/legacy-cookie",
          policyPageType: "cookie_policy",
          signalKey: "disclosure.cookie_policy_present",
          signalValue: true
        },
        linkedValidationFinding: null,
        observedValue: "Legacy Cookie Policy",
        severity: "medium",
        signalKey: "disclosure.cookie_policy_present",
        signalLabel: "Cookie policy present",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Cookie Policy"
      }
    ],
    scanEvents: [
      {
        eventType: "runtime.build_phase_diagnostic",
        metadataJson: {
          phase: "finding_family_packets",
          packets: [
            {
              familyId: "privacy_controls",
              canonicalTargets: [
                {
                  canonicalUrl: "https://www.example.com/privacy-center",
                  snippet: "Manage Cookies and Your Privacy Choices",
                  supportedSurfaceTypes: ["cookie_policy_or_settings"],
                  title: "Privacy Center"
                }
              ],
              supportedUnifiedFindings: [
                {
                  evidenceUrls: ["https://www.example.com/privacy-center"],
                  findingId: "cookie_policy_present",
                  reason: "Verified privacy-controls evidence includes cookie policy or settings language.",
                  sourceSurfaceTypes: ["cookie_policy_or_settings"]
                }
              ]
            }
          ]
        }
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  const cookiePacket = packets.find((packet) => packet.unifiedFindingId === "cookie_policy_present");

  assert.ok(cookiePacket);
  assert.equal(cookiePacket?.primaryPageUrl, "https://www.example.com/privacy-center");
  assert.equal(cookiePacket?.sourceRefs.some((sourceRef) => sourceRef.kind === "signal"), false);
  assert.ok(cookiePacket?.evidence?.pageUrls?.includes("https://www.example.com/privacy-center"));
  assert.equal(cookiePacket?.evidence?.pageUrls?.includes("https://www.example.com/legacy-cookie"), false);
});

test("surfaces privacy-rights unified findings from finding-family packets", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [],
    scanEvents: [
      {
        eventType: "runtime.build_phase_diagnostic",
        metadataJson: {
          phase: "finding_family_packets",
          packets: [
            {
              familyId: "privacy_controls",
              canonicalTargets: [
                {
                  canonicalUrl: "https://www.example.com/privacy-center",
                  snippet: "You may request access to, deletion of, or correction of your personal information.",
                  supportedSurfaceTypes: ["privacy_rights_dsar"],
                  title: "Privacy Center"
                }
              ],
              supportedUnifiedFindings: [
                {
                  evidenceUrls: ["https://www.example.com/privacy-center"],
                  findingId: "privacy_rights_path_present",
                  reason: "Verified privacy-controls evidence includes rights-request language.",
                  sourceSurfaceTypes: ["privacy_rights_dsar"]
                }
              ]
            }
          ]
        }
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  const rightsPacket = packets.find((packet) => packet.unifiedFindingId === "privacy_rights_path_present");

  assert.ok(rightsPacket);
  assert.equal(rightsPacket?.primaryPageUrl, "https://www.example.com/privacy-center");
  assert.equal(rightsPacket?.presentationDecision.status, "surface");
  assert.ok(
    rightsPacket?.evidence?.snippets?.includes(
      "You may request access to, deletion of, or correction of your personal information."
    )
  );
});

test("sanitizes packet-backed privacy-rights evidence to prefer canonical non-root urls", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [],
    scanEvents: [
      {
        eventType: "runtime.build_phase_diagnostic",
        metadataJson: {
          phase: "finding_family_packets",
          packets: [
            {
              familyId: "privacy_controls",
              canonicalTargets: [
                {
                  canonicalUrl: "https://www.example.com/privacy-center/rights",
                  snippet: "Submit a rights request here.",
                  supportedSurfaceTypes: ["privacy_rights_dsar"],
                  supportingRefs: [
                    { url: "https://www.example.com/", refType: "link_text", text: "Privacy", verified: true },
                    {
                      url: "https://privacyportal.onetrust.com/webform/abc",
                      refType: "link_text",
                      text: "Request Form",
                      verified: true
                    }
                  ],
                  title: "Privacy Rights Center"
                }
              ],
              supportedUnifiedFindings: [
                {
                  evidenceUrls: ["https://www.example.com/privacy-center/rights"],
                  findingId: "privacy_rights_path_present",
                  reason: "Verified privacy-controls evidence includes rights-request language.",
                  sourceSurfaceTypes: ["privacy_rights_dsar"]
                }
              ]
            }
          ]
        }
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  const rightsPacket = packets.find((packet) => packet.unifiedFindingId === "privacy_rights_path_present");

  assert.ok(rightsPacket);
  assert.deepEqual(rightsPacket?.evidence?.pageUrls, ["https://www.example.com/privacy-center/rights"]);
  assert.deepEqual(rightsPacket?.evidence?.sourceUrls, ["https://www.example.com/privacy-center/rights"]);
});

test("surfaces children-privacy unified findings from finding-family packets", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [],
    scanEvents: [
      {
        eventType: "runtime.build_phase_diagnostic",
        metadataJson: {
          phase: "finding_family_packets",
          packets: [
            {
              familyId: "sensitive_context",
              canonicalTargets: [
                {
                  canonicalUrl: "https://www.example.com/privacy-for-children",
                  snippet: "We do not knowingly collect personal information from children under 13.",
                  supportedSurfaceTypes: ["children_privacy"],
                  title: "Children's Privacy Notice"
                }
              ],
              supportedUnifiedFindings: [
                {
                  evidenceUrls: ["https://www.example.com/privacy-for-children"],
                  findingId: "children_privacy_disclosure_present",
                  reason: "Verified sensitive-context evidence includes explicit children's privacy or under-13 disclosure language.",
                  sourceSurfaceTypes: ["children_privacy"]
                }
              ]
            }
          ]
        }
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  const packet = packets.find((entry) => entry.unifiedFindingId === "children_privacy_disclosure_present");

  assert.ok(packet);
  assert.equal(packet?.primaryPageUrl, "https://www.example.com/privacy-for-children");
  assert.equal(packet?.presentationDecision.status, "surface");
  assert.deepEqual(packet?.evidence?.pageUrls, ["https://www.example.com/privacy-for-children"]);
  assert.ok(packet?.evidence?.snippets?.includes("We do not knowingly collect personal information from children under 13."));
});

test("surfaces GPC failures from runtime privacy family packets", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [],
    scanEvents: [
      {
        eventType: "runtime.build_phase_diagnostic",
        metadataJson: {
          phase: "finding_family_packets",
          packets: [
            {
              familyId: "runtime_privacy_observability",
              canonicalTargets: [],
              supportedUnifiedFindings: [
                {
                  evidencePayload: {
                    gpcVerification: {
                      status: "ignored",
                      baselineTrackerCount: 3,
                      baselineThirdPartyCookieCount: 4,
                      gpcTrackerCount: 3,
                      gpcThirdPartyCookieCount: 4,
                      trackerCountDelta: 0,
                      thirdPartyCookieCountDelta: 0,
                      evidenceUrls: ["https://example.com/collect"]
                    },
                    sourceUrls: ["https://example.com/collect"]
                  },
                  evidenceUrls: ["https://example.com/collect"],
                  findingId: "gpc_signal_not_honored",
                  reason: "Runtime privacy observability retained a browser-level GPC verification result showing the signal was ignored.",
                  sourceSurfaceTypes: []
                }
              ]
            }
          ]
        }
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "gpc_signal_not_honored");
  assert.equal(packet?.confidenceInputs.hasDirectRuntimeEvidence, true);
  assert.equal(packet?.presentationDecision.status, "surface");
  assert.deepEqual(packet?.evidence?.sourceUrls, ["https://example.com/collect"]);
  assert.equal(packet?.evidence?.counts?.gpcTrackerCount, 3);
});

test("surfaces support-access unified findings from finding-family packets", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [],
    scanEvents: [
      {
        eventType: "runtime.build_phase_diagnostic",
        metadataJson: {
          phase: "finding_family_packets",
          packets: [
            {
              familyId: "support_access",
              canonicalTargets: [
                {
                  canonicalUrl: "https://www.example.com/help",
                  snippet: "Help Center and Accessibility Support",
                  supportedSurfaceTypes: ["contact_support", "accessibility_support"],
                  title: "Help Center"
                }
              ],
              supportedUnifiedFindings: [
                {
                  evidenceUrls: ["https://www.example.com/help"],
                  findingId: "contact_support_path_present",
                  reason: "Verified support-access evidence includes help, contact, or feedback language.",
                  sourceSurfaceTypes: ["contact_support"]
                },
                {
                  evidenceUrls: ["https://www.example.com/help"],
                  findingId: "accessibility_support_path_present",
                  reason: "Verified support-access evidence includes accessibility, captioning, or accommodation language.",
                  sourceSurfaceTypes: ["accessibility_support"]
                }
              ]
            }
          ]
        }
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  const contactPacket = packets.find((packet) => packet.unifiedFindingId === "contact_support_path_present");
  const accessibilityPacket = packets.find((packet) => packet.unifiedFindingId === "accessibility_support_path_present");

  assert.ok(contactPacket);
  assert.ok(accessibilityPacket);
  assert.equal(contactPacket?.primaryPageUrl, "https://www.example.com/help");
  assert.equal(accessibilityPacket?.primaryPageUrl, "https://www.example.com/help");
  assert.equal(contactPacket?.presentationDecision.status, "surface");
  assert.equal(accessibilityPacket?.presentationDecision.status, "surface");
  assert.ok(contactPacket?.evidence?.snippets?.includes("Help Center and Accessibility Support"));
  assert.ok(accessibilityPacket?.evidence?.snippets?.includes("Help Center and Accessibility Support"));
});

test("surfaces legal-core unified findings from finding-family packets", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [],
    scanEvents: [
      {
        eventType: "runtime.build_phase_diagnostic",
        metadataJson: {
          phase: "finding_family_packets",
          packets: [
            {
              familyId: "legal_core",
              canonicalTargets: [
                {
                  canonicalUrl: "https://www.example.com/privacy",
                  snippet: "Privacy Policy",
                  supportedSurfaceTypes: ["privacy_policy"],
                  title: "Privacy Policy"
                },
                {
                  canonicalUrl: "https://www.example.com/terms",
                  snippet: "Terms and Conditions",
                  supportedSurfaceTypes: ["terms_of_service"],
                  title: "Terms and Conditions"
                }
              ],
              supportedUnifiedFindings: [
                {
                  evidenceUrls: ["https://www.example.com/privacy"],
                  findingId: "privacy_policy_present",
                  reason: "Verified legal-core evidence includes a privacy policy or privacy notice surface.",
                  sourceSurfaceTypes: ["privacy_policy"]
                },
                {
                  evidenceUrls: ["https://www.example.com/terms"],
                  findingId: "terms_of_service_present",
                  reason: "Verified legal-core evidence includes a terms of service or terms and conditions surface.",
                  sourceSurfaceTypes: ["terms_of_service"]
                }
              ]
            }
          ]
        }
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  const privacyPacket = packets.find((packet) => packet.unifiedFindingId === "privacy_policy_present");
  const termsPacket = packets.find((packet) => packet.unifiedFindingId === "terms_of_service_present");

  assert.ok(privacyPacket);
  assert.ok(termsPacket);
  assert.equal(privacyPacket?.primaryPageUrl, "https://www.example.com/privacy");
  assert.equal(termsPacket?.primaryPageUrl, "https://www.example.com/terms");
  assert.equal(privacyPacket?.presentationDecision.status, "surface");
  assert.equal(termsPacket?.presentationDecision.status, "surface");
  assert.ok(privacyPacket?.evidence?.snippets?.includes("Privacy Policy"));
  assert.ok(termsPacket?.evidence?.snippets?.includes("Terms and Conditions"));
});

test("surfaces commerce-disclosure unified findings from finding-family packets", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [],
    scanEvents: [
      {
        eventType: "runtime.build_phase_diagnostic",
        metadataJson: {
          phase: "finding_family_packets",
          packets: [
            {
              familyId: "commerce_disclosures",
              canonicalTargets: [
                {
                  canonicalUrl: "https://www.example.com/affiliate-policy",
                  snippet: "We may earn a commission from affiliate links.",
                  supportedSurfaceTypes: ["affiliate_disclosure"],
                  title: "Affiliate Policy"
                },
                {
                  canonicalUrl: "https://www.example.com/ads",
                  snippet: "Sponsored content and advertising partners are disclosed here.",
                  supportedSurfaceTypes: ["advertising_disclosure"],
                  title: "Advertising Disclosure"
                }
              ],
              supportedUnifiedFindings: [
                {
                  evidenceUrls: ["https://www.example.com/affiliate-policy"],
                  findingId: "affiliate_disclosure_present",
                  reason: "Verified commerce-disclosure evidence includes affiliate, partner, commission, or 'we may earn' language.",
                  sourceSurfaceTypes: ["affiliate_disclosure"]
                },
                {
                  evidenceUrls: ["https://www.example.com/ads"],
                  findingId: "third_party_advertising_disclosure_present",
                  reason: "Verified commerce-disclosure evidence includes explicit advertising, ad-partner, or sponsored language.",
                  sourceSurfaceTypes: ["advertising_disclosure"]
                }
              ]
            }
          ]
        }
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  const affiliatePacket = packets.find((packet) => packet.unifiedFindingId === "affiliate_disclosure_present");
  const adsPacket = packets.find((packet) => packet.unifiedFindingId === "third_party_advertising_disclosure_present");

  assert.ok(affiliatePacket);
  assert.ok(adsPacket);
  assert.equal(affiliatePacket?.primaryPageUrl, "https://www.example.com/affiliate-policy");
  assert.equal(adsPacket?.primaryPageUrl, "https://www.example.com/ads");
  assert.equal(affiliatePacket?.presentationDecision.status, "surface");
  assert.equal(adsPacket?.presentationDecision.status, "surface");
  assert.ok(affiliatePacket?.evidence?.snippets?.includes("We may earn a commission from affiliate links."));
  assert.ok(adsPacket?.evidence?.snippets?.includes("Sponsored content and advertising partners are disclosed here."));
});

test("keeps key-page discovery context on coverage-gap packets", () => {
  const packets = buildUnifiedFindingPackets({
    reviewFindingCandidates: [
      {
        description: "A key disclosure or support page was detected, but its target URL could not be fetched successfully.",
        fallbackEvidence: {
          keyPageAttemptCount: 3,
          keyPageAttemptedUrls: [
            "https://example.com/cookie-policy",
            "https://example.com/privacy/cookies"
          ],
          keyPageDiscoverySource: "footer_link",
          keyPageGuessedOnly: false,
          keyPageStopReason: "http_error",
          signalKey: "disclosure.cookie_policy_fetch_failed",
          signalValue: true
        },
        observedValue: "Cookie Policy",
        severity: "medium",
        signalKey: "disclosure.cookie_policy_fetch_failed",
        signalLabel: "Cookie policy unavailable",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Cookie policy unavailable"
      }
    ],
    validationFindings: []
  });

  assert.equal(packets[0]?.details?.family, "coverage_gap");
  assert.equal(packets[0]?.details?.pageType, "cookie_policy");
  assert.equal(packets[0]?.details?.attemptCount, 3);
  assert.deepEqual(packets[0]?.details?.attemptedUrls, [
    "https://example.com/cookie-policy",
    "https://example.com/privacy/cookies"
  ]);
  assert.equal(packets[0]?.confidenceInputs.hasKeyPageDiscoveryEvidence, true);
  assert.equal(packets[0]?.confidenceInputs.isFallbackOnly, true);
  assert.equal(packets[0]?.confidenceBand, "low");
});

test("marks fallback-only low-confidence packets as audit-only and refines coverage copy", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "A key disclosure or support page was detected, but its target URL could not be fetched successfully.",
        fallbackEvidence: {
          keyPageAttemptCount: 2,
          keyPageAttemptedUrls: ["https://example.com/cookie-policy"],
          signalKey: "disclosure.cookie_policy_fetch_failed",
          signalValue: true
        },
        observedValue: "Cookie Policy",
        severity: "medium",
        signalKey: "disclosure.cookie_policy_fetch_failed",
        signalLabel: "Cookie policy unavailable",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Cookie policy unavailable"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.presentationDecision.status, "suppress");
  assert.match(packet?.presentationDecision.rationale ?? "", /not tied to a strong confirmed linked target/i);
  assert.match(packet?.presentation.suggestedFix ?? "", /repair the cookie policy url/i);
});

test("exposes owner and mirror category relations on unified finding packets", () => {
  const validationFinding = makeValidationFinding({
    id: "val-3",
    ruleKey: "section_review.session_replay_detected_without_disclosure",
    severity: "high",
    title: "Possible undisclosed session replay"
  });

  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [],
    validationFindings: [validationFinding],
    validationFindingLookup: new Map([[validationFinding.ruleKey, validationFinding]])
  });

  assert.equal(packet?.unifiedFindingId, "session_replay_undisclosed");
  assert.equal(getUnifiedFindingOwnerCategoryId(packet!), "policy_to_behavior_contradictions");
  assert.equal(getUnifiedFindingCategoryRelation(packet!, "adtech_analytics_replay_footprint"), "mirror");
  assert.equal(packet?.confidenceInputs.validationCount, 1);
  assert.equal(packet?.confidenceInputs.hasStructuredValidationEvidence, true);
});

test("rolls structured validation evidence into unified finding packets", () => {
  const validationFinding = makeValidationFinding({
    id: "val-4",
    ruleKey: "privacy.session_replay_without_disclosure_detected",
    severity: "high",
    title: "Possible undisclosed session replay",
    evidence: {
      claim: "Policy does not clearly disclose session replay.",
      pageUrl: "https://example.com/privacy",
      relatedVendors: ["Microsoft Clarity"],
      runtimeEvidence: ["Replay script observed during homepage load"],
      supportingSignals: ["session replay tool detected"]
    }
  });

  const [packet] = buildUnifiedFindingPackets({
    reviewFindingCandidates: [],
    validationFindings: [validationFinding]
  });

  assert.equal(packet?.unifiedFindingId, "session_replay_undisclosed");
  assert.deepEqual(packet?.evidence?.pageUrls, ["https://example.com/privacy"]);
  assert.equal(packet?.primaryPageUrl, "https://example.com/privacy");
  assert.equal(packet?.affectedPageCount, 1);
  assert.deepEqual(packet?.evidence?.entities?.relatedVendors, ["Microsoft Clarity"]);
  assert.ok(packet?.evidence?.snippets?.includes("Replay script observed during homepage load"));
  assert.equal(packet?.confidenceInputs.hasDirectRuntimeEvidence, true);
  assert.equal(packet?.confidenceInputs.hasPageAttribution, true);
  assert.equal(packet?.confidenceInputs.hasPolicyTextEvidence, true);
  assert.equal(packet?.confidenceBand, "high");
});

test("treats concrete payload evidence as a confidence booster for sensitive-data findings", () => {
  const [packet] = buildUnifiedFindingPackets({
    reviewFindingCandidates: [
      {
        description: "Scanner-derived risk indicator is elevated.",
        fallbackEvidence: {
          sensitivePayloadViolations: [
            {
              detectedType: "postal_code_detected",
              evidenceStrength: "suspected",
              requestMethod: "POST",
              requestUrl: "https://tracker.example.net/collect"
            }
          ],
          signalKey: "commerce.high_sensitivity_data_collection_detected",
          signalValue: true
        },
        observedValue: "Yes",
        severity: "high",
        signalKey: "commerce.high_sensitivity_data_collection_detected",
        signalLabel: "High-sensitivity data collection detected",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "High-sensitivity data collection detected"
      }
    ],
    validationFindings: []
  });

  assert.equal(packet?.unifiedFindingId, "high_sensitivity_data_collection");
  assert.equal(packet?.confidenceInputs.hasConcretePayloadEvidence, true);
  assert.equal(packet?.confidenceBand, "high");
});

test("keeps the unified finding name canonical even when validation titles add judgment language", () => {
  const validationFinding = makeValidationFinding({
    id: "val-5",
    ruleKey: "scan_signal.privacy.policy_runtime_functional_misalignment_detected",
    severity: "high",
    title: "High-confidence functional misalignment"
  });

  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [],
    validationFindings: [validationFinding],
    validationFindingLookup: new Map([[validationFinding.ruleKey, validationFinding]])
  });

  assert.equal(packet?.unifiedFindingId, "functional_misalignment");
  assert.equal(packet?.title, "Functional misalignment");
  assert.equal(packet?.presentation.findingName, "Functional misalignment");
});

test("suppresses generic policy-behavior conflicts when a more specific contradiction is present", () => {
  const validationFinding = makeValidationFinding({
    id: "val-7",
    ruleKey: "privacy.session_replay_without_disclosure_detected",
    severity: "high",
    title: "Possible undisclosed session replay",
    evidence: {
      claim: "Policy does not clearly disclose replay tooling.",
      relatedVendors: ["Microsoft Clarity"],
      runtimeEvidence: ["Replay script observed during homepage load"]
    }
  });

  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "Observed runtime behavior appears to conflict with policy representations.",
        observedValue: "Yes",
        severity: "high",
        signalKey: "context.policy_behavior_conflict_detected",
        signalLabel: "Policy/behavior conflict detected",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Policy/behavior conflict detected"
      },
      {
        description: "Runtime replay evidence was observed without a matching disclosure.",
        linkedValidationFinding: validationFinding,
        observedValue: "Yes",
        severity: "high",
        signalKey: "context.session_replay_without_disclosure_detected",
        signalLabel: "Session replay without disclosure detected",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Possible undisclosed session replay"
      }
    ],
    validationFindings: [validationFinding],
    validationFindingLookup: new Map([[validationFinding.ruleKey, validationFinding]])
  });

  const genericPacket = packets.find((packet) => packet.unifiedFindingId === "policy_behavior_conflict");
  const specificPacket = packets.find((packet) => packet.unifiedFindingId === "session_replay_undisclosed");

  assert.equal(genericPacket?.presentationDecision.status, "audit_only");
  assert.equal(specificPacket?.presentationDecision.status, "surface");
});

test("retains both policy-side and runtime-side evidence on contradiction issue findings", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "Observed adtech vendors include Google Ads.",
        fallbackEvidence: {
          claim: "Observed runtime behavior appears to conflict with policy representations about tracking or third-party data use.",
          pageUrl: "https://www.example.com/privacy",
          policySummaryShort: "We describe advertising, pixels, and related privacy controls in the privacy policy.",
          relatedVendors: ["Google Ads", "Meta Pixel"],
          runtimeVendors: ["Google Ads", "Meta Pixel"],
          sourceUrls: ["https://www.example.com/privacy"],
          supportingSignals: ["policy_behavior_conflict_candidate"]
        },
        observedValue: "Observed adtech vendors include Google Ads.",
        severity: "high",
        sourceType: "issue",
        title: "Policy/behavior conflict detected"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "policy_behavior_conflict");
  assert.equal(packet?.presentationDecision.status, "surface");
  assert.equal(packet?.details?.family, "contradiction");
  assert.equal(packet?.details?.claim, "Observed runtime behavior appears to conflict with policy representations about tracking or third-party data use.");
  assert.equal(packet?.details?.policySourceUrl, "https://www.example.com/privacy");
  assert.deepEqual(packet?.details?.runtimeEvidenceArtifacts, ["Google Ads", "Meta Pixel"]);
  assert.deepEqual(packet?.evidence?.entities?.relatedVendors, ["Google Ads", "Meta Pixel"]);
  assert.deepEqual(packet?.evidence?.sourceUrls, ["https://www.example.com/privacy"]);
  assert.match((packet?.evidence?.snippets ?? []).join(" "), /privacy policy/i);
});

test("prefers structured contradiction evidence bundles over loose fallback fields", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "Observed replay tooling during the homepage session.",
        fallbackEvidence: {
          claim: "stale claim",
          contradictionEvidence: {
            claim: "Policy does not clearly disclose replay tooling.",
            policySnippet: "Policy does not clearly disclose replay tooling.",
            policySourceUrl: "https://www.example.com/privacy",
            policySummaryShort: "We describe our privacy controls in the privacy policy.",
            relatedVendors: ["Microsoft Clarity"],
            runtimeEvidenceArtifacts: ["Replay script observed during homepage load"],
            runtimeSummary: "Observed replay tooling during the homepage session.",
            runtimeVendors: ["Microsoft Clarity"],
            sourceUrls: ["https://www.example.com/privacy"],
            supportingSignals: ["session replay tool detected"]
          },
          relatedVendors: ["Some Other Vendor"]
        },
        observedValue: "Observed replay tooling during the homepage session.",
        severity: "high",
        sourceType: "issue",
        title: "Policy/behavior conflict detected"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.details?.family, "contradiction");
  assert.equal(packet?.details?.claim, "Policy does not clearly disclose replay tooling.");
  assert.deepEqual(packet?.details?.vendors, ["Microsoft Clarity"]);
  assert.deepEqual(packet?.details?.runtimeEvidenceArtifacts, ["Replay script observed during homepage load"]);
  assert.deepEqual(packet?.evidence?.entities?.runtimeVendors, ["Microsoft Clarity"]);
  assert.ok((packet?.evidence?.snippets ?? []).includes("Replay script observed during homepage load"));
});

test("keeps strong corroborated findings surfaced with a confidence rationale", () => {
  const validationFinding = makeValidationFinding({
    id: "val-6",
    ruleKey: "privacy.trackers_before_consent_detected",
    severity: "high",
    title: "Trackers observed before consent",
    evidence: {
      preconsent_tracker_vendors: ["Meta Pixel"],
      preconsent_tracker_evidence_urls: ["https://example.com/collect"],
      policySummary: "Tracking is presented as consent-gated."
    }
  });

  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "Observed before a clear user choice was made.",
        linkedValidationFinding: validationFinding,
        observedValue: "Yes",
        severity: "high",
        signalKey: "privacy.preconsent_tracking_detected",
        signalLabel: "Pre-consent tracking detected",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Pre-consent tracking detected"
      }
    ],
    validationFindings: [validationFinding],
    validationFindingLookup: new Map([[validationFinding.ruleKey, validationFinding]])
  });

  assert.equal(packet?.presentationDecision.status, "surface");
  assert.match(packet?.presentationDecision.confidenceRationale ?? "", /high confidence/i);
  assert.match(packet?.presentation.suggestedFix ?? "", /block non-essential trackers/i);
});

test("keeps pre-consent tracking audit-only when concrete runtime vendors and URLs are not retained", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "Observed before a clear user choice was made.",
        observedValue: "Yes",
        severity: "high",
        signalKey: "privacy.preconsent_tracking_detected",
        signalLabel: "Pre-consent tracking detected",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Pre-consent tracking detected"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "preconsent_tracking");
  assert.equal(packet?.presentationDecision.status, "audit_only");
});

test("keeps page-specific findings in audit only when page attribution is still missing", () => {
  const validationFinding = makeValidationFinding({
    id: "val-8",
    ruleKey: "privacy.session_replay_without_disclosure_detected",
    severity: "high",
    title: "Possible undisclosed session replay",
    evidence: {
      claim: "Policy does not clearly disclose replay tooling.",
      relatedVendors: ["Microsoft Clarity"]
    }
  });

  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [],
    validationFindings: [validationFinding],
    validationFindingLookup: new Map([[validationFinding.ruleKey, validationFinding]])
  });

  assert.equal(packet?.confidenceInputs.hasPageAttribution, false);
  assert.equal(packet?.presentationDecision.status, "audit_only");
  assert.match(packet?.presentationDecision.rationale ?? "", /internal review/i);
});

test("surfaces GPC failures as runtime-backed unified findings", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "A browser-level opt-out preference signal appears not to have been honored during the scan.",
        fallbackEvidence: {
          gpcVerification: {
            status: "ignored",
            baselineTrackerCount: 3,
            baselineThirdPartyCookieCount: 4,
            gpcTrackerCount: 3,
            gpcThirdPartyCookieCount: 4,
            trackerCountDelta: 0,
            thirdPartyCookieCountDelta: 0,
            evidenceUrls: ["https://example.com/collect"]
          },
          signalKey: "privacy.gpc_signal_not_honored",
          signalLabel: "GPC signal not honored",
          signalValue: true,
          sourceUrls: ["https://example.com/collect"]
        },
        observedValue: "Yes",
        severity: "high",
        signalKey: "privacy.gpc_signal_not_honored",
        signalLabel: "GPC signal not honored",
        signalSource: "runtime_artifact_signal",
        sourceType: "signal",
        title: "GPC signal not honored"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "gpc_signal_not_honored");
  assert.equal(packet?.confidenceInputs.hasDirectRuntimeEvidence, true);
  assert.equal(packet?.presentationDecision.status, "surface");
  assert.match(packet?.presentation.suggestedFix ?? "", /browser-level opt-out/i);
});

test("surfaces weak cookie security attributes from runtime artifact evidence", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "Observed cookies appear to rely on weaker security attributes than expected.",
        fallbackEvidence: {
          cookieAttributeSummary: {
            totalCookiesAnalyzed: 5,
            missingSecureCount: 2,
            missingHttpOnlyCount: 3,
            weakSameSiteCount: 1,
            thirdPartyWeakAttributeCount: 2,
            missingSecureCookieNames: ["_ga"],
            missingHttpOnlyCookieNames: ["_ga", "consent"],
            weakSameSiteCookieNames: ["_ga"],
            thirdPartyWeakAttributeCookieNames: ["_ga"]
          },
          signalKey: "privacy.weak_cookie_security_attributes_detected",
          signalLabel: "Weak cookie security attributes detected",
          signalValue: true
        },
        observedValue: "Yes",
        severity: "medium",
        signalKey: "privacy.weak_cookie_security_attributes_detected",
        signalLabel: "Weak cookie security attributes detected",
        signalSource: "runtime_artifact_signal",
        sourceType: "signal",
        title: "Weak cookie security attributes detected"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "weak_cookie_security_attributes");
  assert.equal(packet?.confidenceInputs.hasDirectRuntimeEvidence, true);
  assert.equal(packet?.presentationDecision.status, "surface");
  assert.equal(packet?.evidence?.counts?.missingSecureCount, 2);
});

test("keeps weak cookie security attributes audit-only when only HttpOnly examples are retained", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "Observed cookies appear to rely on weaker security attributes than expected.",
        fallbackEvidence: {
          cookieAttributeSummary: {
            missingHttpOnlyCount: 4,
            missingHttpOnlyCookieNames: ["_ga", "_ga_H1SWTMGGJ4"]
          },
          signalKey: "privacy.weak_cookie_security_attributes_detected",
          signalLabel: "Weak cookie security attributes detected",
          signalValue: true
        },
        observedValue: "Yes",
        severity: "medium",
        signalKey: "privacy.weak_cookie_security_attributes_detected",
        signalLabel: "Weak cookie security attributes detected",
        signalSource: "runtime_artifact_signal",
        sourceType: "signal",
        title: "Weak cookie security attributes detected"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "weak_cookie_security_attributes");
  assert.equal(packet?.presentationDecision.status, "audit_only");
});

test("surfaces missing consent surface as a domain-level consent finding", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "No user-facing consent surface was detected before the site initialized consent-relevant behavior.",
        fallbackEvidence: {
          signalKey: "privacy.consent_surface_missing",
          signalLabel: "Consent surface missing",
          signalValue: true,
          consentMechanismType: "none",
          cookieBannerPresent: false,
          cmpVendorName: null,
          consentInteractionModel: "none"
        },
        observedValue: "No consent surface detected",
        severity: "high",
        signalKey: "privacy.consent_surface_missing",
        signalLabel: "Consent surface missing",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Consent surface missing"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "consent_surface_missing");
  assert.equal(packet?.presentationDecision.status, "surface");
  assert.match(packet?.presentation.whyThisMatters ?? "", /visible consent surface/i);
});

test("resolves live-audit reject-path title through validation-backed canonical surfacing", () => {
  const validationFinding = makeValidationFinding({
    id: "val-live-reject",
    ruleKey: "privacy.reject_control_missing_detected",
    severity: "medium",
    title: "Reject-all control missing",
    evidence: {
      uiText: ["Manage preferences", "Accept all"]
    }
  });

  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "A visible first-layer reject-all control was not detected, while accept or manage controls were detected on the initial consent surface.",
        linkedValidationFinding: validationFinding,
        fallbackEvidence: {
          pageUrl: "https://example.com",
          uiText: ["Manage preferences", "Accept all"]
        },
        observedValue: "Reject path appears less direct than accept path",
        severity: "medium",
        sourceType: "issue",
        title: "Reject path appears less direct than accept path"
      }
    ],
    validationFindings: [validationFinding],
    validationFindingLookup: new Map([[validationFinding.ruleKey, validationFinding]])
  });

  assert.equal(packet?.unifiedFindingId, "reject_button_missing");
});

test("keeps consent surface missing audit-only when only weak discovery evidence is retained", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "A consent surface may be missing, but the retained evidence is discovery-only.",
        fallbackEvidence: {
          signalKey: "privacy.consent_surface_missing",
          signalLabel: "Consent surface missing",
          signalValue: true,
          keyPageAttemptCount: 3,
          keyPageDiscoverySource: "footer_link"
        },
        observedValue: "No consent surface detected",
        severity: "high",
        signalKey: "privacy.consent_surface_missing",
        signalLabel: "Consent surface missing",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Consent surface missing"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "consent_surface_missing");
  assert.equal(packet?.presentationDecision.status, "audit_only");
});

test("surfaces missing accessibility support path as a domain-level accessibility finding", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "No accessibility-specific support or accommodation contact path was detected during the scan.",
        fallbackEvidence: {
          signalKey: "accessibility.accessibility_support_path_missing",
          signalLabel: "Accessibility support path missing",
          signalValue: true,
          accessibilityContactMethodPresent: false
        },
        observedValue: "No accessibility support path detected",
        severity: "medium",
        signalKey: "accessibility.accessibility_support_path_missing",
        signalLabel: "Accessibility support path missing",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Accessibility support path missing"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "accessibility_support_path_missing");
  assert.equal(packet?.presentationDecision.status, "surface");
  assert.match(packet?.presentation.whyThisMatters ?? "", /accessibility support path/i);
});

test("suppresses missing contact page when another support path is already retained", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "A key disclosure or support page surface was not detected during the scan.",
        fallbackEvidence: {
          signalKey: "disclosure.contact_page_surface_missing",
          signalLabel: "Contact page missing",
          signalValue: true
        },
        observedValue: "Contact page missing",
        severity: "medium",
        signalKey: "disclosure.contact_page_surface_missing",
        signalLabel: "Contact page missing",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Contact page missing"
      },
      {
        description: "The scan retained a visible accessibility support or accommodation path.",
        fallbackEvidence: {
          signalKey: "accessibility.accessibility_contact_method_present",
          signalLabel: "Accessibility contact method detected",
          signalValue: true,
          accessibilityContactMethodPresent: true,
          pageUrls: ["https://www.example.com/accessibility"]
        },
        observedValue: "Accessibility support path present",
        severity: "low",
        signalKey: "accessibility.accessibility_contact_method_present",
        signalLabel: "Accessibility contact method detected",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Accessibility contact method detected"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  const contactPacket = packets.find((packet) => packet.unifiedFindingId === "contact_page_missing_surface");
  assert.equal(contactPacket?.presentationDecision.status, "suppress");
});

test("keeps accessibility risk score audit-only even when representative examples are retained", () => {
  const validationFinding = makeValidationFinding({
    id: "val-accessibility-risk",
    ruleKey: "scan_snapshot.accessibility.accessibility_risk_score",
    severity: "medium",
    title: "Accessibility risk score",
    evidence: {
      pageUrl: "https://www.example.com/",
      supportingSignals: [
        "Scanner-derived accessibility risk indicators were elevated and warrant manual accessibility review.",
        "on https://www.example.com/ (.hero-title)",
        "Accessibility risk score: 14."
      ]
    }
  });

  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [],
    validationFindings: [validationFinding],
    validationFindingLookup: new Map([[validationFinding.ruleKey, validationFinding]])
  });

  assert.equal(packet?.unifiedFindingId, "accessibility_risk_score");
  assert.equal(packet?.presentationDecision.status, "audit_only");
});

test("surfaces missing sale or sharing controls as a domain-level rights finding", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "Retargeting behavior was observed, but no do-not-sell/share control path was detected.",
        fallbackEvidence: {
          signalKey: "privacy.sale_sharing_controls_missing",
          signalLabel: "Sale/sharing controls missing",
          signalValue: true,
          doNotSellLinkPresent: false,
          retargetingPixelDetected: true
        },
        observedValue: "No sale/sharing control path detected",
        severity: "medium",
        signalKey: "privacy.sale_sharing_controls_missing",
        signalLabel: "Sale/sharing controls missing",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Sale/sharing controls missing"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "sale_sharing_controls_missing");
  assert.equal(packet?.presentationDecision.status, "surface");
  assert.match(packet?.presentation.whyThisMatters ?? "", /privacy choice/i);
});

test("surfaces privacy-rights path present from policy enrichment evidence", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a clear policy-based privacy-rights request path.",
        fallbackEvidence: {
          signalKey: "privacy.privacy_rights_path_present",
          signalLabel: "Privacy-rights path present",
          signalValue: true,
          policySnippets: ["You may request access to, delete, or export your information through our Privacy Rights Center."],
          policyRightsSignals: ["access", "delete", "export"],
          pageUrl: "https://www.example.com/privacy"
        },
        observedValue: "Privacy-rights path present",
        severity: "low",
        signalKey: "privacy.privacy_rights_path_present",
        signalLabel: "Privacy-rights path present",
        signalSource: "policy_enrichment_signal",
        sourceType: "signal",
        title: "Privacy-rights path present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "privacy_rights_path_present");
  assert.equal(packet?.presentationDecision.status, "surface");
  assert.match(packet?.presentation.whyThisMatters ?? "", /privacy-rights path/i);
  assert.deepEqual(packet?.evidence?.snippets, [
    "You may request access to, delete, or export your information through our Privacy Rights Center."
  ]);
});

test("surfaces privacy contact path present from policy enrichment evidence", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a clear privacy-specific contact path in the policy.",
        fallbackEvidence: {
          pageType: "privacy_policy",
          pageUrl: "https://www.example.com/privacy",
          policySnippets: ["If you have questions about this Privacy Policy, contact us at privacy@example.com."],
          privacyContactChannelType: "email",
          signalKey: "privacy.privacy_contact_path_present",
          signalLabel: "Privacy contact path present",
          signalValue: true
        },
        observedValue: "Privacy contact path present",
        severity: "low",
        signalKey: "privacy.privacy_contact_path_present",
        signalLabel: "Privacy contact path present",
        signalSource: "policy_enrichment_signal",
        sourceType: "signal",
        title: "Privacy contact path present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "privacy_contact_path_present");
  assert.equal(packet?.presentationDecision.status, "surface");
});

test("surfaces privacy policy present from snapshot disclosure evidence", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a reachable privacy-policy surface that users and reviewers can use to find core notice disclosures.",
        fallbackEvidence: {
          pageUrls: ["https://www.example.com/privacy"],
          policySnippets: ["Privacy Policy | Example"],
          signalKey: "disclosure.privacy_policy_present",
          signalLabel: "Privacy policy fetched",
          signalValue: true,
          sourceUrls: ["https://www.example.com/privacy"]
        },
        observedValue: "Privacy policy fetched",
        severity: "low",
        signalKey: "disclosure.privacy_policy_present",
        signalLabel: "Privacy policy fetched",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Privacy policy fetched"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "privacy_policy_present");
  assert.equal(packet?.presentationDecision.status, "surface");
  assert.equal(packet?.evidence?.pageUrls?.[0], "https://www.example.com/privacy");
  assert.match(packet?.presentation.whyThisMatters ?? "", /visible privacy policy surface/i);
});

test("dedupes equivalent privacy policy snippets that differ only by trailing punctuation", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a reachable privacy-policy surface that users and reviewers can use to find core notice disclosures.",
        fallbackEvidence: {
          pageUrls: ["https://www.example.com/privacy"],
          policySnippets: ["Privacy Policy", "Privacy Policy."],
          signalKey: "disclosure.privacy_policy_present",
          signalLabel: "Privacy policy fetched",
          signalValue: true,
          sourceUrls: ["https://www.example.com/privacy"]
        },
        observedValue: "Privacy policy fetched",
        severity: "low",
        signalKey: "disclosure.privacy_policy_present",
        signalLabel: "Privacy policy fetched",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Privacy policy fetched"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "privacy_policy_present");
  assert.deepEqual(packet?.evidence?.snippets, ["Privacy Policy"]);
});

test("surfaces legal entity name present from financial entity evidence", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a public-facing operator identity surface naming the site's legal entity.",
        fallbackEvidence: {
          pageUrls: ["https://www.example.com/about"],
          policySnippets: ["Example Capital LLC"],
          signalKey: "entity.legal_entity_name_text_present",
          signalLabel: "Legal entity name text present",
          signalValue: true,
          sourceUrls: ["https://www.example.com/about"]
        },
        observedValue: "Legal entity name text present",
        severity: "low",
        signalKey: "entity.legal_entity_name_text_present",
        signalLabel: "Legal entity name text present",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Legal entity name text present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "legal_entity_name_present");
  assert.equal(packet?.presentationDecision.status, "audit_only");
  assert.match(packet?.presentation.whyThisMatters ?? "", /legal entity name/i);
});

test("surfaces operator contact path present from financial entity evidence", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a public-facing operator contact path.",
        fallbackEvidence: {
          pageUrls: ["https://www.example.com/contact"],
          policySnippets: ["Contact our operator team at support@example.com"],
          signalKey: "entity.contact_email_present",
          signalLabel: "Contact email present",
          signalValue: true,
          sourceUrls: ["https://www.example.com/contact"]
        },
        observedValue: "Contact email present",
        severity: "low",
        signalKey: "entity.contact_email_present",
        signalLabel: "Contact email present",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Contact email present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "operator_contact_path_present");
  assert.equal(packet?.presentationDecision.status, "audit_only");
  assert.match(packet?.presentation.whyThisMatters ?? "", /operator contact path/i);
});

test("keeps legal entity name present audit-only when only thin financial entity evidence is retained", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a possible operator identity signal.",
        fallbackEvidence: {
          signalKey: "entity.legal_entity_name_text_present",
          signalLabel: "Legal entity name text present",
          signalValue: true
        },
        observedValue: "Legal entity name text present",
        severity: "low",
        signalKey: "entity.legal_entity_name_text_present",
        signalLabel: "Legal entity name text present",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Legal entity name text present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "legal_entity_name_present");
  assert.equal(packet?.presentationDecision.status, "audit_only");
});

test("surfaces investment risk disclosure present from financial disclosure evidence", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained explicit risk disclosure text on a public-facing offer or disclosure page.",
        fallbackEvidence: {
          pageUrls: ["https://www.example.com/risk-disclosure"],
          policySnippets: ["Your capital is at risk and you may lose more than your initial investment."],
          signalKey: "financial.loss_risk_disclosure_text_present",
          signalLabel: "Loss-risk disclosure text present",
          signalValue: true,
          sourceUrls: ["https://www.example.com/risk-disclosure"]
        },
        observedValue: "Loss-risk disclosure text present",
        severity: "low",
        signalKey: "financial.loss_risk_disclosure_text_present",
        signalLabel: "Loss-risk disclosure text present",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Loss-risk disclosure text present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "investment_risk_disclosure_present");
  assert.equal(packet?.presentationDecision.status, "audit_only");
  assert.match(packet?.presentation.whyThisMatters ?? "", /investment-risk disclosure/i);
});

test("surfaces fee disclosure present from explicit financial fee evidence", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained explicit fee disclosure text on a public-facing pricing or offer page.",
        fallbackEvidence: {
          pageUrls: ["https://www.example.com/pricing"],
          policySnippets: ["A monthly fee of $25 applies to premium managed accounts."],
          signalKey: "commercial.explicit_fee_disclosure_text_present",
          signalLabel: "Explicit fee disclosure text present",
          signalValue: true,
          sourceUrls: ["https://www.example.com/pricing"]
        },
        observedValue: "Explicit fee disclosure text present",
        severity: "low",
        signalKey: "commercial.explicit_fee_disclosure_text_present",
        signalLabel: "Explicit fee disclosure text present",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Explicit fee disclosure text present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "fee_disclosure_present");
  assert.equal(packet?.presentationDecision.status, "audit_only");
  assert.match(packet?.presentation.whyThisMatters ?? "", /fee disclosure/i);
});

test("surfaces past performance disclaimer present from exact disclaimer text", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained an explicit past-performance disclaimer on a public-facing strategy or disclosure page.",
        fallbackEvidence: {
          pageUrls: ["https://www.example.com/strategies"],
          policySnippets: ["Past performance does not guarantee future results."],
          signalKey: "financial.past_performance_disclaimer_text_present",
          signalLabel: "Past-performance disclaimer text present",
          signalValue: true,
          sourceUrls: ["https://www.example.com/strategies"]
        },
        observedValue: "Past-performance disclaimer text present",
        severity: "low",
        signalKey: "financial.past_performance_disclaimer_text_present",
        signalLabel: "Past-performance disclaimer text present",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Past-performance disclaimer text present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "past_performance_disclaimer_present");
  assert.equal(packet?.presentationDecision.status, "audit_only");
  assert.match(packet?.presentation.whyThisMatters ?? "", /past-performance disclaimer/i);
});

test("surfaces APR or interest-rate disclosure present from explicit rate text", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained explicit APR or interest-rate text on a public-facing financial offer page.",
        fallbackEvidence: {
          pageUrls: ["https://www.example.com/cards/gold"],
          policySnippets: ["Variable APR 24.99% applies after the introductory period."],
          signalKey: "financial.apr_or_interest_rate_disclosure_text_present",
          signalLabel: "APR or interest-rate disclosure text present",
          signalValue: true,
          sourceUrls: ["https://www.example.com/cards/gold"]
        },
        observedValue: "APR or interest-rate disclosure text present",
        severity: "low",
        signalKey: "financial.apr_or_interest_rate_disclosure_text_present",
        signalLabel: "APR or interest-rate disclosure text present",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "APR or interest-rate disclosure text present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "apr_or_interest_rate_disclosure_present");
  assert.equal(packet?.presentationDecision.status, "audit_only");
  assert.match(packet?.presentation.whyThisMatters ?? "", /interest-rate disclosure|APR/i);
});

test("surfaces targeted advertising choices present from a do-not-sell link signal", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a reachable targeted-advertising or do-not-sell/share choice path that users can use to manage related privacy controls.",
        fallbackEvidence: {
          pageUrls: ["https://www.example.com/privacy-choices"],
          policySnippets: ["Your Privacy Choices | Example"],
          signalKey: "privacy.do_not_sell_link_present",
          signalLabel: "Do-not-sell link present",
          signalValue: true,
          sourceUrls: ["https://www.example.com/privacy-choices"]
        },
        observedValue: "Do-not-sell link present",
        severity: "low",
        signalKey: "privacy.do_not_sell_link_present",
        signalLabel: "Do-not-sell link present",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Do-not-sell link present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "targeted_advertising_choices_present");
  assert.equal(packet?.presentationDecision.status, "surface");
});

test("sanitizes targeted advertising choices evidence to drop weak homepage placeholders", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description:
          "The scan retained a reachable targeted-advertising or do-not-sell/share choice path that users can use to manage related privacy controls.",
        fallbackEvidence: {
          pageUrls: [
            "https://www.example.com/",
            "https://www.example.com/privacy",
            "https://www.example.com/#"
          ],
          policySnippets: [
            "Breaking News, Latest News and Videos | Example",
            "Your Privacy Choices"
          ],
          signalKey: "privacy.do_not_sell_link_present",
          signalLabel: "Do-not-sell link present",
          signalValue: true,
          sourceUrls: [
            "https://www.example.com/",
            "https://www.example.com/privacy",
            "https://www.example.com/#"
          ]
        },
        observedValue: "Do-not-sell link present",
        severity: "low",
        signalKey: "privacy.do_not_sell_link_present",
        signalLabel: "Do-not-sell link present",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Do-not-sell link present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "targeted_advertising_choices_present");
  assert.deepEqual(packet?.evidence?.pageUrls, ["https://www.example.com/privacy"]);
  assert.deepEqual(packet?.evidence?.sourceUrls, ["https://www.example.com/privacy"]);
  assert.deepEqual(packet?.evidence?.snippets, ["Your Privacy Choices"]);
});

test("prefers privacy-choice snippets over generic privacy policy text for targeted advertising choices", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description:
          "The scan retained a reachable targeted-advertising or do-not-sell/share choice path that users can use to manage related privacy controls.",
        fallbackEvidence: {
          pageUrls: ["https://www.example.com/privacy"],
          policySnippets: ["Privacy Policy", "Manage Cookies"],
          signalKey: "privacy.do_not_sell_link_present",
          signalLabel: "Do-not-sell link present",
          signalValue: true,
          sourceUrls: ["https://www.example.com/privacy"]
        },
        observedValue: "Do-not-sell link present",
        severity: "low",
        signalKey: "privacy.do_not_sell_link_present",
        signalLabel: "Do-not-sell link present",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Do-not-sell link present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "targeted_advertising_choices_present");
  assert.deepEqual(packet?.evidence?.snippets, ["Manage Cookies"]);
});

test("normalizes whitespace-heavy targeted advertising snippets before final evidence assembly", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description:
          "The scan retained a reachable targeted-advertising or do-not-sell/share choice path that users can use to manage related privacy controls.",
        fallbackEvidence: {
          pageUrls: ["https://www.example.com/privacy"],
          policySnippets: ["\n Manage Cookies\n"],
          signalKey: "privacy.do_not_sell_link_present",
          signalLabel: "Do-not-sell link present",
          signalValue: true,
          sourceUrls: ["https://www.example.com/privacy"]
        },
        observedValue: "Do-not-sell link present",
        severity: "low",
        signalKey: "privacy.do_not_sell_link_present",
        signalLabel: "Do-not-sell link present",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Do-not-sell link present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "targeted_advertising_choices_present");
  assert.deepEqual(packet?.evidence?.snippets, ["Manage Cookies"]);
});

test("keeps affiliate disclosure audit-only when only the path was retained without visible page text", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a clear affiliate disclosure path that signals when recommendations or links may involve a financial relationship.",
        fallbackEvidence: {
          pageUrls: ["https://www.example.com/affiliates"],
          signalKey: "commerce.affiliate_disclosure_present",
          signalLabel: "Affiliate disclosure present",
          signalValue: true,
          sourceUrls: ["https://www.example.com/affiliates"]
        },
        observedValue: "Affiliate disclosure present",
        severity: "medium",
        signalKey: "commerce.affiliate_disclosure_present",
        signalLabel: "Affiliate disclosure present",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Affiliate disclosure present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "affiliate_disclosure_present");
  assert.equal(packet?.presentationDecision.status, "audit_only");
});

test("suppresses weak cookie obstruction when a cookie policy surface is already retained", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The cookie policy did not expose enough structured disclosure metadata to reconcile runtime cookies with confidence.",
        fallbackEvidence: {
          keyPageAttemptCount: 1,
          keyPageAttemptedUrls: ["https://www.example.com/#"],
          signalKey: "disclosure.cookie_policy_structurally_obstructed",
          signalLabel: "Cookie policy structurally obstructed",
          signalValue: true
        },
        observedValue: "Cookie policy structurally obstructed",
        severity: "medium",
        signalKey: "disclosure.cookie_policy_structurally_obstructed",
        signalLabel: "Cookie policy structurally obstructed",
        signalSource: "policy_enrichment_signal",
        sourceType: "signal",
        title: "Cookie policy structurally obstructed"
      },
      {
        description: "The scan retained a reachable cookie-policy or cookie-settings surface that users can use to find tracking disclosures and related controls.",
        fallbackEvidence: {
          pageUrls: ["https://www.example.com/cookies"],
          policySnippets: ["Cookie Settings | Example"],
          signalKey: "disclosure.cookie_policy_present",
          signalLabel: "Cookie policy fetched",
          signalValue: true,
          sourceUrls: ["https://www.example.com/cookies"]
        },
        observedValue: "Cookie policy fetched",
        severity: "low",
        signalKey: "disclosure.cookie_policy_present",
        signalLabel: "Cookie policy fetched",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Cookie policy fetched"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  const obstructionPacket = packets.find((packet) => packet.unifiedFindingId === "cookie_policy_structurally_obstructed");
  assert.equal(obstructionPacket?.presentationDecision.status, "suppress");
});

test("suppresses weak cookie policy present when only a root placeholder was retained", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a reachable cookie-policy or cookie-settings surface that users can use to find tracking disclosures and related controls.",
        fallbackEvidence: {
          pageUrls: ["https://www.example.com/"],
          policySnippets: ["Home | Example"],
          signalKey: "disclosure.cookie_policy_present",
          signalLabel: "Cookie policy fetched",
          signalValue: true,
          sourceUrls: ["https://www.example.com/#"]
        },
        observedValue: "Cookie policy fetched",
        severity: "low",
        signalKey: "disclosure.cookie_policy_present",
        signalLabel: "Cookie policy fetched",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Cookie policy fetched"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "cookie_policy_present");
  assert.equal(packet?.presentationDecision.status, "suppress");
  assert.deepEqual(packet?.evidence?.pageUrls, []);
  assert.match(packet?.presentation.whyThisMatters ?? "", /visible cookie policy or settings surface/i);
});

test("filters machine-readable privacy policy json blobs out of reviewer-facing snippets", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a reachable privacy-policy surface that users and reviewers can use to find core notice disclosures.",
        fallbackEvidence: {
          pageUrls: ["https://www.example.com/privacy"],
          policySnippets: [
            "{\"schemaType\":\"content\",\"schemaVersion\":2,\"notices\":{\"abc\":{\"content\":\"Example\"}}}"
          ],
          signalKey: "disclosure.privacy_policy_present",
          signalLabel: "Privacy policy fetched",
          signalValue: true,
          sourceUrls: ["https://www.example.com/privacy"]
        },
        observedValue: "Privacy policy fetched",
        severity: "low",
        signalKey: "disclosure.privacy_policy_present",
        signalLabel: "Privacy policy fetched",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Privacy policy fetched"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "privacy_policy_present");
  assert.deepEqual(packet?.evidence?.snippets ?? [], []);
  assert.match(packet?.observedValue ?? "", /reachable privacy-policy surface/i);
});

test("suppresses locale-subdomain terms surfaces when no canonical root-domain terms page was retained", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a reachable terms surface that users and reviewers can use to find the site's core legal terms.",
        fallbackEvidence: {
          pageUrls: ["https://arabic.example.com/terms"],
          policySnippets: ["شروط الاستخدام"],
          signalKey: "disclosure.terms_of_service_present",
          signalLabel: "Terms page fetched",
          signalValue: true,
          sourceUrls: ["https://arabic.example.com/terms"]
        },
        observedValue: "Terms page fetched",
        severity: "low",
        signalKey: "disclosure.terms_of_service_present",
        signalLabel: "Terms page fetched",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Terms page fetched"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "terms_of_service_present");
  assert.equal(packet?.presentationDecision.status, "suppress");
  assert.deepEqual(packet?.evidence?.pageUrls, []);
});

test("surfaces terms surfaces when fallback evidence retains a canonical root-domain terms url", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a reachable terms surface that users and reviewers can use to find the site's core legal terms.",
        fallbackEvidence: {
          pageUrls: ["https://www.cnn.com/terms"],
          policySnippets: ["Terms of Use"],
          signalKey: "disclosure.terms_of_service_present",
          signalLabel: "Terms page fetched",
          signalValue: true,
          sourceUrls: ["https://www.cnn.com/terms"]
        },
        observedValue: "Terms page fetched",
        severity: "low",
        signalKey: "disclosure.terms_of_service_present",
        signalLabel: "Terms page fetched",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Terms page fetched"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "terms_of_service_present");
  assert.equal(packet?.presentationDecision.status, "surface");
  assert.deepEqual(packet?.evidence?.pageUrls, ["https://www.cnn.com/terms"]);
});

test("prefers resolved non-root help urls over generic help roots in contact evidence", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a visible contact or help path.",
        fallbackEvidence: {
          pageUrls: ["https://help.cnn.com/us", "https://help.cnn.com/"],
          policySnippets: ["CNN | Help Center"],
          signalKey: "disclosure.contact_page_present",
          signalLabel: "Contact page fetched",
          signalValue: true,
          sourceUrls: ["https://help.cnn.com/us", "https://help.cnn.com/"]
        },
        observedValue: "Contact page fetched",
        severity: "medium",
        signalKey: "disclosure.contact_page_present",
        signalLabel: "Contact page fetched",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Contact page fetched"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "contact_support_path_present");
  assert.equal(packet?.presentationDecision.status, "surface");
  assert.deepEqual(packet?.evidence?.pageUrls, ["https://help.cnn.com/us"]);
  assert.deepEqual(packet?.evidence?.sourceUrls, ["https://help.cnn.com/us"]);
});

test("prefers canonical root-domain terms urls over locale alternates in final evidence", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a reachable terms surface that users and reviewers can use to find the site's core legal terms.",
        fallbackEvidence: {
          pageUrls: ["https://www.cnn.com/terms", "https://arabic.cnn.com/terms"],
          policySnippets: ["Terms and Conditions"],
          signalKey: "disclosure.terms_of_service_present",
          signalLabel: "Terms page fetched",
          signalValue: true,
          sourceUrls: ["https://www.cnn.com/terms", "https://arabic.cnn.com/terms"]
        },
        observedValue: "Terms page fetched",
        severity: "low",
        signalKey: "disclosure.terms_of_service_present",
        signalLabel: "Terms page fetched",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Terms page fetched"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "terms_of_service_present");
  assert.equal(packet?.presentationDecision.status, "surface");
  assert.deepEqual(packet?.evidence?.pageUrls, ["https://www.cnn.com/terms"]);
  assert.deepEqual(packet?.evidence?.sourceUrls, ["https://www.cnn.com/terms"]);
});

test("prefers contact-specific snippets over rights snippets for privacy contact path", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a clear privacy-specific contact path in the policy.",
        fallbackEvidence: {
          pageType: "privacy_policy",
          pageUrl: "https://www.example.com/privacy",
          policySnippets: [
            "If you have questions about this Privacy Policy, contact us at privacy@example.com.",
            "You may request access to, delete, or export your information through our Privacy Rights Center."
          ],
          privacyContactChannelType: "email",
          signalKey: "privacy.privacy_contact_path_present",
          signalLabel: "Privacy contact path present",
          signalValue: true
        },
        observedValue: "Privacy contact path present",
        severity: "low",
        signalKey: "privacy.privacy_contact_path_present",
        signalLabel: "Privacy contact path present",
        signalSource: "policy_enrichment_signal",
        sourceType: "signal",
        title: "Privacy contact path present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.evidence?.snippets?.[0], "If you have questions about this Privacy Policy, contact us at privacy@example.com.");
});

test("surfaces privacy-rights path present from the policyRightsSignals report key", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a clear policy-based privacy-rights request path.",
        fallbackEvidence: {
          signalKey: "policyRightsSignals",
          signalLabel: "Privacy-rights path present",
          signalValue: ["access", "delete", "authorized_agent"],
          policySnippets: ["Use our Privacy Rights Center to submit access and deletion requests."],
          policyRightsSignals: ["access", "delete", "authorized_agent"],
          pageUrl: "https://www.example.com/privacy"
        },
        observedValue: "Privacy-rights path present",
        severity: "low",
        signalKey: "policyRightsSignals",
        signalLabel: "Privacy-rights path present",
        signalSource: "policy_enrichment_signal",
        sourceType: "signal",
        title: "Privacy-rights path present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "privacy_rights_path_present");
  assert.equal(packet?.presentationDecision.status, "surface");
  assert.match(packet?.presentation.whyThisMatters ?? "", /privacy-rights path/i);
  assert.deepEqual(packet?.evidence?.snippets, [
    "Use our Privacy Rights Center to submit access and deletion requests."
  ]);
});

test("suppresses guessed-only cookie policy unavailable findings", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "A guessed cookie policy target could not be retrieved successfully.",
        fallbackEvidence: {
          keyPageAttemptCount: 2,
          keyPageAttemptedUrls: ["https://example.com/cookiebeleid", "https://example.com/Cookiebeleid"],
          keyPageGuessedOnly: true,
          signalKey: "disclosure.cookie_policy_fetch_failed",
          signalLabel: "Cookie policy not retrievable",
          signalValue: true
        },
        observedValue: "Cookie policy not retrievable",
        severity: "medium",
        signalKey: "disclosure.cookie_policy_fetch_failed",
        signalLabel: "Cookie policy not retrievable",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Cookie policy not retrievable"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "cookie_policy_unavailable");
  assert.equal(packet?.presentationDecision.status, "suppress");
});

test("suppresses discovery-only cookie policy unavailable findings without strong linked-source evidence", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "A cookie policy target discovered during bounded scanning could not be retrieved successfully.",
        fallbackEvidence: {
          keyPageAttemptCount: 2,
          keyPageAttemptedUrls: ["https://example.com/cookiebeleid", "https://example.com/Cookiebeleid"],
          keyPageDiscoverySource: "same_brand_subdomain",
          keyPageGuessedOnly: false,
          signalKey: "disclosure.cookie_policy_fetch_failed",
          signalLabel: "Cookie policy not retrievable",
          signalValue: true
        },
        observedValue: "Cookie policy not retrievable",
        severity: "medium",
        signalKey: "disclosure.cookie_policy_fetch_failed",
        signalLabel: "Cookie policy not retrievable",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Cookie policy not retrievable"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "cookie_policy_unavailable");
  assert.equal(packet?.presentationDecision.status, "suppress");
});

test("surfaces accessibility support path present from snapshot evidence", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a visible accessibility support or accommodation path.",
        fallbackEvidence: {
          signalKey: "accessibility.accessibility_contact_method_present",
          signalLabel: "Accessibility contact method detected",
          signalValue: true,
          accessibilityContactMethodPresent: true
        },
        observedValue: "Accessibility support path present",
        severity: "low",
        signalKey: "accessibility.accessibility_contact_method_present",
        signalLabel: "Accessibility contact method detected",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Accessibility contact method detected"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "accessibility_support_path_present");
  assert.equal(packet?.presentationDecision.status, "surface");
  assert.match(packet?.presentation.whyThisMatters ?? "", /accessibility support path/i);
});

test("prefers dedicated accessibility urls over generic help urls in final accessibility evidence", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a visible accessibility support or accommodation path.",
        fallbackEvidence: {
          pageUrls: ["https://www.cnn.com/accessibility", "https://help.cnn.com/us"],
          policySnippets: ["Accessibility Video & Closed Captioning for IP-delivered Video | CNN"],
          signalKey: "accessibility.accessibility_contact_method_present",
          signalLabel: "Accessibility contact method detected",
          signalValue: true,
          sourceUrls: ["https://www.cnn.com/accessibility", "https://help.cnn.com/us"]
        },
        observedValue: "Accessibility support path present",
        severity: "low",
        signalKey: "accessibility.accessibility_contact_method_present",
        signalLabel: "Accessibility contact method detected",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Accessibility contact method detected"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "accessibility_support_path_present");
  assert.equal(packet?.presentationDecision.status, "surface");
  assert.deepEqual(packet?.evidence?.pageUrls, ["https://www.cnn.com/accessibility"]);
  assert.deepEqual(packet?.evidence?.sourceUrls, ["https://www.cnn.com/accessibility"]);
});

test("keeps weak cookie security attributes audit-only without cookie examples", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "Observed cookies appear to rely on weaker security attributes than expected.",
        fallbackEvidence: {
          cookieAttributeSummary: {
            missingSecureCount: 2,
            weakSameSiteCount: 1
          },
          signalKey: "privacy.weak_cookie_security_attributes_detected",
          signalLabel: "Weak cookie security attributes",
          signalValue: true
        },
        observedValue: "Weak cookie security attributes",
        severity: "medium",
        signalKey: "privacy.weak_cookie_security_attributes_detected",
        signalLabel: "Weak cookie security attributes",
        signalSource: "runtime_artifact_signal",
        sourceType: "signal",
        title: "Weak cookie security attributes"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "weak_cookie_security_attributes");
  assert.equal(packet?.presentationDecision.status, "audit_only");
});

test("keeps contradiction findings audit-only without both policy text and concrete runtime evidence", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "Compare the supporting evidence against the public-facing policy language and confirm whether the mismatch is real.",
        fallbackEvidence: {
          claim: "The policy and consent surface imply tracking should begin only after a valid consent interaction.",
          pageUrl: "https://www.example.com/privacy",
          relatedVendors: ["Adobe Analytics", "Meta Pixel"]
        },
        observedValue: "Consent-gated tracking claim conflict",
        severity: "high",
        sourceType: "issue",
        title: "Consent-gated tracking claim conflicts with runtime behavior"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "consent_gated_tracking_claim_conflict");
  assert.equal(packet?.presentationDecision.status, "audit_only");
});

test("keeps consent-gated tracking claim conflict audit-only even with partial contradiction support", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "Compare the supporting evidence against the public-facing policy language and confirm whether the mismatch is real.",
        fallbackEvidence: {
          claim: "The policy and consent surface imply tracking should begin only after a valid consent interaction.",
          pageUrl: "https://www.example.com/privacy",
          policySnippets: ["The policy and consent surface imply tracking should begin only after a valid consent interaction."],
          relatedVendors: ["Adobe Analytics", "Meta Pixel"],
          runtimeVendors: ["Adobe Analytics", "Meta Pixel"]
        },
        observedValue: "Consent-gated tracking claim conflict",
        severity: "high",
        sourceType: "issue",
        title: "Consent-gated tracking claim conflicts with runtime behavior"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "consent_gated_tracking_claim_conflict");
  assert.equal(packet?.presentationDecision.status, "audit_only");
});

test("surfaces tracking technologies disclosure present from policy enrichment evidence", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a disclosure describing cookies, pixels, tags, beacons, scripts, or similar technologies.",
        fallbackEvidence: {
          pageUrl: "https://www.example.com/privacy",
          policySnippets: ["We use cookies, pixels, tags, beacons, scripts, and similar technologies."],
          signalKey: "privacy.tracking_technologies_disclosure_present",
          signalLabel: "Tracking technologies disclosure present",
          signalValue: true
        },
        observedValue: "Tracking technologies disclosure present",
        severity: "low",
        signalKey: "privacy.tracking_technologies_disclosure_present",
        signalLabel: "Tracking technologies disclosure present",
        signalSource: "policy_enrichment_signal",
        sourceType: "signal",
        title: "Tracking technologies disclosure present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "tracking_technologies_disclosure_present");
  assert.equal(packet?.presentationDecision.status, "surface");
  assert.match(packet?.presentation.whyThisMatters ?? "", /tracking-technologies disclosure/i);
  assert.deepEqual(packet?.evidence?.snippets, [
    "We use cookies, pixels, tags, beacons, scripts, and similar technologies."
  ]);
});

test("surfaces third-party advertising disclosure present from policy enrichment evidence", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a disclosure describing advertising partners or related third-party ad technologies.",
        fallbackEvidence: {
          pageType: "privacy_policy",
          pageUrl: "https://www.example.com/privacy",
          policySnippets: ["Our advertising partners may use cookies, JavaScript, or web beacons in their respective advertisements and links."],
          signalKey: "privacy.third_party_advertising_disclosure_present",
          signalLabel: "Third-party advertising disclosure present",
          signalValue: true
        },
        observedValue: "Third-party advertising disclosure present",
        severity: "low",
        signalKey: "privacy.third_party_advertising_disclosure_present",
        signalLabel: "Third-party advertising disclosure present",
        signalSource: "policy_enrichment_signal",
        sourceType: "signal",
        title: "Third-party advertising disclosure present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "third_party_advertising_disclosure_present");
  assert.equal(packet?.presentationDecision.status, "surface");
});

test("keeps third-party advertising disclosure audit-only when only summary text is retained without a concrete user-facing url", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a disclosure describing advertising partners or related third-party ad technologies.",
        fallbackEvidence: {
          policySummaryShort: "Our advertising partners may use cookies, JavaScript, or web beacons in their respective advertisements and links.",
          signalKey: "privacy.third_party_advertising_disclosure_present",
          signalLabel: "Third-party advertising disclosure present",
          signalValue: true,
          sourceUrls: [
            "https://privacyportal.onetrust.com/request/v1/enterprisepolicy/digitalpolicy/content"
          ]
        },
        observedValue: "Third-party advertising disclosure present",
        severity: "low",
        signalKey: "privacy.third_party_advertising_disclosure_present",
        signalLabel: "Third-party advertising disclosure present",
        signalSource: "policy_enrichment_signal",
        sourceType: "signal",
        title: "Third-party advertising disclosure present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "third_party_advertising_disclosure_present");
  assert.equal(packet?.presentationDecision.status, "audit_only");
});

test("surfaces behavioral analytics disclosure present from policy enrichment evidence", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a disclosure describing behavioral analytics or replay-style tooling.",
        fallbackEvidence: {
          pageUrl: "https://www.example.com/privacy",
          policySnippets: ["On certain pages, we use third-party tools to observe mouse movements, clicks, keystrokes, entered text, and pages visited."],
          signalKey: "privacy.behavioral_analytics_disclosure_present",
          signalLabel: "Behavioral analytics disclosure present",
          signalValue: true
        },
        observedValue: "Behavioral analytics disclosure present",
        severity: "low",
        signalKey: "privacy.behavioral_analytics_disclosure_present",
        signalLabel: "Behavioral analytics disclosure present",
        signalSource: "policy_enrichment_signal",
        sourceType: "signal",
        title: "Behavioral analytics disclosure present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "behavioral_analytics_disclosure_present");
  assert.equal(packet?.presentationDecision.status, "surface");
  assert.match(packet?.presentation.whyThisMatters ?? "", /behavioral analytics/i);
  assert.deepEqual(packet?.evidence?.snippets, [
    "On certain pages, we use third-party tools to observe mouse movements, clicks, keystrokes, entered text, and pages visited."
  ]);
});

test("keeps behavioral analytics disclosure audit-only when only summary text is retained without a concrete user-facing url", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a disclosure describing behavioral analytics or replay-style tooling.",
        fallbackEvidence: {
          policySummaryShort:
            "On certain pages, we use third-party tools to observe mouse movements, clicks, keystrokes, entered text, and pages visited.",
          signalKey: "privacy.behavioral_analytics_disclosure_present",
          signalLabel: "Behavioral analytics disclosure present",
          signalValue: true,
          sourceUrls: [
            "https://privacyportal.onetrust.com/request/v1/enterprisepolicy/digitalpolicy/content"
          ]
        },
        observedValue: "Behavioral analytics disclosure present",
        severity: "low",
        signalKey: "privacy.behavioral_analytics_disclosure_present",
        signalLabel: "Behavioral analytics disclosure present",
        signalSource: "policy_enrichment_signal",
        sourceType: "signal",
        title: "Behavioral analytics disclosure present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "behavioral_analytics_disclosure_present");
  assert.equal(packet?.presentationDecision.status, "audit_only");
});

test("surfaces affiliate disclosure present from snapshot evidence", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a clear affiliate disclosure path.",
        fallbackEvidence: {
          pageUrl: "https://www.kbdlab.io/affiliate-disclosure",
          policySnippets: ["Affiliate Disclosure | KBD Lab"],
          signalKey: "commerce.affiliate_disclosure_present",
          signalLabel: "Affiliate disclosure present",
          signalValue: true
        },
        observedValue: "Affiliate disclosure present",
        severity: "low",
        signalKey: "commerce.affiliate_disclosure_present",
        signalLabel: "Affiliate disclosure present",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Affiliate disclosure present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "affiliate_disclosure_present");
  assert.equal(packet?.presentationDecision.status, "surface");
  assert.match(packet?.presentation.whyThisMatters ?? "", /affiliate disclosure/i);
});

test("surfaces affiliate disclosure when retained affiliate summary text is available", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a clear affiliate disclosure path.",
        fallbackEvidence: {
          pageUrls: ["https://www.example.com/affiliates"],
          policySummaryShort: "We may earn a commission from purchases made through links on this page.",
          signalKey: "commerce.affiliate_disclosure_present",
          signalLabel: "Affiliate disclosure present",
          signalValue: true,
          sourceUrls: [
            "https://www.example.com/affiliates",
            "https://privacyportal.onetrust.com/request/v1/enterprisepolicy/digitalpolicy/content"
          ]
        },
        observedValue: "Affiliate disclosure present",
        severity: "low",
        signalKey: "commerce.affiliate_disclosure_present",
        signalLabel: "Affiliate disclosure present",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Affiliate disclosure present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "affiliate_disclosure_present");
  assert.equal(packet?.presentationDecision.status, "surface");
  assert.deepEqual(packet?.evidence?.snippets, [
    "We may earn a commission from purchases made through links on this page."
  ]);
});

test("keeps affiliate disclosure page urls user-facing even when source urls retain machine endpoints", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a clear affiliate disclosure path.",
        fallbackEvidence: {
          keyPageAttemptCount: 1,
          keyPageAttemptedUrls: ["https://www.example.com/affiliates"],
          pageUrls: ["https://www.example.com/affiliates"],
          signalKey: "commerce.affiliate_disclosure_present",
          signalLabel: "Affiliate disclosure present",
          signalValue: true,
          sourceUrls: [
            "https://www.example.com/affiliates",
            "https://privacyportal.onetrust.com/request/v1/enterprisepolicy/digitalpolicy/content"
          ]
        },
        observedValue: "Affiliate disclosure present",
        severity: "low",
        signalKey: "commerce.affiliate_disclosure_present",
        signalLabel: "Affiliate disclosure present",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Affiliate disclosure present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.deepEqual(packet?.evidence?.pageUrls, ["https://www.example.com/affiliates"]);
  assert.deepEqual(packet?.evidence?.sourceUrls, [
    "https://www.example.com/affiliates",
    "https://privacyportal.onetrust.com/request/v1/enterprisepolicy/digitalpolicy/content"
  ]);
});

test("keeps affiliate disclosure audit-only when only summary text is retained without a concrete user-facing url", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a clear affiliate disclosure path.",
        fallbackEvidence: {
          policySummaryShort: "We may earn a commission from purchases made through links on this page.",
          signalKey: "commerce.affiliate_disclosure_present",
          signalLabel: "Affiliate disclosure present",
          signalValue: true,
          sourceUrls: [
            "https://privacyportal.onetrust.com/request/v1/enterprisepolicy/digitalpolicy/content"
          ]
        },
        observedValue: "Affiliate disclosure present",
        severity: "low",
        signalKey: "commerce.affiliate_disclosure_present",
        signalLabel: "Affiliate disclosure present",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Affiliate disclosure present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "affiliate_disclosure_present");
  assert.equal(packet?.presentationDecision.status, "audit_only");
});

test("uses retargeting-specific unified finding copy instead of the generic fallback", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "This signal is worth reviewer attention.",
        fallbackEvidence: {
          signalKey: "commerce.retargeting_pixel_detected",
          signalLabel: "Retargeting pixel detected",
          signalValue: true
        },
        observedValue: "Retargeting pixel observed",
        severity: "medium",
        signalKey: "commerce.retargeting_pixel_detected",
        signalLabel: "Retargeting pixel detected",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Retargeting pixel detected"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "retargeting_pixel_observed");
  assert.match(packet?.presentation.whyThisMatters ?? "", /retargeting-related signal|confirmed against retained runtime artifacts/i);
  assert.match(packet?.presentation.suggestedFix ?? "", /retained detector output|specific retargeting or advertising pixel/i);
});

test("drops weak root-only cookie obstruction urls from final evidence packets", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The cookie policy did not expose enough structured disclosure metadata to reconcile runtime cookies with confidence.",
        fallbackEvidence: {
          keyPageAttemptCount: 1,
          keyPageAttemptedUrls: ["https://www.example.com/#"],
          signalKey: "disclosure.cookie_policy_structurally_obstructed",
          signalLabel: "Cookie policy structurally obstructed",
          signalValue: true
        },
        observedValue: "Cookie policy structurally obstructed",
        severity: "medium",
        signalKey: "disclosure.cookie_policy_structurally_obstructed",
        signalLabel: "Cookie policy structurally obstructed",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Cookie policy structurally obstructed"
      }
    ],
    validationFindings: [
      {
        evidence: {
          pageUrl: "https://www.example.com/",
          title: "Example homepage"
        },
        pageUrl: "https://www.example.com/",
        ruleKey: "disclosure.cookie_policy_structurally_obstructed",
        title: "Cookie policy structurally obstructed"
      }
    ],
    validationFindingLookup: new Map()
  });

  assert.deepEqual(packet?.evidence?.pageUrls ?? [], []);
  assert.deepEqual(packet?.evidence?.sourceUrls ?? [], []);
  assert.deepEqual(packet?.evidence?.snippets ?? [], []);
});

test("surfaces children's privacy disclosure present from policy enrichment evidence", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a children's privacy disclosure.",
        fallbackEvidence: {
          pageType: "privacy_policy",
          pageUrl: "https://www.example.com/privacy",
          policyChildrenReference: "We do not knowingly collect personal information from children under 13.",
          policySnippets: ["We do not knowingly collect personal information from children under 13."],
          signalKey: "privacy.children_privacy_disclosure_present",
          signalLabel: "Children's privacy disclosure present",
          signalValue: true
        },
        observedValue: "Children's privacy disclosure present",
        severity: "low",
        signalKey: "privacy.children_privacy_disclosure_present",
        signalLabel: "Children's privacy disclosure present",
        signalSource: "policy_enrichment_signal",
        sourceType: "signal",
        title: "Children's privacy disclosure present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "children_privacy_disclosure_present");
  assert.equal(packet?.presentationDecision.status, "surface");
});

test("does not leak raw policy signal values into snippets when a policy summary is already retained", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained terms language that appears to include arbitration or dispute-resolution provisions worth reading directly.",
        fallbackEvidence: {
          pageUrl: "https://example.com/terms",
          policySummaryShort:
            "The terms include arbitration for dispute resolution and are effective from January 1, 2026.",
          signalKey: "commerce.arbitration_clause_present",
          signalLabel: "Arbitration clause present",
          signalValue: "under_13"
        },
        observedValue: "Arbitration clause present",
        severity: "low",
        signalKey: "commerce.arbitration_clause_present",
        signalLabel: "Arbitration clause present",
        signalSource: "policy_enrichment_signal",
        sourceType: "signal",
        title: "Arbitration clause present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "arbitration_clause_present");
  assert.deepEqual(packet?.evidence?.snippets, [
    "The terms include arbitration for dispute resolution and are effective from January 1, 2026."
  ]);
});

test("filters raw marker tokens like under_13 out of merged evidence snippets", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained terms language that appears to include arbitration or dispute-resolution provisions worth reading directly.",
        fallbackEvidence: {
          pageUrl: "https://example.com/terms",
          policySnippets: [
            "The terms include binding arbitration for dispute resolution and are effective from January 1, 2026."
          ],
          signalKey: "commerce.arbitration_clause_present",
          signalLabel: "Arbitration clause present",
          signalValue: true
        },
        observedValue: "Arbitration clause present",
        severity: "low",
        signalKey: "commerce.arbitration_clause_present",
        signalLabel: "Arbitration clause present",
        signalSource: "policy_enrichment_signal",
        sourceType: "signal",
        title: "Arbitration clause present"
      }
    ],
    validationFindings: [
      {
        evidence: {
          description: "under_13",
          pageUrl: "https://example.com/terms"
        },
        pageUrl: "https://example.com/terms",
        ruleKey: "scan_signal.commerce.arbitration_clause_present",
        title: "Arbitration clause present"
      }
    ],
    validationFindingLookup: new Map()
  });

  assert.deepEqual(packet?.evidence?.snippets, [
    "The terms include binding arbitration for dispute resolution and are effective from January 1, 2026."
  ]);
});

test("prefers a clean arbitration observation over synthesized-looking policy summaries", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description:
          "The scan retained terms language that appears to include arbitration or dispute-resolution provisions worth reading directly.",
        fallbackEvidence: {
          pageUrl: "https://example.com/terms",
          policySnippets: [
            "The terms include arbitration for dispute resolution and are effective from January 1, 2026. — The terms were last updated on December 19, 2022, with contact information for copyright inquiries."
          ],
          signalKey: "commerce.arbitration_clause_present",
          signalLabel: "Arbitration clause present",
          signalValue: true
        },
        observedValue: "Arbitration clause present",
        severity: "low",
        signalKey: "commerce.arbitration_clause_present",
        signalLabel: "Arbitration clause present",
        signalSource: "policy_enrichment_signal",
        sourceType: "signal",
        title: "Arbitration clause present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(
    packet?.observedValue,
    "The scan retained terms language that appears to include arbitration or dispute-resolution provisions worth reading directly."
  );
});

test("suppresses arbitration clause findings when retained attribution is only a locale-subdomain terms page", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description:
          "The scan retained terms language that appears to include arbitration or dispute-resolution provisions worth reading directly.",
        fallbackEvidence: {
          pageUrls: ["https://arabic.example.com/terms"],
          policySnippets: ["The terms include binding arbitration for dispute resolution."],
          signalKey: "commerce.arbitration_clause_present",
          signalLabel: "Arbitration clause present",
          signalValue: true,
          sourceUrls: ["https://arabic.example.com/terms"]
        },
        observedValue: "Arbitration clause present",
        severity: "low",
        signalKey: "commerce.arbitration_clause_present",
        signalLabel: "Arbitration clause present",
        signalSource: "policy_enrichment_signal",
        sourceType: "signal",
        title: "Arbitration clause present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "arbitration_clause_present");
  assert.equal(packet?.presentationDecision.status, "suppress");
});

test("uses a finding-specific observation for retargeting pixel findings", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "This signal is worth reviewer attention.",
        fallbackEvidence: {
          signalKey: "commerce.retargeting_pixel_detected",
          signalLabel: "Retargeting pixel detected",
          signalValue: true
        },
        observedValue: "Retargeting pixel observed",
        severity: "medium",
        signalKey: "commerce.retargeting_pixel_detected",
        signalLabel: "Retargeting pixel detected",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Retargeting pixel detected"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(
    packet?.observedValue,
    "The scan retained a detector-backed retargeting or remarketing signal that merits manual confirmation."
  );
});

test("blocks low-confidence policy extraction on a non-policy page before packet assembly", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "Critical policy extraction fields were low confidence and need manual review.",
        fallbackEvidence: {
          pageType: "non_policy",
          pageUrl: "https://www.example.com/components/pbtfans-cookies-n-creme",
          policySemanticConfidence: 0.5,
          signalKey: "policySemanticConfidence",
          signalLabel: "Policy semantic confidence",
          signalValue: 0.5
        },
        observedValue: "Policy extraction",
        severity: "medium",
        signalKey: "policySemanticConfidence",
        signalLabel: "Policy semantic confidence",
        signalSource: "policy_enrichment_signal",
        sourceType: "signal",
        title: "Low-confidence policy extraction"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packets.length, 0);
});

test("blocks low-confidence policy extraction on non-primary policy rows before packet assembly", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "Critical policy extraction fields were low confidence and need manual review.",
        fallbackEvidence: {
          isPrimaryPolicy: false,
          pageType: "privacy_policy",
          pageUrl: "https://www.kbdlab.io/components/pbtfans-cookies-n-creme",
          policySemanticConfidence: 0.5,
          signalKey: "policySemanticConfidence",
          signalLabel: "Policy semantic confidence",
          signalValue: 0.5
        },
        observedValue: "Policy extraction",
        severity: "medium",
        signalKey: "policySemanticConfidence",
        signalLabel: "Policy semantic confidence",
        signalSource: "policy_enrichment_signal",
        sourceType: "signal",
        title: "Low-confidence policy extraction"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packets.length, 0);
});

test("normalizes clipped policy snippets but preserves natural lowercase starts", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a clear policy-based privacy-rights request path.",
        fallbackEvidence: {
          pageUrl: "https://www.example.com/privacy",
          policySnippets: ["ng on where you live, you may have the following rights regarding your personal information. The right to request access to, and a copy of, the information we hold about you."],
          signalKey: "privacy.privacy_rights_path_present",
          signalLabel: "Privacy-rights path present",
          signalValue: true
        },
        observedValue: "Privacy-rights path present",
        severity: "low",
        signalKey: "privacy.privacy_rights_path_present",
        signalLabel: "Privacy-rights path present",
        signalSource: "policy_enrichment_signal",
        sourceType: "signal",
        title: "Privacy-rights path present"
      },
      {
        description: "The scan retained a disclosure indicating how the site says it handles Global Privacy Control.",
        fallbackEvidence: {
          pageUrl: "https://www.example.com/privacy",
          policySnippets: ["for each device or browser you use, we will treat the Global Privacy Control signal as a request to opt out."],
          signalKey: "privacy.gpc_disclosure_present",
          signalLabel: "GPC handling disclosed",
          signalValue: true
        },
        observedValue: "GPC handling disclosed",
        severity: "low",
        signalKey: "privacy.gpc_disclosure_present",
        signalLabel: "GPC handling disclosed",
        signalSource: "policy_enrichment_signal",
        sourceType: "signal",
        title: "GPC handling disclosed"
      }
      ,
      {
        description: "The scan retained a disclosure describing behavioral analytics or replay-style tooling.",
        fallbackEvidence: {
          pageUrl: "https://www.example.com/privacy",
          policySnippets: ["tracking technologies such as cookies, pixels, tags, beacons, scripts, and similar technologies. On certain pages, we use third-party tools to help us look at mouse movements, clicks, keystrokes, data or text entered, and the pages you visit."],
          signalKey: "privacy.behavioral_analytics_disclosure_present",
          signalLabel: "Behavioral analytics disclosure present",
          signalValue: true
        },
        observedValue: "Behavioral analytics disclosure present",
        severity: "low",
        signalKey: "privacy.behavioral_analytics_disclosure_present",
        signalLabel: "Behavioral analytics disclosure present",
        signalSource: "policy_enrichment_signal",
        sourceType: "signal",
        title: "Behavioral analytics disclosure present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  const rightsPacket = packets.find((packet) => packet.unifiedFindingId === "privacy_rights_path_present");
  const gpcPacket = packets.find((packet) => packet.unifiedFindingId === "gpc_disclosure_present");
  const replayPacket = packets.find((packet) => packet.unifiedFindingId === "behavioral_analytics_disclosure_present");

  assert.deepEqual(rightsPacket?.evidence?.snippets, [
    "The right to request access to, and a copy of, the information we hold about you."
  ]);
  assert.deepEqual(gpcPacket?.evidence?.snippets, [
    "for each device or browser you use, we will treat the Global Privacy Control signal as a request to opt out."
  ]);
  assert.deepEqual(replayPacket?.evidence?.snippets, [
    "On certain pages, we use third-party tools to help us look at mouse movements, clicks, keystrokes, data or text entered, and the pages you visit."
  ]);
});

test("keeps GPC disclosure audit-only when only summary text is retained without a concrete user-facing url", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a disclosure indicating how the site says it handles Global Privacy Control.",
        fallbackEvidence: {
          policySummaryShort:
            "For each device or browser you use, we will treat the Global Privacy Control signal as a request to opt out.",
          signalKey: "privacy.gpc_disclosure_present",
          signalLabel: "GPC handling disclosed",
          signalValue: true,
          sourceUrls: [
            "https://privacyportal.onetrust.com/request/v1/enterprisepolicy/digitalpolicy/content"
          ]
        },
        observedValue: "GPC handling disclosed",
        severity: "low",
        signalKey: "privacy.gpc_disclosure_present",
        signalLabel: "GPC handling disclosed",
        signalSource: "policy_enrichment_signal",
        sourceType: "signal",
        title: "GPC handling disclosed"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "gpc_disclosure_present");
  assert.equal(packet?.presentationDecision.status, "audit_only");
});

test("surfaces child-directed context without supporting privacy disclosure", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "Youth-directed cues were retained, but supporting privacy disclosure and contact signals were missing.",
        fallbackEvidence: {
          signalKey: "privacy.children_privacy_context_without_supporting_disclosure",
          signalLabel: "Child-directed context without supporting privacy disclosure",
          signalValue: true,
          childrenAudienceLikely: true,
          kidDirectedContentDetected: true,
          formCollectsBirthdate: true,
          privacyPolicyPresent: false,
          privacyContactChannelType: "none"
        },
        observedValue: "Youth-directed context with missing disclosure support",
        severity: "medium",
        signalKey: "privacy.children_privacy_context_without_supporting_disclosure",
        signalLabel: "Child-directed context without supporting privacy disclosure",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Child-directed context without supporting privacy disclosure"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "children_privacy_context_without_supporting_disclosure");
  assert.equal(packet?.presentationDecision.status, "surface");
  assert.match(packet?.presentation.whyThisMatters ?? "", /supporting privacy disclosure/i);
});

test("surfaces minors-related context without requiring page-level attribution", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The site shows youth-directed or age-related privacy cues that merit closer review.",
        fallbackEvidence: {
          ageGatePresent: true,
          childrenAudienceLikely: true,
          childrenPrivacyRiskScore: 68,
          dateOfBirthInputPresent: true,
          formCollectsBirthdate: true,
          mentionsCoppa: true,
          mentionsUnder13: true,
          parentalConsentReferencePresent: true,
          policyChildrenReference: "The policy references services for children under 13.",
          signalKey: "context.children_audience_likely",
          signalLabel: "Children audience likely",
          signalValue: true
        },
        observedValue: "Yes",
        severity: "medium",
        signalKey: "context.children_audience_likely",
        signalLabel: "Children audience likely",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Children audience likely"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "minors_or_age_gated_collection_context");
  assert.equal(packet?.presentationDecision.status, "surface");
  assert.equal(packet?.confidenceInputs.hasPageAttribution, false);
  assert.equal(packet?.evidence?.counts?.childrenPrivacyRiskScore, 68);
  assert.ok(packet?.evidence?.flags?.includes("children_audience_likely"));
  assert.ok(packet?.details?.family === "sensitive_data");
  assert.ok(packet?.details?.dataTypes?.includes("birthdate"));
  assert.ok(packet?.details?.dataTypes?.includes("youth_directed_context"));
});

test("suppresses minors-related context when only weak policy and audience cues are present", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The site shows youth-directed or age-related privacy cues that merit closer review.",
        fallbackEvidence: {
          childrenAudienceLikely: true,
          childrenPrivacyRiskScore: 63,
          mentionsUnder13: true,
          signalKey: "context.children_audience_likely",
          signalLabel: "Children audience likely",
          signalValue: true
        },
        observedValue: "Yes",
        severity: "medium",
        signalKey: "context.children_audience_likely",
        signalLabel: "Children audience likely",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Children audience likely"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "minors_or_age_gated_collection_context");
  assert.equal(packet?.presentationDecision.status, "audit_only");
});

test("keeps minors-related context audit-only when only domain-level audience cues lack page evidence", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The site shows youth-directed or age-related privacy cues that merit closer review.",
        fallbackEvidence: {
          childrenAudienceLikely: true,
          childrenPrivacyRiskScore: 68,
          kidDirectedContentDetected: true,
          signalKey: "context.children_audience_likely",
          signalLabel: "Children audience likely",
          signalValue: true
        },
        observedValue: "Yes",
        severity: "medium",
        signalKey: "context.children_audience_likely",
        signalLabel: "Children audience likely",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Children audience likely"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "minors_or_age_gated_collection_context");
  assert.equal(packet?.presentationDecision.status, "audit_only");
});
