/** Audit-only receipt states; never copy policy text, URLs, entity names or worker packets. */
import {z} from 'zod';
import type {Metric} from './audit-progress';

const VERSION='certscore.audit-operations-evidence.v1';
const POLICY='certscore.policy-text-evidence-projection.v1';
const TIMING='certscore.v2.lambda-lane-timing.v1';
const ADMISSION='target_policy_surfaces.v1';
const hash=z.string().regex(/^[a-f0-9]{64}$/);
const isoUtc=z.string().datetime({precision:3});
const fetchState=z.enum(['fetched','failed','skipped_budget','not_attempted']);
const documentFields=z.object({documentFetchState:fetchState,
 documentEvaluationState:z.enum(['not_attempted','usable','insufficient','blocked']),
 documentRole:z.enum(['policy_document','policy_index','unknown']),
 targetRelationship:z.enum(['target_controller','first_party_brand','service_provider','unrelated','unknown']),
});
const textState=z.enum(['producer_verified_complete_receipt','producer_verified_limited_receipt','no_verified_receipt_in_projection']);
const ownership=z.enum(['producer_declared_usable','no_qualifying_candidate_in_projection']);
const cmpState=z.enum(['joined','limited']);
const receipt=z.object({version:z.literal(VERSION),policy:z.unknown(),cmp:z.unknown()}).strict();
const policyReceipt=z.object({scanId:z.string(),sourceSha256:hash,originalSha256:hash,
  fetch:z.enum(['fetched','recorded_fetch_failure','recorded_budget_skip','no_attempt_in_returned_candidates']).nullable(),
  owner:ownership,text:textState}).strict();
const cmpReceipt=z.object({parentDispatchSha256:hash,status:cmpState,startedAt:isoUtc,completedAt:isoUtc}).strict();
const definitions:[string,string,string,string,string[]][]=[
 ['policy_fetch','Privacy policy fetch · persisted candidates','Policies','Generation-matched, target-relevant candidates in the retained projection; no claim about all links',['fetched']],
 ['policy_owner','Usable target-owned candidate · persisted projection','Policies','Original-source-bound document projection; producer-declared ownership and role',['producer_declared_usable']],
 ['policy_text_receipt','Retained policy text · producer verification receipt','Policies','Original-source-bound producer receipt; the daily audit does not re-read these text bytes',['producer_verified_complete_receipt']],
 ['cmp_coordinator','CMP inventory worker · coordinator receipt','CMP','Generation-matched result; a limited attempt does not establish worker completion',['worker_result_joined']],
];
export const OPERATIONS_EVIDENCE_METRICS:Metric[]=definitions.map(([id,label,group,denominator,success])=>({id:'sealed.operations.'+id,label,group,denominator,success}));

export function operationsEvidenceStates(value:unknown,scanId:string){
 const states:Record<string,{value:string;scope:string}>={};
 const parsed=receipt.safeParse(value);if(!parsed.success)return states;
 const policy=policyReceipt.safeParse(parsed.data.policy).data,cmp=cmpReceipt.safeParse(parsed.data.cmp).data;
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
const obj=(x:any)=>x&&typeof x==='object'&&!Array.isArray(x)?x:{};
const uint=(n:any)=>Number.isSafeInteger(n)&&n>0;
const sourceReceipt=(m:any,key:string,metadataKey:string)=>{
 const v=obj(m.artifactVerification?.[key]),a=obj(m.artifactMetadata?.[metadataKey]);
 return hash.safeParse(v.sha256).success&&a.sha256===v.sha256&&uint(v.sizeBytes)&&v.sizeBytes===a.sizeBytes?v:null;
};
const owned=(d:any)=>d.documentFetchState==='fetched'&&d.documentEvaluationState==='usable'&&d.documentRole==='policy_document'&&
 ['target_controller','first_party_brand'].includes(d.targetRelationship);
const verifiedText=(d:any)=>d.documentFetchState==='fetched'&&d.artifactVerificationStatus==='verified'&&hash.safeParse(d.artifactSha256).success&&
 hash.safeParse(d.retainedTextSha256).success&&uint(d.artifactSizeBytes)&&uint(d.retainedTextChars);
const completeText=(d:any)=>{
 const c=obj(d.documentTextCoverage),p=obj(c.pdfSourceCoverage);
 return verifiedText(d)&&d.extractionStatus==='complete'&&c.status==='complete'&&c.sourceTextChars===d.retainedTextChars&&
  c.retainedTextChars===d.retainedTextChars&&
  ((['html','text'].includes(d.documentFormat)&&c.pdfSourceCoverage==null)||
   (d.documentFormat==='pdf'&&p.contractVersion==='policy_pdf_source_coverage.v1'&&p.status==='complete'&&p.pageLimit===12&&
    p.characterLimit===500000&&p.characterLimitReached===false&&uint(p.totalPages)&&p.totalPages<=12&&p.extractedPages===p.totalPages));
};
export function operationsEvidenceFromRecord(record:any,event:any){
 const m=obj(event?.metadataJson), original=sourceReceipt(m,'scanArtifact','scanArtifactUri');
 if(!original||!sourceReceipt(m,'manifest','manifestUri')||!hash.safeParse(m.parentDispatchSha256).success||
    !isoUtc.safeParse(m.artifactVerification?.verifiedAt).success)return null;
 const summary=obj(record.runtimeArtifacts?.policy_disclosure_summary??record.runtimeArtifacts?.policyDisclosureSummary);
 const p=obj(summary.policyTextEvidenceProjection),source=obj(p.sourceBundle),documents:unknown=p.documents;
 let policy=null,cmp=null;
 if(summary.policySurfaceAdmissionVersion===ADMISSION&&p.contractVersion===POLICY&&p.scanId===record.scan?.id&&
  ['verified_complete','verified_partial'].includes(p.projectionStatus)&&source.verificationStatus==='verified'&&source.sha256===original.sha256&&
  source.sizeBytes===original.sizeBytes&&Array.isArray(documents)&&documents.length<=16&&documents.every(d=>documentFields.safeParse(d).success)){
  const candidates=summary.discoveredPrivacyPolicyDetails;
  const fetch=Array.isArray(candidates)&&candidates.length<=64&&candidates.every(c=>fetchState.safeParse(c?.documentFetchState).success)
   ? candidates.some(c=>c.documentFetchState==='fetched')||documents.some(d=>obj(d).documentFetchState==='fetched')?'fetched'
    : candidates.some(c=>c.documentFetchState==='failed')?'recorded_fetch_failure'
    : candidates.some(c=>c.documentFetchState==='skipped_budget')?'recorded_budget_skip':'no_attempt_in_returned_candidates'
   : null;
  policy={scanId:p.scanId,sourceSha256:source.sha256,originalSha256:original.sha256,fetch,
   owner:documents.some(d=>owned(obj(d)))?'producer_declared_usable':'no_qualifying_candidate_in_projection',
   text:documents.some(d=>completeText(obj(d)))?'producer_verified_complete_receipt':
    documents.some(d=>verifiedText(obj(d)))?'producer_verified_limited_receipt':'no_verified_receipt_in_projection'};
 }
 const timing=obj(m.lambdaLaneTimingSummary),c=obj(timing.cmpPreferenceInspection);
 if(timing.contractVersion===TIMING&&cmpState.safeParse(c.status).success&&isoUtc.safeParse(c.startedAt).success&&
    isoUtc.safeParse(c.completedAt).success&&c.startedAt<=c.completedAt)
  cmp={parentDispatchSha256:m.parentDispatchSha256,status:c.status,startedAt:c.startedAt,completedAt:c.completedAt};
 return policy||cmp?{version:VERSION,policy,cmp}:null;
}

const pth=(root:string,...parts:string[])=>`(${root}#>'{${parts.join(',')}}')`;
const str=(root:string,...parts:string[])=>`(${root}#>>'{${parts.join(',')}}')`;
const equals=(a:string,b:string)=>`${a}='${b}'`;
const h=(x:string)=>`(${x} ~ '^[a-f0-9]{64}$')`;
const pos=(x:string)=>`(case when jsonb_typeof(${x})='number' and ${x}#>>'{}' ~ '^[1-9][0-9]{0,15}$' then (${x}#>>'{}')::numeric<=9007199254740991 else false end)`;
const bound=(a:string,n:number)=>`(case when jsonb_typeof(${a})='array' then jsonb_array_length(${a})<=${n} else false end)`;
const array=(a:string,n:number)=>`(case when ${bound(a,n)} then ${a} else '[]'::jsonb end)`;
const receiptMatches=(v:string,a:string)=>`(${h(str(v,'sha256'))} and ${pth(v,'sha256')}=${pth(a,'sha256')} and
 ${pos(pth(v,'sizeBytes'))} and ${pth(v,'sizeBytes')}=${pth(a,'sizeBytes')})`;
const m=`(e->'metadataJson')`,orig=pth(m,'artifactVerification','scanArtifact');
const s=`coalesce(nullif(${pth('p.report_projection_payload','runtimeArtifacts','policy_disclosure_summary')},'null'::jsonb),${pth('p.report_projection_payload','runtimeArtifacts','policyDisclosureSummary')})`;
const p=pth(s,'policyTextEvidenceProjection'), source=pth(p,'sourceBundle');
const docs=pth(p,'documents'), candidates=pth(s,'discoveredPrivacyPolicyDetails');
const d=(predicate:string)=>`exists(select 1 from jsonb_array_elements(${array(docs,16)}) d where ${predicate})`;
const c=(predicate:string)=>`exists(select 1 from jsonb_array_elements(${array(candidates,64)}) c where ${predicate})`;
const df=str('d','documentFetchState'), cf=str('c','documentFetchState');
const badDoc=d(`(${df} in ('fetched','failed','skipped_budget','not_attempted')
 and ${str('d','documentEvaluationState')} in ('not_attempted','usable','insufficient','blocked')
 and ${str('d','documentRole')} in ('policy_document','policy_index','unknown')
 and ${str('d','targetRelationship')} in ('target_controller','first_party_brand','service_provider','unrelated','unknown')) is not true`);
const verifiedTextSql=`${equals(df,'fetched')} and ${equals(str('d','artifactVerificationStatus'),'verified')} and
 ${h(str('d','artifactSha256'))} and ${h(str('d','retainedTextSha256'))} and ${pos(pth('d','artifactSizeBytes'))} and ${pos(pth('d','retainedTextChars'))}`;
const cov=pth('d','documentTextCoverage'),pdf=pth(cov,'pdfSourceCoverage');
const completeTextSql=`${verifiedTextSql} and ${equals(str('d','extractionStatus'),'complete')} and ${equals(str(cov,'status'),'complete')} and
 ${pth(cov,'sourceTextChars')}=${pth('d','retainedTextChars')} and ${pth(cov,'retainedTextChars')}=${pth('d','retainedTextChars')} and
 ((${str('d','documentFormat')} in ('html','text') and nullif(${pdf},'null'::jsonb) is null) or
 (${equals(str('d','documentFormat'),'pdf')} and ${equals(str(pdf,'contractVersion'),'policy_pdf_source_coverage.v1')} and
 ${equals(str(pdf,'status'),'complete')} and ${pth(pdf,'pageLimit')}='12'::jsonb and ${pth(pdf,'characterLimit')}='500000'::jsonb and
 ${pth(pdf,'characterLimitReached')}='false'::jsonb and ${pos(pth(pdf,'totalPages'))} and
 ${pth(pdf,'totalPages')}<='12'::jsonb and ${pth(pdf,'totalPages')}=${pth(pdf,'extractedPages')}))`;
const timing=pth(m,'lambdaLaneTimingSummary'),cmp=pth(timing,'cmpPreferenceInspection');
const iso=(x:string)=>`${x} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}Z$'`;
// Evaluated within the existing unique result-event aggregate. Each inspected
// array is bounded before expansion; the output contains only fixed states.
export const OPERATIONS_EVIDENCE_SQL=`case when ${receiptMatches(orig,pth(m,'artifactMetadata','scanArtifactUri'))}
 and ${receiptMatches(pth(m,'artifactVerification','manifest'),pth(m,'artifactMetadata','manifestUri'))}
 and ${h(str(m,'parentDispatchSha256'))} and ${iso(str(m,'artifactVerification','verifiedAt'))} then jsonb_build_object('version','${VERSION}',
 'policy',case when ${equals(str(s,'policySurfaceAdmissionVersion'),ADMISSION)} and ${equals(str(p,'contractVersion'),POLICY)}
 and ${pth(p,'scanId')}=${pth('p.report_projection_payload','scan','id')}
 and ${str(p,'projectionStatus')} in ('verified_complete','verified_partial') and ${equals(str(source,'verificationStatus'),'verified')}
 and ${pth(source,'sha256')}=${pth(orig,'sha256')} and ${pth(source,'sizeBytes')}=${pth(orig,'sizeBytes')} and ${bound(docs,16)} and not ${badDoc}
 then jsonb_build_object('scanId',${pth(p,'scanId')},'sourceSha256',${pth(source,'sha256')},'originalSha256',${pth(orig,'sha256')},
 'fetch',case when ${bound(candidates,64)} and not ${c(`(${cf} in ('fetched','failed','skipped_budget','not_attempted')) is not true`)}
 then case when ${c(equals(cf,'fetched'))} or ${d(equals(df,'fetched'))} then 'fetched'
 when ${c(equals(cf,'failed'))} then 'recorded_fetch_failure' when ${c(equals(cf,'skipped_budget'))} then 'recorded_budget_skip'
 else 'no_attempt_in_returned_candidates' end end,
 'owner',case when ${d(`${equals(df,'fetched')} and ${equals(str('d','documentEvaluationState'),'usable')} and
 ${equals(str('d','documentRole'),'policy_document')} and ${str('d','targetRelationship')} in ('target_controller','first_party_brand')`)}
 then 'producer_declared_usable' else 'no_qualifying_candidate_in_projection' end,
 'text',case when ${d(completeTextSql)} then 'producer_verified_complete_receipt' when ${d(verifiedTextSql)} then 'producer_verified_limited_receipt'
 else 'no_verified_receipt_in_projection' end) end,
 'cmp',case when ${equals(str(timing,'contractVersion'),TIMING)} and ${str(cmp,'status')} in ('joined','limited')
 and ${iso(str(cmp,'startedAt'))} and ${iso(str(cmp,'completedAt'))} and ${str(cmp,'startedAt')}<=${str(cmp,'completedAt')}
 then jsonb_build_object('parentDispatchSha256',${pth(m,'parentDispatchSha256')},'status',${pth(cmp,'status')},
 'startedAt',${pth(cmp,'startedAt')},'completedAt',${pth(cmp,'completedAt')}) end) end`;
