import assert from "node:assert/strict";
import test from "node:test";
import { buildAssessmentHighlights } from "../../lib/scans/assessment-highlights";
import { observedControlAssessment } from "../../lib/scans/test-fixtures/observed-control-assessment";
import { pdfSiteAssessment, pdfSummaryTopics } from "./report-pdf-summary";
import type { CanonicalReportExport } from "./report-export";

function reportFixture() {
  return { scan: { id: "scan-1" }, score: { value: 64 }, executiveSummary: { counts: { technicalLimitation: 0 } }, projection: { unifiedFindings: [] }, gdprEprivacyReview: { rows: [] }, consentControlAssessment: structuredClone(observedControlAssessment), appendix: {
    gdprTransparency: { rows: [] }, cookieAndTrackerInventory: { presentationStatus: "retained", summary: { cookieRows: 0, storageRows: 0 }, rows: [] }, dataCollectionSurfaces: { summary: { totalForms: 0, totalFields: 0 }, assessmentStatus: "insufficient_evidence" },
  } } as unknown as CanonicalReportExport;
}

test("PDF site assessment uses the scan report writer with canonical observation, qualification and action", () => {
  const report = reportFixture();
  const finding = { unifiedFindingId: "regulatory_gap__gdpr_eprivacy__post_reject_tracking_reduction", severity: "high", summary: "Qualifying non-essential requests were observed during the retained post-Reject capture.", presentation: { findingName: "Non-essential activity after confirmed Reject", suggestedFix: "Update optional services to respect Reject, then retest." } };
  report.projection.unifiedFindings = [finding] as unknown as CanonicalReportExport["projection"]["unifiedFindings"];
  const before = structuredClone(report);
  const expected = buildAssessmentHighlights([{ id: finding.unifiedFindingId, severity: "high", title: finding.presentation.findingName, summary: finding.summary, correctionSteps: [finding.presentation.suggestedFix] }], { kind: "page" }, { score: 64, coverage: { state: "unknown", limitedCount: 0 } });
  assert.equal(pdfSiteAssessment(report), expected);
  assert.match(expected, /retained post-Reject capture/);
  assert.match(expected, /Update optional services/);
  assert.doesNotMatch(expected, /deduction|point penalty|scoring withheld/i);
  assert.deepEqual(report, before);
});

test("PDF summary never turns missing findings or unusable control visits into a positive assessment", () => {
  const report = reportFixture();
  report.score.value = null;
  assert.equal(pdfSiteAssessment(report), "Review the retained evidence for this visit.");
  report.consentControlAssessment!.document.identityStatus = "mismatched";
  const consent = pdfSummaryTopics(report)[0]!.visual;
  assert.equal(consent.kind, "choices");
  if (consent.kind === "choices") assert.equal(consent.choices, null);
});

test("each topic uses its own retained evidence visual and unavailable inventories remain unavailable", () => {
  const report = reportFixture();
  const snapshots = pdfSummaryTopics(report);
  assert.deepEqual(snapshots.map(topic => topic.visual.kind), ["choices", "bars", "matrix", "flow", "checks", "network", "certificate", "columns"]);
  assert.deepEqual(snapshots.map(topic => topic.findings.length), [0, 0, 0, 0, 0, 0, 0, 0]);
  report.appendix.cookieAndTrackerInventory.presentationStatus = "insufficient_evidence";
  const limited = pdfSummaryTopics(report);
  for (const id of ["storage", "external"]) {
    const graphic = limited.find(topic => topic.id === id)!.visual;
    assert.ok("unavailable" in graphic && graphic.unavailable);
  }
  const tls = limited.find(topic => topic.id === "tls")!.visual;
  assert.ok(tls.kind === "certificate" && tls.status === "Unavailable");
});


test("policy visual counts every retained disclosure, including review rows at the end of long checklists", () => {
  const report = reportFixture();
  report.appendix.gdprTransparency.rows = Array.from({ length: 40 }, (_, index) => ({ id: `disclosure-${index}`, status: index === 39 ? "Gap observed" : "Observed" })) as CanonicalReportExport["appendix"]["gdprTransparency"]["rows"];
  const policy = pdfSummaryTopics(report).find(topic => topic.id === "policy")!.visual;
  assert.ok(policy.kind === "matrix");
  assert.equal(policy.observed, 39);
  assert.equal(policy.review, 1);
  assert.equal(policy.other, 0);
});
