import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  GdprEprivacyCoverageChecklistCard,
  GdprEprivacyCoverageSummaryPills,
  getAssessmentDirection
} from "./gdpr-eprivacy-coverage-checklist-card";
import type { GdprEprivacyCoverageChecklistItem } from "../../lib/scans/gdpr-eprivacy-coverage-checklist";

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
      label: "Consent framework / CMP signal observed",
      status: "Observed"
    })),
    "neutral_signal"
  );
  assert.equal(
    getAssessmentDirection(makeChecklistItem({
      assessmentStatus: "review_signal",
      evidenceState: "observed",
      id: "analytics_vendor_observed",
      label: "Analytics vendor signal observed",
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
      label: "Analytics vendor signal observed",
      status: "Review signal"
    })),
    "potential_concern"
  );
  assert.equal(
    getAssessmentDirection(makeChecklistItem({
      assessmentStatus: "gap_observed",
      evidenceState: "observed",
      id: "advertising_retargeting_vendor_signal_observed",
      label: "Advertising vendor signal observed",
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
      label: "Advertising vendor signal observed",
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
      label: "Advertising vendor signal observed",
      status: "Review signal"
    })),
    "review_signal"
  );
  assert.equal(
    getAssessmentDirection(makeChecklistItem({
      assessmentStatus: "checked",
      evidenceState: "observed",
      id: "advertising_retargeting_vendor_signal_observed",
      label: "Advertising vendor signal observed",
      status: "Observed"
    })),
    "review_signal"
  );
  assert.equal(
    getAssessmentDirection(makeChecklistItem({
      assessmentStatus: "checked",
      evidenceState: "not_observed",
      id: "pre_consent_third_party_tracking",
      label: "Pre-consent third-party tracking observed",
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
      label: "Pre-consent cookies/storage observed",
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
      label: "Pre-consent cookies/storage observed",
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
      label: "Pre-consent cookies/storage observed",
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
      label: "Device identification / fingerprinting signal observed",
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
      label: "Device identification / fingerprinting signal observed",
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
      label: "Embedded third-party content loaded before consent",
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
      label: "Embedded third-party content loaded before consent",
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
          label: "Advertising vendor signal observed",
          status: "Review signal",
          tone: "review"
        })
      ],
      showSummaryStrip: false
    })
  );

  assert.match(html, />Partial</);
  assert.doesNotMatch(html, />Observed</);
  assert.match(html, /No advertising infrastructure classification was retained/);
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
              "Tracking requests observed before consent: Quantcast Measure, Google Ads / DoubleClick, and BrightLine; first seen 521ms after scan start. Consent action was not recorded before these requests."
          },
          evidenceState: "observed",
          id: "pre_consent_third_party_tracking",
          label: "Pre-consent third-party tracking observed",
          note:
            "Tracking requests observed before consent: Quantcast Measure, Google Ads / DoubleClick, and BrightLine; first seen 521ms after scan start. Consent action was not recorded before these requests.",
          status: "Gap observed"
        })
      ],
      showSummaryStrip: false
    })
  );

  assert.match(
    html,
    /Pre-consent tracking evidence was retained before consent: Quantcast Measure \(tracking, 521ms\), Google Ads \/ DoubleClick \(advertising measurement, 521ms\), and BrightLine; first seen 521ms after scan start; no consent action was recorded first\./
  );
  assert.match(html, /aria-label="Potential gap"/);
  assert.match(html, /border-rose-200 bg-rose-50 text-rose-700/);
  assert.match(html, /M10 4\.2 17 16H3L10 4\.2Z/);
  assert.doesNotMatch(html, /Why this result/);
  assert.doesNotMatch(html, /Evidence summary/);
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
            statusBasis: "Runtime third-party request timing was retained before any recorded consent action."
          },
          evidenceState: "observed",
          id: "pre_consent_third_party_tracking",
          label: "Pre-consent third-party tracking observed",
          status: "Review signal"
        })
      ],
      showSummaryStrip: false
    })
  );

  assert.match(
    html,
    /Tracking-classified third-party requests fired before any recorded consent action; first seen 2944ms after scan start/
  );
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
          label: "Advertising vendor signal observed",
          note:
            "Advertising vendor signals were observed; first seen 521ms after scan start; before any recorded consent action.",
          status: "Review signal"
        })
      ],
      showSummaryStrip: false
    })
  );

  assert.match(
    html,
    /Advertising-infrastructure evidence was partially retained before consent: Google Ads \/ DoubleClick \(advertising measurement, 521ms\); first seen 521ms after scan start; no consent action was recorded first\./
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
              "Concrete third-party embedded content was retained before consent in iframe/runtime evidence."
          },
          evidenceState: "observed",
          id: "embedded_content_pre_consent",
          label: "Embedded third-party content loaded before consent",
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
          label: "Pre-consent third-party tracking observed",
          status: "Gap observed"
        })
      ],
      showSummaryStrip: false
    })
  );

  assert.match(html, /aria-label="Toggle evidence packet for Pre-consent third-party tracking observed"/);
  assert.match(html, /aria-label="Toggle correction steps for Pre-consent third-party tracking observed"/);
  assert.doesNotMatch(html, />Evidence packet</);
  assert.doesNotMatch(html, />Correction steps</);
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
          label: "Retention disclosure observed",
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
          label: "International transfer disclosure observed",
          status: "Observed"
        })
      ],
      showSummaryStrip: false
    })
  );

  assert.match(html, /Policy text includes international-transfer\/safeguards disclosure/);
  assert.match(html, /transparency signal only/);
  assert.match(html, /does not validate the sufficiency of the transfer mechanism/);
  assert.match(html, /adequate level of data protection/);
  assert.match(html, /standard contractual clauses/);
  assert.doesNotMatch(html, /Policy text included matching disclosure evidence/);
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
          label: "International transfer disclosure observed",
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
    label: "Legal basis disclosure observed",
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
    label: "Pre-consent third-party tracking observed",
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
  assert.doesNotMatch(html, /Tracking-classified third-party requests fired before any recorded consent action/);
});

test("GdprEprivacyCoverageSummaryPills summarizes row decisions instead of evidence labels", () => {
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
      label: "Consent framework / CMP signal observed",
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
      label: "Analytics vendor signal observed",
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
      label: "Pre-consent third-party tracking observed",
      status: "Gap observed"
    })
  ];
  const html = renderToStaticMarkup(
    createElement(GdprEprivacyCoverageSummaryPills, { items })
  );

  assert.match(html, /gaps observed/);
  assert.match(html, /partial concerns/);
  assert.match(html, /review/);
  assert.match(html, /positive/);
  assert.match(html, /neutral/);
  assert.doesNotMatch(html, /review signals/);
  assert.doesNotMatch(html, /positive signals/);
  assert.doesNotMatch(html, /neutral signals/);
  assert.doesNotMatch(html, /potential concerns/);
  assert.doesNotMatch(html, /potential gaps/);
  assert.doesNotMatch(html, />partial</);
  assert.doesNotMatch(html, />observed</);
  assert.match(html, /M10 4\.2 17 16H3L10 4\.2Z/);
  assert.match(html, /<circle cx="10" cy="10" r="6\.8"/);
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
              "Resolve vendor and purpose for third-party endpoints"
            ]
          },
          evidenceState: "observed",
          id: "pre_consent_third_party_tracking",
          label: "Pre-consent third-party tracking",
          status: "Gap observed",
          tone: "warning"
        })
      ]
    })
  );

  assert.match(html, /Confidence: 7/);
  assert.match(html, /Improve confidence: Retain request timing relative to consent state/);
  assert.match(html, /Resolve vendor and purpose for third-party endpoints/);
});

test("GdprEprivacyCoverageChecklistCard avoids duplicate observed wording for not-observed rows", () => {
  const html = renderToStaticMarkup(
    createElement(GdprEprivacyCoverageChecklistCard, {
      defaultOpen: true,
      items: [
        makeChecklistItem({
          id: "controller_contact_disclosure",
          label: "Controller/contact disclosure observed",
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
          label: "Pre-consent third-party tracking",
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
  assert.match(html, /Partial/);
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
    label: "Pre-consent third-party tracking",
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
                "Transfer-relevant analytics / behavioral tracking endpoints were observed for Google Tag Manager, Google Analytics, and Microsoft Clarity. Additional third-party asset endpoints were retained as supporting runtime context."
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
  assert.match(html, /Additional third-party asset endpoints were retained as supporting runtime context/i);
});
