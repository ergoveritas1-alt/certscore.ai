import assert from "node:assert/strict";
import test from "node:test";

import type { CertScoreFinding } from "./finding-registry";
import { selectTopFindings } from "./rank-findings";

function makeFinding(id: string, priority = 95): CertScoreFinding {
  return {
    id,
    label: id,
    section: "Consent Experience",
    defaultSurfacePriority: priority,
    whyItMatters: "Test finding.",
    remediation: "Test remediation.",
    confidence: "strong",
    directVsInferred: "direct",
    evidencePreview: ["Evidence"],
    evidenceRefs: [],
    severity: "high",
    shortSummary: "Test summary."
  };
}

function makePrivacyFinding(id: string, priority = 95): CertScoreFinding {
  return {
    ...makeFinding(id, priority),
    section: "Privacy & Tracking"
  };
}

test("selectTopFindings excludes broad consent dark-pattern rollup", () => {
  const selected = selectTopFindings(
    [
      makeFinding("consent_dark_patterns_detected", 200),
      makeFinding("asymmetric_consent_ui", 84),
      makeFinding("forced_consent_interaction", 86)
    ],
    2
  );

  assert.deepEqual(
    selected.map((finding) => finding.id),
    ["forced_consent_interaction", "asymmetric_consent_ui"]
  );
});

test("selectTopFindings forces cross-domain identifier sharing into top findings", () => {
  const selected = selectTopFindings(
    [
      makePrivacyFinding("pre_consent_tracking_detected", 100),
      makePrivacyFinding("reject_tracking_persists_after_reject", 97),
      makePrivacyFinding("cross_domain_identifier_sharing_observed", 95),
      makeFinding("some_consent_finding", 94),
      makeFinding("another_consent_finding", 93)
    ],
    3
  );

  assert.ok(selected.some((finding) => finding.id === "cross_domain_identifier_sharing_observed"));
});
