import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CALIFORNIA_RIGHTS_DISCLOSURE_ID, consentControlAssessmentSchema, deriveConsentControlAssessment } from "@certscore/contracts";
import { californiaCoverageFixture, CA_FIXTURE_POLICY, CA_FIXTURE_SOURCE, CA_FIXTURE_URL } from "../../server/scans/california-review-coverage.fixture";
import { projectCaliforniaPrivacyReview } from "../../server/scans/california-privacy-review-projection";
import { buildUnifiedFindingDisplayPackets } from "./unified-findings";
import { projectCaliforniaRegulatoryPriorities } from "./california-regulatory-priorities";
import { deriveCaliforniaRegulatoryScore } from "./california-regulatory-score";
import { isDetailedOnlyCaliforniaDisclosure } from "./california-disclosure-priority";
import { selectRegulatoryReview } from "./regulatory-review-catalog";
import { buildAssessmentBrief } from "./assessment-brief";
import { buildAssessmentHighlightsPresentation, buildAssessmentHighlights } from "./assessment-highlights";
import { FindingRow } from "../../components/scans/report-finding-row";
import { SitePriorityReview } from "../../components/scans/site-priority-review";
import { FullSiteExecutiveSummary } from "../../components/scans/full-site-executive-summary";
import { CaliforniaCoverageDetails } from "../../components/scans/regulatory-review-focus";

const noNonDiscrimination = CA_FIXTURE_POLICY.replace("We will not discriminate against you for exercising your privacy rights. ", "");
function projected(version: "v4" | "v5" | "v10", text = noNonDiscrimination) {
  const f = californiaCoverageFixture(text);
  f.bundle.policySurfaceInspection!.californiaReviewPolicy = `california-privacy-review.${version}`;
  f.bundle.policySurfaceObservations.forEach(row => {row.documentLanguage = "en";});
  const review = projectCaliforniaPrivacyReview(f.bundle, CA_FIXTURE_SOURCE, CA_FIXTURE_URL, f.policyEvidence)!;
  const parent = deriveConsentControlAssessment({scan: {scanId: f.bundle.scanId, finalUrl: CA_FIXTURE_URL}});
  parent.californiaPrivacyReview = review;
  const persisted = consentControlAssessmentSchema.parse(JSON.parse(JSON.stringify(parent)));
  const packets = buildUnifiedFindingDisplayPackets({reviewFindingCandidates: [], validationFindings: [], validationFindingLookup: new Map(), runtimeArtifacts: {consentControlAssessment: persisted}});
  const rows = projectCaliforniaRegulatoryPriorities(packets).map((row, index) => ({...row, rank: index + 1, pages: [{id: f.bundle.scanId, url: CA_FIXTURE_URL, homepage: true}]}));
  const score = () => deriveCaliforniaRegulatoryScore({assessment: review, checklistRows: [], unifiedFindings: packets});
  return {review, persisted, packets, rows, score};
}
for (const version of ["v4", "v5", "v10"] as const) test(`${version}: sole non-discrimination omission stays detailed with identical score effects`, () => {
  const result = projected(version);
  const finding = result.rows.find(row => row.id === CALIFORNIA_RIGHTS_DISCLOSURE_ID)!;
  assert.ok(finding, "Canonical detailed finding remains projected");
  assert.ok(isDetailedOnlyCaliforniaDisclosure(finding));
  const before = structuredClone({rows: result.rows});
  // Preserve the score, full packet, findings and persisted assessment byte-for-byte.
  const original = JSON.stringify({packets: result.packets, persisted: result.persisted, rows: result.rows});
  const score = result.score();
  assert.ok(score.deductions.some(row => row.findingId === CALIFORNIA_RIGHTS_DISCLOSURE_ID), "Exercise the real existing scoring effect");
  const selected = selectRegulatoryReview(result.rows, "ccpa_cpra");
  assert.ok(!selected.topIssues.some(row => row.id === CALIFORNIA_RIGHTS_DISCLOSURE_ID));
  assert.ok(!selected.regulatory.some(row => row.id === CALIFORNIA_RIGHTS_DISCLOSURE_ID));
  assert.ok(!selected.other.some(row => row.id === CALIFORNIA_RIGHTS_DISCLOSURE_ID));
  for (const scope of [{kind: "page"}, {kind: "site", scannedPages: 3}] as const) {
    const highlights = buildAssessmentHighlightsPresentation([finding], scope);
    assert.doesNotMatch(`${highlights.text} ${highlights.expanded?.text ?? ""}`, /non-discrimination/i);
    assert.ok(![...highlights.links, ...(highlights.expanded?.links ?? [])].some(link => link.targetId.includes(CALIFORNIA_RIGHTS_DISCLOSURE_ID)));
    assert.doesNotMatch(buildAssessmentHighlights([finding], scope), /non-discrimination/i);
    const brief = buildAssessmentBrief([finding], scope);
    assert.equal(brief.primary, null); assert.equal(brief.findingCount, 0);
  }
  assert.deepEqual(result.score(), score);
  assert.equal(JSON.stringify({packets: result.packets, persisted: result.persisted, rows: result.rows}), original);
  assert.deepEqual(result.rows, before.rows);
});

test("mixed rights omissions and other California findings remain eligible for top findings and highlights", () => {
  for (const version of ["v4", "v5", "v10"] as const) {
    const result = projected(version, noNonDiscrimination.replace("You have the right to delete your personal information. ", ""));
    const row = result.rows.find(row => row.id === CALIFORNIA_RIGHTS_DISCLOSURE_ID)!;
    assert.ok(row); assert.equal(isDetailedOnlyCaliforniaDisclosure(row), false);
    assert.ok(selectRegulatoryReview(result.rows, "ccpa_cpra").topIssues.some(item => item.id === row.id));
    assert.match(buildAssessmentHighlights(result.rows, {kind: "page"}), /Privacy-rights disclosure/);
  }
  const result = projected("v10"), own = result.rows.find(row => row.id === CALIFORNIA_RIGHTS_DISCLOSURE_ID)!;
  const broken = {...own, id: "california_privacy_choice_destination_error", title: "Broken privacy-choice destination", summary: "The retained destination returned HTTP 404.", rank: 2};
  const rows = [own, broken];
  const selected = selectRegulatoryReview(rows, "ccpa_cpra").topIssues;
  assert.deepEqual(selected.map(row => [row.id, row.rank]), [[broken.id, 1]]);
  const highlights = buildAssessmentHighlightsPresentation(rows, {kind: "page"});
  assert.match(highlights.text, /Broken privacy-choice destination/);
  assert.doesNotMatch(`${highlights.text} ${highlights.expanded?.text ?? ""}`, /Non-discrimination disclosure/);
});

test("selection requires typed assessed topics and the canonical finding identity, never headline wording", () => {
  const result = projected("v10"), row = result.rows.find(row => row.id === CALIFORNIA_RIGHTS_DISCLOSURE_ID)!;
  const renamed = {...row, title: "Changed editorial headline"};
  assert.ok(isDetailedOnlyCaliforniaDisclosure(renamed));
  for (const changed of [{...row, id: "another_finding"}, {...row, evidenceJson: {}},
    {...row, evidenceJson: {californiaPrivacyReview: {rightsAssessment: {topics: [{topic: "non_discrimination", status: "not_observed"}]}}}},
    {...row, evidenceJson: {californiaPrivacyReview: {...result.review, sourceHash: "invalid"}}}])
    assert.equal(isDetailedOnlyCaliforniaDisclosure(changed), false);
  const noGap = projected("v10", CA_FIXTURE_POLICY);
  assert.ok(!noGap.packets.some(packet => packet.unifiedFindingId === CALIFORNIA_RIGHTS_DISCLOSURE_ID));
});

test("rendered top list and overview omit the standalone gap while detailed California evidence retains it", () => {
  const result = projected("v10"), score = result.score();
  const list = renderToStaticMarkup(React.createElement(SitePriorityReview, {findings: result.rows, reviewFocus: "ccpa_cpra", pending: false, sitewideAvailable: true, scannedPages: 1}));
  const overview = renderToStaticMarkup(React.createElement(FullSiteExecutiveSummary, {score: {value: 100, priorityReview: result.rows, scoredPages: 1}, californiaScore: score, pending: false, scannedPages: 1, reviewFocus: "ccpa_cpra"}));
  for (const html of [list, overview]) assert.doesNotMatch(html, /Non-discrimination disclosure not found/);
  assert.match(overview, new RegExp(`California score ${score.score} out of 100`));
  assert.ok("rightsAssessment" in result.review && result.review.rightsAssessment);
  assert.ok("reviewCoverage" in result.review);
  const detailed = renderToStaticMarkup(React.createElement(CaliforniaCoverageDetails, {coverage: result.review.reviewCoverage, rightsAssessment: result.review.rightsAssessment}));
  assert.match(detailed, /non discrimination: Not observed/);
  const row = result.rows.find(row => row.id === CALIFORNIA_RIGHTS_DISCLOSURE_ID)!;
  const detailedFinding = renderToStaticMarkup(React.createElement(FindingRow, {
    finding: {...row, focus: "CCPA/CPRA", vendors: []}, reviewFocus: "ccpa_cpra",
  }));
  assert.match(detailedFinding, /Non-discrimination disclosure not found in the inspected policy/);
  assert.match(detailedFinding, /assuming CCPA\/CPRA applies/);
  const packet = result.packets.find(packet => packet.unifiedFindingId === CALIFORNIA_RIGHTS_DISCLOSURE_ID)!;
  assert.equal(packet.presentationDecision.status, "surface");
  assert.equal(packet.surfacingDecision.reportable, true);
  assert.ok(packet.scoreEffects?.length);
});
