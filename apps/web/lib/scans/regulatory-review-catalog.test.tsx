import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { REGULATORY_REVIEW_TOPICS, regulatoryReviewContext, selectRegulatoryReview, ENFORCEMENT_EXAMPLES } from "./regulatory-review-catalog";
import { SitePriorityReview } from "../../components/scans/site-priority-review";
import { FullSiteExecutiveSummary } from "../../components/scans/full-site-executive-summary";
import { REGULATORY_PREVIEW_FINDINGS, ACCESSIBILITY_PREVIEW } from "../../app/dev-fixtures/regulatory-review/preview-data";
import { buildChecklistConcernTopFindings } from "./checklist-concern-top-findings";
import { deriveGdprEprivacyCoverageChecklist } from "./gdpr-eprivacy-coverage-checklist";

const postReject = REGULATORY_PREVIEW_FINDINGS.find(row => row.id.endsWith("post_reject_tracking_reduction"))!;
const california = REGULATORY_PREVIEW_FINDINGS.find(row => row.id === "california_privacy_choice_not_observed")!;
test("mode switching partitions canonical identities without changing evidence, status or score", () => {
  const input = structuredClone([postReject, california, ACCESSIBILITY_PREVIEW]);
  const before = structuredClone(input);
  const eu = selectRegulatoryReview(input, "gdpr_eprivacy");
  const ca = selectRegulatoryReview(input, "ccpa_cpra");
  assert.deepEqual(eu.regulatory.map(row => row.id), [postReject.id]);
  assert.deepEqual(ca.regulatory.map(row => row.id), [california.id]);
  assert.deepEqual(eu.other.map(row => row.id), [ACCESSIBILITY_PREVIEW.id]);
  assert.deepEqual(ca.other.map(row => row.id), [ACCESSIBILITY_PREVIEW.id]);
  assert.deepEqual(input, before);
  assert.equal(ca.regulatory[0]!.evidenceJson, input[1]!.evidenceJson);
  assert.equal(ca.regulatory[0]!.status, input[1]!.status);
});
test("every catalog identity is unique and cases match the selected jurisdiction", () => {
  const ids = REGULATORY_REVIEW_TOPICS.flatMap(topic => topic.findingIds);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(REGULATORY_REVIEW_TOPICS.filter(topic => topic.contexts.gdpr_eprivacy).length, 32);
  assert.equal(REGULATORY_REVIEW_TOPICS.filter(topic => topic.contexts.ccpa_cpra).length, 9);
  for (const topic of REGULATORY_REVIEW_TOPICS) for (const mode of ["gdpr_eprivacy", "ccpa_cpra"] as const) {
    for (const caseId of topic.contexts[mode]?.cases ?? []) assert.equal(ENFORCEMENT_EXAMPLES[caseId]?.mode, mode, `${topic.id}: ${caseId}`);
    const context = regulatoryReviewContext(topic.findingIds[0]!, mode);
    if (!context) continue;
    assert.ok(context.why.length > 30 && context.why.length < 350);
    assert.ok(context.ruleUrl.startsWith("https://"));
  }
});
test("unknown identities and generic accessibility receive no invented legal context", () => {
  for (const id of ["unrecognized", "accessibility_priority_group", "visual_contrast_accessibility_issue", "site_integrity_cms_security", "privacyAuditEvidence.controls", "cpra_cba_opt_out_missing"]) {
    assert.equal(regulatoryReviewContext(id, "gdpr_eprivacy"), null);
    assert.equal(regulatoryReviewContext(id, "ccpa_cpra"), null);
  }
});
test("unassessed checklist and evidence-only labels cannot create review entries", () => {
  const rows = deriveGdprEprivacyCoverageChecklist({ coverageLimited: true, scanCompleted: true, unifiedFindings: [] });
  const findings = buildChecklistConcernTopFindings(rows);
  const priorities = findings.map((finding, rank) => ({ id: finding.id, rank, status: "Potential gap" }));
  assert.deepEqual(selectRegulatoryReview(priorities, "ccpa_cpra").regulatory, []);
});
test("all context scenarios render with truthful jurisdiction, evidence and independently expandable cases", () => {
  for (const mode of ["gdpr_eprivacy", "ccpa_cpra"] as const) for (const finding of REGULATORY_PREVIEW_FINDINGS) {
    const context = regulatoryReviewContext(finding.id, mode);
    if (!context) continue;
    const html = renderToStaticMarkup(<SitePriorityReview findings={[finding, ACCESSIBILITY_PREVIEW]} reviewFocus={mode} pending={false} sitewideAvailable scannedPages={1} />);
    assert.match(html, /Why it matters:/);
    assert.doesNotMatch(html, /Other issues|Accessibility &amp; site review|report-other-issues/);
    assert.equal((html.match(/id="report-top-issues"/g) ?? []).length, 1);
    assert.match(html, /sitewide-accessibility_priority_group/);
    assert.doesNotMatch(html, /California review coverage|california-review-coverage|Review the coverage below/);
    for (const example of context.examples) {
      assert.ok(html.includes(example.url));
      assert.match(html, /Related enforcement/);
    }
    assert.equal(html.includes("Related enforcement"), context.examples.length > 0);
  }
});
test("California overview and priority list omit EU-only findings while retaining accessibility in one top-issue count", () => {
  const html = renderToStaticMarkup(<FullSiteExecutiveSummary score={{value:82, priorityReview:[postReject,ACCESSIBILITY_PREVIEW],scoredPages:1}} californiaScore={{policyVersion:"california-regulatory-posture.v1",score:86,scope:"starting_page",coverage:"bounded",assessmentSourceHash:"a".repeat(64),deductions:[]}} pending={false} scannedPages={1} reviewFocus="ccpa_cpra" homepageVerdict="EU-only tracking after Reject" />);
  assert.match(html, /California score 86 out of 100/);
  assert.doesNotMatch(html, /California-specific scoring/);
  assert.doesNotMatch(html, /82 out of 100/);
  assert.match(html, /1 top issue/);
  assert.doesNotMatch(html, /other issue|report-other-issues/);
  assert.doesNotMatch(html, /EU-only tracking after Reject/);
  assert.doesNotMatch(html, /No CCPA\/CPRA priority issues/);
  const eu = renderToStaticMarkup(<FullSiteExecutiveSummary score={{value:82, priorityReview:[postReject,ACCESSIBILITY_PREVIEW],scoredPages:1}} pending={false} scannedPages={1} reviewFocus="gdpr_eprivacy" />);
  assert.match(eu, /Score 82 out of 100/);
});
test("all mapped findings remain available without a 30-item truncation", () => {
  const eu = REGULATORY_PREVIEW_FINDINGS.filter(finding => regulatoryReviewContext(finding.id,"gdpr_eprivacy"));
  const result = selectRegulatoryReview(eu,"gdpr_eprivacy");
  assert.equal(result.regulatory.length, 32);
  assert.deepEqual(result.regulatory.map(row => row.rank), Array.from({length:32},(_,i)=>i+1));
});

test("California coverage separates supported evidence from unresolved review areas",async()=>{
  const {CaliforniaCoverageSummary}=await import("../../components/scans/regulatory-review-focus");
  const {californiaCoverageFixture,CA_FIXTURE_SOURCE,CA_FIXTURE_URL}=await import("../../server/scans/california-review-coverage.fixture");
  const {projectCaliforniaPrivacyReview}=await import("../../server/scans/california-privacy-review-projection");
  const f=californiaCoverageFixture("Privacy Policy. We use personal information to provide services. We retain personal information for as long as necessary. To exercise privacy rights contact privacy@example.test.");
  f.bundle.policySurfaceInspection!.californiaReviewPolicy="california-privacy-review.v3";
  const review=projectCaliforniaPrivacyReview(f.bundle,CA_FIXTURE_SOURCE,CA_FIXTURE_URL,f.policyEvidence)!;
  if(review.contractVersion === "certscore.california-privacy-review.v1")throw new Error("coverage expected");
  const html=renderToStaticMarkup(<CaliforniaCoverageSummary coverage={review.reviewCoverage}/>);
  assert.match(html,/supported/);assert.match(html,/to review/);assert.doesNotMatch(html,/evidence in 6 of 6/);
});

test("California coverage exposes canonical rights clauses and collection matching without presenting compliance passes",async()=>{
  const {CaliforniaCoverageDetails}=await import("../../components/scans/regulatory-review-focus");
  const {californiaCoverageFixture,CA_FIXTURE_SOURCE,CA_FIXTURE_URL}=await import("../../server/scans/california-review-coverage.fixture");
  const {projectCaliforniaPrivacyReview}=await import("../../server/scans/california-privacy-review-projection");
  const f=californiaCoverageFixture("Privacy Policy. We give the individual access to personal information upon request. A customer may request correction of inaccurate personal information. We retain records until no longer necessary. Such information is destroyed or erased.");
  f.bundle.policySurfaceInspection!.californiaReviewPolicy="california-privacy-review.v5";f.bundle.policySurfaceObservations.forEach(surface=>{surface.documentLanguage="en";});
  const review=projectCaliforniaPrivacyReview(f.bundle,CA_FIXTURE_SOURCE,CA_FIXTURE_URL,f.policyEvidence)!;
  if(review.contractVersion!=="certscore.california-privacy-review.v5")throw new Error("v5 expected");
  const html=renderToStaticMarkup(<CaliforniaCoverageDetails coverage={review.reviewCoverage} rightsAssessment={review.rightsAssessment} collectionNoticeAssessment={review.collectionNoticeAssessment}/>);
  assert.match(html,/Rights clause assessment/);assert.match(html,/Rights wording retained/);assert.match(html,/Excluded retention\/security wording/);
  assert.match(html,/Collection-notice matching/);assert.match(html,/legal adequacy remain unassessed/);assert.doesNotMatch(html,/compliant|passed all/i);
});

test("v6 coverage distinguishes assessed gaps and renders retained sale/sharing claims",async()=>{
  const {CaliforniaCoverageDetails}=await import("../../components/scans/regulatory-review-focus");
  const {californiaCoverageFixture,CA_FIXTURE_SOURCE,CA_FIXTURE_URL}=await import("../../server/scans/california-review-coverage.fixture");
  const {projectCaliforniaPrivacyReview}=await import("../../server/scans/california-privacy-review-projection");
  const f=californiaCoverageFixture("Privacy Policy. We give the individual access to personal information upon request. A customer may request correction of personal information. We share personal information with service providers for billing.");
  f.bundle.policySurfaceInspection!.californiaReviewPolicy="california-privacy-review.v6";f.bundle.policySurfaceObservations.forEach(surface=>{surface.documentLanguage="en";});
  const review=projectCaliforniaPrivacyReview(f.bundle,CA_FIXTURE_SOURCE,CA_FIXTURE_URL,f.policyEvidence)!;
  if(review.contractVersion!=="certscore.california-privacy-review.v6")throw new Error("v6 expected");
  const html=renderToStaticMarkup(<CaliforniaCoverageDetails coverage={review.reviewCoverage} rightsAssessment={review.rightsAssessment} collectionNoticeAssessment={review.collectionNoticeAssessment} saleSharingAssessment={review.saleSharingAssessment}/>);
  assert.match(html,/Assessed: disclosure gaps found/);assert.match(html,/Sale\/sharing clause assessment/);
  assert.match(html,/operational disclosures: described/);assert.doesNotMatch(html,/compliant|passed all/i);
});

test("v7 labels completed assessments independently of follow-up and separates technical lookup rows",async()=>{
  const {CaliforniaCoverageDetails}=await import("../../components/scans/regulatory-review-focus");
  const {californiaCoverageFixture,CA_FIXTURE_SOURCE,CA_FIXTURE_URL}=await import("../../server/scans/california-review-coverage.fixture");
  const {projectCaliforniaPrivacyReview}=await import("../../server/scans/california-privacy-review-projection");
  const f=californiaCoverageFixture("Privacy Policy. We give the individual access to personal information upon request. A customer may request correction of personal information. We share personal information with service providers for billing. We use cookies for analytics.");
  f.bundle.policySurfaceInspection!.californiaReviewPolicy="california-privacy-review.v7";f.bundle.policySurfaceObservations.forEach(surface=>{surface.documentLanguage="en";});
  f.bundle.cookieEvents=[{eventId:"cookie",scenario:"fresh_pre_consent",documentUrl:CA_FIXTURE_URL,cookieName:"sid",cookiePurpose:"unknown"}] as never;
  f.bundle.networkEvents=[{eventId:"contact",scenario:"fresh_pre_consent",documentUrl:CA_FIXTURE_URL,thirdParty:true}] as never;
  const review=projectCaliforniaPrivacyReview(f.bundle,CA_FIXTURE_SOURCE,CA_FIXTURE_URL,f.policyEvidence)!;
  if(review.contractVersion!=="certscore.california-privacy-review.v7")throw new Error("v7 expected");
  const html=renderToStaticMarkup(<CaliforniaCoverageDetails coverage={review.reviewCoverage} rightsAssessment={review.rightsAssessment} collectionNoticeAssessment={review.collectionNoticeAssessment} saleSharingAssessment={review.saleSharingAssessment}/>);
  assert.match(html,/Policy text assessed · recipient roles unresolved/);assert.match(html,/Page inspection complete · obligation unresolved/);
  assert.match(html,/Technical product lookups/);assert.match(html,/Category: wording retained · Purpose: unresolved/);assert.doesNotMatch(html,/0 of 7|compliant|passed all/i);
});
