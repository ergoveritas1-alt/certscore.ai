import assert from "node:assert/strict";
import test from "node:test";
import type { CanonicalReportExport } from "./report-export";
import { reportVisualEvidenceFixture } from "./report-appendix-evidence.fixture";
import { pdfConsentVisualFocus } from "./report-pdf-visual";

test("PDF control detail requires exact screenshot bytes, dimensions and canonical document binding", () => {
  const assessment = reportVisualEvidenceFixture("scan-1", "a".repeat(64));
  const report = { scan: { id: "scan-1" }, consentControlAssessment: assessment } as CanonicalReportExport;
  const before = structuredClone(report);
  const image = { width: 1000, height: 800, sha256: "a".repeat(64) };
  const focus = pdfConsentVisualFocus(report, image)!;
  assert.deepEqual(focus.crop, { x: 176, y: 202, width: 588, height: 112 });
  assert.deepEqual(focus.controls.map(control => control.intent), ["accept", "reject"]);
  assert.deepEqual(report, before);
  assert.equal(pdfConsentVisualFocus(report, { ...image, sha256: "b".repeat(64) }), null);
  assert.equal(pdfConsentVisualFocus(report, { ...image, width: 999 }), null);
  for (const mutation of ["scan", "document", "withheld", "unknown", "candidate", "bounds"] as const) {
    const changed = structuredClone(report);
    const value = changed.consentControlAssessment!;
    if (mutation === "scan") changed.scan.id = "another-scan";
    if (mutation === "document") value.document.canonicalDocumentToken = "another-document";
    if (mutation === "withheld") value.visualEvidence!.status = "withheld";
    if (mutation === "unknown") value.controls.reject.state = "unknown";
    if (mutation === "candidate") value.evidence[0]!.documentToken = "another-document";
    if (mutation === "bounds") value.visualComparison!.reject.bounds = [980, 250, 160, 40];
    assert.equal(pdfConsentVisualFocus(changed, image), null, mutation);
  }
});
