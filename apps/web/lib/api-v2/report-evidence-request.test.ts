import assert from "node:assert/strict";
import test from "node:test";
import { parseReportEvidenceRequest } from "./report-evidence-request";
import { buildReportEvidencePage, ReportPageCursorError } from "./report-evidence-page";

test("tracking downloads use the download authorization path; invalid format combinations fail closed", () => {
  const parse = (q: string) => parseReportEvidenceRequest(new URLSearchParams(q));
  assert.deepEqual(parse(""), { tracking: false, csv: false, download: false });
  assert.deepEqual(parse("workpaper=tracking"), { tracking: true, csv: false, download: false });
  assert.deepEqual(parse("workpaper=tracking&format=csv"), { tracking: true, csv: true, download: true });
  assert.deepEqual(parse("workpaper=tracking&format=download"), { tracking: true, csv: false, download: true });
  for (const q of ["format=csv", "workpaper=other", "format=pdf", "format="]) assert.equal(parse(q), null);
  assert.deepEqual(parse("section=gpc"), { tracking: false, csv: false, download: false, section: "gpc" });
  assert.deepEqual(parse("section=policy&format=download"), { tracking: false, csv: false, download: true, section: "policy" });
  for (const q of ["section=other", "section=", "section=gpc&section=consent", "section=gpc&workpaper=tracking", "section=forms&format=csv"]) assert.equal(parse(q), null);
});

test("a tracking cursor cannot be reused for a different report representation", () => {
  const scanId = "9ba99a8c-b1ad-44c1-985f-92cef760ab40";
  const rows = Array.from({ length: 100 }, (_, i) => ({ i, evidence: "x".repeat(1000), saleAssessment: "not_assessed" }));
  const tracking = { contractVersion: "certscore.tracking-workpaper.v1", rows };
  const page = buildReportEvidencePage({ scanId, report: tracking });
  assert.ok(page.pagination.nextCursor);
  assert.throws(() => buildReportEvidencePage({ scanId, report: { inventory: rows }, cursor: page.pagination.nextCursor }), ReportPageCursorError);
});


test("explicit EU/California evidence views validate their scope and bind continuation cursors", () => {
  for (const reviewFocus of ["gdpr_eprivacy", "ccpa_cpra"] as const) {
    assert.deepEqual(parseReportEvidenceRequest(new URLSearchParams({ section: "policy", reviewFocus })), { tracking: false, csv: false, download: false, section: "policy", reviewFocus });
  }
  for (const query of ["reviewFocus=other", "reviewFocus=", "reviewFocus=gdpr_eprivacy&reviewFocus=ccpa_cpra", "workpaper=tracking&reviewFocus=ccpa_cpra"]) assert.equal(parseReportEvidenceRequest(new URLSearchParams(query)), null);
  const input = { scanId: "9ba99a8c-b1ad-44c1-985f-92cef760ab40", report: { rows: Array.from({ length: 100 }, (_, i) => ({ i, text: "x".repeat(1000) })) } };
  const first = buildReportEvidencePage({ ...input, reviewFocus: "ccpa_cpra" });
  assert.match(first.reportUrl, /reviewFocus=ccpa_cpra/); assert.equal(first.reviewFocus, "ccpa_cpra");
  assert.ok(first.pagination.nextCursor);
  assert.throws(() => buildReportEvidencePage({ ...input, reviewFocus: "gdpr_eprivacy", cursor: first.pagination.nextCursor }), ReportPageCursorError);
  assert.throws(() => buildReportEvidencePage({ ...input, cursor: first.pagination.nextCursor }), ReportPageCursorError);
});
