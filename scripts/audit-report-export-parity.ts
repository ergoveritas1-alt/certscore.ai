import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import type { CanonicalReportExport } from "../apps/web/server/scans/report-export";
import { canonicalReportDocumentContent } from "../apps/web/server/scans/report-export-pdf";
import { pdfPriorityReview } from "../apps/web/server/scans/report-pdf-priorities";
import { pdfReviewGroups } from "../apps/web/server/scans/report-pdf-reader";
import { buildReportPdfV2Model } from "../apps/web/server/scans/report-pdf-v2-model";
import { reportFormInventory } from "../apps/web/server/scans/report-form-inventory";
import { reportRowInFocus } from "../apps/web/lib/scans/report-framework-scope";
import { scopeCanonicalReportPdf } from "../apps/web/server/scans/report-pdf-evidence";
import { reportExecutiveSummary } from "../apps/web/server/scans/report-executive-summary";
import { postAcceptEvidencePacketSchema, projectPostAcceptEvidenceForReport } from "@certscore/contracts";
import { projectPostAcceptForms } from "../apps/web/lib/scans/post-accept-form-projection";

/** Offline audit of a fixed frozen cohort. Does not rematerialize, fetch or
 * rewrite scans. Historical export omissions are recorded as unavailable. */
const COHORT = ["artifacts/independent-production-audit-2026-10-22/scans", "artifacts/postdeploy-independent-review-2026-10-21/scans"];
async function files(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? files(join(root, entry.name)) : entry.name === "report.json" ? [join(root, entry.name)] : []))).flat().sort();
}
async function optional(path: string) {
  try { return await readFile(path); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}
async function retainedFormCheck(path: string, report: CanonicalReportExport) {
  for (const root of [join(dirname(path), "original"), join(dirname(dirname(path)), "support")]) {
    const packetBytes = await optional(join(root, "PostAcceptEvidencePacket.json"));
    if (!packetBytes) continue;
    const parsed = postAcceptEvidencePacketSchema.safeParse(JSON.parse(packetBytes.toString()));
    if (!parsed.success) return { source: root, status: "historical_packet_unsupported" };
    const packet = parsed.data;
    if (packet.parentScanId !== report.scan.id) return { source: root, status: "wrong_scan" };
    if (packet.targetUrl !== report.consentControlAssessment?.scan.finalUrl || createHash("sha256").update(packet.targetUrl).digest("hex") !== packet.exactTargetSha256) return { source: root, status: "target_binding_unverified" };
    const bundleBytes = await optional(join(root, "CanonicalEvidenceBundle.json"));
    if (!bundleBytes) return { source: root, status: "bundle_join_unavailable" };
    const bundle = JSON.parse(bundleBytes.toString());
    assert.equal(bundle.scanId, report.scan.id); assert.deepEqual(bundle.postAcceptEvidence, packet);
    const sha256 = createHash("sha256").update(packetBytes).digest("hex");
    const projection = projectPostAcceptEvidenceForReport({ packet, packetSha256: sha256 });
    const projected = projectPostAcceptForms({ runtimeArtifacts: { consentControlAssessment: report.consentControlAssessment, postAcceptEvidenceProjection: projection } });
    return { source: root, packetSha256: sha256, status: "verified_retained_join", laterFormObservations: projected.rows.length, laterFields: projected.rows.reduce((n, row) => n + row.form.fields.length, 0), limited: projected.limited,
      omittedFromHistoricalExport: projected.rows.length > 0 && !report.appendix.dataCollectionSurfaces.reportInventory };
  }
  return { status: "packet_unavailable" };
}
async function retainedConsumerCheck(path: string, report: CanonicalReportExport) {
  const captures: Record<string, any> = {};
  for (const name of ["api", "sdk", "mcp"]) {
    const bytes = await optional(join(dirname(path), `${name}.json`));
    if (!bytes) continue;
    const value = JSON.parse(bytes.toString());
    captures[name] = name === "mcp" ? value.structuredContent : value;
  }
  if (!captures.api?.type || !captures.sdk?.summary || !captures.mcp?.type) return { status: "matching_triple_unavailable" };
  const fieldDelivery = Object.fromEntries(["formsSummary", "accessibilityAudit", "gpcResponse", "postureScores", "postAcceptObservation", "postRefusalObservation"].map(field => [field,
    Object.fromEntries(Object.entries(captures).map(([name, value]) => [name, value[field] != null || field === "postureScores" && value.summary?.postureScores ? "present" : value.mcpMetadata?.omittedSections?.includes(field) ? "omitted_with_metadata" : "not_retained_in_summary"]))]));
  const checked = ["formsSummary", "accessibilityAudit", "gpcResponse", "postureScores", "postAcceptObservation", "postRefusalObservation"];
  for (const [name, value] of Object.entries(captures)) {
    assert.equal(value.scanId ?? value.scan_id, report.scan.id);
    assert.equal(name === "sdk" ? value.summary.score : value.score, report.score.value);
  }
  for (const field of checked) {
    const present = Object.values(captures).filter(value => value[field] != null);
    for (const value of present.slice(1)) assert.deepEqual(value[field], present[0]![field]);
  }
  return { status: "matching_retained_triple", fields: checked, fieldDelivery,
    contract: "Machine summaries may retain both postures and bounded finding subsets. Compare report-evidence pages for the corresponding scoped web view; omitted summary sections are not absent evidence." };
}
async function main() {
  const { values } = parseArgs({ options: { out: { type: "string" } } });
  if (!values.out) throw new Error("Use --out audit.json. Frozen cohort paths are pinned in this script.");
  const rows: Record<string, unknown>[] = [], errors: Record<string, unknown>[] = [];
  const sites = new Set<string>();
  for (const path of (await Promise.all(COHORT.map(files))).flat().sort()) {
    const bytes = await readFile(path), original = JSON.parse(bytes.toString()) as CanonicalReportExport;
    if (original.artifactVersion !== "canonical-report-export-v8") continue;
    sites.add(original.scan.domainHostname);
    const sha256 = createHash("sha256").update(bytes).digest("hex"), views: Record<string, unknown> = {};
    for (const focus of ["gdpr_eprivacy", "ccpa_cpra"] as const) {
      const report = structuredClone(original); report.reviewFocus = focus; report.reviewFocusLabel = focus === "gdpr_eprivacy" ? "GDPR/ePrivacy" : "CCPA/CPRA";
      const before = JSON.stringify(report);
      try {
        const selected = pdfPriorityReview(report), groups = pdfReviewGroups(report);
        assert.deepEqual(groups.map(g => g.id), selected.topIssues.map(f => f.id));
        const scoped = scopeCanonicalReportPdf(report);
        const executive = reportExecutiveSummary(scoped);
        assert.equal(executive.priorityCount, selected.topIssues.length);
        assert.deepEqual(executive.findings.filter(f => f.priority).map(f => f.id), selected.topIssues.map(f => f.id));
        assert.ok(!executive.topics.some(topic => topic.status === "Pass"));
        assert.ok(scoped.gdprEprivacyReview?.rows.every(row => reportRowInFocus(row.id, focus)) ?? true);
        if (focus === "gdpr_eprivacy") assert.equal(scoped.gpcResponse, null);
        const content = canonicalReportDocumentContent(report).lines.map(line => line.text).join("\n");
        if (focus === "ccpa_cpra") {
          assert.ok(!content.includes("Summary counts:"));
          const euCoverage = report.gdprEprivacyReview?.reviewSummary.coverageText;
          if (euCoverage) assert.ok(!content.includes(euCoverage));
        }
        const inventory = reportFormInventory(report);
        assert.equal(inventory.rows.reduce((n, row) => n + row.form.fields.length, 0), inventory.totalFields);
        assert.equal(inventory.rows.length, inventory.totalForms);
        const runtime = report.appendix.cookieAndTrackerInventory;
        assert.equal(runtime.rows.length, runtime.summary.includedRows);
        assert.equal(runtime.summary.includedRows + runtime.summary.omittedRows, runtime.summary.totalRows);
        if (focus === "gdpr_eprivacy" && report.score.scope === "starting_page") {
          const v2 = buildReportPdfV2Model(report);
          assert.equal(Number(v2.metrics.find(m => m.label === "Top issues")!.value), selected.topIssues.length);
          assert.equal(v2.issues.length, selected.topIssues.length);
          const sourceRuleIds = [...(report.accessibilityEvidence?.violations ?? []), ...(report.accessibilityEvidence?.reviewItems ?? [])].map(rule => rule.help);
          for (const title of sourceRuleIds) assert.ok(JSON.stringify(v2.sections.find(s => s.id === "accessibility")).includes(title));
        }
        assert.equal(JSON.stringify(report), before);
        views[focus] = { priorityIds: selected.topIssues.map(f => f.id), score: focus === "ccpa_cpra" ? report.californiaScore.score : report.score.value, forms: inventory.totalForms, fields: inventory.totalFields, requestInventoryAvailable: Boolean(runtime.requestInventory?.metric), combinedFormInventoryAvailable: inventory.hasCombinedInventory };
      } catch (error) { errors.push({ path, focus, error: error instanceof Error ? error.message : String(error) }); }
    }
    assert.equal(createHash("sha256").update(await readFile(path)).digest("hex"), sha256);
    rows.push({ path, sha256, scanId: original.scan.id, site: original.scan.domainHostname, views, retainedForms: await retainedFormCheck(path, original), consumers: await retainedConsumerCheck(path, original) });
  }
  const result = { cohort: COHORT, reports: rows.length, distinctSites: sites.size, views: rows.length * 2, errors, rows, newScans: 0, historicalFilesChanged: 0, productionVerified: false, deployed: false,
    boundary: "Frozen export consistency audit, not complete historical web replay: historical exports omit complete request and later form inventories. Owned canonical fixtures exercise the actual web model and both exporters." };
  await mkdir(dirname(resolve(values.out)), { recursive: true }); await writeFile(values.out, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify({ reports: rows.length, sites: sites.size, views: rows.length * 2, errors: errors.length, examples: errors.slice(0, 5) }));
  if (errors.length) process.exitCode = 1;
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
