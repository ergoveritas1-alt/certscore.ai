import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createCertScoreMcpServer } from "../packages/certscore-mcp/src/server";
import { CertScoreClient } from "../packages/certscore-sdk/src/client";
import { reconstructReportEvidencePages } from "../packages/certscore-sdk/src/detailed-evidence";
const { reportRequestScanFixture } = require("../apps/web/server/scans/report-forms.fixture.ts");
const { buildTimelineReportModel } = require("../apps/web/components/scans/report-lab/timeline-report-model.ts");
const { buildCanonicalReportExport } = require("../apps/web/server/scans/report-export.ts");
const { canonicalReportDocumentContent } = require("../apps/web/server/scans/report-export-pdf.ts");
const { buildPulseProjection } = require("../apps/web/lib/pulse/projection.ts");
const { buildApiV2ScanResource } = require("../apps/web/lib/api-v2/scan-resource.ts");
const { buildReportDisplayExport } = require("../apps/web/lib/api-v2/report-display-export.ts");
const { buildReportEvidencePage } = require("../apps/web/lib/api-v2/report-evidence-page.ts");
const { selectReportEvidenceSection } = require("../apps/web/lib/api-v2/report-evidence-selection.ts");
const { scopeReportPresentation } = require("../apps/web/lib/scans/report-framework-scope.ts");
import type { ReportEvidencePage } from "../packages/certscore-sdk/src/types";

test("web, PDF/Word content, API, SDK and both MCP profiles retain identical forms, requests, choice proof and lens scope", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const focus of ["gdpr_eprivacy", "ccpa_cpra"] as const) for (const proof of ["retained", "missing_receipt", "wrong_target"] as const) {
      const scan = reportRequestScanFixture(), scanId = scan.scan.id;
      scan.snapshot.report_projection_status = "ready";
      if (proof === "missing_receipt") delete scan.runtimeArtifacts.postAcceptEvidenceProjection.packetSha256;
      if (proof === "wrong_target") scan.runtimeArtifacts.postAcceptEvidenceProjection.formSnapshotCapture.exactTargetSha256 = "f".repeat(64);
      for (const finding of scan.canonicalReportProjection.ownerUnifiedFindings) finding.sourceRefs = [];
      const before = structuredClone(scan);
      const web = buildTimelineReportModel(scan); assert.ok("findings" in web);
      const view = scopeReportPresentation({ ...web, reviewFocus: focus });
      const exported = buildCanonicalReportExport(scan, undefined, focus)!;
      const resource = buildApiV2ScanResource(scan);
      const pulse = buildPulseProjection({ scanRecord: scan, detail: "summary", format: "json", freshnessMode: "latest", requestedUrl: "https://example.test/", resolutionMode: "test", pulseRequestId: "owned-parity", waitSeconds: 0 });
      assert.deepEqual(pulse.summary.postureScores, resource.postureScores);
      assert.deepEqual(pulse.formsSummary, web.formsSummary);
      view.postureScores = resource.postureScores;
      assert.deepEqual(resource.formsSummary, web.formsSummary);
      assert.equal(resource.score, web.score.value);
      assert.equal(focus === "ccpa_cpra" ? exported.californiaScore.score : exported.score.value, focus === "ccpa_cpra" ? resource.postureScores.ccpaCpra.score : resource.postureScores.gdprEprivacy.score);
      assert.deepEqual(resource.postAcceptObservation, exported.postAcceptObservation ?? null);
      assert.deepEqual(resource.postRefusalObservation, exported.postRefusalObservation ?? null);
      assert.deepEqual(resource.accessibilityAudit, exported.accessibilityAudit);
      const expectedRows = exported.appendix.dataCollectionSurfaces.reportInventory!.rows;
      assert.deepEqual(expectedRows, web.collectionTableRows);
      const content = canonicalReportDocumentContent(exported).lines.map(line => line.text).join("\n");
      assert.equal(expectedRows.length, proof === "retained" ? 2 : 0);
      if (proof === "retained") assert.match(content, /2 forms; 9 fields/);
      else assert.equal(web.formsSummary.afterAcceptObserved, null, "missing or mismatched proof remains unknown");
      assert.match(content, /3 request events; 2 distinct request resources/);
      const calls: string[] = [];
      globalThis.fetch = async (input, init) => {
        const url = new URL(String(input)); calls.push(url.pathname + url.search);
        assert.ok(!init?.method || init.method === "GET", "read-only transport must not create a scan");
        if (url.pathname === `/api/v2/scans/${scanId}/pulse`) return Response.json({ type: "certscore_scan_pulse", scanId, pulse });
        if (url.pathname === `/api/v2/scans/${scanId}`) return Response.json(resource);
        assert.equal(url.pathname, `/api/v2/scans/${scanId}/report-evidence`);
        assert.equal(url.searchParams.get("reviewFocus"), focus);
        const section = url.searchParams.get("section") as "forms" | "tracking" | null;
        const selected = section ? selectReportEvidenceSection(view as unknown as Record<string, unknown>, section).report : view;
        return Response.json(buildReportEvidencePage({ scanId, report: buildReportDisplayExport(selected as unknown as Record<string, unknown>), section: section ?? undefined, reviewFocus: focus, cursor: url.searchParams.get("cursor") }));
      };
      const sdk = new CertScoreClient({ apiKey: "owned-fixture", baseUrl: "https://certscore.ai" });
      assert.deepEqual(await sdk.getScanResource(scanId), resource);
      assert.deepEqual((await sdk.getScanPulse(scanId)).pulse.summary.postureScores, resource.postureScores);
      const sdkFull = await sdk.getReportEvidence(scanId, { reviewFocus: focus });
      assert.deepEqual(sdkFull.postureScores, resource.postureScores);
      assert.deepEqual(sdkFull.formsSummary, web.formsSummary);
      assert.deepEqual((sdkFull.collectionTableRows as typeof expectedRows).map(r => [r.form, r.capturePhase, r.captureLimited]), expectedRows.map(r => [r.form, r.capturePhase, r.captureLimited]));
      assert.deepEqual(sdkFull.inventorySummary, web.inventorySummary);
      assert.deepEqual((sdkFull.resourceInventory as { requestMetric: unknown }).requestMetric, web.resourceInventory!.requestMetric);
      assert.deepEqual((sdkFull.findings as Array<Record<string, unknown>>).map(({ id, title, summary, severity }) => ({ id, title, summary, severity })), view.findings.map(({ id, title, summary, severity }: Record<string, unknown>) => ({ id, title, summary, severity })));
      if (focus === "gdpr_eprivacy") assert.equal(sdkFull.gpcResponse, undefined);
      else assert.deepEqual(sdkFull.gdprTransparencyRows, []);
      for (const toolProfile of ["full", "light"] as const) {
        const server = createCertScoreMcpServer({ apiKey: "owned-fixture", baseUrl: "https://certscore.ai", toolProfile });
        const client = new Client({ name: "CertScore.ai parity fixture", version: "0.0.0" });
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
        try {
          for (const section of ["forms", "tracking"] as const) {
            const pages: ReportEvidencePage[] = []; let cursor: string | undefined;
            do {
              const result = await client.callTool({ name: "certscore_get_report_evidence_page", arguments: { scanId, section, reviewFocus: focus, ...(cursor ? { cursor } : {}) } });
              assert.ok(!result.isError, JSON.stringify(result));
              const page = result.structuredContent as unknown as ReportEvidencePage; pages.push(page);
              cursor = page.pagination.nextCursor ?? undefined;
            } while (cursor);
            const mcp = reconstructReportEvidencePages(pages), viaSdk = await sdk.getReportEvidence(scanId, { section, reviewFocus: focus });
            assert.deepEqual(mcp, viaSdk);
            if (section === "forms") assert.deepEqual(mcp.formsSummary, web.formsSummary);
            if (section === "tracking") assert.deepEqual(mcp.inventorySummary, web.inventorySummary);
          }
        } finally { await client.close(); await server.close(); }
      }
      assert.ok(calls.length > 5); assert.deepEqual(scan, before);
    }
  } finally { globalThis.fetch = originalFetch; }
});
