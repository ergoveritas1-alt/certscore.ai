import {createHash} from "node:crypto";
import {HUBSPOT_NOTIFY_COOKIE,HUBSPOT_NOTIFY_TRUE_SHA256,notificationAcknowledgmentSchema,
  type NotificationAcknowledgment,type ConsentActionControlProof,type PostRefusalStorageItem,type AfterActionCapture} from "@certscore/contracts";
import type {CmpApiConsentSnapshot} from "./cmp-api-consent-state";
export type ExistingApiRead = {snapshot:CmpApiConsentSnapshot;readAtEpochMs:number};
const sha=(value:string)=>createHash("sha256").update(value).digest("hex");
export function retainNotificationAcknowledgment(input:{
  before?:ExistingApiRead;after?:ExistingApiRead;proof?:ConsentActionControlProof;capture?:AfterActionCapture;
  storage:PostRefusalStorageItem[];writes:Array<{storageType:string;name:string;value?:string;observedAtEpochMs:number}>;
  clockOriginAtMs:number;mainDocumentStable:boolean;clickCompleted:boolean;terminalDecisionConfirmed:boolean;
}):NotificationAcknowledgment|undefined {
  const {before,after,proof,capture}=input;
  if(!before||!after||!proof?.frameIdentitySha256||!proof.authorizedTargetSha256||proof.cmpId!=="HubSpot Consent Banner"||
    !input.mainDocumentStable||!input.clickCompleted||input.terminalDecisionConfirmed||capture?.stopReason!=="window_elapsed"||
    before.snapshot.decision!=="granted"||after.snapshot.decision!=="granted"||
    before.snapshot.canonicalState!==after.snapshot.canonicalState)return undefined;
  const receipts=input.storage.filter(s=>s.storageType==="cookie"&&s.name===HUBSPOT_NOTIFY_COOKIE);
  if(receipts.length!==1||!receipts[0]!.identityHash||receipts[0]!.valueHash!==HUBSPOT_NOTIFY_TRUE_SHA256)return undefined;
  const write=input.writes.find(w=>w.storageType==="cookie"&&w.name===HUBSPOT_NOTIFY_COOKIE&&w.value==="true"&&
    w.observedAtEpochMs>=input.clockOriginAtMs+capture.actionDispatchedAtMs&&
    w.observedAtEpochMs<=input.clockOriginAtMs+capture.captureEndedAtMs);
  if(!write)return undefined;
  const read=(r:ExistingApiRead)=>({stateSha256:sha(r.snapshot.canonicalState),eventSequence:r.snapshot.eventSequence,
    eventObservedAtMs:r.snapshot.eventObservedAtEpochMs===undefined?-1:r.snapshot.eventObservedAtEpochMs-input.clockOriginAtMs,
    readAtMs:r.readAtEpochMs-input.clockOriginAtMs});
  const parsed=notificationAcknowledgmentSchema.safeParse({policyVersion:"hubspot_notification_acknowledgment.v1",provider:"HubSpot Consent Banner",
    action:"accept",documentSha256:proof.frameIdentitySha256,authorizedTargetSha256:proof.authorizedTargetSha256,
    actionDispatchedAtMs:capture.actionDispatchedAtMs,writeObservedAtMs:Math.max(0,Math.round(write.observedAtEpochMs-input.clockOriginAtMs)),
    receiptIdentitySha256:receipts[0]!.identityHash,receiptValueSha256:receipts[0]!.valueHash,before:read(before),after:read(after)});
  return parsed.success?parsed.data:undefined;
}
