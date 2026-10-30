import assert from "node:assert/strict";
import test from "node:test";
import { priorityChecklistRow, priorityReportFixture, priorityScanRecord } from "./report-priority.fixture";
import { buildTimelineReportModel } from "../../components/scans/report-lab/timeline-report-model";
import { buildRegulatoryAssessmentHighlights } from "../../lib/scans/regulatory-assessment-highlights";
import { pdfPriorityReview } from "./report-pdf-priorities";
import { pdfOtherReviewGroups, pdfReportCounts, pdfReviewGroups } from "./report-pdf-reader";
import { pdfFrontmatter } from "./report-pdf-frontmatter";
import { pdfSiteAssessment } from "./report-pdf-summary";
import { buildReportPdfV2Model } from "./report-pdf-v2-model";
import { mergeHomepagePriorityFindings } from "../../lib/scans/report-priority-merge";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import { deriveConsentControlAssessment } from "@certscore/contracts";
import { buildUnifiedFindingDisplayPackets } from "../../lib/scans/unified-findings";
import { californiaPriorityGpcFixture } from "../../lib/scans/test-fixtures/california-priority-gpc";
import { assessGpcPotentialRisk } from "../../lib/scans/california-potential-risk-policy";

test("the browser workspace shares a priority merge that bundles without server dependencies", async () => {
  const source = await readFile("apps/web/components/scans/full-site-workspace.tsx", "utf8");
  assert.match(source, /import \{ mergeHomepagePriorityFindings \} from "\.\.\/\.\.\/lib\/scans\/report-priority-merge"/);
  await build({ entryPoints: ["apps/web/lib/scans/report-priority-merge.ts"], bundle: true, platform: "browser", write: false });
});

test("historical v8 web and both PDFs select one canonical priority from four narratives", () => {
  const report = priorityReportFixture(), before = structuredClone(report);
  const web = buildTimelineReportModel(priorityScanRecord(report));
  assert.ok("findings" in web);
  const selected = buildRegulatoryAssessmentHighlights(web.findings, "gdpr_eprivacy", { kind: "page" });
  assert.deepEqual(selected.topIssues.map(f => f.id), ["regulatory_gap__gdpr_eprivacy__post_reject_tracking_reduction"]);
  assert.deepEqual(pdfPriorityReview(report).topIssues, selected.topIssues);
  assert.equal(pdfSiteAssessment(report), selected.highlights.text);
  assert.equal(pdfReportCounts(report).groups, 1);
  assert.equal(pdfReportCounts(report).observations, 1);
  assert.equal(pdfReviewGroups(report)[0]!.status, "Partial concern");
  const details = pdfOtherReviewGroups(report).flatMap(g => g.observations.map(o => o.id));
  assert.deepEqual(details, ["policy_clarity_risk", "accept_reject_outcomes_indistinguishable", "post_accept_consent_dependent_activity"]);
  const v2 = buildReportPdfV2Model(report);
  assert.equal(v2.metrics[0]!.label, "Top issues"); assert.equal(v2.metrics[0]!.value, "1");
  assert.equal(v2.issues.length, 1); assert.equal(v2.otherIssues.length, 2); assert.equal(v2.findings.length, 4);
  assert.deepEqual(v2.trace.priorityFindingIds, selected.topIssues.map(f => f.id));
  const lines = pdfFrontmatter(report, "https://certscore.ai", { text: (text, opts) => [{ text, ...opts }], heading: text => ({ text }) });
  const text = lines.map(line => line.text).join("\n");
  assert.ok(text.indexOf("Other report findings") > text.indexOf("How to re-test"));
  assert.match(text, /policy_clarity_risk: retained qualified narrative/);
  assert.deepEqual(report, before, "selection must not alter scores, policy outputs or retained evidence");
});

test("missing canonical choice evidence and neutral rows cannot become priorities from narrative presence", () => {
  const report = priorityReportFixture();
  report.projection.checklist[0]!.criticalEvidence.retainedEvidence.reportControlObserved = false;
  assert.equal(pdfPriorityReview(report).topIssues.length, 0);
  assert.equal(pdfOtherReviewGroups(report).flatMap(g => g.observations).length, 4);
  const v2 = buildReportPdfV2Model(report);
  assert.equal(v2.issues.length, 0); assert.equal(v2.otherIssues.length, 3); assert.equal(v2.retest, null);
  report.projection.checklist = [priorityChecklistRow("post_reject_tracking_reduction", "Observed")];
  assert.equal(pdfPriorityReview(report).topIssues.length, 0);
  report.projection.checklist = [];
  delete (report.projection.unifiedFindings[0] as unknown as { presentationDecision?: unknown }).presentationDecision;
  assert.doesNotThrow(() => pdfPriorityReview(report));
  assert.equal(pdfPriorityReview(report).topIssues.length, 0);
});

test("California qualified collection priority uses the same canonical selection and stays out of EU", () => {
  const report = priorityReportFixture(); report.reviewFocus = "ccpa_cpra";
  const gpc = californiaPriorityGpcFixture();
  report.projection.unifiedFindings = buildUnifiedFindingDisplayPackets({ reviewFindingCandidates: [], validationFindings: [], validationFindingLookup: new Map(), runtimeArtifacts: {
    gpcResponseAssessment: gpc, californiaGpcPotentialRiskAssessment: assessGpcPotentialRisk(gpc, "california.collection-review.v3-retained-scope"),
  } });
  report.projection.checklist = [];
  const web = buildTimelineReportModel(priorityScanRecord(report)); assert.ok("findings" in web);
  const selected = buildRegulatoryAssessmentHighlights(web.findings, "ccpa_cpra", { kind: "page" });
  assert.ok(selected.topIssues.some(f => f.id === "california_collection_review"));
  assert.deepEqual(pdfPriorityReview(report).topIssues, selected.topIssues);
  assert.equal(pdfReportCounts(report).groups, selected.topIssues.length);
  report.reviewFocus = "gdpr_eprivacy";
  assert.ok(!pdfPriorityReview(report).topIssues.some(f => f.id === "california_collection_review"));
});

test("full-site exports and web use the same cached/homepage merge and focus ranking", () => {
  const report = priorityReportFixture(), base = pdfPriorityReview(report).topIssues;
  const cached = base.map(f => ({ ...f, pages: [{ id: "page-2", url: "https://example.test/two", homepage: false }] }));
  report.fullSite = { score: { priorityReview: cached } } as never;
  const homepage = base.map(f => ({ ...f, pages: [] }));
  const selected = buildRegulatoryAssessmentHighlights(mergeHomepagePriorityFindings(cached, homepage), "gdpr_eprivacy", { kind: "site", scannedPages: 2 });
  assert.deepEqual(pdfPriorityReview(report).topIssues.map(f => f.id), selected.topIssues.map(f => f.id));
  assert.equal(pdfReportCounts(report).groups, 1);
});

test("changed or unobserved Reject control remains inapplicable rather than borrowing a narrative receipt", () => {
  const report = priorityReportFixture();
  report.consentControlAssessment = deriveConsentControlAssessment({ scan: { scanId: report.scan.id, finalUrl: report.scan.requestedUrl! } });
  const before = structuredClone(report);
  assert.equal(pdfPriorityReview(report).topIssues.length, 0);
  assert.equal(pdfOtherReviewGroups(report).flatMap(g => g.observations).length, 4);
  assert.deepEqual(report, before);
});


test("duplicate canonical checklist identities are rejected rather than hidden by priority grouping", () => {
  const report = priorityReportFixture(); report.projection.checklist.push(structuredClone(report.projection.checklist[0]!));
  assert.throws(() => pdfPriorityReview(report), /Duplicate canonical/);
});
