import assert from 'node:assert/strict';
import test from 'node:test';
import {californiaVisitStages} from '../../apps/web/lib/scans/california-visit-stages';
import {californiaPriorityGpcFixture, californiaPriorityRejectFixture, ANALYTICS_URL, QUALIFIED_URL} from '../../apps/web/lib/scans/test-fixtures/california-priority-gpc';
import {auditStageStates,STAGE_METRICS} from './audit-visit-stages';
import {progressEngine} from './audit-progress-engine';

test('stage receipts count cumulative thresholds per recipient and bind the public export to its visit',()=>{
  const scanId='gpc-fixture';
  const review=californiaPriorityGpcFixture([ANALYTICS_URL,ANALYTICS_URL],scanId);
  const runtime={...californiaPriorityRejectFixture(),gpcResponseAssessment:review};
  const receipt=californiaVisitStages(scanId,runtime);
  assert.equal(receipt.gpc?.recipients[1],1);
  assert.equal(receipt.reject?.recipients[2],1);
  const report={scanId,californiaVisitStages:receipt,gpcResponse:review,
    postRefusalObservation:{execution:{clickCompleted:true},confirmation:{sourcePacketSha256:receipt.reject!.sourceSha256}}};
  const exported=auditStageStates(report,scanId);
  for(const level of [1,2,3])assert.equal(exported['detail.reject.stage'+level],'observed');
  assert.equal(exported['detail.gpc.stage2'],'observed');
  assert.deepEqual(auditStageStates(report,'other-scan'),{});
  assert.equal(auditStageStates({...report,postRefusalObservation:{}},scanId)['detail.reject.stage3'],undefined);
  const promoted=californiaVisitStages(scanId,{gpcResponseAssessment:californiaPriorityGpcFixture([ANALYTICS_URL,QUALIFIED_URL],scanId)});
  assert.deepEqual(promoted.gpc?.recipients,[1,1,1]);
  const bad={...review,comparison:{...review.comparison,gpcArtifact:null}};
  assert.equal(auditStageStates({...report,gpcResponse:bad},scanId)['detail.gpc.stage2'],undefined);
});

test('all six rates use reportable scans and retain unavailable counts independently',()=>{
  const createdAt='2026-11-18T20:00:00Z';
  const observed=Object.fromEntries(STAGE_METRICS.map(m=>[m.id,'observed']));
  const rows=[{reportable:true,states:observed},{reportable:true,states:{}},{reportable:false,states:observed}].map(r=>({...r,createdAt,findings:[]}));
  const [day]=progressEngine().aggregate({days:[{date:'2026-11-18'}],metrics:STAGE_METRICS},rows);
  for(const m of STAGE_METRICS){
    assert.equal(day.metrics[m.id].rate,50);
    assert.deepEqual(day.metrics[m.id].counts,{observed:1,unavailable:1});
  }
});

test('historical comparisons establish presence on the GPC arm without promoting collection',()=>{
  const scanId='gpc-fixture';
  const g=californiaPriorityGpcFixture([],scanId);
  const delta=(shared:string[],baselineOnly:string[]=[],gpcOnly:string[]=[])=>({
    baselineCount:shared.length+baselineOnly.length,gpcCount:shared.length+gpcOnly.length,
    baselineOnly,gpcOnly,shared,baselineOnlyCount:baselineOnly.length,gpcOnlyCount:gpcOnly.length,
    sharedCount:shared.length,countDelta:gpcOnly.length-baselineOnly.length,samplesTruncated:false,
  });
  const states=(cookies:ReturnType<typeof delta>,trackers:ReturnType<typeof delta>,activityComparison?:unknown)=>
    auditStageStates({scanId,gpcResponse:{...g,activityComparison,comparison:{...g.comparison,
      deltas:{...g.comparison.deltas,cookies,trackers}}}},scanId);
  const cookie=JSON.stringify(['_ga','.example.test','/']);
  const tracker='Matomo|Matomo Analytics|analytics';
  const empty=delta([]);
  const a={baselineRequests:0,gpcRequests:1,baselineServices:0,gpcServices:1};
  const pair={contractVersion:'certscore.gpc-activity-comparison.v1',scanId,status:'measured',
    scope:'matched_post_commit_request_window',durationMs:1000,sourceHashes:{
      baseline:g.comparison.baselineArtifact!.sha256,gpc:g.observation.sourceSha256},
    activity:{advertisingMarketing:a,analyticsReplay:a},scoreEffect:'none',causedByGpc:'not_established'};
  for(const row of [states(delta([cookie]),empty),states(empty,delta([],[],[tracker])),states(empty,empty,pair)]){
    assert.equal(row['detail.gpc.stage1'],'observed');
    assert.notEqual(row['detail.gpc.stage2'],'observed');
    assert.notEqual(row['detail.gpc.stage3'],'observed');
  }
  assert.notEqual(states(delta([],[cookie]),delta([],[tracker]))['detail.gpc.stage1'],'observed');
  assert.notEqual(states(empty,empty,{...pair,sourceHashes:{...pair.sourceHashes,gpc:'0'.repeat(64)}})['detail.gpc.stage1'],'observed');
});
