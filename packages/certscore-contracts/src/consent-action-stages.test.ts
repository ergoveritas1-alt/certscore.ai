import assert from "node:assert/strict";
import test from "node:test";
import {assessConsentActionStages} from "./consent-action-stages";
type Projection=Parameters<typeof assessConsentActionStages>[0];
const projection=()=>({packetSha256:"a".repeat(64),actionControlProof:{cmpId:"OneTrust"},execution:{clickCompleted:true,observationCompleted:true,consentConfirmed:false},confirmationDiagnostics:{reasons:["category_no_optional"]}} as unknown as Projection);
test("stage metrics preserve unknown provider/scope and do not upgrade diagnostics",()=>{
 const p=projection(),s=assessConsentActionStages(p);assert.equal(s.provider,"OneTrust");assert.equal(s.measures.controlResolved,true);assert.equal(s.measures.observationCompleted,true);assert.equal(s.measures.categoryScopeVerified,null);assert.equal(s.measures.decisionVerified,false);assert.equal(s.categoryCheck,"no_optional_categories");
 const missing=assessConsentActionStages({...p,packetSha256:undefined});assert.ok(Object.values(missing.measures).every(v=>v===null));assert.equal(missing.outcome,"unknown");
 const unidentified=assessConsentActionStages({...p,actionControlProof:undefined});assert.equal(unidentified.provider,null);assert.equal(unidentified.measures.providerAttributed,null);
});
test("a notification acknowledgment never increases fresh-decision counts",()=>{
 const p={...projection(),notificationAcknowledgment:{policyVersion:"hubspot_notification_acknowledgment.v1"}} as unknown as Projection;
 const s=assessConsentActionStages(p);assert.equal(s.outcome,"notification_acknowledged");assert.equal(s.measures.decisionVerified,false);
});

test("passive HTTP and event observations never verify a decision or category scope",()=>{
 const p={...projection(),passiveCmpDiagnostics:{eventRead:"read",documentSha256:"b".repeat(64),events:[{name:"OTConsentApplied",atEpochMs:1}],network:[{status:200}],eventsTruncated:false,networkTruncated:false}} as unknown as Projection;
 const s=assessConsentActionStages(p);assert.equal(s.passiveSignals?.responses2xx,1);assert.equal(s.passiveSignals?.consentApplied,1);assert.equal(s.measures.decisionVerified,false);assert.equal(s.measures.categoryScopeVerified,null);
});

test("a complete declared universe needs no exclusion and is not classified as unsupported",()=>{const p={...projection(),confirmationDiagnostics:{reasons:["category_exclusion_unneeded"]}} as unknown as Projection;assert.equal(assessConsentActionStages(p).categoryCheck,"supported");});
