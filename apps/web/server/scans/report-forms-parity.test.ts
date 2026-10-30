import assert from "node:assert/strict";
import test from "node:test";
import { postAcceptReportProjectionSchema } from "@certscore/contracts";
import { projectScanFormsSummary } from "../../lib/api-v2/scan-report-summary";
import { buildTimelineReportModel } from "../../components/scans/report-lab/timeline-report-model";
import { projectReportFormInventory } from "../../lib/scans/report-form-inventory";
import { reportFormsScanFixture } from "./report-forms.fixture";
import { buildCanonicalReportExport } from "./report-export";
import { canonicalReportDocumentContent, renderCanonicalReportPdf } from "./report-export-pdf";
import { pdfSummaryTopics } from "./report-pdf-summary";
import { reportFormInventory } from "./report-pdf-reader";
import { buildReportPdfV2Model } from "./report-pdf-v2-model";

test("web, canonical export, PDF, Word content and v2 keep both after-Accept forms and nine fields", () => {
  const scan = reportFormsScanFixture(), before = structuredClone(scan);
  const web = buildTimelineReportModel(scan); assert.ok("findings" in web);
  const report = buildCanonicalReportExport(scan, undefined, "gdpr_eprivacy")!, rows = web.collectionTableRows!;
  assert.equal(rows.length, 2); assert.equal(web.formsSummary?.totalObserved, 2);
  assert.equal(web.metrics.forms, 2); assert.equal(web.metrics.fields, 9);
  assert.deepEqual(report.appendix.dataCollectionSurfaces.reportInventory!.rows, rows);
  assert.deepEqual(report.appendix.dataCollectionSurfaces.reportInventory!.summary, projectScanFormsSummary(scan));
  assert.equal(report.appendix.dataCollectionSurfaces.summary.totalForms, 0, "historical initial-page inventory keeps its own denominator");
  const inventory = reportFormInventory(report);
  assert.equal(inventory.totalForms, 2); assert.equal(inventory.totalFields, 9); assert.equal(inventory.initialForms, 0); assert.equal(inventory.afterAcceptForms, 2);
  assert.equal(inventory.limited, true);
  const visual = pdfSummaryTopics(report).find(topic => topic.id === "forms")!.visual;
  assert.ok(visual.kind === "flow"); assert.equal(visual.forms, 2); assert.equal(visual.fields, 9);
  const content = canonicalReportDocumentContent(report).lines.map(line => line.text).join("\n");
  assert.match(content, /Inventory summary: 2 forms; 9 fields/); assert.match(content, /Initial page: 0; after Accept: 2/);
  assert.match(content, /capture was limited/); assert.match(content, /Contact field 8/); assert.match(content, /Search/);
  assert.doesNotMatch(content, /\nNo forms found\./);
  const v2 = buildReportPdfV2Model(report);
  assert.match(v2.topics.find(topic => topic.title === "Forms")!.summary, /2 form observations; 2 after Accept/);
  assert.match(JSON.stringify(v2.sections.find(section => section.id === "forms-security")), /Contact field 8/);
  assert.match(renderCanonicalReportPdf(report).toString("latin1"), /2 forms/);
  assert.equal(report.score.value, 80); assert.deepEqual(scan, before);
});

test("EU and California exports share phase counts without changing evidence or scores", () => {
  const scan = reportFormsScanFixture();
  const eu = buildCanonicalReportExport(scan, undefined, "gdpr_eprivacy")!, ca = buildCanonicalReportExport(scan, undefined, "ccpa_cpra")!;
  assert.deepEqual(eu.appendix.dataCollectionSurfaces, ca.appendix.dataCollectionSurfaces);
  assert.deepEqual(reportFormInventory(eu), reportFormInventory(ca)); assert.deepEqual(eu.projection, ca.projection);
});

test("missing receipts, mismatched target proof and unobserved Accept cannot supply later forms", () => {
  for (const bad of ["missing_packet", "wrong_target", "unobserved_accept"]) {
    const scan = reportFormsScanFixture();
    const projection = scan.runtimeArtifacts!.postAcceptEvidenceProjection as Record<string, unknown>;
    if (bad === "missing_packet") delete projection.packetSha256;
    if (bad === "wrong_target") projection.formSnapshotCapture = { ...(projection.formSnapshotCapture as object), exactTargetSha256: "f".repeat(64) };
    if (bad === "unobserved_accept") (scan.runtimeArtifacts!.consentControlAssessment as { controls: { accept: { state: string } } }).controls.accept.state = "unknown";
    const before = structuredClone(scan), report = buildCanonicalReportExport(scan)!;
    assert.equal(reportFormInventory(report).rows.length, 0, bad); assert.equal(projectReportFormInventory(scan).rows.length, 0, bad);
    assert.equal(reportFormInventory(report).afterAcceptForms, null); assert.deepEqual(scan, before);
  }
});

test("initial and later observations with the same form reference remain separate phase records", () => {
  const scan = reportFormsScanFixture(), canonical = scan.canonicalReportProjection!;
  const projection = postAcceptReportProjectionSchema.parse(scan.runtimeArtifacts!.postAcceptEvidenceProjection);
  const form = projection.formSnapshotCapture!.inventory.forms[0]!;
  canonical.collectionSurfaceAssessment = { ...canonical.collectionSurfaceAssessment!, assessmentStatus: "observed", forms: [form] };
  const inventory = projectReportFormInventory(scan);
  assert.equal(inventory.rows.length, 3); assert.equal(inventory.summary?.totalObserved, 3);
  assert.equal(inventory.rows[0]!.capturePhase, undefined); assert.equal(inventory.rows[1]!.capturePhase, "after_accept");
  assert.notEqual(inventory.rows[0]!.id, inventory.rows[1]!.id);
});

test("full-site forms replace the passive homepage inventory and retain the after-Accept records", () => {
  const scan = reportFormsScanFixture(), later = projectReportFormInventory(scan).rows;
  const page = { ...later[0]!, id: "additional-page:collection_form_0", capturePhase: undefined, form: { ...later[0]!.form, pageUrl: "https://example.test/contact" } };
  const inventory = projectReportFormInventory(scan, scan.canonicalReportProjection!, { rows: [page], limitedPages: 1, pagesWithoutInventory: 0 });
  assert.equal(inventory.scope, "full_site"); assert.equal(inventory.rows.length, 3); assert.equal(inventory.passiveObserved, 1); assert.equal(inventory.passiveLimited, true);
  const report = buildCanonicalReportExport(scan, { score: { value: 80 }, collectionSurfaces: { rows: [page], limitedPages: 1, pagesWithoutInventory: 0 } } as never)!;
  assert.equal(reportFormInventory(report).totalForms, 3);
  assert.equal(reportFormInventory(report).initialForms, 1);
  assert.equal(reportFormInventory(report).afterAcceptForms, 2);
  assert.equal(report.score.value, 80);
});

test("historical exports without the combined inventory keep initial coverage and unknown later coverage", () => {
  const report = buildCanonicalReportExport(reportFormsScanFixture())!;
  delete report.appendix.dataCollectionSurfaces.reportInventory;
  const inventory = reportFormInventory(report);
  assert.equal(inventory.totalForms, 0); assert.equal(inventory.afterAcceptForms, null);
  assert.match(canonicalReportDocumentContent(report).lines.map(line => line.text).join("\n"), /after Accept: unavailable in this export/);
});
