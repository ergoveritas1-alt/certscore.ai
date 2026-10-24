import assert from "node:assert/strict";
import test from "node:test";
import type { CanonicalEvidenceBundle } from "@certscore/contracts";
import { buildLocalV2DagLambdaLaneRun } from "./handler";
import { assertOriginalRuntimeVisitForReport } from "./runtime-representative-evidence";

function fixture(): CanonicalEvidenceBundle {
  return {
    scanId:"runtime-visit-fixture",startedAt:"2026-10-24T00:00:00.000Z",completedAt:"2026-10-24T00:00:01.000Z",
    domSnapshots:[{artifactId:"runtime-dom",path:"/retained/runtime.txt",url:"https://www.example.test/",capturedAtMs:500,
      documentIdentity:{source:"cdp_loader_id",token:"runtime-loader"},textExcerpt:"公開資料と辞典",siteMetadata:{title:"Public dictionary"}}],
    modulesRun:[{moduleName:"preConsentRuntimeScanner",status:"completed",startedAt:"2026-10-24T00:00:00.000Z",durationMs:1000,errors:[]}],
    networkEvents:[{requestId:"apex",resourceType:"document",isMainFrame:true},{requestId:"www",resourceType:"document",isMainFrame:true}],
    networkResponseEvents:[{requestId:"apex",responseUrl:"https://example.test/",status:404,timestampMs:50},
      {requestId:"www",responseUrl:"https://www.example.test/",status:200,timestampMs:100}],
    screenshots:[],runtimeCoverage:{coverageStatus:"usable",silentEmpty:false},
    scanLaneRuns:[{laneId:"runtime_evidence",accessOutcome:"representative_page",executionOutcome:"success",challengeDetected:false}],
  } as unknown as CanonicalEvidenceBundle;
}

test("a recovered final runtime document supplies access status without rewriting the first 404 diagnostic", () => {
  const bundle=fixture();const before=JSON.stringify(bundle);
  const lane=buildLocalV2DagLambdaLaneRun({bundle,workerLane:"runtime_evidence",region:"us-west-1"})!;
  assert.equal(lane.firstHttpStatus,404);
  assert.equal(lane.accessOutcome,"representative_page");
  assert.equal(JSON.stringify(bundle),before);
});

test("final runtime access cannot borrow a frame, resource, future response, stale page or terminal no-go", () => {
  const mutations:Array<(b:CanonicalEvidenceBundle)=>void>=[
    b=>{b.networkEvents[1]!.isMainFrame=false;},
    b=>{b.networkEvents[1]!.resourceType="fetch";},
    b=>{b.networkResponseEvents[1]!.timestampMs=501;},
    b=>{b.networkResponseEvents[1]!.responseUrl="https://other.test/";},
    b=>{b.networkResponseEvents[0]!.status=200;b.networkResponseEvents[1]!.responseUrl="https://other.test/";},
    b=>{b.domSnapshots[0]!.documentIdentity=undefined;},
    b=>{b.domSnapshots[0]!.capturedAtMs=1001;},
    b=>{b.networkResponseEvents[1]!.status=403;},
    b=>{b.scanNoGoAssessment={decision:"no_go",reasonCodes:["navigation_transport_failure"],supportingSignals:{}} as CanonicalEvidenceBundle["scanNoGoAssessment"];},
  ];
  for(const mutate of mutations){const b=fixture();mutate(b);assert.notEqual(buildLocalV2DagLambdaLaneRun({bundle:b,workerLane:"runtime_evidence",region:"us-west-1"})!.accessOutcome,"representative_page");}
});

test("a scored report requires its own usable runtime visit even when consent captured a real page", () => {
  const good=fixture();assert.doesNotThrow(()=>assertOriginalRuntimeVisitForReport(good,good));
  for(const mutate of [
    (b:CanonicalEvidenceBundle)=>{b.domSnapshots=[];},
    (b:CanonicalEvidenceBundle)=>{b.domSnapshots[0]!.url="about:blank";},
    (b:CanonicalEvidenceBundle)=>{b.scanLaneRuns![0]!.accessOutcome="access_denied";},
    (b:CanonicalEvidenceBundle)=>{b.runtimeCoverage!.coverageStatus="limited_none";},
    (b:CanonicalEvidenceBundle)=>{b.scanLaneRuns![0]!.challengeDetected=true;},
  ]) {
    const runtime=fixture();mutate(runtime);const before=JSON.stringify(runtime);
    assert.throws(()=>assertOriginalRuntimeVisitForReport(runtime,good),/original_runtime_visit_unavailable/);
    assert.equal(JSON.stringify(runtime),before,"independent observations must not be repaired or replaced");
    const noGo={...good,scanNoGoAssessment:{decision:"no_go"}} as CanonicalEvidenceBundle;
    assert.doesNotThrow(()=>assertOriginalRuntimeVisitForReport(runtime,noGo),"an explicitly no-go attempt can publish its existing unscored disposition");
  }
});
