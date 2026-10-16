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
  assert.equal(REGULATORY_REVIEW_TOPICS.filter(topic => topic.contexts.gdpr_eprivacy).length, 31);
  assert.equal(REGULATORY_REVIEW_TOPICS.filter(topic => topic.contexts.ccpa_cpra).length, 6);
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
    assert.match(html, /Other issues/);
    assert.equal(html.includes("Review the coverage below for the checks completed in this visit"), mode === "ccpa_cpra");
    for (const example of context.examples) {
      assert.ok(html.includes(example.url));
      assert.match(html, /Related enforcement/);
    }
    assert.equal(html.includes("Related enforcement"), context.examples.length > 0);
  }
});
test("California overview and priority list omit EU-only findings while retaining other issue count", () => {
  const html = renderToStaticMarkup(<FullSiteExecutiveSummary score={{value:82, priorityReview:[postReject,ACCESSIBILITY_PREVIEW],scoredPages:1}} californiaScore={{policyVersion:"california-regulatory-posture.v1",score:86,scope:"starting_page",coverage:"bounded",assessmentSourceHash:"a".repeat(64),deductions:[]}} pending={false} scannedPages={1} reviewFocus="ccpa_cpra" homepageVerdict="EU-only tracking after Reject" />);
  assert.match(html, /California page score 86 out of 100/);
  assert.match(html, /California-specific scoring/);
  assert.doesNotMatch(html, /82 out of 100/);
  assert.match(html, /0 CCPA\/CPRA issues/);
  assert.match(html, /1 other issue/);
  assert.doesNotMatch(html, /EU-only tracking after Reject/);
  assert.match(html, /No CCPA\/CPRA priority issues/);
  const eu = renderToStaticMarkup(<FullSiteExecutiveSummary score={{value:82, priorityReview:[postReject,ACCESSIBILITY_PREVIEW],scoredPages:1}} pending={false} scannedPages={1} reviewFocus="gdpr_eprivacy" />);
  assert.match(eu, /Page score 82 out of 100/);
});
test("all mapped findings remain available without a 30-item truncation", () => {
  const eu = REGULATORY_PREVIEW_FINDINGS.filter(finding => regulatoryReviewContext(finding.id,"gdpr_eprivacy"));
  const result = selectRegulatoryReview(eu,"gdpr_eprivacy");
  assert.equal(result.regulatory.length, 31);
  assert.deepEqual(result.regulatory.map(row => row.rank), Array.from({length:31},(_,i)=>i+1));
});
