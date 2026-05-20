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

function makeFingerprintingFinding(id: string, priority = 95): CertScoreFinding {
  return {
    ...makeFinding(id, priority),
    section: "Fingerprinting"
  };
}

test("selectTopFindings can select the consent dark-pattern umbrella while excluding support/context findings", () => {
  const selected = selectTopFindings(
    [
      makeFinding("consent_dark_patterns_detected", 200),
      makeFinding("asymmetric_consent_ui", 84),
      makeFinding("forced_consent_interaction", 86),
      makePrivacyFinding("pre_consent_tracking_detected", 100)
    ],
    2
  );

  assert.deepEqual(
    selected.map((finding) => finding.id),
    ["pre_consent_tracking_detected", "consent_dark_patterns_detected"]
  );
});

test("selectTopFindings suppresses cookie-before-consent when broader pre-consent tracking is present", () => {
  const selected = selectTopFindings(
    [
      makePrivacyFinding("third_party_cookie_pre_consent", 200),
      makePrivacyFinding("pre_consent_tracking_detected", 100),
      makeFinding("consent_dark_patterns_detected", 90)
    ],
    3
  );

  assert.ok(selected.some((finding) => finding.id === "pre_consent_tracking_detected"));
  assert.ok(!selected.some((finding) => finding.id === "third_party_cookie_pre_consent"));
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

test("selectTopFindings forces CPRA CBA opt-out missing into top findings", () => {
  const selected = selectTopFindings(
    [
      makePrivacyFinding("pre_consent_tracking_detected", 100),
      makePrivacyFinding("rtb_cookie_sync_observed", 94),
      makeFinding("visual_contrast_accessibility_issue", 72),
      makePrivacyFinding("cpra_cba_opt_out_missing", 96),
      makeFinding("some_consent_finding", 95)
    ],
    3
  );

  assert.ok(selected.some((finding) => finding.id === "cpra_cba_opt_out_missing"));
});

test("selectTopFindings only selects curated executive summary top findings", () => {
  const selected = selectTopFindings(
    [
      makePrivacyFinding("pre_consent_tracking_detected", 100),
      makePrivacyFinding("rtb_cookie_sync_observed", 200),
      makePrivacyFinding("cookie_disclosure_gap", 199),
      makeFinding("reject_option_missing_or_hidden", 98),
      makeFinding("blocking_overlay_observed", 250)
    ],
    4
  );

  assert.deepEqual(
    selected.map((finding) => finding.id),
    ["pre_consent_tracking_detected", "rtb_cookie_sync_observed", "reject_option_missing_or_hidden"]
  );
});

test("selectTopFindings lets ranked consent UI subtypes compete under the section cap", () => {
  const selected = selectTopFindings(
    [
      makeFinding("asymmetric_consent_ui", 120),
      makeFinding("forced_consent_interaction", 110),
      makeFinding("consent_dark_patterns_detected", 100),
      makeFinding("reject_option_missing_or_hidden", 90),
      makePrivacyFinding("pre_consent_tracking_detected", 100)
    ],
    5
  );

  assert.deepEqual(
    selected.map((finding) => finding.id),
    ["pre_consent_tracking_detected", "asymmetric_consent_ui", "forced_consent_interaction"]
  );
});

test("selectTopFindings suppresses fingerprinting-related signals when probable fingerprinting is present", () => {
  const selected = selectTopFindings(
    [
      makeFingerprintingFinding("fingerprinting_related_signals_observed", 120),
      makeFingerprintingFinding("probable_fingerprinting", 93),
      makePrivacyFinding("pre_consent_tracking_detected", 100)
    ],
    3
  );

  assert.ok(selected.some((finding) => finding.id === "probable_fingerprinting"));
  assert.ok(!selected.some((finding) => finding.id === "fingerprinting_related_signals_observed"));
});
