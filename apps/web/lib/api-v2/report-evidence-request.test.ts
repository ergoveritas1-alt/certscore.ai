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
});

test("a tracking cursor cannot be reused for a different report representation", () => {
  const scanId = "9ba99a8c-b1ad-44c1-985f-92cef760ab40";
  const rows = Array.from({ length: 100 }, (_, i) => ({ i, evidence: "x".repeat(1000), saleAssessment: "not_assessed" }));
  const tracking = { contractVersion: "certscore.tracking-workpaper.v1", rows };
  const page = buildReportEvidencePage({ scanId, report: tracking });
  assert.ok(page.pagination.nextCursor);
  assert.throws(() => buildReportEvidencePage({ scanId, report: { inventory: rows }, cursor: page.pagination.nextCursor }), ReportPageCursorError);
});
