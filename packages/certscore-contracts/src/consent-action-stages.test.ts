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

test("initial registration, terminal verification and notification remain separate", () => {
 const p = {...projection(), registrationStatus:"unconfirmed", actionControlProof:{action:"accept",cmpId:"OneTrust",authorizedTargetSha256:"b".repeat(64)},
  afterActionCapture:{action:"accept",activationStatus:"completed",stopReason:"window_elapsed",requestsDropped:0,storageSnapshotRetained:true,actionDispatchedAtMs:100,requestedWindowMs:3000,captureEndedAtMs:3100},
  terminalDecisionEvidence:{action:"accept",authorizedTargetSha256:"b".repeat(64),readStartedAtMs:200,readCompletedAtMs:250,evidence:{basis:"verified_state",decision:"granted",observedAtMs:220}},
 } as unknown as Projection;
 const stages = assessConsentActionStages(p).evidenceStages;
 assert.equal(stages.consentSurfaceObserved,true);
 assert.equal(stages.initialChoiceRegistrationSupported,false);
 assert.equal(stages.terminalChoiceStateVerified,true);
 assert.equal(stages.notificationAcknowledged,null);
 const wrongTarget = {...p,terminalDecisionEvidence:{...p.terminalDecisionEvidence!,authorizedTargetSha256:"c".repeat(64)}};
 assert.equal(assessConsentActionStages(wrongTarget).evidenceStages.terminalChoiceStateVerified,false);
 const acknowledgment = {...projection(),registrationStatus:"unconfirmed",notificationAcknowledgment:{policyVersion:"hubspot_notification_acknowledgment.v1"}} as unknown as Projection;
 const notification = assessConsentActionStages(acknowledgment).evidenceStages;
 assert.equal(notification.notificationAcknowledged,true);
 assert.equal(notification.initialChoiceRegistrationSupported,false);
 assert.equal(notification.terminalChoiceStateVerified,null);
});

test("historical missing stages and phase diagnostics remain unknown", () => {
 const legacy = {...projection(),actionControlProof:undefined,registrationStatus:"unsupported",resolver:{found:false},confirmationDiagnostics:{policyVersion:"consent_confirmation_diagnostics.v1",reasons:["receipt_missing"]}} as unknown as Projection;
 const stages = assessConsentActionStages(legacy).evidenceStages;
 assert.equal(stages.cmpIdentity,"unverified");
 assert.equal(stages.consentSurfaceObserved,null);
 assert.equal(stages.controlIdentified,null);
 assert.equal(stages.initialDiagnosticReasons,null);
 assert.equal(stages.terminalDiagnosticReasons,null);
 assert.equal(stages.initialChoiceRegistrationSupported,null);
 const phased = {...legacy,confirmationDiagnostics:{policyVersion:"consent_confirmation_diagnostics.v3",reasons:["api_unavailable","receipt_missing"],initialReasons:["api_unavailable"],terminalReasons:["receipt_missing"]}} as unknown as Projection;
 assert.deepEqual(assessConsentActionStages(phased).evidenceStages.initialDiagnosticReasons,["api_unavailable"]);
 assert.deepEqual(assessConsentActionStages(phased).evidenceStages.terminalDiagnosticReasons,["receipt_missing"]);
});

test("attempted and completed actions do not substitute for initial decision proof", () => {
 const p = {...projection(),registrationStatus:"unconfirmed",interactionDiagnostics:{click:{outcome:"failed_before_dispatch"}},execution:{clickCompleted:false,observationCompleted:false,consentConfirmed:false}} as unknown as Projection;
 const stages = assessConsentActionStages(p);
 assert.equal(stages.evidenceStages.actionAttempted,true);
 assert.equal(stages.measures.clickCompleted,false);
 assert.equal(stages.evidenceStages.initialChoiceRegistrationSupported,false);
 const confirmed = {...projection(),registrationStatus:"confirmed",acceptanceExercised:true,acceptanceRegisteredAtMs:100,actionControlProof:{action:"accept",cmpId:"OneTrust"},decisionEvidence:{basis:"verified_state",decision:"granted"}} as unknown as Projection;
 assert.equal(assessConsentActionStages(confirmed).evidenceStages.initialChoiceRegistrationSupported,true);
 assert.equal(assessConsentActionStages({...confirmed,decisionEvidence:undefined}).evidenceStages.initialChoiceRegistrationSupported,false);
});
