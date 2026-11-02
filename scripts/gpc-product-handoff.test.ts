import assert from "node:assert/strict";
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
