/** Private audit receipt built from already-persisted policy and original artifact verification. */
import {z} from 'zod';
export const AUDIT_POLICY_PROVENANCE_VERSION='certscore.audit-policy-provenance.v1';
export const MAX_AUDIT_POLICY_PROVENANCE_BYTES=512;
const POLICY='certscore.policy-text-evidence-projection.v1';
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
export const legacyPolicyProvenanceSchema=z.object({scanId:z.string(),sourceSha256:hash,originalSha256:hash,
  fetch:z.enum(['fetched','recorded_fetch_failure','recorded_budget_skip','no_attempt_in_returned_candidates']).nullable(),
  owner:ownership,text:textState}).strict();

const bindingSchema=z.object({scanId:z.string().uuid(),createdAt:isoUtc,
 generation:z.literal('scan-report-projection-v27'),sourceHash:hash}).strict();
export type AuditPolicyProvenanceBinding=z.infer<typeof bindingSchema>;
export const auditPolicyProvenanceSchema=z.object({
 version:z.literal(AUDIT_POLICY_PROVENANCE_VERSION),
 binding:bindingSchema,
 bundle:hash,
 fetch:legacyPolicyProvenanceSchema.shape.fetch,
 owner:ownership,
 text:textState,
}).strict();
export const policyEvidenceObject=(x:any)=>x&&typeof x==='object'&&!Array.isArray(x)?x:{};
const uint=(n:any)=>Number.isSafeInteger(n)&&n>0;
const sourceReceipt=(m:any,key:string,metadataKey:string)=>{
 const v=policyEvidenceObject(m.artifactVerification?.[key]),a=policyEvidenceObject(m.artifactMetadata?.[metadataKey]);
 return hash.safeParse(v.sha256).success&&a.sha256===v.sha256&&uint(v.sizeBytes)&&v.sizeBytes===a.sizeBytes?v:null;
};
const owned=(d:any)=>d.documentFetchState==='fetched'&&d.documentEvaluationState==='usable'&&d.documentRole==='policy_document'&&
 ['target_controller','first_party_brand'].includes(d.targetRelationship);
const verifiedText=(d:any)=>d.documentFetchState==='fetched'&&d.artifactVerificationStatus==='verified'&&hash.safeParse(d.artifactSha256).success&&
 hash.safeParse(d.retainedTextSha256).success&&uint(d.artifactSizeBytes)&&uint(d.retainedTextChars);
const completeText=(d:any)=>{
 const c=policyEvidenceObject(d.documentTextCoverage),p=policyEvidenceObject(c.pdfSourceCoverage);
 return verifiedText(d)&&d.extractionStatus==='complete'&&c.status==='complete'&&c.sourceTextChars===d.retainedTextChars&&
  c.retainedTextChars===d.retainedTextChars&&
  ((['html','text'].includes(d.documentFormat)&&c.pdfSourceCoverage==null)||
   (d.documentFormat==='pdf'&&p.contractVersion==='policy_pdf_source_coverage.v1'&&p.status==='complete'&&p.pageLimit===12&&
    p.characterLimit===500000&&p.characterLimitReached===false&&uint(p.totalPages)&&p.totalPages<=12&&p.extractedPages===p.totalPages));
};

export function verifiedPolicyProvenanceEvent(event:unknown){
 const m=policyEvidenceObject(policyEvidenceObject(event).metadataJson),original=sourceReceipt(m,'scanArtifact','scanArtifactUri');
 if(!original||!sourceReceipt(m,'manifest','manifestUri')||!hash.safeParse(m.parentDispatchSha256).success||
    !isoUtc.safeParse(m.artifactVerification?.verifiedAt).success)return null;
 return {metadata:m,original};
}

export function policyProvenanceFromRecord(record:any,event:unknown){
 const verified=verifiedPolicyProvenanceEvent(event);
 if(!verified)return null;
 const {original}=verified;
 const summary=policyEvidenceObject(record.runtimeArtifacts?.policy_disclosure_summary??record.runtimeArtifacts?.policyDisclosureSummary);
 const p=policyEvidenceObject(summary.policyTextEvidenceProjection),source=policyEvidenceObject(p.sourceBundle),documents:unknown=p.documents;
 let policy=null;
 if(summary.policySurfaceAdmissionVersion===ADMISSION&&p.contractVersion===POLICY&&p.scanId===record.scan?.id&&
  ['verified_complete','verified_partial'].includes(p.projectionStatus)&&source.verificationStatus==='verified'&&source.sha256===original.sha256&&
  source.sizeBytes===original.sizeBytes&&Array.isArray(documents)&&documents.length<=16&&documents.every(d=>documentFields.safeParse(d).success)){
  const candidates=summary.discoveredPrivacyPolicyDetails;
  const fetch=Array.isArray(candidates)&&candidates.length<=64&&candidates.every(c=>fetchState.safeParse(c?.documentFetchState).success)
   ? candidates.some(c=>c.documentFetchState==='fetched')||documents.some(d=>policyEvidenceObject(d).documentFetchState==='fetched')?'fetched'
    : candidates.some(c=>c.documentFetchState==='failed')?'recorded_fetch_failure'
    : candidates.some(c=>c.documentFetchState==='skipped_budget')?'recorded_budget_skip':'no_attempt_in_returned_candidates'
   : null;
  policy={scanId:p.scanId,sourceSha256:source.sha256,originalSha256:original.sha256,fetch,
   owner:documents.some(d=>owned(policyEvidenceObject(d)))?'producer_declared_usable':'no_qualifying_candidate_in_projection',
   text:documents.some(d=>completeText(policyEvidenceObject(d)))?'producer_verified_complete_receipt':
    documents.some(d=>verifiedText(policyEvidenceObject(d)))?'producer_verified_limited_receipt':'no_verified_receipt_in_projection'};
 }
 return policy;
}

export function buildAuditPolicyProvenance(record:any,generation:string,sourceHash:string){
 const scan=policyEvidenceObject(record.scan);
 if(!['completed','completed_limited'].includes(scan.status)||
    (typeof scan.createdAt!=='string'&&!(scan.createdAt instanceof Date)))return undefined;
 const time=new Date(scan.createdAt);
 if(!Number.isFinite(time.getTime()))return undefined;
 const binding=bindingSchema.safeParse({scanId:scan.id,createdAt:time.toISOString(),generation,sourceHash});
 if(!binding.success)return undefined;
 const events=Array.isArray(record.events)?record.events.filter((event:unknown)=>
   policyEvidenceObject(event).eventType==='v2_lambda_result.received'):[];
 if(events.length!==1)return undefined;
 const policy=policyProvenanceFromRecord(record,events[0]);
 if(!policy)return undefined;
 return auditPolicyProvenanceSchema.parse({version:AUDIT_POLICY_PROVENANCE_VERSION,binding:binding.data,
   bundle:policy.sourceSha256,fetch:policy.fetch,owner:policy.owner,text:policy.text});
}
