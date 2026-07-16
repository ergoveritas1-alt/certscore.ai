import assert from "node:assert/strict";
import test from "node:test";

import { buildRegulatoryGapTopFindings } from "./regulatory-gap-top-findings";

test("buildRegulatoryGapTopFindings promotes potential-concern rows only", () => {
  const findings = buildRegulatoryGapTopFindings({
    gdprEprivacyArea: {
      id: "gdpr_eprivacy",
      title: "GDPR / ePrivacy",
      rows: [
        {
          assessmentStatus: "gap_observed",
          evidenceRefs: ["gdpr-ref-1"],
          explanation: "Tracking fired before consent.",
          id: "pre_consent_third_party_tracking",
          label: "Pre-consent third-party tracking",
          note: "Advertising and analytics before consent.",
          regulatoryMapping: ["ePrivacy consent"]
        },
        {
          assessmentStatus: "checked",
          evidenceState: "observed",
          id: "pre_consent_cookies_storage",
          label: "Pre-consent cookies/storage",
          note: "Non-essential storage was retained.",
          criticalEvidence: {
            retainedEvidence: {
              advertisingCookieStorageObserved: true
            }
          }
        },
        {
          assessmentStatus: "checked",
          evidenceState: "not_observed",
          id: "reject_all_path_availability",
          label: "Reject option",
          note: "No reject option was observed while runtime tracking existed.",
          criticalEvidence: {
            retainedEvidence: {
              bannerObserved: true
            }
          },
          status: "Not observed"
        },
        {
          assessmentStatus: "checked",
          evidenceState: "not_observed",
          id: "accept_consent_control",
          label: "Accept consent control",
          note: "No accept consent control was observed while runtime tracking existed.",
          criticalEvidence: {
            retainedEvidence: {
              bannerObserved: true
            }
          },
          status: "Not observed"
        },
        {
          assessmentStatus: "checked",
          evidenceState: "not_observed",
          id: "options_settings_preferences_control",
          label: "Options / settings / preferences control",
          note: "No options/settings/preferences control was observed while runtime tracking existed.",
          criticalEvidence: {
            retainedEvidence: {
              bannerObserved: true
            }
          },
          status: "Not observed"
        },
        {
          assessmentStatus: "checked",
          evidenceState: "not_observed",
          id: "cookie_notice_policy_availability",
          label: "Cookie notice / cookie policy availability",
          note: "No cookie notice was retained while runtime tracking existed.",
          criticalEvidence: {
            retainedEvidence: {
              preConsentThirdPartyTrackingObserved: true
            }
          },
          status: "Not observed"
        },
        {
          assessmentStatus: "checked",
          evidenceState: "observed",
          id: "advertising_retargeting_vendor_signal_observed",
          label: "Advertising / retargeting vendor signal",
          note: "A retained adtech vendor signal was observed before consent."
        },
        {
          assessmentStatus: "checked",
          evidenceState: "observed",
          id: "analytics_vendor_observed",
          label: "Analytics vendor signal",
          note: "Google Analytics was observed before consent."
        },
        {
          assessmentStatus: "checked",
          evidenceState: "not_observed",
          id: "pre_consent_third_party_tracking",
          label: "Pre-consent third-party tracking absent",
          note: "No pre-consent third-party tracking was observed.",
          status: "Not observed"
        },
        {
          assessmentStatus: "checked",
          evidenceState: "observed",
          id: "privacy_notice",
          label: "Privacy notice",
          note: "Observed."
        },
        {
          assessmentStatus: "checked",
          evidenceState: "not_observed",
          id: "retention_disclosure",
          label: "Retention disclosure",
          note: "Not confirmed from retained policy-surface evidence.",
          status: "Not confirmed"
        },
        {
          assessmentDirection: "review_signal",
          assessmentStatus: "review_signal",
          evidenceLabel: "Partial concern",
          evidenceState: "not_observed",
          id: "preference_withdrawal_control",
          label: "Preference withdrawal control",
          note: "Partial support from retained scanner evidence.",
          status: "Not observed"
        },
        {
          assessmentStatus: "review_signal",
          evidenceState: "observed",
          id: "retargeting_behavioral_advertising_signal_observed",
          label: "Retargeting / behavioral advertising signal",
          note: "Behavioral advertising evidence was retained for purpose review.",
          status: "Review signal"
        },
        {
          assessmentStatus: "review_signal",
          evidenceState: "observed",
          id: "analytics_vendor_observed",
          label: "Low-specificity analytics review",
          note: "Vendor purpose requires review."
        }
      ]
    }
  });

  assert.deepEqual(findings.map((finding) => finding.id), [
    "regulatory_gap__gdpr_eprivacy__pre_consent_third_party_tracking",
    "regulatory_gap__gdpr_eprivacy__reject_all_path_availability",
    "regulatory_gap__gdpr_eprivacy__accept_consent_control",
    "regulatory_gap__gdpr_eprivacy__options_settings_preferences_control",
    "regulatory_gap__gdpr_eprivacy__cookie_notice_policy_availability",
    "regulatory_gap__gdpr_eprivacy__retention_disclosure",
    "regulatory_gap__gdpr_eprivacy__preference_withdrawal_control"
  ]);
  assert.deepEqual(
    findings.map((finding) => finding.evidenceDetails?.policyEvidenceDetails?.regulatoryConcernKind),
    [
      "potential_gap",
      "potential_gap",
      "potential_gap",
      "potential_gap",
      "potential_gap",
      "partial_rating",
      "partial_rating"
    ]
  );
  assert.equal(findings[0]?.label, "Pre-consent tracking, storage, and embedded services");
  assert.equal(
    Array.isArray(findings[0]?.evidenceDetails?.policyEvidenceDetails?.groupedRuntimeSignals),
    true,
  );
  assert.equal(findings.at(-1)?.label, "Preference withdrawal control");
  assert.deepEqual(findings.slice(1, 4).map((finding) => finding.label), [
    "Reject option",
    "Accept consent control",
    "Options / settings / preferences control"
  ]);
  assert.equal(findings[0]?.severity, "high");
  assert.equal(findings[0]?.section, "Privacy & Tracking");
  assert.equal(findings[0]?.evidenceRefs[0], "gdpr-ref-1");
  assert.equal(
    findings.some((finding) => finding.id.includes("privacy_notice")),
    false
  );
  assert.match(
    findings.map((finding) => finding.whyItMatters).join("\n"),
    /not a legal conclusion/
  );
  assert.equal(findings[0]?.shortSummary, "Advertising and analytics before consent.");
  assert.doesNotMatch(
    findings.map((finding) => finding.shortSummary).join("\n"),
    /checklist potential concern/i
  );
});

test("buildRegulatoryGapTopFindings keeps consent-control review rows when CMP expectation is retained", () => {
  const findings = buildRegulatoryGapTopFindings({
    gdprEprivacyArea: {
      id: "gdpr_eprivacy",
      title: "GDPR / ePrivacy",
      rows: [
        {
          assessmentStatus: "gap_observed",
          evidenceRefs: ["gdpr-ref-1"],
          explanation: "Tracking fired before consent.",
          id: "pre_consent_third_party_tracking",
          label: "Pre-consent third-party tracking",
          note: "Advertising and analytics before consent.",
          regulatoryMapping: ["ePrivacy consent"]
        },
        {
          assessmentStatus: "review_signal",
          evidenceLabel: "Partial",
          evidenceState: "not_observed",
          id: "reject_all_path_availability",
          label: "Reject / decline control",
          note: "No structured reject control was retained.",
          status: "Review signal",
          criticalEvidence: {
            retainedEvidence: {
              cmpSignalObserved: true,
              consentSurfaceObserved: true,
              preconsentCookieOrTrackingActivityObserved: true,
              rejectControlObserved: false
            }
          }
        },
        {
          assessmentStatus: "review_signal",
          evidenceLabel: "Partial",
          evidenceState: "not_observed",
          id: "accept_consent_control",
          label: "Accept consent control",
          note: "No structured accept control was retained.",
          status: "Review signal",
          criticalEvidence: {
            retainedEvidence: {
              acceptControlObserved: false,
              cmpSignalObserved: true,
              consentSurfaceObserved: true,
              preconsentCookieOrTrackingActivityObserved: true
            }
          }
        },
        {
          assessmentStatus: "review_signal",
          evidenceLabel: "Partial",
          evidenceState: "not_observed",
          id: "options_settings_preferences_control",
          label: "Options / settings / preferences control",
          note: "No structured options/settings/preferences control was retained.",
          status: "Review signal",
          criticalEvidence: {
            retainedEvidence: {
              cmpSignalObserved: true,
              consentSurfaceObserved: true,
              optionsControlObserved: false,
              preconsentCookieOrTrackingActivityObserved: true
            }
          }
        },
        {
          assessmentStatus: "review_signal",
          evidenceLabel: "Partial",
          evidenceState: "not_observed",
          id: "preference_withdrawal_control",
          label: "Preference withdrawal control",
          note: "Partial support from retained scanner evidence.",
          status: "Review signal"
        }
      ]
    }
  });

  assert.deepEqual(findings.map((finding) => finding.id), [
    "regulatory_gap__gdpr_eprivacy__pre_consent_third_party_tracking",
    "regulatory_gap__gdpr_eprivacy__reject_all_path_availability",
    "regulatory_gap__gdpr_eprivacy__accept_consent_control",
    "regulatory_gap__gdpr_eprivacy__options_settings_preferences_control"
  ]);
  assert.deepEqual(findings.slice(1).map((finding) =>
    finding.evidenceDetails?.policyEvidenceDetails?.regulatoryConcernKind
  ), ["potential_gap", "potential_gap", "potential_gap"]);
});

test("buildRegulatoryGapTopFindings keeps Article 13 extraction limitations out of high regulatory findings", () => {
  const findings = buildRegulatoryGapTopFindings({
    gdprEprivacyArea: {
      id: "gdpr_eprivacy",
      title: "GDPR / ePrivacy",
      rows: [
        {
          assessmentStatus: "checked",
          evidenceLabel: "Partial",
          evidenceState: "not_observed",
          id: "legal_basis_disclosure_observed",
          label: "Legal basis disclosure",
          note: "Policy text extraction low_quality_extracted_code_or_config; 1326 characters retained; 2500 required.",
          status: "Not confirmed",
          criticalEvidence: {
            retainedEvidence: {
              policyTextExtractionHealth: {
                policyTextExtractionStatus: "low_quality_extracted_code_or_config"
              },
              signalObserved: "not_confirmed_extraction_limited"
            },
            statusBasis: "Limitation: policy text extraction was not usable for Article 13 disclosure review"
          }
        },
        {
          assessmentStatus: "checked",
          evidenceLabel: "Partial",
          evidenceState: "not_observed",
          id: "retention_disclosure",
          label: "Legacy retention review row",
          note: "Partial support from retained policy evidence.",
          status: "Not confirmed"
        }
      ]
    }
  });

  assert.equal(
    findings.some((finding) => finding.id === "regulatory_gap__gdpr_eprivacy__legal_basis_disclosure_observed"),
    false
  );
  assert.equal(
    findings.some((finding) => finding.id === "regulatory_gap__gdpr_eprivacy__retention_disclosure"),
    true
  );
});

test("buildRegulatoryGapTopFindings does not promote gap-observed unknown-only no-go runtime rows", () => {
  const findings = buildRegulatoryGapTopFindings({
    gdprEprivacyArea: {
      id: "gdpr_eprivacy",
      title: "GDPR / ePrivacy",
      rows: [
        {
          assessmentStatus: "gap_observed",
          evidenceState: "observed",
          id: "pre_consent_third_party_tracking",
          label: "Pre-consent third-party tracking",
          note: "Coverage-limited scan quality no-go; unknown request rows only.",
          status: "Gap observed",
          criticalEvidence: {
            retainedEvidence: {
              preconsentPurposeRiskMix: {},
              requestRows: [
                { hostname: "res.cloudinary.com", vendorCategory: "unknown" },
                { hostname: "dev.visualwebsiteoptimizer.com", vendorCategory: "unknown" }
              ],
              scanQualityVisualNoGoObserved: true,
              trackerPriority: "review_needed"
            }
          }
        },
        {
          assessmentStatus: "gap_observed",
          evidenceState: "observed",
          id: "pre_consent_third_party_tracking",
          label: "Pre-consent third-party tracking with ad evidence",
          note: "Advertising endpoint fired before consent.",
          status: "Gap observed",
          criticalEvidence: {
            retainedEvidence: {
              preconsentPurposeRiskMix: {
                advertising: ["Google Ads"]
              },
              scanQualityVisualNoGoObserved: true,
              trackerPriority: "high"
            }
          }
        }
      ]
    }
  });

  assert.deepEqual(findings.map((finding) => finding.label), [
    "Pre-consent third-party tracking with ad evidence"
  ]);
});

test("buildRegulatoryGapTopFindings does not promote contextual-only pre-consent tracking", () => {
  const findings = buildRegulatoryGapTopFindings({
    gdprEprivacyArea: {
      id: "gdpr_eprivacy",
      title: "GDPR / ePrivacy",
      rows: [
        {
          assessmentStatus: "checked",
          criticalEvidence: {
            retainedEvidence: {
              firstPreconsentThirdPartyTrackingObservedMs: 9449,
              preconsentThirdPartyTrackerGroups: [
                {
                  firstSeenMs: 9449,
                  party: "3rd",
                  priority: "contextual",
                  purpose: "Cookie compliance",
                  vendor: "OneTrust CMP"
                },
                {
                  firstSeenMs: null,
                  party: "3rd",
                  priority: "contextual",
                  purpose: "Security",
                  vendor: "Cloudflare Bot Management"
                }
              ],
              preconsentThirdPartyTrackingVendors: ["OneTrust CMP", "Cloudflare Bot Management"],
              trackerPriority: "contextual",
              trackerPriorityLabel: "Contextual"
            },
            statusBasis:
              "Contextual priority pre-consent third-party tracking evidence: OneTrust CMP - Cookie compliance (9449ms), Cloudflare Bot Management - Security (time not retained)."
          },
          evidenceRefs: [
            "OneTrust CMP Cookie compliance tracker first seen 9449ms",
            "Cloudflare Bot Management Security tracker first seen time not retained"
          ],
          evidenceState: "observed",
          explanation:
            "Contextual priority pre-consent third-party tracking evidence was retained for OneTrust CMP - Cookie compliance (9449ms), Cloudflare Bot Management - Security (time not retained).",
          id: "pre_consent_third_party_tracking",
          label: "Pre-consent 3rd-party tracking",
          status: "Observed"
        }
      ]
    }
  });

  assert.deepEqual(findings, []);
});

test("buildRegulatoryGapTopFindings surfaces review rows only when no stronger rows exist", () => {
  const findings = buildRegulatoryGapTopFindings({
    gdprEprivacyArea: {
      id: "gdpr_eprivacy",
      title: "GDPR / ePrivacy",
      rows: [
        {
          assessmentStatus: "review_signal",
          evidenceState: "observed",
          id: "cross_border_endpoint_review",
          label: "Cross-border endpoint review",
          note: "Endpoint location evidence needs manual review.",
          status: "Review signal"
        },
        {
          assessmentStatus: "checked",
          evidenceState: "observed",
          id: "consent_surface_observed",
          label: "Consent mechanism",
          note: "Observed.",
          status: "Observed"
        }
      ]
    }
  });

  assert.deepEqual(findings.map((finding) => finding.label), ["Cross-border endpoint review"]);
  assert.equal(
    findings[0]?.evidenceDetails?.policyEvidenceDetails?.regulatoryConcernKind,
    "review_signal"
  );
});

test("buildRegulatoryGapTopFindings uses checklist status basis for GDPR row summaries", () => {
  const findings = buildRegulatoryGapTopFindings({
    gdprEprivacyArea: {
      id: "gdpr_eprivacy",
      title: "GDPR / ePrivacy",
      rows: [
        {
          assessmentStatus: "checked",
          criticalEvidence: {
            retainedEvidence: {
              policySurfaceSummary: {
                privacyPolicyPresent: true
              }
            },
            statusBasis:
              "Not confirmed from retained policy-surface evidence; A privacy-policy surface was retained, but retention-period, deletion, anonymization, or data-lifecycle disclosure text was not confidently extracted for this row."
          },
          evidenceState: "not_observed",
          explanation: "Whether retained privacy-policy evidence included a data-retention disclosure signal.",
          id: "retention_disclosure_observed",
          label: "Retention disclosure",
          status: "Not confirmed"
        }
      ]
    }
  });

  assert.equal(findings.length, 1);
  assert.equal(
    findings[0]?.shortSummary,
    "Not confirmed from retained policy-surface evidence; A privacy-policy surface was retained, but retention-period, deletion, anonymization, or data-lifecycle disclosure text was not confidently extracted for this row."
  );
  assert.deepEqual(findings[0]?.evidencePreview, [
    "GDPR / ePrivacy: Retention disclosure",
    "Not confirmed from retained policy-surface evidence; A privacy-policy surface was retained, but retention-period, deletion, anonymization, or data-lifecycle disclosure text was not confidently extracted for this row."
  ]);
});
