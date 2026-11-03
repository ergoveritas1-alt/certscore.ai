import assert from "node:assert/strict";
import { serializeCanonicalEvidenceArtifact } from "@certscore/contracts/dist/canonical-evidence-artifact.js";
import { createHash } from "node:crypto";
import test from "node:test";
import { createRequire } from "node:module";
import type { ScanDetailResponse } from "../apps/web/server/scans/get-scan-by-id";
import type { PersistedCanonicalReportProjection } from "../apps/web/server/scans/persisted-canonical-report-projection";
import { buildUnifiedFindingDisplayPackets } from "../apps/web/lib/scans/unified-findings";
import { buildPersistedScanReportProjection, readPersistedScanReportProjection, SCAN_REPORT_PROJECTION_VERSION } from "../apps/web/server/scans/scan-report-projection-contract";
import { buildCanonicalReportExport } from "../apps/web/server/scans/report-export";
import { renderCanonicalReportPdf } from "../apps/web/server/scans/report-export-pdf";

function scanRecord(): ScanDetailResponse {
  const scanId = "00000000-0000-0000-0000-000000000001";
  return {
    scan: {
      id: scanId,
      domainHostname: "example.test",
      status: "completed",
      scanType: "full",
      scanFromValue: "eu_ie",
      createdAt: "2026-08-24T00:00:00.000Z",
      startedAt: "2026-08-24T00:00:01.000Z",
      completedAt: "2026-08-24T00:00:20.000Z",
      durationMs: 19_000,
      pagesRequested: 1,
      pagesScanned: 1,
    },
    canonicalReportProjection: {
      artifactVersion: "persisted-canonical-report-projection-v2",
      checklistRows: [],
      derivedContext: {},
      globalUnifiedFindings: [],
      legacyScoreAssessmentInput: { scanId },
      normalizedConcerns: [],
      ownerUnifiedFindings: [],
      topFindingIds: [],
    },
    runtimeArtifacts: {
      rawDisplayOnlyFinding: "must-not-be-exported",
    },
    trackerVendors: [],
    events: [],
  } as unknown as ScanDetailResponse;
}

test("GPC product availability reasons survive public surfaces while the paired settings remain omitted",async()=>{
  const {gpcProductFixture}=await import("../apps/web/lib/scans/test-fixtures/gpc-product");
  const localRequire=createRequire(import.meta.url);
  (localRequire.cache as Record<string,unknown>)[localRequire.resolve("server-only")]={exports:{},loaded:true};
  const {buildGpcResponseRuntimeProjection}=await import("../apps/web/server/scans/local-v2-dag-report");
  const {buildGpcResponseReportProjection}=await import("../apps/web/components/scans/report-lab/gpc-report-projection");
  const {apiV2GpcResponseSchema}=await import("@certscore/api-contracts");
  const {deriveApiV2GpcResponse}=await import("../apps/web/lib/api-v2/scan-resource");
  const {renderPulseMarkdown}=await import("../apps/web/lib/pulse/markdown");
  const {scanBundleText}=await import("../packages/certscore-mcp/src/tools");
  const {pdfPriorityReview}=await import("../apps/web/server/scans/report-pdf-priorities");
  for(const apiUnavailable of [false,true]){
  const scan=scanRecord(), f=gpcProductFixture({scanId:scan.scan.id,
    ...(apiUnavailable?{apiUnavailable:true}:{notReady:"signal_status_not_ready" as const}),baselineReadbackIncomplete:true});
  assert.equal(f.cmpStateComparison,undefined);
  const runtime=buildGpcResponseRuntimeProjection({scanId:scan.scan.id,gpcResponseAssessment:f.assessment});
  const packets=buildUnifiedFindingDisplayPackets({runtimeArtifacts:runtime,reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map()});
  const web=buildGpcResponseReportProjection(packets)!;
  assert.equal(web.assessment.contractVersion,"certscore.gpc-response-assessment.v3");
  if(web.assessment.contractVersion==="certscore.gpc-response-assessment.v3")
    assert.deepEqual(web.assessment.observation.semanticReadiness,f.assessment.observation.semanticReadiness);
  const canonical=(scan as unknown as {canonicalReportProjection:PersistedCanonicalReportProjection}).canonicalReportProjection;
  canonical.ownerUnifiedFindings=packets;canonical.globalUnifiedFindings=packets;
  const persisted=buildPersistedScanReportProjection(scan);
  const restored=readPersistedScanReportProjection({scan:scan.scan,snapshot:{report_projection_computed_at:"2026-11-02T00:00:00.000Z",
    report_projection_payload:JSON.parse(persisted.serialized),report_projection_payload_sha256:persisted.sha256,
    report_projection_payload_size_bytes:persisted.sizeBytes,report_projection_status:"ready",report_projection_version:SCAN_REPORT_PROJECTION_VERSION}})!;
  const ca=buildCanonicalReportExport(restored,undefined,"ccpa_cpra")!,eu=buildCanonicalReportExport(restored,undefined,"gdpr_eprivacy")!;
  const response=apiV2GpcResponseSchema.parse(ca.gpcResponse);
  const api=deriveApiV2GpcResponse(restored);
  assert.deepEqual(api?.observation?.semanticReadiness,f.assessment.observation.semanticReadiness);
  assert.equal(api?.cmpStateComparison,undefined);
  assert.deepEqual(response.observation?.semanticReadiness,f.assessment.observation.semanticReadiness);
  assert.equal(response.cmpStateComparison,undefined);
  const markdown=renderPulseMarkdown({domain:"example.test",scanId:scan.scan.id,scanStatus:"completed",gpcResponse:response,topFindings:[],links:{},summary:{}});
  // The renderer wraps PDF text into separate Tj operands. Join the visible
  // operands so paragraph assertions do not depend on a line-wrap position.
  const pdf=renderCanonicalReportPdf(ca).toString("latin1");
  const pdfText=[...pdf.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)].map(match=>match[1]!.replace(/\\([\\()])/g,"$1")).join(" ");
  for(const text of [markdown,scanBundleText({scanId:scan.scan.id,status:"completed",gpcResponse:response} as never),pdfText]) {
    assert.match(text,apiUnavailable?/supported GPP API was not callable/:/signal status other than ready/);
    assert.match(text,/GPC-off browser readback was not verified/);
    assert.doesNotMatch(text,/fixture-loader|documentToken|GppString|deduct/i);
  }
  assert.doesNotMatch(renderCanonicalReportPdf(eu).toString("latin1"),/signal status other than ready|supported GPP API was not callable|settings comparison is unavailable/);
  const legacy=structuredClone(f.assessment);delete legacy.observation.semanticReadiness;
  const without=buildUnifiedFindingDisplayPackets({runtimeArtifacts:{gpcResponseAssessment:legacy},reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map()});
  canonical.ownerUnifiedFindings=without;canonical.globalUnifiedFindings=without;
  assert.deepEqual(pdfPriorityReview(ca),pdfPriorityReview(buildCanonicalReportExport(scan,undefined,"ccpa_cpra")!));
  }
});

test("GPC product packets survive runtime, concern/policy, hydration, web/API/JSON/PDF/Markdown/MCP without altering findings", async () => {
  const {gpcProductFixture} = await import("../apps/web/lib/scans/test-fixtures/gpc-product");
  const localRequire = createRequire(import.meta.url);
  (localRequire.cache as Record<string,unknown>)[localRequire.resolve("server-only")] = {exports:{},loaded:true};
  const {buildGpcResponseRuntimeProjection} = await import("../apps/web/server/scans/local-v2-dag-report");
  const {buildGpcResponseReportProjection} = await import("../apps/web/components/scans/report-lab/gpc-report-projection");
  const {renderPulseMarkdown} = await import("../apps/web/lib/pulse/markdown");
  const {scanBundleText} = await import("../packages/certscore-mcp/src/tools");
  const {pdfPriorityReview} = await import("../apps/web/server/scans/report-pdf-priorities");
  const {apiV2GpcResponseSchema} = await import("@certscore/api-contracts");
  const scan = scanRecord(), fixture = gpcProductFixture({scanId:scan.scan.id,contradiction:true});
  const packet = fixture.cmpStateComparison!;
  assert.ok(packet);
  const runtime = buildGpcResponseRuntimeProjection({scanId:scan.scan.id,gpcResponseAssessment:fixture.assessment,gpcCmpStateComparison:packet});
  assert.deepEqual(runtime.gpcCmpStateComparison,packet);
  const project = (artifacts: Record<string,unknown>) => buildUnifiedFindingDisplayPackets({runtimeArtifacts:artifacts,reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map()});
  const packets = project(runtime), without = project({gpcResponseAssessment:fixture.assessment});
  const effects = (rows: typeof packets) => rows.map(f=>({id:f.unifiedFindingId,severity:f.severity,score:f.scoreEffects,status:f.presentationDecision.status}));
  assert.deepEqual(effects(packets),effects(without));
  const web = buildGpcResponseReportProjection(packets)!;
  assert.deepEqual(web.cmpStateComparison,packet);
  assert.equal(web.guidance?.items.find(i=>i.code==='gpc_choice_contradiction')?.kind,'adverse');
  const canonical = (scan as unknown as {canonicalReportProjection:PersistedCanonicalReportProjection}).canonicalReportProjection;
  canonical.ownerUnifiedFindings=packets;canonical.globalUnifiedFindings=packets;
  const persisted = buildPersistedScanReportProjection(scan);
  const restored = readPersistedScanReportProjection({scan:scan.scan,snapshot:{report_projection_computed_at:"2026-11-01T00:00:00.000Z",
    report_projection_payload:JSON.parse(persisted.serialized),report_projection_payload_sha256:persisted.sha256,report_projection_payload_size_bytes:persisted.sizeBytes,
    report_projection_status:"ready",report_projection_version:SCAN_REPORT_PROJECTION_VERSION}})!;
  assert.ok(restored);
  const ca = buildCanonicalReportExport(restored,undefined,"ccpa_cpra")!, eu=buildCanonicalReportExport(restored,undefined,"gdpr_eprivacy")!;
  assert.deepEqual(ca.gpcResponse?.cmpStateComparison,packet);
  assert.deepEqual(apiV2GpcResponseSchema.parse(ca.gpcResponse).cmpStateComparison,packet);
  assert.deepEqual(JSON.parse(JSON.stringify(ca)).gpcResponse.cmpStateComparison,packet);
  assert.doesNotMatch(JSON.stringify(ca),/fixture-loader|independent-baseline-loader|prototypeCaptureBinding|documentToken/);
  const response = ca.gpcResponse!;
  const markdown = renderPulseMarkdown({domain:"example.test",scanId:scan.scan.id,scanStatus:"completed",gpcResponse:response,topFindings:[],links:{},summary:{}});
  const mcp = scanBundleText({scanId:scan.scan.id,status:"completed",gpcResponse:response} as never);
  const pdf = renderCanonicalReportPdf(ca).toString('latin1');
  const {pdfPublicWords}=await import('../apps/web/server/scans/report-pdf-reader');
  const contradiction=response.guidance!.items.find(i=>i.code==='gpc_choice_contradiction')!.observation;
  assert.match(pdfPublicWords(contradiction),/receipt were observed while/);
  for (const text of [markdown,mcp,pdf]) {
    assert.match(text,/Site-recorded opt-out settings/);assert.match(text,/What to check/);
    assert.match(text,/site-recorded GPC receipt/);assert.doesNotMatch(text,/fixture-loader|independent-baseline-loader/);
  }
  assert.doesNotMatch(renderCanonicalReportPdf(eu).toString('latin1'),/Site-recorded opt-out settings|site-recorded GPC receipt/);
  const bad = {...packet,gpc:{...packet.gpc,sale:'opted_out' as const}};
  assert.equal(buildGpcResponseRuntimeProjection({scanId:scan.scan.id,gpcResponseAssessment:fixture.assessment,gpcCmpStateComparison:bad}).gpcCmpStateComparison,undefined);
  const unbound=project({...runtime,gpcCmpStateComparison:{...packet,sourceHashes:{...packet.sourceHashes,baseline:'f'.repeat(64)}}});
  assert.equal(buildGpcResponseReportProjection(unbound)?.cmpStateComparison,undefined);
  assert.deepEqual(effects(unbound),effects(packets));
  assert.equal(apiV2GpcResponseSchema.safeParse({...response,cmpStateComparison:bad}).success,false);
  assert.equal(apiV2GpcResponseSchema.safeParse({...response,cmpStateComparison:{...packet,scanId:'foreign'}}).success,false);
  canonical.ownerUnifiedFindings=without;canonical.globalUnifiedFindings=without;
  const legacy=buildCanonicalReportExport(scan,undefined,"ccpa_cpra")!;
  assert.equal(legacy.gpcResponse?.cmpStateComparison,undefined);
  assert.equal(legacy.gpcResponse?.observation?.registration.sale,'not_opted_out');
  assert.deepEqual(pdfPriorityReview(ca),pdfPriorityReview(legacy));
});

test("GPC product paired successful collection survives canonical handoff and all public surfaces without policy effects", async () => {
  const req = createRequire(import.meta.url);
  (req.cache as Record<string, unknown>)[req.resolve("server-only")] = { exports: {}, loaded: true };
  const { collectionPairFixture, collectionFixtureSource } = await import("../packages/certscore-scan-core/src/test-fixtures/gpc-collection-pair.cases");
  const { buildGpcActivityComparison } = await import("../packages/certscore-scan-core/src/gpc-activity-comparison");
  const { buildGpcProductionAssessment } = await import("../packages/certscore-scan-core/src/gpc-production-observation");
  const { buildGpcResponseAssessment } = await import("../packages/certscore-scan-core/src/gpc-response-assessment");
  const { buildGpcResponseRuntimeProjection } = await import("../apps/web/server/scans/local-v2-dag-report");
  const { buildGpcResponseReportProjection } = await import("../apps/web/components/scans/report-lab/gpc-report-projection");
  const { apiV2GpcResponseSchema } = await import("@certscore/api-contracts");
  const { renderPulseMarkdown } = await import("../apps/web/lib/pulse/markdown");
  const { scanBundleText } = await import("../packages/certscore-mcp/src/tools");
  const { gpcCookieReadWideDictionaryFixture } = await import("../packages/certscore-scan-core/src/test-fixtures/gpc-cookie-read.cases");
  const { buildGpcCookieReadBinding } = await import("../packages/certscore-scan-core/src/gpc-cookie-read-binding");
  const { compactCanonicalEvidenceBundleForRetention } = await import("../packages/certscore-scan-core/src/index");
  const scan = scanRecord(), pair = collectionPairFixture(undefined, scan.scan.id), privateRead = gpcCookieReadWideDictionaryFixture(scan.scan.id);
  privateRead.bundle.cookieSnapshots[0]!.gpcReadBinding = buildGpcCookieReadBinding(privateRead.input)!;
  assert.ok(privateRead.bundle.cookieSnapshots[0]!.gpcReadBinding);
  pair.gpc = compactCanonicalEvidenceBundleForRetention(privateRead.bundle);
  const bytes=Buffer.from(serializeCanonicalEvidenceArtifact(pair.gpc));
  assert.equal(JSON.parse(bytes.toString()).artifactFormat,"certscore.canonical-evidence-artifact.v2");
  const baseline = collectionFixtureSource(pair.baseline), gpc = {bytes,pointer:{uri:"encoded-fixture-original",sha256:createHash("sha256").update(bytes).digest("hex"),sizeBytes:bytes.length}};

  const comparison = buildGpcResponseAssessment({ baseline: pair.baseline, baselineArtifact: baseline.pointer, gpc: pair.gpc, gpcArtifact: gpc.pointer });
  const assessment = buildGpcProductionAssessment({ scanId: scan.scan.id, source: gpc, comparison });
  const activity = buildGpcActivityComparison({ scanId: scan.scan.id, baseline, gpc, observation: assessment.observation })!; assert.ok(activity.collectionComparison);
  const runtime = buildGpcResponseRuntimeProjection({ scanId: scan.scan.id, gpcResponseAssessment: assessment, gpcActivityComparison: activity });
  assert.deepEqual(runtime.gpcActivityComparison?.collectionComparison, activity.collectionComparison);
  const project = (artifacts: Record<string, unknown>) => buildUnifiedFindingDisplayPackets({ runtimeArtifacts: artifacts, reviewFindingCandidates: [], validationFindings: [], validationFindingLookup: new Map() });
  const packets = project(runtime), without = project({ ...runtime, gpcActivityComparison: { ...activity, collectionComparison: undefined } });
  const effects = (rows: typeof packets) => rows.map(f => ({ id: f.unifiedFindingId, severity: f.severity, score: f.scoreEffects, presentation: f.presentationDecision, surfacing: f.surfacingDecision, top: f.topFindingEligibility }));
  assert.deepEqual(effects(packets), effects(without));
  assert.deepEqual(buildGpcResponseReportProjection(packets)?.activityComparison?.collectionComparison, activity.collectionComparison);
  const canonical = (scan as unknown as { canonicalReportProjection: PersistedCanonicalReportProjection }).canonicalReportProjection;
  canonical.ownerUnifiedFindings = packets; canonical.globalUnifiedFindings = packets;
  const persisted = buildPersistedScanReportProjection(scan);
  const restored = readPersistedScanReportProjection({ scan: scan.scan, snapshot: { report_projection_computed_at: "2026-11-03T00:00:00.000Z",
    report_projection_payload: JSON.parse(persisted.serialized), report_projection_payload_sha256: persisted.sha256, report_projection_payload_size_bytes: persisted.sizeBytes,
    report_projection_status: "ready", report_projection_version: SCAN_REPORT_PROJECTION_VERSION } })!;
  const ca = buildCanonicalReportExport(restored, undefined, "ccpa_cpra")!, eu = buildCanonicalReportExport(restored, undefined, "gdpr_eprivacy")!;
  const response = apiV2GpcResponseSchema.parse(ca.gpcResponse);
  assert.deepEqual(response.activityComparison?.collectionComparison, activity.collectionComparison);
  assert.doesNotMatch(JSON.stringify(ca), /gpcReadBinding|gpc-cookie-read-binding|fixture-loader|canonical-evidence-artifact|gzip_base64|brotli_base64/);
  const { CertScoreClient } = await import("../packages/certscore-sdk/src/client");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ type: "certscore_pulse_evidence", scanId: scan.scan.id, gpcResponse: response }), { status: 200, headers: { "content-type": "application/json" } });
  try {
    const sdk = await new CertScoreClient({ baseUrl: "http://127.0.0.1:9" }).pulse.evidence(scan.scan.id);
    assert.deepEqual(sdk.gpcResponse?.activityComparison?.collectionComparison, activity.collectionComparison);
  } finally { globalThis.fetch = originalFetch; }
  if (process.env.GPC_COLLECTION_REVIEW_DIR) {
    const { mkdir, writeFile, readFile, readdir } = await import("node:fs/promises");
    const path = await import("node:path");
    const dir = path.resolve(process.env.GPC_COLLECTION_REVIEW_DIR);
    assert.ok(dir.startsWith(path.resolve("tmp/pdfs") + path.sep));
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "collection-fixture.pdf"), renderCanonicalReportPdf(ca));
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { createElement } = await import("react");
    const { GpcActivityComparison } = await import("../apps/web/components/scans/gpc-activity-comparison");
    const cssRoot = "apps/web/.next/static/chunks";
    const cssName = (await readdir(cssRoot)).find(f => f.startsWith("apps_web_app_globals_css_") && f.endsWith(".css"));
    assert.ok(cssName, "Existing local preview CSS required for visual review");
    const css = await readFile(path.join(cssRoot, cssName), "utf8");
    await writeFile(path.join(dir, "collection-fixture.html"), `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><main style="padding:16px;max-width:1000px;margin:auto">${renderToStaticMarkup(createElement(GpcActivityComparison, { comparison: activity }))}</main>`);
    await writeFile(path.join(dir, "collection-packet.json"), JSON.stringify(activity, null, 2));
    const originalPayload = JSON.parse(persisted.serialized);
    let copies = 0;
    const omitSamples = (value: any): any => {
      if (Array.isArray(value)) return value.map(omitSamples);
      if (!value || typeof value !== "object") return value;
      return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
        if (key === "collectionComparison" && (item as any)?.contractVersion === "certscore.gpc-collection-comparison.v1") { copies++; return []; }
        return [[key, omitSamples(item)]];
      }));
    };
    const withoutSamples = JSON.stringify(omitSamples(originalPayload));
    await writeFile(path.join(dir, "collection-storage-measurement.json"), JSON.stringify({ fixtureOnly: true,
      optionalPacketCopiesInPersistedProjection: copies,
      addedPersistedProjectionBytes: Buffer.byteLength(persisted.serialized) - Buffer.byteLength(withoutSamples),
      persistedProjectionBytes: persisted.sizeBytes }, null, 2));
  }
  assert.deepEqual(JSON.parse(JSON.stringify(ca)).gpcResponse.activityComparison.collectionComparison, activity.collectionComparison);
  const pdf = renderCanonicalReportPdf(ca).toString("latin1");
  const pdfText = [...pdf.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)].map(m => m[1]!.replace(/\\([\\()])/g, "$1")).join(" ");
  for (const text of [renderPulseMarkdown({ domain: "example.test", scanId: scan.scan.id, scanStatus: "completed", gpcResponse: response, topFindings: [], links: {}, summary: {} }),
    scanBundleText({ scanId: scan.scan.id, status: "completed", gpcResponse: response } as never), pdfText]) {
    assert.match(text, /successful advertising collection/);
    assert.match(text, /zero does not establish absence/);
    assert.doesNotMatch(text, /xcid|fixture-loader|deduct/i);
  }
  assert.doesNotMatch(renderCanonicalReportPdf(eu).toString("latin1"), /retained successful advertising collection/);
  const bad = structuredClone(activity); bad.collectionComparison!.gpc.rows[0]!.label = "Tampered";
  assert.equal(apiV2GpcResponseSchema.safeParse({ ...response, activityComparison: bad }).success, false);
  const materialized = buildGpcResponseRuntimeProjection({ scanId: scan.scan.id, gpcResponseAssessment: assessment, gpcActivityComparison: bad });
  assert.equal(materialized.gpcActivityComparison?.collectionComparison, undefined);
  assert.deepEqual(materialized.gpcActivityComparison?.activity, activity.activity);
  const { MAX_SCAN_REPORT_PROJECTION_BYTES } = await import("../apps/web/server/scans/scan-report-projection-contract");
  const boundedScan = scanRecord();
  boundedScan.runtimeArtifacts = { gpcActivityComparison: { ...activity, collectionComparison: undefined } };
  const baseSize = buildPersistedScanReportProjection(boundedScan).sizeBytes;
  const padding = "x".repeat(MAX_SCAN_REPORT_PROJECTION_BYTES - baseSize - 100);
  boundedScan.runtimeArtifacts = { padding, gpcActivityComparison: activity };
  const bounded = buildPersistedScanReportProjection(boundedScan);
  assert.ok(bounded.sizeBytes <= MAX_SCAN_REPORT_PROJECTION_BYTES);
  const retained = bounded.payload.runtimeArtifacts as { padding: string; gpcActivityComparison: typeof activity };
  assert.equal(retained.gpcActivityComparison.collectionComparison, undefined);
  assert.deepEqual(retained.gpcActivityComparison.activity, activity.activity);
  assert.equal(retained.padding, padding);
  assert.ok(activity.collectionComparison, "original input remains untouched");
});
