import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { CertScoreClient, reconstructReportEvidencePages } from "../packages/certscore-sdk/src/index";
import { createCertScoreMcpServer } from "../packages/certscore-mcp/src/server";
import { mcpScanBundleOutputSchema, reportEvidencePageSchema } from "../packages/certscore-api-contracts/src/index";
import buildDetailedEvidenceExportModule from "../apps/web/lib/scans/detailed-evidence-report";
import buildReportDisplayExportModule from "../apps/web/lib/api-v2/report-display-export";
import selectReportEvidenceSectionModule from "../apps/web/lib/api-v2/report-evidence-selection";
import buildReportEvidencePageModule from "../apps/web/lib/api-v2/report-evidence-page";
import CaliforniaPrivacyWorkpaperModule from "../apps/web/components/scans/regulatory-review-focus";

const { buildDetailedEvidenceExport } = buildDetailedEvidenceExportModule;
const { buildReportDisplayExport } = buildReportDisplayExportModule;
const { selectReportEvidenceSection } = selectReportEvidenceSectionModule;
const { buildReportEvidencePage } = buildReportEvidencePageModule;
const { CaliforniaPrivacyWorkpaper } = CaliforniaPrivacyWorkpaperModule;

// Offline replay only. Every fetch is replaced with a saved response or a pure
// report projection; unexpected requests (including scan creation) fail.
async function main() {
  const root = process.argv[2];
  assert.ok(root, "Usage: tsx --tsconfig <react-jsx-config> scripts/verify-detailed-evidence-saved-reports.mts <saved-audit-directory> [receipt.json] [saved-sits-release-directory]");
  const read = (file: string) => JSON.parse(readFileSync(join(root, file), "utf8"));
  const results: object[] = [];
  const previousFetch = globalThis.fetch;
  try {
    const cases = ["no_issues", "many_issues", "limited"].map(name => ({ name, saved: read(`${name}-sdk.json`), resource: read(`${name}-resource.json`) }));
    if (process.argv[4]) {
      const directory = process.argv[4];
      cases.push({ name: "sits", saved: JSON.parse(readFileSync(join(directory, "after-evidence.json"), "utf8")),
        resource: JSON.parse(readFileSync(join(directory, "after-canonical.json"), "utf8")) });
    }
    for (const { name, saved, resource } of cases) {
      const scanId = saved.scan.id;
      const source = { ...saved, privacyAuditEvidence: resource.privacyAuditEvidence };
      const before = structuredClone(source);
      // Public exports retain the CMS projection, not the internal CMS assessment.
      // Preserve that saved section verbatim; this replay does not reassess CMS.
      const generated = buildDetailedEvidenceExport({ ...source, cmsSecurity: undefined });
      const presentation = { ...generated.detailedEvidence,
        sections: [...generated.detailedEvidence.sections, ...saved.detailedEvidence.sections.filter((s: any) => s.id === "cms")] };
      const prepared = { ...source, ...generated, detailedEvidence: presentation, cmsSecurity: saved.cmsSecurity };
      const selected = selectReportEvidenceSection(prepared, "policy");
      const exported = buildReportDisplayExport(selected.report, { scanId });
      const page = (cursor?: string) => buildReportEvidencePage({ scanId, report: exported, section: "policy", cursor });
      const requests: string[] = [];
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        assert.ok(!init?.method || init.method === "GET", "no mutations or scans");
        const url = new URL(String(input)); requests.push(url.pathname);
        let body: unknown;
        if (url.pathname.endsWith("/report-evidence")) {
          assert.equal(url.searchParams.get("section"), "policy");
          body = page(url.searchParams.get("cursor") ?? undefined);
        } else if (name === "no_issues" && url.pathname === `/api/v2/scans/${scanId}`) body = resource;
        else if (name === "no_issues" && url.pathname.includes("pulse")) body = read("no_issues-pulse-full.json");
        else if (name === "no_issues" && url.pathname.endsWith("/findings")) body = { type: "certscore_finding_list", scanId, findings: [] };
        else if (name === "no_issues" && url.pathname.endsWith("/pre-consent-cookies-trackers")) body = { type: "certscore_pre_consent_cookies_trackers", scanId, domain: resource.domain,
          summary: { rowCount: 0, trackerCount: 0, cookieCount: 0, requestCount: 0 }, rows: [] };
        else throw new Error(`Unexpected offline request: ${url.pathname}`);
        return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
      }) as typeof fetch;
      const sdk = new CertScoreClient();
      const reconstructed = await sdk.getReportEvidence(scanId, { section: "policy" });
      const [ct, st] = InMemoryTransport.createLinkedPair();
      const server = createCertScoreMcpServer({ toolProfile: "full" });
      const client = new Client({ name: "saved-report-replay", version: "1.0.0" });
      await Promise.all([server.connect(st), client.connect(ct)]);
      let fullBundle: any;
      try {
        const pages: any[] = []; let cursor: string | undefined;
        do {
          const response = await client.callTool({ name: "certscore_get_report_evidence_page", arguments: { scanId, section: "policy", ...(cursor ? { cursor } : {}) } });
          assert.ok(!response.isError);
          const value = reportEvidencePageSchema.parse(response.structuredContent);
          pages.push(value); cursor = value.pagination.nextCursor ?? undefined;
        } while (cursor);
        assert.deepEqual(reconstructReportEvidencePages(pages), reconstructed);
        if (name === "no_issues") {
          const response = await client.callTool({ name: "certscore_get_scan_bundle", arguments: { scanId, detail: "full", maxBytes: 100_000 } });
          assert.ok(!response.isError);
          fullBundle = mcpScanBundleOutputSchema.parse(response.structuredContent);
          const pulse = read("no_issues-pulse-full.json");
          assert.deepEqual(fullBundle.fullReport.gpcResponse, pulse.gpcResponse);
          assert.equal(fullBundle.fullReport.gpcResponse.comparison.enabledProof.requestEventIds.length, 80);
          assert.deepEqual(fullBundle.privacyAuditEvidence, resource.privacyAuditEvidence);
          assert.equal(fullBundle.score, resource.score);
        }
      } finally { await client.close(); await server.close(); }
      assert.deepEqual(source, before);
      assert.deepEqual(reconstructed.score, saved.score); assert.deepEqual(reconstructed.findings, saved.findings);
      assert.deepEqual(reconstructed.gdprTransparencyRows, saved.gdprTransparencyRows);
      assert.deepEqual(JSON.parse(JSON.stringify(generated.cmpAudit)), saved.cmpAudit);
      for (const old of saved.detailedEvidence.sections) {
        const current = presentation.sections.find((s: any) => s.id === old.id);
        assert.ok(current, `preserve section ${old.id}`);
        assert.deepEqual(current.rows.map((r: any) => [r.id, r.status]), old.rows.map((r: any) => [r.id, r.status]));
      }
      const privacy = reconstructed.detailedEvidence?.sections.find(s => s.id === "privacy");
      const california = source.scan.originCode === "california";
      assert.equal(Boolean(privacy), california);
      if (california) {
        assert.deepEqual(reconstructed.privacyAuditEvidence, resource.privacyAuditEvidence);
        const html = renderToStaticMarkup(React.createElement(CaliforniaPrivacyWorkpaper, { focus: "ccpa_cpra", evidence: resource.privacyAuditEvidence }));
        assert.ok(html.includes(privacy!.title)); assert.ok(html.includes(privacy!.recap));
      }
      for (const row of generated.detailedEvidence.sections.flatMap(s => s.rows)) {
        assert.doesNotMatch(row.summary ?? "", /Post-choice consent-flow automation is deferred|No production-approved topic match was established/);
      }
      results.push({ case: name, scanId, score: saved.score.value, findings: saved.findings.length,
        sections: presentation.sections.length, privacySection: privacy?.recap ?? null,
        apiSdkMcpPolicyParity: true, sourceAssessmentsAndEvidenceUnchanged: true,
        ...(fullBundle ? { fullMcpBundleValid: true, retainedGpcRequestEventIds: 80, fullBundleBytes: fullBundle.mcpMetadata.actualBytes } : {}),
        offlineRequests: requests.length });
    }
  } finally { globalThis.fetch = previousFetch; }
  const receipt = { verification: "offline_saved_report_replay", newScans: 0, networkRequests: 0, assessmentChanges: 0, results };
  if (process.argv[3]) writeFileSync(process.argv[3], `${JSON.stringify(receipt, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
