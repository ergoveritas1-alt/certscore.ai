import assert from "node:assert/strict";
import test from "node:test";
import { createFormDestinationCollector } from "../../../../packages/certscore-scan-core/src/form-destination-trace";
import { unexpectedFormRequests, resolveFormTraceEvidence, type CanonicalEvidenceBundle } from "@certscore/contracts";
import { projectFormDestinations } from "./form-destination-projection";
import { buildUnifiedFindingDisplayPackets } from "../../lib/scans/unified-findings";
import { projectFormDestinationPriority } from "../../lib/scans/form-destination-report";
import { buildSitePriorityReview } from "../../lib/scans/full-site-priority-review";
const start = Date.now() - 1000, pageUrl = "https://forms.example/", token = "document-1";
function capture(options: { destination?: string; action?: string; body?: string; response?: boolean; kind?: "submit" | "input" } = {}) {
  const collector = createFormDestinationCollector(start);
  collector.event({ kind: options.kind ?? "submit", time:start+100, pageUrl, formIndex:0,actionUrl:options.action ?? `${pageUrl}send`,fields:[{name:"email",value:"person@example.test",type:"email",label:"Email",autocomplete:"email"}] },token,pageUrl);
  collector.request("req-1",options.destination ?? "https://unexpected.example/collect", "POST",200, options.body ?? "email=person%40example.test",token);
  if (options.response !== false) collector.status("req-1","response_observed");
  return collector.finish();
}
function bundle(trace = capture()) {
  return { scanId:"forms-test",startedAt:new Date(start).toISOString(),completedAt:new Date(start+1000).toISOString(),
    formDestinationTrace:trace,runtimeMetadataSnapshots:[{url:pageUrl,documentIdentity:{token}}],domSnapshots:[],
    networkEvents:trace.requests.map(r=>({requestId:r.networkRequestId,url:r.url,method:r.method,timestampMs:r.observedAtMs})),
    networkResponseEvents:trace.requests.filter(r=>r.status==="response_observed").map(r=>({requestId:r.networkRequestId,responseUrl:r.url,timestampMs:r.observedAtMs+10})),
  } as unknown as CanonicalEvidenceBundle;
}
const verified = {verificationStatus:"verified",sha256:"a".repeat(64)};
test("observed payload match flows through verified projection, policy, finding and priorities without retaining values",()=>{
  assert.equal(unexpectedFormRequests(capture({kind:"input"})).length, 1);
  const projection = projectFormDestinations(bundle(),verified)!;
  assert.ok(projection);
  assert.equal(unexpectedFormRequests(projection.trace).length,1);
  assert.ok(!JSON.stringify(projection).includes("person@example.test"));
  for(const r of projection.trace.requests) { assert.ok(resolveFormTraceEvidence(projection,r.eventRef)); for(const m of r.matches) assert.ok(resolveFormTraceEvidence(projection,m.fieldRef)); }
  const packets = buildUnifiedFindingDisplayPackets({runtimeArtifacts:{formDestinations:projection},reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map()});
  const priority = projectFormDestinationPriority(packets);
  assert.equal(priority?.title,"Unexpected form-data destination");
  assert.ok(packets.every(p=>(p.scoreEffects??[]).length===0));
  assert.ok(buildSitePriorityReview([],[{id:"home",url:pageUrl,homepage:true,findingIds:[]}],[],packets).some(p=>p.id===priority!.id));
});
test("timing alone, failed requests, first party and declared external recipient are neutral",()=>{
  for(const trace of [capture({body:"unrelated=value"}),capture({response:false}),capture({destination:pageUrl+"send"}),capture({action:"https://unexpected.example/send"})]) assert.equal(unexpectedFormRequests(trace).length,0);
});
test("wrong-document, unverified and inconsistent network evidence cannot project",()=>{
  const b=bundle();
  assert.equal(projectFormDestinations(b,{...verified,verificationStatus:"unknown"}),null);
  assert.equal(projectFormDestinations({...b,networkEvents:[]},verified),null);
  assert.equal(projectFormDestinations({...b,networkResponseEvents:[]},verified),null);
  assert.equal(projectFormDestinations({...b,runtimeMetadataSnapshots:[]},verified),null);
  const altered=structuredClone(b); altered.formDestinationTrace!.requests[0]!.party="first_party";
  assert.equal(projectFormDestinations(altered,verified),null);
});
test("bounded capture records limits and never turns query coincidence into a payload match",()=>{
  assert.equal(capture({body:'{"email":"person@example.test"}'}).requests[0]!.matches.length,1);
  assert.equal(capture({body:'{"other":"person@example.test"}'}).requests[0]!.matches.length,0);
  const c=createFormDestinationCollector(start);
  c.event({kind:"submit",time:start+100,pageUrl,formIndex:0,actionUrl:pageUrl,fields:[{name:"email",value:"person@example.test",type:"email",label:"",autocomplete:"email"}]},token,pageUrl);
  for(let i=0;i<105;i++) c.request(`req-${i}`,"https://unexpected.example/?email=person%40example.test","GET",200+i,null,token);
  const trace=c.finish(); assert.equal(trace.requests.length,100); assert.equal(trace.coverage.truncated,true); assert.ok(!JSON.stringify(trace).includes("person%40example.test"));
});

test("a shared recipient domain cannot substitute a different request endpoint",()=>{
  const b=bundle();
  b.networkEvents[0]!.url="https://unexpected.example/unrelated";
  assert.equal(projectFormDestinations(b,verified),null);
});

test("ambiguous request IDs cannot supply request proof",()=>{
  const b=bundle();
  b.networkEvents.push({...b.networkEvents[0]!});
  assert.equal(projectFormDestinations(b,verified),null);
});

test("response proof retains the endpoint, time window and stated document",()=>{
  for (const patch of [{responseUrl:'https://unexpected.example/other'}, {timestampMs:199}, {timestampMs:1001},
    {documentUrl:'https://forms.example/other'}, {responseUrl:'invalid'}]) {
    const b=bundle();Object.assign(b.networkResponseEvents[0]!,patch);
    assert.equal(projectFormDestinations(b,verified),null,JSON.stringify(patch));
  }
  for (const patch of [{requestUrl:'https://unexpected.example/other'}, {url:'http://unexpected.example/collect'},
    {url:'https://other.unexpected.example/collect'}, {url:'https://unexpected.example:8443/collect'}, {documentUrl:pageUrl+'other'},
    {isSubFrame:true}, {isMainFrame:false}, {frameContext:{isSubFrame:true}}]) {
    const b=bundle();Object.assign(b.networkEvents[0]!,patch);
    assert.equal(projectFormDestinations(b,verified),null,JSON.stringify(patch));
  }
  const b=bundle();b.networkEvents[0]!.url+='?private=REDACTED';
  b.networkResponseEvents[0]!.responseUrl+='?private=REDACTED';
  assert.ok(projectFormDestinations(b,verified),'sanitized query absence does not break the retained endpoint join');
});
