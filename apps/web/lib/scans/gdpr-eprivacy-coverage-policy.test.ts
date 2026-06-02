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

  assert.equal(outcomes.runtime_vendor_disclosure_alignment?.status, "Insufficient evidence");
  assert.deepEqual(outcomes.runtime_vendor_disclosure_alignment?.evidenceRefs, [
    "Runtime vendor count: 1",
    "Disclosure comparison rows: 1",
    "Unmatched runtime vendor/domain count: 1"
  ]);
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
        negativeReasonCodes: ["reject_interaction_not_confirmed"]
      }
    }
  });
  assert.equal(notTestable.post_reject_tracking_reduction?.status, "Not testable");
  assert.match(notTestable.post_reject_tracking_reduction?.limitation ?? "", /confirmed reject action/i);

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

  assert.equal(notObserved.preference_withdrawal_control?.status, "Not observed");
  assert.match(notObserved.preference_withdrawal_control?.limitation ?? "", /no reopen or withdrawal control/i);

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

  assert.equal(postChoiceCleanAbsence.preference_withdrawal_control?.status, "Not observed");
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

  assert.equal(ambiguousCmpReopenOnly.preference_withdrawal_control?.status, "Insufficient evidence");
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

	  assert.equal(genericCookieNoticeOnly.preference_withdrawal_control?.status, "Insufficient evidence");
  assert.match(
    genericCookieNoticeOnly.preference_withdrawal_control?.limitation ?? "",
    /did not prove a usable preference or withdrawal control/i
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

	  assert.equal(retainedButClickDidNotOpen.preference_withdrawal_control?.status, "Insufficient evidence");
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
