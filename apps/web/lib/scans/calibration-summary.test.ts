import assert from "node:assert/strict";
import test from "node:test";
import {
  buildScanCalibrationSummary,
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

  assert.equal(presentation.findingsHeading, "Possible homepage issues");
  assert.equal(presentation.summaryLabel, "Coverage note:");
  assert.equal(presentation.limitedCoverage, true);
  assert.match(presentation.summaryMessage, /limited public coverage/i);
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
