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
          contradictionBasis: "Policy promised no tracking before consent, but runtime evidence showed tracking.",
          conflictType: "tracking_before_consent",
          policyClaimType: "tracking_promise",
          runtimeObservationType: "tracker_runtime_observed"
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
          contradictionBasis: "The policy and consent surface imply tracking should begin only after a valid consent interaction.",
          conflictType: "tracking_before_consent",
          policyClaimType: "consent_gated_tracking_claim",
          runtimeObservationType: "tracker_runtime_observed"
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
      })
    ]
  });

  const gpc = evaluation.debugDecisions.find((decision) => decision.unifiedFindingId === "gpc_disclosure_present");
  const tracking = evaluation.debugDecisions.find((decision) => decision.unifiedFindingId === "tracking_technologies_disclosure_present");

  assert.equal(gpc?.decisionState, "review");
  assert.equal(gpc?.reportLane, "main");
  assert.ok(gpc?.appliedRules.includes("evidence.positive_surface.review_high_value_privacy_disclosure"));
  assert.equal(tracking?.decisionState, "review");
  assert.equal(tracking?.reportLane, "main");
  assert.ok(tracking?.appliedRules.includes("evidence.positive_surface.review_high_value_privacy_disclosure"));
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
          ambiguityScore: 78
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

test("positive-presence findings are retained as standalone positive context when no stronger finding exists", () => {
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
  assert.equal(decision?.reportLane, "main");
  assert.equal(decision?.reportable, true);
  assert.ok(decision?.appliedRules.includes("support.orphan_positive_surface_retained"));
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

test("runtime-backed consent-control failures confirm when the retained evidence shows the control failed", () => {
  const evaluation = evaluateUnifiedFindingSurfacing({
    packets: [
      makePacket("reject_did_not_reduce_tracking", {
        confidenceInputs: {
          ...makePacket("reject_did_not_reduce_tracking").confidenceInputs,
          hasDirectRuntimeEvidence: true,
          hasStructuredValidationEvidence: true
        }
      })
    ]
  });

  const decision = evaluation.debugDecisions[0];
  assert.equal(decision?.decisionState, "confirmed");
  assert.equal(decision?.surfaceTier, "headline");
  assert.ok(decision?.appliedRules.includes("evidence.consent_behavior.confirmed_specific_runtime_failure"));
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
      makePacket("session_replay_on_sensitive_input_surface", {
        confidenceBand: "high",
        confidenceInputs: {
          ...makePacket("session_replay_on_sensitive_input_surface").confidenceInputs,
          hasConcretePayloadEvidence: true,
          hasDirectRuntimeEvidence: true
        },
        details: {
          dataTypes: ["financial"],
          family: "sensitive_data",
          kind: "session_replay_on_sensitive_input_surface"
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

  const specific = evaluation.debugDecisions.find((decision) => decision.unifiedFindingId === "session_replay_on_sensitive_input_surface");
  const generic = evaluation.debugDecisions.find((decision) => decision.unifiedFindingId === "session_replay_undisclosed");

  assert.equal(specific?.decisionState, "confirmed");
  assert.equal(generic?.decisionState, "support_only");
  assert.equal(generic?.supportTargetId, "session_replay_on_sensitive_input_surface");
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
