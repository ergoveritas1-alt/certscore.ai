import assert from "node:assert/strict";
import test from "node:test";
import {
  buildScanCalibrationSummary,
  deriveCoverageDiagnosticIndicators,
  deriveExecutiveDisplayState,
  deriveExecutiveNarrativePresentation,
  deriveHostResolutionCategory,
  isThinCoverageSummary
} from "./calibration-summary";

test("treats apex and www as a same-site alias instead of off-origin", () => {
  assert.equal(
    deriveHostResolutionCategory({
      finalHost: "https://www.google.com/",
      requestedHost: "https://google.com/"
    }),
    "same_site_alias"
  );
});

test("treats truly different hosts as off-origin landings", () => {
  assert.equal(
    deriveHostResolutionCategory({
      finalHost: "https://www.brandforce.com/domain/helio.com/",
      requestedHost: "https://helio.com/"
    }),
    "off_origin_landing"
  );
});

test("identifies thin coverage when only one page was scanned without enrichment or verified surfaces", () => {
  assert.equal(
    isThinCoverageSummary({
      legalCoverageScore: 0,
      pagesScanned: 1,
      policyEnrichmentCount: 0,
      verifiedPublicSurfacesCount: 0
    }),
    true
  );
});

test("keeps stronger coverage out of the thin-coverage bucket", () => {
  assert.equal(
    isThinCoverageSummary({
      legalCoverageScore: 20,
      pagesScanned: 3,
      policyEnrichmentCount: 2,
      verifiedPublicSurfacesCount: 1
    }),
    false
  );
});

test("uses a scope note for off-origin landings", () => {
  const presentation = deriveExecutiveNarrativePresentation({
    executiveHeadline: "Privacy policy missing · Cookie policy missing",
    finalHost: "www.brandforce.com",
    posture: "Watch",
    requestedHost: "helio.com"
  });

  assert.equal(presentation.findingsHeading, "Observed on landed host");
  assert.equal(presentation.summaryLabel, "Scope note:");
  assert.equal(presentation.hostResolutionCategory, "off_origin_landing");
  assert.match(presentation.summaryMessage, /www\.brandforce\.com/);
});

test("uses a coverage note for thin scans instead of a normal primary-concerns narrative", () => {
  const presentation = deriveExecutiveNarrativePresentation({
    executiveHeadline: "Privacy policy missing",
    finalHost: "example.com",
    legalCoverageScore: 0,
    pagesScanned: 1,
    policyEnrichmentCount: 0,
    posture: "Watch",
    requestedHost: "example.com",
    verifiedPublicSurfacesCount: 0
  });

  assert.equal(presentation.findingsHeading, "Automated homepage findings");
  assert.equal(presentation.summaryLabel, "Coverage note:");
  assert.equal(presentation.limitedCoverage, true);
  assert.match(presentation.summaryMessage, /These are automated observations from the public scan\. Review the evidence before taking action/);
});

test("uses accessibility headline for accessibility-only retained top findings", () => {
  const presentation = deriveExecutiveNarrativePresentation({
    executiveHeadline: "Visual contrast accessibility issue",
    finalHost: "certscore.ai",
    posture: "Action Needed",
    requestedHost: "certscore.ai",
    topFindings: [
      {
        id: "visual_contrast_accessibility_issue",
        label: "Visual contrast accessibility issue",
        section: "Accessibility"
      }
    ]
  });

  assert.equal(presentation.headline, "Accessibility issue detected");
  assert.doesNotMatch(presentation.headline, /privacy|consent/i);
});

test("keeps privacy headline for privacy consent retained top findings", () => {
  const presentation = deriveExecutiveNarrativePresentation({
    executiveHeadline: "Tracking started before consent",
    finalHost: "example.com",
    posture: "Action Needed",
    requestedHost: "example.com",
    topFindings: [
      {
        id: "pre_consent_tracking_detected",
        label: "Tracking started before consent",
        section: "Privacy & Tracking"
      }
    ]
  });

  assert.equal(presentation.headline, "Immediate privacy and consent issues detected");
});

test("uses mixed headline when retained top findings span privacy and accessibility", () => {
  const presentation = deriveExecutiveNarrativePresentation({
    executiveHeadline: "Tracking started before consent · Visual contrast accessibility issue",
    finalHost: "example.com",
    posture: "Action Needed",
    requestedHost: "example.com",
    topFindings: [
      {
        id: "pre_consent_tracking_detected",
        label: "Tracking started before consent",
        section: "Privacy & Tracking"
      },
      {
        id: "visual_contrast_accessibility_issue",
        label: "Visual contrast accessibility issue",
        section: "Accessibility"
      }
    ]
  });

  assert.equal(presentation.headline, "Automated scan surfaced privacy and accessibility issues");
});

test("uses neutral headline when no meaningful top findings are retained", () => {
  const presentation = deriveExecutiveNarrativePresentation({
    executiveHeadline: "No headline findings surfaced from the available scan coverage.",
    finalHost: "example.com",
    posture: "Clear",
    requestedHost: "example.com",
    topFindings: []
  });

  assert.equal(presentation.headline, "No major issues surfaced from retained evidence");
  assert.doesNotMatch(presentation.headline, /privacy and consent issues/i);
});

test("derives limited review for interrupted clear scans with retained runtime context", () => {
  const displayState = deriveExecutiveDisplayState({
    domainBenchmark: {
      expectedThirdPartyRequests: 55
    },
    posture: "Clear",
    scanInterruptions: [
      { label: "Captcha/security challenge", details: ["Challenge suspected."] },
      { label: "Authentication wall", details: ["The homepage presented an authentication wall."] }
    ],
    thirdPartyDomains: ["securepubads.g.doubleclick.net"],
    thirdPartyRequestCount: 81,
    topFindingCount: 0,
    vendorCount: 5
  });

  assert.equal(displayState, "Limited review");
});

test("keeps protected routes outside the homepage from triggering limited-review coverage language", () => {
  const displayState = deriveExecutiveDisplayState({
    domainBenchmark: {
      expectedThirdPartyRequests: 55
    },
    posture: "Clear",
    scanInterruptions: [
      {
        label: "Protected route encountered",
        details: [
          "Some protected routes were encountered outside the public homepage.",
          "Homepage findings are based on observable public-page evidence."
        ]
      }
    ],
    thirdPartyDomains: ["www.googletagmanager.com"],
    thirdPartyRequestCount: 10,
    topFindingCount: 0,
    vendorCount: 3
  });

  assert.equal(displayState, "Clear");
});

test("uses evidence-review state for material cookie counts without headline findings", () => {
  const displayState = deriveExecutiveDisplayState({
    beforeConsentCookieCount: 19,
    posture: "Clear",
    scanInterruptions: [],
    thirdPartyRequestCount: 12,
    topFindingCount: 0,
    vendorCount: 0
  });
  const presentation = deriveExecutiveNarrativePresentation({
    displayState,
    executiveHeadline: "No headline findings surfaced from the available scan coverage.",
    finalHost: "example.com",
    posture: "Clear",
    requestedHost: "example.com",
    topFindings: []
  });

  assert.equal(displayState, "Evidence review");
  assert.equal(presentation.headline, "Material runtime evidence needs review");
  assert.doesNotMatch(presentation.headline, /No major issues surfaced/i);
});

test("keeps low cookie counts with weak anchors in the clear executive state", () => {
  const displayState = deriveExecutiveDisplayState({
    beforeConsentCookieCount: 2,
    posture: "Clear",
    scanInterruptions: [],
    thirdPartyRequestCount: 3,
    topFindingCount: 0,
    vendorCount: 0
  });
  const presentation = deriveExecutiveNarrativePresentation({
    displayState,
    executiveHeadline: "No headline findings surfaced from the available scan coverage.",
    finalHost: "example.com",
    posture: "Clear",
    requestedHost: "example.com",
    topFindings: []
  });

  assert.equal(displayState, "Clear");
  assert.equal(presentation.headline, "No major issues surfaced from retained evidence");
});

test("uses coverage-constrained messaging for high cookies when media benchmark requests are interrupted", () => {
  const displayState = deriveExecutiveDisplayState({
    beforeConsentCookieCount: 19,
    domainBenchmark: {
      expectedThirdPartyRequests: 55
    },
    posture: "Clear",
    scanInterruptions: [
      {
        label: "Captcha/security challenge",
        details: ["The public homepage scan was interrupted by a challenge."]
      }
    ],
    thirdPartyRequestCount: 8,
    topFindingCount: 0,
    vendorCount: 0
  });
  const presentation = deriveExecutiveNarrativePresentation({
    displayState,
    executiveHeadline: "No headline findings surfaced from the available scan coverage.",
    finalHost: "example.com",
    posture: "Clear",
    requestedHost: "example.com",
    topFindings: []
  });

  assert.equal(displayState, "Limited review");
  assert.equal(presentation.headline, "Runtime coverage was limited by site protections");
  assert.match(presentation.summaryMessage, /vendor and request counts may be incomplete/i);
});

test("derives an under-observed ecosystem diagnostic for interrupted high-cookie media scans", () => {
  const indicators = deriveCoverageDiagnosticIndicators({
    beforeConsentCookieCount: 19,
    domainBenchmark: {
      expectedThirdPartyRequests: 55
    },
    scanInterruptions: [
      {
        label: "Captcha/security challenge",
        details: ["The public homepage scan was interrupted by a challenge."]
      }
    ],
    thirdPartyDomains: ["cdn.optimizely.com", "turner.map.fastly.net", "cnn.com"],
    thirdPartyRequestCount: 9,
    vendorCount: 0
  });

  assert.equal(indicators.length, 1);
  assert.equal(indicators[0]?.id, "likely_incomplete_tracking_ecosystem");
  assert.equal(indicators[0]?.severity, "review");
  assert.equal(indicators[0]?.evidence.beforeConsentCookieCount, 19);
  assert.equal(indicators[0]?.evidence.expectedThirdPartyRequests, 55);
  assert.equal(indicators[0]?.evidence.observedThirdPartyRequestCount, 9);
  assert.equal(indicators[0]?.evidence.observedThirdPartyDomainCount, 3);
  assert.equal(indicators[0]?.evidence.observedVendorCount, 0);
  assert.ok(indicators[0]?.evidence.requestObservationRatio < 0.35);
  assert.ok(indicators[0]?.suspectedCauses.includes("blocked_ad_exchange_or_protected_cdn_route"));
  assert.ok(indicators[0]?.suspectedCauses.includes("deferred_adtech_execution"));
  assert.ok(indicators[0]?.suspectedCauses.includes("lazy_loaded_monetization"));
  assert.ok(indicators[0]?.suspectedCauses.includes("cookie_state_outpaced_observed_network"));
});

test("keeps under-observed ecosystem diagnostic gated by high cookies and meaningful interruptions", () => {
  assert.deepEqual(
    deriveCoverageDiagnosticIndicators({
      beforeConsentCookieCount: 19,
      domainBenchmark: {
        expectedThirdPartyRequests: 55
      },
      scanInterruptions: [],
      thirdPartyRequestCount: 9,
      vendorCount: 0
    }),
    []
  );

  assert.deepEqual(
    deriveCoverageDiagnosticIndicators({
      beforeConsentCookieCount: 2,
      domainBenchmark: {
        expectedThirdPartyRequests: 55
      },
      scanInterruptions: [
        {
          label: "Captcha/security challenge",
          details: ["The public homepage scan was interrupted by a challenge."]
        }
      ],
      thirdPartyRequestCount: 9,
      vendorCount: 0
    }),
    []
  );

  assert.deepEqual(
    deriveCoverageDiagnosticIndicators({
      beforeConsentCookieCount: 19,
      domainBenchmark: {
        expectedThirdPartyRequests: 55
      },
      scanInterruptions: [
        {
          label: "Captcha/security challenge",
          details: ["The public homepage scan was interrupted by a challenge."]
        }
      ],
      thirdPartyRequestCount: 40,
      vendorCount: 0
    }),
    []
  );
});

test("keeps clean well-covered scans clear when no interruption context is retained", () => {
  const displayState = deriveExecutiveDisplayState({
    domainBenchmark: {
      expectedThirdPartyRequests: 55
    },
    posture: "Clear",
    scanInterruptions: [],
    thirdPartyDomains: [],
    thirdPartyRequestCount: 12,
    topFindingCount: 0,
    vendorCount: 0
  });

  assert.equal(displayState, "Clear");
});

test("preserves action-needed posture when already-projected headline findings exist", () => {
  const displayState = deriveExecutiveDisplayState({
    coverageLevel: "limited_partial",
    posture: "Action Needed",
    scanInterruptions: [{ label: "Captcha/security challenge", details: [] }],
    thirdPartyRequestCount: 81,
    topFindingCount: 1,
    vendorCount: 5
  });

  assert.equal(displayState, "Action Needed");
});

test("builds calibration summary with display state separate from canonical posture", () => {
  const summary = buildScanCalibrationSummary({
    domain: "latimes.com",
    domainBenchmark: {
      expectedThirdPartyRequests: 55
    },
    finalHost: "www.latimes.com",
    policySurfaces: [
      { pageLabel: "Privacy Policy", details: ["Privacy choices and advertising disclosures retained."] }
    ],
    posture: "Clear",
    requestedHost: "latimes.com",
    scanId: "scan-1",
    scanInterruptions: [
      { label: "Captcha/security challenge", details: ["Challenge suspected."] },
      { label: "Authentication wall", details: ["Auth wall suspected."] }
    ],
    status: "completed",
    thirdPartyDomains: ["securepubads.g.doubleclick.net"],
    thirdPartyRequestCount: 81,
    topFindings: [],
    vendorCount: 5
  });

  assert.equal(summary.executive.posture, "Clear");
  assert.equal(summary.executive.displayState, "Limited review");
  assert.deepEqual(summary.coverage.diagnosticIndicators, []);
  assert.match(summary.executive.headline, /Runtime coverage was limited/);
});

test("builds calibration summary with under-observed ecosystem diagnostics", () => {
  const summary = buildScanCalibrationSummary({
    beforeConsentCookieCount: 19,
    domain: "cnn.com",
    domainBenchmark: {
      expectedThirdPartyRequests: 55
    },
    finalHost: "www.cnn.com",
    posture: "Clear",
    requestedHost: "cnn.com",
    scanId: "scan-cnn",
    scanInterruptions: [
      {
        label: "Captcha/security challenge",
        details: ["The public homepage scan was interrupted by a challenge."]
      }
    ],
    status: "completed",
    thirdPartyDomains: ["cdn.optimizely.com", "turner.map.fastly.net", "cnn.com"],
    thirdPartyRequestCount: 9,
    topFindings: [],
    vendorCount: 0
  });

  assert.equal(summary.executive.posture, "Clear");
  assert.equal(summary.executive.displayState, "Limited review");
  assert.equal(summary.coverage.diagnosticIndicators.length, 1);
  assert.equal(summary.coverage.diagnosticIndicators[0]?.id, "likely_incomplete_tracking_ecosystem");
  assert.match(summary.coverage.diagnosticIndicators[0]?.message ?? "", /coverage-constrained/);
});

test("builds a calibration summary that preserves same-site alias posture without flagging an off-origin landing", () => {
  const summary = buildScanCalibrationSummary({
    domain: "google.com",
    finalHost: "www.google.com",
    posture: "Clear",
    requestedHost: "google.com",
    scanId: "scan-1",
    status: "completed",
    topFindings: []
  });

  assert.equal(summary.executive.hostResolutionCategory, "same_site_alias");
  assert.equal(summary.landedOnDifferentHost, false);
  assert.equal(summary.executive.summaryLabel, "Primary concerns:");
});
