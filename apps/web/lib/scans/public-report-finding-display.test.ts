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

test("exposes atlas observed copy for scan report descriptors", () => {
  const display = getPublicReportFindingDisplay({
    findingId: "policy_behavior_contradiction_detected",
    label: "Policy/runtime alignment review",
    remediation: "legacy remediation",
    severity: "high"
  });

  assert.equal(
    display.observedSummary,
    "Retained report evidence connected a public policy or disclosure claim to concrete runtime behavior, showed runtime third-party vendors/domains not clearly reflected in retained disclosure evidence, or retained consent-governance disclosure context as a supporting alignment review signal."
  );
});

test("uses scan-quality wording for captured-page visual findings", () => {
  const display = getPublicReportFindingDisplay({
    findingId: "scan_quality_visual_no_go",
    label: "Scan visual access no-go",
    remediation: "legacy remediation",
    severity: "high"
  });

  assert.equal(display.title, "Normal public site was not reached");
  assert.doesNotMatch(display.observedSummary ?? "", /no-go/i);
  assert.match(display.observedSummary ?? "", /withholds scores/i);
  assert.match(display.remediation, /normal browsing path/i);
});

test("preserves reason-specific projected copy for no-go findings", () => {
  const display = getPublicReportFindingDisplay({
    findingId: "scan_quality_visual_no_go",
    observedSummary: "CertScore observed a prelaunch page instead of the public website.",
    remediation: "Retry after the public website launches.",
    title: "The site is not ready for scanning"
  });

  assert.equal(display.title, "The site is not ready for scanning");
  assert.equal(display.observedSummary, "CertScore observed a prelaunch page instead of the public website.");
  assert.match(display.remediation, /public website launches/i);
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
  assert.match(
    getPublicReportConfidenceDefinition({
      confidence: "strong",
      findingId: "scan_quality_visual_no_go",
      section: "Runtime & Diagnostics"
    }),
    /does not by itself determine whether the real public site has a privacy, consent, accessibility, or disclosure issue/i
  );
});

test("unmapped findings use fallback notes instead of guessed atlas links", () => {
  assert.equal(getPublicReportFindingFallbackNote("policy_clarity_risk"), "Policy review signal. Reference page not yet available.");
  assert.equal(getPublicReportFindingFallbackNote("bounded_key_page_discovery_unresolved"), "Review signal. Reference page not yet available.");
  assert.equal(getPublicReportFindingFallbackNote("third_party_cookie_pre_consent"), null);
  assert.equal(getPublicReportFindingFallbackNote("scan_quality_visual_no_go"), "Scan-quality signal. Reference page not yet available.");
});
