import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { CertScoreClient, reconstructReportEvidencePages } from "../packages/certscore-sdk/src/index.js";
import { createCertScoreMcpServer } from "../packages/certscore-mcp/src/server.js";
import { publicCmpAuditSchema, reportEvidencePageSchema } from "../packages/certscore-api-contracts/src/index.js";
import detailedEvidenceExportModule from "../apps/web/lib/scans/detailed-evidence-report.js";
const { buildDetailedEvidenceExport } = detailedEvidenceExportModule;

// Offline verification of actual GET routing, HTTP SDK reads and MCP protocol.
// Only storage, credential validation, throttle and model-loading boundaries are
// fixtures. Report models must already come from canonical retained projections.
// Never point this harness at a deployed server or write a customer report.
async function main() {
  const manifestPath = process.argv[2], receiptPath = process.argv[3];
  assert.ok(manifestPath && receiptPath, "Usage: tsx --tsconfig <react-jsx-config> scripts/verify-cmp-channel-parity.mts <report-manifest.json> <receipt.json>");
  const repo = fileURLToPath(new URL("../", import.meta.url));
  const require = createRequire(resolve(repo, "package.json"));
  const manifest: Array<{ name: string; reportPath: string }> = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.ok(manifest.length);
  const originals = new Map<string, string>();
  const fixtures = new Map<string, { name: string; originalId: string; report: any; private: boolean }>();
  const aliasReportIdentity = (report: any, id: string) => {
    const originalId = report.scan.id;
    report.scan.id = id;
    for (const field of ["cmpAudit", "detailedEvidence", "cmsSecurity", "privacyAuditEvidence"])
      if (report[field]) report[field].scanId = id;
    // Retained image states are unchanged. Rebase existing available form URLs
    // to this fixture's wrapper ID; never fetch images or make one available.
    for (const row of report.collectionTableRows ?? []) if (row.snapshot?.status === "available") {
      const url = new URL(row.snapshot.url, "https://certscore.ai");
      assert.ok(url.pathname.startsWith(`/api/scans/${originalId}/`));
      row.snapshot.url = `https://certscore.ai${url.pathname.replace(`/api/scans/${originalId}/`, `/api/scans/${id}/`)}${url.search}`;
    }
  };
  for (const item of manifest) {
    const bytes = await readFile(item.reportPath);
    originals.set(item.reportPath, createHash("sha256").update(bytes).digest("hex"));
    const report = JSON.parse(bytes.toString());
    publicCmpAuditSchema.parse(buildDetailedEvidenceExport(report).cmpAudit);
    const originalId = report.scan.id;
    // Artifact-only local runs use prefixed IDs, which the public route rightly
    // rejects. Alias public wrapper IDs in this transport fixture only. Retain
    // every criterion, source reference, source hash, status, score and finding.
    const id = randomUUID();
    aliasReportIdentity(report, id);
    fixtures.set(id, { name: item.name, originalId, report, private: false });
  }
  const workspace = randomUUID(), credential = "local-fixture-workspace-key";
  const first = fixtures.values().next().value!;
  const privateId = randomUUID(), privateReport = structuredClone(first.report);
  aliasReportIdentity(privateReport, privateId);
  fixtures.set(privateId, { ...first, name: "private-access-fixture", report: privateReport, private: true });
  const restores: Array<() => void> = [];
  const stub = (path: string, exports: unknown) => {
    const id = require.resolve(path), previous = require.cache[id];
    require.cache[id] = { id, filename: id, loaded: true, exports } as any;
    restores.push(() => { if (previous) require.cache[id] = previous; else delete require.cache[id]; });
  };
  stub("server-only", {});
  const records = new Map([...fixtures].map(([id, value]) => [id, {
    scan: { id, status: "completed", scanConfigJson: { fullSite: false } }, fixture: value,
  }]));
  stub(resolve(repo, "apps/web/server/scans/scan-report-projection.ts"), {
    loadAnonymousPersistedScanReportProjection: async ({ scanId }: { scanId: string }) => {
      const record = records.get(scanId); return record && !record.fixture.private ? record : null;
    },
    loadPersistedScanReportProjection: async ({ scanId, organizationId }: { scanId: string; organizationId: string }) => {
      assert.equal(organizationId, workspace); return records.get(scanId) ?? null;
    },
  });
  stub(resolve(repo, "apps/web/server/scans/verified-timeline-report-model.ts"), {
    buildVerifiedTimelineReportModel: async (record: any) => structuredClone(record.fixture.report),
  });
  stub(resolve(repo, "apps/web/server/pulse/api-v2-read-throttle.ts"), { enforceApiV2ScanReadThrottle: async () => null });
  stub(resolve(repo, "apps/web/server/integrations/api-keys.ts"), {
    parseBearerToken: (request: Request) => {
      const authorization = request.headers.get("authorization");
      return { provided: authorization !== null, token: authorization?.startsWith("Bearer ") ? authorization.slice(7) : null };
    },
    validateCertScoreBearerToken: async (token: string) => token === credential ? { ok: true, key: { organizationId: workspace } } : { ok: false },
  });
  stub(resolve(repo, "apps/web/server/scans/full-site-report.ts"), { loadFullSiteReport: () => { throw Error("Unexpected full-site load"); } });
  stub(resolve(repo, "apps/web/server/scans/report-export.ts"), { buildCanonicalReportExport: () => { throw Error("Unexpected tracking workpaper load"); } });
  const { GET } = require(resolve(repo, "apps/web/app/api/v2/scans/[scanId]/report-evidence/route.ts"));
  const originalFetch = globalThis.fetch;
  const oldAppUrl = process.env.NEXT_PUBLIC_APP_URL, oldSigningSecret = process.env.CERTSCORE_OAUTH_JWT_SECRET;
  let baseUrl = "", requests = 0;
  const server = createServer(async (request, response) => {
    try {
      assert.equal(request.method, "GET", "No scan creation or mutation allowed");
      const url = new URL(request.url!, baseUrl);
      const match = /^\/api\/v2\/scans\/([^/]+)\/report-evidence$/.exec(url.pathname);
      assert.ok(match, "Only retained report evidence reads allowed");
      const headers = new Headers();
      for (const [name, value] of Object.entries(request.headers))
        if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(",") : value);
      const result: Response = await GET(new Request(url, { headers }), { params: Promise.resolve({ scanId: match[1] }) });
      response.writeHead(result.status, Object.fromEntries(result.headers));
      response.end(Buffer.from(await result.arrayBuffer()));
    } catch (error) { response.writeHead(500); response.end(String(error)); }
  });
  const results: object[] = [];
  try {
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address !== "string");
    baseUrl = `http://127.0.0.1:${address.port}`;
    process.env.NEXT_PUBLIC_APP_URL = baseUrl;
    process.env.CERTSCORE_OAUTH_JWT_SECRET = "local-only-fixture-report-download-signing-secret";
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      assert.equal(url.origin, baseUrl, "External network access is prohibited");
      assert.equal(init?.method ?? "GET", "GET"); requests++;
      return originalFetch(input, init);
    }) as typeof fetch;
    for (const [scanId, fixture] of fixtures) {
      if (fixture.private) continue;
      const expectedReport = { ...fixture.report, ...buildDetailedEvidenceExport(fixture.report) };
      for (const section of ["cmp", "consent", undefined] as const) {
        const url = `${baseUrl}/api/v2/scans/${scanId}/report-evidence${section ? `?section=${section}` : ""}`;
        const pages: any[] = []; let cursor: string | undefined;
        do {
          const response = await fetch(url + (cursor ? `${section ? "&" : "?"}cursor=${encodeURIComponent(cursor)}` : ""));
          assert.equal(response.status, 200, fixture.name);
          assert.equal(response.headers.get("x-certscore.ai-route"), "api-v2-report-evidence");
          const page = reportEvidencePageSchema.parse(await response.json()); pages.push(page);
          cursor = page.pagination.nextCursor ?? undefined;
          assert.ok(pages.length <= 100);
        } while (cursor);
        const expected = reconstructReportEvidencePages(pages);
        assert.deepEqual(expected.cmpAudit, JSON.parse(JSON.stringify(expectedReport.cmpAudit)), `${fixture.name}: every CMP field`);
        assert.deepEqual(expected.score, fixture.report.score);
        const findingFacts = (findings: any[]) => findings.map(({ id, rank, title, status, summary, criticality, evidenceRefs }) =>
          ({ id, rank, title, status, summary, criticality, evidenceRefs }));
        assert.deepEqual(findingFacts(expected.findings as any[]), findingFacts(fixture.report.findings));
        const sectionIds = section === "cmp" ? ["cmp"] : section === "consent" ? ["cmp", "consent"] : null;
        assert.deepEqual(expected.detailedEvidence, JSON.parse(JSON.stringify({ ...expectedReport.detailedEvidence,
          sections: expectedReport.detailedEvidence.sections.filter((item: any) => !sectionIds || sectionIds.includes(item.id)) })));
        assert.equal(expected.cmpAudit!.rows.length, 13);
        const sdk = new CertScoreClient({ baseUrl, apiKey: credential });
        assert.deepEqual(await sdk.getReportEvidence(scanId, { section, maxPages: 100 }), expected);
        for (const toolProfile of ["full", "light"] as const) {
          const [ct, st] = InMemoryTransport.createLinkedPair();
          const mcp = createCertScoreMcpServer({ baseUrl, toolProfile, ...(toolProfile === "full" ? { resolveApiKey: () => credential, grantedOAuthScopes: ["scan:read", "mcp"] } : {}) });
          const client = new Client({ name: "local-cmp-parity", version: "1" });
          try {
            await Promise.all([mcp.connect(st), client.connect(ct)]);
            const received: any[] = []; let next: string | undefined;
            do {
              const result = await client.callTool({ name: "certscore_get_report_evidence_page", arguments: { scanId, ...(section ? { section } : {}), ...(next ? { cursor: next } : {}) } });
              assert.ok(!result.isError, JSON.stringify(result.content));
              const page = reportEvidencePageSchema.parse(result.structuredContent); received.push(page);
              next = page.pagination.nextCursor ?? undefined;
              const guidance = result._meta?.["ai.certscore/responseGuidance"] as any;
              if (next) assert.deepEqual(guidance.nextAction.arguments, { scanId, cursor: next, ...(section ? { section } : {}) });
              else assert.equal(guidance.nextAction.tool, null);
              assert.ok(received.length <= 100);
            } while (next);
            assert.deepEqual(reconstructReportEvidencePages(received), expected, `${fixture.name}: MCP ${toolProfile}`);
          } finally { await client.close(); await mcp.close(); }
        }
        const download = await fetch(pages[0].download!.url);
        assert.equal(download.status, 200);
        const downloaded = await download.json();
        const decoded = reconstructReportEvidencePages([{ ...pages[0], entries: [{ path: "", value: downloaded }], pagination: { offset: 0, returned: 1, total: 1, complete: true, nextCursor: null } }]);
        assert.deepEqual(decoded, expected);
        results.push({ provider: fixture.name, originalScanId: fixture.originalId, transportFixtureId: scanId, section: section ?? "full", criteria: 13,
          sourceHash: expected.cmpAudit!.assessmentSourceHash, pages: pages.length, apiSdkFullMcpLightMcpAndDownloadEqual: true });
      }
    }
    const privateUrl = `${baseUrl}/api/v2/scans/${privateId}/report-evidence?section=cmp`;
    assert.equal((await fetch(privateUrl)).status, 404);
    assert.equal((await fetch(privateUrl, { headers: { Authorization: "Bearer invalid-fixture-key" } })).status, 403);
    const privatePage = await fetch(privateUrl, { headers: { Authorization: `Bearer ${credential}` } });
    assert.equal(privatePage.status, 200);
    const privatePayload: any = await privatePage.json();
    assert.equal(privatePayload.download.authentication, "short_lived_report_link");
    assert.equal((await fetch(privatePayload.download.url)).status, 200);
    for (const toolProfile of ["full", "light"] as const) {
      const [ct, st] = InMemoryTransport.createLinkedPair();
      const mcp = createCertScoreMcpServer({baseUrl, toolProfile, ...(toolProfile === "full" ? {resolveApiKey: () => credential} : {})});
      const client = new Client({name: "local-private-access", version: "1"});
      try {
        await Promise.all([mcp.connect(st), client.connect(ct)]);
        const response = await client.callTool({name: "certscore_get_report_evidence_page", arguments: {scanId: privateId, section: "cmp"}});
        assert.equal(Boolean(response.isError), toolProfile === "light", "MCP Light must not expose a private fixture");
      } finally {await client.close(); await mcp.close();}
    }
    const mixed = await fetch(`${baseUrl}/api/v2/scans/${fixtures.keys().next().value}/report-evidence?section=cmp&workpaper=tracking`);
    assert.equal(mixed.status, 400);
    for (const [path, hash] of originals) assert.equal(createHash("sha256").update(await readFile(path)).digest("hex"), hash);
    await writeFile(receiptPath, JSON.stringify({ scope: "local HTTP + actual API GET + source SDK + MCP full/Light protocol", newScans: 0,
      externalNetworkRequests: 0, databaseWrites: 0, deployment: false, requestCount: requests, fixtureBoundaryAdapters: ["retained report storage", "verified model loader", "credential validation", "read throttle"],
      transportFixtureIdsAreNotPublishedReports: true, originalReportBytesUnchanged: true, privateAccessAndDownloadChecksPassed: true, results }, null, 2) + "\n");
    console.log(`Verified ${results.length} report/section cases across API, SDK, MCP full/Light and downloads; ${requests} local GETs; zero external traffic.`);
  } finally {
    globalThis.fetch = originalFetch;
    if (oldAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL; else process.env.NEXT_PUBLIC_APP_URL = oldAppUrl;
    if (oldSigningSecret === undefined) delete process.env.CERTSCORE_OAUTH_JWT_SECRET; else process.env.CERTSCORE_OAUTH_JWT_SECRET = oldSigningSecret;
    await new Promise<void>(resolve => server.close(() => resolve()));
    restores.reverse().forEach(restore => restore());
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
