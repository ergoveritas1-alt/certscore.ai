import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { deriveConsentControlAssessment, CALIFORNIA_AGENT_REGISTRATION_ID as ID } from "@certscore/contracts";
import { californiaCoverageFixture, CA_FIXTURE_POLICY, CA_FIXTURE_SOURCE, CA_FIXTURE_URL } from "../../server/scans/california-review-coverage.fixture";
import { projectCaliforniaPrivacyReview } from "../../server/scans/california-privacy-review-projection";
import { buildUnifiedFindingDisplayPackets } from "./unified-findings";
import { projectCaliforniaRegulatoryPriorities } from "./california-regulatory-priorities";
import { CaliforniaPrivacyWorkpaper } from "../../components/scans/regulatory-review-focus";
import { SitePriorityReview } from "../../components/scans/site-priority-review";
import { deriveCaliforniaRegulatoryScore } from "./california-regulatory-score";
import { FullSiteExecutiveSummary } from "../../components/scans/full-site-executive-summary";

// Match existing component tests under tsx's classic JSX test transform.
Object.assign(globalThis, { React });

test("registration quote remains in existing California evidence while overview/top findings omit it", () => {
  const f = californiaCoverageFixture(CA_FIXTURE_POLICY + " California Privacy Rights. Such authorized agent must be registered with the California Secretary of State.");
  f.bundle.policySurfaceInspection!.californiaReviewPolicy = "california-privacy-review.v10";
  f.bundle.policySurfaceObservations.forEach(row => {row.documentLanguage = "en";});
  const review = projectCaliforniaPrivacyReview(f.bundle, CA_FIXTURE_SOURCE, CA_FIXTURE_URL, f.policyEvidence)!;
  assert.ok(review.contractVersion === "certscore.california-privacy-review.v10" && review.agentRegistrationAssessment);
  const parent = deriveConsentControlAssessment({scan: {scanId: review.scanId, finalUrl: review.documentUrl}});
  parent.californiaPrivacyReview = review;
  const packets = buildUnifiedFindingDisplayPackets({reviewFindingCandidates: [], validationFindings: [], validationFindingLookup: new Map(), runtimeArtifacts: {consentControlAssessment: parent}});
  assert.ok(packets.some(row => row.unifiedFindingId === ID && row.surfacingDecision.reportable));
  const rows = projectCaliforniaRegulatoryPriorities(packets).map((row, index) => ({...row, rank: index + 1, pages: [{id: review.scanId, url: review.documentUrl, homepage: true}]}));
  const score = deriveCaliforniaRegulatoryScore({assessment: review, checklistRows: [], unifiedFindings: packets});
  const detailed = renderToStaticMarkup(React.createElement(CaliforniaPrivacyWorkpaper, {assessment: review, scanId: review.scanId, focus: "ccpa_cpra", coverage: review.reviewCoverage}));
  assert.match(detailed, /data-california-agent-registration/);
  assert.match(detailed, /Such authorized agent must be registered/);
  assert.match(detailed, /Retained policy source/);
  assert.doesNotMatch(detailed, /deduct|3 points|scoring withheld/i);
  for (const html of [
    renderToStaticMarkup(React.createElement(SitePriorityReview, {findings: rows, reviewFocus: "ccpa_cpra", pending: false, sitewideAvailable: true, scannedPages: 1})),
    renderToStaticMarkup(React.createElement(FullSiteExecutiveSummary, {score: {value: 100, priorityReview: rows, scoredPages: 1}, californiaScore: score, pending: false, scannedPages: 1, reviewFocus: "ccpa_cpra"})),
  ]) assert.doesNotMatch(html, /State registration required for authorized agents/);
  const mismatched = renderToStaticMarkup(React.createElement(CaliforniaPrivacyWorkpaper, {assessment: review, scanId: "different-scan", focus: "ccpa_cpra"}));
  assert.doesNotMatch(mismatched, /data-california-agent-registration/);
});
