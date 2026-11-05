import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {runScan} from './index';
import {buildGpcImpactAssessment} from './gpc-impact-assessment';
import {buildLocalV2DagLambdaLaneRun} from '../../../apps/v2-dag-lambda/src/handler';
import {originalGpcCaptureHash} from './gpc-navigation-recovery';
import {parseCanonicalEvidenceArtifact} from '../../certscore-contracts/src/canonical-evidence-artifact';

test('local scanner opt-in persists a separate recovered candidate through canonical retention',async()=>{
 const server=createServer((req,res)=>{
  res.setHeader('content-type','text/html');
  res.end('<!doctype html><html><head><title>Owned recovery fixture</title></head><body><h1>Product information</h1><p>'+ 'Public product documentation and service information. '.repeat(40)+'</p>'+
   (req.url==='/'?'<script>setTimeout(()=>location.assign("/final"),150);</script>':'<script>setTimeout(()=>fetch("/request"),150);</script>')+'</body></html>');
 });server.listen(0,'127.0.0.1');await once(server,'listening');
 const out=await mkdtemp(path.join(tmpdir(),'gpc-recovery-'));
 try{
  const url=`http://127.0.0.1:${(server.address() as {port:number}).port}/`,sources=[];
  for(const lane of ['runtime_evidence','gpc_observation'] as const){
   const outDir=path.join(out,lane);
   const bundle=await runScan({scanId:'owned-recovery-pair',url,outDir,evidenceLane:lane,profile:'standard',scenarioResourceMode:'lean',retainGpcObservation:lane==='gpc_observation',preConsentScreenshotMode:'never',localGpcNavigationRecovery:true});
   assert.ok(bundle.gpcNavigationRecovery, lane);
   assert.equal(bundle.gpcNavigationRecovery.status,'candidate_available',JSON.stringify(bundle.gpcNavigationRecovery));
   assert.equal(bundle.gpcImpactCapture!.windows.length,0);
   assert.equal(bundle.gpcNavigationRecovery.attemptCount,1);
   assert.equal(bundle.gpcNavigationRecovery.originalCaptureSha256,originalGpcCaptureHash(bundle.gpcImpactCapture!));
   assert.equal(bundle.gpcNavigationRecovery.finalDocumentCapture!.capturedAtMs,bundle.gpcImpactCapture!.capturedAtMs,'both packets retain the original freeze checkpoint');
   if(lane==='gpc_observation')assert.equal(bundle.gpcNavigationRecovery.finalDocumentCapture!.document!.committedAtMs,bundle.gpcObservationSession!.mainDocument!.committedAtMs);
   const retained=parseCanonicalEvidenceArtifact(await readFile(path.join(outDir,'CanonicalEvidenceBundle.json'))) as typeof bundle;
   assert.deepEqual(retained.gpcNavigationRecovery,bundle.gpcNavigationRecovery);
   assert.ok(bundle.region, 'fixture lane retains its execution region');
   const laneRun=buildLocalV2DagLambdaLaneRun({bundle,workerLane:lane,region:bundle.region,physicalInvocationId:`fixture-${lane}`});
   assert.ok(laneRun,'owned lane must produce its retained run binding');
   retained.scanLaneRuns=[laneRun];
   const bytes=Buffer.from(JSON.stringify(retained));sources.push({bytes,pointer:{sizeBytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}});
  }
  const impact=buildGpcImpactAssessment({scanId:'owned-recovery-pair',baseline:sources[0],gpc:sources[1],pageHttpOnly:true,navigationRecovery:true});
  assert.equal(impact.status,'measured',JSON.stringify(impact));
  assert.equal(impact.scoreEffect,'none');
 }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await rm(out,{recursive:true,force:true});}
});
