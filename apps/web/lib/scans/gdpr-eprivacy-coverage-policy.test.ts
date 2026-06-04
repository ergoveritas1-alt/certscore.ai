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

  assert.equal(outcomes.pre_consent_cookies_storage?.status, "Not observed");
  assert.match(outcomes.pre_consent_cookies_storage?.limitation ?? "", /did not classify/i);
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
        },
        consentUiPathEvidence: {
          layerInspected: "first_layer"
        }
      },
      rejectPathDepthAndAvailability: {
        firstLayerCookieConsentBannerObserved: true,
        firstLayerConsentChoices: {
          visibleChoiceLabels: ["Accept", "Decline"]
        },
        gdprEprivacyConsentSurfaceObserved: true,
        layerInspected: "first_layer",
        rejectAvailableOnFirstLayer: true
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
    "Visible choice: Decline",
    "Layer inspected: first_layer"
  ]);
  assert.equal(outcomes.reject_all_path_availability?.status, "Observed");
  assert.equal(outcomes.consent_choice_quality?.status, "Review signal");
  assert.equal(outcomes.consent_choice_quality?.criticalEvidence.retainedEvidence.firstLayerCookieConsentBannerObserved, true);
  assert.deepEqual(outcomes.consent_choice_quality?.criticalEvidence.retainedEvidence.visibleChoiceLabels, ["Accept", "Decline"]);
  assert.match(outcomes.consent_choice_quality?.limitation ?? "", /Basic same-layer Accept and Decline controls were observed/i);
  assert.deepEqual(
    outcomes.consent_choice_quality?.criticalEvidence.retainedEvidence.missingEvidenceNeeded,
    [
      "cookie preference center or manage/preferences/settings control",
      "purpose or cookie-category choices",
      "vendor-level choices when applicable",
      "default toggle state evidence",
      "non-essential defaults observed off",
      "save or confirm choices control",
      "accept/reject visual parity evidence"
    ]
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes confirms simple cookie notices despite stale unknown-purpose demotion", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        consentSummary: {
          bannerPresent: true,
          bannerTextSnippet: "This website uses cookies. For more information, review our Privacy & Legal Notice."
        },
        consentUiPathEvidence: {
          consentSurfaceContaminationDetected: true,
          consentSurfaceDemotionReasons: ["surface_purpose_unknown"],
          firstLayerCookieConsentBannerObserved: false,
          gdprEprivacyConsentSurfaceObserved: "unconfirmed",
          layerInspected: "first_layer"
        },
        consentControlLifecycleEvidence: {
          coverageStatus: "usable",
          footerLinksInspected: [
            "This website uses cookies. For more information, review our Privacy & Legal Notice. Questions? Please email privacy@example.edu. More info Accept Decline Cookie"
          ],
          initialConsentLayerObserved: true
        },
        firstLayerConsentChoices: {
          capturedBeforeInteraction: true,
          visibleChoiceLabels: ["accept", "decline"]
        }
      },
      rejectPathDepthAndAvailability: {
        consentSurfaceContaminationDetected: true,
        consentSurfaceDemotionReasons: ["surface_purpose_unknown"],
        firstLayerCookieConsentBannerObserved: false,
        firstLayerConsentChoices: {
          visibleChoiceLabels: ["accept", "decline"]
        },
        gdprEprivacyConsentSurfaceObserved: "unconfirmed",
        layerInspected: "first_layer"
      }
    },
    snapshot: {
      cookie_banner_present: true
    }
  });

  assert.equal(outcomes.consent_surface_observed?.status, "Observed");
  assert.equal(
    outcomes.consent_surface_observed?.limitation,
    "A first-layer cookie notice was observed with actionable Accept and Decline controls."
  );
  assert.equal(outcomes.consent_surface_observed?.criticalEvidence.retainedEvidence.firstLayerCookieConsentBannerObserved, true);
  assert.equal(outcomes.consent_surface_observed?.criticalEvidence.retainedEvidence.gdprEprivacyConsentSurfaceObserved, true);
  assert.equal(outcomes.consent_surface_observed?.criticalEvidence.retainedEvidence.consentSurfaceContaminationDetected, false);
  assert.deepEqual(outcomes.consent_surface_observed?.criticalEvidence.retainedEvidence.consentSurfaceDecisionStates, [
    "first_layer_cookie_notice_observed"
  ]);
  assert.equal(outcomes.consent_surface_observed?.criticalEvidence.retainedEvidence.surfacePurpose, "cookie_consent");
  assert.deepEqual(outcomes.consent_surface_observed?.criticalEvidence.retainedEvidence.visibleChoiceLabels, ["accept", "decline"]);
  assert.equal(outcomes.reject_all_path_availability?.status, "Observed");
  assert.equal(
    outcomes.reject_all_path_availability?.limitation,
    "A Decline control was observed on the same first-layer cookie notice as Accept."
  );
  assert.equal(outcomes.consent_choice_quality?.status, "Review signal");
  assert.match(outcomes.consent_choice_quality?.limitation ?? "", /Basic same-layer Accept and Decline controls were observed/i);
});

test("deriveGdprEprivacyCoveragePolicyOutcomes marks consent choice quality not testable for footer privacy choices only", () => {
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
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        consentControlLifecycleEvidence: {
          adChoicesLinkObserved: true,
          consentSurfaceContaminationDetected: true,
          consentSurfaceDemotionReasons: ["footer_privacy_control_without_initial_consent_layer"],
          footerPrivacyChoiceLinkObserved: true,
          initialConsentLayerObserved: false,
          layerInspected: "footer_link",
          observedControls: [
            {
              href: "https://example.com/privacy/choices",
              pageUrl: "https://example.com/",
              source: "footer_link",
              text: "Your Privacy Choices"
            },
            {
              href: "https://example.com/ad-choices",
              pageUrl: "https://example.com/",
              source: "footer_link",
              text: "Ad Choices"
            }
          ],
          privacyControlPlacement: "footer",
          surfacePurpose: "ad_choices"
        }
      },
      rejectPathDepthAndAvailability: {
        adChoicesLinkObserved: true,
        firstLayerCookieConsentBannerObserved: false,
        gdprEprivacyConsentSurfaceObserved: "unconfirmed",
        layerInspected: "footer_link"
      }
    },
    snapshot: {
      cookie_banner_present: false
    }
  });

  assert.equal(outcomes.consent_surface_observed?.status, "Not confirmed");
  assert.equal(outcomes.consent_choice_quality?.status, "Not testable");
  assert.match(outcomes.consent_choice_quality?.limitation ?? "", /no first-layer GDPR\/ePrivacy cookie consent surface was confirmed/i);
  assert.equal(outcomes.consent_choice_quality?.criticalEvidence.retainedEvidence.firstLayerCookieConsentBannerObserved, false);
});

test("deriveGdprEprivacyCoveragePolicyOutcomes checks consent choice quality with retained granular evidence", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        firstLayerConsentChoices: {
          acceptControlObserved: true,
          defaultToggleStatesObserved: true,
          managePreferencesObserved: true,
          nonEssentialDefaultsOff: true,
          purposeCategoryControlsObserved: true,
          rejectControlObserved: true,
          sameLayerRejectObserved: true,
          saveChoicesObserved: true,
          vendorControlsObserved: true,
          visibleChoiceLabels: ["Reject all", "Manage choices", "Accept all"],
          visualParityEvidenceObserved: true
        }
      },
      rejectPathDepthAndAvailability: {
        firstLayerCookieConsentBannerObserved: true,
        gdprEprivacyConsentSurfaceObserved: true,
        rejectAvailableOnFirstLayer: true
      }
    }
  });

  assert.equal(outcomes.consent_choice_quality?.status, "Observed");
  assert.match(outcomes.consent_choice_quality?.limitation ?? "", /granular preferences/i);
  assert.equal(outcomes.consent_choice_quality?.criticalEvidence.retainedEvidence.selectedEvidenceStrength, "strong");
});

test("deriveGdprEprivacyCoveragePolicyOutcomes marks direct poor consent choice quality as a gap", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        firstLayerConsentChoices: {
          acceptControlObserved: true,
          defaultToggleStatesObserved: true,
          nonEssentialDefaultsOff: false,
          rejectControlObserved: false,
          visibleChoiceLabels: ["Accept all"]
        }
      },
      rejectPathDepthAndAvailability: {
        firstLayerCookieConsentBannerObserved: true,
        gdprEprivacyConsentSurfaceObserved: true,
        rejectAvailableOnFirstLayer: false
      }
    }
  });

  assert.equal(outcomes.consent_choice_quality?.status, "Gap observed");
  assert.match(outcomes.consent_choice_quality?.limitation ?? "", /poor consent choice quality/i);
  assert.deepEqual(outcomes.consent_choice_quality?.criticalEvidence.retainedEvidence.directGapReasons, [
    "accept_without_same_layer_reject",
    "non_essential_toggles_default_on"
  ]);
});

test("deriveGdprEprivacyCoveragePolicyOutcomes demotes footer privacy choices from GDPR consent surface observation", () => {
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
    runtimeArtifacts: {
      consent_surface_observed: true,
      hybridRuntimeEvidence: {
        consentControlLifecycleEvidence: {
          consentSurfaceContaminationDetected: true,
          consentSurfaceDemotionReasons: [
            "footer_privacy_control_without_initial_consent_layer",
            "surface_purpose_sale_share_opt_out"
          ],
          footerPrivacyChoiceLinkObserved: true,
          initialConsentLayerObserved: false,
          layerInspected: "footer_link",
          observedControls: [
            {
              href: "https://www.example.com/privacy/choices",
              pageUrl: "https://www.example.com/",
              source: "footer_link",
              text: "Your Privacy Choices"
            }
          ],
          privacyControlPlacement: "footer",
          saleShareOptOutSurfaceObserved: true,
          surfacePurpose: "sale_share_opt_out"
        }
      }
    },
    snapshot: {
      cookie_banner_present: true
    }
  });

	  assert.equal(outcomes.consent_surface_observed?.status, "Not confirmed");
	  assert.match(outcomes.consent_surface_observed?.limitation ?? "", /GDPR consent banner not confirmed/i);
  assert.deepEqual(
    outcomes.consent_surface_observed?.criticalEvidence.retainedEvidence.consentSurfaceDecisionStates,
    ["privacy_choice_surface_only"]
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes consumes WS01 contaminated deeper-layer ad-choice demotion evidence", () => {
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
    runtimeArtifacts: {
      consent_surface_observed: true,
      hybridRuntimeEvidence: {
        consentUiPathEvidence: {
          layerInspected: "deeper_layer"
        },
        firstLayerConsentChoices: {
          capturedBeforeInteraction: true,
          visibleChoiceLabels: [
            "preferences",
            "shopping guide",
            "settings",
            "how a public figure uses a hobby routine to manage stress during travel",
            "ad choices"
          ]
        }
      },
      rejectPathDepthAndAvailability: {
        adChoicesLinkObserved: true,
        consentSurfaceContaminationDetected: true,
        consentSurfaceDemotionReasons: [
          "unrelated_page_text_in_retained_choice_labels",
          "footer_link_not_first_layer_banner",
          "no_confirmed_actionable_cookie_consent_surface",
          "deeper_layer_not_first_layer"
        ],
        firstLayerCookieConsentBannerObserved: false,
        gdprEprivacyConsentSurfaceObserved: "unconfirmed",
        layerInspected: "deeper_layer",
        privacyControlPlacement: "deeper_layer"
      }
    },
    snapshot: {
      cookie_banner_present: true
    }
  });

	  assert.equal(outcomes.consent_surface_observed?.status, "Not confirmed");
	  assert.match(outcomes.consent_surface_observed?.limitation ?? "", /GDPR consent banner not confirmed/i);
  assert.equal(outcomes.consent_surface_observed?.criticalEvidence.retainedEvidence.firstLayerCookieConsentBannerObserved, false);
  assert.equal(outcomes.consent_surface_observed?.criticalEvidence.retainedEvidence.gdprEprivacyConsentSurfaceObserved, "unconfirmed");
  assert.equal(outcomes.consent_surface_observed?.criticalEvidence.retainedEvidence.adChoicesLinkObserved, true);
  assert.equal(outcomes.consent_surface_observed?.criticalEvidence.retainedEvidence.privacyControlPlacement, "deeper_layer");
  assert.equal(outcomes.consent_surface_observed?.criticalEvidence.retainedEvidence.consentSurfaceContaminationDetected, true);
  assert.deepEqual(outcomes.consent_surface_observed?.criticalEvidence.retainedEvidence.consentSurfaceDemotionReasons, [
    "unrelated_page_text_in_retained_choice_labels",
    "footer_link_not_first_layer_banner",
    "no_confirmed_actionable_cookie_consent_surface",
    "deeper_layer_not_first_layer"
  ]);
});

test("deriveGdprEprivacyCoveragePolicyOutcomes makes reject path not testable without confirmed first-layer GDPR banner", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    events: [
      {
        eventType: "runtime.build_phase_diagnostic",
        metadataJson: {
          consentInteractionSkipNegativeReasonCodes: ["complete_reject_choice_controls_not_detected"],
          phase: "consent_audit_entry",
          shouldAttemptConsentAudit: true,
          status: "ok"
        }
      }
    ],
    runtimeArtifacts: {
      rejectPathDepthAndAvailability: {
        firstLayerCookieConsentBannerObserved: false,
        gdprEprivacyConsentSurfaceObserved: "unconfirmed",
        layerInspected: "deeper_layer",
        privacyControlPlacement: "footer",
        rejectAvailableOnFirstLayer: false
      }
    },
    snapshot: {
      consent_reject_button_count: 0,
      cookie_banner_present: true
    }
  });

  assert.equal(outcomes.reject_all_path_availability?.status, "Not testable");
  assert.match(outcomes.reject_all_path_availability?.limitation ?? "", /no first-layer GDPR\/ePrivacy cookie consent banner was confirmed/i);
  assert.deepEqual(outcomes.reject_all_path_availability?.criticalEvidence.projectedFindings, []);
  assert.equal(
    outcomes.reject_all_path_availability?.criticalEvidence.retainedEvidence.reason,
    "no_confirmed_first_layer_cookie_consent_banner"
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes treats unclassified before-consent storage inventory as not observed", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        storageSummary: {
          cookiesBeforeConsentCount: 3,
          cookiesSeenCount: 5
        }
      }
    }
  });

  const outcome = outcomes.pre_consent_cookies_storage;
  assert.equal(outcome?.status, "Not observed");
  assert.deepEqual(outcome?.evidenceRefs, [
    "Observed before-consent cookie/storage count: 3",
    "Evidence: hybrid runtime storage summary"
  ]);
  assert.deepEqual(outcome?.criticalEvidence.missingOrIncompleteSourceSignals, []);
  assert.equal(outcome?.criticalEvidence.pipeline.projectionStage, "coverage_policy");
  assert.equal(
    outcome?.criticalEvidence.retainedEvidence.eligibleNonEssentialCookieStorageFindingProjected,
    false
  );
  assert.match(outcome?.criticalEvidence.statusBasis ?? "", /eligible non-essential cookie\/storage evidence/i);
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

test("deriveGdprEprivacyCoveragePolicyOutcomes keeps footer ad-choice controls as post-choice review signals", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        consentControlLifecycleEvidence: {
          coverageStatus: "usable",
          cookiePreferencesLinkObserved: false,
          footerPreferenceLinkObserved: true,
          initialConsentLayerObserved: false,
          observedControls: [
            {
              href: "https://example.com/privacy#ads",
              text: "Ad Choices"
            },
            {
              text: "Close preference center"
            },
            {
              href: "https://tools.google.com/dlpage/gaoptout",
              text: "Google Analytics Opt-Out"
            }
          ],
          postChoicePreferenceControlClickOutcome: {
            outcome: "opened_preference_center"
          },
          privacyControlPlacement: "footer",
          surfacePurpose: "targeted_ads_opt_out"
        }
      }
    }
  });

  assert.equal(outcomes.preference_withdrawal_control?.status, "Review signal");
  assert.match(
    outcomes.preference_withdrawal_control?.limitation ?? "",
    /did not confirm a GDPR\/ePrivacy cookie preference center or consent-withdrawal control/i
  );
  assert.equal(
    outcomes.preference_withdrawal_control?.criticalEvidence.retainedEvidence.cookiePreferencesLinkObserved,
    false
  );
  assert.equal(
    outcomes.preference_withdrawal_control?.criticalEvidence.retainedEvidence.openedCookieConsentPreferenceCenter,
    false
  );
  assert.equal(
    outcomes.preference_withdrawal_control?.criticalEvidence.retainedEvidence.privacyAdChoiceOnlyControlObserved,
    true
  );
  assert.deepEqual(outcomes.preference_withdrawal_control?.criticalEvidence.projectedFindings, []);
});

test("deriveGdprEprivacyCoveragePolicyOutcomes treats cookie preference withdrawal controls as observed", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        consentControlLifecycleEvidence: {
          cmpReopenControlObserved: true,
          coverageStatus: "usable",
          cookiePreferencesLinkObserved: true,
          initialConsentLayerObserved: true,
          observedControls: [
            {
              href: "https://example.com/#cookie-preferences",
              text: "Cookie Preferences"
            }
          ],
          postChoicePreferenceControlClickOutcome: {
            outcome: "opened_preference_center"
          },
          withdrawalTextObserved: true
        }
      }
    }
  });

  assert.equal(outcomes.preference_withdrawal_control?.status, "Observed");
  assert.match(outcomes.preference_withdrawal_control?.limitation ?? "", /post-choice consent or preference control/i);
  assert.equal(
    outcomes.preference_withdrawal_control?.criticalEvidence.retainedEvidence.openedCookieConsentPreferenceCenter,
    true
  );
  assert.deepEqual(
    outcomes.preference_withdrawal_control?.criticalEvidence.retainedEvidence.cookieConsentControlLabels,
    ["Cookie Preferences"]
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
  assert.match(
    outcomes.sensitive_surfaces_third_party_tracking?.limitation ?? "",
    /does not conclusively establish same-context sensitive payload exposure/i
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes demotes fallback-only sensitive tracking correlation to review", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    events: [
      {
        eventType: "runtime.build_phase_diagnostic",
        metadataJson: {
          coverageStatus: "usable",
          directVsInferred: "direct",
          evidenceConfidence: "moderate",
          evidenceStrengthFlags: ["fallback_only", "policy_text"],
          highSensitivityDataCollectionDetected: true,
          phase: "sensitive_third_party_tracking_correlation",
          samePageTrackingObserved: true,
          sensitiveFieldLabels: ["Medical condition"],
          status: "ok",
          thirdPartyTrackingVendors: ["Google Analytics"]
        }
      }
    ]
  });

  assert.equal(outcomes.sensitive_surfaces_third_party_tracking?.status, "Review signal");
  assert.match(
    outcomes.sensitive_surfaces_third_party_tracking?.limitation ?? "",
    /does not conclusively establish same-context sensitive payload exposure/i
  );
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
  assert.match(
    outcomes.sensitive_surfaces_third_party_tracking?.limitation ?? "",
    /does not conclusively establish same-context sensitive payload exposure/i
  );
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

test("deriveGdprEprivacyCoveragePolicyOutcomes consumes WS01 session replay summary request and timing evidence", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        sessionReplayEvidenceSummary: {
          artifactCount: 1,
          collectionEndpointObserved: true,
          consentStates: ["pre_consent"],
          firstSeenMs: 250,
          libraryOnly: false,
          maskingOrExclusionBasis: [],
          maskingOrExclusionObserved: false,
          preConsentObserved: true,
          requestUrls: ["https://static.hotjar.com/c/hotjar-123.js"],
          sensitiveSurfaceOverlap: false,
          scriptHosts: ["static.hotjar.com"],
          vendors: ["Hotjar"]
        }
      }
    },
    snapshot: {
      session_replay_tracker_count: 1,
      session_replay_tool_detected: true
    }
  });

  const outcome = outcomes.session_replay_fingerprinting_review;
  assert.equal(outcome?.status, "Gap observed");
  assert.match(outcome?.limitation ?? "", /before a recorded consent action/i);
  assert.deepEqual(outcome?.evidenceRefs, [
    "Session replay signal observed before consent",
    "Runtime vendor: Hotjar",
    "Consent state: pre_consent"
  ]);
  assert.deepEqual(
    outcome?.criticalEvidence.retainedEvidence.sessionReplayEvidence,
    {
      collectionEndpointObserved: true,
      consentStates: ["pre_consent"],
      firstSeenMs: 250,
      libraryLoadObserved: true,
      maskingOrExclusionObserved: false,
      postAcceptObserved: false,
      postChoiceConsentControlsObserved: false,
      preConsentObserved: true,
      requestUrls: ["https://static.hotjar.com/c/hotjar-123.js"],
      sensitiveSurfaceOverlap: false,
      vendorDisclosed: false,
      vendorDisclosureGap: false,
      vendors: ["Hotjar"]
    }
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes does not treat mislabeled Google Analytics as session replay", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      requestPurposeClassificationConfidence: [
        {
          category: "session_replay",
          requestUrl: "https://www.google-analytics.com/g/collect?v=2",
          runtimePhase: "pre_consent",
          vendor: "Google Analytics"
        },
        {
          category: "session_replay",
          requestUrl: "https://www.googletagmanager.com/gtm.js?id=GTM-TEST",
          runtimePhase: "pre_consent",
          vendor: "Google Tag Manager"
        }
      ]
    },
    snapshot: {
      session_replay_tool_detected: false,
      session_replay_tracker_count: 0
    }
  });

  assert.equal(outcomes.session_replay_fingerprinting_review?.status, "Not observed");
  assert.equal(
    outcomes.session_replay_fingerprinting_review?.criticalEvidence.retainedEvidence.sessionReplayObserved,
    false
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes still treats Microsoft Clarity as pre-consent session replay", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      requestPurposeClassificationConfidence: [
        {
          category: "session_replay",
          requestUrl: "https://c.clarity.ms/collect",
          runtimePhase: "pre_consent",
          vendor: "Microsoft Clarity"
        }
      ]
    },
    snapshot: {
      session_replay_tool_detected: false,
      session_replay_tracker_count: 0
    }
  });

  assert.equal(outcomes.session_replay_fingerprinting_review?.status, "Gap observed");
  assert.match(outcomes.session_replay_fingerprinting_review?.limitation ?? "", /before a recorded consent action/i);
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
          "Scanner observed a consent surface but did not retain a reject, essential-only, or opt-out control to click.",
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
          trackingRequiringConsentReviewObserved: true,
          controlsSearched: ["cookie settings"],
          cookiePreferencesLinkObserved: false,
          coverageStatus: "usable",
          footerLinksInspected: ["Privacy Notice -> https://www.example.test/privacy"],
          footerPreferenceLinkObserved: false,
          firstLayerCookieConsentBannerObserved: false,
          gdprEprivacyConsentSurfaceObserved: "unconfirmed",
          initialConsentLayerObserved: false,
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
        rejectInteractionFailureReason: "Scanner did not retain an observed consent surface during the reject-path audit."
      }
    }
  });
  assert.equal(retainedLifecycleSurface.post_reject_tracking_reduction?.status, "Not testable");
  assert.equal(
    retainedLifecycleSurface.post_reject_tracking_reduction?.criticalEvidence.retainedEvidence.rejectInteractionFailureClass,
    "consent_surface_not_observed"
  );
  assert.match(
    retainedLifecycleSurface.post_reject_tracking_reduction?.limitation ?? "",
    /no first-layer GDPR\/ePrivacy consent banner and no valid reject action were confirmed/i
  );
  assert.doesNotMatch(
    retainedLifecycleSurface.post_reject_tracking_reduction?.limitation ?? "",
    /Scanner observed a consent surface/i
  );
  assert.doesNotMatch(JSON.stringify(retainedLifecycleSurface), /consentDependentTrackingObserved/);
  assert.match(JSON.stringify(retainedLifecycleSurface), /trackingRequiringConsentReviewObserved/);

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
        examplesAreGeneralPageOnly: true,
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

  assert.equal(outcomes.accessibility_consent_controls?.status, "Not observed");
  assert.match(
    outcomes.accessibility_consent_controls?.limitation ?? "",
    /general page or navigation control/i
  );
  assert.match(
    outcomes.accessibility_consent_controls?.limitation ?? "",
    /did not tie the retained examples to the observed consent banner/i
  );
  assert.equal(
    outcomes.accessibility_consent_controls?.criticalEvidence.retainedEvidence.controlAccessibilityIssueObserved,
    false
  );
  assert.equal(
    outcomes.accessibility_consent_controls?.criticalEvidence.retainedEvidence.examplesAreGeneralPageOnly,
    true
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes keeps legacy ambiguous page accessibility evidence in review", () => {
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
      wcag_aria_error_count: 1,
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

test("deriveGdprEprivacyCoveragePolicyOutcomes keeps privacy-choice-only accessibility surfaces out of generic consent surface evidence", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      californiaPrivacyEvidence: {
        cookieConsentAccessibilityIssueObserved: false,
        gdprCookieConsentSurfaceObserved: false,
        privacyAdChoiceSurfaceObserved: true,
        privacyChoiceAccessibilityIssueObserved: false,
        privacyChoiceSurfaceObserved: true,
        privacyControlAccessibilityIssueObserved: false,
        privacyControlAccessibilitySignals: []
      },
      consentSurfaceObserved: true,
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
  assert.equal(
    outcomes.accessibility_consent_controls?.criticalEvidence.retainedEvidence.consentSurfaceObserved,
    false
  );
  assert.equal(
    outcomes.accessibility_consent_controls?.criticalEvidence.retainedEvidence.privacyChoiceSurfaceObserved,
    true
  );
  assert.equal(
    outcomes.accessibility_consent_controls?.criticalEvidence.retainedEvidence.gdprCookieConsentSurfaceObserved,
    false
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

test("deriveGdprEprivacyCoveragePolicyOutcomes flags retained privacy-choice accessibility evidence as a gap", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      accessibilityAxeEvidence: [
        {
          help: "Buttons must have discernible text",
          impact: "serious",
          pageUrl: "https://example.com/",
          representativeSelectors: ["button.privacy-settings"],
          ruleId: "button-name"
        }
      ],
      californiaPrivacyEvidence: {
        cookieConsentAccessibilityIssueObserved: false,
        gdprCookieConsentSurfaceObserved: false,
        privacyAdChoiceSurfaceObserved: true,
        privacyChoiceAccessibilityIssueObserved: true,
        privacyChoiceSurfaceObserved: true,
        privacyControlAccessibilityIssueObserved: true,
        privacyControlAccessibilitySignals: ["button-name"]
      }
    },
    snapshot: {
      wcag_aria_error_count: 1
    }
  });

  assert.equal(outcomes.accessibility_consent_controls?.status, "Gap observed");
  assert.equal(
    outcomes.accessibility_consent_controls?.criticalEvidence.retainedEvidence.gdprCookieConsentSurfaceObserved,
    false
  );
  assert.equal(
    outcomes.accessibility_consent_controls?.criticalEvidence.retainedEvidence.privacyChoiceAccessibilityIssueObserved,
    true
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes does not promote collapsed accessibility evidence when explicit split says no control issue", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      accessibilityAxeEvidence: [
        {
          help: "Buttons must have discernible text",
          impact: "serious",
          pageUrl: "https://example.com/",
          representativeSelectors: ["button.site-nav"],
          ruleId: "button-name"
        }
      ],
      californiaPrivacyEvidence: {
        cookieConsentAccessibilityIssueObserved: false,
        examplesAreGeneralPageOnly: true,
        gdprCookieConsentSurfaceObserved: false,
        privacyChoiceAccessibilityIssueObserved: false,
        privacyChoiceSurfaceObserved: true,
        privacyControlAccessibilityIssueObserved: true,
        privacyControlAccessibilitySignals: ["button-name"]
      }
    },
    snapshot: {
      wcag_aria_error_count: 1
    }
  });

  assert.equal(outcomes.accessibility_consent_controls?.status, "Review signal");
  assert.notEqual(outcomes.accessibility_consent_controls?.status, "Gap observed");
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

  assert.equal(postChoiceCleanAbsence.preference_withdrawal_control?.status, "Not observed");
  assert.equal(
    postChoiceCleanAbsence.preference_withdrawal_control?.limitation,
    "CertScore did not retain a qualifying post-choice cookie preference or withdrawal control after the initial consent action."
  );
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

  assert.equal(outcomes.cross_border_endpoint_review?.status, "Review signal");
  assert.match(
    outcomes.cross_border_endpoint_review?.limitation ?? "",
    /Endpoint geography creates a transfer-review signal/i
  );
  assert.match(
    outcomes.cross_border_endpoint_review?.limitation ?? "",
    /disclosure mismatch for transfer-relevant advertising\/analytics vendors/i
  );
  assert.deepEqual(outcomes.cross_border_endpoint_review?.evidenceRefs, [
    "Endpoint jurisdiction rows: 1",
    "Transfer review signal rows: 1"
  ]);
});
