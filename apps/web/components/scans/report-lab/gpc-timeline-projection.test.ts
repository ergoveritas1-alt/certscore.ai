import assert from "node:assert/strict";
import test from "node:test";
import { projectGpcTimeline } from "./gpc-report-projection";
import type { GpcResponseReportProjection } from "./shadow-report-data";

function fixture() {
 return {assessment:{contractVersion:"certscore.gpc-response-assessment.v3",observation:{status:"limited",delivery:{httpHeaderRetained:true,mainNavigatorReadbackRetained:true},requests:{complete:false,throughMs:14049,advertisingCollectionEvidenceIds:["g1","g2","a1"],advertisingCollectionRecipients:{rows:[
  {entityId:"google",label:"Google LLC",evidenceId:"g1",observedAtMs:7902},
  {entityId:"google",label:"Google LLC",evidenceId:"g2",observedAtMs:9000},
  {entityId:"amazon",label:"Amazon.com, Inc.",evidenceId:"a1",observedAtMs:10214},
  {entityId:"unqualified",label:"SDK download",evidenceId:"sdk",observedAtMs:100},
 ]}}}}} as unknown as GpcResponseReportProjection;
}

test("GPC timeline retains supported recipients and their own clock even with a limited comparison",()=>{
 const projection=fixture(),before=structuredClone(projection),timeline=projectGpcTimeline(projection)!;
 assert.equal(timeline.coverage,"limited");assert.equal(timeline.clockLabel,"Times from GPC visit start");
 assert.deepEqual(timeline.events.map(e=>e.atMs),[0,7902,10214,14049]);
 assert.deepEqual(timeline.events.filter(e=>e.tone==="concern").map(e=>e.detail),["Google LLC","Amazon.com, Inc."]);
 assert.deepEqual(projection,before);
});

test("GPC timeline requires verified delivery and never invents recipient timing",()=>{
 assert.equal(projectGpcTimeline(null),null);
 const projection=fixture();if(projection.assessment.contractVersion!=="certscore.gpc-response-assessment.v3")throw Error("fixture");
 projection.assessment.observation.delivery.httpHeaderRetained=false;assert.equal(projectGpcTimeline(projection),null);
 projection.assessment.observation.delivery.httpHeaderRetained=true;
 for(const row of projection.assessment.observation.requests.advertisingCollectionRecipients!.rows)delete row.observedAtMs;
 assert.equal(projectGpcTimeline(projection)!.events.filter(e=>e.tone==="concern").length,0);
 projection.assessment.observation.requests.throughMs=0;assert.equal(projectGpcTimeline(projection),null);
});
