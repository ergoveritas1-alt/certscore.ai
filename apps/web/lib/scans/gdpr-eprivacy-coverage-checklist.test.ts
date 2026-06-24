import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveGdprEprivacyCoverageChecklist,
  type GdprEprivacyCoverageChecklistItem
} from "./gdpr-eprivacy-coverage-checklist";
import type { GdprEprivacyCoverageOutcome } from "./gdpr-eprivacy-coverage-policy";
import { getReportableGdprEprivacyCoverageItems } from "./gdpr-eprivacy-reportable-rows";
import { deriveGdprEprivacyReviewSummary } from "./gdpr-eprivacy-review-summary";
import type { RuntimeCookieEvidenceRow } from "./runtime-cookie-evidence";
import type { UnifiedFindingDisplayPacket } from "./unified-findings";

function makeFinding(
  unifiedFindingId: string,
  findingName: string,
  status: "surface" | "audit_only" | "support_only" | "suppress" = "surface",
  sourceRefs: UnifiedFindingDisplayPacket["sourceRefs"] = [],
  evidence: Partial<NonNullable<UnifiedFindingDisplayPacket["evidence"]>> = {}
) {
  return {
    evidence: {
      flags: ["direct_runtime"],
      ...evidence
    },
    concernContext: {
      evidenceStrengthFlags: ["direct_runtime"]
    },
    presentation: { findingName },
    presentationDecision: { status },
    sourceRefs,
    title: findingName,
    unifiedFindingId
  } as UnifiedFindingDisplayPacket;
}

function byId(items: GdprEprivacyCoverageChecklistItem[], id: string) {
  const item = items.find((candidate) => candidate.id === id);
  assert.ok(item, `expected checklist item ${id}`);
  return item;
}

function makeCoverageOutcome(
  outcome: Omit<GdprEprivacyCoverageOutcome, "criticalEvidence"> & {
    retainedEvidence?: Record<string, unknown>;
  }
): GdprEprivacyCoverageOutcome {
  const { retainedEvidence, ...coverageOutcome } = outcome;
  return {
    ...coverageOutcome,
    criticalEvidence: {
      missingOrIncompleteSourceSignals: [],
      pipeline: {
        concernPolicyKey: `gdpr_eprivacy_coverage.${outcome.rowId}.${outcome.status.toLowerCase().replaceAll(" ", "_")}`,
        projectionStage: "coverage_policy",
        wc01NormalizedConcernKey: `gdpr_eprivacy.coverage.${outcome.rowId}`,
        ws01EvidenceRole: "observed runtime signal identification, evidence capture, and logging"
      },
      projectedFindings: [],
      retainedEvidence: {
        ...retainedEvidence,
        evidenceRefs: outcome.evidenceRefs
      },
      statusBasis: outcome.limitation
    }
  };
}

function makeRuntimeCookieRow(overrides: Partial<RuntimeCookieEvidenceRow>): RuntimeCookieEvidenceRow {
  return {
    category: "unknown",
    cookieName: "test_cookie",
    domain: "tracker.example",
    evidenceGrade: "high",
    firstObservedAtMs: 1200,
    initiatorDomain: null,
    initiatorUrl: null,
    initiatorVendor: null,
    nonEssential: true,
    party: "third_party",
    responseUrl: null,
    setAtMs: null,
    setMethod: null,
    sourceRequestUrl: null,
    timingBasis: "setAtMs",
    timingEvidence: "before_consent_cookie_write",
    ...overrides
  };
}

const usableRuntimeVendorDisclosureMismatch = JSON.stringify({
  coverageStatus: "usable",
  directVsInferred: "direct",
  evidenceConfidence: "moderate",
  matchedVendorDisclosureCount: 0,
  mismatchRationale: "DoubleVerify was not clearly matched in retained disclosure evidence.",
  observedRuntimeDomains: ["doubleverify.com"],
  observedRuntimeVendors: ["DoubleVerify"],
  policySurfacesSearched: [
    {
      matchedVendorNames: [],
      reached: true,
      searchedTerms: ["DoubleVerify", "doubleverify.com"],
      snippet: "We use analytics and advertising partners.",
      unmatchedVendorNames: ["DoubleVerify"],
      url: "https://example.test/privacy"
    }
  ],
  unmatchedRuntimeDomains: ["doubleverify.com"],
  unmatchedRuntimeVendors: ["DoubleVerify"],
  unmatchedVendorDisclosureCount: 1
});

test("deriveGdprEprivacyCoverageChecklist starts with primary GDPR/ePrivacy evidence rows", () => {
  const items = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    scanCompleted: true,
    unifiedFindings: []
  });

  assert.deepEqual(
    items.slice(0, 11).map((item) => item.id),
    [
      "consent_surface_observed",
      "cmp_framework_signal_observed",
      "reject_all_path_availability",
      "cookie_notice_policy_availability",
      "pre_consent_cookies_storage",
      "pre_consent_third_party_tracking",
      "advertising_retargeting_vendor_signal_observed",
      "retargeting_behavioral_advertising_signal_observed",
      "analytics_vendor_observed",
      "session_replay_fingerprinting_review",
      "device_identification_fingerprinting_signal_observed"
    ]
  );
});

test("deriveGdprEprivacyCoverageChecklist omits deferred low-confidence production rows", () => {
  const items = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    scanCompleted: true,
    unifiedFindings: []
  });
  const rowIds = new Set(items.map((item) => item.id));

  assert.equal(rowIds.has("marketing_consent_checkbox_observed"), false);
  assert.equal(rowIds.has("collection_surface_observed"), false);
  assert.equal(rowIds.has("privacy_notice_near_collection_surface"), false);
  assert.equal(rowIds.has("newsletter_marketing_signup_observed"), false);
  assert.equal(rowIds.has("embedded_content_disclosure_alignment"), false);
  assert.equal(rowIds.has("analytics_disclosure_alignment"), false);
});

test("getReportableGdprEprivacyCoverageItems omits standalone runtime vendor signal rows", () => {
  const items = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    scanCompleted: true,
    unifiedFindings: []
  });
  const rowIds = new Set(getReportableGdprEprivacyCoverageItems(items).map((item) => item.id));

  assert.equal(rowIds.has("advertising_retargeting_vendor_signal_observed"), false);
  assert.equal(rowIds.has("retargeting_behavioral_advertising_signal_observed"), false);
  assert.equal(rowIds.has("analytics_vendor_observed"), false);
});

test("deriveGdprEprivacyCoverageChecklist maps canonical unified findings without creating pass/fail language", () => {
  const postRejectFinding = makeFinding("reject_tracking_persists_after_reject", "Tracking continued after reject");
  postRejectFinding.evidence = {
    ...postRejectFinding.evidence,
    flags: ["direct_runtime", "reject_evidence_confirmed"],
    entities: {
      postRejectTrackingReductionEvidence: [
        JSON.stringify({
          postRejectWindowAvailable: true,
          rejectInteractionConfirmed: true
        })
      ]
    }
  };
  const items = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    scanCompleted: true,
    unifiedFindings: [
      makeFinding("third_party_cookie_pre_consent", "Third-party cookie before consent"),
      postRejectFinding
    ]
  });

  assert.equal(byId(items, "pre_consent_cookies_storage").status, "Gap observed");
  assert.deepEqual(byId(items, "pre_consent_cookies_storage").evidenceRefs, [
    "Third-party cookie before consent",
    "Evidence flag: direct_runtime",
    "Evidence strength: direct runtime"
  ]);
  assert.equal(byId(items, "post_reject_tracking_reduction").status, "Review signal");
  assert.equal(byId(items, "pre_consent_third_party_tracking").status, "Not observed");
  assert.equal(items.some((item) => ["Pass", "Fail"].includes(String(item.status))), false);
});

test("deriveGdprEprivacyCoverageChecklist rates pre-consent third-party cookie storage from high-priority cookie inventory", () => {
  const items = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    runtimeCookieRows: [
      makeRuntimeCookieRow({
        category: "advertising",
        cookieName: "IDE",
        domain: ".doubleclick.net",
        firstObservedAtMs: 950,
        initiatorVendor: "Google Ads / DoubleClick"
      }),
      makeRuntimeCookieRow({
        category: "analytics",
        cookieName: "_ga",
        domain: ".example.test",
        firstObservedAtMs: 600,
        initiatorVendor: "Google",
        party: "first_party"
      })
    ],
    scanCompleted: true,
    unifiedFindings: []
  });

  const row = byId(items, "pre_consent_cookies_storage");
  assert.equal(row.status, "Gap observed");
  assert.equal(row.criticalEvidence.retainedEvidence.cookieStoragePriority, "high");
  assert.match(row.explanation, /Google - Advertising \(950ms\)/);
  assert.match(row.criticalEvidence.statusBasis, /High priority.*Advertising/);
});

test("deriveGdprEprivacyCoverageChecklist keeps medium third-party cookie storage as partial-concern review evidence", () => {
  const items = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    runtimeCookieRows: [
      makeRuntimeCookieRow({
        category: "analytics",
        cookieName: "_qca",
        domain: ".quantserve.com",
        firstObservedAtMs: 1400,
        initiatorVendor: "Quantcast"
      })
    ],
    scanCompleted: true,
    unifiedFindings: []
  });

  const row = byId(items, "pre_consent_cookies_storage");
  assert.equal(row.status, "Review signal");
  assert.equal(row.assessmentStatus, "review_signal");
  assert.equal(row.criticalEvidence.retainedEvidence.cookieStoragePriority, "medium");
  assert.match(row.explanation, /Quantcast - Analytics \(1400ms\)/);
  assert.match(row.criticalEvidence.statusBasis, /Medium priority.*Analytics/);
});

test("deriveGdprEprivacyCoverageChecklist lets medium cookie inventory override legacy gap finding status", () => {
  const items = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    runtimeCookieRows: [
      makeRuntimeCookieRow({
        category: "analytics",
        cookieName: "__qca",
        domain: ".quantserve.com",
        firstObservedAtMs: 1187,
        initiatorVendor: "Quantcast"
      })
    ],
    scanCompleted: true,
    unifiedFindings: [
      makeFinding("third_party_cookie_pre_consent", "Third-party cookie before consent")
    ]
  });

  const row = byId(items, "pre_consent_cookies_storage");
  assert.equal(row.status, "Review signal");
  assert.equal(row.assessmentStatus, "review_signal");
  assert.equal(row.criticalEvidence.retainedEvidence.cookieStoragePriority, "medium");
  assert.match(row.explanation, /Quantcast - Analytics \(1187ms\)/);
});

test("deriveGdprEprivacyCoverageChecklist rates pre-consent third-party tracking from high-priority tracker inventory", () => {
  const items = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    runtimeTrackerPriorityRows: [
      {
        firstSeenMs: 386,
        party: "3rd",
        priority: "high",
        purpose: "Advertising",
        vendor: "Google Ads / DoubleClick"
      },
      {
        firstSeenMs: 2100,
        party: "3rd",
        priority: "medium",
        purpose: "A/B Testing",
        vendor: "Optimizely"
      }
    ],
    scanCompleted: true,
    unifiedFindings: []
  });

  const row = byId(items, "pre_consent_third_party_tracking");
  assert.equal(row.status, "Gap observed");
  assert.equal(row.criticalEvidence.retainedEvidence.trackerPriority, "high");
  assert.match(row.explanation, /Google Ads \/ DoubleClick - Advertising \(386ms\)/);
  assert.match(row.criticalEvidence.statusBasis, /High priority.*Advertising/);
});

test("deriveGdprEprivacyCoverageChecklist keeps medium pre-consent tracking as partial-concern review evidence", () => {
  const items = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    runtimeTrackerPriorityRows: [
      {
        firstSeenMs: 2100,
        party: "3rd",
        priority: "medium",
        purpose: "A/B Testing",
        vendor: "Optimizely"
      }
    ],
    scanCompleted: true,
    unifiedFindings: []
  });

  const row = byId(items, "pre_consent_third_party_tracking");
  assert.equal(row.status, "Review signal");
  assert.equal(row.assessmentStatus, "review_signal");
  assert.equal(row.criticalEvidence.retainedEvidence.trackerPriority, "medium");
  assert.match(row.explanation, /Optimizely - A\/B Testing \(2100ms\)/);
  assert.match(row.criticalEvidence.statusBasis, /Medium priority.*A\/B Testing/);
});

test("deriveGdprEprivacyCoverageChecklist maps Article 13 disclosure findings into transparency rows", () => {
  const items = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    scanCompleted: true,
    unifiedFindings: [
      makeFinding("legal_basis_disclosure_present", "Legal basis disclosure present"),
      makeFinding("retention_disclosure_present", "Retention disclosure present"),
      makeFinding("supervisory_authority_disclosure_present", "Supervisory authority complaint disclosure present"),
      makeFinding("automated_decision_profiling_disclosure_present", "Automated decision-making/profiling disclosure present")
    ]
  });

  assert.equal(byId(items, "legal_basis_disclosure_observed").status, "Observed");
  assert.equal(byId(items, "retention_disclosure_observed").status, "Observed");
  assert.equal(byId(items, "supervisory_authority_complaint_disclosure").status, "Observed");
  assert.equal(byId(items, "automated_decision_making_profiling_disclosure").status, "Observed");
});

test("deriveGdprEprivacyCoverageChecklist labels retained post-consent session replay as observed", () => {
  const outcome = makeCoverageOutcome({
    evidenceRefs: [
      "Session replay signal observed; pre-consent replay not retained",
      "Runtime vendor: Microsoft Clarity",
      "Runtime vendor: Hotjar",
      "Runtime vendor: Contentsquare",
      "Consent timing: no pre-consent replay evidence retained"
    ],
    limitation: "Session replay or behavioral analytics vendor evidence was retained, with no pre-consent replay evidence retained.",
    rowId: "session_replay_fingerprinting_review",
    status: "Observed"
  });
  outcome.criticalEvidence.retainedEvidence = {
    ...outcome.criticalEvidence.retainedEvidence,
    sessionReplayEvidence: {
      collectionEndpointObserved: true,
      preConsentObserved: false,
      vendors: ["Microsoft Clarity", "Hotjar", "Contentsquare"]
    }
  };

  const items = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    coverageOutcomes: {
      session_replay_fingerprinting_review: outcome
    },
    scanCompleted: true,
    unifiedFindings: [
      makeFinding("session_replay_observed", "Session replay observed", "surface", [], {
        entities: {
          session_replay_runtime_vendors: ["Microsoft Clarity", "Hotjar", "Contentsquare"]
        }
      })
    ]
  });

  const row = byId(items, "session_replay_fingerprinting_review");
  assert.equal(row.status, "Observed");
  assert.equal(row.evidenceState, "observed");
  assert.equal(row.assessmentStatus, "checked");
  assert.equal(row.label, "Session replay signal");
  assert.match(row.explanation, /not observed pre-consent in retained evidence/i);
  assert.match(row.explanation, /Microsoft Clarity, Hotjar, and Contentsquare/);
  assert.doesNotMatch(row.explanation, /before consent observed/i);
  assert.equal(row.subchecks, undefined);
  assert.equal(items.some((item) => item.id === "session_replay_before_consent"), false);
});

test("deriveGdprEprivacyCoverageChecklist labels entropy-only evidence separately from session replay", () => {
  const outcome = makeCoverageOutcome({
    evidenceRefs: [
      "Browser/device entropy review signal",
      "Observed host: ca-times.brightspotcdn.com"
    ],
    limitation: "Browser/device entropy review signal. Retained evidence showed browser or device entropy access, but no session replay vendor, entropy transmission, identifier linkage, known fingerprinting library, or device-data-like request payload was retained.",
    rowId: "session_replay_fingerprinting_review",
    status: "Review signal"
  });
  outcome.criticalEvidence.retainedEvidence = {
    ...outcome.criticalEvidence.retainedEvidence,
    browserDeviceEntropyEvidence: {
      entropyLinkedToIdentifier: false,
      entropyTransmissionObserved: false,
      hosts: ["ca-times.brightspotcdn.com"],
      knownFingerprintLibraryMatch: null,
      strongCorroboratorObserved: false
    },
    fingerprintingObserved: true,
    sessionReplayObserved: false
  };

  const items = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    coverageOutcomes: {
      session_replay_fingerprinting_review: outcome
    },
    scanCompleted: true,
    unifiedFindings: []
  });

  const row = byId(items, "session_replay_fingerprinting_review");
  assert.equal(row.status, "Not observed");
  assert.equal(row.evidenceState, "not_observed");
  assert.equal(row.assessmentStatus, "checked");
  assert.equal(row.label, "Session replay signal");
  assert.match(row.explanation, /device identification row/i);

  const deviceRow = byId(items, "device_identification_fingerprinting_signal_observed");
  assert.equal(deviceRow.status, "Review signal");
  assert.equal(deviceRow.evidenceState, "observed");
  assert.equal(deviceRow.assessmentStatus, "review_signal");
  assert.equal(deviceRow.label, "Device identification / fingerprinting signal");
  assert.match(deviceRow.explanation, /Browser\/device entropy review signal/i);
});

test("deriveGdprEprivacyCoverageChecklist labels retained pre-consent session replay as a gap", () => {
  const outcome = makeCoverageOutcome({
    evidenceRefs: [
      "Session replay signal observed before consent",
      "Runtime vendor: Hotjar",
      "Consent state: pre_consent"
    ],
    limitation: "Session replay evidence was retained before a recorded consent action.",
    rowId: "session_replay_fingerprinting_review",
    status: "Gap observed"
  });
  outcome.criticalEvidence.retainedEvidence = {
    ...outcome.criticalEvidence.retainedEvidence,
    sessionReplayEvidence: {
      consentStates: ["pre_consent"],
      preConsentObserved: true,
      vendors: ["Hotjar"]
    }
  };

  const items = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    coverageOutcomes: {
      session_replay_fingerprinting_review: outcome
    },
    scanCompleted: true,
    unifiedFindings: [
      makeFinding("session_replay_observed", "Session replay observed", "surface", [], {
        entities: {
          consentStates: ["pre_consent"],
          session_replay_runtime_vendors: ["Hotjar"]
        }
      })
    ]
  });

  const row = byId(items, "session_replay_fingerprinting_review");
  assert.equal(row.status, "Gap observed");
  assert.equal(row.evidenceState, "observed");
  assert.equal(row.assessmentStatus, "gap_observed");
  assert.equal(row.label, "Session replay signal");
  assert.match(row.explanation, /before a recorded consent action/i);
  assert.equal(row.subchecks, undefined);
  assert.equal(items.some((item) => item.id === "session_replay_before_consent"), false);
});

test("deriveGdprEprivacyCoverageChecklist keeps consent surface and post-choice lifecycle ownership separate", () => {
  const items = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    coverageOutcomes: {
      consent_surface_observed: makeCoverageOutcome({
        evidenceRefs: [
          "Evidence: retained consent surface observation",
          "Visible choice: Accept",
          "Visible choice: Decline"
        ],
        limitation: "A consent surface or first-layer consent controls were retained in the tested context.",
        rowId: "consent_surface_observed",
        status: "Observed"
      })
    },
    scanCompleted: true,
    unifiedFindings: [
      makeFinding("consent_control_not_reopenable", "Consent controls may be hard to revisit")
    ]
  });

  const consentSurface = byId(items, "consent_surface_observed");
  assert.equal(consentSurface.label, "Consent mechanism");
  assert.equal(consentSurface.evidenceState, "observed");
  assert.equal(consentSurface.assessmentStatus, "checked");
  assert.equal(consentSurface.status, "Observed");
  assert.match(consentSurface.explanation, /actionable cookie\/consent banner or preference surface was observed/i);
  assert.doesNotMatch(JSON.stringify(consentSurface), /hard to revisit|reopen/i);

  const postChoice = byId(items, "preference_withdrawal_control");
  assert.equal(postChoice.label, "Post-choice consent controls");
  assert.equal(postChoice.evidenceState, "not_observed");
  assert.equal(postChoice.assessmentStatus, "gap_observed");
  assert.equal(postChoice.status, "Gap observed");
  assert.match(postChoice.explanation, /No obvious cookie preferences, privacy settings, or consent-preference reopen control/i);
});

test("deriveGdprEprivacyCoverageChecklist renders consent choice quality as a standalone simple-cookie-notice review signal", () => {
  const items = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    coverageOutcomes: {
      consent_surface_observed: makeCoverageOutcome({
        evidenceRefs: [
          "Evidence: retained consent surface observation",
          "Visible choice: Accept",
          "Visible choice: Decline",
          "Layer inspected: first_layer"
        ],
        retainedEvidence: {
          consentSurfaceObserved: true,
          firstLayerCookieConsentBannerObserved: true,
          gdprEprivacyConsentSurfaceObserved: true,
          layerInspected: "first_layer",
          visibleChoiceLabels: ["Accept", "Decline"]
        },
        limitation: "A consent surface or first-layer consent controls were retained in the tested context.",
        rowId: "consent_surface_observed",
        status: "Observed"
      }),
      reject_all_path_availability: makeCoverageOutcome({
        evidenceRefs: [
          "Evidence: reject path depth and availability",
          "Layer inspected: first_layer",
          "Visible choice: Decline"
        ],
        retainedEvidence: {
          firstLayerCookieConsentBannerObserved: true,
          gdprEprivacyConsentSurfaceObserved: true,
          layerInspected: "first_layer",
          rejectInteractionSucceeded: false,
          sameLayerRejectObserved: true,
          visibleRejectLabels: ["Decline"]
        },
        limitation: "A reject or equivalent refusal path was retained in the tested consent surface.",
        rowId: "reject_all_path_availability",
        status: "Observed"
      }),
      consent_choice_quality: makeCoverageOutcome({
        evidenceRefs: [
          "Evidence: consent choice quality",
          "Visible choice: Accept",
          "Visible choice: Decline",
          "Layer inspected: first_layer"
        ],
        retainedEvidence: {
          acceptControlObserved: true,
          defaultToggleStatesObserved: null,
          firstLayerCookieConsentBannerObserved: true,
          gdprEprivacyConsentSurfaceObserved: true,
          layerInspected: "first_layer",
          managePreferencesObserved: false,
          missingEvidenceNeeded: [
            "cookie preference center or manage/preferences/settings control",
            "purpose or cookie-category choices",
            "vendor-level choices when applicable",
            "default toggle state evidence",
            "non-essential defaults observed off",
            "save or confirm choices control",
            "accept/reject visual parity evidence"
          ],
          nonEssentialDefaultsOff: null,
          preferenceCenterOpened: false,
          purposeCategoryControlsObserved: null,
          rejectControlObserved: true,
          sameLayerRejectObserved: true,
          saveChoicesObserved: null,
          selectedEvidenceArtifactId: "consentChoiceQualityEvidence",
          selectedEvidenceStrength: "limited",
          vendorControlsObserved: null,
          visibleChoiceLabels: ["Accept", "Decline"],
          visualParityEvidenceObserved: null
        },
        limitation:
          "Basic same-layer Accept and Decline controls were observed, but CertScore did not confirm granular cookie preferences, purpose/vendor choices, default toggle states, or a cookie preference center.",
        rowId: "consent_choice_quality",
        status: "Review signal"
      })
    },
    scanCompleted: true,
    unifiedFindings: []
  });

  const consentSurface = byId(items, "consent_surface_observed");
  assert.equal(consentSurface.status, "Observed");
  assert.equal(consentSurface.assessmentStatus, "checked");

  const rejectPath = byId(items, "reject_all_path_availability");
  assert.equal(rejectPath.status, "Observed");
  assert.equal(rejectPath.assessmentStatus, "checked");

  const choiceQuality = byId(items, "consent_choice_quality");
  assert.equal(choiceQuality.label, "Consent choice quality");
  assert.equal(choiceQuality.status, "Review signal");
  assert.equal(choiceQuality.assessmentStatus, "review_signal");
  assert.equal(choiceQuality.evidenceState, "observed");
  assert.match(choiceQuality.criticalEvidence.statusBasis, /Basic same-layer Accept and Decline controls were observed/i);
  assert.equal(choiceQuality.criticalEvidence.retainedEvidence.selectedEvidenceArtifactId, "consentChoiceQualityEvidence");
  assert.equal(choiceQuality.criticalEvidence.retainedEvidence.selectedEvidenceStrength, "limited");
  assert.deepEqual(choiceQuality.criticalEvidence.retainedEvidence.visibleChoiceLabels, ["Accept", "Decline"]);
  assert.match(JSON.stringify(choiceQuality.criticalEvidence.retainedEvidence.missingEvidenceNeeded), /purpose or cookie-category choices/i);
});

test("deriveGdprEprivacyCoverageChecklist renders consent choice quality not testable for footer privacy links only", () => {
  const items = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    coverageOutcomes: {
      consent_surface_observed: makeCoverageOutcome({
        evidenceRefs: [
          "Evidence: consent control lifecycle",
          "Observed control: Ad Choices",
          "Observed control: Your Privacy Choices"
        ],
        retainedEvidence: {
          firstLayerCookieConsentBannerObserved: false,
          gdprEprivacyConsentSurfaceObserved: "unconfirmed",
          privacyControlPlacement: "footer",
          visibleChoiceLabels: []
        },
        limitation: "Privacy/ad-choice surface observed; GDPR consent banner not confirmed.",
        rowId: "consent_surface_observed",
        status: "Not confirmed"
      }),
      consent_choice_quality: makeCoverageOutcome({
        evidenceRefs: [
          "Evidence: consent choice quality",
          "Layer inspected: footer_link"
        ],
        retainedEvidence: {
          firstLayerCookieConsentBannerObserved: false,
          layerInspected: "footer_link",
          missingEvidenceNeeded: [
            "cookie preference center or manage/preferences/settings control",
            "purpose or cookie-category choices"
          ],
          selectedEvidenceArtifactId: "consentChoiceQualityEvidence",
          selectedEvidenceStrength: "missing",
          visibleChoiceLabels: []
        },
        limitation:
          "Consent choice quality could not be evaluated because no first-layer GDPR/ePrivacy cookie consent surface was confirmed.",
        rowId: "consent_choice_quality",
        status: "Not testable"
      })
    },
    scanCompleted: true,
    unifiedFindings: []
  });

  const consentSurface = byId(items, "consent_surface_observed");
  assert.equal(
    consentSurface.label,
    "Privacy/ad-choice controls observed; GDPR/ePrivacy consent banner not confirmed."
  );
  assert.equal(consentSurface.status, "Not confirmed");

  const choiceQuality = byId(items, "consent_choice_quality");
  assert.equal(choiceQuality.status, "Not testable");
  assert.equal(choiceQuality.assessmentStatus, "coverage_limitation");
  assert.equal(choiceQuality.evidenceState, "not_testable");
  assert.match(choiceQuality.criticalEvidence.statusBasis, /no first-layer GDPR\/ePrivacy cookie consent surface was confirmed/i);
});

test("deriveGdprEprivacyCoverageChecklist keeps footer privacy-choice controls as consent-surface review signals", () => {
  const items = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    coverageOutcomes: {
      consent_surface_observed: makeCoverageOutcome({
        evidenceRefs: [
          "Evidence: consent control lifecycle",
          "Surface purpose: sale_share_opt_out",
          "Placement: footer"
        ],
        limitation:
          "Scanner retained a footer/privacy-choice or sale-share opt-out control, but did not confirm a first-layer cookie consent banner or CMP preference surface for GDPR/ePrivacy review.",
        rowId: "consent_surface_observed",
	        status: "Not confirmed"
      })
    },
    scanCompleted: true,
    unifiedFindings: []
  });

  const consentSurface = byId(items, "consent_surface_observed");
	  assert.equal(consentSurface.status, "Not confirmed");
	  assert.equal(consentSurface.assessmentStatus, "review_signal");
	  assert.equal(consentSurface.evidenceState, "not_observed");
  assert.match(consentSurface.explanation, /did not confirm a first-layer cookie consent banner/i);
});

test("deriveGdprEprivacyCoverageChecklist labels privacy notice gates with privacy choices", () => {
  const items = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    coverageOutcomes: {
      consent_surface_observed: makeCoverageOutcome({
        evidenceRefs: [
          "Evidence: first-layer legal/privacy notice gate",
          "Visible choice: Your Privacy Choices",
          "Visible choice: Continue"
        ],
        limitation:
          "Privacy notice gate with privacy-choice link observed; GDPR/ePrivacy consent surface not confirmed. The retained first-layer surface disclosed analytics, marketing, advertising, or partner tracking, but did not show a clear same-layer reject or granular cookie-choice flow.",
        rowId: "consent_surface_observed",
        status: "Not confirmed"
      })
    },
    scanCompleted: true,
    unifiedFindings: []
  });

  const consentSurface = byId(items, "consent_surface_observed");
  assert.equal(
    consentSurface.label,
    "Privacy notice gate with privacy-choice link observed; GDPR/ePrivacy consent surface not confirmed."
  );
  assert.equal(consentSurface.status, "Not confirmed");
  assert.equal(consentSurface.assessmentStatus, "review_signal");
});

test("deriveGdprEprivacyCoverageChecklist keeps footer ad-choice controls as GDPR post-choice review signals", () => {
  const items = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    coverageOutcomes: {
      preference_withdrawal_control: makeCoverageOutcome({
        evidenceRefs: ["Evidence: consent control lifecycle", "Observed control: Ad Choices", "Observed control: Google Analytics Opt-Out"],
        limitation:
          "Footer privacy/ad-choice and vendor opt-out links were observed, but CertScore did not confirm a GDPR/ePrivacy cookie preference center or consent-withdrawal control.",
        rowId: "preference_withdrawal_control",
        status: "Review signal"
      })
    },
    scanCompleted: true,
    unifiedFindings: []
  });

  const postChoice = byId(items, "preference_withdrawal_control");
  assert.equal(postChoice.status, "Review signal");
  assert.equal(postChoice.assessmentStatus, "review_signal");
  assert.equal(postChoice.evidenceState, "observed");
  assert.match(postChoice.explanation, /did not confirm a GDPR\/ePrivacy cookie preference center/i);
});

test("deriveGdprEprivacyCoverageChecklist demotes inconsistent checked post-choice rows from ad-choice evidence", () => {
  const items = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    coverageOutcomes: {
      preference_withdrawal_control: makeCoverageOutcome({
        evidenceRefs: [
          "Observed control: Ad Choices",
          "Observed control: Close preference center",
          "Observed control: Google Analytics Opt-Out"
        ],
        limitation: "CertScore observed a post-choice consent or preference control in the tested context.",
        retainedEvidence: {
          cookiePreferencesLinkObserved: false,
          footerPreferenceLinkObserved: true,
          observedControlLabels: ["Ad Choices", "Close preference center", "Google Analytics Opt-Out"],
          privacyAdChoiceOnlyControlObserved: true,
          withdrawalTextObserved: false
        },
        rowId: "preference_withdrawal_control",
        status: "Observed"
      })
    },
    scanCompleted: true,
    unifiedFindings: []
  });

  const postChoice = byId(items, "preference_withdrawal_control");
  assert.equal(postChoice.status, "Review signal");
  assert.equal(postChoice.assessmentStatus, "review_signal");
  assert.equal(postChoice.evidenceState, "observed");
  assert.deepEqual(postChoice.criticalEvidence.projectedFindings, []);
  assert.match(postChoice.criticalEvidence.statusBasis, /did not confirm a GDPR\/ePrivacy cookie preference center/i);
  assert.match(
    JSON.stringify(postChoice.criticalEvidence.missingOrIncompleteSourceSignals),
    /privacy_ad_choice_only_controls_do_not_confirm_gdpr_cookie_consent_withdrawal/
  );
  assert.equal(
    postChoice.criticalEvidence.retainedEvidence.selectedEvidenceArtifactId,
    "consentControlLifecycleEvidence.privacyAdChoiceOnly"
  );
  assert.equal(postChoice.criticalEvidence.retainedEvidence.selectedEvidenceStrength, "limited");
  assert.deepEqual(postChoice.criticalEvidence.retainedEvidence.missingEvidenceNeeded, [
    "Cookie preference center, cookie-category controls, or consent-withdrawal control tied to GDPR/ePrivacy cookie consent.",
    "CertScore.gdprEprivacyChecklist.evidenceDeducibility: Required before CertScore can render this GDPR/ePrivacy checklist row as checked, observed, or gap-level evidence without overclaiming."
  ]);
  assert.match(
    JSON.stringify(postChoice.criticalEvidence.retainedEvidence.weakerArtifactsIgnored),
    /do not prove GDPR\/ePrivacy cookie-consent withdrawal/
  );
});

test("deriveGdprEprivacyCoverageChecklist demotes inconsistent consent and reject rows without confirmed banner", () => {
  const items = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    coverageOutcomes: {
      consent_surface_observed: makeCoverageOutcome({
        evidenceRefs: ["Evidence: retained consent surface observation"],
        limitation: "A consent surface or first-layer consent controls were retained in the tested context.",
        retainedEvidence: {
          consentSurfaceObserved: false,
          firstLayerCookieConsentBannerObserved: false,
          gdprEprivacyConsentSurfaceObserved: "unconfirmed",
          privacyControlPlacement: "footer",
          surfacePurpose: "targeted_ads_opt_out"
        },
        rowId: "consent_surface_observed",
        status: "Observed"
      }),
      reject_all_path_availability: makeCoverageOutcome({
        evidenceRefs: ["Evidence: reject path depth and availability"],
        limitation: "A reject or equivalent refusal path was retained in the tested consent surface.",
        retainedEvidence: {
          firstLayerCookieConsentBannerObserved: false,
          gdprEprivacyConsentSurfaceObserved: "unconfirmed"
        },
        rowId: "reject_all_path_availability",
        status: "Gap observed"
      }),
      post_reject_tracking_reduction: makeCoverageOutcome({
        evidenceRefs: ["Evidence: post-reject tracking reduction evidence"],
        limitation: "A reject action and post-reject comparison evidence were retained.",
        retainedEvidence: {
          firstLayerCookieConsentBannerObserved: false,
          gdprEprivacyConsentSurfaceObserved: "unconfirmed"
        },
        rowId: "post_reject_tracking_reduction",
        status: "Gap observed"
      })
    },
    scanCompleted: true,
    unifiedFindings: []
  });

  assert.equal(byId(items, "consent_surface_observed").status, "Not confirmed");
  assert.equal(byId(items, "consent_surface_observed").evidenceState, "not_observed");
  assert.equal(byId(items, "reject_all_path_availability").status, "Not testable");
  assert.equal(byId(items, "reject_all_path_availability").assessmentStatus, "coverage_limitation");
  assert.deepEqual(byId(items, "reject_all_path_availability").criticalEvidence.projectedFindings, []);
  assert.equal(
    byId(items, "reject_all_path_availability").criticalEvidence.retainedEvidence.selectedEvidenceArtifactId,
    "rejectPathDepthAndAvailability"
  );
  assert.match(
    JSON.stringify(byId(items, "reject_all_path_availability").criticalEvidence.retainedEvidence.missingEvidenceNeeded),
    /same-surface accept\/reject control inventory/
  );
  assert.equal(byId(items, "post_reject_tracking_reduction").status, "Not testable");
  assert.match(byId(items, "post_reject_tracking_reduction").limitation ?? "", /no first-layer GDPR\/ePrivacy consent banner/i);
});

test("deriveGdprEprivacyCoverageChecklist keeps missing reject as a gap when pre-consent activity is retained", () => {
  const items = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    coverageOutcomes: {
      reject_all_path_availability: makeCoverageOutcome({
        evidenceRefs: [
          "Evidence: retained pre-consent cookie/tracking activity",
          "Evidence: no first-layer reject option retained"
        ],
        limitation:
          "CertScore scanned the page and retained pre-consent cookie or tracking activity, but did not retain a first-layer reject, decline, refuse, or continue-without-accepting option.",
        retainedEvidence: {
          firstLayerCookieConsentBannerObserved: false,
          gdprEprivacyConsentSurfaceObserved: "unconfirmed",
          preconsentCookieOrTrackingActivityObserved: true,
          reason: "no_reject_option_retained_with_preconsent_activity",
          rejectControlObserved: false
        },
        rowId: "reject_all_path_availability",
        status: "Gap observed"
      })
    },
    scanCompleted: true,
    unifiedFindings: []
  });

  const rejectPath = byId(items, "reject_all_path_availability");
  assert.equal(rejectPath.status, "Gap observed");
  assert.equal(rejectPath.assessmentStatus, "gap_observed");
  assert.equal(rejectPath.evidenceState, "not_observed");
  assert.match(rejectPath.limitation ?? "", /did not retain a first-layer reject/i);
});

test("deriveGdprEprivacyCoverageChecklist keeps missing reject as a gap without relying on policy reason strings", () => {
  const items = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    coverageOutcomes: {
      reject_all_path_availability: makeCoverageOutcome({
        evidenceRefs: [
          "Evidence: retained pre-consent cookie/tracking activity",
          "Evidence: no first-layer reject option retained"
        ],
        limitation:
          "CertScore scanned the page and retained pre-consent cookie or tracking activity, but did not retain a first-layer reject, decline, refuse, or continue-without-accepting option.",
        retainedEvidence: {
          consentSurfaceObserved: true,
          firstLayerCookieConsentBannerObserved: false,
          gdprEprivacyConsentSurfaceObserved: "unconfirmed",
          preconsentCookieOrTrackingActivityObserved: true,
          rejectControlObserved: false
        },
        rowId: "reject_all_path_availability",
        status: "Gap observed"
      })
    },
    scanCompleted: true,
    unifiedFindings: []
  });

  const rejectPath = byId(items, "reject_all_path_availability");
  assert.equal(rejectPath.status, "Gap observed");
  assert.equal(rejectPath.assessmentStatus, "gap_observed");
  assert.equal(rejectPath.evidenceState, "not_observed");
  assert.doesNotMatch(rejectPath.limitation ?? "", /not testable/i);
});

test("deriveGdprEprivacyCoverageChecklist does not map generic transfer disclosure findings to cross-border endpoint review", () => {
  const genericItems = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    coverageOutcomes: {
      cross_border_endpoint_review: makeCoverageOutcome({
        evidenceRefs: ["Runtime vendor: Cloudflare Web Analytics"],
        limitation: "Third-party endpoint inventory was retained.",
        rowId: "cross_border_endpoint_review",
        status: "Review signal"
      })
    },
    scanCompleted: true,
    unifiedFindings: [
      makeFinding("missing_transfer_disclosure", "Missing transfer disclosure")
    ]
  });

  assert.equal(byId(genericItems, "cross_border_endpoint_review").status, "Review signal");

  const genericProjectedItems = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    coverageOutcomes: {
      cross_border_endpoint_review: makeCoverageOutcome({
        evidenceRefs: ["Runtime vendor: Cloudflare Web Analytics"],
        limitation: "Third-party endpoint inventory was retained.",
        rowId: "cross_border_endpoint_review",
        status: "Review signal"
      })
    },
    projectedFindings: [
      {
        id: "missing_transfer_disclosure",
        label: "Missing transfer disclosure"
      }
    ],
    scanCompleted: true,
    unifiedFindings: []
  });

  assert.equal(byId(genericProjectedItems, "cross_border_endpoint_review").status, "Review signal");

  const vendorGapItems = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    scanCompleted: true,
    unifiedFindings: [
      makeFinding("cross_border_vendor_disclosure_gap", "Cross-border vendor disclosure gap observed", "surface", [], {
        entities: {
          crossBorderDisclosureGapBasis: ["transfer_endpoint_runtime_vendor_not_disclosed"],
          endpointJurisdictionEvidence: ["{}"],
          runtimeVendorDisclosureEvidence: [usableRuntimeVendorDisclosureMismatch]
        }
      })
    ]
  });

  assert.equal(byId(vendorGapItems, "cross_border_endpoint_review").status, "Gap observed");
  assert.equal(byId(vendorGapItems, "cross_border_endpoint_review").label, "Transfer-relevant vendor disclosure gap");
  assert.match(
    byId(vendorGapItems, "cross_border_endpoint_review").explanation,
    /gap status is based on retained disclosure mismatch/i
  );
  assert.deepEqual(byId(vendorGapItems, "cross_border_endpoint_review").criticalEvidence.projectedFindings, [
    {
      id: "cross_border_vendor_disclosure_gap",
      label: "Cross-border vendor disclosure gap observed",
      severity: undefined
    }
  ]);

  const linkedItems = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    scanCompleted: true,
    unifiedFindings: [
      makeFinding("missing_transfer_disclosure", "Missing transfer disclosure", "surface", [], {
        entities: {
          crossBorderDisclosureGapBasis: ["transfer_endpoint_runtime_vendor_not_disclosed"],
          endpointJurisdictionEvidence: ["{}"],
          runtimeVendorDisclosureEvidence: [usableRuntimeVendorDisclosureMismatch]
        }
      })
    ]
  });

  assert.equal(byId(linkedItems, "cross_border_endpoint_review").status, "Gap observed");
});

test("deriveGdprEprivacyCoverageChecklist demotes endpoint-only cross-border gap rows to review", () => {
  const items = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    coverageOutcomes: {
      cross_border_endpoint_review: makeCoverageOutcome({
        evidenceRefs: ["Endpoint jurisdiction rows: 3", "Transfer review signal rows: 3"],
        limitation: "Canonical cross-border endpoint finding projected.",
        retainedEvidence: {
          endpointJurisdictionRows: 3,
          transferReviewSignalRows: 3
        },
        rowId: "cross_border_endpoint_review",
        status: "Gap observed"
      })
    },
    scanCompleted: true,
    unifiedFindings: []
  });

  const row = byId(items, "cross_border_endpoint_review");
  assert.equal(row.status, "Review signal");
  assert.match(row.explanation, /Endpoint geography creates a transfer-review signal/i);
  assert.match(row.explanation, /disclosure mismatch for transfer-relevant advertising, analytics, or tag-management vendors/i);
  assert.deepEqual(row.criticalEvidence.projectedFindings, []);
});

test("deriveGdprEprivacyCoverageChecklist does not surface broad runtime vendor disclosure alignment row", () => {
  const finding = makeFinding("policy_behavior_conflict", "Policy/behavior conflict", "audit_only");
  finding.evidence = {
    ...finding.evidence,
    entities: {
      findingSubtype: ["runtime_vendor_not_disclosed"],
      runtimeVendorDisclosureEvidence: [
        JSON.stringify({
          coverageStatus: "usable",
          directVsInferred: "direct",
          matchedVendorDisclosureCount: 0,
          mismatchRationale: "Microsoft Clarity was not clearly matched in retained privacy policy evidence.",
          observedRuntimeVendors: ["Google Analytics", "Microsoft Clarity"],
          policySurfacesSearched: [
            {
              matchedVendorNames: ["Google Analytics"],
              reached: true,
              searchedTerms: ["Google Analytics", "Microsoft Clarity"],
              snippet: "We use analytics tools.",
              unmatchedVendorNames: ["Microsoft Clarity"],
              url: "https://example.test/privacy"
            }
          ],
          unmatchedRuntimeDomains: [],
          unmatchedRuntimeVendors: ["Microsoft Clarity"],
          unmatchedVendorDisclosureCount: 1
        })
      ]
    }
  };

  const items = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    scanCompleted: true,
    unifiedFindings: [finding]
  });

  assert.equal(items.some((item) => item.id === "runtime_vendor_disclosure_alignment"), false);
});

test("deriveGdprEprivacyCoverageChecklist treats missing findings as not testable when public-web coverage is limited", () => {
  const items = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: true,
    scanCompleted: true,
    unifiedFindings: []
  });

  assert.equal(byId(items, "pre_consent_cookies_storage").status, "Not testable");
  assert.match(byId(items, "pre_consent_cookies_storage").limitation ?? "", /absence of a finding/i);
  assert.equal(items.some((item) => item.id === "internal_gdpr_controls_documentation"), false);
});

test("deriveGdprEprivacyCoverageChecklist uses canonical row coverage outcomes before global coverage limits", () => {
  const items = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: true,
    coverageOutcomes: {
      consent_surface_observed: makeCoverageOutcome({
        evidenceRefs: ["Evidence: retained consent surface observation"],
        limitation: "A consent surface was retained.",
        rowId: "consent_surface_observed",
        status: "Observed"
      }),
      sensitive_surfaces_third_party_tracking: makeCoverageOutcome({
        evidenceRefs: ["Evidence: sensitive third-party tracking correlation completed"],
        limitation: "Sensitive-field correlation completed for the tested context.",
        rowId: "sensitive_surfaces_third_party_tracking",
        status: "Not observed"
      })
    },
    scanCompleted: true,
    unifiedFindings: []
  });

  assert.equal(byId(items, "consent_surface_observed").status, "Observed");
  assert.deepEqual(byId(items, "consent_surface_observed").evidenceRefs, [
    "Evidence: retained consent surface observation"
  ]);
  assert.equal(byId(items, "sensitive_surfaces_third_party_tracking").status, "Not observed");
  assert.deepEqual(byId(items, "sensitive_surfaces_third_party_tracking").evidenceRefs, [
    "Evidence: sensitive third-party tracking correlation completed"
  ]);
  assert.equal(byId(items, "pre_consent_cookies_storage").status, "Not testable");
});

test("deriveGdprEprivacyCoverageChecklist keeps unconfirmed post-reject findings behind not-testable row coverage outcomes", () => {
  const items = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: true,
    coverageOutcomes: {
      post_reject_tracking_reduction: makeCoverageOutcome({
        evidenceRefs: ["Evidence: reject interaction missing"],
        limitation: "Reject action was not confirmed.",
        rowId: "post_reject_tracking_reduction",
        status: "Not testable"
      })
    },
    scanCompleted: true,
    unifiedFindings: [
      makeFinding("reject_tracking_persists_after_reject", "Tracking continued after reject")
    ]
  });

  assert.equal(byId(items, "post_reject_tracking_reduction").status, "Not testable");
  assert.deepEqual(byId(items, "post_reject_tracking_reduction").evidenceRefs, [
    "Evidence: reject interaction missing"
  ]);
});

test("deriveGdprEprivacyCoverageChecklist renders retained post-reject persistence without concrete details as review signal", () => {
  const items = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    coverageOutcomes: {
      post_reject_tracking_reduction: makeCoverageOutcome({
        evidenceRefs: ["Evidence: post-reject tracking reduction evidence"],
        limitation:
          "A reject action and post-reject comparison window were retained, and post-reject non-essential activity was observed, but CertScore did not retain enough canonical detail to project a post-reject persistence gap.",
        retainedEvidence: {
          missingEvidenceNeeded: [
            "Eligible post-reject non-essential vendor/request/cookie details with category, URL/domain, timing, and consent state."
          ],
          postRejectNonEssentialActivityRetained: true,
          postRejectRequestRecordsObserved: true,
          postRejectWindowAvailable: true,
          projectionSuppressed: true,
          projectionSuppressionReason:
            "Eligible post-reject non-essential vendor/request/cookie details with category, URL/domain, timing, and consent state were not retained.",
          reductionEvaluationStatus: "not_reduced",
          rejectInteractionConfirmed: true
        },
        rowId: "post_reject_tracking_reduction",
        status: "Review signal"
      })
    },
    scanCompleted: true,
    unifiedFindings: []
  });
  const row = byId(items, "post_reject_tracking_reduction");

  assert.equal(row.status, "Review signal");
  assert.equal(row.assessmentStatus, "review_signal");
  assert.equal(row.evidenceState, "observed");
  assert.deepEqual(row.criticalEvidence.projectedFindings, []);
  assert.deepEqual(row.criticalEvidence.retainedEvidence.missingEvidenceNeeded, [
    "Eligible post-reject non-essential vendor/request/cookie details with category, URL/domain, timing, and consent state."
  ]);
});

test("deriveGdprEprivacyCoverageChecklist maps already-projected executive finding ids", () => {
  const items = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    coverageOutcomes: {
      pre_consent_cookies_storage: makeCoverageOutcome({
        evidenceRefs: [
          "Observed before-consent cookie/storage count: 4",
          "Evidence: hybrid runtime storage summary"
        ],
        limitation:
          "Cookie/storage inventory retained before-consent observations, but no eligible unified cookie/storage finding was projected for this row.",
        rowId: "pre_consent_cookies_storage",
        status: "Insufficient evidence"
      })
    },
    projectedFindings: [
      {
        evidencePreview: ["Cookie: _ga before consent"],
        id: "analytics_cookie_pre_consent",
        label: "Analytics cookie observed before consent"
      }
    ],
    scanCompleted: true,
    unifiedFindings: [
      makeFinding("preconsent_tracking", "Pre-consent tracking detected")
    ]
  });

  assert.equal(byId(items, "pre_consent_cookies_storage").status, "Gap observed");
  assert.deepEqual(byId(items, "pre_consent_cookies_storage").evidenceRefs, [
    "Analytics cookie observed before consent",
    "Cookie: _ga before consent"
  ]);
});

test("deriveGdprEprivacyCoverageChecklist carries pre-consent timing from coverage outcomes into projected rows", () => {
  const items = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    coverageOutcomes: {
      pre_consent_cookies_storage: makeCoverageOutcome({
        evidenceRefs: [
          "Pre-consent cookie/storage observed in initial inventory; exact observation/write time not retained",
          "Evidence: hybrid runtime storage summary"
        ],
        limitation: "Cookie/storage inventory retained before-consent observations.",
        retainedEvidence: {
          firstPreconsentCookieOrStorageObservationBasis: "initial_preconsent_cookie_inventory",
          preconsentCookieOrStorageExactTimingRetained: false,
          preconsentCookieOrStorageInitialInventoryObserved: true,
          preconsentTimingEvidence: {
            cookieOrStorage: {
              preconsentCookieOrStorageInitialInventoryObserved: true
            }
          }
        },
        rowId: "pre_consent_cookies_storage",
        status: "Not observed"
      }),
      pre_consent_third_party_tracking: makeCoverageOutcome({
        evidenceRefs: [
          "First pre-consent third-party tracking request observation: 478ms after scan start",
          "Evidence: pre-consent tracking runtime signal"
        ],
        limitation: "Pre-consent third-party tracking evidence was retained.",
        retainedEvidence: {
          firstPreconsentThirdPartyTrackingObservationBasis: "runtime_third_party_request_timing",
          firstPreconsentThirdPartyTrackingObservedMs: 478,
          preconsentThirdPartyTrackingObservedMs: [478],
          preconsentTimingEvidence: {
            thirdPartyTracking: {
              firstPreconsentThirdPartyTrackingObservedMs: 478
            }
          }
        },
        rowId: "pre_consent_third_party_tracking",
        status: "Review signal"
      })
    },
    scanCompleted: true,
    unifiedFindings: [
      makeFinding("analytics_cookie_pre_consent", "Analytics cookie observed before consent"),
      makeFinding("preconsent_tracking", "Pre-consent tracking detected")
    ]
  });

  const cookieRow = byId(items, "pre_consent_cookies_storage");
  const trackingRow = byId(items, "pre_consent_third_party_tracking");
  assert.equal(cookieRow.status, "Gap observed");
  assert.equal(cookieRow.criticalEvidence.retainedEvidence.preconsentCookieOrStorageInitialInventoryObserved, true);
  assert.match(cookieRow.evidenceRefs.join(" "), /exact observation\/write time not retained/);
  assert.equal(trackingRow.status, "Gap observed");
  assert.equal(trackingRow.criticalEvidence.retainedEvidence.firstPreconsentThirdPartyTrackingObservedMs, 478);
  assert.match(trackingRow.evidenceRefs.join(" "), /478ms after scan start/);
});

test("deriveGdprEprivacyCoverageChecklist treats support-only sensitive surface context as a review signal", () => {
  const items = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    scanCompleted: true,
    unifiedFindings: [
      makeFinding(
        "sensitive_collection_surface_observed",
        "Sensitive collection surface observed",
        "support_only",
        [
          {
            kind: "signal",
            key: "commerce.high_sensitivity_data_collection_detected",
            label: "High-sensitivity data collection detected",
            source: "document_semantic_signal"
          }
        ]
      )
    ]
  });

  const row = byId(items, "sensitive_surfaces_third_party_tracking");
  assert.equal(row.status, "Review signal");
  assert.deepEqual(row.criticalEvidence.missingOrIncompleteSourceSignals, []);
  assert.deepEqual(row.evidenceRefs, [
    "Sensitive collection surface observed",
    "Signal: High-sensitivity data collection detected",
    "Evidence flag: direct_runtime",
    "Evidence strength: direct runtime"
  ]);
});

test("deriveGdprEprivacyCoverageChecklist demotes projected sensitive tracking without retained same-context evidence", () => {
  const items = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    scanCompleted: true,
    unifiedFindings: [
      makeFinding(
        "sensitive_data_collection_with_third_party_tracking_present",
        "Sensitive collection with third-party tracking observed",
        "surface",
        [
          {
            kind: "signal",
            key: "commerce.high_sensitivity_data_collection_detected",
            label: "High-sensitivity data collection detected",
            source: "document_semantic_signal"
          }
        ]
      )
    ]
  });

  const row = byId(items, "sensitive_surfaces_third_party_tracking");
  assert.equal(row.status, "Review signal");
  assert.equal(row.assessmentStatus, "review_signal");
  assert.equal(row.evidenceState, "observed");
  assert.deepEqual(row.criticalEvidence.projectedFindings, []);
  assert.equal(row.criticalEvidence.retainedEvidence.selectedEvidenceStrength, "limited");
  assert.match(
    String(row.criticalEvidence.retainedEvidence.selectedEvidenceReason),
    /does not conclusively establish direct same-context/i
  );
  assert.match(row.criticalEvidence.statusBasis, /did not surface direct same-context sensitive-field and tracking correlation evidence/i);
});

test("deriveGdprEprivacyCoverageChecklist allows sensitive tracking gaps with retained direct same-context evidence", () => {
  const items = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    coverageOutcomes: {
      sensitive_surfaces_third_party_tracking: makeCoverageOutcome({
        evidenceRefs: ["Sensitive collection surface observed", "Runtime vendor: Example Analytics"],
        limitation: "Sensitive-field correlation projected a gap.",
        retainedEvidence: {
          correlationMethod: "direct",
          directVsInferred: "direct",
          eligibleSensitiveFieldCount: 1,
          eligibleSensitiveFieldObserved: true,
          evidenceConfidence: "moderate",
          formUrls: ["https://example.test/signup"],
          payloadExposureObserved: false,
          samePageOrFlow: true,
          sensitiveFieldTypes: ["email"],
          sensitiveValueInThirdPartyRequest: false,
          thirdPartyTrackingActiveInSameContext: true,
          thirdPartyTrackingDomains: ["analytics.example"],
          thirdPartyTrackingVendors: ["Example Analytics"],
          trackingObserved: true
        },
        rowId: "sensitive_surfaces_third_party_tracking",
        status: "Gap observed"
      })
    },
    scanCompleted: true,
    unifiedFindings: []
  });

  const row = byId(items, "sensitive_surfaces_third_party_tracking");
  assert.equal(row.status, "Gap observed");
  assert.equal(row.criticalEvidence.retainedEvidence.selectedEvidenceStrength, "strong");
  assert.deepEqual(row.criticalEvidence.projectedFindings, []);
});

test("deriveGdprEprivacyCoverageChecklist demotes sensitive gaps without eligible or same-context evidence", () => {
  const noEligibleFields = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    coverageOutcomes: {
      sensitive_surfaces_third_party_tracking: makeCoverageOutcome({
        evidenceRefs: ["Evidence: sensitive third-party tracking correlation completed"],
        limitation: "Sensitive-field correlation projected a gap.",
        retainedEvidence: {
          eligibleSensitiveFieldCount: 0,
          rawSensitiveFieldCount: 0,
          sameContext: false,
          trackingObserved: true
        },
        rowId: "sensitive_surfaces_third_party_tracking",
        status: "Gap observed"
      })
    },
    scanCompleted: true,
    unifiedFindings: []
  });
  assert.equal(byId(noEligibleFields, "sensitive_surfaces_third_party_tracking").status, "Not observed");
  assert.deepEqual(byId(noEligibleFields, "sensitive_surfaces_third_party_tracking").criticalEvidence.projectedFindings, []);

  const fallbackOnly = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    coverageOutcomes: {
      sensitive_surfaces_third_party_tracking: makeCoverageOutcome({
        evidenceRefs: ["Sensitive collection surface observed", "Runtime vendor: Example Analytics"],
        limitation: "Sensitive-field correlation projected a gap.",
        retainedEvidence: {
          eligibleSensitiveFieldCount: 1,
          fallbackOrPolicyOnly: true,
          sameContext: true,
          trackingObserved: true
        },
        rowId: "sensitive_surfaces_third_party_tracking",
        status: "Gap observed"
      })
    },
    scanCompleted: true,
    unifiedFindings: []
  });
  assert.equal(byId(fallbackOnly, "sensitive_surfaces_third_party_tracking").status, "Review signal");
  assert.match(
    byId(fallbackOnly, "sensitive_surfaces_third_party_tracking").criticalEvidence.statusBasis,
    /did not surface direct same-context sensitive-field and tracking correlation evidence/i
  );
});

test("deriveGdprEprivacyCoverageChecklist does not map general accessibility findings to consent controls", () => {
  const items = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    coverageOutcomes: {
      accessibility_consent_controls: makeCoverageOutcome({
        evidenceRefs: ["Evidence: accessibility audit context"],
        limitation:
          "Consent-control accessibility checks completed for the tested context, and no eligible accessibility finding was projected.",
        rowId: "accessibility_consent_controls",
        status: "Not observed"
      })
    },
    scanCompleted: true,
    unifiedFindings: [
      makeFinding("visual_contrast_accessibility_issue", "Visual contrast accessibility issue")
    ]
  });

  assert.equal(byId(items, "accessibility_consent_controls").status, "Not observed");
  assert.deepEqual(byId(items, "accessibility_consent_controls").evidenceRefs, [
    "Evidence: accessibility audit context"
  ]);
});

test("deriveGdprEprivacyCoverageChecklist ignores direct runtime vendor disclosure mismatch for removed alignment row", () => {
  const finding = makeFinding("policy_behavior_conflict", "Policy/behavior conflict", "audit_only");
  finding.evidence = {
    ...finding.evidence,
    entities: {
      ...finding.evidence?.entities,
      findingSubtype: ["runtime_vendor_not_disclosed"],
      runtimeVendorDisclosureEvidence: [
        JSON.stringify({
          coverageStatus: "usable",
          directVsInferred: "direct",
          evidenceConfidence: "moderate",
          matchedVendorDisclosureCount: 0,
          mismatchRationale: "Observed runtime vendor was not clearly matched by name or known domain alias in retained policy disclosure surfaces.",
          observedRuntimeDomains: ["static.cloudflareinsights.com"],
          observedRuntimeVendors: ["Cloudflare Web Analytics"],
          policySurfacesSearched: [
            {
              reached: true,
              searchedTerms: ["Cloudflare Web Analytics"],
              snippet: "Retained privacy policy snippet.",
              type: "privacy_policy",
              unmatchedVendorNames: ["Cloudflare Web Analytics"],
              url: "https://example.test/privacy"
            }
          ],
          subtype: "runtime_vendor_not_disclosed",
          unmatchedRuntimeDomains: [],
          unmatchedRuntimeVendors: ["Cloudflare Web Analytics"],
          unmatchedVendorDisclosureCount: 1
        })
      ]
    }
  };
  const items = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    scanCompleted: true,
    unifiedFindings: [finding]
  });

  assert.equal(items.some((item) => item.id === "runtime_vendor_disclosure_alignment"), false);
});

test("deriveGdprEprivacyCoverageChecklist ignores retained vendors and policy surfaces for removed alignment row", () => {
  const items = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    coverageOutcomes: {
      runtime_vendor_disclosure_alignment: makeCoverageOutcome({
        evidenceRefs: ["Runtime vendor count: 2"],
        limitation:
          "Runtime vendors and policy surfaces were retained, but no canonical vendor-disclosure comparison artifact was retained. Manual review is needed to determine disclosure alignment.",
        retainedEvidence: {
          hasPolicySurface: true,
          runtimeVendorCount: 2
        },
        rowId: "runtime_vendor_disclosure_alignment",
        status: "Review signal"
      })
    },
    scanCompleted: true,
    unifiedFindings: []
  });
  assert.equal(items.some((item) => item.id === "runtime_vendor_disclosure_alignment"), false);
});

test("deriveGdprEprivacyCoverageChecklist does not include removed vendor disclosure alignment row", () => {
  const items = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    scanCompleted: true,
    unifiedFindings: []
  });

  assert.equal(items.some((item) => item.id === "runtime_vendor_disclosure_alignment"), false);
});

test("deriveGdprEprivacyCoverageChecklist ignores runtime vendors without policy surface for removed alignment row", () => {
  const items = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    coverageOutcomes: {
      runtime_vendor_disclosure_alignment: makeCoverageOutcome({
        evidenceRefs: ["Runtime vendor count: 2"],
        limitation:
          "Runtime vendors were observed, but no privacy or cookie policy surface was retained, so disclosure alignment cannot be evaluated.",
        retainedEvidence: {
          hasPolicySurface: false,
          runtimeVendorCount: 2
        },
        rowId: "runtime_vendor_disclosure_alignment",
        status: "Not testable"
      })
    },
    scanCompleted: true,
    unifiedFindings: []
  });

  assert.equal(items.some((item) => item.id === "runtime_vendor_disclosure_alignment"), false);
});

test("deriveGdprEprivacyCoverageChecklist ignores usable matched vendor disclosure comparison for removed alignment row", () => {
  const items = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    coverageOutcomes: {
      runtime_vendor_disclosure_alignment: makeCoverageOutcome({
        evidenceRefs: ["Runtime vendor count: 2", "Disclosure comparison rows: 1"],
        limitation:
          "Runtime vendor disclosure comparison evidence was retained, and observed runtime vendors were matched in retained disclosure surfaces.",
        retainedEvidence: {
          disclosureComparisonRows: 1,
          hasPolicySurface: true,
          runtimeVendorCount: 2,
          runtimeVendorDisclosureEvidence: [
            {
              coverageStatus: "usable",
              directVsInferred: "direct",
              evidenceConfidence: "moderate",
              matchedVendorDisclosureCount: 2,
              mismatchRationale:
                "Observed runtime vendors were matched by name or known domain alias in retained policy disclosure surfaces.",
              observedRuntimeDomains: ["www.googletagmanager.com", "www.google-analytics.com"],
              observedRuntimeVendors: ["Google Tag Manager", "Google Analytics"],
              policySurfacesSearched: [
                {
                  matchedVendorNames: ["Google Tag Manager", "Google Analytics"],
                  reached: true,
                  searchedTerms: ["Google Tag Manager", "Google Analytics"],
                  snippet: "We use Google Tag Manager and Google Analytics.",
                  type: "privacy_policy",
                  unmatchedVendorNames: [],
                  url: "https://example.test/privacy"
                }
              ],
              unmatchedRuntimeDomains: [],
              unmatchedRuntimeVendors: [],
              unmatchedVendorDisclosureCount: 0
            }
          ]
        },
        rowId: "runtime_vendor_disclosure_alignment",
        status: "Observed"
      })
    },
    scanCompleted: true,
    unifiedFindings: []
  });
  assert.equal(items.some((item) => item.id === "runtime_vendor_disclosure_alignment"), false);
});

test("deriveGdprEprivacyCoverageChecklist ignores partial runtime vendor disclosure mismatch for removed alignment row", () => {
  const finding = makeFinding("policy_behavior_conflict", "Policy/behavior conflict", "audit_only");
  finding.evidence = {
    ...finding.evidence,
    entities: {
      ...finding.evidence?.entities,
      findingSubtype: ["runtime_vendor_not_disclosed"],
      runtimeVendorDisclosureEvidence: [
        JSON.stringify({
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
        })
      ]
    }
  };

  const items = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    scanCompleted: true,
    unifiedFindings: [finding]
  });

  assert.equal(items.some((item) => item.id === "runtime_vendor_disclosure_alignment"), false);
});

test("deriveGdprEprivacyCoverageChecklist carries canonical source refs into checklist evidence refs", () => {
  const items = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    scanCompleted: true,
    unifiedFindings: [
      makeFinding("preconsent_tracking", "Pre-consent tracking", "surface", [
        {
          kind: "signal",
          key: "privacy.preconsent_tracking_detected",
          label: "Pre-consent tracking detected",
          source: "snapshot_signal"
        }
      ])
    ]
  });

  assert.deepEqual(byId(items, "pre_consent_third_party_tracking").evidenceRefs, [
    "Pre-consent tracking",
    "Signal: Pre-consent tracking detected",
    "Evidence flag: direct_runtime",
    "Evidence strength: direct runtime"
  ]);
});

test("deriveGdprEprivacyCoverageChecklist retains executive evidence highlights for matching unified rows", () => {
  const items = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    projectedFindings: [
      {
        evidenceDetails: {
          vendors: [
            {
              category: "analytics",
              firstSeenMs: 482,
              name: "Cloudflare Web Analytics",
              preConsent: true,
              representativeUrl: null
            }
          ]
        },
        evidencePreview: ["Cloudflare Web Analytics fired before consent"],
        id: "pre_consent_tracking_detected",
        label: "Third-party tracking observed before recorded consent"
      }
    ],
    scanCompleted: true,
    unifiedFindings: [
      makeFinding("pre_consent_tracking_detected", "Third-party tracking observed before recorded consent")
    ]
  });

  assert.deepEqual(byId(items, "pre_consent_third_party_tracking").criticalEvidence.retainedEvidence.evidenceHighlights, [
    "Cloudflare Web Analytics fired before consent"
  ]);
});

test("deriveGdprEprivacyCoverageChecklist does not describe security and performance vendors as advertising", () => {
  const items = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    projectedFindings: [
      {
        evidenceDetails: {
          vendors: [
            {
              category: "security",
              firstSeenMs: 210,
              name: "Akamai Bot Manager / Edge",
              preConsent: true,
              representativeUrl: "https://www.mcdonalds.com/_abck"
            },
            {
              category: "performance_monitoring",
              firstSeenMs: 240,
              name: "Akamai mPulse",
              preConsent: true,
              representativeUrl: "https://c.go-mpulse.net/boomerang/config.js"
            }
          ]
        } as Record<string, unknown>,
        id: "preconsent_tracking",
        label: "Pre-consent tracking"
      }
    ],
    scanCompleted: true,
    unifiedFindings: []
  });

  const row = byId(items, "pre_consent_third_party_tracking");
  assert.match(row.explanation, /Security\/performance vendor activity was observed/i);
  assert.match(row.explanation, /Akamai Bot Manager \/ Edge/i);
  assert.match(row.explanation, /Akamai mPulse/i);
  assert.doesNotMatch(row.explanation, /Advertising and analytics|Advertising\/retargeting/i);
});

test("deriveGdprEprivacyCoverageChecklist does not let generic advertising categories override Akamai security evidence", () => {
  const items = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    projectedFindings: [
      {
        evidenceDetails: {
          vendors: [
            {
              category: "advertising",
              firstSeenMs: 1733,
              name: "Akamai Bot Manager / Edge",
              preConsent: true,
              representativeUrl: "https://www.mcdonalds.com/_abck"
            }
          ]
        } as Record<string, unknown>,
        id: "preconsent_tracking",
        label: "Pre-consent tracking"
      }
    ],
    scanCompleted: true,
    unifiedFindings: []
  });

  const row = byId(items, "pre_consent_third_party_tracking");
  assert.equal(row.label, "Pre-consent 3rd-party tracking");
  assert.equal(row.status, "Review signal");
  assert.match(row.explanation, /Security\/performance vendor activity was observed/i);
  assert.match(row.explanation, /Akamai Bot Manager \/ Edge/i);
  assert.doesNotMatch(row.explanation, /Advertising\/retargeting/i);
});

test("deriveGdprEprivacyCoverageChecklist keeps advertising phrasing when adtech evidence is retained", () => {
  const items = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    projectedFindings: [
      {
        evidenceDetails: {
          vendors: [
            {
              category: "advertising",
              firstSeenMs: 311,
              name: "Google Ads / DoubleClick",
              preConsent: true,
              representativeUrl: "https://googleads.g.doubleclick.net/pagead/id"
            },
            {
              category: "performance_monitoring",
              firstSeenMs: 330,
              name: "Akamai mPulse",
              preConsent: true,
              representativeUrl: "https://c.go-mpulse.net/boomerang/config.js"
            }
          ]
        } as Record<string, unknown>,
        id: "preconsent_tracking",
        label: "Pre-consent tracking"
      }
    ],
    scanCompleted: true,
    unifiedFindings: []
  });

  const row = byId(items, "pre_consent_third_party_tracking");
  assert.match(row.explanation, /Advertising\/retargeting or behavioral-tracking requests fired/i);
  assert.match(row.explanation, /Google Ads \/ DoubleClick/i);
});

test("deriveGdprEprivacyCoverageChecklist keeps pre-consent tracking highlights focused on timing evidence", () => {
  const items = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    projectedFindings: [
      {
        evidenceDetails: {
          vendors: [
            {
              category: "analytics",
              firstSeenMs: 311,
              name: "Google Analytics",
              preConsent: true,
              representativeUrl: null
            }
          ]
        },
        evidencePreview: ["runtime_vendor_not_disclosed should remain supporting metadata only"],
        id: "preconsent_tracking",
        label: "Pre-consent tracking"
      }
    ],
    scanCompleted: true,
    unifiedFindings: [
      makeFinding("preconsent_tracking", "Pre-consent tracking", "surface", [], {
        entities: {
          findingSubtype: ["runtime_vendor_not_disclosed"]
        }
      })
    ]
  });

  const highlights = byId(items, "pre_consent_third_party_tracking").criticalEvidence.retainedEvidence.evidenceHighlights;
  assert.deepEqual(highlights, [
    "Tracking requests observed before consent: Google Analytics; first seen 311ms after scan start.",
    "\"Google Analytics\", \"preConsent\": true, \"firstSeenMs\": 311, \"category\": \"analytics\""
  ]);
  assert.doesNotMatch(JSON.stringify(highlights), /runtime_vendor_not_disclosed|consent_governance_disclosure_gap/i);
});

test("deriveGdprEprivacyCoverageChecklist keeps pre-consent tracking entity preview focused on runtime timing evidence", () => {
  const items = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    projectedFindings: [
      {
        evidenceDetails: {
          vendors: [
            {
              category: "tag_manager",
              firstSeenMs: 787,
              name: "Google Tag Manager",
              preConsent: true,
              representativeUrl: "https://www.googletagmanager.com/gtag/js?id=G-123"
            }
          ]
        },
        id: "preconsent_tracking",
        label: "Pre-consent tracking"
      }
    ],
    scanCompleted: true,
    unifiedFindings: [
      makeFinding("preconsent_tracking", "Pre-consent tracking", "surface", [], {
        entities: {
          consentGovernanceDisclosureEvidence: ["{\"concernId\":\"consent_governance_disclosure_gap\"}"],
          findingSubtype: ["runtime_vendor_not_disclosed"],
          runtimeVendors: ["Google Tag Manager"]
        },
        flags: [
          "direct_runtime",
          "contradiction_runtime_artifact_retained",
          "privacy.preconsent_tracking_detected"
        ]
      })
    ]
  });

  const row = byId(items, "pre_consent_third_party_tracking");
  assert.match(row.criticalEvidence.statusBasis, /pre-consent request\/vendor timing evidence/i);
  const packet = JSON.stringify(row.criticalEvidence.retainedEvidence.findingEntities);
  assert.match(packet, /Google Tag Manager/);
  assert.doesNotMatch(packet, /runtime_vendor_not_disclosed|consent_governance_disclosure_gap|consentGovernanceDisclosureEvidence/i);
});

test("deriveGdprEprivacyCoverageChecklist does not display epoch timestamps as firstSeenMs", () => {
  const items = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    projectedFindings: [
      {
        evidenceDetails: {
          vendors: [
            {
              category: "tag_manager",
              firstSeenMs: null,
              name: "Google Tag Manager",
              preConsent: true,
              representativeUrl: "https://www.googletagmanager.com/gtag/js?id=G-123",
              timestampMs: 1780863330295
            } as { name: string; category: string | null; preConsent: boolean; representativeUrl: string | null; firstSeenMs: number | null } & Record<string, unknown>,
            {
              category: "session_replay",
              firstSeenMs: null,
              name: "Contentsquare",
              preConsent: true,
              representativeUrl: "https://t.contentsquare.net/uxa/site.js",
              timestampMs: 1780863330295
            } as { name: string; category: string | null; preConsent: boolean; representativeUrl: string | null; firstSeenMs: number | null } & Record<string, unknown>
          ]
        },
        id: "preconsent_tracking",
        label: "Pre-consent tracking"
      }
    ],
    scanCompleted: true,
    unifiedFindings: [
      makeFinding("preconsent_tracking", "Pre-consent tracking")
    ]
  });

  const highlights = byId(items, "pre_consent_third_party_tracking").criticalEvidence.retainedEvidence.evidenceHighlights;
  assert.deepEqual(highlights, [
    "Tracking requests observed before consent: Google Tag Manager and Contentsquare.",
    "\"Google Tag Manager\", \"preConsent\": true, \"category\": \"tag_manager\"",
    "\"Contentsquare\", \"preConsent\": true, \"category\": \"session_replay\""
  ]);
  assert.doesNotMatch(JSON.stringify(highlights), /1780863330295/);
});

test("deriveGdprEprivacyCoverageChecklist keeps session replay packet focused on runtime vendor evidence", () => {
  const outcome = makeCoverageOutcome({
    evidenceRefs: ["Session replay before consent observed"],
    limitation: "Session replay or behavioral analytics runtime evidence was retained before a recorded consent action.",
    rowId: "session_replay_fingerprinting_review",
    status: "Gap observed"
  });
  outcome.criticalEvidence.retainedEvidence = {
    ...outcome.criticalEvidence.retainedEvidence,
    sessionReplayEvidence: {
      preConsentObserved: true,
      vendors: ["Contentsquare"]
    }
  };

  const items = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    coverageOutcomes: {
      session_replay_fingerprinting_review: outcome
    },
    projectedFindings: [
      {
        evidenceDetails: {
          vendors: [
            {
              category: "session_replay",
              firstSeenMs: 787,
              name: "Contentsquare",
              preConsent: true,
              representativeUrl: "https://t.contentsquare.net/uxa/site.js"
            }
          ]
        },
        id: "session_replay_observed",
        label: "Session replay observed"
      }
    ],
    scanCompleted: true,
    unifiedFindings: [
      makeFinding("session_replay_observed", "Session replay observed", "surface", [], {
        entities: {
          consentGovernanceDisclosureEvidence: ["{\"concernId\":\"consent_governance_disclosure_gap\"}"],
          findingSubtype: ["consent_governance_disclosure_gap"],
          observedTrackingVendors: ["Contentsquare"],
          runtimeVendors: ["Contentsquare"],
          session_replay_runtime_vendors: ["Contentsquare"]
        },
        flags: [
          "contradiction_runtime_artifact_retained",
          "commerce.session_replay_tool_detected",
          "privacy.session_replay_runtime_detected"
        ]
      })
    ]
  });

  const row = byId(items, "session_replay_fingerprinting_review");
  assert.equal(row.status, "Gap observed");
  assert.match(row.criticalEvidence.statusBasis, /Session replay or behavioral analytics runtime evidence was retained/i);
  assert.match(row.criticalEvidence.statusBasis, /Contentsquare/i);
  const packet = JSON.stringify(row.criticalEvidence.retainedEvidence.findingEntities);
  assert.match(packet, /Contentsquare/);
  assert.doesNotMatch(packet, /contradiction_runtime_artifact_retained|consent_governance_disclosure_gap|consentGovernanceDisclosureEvidence|findingSubtype/i);
});

test("deriveGdprEprivacyCoverageChecklist normalizes pre-consent tracking vendor categories", () => {
  const items = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    projectedFindings: [
      {
        evidenceDetails: {
          vendors: [
            {
              category: "analytics",
              firstSeenMs: 906,
              name: "Microsoft Clarity",
              preConsent: true,
              representativeUrl: "https://www.clarity.ms/tag/abc"
            },
            {
              category: "session_replay",
              firstSeenMs: 120,
              name: "Google Analytics",
              preConsent: true,
              representativeUrl: "https://www.google-analytics.com/g/collect"
            },
            {
              category: "analytics",
              firstSeenMs: 90,
              name: "Google Tag Manager",
              preConsent: true,
              representativeUrl: "https://www.googletagmanager.com/gtm.js?id=GTM-123"
            }
          ]
        },
        id: "preconsent_tracking",
        label: "Pre-consent tracking"
      }
    ],
    scanCompleted: true,
    unifiedFindings: [
      makeFinding("preconsent_tracking", "Pre-consent tracking")
    ]
  });

  const highlights = byId(items, "pre_consent_third_party_tracking").criticalEvidence.retainedEvidence.evidenceHighlights;
  assert.deepEqual(highlights, [
    "Tracking requests observed before consent: Microsoft Clarity, Google Analytics, and Google Tag Manager; first seen 906ms after scan start.",
    "\"Microsoft Clarity\", \"preConsent\": true, \"firstSeenMs\": 906, \"category\": \"session_replay\"",
    "\"Google Analytics\", \"preConsent\": true, \"firstSeenMs\": 120, \"category\": \"analytics\""
  ]);
});

test("deriveGdprEprivacyCoverageChecklist prefers pre-consent cookie evidence for cookie storage rows", () => {
  const items = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    projectedFindings: [
      {
        evidenceDetails: {
          cookieEvidence: {
            cookies: [
              {
                category: "analytics",
                cookieName: "_ga",
                domain: ".grammarly.com",
                firstSeenMs: 412,
                preConsent: true
              },
              {
                category: "analytics",
                cookieName: "_ga_after",
                domain: ".grammarly.com",
                firstSeenMs: 4412,
                preConsent: false
              }
            ]
          }
        },
        id: "analytics_cookie_pre_consent",
        label: "Analytics cookie observed before consent"
      }
    ],
    scanCompleted: true,
    unifiedFindings: []
  });

  const highlights = byId(items, "pre_consent_cookies_storage").criticalEvidence.retainedEvidence.evidenceHighlights;
  assert.equal(
    byId(items, "pre_consent_cookies_storage").criticalEvidence.retainedEvidence.selectedEvidenceArtifactId,
    "preConsentCookieOrStorageEvidence.concreteStorageArtifacts"
  );
  assert.doesNotMatch(
    String(byId(items, "pre_consent_cookies_storage").criticalEvidence.retainedEvidence.selectedEvidenceArtifactId),
    /missing/i
  );
  assert.deepEqual(highlights, [
    "Storage observed before consent: Google Analytics on .grammarly.com.",
    "\"Google Analytics\", \"preConsent\": true, \"firstSeenMs\": 412, \"category\": \"analytics\", \"domain\": \".grammarly.com\""
  ]);
  assert.doesNotMatch(JSON.stringify(highlights), /preConsent": false|_ga_after/);
});

test("deriveGdprEprivacyCoverageChecklist shows setAtMs timing for pre-consent cookie storage evidence", () => {
  const items = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    projectedFindings: [
      {
        evidenceDetails: {
          cookieEvidence: {
            cookieWriteEvidence: [
              {
                category: "analytics",
                cookieName: "_ga",
                domain: ".caltech.edu",
                preConsent: true,
                setAtMs: 928,
                vendor: "Google Analytics"
              }
            ]
          }
        },
        id: "analytics_cookie_pre_consent",
        label: "Analytics cookies before consent"
      }
    ],
    scanCompleted: true,
    unifiedFindings: []
  });

  const highlights = byId(items, "pre_consent_cookies_storage").criticalEvidence.retainedEvidence.evidenceHighlights;
  assert.deepEqual(highlights, [
    "Storage observed before consent: Google Analytics on .caltech.edu.",
    "\"Google Analytics\", \"preConsent\": true, \"firstSeenMs\": 928, \"category\": \"analytics\", \"domain\": \".caltech.edu\""
  ]);
});

test("deriveGdprEprivacyCoverageChecklist keeps adtech vendor categories out of analytics and tag-manager buckets", () => {
  const items = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    projectedFindings: [
      {
        evidenceDetails: {
          vendors: [
            {
              category: "analytics",
              firstSeenMs: null,
              name: "AppNexus / Xandr",
              preConsent: true,
              representativeUrl: "https://ib.adnxs.com/getuid"
            },
            {
              category: "tag_manager",
              firstSeenMs: null,
              name: "DoubleClick",
              preConsent: true,
              representativeUrl: "https://googleads.g.doubleclick.net/pagead/id"
            },
            {
              category: "tag_manager",
              firstSeenMs: null,
              name: "Google Ads",
              preConsent: true,
              representativeUrl: "https://www.googleadservices.com/pagead/conversion"
            }
          ]
        },
        id: "preconsent_tracking",
        label: "Pre-consent tracking"
      }
    ],
    scanCompleted: true,
    unifiedFindings: []
  });

  const renderedHighlights = JSON.stringify(
    byId(items, "pre_consent_third_party_tracking").criticalEvidence.retainedEvidence.evidenceHighlights
  );
  assert.match(renderedHighlights, /AppNexus \/ Xandr.*advertising/);
  assert.match(renderedHighlights, /DoubleClick.*advertising_measurement/);
  assert.match(renderedHighlights, /Google Ads.*advertising_measurement/);
  assert.doesNotMatch(renderedHighlights, /AppNexus \/ Xandr.*analytics/);
  assert.doesNotMatch(renderedHighlights, /DoubleClick.*tag_manager/);
  assert.doesNotMatch(renderedHighlights, /Google Ads.*tag_manager/);
});

test("deriveGdprEprivacyCoverageChecklist leads cross-border highlights with transfer-relevant vendors", () => {
  const items = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    projectedFindings: [
      {
        evidencePreview: ["cdnjs.cloudflare.com", "fonts.gstatic.com"],
        id: "cross_border_vendor_disclosure_gap",
        label: "Cross-border vendor disclosure gap"
      }
    ],
    scanCompleted: true,
    unifiedFindings: [
      makeFinding("cross_border_vendor_disclosure_gap", "Cross-border vendor disclosure gap", "surface", [], {
        entities: {
          crossBorderDisclosureGapBasis: ["transfer_endpoint_runtime_vendor_not_disclosed"],
          endpointJurisdictionEvidence: [
            JSON.stringify({
              host: "www.googletagmanager.com",
              matchedVendorName: "Google Tag Manager"
            }),
            JSON.stringify({
              host: "www.google-analytics.com",
              matchedVendorName: "Google Analytics"
            }),
            JSON.stringify({
              host: "www.clarity.ms",
              matchedVendorName: "Microsoft Clarity"
            }),
            JSON.stringify({
              host: "cdnjs.cloudflare.com",
              matchedVendorName: "Cloudflare CDN"
            })
          ],
          endpointTransferReviewHosts: ["cdnjs.cloudflare.com", "fonts.gstatic.com"],
          endpointTransferReviewVendors: ["Google Tag Manager", "Google Analytics", "Microsoft Clarity", "Cloudflare CDN"],
          runtimeVendorDisclosureEvidence: ["{}"]
        }
      })
    ]
  });

  const highlights = byId(items, "cross_border_endpoint_review").criticalEvidence.retainedEvidence.evidenceHighlights;
  assert.deepEqual(highlights, [
    "Transfer-relevant advertising, analytics, or behavioral tracking endpoints were observed for Google Tag Manager, Google Analytics, and Microsoft Clarity. Additional third-party asset endpoints were retained as supporting runtime context."
  ]);
  assert.doesNotMatch(highlights.join(" "), /cdnjs|fonts\.gstatic/i);
});

test("deriveGdprEprivacyCoverageChecklist ignores non-array entity previews in evidence packets", () => {
  const finding = makeFinding("preconsent_tracking", "Pre-consent tracking");
  finding.evidence = {
    ...finding.evidence,
    entities: {
      runtimeRequestUrls: ["https://tracker.example/pixel"],
      runtimeVendorDisclosureEvidence: { retained: true } as unknown as string[]
    }
  };
  const items = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    scanCompleted: true,
    unifiedFindings: [finding]
  });

  assert.deepEqual(
    byId(items, "pre_consent_third_party_tracking").criticalEvidence.retainedEvidence.findingEntities,
    [
      {
        id: "preconsent_tracking",
        entities: {
          runtimeRequestUrls: ["https://tracker.example/pixel"]
        },
        evidenceFlags: ["direct_runtime"],
        sourceRefs: []
      }
    ]
  );
});

test("deriveGdprEprivacyReviewSummary composes simple-cookie-notice reject persistence story from canonical row evidence", () => {
  const preConsentFinding = makeFinding("preconsent_tracking", "Pre-consent tracking detected");
  preConsentFinding.evidence = {
    ...preConsentFinding.evidence,
    flags: ["direct_runtime"],
    entities: {
      runtimeVendors: ["Google Analytics", "Google Tag Manager", "Microsoft Clarity"]
    }
  };

  const postRejectFinding = makeFinding("reject_tracking_persists_after_reject", "Tracking persisted after reject");
  postRejectFinding.evidence = {
    ...postRejectFinding.evidence,
    flags: ["direct_runtime", "reject_did_not_reduce_tracking", "nonessential_vendor_persisted_after_reject", "reject_evidence_confirmed"],
    entities: {
      postRejectTrackingReductionEvidence: [
        JSON.stringify({
          postRejectWindowAvailable: true,
          rejectInteractionConfirmed: true
        })
      ],
      runtimeVendors: ["Google Analytics", "Microsoft Clarity"]
    }
  };

  const vendorDisclosureFinding = makeFinding("policy_behavior_conflict", "Policy/behavior conflict", "audit_only");
  vendorDisclosureFinding.evidence = {
    ...vendorDisclosureFinding.evidence,
    flags: ["direct_runtime", "contradiction_runtime_artifact_retained"],
    entities: {
      findingSubtype: ["runtime_vendor_not_disclosed"],
      runtimeVendorDisclosureEvidence: [
        JSON.stringify({
          coverageStatus: "usable",
          unmatchedRuntimeVendors: ["Google Analytics", "Google Tag Manager", "Microsoft Clarity"]
        })
      ],
      unmatchedRuntimeVendors: ["Google Analytics", "Google Tag Manager", "Microsoft Clarity"]
    }
  };

  const sessionReplayFinding = makeFinding("session_recording_services_detected", "Session replay observed");
  sessionReplayFinding.evidence = {
    ...sessionReplayFinding.evidence,
    flags: ["direct_runtime", "privacy.session_replay_runtime_vendors"],
    entities: {
      session_replay_runtime_vendors: ["Microsoft Clarity"]
    }
  };

  const items = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    coverageOutcomes: {
      consent_surface_observed: makeCoverageOutcome({
        evidenceRefs: ["Evidence: retained consent surface observation"],
        limitation: "A consent surface or first-layer consent controls were retained in the tested context.",
        rowId: "consent_surface_observed",
        status: "Observed"
      }),
      reject_all_path_availability: makeCoverageOutcome({
        evidenceRefs: ["Evidence: reject path depth and availability", "Reject click depth: 1"],
        limitation: "A reject or equivalent refusal path was retained in the tested consent surface.",
        rowId: "reject_all_path_availability",
        status: "Observed"
      }),
      preference_withdrawal_control: makeCoverageOutcome({
        evidenceRefs: ["Evidence: consent control lifecycle"],
        limitation:
          "CertScore observed an initial consent surface, but did not observe an obvious cookie preferences, privacy settings, or consent-preference reopen control on the tested public pages. Review whether users can later change or withdraw consent through another path.",
        rowId: "preference_withdrawal_control",
        status: "Gap observed"
      }),
      sensitive_surfaces_third_party_tracking: makeCoverageOutcome({
        evidenceRefs: ["Evidence: sensitive third-party tracking correlation completed"],
        limitation: "Sensitive-field correlation completed for the tested context and did not retain eligible sensitive fields alongside third-party tracking.",
        rowId: "sensitive_surfaces_third_party_tracking",
        status: "Not observed"
      })
    },
    scanCompleted: true,
    unifiedFindings: [
      preConsentFinding,
      postRejectFinding,
      vendorDisclosureFinding,
      sessionReplayFinding
    ]
  });
  const rejectPath = byId(items, "reject_all_path_availability");
  rejectPath.criticalEvidence.retainedEvidence = {
    ...rejectPath.criticalEvidence.retainedEvidence,
    completeRejectPathAvailable: true,
    rejectClickDepth: 1,
    rejectInteractionSucceeded: true
  };
  const preference = byId(items, "preference_withdrawal_control");
  preference.criticalEvidence.retainedEvidence = {
    ...preference.criticalEvidence.retainedEvidence,
    cmpReopenControlObserved: false,
    coverageStatus: "usable",
    preferenceCenterReachableAfterInitialLayer: false
  };
  const sensitive = byId(items, "sensitive_surfaces_third_party_tracking");
  sensitive.criticalEvidence.retainedEvidence = {
    ...sensitive.criticalEvidence.retainedEvidence,
    eligibleSensitiveFieldCount: 0,
    sensitiveThirdPartyTrackingCorrelationStatus: "ok"
  };

  const summary = deriveGdprEprivacyReviewSummary(items);
  const renderedSummary = JSON.stringify(summary);

  assert.equal(summary.bullets[0]?.headline, "Third-party tracking observed before recorded consent");
  assert.match(renderedSummary, /Third-party tracking observed before recorded consent/);
  assert.match(renderedSummary, /Google Analytics/);
  assert.match(renderedSummary, /Google Tag Manager/);
  assert.match(renderedSummary, /Microsoft Clarity/);
  assert.match(renderedSummary, /Post-choice consent controls may be hard to revisit/);
  assert.doesNotMatch(renderedSummary, /violates GDPR|legal violation/i);
  assert.doesNotMatch(renderedSummary, /sensitive-surface tracking/i);
  assert.doesNotMatch(renderedSummary, /cookies before consent/i);
  assert.doesNotMatch(renderedSummary, /\bWS01\b|\bWC01\b/);
  assert.equal(
    summary.bullets.filter((bullet) => bullet.id === "post_choice_controls_hard_to_revisit").length,
    1
  );
});

test("deriveGdprEprivacyReviewSummary separates partial concerns from review signals", () => {
  const items = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    coverageOutcomes: {
      pre_consent_third_party_tracking: makeCoverageOutcome({
        evidenceRefs: ["Evidence: pre-consent tracking"],
        limitation: "Pre-consent third-party tracking was retained.",
        rowId: "pre_consent_third_party_tracking",
        status: "Gap observed"
      }),
      advertising_retargeting_vendor_signal_observed: makeCoverageOutcome({
        evidenceRefs: ["Evidence: advertising vendor"],
        limitation: "Advertising infrastructure evidence was retained.",
        rowId: "advertising_retargeting_vendor_signal_observed",
        status: "Review signal",
        retainedEvidence: {
          advertisingVendorCount: 1,
          advertisingVendors: ["Google IMA"]
        }
      }),
      retargeting_behavioral_advertising_signal_observed: makeCoverageOutcome({
        evidenceRefs: ["Evidence: retargeting vendor"],
        limitation: "Retargeting evidence was retained.",
        rowId: "retargeting_behavioral_advertising_signal_observed",
        status: "Review signal",
        retainedEvidence: {
          retargetingBehavioralAdvertisingVendorCount: 1,
          retargetingBehavioralAdvertisingVendors: ["Meta Pixel"]
        }
      }),
      reject_all_path_availability: makeCoverageOutcome({
        evidenceRefs: ["Evidence: consent banner without reject"],
        limitation: "Consent surface observed, but structured reject evidence was not retained.",
        rowId: "reject_all_path_availability",
        status: "Not observed",
        retainedEvidence: {
          consentSurfaceObserved: true,
          preconsentCookieOrTrackingActivityObserved: true,
          rejectAvailableOnFirstLayer: false
        }
      }),
      session_replay_fingerprinting_review: makeCoverageOutcome({
        evidenceRefs: ["Evidence: session replay"],
        limitation: "Session replay was observed during the scan.",
        rowId: "session_replay_fingerprinting_review",
        status: "Observed",
        retainedEvidence: {
          sessionReplayEvidence: {
            firstSeenMs: 5276,
            preConsentObserved: false,
            vendors: ["Hotjar"]
          }
        }
      }),
      consent_choice_quality: makeCoverageOutcome({
        evidenceRefs: ["Evidence: consent quality"],
        limitation: "Consent choice quality requires review.",
        rowId: "consent_choice_quality",
        status: "Review signal"
      })
    },
    scanCompleted: true,
    unifiedFindings: []
  });

  const summary = deriveGdprEprivacyReviewSummary(items);

  assert.equal(summary.priorityReviewText, "1 gap observed, 4 partial concerns, 1 review signal.");
});

test("deriveGdprEprivacyReviewSummary reports thin privacy policy text as a technical limit", () => {
  const items = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    coverageOutcomes: {
      privacy_notice_availability: makeCoverageOutcome({
        evidenceRefs: ["Evidence: privacy-policy URL retained"],
        limitation: "A privacy-policy surface was retained.",
        retainedEvidence: {
          policyTextExtractionHealth: {
            extractedTextLength: 842,
            minimumTextLengthRequired: 2500,
            policySurfaceObserved: true,
            policyTextExtractionStatus: "thin",
            policyUrlRetained: true
          }
        },
        rowId: "privacy_notice_availability",
        status: "Observed"
      }),
      policy_text_extraction: makeCoverageOutcome({
        evidenceRefs: ["Evidence: privacy-policy text extraction limited"],
        limitation:
          "GDPR Transparency disclosure checks were limited because CertScore found a privacy-policy surface but did not extract enough usable policy text to evaluate individual Article 13 disclosures.",
        retainedEvidence: {
          policyTextExtractionHealth: {
            extractedTextLength: 842,
            minimumTextLengthRequired: 2500,
            policySurfaceObserved: true,
            policyTextExtractionStatus: "thin",
            policyUrlRetained: true
          }
        },
        rowId: "policy_text_extraction",
        status: "Not testable"
      }),
      legal_basis_disclosure_observed: makeCoverageOutcome({
        evidenceRefs: ["Evidence: privacy-policy text extraction limited"],
        limitation:
          "A privacy-policy surface was found, but CertScore did not extract enough usable policy text to confirm this disclosure from retained evidence.",
        retainedEvidence: {
          policyTextExtractionHealth: {
            extractedTextLength: 842,
            minimumTextLengthRequired: 2500,
            policySurfaceObserved: true,
            policyTextExtractionStatus: "thin",
            policyUrlRetained: true
          },
          signalObserved: "not_confirmed_extraction_limited"
        },
        rowId: "legal_basis_disclosure_observed",
        status: "Not confirmed"
      })
    },
    scanCompleted: true,
    unifiedFindings: []
  });

  const summary = deriveGdprEprivacyReviewSummary(items);
  const renderedSummary = JSON.stringify(summary);

  assert.match(renderedSummary, /Policy text extraction limited transparency review/);
  assert.match(renderedSummary, /did not extract enough usable policy text/);
  assert.match(summary.coverageText, /technical limit/);
  assert.doesNotMatch(summary.priorityReviewText, /partial concern/);
  assert.doesNotMatch(renderedSummary, /legal violation|violates GDPR/i);
});
