import assert from "node:assert/strict";
import test from "node:test";
import { REPORT_EVIDENCE_SECTIONS, reportEvidencePageSchema } from "@certscore/api-contracts";
import { selectReportEvidenceSection } from "./report-evidence-selection";
import { buildReportDisplayExport } from "./report-display-export";
import { buildReportEvidencePage, ReportPageCursorError } from "./report-evidence-page";

const scanId = "9ba99a8c-b1ad-44c1-985f-92cef760ab40";
test("each focused section preserves canonical context without inventing missing evidence", () => {
  const report = { scan: { id: scanId, scanFrom: "eu_ie", completedAt: "2026-09-12T20:26:00Z" }, score: { value: 72 },
    findings: [{ id: "canonical-finding", confidence: "review" }], coverage: { limitations: ["Partial capture"] },
    controls: { reject: "unknown" }, gpcResponse: { status: "indeterminate", scoreEffect: "none" },
    gdprTransparencyRows: [{ id: "retained-topic" }], transportRows: [], collectionStatus: "Unavailable", inventory: [],
    diagnostic: "private", unrelatedHugeData: "x".repeat(100000),
  };
  const original = structuredClone(report);
  for (const section of REPORT_EVIDENCE_SECTIONS) {
    const selected = selectReportEvidenceSection(report, section);
    assert.deepEqual(selected.report.scan, report.scan);
    assert.equal(selected.report.score, report.score);
    assert.equal(selected.report.findings, report.findings);
    assert.equal(selected.report.coverage, report.coverage);
    assert.equal(selected.report.diagnostic, undefined);
    assert.equal(selected.report.unrelatedHugeData, undefined);
    const page = buildReportEvidencePage({ scanId, report: buildReportDisplayExport(selected.report), section });
    reportEvidencePageSchema.parse({ ...page, selection: selected.selection });
    assert.ok(page.coverage.exclusions.includes("unselected_report_sections"));
    assert.match(page.reconstruction, /selected report sections/);
    assert.ok(Buffer.byteLength(JSON.stringify(selected.report)) < 10000);
  }
  assert.deepEqual(report, original);
  const consent = selectReportEvidenceSection(report, "consent");
  assert.deepEqual(consent.report.controls, { reject: "unknown" });
  assert.ok(consent.selection.notReturnedFields.includes("rejectPath"));
  assert.equal(consent.report.rejectPath, undefined);
  assert.equal(consent.report.gpcResponse, undefined);
  assert.equal(selectReportEvidenceSection(report, "transport").report.transportRows, report.transportRows);
});

test("selection precedes deduplication so retained references never point to excluded fields", () => {
  const repeated = { retained: "evidence ".repeat(150) };
  const selected = selectReportEvidenceSection({ unrelated: repeated, controls: repeated, consentRows: [repeated] }, "consent");
  const projected = buildReportDisplayExport(selected.report) as Record<string, unknown>;
  assert.deepEqual(projected.controls, repeated);
  assert.deepEqual(projected.consentRows, [{ reportContentRef: "/controls" }]);
  assert.equal((projected as any).unrelated, undefined);
});

test("section identity binds cursors even when section payloads happen to be identical", () => {
  const report = { rows: Array.from({ length: 100 }, (_, i) => ({ i, evidence: "x".repeat(1000) })) };
  const first = buildReportEvidencePage({ scanId, report, section: "gpc" });
  const cursor = first.pagination.nextCursor!;
  assert.ok(cursor);
  assert.ok(buildReportEvidencePage({ scanId, report, section: "gpc", cursor }).pagination.offset > 0);
  assert.throws(() => buildReportEvidencePage({ scanId, report, section: "transport", cursor }), ReportPageCursorError);
  assert.throws(() => buildReportEvidencePage({ scanId, report, cursor }), ReportPageCursorError);
  assert.equal(buildReportEvidencePage({ scanId, report }).section, undefined);
});
