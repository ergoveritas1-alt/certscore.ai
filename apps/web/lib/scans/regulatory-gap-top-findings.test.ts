import assert from "node:assert/strict";
import test from "node:test";

import { buildRegulatoryGapTopFindings } from "./regulatory-gap-top-findings";

test("buildRegulatoryGapTopFindings promotes GDPR and CCPA gap-observed rows only", () => {
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
          id: "privacy_notice",
          label: "Privacy notice",
          note: "Observed."
        }
      ]
    },
    californiaPrivacyArea: {
      id: "california_ccpa_cpra",
      title: "California privacy",
      rows: [
        {
          assessmentStatus: "gap_observed",
          evidenceRefs: ["ccpa-ref-1"],
          id: "sale_share_control",
          label: "Do Not Sell or Share availability",
          note: "No retained privacy choice path was confirmed.",
          statusLabel: "Potential gap"
        }
      ]
    }
  });

  assert.deepEqual(findings.map((finding) => finding.id), [
    "regulatory_gap__california_ccpa_cpra__sale_share_control",
    "regulatory_gap__gdpr_eprivacy__pre_consent_third_party_tracking"
  ]);
  assert.equal(findings[0]?.label, "CCPA/CPRA gap observed: Do Not Sell or Share availability");
  assert.equal(findings[0]?.severity, "high");
  assert.equal(findings[0]?.section, "Privacy & Tracking");
  assert.equal(findings[0]?.evidenceRefs[0], "ccpa-ref-1");
  assert.equal(
    findings.some((finding) => finding.id.includes("privacy_notice")),
    false
  );
  assert.match(
    findings.map((finding) => finding.whyItMatters).join("\n"),
    /not a legal conclusion/
  );
});
