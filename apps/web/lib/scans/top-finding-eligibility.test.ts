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

test("top-finding evaluator top-ranks sensitive replay only with endpoint and same-scope sensitive evidence", () => {
  const decision = evaluateTopFindingEligibility(finding({
    id: "possible_session_replay_on_sensitive_input_surface",
    directVsInferred: "mixed",
    evidenceDetails: {
      inputSurfaceEvidence: { sameScope: true },
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
});

test("top-finding evaluator top-ranks scan-level sensitive replay while retaining same-flow caveat", () => {
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

  assert.equal(decision.eligibility, "top_candidate");
  assert.ok(decision.matchedCriteria.includes("session_replay_collection_with_scan_level_sensitive_surface"));
  assert.ok(decision.missingCorroborators.includes("same_page_or_same_flow_replay_linkage"));
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

test("top-finding evaluator treats axe keyboard-rule evidence as automated, not traversal-reproduced", () => {
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

  assert.equal(decision.eligibility, "top_candidate");
  assert.ok(decision.matchedCriteria.includes("automated_keyboard_accessibility_rule_evidence"));
  assert.equal(decision.missingCorroborators.includes("keyboard_traversal_trace"), false);
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

  assert.ok(decision.missingCorroborators.includes("keyboard_traversal_trace"));
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
