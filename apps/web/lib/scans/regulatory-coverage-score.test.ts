import assert from "node:assert/strict";
import test from "node:test";
import { getGdprEprivacyCoverageChecklistRowIds } from "./gdpr-eprivacy-coverage-checklist";
import {
  auditRegulatoryCoverageScoreConfig,
  deriveRegulatoryCoverageScore,
  GDPR_EPRIVACY_EVIDENCE_SCORE_VERSION,
  getGdprEprivacyPostureTone,
  REGULATORY_COVERAGE_SCORE_SOURCE
} from "./regulatory-coverage-score";

test("GDPR/ePrivacy posture labels use the report bands at every boundary", () => {
  const cases = [
    [100, "Watch", "#0d9488"],
    [85, "Watch", "#0d9488"],
    [84, "Review", "#eab308"],
    [65, "Review", "#eab308"],
    [64, "Needs work", "#d97706"],
    [40, "Needs work", "#d97706"],
    [39, "High-priority remediation", "#dc2626"],
    [0, "High-priority remediation", "#dc2626"]
  ] as const;

  for (const [score, expectedLabel, expectedColor] of cases) {
    const tone = getGdprEprivacyPostureTone(score);
    assert.equal(tone.ratingLabel, expectedLabel, String(score));
    assert.equal(tone.ringColor, expectedColor, String(score));
  }
});

test("GDPR/ePrivacy scoring configuration explicitly covers the canonical checklist registry", () => {
  const audit = auditRegulatoryCoverageScoreConfig({
    framework: "gdpr_eprivacy",
    rowIds: getGdprEprivacyCoverageChecklistRowIds()
  });

  assert.deepEqual(audit, { missingConfigIds: [], staleConfigIds: [] });
});

test("confirmed plaintext HTTP delivery receives the calibrated two-point transport deduction", () => {
  const result = deriveRegulatoryCoverageScore({
    framework: "gdpr_eprivacy",
    rows: [{
      assessmentStatus: "gap_observed",
      criticalEvidence: {
        retainedEvidence: { httpProbeOutcome: "plaintext_response_served", httpProbeStatus: 200 },
      },
      evidenceState: "observed",
      id: "transport_security_http_redirect",
      status: "Gap observed",
    }],
  });

  assert.equal(result.score, 98);
  assert.equal(result.scoreVersion, GDPR_EPRIVACY_EVIDENCE_SCORE_VERSION);
});

test("unknown checklist rows withhold scoring instead of receiving a silent fallback weight", () => {
  const result = deriveRegulatoryCoverageScore({
    framework: "gdpr_eprivacy",
    rows: [{
      assessmentStatus: "checked",
      evidenceState: "observed",
      id: "unregistered_future_row",
      status: "Observed"
    }]
  });

  assert.equal(result.score, null);
  assert.equal(result.coverageConfidence, "insufficient");
  assert.match(result.summary, /could not be assessed/i);
  assert.doesNotMatch(result.summary, /scor|weight|deduct|credit/i);
});

test("registered contextual collection inventory does not withhold or affect scoring", () => {
  const result = deriveRegulatoryCoverageScore({
    framework: "gdpr_eprivacy",
    rows: [
      {
        assessmentStatus: "checked",
        criticalEvidence: { retainedEvidence: { scoreEffect: "none" } },
        evidenceState: "observed",
        id: "public_collection_surfaces",
        status: "Observed"
      },
      {
        assessmentStatus: "checked",
        evidenceState: "observed",
        id: "privacy_notice_availability",
        status: "Observed"
      }
    ]
  });

  assert.equal(result.score, 100);
  assert.equal(result.coverageRatio, 1);
  assert.doesNotMatch(result.summary, /configuration is missing/i);
});

test("balanced Accept and Decline without first-layer settings does not incur a material score penalty", () => {
  const result = deriveRegulatoryCoverageScore({
    framework: "gdpr_eprivacy",
    rows: [{
      assessmentStatus: "review_signal",
      criticalEvidence: {
        retainedEvidence: {
          balancedAcceptDeclineWithoutFirstLayerSettings: true,
        },
      },
      evidenceState: "observed",
      id: "options_settings_preferences_control",
      status: "Review signal",
    }],
  });

  assert.equal(result.score, 100);
});

test("Accept-only missing Options is not scored separately from the refusal-path concern", () => {
  const result = deriveRegulatoryCoverageScore({
    framework: "gdpr_eprivacy",
    rows: [
      {
        assessmentStatus: "checked",
        criticalEvidence: {
          retainedEvidence: {
            optionsAbsenceSupportsRefusalPathOnly: true,
            scoreEffect: "none",
          },
        },
        evidenceState: "not_observed",
        id: "options_settings_preferences_control",
        status: "Not observed",
      },
      {
        assessmentStatus: "checked",
        evidenceState: "observed",
        id: "privacy_notice_availability",
        status: "Observed",
      },
    ],
  });

  assert.equal(result.score, 100);
  assert.equal(result.coverageRatio, 1);
});

test("contextual inline and persistent settings links do not incur a material score penalty", () => {
  for (const optionsControlProminence of ["inline_link", "inline_link_first_layer_body", "persistent_link"]) {
    const result = deriveRegulatoryCoverageScore({
      framework: "gdpr_eprivacy",
      rows: [{
        assessmentStatus: "review_signal",
        criticalEvidence: {
          retainedEvidence: { optionsControlProminence },
        },
        evidenceState: "observed",
        id: "options_settings_preferences_control",
        status: "Review signal",
      }],
    });

    assert.equal(result.score, 100, optionsControlProminence);
  }
});

test("banner control proxies remain neutral while a qualified Reject review uses the ten-point gap deduction", () => {
  const rows = [
    "consent_surface_observed",
    "cmp_framework_signal_observed",
    "accept_consent_control",
    "options_settings_preferences_control"
  ].map((id) => ({
    assessmentStatus: "checked" as const,
    criticalEvidence: { retainedEvidence: { scoreEffect: "none" } },
    evidenceState: "not_observed" as const,
    id,
    status: "Not observed"
  }));
  const result = deriveRegulatoryCoverageScore({
    framework: "gdpr_eprivacy",
    rows: [
      ...rows,
      {
        assessmentStatus: "review_signal",
        criticalEvidence: {
          retainedEvidence: { scoreAttribution: "reject_all_path_availability" }
        },
        evidenceState: "observed",
        id: "reject_all_path_availability",
        status: "Review signal"
      }
    ]
  });

  assert.equal(result.score, 90);
  assert.equal(result.coverageRatio, 1);
});

test("Accept, Options, and consent-surface absence are score-neutral on their own", () => {
  for (const id of [
    "accept_consent_control",
    "options_settings_preferences_control",
    "consent_surface_observed"
  ]) {
    const result = deriveRegulatoryCoverageScore({
      framework: "gdpr_eprivacy",
      rows: [{
        assessmentStatus: "gap_observed",
        evidenceState: "not_observed",
        id,
        status: "Gap observed"
      }]
    });

    assert.equal(result.score, 100, id);
  }
});

test("contextual browser capability access does not incur a fingerprinting score penalty", () => {
  const result = deriveRegulatoryCoverageScore({
    framework: "gdpr_eprivacy",
    rows: [{
      assessmentStatus: "checked",
      criticalEvidence: {
        retainedEvidence: {
          browserDeviceEntropyEvidence: {
            assessmentStrength: "contextual_only",
            browserApiSignals: ["Navigator.plugins", "Navigator.mimeTypes"]
          },
          fingerprintingObserved: false,
          promotionEligible: false
        }
      },
      evidenceState: "not_observed",
      id: "device_identification_fingerprinting_signal_observed",
      status: "Not observed"
    }]
  });

  assert.equal(result.score, 100);
});

test("storage review signals use the confirmed-gap identity deduction", () => {
  for (const preConsentStorageAssessmentStatus of [
    "partially_classified",
    "snapshot_presence_only"
  ]) {
    const result = deriveRegulatoryCoverageScore({
      framework: "gdpr_eprivacy",
      rows: [{
        assessmentStatus: "review_signal",
        criticalEvidence: {
          retainedEvidence: { preConsentStorageAssessmentStatus }
        },
        evidenceState: "observed",
        id: "pre_consent_cookies_storage",
        status: "Review signal"
      }]
    });

    assert.equal(result.score, 94, preConsentStorageAssessmentStatus);
  }
});

test("storage review signals remain neutral when source evidence is incomplete", () => {
  const result = deriveRegulatoryCoverageScore({
    framework: "gdpr_eprivacy",
    rows: [{
      assessmentStatus: "review_signal",
      criticalEvidence: {
        missingOrIncompleteSourceSignals: [{ field: "preConsentStorageAssessment" }],
        retainedEvidence: { preConsentStorageAssessmentStatus: "partially_classified" }
      },
      evidenceState: "observed",
      id: "pre_consent_cookies_storage",
      status: "Review signal"
    }]
  });

  assert.equal(result.score, 100);
});

test("confirmed non-essential storage deducts one point for each identity after the first two", () => {
  for (const [count, expectedScore] of [[1, 94], [2, 90], [3, 89], [9, 83]] as const) {
    const result = deriveRegulatoryCoverageScore({
      framework: "gdpr_eprivacy",
      rows: [{
        assessmentStatus: "gap_observed",
        criticalEvidence: {
          retainedEvidence: {
            preConsentStorageAssessment: { classifiedNonEssentialCount: count },
            preConsentStorageAssessmentStatus: "classified_nonessential_observed"
          }
        },
        evidenceState: "observed",
        id: "pre_consent_cookies_storage",
        status: "Gap observed"
      }]
    });

    assert.equal(result.score, expectedScore, String(count));
  }
});

test("pre-consent tracker groups deduct one point for each unique vendor after the first two", () => {
  for (const [count, expectedScore] of [[1, 94], [2, 90], [3, 89], [9, 83]] as const) {
    const groups = Array.from({ length: count }, (_, index) => ({
      party: "third_party",
      purpose: "analytics",
      vendor: `Vendor ${index + 1}`
    }));
    const result = deriveRegulatoryCoverageScore({
      framework: "gdpr_eprivacy",
      rows: [{
        assessmentStatus: "review_signal",
        criticalEvidence: {
          missingOrIncompleteSourceSignals: [{ field: "promotionGradeSequence" }],
          retainedEvidence: { preconsentThirdPartyTrackerGroups: groups }
        },
        evidenceState: "observed",
        id: "pre_consent_third_party_tracking",
        status: "Review signal"
      }]
    });

    assert.equal(result.score, expectedScore, String(count));
  }
});

test("pre-consent storage and tracker deductions are independently capped at thirty points", () => {
  const identities = Array.from({ length: 25 }, (_, index) => ({
    domain: `cookie-${index + 1}.example`,
    name: `cookie-${index + 1}`,
    path: "/",
    storageType: "cookie"
  }));
  const trackerGroups = Array.from({ length: 25 }, (_, index) => ({
    vendor: `Vendor ${index + 1}`
  }));
  const result = deriveRegulatoryCoverageScore({
    framework: "gdpr_eprivacy",
    rows: [
      {
        assessmentStatus: "gap_observed",
        criticalEvidence: {
          retainedEvidence: { eligiblePreconsentCookieStorageRows: identities }
        },
        evidenceState: "observed",
        id: "pre_consent_cookies_storage",
        status: "Gap observed"
      },
      {
        assessmentStatus: "review_signal",
        criticalEvidence: {
          retainedEvidence: { preconsentThirdPartyTrackerGroups: trackerGroups }
        },
        evidenceState: "observed",
        id: "pre_consent_third_party_tracking",
        status: "Review signal"
      }
    ]
  });

  assert.equal(result.score, 40);
});

test("California score is derived from evidence-gated checklist rows", () => {
  const score = deriveRegulatoryCoverageScore({
    framework: "california",
    rows: [
      {
        assessmentStatus: "checked",
        criticalEvidence: { retainedEvidence: { privacyNoticeObserved: true } },
        evidenceState: "observed",
        id: "privacy_notice_availability",
        status: "observed"
      },
      {
        assessmentStatus: "checked",
        criticalEvidence: {
          retainedEvidence: {
            runtimeVendorRequestUrlCoherence: "mismatch",
            unmatchedAdvertisingSharingVendorLabels: ["Meta Pixel"]
          }
        },
        evidenceState: "not_observed",
        id: "do_not_sell_share_availability",
        status: "not_observed"
      },
      {
        assessmentStatus: "review_signal",
        criticalEvidence: { retainedEvidence: { sufficientForNegativeCipaReview: false } },
        evidenceState: "observed",
        id: "cipa_sensitive_communication_interception",
        status: "review_signal"
      },
      {
        assessmentStatus: "checked",
        criticalEvidence: { retainedEvidence: { privacyControlObserved: false } },
        evidenceState: "not_observed",
        id: "privacy_control_accessibility",
        status: "not_applicable"
      }
    ]
  });

  assert.equal(score.ratingLabel, "Watch");
  assert.equal(score.score, 71);
  assert.match(score.summary, /applicable findings supported by retained evidence/i);
  assert.doesNotMatch(score.summary, /weighted|deduct|credit|score effect/i);
  assert.doesNotMatch(score.summary, /\d+ checked|\d+ review|\d+ gap/i);
});

test("GDPR/ePrivacy score uses the same row-led scoring mechanics", () => {
  const strongScore = deriveRegulatoryCoverageScore({
    framework: "gdpr_eprivacy",
    rows: [
      {
        assessmentStatus: "checked",
        criticalEvidence: { retainedEvidence: { consentSurfaceObserved: true } },
        evidenceState: "observed",
        id: "consent_surface_observed",
        status: "Observed"
      },
      {
        assessmentStatus: "checked",
        criticalEvidence: { retainedEvidence: { rejectAllPathObserved: true } },
        evidenceState: "observed",
        id: "reject_all_path_availability",
        status: "Observed"
      }
    ]
  });
  const gapScore = deriveRegulatoryCoverageScore({
    framework: "gdpr_eprivacy",
    rows: [
      {
        assessmentStatus: "gap_observed",
        criticalEvidence: { retainedEvidence: { preConsentTrackingObserved: true } },
        evidenceState: "observed",
        id: "pre_consent_third_party_tracking",
        status: "Gap observed"
      },
      {
        assessmentStatus: "coverage_limitation",
        criticalEvidence: { missingOrIncompleteSourceSignals: [{ field: "rejectActionConfirmed" }] },
        evidenceState: "not_testable",
        id: "post_reject_tracking_reduction",
        status: "Not testable"
      }
    ]
  });

  assert.equal(strongScore.score, 100);
  assert.equal(strongScore.coverageConfidence, "high");
  assert.equal(strongScore.scoreVersion, GDPR_EPRIVACY_EVIDENCE_SCORE_VERSION);
  assert.equal(strongScore.scoreSource, REGULATORY_COVERAGE_SCORE_SOURCE);
  assert.equal(strongScore.ratingLabel, "Watch");
  assert.match(strongScore.summary, /applicable findings supported by retained evidence/i);
  assert.doesNotMatch(strongScore.summary, /weighted|deduct|credit|score effect/i);
  assert.doesNotMatch(strongScore.summary, /\d+ checked|\d+ review|\d+ gap/i);
  assert.equal(gapScore.score, 94);
  assert.equal(gapScore.coverageConfidence, "low");
  assert.equal(gapScore.ratingLabel, "Watch");
});

test("coverage limitations reduce confidence without changing posture", () => {
  const result = deriveRegulatoryCoverageScore({
    framework: "gdpr_eprivacy",
    rows: [
      {
        assessmentStatus: "checked",
        evidenceState: "observed",
        id: "privacy_notice_availability",
        status: "Observed"
      },
      {
        assessmentStatus: "coverage_limitation",
        criticalEvidence: { missingOrIncompleteSourceSignals: [{ field: "rejectActionConfirmed" }] },
        evidenceState: "not_testable",
        id: "post_reject_tracking_reduction",
        status: "Not testable"
      }
    ]
  });

  assert.equal(result.score, 100);
  assert.equal(result.coverageConfidence, "low");
  assert.match(result.summary, /applicable findings supported by retained evidence/i);
  assert.doesNotMatch(result.summary, /affect(?:s|ed)? (?:the )?score|weighted|deduct|credit/i);
});

test("confirmed post-refusal enforcement failure has a twelve-point family effect", () => {
  const row = {
    assessmentStatus: "gap_observed",
    criticalEvidence: { retainedEvidence: { rejectInteractionConfirmed: true } },
    evidenceState: "observed",
    id: "post_reject_tracking_reduction",
    status: "Gap observed"
  } as const;
  const single = deriveRegulatoryCoverageScore({ framework: "gdpr_eprivacy", rows: [row] });
  const repeated = deriveRegulatoryCoverageScore({ framework: "gdpr_eprivacy", rows: [row, row, row] });

  assert.equal(single.score, 88);
  assert.equal(repeated.score, 85);
});

test("confirmed passive post-refusal storage persistence is score-neutral", () => {
  const result = deriveRegulatoryCoverageScore({
    framework: "gdpr_eprivacy",
    rows: [
      {
        assessmentStatus: "checked",
        evidenceState: "observed",
        id: "privacy_notice_availability",
        status: "Observed"
      },
      {
        assessmentStatus: "review_signal",
        criticalEvidence: {
          retainedEvidence: {
            preConsentStorageNotClearedCount: 1,
            rejectInteractionConfirmed: true,
            scoreEffect: "none",
            storagePresenceDoesNotEstablishActiveUse: true
          }
        },
        evidenceState: "observed",
        id: "post_reject_tracking_reduction",
        status: "Review signal"
      }
    ]
  });
  const baseline = deriveRegulatoryCoverageScore({
    framework: "gdpr_eprivacy",
    rows: [{
      assessmentStatus: "checked",
      evidenceState: "observed",
      id: "privacy_notice_availability",
      status: "Observed"
    }]
  });

  assert.equal(result.score, baseline.score);
});

test("passive persistence cannot suppress a separately retained post-refusal contradiction", () => {
  const result = deriveRegulatoryCoverageScore({
    framework: "gdpr_eprivacy",
    rows: [{
      assessmentStatus: "gap_observed",
      criticalEvidence: {
        retainedEvidence: {
          preConsentStorageNotClearedCount: 1,
          refusalSignalContradictsAction: true,
          rejectInteractionConfirmed: true,
          scoreEffect: "none"
        }
      },
      evidenceState: "observed",
      id: "post_reject_tracking_reduction",
      status: "Gap observed"
    }]
  });

  assert.equal(result.score, 85);
});

test("unconfirmed post-refusal review remains score-neutral", () => {
  const result = deriveRegulatoryCoverageScore({
    framework: "gdpr_eprivacy",
    rows: [
      {
        assessmentStatus: "checked",
        evidenceState: "observed",
        id: "privacy_notice_availability",
        status: "Observed"
      },
      {
        assessmentStatus: "review_signal",
        criticalEvidence: {
          retainedEvidence: {
            preConsentStorageNotClearedCount: 1,
            rejectInteractionConfirmed: false
          }
        },
        evidenceState: "observed",
        id: "post_reject_tracking_reduction",
        status: "Review signal"
      }
    ]
  });

  assert.equal(result.score, 100);
});

test("Reject review and pre-consent tracking combine through ordinary deductions", () => {
  const result = deriveRegulatoryCoverageScore({
    framework: "gdpr_eprivacy",
    rows: [
      {
        assessmentStatus: "gap_observed",
        evidenceState: "observed",
        id: "pre_consent_third_party_tracking",
        status: "Gap observed"
      },
      {
        assessmentStatus: "review_signal",
        evidenceState: "observed",
        id: "reject_all_path_availability",
        status: "Review signal"
      }
    ]
  });

  assert.equal(result.score, 84);
});

test("pre-consent, refusal-path, and post-refusal failures combine without a systemic ceiling", () => {
  const result = deriveRegulatoryCoverageScore({
    framework: "gdpr_eprivacy",
    rows: [
      {
        assessmentStatus: "gap_observed",
        evidenceState: "observed",
        id: "pre_consent_third_party_tracking",
        status: "Gap observed"
      },
      {
        assessmentStatus: "gap_observed",
        evidenceState: "observed",
        id: "reject_all_path_availability",
        status: "Gap observed"
      },
      {
        assessmentStatus: "gap_observed",
        criticalEvidence: { retainedEvidence: { rejectInteractionConfirmed: true } },
        evidenceState: "observed",
        id: "post_reject_tracking_reduction",
        status: "Gap observed"
      }
    ]
  });

  assert.equal(result.score, 72);
  assert.equal(result.ratingLabel, "Review");
});

test("confirmed pre-consent and refusal-path failures use ordinary deductions", () => {
  const result = deriveRegulatoryCoverageScore({
    framework: "gdpr_eprivacy",
    rows: [
      {
        assessmentStatus: "gap_observed",
        evidenceState: "observed",
        id: "pre_consent_cookies_storage",
        status: "Gap observed"
      },
      {
        assessmentStatus: "gap_observed",
        evidenceState: "observed",
        id: "reject_all_path_availability",
        status: "Gap observed"
      }
    ]
  });

  assert.equal(result.score, 84);
});

test("a missing privacy notice is scored once instead of stacking every content omission", () => {
  const result = deriveRegulatoryCoverageScore({
    framework: "gdpr_eprivacy",
    rows: [
      {
        assessmentStatus: "gap_observed",
        evidenceState: "not_observed",
        id: "privacy_notice_availability",
        status: "Gap observed"
      },
      {
        assessmentStatus: "gap_observed",
        evidenceState: "not_observed",
        id: "processing_purposes_disclosure",
        status: "Gap observed"
      },
      {
        assessmentStatus: "gap_observed",
        evidenceState: "not_observed",
        id: "retention_disclosure_observed",
        status: "Gap observed"
      }
    ]
  });

  assert.equal(result.score, 88);
});

test("captured privacy policy transparency omissions are currently score-neutral", () => {
  const result = deriveRegulatoryCoverageScore({
    framework: "gdpr_eprivacy",
    rows: [
      {
        assessmentStatus: "checked",
        evidenceState: "observed",
        id: "privacy_notice_availability",
        status: "Observed"
      },
      ...[
        "automated_decision_making_profiling_disclosure",
        "controller_contact_disclosure",
        "cookie_notice_policy_availability",
        "data_subject_rights_disclosure",
        "dpo_contact_point_disclosure",
        "international_transfers_disclosure",
        "legal_basis_disclosure_observed",
        "processing_purposes_disclosure",
        "recipients_vendor_categories_disclosure",
        "retention_disclosure_observed",
        "supervisory_authority_complaint_disclosure"
      ].map((id) => ({
        assessmentStatus: "gap_observed",
        evidenceState: "not_observed",
        id,
        status: "Gap observed"
      }))
    ]
  });

  assert.equal(result.score, 100);
});

test("cross-border review uses the confirmed-gap deduction while a distinct embed retains its deduction", () => {
  const crossBorderReview = deriveRegulatoryCoverageScore({
    framework: "gdpr_eprivacy",
    rows: [{
      assessmentStatus: "review_signal",
      evidenceState: "observed",
      id: "cross_border_endpoint_review",
      status: "Review signal"
    }]
  });
  const trackingWithEmbed = deriveRegulatoryCoverageScore({
    framework: "gdpr_eprivacy",
    rows: [
      {
        assessmentStatus: "gap_observed",
        evidenceState: "observed",
        id: "pre_consent_third_party_tracking",
        status: "Gap observed"
      },
      {
        assessmentStatus: "gap_observed",
        evidenceState: "observed",
        id: "third_party_iframe_pre_consent",
        status: "Gap observed"
      }
    ]
  });

  assert.equal(crossBorderReview.score, 94);
  assert.equal(trackingWithEmbed.score, 89);
});

test("Caltech-style review evidence uses the same deductions as confirmed gaps", () => {
  const result = deriveRegulatoryCoverageScore({
    framework: "gdpr_eprivacy",
    rows: [
      {
        assessmentStatus: "gap_observed",
        criticalEvidence: {
          retainedEvidence: {
            preConsentStorageAssessment: { classifiedNonEssentialCount: 2 }
          }
        },
        evidenceState: "observed",
        id: "pre_consent_cookies_storage",
        status: "Gap observed"
      },
      {
        assessmentStatus: "review_signal",
        criticalEvidence: {
          missingOrIncompleteSourceSignals: [{ field: "promotionGradeSequence" }],
          retainedEvidence: {
            preconsentThirdPartyTrackerGroups: [
              { vendor: "Cloudflare Bot Management" },
              { vendor: "Google Analytics" }
            ]
          }
        },
        evidenceState: "observed",
        id: "pre_consent_third_party_tracking",
        status: "Review signal"
      },
      {
        assessmentStatus: "review_signal",
        evidenceState: "observed",
        id: "reject_all_path_availability",
        status: "Review signal"
      },
      {
        assessmentStatus: "review_signal",
        evidenceState: "observed",
        id: "social_media_embed_pre_consent",
        status: "Review signal"
      },
      {
        assessmentStatus: "review_signal",
        evidenceState: "observed",
        id: "embedded_content_pre_consent",
        status: "Review signal"
      }
    ]
  });

  assert.equal(result.score, 60);
  assert.equal(result.ratingLabel, "Needs work");
});

test("fingerprinting and session replay reviews use their confirmed-gap schedules", () => {
  const fingerprintReview = deriveRegulatoryCoverageScore({
    framework: "gdpr_eprivacy",
    rows: [{
      assessmentStatus: "review_signal",
      criticalEvidence: { retainedEvidence: { promotionEligible: true } },
      evidenceState: "observed",
      id: "device_identification_fingerprinting_signal_observed",
      status: "Review signal"
    }]
  });
  const fingerprintGap = deriveRegulatoryCoverageScore({
    framework: "gdpr_eprivacy",
    rows: [{
      assessmentStatus: "gap_observed",
      criticalEvidence: {
        retainedEvidence: {
          browserDeviceEntropyEvidence: { hosts: ["one.example", "two.example"] },
          promotionEligible: true
        }
      },
      evidenceState: "observed",
      id: "device_identification_fingerprinting_signal_observed",
      status: "Gap observed"
    }]
  });
  const replayReview = deriveRegulatoryCoverageScore({
    framework: "gdpr_eprivacy",
    rows: [{
      assessmentStatus: "review_signal",
      criticalEvidence: {
        retainedEvidence: { sessionReplayEvidence: { vendors: ["Hotjar"] } }
      },
      evidenceState: "observed",
      id: "session_replay_fingerprinting_review",
      status: "Review signal"
    }]
  });
  const replayGap = deriveRegulatoryCoverageScore({
    framework: "gdpr_eprivacy",
    rows: [{
      assessmentStatus: "gap_observed",
      criticalEvidence: {
        retainedEvidence: { sessionReplayEvidence: { vendors: ["Hotjar", "Clarity"] } }
      },
      evidenceState: "observed",
      id: "session_replay_fingerprinting_review",
      status: "Gap observed"
    }]
  });
  const sensitiveReplayGap = deriveRegulatoryCoverageScore({
    framework: "gdpr_eprivacy",
    rows: [{
      assessmentStatus: "gap_observed",
      criticalEvidence: {
        retainedEvidence: { sessionReplayEvidence: { vendors: ["Hotjar"] } }
      },
      evidenceState: "observed",
      id: "session_replay_fingerprinting_review",
      status: "Gap observed",
      subchecks: [{ id: "session_replay_sensitive_surface", status: "Gap observed" }]
    }]
  });

  assert.equal(fingerprintReview.score, 90);
  assert.equal(fingerprintGap.score, 84);
  assert.equal(replayReview.score, 88);
  assert.equal(replayGap.score, 82);
  assert.equal(sensitiveReplayGap.score, 80);
});

test("sensitive runtime and pre-consent findings combine without a systemic ceiling", () => {
  const result = deriveRegulatoryCoverageScore({
    framework: "gdpr_eprivacy",
    rows: [
      {
        assessmentStatus: "gap_observed",
        evidenceState: "observed",
        id: "pre_consent_third_party_tracking",
        status: "Gap observed"
      },
      {
        assessmentStatus: "gap_observed",
        evidenceState: "observed",
        id: "sensitive_surfaces_third_party_tracking",
        status: "Gap observed"
      }
    ]
  });

  assert.equal(result.score, 82);
});

test("technical policy extraction limitations do not affect the GDPR/ePrivacy score", () => {
  const score = deriveRegulatoryCoverageScore({
    framework: "gdpr_eprivacy",
    rows: [{
      assessmentStatus: "review_signal",
      criticalEvidence: {
        retainedEvidence: {
          policyEvidenceAssessment: {
            contractVersion: "certscore.policy-topic-evidence-assessment.v1",
            result: "not_located_automatically",
            scoreEffect: "none"
          }
        }
      },
      evidenceState: "not_observed",
      id: "legal_basis_disclosure_observed",
      status: "Not confirmed"
    }]
  });

  assert.equal(score.score, null);
  assert.equal(score.ratingLabel, "Not scored");
});
