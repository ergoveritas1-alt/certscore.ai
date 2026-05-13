import assert from "node:assert/strict";
import test from "node:test";
import type { ReportUnifiedFindingId } from "@website-signal-risk-scanner/shared";
import type { UnifiedFindingPacket } from "./unified-findings";
import {
  evaluateUnifiedFindingSurfacing,
  REPORT_SURFACING_POLICY_VERSION,
  UNIFIED_FINDING_SURFACING_POLICY_REGISTRY,
  validateUnifiedFindingSurfacingPolicyEntries,
  validateUnifiedFindingSurfacingPolicyRegistry,
  type UnifiedFindingSurfacingPolicyEntry
} from "./report-surfacing-policy";

function makePacket(
  unifiedFindingId: ReportUnifiedFindingId,
  overrides?: Partial<UnifiedFindingPacket>
): UnifiedFindingPacket {
  return {
    affectedPageCount: 0,
    categoryAlignments: [],
    confidenceBand: "moderate",
    confidenceInputs: {
      evidenceQualityFlags: [],
      hasConcretePayloadEvidence: false,
      hasCorroboratedPositiveSurfaceEvidence: false,
      hasDirectRuntimeEvidence: false,
      hasKeyPageDiscoveryEvidence: false,
      hasMultipleHumanFacingUrls: false,
      hasPageAttribution: false,
      hasPacketBackedEvidence: false,
      hasPolicyTextEvidence: false,
      hasReadableSurfaceSnippetEvidence: false,
      hasStructuredValidationEvidence: false,
      isFallbackOnly: false,
      issueCount: 0,
      signalCount: 0,
      sourceCount: 0,
      sourceKinds: [],
      validationCount: 0
    },
    concernContext: {
      assertionLevels: [],
      evidenceStrengthFlags: [],
      externalSurfacingEligibilities: ["eligible"],
      negativeEvidenceFlags: [],
      originTypes: [],
      promotionEligibilities: ["eligible"]
    },
    evidence: {
      flags: [],
      pageUrls: [],
      snippets: [],
      sourceUrls: []
    },
    primaryPageUrl: null,
    severity: "medium",
    sourceRefs: [],
    summary: unifiedFindingId,
    title: unifiedFindingId,
    unifiedFindingId,
    ...overrides
  };
}

test("policy validator passes for the current explicit registry", () => {
  const result = validateUnifiedFindingSurfacingPolicyEntries();
  assert.equal(result.isValid, true);
  assert.deepEqual(result.issues, []);
});

test("policy validator fails when a required finding entry is missing", () => {
  const partialRegistry = { ...UNIFIED_FINDING_SURFACING_POLICY_REGISTRY };
  delete partialRegistry.preconsent_tracking;

  const result = validateUnifiedFindingSurfacingPolicyRegistry(partialRegistry);
  assert.equal(result.isValid, false);
  assert.ok(result.issues.some((issue) => issue.findingId === "preconsent_tracking" && issue.issue === "missing_policy_entry"));
});

test("policy validator fails when a finding entry is incomplete", () => {
  const partialRegistry = {
    ...UNIFIED_FINDING_SURFACING_POLICY_REGISTRY,
    preconsent_tracking: {
      findingId: "preconsent_tracking"
    } as UnifiedFindingSurfacingPolicyEntry
  };

  const result = validateUnifiedFindingSurfacingPolicyRegistry(partialRegistry);
  assert.equal(result.isValid, false);
  assert.ok(result.issues.some((issue) => issue.findingId === "preconsent_tracking" && issue.issue === "missing_family"));
});

test("contradiction beats generic absence while retaining the absence as support context", () => {
  const evaluation = evaluateUnifiedFindingSurfacing({
    packets: [
      makePacket("policy_behavior_conflict", {
        confidenceBand: "high",
        confidenceInputs: {
          ...makePacket("policy_behavior_conflict").confidenceInputs,
          hasDirectRuntimeEvidence: true,
          hasPolicyTextEvidence: true
        },
	        details: {
	          family: "contradiction",
	          kind: "policy_behavior_conflict",
	          claim: "Optional analytics and advertising cookies are controlled by consent preferences.",
	          contradictionBasis: "Policy promised optional tracking would follow consent preferences, but runtime evidence showed tracking before consent.",
	          bridgeGeneratedBy: "wc01.test",
	          bridgeMappingType: "deterministic_policy_runtime_mapping",
	          bridgeMappingVersion: "policy_behavior_conflict_map:v1",
	          bridgeRuleId: "test.policy_behavior_cookie_preferences_preconsent_v1",
	          conflictBridgeReasoning: "Cookie preferences policy evidence is paired with concrete pre-consent advertising request evidence.",
	          conflictSupportsPromotion: true,
	          conflictType: "declared_cookie_choices_available_but_non_essential_tracking_fired_pre_choice",
	          contradictionPromotionEligible: true,
	          contradictionReviewStatus: "complete",
	          policyAnchorRef: "policy:privacy#cookies",
	          policyClaimType: "cookie_preferences_available",
	          policySnippet: "We use optional analytics and advertising cookies only after you set cookie preferences or consent.",
	          policySourceUrl: "https://example.com/privacy",
	          runtimeAnchorRef: "request:https://ads.example.net/pixel.js",
	          runtimeEvidenceArtifacts: ["https://ads.example.net/pixel.js"],
	          runtimeObservationType: "marketing_vendor_fired_pre_consent",
	          runtimePhase: "pre_consent",
	          sourceEvidenceIds: ["policy:privacy#cookies", "request:https://ads.example.net/pixel.js"],
	          vendors: ["Example Ads"]
	        }
	      }),
      makePacket("privacy_policy_missing_surface", {
        details: {
          attemptCount: 1,
          bestDiscoverySource: "footer_link",
          family: "coverage_gap",
          gapKind: "surface_missing",
          guessedOnly: false,
          pageType: "privacy_policy"
        }
      })
    ]
  });

  const contradiction = evaluation.debugDecisions.find((decision) => decision.unifiedFindingId === "policy_behavior_conflict");
  const absence = evaluation.debugDecisions.find((decision) => decision.unifiedFindingId === "privacy_policy_missing_surface");

  assert.equal(contradiction?.decisionState, "confirmed");
  assert.equal(contradiction?.reportLane, "main");
  assert.equal(absence?.decisionState, "support_only");
  assert.equal(absence?.supportTargetId, "policy_behavior_conflict");
});

test("suppresses contradictory missing-surface findings when a matching positive surface finding exists", () => {
  const evaluation = evaluateUnifiedFindingSurfacing({
    packets: [
      makePacket("privacy_contact_channel_missing"),
      makePacket("privacy_contact_path_present", {
        confidenceBand: "low",
        confidenceInputs: {
          ...makePacket("privacy_contact_path_present").confidenceInputs,
          hasPolicyTextEvidence: true,
          hasReadableSurfaceSnippetEvidence: true
        }
      }),
      makePacket("accessibility_support_path_missing"),
      makePacket("accessibility_support_path_present", {
        confidenceBand: "low",
        confidenceInputs: {
          ...makePacket("accessibility_support_path_present").confidenceInputs,
          hasKeyPageDiscoveryEvidence: true,
          hasReadableSurfaceSnippetEvidence: true
        }
      })
    ]
  });

  const privacyMissing = evaluation.debugDecisions.find((decision) => decision.unifiedFindingId === "privacy_contact_channel_missing");
  const privacyPresent = evaluation.debugDecisions.find((decision) => decision.unifiedFindingId === "privacy_contact_path_present");
  const accessibilityMissing = evaluation.debugDecisions.find((decision) => decision.unifiedFindingId === "accessibility_support_path_missing");
  const accessibilityPresent = evaluation.debugDecisions.find((decision) => decision.unifiedFindingId === "accessibility_support_path_present");

  assert.equal(privacyMissing?.decisionState, "suppressed");
  assert.equal(privacyMissing?.reportLane, "suppressed");
  assert.equal(privacyPresent?.reportable, true);
  assert.equal(accessibilityMissing?.decisionState, "suppressed");
  assert.equal(accessibilityMissing?.reportLane, "suppressed");
  assert.equal(accessibilityPresent?.reportable, true);
});

test("keeps generic privacy contact pages support-only without privacy-specific contact text", () => {
  const evaluation = evaluateUnifiedFindingSurfacing({
    packets: [
      makePacket("privacy_contact_path_present", {
        confidenceInputs: {
          ...makePacket("privacy_contact_path_present").confidenceInputs,
          hasPolicyTextEvidence: true,
          hasReadableSurfaceSnippetEvidence: true
        },
        evidence: {
          flags: [],
          pageUrls: ["https://example.com/contact"],
          snippets: ["Contact our support team for questions about your account."],
          sourceUrls: []
        }
      })
    ]
  });

  const decision = evaluation.debugDecisions.find((entry) => entry.unifiedFindingId === "privacy_contact_path_present");
  assert.equal(decision?.decisionState, "support_only");
  assert.equal(decision?.reportLane, "confidence_and_coverage");
});

test("surfaces privacy contact paths only with privacy-specific contact evidence", () => {
  const evaluation = evaluateUnifiedFindingSurfacing({
    packets: [
      makePacket("privacy_contact_path_present", {
        confidenceInputs: {
          ...makePacket("privacy_contact_path_present").confidenceInputs,
          hasPolicyTextEvidence: true,
          hasReadableSurfaceSnippetEvidence: true
        },
        evidence: {
          flags: [],
          pageUrls: ["https://example.com/privacy"],
          snippets: ["To exercise privacy rights or contact our privacy team, email privacy@example.com."],
          sourceUrls: []
        }
      })
    ]
  });

  const decision = evaluation.debugDecisions.find((entry) => entry.unifiedFindingId === "privacy_contact_path_present");
  assert.equal(decision?.decisionState, "review");
  assert.equal(decision?.reportLane, "main");
});

test("keeps audit-only pre-consent tracking out of main surfacing", () => {
  const evaluation = evaluateUnifiedFindingSurfacing({
    packets: [
      makePacket("preconsent_tracking", {
        concernContext: {
          assertionLevels: ["weak"],
          evidenceStrengthFlags: ["direct_runtime"],
          externalSurfacingEligibilities: ["audit_only"],
          negativeEvidenceFlags: ["missing_concrete_preconsent_artifact"],
          originTypes: ["snapshot_signal"],
          promotionEligibilities: ["internal_only"]
        },
        confidenceInputs: {
          ...makePacket("preconsent_tracking").confidenceInputs,
          hasDirectRuntimeEvidence: true
        },
        details: {
          family: "consent_tracking",
          kind: "preconsent_tracking"
        }
      })
    ]
  });

  const decision = evaluation.debugDecisions.find((entry) => entry.unifiedFindingId === "preconsent_tracking");
  assert.equal(decision?.decisionState, "suppressed");
  assert.equal(decision?.reportLane, "suppressed");
});

test("pre-consent packet evidence can promote stale audit-only concern context", () => {
  const requestUrl = "https://tags-eu.tiqcdn.com/utag/example/prod/utag.js";
  const evaluation = evaluateUnifiedFindingSurfacing({
    packets: [
      makePacket("preconsent_tracking", {
        concernContext: {
          assertionLevels: ["weak"],
          evidenceStrengthFlags: ["direct_runtime"],
          externalSurfacingEligibilities: ["audit_only"],
          negativeEvidenceFlags: [
            "missing_concrete_preconsent_artifact",
            "missing_preconsent_sequence_evidence"
          ],
          originTypes: ["snapshot_signal"],
          promotionEligibilities: ["internal_only"]
        },
        confidenceInputs: {
          ...makePacket("preconsent_tracking").confidenceInputs,
          hasDirectRuntimeEvidence: true
        },
        details: {
          family: "consent_tracking",
          kind: "preconsent_tracking",
          requestUrls: [requestUrl],
          vendors: ["Tealium"]
        },
        evidence: {
          flags: ["privacy.preconsent_tracking_detected"],
          pageUrls: [],
          snippets: [],
          sourceUrls: [],
          entities: {
            consentActionableChoiceObserved: ["true"],
            consentSurfaceObserved: ["true"],
            consentTimeline: [
              JSON.stringify({
                firstCmpVisibleMs: 0,
                firstConsentActionMs: null,
                firstNonEssentialRequestMs: 3317,
                navigationStartMs: 0
              })
            ],
            requestPurposeClassificationConfidence: [
              JSON.stringify({
                category: "tag_management",
                confidence: 0.85,
                essentiality: "non_essential",
                requestUrl,
                timestampMs: 3317,
                tsMs: 3317,
                vendor: "Tealium"
              })
            ],
            runtimeRequestUrls: [requestUrl],
            runtimeVendors: ["Tealium"]
          }
        },
        severity: "high"
      })
    ]
  });

  const decision = evaluation.debugDecisions.find((entry) => entry.unifiedFindingId === "preconsent_tracking");
  assert.equal(decision?.decisionState, "confirmed");
  assert.equal(decision?.reportLane, "main");
  assert.ok(decision?.appliedRules.includes("evidence.preconsent.confirmed_when_validation_and_runtime_artifacts"));
});

test("blocking overlay stays support-only and supports stronger consent findings", () => {
  const overlayPacket = makePacket("blocking_overlay_observed", {
    confidenceInputs: {
      ...makePacket("blocking_overlay_observed").confidenceInputs,
      hasDirectRuntimeEvidence: true
    },
    details: {
      family: "context",
      kind: "blocking_overlay_observed"
    },
    evidence: {
      ...makePacket("blocking_overlay_observed").evidence,
      flags: ["blocking_overlay_observed", "overlay_interaction_blocked"],
      snippets: ["A blocking consent overlay was observed with accept and reject controls on the same layer."]
    }
  });

  const standalone = evaluateUnifiedFindingSurfacing({
    packets: [overlayPacket]
  });

  const paired = evaluateUnifiedFindingSurfacing({
    packets: [
      makePacket("preconsent_tracking", {
        confidenceInputs: {
          ...makePacket("preconsent_tracking").confidenceInputs,
          hasDirectRuntimeEvidence: true,
          hasStructuredValidationEvidence: true
        },
        details: {
          family: "consent_tracking",
          kind: "preconsent_tracking"
        },
        evidence: {
          ...makePacket("preconsent_tracking").evidence,
          entities: {
            runtimeRequestUrls: ["https://tracker.example/collect"]
          },
          sourceUrls: ["https://tracker.example/collect"]
        },
        severity: "high"
      }),
      overlayPacket
    ]
  });

  const standaloneDecision = standalone.debugDecisions.find((decision) => decision.unifiedFindingId === "blocking_overlay_observed");
  const pairedOverlayDecision = paired.debugDecisions.find((decision) => decision.unifiedFindingId === "blocking_overlay_observed");
  const pairedTrackingDecision = paired.debugDecisions.find((decision) => decision.unifiedFindingId === "preconsent_tracking");

  assert.equal(standaloneDecision?.decisionState, "support_only");
  assert.equal(standaloneDecision?.reportLane, "confidence_and_coverage");
  assert.equal(pairedTrackingDecision?.decisionState, "review");
  assert.equal(pairedTrackingDecision?.reportLane, "main");
  assert.equal(pairedTrackingDecision?.supports.includes("blocking_overlay_observed"), true);
  assert.equal(pairedOverlayDecision?.decisionState, "support_only");
  assert.equal(pairedOverlayDecision?.supportTargetId, "preconsent_tracking");
  assert.equal(pairedOverlayDecision?.reportLane, "main");
});

test("keeps audit-only consent contradiction out of main surfacing", () => {
  const evaluation = evaluateUnifiedFindingSurfacing({
    packets: [
      makePacket("consent_gated_tracking_claim_conflict", {
        concernContext: {
          assertionLevels: ["weak"],
          evidenceStrengthFlags: ["policy_text"],
          externalSurfacingEligibilities: ["audit_only"],
          negativeEvidenceFlags: ["missing_behavior_side_evidence"],
          originTypes: ["snapshot_signal"],
          promotionEligibilities: ["internal_only"]
        },
        confidenceInputs: {
          ...makePacket("consent_gated_tracking_claim_conflict").confidenceInputs,
          hasPolicyTextEvidence: true
        },
        details: {
          family: "contradiction",
          kind: "consent_gated_tracking_claim_conflict"
        }
      })
    ]
  });

  const decision = evaluation.debugDecisions.find(
    (entry) => entry.unifiedFindingId === "consent_gated_tracking_claim_conflict"
  );
  assert.equal(decision?.decisionState, "suppressed");
  assert.equal(decision?.reportLane, "suppressed");
});

test("specific consent-gating contradiction demotes generic pre-consent tracking to support", () => {
  const evaluation = evaluateUnifiedFindingSurfacing({
    packets: [
      makePacket("consent_gated_tracking_claim_conflict", {
        confidenceInputs: {
          ...makePacket("consent_gated_tracking_claim_conflict").confidenceInputs,
          hasDirectRuntimeEvidence: true,
          hasPolicyTextEvidence: true
        },
        details: {
	          family: "contradiction",
	          kind: "consent_gated_tracking_claim_conflict",
	          claim: "Optional analytics and advertising cookies are controlled by cookie preferences and consent.",
	          contradictionBasis: "The policy and consent surface says optional tracking follows cookie preferences, but tracking began before consent.",
	          bridgeGeneratedBy: "wc01.test",
	          bridgeMappingType: "deterministic_policy_runtime_mapping",
	          bridgeMappingVersion: "policy_behavior_conflict_map:v1",
	          bridgeRuleId: "test.policy_behavior_cookie_preferences_preconsent_v1",
	          conflictBridgeReasoning: "Cookie preference policy evidence is paired with concrete pre-consent tracker request evidence.",
	          conflictSupportsPromotion: true,
	          conflictType: "declared_cookie_choices_available_but_non_essential_tracking_fired_pre_choice",
	          contradictionPromotionEligible: true,
	          contradictionReviewStatus: "complete",
	          policyAnchorRef: "policy:privacy#cookies",
	          policyClaimType: "cookie_preferences_available",
	          policySnippet: "We use optional analytics and advertising cookies only after you set cookie preferences or consent.",
	          policySourceUrl: "https://example.com/privacy",
	          runtimeAnchorRef: "request:https://www.googletagmanager.com/gtm.js",
	          runtimeEvidenceArtifacts: ["https://www.googletagmanager.com/gtm.js"],
	          runtimeObservationType: "marketing_vendor_fired_pre_consent",
	          runtimePhase: "pre_consent",
	          sourceEvidenceIds: ["policy:privacy#cookies", "request:https://www.googletagmanager.com/gtm.js"],
	          vendors: ["Google Tag Manager"]
	        },
        evidence: {
          flags: [],
          entities: {
            runtimeRequestUrls: ["https://www.googletagmanager.com/gtm.js"],
            runtimeVendors: ["Google Tag Manager"]
          },
          pageUrls: [],
          snippets: [],
          sourceUrls: []
        }
      }),
      makePacket("preconsent_tracking", {
        details: {
          family: "consent_tracking",
          kind: "preconsent_tracking",
          requestUrls: ["https://www.googletagmanager.com/gtm.js"],
          vendors: ["Google Tag Manager"]
        }
      })
    ]
  });

  const contradiction = evaluation.debugDecisions.find((decision) => decision.unifiedFindingId === "consent_gated_tracking_claim_conflict");
  const preconsent = evaluation.debugDecisions.find((decision) => decision.unifiedFindingId === "preconsent_tracking");

  assert.equal(contradiction?.decisionState, "confirmed");
  assert.equal(preconsent?.decisionState, "support_only");
  assert.equal(preconsent?.supportTargetId, "consent_gated_tracking_claim_conflict");
});

test("weak cookie attributes default to audit-only and support stronger runtime findings", () => {
  const weakCookiePacket = makePacket("weak_cookie_security_attributes", {
    evidence: {
      counts: {
        missingHttpOnlyCount: 1
      },
      entities: {
        missingHttpOnlyCookieNames: ["_ga"]
      },
      flags: ["privacy.weak_cookie_security_attributes_detected"],
      pageUrls: [],
      snippets: [],
      sourceUrls: []
    }
  });

  const defaultEvaluation = evaluateUnifiedFindingSurfacing({ packets: [weakCookiePacket] });
  const defaultDecision = defaultEvaluation.debugDecisions.find((decision) => decision.unifiedFindingId === "weak_cookie_security_attributes");
  assert.equal(defaultDecision?.decisionState, "support_only");
  assert.equal(defaultDecision?.reportLane, "confidence_and_coverage");

  const pairedEvaluation = evaluateUnifiedFindingSurfacing({
    packets: [
      makePacket("preconsent_tracking", {
        concernContext: {
          assertionLevels: ["strong"],
          evidenceStrengthFlags: ["direct_runtime"],
          externalSurfacingEligibilities: ["eligible"],
          negativeEvidenceFlags: [],
          originTypes: ["validation_rule"],
          promotionEligibilities: ["eligible"]
        },
        confidenceInputs: {
          ...makePacket("preconsent_tracking").confidenceInputs,
          hasDirectRuntimeEvidence: true
        },
        details: {
          family: "consent_tracking",
          kind: "preconsent_tracking",
          requestUrls: ["https://analytics.example.net/collect"],
          vendors: ["Example Analytics"]
        }
      }),
      weakCookiePacket
    ]
  });

  const weakCookieDecision = pairedEvaluation.debugDecisions.find((decision) => decision.unifiedFindingId === "weak_cookie_security_attributes");
  const preconsentDecision = pairedEvaluation.debugDecisions.find((decision) => decision.unifiedFindingId === "preconsent_tracking");
  assert.equal(preconsentDecision?.supports.includes("weak_cookie_security_attributes"), true);
  assert.equal(weakCookieDecision?.decisionState, "support_only");
  assert.equal(weakCookieDecision?.supportTargetId, "preconsent_tracking");
  assert.equal(weakCookieDecision?.reportLane, "main");
});

test("weak cookie attributes promote only for security-sensitive cookie evidence", () => {
  const evaluation = evaluateUnifiedFindingSurfacing({
    packets: [
      makePacket("weak_cookie_security_attributes", {
        evidence: {
          counts: {
            missingSecureCount: 1,
            missingHttpOnlyCount: 1
          },
          entities: {
            missingHttpOnlyCookieNames: ["account_token"],
            missingSecureCookieNames: ["session_id"]
          },
          flags: ["privacy.weak_cookie_security_attributes_detected"],
          pageUrls: [],
          snippets: [],
          sourceUrls: []
        }
      })
    ]
  });

  const decision = evaluation.debugDecisions.find((entry) => entry.unifiedFindingId === "weak_cookie_security_attributes");
  assert.equal(decision?.decisionState, "review");
  assert.equal(decision?.reportLane, "main");
});

test("positive present surface suppresses weak contradictory unavailable sibling", () => {
  const evaluation = evaluateUnifiedFindingSurfacing({
    packets: [
      makePacket("privacy_policy_present", {
        confidenceInputs: {
          ...makePacket("privacy_policy_present").confidenceInputs,
          hasCorroboratedPositiveSurfaceEvidence: true,
          hasReadableSurfaceSnippetEvidence: true
        },
        evidence: {
          ...makePacket("privacy_policy_present").evidence,
          pageUrls: ["https://www.example.com/privacy"],
          snippets: ["Privacy Policy | Example"]
        }
      }),
      makePacket("privacy_policy_unavailable", {
        details: {
          attemptCount: 1,
          bestDiscoverySource: null,
          family: "coverage_gap",
          gapKind: "fetch_failed",
          guessedOnly: true,
          pageType: "privacy_policy"
        }
      })
    ]
  });

  const present = evaluation.debugDecisions.find((decision) => decision.unifiedFindingId === "privacy_policy_present");
  const unavailable = evaluation.debugDecisions.find((decision) => decision.unifiedFindingId === "privacy_policy_unavailable");

  assert.equal(present?.decisionState, "support_only");
  assert.equal(unavailable?.decisionState, "suppressed");
  assert.equal(unavailable?.suppressedBy, "privacy_policy_present");
  assert.ok(unavailable?.appliedRules.includes("precedence.present_surface_beats_weak_absence"));
});

test("privacy rights and contact paths surface when page-attributed policy evidence is strong", () => {
  const evaluation = evaluateUnifiedFindingSurfacing({
    packets: [
      makePacket("privacy_rights_path_present", {
        confidenceInputs: {
          ...makePacket("privacy_rights_path_present").confidenceInputs,
          hasPageAttribution: true,
          hasPolicyTextEvidence: true,
          hasReadableSurfaceSnippetEvidence: true
        },
        evidence: {
          ...makePacket("privacy_rights_path_present").evidence,
          pageUrls: ["https://www.example.com/privacy"],
          snippets: ["Use our Privacy Rights Center to submit access and deletion requests."]
        }
      }),
      makePacket("privacy_contact_path_present", {
        confidenceInputs: {
          ...makePacket("privacy_contact_path_present").confidenceInputs,
          hasPageAttribution: true,
          hasPolicyTextEvidence: true,
          hasReadableSurfaceSnippetEvidence: true
        },
        evidence: {
          ...makePacket("privacy_contact_path_present").evidence,
          pageUrls: ["https://www.example.com/privacy"],
          snippets: ["If you have questions about this Privacy Policy, contact privacy@example.com."]
        }
      })
    ]
  });

  const rightsPath = evaluation.debugDecisions.find((decision) => decision.unifiedFindingId === "privacy_rights_path_present");
  const contactPath = evaluation.debugDecisions.find((decision) => decision.unifiedFindingId === "privacy_contact_path_present");

  assert.equal(rightsPath?.decisionState, "review");
  assert.equal(rightsPath?.reportLane, "main");
  assert.ok(rightsPath?.appliedRules.includes("evidence.positive_surface.review_high_value_policy_path"));
  assert.equal(contactPath?.decisionState, "review");
  assert.equal(contactPath?.reportLane, "main");
  assert.ok(contactPath?.appliedRules.includes("evidence.positive_surface.review_high_value_policy_path"));
});

test("privacy rights and contact paths surface from retained structured policy metadata", () => {
  const evaluation = evaluateUnifiedFindingSurfacing({
    packets: [
      makePacket("privacy_rights_path_present", {
        confidenceInputs: {
          ...makePacket("privacy_rights_path_present").confidenceInputs,
          hasPageAttribution: true,
          hasPolicyTextEvidence: true,
          hasReadableSurfaceSnippetEvidence: true
        },
        evidence: {
          ...makePacket("privacy_rights_path_present").evidence,
          entities: {
            policyDsarMechanism: ["form"],
            policyRightsSignals: ["access", "delete"]
          },
          pageUrls: ["https://www.example.com/privacy"],
          snippets: ["You can manage your personal information through this policy."]
        }
      }),
      makePacket("privacy_contact_path_present", {
        confidenceInputs: {
          ...makePacket("privacy_contact_path_present").confidenceInputs,
          hasPageAttribution: true,
          hasPolicyTextEvidence: true,
          hasReadableSurfaceSnippetEvidence: true
        },
        evidence: {
          ...makePacket("privacy_contact_path_present").evidence,
          entities: {
            privacyContactChannelType: ["form"]
          },
          pageUrls: ["https://www.example.com/privacy"],
          snippets: ["Contact us with questions about your personal information."]
        }
      })
    ]
  });

  const rightsPath = evaluation.debugDecisions.find((decision) => decision.unifiedFindingId === "privacy_rights_path_present");
  const contactPath = evaluation.debugDecisions.find((decision) => decision.unifiedFindingId === "privacy_contact_path_present");

  assert.equal(rightsPath?.decisionState, "review");
  assert.equal(rightsPath?.reportLane, "main");
  assert.ok(rightsPath?.appliedRules.includes("evidence.positive_surface.review_high_value_policy_path"));
  assert.equal(contactPath?.decisionState, "review");
  assert.equal(contactPath?.reportLane, "main");
  assert.ok(contactPath?.appliedRules.includes("evidence.positive_surface.review_high_value_policy_path"));
});

test("high-value privacy disclosures surface when page-attributed policy evidence is strong", () => {
  const evaluation = evaluateUnifiedFindingSurfacing({
    packets: [
      makePacket("gpc_disclosure_present", {
        confidenceInputs: {
          ...makePacket("gpc_disclosure_present").confidenceInputs,
          hasPageAttribution: true,
          hasPolicyTextEvidence: true,
          hasReadableSurfaceSnippetEvidence: true
        },
        evidence: {
          ...makePacket("gpc_disclosure_present").evidence,
          pageUrls: ["https://www.example.com/privacy"],
          snippets: ["We honor Global Privacy Control browser signals where required by law."]
        }
      }),
      makePacket("tracking_technologies_disclosure_present", {
        confidenceInputs: {
          ...makePacket("tracking_technologies_disclosure_present").confidenceInputs,
          hasPageAttribution: true,
          hasPolicyTextEvidence: true,
          hasReadableSurfaceSnippetEvidence: true
        },
        evidence: {
          ...makePacket("tracking_technologies_disclosure_present").evidence,
          pageUrls: ["https://www.example.com/privacy"],
          snippets: ["We use cookies and similar tracking technologies for analytics and service functionality."]
        }
      }),
      makePacket("behavioral_analytics_disclosure_present", {
        confidenceInputs: {
          ...makePacket("behavioral_analytics_disclosure_present").confidenceInputs,
          hasPageAttribution: true,
          hasPolicyTextEvidence: true,
          hasReadableSurfaceSnippetEvidence: true
        },
        evidence: {
          ...makePacket("behavioral_analytics_disclosure_present").evidence,
          pageUrls: ["https://www.example.com/privacy"],
          snippets: ["We use behavioral analytics and session recording to understand how visitors use the site."]
        }
      })
    ]
  });

  const gpc = evaluation.debugDecisions.find((decision) => decision.unifiedFindingId === "gpc_disclosure_present");
  const tracking = evaluation.debugDecisions.find((decision) => decision.unifiedFindingId === "tracking_technologies_disclosure_present");
  const behavioralAnalytics = evaluation.debugDecisions.find((decision) => decision.unifiedFindingId === "behavioral_analytics_disclosure_present");

  assert.equal(gpc?.decisionState, "review");
  assert.equal(gpc?.reportLane, "main");
  assert.ok(gpc?.appliedRules.includes("evidence.positive_surface.review_high_value_privacy_disclosure"));
  assert.equal(tracking?.decisionState, "review");
  assert.equal(tracking?.reportLane, "main");
  assert.ok(tracking?.appliedRules.includes("evidence.positive_surface.review_high_value_privacy_disclosure"));
  assert.equal(behavioralAnalytics?.decisionState, "review");
  assert.equal(behavioralAnalytics?.reportLane, "main");
  assert.ok(behavioralAnalytics?.appliedRules.includes("evidence.positive_surface.review_high_value_privacy_disclosure"));
});

test("strong document-semantic policy clarity evidence surfaces in the main lane", () => {
  const evaluation = evaluateUnifiedFindingSurfacing({
    packets: [
      makePacket("policy_clarity_risk", {
        confidenceInputs: {
          ...makePacket("policy_clarity_risk").confidenceInputs,
          hasPageAttribution: true,
          hasPolicyTextEvidence: true,
          hasReadableSurfaceSnippetEvidence: true
        },
        details: {
          family: "policy_extraction",
          kind: "policy_clarity_risk",
          ambiguityScore: 78,
          confidence: 0.75
        },
        evidence: {
          ...makePacket("policy_clarity_risk").evidence,
          pageUrls: ["https://www.example.com/privacy"],
          snippets: [
            "Our privacy notice describes collection, sharing, and rights, but omits concrete retention, contact, and implementation details."
          ]
        }
      })
    ]
  });

  const clarity = evaluation.debugDecisions.find((decision) => decision.unifiedFindingId === "policy_clarity_risk");

  assert.equal(clarity?.decisionState, "review");
  assert.equal(clarity?.reportLane, "main");
  assert.ok(clarity?.appliedRules.includes("evidence.policy_extraction.review_policy_fitness"));
});

test("placeholder-only policy clarity evidence stays in confidence coverage", () => {
  const evaluation = evaluateUnifiedFindingSurfacing({
    packets: [
      makePacket("policy_clarity_risk", {
        confidenceInputs: {
          ...makePacket("policy_clarity_risk").confidenceInputs,
          hasPageAttribution: true,
          hasPolicyTextEvidence: true,
          hasReadableSurfaceSnippetEvidence: true
        },
        details: {
          family: "policy_extraction",
          kind: "policy_clarity_risk",
          ambiguityScore: 95,
          confidence: 0.8
        },
        evidence: {
          ...makePacket("policy_clarity_risk").evidence,
          flags: ["policyAmbiguityScore"],
          pageUrls: ["https://www.example.com/privacy"],
          snippets: ["nano"]
        }
      })
    ]
  });

  const clarity = evaluation.debugDecisions.find((decision) => decision.unifiedFindingId === "policy_clarity_risk");

  assert.equal(clarity?.decisionState, "review");
  assert.equal(clarity?.reportLane, "confidence_and_coverage");
  assert.ok(clarity?.appliedRules.includes("evidence.policy_extraction.keep_review"));
});

test("low-confidence ambiguity-only policy clarity evidence stays in confidence coverage", () => {
  const evaluation = evaluateUnifiedFindingSurfacing({
    packets: [
      makePacket("policy_clarity_risk", {
        confidenceInputs: {
          ...makePacket("policy_clarity_risk").confidenceInputs,
          hasPageAttribution: true,
          hasPolicyTextEvidence: true,
          hasReadableSurfaceSnippetEvidence: true
        },
        details: {
          family: "policy_extraction",
          kind: "policy_clarity_risk",
          ambiguityScore: 90,
          confidence: 0.2
        },
        evidence: {
          ...makePacket("policy_clarity_risk").evidence,
          pageUrls: ["https://www.example.com/privacy"],
          snippets: ["The retained policy text is sparse, but no separate structural weakness or boilerplate evidence was retained."]
        }
      })
    ]
  });

  const clarity = evaluation.debugDecisions.find((decision) => decision.unifiedFindingId === "policy_clarity_risk");

  assert.equal(clarity?.decisionState, "review");
  assert.equal(clarity?.reportLane, "confidence_and_coverage");
  assert.ok(clarity?.appliedRules.includes("evidence.policy_extraction.keep_review"));
});

test("affiliate disclosure present stays support context rather than becoming a top finding", () => {
  const evaluation = evaluateUnifiedFindingSurfacing({
    packets: [
      makePacket("affiliate_disclosure_present", {
        confidenceInputs: {
          ...makePacket("affiliate_disclosure_present").confidenceInputs,
          hasPageAttribution: true,
          hasReadableSurfaceSnippetEvidence: true
        },
        evidence: {
          ...makePacket("affiliate_disclosure_present").evidence,
          pageUrls: ["https://www.example.com/affiliate-disclosure"],
          snippets: ["We may earn a commission from purchases made through links on this page."]
        }
      })
    ]
  });

  const decision = evaluation.debugDecisions[0];
  assert.equal(decision?.decisionState, "support_only");
  assert.notEqual(decision?.reportLane, "main");
  assert.ok(decision?.appliedRules.includes("support.orphan_positive_surface_retained"));
});

test("affiliate disclosure scope gap can surface when the projected finding is page-attributed", () => {
  const evaluation = evaluateUnifiedFindingSurfacing({
    packets: [
      makePacket("affiliate_disclosure_scope_limited", {
        confidenceInputs: {
          ...makePacket("affiliate_disclosure_scope_limited").confidenceInputs,
          hasPageAttribution: true,
          hasReadableSurfaceSnippetEvidence: true
        },
        evidence: {
          ...makePacket("affiliate_disclosure_scope_limited").evidence,
          pageUrls: ["https://www.example.com/affiliate-disclosure"],
          snippets: [
            "The retained affiliate disclosure evidence came from a dedicated disclosure surface, but the scan did not retain page-attributed evidence showing that disclosure near specific recommendations."
          ]
        }
      })
    ]
  });

  const decision = evaluation.debugDecisions[0];
  assert.equal(decision?.decisionState, "review");
  assert.equal(decision?.reportLane, "main");
  assert.ok(decision?.appliedRules.includes("evidence.policy_extraction.review_disclosure_placement"));
});

test("unresolved low-confidence absence still surfaces in confidence and coverage", () => {
  const evaluation = evaluateUnifiedFindingSurfacing({
    packets: [
      makePacket("bounded_key_page_discovery_unresolved", {
        confidenceBand: "low",
        details: {
          attemptCount: 3,
          family: "coverage_gap",
          gapKind: "bounded_discovery_unresolved",
          pageType: "privacy_policy"
        }
      })
    ]
  });

  const decision = evaluation.debugDecisions[0];
  assert.equal(decision?.decisionState, "review");
  assert.equal(decision?.reportLane, "confidence_and_coverage");
  assert.equal(decision?.reportable, true);
});

test("strongly evidenced key-page absence becomes a main confirmed finding", () => {
  const evaluation = evaluateUnifiedFindingSurfacing({
    packets: [
      makePacket("privacy_policy_missing_surface", {
        details: {
          attemptCount: 2,
          bestDiscoverySource: "footer_link",
          family: "coverage_gap",
          gapKind: "surface_missing",
          guessedOnly: false,
          pageType: "privacy_policy"
        }
      })
    ]
  });

  const decision = evaluation.debugDecisions[0];
  assert.equal(decision?.decisionState, "confirmed");
  assert.equal(decision?.reportLane, "main");
  assert.equal(decision?.surfaceTier, "section");
});

test("positive-presence findings stay in confidence coverage when no stronger finding exists", () => {
  const evaluation = evaluateUnifiedFindingSurfacing({
    packets: [
      makePacket("privacy_policy_present", {
        confidenceInputs: {
          ...makePacket("privacy_policy_present").confidenceInputs,
          hasCorroboratedPositiveSurfaceEvidence: true,
          hasReadableSurfaceSnippetEvidence: true
        }
      })
    ]
  });

  const decision = evaluation.debugDecisions[0];
  assert.equal(decision?.decisionState, "support_only");
  assert.equal(decision?.reportLane, "confidence_and_coverage");
  assert.equal(decision?.reportable, true);
  assert.ok(decision?.appliedRules.includes("support.orphan_positive_surface_retained"));
});

test("substantive cookie policy surfaces can main-lane as review-level positive evidence", () => {
  const strongCookiePolicyEvaluation = evaluateUnifiedFindingSurfacing({
    packets: [
      makePacket("cookie_policy_present", {
        confidenceInputs: {
          ...makePacket("cookie_policy_present").confidenceInputs,
          hasPolicyTextEvidence: true,
          hasReadableSurfaceSnippetEvidence: true
        },
        evidence: {
          ...makePacket("cookie_policy_present").evidence,
          pageUrls: ["https://example.com/legal/cookie-policy"],
          snippets: ["Our Cookie Policy explains the cookies and similar technologies we use and how to manage cookie preferences."]
        }
      })
    ]
  });
  const weakCookiePolicyEvaluation = evaluateUnifiedFindingSurfacing({
    packets: [
      makePacket("cookie_policy_present", {
        confidenceInputs: {
          ...makePacket("cookie_policy_present").confidenceInputs,
          hasPolicyTextEvidence: true,
          hasReadableSurfaceSnippetEvidence: true
        },
        evidence: {
          ...makePacket("cookie_policy_present").evidence,
          pageUrls: ["https://example.com/privacy"],
          snippets: ["This website uses cookies."]
        }
      })
    ]
  });

  assert.equal(strongCookiePolicyEvaluation.debugDecisions[0]?.decisionState, "review");
  assert.equal(strongCookiePolicyEvaluation.debugDecisions[0]?.reportLane, "main");
  assert.equal(weakCookiePolicyEvaluation.debugDecisions[0]?.decisionState, "support_only");
  assert.equal(weakCookiePolicyEvaluation.debugDecisions[0]?.reportLane, "confidence_and_coverage");
});

test("generic policy text is not enough to main-lane behavioral analytics disclosure", () => {
  const genericEvaluation = evaluateUnifiedFindingSurfacing({
    packets: [
      makePacket("behavioral_analytics_disclosure_present", {
        confidenceInputs: {
          ...makePacket("behavioral_analytics_disclosure_present").confidenceInputs,
          hasPageAttribution: true,
          hasPolicyTextEvidence: true,
          hasReadableSurfaceSnippetEvidence: true
        },
        evidence: {
          ...makePacket("behavioral_analytics_disclosure_present").evidence,
          pageUrls: ["https://www.example.com/privacy"],
          snippets: ["We use analytics to understand site performance and improve our services."]
        }
      })
    ]
  });
  const specificEvaluation = evaluateUnifiedFindingSurfacing({
    packets: [
      makePacket("behavioral_analytics_disclosure_present", {
        confidenceInputs: {
          ...makePacket("behavioral_analytics_disclosure_present").confidenceInputs,
          hasPageAttribution: true,
          hasPolicyTextEvidence: true,
          hasReadableSurfaceSnippetEvidence: true
        },
        evidence: {
          ...makePacket("behavioral_analytics_disclosure_present").evidence,
          pageUrls: ["https://www.example.com/privacy"],
          snippets: [
            "We use analytics tools (e.g., Google Analytics) and session cookies to understand how visitors use our Services."
          ]
        }
      })
    ]
  });

  const behavioralAnalytics = genericEvaluation.debugDecisions.find((decision) => decision.unifiedFindingId === "behavioral_analytics_disclosure_present");
  const specificBehavioralAnalytics = specificEvaluation.debugDecisions.find(
    (decision) => decision.unifiedFindingId === "behavioral_analytics_disclosure_present"
  );

  assert.equal(behavioralAnalytics?.decisionState, "support_only");
  assert.equal(behavioralAnalytics?.reportLane, "confidence_and_coverage");
  assert.ok(behavioralAnalytics?.appliedRules.includes("evidence.positive_surface.support_only"));
  assert.equal(specificBehavioralAnalytics?.decisionState, "review");
  assert.equal(specificBehavioralAnalytics?.reportLane, "main");
});

test("structured policy disclosure gaps stay review-level without runtime corroboration", () => {
  const evaluation = evaluateUnifiedFindingSurfacing({
    packets: [
      makePacket("data_categories_disclosure_missing", {
        confidenceInputs: {
          ...makePacket("data_categories_disclosure_missing").confidenceInputs,
          hasPolicyTextEvidence: true,
          hasReadableSurfaceSnippetEvidence: true,
          hasStructuredValidationEvidence: true
        }
      })
    ]
  });

  const decision = evaluation.debugDecisions[0];
  assert.equal(decision?.decisionState, "review");
  assert.equal(decision?.reportLane, "main");
  assert.ok(decision?.appliedRules.includes("evidence.rights_gap.review_structured_policy_gap"));
});

test("high-exposure rights gaps confirm when structured validation strongly backs them", () => {
  const evaluation = evaluateUnifiedFindingSurfacing({
    packets: [
      makePacket("sale_sharing_controls_missing", {
        confidenceInputs: {
          ...makePacket("sale_sharing_controls_missing").confidenceInputs,
          hasStructuredValidationEvidence: true,
          hasPolicyTextEvidence: true
        }
      })
    ]
  });

  const decision = evaluation.debugDecisions[0];
  assert.equal(decision?.decisionState, "confirmed");
  assert.equal(decision?.reportLane, "main");
  assert.ok(decision?.appliedRules.includes("evidence.rights_gap.confirmed_high_exposure_or_runtime"));
});

test("latest policy absence findings confirm only with structured validation and fetched policy evidence", () => {
  const absenceFindingIds = [
    "missing_dsar_mechanism",
    "missing_transfer_disclosure"
  ] as const satisfies readonly ReportUnifiedFindingId[];

  const evaluation = evaluateUnifiedFindingSurfacing({
    packets: absenceFindingIds.map((findingId) =>
      {
        const absenceEvidence: {
          entities?: Record<string, string[]>;
          flags: string[];
          snippets: string[];
        } =
          findingId === "missing_dsar_mechanism"
            ? {
                entities: { policyDsarMechanism: ["absent"] },
                flags: ["policy_field:dsar_path:absent"],
                snippets: ["The privacy policy was reviewed and no concrete DSAR request mechanism was found."]
              }
            : {
                flags: [],
                snippets: ["The privacy policy was reviewed and no concrete requested disclosure or mechanism was found."]
              };
        return makePacket(findingId, {
          confidenceInputs: {
            ...makePacket(findingId).confidenceInputs,
            hasPolicyTextEvidence: true,
            hasReadableSurfaceSnippetEvidence: true,
            hasStructuredValidationEvidence: true
          },
          evidence: {
            ...makePacket(findingId).evidence,
            entities: absenceEvidence.entities,
            flags: absenceEvidence.flags,
            pageUrls: ["https://example.com/privacy"],
            snippets: absenceEvidence.snippets,
            sourceUrls: ["https://example.com/privacy"]
          }
        });
      }
    )
  });

  for (const findingId of absenceFindingIds) {
    const decision = evaluation.debugDecisions.find((item) => item.unifiedFindingId === findingId);
    assert.equal(decision?.decisionState, "confirmed", findingId);
    assert.equal(decision?.reportLane, "main", findingId);
    assert.ok(decision?.appliedRules.includes("evidence.rights_gap.confirmed_structured_policy_absence"), findingId);
  }
});

test("missing DSAR and transfer findings do not confirm when retained evidence contradicts the absence", () => {
  const evaluation = evaluateUnifiedFindingSurfacing({
    packets: [
      makePacket("missing_dsar_mechanism", {
        confidenceInputs: {
          ...makePacket("missing_dsar_mechanism").confidenceInputs,
          hasPolicyTextEvidence: true,
          hasReadableSurfaceSnippetEvidence: true,
          hasStructuredValidationEvidence: true
        },
        evidence: {
          ...makePacket("missing_dsar_mechanism").evidence,
          counts: {
            policy_coverage_ratio: 0.7,
            policy_semantic_confidence: 0.85
          },
          flags: ["policy_field:dsar_path:found"],
          pageUrls: ["https://example.com/privacy-policy"],
          snippets: ["Use our privacy request form to submit access, deletion, or correction requests."],
          sourceUrls: ["https://example.com/privacy-policy"]
        }
      }),
      makePacket("missing_transfer_disclosure", {
        confidenceInputs: {
          ...makePacket("missing_transfer_disclosure").confidenceInputs,
          hasPolicyTextEvidence: true,
          hasReadableSurfaceSnippetEvidence: true,
          hasStructuredValidationEvidence: true
        },
        evidence: {
          ...makePacket("missing_transfer_disclosure").evidence,
          counts: {
            policy_coverage_ratio: 0.8,
            policy_semantic_confidence: 0.9
          },
          flags: ["policy_field:third_party_sharing:found"],
          pageUrls: ["https://example.com/privacy-policy"],
          snippets: ["We share personal information with service providers, affiliates, and advertising partners."],
          sourceUrls: ["https://example.com/privacy-policy"]
        }
      })
    ]
  });

  for (const findingId of ["missing_dsar_mechanism", "missing_transfer_disclosure"]) {
    const decision = evaluation.debugDecisions.find((item) => item.unifiedFindingId === findingId);
    assert.equal(decision?.decisionState, "review", findingId);
    assert.equal(decision?.reportLane, "confidence_and_coverage", findingId);
    assert.equal(decision?.surfaceTier, "support", findingId);
    assert.ok(decision?.appliedRules.includes("evidence.rights_gap.review_structured_policy_gap"), findingId);
  }
});

test("missing DSAR findings can confirm when retained text mentions rights but no concrete request mechanism", () => {
  const evaluation = evaluateUnifiedFindingSurfacing({
    packets: [
      makePacket("missing_dsar_mechanism", {
        confidenceInputs: {
          ...makePacket("missing_dsar_mechanism").confidenceInputs,
          hasPolicyTextEvidence: true,
          hasReadableSurfaceSnippetEvidence: true,
          hasStructuredValidationEvidence: true
        },
        evidence: {
          ...makePacket("missing_dsar_mechanism").evidence,
          counts: {
            policy_coverage_ratio: 0.6,
            policy_semantic_confidence: 0.8
          },
          flags: ["policy_field:dsar_path:absent"],
          pageUrls: ["https://example.com/privacy-policy"],
          snippets: ["The policy outlines data rights but lacks specific details on data rights request paths."],
          sourceUrls: ["https://example.com/privacy-policy"]
        }
      })
    ]
  });

  const decision = evaluation.debugDecisions[0];
  assert.equal(decision?.decisionState, "confirmed");
  assert.equal(decision?.reportLane, "main");
  assert.ok(decision?.appliedRules.includes("evidence.rights_gap.confirmed_structured_policy_absence"));
});

test("missing DSAR findings stay review-level when retained metadata names a rights mechanism", () => {
  const evaluation = evaluateUnifiedFindingSurfacing({
    packets: [
      makePacket("missing_dsar_mechanism", {
        confidenceInputs: {
          ...makePacket("missing_dsar_mechanism").confidenceInputs,
          hasPolicyTextEvidence: true,
          hasReadableSurfaceSnippetEvidence: true,
          hasStructuredValidationEvidence: true
        },
        evidence: {
          ...makePacket("missing_dsar_mechanism").evidence,
          counts: {
            policy_coverage_ratio: 0.7,
            policy_semantic_confidence: 0.86
          },
          entities: {
            policyDsarMechanism: ["form"],
            policyRightsSignals: ["access_request", "delete_request"]
          },
          flags: ["policy_field:dsar_path:absent"],
          pageUrls: ["https://example.com/privacy-policy"],
          snippets: ["The policy includes a privacy request form for access and deletion requests."],
          sourceUrls: ["https://example.com/privacy-policy"]
        }
      })
    ]
  });

  const decision = evaluation.debugDecisions[0];
  assert.equal(decision?.decisionState, "review");
  assert.equal(decision?.reportLane, "confidence_and_coverage");
  assert.ok(decision?.appliedRules.includes("evidence.rights_gap.review_structured_policy_gap"));
});

test("noisy rights-gap findings stay in confidence coverage when evidence is incomplete", () => {
  const evaluation = evaluateUnifiedFindingSurfacing({
    packets: [
      makePacket("cookie_disclosure_gap", {
        confidenceInputs: {
          ...makePacket("cookie_disclosure_gap").confidenceInputs,
          hasStructuredValidationEvidence: true
        }
      }),
      makePacket("privacy_contact_channel_missing", {
        confidenceInputs: {
          ...makePacket("privacy_contact_channel_missing").confidenceInputs,
          hasStructuredValidationEvidence: true
        }
      })
    ]
  });

  for (const findingId of ["cookie_disclosure_gap", "privacy_contact_channel_missing"]) {
    const decision = evaluation.debugDecisions.find((item) => item.unifiedFindingId === findingId);
    assert.equal(decision?.decisionState, "review", findingId);
    assert.equal(decision?.reportLane, "confidence_and_coverage", findingId);
    assert.equal(decision?.surfaceTier, "support", findingId);
    assert.ok(decision?.appliedRules.includes("evidence.rights_gap.review_structured_policy_gap"), findingId);
  }
});

test("privacy contact missing confirms with fetched policy absence evidence", () => {
  const evaluation = evaluateUnifiedFindingSurfacing({
    packets: [
      makePacket("privacy_contact_channel_missing", {
        confidenceInputs: {
          ...makePacket("privacy_contact_channel_missing").confidenceInputs,
          hasPageAttribution: true,
          hasPolicyTextEvidence: true,
          hasReadableSurfaceSnippetEvidence: true
        },
        evidence: {
          ...makePacket("privacy_contact_channel_missing").evidence,
          counts: {
            policySemanticConfidence: 0.72
          },
          entities: {
            privacyContactChannelType: ["none"]
          },
          pageUrls: ["https://www.example.com/privacy"],
          snippets: [
            "This privacy policy describes personal information collection, use, sharing, retention, cookies, and user rights, but the retained text does not identify a dedicated channel for privacy questions."
          ]
        }
      })
    ]
  });

  const decision = evaluation.debugDecisions.find((item) => item.unifiedFindingId === "privacy_contact_channel_missing");
  assert.equal(decision?.decisionState, "confirmed");
  assert.equal(decision?.reportLane, "main");
  assert.ok(decision?.appliedRules.includes("evidence.rights_gap.confirmed_structured_policy_absence"));
});

test("cookie disclosure gaps confirm only with promotion-grade runtime inventory and a first-party disclosure URL", () => {
  const confirmedEvaluation = evaluateUnifiedFindingSurfacing({
    packets: [
      makePacket("cookie_disclosure_gap", {
        confidenceInputs: {
          ...makePacket("cookie_disclosure_gap").confidenceInputs,
          hasDirectRuntimeEvidence: true,
          hasStructuredValidationEvidence: true
        },
        evidence: {
          ...makePacket("cookie_disclosure_gap").evidence,
          counts: {
            unmatched_third_party_cookie_count: 3
          },
          flags: ["disclosureMismatchExplained", "negativeDisclosureSearchPerformed"],
          entities: {
            runtime_cookie_names: ["_ga", "_fbp", "li_sugr"],
            unmatched_cookie_names: ["_fbp", "li_sugr"]
          },
          sourceUrls: ["https://example.com/legal/cookie-policy"]
        }
      })
    ]
  });

  const weakRuntimeEvaluation = evaluateUnifiedFindingSurfacing({
    packets: [
      makePacket("cookie_disclosure_gap", {
        confidenceInputs: {
          ...makePacket("cookie_disclosure_gap").confidenceInputs,
          hasDirectRuntimeEvidence: true,
          hasStructuredValidationEvidence: true
        },
        evidence: {
          ...makePacket("cookie_disclosure_gap").evidence,
          counts: {
            unmatched_third_party_cookie_count: 0
          },
          flags: ["disclosureMismatchExplained", "negativeDisclosureSearchPerformed"],
          entities: {
            runtime_cookie_names: ["xsrf-token", "laravel_session", "__cf_bm"],
            unmatched_cookie_names: ["xsrf-token", "laravel_session", "__cf_bm"]
          },
          sourceUrls: ["https://example.com/cookie-policy"]
        }
      })
    ]
  });

  const weakPolicyUrlEvaluation = evaluateUnifiedFindingSurfacing({
    packets: [
      makePacket("cookie_disclosure_gap", {
        confidenceInputs: {
          ...makePacket("cookie_disclosure_gap").confidenceInputs,
          hasDirectRuntimeEvidence: true,
          hasStructuredValidationEvidence: true
        },
        evidence: {
          ...makePacket("cookie_disclosure_gap").evidence,
          counts: {
            unmatched_third_party_cookie_count: 5
          },
          flags: ["disclosureMismatchExplained", "negativeDisclosureSearchPerformed"],
          entities: {
            runtime_cookie_names: ["_fbp", "ttclid"],
            unmatched_cookie_names: ["_fbp", "ttclid"]
          },
          sourceUrls: ["https://www.cookieyes.com/product/cookie-consent"]
        }
      })
    ]
  });
  const nonessentialCookieNameEvaluation = evaluateUnifiedFindingSurfacing({
    packets: [
      makePacket("cookie_disclosure_gap", {
        confidenceInputs: {
          ...makePacket("cookie_disclosure_gap").confidenceInputs,
          hasDirectRuntimeEvidence: true,
          hasStructuredValidationEvidence: true
        },
        evidence: {
          ...makePacket("cookie_disclosure_gap").evidence,
          counts: {
            unmatched_third_party_cookie_count: 0,
            unmatchedCookieCount: 2
          },
          flags: ["disclosureMismatchExplained", "negativeDisclosureSearchPerformed"],
          entities: {
            runtime_cookie_names: ["_fbp", "_gcl_au"],
            unmatched_cookie_names: ["_fbp", "_gcl_au"]
          },
          sourceUrls: ["https://example.com/cookie-policy"]
        }
      })
    ]
  });
  const blockedPolicySurfaceEvaluation = evaluateUnifiedFindingSurfacing({
    packets: [
      makePacket("cookie_disclosure_gap", {
        confidenceInputs: {
          ...makePacket("cookie_disclosure_gap").confidenceInputs,
          hasDirectRuntimeEvidence: true,
          hasStructuredValidationEvidence: true
        },
        concernContext: {
          assertionLevels: [],
          evidenceStrengthFlags: [],
          externalSurfacingEligibilities: ["eligible"],
          negativeEvidenceFlags: ["blocked_or_interstitial_evidence_observed"],
          originTypes: [],
          promotionEligibilities: ["eligible"]
        },
        evidence: {
          ...makePacket("cookie_disclosure_gap").evidence,
          counts: {
            unmatched_third_party_cookie_count: 3
          },
          flags: ["disclosureMismatchExplained", "negativeDisclosureSearchPerformed"],
          entities: {
            runtime_cookie_names: ["_ga", "_fbp", "li_sugr"],
            unmatched_cookie_names: ["_fbp", "li_sugr"]
          },
          fetchQuality: "blocked_interstitial",
          sourceUrls: ["https://example.com/legal/cookie-policy"]
        }
      })
    ]
  });

  assert.equal(confirmedEvaluation.debugDecisions[0]?.decisionState, "confirmed");
  assert.equal(confirmedEvaluation.debugDecisions[0]?.reportLane, "main");
  assert.equal(nonessentialCookieNameEvaluation.debugDecisions[0]?.decisionState, "confirmed");
  assert.equal(nonessentialCookieNameEvaluation.debugDecisions[0]?.reportLane, "main");
  assert.equal(weakRuntimeEvaluation.debugDecisions[0]?.decisionState, "review");
  assert.equal(weakRuntimeEvaluation.debugDecisions[0]?.reportLane, "confidence_and_coverage");
  assert.equal(weakPolicyUrlEvaluation.debugDecisions[0]?.decisionState, "review");
  assert.equal(weakPolicyUrlEvaluation.debugDecisions[0]?.reportLane, "confidence_and_coverage");
  assert.equal(blockedPolicySurfaceEvaluation.debugDecisions[0]?.decisionState, "review");
  assert.equal(blockedPolicySurfaceEvaluation.debugDecisions[0]?.reportLane, "confidence_and_coverage");
});

test("positive financial disclosure findings are suppressed unless they support a stronger financial story", () => {
  const evaluation = evaluateUnifiedFindingSurfacing({
    packets: [
      makePacket("fee_disclosure_present", {
        confidenceInputs: {
          ...makePacket("fee_disclosure_present").confidenceInputs,
          hasStructuredValidationEvidence: true,
          hasPolicyTextEvidence: true
        }
      })
    ]
  });

  const decision = evaluation.debugDecisions[0];
  assert.equal(decision?.decisionState, "suppressed");
  assert.equal(decision?.reportLane, "suppressed");
  assert.ok(decision?.appliedRules.includes("support.orphan_support_suppressed"));
});

test("negative financial-promotion risks confirm when backed by retained financial context", () => {
  const evaluation = evaluateUnifiedFindingSurfacing({
    packets: [
      makePacket("guaranteed_or_high_return_claims_present", {
        confidenceInputs: {
          ...makePacket("guaranteed_or_high_return_claims_present").confidenceInputs,
          hasPolicyTextEvidence: true,
          hasReadableSurfaceSnippetEvidence: true,
          hasStructuredValidationEvidence: true
        },
        evidence: {
          ...makePacket("guaranteed_or_high_return_claims_present").evidence,
          pageUrls: ["https://example.com/invest"],
          sourceUrls: ["https://example.com/invest"]
        }
      })
    ]
  });

  const decision = evaluation.debugDecisions[0];
  assert.equal(decision?.decisionState, "confirmed");
  assert.equal(decision?.surfaceTier, "headline");
  assert.ok(decision?.appliedRules.includes("evidence.financial.confirmed_negative_risk_with_backing"));
});

test("corpus-derived negative financial-promotion findings use the confirmed financial-risk policy", () => {
  const corpusDerivedFindingIds = [
    "financial_urgency_pressure_tactic_detected",
    "guaranteed_or_high_return_claims_present",
    "simulated_performance_without_disclosure",
    "unqualified_superlative_claim_detected"
  ] as const satisfies readonly ReportUnifiedFindingId[];

  const evaluation = evaluateUnifiedFindingSurfacing({
    packets: corpusDerivedFindingIds.map((findingId) =>
      makePacket(findingId, {
        confidenceInputs: {
          ...makePacket(findingId).confidenceInputs,
          hasPolicyTextEvidence: true,
          hasReadableSurfaceSnippetEvidence: true,
          hasStructuredValidationEvidence: true
        },
        evidence: {
          ...makePacket(findingId).evidence,
          pageUrls: ["https://example.com/invest"],
          snippets: ["Earn projected returns from this investment strategy before this limited offer closes."],
          sourceUrls: ["https://example.com/invest"]
        }
      })
    )
  });

  for (const findingId of corpusDerivedFindingIds) {
    const decision = evaluation.debugDecisions.find((item) => item.unifiedFindingId === findingId);
    assert.equal(decision?.decisionState, "confirmed", findingId);
    assert.equal(decision?.reportLane, "main", findingId);
    assert.ok(decision?.appliedRules.includes("evidence.financial.confirmed_negative_risk_with_backing"), findingId);
  }
});

test("direct session replay observation surfaces as standalone review finding", () => {
  const evaluation = evaluateUnifiedFindingSurfacing({
    packets: [
      makePacket("session_replay_observed", {
        confidenceInputs: {
          ...makePacket("session_replay_observed").confidenceInputs,
          hasDirectRuntimeEvidence: true
        }
      })
    ]
  });

  const decision = evaluation.debugDecisions[0];
  assert.equal(decision?.decisionState, "review");
  assert.equal(decision?.reportLane, "main");
  assert.ok(decision?.appliedRules.includes("evidence.consent_behavior.review_runtime_without_effect_evidence"));
});

test("consent interface findings stay review-level even when related evidence exists", () => {
  const evaluation = evaluateUnifiedFindingSurfacing({
    packets: [
      makePacket("reject_button_missing", {
        confidenceInputs: {
          ...makePacket("reject_button_missing").confidenceInputs,
          hasDirectRuntimeEvidence: true
        }
      })
    ]
  });

  const decision = evaluation.debugDecisions[0];
  assert.equal(decision?.decisionState, "review");
  assert.equal(decision?.reportLane, "main");
  assert.ok(decision?.appliedRules.includes("evidence.consent_behavior.review_interface_or_design"));
});

test("low-confidence consent interface findings do not surface as main review findings", () => {
  const evaluation = evaluateUnifiedFindingSurfacing({
    packets: [
      makePacket("reject_button_missing", {
        confidenceBand: "low",
        confidenceInputs: {
          ...makePacket("reject_button_missing").confidenceInputs,
          hasDirectRuntimeEvidence: true
        }
      }),
      makePacket("forced_consent_wall", {
        confidenceBand: "low",
        confidenceInputs: {
          ...makePacket("forced_consent_wall").confidenceInputs,
          hasDirectRuntimeEvidence: true
        }
      })
    ]
  });

  for (const decision of evaluation.debugDecisions) {
    assert.equal(decision.decisionState, "suppressed");
    assert.equal(decision.reportLane, "suppressed");
    assert.ok(decision.appliedRules.includes("evidence.consent_behavior.suppress_low_confidence_interface_context"));
  }
});

test("generic tracking-context findings are suppressed unless they support a stronger consent narrative", () => {
  const evaluation = evaluateUnifiedFindingSurfacing({
    packets: [
      makePacket("retargeting_pixel_observed", {
        confidenceInputs: {
          ...makePacket("retargeting_pixel_observed").confidenceInputs,
          hasDirectRuntimeEvidence: true
        }
      })
    ]
  });

  const decision = evaluation.debugDecisions[0];
  assert.equal(decision?.decisionState, "suppressed");
  assert.equal(decision?.reportLane, "suppressed");
  assert.ok(decision?.appliedRules.includes("support.orphan_support_suppressed"));
});

test("sensitive-flow-specific finding outranks generic sibling", () => {
  const evaluation = evaluateUnifiedFindingSurfacing({
    packets: [
      makePacket("possible_session_replay_on_sensitive_input_surface", {
        confidenceBand: "high",
        confidenceInputs: {
          ...makePacket("possible_session_replay_on_sensitive_input_surface").confidenceInputs,
          hasConcretePayloadEvidence: true,
          hasDirectRuntimeEvidence: true
        },
        details: {
          dataTypes: ["financial"],
          family: "sensitive_data",
          kind: "possible_session_replay_on_sensitive_input_surface"
        }
      }),
      makePacket("session_replay_undisclosed", {
        confidenceBand: "high",
        confidenceInputs: {
          ...makePacket("session_replay_undisclosed").confidenceInputs,
          hasDirectRuntimeEvidence: true,
          hasPolicyTextEvidence: true
        },
        details: {
          contradictionBasis: "Replay runtime observed without matching disclosure.",
          family: "contradiction",
          kind: "session_replay_undisclosed",
          policyClaimType: "tracking_disclosure",
          runtimeObservationType: "session_replay_runtime"
        }
      })
    ]
  });

  const specific = evaluation.debugDecisions.find((decision) => decision.unifiedFindingId === "possible_session_replay_on_sensitive_input_surface");
  const generic = evaluation.debugDecisions.find((decision) => decision.unifiedFindingId === "session_replay_undisclosed");

  assert.equal(specific?.decisionState, "confirmed");
  assert.equal(generic?.decisionState, "support_only");
  assert.equal(generic?.supportTargetId, "possible_session_replay_on_sensitive_input_surface");
});

test("task-blocking accessibility finding outranks generic accessibility summary", () => {
  const evaluation = evaluateUnifiedFindingSurfacing({
    packets: [
      makePacket("keyboard_only_task_completion_blocked", {
        details: {
          family: "accessibility",
          kind: "keyboard_only_task_completion_blocked",
          ruleExamples: ["keyboard-navigation"]
        }
      }),
      makePacket("wcag_issue_summary", {
        details: {
          family: "accessibility",
          kind: "wcag_issue_summary",
          ruleExamples: ["contrast", "form-label"]
        }
      })
    ]
  });

  const blocker = evaluation.debugDecisions.find((decision) => decision.unifiedFindingId === "keyboard_only_task_completion_blocked");
  const summary = evaluation.debugDecisions.find((decision) => decision.unifiedFindingId === "wcag_issue_summary");

  assert.equal(blocker?.decisionState, "review");
  assert.equal(summary?.decisionState, "support_only");
  assert.equal(summary?.supportTargetId, "keyboard_only_task_completion_blocked");
});

test("score-only accessibility risk is suppressed when representative examples are missing", () => {
  const evaluation = evaluateUnifiedFindingSurfacing({
    packets: [
      makePacket("accessibility_risk_score", {
        concernContext: {
          assertionLevels: [],
          evidenceStrengthFlags: [],
          externalSurfacingEligibilities: ["eligible"],
          negativeEvidenceFlags: ["missing_representative_accessibility_examples"],
          originTypes: [],
          promotionEligibilities: ["eligible"]
        }
      })
    ]
  });

  const decision = evaluation.debugDecisions[0];
  assert.equal(decision?.decisionState, "suppressed");
  assert.equal(decision?.reportLane, "suppressed");
  assert.ok(decision?.appliedRules.includes("evidence.accessibility.suppress_score_only_context"));
});

test("accessibility risk score remains reviewable when representative examples are retained", () => {
  const evaluation = evaluateUnifiedFindingSurfacing({
    packets: [
      makePacket("accessibility_risk_score", {
        confidenceInputs: {
          ...makePacket("accessibility_risk_score").confidenceInputs,
          hasPageAttribution: true,
          issueCount: 4,
          signalCount: 2
        },
        details: {
          family: "accessibility",
          kind: "accessibility_risk_score",
          ruleExamples: ["form-label", "color-contrast"]
        }
      })
    ]
  });

  const decision = evaluation.debugDecisions[0];
  assert.equal(decision?.decisionState, "review");
  assert.equal(decision?.reportLane, "confidence_and_coverage");
  assert.equal(decision?.reportable, true);
  assert.ok(!decision?.appliedRules.includes("evidence.accessibility.suppress_score_only_context"));
});

test("mock regulator context suppresses generic accessibility score context", () => {
  const evaluation = evaluateUnifiedFindingSurfacing({
    packets: [
      makePacket("regulator_operated_mock_investment_example", {
        confidenceBand: "high",
        confidenceInputs: {
          ...makePacket("regulator_operated_mock_investment_example").confidenceInputs,
          hasReadableSurfaceSnippetEvidence: true
        },
        details: {
          family: "financial_promotion",
          kind: "regulator_operated_mock_investment_example"
        }
      }),
      makePacket("accessibility_risk_score", {
        details: {
          family: "accessibility",
          kind: "accessibility_risk_score",
          ruleExamples: ["form-label"]
        }
      })
    ]
  });

  const regulatorMock = evaluation.debugDecisions.find((decision) => decision.unifiedFindingId === "regulator_operated_mock_investment_example");
  const accessibilityScore = evaluation.debugDecisions.find((decision) => decision.unifiedFindingId === "accessibility_risk_score");

  assert.notEqual(regulatorMock?.decisionState, "suppressed");
  assert.equal(accessibilityScore?.decisionState, "suppressed");
  assert.equal(accessibilityScore?.suppressedBy, "regulator_operated_mock_investment_example");
  assert.ok(accessibilityScore?.appliedRules.includes("precedence.regulator_mock_context_suppresses_generic_coverage"));
});

test("support-only findings retain explicit support links", () => {
  const evaluation = evaluateUnifiedFindingSurfacing({
    packets: [
      makePacket("critical_form_completion_barrier", {
        details: {
          family: "accessibility",
          kind: "critical_form_completion_barrier",
          ruleExamples: ["form-label"]
        }
      }),
      makePacket("wcag_issue_summary", {
        details: {
          family: "accessibility",
          kind: "wcag_issue_summary",
          ruleExamples: ["contrast"]
        }
      })
    ]
  });

  assert.deepEqual(evaluation.supportLinks, [
    {
      appliedRule: "precedence.task_blocking_beats_wcag_summary",
      primaryFindingId: "critical_form_completion_barrier",
      reason: "A task-completion accessibility finding should lead over a generic WCAG summary.",
      supportingFindingId: "wcag_issue_summary"
    }
  ]);
});

test("unknown finding ids follow the conservative fallback", () => {
  const evaluation = evaluateUnifiedFindingSurfacing({
    packets: [
      makePacket("privacy_policy_present", {
        unifiedFindingId: "unknown_future_finding_id" as ReportUnifiedFindingId
      })
    ]
  });

  const decision = evaluation.debugDecisions[0];
  assert.equal(decision?.decisionState, "suppressed");
  assert.deepEqual(decision?.appliedRules, ["unknown.conservative_fallback"]);
});

test("policy version and debug decisions are stable in evaluation output", () => {
  const evaluation = evaluateUnifiedFindingSurfacing({
    packets: [
      makePacket("sale_sharing_controls_missing", {
        confidenceBand: "high",
        confidenceInputs: {
          ...makePacket("sale_sharing_controls_missing").confidenceInputs,
          hasStructuredValidationEvidence: true
        }
      })
    ]
  });

  assert.equal(evaluation.policyVersion, REPORT_SURFACING_POLICY_VERSION);
  assert.equal(evaluation.debugDecisions.length, 1);
  assert.deepEqual(evaluation.debugDecisions[0], {
    appliedRules: [
      "family.rights_gap.default",
      "evidence.rights_gap.confirmed_high_exposure_or_runtime"
    ],
    decisionReasons: [
      "Disclosure and rights-gap findings belong in the main narrative, but stay conservative until evidence is stronger.",
      "Concrete runtime evidence, or a high-exposure rights gap backed by structured validation, was retained strongly enough for this finding to stand on its own."
    ],
    decisionState: "confirmed",
    family: "rights_gap",
    policyVersion: REPORT_SURFACING_POLICY_VERSION,
    reportLane: "main",
    reportable: true,
    supportTargetId: undefined,
    supportedBy: undefined,
    surfaceTier: "section",
    supports: [],
    suppressedBy: undefined,
    unifiedFindingId: "sale_sharing_controls_missing",
    usedFamilyDefault: true,
    usedFindingOverride: true
  });
});

test("pre-consent tracking confirms with direct runtime vendor and URL evidence", () => {
  const evaluation = evaluateUnifiedFindingSurfacing({
    packets: [
      makePacket("preconsent_tracking", {
        confidenceInputs: {
          ...makePacket("preconsent_tracking").confidenceInputs,
          hasDirectRuntimeEvidence: true
        },
        details: {
          family: "consent_tracking",
          kind: "preconsent_tracking",
          requestUrls: ["https://connect.facebook.net/fbevents.js"],
          vendors: ["Meta Pixel"]
        }
      })
    ]
  });

  const decision = evaluation.debugDecisions[0];
  assert.equal(decision?.decisionState, "confirmed");
  assert.ok(decision?.appliedRules.includes("evidence.preconsent.confirmed_when_validation_and_runtime_artifacts"));
});

test("pre-consent tracking confirms with non-essential cookie timing evidence", () => {
  const evaluation = evaluateUnifiedFindingSurfacing({
    packets: [
      makePacket("preconsent_tracking", {
        confidenceInputs: {
          ...makePacket("preconsent_tracking").confidenceInputs,
          hasDirectRuntimeEvidence: true
        },
        details: {
          family: "consent_tracking",
          kind: "preconsent_tracking",
          requestUrls: [],
          vendors: []
        },
        evidence: {
          flags: ["preconsent_tracking_detected"],
          pageUrls: [],
          snippets: [],
          sourceUrls: [],
          entities: {
            preconsent_cookie_categories: ["advertising"],
            preconsent_cookie_names: ["_fbp"],
            preconsent_nonessential_cookie_names: ["_fbp"],
            preconsent_cookie_timing_evidence: ["before_consent_cookie_write"]
          }
        }
      })
    ]
  });

  const decision = evaluation.debugDecisions[0];
  assert.equal(decision?.decisionState, "confirmed");
  assert.ok(decision?.appliedRules.includes("evidence.preconsent.confirmed_when_validation_and_runtime_artifacts"));
});

test("pre-consent tracking stays review-level for cookie names without before-consent write timing", () => {
  const evaluation = evaluateUnifiedFindingSurfacing({
    packets: [
      makePacket("preconsent_tracking", {
        confidenceInputs: {
          ...makePacket("preconsent_tracking").confidenceInputs,
          hasDirectRuntimeEvidence: true
        },
        details: {
          family: "consent_tracking",
          kind: "preconsent_tracking",
          requestUrls: [],
          vendors: []
        },
        evidence: {
          flags: ["preconsent_tracking_detected"],
          pageUrls: [],
          snippets: [],
          sourceUrls: [],
          entities: {
            preconsent_cookie_categories: ["advertising"],
            preconsent_cookie_names: ["_fbp"],
            preconsent_nonessential_cookie_names: ["_fbp"],
            preconsent_cookie_timing_evidence: ["initial_cookie_snapshot"]
          }
        }
      })
    ]
  });

  const decision = evaluation.debugDecisions[0];
  assert.equal(decision?.decisionState, "review");
  assert.ok(decision?.appliedRules.includes("evidence.preconsent.review_without_runtime_artifacts"));
});

test("pre-consent tracking stays review-level when concrete URL evidence is missing", () => {
  const evaluation = evaluateUnifiedFindingSurfacing({
    packets: [
      makePacket("preconsent_tracking", {
        confidenceInputs: {
          ...makePacket("preconsent_tracking").confidenceInputs,
          hasDirectRuntimeEvidence: true
        },
        details: {
          family: "consent_tracking",
          kind: "preconsent_tracking",
          requestUrls: [],
          vendors: ["Meta Pixel"]
        }
      })
    ]
  });

  const decision = evaluation.debugDecisions[0];
  assert.equal(decision?.decisionState, "review");
  assert.ok(decision?.appliedRules.includes("evidence.preconsent.review_without_runtime_artifacts"));
});

test("pre-consent tracking does not treat generic page URLs as request URL evidence", () => {
  const evaluation = evaluateUnifiedFindingSurfacing({
    packets: [
      makePacket("preconsent_tracking", {
        confidenceInputs: {
          ...makePacket("preconsent_tracking").confidenceInputs,
          hasDirectRuntimeEvidence: true
        },
        details: {
          family: "consent_tracking",
          kind: "preconsent_tracking",
          requestUrls: [],
          vendors: ["Meta Pixel"]
        },
        evidence: {
          flags: ["preconsent_tracking_detected"],
          pageUrls: ["https://example.com/privacy"],
          snippets: [],
          sourceUrls: [],
          entities: {
            runtimeVendors: ["Meta Pixel"]
          }
        }
      })
    ]
  });

  const decision = evaluation.debugDecisions[0];
  assert.equal(decision?.decisionState, "review");
  assert.ok(decision?.appliedRules.includes("evidence.preconsent.review_without_runtime_artifacts"));
});

test("pre-consent tracking does not treat malformed URL-like cookie names as request evidence", () => {
  const evaluation = evaluateUnifiedFindingSurfacing({
    packets: [
      makePacket("preconsent_tracking", {
        confidenceInputs: {
          ...makePacket("preconsent_tracking").confidenceInputs,
          hasDirectRuntimeEvidence: true
        },
        details: {
          family: "consent_tracking",
          kind: "preconsent_tracking",
          requestUrls: [],
          vendors: ["Google Analytics"]
        },
        evidence: {
          flags: ["preconsent_tracking_detected"],
          pageUrls: [],
          snippets: [],
          sourceUrls: [],
          entities: {
            runtimeRequestUrls: ["https://www.sofi.com_oeu1776902307725r0.1932886381308404$$14812420277$$session_state"],
            runtimeVendors: ["Google Analytics"]
          }
        }
      })
    ]
  });

  const decision = evaluation.debugDecisions[0];
  assert.equal(decision?.decisionState, "review");
  assert.ok(decision?.appliedRules.includes("evidence.preconsent.review_without_runtime_artifacts"));
});

test("pre-consent tracking stays review-level for necessary cookie evidence only", () => {
  const evaluation = evaluateUnifiedFindingSurfacing({
    packets: [
      makePacket("preconsent_tracking", {
        confidenceInputs: {
          ...makePacket("preconsent_tracking").confidenceInputs,
          hasDirectRuntimeEvidence: true
        },
        details: {
          family: "consent_tracking",
          kind: "preconsent_tracking",
          requestUrls: [],
          vendors: []
        },
        evidence: {
          flags: ["preconsent_tracking_detected"],
          pageUrls: [],
          snippets: [],
          sourceUrls: [],
          entities: {
            preconsent_cookie_categories: ["necessary"],
            preconsent_cookie_names: ["__cf_bm"]
          }
        }
      })
    ]
  });

  const decision = evaluation.debugDecisions[0];
  assert.equal(decision?.decisionState, "review");
  assert.ok(decision?.appliedRules.includes("evidence.preconsent.review_without_runtime_artifacts"));
});

test("fingerprinting confirms only with high confidence and concrete runtime evidence", () => {
  const confirmedEvaluation = evaluateUnifiedFindingSurfacing({
    packets: [
      makePacket("fingerprinting_observed", {
        confidenceBand: "high",
        confidenceInputs: {
          ...makePacket("fingerprinting_observed").confidenceInputs,
          hasDirectRuntimeEvidence: true
        },
        details: {
          family: "consent_tracking",
          kind: "fingerprinting_observed"
        },
        evidence: {
          counts: {
            fingerprintTier: 3
          },
          entities: {
            fingerprintAttributeCategories: ["canvas_webgl", "audio", "fonts_plugins"],
            fingerprintingRuntimeEvidence: [
              JSON.stringify({
                attributeCategories: ["canvas_webgl", "audio", "fonts_plugins"],
                entropyTransmissionObserved: true,
                requestUrl: "https://fp.example.test/collect?device_fingerprint=abc",
                tier: 3
              })
            ]
          },
          flags: [],
          pageUrls: [],
          snippets: [],
          sourceUrls: ["https://fp.example.test/collect?device_fingerprint=abc"]
        }
      })
    ]
  });
  const reviewEvaluation = evaluateUnifiedFindingSurfacing({
    packets: [
      makePacket("fingerprinting_observed", {
        confidenceBand: "moderate",
        details: {
          family: "consent_tracking",
          kind: "fingerprinting_observed"
        }
      })
    ]
  });

  assert.equal(confirmedEvaluation.debugDecisions[0]?.decisionState, "confirmed");
  assert.equal(reviewEvaluation.debugDecisions[0]?.decisionState, "review");
});
