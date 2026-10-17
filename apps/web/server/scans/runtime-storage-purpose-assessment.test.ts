import assert from "node:assert/strict";
import test from "node:test";
import {createHash} from "node:crypto";
import {runtimeGraphHashInput,type CanonicalEvidenceBundle} from "@certscore/contracts";
import {RuntimeEvidenceGraphBuilder} from "../../../../packages/certscore-scan-core/src/runtime-evidence-graph";
import {extractRuntimeScriptFacts} from "../../../../packages/certscore-vendor-resolver/src/runtime-script-facts";
import {californiaCoverageFixture,CA_FIXTURE_URL} from "./california-review-coverage.fixture";
import {assessRuntimeStoragePurposes,assessRuntimeStoragePurposesV2} from "./runtime-storage-purpose-assessment";
import {matchCaliforniaCollectionNoticesV4,matchCaliforniaCollectionNoticesV5} from "./california-collection-notice-matching";
function setup(){
  const {bundle}=californiaCoverageFixture();const builder=new RuntimeEvidenceGraphBuilder({scanId:bundle.scanId,captureId:`${bundle.scanId}:runtime_evidence`,scenario:"pre_consent",mode:"project",startedAt:bundle.startedAt,browserVersion:"fixture"});
  builder.handle("main","Page.frameNavigated",{frame:{id:"frame",loaderId:"loader",url:CA_FIXTURE_URL}});
  builder.handle("main","Runtime.executionContextCreated",{context:{id:1,auxData:{isDefault:true,frameId:"frame"}}});
  builder.probe("main",1,{operation:"setItem",storageType:"localStorage",name:"referrer",success:true,stack:[`${CA_FIXTURE_URL}app.js`]});
  builder.probe("main",1,{operation:"js_set",cookieLine:"choice=private; path=/",success:true,stack:[CA_FIXTURE_URL]});
  builder.snapshot([{name:"PHPSESSID",domain:new URL(CA_FIXTURE_URL).hostname,path:"/",value:"private-session"}]);
  bundle.runtimeEvidenceGraphs=[builder.finish()];
  bundle.cookieEvents=[{eventId:"session",scenario:"fresh_pre_consent",documentUrl:CA_FIXTURE_URL,cookieName:"PHPSESSID",cookiePurpose:"unknown"}] as never;
  bundle.storageSnapshots=[{scenario:"fresh_pre_consent",artifactId:"storage",url:CA_FIXTURE_URL,capturedAtMs:50,consentStateAtTime:"pre_consent",localStorage:{referrer:"[redacted]"},sessionStorage:{},localStorageKeys:["referrer"],sessionStorageKeys:[],valuesRedacted:true,evidenceRefs:[],captureContext:{contractVersion:"storage-capture-context.v1",origin:new URL(CA_FIXTURE_URL).origin,localStorageReadComplete:true,sessionStorageReadComplete:true}}];
  const input={scanId:bundle.scanId,scenario:"pre_consent" as const,documentUrl:CA_FIXTURE_URL,documentId:"loader",frameId:"frame",scriptUrl:CA_FIXTURE_URL,sourceKind:"inline_script" as const};
  bundle.runtimeScriptEvidence=[extractRuntimeScriptFacts(`function setCookie(name,value){document.cookie=name+'='+encodeURIComponent(value)+'; path=/';}`,input)!,extractRuntimeScriptFacts(`let value=document.referrer;localStorage.setItem('referrer',value);var key='choice',save=(a)=>{let value='y';value+=a==='y'?'y':'n';setCookie(key,value)},submit=()=>{save(one.prop('checked')?'y':'n')};`,{...input,scriptUrl:`${CA_FIXTURE_URL}app.js`,sourceKind:"loaded_script"})!];
  return bundle;
}
const run=(bundle:CanonicalEvidenceBundle)=>assessRuntimeStoragePurposes(bundle,CA_FIXTURE_URL,"a".repeat(64));
test("verified graph and loaded source identify referrer data and preference flow; generic session name remains unknown",()=>{
  const bundle=setup(),result=run(bundle);
  assert.equal(result.items.find(item=>item.name === "referrer")!.dataOrigin,"document_referrer");
  assert.equal(result.items.find(item=>item.name === "referrer")!.purpose,"unknown","origin alone cannot establish business use");
  assert.equal(result.items.find(item=>item.name === "choice")!.purpose,"preferences");
  assert.equal(result.items.find(item=>item.name === "PHPSESSID")!.purpose,"unknown");
  assert.ok(!JSON.stringify(result).includes('"private"'));
  const canonical=setup();canonical.cookieEvents[0]!.cookiePurpose="consent_management";
  assert.equal(run(canonical).items.find(item=>item.name === "PHPSESSID")!.purpose,"consent_management","an existing canonical classification is preserved");
});
test("wrong scan, loader, frame, scenario, failed writes, missing helper and hash drift fail closed",()=>{
  for(const mutate of [(b:CanonicalEvidenceBundle)=>{b.runtimeScriptEvidence!.forEach(row=>row.scanId="other");},(b:CanonicalEvidenceBundle)=>{b.runtimeScriptEvidence!.forEach(row=>row.documentId="other");},(b:CanonicalEvidenceBundle)=>{b.runtimeScriptEvidence!.forEach(row=>row.frameId="other");},(b:CanonicalEvidenceBundle)=>{b.runtimeEvidenceGraphs![0]!.sourceHash="b".repeat(64);},(b:CanonicalEvidenceBundle)=>{b.runtimeEvidenceGraphs![0]!.scenario="gpc";},(b:CanonicalEvidenceBundle)=>{const graph=b.runtimeEvidenceGraphs![0]!;graph.nodes.filter(node=>node.captureBasis === "instrumented_call").forEach(node=>node.outcome="native_call_failed");graph.sourceHash=createHash("sha256").update(runtimeGraphHashInput(graph)).digest("hex");}]){
    const bundle=setup();mutate(bundle);const result=run(bundle);assert.ok(result.items.every(item=>item.dataOrigin === "unknown"&&item.purpose === "unknown"));
  }
  const bundle=setup();bundle.runtimeScriptEvidence!.shift();assert.equal(run(bundle).items.find(item=>item.name === "choice")!.purpose,"unknown");
});
test("competing cookie scopes and modified retained excerpts cannot borrow a purpose",()=>{
  const bundle=setup();bundle.cookieEvents.push({eventId:"other-choice",scenario:"fresh_pre_consent",documentUrl:CA_FIXTURE_URL,cookieName:"choice",cookieDomain:new URL(CA_FIXTURE_URL).hostname,cookiePath:"/other",cookiePurpose:"unknown"} as never);
  assert.equal(run(bundle).items.find(item=>item.name === "choice")!.purpose,"unknown");
  const modified=setup();modified.runtimeScriptEvidence![1]!.facts.forEach(fact=>fact.excerpts[0]!.text="tampered source");
  assert.ok(run(modified).items.every(item=>item.dataOrigin === "unknown"&&item.purpose === "unknown"));
});
test("purpose evidence stays separate from notice wording, unmatched purposes receive no credit",()=>{
  const bundle=setup();const text="We use cookies to remember your choices. We record referring websites.";
  const input={bundle,sourceHash:"a".repeat(64),documentUrl:CA_FIXTURE_URL,documents:[{evidenceRef:"policy-text:policy",url:`${CA_FIXTURE_URL}policy`,text,textSha256:createHash("sha256").update(text).digest("hex")}],policyComplete:true,inventoryComplete:true};
  const result=matchCaliforniaCollectionNoticesV4(input);
  assert.equal(result.points.find(point=>point.kind === "cookies")!.purposeMatch,"unresolved","PHPSESSID remains unassessed");
  assert.equal(result.points.find(point=>point.kind === "browser_storage")!.categoryMatch,"wording_retained");
  assert.equal(result.points.find(point=>point.kind === "browser_storage")!.purposeMatch,"unresolved");
});

function declaredSetup(){
  const bundle=setup();bundle.cookieEvents[0]!.cookieDomain=new URL(CA_FIXTURE_URL).hostname;bundle.cookieEvents[0]!.cookiePath="/";
  const purpose="The cookie is crucial for delivering the services offered on our website and enabling specific features.";
  const text=`We use cookies. PHPSESSID ${purpose} choice This cookie stores your consent preferences.`;
  const surface=bundle.policySurfaceObservations.find(row=>row.observationId === "policy")!;
  surface.policyCookieDisclosures=[{cookieName:"PHPSESSID",purpose,sourceUrl:`${CA_FIXTURE_URL}policy`,category:"essential",evidenceRef:"php-row",parserProvenance:"policy_cookie_table_dom.v1",confidence:0.96},{cookieName:"choice",purpose:"This cookie stores your consent preferences.",sourceUrl:`${CA_FIXTURE_URL}policy`,category:"essential",evidenceRef:"choice-row",parserProvenance:"policy_cookie_table_dom.v1",confidence:0.96}];
  const documents=[{evidenceRef:"policy-text:policy",url:`${CA_FIXTURE_URL}policy`,text,textSha256:createHash("sha256").update(text).digest("hex")}];
  return {bundle,documents};
}
test("v2 matches the retained named-cookie declaration without upgrading runtime purpose or necessity",()=>{
  const {bundle,documents}=declaredSetup();
  const result=assessRuntimeStoragePurposesV2(bundle,CA_FIXTURE_URL,"a".repeat(64),documents,true);
  const php=result.items.find(item=>item.name === "PHPSESSID")!;
  assert.equal(php.purpose,"unknown");assert.equal(php.declaredPurpose!.purpose,"functional");assert.equal(php.declaredPurpose!.declarationRef,"php-row");
  assert.equal(documents[0]!.text.slice(php.declaredPurpose!.passage.start,php.declaredPurpose!.passage.end),php.declaredPurpose!.passage.excerpt);
  const matching=matchCaliforniaCollectionNoticesV5({bundle,documentUrl:CA_FIXTURE_URL,sourceHash:"a".repeat(64),documents,policyComplete:true,inventoryComplete:true});
  const cookie=matching.points.find(point=>point.kind === "cookies")!;
  assert.equal(cookie.purposeMatch,"wording_retained");assert.equal(cookie.purposeBasis,"declared_only");assert.equal(cookie.status,"matched_text");
});
test("unowned, incomplete, changed and ambiguous cookie evidence cannot borrow declared purposes",()=>{
  for(const mutate of [({bundle}:ReturnType<typeof declaredSetup>)=>{bundle.policySurfaceObservations[0]!.targetRelationship="unrelated" as never;},({documents}:ReturnType<typeof declaredSetup>)=>{documents[0]!.textSha256="b".repeat(64);},({bundle}:ReturnType<typeof declaredSetup>)=>{bundle.policySurfaceObservations[0]!.policyCookieDisclosures[0]!.purpose="Changed declaration.";},({bundle}:ReturnType<typeof declaredSetup>)=>{bundle.cookieEvents.push({...bundle.cookieEvents[0]!,eventId:"other",cookiePath:"/other"});}]){
    const f=declaredSetup();mutate(f);assert.equal(assessRuntimeStoragePurposesV2(f.bundle,CA_FIXTURE_URL,"a".repeat(64),f.documents,true).items.find(item=>item.name === "PHPSESSID")!.declaredPurpose,undefined);
  }
  const f=declaredSetup();assert.equal(assessRuntimeStoragePurposesV2(f.bundle,CA_FIXTURE_URL,"a".repeat(64),f.documents,false).items.find(item=>item.name === "PHPSESSID")!.declaredPurpose,undefined);
});
test("v2 ties actual reads to the exact source site and keeps cleanup separate from business purpose",()=>{
  const {bundle,documents}=declaredSetup();
  const input={scanId:bundle.scanId,scenario:"pre_consent" as const,documentUrl:CA_FIXTURE_URL,documentId:"loader",frameId:"frame",scriptUrl:`${CA_FIXTURE_URL}app.js`,sourceKind:"loaded_script" as const};
  const packet=extractRuntimeScriptFacts(`let value=document.referrer;localStorage.setItem('referrer',value);for(let i=0;i<localStorage.length;i++){let other=localStorage.getItem(localStorage.key(i));if(other!==localStorage.getItem('referrer'))localStorage.removeItem('other');}`,input)!;
  bundle.runtimeScriptEvidence=[packet];const fact=packet.facts.find(fact=>fact.keySource === "enumerated_storage_key")!;
  bundle.storageReadTrace={contractVersion:"certscore.storage-read-trace.v1",scanId:bundle.scanId,captureId:`${bundle.scanId}:runtime_evidence`,scenario:"pre_consent",limitReached:false,observations:[{id:"read-1",documentUrl:CA_FIXTURE_URL,documentId:"loader",frameId:"frame",storageType:"localStorage",name:"referrer",callerUrl:packet.scriptUrl,line:fact.callsite!.line,column:fact.callsite!.column,outcome:"returned",valueState:"empty",count:1}]};
  const run=()=>assessRuntimeStoragePurposesV2(bundle,CA_FIXTURE_URL,"a".repeat(64),documents,true).items.find(item=>item.name === "referrer")!;
    const cleanup=packet.facts.find(fact=>fact.useContext === "storage_cleanup_check")!;
  bundle.storageReadTrace.observations.push({...bundle.storageReadTrace.observations[0]!,id:"read-2",line:cleanup.callsite!.line,column:cleanup.callsite!.column});
  const item=run();assert.equal(item.purpose,"unknown");assert.deepEqual(item.readUse!.reads.map(read=>read.context),["storage_enumeration","storage_cleanup_check"]);assert.match(item.readUse!.reason,/business reason.*unresolved/);
  bundle.storageReadTrace.observations[0]!.column=1;assert.equal(run().readUse!.reads[0]!.context,"unresolved","another source site cannot borrow cleanup context");
  bundle.storageReadTrace.observations.forEach(read=>{read.documentId="other";});assert.equal(run().readUse!.status,"limited");
  bundle.storageReadTrace.scanId="other";assert.equal(run().readUse!.status,"limited");
});

test("completed loader-bound cookie snapshots preserve disclosure matching when a response predates its legacy document URL",()=>{
  const {bundle,documents}=declaredSetup();delete bundle.cookieEvents[0]!.documentUrl;
  bundle.cookieSnapshots=[{captureCoverage:{version:"bound_cookie_snapshot.v1",scope:"browser_context_point_in_time",targetUrl:CA_FIXTURE_URL,documentUrl:CA_FIXTURE_URL,documentToken:"loader",startedAtMs:40,completedAtMs:49,status:"completed"},artifactId:"bound-cookies",capturedAtMs:50,consentStateAtTime:"pre_consent",cookies:[{name:"PHPSESSID",domain:new URL(CA_FIXTURE_URL).hostname,path:"/"}],cookieNames:["PHPSESSID"],evidenceRefs:[]}];
  const run=()=>matchCaliforniaCollectionNoticesV5({bundle,sourceHash:"a".repeat(64),documentUrl:CA_FIXTURE_URL,documents,policyComplete:true,inventoryComplete:true});
  const result=run();assert.equal(result.runtimePurposeAssessment.items.find(item=>item.name === "PHPSESSID")!.declaredPurpose!.purpose,"functional");assert.equal(result.points.find(point=>point.kind === "cookies")!.purposeMatch,"wording_retained");
  bundle.cookieSnapshots[0]!.captureCoverage!.documentToken="other";
  assert.equal(run().runtimePurposeAssessment.items.find(item=>item.name === "PHPSESSID"),undefined,"Unbound context snapshots cannot create a document observation");
});

test("snapshot cookie disclosure remains bounded on a page with many recipient products",()=>{
  const {bundle,documents}=declaredSetup();delete bundle.cookieEvents[0]!.documentUrl;
  bundle.cookieSnapshots=[{captureCoverage:{version:"bound_cookie_snapshot.v1",scope:"browser_context_point_in_time",targetUrl:CA_FIXTURE_URL,documentUrl:CA_FIXTURE_URL,documentToken:"loader",startedAtMs:40,completedAtMs:49,status:"completed"},artifactId:"bound-cookies",capturedAtMs:50,consentStateAtTime:"pre_consent",cookies:[{name:"PHPSESSID",domain:new URL(CA_FIXTURE_URL).hostname,path:"/"}],cookieNames:["PHPSESSID"],evidenceRefs:[]}];
  bundle.networkEvents=Array.from({length:12},(_,index)=>({eventId:`recipient-${index}`,scenario:"fresh_pre_consent",documentUrl:CA_FIXTURE_URL,thirdParty:true})) as never;
  bundle.normalizedVendorObservations=Array.from({length:12},(_,index)=>({observationId:`vendor-${index}`,product:`Recipient ${index}`,purpose:"analytics",registryAttribution:{serviceId:`service-${index}`},matchSources:[{scenario:"fresh_pre_consent",sourceEventId:`recipient-${index}`}]})) as never;
  const result=matchCaliforniaCollectionNoticesV5({bundle,sourceHash:"a".repeat(64),documentUrl:CA_FIXTURE_URL,documents,policyComplete:true,inventoryComplete:true});
  assert.equal(result.points.length,12);
  assert.equal(result.points.find(point=>point.kind === "cookies")!.purposeMatch,"wording_retained");
  assert.equal(result.inventoryComplete,false);
  assert.deepEqual(result.limitationKeys.filter(key=>key === "matching_points_truncated"),["matching_points_truncated"]);
});
