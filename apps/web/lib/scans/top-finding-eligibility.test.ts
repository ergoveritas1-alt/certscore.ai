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
