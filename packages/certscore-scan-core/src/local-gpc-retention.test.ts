import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { canonicalEvidenceBundleSchema } from "@certscore/contracts";
import { gpcRuntimeFixture } from "../../certscore-contracts/src/test-fixtures/gpc-runtime";
import { retainGpcComparisonLedger } from "./gpc-comparison-ledger";
import { gpcImpactRequestSetHash, gpcImpactIdentityHash } from "./gpc-impact-capture";
import { gpcDocumentHash } from "./gpc-signal-capture";
import { compactCanonicalEvidenceBundleForRetention } from "./index";
import { buildGpcActivityComparison } from "./gpc-activity-comparison";

function fixture(enabled:boolean,local:boolean) {
  const bundle=gpcRuntimeFixture({enabled});
  const document=bundle.networkEvents[0]!;
  bundle.networkEvents=[document,...Array.from({length:1200},(_,index)=>({...document,eventId:`request-${index}`,requestId:`req-${index}`,timestampMs:100+index*10,
    isMainFrame:false,requestUrl:`https://static.example.test/asset/${index}`,url:`https://static.example.test/asset/${index}`,resourceType:"image"}))];
  bundle.completedAt="2026-09-05T12:00:20.000Z";
  bundle.gpcSignalObservation!.capturedAtMs=16000;
  const token=enabled?"gpc-loader":"baseline-loader";
  bundle.gpcImpactCapture={contractVersion:"certscore.gpc-impact-capture.v1",scope:"page_http_request_attempts_after_document_commit",comparisonPolicy:"page_http_signal.v2",expectedEnabled:enabled,
    captureStartedAtMs:0,capturedAtMs:16000,document:{token,urlSha256:gpcDocumentHash(bundle.url),committedAtMs:1,secGpc:enabled?"1":null},readbackDocumentToken:token,requestsDropped:0,limitationKeys:[],
    ...(local?{localRetention:"local_gpc_complete.v2" as const,adaptiveObservation:{contractVersion:"certscore.local-gpc-adaptive.v1" as const,minimumMs:5000 as const,quietMs:2000 as const,maximumMs:15000 as const,durationMs:15000,peerDocumentToken:enabled?"baseline-loader":"gpc-loader",outcome:"cap" as const}}:{}),
    windows:[5000,8000,10000,15000].map(durationMs=>{const events=bundle.networkEvents.filter(event=>event.timestampMs>=1&&event.timestampMs<1+durationMs);return {durationMs,requestCount:events.length,requestSetSha256:gpcImpactRequestSetHash(events)};})};
  return bundle;
}
test("local full ledger exceeds old row/byte limits without consuming other evidence's retention allocation",()=>{
  const bundle=fixture(false,true),legacy=fixture(false,false);
  const unchanged=compactCanonicalEvidenceBundleForRetention(legacy);
  const retained=compactCanonicalEvidenceBundleForRetention(bundle);
  const ledger=retained.gpcImpactCapture!.requestLedger!;
  assert.equal(ledger.policyVersion,"gpc_compact_requests.local.v2");
  assert.equal(ledger.rows.length,1200);
  assert.ok(Buffer.byteLength(JSON.stringify(ledger.rows))>64*1024);
  assert.equal(gpcImpactIdentityHash(ledger.rows),retained.gpcImpactCapture!.windows.at(-1)!.requestSetSha256);
  assert.deepEqual(retained.networkEvents,unchanged.networkEvents);
  assert.deepEqual(retained.cookieSnapshots,unchanged.cookieSnapshots);
  assert.deepEqual(retained.domSnapshots,unchanged.domSnapshots);
  assert.notEqual(retainGpcComparisonLedger(legacy)?.requestLedger?.rows.length,1200);
  const tampered=structuredClone(retained);delete tampered.gpcImpactCapture!.localRetention;
  assert.equal(canonicalEvidenceBundleSchema.safeParse(tampered).success,false);
});
test("canonical report comparison accepts the verified long local ledger but rejects adaptive peer drift and missing request identities",()=>{
  const baseline=compactCanonicalEvidenceBundleForRetention(fixture(false,true)),gpc=compactCanonicalEvidenceBundleForRetention(fixture(true,true));
  const source=(bundle:typeof baseline)=>{const bytes=Buffer.from(JSON.stringify(bundle));return {bytes,pointer:{sizeBytes:bytes.length,sha256:createHash("sha256").update(bytes).digest("hex")}};};
  const run=()=>buildGpcActivityComparison({scanId:baseline.scanId,baseline:source(baseline),gpc:source(gpc)});
  assert.equal(run()?.durationMs,15000);
  const original=structuredClone(gpc);
  gpc.gpcImpactCapture!.adaptiveObservation!.peerDocumentToken="wrong-peer";
  assert.equal(run(),undefined);
  Object.assign(gpc,original);gpc.gpcImpactCapture!.requestLedger!.rows.pop();
  assert.equal(run(),undefined);
});

test("local ledger row and byte caps remain enforced",()=>{
  const retained=compactCanonicalEvidenceBundleForRetention(fixture(false,true));
  const row=retained.gpcImpactCapture!.requestLedger!.rows[0]!;
  const excessiveRows=structuredClone(retained);
  excessiveRows.gpcImpactCapture!.requestLedger!.rows=Array.from({length:5001},()=>row);
  assert.equal(canonicalEvidenceBundleSchema.safeParse(excessiveRows).success,false);
  const excessiveBytes=structuredClone(retained);
  excessiveBytes.gpcImpactCapture!.requestLedger!.rows=Array.from({length:2000},(_,index)=>({...row,eventId:`${index}`.padEnd(160,"x"),advertising:Array(8).fill("a".repeat(64)),analytics:Array(8).fill("b".repeat(64))}));
  assert.ok(Buffer.byteLength(JSON.stringify(excessiveBytes.gpcImpactCapture!.requestLedger!.rows))>2*1024*1024);
  assert.equal(canonicalEvidenceBundleSchema.safeParse(excessiveBytes).success,false);
});
