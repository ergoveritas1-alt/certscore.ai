import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveGdprEprivacyCoverageChecklist,
  type GdprEprivacyCoverageChecklistItem
} from "./gdpr-eprivacy-coverage-checklist";
import type { GdprEprivacyCoverageOutcome } from "./gdpr-eprivacy-coverage-policy";
import { deriveGdprEprivacyReviewSummary } from "./gdpr-eprivacy-review-summary";
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
  outcome: Omit<GdprEprivacyCoverageOutcome, "criticalEvidence">
): GdprEprivacyCoverageOutcome {
  return {
    ...outcome,
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
        evidenceRefs: outcome.evidenceRefs
      },
      statusBasis: outcome.limitation
    }
  };
}

test("deriveGdprEprivacyCoverageChecklist maps canonical unified findings without creating pass/fail language", () => {
  const items = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    scanCompleted: true,
    unifiedFindings: [
      makeFinding("third_party_cookie_pre_consent", "Third-party cookie before consent"),
      makeFinding("reject_tracking_persists_after_reject", "Tracking continued after reject")
    ]
  });

  assert.equal(byId(items, "pre_consent_cookies_storage").status, "Gap observed");
  assert.deepEqual(byId(items, "pre_consent_cookies_storage").evidenceRefs, [
    "Third-party cookie before consent",
    "Evidence flag: direct_runtime",
    "Evidence strength: direct runtime"
  ]);
  assert.equal(byId(items, "post_reject_tracking_reduction").status, "Gap observed");
  assert.equal(byId(items, "pre_consent_third_party_tracking").status, "Not observed");
  assert.equal(items.some((item) => ["Pass", "Fail"].includes(String(item.status))), false);
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
          runtimeVendorDisclosureEvidence: ["{}"]
        }
      })
    ]
  });

  assert.equal(byId(vendorGapItems, "cross_border_endpoint_review").status, "Gap observed");
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
          runtimeVendorDisclosureEvidence: ["{}"]
        }
      })
    ]
  });

  assert.equal(byId(linkedItems, "cross_border_endpoint_review").status, "Gap observed");
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

test("deriveGdprEprivacyCoverageChecklist keeps projected findings ahead of row coverage outcomes", () => {
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

  assert.equal(byId(items, "post_reject_tracking_reduction").status, "Gap observed");
  assert.deepEqual(byId(items, "post_reject_tracking_reduction").evidenceRefs, [
    "Tracking continued after reject",
    "Evidence flag: direct_runtime",
    "Evidence strength: direct runtime"
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

test("deriveGdprEprivacyCoverageChecklist marks audit-only projected context as insufficient evidence", () => {
  const items = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    scanCompleted: true,
    unifiedFindings: [
      makeFinding("missing_technical_disclosure", "Technical disclosure missing", "audit_only")
    ]
  });

  assert.equal(byId(items, "runtime_vendor_disclosure_alignment").status, "Insufficient evidence");
  assert.deepEqual(byId(items, "runtime_vendor_disclosure_alignment").evidenceRefs, [
    "Technical disclosure missing",
    "Evidence flag: direct_runtime",
    "Evidence strength: direct runtime"
  ]);
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

test("deriveGdprEprivacyCoverageChecklist treats sensitive collection with third-party tracking as a gap", () => {
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
  assert.equal(row.status, "Gap observed");
  assert.deepEqual(row.criticalEvidence.missingOrIncompleteSourceSignals, []);
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

test("deriveGdprEprivacyCoverageChecklist treats direct runtime vendor disclosure mismatch as a gap", () => {
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

  assert.equal(byId(items, "runtime_vendor_disclosure_alignment").status, "Gap observed");
  assert.deepEqual(
    byId(items, "runtime_vendor_disclosure_alignment").criticalEvidence.missingOrIncompleteSourceSignals,
    []
  );
});

test("deriveGdprEprivacyCoverageChecklist treats partial runtime vendor disclosure mismatch as a gap", () => {
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

  assert.equal(byId(items, "runtime_vendor_disclosure_alignment").status, "Gap observed");
  assert.deepEqual(
    byId(items, "runtime_vendor_disclosure_alignment").criticalEvidence.missingOrIncompleteSourceSignals,
    []
  );
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
    "\"Cloudflare Web Analytics\", \"preConsent\": true, \"firstSeenMs\": 482"
  ]);
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

test("deriveGdprEprivacyReviewSummary composes gatech-style reject persistence story from canonical row evidence", () => {
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
    flags: ["direct_runtime", "reject_did_not_reduce_tracking", "nonessential_vendor_persisted_after_reject"],
    entities: {
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

  assert.equal(summary.bullets[0]?.headline, "Reject path observed, but tracking persisted around refusal");
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
