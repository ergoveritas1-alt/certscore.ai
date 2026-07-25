import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  GdprEprivacyCoverageChecklistCard,
  GdprEprivacyCoverageSummaryPills,
  getGdprEprivacyCoverageChecklistRowRationaleForAudit,
  gdprPolicyExcerptPageTestHelpers
} from "./gdpr-eprivacy-coverage-checklist-card";
import { getAssessmentDirection, getEvidenceLabel } from "../../lib/scans/gdpr-eprivacy-assessment-direction";
import type { GdprEprivacyCoverageChecklistItem } from "../../lib/scans/gdpr-eprivacy-coverage-checklist";

test("GDPR Transparency grouping includes every emitted Article 13 checklist row", () => {
  const source = readFileSync(new URL("./gdpr-eprivacy-coverage-checklist-card.tsx", import.meta.url), "utf8");
  assert.match(source, /title: "GDPR Transparency"[\s\S]*automated_decision_making_profiling_disclosure/);
});

test("getEvidenceLabel keeps insufficient evidence distinct from missing test coverage", () => {
  const partialEvidence = makeChecklistItem({
    assessmentStatus: "coverage_limitation",
    evidenceState: "observed",
    status: "Insufficient evidence"
  });
  const missingCoverage = makeChecklistItem({
    assessmentStatus: "coverage_limitation",
    evidenceState: "not_testable",
    status: "Not testable"
  });

  assert.equal(getEvidenceLabel(partialEvidence), "Not confirmed");
  assert.equal(getEvidenceLabel(missingCoverage), "Not testable");
});

function makeSessionReplayItem(): GdprEprivacyCoverageChecklistItem {
  return {
    assessmentStatus: "review_signal",
    criticalEvidence: {
      missingOrIncompleteSourceSignals: [],
      pipeline: {
        concernPolicyKey: "gdpr_eprivacy_coverage.session_replay_fingerprinting_review.review_signal",
        projectionStage: "coverage_policy",
        wc01NormalizedConcernKey: "gdpr_eprivacy.coverage.session_replay_fingerprinting_review",
        ws01EvidenceRole: "observed runtime signal identification, evidence capture, and logging"
      },
      projectedFindings: [
        {
          id: "session_replay_observed",
          label: "Session replay / behavioral analytics observed",
          severity: "medium"
        }
      ],
      retainedEvidence: {
        sessionReplayEvidence: {
          preConsentObserved: false,
          vendors: ["Microsoft Clarity", "Hotjar", "Contentsquare"]
        },
        status: "Review signal"
      },
      statusBasis: "Canonical session replay evidence was retained without pre-consent timing."
    },
    evidenceRefs: [
      "Runtime vendor: Microsoft Clarity",
      "Runtime vendor: Hotjar",
      "Runtime vendor: Contentsquare"
    ],
    evidenceState: "observed",
    explanation:
      "CertScore observed session replay or behavioral analytics vendors not observed pre-consent in retained evidence, including Microsoft Clarity, Hotjar, and Contentsquare. Because these tools can capture user interaction behavior, review consent timing, disclosure, masking/exclusion settings, sensitive-page coverage, and withdrawal controls.",
    id: "session_replay_fingerprinting_review",
    label: "Session replay / behavioral analytics",
    note:
      "CertScore observed session replay or behavioral analytics vendors not observed pre-consent in retained evidence, including Microsoft Clarity, Hotjar, and Contentsquare. Because these tools can capture user interaction behavior, review consent timing, disclosure, masking/exclusion settings, sensitive-page coverage, and withdrawal controls.",
    status: "Review signal",
    subchecks: [
      {
        assessmentStatus: "gap_observed",
        evidenceRefs: ["https://www.clarity.ms/tag/example"],
        evidenceState: "observed",
        id: "session_replay_before_consent",
        label: "Before consent",
        note: "Session replay collection was retained before a recorded consent action.",
        status: "Gap observed"
      },
      {
        assessmentStatus: "coverage_limitation",
        evidenceRefs: [],
        evidenceState: "not_testable",
        id: "session_replay_disclosure_alignment",
        label: "Disclosure alignment",
        note: "Disclosure comparison evidence was not available for this scan context.",
        status: "Not testable"
      }
    ],
    tone: "review"
  };
}

type ChecklistItemOverride = Partial<Omit<GdprEprivacyCoverageChecklistItem, "criticalEvidence">> & {
  criticalEvidence?: Partial<GdprEprivacyCoverageChecklistItem["criticalEvidence"]> & {
    retainedEvidence?: Record<string, unknown>;
  };
};

function makeChecklistItem(overrides: ChecklistItemOverride): GdprEprivacyCoverageChecklistItem {
  const { criticalEvidence: criticalEvidenceOverride, ...itemOverrides } = overrides;
  const id = overrides.id ?? "accessibility_consent_controls";
  const label = overrides.label ?? "Accessibility of consent controls";
  const status = overrides.status ?? "Not observed";
  const assessmentStatus = overrides.assessmentStatus ?? "checked";
  return {
    assessmentStatus,
    criticalEvidence: {
      missingOrIncompleteSourceSignals: [],
      pipeline: {
        concernPolicyKey: `gdpr_eprivacy_coverage.${id}.${assessmentStatus}`,
        projectionStage: "coverage_policy",
        wc01NormalizedConcernKey: `gdpr_eprivacy.coverage.${id}`,
        ws01EvidenceRole: "observed runtime signal identification, evidence capture, and logging"
      },
      projectedFindings: [],
      retainedEvidence: {
        status,
        ...(criticalEvidenceOverride?.retainedEvidence ?? {})
      },
      statusBasis: "Test row basis",
      ...(criticalEvidenceOverride ?? {})
    },
    evidenceRefs: [],
    evidenceState: overrides.evidenceState ?? "not_observed",
    explanation: overrides.explanation ?? "Test row explanation.",
    id,
    label,
    note: overrides.note ?? "Test row note.",
    status,
    tone: overrides.tone ?? "neutral",
    ...itemOverrides
  };
}

test("GdprEprivacyCoverageChecklistCard separates evidence labels from assessment direction", () => {
  assert.equal(
    getAssessmentDirection(makeChecklistItem({
      assessmentStatus: "checked",
      evidenceState: "observed",
      id: "cmp_framework_signal_observed",
      label: "CMP / consent-management signal",
      status: "Observed"
    })),
    "neutral_signal"
  );
  assert.equal(
    getAssessmentDirection(makeChecklistItem({
      assessmentStatus: "review_signal",
      evidenceState: "observed",
      id: "analytics_vendor_observed",
      label: "Analytics vendor signal",
      status: "Review signal"
    })),
    "review_signal"
  );
  assert.equal(
    getAssessmentDirection(makeChecklistItem({
      assessmentStatus: "review_signal",
      criticalEvidence: {
        retainedEvidence: {
          analyticsVendorCount: 1,
          analyticsVendors: ["Google Analytics"]
        }
      },
      evidenceState: "observed",
      id: "analytics_vendor_observed",
      label: "Analytics vendor signal",
      status: "Review signal"
    })),
    "potential_concern"
  );
  assert.equal(
    getAssessmentDirection(makeChecklistItem({
      assessmentStatus: "gap_observed",
      evidenceState: "observed",
      id: "advertising_retargeting_vendor_signal_observed",
      label: "Advertising vendor signal",
      status: "Gap observed"
    })),
    "potential_concern"
  );
  assert.equal(
    getAssessmentDirection(makeChecklistItem({
      assessmentStatus: "review_signal",
      criticalEvidence: {
        retainedEvidence: {
          advertisingRetargetingVendorCount: 1,
          advertisingRetargetingVendors: ["Google Ads / DoubleClick"]
        }
      },
      evidenceState: "observed",
      id: "advertising_retargeting_vendor_signal_observed",
      label: "Advertising vendor signal",
      status: "Review signal"
    })),
    "potential_concern"
  );
  assert.equal(
    getAssessmentDirection(makeChecklistItem({
      assessmentStatus: "review_signal",
      criticalEvidence: {
        retainedEvidence: {
          advertisingRetargetingVendorCount: 0,
          preconsentPurposeRiskMix: {
            advertising: [],
            retargeting: [],
            marketingAnalytics: [],
            performanceRum: ["Akamai mPulse"],
            securityBotMitigation: ["Akamai Bot Manager / Edge"]
          }
        }
      },
      evidenceState: "observed",
      id: "advertising_retargeting_vendor_signal_observed",
      label: "Advertising vendor signal",
      status: "Review signal"
    })),
    "review_signal"
  );
  assert.equal(
    getAssessmentDirection(makeChecklistItem({
      assessmentStatus: "checked",
      evidenceState: "observed",
      id: "advertising_retargeting_vendor_signal_observed",
      label: "Advertising vendor signal",
      status: "Observed"
    })),
    "review_signal"
  );
  assert.equal(
    getAssessmentDirection(makeChecklistItem({
      assessmentStatus: "checked",
      evidenceState: "not_observed",
      id: "pre_consent_third_party_tracking",
      label: "Pre-consent 3rd party tracking",
      status: "Not observed"
    })),
    "positive_signal"
  );
  assert.equal(
    getAssessmentDirection(makeChecklistItem({
      assessmentStatus: "checked",
      criticalEvidence: {
        retainedEvidence: {
          cookiesBeforeConsentCount: 4,
          observedRuntimeSignalOnly: true
        }
      },
      evidenceState: "observed",
      id: "pre_consent_cookies_storage",
      label: "Pre-consent cookies/storage",
      status: "Observed"
    })),
    "review_signal"
  );
  assert.equal(
    getAssessmentDirection(makeChecklistItem({
      assessmentStatus: "checked",
      criticalEvidence: {
        retainedEvidence: {
          advertisingCookieStorageObserved: true,
          cookiesBeforeConsentCount: 1
        }
      },
      evidenceState: "observed",
      id: "pre_consent_cookies_storage",
      label: "Pre-consent cookies/storage",
      status: "Observed"
    })),
    "potential_concern"
  );
  assert.equal(
    getAssessmentDirection(makeChecklistItem({
      assessmentStatus: "checked",
      criticalEvidence: {
        retainedEvidence: {
          cookiesBeforeConsentCount: 2,
          essentialStorageOnly: true
        }
      },
      evidenceState: "observed",
      id: "pre_consent_cookies_storage",
      label: "Pre-consent cookies/storage",
      status: "Observed"
    })),
    "neutral_signal"
  );
  assert.equal(
    getAssessmentDirection(makeChecklistItem({
      assessmentStatus: "checked",
      criticalEvidence: {
        retainedEvidence: {
          deviceIdentificationPurpose: "security and fraud prevention"
        }
      },
      evidenceState: "observed",
      id: "device_identification_fingerprinting_signal_observed",
      label: "Device identification / fingerprinting signal",
      status: "Observed"
    })),
    "neutral_signal"
  );
  assert.equal(
    getAssessmentDirection(makeChecklistItem({
      assessmentStatus: "checked",
      criticalEvidence: {
        retainedEvidence: {
          fingerprintingPurpose: "cross-site advertising identity graph"
        }
      },
      evidenceState: "observed",
      id: "device_identification_fingerprinting_signal_observed",
      label: "Device identification / fingerprinting signal",
      status: "Observed"
    })),
    "potential_concern"
  );
  assert.equal(
    getAssessmentDirection(makeChecklistItem({
      assessmentStatus: "checked",
      criticalEvidence: {
        retainedEvidence: {
          embeddedContentHosts: ["fonts.googleapis.com"]
        }
      },
      evidenceState: "observed",
      id: "embedded_content_pre_consent",
      label: "Embedded 3rd party content loaded before consent",
      status: "Observed"
    })),
    "review_signal"
  );
  assert.equal(
    getAssessmentDirection(makeChecklistItem({
      assessmentStatus: "checked",
      criticalEvidence: {
        retainedEvidence: {
          embeddedContentHosts: ["imasdk.googleapis.com"]
        }
      },
      evidenceState: "observed",
      id: "embedded_content_pre_consent",
      label: "Embedded 3rd party content loaded before consent",
      status: "Observed"
    })),
    "potential_concern"
  );
});

test("GdprEprivacyCoverageChecklistCard does not badge review-only advertising rows as observed", () => {
  const html = renderToStaticMarkup(
    createElement(GdprEprivacyCoverageChecklistCard, {
      defaultOpen: true,
      items: [
        makeChecklistItem({
          assessmentStatus: "review_signal",
          criticalEvidence: {
            retainedEvidence: {
              advertisingRetargetingEvidenceCauses: [],
              advertisingRetargetingVendorCount: 0,
              filteredNonAdvertisingRetargetingVendors: ["Akamai Bot Manager / Edge", "Akamai mPulse"],
              preconsentPurposeRiskMix: {
                advertising: [],
                retargeting: [],
                marketingAnalytics: [],
                performanceRum: ["Akamai mPulse"],
                securityBotMitigation: ["Akamai Bot Manager / Edge"]
              }
            },
            statusBasis:
              "Runtime vendor checks completed for the tested context and did not retain an advertising, retargeting, or adtech vendor classification."
          },
          evidenceState: "observed",
          id: "advertising_retargeting_vendor_signal_observed",
          label: "Advertising vendor signal",
          status: "Review signal",
          tone: "review"
        })
      ],
      showSummaryStrip: false
    })
  );

  assert.match(html, />Partial concern</);
  assert.doesNotMatch(html, />Observed</);
  assert.match(html, /No advertising infrastructure classification was retained/);
});

test("GdprEprivacyCoverageChecklistCard describes extraction-limited Article 13 rows as coverage limited", () => {
  const item = makeChecklistItem({
    assessmentStatus: "review_signal",
    criticalEvidence: {
      missingOrIncompleteSourceSignals: [
        {
          actual: "842 characters",
          expected: "2500+ usable retained privacy policy text characters for Article 13 disclosure review",
          field: "scanner.policySurfaceObservations.privacy_policy.textExcerpt",
          source: "scanner",
          whyNeeded: "Required to evaluate processing purposes disclosure."
        }
      ],
      retainedEvidence: {
        policySurfaceSummary: {
          policyTextExtractionHealth: {
            extractedTextLength: 842,
            minimumTextLengthRequired: 2500,
            policyTextExtractionStatus: "thin",
            policyUrlRetained: true
          }
        },
        signalObserved: "not_confirmed_extraction_limited"
      },
      statusBasis:
        "A privacy-policy surface was found, but CertScore did not extract enough usable policy text to confirm this disclosure from retained evidence."
    },
    evidenceState: "observed",
    id: "processing_purposes_disclosure",
    label: "Processing purposes disclosure",
    status: "Not confirmed",
    tone: "review"
  });

  assert.equal(getAssessmentDirection(item), "technical_limitation");
  const rationale = getGdprEprivacyCoverageChecklistRowRationaleForAudit(item);
  assert.match(rationale, /Coverage limited from retained policy-surface evidence/);
  assert.match(rationale, /policy text extraction thin/);
  assert.match(rationale, /842 characters retained/);
  assert.doesNotMatch(rationale, /Partial support from retained/i);
});

test("GdprEprivacyCoverageChecklistCard renders row-specific extraction uncertainty as not confirmed", () => {
  const rows = [
    makeChecklistItem({
      assessmentStatus: "review_signal",
      criticalEvidence: {
        retainedEvidence: {
          signalObserved: "not_confirmed_row_specific_extraction"
        }
      },
      evidenceState: "observed",
      id: "legal_basis_disclosure_observed",
      label: "Legal basis disclosure",
      status: "Not confirmed",
      tone: "review"
    }),
    makeChecklistItem({
      assessmentStatus: "review_signal",
      criticalEvidence: {
        retainedEvidence: {
          signalObserved: "not_confirmed_row_specific_extraction"
        }
      },
      evidenceState: "observed",
      id: "data_subject_rights_disclosure",
      label: "Data subject rights disclosure",
      status: "Not confirmed",
      tone: "review"
    }),
    makeChecklistItem({
      assessmentStatus: "review_signal",
      criticalEvidence: {
        pipeline: {
          concernPolicyKey: "gdpr_eprivacy_coverage.dpo_contact_point_disclosure.not_confirmed",
          projectionStage: "coverage_policy",
          wc01NormalizedConcernKey: "gdpr_eprivacy.coverage.dpo_contact_point_disclosure",
          ws01EvidenceRole: "observed runtime signal identification, evidence capture, and logging"
        }
      },
      evidenceState: "observed",
      id: "dpo_contact_point_disclosure",
      label: "DPO contact point disclosure",
      status: "Not confirmed",
      tone: "review"
    }),
    makeChecklistItem({
      assessmentStatus: "review_signal",
      criticalEvidence: {
        retainedEvidence: {
          signalObserved: "not_confirmed_row_specific_extraction"
        }
      },
      evidenceState: "observed",
      id: "supervisory_authority_complaint_disclosure",
      label: "Supervisory authority complaint disclosure",
      status: "Not confirmed",
      tone: "review"
    })
  ];

  for (const row of rows) {
    assert.equal(getEvidenceLabel(row), "Not confirmed");
    assert.equal(getAssessmentDirection(row), "review_signal");
  }

  const html = renderToStaticMarkup(
    createElement(GdprEprivacyCoverageChecklistCard, {
      defaultOpen: true,
      items: rows,
      showSummaryStrip: false
    })
  );

  assert.equal((html.match(/>Not confirmed</g) ?? []).length, rows.length);
  assert.doesNotMatch(html, />Partial concern</);
});

test("GdprEprivacyCoverageChecklistCard renders concise session replay evidence copy", () => {
  const html = renderToStaticMarkup(
    createElement(GdprEprivacyCoverageChecklistCard, {
      defaultOpen: true,
      items: [makeSessionReplayItem()]
    })
  );

  assert.match(
    html,
    /Session replay or behavioral analytics signals were observed: Microsoft Clarity, Hotjar, and Contentsquare\./
  );
  assert.match(html, /Review summary/);
  assert.match(html, /GDPR\/ePrivacy score is weighted from evidence-gated checklist rows/);
  assert.doesNotMatch(html, /group\/gdpr-summary/);
  assert.match(html, /Microsoft Clarity, Hotjar, and Contentsquare/);
  assert.doesNotMatch(html, />Before consent</);
  assert.doesNotMatch(html, />Disclosure alignment</);
  assert.match(html, /aria-label="Toggle evidence packet for Session replay \/ behavioral analytics"/);
  assert.match(html, /aria-label="Toggle correction steps for Session replay \/ behavioral analytics"/);
  assert.doesNotMatch(html, /Session replay collection was retained before a recorded consent action/);
  assert.match(html, />Observed</);
  assert.match(html, /aria-label="Potential concern"/);
  assert.doesNotMatch(html, /Non-essential cookies or browser storage were observed before a recorded consent action/);
  assert.doesNotMatch(html, /aria-label="Jurisdiction unverified"/);
  assert.doesNotMatch(html, /GDPR\/ePrivacy can depend on EU\/EEA presence, targeting, or monitoring/);
  assert.doesNotMatch(html, /signals require review from the retained runtime evidence/i);
});

test("GdprEprivacyCoverageChecklistCard preserves first-seen timing in concise runtime rationale", () => {
  const html = renderToStaticMarkup(
    createElement(GdprEprivacyCoverageChecklistCard, {
      defaultOpen: true,
      items: [
        makeChecklistItem({
          assessmentStatus: "gap_observed",
          criticalEvidence: {
            retainedEvidence: {
              preconsent_tracker_vendor_evidence: [
                {
                  category: "tracking",
                  firstSeenMs: 521,
                  party: "third_party",
                  preConsent: true,
                  priority: "high",
                  vendor: "Quantcast Measure"
                },
                {
                  category: "advertising_measurement",
                  firstSeenMs: 521,
                  party: "third_party",
                  preConsent: true,
                  priority: "high",
                  vendor: "Google Ads / DoubleClick"
                }
              ],
              preconsent_tracker_vendors: [
                "Quantcast Measure",
                "Google Ads / DoubleClick",
                "BrightLine"
              ]
            },
            statusBasis:
              "Tracking requests observed before consent: Quantcast Measure, Google Ads / DoubleClick, and BrightLine; first seen 0.521s after scan start. Consent action was not recorded before these requests."
          },
          evidenceState: "observed",
          id: "pre_consent_third_party_tracking",
          label: "Pre-consent 3rd party tracking",
          note:
            "Tracking requests observed before consent: Quantcast Measure, Google Ads / DoubleClick, and BrightLine; first seen 0.521s after scan start. Consent action was not recorded before these requests.",
          status: "Gap observed"
        })
      ],
      showSummaryStrip: false
    })
  );

  assert.match(
    html,
    /Pre-consent 3rd party tracking evidence was retained before consent: Google Ads \/ DoubleClick \(advertising measurement\) and Quantcast Measure \(tracking\); first seen 0.521s after scan start; no consent action was recorded first\./
  );
  assert.match(html, /aria-label="Potential gap"/);
  assert.match(html, /border-rose-200 bg-rose-50 text-rose-700/);
  assert.match(html, /M10 4\.2 17 16H3L10 4\.2Z/);
  assert.doesNotMatch(html, /Why this result/);
  assert.doesNotMatch(html, /Evidence summary/);
});

test("GdprEprivacyCoverageChecklistCard summarizes the top two highest-priority 3rd party trackers", () => {
  const html = renderToStaticMarkup(
    createElement(GdprEprivacyCoverageChecklistCard, {
      defaultOpen: true,
      items: [
        makeChecklistItem({
          assessmentStatus: "gap_observed",
          criticalEvidence: {
            retainedEvidence: {
              firstPreconsentThirdPartyTrackingObservedMs: 3269,
              preconsentThirdPartyTrackerGroups: [
                {
                  firstSeenMs: 2100,
                  party: "third_party",
                  priority: "medium",
                  purpose: "A/B Testing",
                  vendor: "Optimizely"
                },
                {
                  firstSeenMs: 3269,
                  party: "third_party",
                  priority: "high",
                  purpose: "Advertising",
                  vendor: "Bombora Visitor Insights"
                },
                {
                  firstSeenMs: 3269,
                  party: "third_party",
                  priority: "high",
                  purpose: "Audience measurement",
                  vendor: "ScorecardResearch"
                },
                {
                  firstSeenMs: 3270,
                  party: "third_party",
                  priority: "high",
                  purpose: "Audience measurement",
                  vendor: "Quantcast Measure"
                }
              ]
            },
            statusBasis:
              "High priority pre-consent 3rd party tracking evidence: Bombora Visitor Insights - Advertising (3.27s), ScorecardResearch - Audience measurement (3.27s), Quantcast Measure - Audience measurement (3.27s)."
          },
          evidenceState: "observed",
          id: "pre_consent_third_party_tracking",
          label: "Pre-consent 3rd party tracking",
          status: "Gap observed"
        })
      ],
      showSummaryStrip: false
    })
  );

  assert.match(
    html,
    /Pre-consent 3rd party tracking evidence was retained before consent: Bombora Visitor Insights \(Advertising\) and ScorecardResearch \(Audience measurement\); 1 additional eligible tracker retained in expandable evidence; first seen 3.27s after scan start; no consent action was recorded first\./
  );
  assert.doesNotMatch(html, /Optimizely \(A\/B Testing\)/);
  assert.doesNotMatch(html, /Quantcast Measure \(Audience measurement\)/);
});

test("GdprEprivacyCoverageChecklistCard reads canonical pre-consent timing fields", () => {
  const html = renderToStaticMarkup(
    createElement(GdprEprivacyCoverageChecklistCard, {
      defaultOpen: true,
      items: [
        makeChecklistItem({
          assessmentStatus: "review_signal",
          criticalEvidence: {
            retainedEvidence: {
              concreteTrackerEvidenceRetained: true,
              firstPreconsentThirdPartyTrackingObservedMs: 2944,
              firstPreconsentThirdPartyTrackingObservationBasis: "runtime_third_party_request_timing",
              preconsentThirdPartyTrackingTimedObservationCount: 1
            },
            statusBasis: "Runtime 3rd party request timing was retained before any recorded consent action."
          },
          evidenceState: "observed",
          id: "pre_consent_third_party_tracking",
          label: "Pre-consent 3rd party tracking",
          status: "Review signal"
        })
      ],
      showSummaryStrip: false
    })
  );

  assert.match(
    html,
    /Tracking-classified 3rd party requests fired before any recorded consent action; first seen 2.94s after scan start/
  );
});

test("GdprEprivacyCoverageChecklistCard includes pre-consent cookie vendor and purpose in compact rationale", () => {
  const html = renderToStaticMarkup(
    createElement(GdprEprivacyCoverageChecklistCard, {
      defaultOpen: true,
      items: [
        makeChecklistItem({
          assessmentStatus: "review_signal",
          criticalEvidence: {
            retainedEvidence: {
              cookieStoragePriority: "medium",
              firstPreconsentThirdPartyCookieOrStorageObservedMs: 1216,
              preconsentThirdPartyCookieStorageGroups: [
                {
                  firstSeenMs: 1216,
                  party: "third_party",
                  priority: "medium",
                  purpose: "Analytics",
                  vendor: "Quantcast"
                }
              ]
            },
            statusBasis:
              "Medium priority pre-consent 3rd party cookie/storage evidence: Quantcast - Analytics (1.22s)."
          },
          evidenceState: "observed",
          id: "pre_consent_cookies_storage",
          label: "Pre-consent 3rd party cookies/storage",
          status: "Review signal"
        })
      ],
      showSummaryStrip: false
    })
  );

  assert.match(
    html,
    /Pre-consent cookie\/storage evidence was retained before consent: Quantcast \(Analytics\); first seen 1.22s after scan start; no consent action was recorded first\./
  );
  assert.doesNotMatch(html, /Cookie\/storage writes were observed before any recorded consent action; first seen 1.22s after scan start/);
});

test("GdprEprivacyCoverageChecklistCard combines advertising basis and retained evidence into one compact note", () => {
  const html = renderToStaticMarkup(
    createElement(GdprEprivacyCoverageChecklistCard, {
      defaultOpen: true,
      items: [
        makeChecklistItem({
          assessmentStatus: "review_signal",
          criticalEvidence: {
            retainedEvidence: {
              preconsent_tracker_vendor_evidence: [
                {
                  category: "tracking",
                  firstSeenMs: 521,
                  preConsent: true,
                  vendor: "Quantcast Measure"
                },
                {
                  category: "advertising_measurement",
                  firstSeenMs: 521,
                  preConsent: true,
                  vendor: "Google Ads / DoubleClick"
                }
              ],
              preconsent_tracker_vendors: [
                "Quantcast Measure",
                "Google Ads / DoubleClick",
                "BrightLine"
              ]
            },
            statusBasis:
              "Selected the strongest retained canonical coverage evidence available for this row."
          },
          evidenceState: "observed",
          id: "advertising_retargeting_vendor_signal_observed",
          label: "Advertising vendor signal",
          note:
            "Advertising vendor signals were observed; first seen 0.521s after scan start; before any recorded consent action.",
          status: "Review signal"
        })
      ],
      showSummaryStrip: false
    })
  );

  assert.match(
    html,
    /Advertising-infrastructure evidence was partially retained before consent: Google Ads \/ DoubleClick \(advertising measurement\); first seen 0.521s after scan start; no consent action was recorded first\./
  );
  assert.doesNotMatch(html, /Why this result/);
  assert.doesNotMatch(html, /Evidence summary/);
  assert.doesNotMatch(html, />Basis</);
  assert.doesNotMatch(html, />Evidence used</);
});

test("GdprEprivacyCoverageChecklistCard separates embedded content purpose buckets", () => {
  const html = renderToStaticMarkup(
    createElement(GdprEprivacyCoverageChecklistCard, {
      defaultOpen: true,
      items: [
        makeChecklistItem({
          assessmentStatus: "checked",
          criticalEvidence: {
            retainedEvidence: {
              embeddedContentHosts: ["imasdk.googleapis.com", "fonts.googleapis.com"],
              embeddedContentPurposeBuckets: {
                fontStaticResource: ["fonts.googleapis.com"],
                videoAdSdk: ["imasdk.googleapis.com"]
              },
              firstEmbeddedContentObservedMs: 412
            },
            statusBasis:
              "Concrete 3rd party embedded content was retained before consent in iframe/runtime evidence."
          },
          evidenceState: "observed",
          id: "embedded_content_pre_consent",
          label: "Embedded 3rd party content loaded before consent",
          status: "Observed"
        })
      ],
      showSummaryStrip: false
    })
  );

  assert.match(
    html,
    /including video\/ad SDK evidence \(imasdk\.googleapis\.com\), lower-risk font\/static resource evidence \(fonts\.googleapis\.com\)\. Review retained domains by purpose/
  );
  assert.match(html, /aria-label="Potential concern"/);
  assert.match(html, /border-amber-200 bg-amber-50 text-amber-700/);
  assert.match(html, /<circle cx="10" cy="10" r="6\.8"/);
  assert.doesNotMatch(html, /aria-label="Potential gap"/);
});

test("GdprEprivacyCoverageChecklistCard starts evidence and correction cards hidden behind row tool buttons", () => {
  const html = renderToStaticMarkup(
    createElement(GdprEprivacyCoverageChecklistCard, {
      defaultOpen: true,
      items: [
        makeChecklistItem({
          assessmentStatus: "gap_observed",
          evidenceState: "observed",
          id: "pre_consent_third_party_tracking",
          label: "Pre-consent 3rd party tracking",
          status: "Gap observed"
        })
      ],
      showSummaryStrip: false
    })
  );

  assert.match(html, /aria-label="Toggle evidence packet for Pre-consent 3rd party tracking"/);
  assert.match(html, /aria-label="Toggle correction steps for Pre-consent 3rd party tracking"/);
  assert.doesNotMatch(html, />Evidence packet</);
  assert.doesNotMatch(html, />Correction steps</);
});

test("GdprEprivacyCoverageChecklistCard shows captured policy review button for transparency rows with retained snippets", () => {
  const html = renderToStaticMarkup(
    createElement(GdprEprivacyCoverageChecklistCard, {
      defaultOpen: true,
      items: [
        makeChecklistItem({
          assessmentStatus: "checked",
          criticalEvidence: {
            retainedEvidence: {
              article13Signal: {
                disclosureType: "legal_basis",
                evidenceText: "We rely on consent, contract, legal obligation, and legitimate interests as legal bases for processing.",
                source: "wc01_retained_policy_text_match",
                status: "observed"
              },
              policySurfaceSummary: {
                privacyPolicyUrls: ["https://example.test/privacy"],
                retainedPrivacyPolicyTextExcerpt:
                  "Captured privacy policy text retained at scan time. We rely on consent, contract, legal obligation, and legitimate interests as legal bases for processing."
              }
            }
          },
          evidenceState: "observed",
          id: "legal_basis_disclosure_observed",
          label: "Legal basis disclosure",
          status: "Observed"
        }),
        makeChecklistItem({
          assessmentStatus: "review_signal",
          criticalEvidence: {
            retainedEvidence: {
              article13Signal: {
                disclosureType: "data_subject_rights",
                evidenceText: "You can ask us to access, correct, delete, or erase your personal data.",
                source: "wc01_retained_policy_text_match",
                status: "partial"
              },
              policySurfaceSummary: {
                privacyPolicyUrls: ["https://example.test/privacy"],
                retainedPrivacyPolicyTextExcerpt:
                  "Captured privacy policy text retained at scan time. You can ask us to access, correct, delete, or erase your personal data."
              },
              signalObserved: "not_confirmed_row_specific_extraction"
            }
          },
          evidenceState: "observed",
          id: "data_subject_rights_disclosure",
          label: "Data subject rights disclosure",
          status: "Not confirmed"
        }),
        makeChecklistItem({
          assessmentStatus: "review_signal",
          criticalEvidence: {
            retainedEvidence: {
              policySurfaceSummary: {
                article13DisclosureSignals: [
                  {
                    confidence: 0.78,
                    disclosureType: "recipients_or_vendor_categories",
                    evidenceText:
                      "We may share personal information with service providers, vendors, affiliates, and other recipients that process information on our behalf.",
                    source: "deterministic",
                    status: "observed",
                    surfaceUrl: "https://example.test/privacy"
                  }
                ],
                privacyPolicyUrls: ["https://example.test/privacy"],
                retainedPrivacyPolicyTextExcerpt:
                  "Captured privacy policy text retained at scan time. We may share personal information with service providers, vendors, affiliates, and other recipients that process information on our behalf."
              },
              signalObserved: "not_confirmed_policy_disclosure_extraction"
            }
          },
          evidenceState: "not_observed",
          id: "recipients_vendor_categories_disclosure",
          label: "Recipients/vendor categories disclosed",
          status: "Not confirmed"
        }),
        makeChecklistItem({
          assessmentStatus: "review_signal",
          criticalEvidence: {
            retainedEvidence: {
              policySurfaceSummary: {
                privacyPolicyUrls: ["https://example.test/privacy"],
                retainedPrivacyPolicyTextExcerpt:
                  "Captured privacy policy text retained at scan time. In some instances, we are able to retain your information even if you withdraw consent or ask us to delete it where required by law, legal purposes, fraud, or abuse prevention."
              },
              signalObserved: "not_confirmed_policy_disclosure_extraction"
            }
          },
          evidenceState: "not_observed",
          id: "retention_disclosure_observed",
          label: "Retention disclosure",
          status: "Not confirmed"
        }),
        makeChecklistItem({
          assessmentStatus: "review_signal",
          criticalEvidence: {
            retainedEvidence: {
              policySurfaceSummary: {
                privacyPolicyUrls: ["https://example.test/privacy"],
                retainedPrivacyPolicyTextExcerpt: "Captured privacy policy text retained at scan time."
              },
              signalObserved: "not_confirmed_row_specific_extraction"
            }
          },
          evidenceState: "observed",
          id: "supervisory_authority_complaint_disclosure",
          label: "Supervisory authority complaint",
          status: "Not confirmed"
        }),
        makeChecklistItem({
          assessmentStatus: "checked",
          criticalEvidence: {
            retainedEvidence: {
              article13Signal: {
                disclosureType: "legal_basis",
                evidenceText: "We rely on consent, contract, legal obligation, and legitimate interests as legal bases for processing.",
                source: "wc01_retained_policy_text_match",
                status: "observed"
              },
              policySurfaceSummary: {
                privacyPolicyUrls: ["https://example.test/privacy"],
                retainedPrivacyPolicyTextExcerpt:
                  "Captured privacy policy text retained at scan time. We rely on consent, contract, legal obligation, and legitimate interests as legal bases for processing."
              }
            }
          },
          evidenceState: "observed",
          id: "pre_consent_third_party_tracking",
          label: "Pre-consent 3rd party tracking",
          status: "Observed"
        })
      ],
      showSummaryStrip: false
    })
  );

  assert.match(html, /aria-label="Open captured privacy policy for Legal basis disclosure"/);
  assert.match(html, /aria-label="Open captured privacy policy for Data subject rights disclosure"/);
  assert.match(html, /aria-label="Open captured privacy policy for Recipients\/vendor categories disclosed"/);
  assert.match(html, /aria-label="Open captured privacy policy for Retention disclosure"/);
  assert.doesNotMatch(html, /aria-label="Open captured privacy policy for Supervisory authority complaint"/);
  assert.doesNotMatch(html, /aria-label="Open captured privacy policy for Pre-consent 3rd party tracking"/);
});

test("GdprEprivacyCoverageChecklistCard shows policy review for every not-confirmed transparency row with retained summary snippets", () => {
  const rows = [
    ["controller_contact_disclosure", "Controller/contact disclosure", "controller_contact", "The controller of your information is Example Media, and you can contact privacy@example.test about this policy."],
    ["processing_purposes_disclosure", "Processing purposes disclosure", "processing_purposes", "We process personal information to provide services, personalize content, measure performance, and protect our users."],
    ["legal_basis_disclosure_observed", "Legal basis disclosure", "legal_basis", "We rely on consent, contract, legal obligation, and legitimate interests as lawful bases for processing."],
    ["recipients_vendor_categories_disclosure", "Recipients/vendor categories disclosed", "recipients_or_vendor_categories", "We may share personal information with service providers, vendors, affiliates, and other recipients that process information on our behalf."],
    ["retention_disclosure_observed", "Retention disclosure", "data_retention", "We retain personal information only as long as necessary for the purposes described in this policy or as required by law."],
    ["data_subject_rights_disclosure", "Data subject rights disclosure", "data_subject_rights", "You can ask us to access, correct, delete, or erase your personal data."],
    ["international_transfers_disclosure", "International transfer disclosure", "international_transfers", "We may transfer personal information outside the European Economic Area using standard contractual clauses."],
    ["dpo_contact_point_disclosure", "DPO / privacy contact point", "dpo_contact", "You can contact our Data Protection Officer through the privacy office at dpo@example.test."],
    ["supervisory_authority_complaint_disclosure", "Supervisory authority complaint", "supervisory_authority", "You may lodge a complaint with your local data protection authority or supervisory authority."]
  ] as const;
  const html = renderToStaticMarkup(
    createElement(GdprEprivacyCoverageChecklistCard, {
      defaultOpen: true,
      items: rows.map(([id, label, disclosureType, evidenceText]) =>
        makeChecklistItem({
          assessmentStatus: "review_signal",
          criticalEvidence: {
            retainedEvidence: {
              policySurfaceSummary: {
                article13DisclosureSignals: [
                  {
                    confidence: 0.62,
                    disclosureType,
                    evidenceText,
                    source: "deterministic",
                    status: "partial",
                    surfaceUrl: "https://example.test/privacy"
                  }
                ],
                privacyPolicyUrls: ["https://example.test/privacy"],
                retainedPrivacyPolicyTextExcerpt: `Captured privacy policy text retained at scan time. ${evidenceText}`
              },
              signalObserved: "not_confirmed_policy_disclosure_extraction"
            }
          },
          evidenceState: "not_observed",
          id,
          label,
          status: "Not confirmed"
        })
      ),
      showSummaryStrip: false
    })
  );

  for (const [, label] of rows) {
    assert.match(html, new RegExp(`aria-label="Open captured privacy policy for ${escapeRegExp(label)}"`));
  }
});

test("GdprEprivacyCoverageChecklistCard shows policy review for not-confirmed retention aliases when retained full policy text has a retention excerpt", () => {
  const html = renderToStaticMarkup(
    createElement(GdprEprivacyCoverageChecklistCard, {
      defaultOpen: true,
      items: [
        ...["retention_disclosure", "retention_disclosure_present"].map((id) => makeChecklistItem({
          assessmentStatus: "review_signal",
          criticalEvidence: {
            retainedEvidence: {
              policySurfaceSummary: {
                article13DisclosureSignals: [
                  {
                    confidence: 0.78,
                    disclosureType: "dpo_contact",
                    evidenceText:
                      "In some instances, this may mean that we are able to retain your information even if you withdraw consent. To exercise these rights, contact our data protection officer through the privacy office.",
                    source: "deterministic",
                    status: "observed",
                    surfaceUrl: "https://example.test/privacy"
                  }
                ],
                privacyPolicyUrls: ["https://example.test/privacy"],
                retainedPrivacyPolicyTextExcerpt:
                  "Scanner evidence captured at scan time. Contact the privacy office for more information."
              },
              signalObserved: "not_confirmed_row_specific_extraction"
            }
          },
          evidenceState: "not_observed",
          id,
          label: "Retention disclosure",
          status: "Not confirmed"
        }))
      ],
      showSummaryStrip: false
    })
  );

  assert.match(html, /aria-label="Open captured privacy policy for Retention disclosure"/);
});

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("policy excerpt page highlights every matched snippet with marker-specific colors", () => {
  const snippets = [
    {
      label: "Primary confirming text",
      text: "You can ask what information we have about you.",
      tone: "primary" as const
    },
    {
      label: "Matched policy text",
      text: "Also, you or your guardian can ask us what information we have about you, to stop collecting your information, or to erase your information we have about you.",
      tone: "fallback" as const
    },
    {
      label: "Matched policy text",
      text: "You may ask us to delete your information from our records.",
      tone: "fallback" as const
    },
    {
      label: "Matched policy text",
      text: "You may review and update your information by contacting us.",
      tone: "fallback" as const
    }
  ];
  const source = [
    "You can ask what information we have about you.",
    "Also, you or your guardian can ask us what information we have about you, to stop collecting your information, or to erase your information we have about you.",
    "You may ask us to delete your information from our records.",
    "You may review and update your information by contacting us."
  ].join(" ");

  const html = gdprPolicyExcerptPageTestHelpers.renderHighlightedPolicyHtml(source, snippets);

  assert.match(html, /policy-highlight-color-1" title="Primary confirming text"><span class="policy-highlight-marker policy-highlight-color-1">1<\/span>/);
  assert.match(html, /policy-highlight-color-2" title="Matched policy text"><span class="policy-highlight-marker policy-highlight-color-2">2<\/span>/);
  assert.match(html, /policy-highlight-color-3" title="Matched policy text"><span class="policy-highlight-marker policy-highlight-color-3">3<\/span>/);
  assert.match(html, /policy-highlight-color-4" title="Matched policy text"><span class="policy-highlight-marker policy-highlight-color-4">4<\/span>/);
});

test("policy excerpt page filters unmatched legend snippets before numbering highlights", () => {
  const snippets = [
    {
      label: "Primary confirming text",
      text: "This primary text is not present in the retained excerpt.",
      tone: "primary" as const
    },
    {
      label: "Matched policy text",
      text: "Also, you or your guardian can ask us what information we have about you.",
      tone: "fallback" as const
    },
    {
      label: "Matched policy text",
      text: "You may ask us to delete your information from our records.",
      tone: "fallback" as const
    }
  ];
  const source = [
    "Also, you or your guardian can ask us what information we have about you.",
    "You may ask us to delete your information from our records."
  ].join(" ");

  const visibleSnippets = gdprPolicyExcerptPageTestHelpers.getMatchingPolicyHighlightSnippets(source, snippets);
  const html = gdprPolicyExcerptPageTestHelpers.renderHighlightedPolicyHtml(source, visibleSnippets);

  assert.equal(visibleSnippets.length, 2);
  assert.equal(visibleSnippets[0]?.text, snippets[1]?.text);
  assert.match(html, /policy-highlight-marker policy-highlight-color-1">1<\/span>/);
  assert.match(html, /policy-highlight-marker policy-highlight-color-2">2<\/span>/);
  assert.doesNotMatch(html, /policy-highlight-marker policy-highlight-color-3">3<\/span>/);
});

test("policy excerpt page collapses overlapping matched snippets to one full-excerpt highlight", () => {
  const snippets = [
    {
      label: "Matched policy text",
      text: "Also, you or your guardian can ask us what information we have about you.",
      tone: "fallback" as const
    },
    {
      label: "Matched policy text",
      text: "Also, you or your guardian can ask us what information we have about you, to stop collecting your information.",
      tone: "fallback" as const
    },
    {
      label: "Matched policy text",
      text: "Also, you or your guardian can ask us what information we have about you, to stop collecting your information, or to erase your information we have about you.",
      tone: "fallback" as const
    }
  ];
  const source =
    "Remember, you don't always have to give us your information. Also, you or your guardian can ask us what information we have about you, to stop collecting your information, or to erase your information we have about you.";

  const visibleSnippets = gdprPolicyExcerptPageTestHelpers.getDistinctMatchingPolicyHighlightSnippets(source, snippets);
  const html = gdprPolicyExcerptPageTestHelpers.renderHighlightedPolicyHtml(source, visibleSnippets);

  assert.equal(visibleSnippets.length, 1);
  assert.equal((html.match(/<mark /g) ?? []).length, 1);
  assert.match(html, /policy-highlight-marker policy-highlight-color-1">1<\/span>/);
  assert.doesNotMatch(html, /policy-highlight-marker policy-highlight-color-2">2<\/span>/);
  assert.doesNotMatch(html, /policy-highlight-marker policy-highlight-color-3">3<\/span>/);
});

test("policy excerpt context includes separated retained snippets instead of only the first match", () => {
  const source = [
    "First rights section says you can access your information.",
    "Filler ".repeat(450),
    "Second rights section says you can erase your information.",
    "Filler ".repeat(450),
    "Third rights section says you can update your information."
  ].join(" ");

  const excerpt = gdprPolicyExcerptPageTestHelpers.getPolicyContextExcerptForSnippets(source, [
    {
      label: "Primary confirming text",
      text: "First rights section says you can access your information.",
      tone: "primary" as const
    },
    {
      label: "Matched policy text",
      text: "Second rights section says you can erase your information.",
      tone: "fallback" as const
    },
    {
      label: "Matched policy text",
      text: "Third rights section says you can update your information.",
      tone: "fallback" as const
    }
  ]);

  assert.ok(excerpt);
  assert.match(excerpt, /First rights section/);
  assert.match(excerpt, /Second rights section/);
  assert.match(excerpt, /Third rights section/);
  assert.match(excerpt, /\n\n\.\.\.\n\n/);
});

test("GdprEprivacyCoverageChecklistCard renders policy excerpts in monospace with word-safe truncation", () => {
  const html = renderToStaticMarkup(
    createElement(GdprEprivacyCoverageChecklistCard, {
      defaultOpen: true,
      items: [
        makeChecklistItem({
          assessmentStatus: "checked",
          criticalEvidence: {
            retainedEvidence: {
              article13Signal: {
                disclosureType: "data_retention",
                evidenceText:
                  "ccount records for as long as needed to provide services, meet legal obligations, resolve disputes, enforce agreements, support security reviews, and document choices made by users across our websites and mobile applications.",
                source: "deterministic",
                status: "observed"
              }
            },
            statusBasis: "Retention disclosure evidence was retained in public policy-surface evidence."
          },
          evidenceState: "observed",
          id: "retention_disclosure",
          label: "Retention disclosure",
          status: "Observed"
        })
      ],
      showSummaryStrip: false
    })
  );

  assert.match(html, /font-mono text-\[0\.86em\] italic text-slate-700/);
  assert.match(html, /Policy text included matching disclosure evidence/);
  assert.match(
    html,
    /<span class="font-mono text-\[0\.86em\] italic text-slate-700">&quot;records for as long as needed/
  );
  assert.doesNotMatch(
    html,
    /<span class="font-mono text-\[0\.86em\] italic text-slate-700">&quot;ccount records/
  );
  assert.match(html, /\.\.\.\[more in evidence packet\]&quot;<\/span>/);
  assert.doesNotMatch(html, /docum\.\.\.&quot;<\/span>/);
});

test("GdprEprivacyCoverageChecklistCard explains international transfer evidence as transparency-only", () => {
  const html = renderToStaticMarkup(
    createElement(GdprEprivacyCoverageChecklistCard, {
      defaultOpen: true,
      items: [
        makeChecklistItem({
          assessmentStatus: "checked",
          criticalEvidence: {
            retainedEvidence: {
              article13Signal: {
                disclosureType: "international_transfers",
                evidenceText:
                  "or confirmed that all data recipients will provide an adequate level of data protection, in particular by entering into standard contractual clauses or relying on another approved safeguard.",
                source: "deterministic",
                status: "observed"
              }
            },
            statusBasis: "International transfer disclosure evidence was retained in public policy-surface evidence."
          },
          evidenceState: "observed",
          id: "international_transfers_disclosure",
          label: "International transfer disclosure",
          status: "Observed"
        })
      ],
      showSummaryStrip: false
    })
  );

  assert.match(html, /Policy text included matching international-transfer disclosure evidence/);
  assert.match(html, /adequate level of data protection/);
  assert.match(html, /standard contractual clauses/);
  assert.doesNotMatch(html, /Policy text included matching disclosure evidence/);
});

test("GdprEprivacyCoverageChecklistCard explains supervisory-authority partial support", () => {
  const html = renderToStaticMarkup(
    createElement(GdprEprivacyCoverageChecklistCard, {
      defaultOpen: true,
      items: [
        makeChecklistItem({
          assessmentStatus: "review_signal",
          criticalEvidence: {
            retainedEvidence: {
              article13Signal: {
                disclosureType: "supervisory_authority",
                evidenceText:
                  "We work with regulatory authorities and seek to resolve any complaints about our privacy practices.",
                source: "deterministic",
                status: "partial"
              }
            },
            statusBasis: "Supervisory authority complaint disclosure was partially observed in retained public policy-surface evidence."
          },
          evidenceState: "observed",
          id: "supervisory_authority_complaint_disclosure",
          label: "Supervisory authority complaint disclosure",
          status: "Review signal"
        })
      ],
      showSummaryStrip: false
    })
  );

  assert.match(html, /Policy text referenced complaints, regulators, or data protection authorities/);
  assert.match(html, /complete supervisory-authority complaint-right disclosure was not confirmed/);
});

test("GdprEprivacyCoverageChecklistCard makes policy gap decisions inferable from descriptor and packet", () => {
  const html = renderToStaticMarkup(
    createElement(GdprEprivacyCoverageChecklistCard, {
      defaultOpen: true,
      items: [
        makeChecklistItem({
          assessmentStatus: "gap_observed",
          criticalEvidence: {
            retainedEvidence: {
              policySurfaceSummary: {
                privacyPolicyTextCharacterCount: 6240,
                privacyPolicyUrls: ["https://example.test/privacy"]
              },
              signalObserved: false
            },
            statusBasis:
              "International transfer disclosure was expected for Article 13 transparency review but was not observed in retained privacy-policy evidence."
          },
          evidenceState: "observed",
          id: "international_transfers_disclosure",
          label: "International transfer disclosure",
          status: "Gap observed"
        })
      ],
      showSummaryStrip: false
    })
  );

  assert.match(html, /Potential gap from retained policy-surface evidence/);
  assert.match(html, /International transfer disclosure was expected/);
  assert.match(html, /structured signalObserved=false retained/);
});

test("GdprEprivacyCoverageChecklistCard makes not-testable decisions inferable from missing source signals", () => {
  const item = makeChecklistItem({
    assessmentStatus: "coverage_limitation",
    criticalEvidence: {
      missingOrIncompleteSourceSignals: [
        {
          actual: "missing",
          expected: "reachable retained privacy policy surface",
          field: "scanner.policySurfaceObservations.privacy_policy",
          source: "scanner",
          whyNeeded: "Required to evaluate legal basis disclosure."
        }
      ],
      retainedEvidence: {
        policySurfaceSummary: {}
      },
      statusBasis: "No privacy-policy surface was retained, so legal basis disclosure could not be evaluated."
    },
    evidenceState: "not_testable",
    id: "legal_basis_disclosure_observed",
    label: "Legal basis disclosure",
    status: "Not testable"
  });
  const html = renderToStaticMarkup(
    createElement(GdprEprivacyCoverageChecklistCard, {
      defaultOpen: true,
      items: [item],
      showSummaryStrip: false
    })
  );

  assert.match(html, /Not testable from retained policy-surface evidence/);
  assert.match(html, /expected reachable retained privacy policy surface; retained missing/);
});

test("GdprEprivacyCoverageChecklistCard does not use observed runtime wording for not-testable rows", () => {
  const item = makeChecklistItem({
    assessmentStatus: "coverage_limitation",
    criticalEvidence: {
      missingOrIncompleteSourceSignals: [
        {
          actual: "preConsentRuntimeScanner failed",
          expected: "usable pre-consent runtime evidence",
          field: "scanner.preConsentRuntime",
          source: "scanner",
          whyNeeded: "Required to evaluate pre-consent tracking."
        }
      ],
      retainedEvidence: {
        status: "Not testable"
      },
      statusBasis: "The runtime scanner failed before row-specific pre-consent tracking evidence could be retained."
    },
    evidenceState: "not_testable",
    id: "pre_consent_third_party_tracking",
    label: "Pre-consent 3rd party tracking",
    status: "Not testable"
  });
  const html = renderToStaticMarkup(
    createElement(GdprEprivacyCoverageChecklistCard, {
      defaultOpen: true,
      items: [item],
      showSummaryStrip: false
    })
  );

  assert.match(html, /Not testable from retained source-signal coverage evidence/);
  assert.match(html, /expected usable pre-consent runtime evidence; retained preConsentRuntimeScanner failed/);
  assert.doesNotMatch(html, /Tracking-classified 3rd party requests fired before any recorded consent action/);
});

test("GdprEprivacyCoverageChecklistCard renders transport security rows under a titled section", () => {
  const html = renderToStaticMarkup(
    createElement(GdprEprivacyCoverageChecklistCard, {
      defaultOpen: true,
      items: [
        makeChecklistItem({
          assessmentStatus: "checked",
          evidenceState: "observed",
          id: "transport_security_https_delivery",
          label: "HTTPS delivery for scanned pages",
          status: "Observed"
        }),
        makeChecklistItem({
          assessmentStatus: "checked",
          evidenceState: "observed",
          id: "transport_security_tls_certificate",
          label: "Valid SSL/TLS certificate",
          status: "Observed"
        })
      ],
      showSummaryStrip: false
    })
  );

  assert.match(html, /Transport Security/);
  assert.match(html, /Scan-context note/);
  assert.match(html, /HTTPS delivery for scanned pages/);
  assert.match(html, /Valid SSL\/TLS certificate/);
});

test("GdprEprivacyCoverageChecklistCard renders 3rd party service rows under a titled section", () => {
  const html = renderToStaticMarkup(
    createElement(GdprEprivacyCoverageChecklistCard, {
      defaultOpen: true,
      items: [
        makeChecklistItem({
          assessmentStatus: "gap_observed",
          criticalEvidence: {
            retainedEvidence: {
              embeddedContentHosts: ["youtube.com"],
              embeddedContentPurposeBuckets: {
                mediaEmbed: ["youtube.com"]
              },
              firstEmbeddedContentObservedMs: 928
            }
          },
          evidenceState: "observed",
          id: "third_party_service_connection_pre_consent",
          label: "3rd party service connections before consent",
          status: "Gap observed"
        }),
        makeChecklistItem({
          assessmentStatus: "gap_observed",
          criticalEvidence: {
            retainedEvidence: {
              embeddedContentHosts: ["youtube.com"],
              embeddedContentPurposeBuckets: {
                mediaEmbed: ["youtube.com"]
              },
              firstEmbeddedContentObservedMs: 928
            }
          },
          evidenceState: "observed",
          id: "third_party_iframe_pre_consent",
          label: "3rd party iframes before consent",
          status: "Gap observed"
        })
      ],
      showSummaryStrip: false
    })
  );

  assert.match(html, /3rd Party Services/);
  assert.match(html, /Scan-context note/);
  assert.match(html, /3rd party service connections before consent/);
  assert.match(html, /3rd party iframes before consent/);
});

test("GdprEprivacyCoverageSummaryPills renders a segmented decision mix instead of tally pills", () => {
  const items = [
    makeChecklistItem({
      assessmentStatus: "checked",
      evidenceState: "observed",
      id: "privacy_notice_availability",
      label: "Privacy notice availability",
      status: "Observed"
    }),
    makeChecklistItem({
      assessmentStatus: "checked",
      evidenceState: "observed",
      id: "cmp_framework_signal_observed",
      label: "CMP / consent-management signal",
      status: "Observed"
    }),
    makeChecklistItem({
      assessmentStatus: "review_signal",
      criticalEvidence: {
        retainedEvidence: {
          analyticsVendorCount: 1,
          analyticsVendors: ["Google Analytics"]
        }
      },
      evidenceState: "observed",
      id: "analytics_vendor_observed",
      label: "Analytics vendor signal",
      status: "Review signal"
    }),
    makeChecklistItem({
      assessmentStatus: "review_signal",
      evidenceState: "observed",
      id: "consent_choice_quality",
      label: "Consent choice quality",
      status: "Review signal"
    }),
    makeChecklistItem({
      assessmentStatus: "gap_observed",
      evidenceState: "observed",
      id: "pre_consent_third_party_tracking",
      label: "Pre-consent 3rd party tracking",
      status: "Gap observed"
    })
  ];
  const html = renderToStaticMarkup(
    createElement(GdprEprivacyCoverageSummaryPills, { items })
  );

  assert.match(html, /GDPR\/ePrivacy checklist rating mix/);
  assert.match(html, /Rating mix/);
  assert.match(html, /5 rows/);
  assert.match(html, /concern/);
  assert.match(html, />partial</);
  assert.match(html, /review/);
  assert.match(html, /positive/);
  assert.match(html, /contextual/);
  assert.doesNotMatch(html, /rounded-full border border-slate-200 bg-slate-50\/80 px-2 py-1/);
  assert.doesNotMatch(html, /gaps observed/);
  assert.doesNotMatch(html, /partial concerns/);
  assert.doesNotMatch(html, /review signals/);
  assert.doesNotMatch(html, /positive signals/);
  assert.doesNotMatch(html, /neutral signals/);
  assert.doesNotMatch(html, />neutral</);
  assert.doesNotMatch(html, /potential concerns/);
  assert.doesNotMatch(html, /potential gaps/);
  assert.doesNotMatch(html, />observed</);
});

test("GdprEprivacyCoverageChecklistCard renders debug confidence metadata", () => {
  const html = renderToStaticMarkup(
    createElement(GdprEprivacyCoverageChecklistCard, {
      defaultOpen: true,
      items: [
        makeChecklistItem({
          assessmentStatus: "gap_observed",
          debugConfidence: {
            score: 7,
            improveConfidence: [
              "Retain request timing relative to consent state",
              "Resolve vendor and purpose for 3rd party endpoints"
            ]
          },
          evidenceState: "observed",
          id: "pre_consent_third_party_tracking",
          label: "Pre-consent 3rd party tracking",
          status: "Gap observed",
          tone: "warning"
        })
      ]
    })
  );

  assert.match(html, /Confidence: 7/);
  assert.match(html, /Improve confidence: Retain request timing relative to consent state/);
  assert.match(html, /Resolve vendor and purpose for 3rd party endpoints/);
});

test("GdprEprivacyCoverageChecklistCard avoids duplicate observed wording for not-observed rows", () => {
  const html = renderToStaticMarkup(
    createElement(GdprEprivacyCoverageChecklistCard, {
      defaultOpen: true,
      items: [
        makeChecklistItem({
          id: "controller_contact_disclosure",
          label: "Controller/contact disclosure",
          status: "Not observed"
        }),
        makeChecklistItem({
          id: "privacy_notice_availability",
          label: "Privacy notice availability",
          status: "Not observed"
        })
      ]
    })
  );

  assert.match(html, /Not observed in retained scanner evidence/);
  assert.doesNotMatch(html, /observed was observed/i);
  assert.doesNotMatch(html, /availability was observed/i);
});

test("GdprEprivacyCoverageChecklistCard labels scanner module gaps as coverage missing", () => {
  const item = makeChecklistItem({
    assessmentStatus: "coverage_limitation",
    debugConfidence: {
      score: 1,
      improveConfidence: [
        "Run policy-surface coverage for policy/runtime vendor comparison",
        "Fetch policy surfaces with vendor mentions"
      ]
    },
    evidenceState: "not_testable",
    id: "policy_runtime_vendor_alignment_review",
    label: "Policy/runtime vendor alignment",
    status: "Not testable",
    tone: "muted"
  });
  item.criticalEvidence.missingOrIncompleteSourceSignals = [
    {
      actual: "not retained in this v2 artifact",
      expected: "bounded source evidence sufficient for this checklist row",
      field: "policy_runtime_vendor_alignment_review",
      source: "scanner",
      whyNeeded: "Policy-surface scanner did not run, so policy/runtime mismatch findings are out of scope."
    },
    {
      actual: "not retained in this v2 artifact",
      expected: "bounded source evidence sufficient for this checklist row",
      field: "policy_runtime_vendor_alignment_review",
      source: "scanner",
      whyNeeded: "required_source_module_not_run"
    }
  ];
  const html = renderToStaticMarkup(
    createElement(GdprEprivacyCoverageChecklistCard, {
      defaultOpen: true,
      items: [item]
    })
  );

  assert.match(html, /Coverage missing/);
  assert.match(html, /Next coverage step: Run policy-surface coverage for policy\/runtime vendor comparison/);
  assert.doesNotMatch(html, /Confidence: 1/);
});

test("GdprEprivacyCoverageChecklistCard summarizes evaluated and coverage-missing rows", () => {
  const coverageGapItem = makeChecklistItem({
    assessmentStatus: "coverage_limitation",
    evidenceState: "not_testable",
    id: "cookie_notice_availability",
    label: "Cookie notice availability",
    status: "Not testable",
    tone: "muted"
  });
  coverageGapItem.criticalEvidence.missingOrIncompleteSourceSignals = [
    {
      actual: "not retained in this v2 artifact",
      expected: "bounded source evidence sufficient for this checklist row",
      field: "cookie_notice_availability",
      source: "scanner",
      whyNeeded: "Missing or incomplete policySurfaceScanner coverage."
    }
  ];

  const html = renderToStaticMarkup(
    createElement(GdprEprivacyCoverageChecklistCard, {
      defaultOpen: true,
      items: [
        makeChecklistItem({
          assessmentStatus: "gap_observed",
          evidenceState: "observed",
          id: "pre_consent_third_party_tracking",
          label: "Pre-consent 3rd party tracking",
          status: "Gap observed",
          tone: "warning"
        }),
        makeChecklistItem({
          assessmentStatus: "review_signal",
          evidenceState: "observed",
          id: "cross_border_endpoint_review",
          label: "Cross-border endpoint review",
          status: "Review signal",
          tone: "review"
        }),
        coverageGapItem
      ]
    })
  );

  assert.match(html, /Observed/);
  assert.match(html, /Not observed/);
  assert.match(html, /Partial concern/);
  assert.match(html, /Gaps \/ limits/);
  assert.match(html, /<div class="text-lg font-semibold leading-none text-slate-950">2<\/div><div class="mt-1 text-\[10px\] font-semibold uppercase tracking-\[0\.12em\]">Gaps \/ limits<\/div>/);
});

test("GdprEprivacyCoverageChecklistCard does not render suggested follow-up capture guidance", () => {
  const policyGapItem = makeChecklistItem({
    assessmentStatus: "coverage_limitation",
    evidenceState: "not_testable",
    id: "cookie_notice_availability",
    label: "Cookie notice availability",
    status: "Not testable",
    tone: "muted"
  });
  policyGapItem.criticalEvidence.missingOrIncompleteSourceSignals = [
    {
      actual: "not retained in this v2 artifact",
      expected: "bounded source evidence sufficient for this checklist row",
      field: "cookie_notice_availability",
      source: "scanner",
      whyNeeded: "Missing or incomplete policySurfaceScanner coverage."
    }
  ];

  const consentGapItem = makeChecklistItem({
    assessmentStatus: "coverage_limitation",
    evidenceState: "not_testable",
    id: "reject_all_path_availability",
    label: "Decline / reject option availability",
    status: "Not testable",
    tone: "muted"
  });
  consentGapItem.criticalEvidence.missingOrIncompleteSourceSignals = [
    {
      actual: "not retained in this v2 artifact",
      expected: "bounded source evidence sufficient for this checklist row",
      field: "reject_all_path_availability",
      source: "scanner",
      whyNeeded: "Missing or incomplete consentFlowRuntimeScanner coverage."
    }
  ];

  const preConsentGapItem = makeChecklistItem({
    assessmentStatus: "coverage_limitation",
    evidenceState: "not_testable",
    id: "pre_consent_third_party_tracking",
    label: "Pre-consent 3rd party tracking",
    status: "Not testable",
    tone: "muted"
  });
  preConsentGapItem.criticalEvidence.missingOrIncompleteSourceSignals = [
    {
      actual: "not retained in this v2 artifact",
      expected: "bounded source evidence sufficient for this checklist row",
      field: "pre_consent_third_party_tracking",
      source: "scanner",
      whyNeeded: "Missing or incomplete preConsentRuntimeScanner coverage."
    }
  ];

  const html = renderToStaticMarkup(
    createElement(GdprEprivacyCoverageChecklistCard, {
      defaultOpen: true,
      items: [policyGapItem, consentGapItem, preConsentGapItem]
    })
  );

  assert.doesNotMatch(html, /Suggested follow-up capture/);
  assert.doesNotMatch(html, /policy or full/);
  assert.doesNotMatch(html, /consent or full/);
  assert.doesNotMatch(html, /standard or full/);
});

test("GdprEprivacyCoverageChecklistCard omits consent-control accessibility from summary when checked", () => {
  const html = renderToStaticMarkup(
    createElement(GdprEprivacyCoverageChecklistCard, {
      defaultOpen: true,
      items: [
        makeChecklistItem({
          assessmentStatus: "checked",
          evidenceState: "not_observed",
          id: "accessibility_consent_controls",
          status: "Not observed"
        })
      ]
    })
  );

  assert.match(html, /Review retained evidence for consent-control accessibility/i);
  assert.doesNotMatch(html, /cross-border analytics\/tracking endpoint context/i);
  assert.doesNotMatch(html, /runtime vendor disclosure alignment/i);
  assert.doesNotMatch(html, /and accessibility of consent controls/i);
});

test("GdprEprivacyCoverageChecklistCard mentions consent-control accessibility only when reviewable", () => {
  const html = renderToStaticMarkup(
    createElement(GdprEprivacyCoverageChecklistCard, {
      defaultOpen: true,
      items: [
        makeChecklistItem({
          assessmentStatus: "review_signal",
          evidenceState: "observed",
          id: "accessibility_consent_controls",
          status: "Review signal",
          tone: "review"
        })
      ]
    })
  );

  assert.match(html, /consent-control accessibility/i);
});

test("GdprEprivacyCoverageChecklistCard uses persistence wording without reduction metric", () => {
  const html = renderToStaticMarkup(
    createElement(GdprEprivacyCoverageChecklistCard, {
      defaultOpen: true,
      items: [
        makeChecklistItem({
          assessmentStatus: "gap_observed",
          evidenceState: "observed",
          id: "post_reject_tracking_reduction",
          label: "Post-reject tracking reduction",
          status: "Gap observed",
          tone: "warning"
        })
      ]
    })
  );

  assert.match(html, /Potential gap from retained scanner evidence; Test row basis/i);
  assert.doesNotMatch(html, /did not materially decrease/i);
});

test("GdprEprivacyCoverageChecklistCard names social media providers and timing", () => {
  const html = renderToStaticMarkup(
    createElement(GdprEprivacyCoverageChecklistCard, {
      defaultOpen: true,
      items: [
        makeChecklistItem({
          assessmentStatus: "gap_observed",
          criticalEvidence: {
            retainedEvidence: {
              firstSocialMediaEmbedObservedMs: 1390,
              providers: ["Meta/Facebook", "LinkedIn"],
              socialMediaEmbedDomains: ["connect.facebook.net", "px.ads.linkedin.com"],
              socialMediaEmbedObservations: [
                {
                  domain: "connect.facebook.net",
                  firstSeenMs: 1390,
                  provider: "Meta/Facebook"
                },
                {
                  domain: "px.ads.linkedin.com",
                  firstSeenMs: 1820,
                  provider: "LinkedIn"
                }
              ]
            },
            statusBasis:
              "A social/media embed, plugin, widget, or pixel provider loaded before any recorded consent choice in retained network/runtime evidence."
          },
          evidenceState: "observed",
          id: "social_media_embed_pre_consent",
          label: "Social/media embeds or plugins loaded before consent",
          status: "Gap observed",
          tone: "warning"
        })
      ]
    })
  );

  assert.match(html, /Meta\/Facebook/);
  assert.match(html, /LinkedIn/);
  assert.match(html, /first seen 1.39s after scan start/i);
  assert.doesNotMatch(html, /Potential gap from retained scanner evidence; A social\/media embed, plugin, widget, or pixel provider loaded before any recorded consent choice in retained network\/runtime evidence\\./i);
});

test("GdprEprivacyCoverageChecklistCard keeps generic cross-border asset hosts out of lead copy", () => {
  const html = renderToStaticMarkup(
    createElement(GdprEprivacyCoverageChecklistCard, {
      defaultOpen: true,
      items: [
        makeChecklistItem({
          assessmentStatus: "gap_observed",
          criticalEvidence: {
            missingOrIncompleteSourceSignals: [],
            pipeline: {
              concernPolicyKey: "gdpr_eprivacy_coverage.cross_border_endpoint_review.gap_observed",
              projectionStage: "unified_finding",
              wc01NormalizedConcernKey: "gdpr_eprivacy.coverage.cross_border_endpoint_review",
              ws01EvidenceRole: "observed runtime signal identification, evidence capture, and logging"
            },
            projectedFindings: [],
            retainedEvidence: {
              evidenceHighlights: [
                "Transfer-relevant analytics / behavioral tracking endpoints were observed for Google Tag Manager, Google Analytics, and Microsoft Clarity. Additional 3rd party asset endpoints were retained as supporting runtime context."
              ],
              evidenceRefs: ["cdnjs.cloudflare.com", "fonts.gstatic.com"],
              status: "Gap observed"
            },
            statusBasis: "Canonical cross-border endpoint finding projected."
          },
          evidenceRefs: ["cdnjs.cloudflare.com", "fonts.gstatic.com"],
          evidenceState: "observed",
          id: "cross_border_endpoint_review",
          label: "Cross-border analytics / tracking endpoint review",
          status: "Gap observed",
          tone: "warning"
        })
      ]
    })
  );

  assert.match(html, /Google Tag Manager, Google Analytics, and Microsoft Clarity/i);
  assert.match(html, /Additional 3rd party asset endpoints were retained as supporting runtime context/i);
});

test("GdprEprivacyCoverageChecklistCard does not throw when retained row rationale text is missing", () => {
  const item = makeChecklistItem({
    criticalEvidence: {
      missingOrIncompleteSourceSignals: [],
      pipeline: {
        concernPolicyKey: "gdpr_eprivacy_coverage.retention_disclosure.not_confirmed",
        projectionStage: "coverage_policy",
        wc01NormalizedConcernKey: "gdpr_eprivacy.coverage.retention_disclosure",
        ws01EvidenceRole: "observed policy-surface evidence capture and logging"
      },
      projectedFindings: [],
      retainedEvidence: {},
      statusBasis: undefined
    },
    evidenceRefs: [],
    evidenceState: "not_observed",
    explanation: undefined,
    id: "retention_disclosure",
    label: "Retention disclosure",
    note: undefined,
    status: "Not confirmed",
    tone: "warning"
  });

  const html = renderToStaticMarkup(
    createElement(GdprEprivacyCoverageChecklistCard, {
      defaultOpen: true,
      items: [item],
      showSummaryStrip: false
    })
  );

  assert.match(html, /Not confirmed from retained scanner evidence/);
});

test("GdprEprivacyCoverageChecklistCard uses retained status basis for visible scan-context notes", () => {
  const html = renderToStaticMarkup(
    createElement(GdprEprivacyCoverageChecklistCard, {
      defaultOpen: true,
      items: [
        makeChecklistItem({
          assessmentStatus: "checked",
          criticalEvidence: {
            missingOrIncompleteSourceSignals: [],
            retainedEvidence: {
              consentSurfaceObserved: true,
              visibleChoiceLabels: ["Accept", "Reject"]
            },
            statusBasis: "A first-layer cookie notice was observed with actionable Accept and Decline controls."
          },
          evidenceState: "observed",
          explanation: "",
          id: "consent_surface_observed",
          label: "Consent mechanism",
          note: "",
          status: "Observed"
        })
      ],
      showSummaryStrip: false
    })
  );

  assert.match(html, /A first-layer cookie notice was observed with actionable Accept and Decline controls/);
  assert.doesNotMatch(html, /Retained scanner evidence was evaluated for this checklist row/);
});
