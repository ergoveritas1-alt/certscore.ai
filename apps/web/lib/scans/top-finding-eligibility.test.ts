import assert from "node:assert/strict";
import test from "node:test";
import { evaluateTopFindingEligibility } from "./top-finding-eligibility";
import type { CertScoreFinding } from "./finding-registry";

function finding(overrides: Partial<CertScoreFinding> = {}): CertScoreFinding {
  return {
    confidence: "good",
    defaultSurfacePriority: 50,
    directVsInferred: "direct",
    evidenceDetails: {},
    evidencePreview: ["runtime evidence retained"],
    evidenceRefs: ["scan_runtime_artifacts.hybrid_runtime_evidence"],
    id: "pre_consent_tracking_detected",
    label: "Test finding",
    remediation: "Review retained evidence.",
    section: "Privacy & Tracking",
    severity: "high",
    shortSummary: "Test finding",
    whyItMatters: "Test",
    ...overrides
  };
}

test("top-finding evaluator top-ranks sensitive replay only with endpoint and same-flow sensitive evidence", () => {
  const decision = evaluateTopFindingEligibility(finding({
    id: "possible_session_replay_on_sensitive_input_surface",
    directVsInferred: "mixed",
    evidenceDetails: {
      inputSurfaceEvidence: {
        sensitivePayloadViolations: [
          {
            sameFlowLinkage: {
              samePageOrFlow: true
            }
          }
        ]
      },
      sessionReplayEvidence: {
        observed: true,
        runtimeSummary: {
          collectionEndpointObserved: true,
          libraryOnly: false,
          maskingOrExclusionObserved: false
        }
      }
    }
  }));

  assert.equal(decision.eligibility, "top_candidate");
  assert.ok(decision.matchedCriteria.includes("replay_collection_endpoint_on_sensitive_surface"));
  assert.ok(decision.matchedCriteria.includes("same_page_or_same_flow_replay_linkage"));
});

test("top-finding evaluator does not top-rank sensitive replay without same-page or same-flow linkage", () => {
  const decision = evaluateTopFindingEligibility(finding({
    id: "possible_session_replay_on_sensitive_input_surface",
    directVsInferred: "mixed",
    evidenceDetails: {
      inputSurfaceEvidence: { sensitiveFieldContexts: ["field:email"] },
      sessionReplayEvidence: {
        observed: true,
        runtimeSummary: {
          collectionEndpointObserved: true,
          libraryOnly: false,
          maskingOrExclusionObserved: false
        }
      }
    }
  }));

  assert.equal(decision.eligibility, "surface_only");
  assert.ok(decision.missingCorroborators.includes("same_page_or_same_flow_replay_linkage"));
  assert.equal(decision.matchedCriteria.includes("replay_collection_endpoint_on_sensitive_surface"), false);
});

test("top-finding evaluator top-ranks scan-level replay with retained sensitive-surface context", () => {
  const decision = evaluateTopFindingEligibility(finding({
    id: "session_replay_present_with_sensitive_surfaces_observed",
    directVsInferred: "mixed",
    evidenceDetails: {
      inputSurfaceEvidence: {
        sensitivePayloadViolations: [
          {
            sameFlowLinkage: {
              samePageOrFlow: true
            }
          }
        ]
      },
      sessionReplayEvidence: {
        observed: true,
        runtimeSummary: {
          collectionEndpointObserved: true,
          libraryOnly: false,
          maskingOrExclusionObserved: false
        }
      }
    }
  }));

  assert.equal(decision.eligibility, "top_candidate");
  assert.ok(decision.matchedCriteria.includes("session_replay_collection_with_sensitive_surface_linkage"));
  assert.ok(decision.matchedCriteria.includes("same_page_or_same_flow_replay_linkage"));
  assert.equal(decision.missingCorroborators.includes("same_page_or_same_flow_replay_linkage"), false);
});

test("top-finding evaluator demotes scan-level replay when sensitive surface is not same-page or same-flow linked", () => {
  const decision = evaluateTopFindingEligibility(finding({
    id: "session_replay_present_with_sensitive_surfaces_observed",
    directVsInferred: "mixed",
    evidenceDetails: {
      sensitiveFieldContexts: ["field:email"],
      sessionReplayEvidence: {
        observed: true,
        runtimeSummary: {
          collectionEndpointObserved: true,
          libraryOnly: false,
          maskingOrExclusionObserved: false
        }
      }
    }
  }));

  assert.equal(decision.eligibility, "surface_only");
  assert.ok(decision.missingCorroborators.includes("same_page_or_same_flow_replay_linkage"));
  assert.ok(decision.demotionReasons.includes("missing_same_page_or_same_flow_replay_linkage"));
  assert.equal(decision.matchedCriteria.includes("session_replay_collection_with_sensitive_surface_linkage"), false);
});

test("top-finding evaluator demotes replay when only a library artifact is retained", () => {
  const decision = evaluateTopFindingEligibility(finding({
    id: "session_recording_services_detected",
    evidenceDetails: {
      sessionReplayEvidence: {
        observed: true,
        runtimeSummary: {
          collectionEndpointObserved: false,
          libraryOnly: true,
          maskingOrExclusionObserved: null
        }
      }
    }
  }));

  assert.equal(decision.eligibility, "surface_only");
  assert.ok(decision.demotionReasons.includes("session_replay_library_only_without_collection_endpoint"));
});

test("top-finding evaluator demotes sensitive replay when same-surface masking evidence is retained", () => {
  const decision = evaluateTopFindingEligibility(finding({
    id: "possible_session_replay_on_sensitive_input_surface",
    directVsInferred: "mixed",
    evidenceDetails: {
      inputSurfaceEvidence: {
        sensitivePayloadViolations: [
          {
            sameFlowLinkage: {
              replayMaskingEvidence: {
                fieldMarkerMatches: ["clarity_data_clarity_mask"],
                maskingOrExclusionObserved: true,
                userValueObserved: false
              }
            }
          }
        ]
      },
      sessionReplayEvidence: {
        observed: true,
        runtimeSummary: {
          collectionEndpointObserved: true,
          libraryOnly: false,
          maskingOrExclusionObserved: false
        }
      }
    }
  }));

  assert.equal(decision.eligibility, "surface_only");
  assert.ok(decision.matchedCriteria.includes("same_surface_replay_masking_or_exclusion_observed"));
  assert.ok(decision.demotionReasons.includes("same_surface_replay_masking_or_exclusion_observed"));
});

test("top-finding evaluator uses GPC-specific ignored handling to top-rank CPRA choice review", () => {
  const decision = evaluateTopFindingEligibility(finding({
    id: "cpra_cba_opt_out_missing",
    directVsInferred: "inferred",
    evidenceDetails: {
      optOutControlEvidence: {
        choiceControlsInspected: true,
        gpcHandlingObserved: "ignored",
        gpcScanStateSent: true,
        result: "absent"
      },
      trackingOrSharingContext: {
        cbaVendorEvidenceObserved: true,
        vendors: ["Example Adtech"]
      }
    }
  }));

  assert.equal(decision.eligibility, "top_candidate");
  assert.ok(decision.matchedCriteria.includes("gpc_ignored_with_advertising_or_sharing_context"));
});

test("top-finding evaluator treats untested GPC state as a CPRA limitation instead of a demotion", () => {
  const decision = evaluateTopFindingEligibility(finding({
    id: "cpra_cba_opt_out_missing",
    directVsInferred: "inferred",
    evidenceDetails: {
      optOutControlEvidence: {
        choiceControlsInspected: true,
        gpcHandlingObserved: "not_determined",
        gpcScanStateSent: false,
        result: "absent"
      },
      trackingOrSharingContext: {
        cbaVendorEvidenceObserved: true,
        vendors: ["Example Adtech"]
      }
    }
  }));

  assert.equal(decision.eligibility, "top_candidate");
  assert.equal(decision.demotionReasons.includes("gpc_specific_state_not_observed"), false);
  assert.ok(decision.matchedCriteria.includes("cba_vendor_runtime_context"));
  assert.ok(decision.matchedCriteria.includes("privacy_choice_control_missing"));
  assert.ok(decision.missingCorroborators.includes("gpc_handling_test"));
  assert.equal(decision.demotionReasons.includes("missing_top_finding_corroborator"), false);
});

test("top-finding evaluator explains incomplete CPRA privacy-choice controls without demoting them", () => {
  const decision = evaluateTopFindingEligibility(finding({
    id: "cpra_cba_opt_out_missing",
    confidence: "good",
    directVsInferred: "direct",
    evidenceDetails: {
      optOutControlEvidence: {
        choiceControlsInspected: true,
        gpcHandlingObserved: "not_determined",
        gpcScanStateSent: false,
        incompleteOrUnconfirmed: true,
        missingOrAbsent: false,
        privacyChoiceCompletenessSubtype: "incomplete_or_unconfirmed",
        result: "partial_no_icon"
      },
      trackingOrSharingContext: {
        cbaVendorEvidenceObserved: true,
        vendors: ["adnxs.com"]
      }
    },
    severity: "high"
  }));

  assert.equal(decision.eligibility, "top_candidate");
  assert.ok(decision.matchedCriteria.includes("privacy_choice_control_observed"));
  assert.ok(decision.matchedCriteria.includes("cpra_completeness_not_confirmed"));
  assert.ok(decision.missingCorroborators.includes("cpra_icon_or_privacy_choices_presentation_confirmation"));
  assert.ok(decision.missingCorroborators.includes("opt_out_flow_completion_result"));
  assert.ok(decision.missingCorroborators.includes("vendor_suppression_after_opt_out"));
  assert.deepEqual(decision.demotionReasons, []);
});

test("top-finding evaluator does not treat policy-only representative hosts as runtime request anchors", () => {
  const decision = evaluateTopFindingEligibility(finding({
    id: "policy_clarity_risk",
    directVsInferred: "inferred",
    evidenceDetails: {
      policyEvidenceDetails: {
        evaluated: true,
        clarityRiskObserved: true
      },
      representativeRequests: [
        {
          category: "policy",
          hostname: "example.com"
        }
      ]
    } as any
  }));

  assert.equal(decision.matchedCriteria.includes("runtime_request_anchor"), false);
});

test("top-finding evaluator top-ranks consent asymmetry only when path depth and visual hierarchy align", () => {
  const decision = evaluateTopFindingEligibility(finding({
    id: "asymmetric_consent_ui",
    directVsInferred: "mixed",
    evidenceDetails: {
      consentUiEvidence: {
        runtimePath: {
          observedAcceptPathDepth: 1,
          observedPreferenceLayerCount: 1,
          observedRejectPathDepth: 3,
          unrelatedOverlayClassifier: "consent_surface",
          visualHierarchyScore: 2
        }
      }
    }
  }));

  assert.equal(decision.eligibility, "top_candidate");
  assert.ok(decision.matchedCriteria.includes("accept_reject_visual_hierarchy_imbalance"));
});

test("top-finding evaluator keeps overlay-only consent UI diagnostics audit-only", () => {
  for (const id of [
    "forced_consent_interaction",
    "reject_option_missing_or_hidden",
    "asymmetric_consent_ui",
    "consent_dark_patterns_detected"
  ] as const) {
    const decision = evaluateTopFindingEligibility(finding({
      id,
      directVsInferred: "mixed",
      evidenceDetails: {
        consentUiEvidence: {
          observed: true,
          basis: "A blocking cookie wall overlay was observed. This is common, but it increases concern when users cannot reject as easily as accept or when tracking begins before a choice is made."
        }
      }
    }));

    assert.equal(decision.eligibility, "audit_only", id);
    assert.ok(decision.missingCorroborators.includes("consent_path_depth_or_choice_structure_evidence"), id);
    assert.ok(decision.demotionReasons.includes("overlay_only_without_consent_path_evidence"), id);
    assert.equal(decision.matchedCriteria.includes("consent_path_depth_observed"), false, id);
  }
});

test("top-finding evaluator allows consent UI promotion with retained choice path evidence", () => {
  const decision = evaluateTopFindingEligibility(finding({
    id: "reject_option_missing_or_hidden",
    directVsInferred: "mixed",
    evidenceDetails: {
      consentUiEvidence: {
        observed: true,
        basis: "scan_runtime_artifacts.reject_path_depth_and_availability",
        runtimePath: {
          acceptClickDepth: 1,
          availability: "hidden",
          preferencesRequiredBeforeReject: true,
          rejectAvailableOnFirstLayer: false,
          rejectClickDepth: 2
        }
      }
    }
  }));

  assert.equal(decision.eligibility, "top_candidate");
  assert.ok(decision.matchedCriteria.includes("consent_path_depth_observed"));
  assert.equal(decision.demotionReasons.includes("overlay_only_without_consent_path_evidence"), false);
});

test("top-finding evaluator promotes forced consent only with consent-specific blocking path evidence", () => {
  const promoted = evaluateTopFindingEligibility(finding({
    id: "forced_consent_interaction",
    directVsInferred: "direct",
    evidenceDetails: {
      consentUiEvidence: {
        observed: true,
        basis: "scan_runtime_artifacts.consent_blocking_overlay",
        runtimePath: {
          blockedPageInteraction: true,
          blockingEvidenceSource: "runtime_consent_ui_probe",
          forcedActionRequired: true,
          pageAccessBlockedUntilChoice: true,
          pageInteractionBlocked: true,
          surfaceType: "modal",
          unrelatedOverlayClassifier: "consent_surface"
        }
      }
    },
    severity: "high"
  }));

  assert.equal(promoted.eligibility, "top_candidate");
  assert.ok(promoted.matchedCriteria.includes("consent_specific_blocking_interaction"));

  const ordinaryBanner = evaluateTopFindingEligibility(finding({
    id: "forced_consent_interaction",
    directVsInferred: "direct",
    evidenceDetails: {
      consentUiEvidence: {
        observed: true,
        runtimePath: {
          acceptClickDepth: 1,
          rejectAvailableOnFirstLayer: false,
          rejectClickDepth: 2,
          surfaceType: "cookie_banner"
        }
      }
    },
    severity: "high"
  }));

  assert.equal(ordinaryBanner.eligibility, "surface_only");
  assert.equal(ordinaryBanner.matchedCriteria.includes("consent_specific_blocking_interaction"), false);
  assert.ok(ordinaryBanner.demotionReasons.includes("missing_consent_specific_blocking_interaction"));
});

test("top-finding evaluator suppresses consent findings behind unrelated overlays", () => {
  const decision = evaluateTopFindingEligibility(finding({
    id: "forced_consent_interaction",
    evidenceDetails: {
      consentUiEvidence: {
        runtimePath: {
          observedAcceptPathDepth: 1,
          observedRejectPathDepth: null,
          unrelatedOverlayClassifier: "login_wall",
          visualHierarchyScore: null
        }
      }
    }
  }));

  assert.equal(decision.eligibility, "suppress");
  assert.ok(decision.demotionReasons.includes("unrelated_overlay_login_wall"));
});

test("top-finding evaluator requires promotion-grade post-reject requests for reject persistence", () => {
  const ambiguous = evaluateTopFindingEligibility(finding({
    id: "reject_tracking_persists_after_reject",
    confidence: "good",
    evidenceDetails: {
      consentInteraction: {
        clicked_label: "Reject all",
        action_type: "reject_all",
        rejectInteractionSucceeded: true
      },
      postRejectNonEssentialRequests: [
        {
          category: "analytics",
          requestUrl: "https://analytics.example/pixel",
          vendor: "Example Analytics"
        }
      ]
    },
    severity: "high"
  }));

  assert.equal(ambiguous.eligibility, "surface_only");
  assert.ok(ambiguous.missingCorroborators.includes("post_reject_non_essential_artifact"));
  assert.ok(!ambiguous.matchedCriteria.includes("reject_click_plus_post_reject_non_essential_request"));

  const confirmed = evaluateTopFindingEligibility(finding({
    id: "reject_tracking_persists_after_reject",
    confidence: "good",
    evidenceDetails: {
      consentInteraction: {
        action_type: "reject_all",
        clicked_label: "Reject all",
        rejectInteractionSucceeded: true
      },
      postRejectNonEssentialRequests: [
        {
          category: "analytics",
          ms_after_reject: 1200,
          requestUrl: "https://analytics.example/pixel",
          ts_ms: 2500,
          vendor: "Example Analytics"
        }
      ]
    },
    severity: "high"
  }));

  assert.equal(confirmed.eligibility, "top_candidate");
  assert.ok(confirmed.matchedCriteria.includes("reject_click_plus_post_reject_non_essential_request"));

  const contentClick = evaluateTopFindingEligibility(finding({
    id: "reject_tracking_persists_after_reject",
    confidence: "strong",
    evidenceDetails: {
      consentInteraction: {
        action_type: "reject_all",
        clicked_label: "Even silent heart attacks could speed up cognitive decline",
        rejectInteractionSucceeded: true
      },
      postRejectNonEssentialRequests: [
        {
          category: "advertising",
          ms_after_reject: 1200,
          requestUrl: "https://ads.example/pixel",
          ts_ms: 2500,
          vendor: "Example Ads"
        }
      ]
    },
    severity: "high"
  }));

  assert.equal(contentClick.eligibility, "surface_only");
  assert.ok(contentClick.missingCorroborators.includes("credible_reject_control_attribution"));
  assert.ok(contentClick.demotionReasons.includes("missing_credible_reject_control_attribution"));

  const articleRejectedHeadline = evaluateTopFindingEligibility(finding({
    id: "reject_tracking_persists_after_reject",
    confidence: "strong",
    evidenceDetails: {
      consentInteraction: {
        action_type: "reject_all",
        clicked_label:
          "I was rejected for a job 6 minutes after I applied. I told the company that AI was screening out strong candidates.",
        rejectInteractionSucceeded: true
      },
      postRejectNonEssentialRequests: [
        {
          category: "advertising",
          ms_after_reject: 1200,
          requestUrl: "https://ads.example/pixel",
          ts_ms: 2500,
          vendor: "Example Ads"
        }
      ]
    },
    severity: "high"
  }));

  assert.equal(articleRejectedHeadline.eligibility, "surface_only");
  assert.ok(articleRejectedHeadline.missingCorroborators.includes("credible_reject_control_attribution"));
  assert.ok(articleRejectedHeadline.demotionReasons.includes("missing_credible_reject_control_attribution"));

  const genericSaveWithoutState = evaluateTopFindingEligibility(finding({
    id: "reject_tracking_persists_after_reject",
    confidence: "strong",
    evidenceDetails: {
      consentInteraction: {
        action_type: "reject_all",
        clicked_label: "Save Settings",
        rejectInteractionSucceeded: true
      },
      postRejectNonEssentialRequests: [
        {
          category: "advertising",
          ms_after_reject: 1200,
          requestUrl: "https://ads.example/pixel",
          ts_ms: 2500,
          vendor: "Example Ads"
        }
      ]
    },
    severity: "high"
  }));

  assert.equal(genericSaveWithoutState.eligibility, "surface_only");
  assert.ok(genericSaveWithoutState.missingCorroborators.includes("credible_reject_control_attribution"));
  assert.ok(genericSaveWithoutState.demotionReasons.includes("missing_credible_reject_control_attribution"));

  const genericSaveWithPreferenceState = evaluateTopFindingEligibility(finding({
    id: "reject_tracking_persists_after_reject",
    confidence: "strong",
    evidenceDetails: {
      consentInteraction: {
        action_type: "save_preferences",
        clicked_label: "Save Settings",
        preferenceCategoryStates: [
          {
            category: "Advertising",
            enabled: false
          }
        ],
        rejectInteractionSucceeded: true
      },
      postRejectNonEssentialRequests: [
        {
          category: "advertising",
          ms_after_reject: 1200,
          requestUrl: "https://ads.example/pixel",
          ts_ms: 2500,
          vendor: "Example Ads"
        }
      ]
    },
    severity: "high"
  }));

  assert.equal(genericSaveWithPreferenceState.eligibility, "top_candidate");
  assert.ok(genericSaveWithPreferenceState.matchedCriteria.includes("reject_click_plus_post_reject_non_essential_request"));

  const ws01ControlAttribution = evaluateTopFindingEligibility(finding({
    id: "reject_tracking_persists_after_reject",
    confidence: "strong",
    evidenceDetails: {
      consentInteraction: {
        consent_surface_detected: true,
        control_role: "reject",
        control_selector: "button#onetrust-reject-all-handler",
        control_source: "cmp_button",
        control_text: "Reject all",
        rejectInteractionSucceeded: true
      },
      postRejectNonEssentialRequests: [
        {
          category: "advertising",
          ms_after_reject: 1200,
          requestUrl: "https://ads.example/pixel",
          ts_ms: 2500,
          vendor: "Example Ads"
        }
      ]
    },
    severity: "high"
  }));

  assert.equal(ws01ControlAttribution.eligibility, "top_candidate");
  assert.ok(ws01ControlAttribution.matchedCriteria.includes("reject_click_plus_post_reject_non_essential_request"));
});

test("top-finding evaluator top-ranks strong fingerprint clusters with identifier linkage", () => {
  const decision = evaluateTopFindingEligibility(finding({
    id: "probable_fingerprinting",
    directVsInferred: "inferred",
    evidenceDetails: {
      telemetryEvidence: {
        fingerprintClusterSummary: {
          clusterSize: 4,
          clusterStrength: "strong",
          identifierLinkageContext: "network_after_collection"
        }
      }
    }
  }));

  assert.equal(decision.eligibility, "top_candidate");
  assert.ok(decision.matchedCriteria.includes("fingerprint_identifier_or_network_linkage"));
});

test("top-finding evaluator keeps fingerprinting-related signals surface-only", () => {
  const decision = evaluateTopFindingEligibility(finding({
    id: "fingerprinting_related_signals_observed",
    directVsInferred: "inferred",
    evidenceDetails: {
      telemetryEvidence: {
        fingerprintClusterSummary: {
          clusterSize: 3,
          clusterStrength: "strong",
          identifierLinkageContext: "network_after_collection"
        }
      }
    }
  }));

  assert.equal(decision.eligibility, "surface_only");
  assert.ok(decision.matchedCriteria.includes("fingerprint_multi_signal_cluster"));
});

test("top-finding evaluator top-ranks keyboard findings with reproduced traversal escape", () => {
  const decision = evaluateTopFindingEligibility(finding({
    id: "keyboard_navigation_accessibility_issue",
    section: "Accessibility",
    evidenceDetails: {
      accessibilityEvidence: {
        focusManagementEvidence: [
          {
            issueType: "focus_trap_missing",
            keyboardTraversalEvidence: {
              backgroundFocusEscaped: true,
              reproducedWithKeyboard: true,
              tabStepCount: 4
            }
          }
        ]
      }
    }
  }));

  assert.equal(decision.eligibility, "top_candidate");
  assert.ok(decision.matchedCriteria.includes("keyboard_focus_escape_or_trap_evidence"));
});

test("top-finding evaluator demotes axe keyboard-rule evidence without concrete node detail", () => {
  const decision = evaluateTopFindingEligibility(finding({
    id: "keyboard_navigation_accessibility_issue",
    section: "Accessibility",
    evidenceDetails: {
      accessibilityEvidence: {
        observed: true,
        basis: "Axe example: scrollable-region-focusable on https://example.com/; selector .menu; nodes 1; impact serious.",
        ruleExamples: ["scrollable-region-focusable"]
      }
    }
  }));

  assert.equal(decision.eligibility, "surface_only");
  assert.ok(decision.missingCorroborators.includes("sanitized_html_snippet"));
  assert.ok(decision.missingCorroborators.includes("failure_summary"));
  assert.equal(decision.matchedCriteria.includes("automated_keyboard_accessibility_rule_evidence"), false);
});

test("top-finding evaluator treats concrete axe keyboard-node evidence as automated, not traversal-reproduced", () => {
  const decision = evaluateTopFindingEligibility(finding({
    id: "keyboard_navigation_accessibility_issue",
    section: "Accessibility",
    evidenceDetails: {
      accessibilityEvidence: {
        observed: true,
        axeEvidence: [
          {
            impact: "serious",
            nodeCount: 1,
            representativeNodes: [
              {
                failureSummary: "Fix keyboard focusability for this scrollable region.",
                htmlSnippet: "<div class=\"menu\" tabindex=\"-1\">...</div>",
                selectors: [".menu"]
              }
            ],
            representativeSelectors: [".menu"],
            ruleId: "scrollable-region-focusable"
          }
        ],
        basis: "Axe example: scrollable-region-focusable on https://example.com/; selector .menu; nodes 1; impact serious."
      }
    }
  }));

  assert.equal(decision.eligibility, "top_candidate");
  assert.ok(decision.matchedCriteria.includes("automated_keyboard_accessibility_rule_evidence"));
  assert.equal(decision.missingCorroborators.includes("keyboard_traversal_trace"), false);
});

test("top-finding evaluator demotes semantic labeling without concrete axe node evidence", () => {
  const decision = evaluateTopFindingEligibility(finding({
    id: "semantic_labeling_accessibility_issue",
    section: "Accessibility",
    evidenceDetails: {
      accessibilityEvidence: {
        axeEvidence: [
          {
            impact: "serious",
            nodeCount: 2,
            representativeSelectors: ["button.icon-only"],
            ruleId: "button-name"
          }
        ],
        basis: "Representative accessibility examples were retained across 1 page."
      }
    }
  }));

  assert.equal(decision.eligibility, "surface_only");
  assert.ok(decision.missingCorroborators.includes("axe_rule_ids"));
  assert.ok(decision.missingCorroborators.includes("affected_node_selectors"));
  assert.ok(decision.missingCorroborators.includes("sanitized_html_snippets"));
  assert.ok(decision.missingCorroborators.includes("failure_summaries"));
});

test("top-finding evaluator keeps semantic labeling eligible with concrete axe node evidence", () => {
  const decision = evaluateTopFindingEligibility(finding({
    id: "semantic_labeling_accessibility_issue",
    section: "Accessibility",
    evidenceDetails: {
      accessibilityEvidence: {
        axeEvidence: [
          {
            impact: "serious",
            nodeCount: 2,
            representativeNodes: [
              {
                failureSummary: "Fix any of the following: Element does not have inner text that is visible to screen readers.",
                htmlSnippet: "<button class=\"icon-only\"></button>",
                selectors: ["button.icon-only"]
              }
            ],
            representativeSelectors: ["button.icon-only"],
            ruleId: "button-name"
          }
        ],
        basis: "Axe example: button-name on https://example.com/; selector button.icon-only; nodes 2; impact serious."
      }
    }
  }));

  assert.equal(decision.eligibility, "top_candidate");
  assert.ok(decision.matchedCriteria.includes("automated_semantic_accessibility_rule_evidence"));
  assert.equal(decision.missingCorroborators.includes("sanitized_html_snippets"), false);
});

test("top-finding evaluator recognizes retained keyboardTraversalTrace aliases without requiring them for axe-only keyboard evidence", () => {
  const withTraversalTrace = evaluateTopFindingEligibility(finding({
    id: "keyboard_navigation_accessibility_issue",
    section: "Accessibility",
    evidenceDetails: {
      accessibilityEvidence: {
        focusManagementEvidence: [
          {
            keyboardTraversalTrace: {
              backgroundFocusEscaped: false,
              reproducedWithKeyboard: true,
              tabStepCount: 3
            }
          }
        ]
      }
    }
  }));
  const withFocusPathEvidence = evaluateTopFindingEligibility(finding({
    id: "keyboard_navigation_accessibility_issue",
    section: "Accessibility",
    evidenceDetails: {
      accessibilityEvidence: {
        focusManagementEvidence: [
          {
            focusPathEvidence: {
              reproducedWithKeyboard: true,
              tabStepCount: 2
            }
          }
        ]
      }
    }
  }));

  assert.ok(withTraversalTrace.matchedCriteria.includes("keyboard_traversal_trace"));
  assert.ok(withFocusPathEvidence.matchedCriteria.includes("keyboard_traversal_trace"));
});

test("top-finding evaluator still requires traversal evidence for focus-management findings", () => {
  const decision = evaluateTopFindingEligibility(finding({
    id: "focus_management_issue",
    section: "Accessibility",
    evidenceDetails: {
      accessibilityEvidence: {
        observed: true,
        basis: "Focus issue suspected from automated context."
      }
    }
  }));

  assert.equal(decision.eligibility, "surface_only");
  assert.ok(decision.missingCorroborators.includes("keyboard_traversal_trace"));
  assert.ok(decision.demotionReasons.includes("missing_keyboard_traversal_trace"));
});

test("top-finding evaluator top-ranks focus management only with WS01 behavior-reproduced evidence", () => {
  const decision = evaluateTopFindingEligibility(finding({
    id: "focus_management_issue",
    section: "Accessibility",
    evidenceDetails: {
      accessibilityEvidence: {
        focusManagementEvidence: [
          {
            dialogContext: {
              ariaModal: "true",
              backgroundTabbableCount: 2,
              closeControl: { selector: "button[aria-label='Close']" },
              focusableCount: 3,
              opener: null,
              role: "dialog",
              selector: "[role='dialog']"
            },
            evidenceStrength: "behavior_reproduced",
            expected: "Tab navigation should remain contained within an open modal/dialog until it is dismissed.",
            focusTrace: [
              {
                action: "snapshot",
                activeElement: { selector: "button[aria-label='Close']", tagName: "button" },
                activeInsideDialog: true,
                step: 0
              },
              {
                action: "press_tab",
                activeElement: { selector: "a:text(\"Home\")", tagName: "a" },
                activeInsideDialog: false,
                step: 1
              }
            ],
            issueType: "focus_trap_missing",
            keyboardTraversalEvidence: {
              backgroundFocusEscaped: true,
              reproducedWithKeyboard: true,
              tabStepCount: 1
            },
            observed: "Focus left the dialog while it was still open during keyboard-only tab navigation.",
            pageUrl: "https://example.com/",
            source: "ws01_playwright_focus_probe"
          }
        ]
      }
    }
  }));

  assert.equal(decision.eligibility, "top_candidate");
  assert.ok(decision.matchedCriteria.includes("behavior_reproduced_focus_management_evidence"));
});
