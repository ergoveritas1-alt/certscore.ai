import assert from "node:assert/strict";
import test from "node:test";
import {
  buildScanCalibrationSummary,
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
  assert.match(summary.executive.headline, /Runtime coverage was limited/);
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
