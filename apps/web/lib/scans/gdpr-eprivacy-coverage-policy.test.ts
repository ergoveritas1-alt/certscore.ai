import assert from "node:assert/strict";
import test from "node:test";
import { deriveGdprEprivacyCoveragePolicyOutcomes } from "./gdpr-eprivacy-coverage-policy";

const completedInputBase = {
  coverageLimited: true,
  scanCompleted: true
};

test("deriveGdprEprivacyCoveragePolicyOutcomes treats retained consent and runtime observations as row-specific coverage", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    events: [
      {
        eventType: "runtime.build_phase_diagnostic",
        metadataJson: {
          phase: "hybrid_auto_local_evidence",
          status: "ok"
        }
      },
      {
        eventType: "runtime.build_phase_diagnostic",
        metadataJson: {
          consentInteractionSkipNegativeReasonCodes: ["complete_reject_choice_controls_not_detected"],
          phase: "consent_audit_entry",
          shouldAttemptConsentAudit: true,
          shouldSkipConsentInteractionAudit: false,
          status: "ok"
        }
      },
      {
        eventType: "runtime.build_phase_diagnostic",
        metadataJson: {
          negativeReasonCodes: ["reject_interaction_not_confirmed", "post_reject_timing_window_missing"],
          phase: "reject_persistence_diagnostic",
          rejectInteractionSucceeded: false,
          shouldAttemptConsentAudit: true,
          status: "ok"
        }
      },
      {
        eventType: "runtime.build_phase_diagnostic",
        metadataJson: {
          eligibleSensitiveFieldCount: 0,
          phase: "sensitive_third_party_tracking_correlation",
          status: "ok"
        }
      }
    ],
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        networkSummary: {
          thirdPartyDomainCount: 7
        },
        storageSummary: {
          cookiesBeforeConsentCount: 4,
          cookiesSeenCount: 6
        }
      }
    },
    snapshot: {
      consent_interaction_model: "preferences_only",
      consent_preferences_button_count: 5,
      consent_reject_button_count: 0,
      cookie_count_total: 4,
      first_party_cookie_set_before_consent: true,
      form_count_total: 2,
      privacy_policy_present: false,
      session_replay_tool_detected: false,
      session_replay_tracker_count: 0,
      third_party_script_domain_count: 6,
      tracker_vendor_count: 3
    }
  });

  assert.equal(outcomes.pre_consent_cookies_storage?.status, "Insufficient evidence");
  assert.match(outcomes.pre_consent_cookies_storage?.limitation ?? "", /before-consent observations/i);
  assert.equal(outcomes.reject_all_path_availability?.status, "Insufficient evidence");
  assert.match(outcomes.reject_all_path_availability?.limitation ?? "", /complete reject-all control/i);
  assert.equal(outcomes.post_reject_tracking_reduction?.status, "Not testable");
  assert.match(outcomes.post_reject_tracking_reduction?.limitation ?? "", /no reject action was confirmed/i);
  assert.equal(outcomes.runtime_vendor_disclosure_alignment?.status, "Not testable");
  assert.match(outcomes.runtime_vendor_disclosure_alignment?.limitation ?? "", /no privacy or cookie policy surface/i);
  assert.equal(outcomes.sensitive_surfaces_third_party_tracking?.status, "Not observed");
  assert.equal(outcomes.session_replay_fingerprinting_review?.status, "Not observed");
  assert.equal(outcomes.cross_border_endpoint_review?.status, "Not testable");
  assert.match(outcomes.cross_border_endpoint_review?.limitation ?? "", /jurisdiction or transfer-region evidence/i);
});

test("deriveGdprEprivacyCoveragePolicyOutcomes marks retained consent surfaces as observed", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        firstLayerConsentChoices: {
          capturedBeforeInteraction: true,
          visibleChoiceLabels: ["Accept", "Decline"]
        }
      }
    },
    snapshot: {
      cookie_banner_present: true
    }
  });

  assert.equal(outcomes.consent_surface_observed?.status, "Observed");
  assert.deepEqual(outcomes.consent_surface_observed?.evidenceRefs, [
    "Evidence: retained consent surface observation",
    "Visible choice: Accept",
    "Visible choice: Decline"
  ]);
});

test("deriveGdprEprivacyCoveragePolicyOutcomes treats direct same-context sensitive tracking correlation as a gap", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    events: [
      {
        eventType: "runtime.build_phase_diagnostic",
        metadataJson: {
          coverageStatus: "usable",
          directVsInferred: "direct",
          evidenceConfidence: "moderate",
          highSensitivityDataCollectionDetected: true,
          phase: "sensitive_third_party_tracking_correlation",
          samePageTrackingObserved: true,
          sensitiveFieldLabels: ["Medical condition"],
          sensitiveFormUrls: ["https://example.com/appointment"],
          status: "ok",
          thirdPartyTrackingCategories: ["analytics"],
          thirdPartyTrackingVendors: ["Google Analytics"]
        }
      }
    ]
  });

  assert.equal(outcomes.sensitive_surfaces_third_party_tracking?.status, "Gap observed");
  assert.deepEqual(
    outcomes.sensitive_surfaces_third_party_tracking?.criticalEvidence.missingOrIncompleteSourceSignals,
    []
  );
  assert.match(
    outcomes.sensitive_surfaces_third_party_tracking?.limitation ?? "",
    /sensitive or high-risk collection surface/i
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes keeps disconnected sensitive tracking correlation as review", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    events: [
      {
        eventType: "runtime.build_phase_diagnostic",
        metadataJson: {
          coverageStatus: "usable",
          directVsInferred: "direct",
          evidenceConfidence: "moderate",
          highSensitivityDataCollectionDetected: true,
          phase: "sensitive_third_party_tracking_correlation",
          samePageTrackingObserved: false,
          sameFlowTrackingObserved: false,
          sensitiveFieldLabels: ["Medical condition"],
          status: "ok",
          thirdPartyTrackingCategories: ["analytics"],
          thirdPartyTrackingVendors: ["Google Analytics"]
        }
      }
    ]
  });

  assert.equal(outcomes.sensitive_surfaces_third_party_tracking?.status, "Review signal");
  assert.match(outcomes.sensitive_surfaces_third_party_tracking?.limitation ?? "", /does not confirm same-page/i);
});

test("deriveGdprEprivacyCoveragePolicyOutcomes marks retained sensitive third-party payload exposure as a gap", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    events: [
      {
        eventType: "runtime.build_phase_diagnostic",
        metadataJson: {
          coverageStatus: "usable",
          evidenceConfidence: "moderate",
          phase: "sensitive_third_party_tracking_correlation",
          sensitivePayloadViolations: [
            {
              detectedType: "email",
              evidenceStrength: "concrete_payload",
              payloadExposureObserved: true,
              requestUrl: "https://tracker.example.test/collect",
              vendorHost: "tracker.example.test"
            }
          ],
          status: "ok"
        }
      }
    ]
  });

  assert.equal(outcomes.sensitive_surfaces_third_party_tracking?.status, "Gap observed");
  assert.match(
    outcomes.sensitive_surfaces_third_party_tracking?.limitation ?? "",
    /sensitive or personal-data value associated with a third-party request/i
  );
  assert.equal(
    outcomes.sensitive_surfaces_third_party_tracking?.criticalEvidence.retainedEvidence.payloadExposureObserved,
    true
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes keeps generic concrete-payload provenance without exposure or same-flow linkage as review", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    events: [
      {
        eventType: "runtime.build_phase_diagnostic",
        metadataJson: {
          coverageStatus: "usable",
          directVsInferred: "inferred",
          evidenceConfidence: "moderate",
          highSensitivityDataCollectionDetected: true,
          phase: "sensitive_third_party_tracking_correlation",
          samePageTrackingObserved: false,
          sameFlowTrackingObserved: false,
          sensitivePayloadViolations: [
            {
              evidenceStrength: "concrete_payload",
              payloadExposureObserved: false,
              requestUrl: "https://tracker.example.test/collect",
              sameFlowLinkage: {
                samePageOrFlow: false,
                userValueObserved: false
              },
              vendorHost: "tracker.example.test"
            }
          ],
          status: "ok",
          thirdPartyTrackingVendors: ["Example Analytics"]
        }
      }
    ]
  });

  assert.equal(outcomes.sensitive_surfaces_third_party_tracking?.status, "Review signal");
  assert.match(outcomes.sensitive_surfaces_third_party_tracking?.limitation ?? "", /does not confirm same-page/i);
  assert.equal(
    outcomes.sensitive_surfaces_third_party_tracking?.criticalEvidence.retainedEvidence.payloadExposureObserved,
    false
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes marks completed consent surface checks without a surface as not observed", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    events: [
      {
        eventType: "runtime.build_phase_diagnostic",
        metadataJson: {
          phase: "browser_runtime_capture",
          status: "ok"
        }
      }
    ],
    snapshot: {
      cookie_banner_present: false
    }
  });

  assert.equal(outcomes.consent_surface_observed?.status, "Not observed");
  assert.match(outcomes.consent_surface_observed?.limitation ?? "", /did not retain an actionable consent surface/i);
});

test("deriveGdprEprivacyCoveragePolicyOutcomes projects preview consent lifecycle limitations into row outcomes", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      consent_audit_completed: false,
      consent_actionable_choice_observed: false,
      consent_blocker_text_snippet:
        "Stopped before homepage setup because preflight already verified the core legal docs and urlscan provided enough runtime evidence for the lean scan path.",
      consent_surface_observed: false,
      hybridRuntimeEvidence: {
        consentLifecycleAudit: {
          actionableChoiceObserved: false,
          attempted: false,
          blockerTextSnippet:
            "Stopped before homepage setup because preflight already verified the core legal docs and urlscan provided enough runtime evidence for the lean scan path.",
          consentSurfaceObserved: false,
          reason: "preview_preflight_short_circuit",
          requiredFullRuntimeAudit: true
        }
      }
    }
  });

  assert.equal(outcomes.reject_all_path_availability?.status, "Not testable");
  assert.equal(outcomes.reject_all_path_availability?.criticalEvidence.pipeline.projectionStage, "coverage_policy");
  assert.match(outcomes.reject_all_path_availability?.limitation ?? "", /did not run consent lifecycle/i);
  assert.equal(outcomes.post_reject_tracking_reduction?.status, "Not testable");
  assert.equal(outcomes.preference_withdrawal_control?.status, "Not testable");
  assert.deepEqual(outcomes.reject_all_path_availability?.evidenceRefs, [
    "Evidence: consent lifecycle audit limitation",
    "Limitation reason: preview_preflight_short_circuit"
  ]);
});

test("deriveGdprEprivacyCoveragePolicyOutcomes marks policy/vendor alignment observed when both sides are retained", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    snapshot: {
      privacy_policy_present: true,
      tracker_vendor_count: 2
    }
  });

  assert.equal(outcomes.runtime_vendor_disclosure_alignment?.status, "Insufficient evidence");
  assert.match(outcomes.runtime_vendor_disclosure_alignment?.limitation ?? "", /no canonical vendor-disclosure comparison artifact/i);
});

test("deriveGdprEprivacyCoveragePolicyOutcomes consumes retained vendor-disclosure comparison evidence", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      runtimeVendorDisclosureEvidence: [
        {
          coverageStatus: "usable",
          directVsInferred: "direct",
          evidenceConfidence: "moderate",
          matchedVendorDisclosureCount: 0,
          mismatchRationale: "Observed runtime vendor was not clearly matched in retained disclosure evidence.",
          observedRuntimeDomains: ["k.clarity.ms"],
          observedRuntimeVendors: ["Microsoft Clarity"],
          policySurfacesSearched: [
            {
              reached: true,
              searchedTerms: ["Microsoft Clarity", "clarity.ms"],
              snippet: "Our website uses persistent cookies with a third party technology partner.",
              type: "privacy_policy",
              unmatchedVendorNames: ["Microsoft Clarity"],
              url: "https://example.test/privacy"
            }
          ],
          subtype: "runtime_vendor_not_disclosed",
          unmatchedRuntimeDomains: ["k.clarity.ms"],
          unmatchedRuntimeVendors: ["Microsoft Clarity"],
          unmatchedVendorDisclosureCount: 1
        }
      ]
    },
    snapshot: {
      privacy_policy_present: true,
      tracker_vendor_count: 1
    }
  });

  assert.equal(outcomes.runtime_vendor_disclosure_alignment?.status, "Gap observed");
  assert.deepEqual(outcomes.runtime_vendor_disclosure_alignment?.evidenceRefs, [
    "Runtime vendor count: 1",
    "Disclosure comparison rows: 1",
    "Unmatched runtime vendor/domain count: 1"
  ]);
});

test("deriveGdprEprivacyCoveragePolicyOutcomes treats partial runtime vendor disclosure mismatch as a gap", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      runtimeVendorDisclosureEvidence: [
        {
          coverageStatus: "usable",
          directVsInferred: "direct",
          evidenceConfidence: "moderate",
          matchedVendorDisclosureCount: 1,
          mismatchRationale:
            "Observed runtime vendors (Cloudflare Web Analytics, Google Tag Manager) were not clearly matched by name or known domain alias in retained policy disclosure surfaces.",
          observedRuntimeDomains: [
            "www.googletagmanager.com",
            "static.cloudflareinsights.com",
            "www.google-analytics.com"
          ],
          observedRuntimeVendors: [
            "Cloudflare Web Analytics",
            "Google Analytics",
            "Google Tag Manager"
          ],
          policySurfacesSearched: [
            {
              matchedVendorNames: ["Google Analytics"],
              reached: true,
              searchedTerms: ["Cloudflare Web Analytics", "Google Analytics", "Google Tag Manager"],
              snippet: "The trusted third parties with whom we directly work include Google Analytics.",
              type: "privacy_policy",
              unmatchedVendorNames: ["Cloudflare Web Analytics", "Google Tag Manager"],
              url: "https://www.caltech.edu/privacy-notice"
            }
          ],
          subtype: "runtime_vendor_not_disclosed",
          unmatchedRuntimeDomains: ["www.googletagmanager.com"],
          unmatchedRuntimeVendors: ["Cloudflare Web Analytics", "Google Tag Manager"],
          unmatchedVendorDisclosureCount: 2
        }
      ]
    },
    snapshot: {
      privacy_policy_present: true,
      tracker_vendor_count: 3
    }
  });

  assert.equal(outcomes.runtime_vendor_disclosure_alignment?.status, "Gap observed");
  assert.deepEqual(
    outcomes.runtime_vendor_disclosure_alignment?.criticalEvidence.missingOrIncompleteSourceSignals,
    []
  );
  assert.equal(
    outcomes.runtime_vendor_disclosure_alignment?.criticalEvidence.retainedEvidence.unmatchedRuntimeVendorOrDomainCount,
    2
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes surfaces post-accept session replay as observed evidence", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      consentAcceptInteractionSucceeded: true,
      consentAcceptNewTrackerVendorNames: ["Microsoft Clarity"],
      consentPostAcceptTrackerEvidenceUrls: [
        "https://www.clarity.ms/tag/example",
        "https://c.clarity.ms/collect"
      ],
      consentPostAcceptTrackerVendorNames: ["Microsoft Clarity"],
      hybridRuntimeEvidence: {
        sessionReplayEvidenceSummary: {
          collectionEndpointObserved: true,
          libraryOnly: false,
          maskingOrExclusionObserved: false,
          sensitiveSurfaceOverlap: false,
          vendors: ["Microsoft Clarity"]
        }
      },
      requestPurposeClassificationConfidence: [
        {
          category: "session_replay",
          confidence: 0.9,
          essentiality: "non_essential",
          firstObservedMs: 2410,
          requestUrl: "https://www.clarity.ms/tag/example",
          runtimePhase: "post_accept",
          timingStatus: "post_consent",
          vendor: "Microsoft Clarity"
        },
        {
          category: "session_replay",
          confidence: 0.9,
          essentiality: "non_essential",
          firstObservedMs: 2680,
          requestUrl: "https://c.clarity.ms/collect",
          runtimePhase: "post_accept",
          timingStatus: "post_consent",
          vendor: "Microsoft Clarity"
        }
      ],
      runtimeVendorDisclosureEvidence: [
        {
          coverageStatus: "usable",
          directVsInferred: "direct",
          evidenceConfidence: "moderate",
          matchedVendorDisclosureCount: 0,
          mismatchRationale: "Microsoft Clarity was not clearly matched in retained policy text.",
          observedRuntimeDomains: ["clarity.ms"],
          observedRuntimeVendors: ["Microsoft Clarity"],
          policySurfacesSearched: [],
          subtype: "runtime_vendor_not_disclosed",
          unmatchedRuntimeDomains: ["clarity.ms"],
          unmatchedRuntimeVendors: ["Microsoft Clarity"],
          unmatchedVendorDisclosureCount: 1
        }
      ]
    },
    snapshot: {
      session_replay_tool_detected: false,
      session_replay_tracker_count: 0
    }
  });

  const outcome = outcomes.session_replay_fingerprinting_review;
  assert.equal(outcome?.status, "Observed");
  assert.match(outcome?.limitation ?? "", /no pre-consent replay evidence was retained/i);
  assert.deepEqual(outcome?.evidenceRefs, [
    "Session replay signal observed after consent",
    "Runtime vendor: Microsoft Clarity",
    "Consent state: post_accept"
  ]);
  assert.deepEqual(
    outcome?.criticalEvidence.retainedEvidence.sessionReplayEvidence,
    {
      acceptInteractionConfirmed: true,
      collectionEndpointObserved: true,
      consentStates: ["post_accept"],
      firstSeenMs: 2410,
      libraryLoadObserved: true,
      maskingOrExclusionObserved: false,
      postAcceptObserved: true,
      postChoiceConsentControlsObserved: false,
      preConsentObserved: false,
      requestUrls: [
        "https://www.clarity.ms/tag/example",
        "https://c.clarity.ms/collect"
      ],
      sensitiveSurfaceOverlap: false,
      vendorDisclosed: false,
      vendorDisclosureGap: true,
      vendors: ["Microsoft Clarity"]
    }
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes declares retained session replay vendor without pre-consent replay as observed", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      sessionReplayEvidenceSummary: {
        collectionEndpointObserved: true,
        libraryOnly: false,
        vendors: ["Microsoft Clarity"]
      }
    },
    snapshot: {
      session_replay_runtime_artifacts: [
        "vendor:Microsoft Clarity|signature:clarity|host:www.clarity.ms|source:script_signature"
      ],
      session_replay_tracker_count: 0,
      session_replay_vendor_names: ["Microsoft Clarity"]
    }
  });

  const outcome = outcomes.session_replay_fingerprinting_review;
  assert.equal(outcome?.status, "Observed");
  assert.match(outcome?.limitation ?? "", /no pre-consent replay evidence retained/i);
  assert.deepEqual(outcome?.evidenceRefs, [
    "Session replay signal observed; pre-consent replay not retained",
    "Runtime vendor: Microsoft Clarity",
    "Consent timing: no pre-consent replay evidence retained"
  ]);
  assert.deepEqual(
    outcome?.criticalEvidence.retainedEvidence.sessionReplayEvidence,
    {
      collectionEndpointObserved: true,
      libraryLoadObserved: false,
      postAcceptObserved: false,
      postChoiceConsentControlsObserved: false,
      preConsentObserved: false,
      runtimeArtifacts: [
        "vendor:Microsoft Clarity|signature:clarity|host:www.clarity.ms|source:script_signature"
      ],
      vendorDisclosed: false,
      vendorDisclosureGap: false,
      vendors: ["Microsoft Clarity"]
    }
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes consumes nested reject interaction evidence", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        consentOutcomeSummary: {
          rejectInteractionSucceeded: true
        }
      }
    }
  });

  assert.equal(outcomes.post_reject_tracking_reduction?.status, "Not observed");
  assert.deepEqual(outcomes.post_reject_tracking_reduction?.evidenceRefs, ["Evidence: reject interaction retained"]);
});

test("deriveGdprEprivacyCoveragePolicyOutcomes marks retained first-layer decline path as observed", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      consent_reject_interaction_succeeded: true,
      rejectPathDepthAndAvailability: {
        availability: "available",
        completeRejectPathAvailable: true,
        firstLayerConsentChoices: {
          rejectVisibleOnFirstLayer: true,
          visibleChoiceLabels: ["accept", "decline"]
        },
        layerInspected: "first_layer",
        rejectClickDepth: 1,
        rejectInteractionSucceeded: true
      }
    }
  });

  assert.equal(outcomes.reject_all_path_availability?.status, "Observed");
  assert.deepEqual(outcomes.reject_all_path_availability?.evidenceRefs, [
    "Evidence: reject path depth and availability",
    "Layer inspected: first_layer",
    "Reject click depth: 1",
    "Visible choice: decline"
  ]);
});

test("deriveGdprEprivacyCoveragePolicyOutcomes consumes WS01 post-reject reduction artifact statuses", () => {
  const notTestable = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      postRejectTrackingReductionEvidence: {
        evidenceSource: "consent_interaction_audit",
        reductionEvaluationStatus: "not_testable",
        rejectInteractionConfirmed: false,
        rejectInteractionFailureClass: "reject_control_not_found",
        rejectInteractionFailureReason:
          "WS01 observed a consent surface but did not retain a reject, essential-only, or opt-out control to click.",
        negativeReasonCodes: ["reject_interaction_not_confirmed", "reject_control_not_found"]
      }
    }
  });
  assert.equal(notTestable.post_reject_tracking_reduction?.status, "Not testable");
  assert.match(notTestable.post_reject_tracking_reduction?.limitation ?? "", /did not retain a reject/i);
  assert.equal(
    notTestable.post_reject_tracking_reduction?.criticalEvidence.retainedEvidence.rejectInteractionFailureClass,
    "reject_control_not_found"
  );

  const retainedLifecycleSurface = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        consentControlLifecycleEvidence: {
          cmpReopenControlObserved: false,
          consentDependentTrackingObserved: true,
          controlsSearched: ["cookie settings"],
          cookiePreferencesLinkObserved: false,
          coverageStatus: "usable",
          footerLinksInspected: ["Privacy Notice -> https://www.example.test/privacy"],
          footerPreferenceLinkObserved: false,
          initialConsentLayerObserved: true,
          observedControls: [],
          pagesChecked: ["https://www.example.test/"],
          policyLinksInspected: ["https://www.example.test/privacy"],
          preferenceCenterReachableAfterInitialLayer: null,
          privacySettingsControlObserved: false,
          withdrawalTextObserved: false
        }
      },
      postRejectTrackingReductionEvidence: {
        evidenceSource: "consent_interaction_audit",
        negativeReasonCodes: ["reject_interaction_not_confirmed", "consent_surface_not_observed"],
        postRejectRequestRecordsObserved: false,
        postRejectWindowAvailable: false,
        reductionEvaluationStatus: "not_testable",
        rejectInteractionConfirmed: false,
        rejectInteractionFailureClass: "consent_surface_not_observed",
        rejectInteractionFailureReason: "WS01 did not retain an observed consent surface during the reject-path audit."
      }
    }
  });
  assert.equal(retainedLifecycleSurface.post_reject_tracking_reduction?.status, "Not testable");
  assert.equal(
    retainedLifecycleSurface.post_reject_tracking_reduction?.criticalEvidence.retainedEvidence.rejectInteractionFailureClass,
    "reject_control_not_found"
  );
  assert.match(
    retainedLifecycleSurface.post_reject_tracking_reduction?.limitation ?? "",
    /observed a consent surface but did not retain a reject/i
  );

  const insufficient = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      postRejectTrackingReductionEvidence: {
        evidenceSource: "consent_interaction_audit",
        reductionEvaluationStatus: "insufficient_evidence",
        rejectInteractionConfirmed: true,
        negativeReasonCodes: ["post_reject_timing_window_missing"]
      }
    }
  });
  assert.equal(insufficient.post_reject_tracking_reduction?.status, "Insufficient evidence");

  const reduced = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      postRejectTrackingReductionEvidence: {
        evidenceSource: "consent_interaction_audit",
        reasonCodes: ["reject_interaction_succeeded", "post_reject_timing_window_available"],
        reductionEvaluationStatus: "reduced",
        rejectInteractionConfirmed: true
      }
    }
  });
  assert.equal(reduced.post_reject_tracking_reduction?.status, "Not observed");
  assert.deepEqual(reduced.post_reject_tracking_reduction?.evidenceRefs, [
    "Evidence: post-reject tracking reduction evidence",
    "reject_interaction_succeeded",
    "post_reject_timing_window_available"
  ]);

  const retainedPersistenceWithoutProjection = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      postRejectTrackingReductionEvidence: {
        evidenceSource: "consent_interaction_audit",
        reasonCodes: ["non_essential_tracking_persisted_after_reject"],
        reductionEvaluationStatus: "not_reduced",
        rejectInteractionConfirmed: true
      }
    }
  });
  assert.equal(retainedPersistenceWithoutProjection.post_reject_tracking_reduction?.status, "Insufficient evidence");
});

test("deriveGdprEprivacyCoveragePolicyOutcomes keeps general page accessibility issues as consent-control review", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      accessibilityAxeEvidence: [
        {
          help: "ARIA input fields must have an accessible name",
          impact: "serious",
          pageUrl: "https://www.caltech.edu/",
          representativeSelectors: [".grid-carousel__carousel-inner"],
          ruleId: "aria-input-field-name"
        },
        {
          help: "Certain ARIA roles must contain particular children",
          impact: "critical",
          pageUrl: "https://www.caltech.edu/",
          representativeSelectors: [".grid-carousel__carousel-inner"],
          ruleId: "aria-required-children"
        }
      ],
      californiaPrivacyEvidence: {
        privacyControlAccessibilityIssueObserved: false,
        privacyControlAccessibilitySignals: []
      },
      visualAccessReview: {
        retained: true
      }
    },
    snapshot: {
      wcag_aria_error_count: 4,
      wcag_focus_indicator_issue_count: 0,
      wcag_form_label_error_count: 0,
      wcag_keyboard_navigation_issue_count: 0
    }
  });

  assert.equal(outcomes.accessibility_consent_controls?.status, "Review signal");
  assert.match(
    outcomes.accessibility_consent_controls?.limitation ?? "",
    /not clearly tied to consent or privacy-choice controls/i
  );
  assert.equal(
    outcomes.accessibility_consent_controls?.criticalEvidence.retainedEvidence.controlAccessibilityIssueObserved,
    false
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes marks clean consent-control accessibility checks as not observed", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      californiaPrivacyEvidence: {
        privacyControlAccessibilityIssueObserved: false,
        privacyControlAccessibilitySignals: []
      },
      visualAccessReview: {
        retained: true
      }
    },
    snapshot: {
      cookie_banner_present: true,
      wcag_aria_error_count: 0,
      wcag_focus_indicator_issue_count: 0,
      wcag_form_label_error_count: 0,
      wcag_keyboard_navigation_issue_count: 0
    }
  });

  assert.equal(outcomes.accessibility_consent_controls?.status, "Not observed");
  assert.match(
    outcomes.accessibility_consent_controls?.limitation ?? "",
    /No basic automated accessibility issue was retained/i
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes flags retained consent-control accessibility evidence as a gap", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      accessibilityAxeEvidence: [
        {
          help: "Buttons must have discernible text",
          impact: "serious",
          pageUrl: "https://example.com/",
          representativeSelectors: ["button.cookie-settings"],
          ruleId: "button-name"
        }
      ],
      californiaPrivacyEvidence: {
        privacyControlAccessibilityIssueObserved: true,
        privacyControlAccessibilitySignals: ["button-name"]
      }
    },
    snapshot: {
      wcag_aria_error_count: 1
    }
  });

  assert.equal(outcomes.accessibility_consent_controls?.status, "Gap observed");
  assert.deepEqual(
    outcomes.accessibility_consent_controls?.criticalEvidence.missingOrIncompleteSourceSignals,
    []
  );
  assert.deepEqual(
    outcomes.accessibility_consent_controls?.criticalEvidence.retainedEvidence.controlAccessibilitySignals,
    ["button-name"]
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes consumes consent control lifecycle evidence", () => {
  const observed = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        consentControlLifecycleEvidence: {
          controlsSearched: ["cookie preferences"],
          cookiePreferencesLinkObserved: true,
          coverageStatus: "usable",
          evidenceRefs: ["post_reject_consent_control_lifecycle"],
          footerLinksInspected: ["Cookie Preferences -> https://example.test/cookies"],
          initialConsentLayerObserved: true,
	          observedControls: [
	            {
	              pageUrl: "https://example.test/",
	              source: "footer_link",
	              text: "Cookie Preferences"
	            }
	          ],
	          pagesChecked: ["https://example.test/"],
	          postChoicePreferenceControlClickOutcome: {
	            attempted: true,
	            controlText: "Cookie Preferences",
	            finalUrl: "https://example.test/cookies",
	            href: "https://example.test/cookies",
	            outcome: "navigated_to_policy_or_notice",
	            pageUrl: "https://example.test/",
	            source: "footer_link"
	          },
	          preferenceCenterReachableAfterInitialLayer: true
	        }
	      }
    }
  });

  assert.equal(observed.preference_withdrawal_control?.status, "Observed");
	  assert.deepEqual(observed.preference_withdrawal_control?.evidenceRefs, [
	    "Evidence: consent control lifecycle",
	    "post_reject_consent_control_lifecycle",
	    "Observed control: Cookie Preferences",
	    "Post-choice control outcome: navigated_to_policy_or_notice"
	  ]);

  const notObserved = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        consentControlLifecycleEvidence: {
          controlsSearched: ["cookie preferences"],
          cmpReopenControlObserved: false,
          coverageStatus: "usable",
          evidenceRefs: ["post_reject_consent_control_lifecycle"],
          footerLinksInspected: ["Privacy Notice -> https://example.test/privacy"],
          initialConsentLayerObserved: true,
          observedControls: [],
          pagesChecked: ["https://example.test/"],
          preferenceCenterReachableAfterInitialLayer: false
        }
      }
    }
  });

  assert.equal(notObserved.preference_withdrawal_control?.status, "Gap observed");
  assert.match(notObserved.preference_withdrawal_control?.limitation ?? "", /did not observe an obvious cookie preferences/i);

  const postChoiceCleanAbsence = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        consentControlLifecycleEvidence: {
          controlsSearched: ["cookie preferences"],
          cmpReopenControlObserved: true,
          coverageStatus: "usable",
          evidenceRefs: ["browser_runtime_consent_control_lifecycle", "post_reject_consent_control_lifecycle"],
          footerLinksInspected: ["Privacy Notice -> https://example.test/privacy"],
          initialConsentLayerObserved: true,
          observedControls: [
            {
              pageUrl: "https://example.test/",
              source: "cmp_reopen",
              text: "This website uses cookies. Accept Decline Cookie"
            }
          ],
          pagesChecked: ["https://example.test/"],
          postChoicePreferenceControlClickOutcome: {
            attempted: false,
            controlText: null,
            href: null,
            outcome: "no_qualifying_control_observed",
            pageUrl: "https://example.test/",
            source: "none"
          },
          preferenceCenterReachableAfterInitialLayer: true
        }
      }
    }
  });

  assert.equal(postChoiceCleanAbsence.preference_withdrawal_control?.status, "Gap observed");
  assert.ok(
    postChoiceCleanAbsence.preference_withdrawal_control?.evidenceRefs.includes(
      "Post-choice control outcome: no_qualifying_control_observed"
    )
  );

  const ambiguousCmpReopenOnly = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        consentControlLifecycleEvidence: {
          controlsSearched: ["cookie preferences"],
          cmpReopenControlObserved: true,
          coverageStatus: "usable",
          evidenceRefs: ["post_reject_consent_control_lifecycle"],
          footerLinksInspected: ["Privacy Notice -> https://example.test/privacy"],
          initialConsentLayerObserved: true,
          observedControls: [],
          pagesChecked: ["https://example.test/"],
          preferenceCenterReachableAfterInitialLayer: false
        }
      }
    }
  });

  assert.equal(ambiguousCmpReopenOnly.preference_withdrawal_control?.status, "Review signal");
  assert.ok(
    ambiguousCmpReopenOnly.preference_withdrawal_control?.evidenceRefs.includes(
      "Ambiguous control evidence retained"
    )
  );

  const genericCookieNoticeOnly = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        consentControlLifecycleEvidence: {
          controlsSearched: ["cookie preferences"],
          coverageStatus: "usable",
          evidenceRefs: ["post_reject_consent_control_lifecycle"],
          footerLinksInspected: ["Privacy Notice -> https://example.test/privacy"],
          initialConsentLayerObserved: true,
          observedControls: [
            {
              pageUrl: "https://example.test/",
              source: "cmp_reopen",
              text: "This website uses cookies. For more information, review our Privacy & Legal Notice. Accept Decline Cookie"
            }
          ],
          pagesChecked: ["https://example.test/"],
          preferenceCenterReachableAfterInitialLayer: true
        }
      }
    }
  });

	  assert.equal(genericCookieNoticeOnly.preference_withdrawal_control?.status, "Review signal");
  assert.match(
    genericCookieNoticeOnly.preference_withdrawal_control?.limitation ?? "",
    /incomplete or ambiguous/i
  );
	  assert.ok(
	    genericCookieNoticeOnly.preference_withdrawal_control?.evidenceRefs.includes(
	      "Ambiguous control evidence retained"
	    )
	  );

	  const retainedButClickDidNotOpen = deriveGdprEprivacyCoveragePolicyOutcomes({
	    ...completedInputBase,
	    runtimeArtifacts: {
	      hybridRuntimeEvidence: {
	        consentControlLifecycleEvidence: {
	          controlsSearched: ["cookie preferences"],
	          cookiePreferencesLinkObserved: true,
	          coverageStatus: "usable",
	          evidenceRefs: ["post_reject_consent_control_lifecycle"],
	          footerLinksInspected: ["Cookie Preferences -> https://example.test/cookies"],
	          initialConsentLayerObserved: true,
	          observedControls: [
	            {
	              pageUrl: "https://example.test/",
	              source: "footer_link",
	              text: "Cookie Preferences"
	            }
	          ],
	          pagesChecked: ["https://example.test/"],
	          postChoicePreferenceControlClickOutcome: {
	            attempted: true,
	            controlText: "Cookie Preferences",
	            href: "https://example.test/cookies",
	            outcome: "no_ui_change",
	            pageUrl: "https://example.test/",
	            source: "footer_link"
	          },
	          preferenceCenterReachableAfterInitialLayer: true
	        }
	      }
	    }
	  });

	  assert.equal(retainedButClickDidNotOpen.preference_withdrawal_control?.status, "Review signal");
	  assert.ok(
	    retainedButClickDidNotOpen.preference_withdrawal_control?.evidenceRefs.includes(
	      "Post-choice control outcome: no_ui_change"
	    )
	  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes keeps cross-border review untestable without jurisdiction evidence", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        networkSummary: {
          thirdPartyDomainCount: 3
        }
      }
    },
    snapshot: {
      third_party_script_domain_count: 3
    }
  });

  assert.equal(outcomes.cross_border_endpoint_review?.status, "Not testable");
});

test("deriveGdprEprivacyCoveragePolicyOutcomes consumes nested hybrid endpoint jurisdiction evidence", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        endpointJurisdictionEvidence: [
          {
            confidence: "high",
            etldPlusOne: "adsrvr.org",
            firstPartyStatus: "third_party",
            host: "match.adsrvr.org",
            inferenceBasis: "known_runtime_service_domain",
            inferredCountryCode: "US",
            inferredRegion: "US_OR_GLOBAL",
            transferReviewSignal: true
          }
        ],
        networkSummary: {
          thirdPartyDomainCount: 1
        }
      }
    },
    snapshot: {
      third_party_script_domain_count: 1
    }
  });

  assert.equal(outcomes.cross_border_endpoint_review?.status, "Insufficient evidence");
  assert.deepEqual(outcomes.cross_border_endpoint_review?.evidenceRefs, [
    "Endpoint jurisdiction rows: 1",
    "Transfer review signal rows: 1"
  ]);
});
