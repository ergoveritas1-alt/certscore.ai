/** Audit-only receipt states; never copy policy text, URLs, entity names or worker packets. */
import {z} from 'zod';
import { AUDIT_POLICY_PROVENANCE_VERSION, MAX_AUDIT_POLICY_PROVENANCE_BYTES, auditPolicyProvenanceSchema,
 legacyPolicyProvenanceSchema, policyEvidenceObject as obj, policyProvenanceFromRecord, verifiedPolicyProvenanceEvent,
 type AuditPolicyProvenanceBinding } from '../../packages/certscore-contracts/src/audit-policy-provenance';
import type {Metric} from './audit-progress';

const VERSION='certscore.audit-operations-evidence.v1';
const POLICY='certscore.policy-text-evidence-projection.v1';
const TIMING='certscore.v2.lambda-lane-timing.v1';
const ADMISSION='target_policy_surfaces.v1';
const hash=z.string().regex(/^[a-f0-9]{64}$/);
const isoUtc=z.string().datetime({precision:3});
const cmpState=z.enum(['joined','limited']);
const receipt=z.object({version:z.literal(VERSION),policy:z.unknown(),cmp:z.unknown()}).strict();
const cmpReceipt=z.object({parentDispatchSha256:hash,status:cmpState,startedAt:isoUtc,completedAt:isoUtc}).strict();
const definitions:[string,string,string,string,string[]][]=[
 ['policy_fetch','Privacy policy fetch · persisted candidates','Policies','Generation-matched, target-relevant candidates in the retained projection; no claim about all links',['fetched']],
 ['policy_owner','Usable target-owned candidate · persisted projection','Policies','Original-source-bound document projection; producer-declared ownership and role',['producer_declared_usable']],
 ['policy_text_receipt','Retained policy text · producer verification receipt','Policies','Original-source-bound producer receipt; the daily audit does not re-read these text bytes',['producer_verified_complete_receipt']],
 ['cmp_coordinator','CMP inventory worker · coordinator receipt','CMP','Generation-matched result; a limited attempt does not establish worker completion',['worker_result_joined']],
];
export const OPERATIONS_EVIDENCE_METRICS:Metric[]=definitions.map(([id,label,group,denominator,success])=>({id:'sealed.operations.'+id,label,group,denominator,success}));

export function operationsEvidenceStates(value:unknown,scanId:string,binding?:AuditPolicyProvenanceBinding){
 const raw=obj(value);
 if(raw.version===AUDIT_POLICY_PROVENANCE_VERSION){
  if(!binding||Buffer.byteLength(JSON.stringify(value))>MAX_AUDIT_POLICY_PROVENANCE_BYTES)return {};
  const parsed=auditPolicyProvenanceSchema.safeParse(value);
  if(!parsed.success)return {};
  const {binding:receipt,fetch,owner,text}=parsed.data;
  if(receipt.scanId!==scanId||receipt.scanId!==binding.scanId||receipt.createdAt!==binding.createdAt||
    receipt.generation!==binding.generation||receipt.sourceHash!==binding.sourceHash)return {};
  const scope=AUDIT_POLICY_PROVENANCE_VERSION;
  return {
   ...(fetch?{'sealed.operations.policy_fetch':{value:fetch,scope}}:{}),
   'sealed.operations.policy_owner':{value:owner,scope},
   'sealed.operations.policy_text_receipt':{value:text,scope},
  };
 }
 const states:Record<string,{value:string;scope:string}>={};
 const parsed=receipt.safeParse(value);if(!parsed.success)return states;
 const policy=legacyPolicyProvenanceSchema.safeParse(parsed.data.policy).data,cmp=cmpReceipt.safeParse(parsed.data.cmp).data;
 if(policy?.scanId===scanId&&policy.sourceSha256===policy.originalSha256){
  if(policy.fetch)states['sealed.operations.policy_fetch']={value:policy.fetch,scope:ADMISSION};
  states['sealed.operations.policy_owner']={value:policy.owner,scope:POLICY};
  states['sealed.operations.policy_text_receipt']={value:policy.text,scope:POLICY};
 }
 if(cmp&&Date.parse(cmp.startedAt)<=Date.parse(cmp.completedAt)){
  states['sealed.operations.cmp_coordinator']={value:cmp.status==='joined'?'worker_result_joined':'coordinator_attempt_limited',scope:TIMING};
 }
 return states;
}
export function operationsEvidenceFromRecord(record:any,event:any){
 const verified=verifiedPolicyProvenanceEvent(event);
 if(!verified)return null;
 const m=verified.metadata,policy=policyProvenanceFromRecord(record,event);
 let cmp=null;
 const timing=obj(m.lambdaLaneTimingSummary),c=obj(timing.cmpPreferenceInspection);
 if(timing.contractVersion===TIMING&&cmpState.safeParse(c.status).success&&isoUtc.safeParse(c.startedAt).success&&
    isoUtc.safeParse(c.completedAt).success&&c.startedAt<=c.completedAt)
  cmp={parentDispatchSha256:m.parentDispatchSha256,status:c.status,startedAt:c.startedAt,completedAt:c.completedAt};
 return policy||cmp?{version:VERSION,policy,cmp}:null;
}
