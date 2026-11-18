import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { runtimeGraphHashInput, type RuntimeEvidenceGraph } from "@certscore/contracts";
import { afterRejectClickProjection } from "../../lib/scans/test-fixtures/after-reject-scoring";
import { withRejectIdentifierWitness } from "./reject-identifier-projection";

const sha = (s:string) => createHash("sha256").update(s).digest("hex");
const targetUrl="https://example.test/", endpoint=targetUrl+"beacon", scanId="fixture";
function fixture() {
 const p=afterRejectClickProjection("measurement");
 p.sourceIdentity={policyVersion:"post_reject_source_identity.v1",scanId,targetSha256:sha(targetUrl)};
 p.actionControlProof!.authorizedTargetSha256=sha(targetUrl);
 for (const row of [...p.scoringEvidence!.requests,...p.afterActionRequests!]) {
   row.sanitizedUrl=endpoint;row.nonEssential=false;row.purpose="unknown";row.resourceType="ping";row.hostname="example.test";
   row.httpStatus=200;delete row.measurementEvidence;
 }
 const context={sessionId:"main",frameId:"frame",documentId:"doc",redirectHop:0};
 const g:RuntimeEvidenceGraph={contractVersion:"certscore.runtime-evidence-graph.v1",scanId,captureId:scanId+":reject_observation",
   scenario:"post_reject",action:{status:"unconfirmed"},mode:"project",startedAt:"2026-11-17T12:00:00.000Z",completedAt:"2026-11-17T12:00:01.000Z",browserVersion:"fixture",
   nodes:[{...context,id:"page",kind:"request",url:targetUrl,observedAtMs:10,resourceType:"Document"},
     {...context,id:"event",kind:"request",url:endpoint,observedAtMs:200,method:"POST",resourceType:"Ping"},
     {id:"response",kind:"response",url:endpoint,observedAtMs:220,status:200,fromCache:false,fromServiceWorker:false},
     ...["rl_anonymous_id","rl_session"].map(name=>({id:name,kind:"cookie" as const,observedAtMs:200,cookie:{name,domain:"example.test",path:"/",hostOnly:true,identityRedacted:false},cookieAttributes:{size:90},outcome:"sent" as const,valueHash:"c".repeat(64)}))],
   edges:[{id:"success",from:"event",to:"response",relation:"response_to",basis:"cdp",directness:"direct"},
     ...["rl_anonymous_id","rl_session"].map(name=>({id:"edge"+name,from:name,to:"event",relation:"cookie_included" as const,basis:"cdp" as const,directness:"direct" as const}))],
   stacks:[],coverage:{status:"partial",capabilities:[],reasons:[],droppedNodes:0,droppedEdges:0,unresolvedRequests:0,pendingTasks:0},
   timing:{setupMs:0,finalizeMs:0},valuesRedacted:true,sourceHash:"0".repeat(64)};
 return {p,g};
}
test("only a source-bound, successful post-click event with an included identifier yields a witness",()=>{
 const read=(change?:(x:ReturnType<typeof fixture>)=>void,corruptHash=false)=>{
   const x=fixture();change?.(x);const {p,g}=x;
   if(!corruptHash)g.sourceHash=sha(runtimeGraphHashInput(g));
   return withRejectIdentifierWitness(p,{scanId:scanId+":reject_observation",runtimeEvidenceGraph:g,targetUrl,startedAt:g.startedAt}).sentIdentifierWitness;
 };
 assert.equal(read()?.requestId,"request-1");
 const repeated=read(({g,p})=>{
   g.nodes.push({...g.nodes[1]!,id:"second",observedAtMs:360},{...g.nodes[2]!,id:"second-response",observedAtMs:380});
   g.edges.push({id:"second-sent",from:"rl_anonymous_id",to:"second",relation:"cookie_included",basis:"cdp",directness:"direct"},
     {id:"second-success",from:"second",to:"second-response",relation:"response_to",basis:"cdp",directness:"direct"});
   const row={...p.scoringEvidence!.requests[0]!,requestId:"request-2",rootStartedAtMs:360,startedAtMs:360,completedAtMs:380};
   p.scoringEvidence!.requests.push(row);
   p.afterActionRequests!.push({...p.afterActionRequests![0]!,requestId:"request-2",rootStartedAtMs:360,startedAtMs:360,completedAtMs:380});
   p.afterActionCapture!.requestIds.push("request-2");
   p.afterActionCapture!.requestAncestry!.push({requestId:"request-2",rootStartedAtMs:360});
 });
 assert.equal(repeated?.requestId,"request-1");

 assert.equal(read(undefined,true),undefined);
 for (const change of [
   ({g})=>{g.edges=g.edges.filter(e=>e.relation!=="cookie_included");},
   ({g})=>{g.nodes[2]!.status=404;},({g})=>{g.nodes[2]!.fromCache=true;},
   ({g})=>{g.nodes[1]!.documentId="another";},({g})=>{g.nodes[1]!.observedAtMs=90;},
   ({g})=>{g.nodes.filter(n=>n.cookie).forEach(n=>n.cookie!.name="rl_page_init_referrer");},
   ({p,g})=>{g.nodes[1]!.resourceType="Image";for (const r of p.scoringEvidence!.requests) r.resourceType="image";},
   ({p})=>{p.scoringEvidence!.requests[0]!.rootStartedAtMs=80;},
   ({p})=>{p.scoringEvidence!.requests.push({...p.scoringEvidence!.requests[0]!,requestId:"ambiguous"});},
 ] as Array<(x:ReturnType<typeof fixture>)=>void>) assert.equal(read(change),undefined);
});
