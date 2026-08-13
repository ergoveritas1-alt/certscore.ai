import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluatePrivacyPolicyCalibration,
  summarizePrivacyPolicyCalibrationBundle,
  type PrivacyPolicyCalibrationSite,
} from "./verify-privacy-policy-capture-calibration.ts";

function site(input: Partial<PrivacyPolicyCalibrationSite> & { domain: string }): PrivacyPolicyCalibrationSite {
  return {
    captured: true,
    completed: true,
    documentFetchFailed: false,
    documentFetchSkippedBudget: false,
    evidenceIntegrityValid: true,
    noGo: false,
    observedLink: true,
    policyInspectionOutcome: "privacy_policy_observed",
    policyModuleDurationMs: 500,
    policyModuleStatus: "completed",
    scanDurationMs: 10_000,
    sourcePath: "fixture",
    ...input,
  };
}

test("summarizes only retained substantive privacy-policy evidence as captured", () => {
  const captured = summarizePrivacyPolicyCalibrationBundle({
    normalizedUrl: "https://www.example.com/",
    startedAt: "2026-07-17T00:00:00.000Z",
    completedAt: "2026-07-17T00:00:12.000Z",
    modulesRun: [{ moduleName: "policySurfaceScanner", status: "completed", durationMs: 800 }],
    policySurfaceInspection: { outcome: "privacy_policy_observed" },
    policySurfaceObservations: [{
      surfaceType: "privacy_policy",
      status: "fetched",
      url: "https://example.com/privacy",
      textExcerpt: "How we process personal data",
      targetRelationship: "target_controller",
      ownershipConfidence: 0.98,
      observedTopics: ["processing_purposes"],
    }],
  });

  assert.equal(captured.domain, "example.com");
  assert.equal(captured.captured, true);
  assert.equal(captured.evidenceIntegrityValid, true);
  assert.equal(captured.scanDurationMs, 12_000);
  assert.equal(captured.policyModuleStatus, "completed");
});

test("does not credit substantive provider policy text as target capture", () => {
  const summarized = summarizePrivacyPolicyCalibrationBundle({
    normalizedUrl: "https://example.com/",
    completedAt: "2026-07-17T00:00:12.000Z",
    policySurfaceObservations: [{
      surfaceType: "privacy_policy",
      status: "fetched",
      url: "https://provider.example/privacy",
      linkText: "Learn more about this provider — Provider privacy policy",
      title: "Privacy Policy",
      textExcerpt: "We process personal data and explain your privacy rights.",
      targetRelationship: "service_provider",
      ownershipConfidence: 0.98,
      observedTopics: ["processing_purposes", "data_subject_rights"],
    }],
  });

  assert.equal(summarized.captured, false);
  assert.equal(summarized.evidenceIntegrityValid, true);
});

test("keeps cross-domain parent-brand policy reviewable without provider-link context", () => {
  const summarized = summarizePrivacyPolicyCalibrationBundle({
    normalizedUrl: "https://product.example/",
    completedAt: "2026-07-17T00:00:12.000Z",
    policySurfaceObservations: [{
      surfaceType: "privacy_policy",
      status: "fetched",
      url: "https://parent.example/privacy",
      linkText: "Privacy Policy",
      title: "Parent Privacy Policy",
      textExcerpt: "We process personal data and explain your privacy rights.",
      targetRelationship: "service_provider",
      ownershipConfidence: 0.94,
      observedTopics: ["processing_purposes", "data_subject_rights"],
    }],
  });

  assert.equal(summarized.captured, true);
});

test("does not credit a retained non-policy shell as useful capture", () => {
  const summarized = summarizePrivacyPolicyCalibrationBundle({
    normalizedUrl: "https://example.com/",
    completedAt: "2026-07-17T00:00:12.000Z",
    policySurfaceObservations: [{
      surfaceType: "privacy_policy",
      status: "fetched",
      url: "https://example.com/privacy",
      title: "Privacy Policy",
      textExcerpt: "404 page not found. The requested page could not be found.",
      targetRelationship: "target_controller",
      ownershipConfidence: 0.98,
    }],
  });

  assert.equal(summarized.captured, false);
  assert.equal(summarized.evidenceIntegrityValid, true);
});

test("does not credit a URL-only policy guess and flags its evidence integrity", () => {
  const summarized = summarizePrivacyPolicyCalibrationBundle({
    normalizedUrl: "https://example.com/",
    completedAt: "2026-07-17T00:00:12.000Z",
    modulesRun: [{ moduleName: "policySurfaceScanner", status: "failed" }],
    policySurfaceInspection: { outcome: "indeterminate_limited_coverage" },
    policySurfaceObservations: [{
      surfaceType: "privacy_policy",
      status: "fetched",
      url: "https://example.com/privacy",
    }],
  });

  assert.equal(summarized.captured, false);
  assert.equal(summarized.evidenceIntegrityValid, false);
  assert.equal(summarized.observedLink, false);
  assert.equal(summarized.policyInspectionOutcome, "indeterminate_limited_coverage");
  assert.equal(summarized.policyModuleStatus, "failed");
});

test("records a rendered policy link separately when its document fetch fails", () => {
  const summarized = summarizePrivacyPolicyCalibrationBundle({
    normalizedUrl: "https://example.com/",
    completedAt: "2026-07-17T00:00:12.000Z",
    policySurfaceObservations: [{
      surfaceType: "privacy_policy",
      status: "failed",
      linkObservationState: "observed",
      documentFetchState: "failed",
      discoveryMethod: "footer_link",
      url: "https://example.com/privacy",
      evidenceRefs: [{ evidenceId: "footer-link" }],
    }],
  });

  assert.equal(summarized.observedLink, true);
  assert.equal(summarized.documentFetchFailed, true);
  assert.equal(summarized.captured, false);
  assert.equal(summarized.evidenceIntegrityValid, true);
});

test("passes capture, reviewed false-negative, integrity, and paired latency gates", () => {
  const report = evaluatePrivacyPolicyCalibration({
    baseline: [
      site({ domain: "one.example", scanDurationMs: 10_000 }),
      site({ domain: "two.example", scanDurationMs: 20_000 }),
    ],
    candidate: [
      site({ domain: "one.example", scanDurationMs: 10_500 }),
      site({ domain: "two.example", scanDurationMs: 21_000 }),
      site({ domain: "blocked.example", noGo: true, captured: false, scanDurationMs: 1_000 }),
    ],
    expectations: [
      { domain: "one.example", evidence: "reviewed screenshot and policy text", privacyPolicyExpected: true },
      { domain: "two.example", evidence: "reviewed screenshot and policy text", privacyPolicyExpected: true },
    ],
    thresholds: { minSites: 2, minReviewedExpectedPresent: 2 },
  });

  assert.equal(report.overallStatus, "passed");
  assert.equal(report.metrics.captureRate, 1);
  assert.equal(report.metrics.observedLinkRate, 1);
  assert.equal(report.metrics.falseNegativeRate, 0);
  assert.equal(report.metrics.latencyComparisonMethod, "paired_domains");
  assert.equal(report.metrics.medianLatencyDeltaMs, 500);
  assert.equal(report.metrics.p95LatencyDeltaMs, 1_000);
  assert.equal(report.metrics.candidateEligibleSites, 2);
});

test("fails when policy capture is missed, evidence is empty, and latency exceeds budget", () => {
  const report = evaluatePrivacyPolicyCalibration({
    baseline: [
      site({ domain: "one.example", scanDurationMs: 10_000 }),
      site({ domain: "two.example", scanDurationMs: 10_000 }),
    ],
    candidate: [
      site({ domain: "one.example", captured: false, evidenceIntegrityValid: false, scanDurationMs: 12_000 }),
      site({ domain: "two.example", scanDurationMs: 20_000 }),
    ],
    expectations: [
      { domain: "one.example", evidence: "manual policy confirmation", privacyPolicyExpected: true },
      { domain: "two.example", evidence: "manual policy confirmation", privacyPolicyExpected: true },
    ],
    thresholds: { minSites: 2, minReviewedExpectedPresent: 2 },
  });

  assert.equal(report.overallStatus, "failed");
  assert.deepEqual(report.metrics.falseNegatives, ["one.example"]);
  assert.equal(report.metrics.captureRate, 0.5);
  assert.equal(report.metrics.falseNegativeRate, 0.5);
  assert.equal(report.checks.find((row) => row.name === "captured_evidence_integrity")?.passed, false);
  assert.equal(report.checks.find((row) => row.name === "p95_scan_latency_delta_ms")?.passed, false);
});

test("fails closed when reviewed expected-policy coverage is absent", () => {
  const report = evaluatePrivacyPolicyCalibration({
    baseline: [site({ domain: "one.example" })],
    candidate: [site({ domain: "one.example" })],
    expectations: [],
    thresholds: { minSites: 1, minReviewedExpectedPresent: 1 },
  });

  assert.equal(report.overallStatus, "failed");
  assert.equal(report.metrics.falseNegativeRate, null);
  assert.equal(report.checks.find((row) => row.name === "reviewed_expected_policy_sites")?.passed, false);
});
