import assert from "node:assert/strict";
import test from "node:test";
import { reportRequestScanFixture } from "./report-forms.fixture";
import { buildTimelineReportModel } from "../../components/scans/report-lab/timeline-report-model";
import { buildCanonicalReportExport } from "./report-export";
import { canonicalReportDocumentContent } from "./report-export-pdf";
import { buildReportPdfV2Model } from "./report-pdf-v2-model";
import { pdfSummaryTopics } from "./report-pdf-summary";
import { priorityChecklistRow, priorityReportFixture } from "./report-priority.fixture";
import { REPORT_TRANSPORT_CHECKS } from "../../lib/scans/report-runtime-inventory";


test("web and exports share complete request-event counts, resource identities and classifications", () => {
  const scan = reportRequestScanFixture(), before = structuredClone(scan), web = buildTimelineReportModel(scan);
  assert.ok("findings" in web);
  const report = buildCanonicalReportExport(scan)!, inventory = report.appendix.cookieAndTrackerInventory.requestInventory!;
  assert.deepEqual(report.appendix.cookieAndTrackerInventory.summary.inventoryMetrics, web.inventorySummary);
  assert.equal(inventory.metric!.value, 3); assert.equal(inventory.totalResources, 2);
  assert.equal(inventory.rows.reduce((n, row) => n + row.eventCount, 0), 3);
  assert.equal(inventory.metric!.overview!.identifiedServices, web.resourceInventory!.requestMetric!.overview!.identifiedServices);
  assert.ok(inventory.rows.some(row => row.classification === "Essential"));
  assert.ok(inventory.rows.some(row => row.classification === "Unclassified"));
  const content = canonicalReportDocumentContent(report).lines.map(line => line.text).join("\n"), v2 = buildReportPdfV2Model(report);
  assert.match(content, /3 request events; 2 distinct request resources before a choice/);
  assert.match(content, /asset-2\.js/); assert.match(JSON.stringify(v2.sections.find(s => s.id === "external")), /asset-2\.js/);
  assert.equal(v2.sections.find(s => s.id === "external")!.status, "Needs review", "retained canonical review finding keeps precedence over inventory presence");
  assert.match(v2.sections.find(s => s.id === "external")!.summary, /3 request events and 2 distinct request resources/);
  assert.doesNotMatch(JSON.stringify(inventory), /PRIVATE_VALUE/);
  assert.deepEqual(scan, before); assert.equal(report.score.value, 80);
});

test("both lenses keep initial and later request denominators separate", () => {
  const scan = reportRequestScanFixture();
  const reports = (["gdpr_eprivacy", "ccpa_cpra"] as const).map(focus => buildCanonicalReportExport(scan, undefined, focus)!);
  assert.deepEqual(reports[0]!.appendix.cookieAndTrackerInventory, reports[1]!.appendix.cookieAndTrackerInventory);
  for (const report of reports) {
    const content = canonicalReportDocumentContent(report).lines.map(line => line.text).join("\n");
    assert.match(content, /3 request events; 2 distinct request resources before a choice/);
    assert.match(content, /Click completed|Click incomplete|Not captured/);
    assert.deepEqual(report.projection, reports[0]!.projection);
  }
});

test("incomplete or missing retained request events cannot become a zero breakdown", () => {
  for (const mode of ["missing", "incomplete", "wrong_phase"]) {
    const scan = reportRequestScanFixture();
    const hybrid = scan.runtimeArtifacts!.hybridRuntimeEvidence as Record<string, unknown>;
    if (mode === "missing") delete hybrid.requestObservations;
    if (mode === "incomplete") hybrid.requestObservations = [];
    if (mode === "wrong_phase") (hybrid.requestObservations as Array<Record<string, unknown>>)[0]!.preConsent = false;
    const report = buildCanonicalReportExport(scan)!;
    const inventory = report.appendix.cookieAndTrackerInventory.requestInventory!;
    assert.equal(inventory.status, "unavailable"); assert.equal(inventory.metric, null); assert.equal(inventory.totalResources, null);
    const metric = report.appendix.cookieAndTrackerInventory.summary.inventoryMetrics!.find(m => m.label === "Requests")!;
    assert.equal(metric.value, 3); assert.equal(metric.counts, undefined);
    assert.doesNotMatch(canonicalReportDocumentContent(report).lines.map(line => line.text).join("\n"), /0 request events; 0 distinct/);
  }
});

test("bounded tables retain complete totals and explicit omitted-row counts", () => {
  const report = buildCanonicalReportExport(reportRequestScanFixture(505))!, inventory = report.appendix.cookieAndTrackerInventory.requestInventory!;
  assert.equal(inventory.metric!.value, 505); assert.equal(inventory.totalResources, 504);
  assert.equal(inventory.rows.length, 500); assert.equal(inventory.omittedResources, 4);
  assert.match(canonicalReportDocumentContent(report).lines.map(line => line.text).join("\n"), /4 additional resource rows/);
});

test("California PDF and Word content never include the EU review summary or EU summary counts", () => {
  const report = buildCanonicalReportExport(reportRequestScanFixture(), undefined, "ccpa_cpra")!;
  report.gdprEprivacyReview = priorityReportFixture().gdprEprivacyReview;
  report.gdprEprivacyReview!.reviewSummary.coverageText = "EU_SUMMARY_SENTINEL";
  report.gdprEprivacyReview!.reviewSummary.priorityReviewText = "EU_PRIORITY_SENTINEL";
  const content = canonicalReportDocumentContent(report).lines.map(line => line.text).join("\n");
  assert.doesNotMatch(content, /EU_SUMMARY_SENTINEL|EU_PRIORITY_SENTINEL|Summary counts:|persisted GDPR\/ePrivacy/);
  assert.match(content, /CCPA\/CPRA/);
});

test("all five canonical transport checks appear in PDF summaries and v2 details, including form transport", () => {
  const report = priorityReportFixture();
  report.gdprEprivacyReview!.rows = REPORT_TRANSPORT_CHECKS.map(([label, id]) => ({ ...priorityChecklistRow(id, "Observed"), label })) as unknown as NonNullable<typeof report.gdprEprivacyReview>["rows"];
  report.appendix.evidenceDossier!.checklistDetails = REPORT_TRANSPORT_CHECKS.map(([label, id]) => ({ id, label, topic: id === "transport_security_form_transport" ? "forms" : id === "transport_security_tls_certificate" ? "tls" : "security", status: "Observed", explanation: "Owned retained transport assessment.", note: "Owned retained transport assessment.", facts: [], correctionSteps: [], subchecks: [], evidenceRefs: [] }));
  const visual = pdfSummaryTopics(report).find(t => t.id === "security")!.visual;
  assert.ok(visual.kind === "transport"); assert.equal(visual.checks.length, 5);
  const v2 = buildReportPdfV2Model(report), security = v2.sections.find(s => s.id === "forms-security")!;
  const table = security.blocks.find(b => b.kind === "table" && b.title === "E.1 Transport assessments");
  assert.ok(table?.kind === "table"); assert.equal(table.rows.length, 5);
  assert.match(JSON.stringify(v2.topics.find(t => t.title === "Transport security")), /5 saved assessments/);
});

test("unavailable historical inventories stay unavailable in v2 rather than reporting zero non-essential observations", () => {
  const report = priorityReportFixture();
  report.appendix.cookieAndTrackerInventory.summary.inventoryMetrics = [{ label: "Cookies & storage", value: 0, counts: { nonEssential: 0, review: 0, contextual: 0, essential: 0 } }];
  const v2 = buildReportPdfV2Model(report);
  assert.equal(v2.metrics.find(m => m.label === "Before a choice")!.value, "Unknown");
  assert.match(v2.topics.find(t => t.title === "Cookies and storage")!.summary, /unavailable/);
});


test("request-only retained inventory is observed even without a service signature or choice-session sample", () => {
  const report = buildCanonicalReportExport(reportRequestScanFixture())!;
  report.projection.unifiedFindings = []; report.projection.checklist = [];
  const section = buildReportPdfV2Model(report).sections.find(s => s.id === "external")!;
  assert.equal(section.status, "Observed"); assert.match(section.summary, /3 request events and 2 distinct request resources/);
});
