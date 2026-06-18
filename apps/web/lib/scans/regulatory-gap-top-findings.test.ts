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
          label: "Pre-consent cookies/storage observed",
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
          label: "Reject option observed",
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
          label: "Advertising / retargeting vendor signal observed",
          note: "A retained adtech vendor signal was observed before consent."
        },
        {
          assessmentStatus: "checked",
          evidenceState: "observed",
          id: "analytics_vendor_observed",
          label: "Analytics vendor signal observed",
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
    "regulatory_gap__gdpr_eprivacy__pre_consent_cookies_storage",
    "regulatory_gap__gdpr_eprivacy__reject_all_path_availability",
    "regulatory_gap__gdpr_eprivacy__cookie_notice_policy_availability",
    "regulatory_gap__gdpr_eprivacy__advertising_retargeting_vendor_signal_observed",
    "regulatory_gap__gdpr_eprivacy__analytics_vendor_observed"
  ]);
  assert.equal(findings[0]?.label, "Pre-consent third-party tracking");
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
