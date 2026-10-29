import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { consentDecisionEvidenceSchema, validateComplianzReceiptEnvelope, decodeCanonicalConsentDecision,
  projectPostAcceptEvidenceForReport, projectPostRefusalEvidenceForReport } from "@certscore/contracts";
import { verifyComplianzReceipt } from "./complianz-consent-state";
import { runPostAcceptObserver } from "./post-accept-observer";
import { runPostRefusalObserver } from "./post-refusal-observer";
import { buildCanonicalPostAcceptActionRecipes } from "./post-accept-cmp-recipes";
import { buildCanonicalPostRefusalActionRecipes } from "./post-refusal-cmp-recipes";
const configuration={prefix:"cmplz_",tcfActive:false,categories:["functional","preferences","statistics","marketing"]};
function input() {
 const cookies=["preferences","statistics","marketing","functional","consented_services"].map((name,index)=>({name:`cmplz_${name}`,value:index<3?"deny":index===3?"allow":"",domain:"example.test",path:"/",httpOnly:false,secure:true,sameSite:"Lax" as const,expires:-1}));
 return {configuration:structuredClone(configuration),documentUrl:"https://example.test/",cookies,
  writes:cookies.slice(0,3).map((c,index)=>({storageType:"cookie" as const,name:c.name,value:c.value,cookieAssignment:`${c.name}=${c.value};path=/`,documentUrl:"https://example.test/",observedAtEpochMs:1100+index,sequence:index+1})),actionAt:1000,readAt:1200};
}
test("Complianz complete fresh categories decode without promoting individual cookies",()=>{
 const data=input(), denied=verifyComplianzReceipt(data)!;assert.equal(denied.decision,"denied");
 for(const c of data.cookies.slice(0,3))c.value="allow";for(const w of data.writes){w.value="allow";w.cookieAssignment=`${w.name}=allow;path=/`;}
 assert.equal(verifyComplianzReceipt(data)?.decision,"granted");
 data.cookies[0]!.value="deny";data.writes[0]!.value="deny";data.writes[0]!.cookieAssignment=`${data.writes[0]!.name}=deny;path=/`;assert.equal(verifyComplianzReceipt(data)?.decision,"mixed");
 for(const key of ["cmplz_marketing","cmplz_preferences","cmplz_statistics","cmplz_banner-status"])for(const value of ["allow","deny","dismissed","accepted","rejected"])assert.equal(decodeCanonicalConsentDecision(key,value,true),"unknown");
});
for(const mode of ["missing_category","duplicate","path_mismatch","partition_mismatch","missing_services","service_override","service_empty_object","functional_denied","missing_write","stale_write","future_write","reversal","unsupported_value","new_category","duplicate_category","tcf","prefix","http_only","wrong_write_path","wrong_write_domain","wrong_write_document","missing_write_assignment","deletion_write","duplicate_write_attribute"] as const){
 test(`Complianz rejects ${mode}`,()=>{
  const data=input();
  switch(mode){
   case "missing_category":data.cookies.splice(1,1);break;
   case "duplicate":data.cookies.push({...data.cookies[0]!,path:"/nested"});break;
   case "path_mismatch":data.cookies[0]!.path="/nested";break;
   case "partition_mismatch":Object.assign(data.cookies[0]!,{partitionKey:"https://other.test"});break;
   case "missing_services":data.cookies.pop();break;
   case "service_override":data.cookies[4]!.value='{"analytics":true}';break;
   case "service_empty_object":data.cookies[4]!.value='{}';break;
   case "functional_denied":data.cookies[3]!.value="deny";break;
   case "missing_write":data.writes.pop();break;
   case "stale_write":data.writes[0]!.observedAtEpochMs=999;break;
   case "future_write":data.writes[0]!.observedAtEpochMs=1300;break;
   case "reversal":data.writes.push({...data.writes[0]!,value:"allow",sequence:5});break;
   case "unsupported_value":data.cookies[0]!.value="accepted";break;
   case "new_category":data.configuration.categories.push("custom");break;
   case "duplicate_category":data.configuration.categories[0]="preferences";break;
   case "tcf":data.configuration.tcfActive=true;break;
   case "prefix":data.configuration.prefix="custom_";break;
   case "http_only":data.cookies[0]!.httpOnly=true;break;
   case "wrong_write_path":data.writes[0]!.cookieAssignment=data.writes[0]!.cookieAssignment.replace("path=/","path=/other");break;
   case "wrong_write_domain":data.writes[0]!.cookieAssignment+=";domain=other.test";break;
   case "wrong_write_document":data.writes[0]!.documentUrl="https://example.test/other";break;
   case "missing_write_assignment":data.writes[0]!.cookieAssignment="";break;
   case "deletion_write":data.writes[0]!.cookieAssignment+=";max-age=0";break;
   case "duplicate_write_attribute":data.writes[0]!.cookieAssignment+=";path=/";break;
  }
  assert.equal(verifyComplianzReceipt(data),undefined);
 });
}
test("Complianz packet proof rejects contradictory decisions, timestamps and document binding",()=>{
 const state=verifyComplianzReceipt(input())!,proof=state.complianzReceiptEvidence!;
 const evidence={policyVersion:"semantic_consent_registration.v2",basis:"verified_state",decision:"denied",observedStateSha256:state.stateHash,observedAtMs:102,timestampBasis:"instrumented_state_write",complianzReceiptEvidence:proof};
 assert.equal(consentDecisionEvidenceSchema.safeParse(evidence).success,true);
 for(const patch of [{decision:"granted"},{observedStateSha256:"a".repeat(64)},{timestampBasis:"verified_state_observed"},
  {complianzReceiptEvidence:{...proof,categories:proof.categories.slice(1)}},
  {complianzReceiptEvidence:{...proof,categories:proof.categories.map(c=>({...c,valueSha256:"b".repeat(64)}))}}])assert.equal(consentDecisionEvidenceSchema.safeParse({...evidence,...patch}).success,false);
 const envelope={startedAt:new Date(1000).toISOString(),completedAt:new Date(1300).toISOString(),dispatchedAtMs:0,observedAtMs:102,frameIdentitySha256:proof.documentSha256,cmpId:"Complianz"};
 for(const patch of [{},{dispatchedAtMs:101},{observedAtMs:101},{frameIdentitySha256:"a".repeat(64)},{cmpId:"unrelated"},{completedAt:new Date(1199).toISOString()}]){
  const issues:unknown[]=[];validateComplianzReceiptEnvelope(proof,{...envelope,...patch},{addIssue:i=>issues.push(i),path:[]});assert.equal(issues.length,Object.keys(patch).length?1:0);
 }
});
for(const action of ["accept","reject"] as const)for(const mode of ["valid","partial","stale","override","tcf","foreign_control","terminal"] as const){
 test(`Complianz ${action} canonical observer: ${mode}`,async()=>{
  let clicks=0;const value=action==="accept"?"allow":"deny";
  const server=createServer((req,res)=>{
   if(req.url==="/click"){clicks++;res.writeHead(204).end();return;}
   res.setHeader("content-type","text/html");res.end(`<!doctype html><section class="${mode==="foreign_control"?"cookie-notice":"cmplz-cookiebanner"}"><p>Choose optional analytics and marketing cookies</p><div class="cmplz-buttons"><button>${action==="accept"?"Accept all":"Reject all"}</button></div></section><script>
    var complianz={prefix:'cmplz_',tcf_active:${mode==="tcf"?1:0}};let cmplz_categories=['functional','preferences','statistics','marketing'];
    const write=()=>{for(const name of ['preferences','statistics','marketing','functional','consented_services']){
      if('${mode}'==='partial'&&name==='statistics')continue;
      document.cookie='cmplz_'+name+'='+(name==='functional'?'allow':name==='consented_services'?'${mode==="override"?'%7B%22video%22%3Atrue%7D':''}':'${value}')+';path=/';}};
    if('${mode}'==='stale')write();
    document.querySelector('button').onclick=()=>{fetch('/click');document.querySelector('section').hidden=true;if('${mode}'!=='stale')setTimeout(write,'${mode}'==='terminal'?450:0);};
   </script>`);
  });
  await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));const address=server.address();assert.ok(address&&typeof address!=="string");
  try{
   const recipes=action==="accept"?buildCanonicalPostAcceptActionRecipes():buildCanonicalPostRefusalActionRecipes();
   const common={url:`http://127.0.0.1:${address.port}/`,scanId:`complianz-${action}-${mode}`,productionProjectable:true,recipeSetId:"complianz-fixture",recipe:recipes[0]!,recipeCandidates:recipes,
    interactionAuthorization:{kind:"loopback",authorizationId:"loopback_local_lab"} as const,actionSearchTimeoutMs:4000,confirmationTimeoutMs:200,observationWindowMs:750};
   const packet=action==="accept"?await runPostAcceptObserver({...common,allowCanonicalAcceptDiscovery:true}):await runPostRefusalObserver({...common,allowCanonicalRejectDiscovery:true});
   const projection="acceptanceRegistration" in packet?projectPostAcceptEvidenceForReport({packet,packetSha256:"a".repeat(64)}):projectPostRefusalEvidenceForReport({packet,packetSha256:"a".repeat(64)});
   assert.equal(clicks,1,JSON.stringify(packet.interactionDiagnostics));
   assert.equal(projection.execution?.consentConfirmed,mode==="valid"||mode==="terminal",JSON.stringify({diagnostics:packet.confirmationDiagnostics,decision:packet.decisionEvidence,terminal:packet.terminalDecisionEvidence,limitations:packet.limitations}));
   assert.equal(projection.execution?.observationCompleted,true);
   if(mode==="valid")assert.ok(packet.decisionEvidence?.complianzReceiptEvidence);
   if(mode==="terminal")assert.ok(packet.terminalDecisionEvidence?.evidence.complianzReceiptEvidence);
  }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
 });
}
