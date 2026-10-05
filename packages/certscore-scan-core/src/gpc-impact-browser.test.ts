import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { runScan } from "./index";
import { buildGpcImpactAssessment } from "./gpc-impact-assessment";
import { buildGpcProductionObservation } from "./gpc-production-observation";
import { buildLocalV2DagLambdaLaneRun } from "../../../apps/v2-dag-lambda/src/handler";

test("existing baseline and GPC browsers retain comparable windows on a continuously busy page", async () => {
  const server = createServer((req, res) => {
    if (req.url === '/hanging') return;
    if (req.url !== '/') { res.end('observed'); return; }
    res.setHeader('content-type','text/html');
    res.end(`<!doctype html><html><head><title>Product documentation</title></head><body><h1>Product documentation</h1><p>${'Information about products, services, and public support. '.repeat(40)}</p><script>
      history.replaceState(null, '', location.href);
      fetch('/hanging'); setTimeout(()=>{ if(navigator.globalPrivacyControl!==true) fetch('/baseline-only'); },300);
      window.__gpp=(command,callback)=>{const enabled=navigator.globalPrivacyControl===true;
        const ping={gppVersion:'1.1',cmpStatus:'loaded',signalStatus:'ready',applicableSections:[8],sectionList:[8],
          parsedSections:{usca:[{Version:1,SaleOptOutNotice:1,SharingOptOutNotice:1,SaleOptOut:enabled?1:2,SharingOptOut:enabled?1:2},{GpcSegmentType:1,Gpc:enabled}]}};
        if(command==='ping')callback(ping,true);
        if(command==='addEventListener')callback({eventName:'listenerRegistered',data:true,listenerId:1,pingData:ping},true);
      };
    </script></body></html>`);
  });
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  const out = await mkdtemp(path.join(tmpdir(),'gpc-impact-'));
  try {
    const url = `http://127.0.0.1:${(server.address() as {port:number}).port}/`;
    const sources=[];
    for (const lane of ['runtime_evidence','gpc_observation'] as const) {
      const outDir = path.join(out,lane);
      const bundle = await runScan({scanId:'busy-pair',url,outDir,evidenceLane:lane,profile:'standard',scenarioResourceMode:'lean',retainGpcObservation:lane==='gpc_observation',preConsentScreenshotMode:'never',formSnapshotReviewer:lane==='runtime_evidence'?async()=>({safeForDisplay:true}):undefined});
      assert.ok(bundle.gpcImpactCapture, lane);
      if (lane === 'runtime_evidence') {
        assert.equal(bundle.collectionSurfaceInventory?.coverage.status, 'limited');
        assert.ok(bundle.collectionSurfaceInventory?.coverage.reasonCodes.includes('document_settle_incomplete'));
      }
      assert.equal(bundle.gpcImpactCapture.expectedEnabled,lane==='gpc_observation');
      assert.equal(bundle.gpcImpactCapture.windows.at(-1)?.durationMs,1000,JSON.stringify(bundle.gpcImpactCapture));
      assert.ok(Buffer.byteLength(JSON.stringify(bundle.gpcImpactCapture))<2048);
      const retained = JSON.parse(await readFile(path.join(outDir,'CanonicalEvidenceBundle.json'),'utf8'));
      // Production workers add the lane envelope after runScan; use that same
      // envelope builder here rather than treating a bare local run as a worker.
      retained.scanLaneRuns = [buildLocalV2DagLambdaLaneRun({bundle,workerLane:lane,region:bundle.region,physicalInvocationId:`fixture-${lane}`})];
      const bytes = Buffer.from(JSON.stringify(retained));
      const source = {bytes,pointer:{uri:path.join(outDir,'CanonicalEvidenceBundle.json'),sha256:createHash('sha256').update(bytes).digest('hex'),sizeBytes:bytes.length}};
      sources.push(source);
      if(lane==='gpc_observation') assert.equal(buildGpcProductionObservation({scanId:'busy-pair',source}).status,'complete');
    }
    const impact=buildGpcImpactAssessment({scanId:'busy-pair',baseline:sources[0],gpc:sources[1]});
    assert.equal(impact.status,'measured',JSON.stringify(impact));
    assert.equal(impact.durationMs,1000);
    assert.equal(impact.requestAttempts!.baseline-impact.requestAttempts!.gpc,1,'actual baseline-only request is measured in the common window');
    assert.equal(impact.scoreEffect,'none');
    assert.equal(impact.cmpRecordedState.baselineState,'captured');
    assert.equal(impact.cmpComparison?.comparable,true,JSON.stringify(impact.cmpComparison));
    assert.equal(impact.cmpComparison?.saleChange,'opt_out_appeared');
    assert.equal(impact.cmpComparison?.sharingChange,'opt_out_appeared');
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve=>server.close(()=>resolve()));
    await rm(out,{recursive:true,force:true});
  }
});
