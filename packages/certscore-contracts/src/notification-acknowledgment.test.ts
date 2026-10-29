import test from "node:test";
import assert from "node:assert/strict";
import {z} from "zod";
import {notificationAcknowledgmentSchema,validateNotificationAcknowledgment,consentActionOutcome,HUBSPOT_NOTIFY_COOKIE,HUBSPOT_NOTIFY_TRUE_SHA256} from "./notification-acknowledgment";
const read={stateSha256:"5362aa3439fb26c6c7ea55f5b65b5e0c69a41cc87be328ab1d51de0bfea1aa9a",eventSequence:1,eventObservedAtMs:10,readAtMs:20};
const evidence=()=>notificationAcknowledgmentSchema.parse({policyVersion:"hubspot_notification_acknowledgment.v1",provider:"HubSpot Consent Banner",action:"accept",
 documentSha256:"a".repeat(64),authorizedTargetSha256:"b".repeat(64),actionDispatchedAtMs:100,writeObservedAtMs:110,
 receiptIdentitySha256:"c".repeat(64),receiptValueSha256:HUBSPOT_NOTIFY_TRUE_SHA256,before:read,after:{...read,readAtMs:150}});
const binding=()=>({proof:{action:"accept",cmpId:"HubSpot Consent Banner",frameIdentitySha256:"a".repeat(64),authorizedTargetSha256:"b".repeat(64)},
 clickOutcome:"completed",registrationStatus:"unconfirmed",decision:{basis:"unverified"},cancelled:false,
 capture:{action:"accept",activationStatus:"completed",stopReason:"window_elapsed",actionDispatchedAtMs:100,captureEndedAtMs:200,storageSnapshotRetained:true,
 storageWrites:[{storageType:"cookie",name:HUBSPOT_NOTIFY_COOKIE,observedAtMs:110}]},
 storage:[{storageType:"cookie",name:HUBSPOT_NOTIFY_COOKIE,identityHash:"c".repeat(64),valueHash:HUBSPOT_NOTIFY_TRUE_SHA256}]});
const valid=(e:ReturnType<typeof evidence>,b:Parameters<typeof validateNotificationAcknowledgment>[1])=>z.object({}).superRefine((_v,c)=>validateNotificationAcknowledgment(e,b,c)).safeParse({}).success;
test("notification acknowledgment joins the exact control, bounded write and receipt independently of consent",()=>{
 const e=evidence(),b=binding();assert.ok(valid(e,b));
 assert.equal(consentActionOutcome({}),"unknown");
 assert.equal(consentActionOutcome({packetSha256:"d".repeat(64),notificationAcknowledgment:e,execution:{clickCompleted:true,consentConfirmed:false}}),"notification_acknowledged");
 assert.equal(consentActionOutcome({notificationAcknowledgment:e,execution:{clickCompleted:true,consentConfirmed:false}}),"unknown");
 assert.equal(consentActionOutcome({packetSha256:"d".repeat(64),execution:{clickCompleted:true,consentConfirmed:true}}),"consent_decision_confirmed");
 assert.equal(consentActionOutcome({packetSha256:"d".repeat(64),notificationAcknowledgment:e,execution:{clickCompleted:false,consentConfirmed:false}}),"not_completed");
});
test("changed or fresh consent, late reads and stale notification writes cannot become acknowledgments",()=>{
 for(const change of [{after:{...read,readAtMs:150,eventSequence:2}},{after:{...read,readAtMs:150,eventObservedAtMs:120}},
  {after:{...read,readAtMs:99}},{before:{...read,readAtMs:101}},{before:{...read,eventSequence:0}},
  {writeObservedAtMs:99},{receiptValueSha256:"f".repeat(64)}])assert.equal(notificationAcknowledgmentSchema.safeParse({...evidence(),...change}).success,false);
});
test("missing source context, conflicting decisions, wrong identities and incomplete captures fail closed",()=>{
 const e=evidence(),b=binding();
 for(const change of [{proof:undefined},{proof:{...b.proof,frameIdentitySha256:"f".repeat(64)}},{proof:{...b.proof,cmpId:"OneTrust"}},
  {proof:{...b.proof,authorizedTargetSha256:"f".repeat(64)}},{clickOutcome:"failed_after_dispatch"},{registrationStatus:"confirmed"},
  {decision:{basis:"verified_state"}},{terminalDecision:{}},{cancelled:true},{capture:undefined},
  {capture:{...b.capture,stopReason:"aborted"}},{capture:{...b.capture,storageSnapshotRetained:false}},
  {capture:{...b.capture,captureEndedAtMs:140}},{capture:{...b.capture,storageWrites:[]}},
  {storage:[]},{storage:[...b.storage,...b.storage]},
  {storage:[{...b.storage[0]!,identityHash:"f".repeat(64)}]}])assert.equal(valid(e,{...b,...change}),false,JSON.stringify(change));
});
