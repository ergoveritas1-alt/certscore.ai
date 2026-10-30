import { reportStatusLabel } from "../../lib/scans/report-status-presentation";
import assert from "node:assert/strict";
import test from "node:test";
import { reportExecutiveSummary } from "./report-executive-summary";
import { priorityReportFixture } from "./report-priority.fixture";
import { reportFormsScanFixture } from "./report-forms.fixture";
import { buildCanonicalReportExport } from "./report-export";
import { pdfPriorityReview } from "./report-pdf-priorities";
import { pdfNarrativeFindings, scopeCanonicalReportPdf } from "./report-pdf-evidence";
import { reportFormInventory } from "./report-form-inventory";
import { buildReportPdfV2Model } from "./report-pdf-v2-model";
import { executiveScoreRingSvg } from "./report-executive-docx";

test("the reference layout separates the selected priority from all four canonical findings", () => {
  const report = priorityReportFixture(), before = structuredClone(report), summary = reportExecutiveSummary(report);
  assert.equal(summary.priorityCount, 1); assert.equal(summary.findings.length, 4);
  assert.equal(summary.findings.filter(f => f.priority).length, 1);
  assert.equal(summary.findings[0]!.id, pdfPriorityReview(report).topIssues[0]!.id);
  assert.equal(summary.metrics[0]!.value, "1"); assert.match(summary.metrics[0]!.note, /4 report findings/);
  assert.ok(!("highlights" in summary), "Export executive pages omit the narrative paragraph; web highlights remain canonical");
  assert.deepEqual(summary.topics.map(t => t.status), buildReportPdfV2Model(report).topics.map(t => reportStatusLabel(t.status)));
  assert.equal(summary.findings.find(f => f.id === "post_accept_consent_dependent_activity")!.status, "For information");
  assert.deepEqual(report, before);
});

test("both frameworks preserve later forms, scope, findings and score without adding GPC to EU", () => {
  const scan = reportFormsScanFixture();
  for (const focus of ["gdpr_eprivacy", "ccpa_cpra"] as const) {
    const report = scopeCanonicalReportPdf(buildCanonicalReportExport(scan, undefined, focus)!), before = structuredClone(report);
    const summary = reportExecutiveSummary(report);
    assert.equal(summary.findings.filter(f => f.priority).length, pdfPriorityReview(report).topIssues.length);
    assert.equal(summary.score, focus === "ccpa_cpra" ? report.californiaScore.score : 80);
    assert.equal(summary.topics.find(t => t.target === "forms")!.status, "Observed");
    assert.equal(reportFormInventory(report).totalForms, 2); assert.equal(reportFormInventory(report).totalFields, 9);
    assert.equal(summary.scoreScope, "Starting-page score");
    if (focus === "ccpa_cpra") assert.ok(summary.metrics.every(metric => !metric.attention), "Coverage counts are neutral, not warning metrics");
    assert.ok(!summary.topics.some(t => /GPC|Global Privacy Control/.test(t.title)));
    assert.ok(!summary.topics.some(t => /Pass/.test(t.status)));
    assert.deepEqual(report, before);
  }
});

test("unknown, suppressed and informational evidence cannot become selected priorities or passes", () => {
  const report = priorityReportFixture();
  report.projection.checklist = [];
  report.projection.unifiedFindings = report.projection.unifiedFindings.map(f => ({ ...f, presentationDecision: { ...f.presentationDecision, status: "suppress" } }));
  const before = structuredClone(report), summary = reportExecutiveSummary(report);
  assert.equal(summary.priorityCount, 0); assert.equal(summary.findings.length, 0);
  assert.equal(summary.metrics[1]!.value, "Unknown");
  assert.ok(summary.metrics.every(metric => !metric.attention));
  assert.equal(summary.topics.find(t => t.target === "forms")!.status, "Partial");
  assert.equal(pdfNarrativeFindings(report).length, 0); assert.deepEqual(report, before);
});

test("full-site and California score scopes stay distinct, including an unavailable score", () => {
  const report = priorityReportFixture(); report.score.scope = "full_site";
  assert.equal(reportExecutiveSummary(report).scoreScope, "Full-site score");
  assert.doesNotMatch(JSON.stringify(reportExecutiveSummary(report).metrics), /California/);
  report.reviewFocus = "ccpa_cpra";
  assert.equal(reportExecutiveSummary(report).scoreScope, "Starting-page score");
  report.californiaScore.score = null;
  assert.equal(reportExecutiveSummary(report).score, null);
});

test("Word score graphics use bundled outlines without operating-system fonts or remote assets", () => {
  for (const score of [null, 0, 80, 100, .0000001]) {
    const svg = executiveScoreRingSvg(score);
    assert.match(svg, /<path d="M/);
    assert.doesNotMatch(svg, /<text|font-family|@font|https?:\/\/(?!www\.w3\.org)/);
    assert.doesNotMatch(svg, /NaN|undefined|Infinity/);
  }
});
