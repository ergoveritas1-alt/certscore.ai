import assert from "node:assert/strict";
import test from "node:test";
import {
  getPublicReportConfidenceDefinition,
  getPublicReportFindingDisplay,
  getPublicReportFindingFallbackNote
} from "./public-report-finding-display";

test("uses atlas public titles and criticality for mapped report findings", () => {
  const cases = [
    ["third_party_cookie_pre_consent", "Third-party cookie or storage observed before consent", "high"],
    ["session_recording_services_detected", "Session replay service signal observed", "high"],
    ["fingerprinting_related_signals_observed", "Fingerprinting-related browser/device signals observed", "high"],
    ["cross_domain_identifier_sharing_observed", "Identifier-like values observed across domains", "high"],
    ["cpra_cba_opt_out_missing", "CPRA / privacy choice opt-out review signal", "high"],
    ["visual_contrast_accessibility_issue", "Visual contrast accessibility issue", "medium"],
    ["keyboard_navigation_accessibility_issue", "Keyboard navigation accessibility issue", "medium"],
    ["probable_fingerprinting", "Probable browser/device fingerprinting review signal", "critical"]
  ] as const;

  for (const [findingId, title, criticality] of cases) {
    const display = getPublicReportFindingDisplay({
      findingId,
      label: "legacy label",
      remediation: "legacy remediation",
      severity: "low"
    });
    assert.equal(display.title, title);
    assert.equal(display.criticality, criticality);
  }
});

test("does not render known stale mapped report titles", () => {
  const staleTitleCases = [
    ["third_party_cookie_pre_consent", "Tracking cookies set before consent"],
    ["session_recording_services_detected", "Session recording services detected"],
    ["fingerprinting_related_signals_observed", "Fingerprinting-related signals observed"],
    ["cross_domain_identifier_sharing_observed", "Identifiers shared across domains"],
    ["cpra_cba_opt_out_missing", "CPRA CBA opt-out missing"]
  ] as const;

  for (const [findingId, staleTitle] of staleTitleCases) {
    const display = getPublicReportFindingDisplay({
      findingId,
      label: staleTitle,
      remediation: "legacy remediation",
      severity: "high"
    });
    assert.notEqual(display.title, staleTitle);
  }
});

test("family confidence tooltips avoid cross-family leakage", () => {
  assert.match(
    getPublicReportConfidenceDefinition({
      confidence: "moderate",
      findingId: "visual_contrast_accessibility_issue",
      section: "Accessibility"
    }),
    /automated accessibility evidence/i
  );
  assert.doesNotMatch(
    getPublicReportConfidenceDefinition({
      confidence: "moderate",
      findingId: "visual_contrast_accessibility_issue",
      section: "Accessibility"
    }),
    /tracking request before a consent choice/i
  );
  assert.match(
    getPublicReportConfidenceDefinition({
      confidence: "moderate",
      findingId: "session_recording_services_detected"
    }),
    /without determining keystroke capture, screenshot capture, sensitive-value capture, or recording retention/i
  );
  assert.match(
    getPublicReportConfidenceDefinition({
      confidence: "moderate",
      findingId: "cpra_cba_opt_out_missing"
    }),
    /without determining CPRA applicability, sale\/share status, opt-out sufficiency, GPC handling, or compliance status/i
  );
});

test("unmapped findings use fallback notes instead of guessed atlas links", () => {
  assert.equal(getPublicReportFindingFallbackNote("policy_clarity_risk"), "Policy review signal. Reference page not yet available.");
  assert.equal(getPublicReportFindingFallbackNote("bounded_key_page_discovery_unresolved"), "Review signal. Reference page not yet available.");
  assert.equal(getPublicReportFindingFallbackNote("third_party_cookie_pre_consent"), null);
});
