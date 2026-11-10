import {applyChoiceSummary, CHOICE_AUDIT_VERSION, LEGACY_CHOICE_AUDIT_VERSION} from './audit-progress-choice';
import {applyControlAccessibility,applyTrackingReviews,TRACKING_REVIEW_REF} from './audit-progress-control-accessibility';
import {readCaliforniaRejectCoverage} from './audit-california-reject-coverage';
import {operationsEvidenceStates} from './audit-progress-operations-evidence';
import {isDeepStrictEqual} from 'node:util';
/** Audit-only projection of already-persisted control states. No findings or re-assessment. */
import {existsSync,readFileSync,realpathSync,statSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {consentControlAssessmentSchema} from '../../packages/certscore-contracts/src/consent-control-assessment';
import {CMS_CATALOGUE_V1,CMS_CATALOGUE_V2,CMS_CATALOGUE_V3,CMS_CATALOGUE_VERSION} from '../../packages/certscore-contracts/src/cms-security-catalog';
import {AUDIT_POLICY_PROVENANCE_VERSION} from '../../packages/certscore-contracts/src/audit-policy-provenance';
import {botOriginSql} from './audit-bot-origin';
import type {ProgressRow} from './audit-progress';

export const OPT_OUT_INPUT_VERSION='certscore.audit-opt-out-inputs.v1';
export const OPT_OUT_EXTRACT_VERSION='certscore.audit-opt-out-extract.v1';
export type OptOutReceipt={file:string;sha256:string;bytes:number};
const digest=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const DIRECT_ID_INVENTORY_VERSION='certscore.mac-mini-direct-id-inventory.v1';

function cmpBlockerOmittedByQuery(file:string,input:{version?:string;choiceAuditVersion?:string;querySha256?:string}):boolean {
  if(input.version!==DIRECT_ID_INVENTORY_VERSION||input.choiceAuditVersion!==CHOICE_AUDIT_VERSION||path.basename(file)!=='delta-inventory.json')return false;
  const sqlFile=path.join(path.dirname(file),'delta-inventory.sql');
  // Historical receipts can lack the SQL. They provide no proof of omission.
  if(!input.querySha256||!existsSync(sqlFile))return false;
  if(statSync(sqlFile).size>128_000)throw Error('Audit query SQL exceeds byte bound');
  const bytes=readFileSync(sqlFile);
  if(digest(bytes)!==input.querySha256)throw Error('Audit query SQL hash mismatch');
  return /case when jsonb_typeof\(\(p\.report_projection_payload#>'\{runtimeArtifacts,gpcCmpStateComparison\}'\)\)='object' then 'source_present' else 'source_missing' end\),\s*'transport',\s*'included'\)/.test(bytes.toString('utf8'));
}
// Reuse canonical field validators. The extract deliberately omits labels, CMP inventories,
// policy text and runtime packets; it is not a full assessment or a new evidence packet.
const assessmentSchema=consentControlAssessmentSchema.innerType().pick({
  artifactType:true,artifactVersion:true,assessmentStatus:true,scan:true,document:true,
  controls:true,coverage:true,provenance:true,
});
export const OPT_OUT_EXTRACT_SQL=`jsonb_build_object(
 'artifactType',a.value->'artifactType','artifactVersion',a.value->'artifactVersion',
 'assessmentStatus',a.value->'assessmentStatus','scan',a.value->'scan',
 'document',a.value->'document','controls',a.value->'controls',
 'coverage',a.value->'coverage','provenance',a.value->'provenance')`;
export const OPT_OUT_ASSESSMENT_JOIN_SQL=`left join lateral (select coalesce(
 p.report_projection_payload#>'{snapshot,consentControlAssessment}',
 p.report_projection_payload#>'{runtimeArtifacts,consentControlAssessment}',
 p.report_projection_payload#>'{snapshot,consent_control_assessment}') as value) a on true`;

export function historicalOptOutSql(start:string,end:string):string {
  if(!Number.isFinite(Date.parse(start))||!Number.isFinite(Date.parse(end))||Date.parse(end)<=Date.parse(start)||Date.parse(end)-Date.parse(start)>32*86400000)throw Error('Bounded historical window of at most 32 days required');
  const origin=botOriginSql(['00000000-0000-4000-8000-000000000000']);
  const marker='select row_to_json(result) from (';
  const inner=origin.slice(origin.indexOf(marker)+marker.length,origin.lastIndexOf(') result;'))
    .replace(/where s\.id=any\(array\[[^\n]+\]::uuid\[\]\)/,`where s.created_at>='${new Date(start).toISOString()}'::timestamptz and s.created_at<'${new Date(end).toISOString()}'::timestamptz and s.status in ('completed','completed_limited')`)
    .replace(/order by s.id\s*$/,'');
  return `set statement_timeout='45s';
with origins as materialized (${inner})
select row_to_json(r) from (
 select o.*,s.created_at,s.status,p.report_projection_source_hash as projection_source_hash,
 p.report_projection_payload_sha256 as projection_payload_sha256,
 p.report_projection_version as projection_version,p.report_projection_status as projection_status,
 ${OPT_OUT_EXTRACT_SQL} as control_assessment,count(*) over() as cohort_total
 from origins o join public.scans s on s.id=o."scanId"
 left join public.scan_snapshots p on p.scan_id=s.id
 ${OPT_OUT_ASSESSMENT_JOIN_SQL}
 where o."isMacMini" is true and o."isCanary" is false
 and p.report_projection_status='ready' and coalesce(a.value#>>'{scan,noGo}','false')='false'
 order by s.created_at,s.id limit 5001
) r;`;
}

export function retainedGenerationMatches(extract:any,row:ProgressRow):boolean {
  if(!row.reportable||extract.scanId!==row.scanId||extract.isMacMini!==true||extract.isCanary!==false||!extract.originalRequestId||extract.publicationRequestStatus==='terminal_failure')return false;
  if(!['completed','completed_limited'].includes(extract.status)||extract.projection_status!=='ready'||
    !['scan-report-projection-v26','scan-report-projection-v27'].includes(extract.projection_version)||extract.projection_version!==row.projectionVersion||
    !/^[a-f0-9]{64}$/.test(extract.projection_payload_sha256??'')||
    !/^[a-f0-9]{64}$/.test(row.publicProjectionSourceHash??'')||extract.projection_source_hash!==row.publicProjectionSourceHash)return false;
  if(!Number.isFinite(Date.parse(extract.created_at))||Math.abs(Date.parse(extract.created_at)-Date.parse(row.createdAt))>=1)return false;
  return true;
}

export function retainedOptOutState(extract:any,row:ProgressRow):{state:string;source:string}|null {
  if(!retainedGenerationMatches(extract,row))return null;
  const parsed=assessmentSchema.safeParse(extract.control_assessment);if(!parsed.success)return null;
  const a=parsed.data,c=a.controls.privacyOptOut;
  if(a.scan.scanId!==row.scanId||a.scan.noGo||a.artifactVersion!==a.provenance.contractVersion)return null;
  // An explicit canonical unknown is retained even when its reason is unverified
  // document/layer coverage. Only binary observations require matched first-layer proof.
  if(c.state!=='unknown'&&(a.document.identityStatus!=='matched'||c.layer!=='first_layer'))return null;
  if(a.artifactVersion==='2.2'&&(!c.inspection||c.state==='not_observed'&&(c.inspection.status!=='complete'||!c.inspection.evidenceRefs.some(r=>['CanonicalEvidenceBundle.json','ConsentControlGeometryEvidence.json'].includes(r)))))return null;
  return {state:c.state,source:`persisted_control_extract/${a.provenance.projectorVersion}/${extract.projection_version}/${OPT_OUT_EXTRACT_VERSION}`};
}

export const TECHNICAL_COUNT_KEYS=['site.link_evidence','technology.detections','technology.matches'] as const;
export const TECHNICAL_COUNT_SOURCE='verified_persisted_technical_counts/';
export const TECHNICAL_COUNT_REF='generation_matched_technical_counts';

function applyPolicyReceipt(row:ProgressRow,value:unknown):boolean {
  if(!value||typeof value!=='object'||!('version' in value)||value.version!==AUDIT_POLICY_PROVENANCE_VERSION||
    row.projectionVersion!=='scan-report-projection-v27'||!row.publicProjectionSourceHash)return false;
  const states=operationsEvidenceStates(value,row.scanId,{
    scanId:row.scanId,createdAt:row.createdAt,generation:row.projectionVersion,sourceHash:row.publicProjectionSourceHash,
  });
  for(const [key,{value:state,scope}] of Object.entries(states)){
    const existing=row.states[key];
    if(existing!==undefined&&existing!=='unavailable'){
      if(existing!==state)throw Error('Conflicting generation-bound policy receipt: '+key);
      continue;
    }
    row.states[key]=state;
    (row.metricSources??={})[key]='persisted_policy_receipt/'+row.projectionVersion+'/'+scope;
  }
  return Object.keys(states).length>0;
}

function applyTechnicalCounts(row:ProgressRow,value:unknown):boolean {
  if(value==null)return false;
  if(!Array.isArray(value)||value.length!==2)throw Error('Invalid technical count receipt');
  const records=[
    {value:value[0],versions:['certscore.site-integrity-projection.v1','certscore.site-integrity-projection.v2'],keys:TECHNICAL_COUNT_KEYS.slice(0,1),limits:[12],hasCatalogue:false},
    {value:value[1],versions:['certscore.cms-security-projection.v1','certscore.cms-security-projection.v2'],keys:TECHNICAL_COUNT_KEYS.slice(1),limits:[22,1024],hasCatalogue:true},
  ];
  let measured=false;
  for(const record of records){
    if(record.value===null)continue;
    const [version,...counts]=Array.isArray(record.value)?record.value:[];
    const catalogue=record.hasCatalogue?counts.pop():null;
    if(record.hasCatalogue&&![CMS_CATALOGUE_V1,CMS_CATALOGUE_V2,CMS_CATALOGUE_V3,CMS_CATALOGUE_VERSION].includes(catalogue))
      throw Error('Unsupported technical advisory catalogue');
    if(!record.versions.includes(version)||counts.length!==record.keys.length||
      counts.some((count,i)=>!Number.isSafeInteger(count)||count<0||count>record.limits[i]!))throw Error('Invalid verified technical counts');
    for(const [i,key] of record.keys.entries()){
      const existing=row.measurements?.[key];
      const source=TECHNICAL_COUNT_SOURCE+row.projectionVersion+'/'+version+(catalogue?'/'+catalogue:'');
      if(existing!==undefined){
        const existingSource=row.metricSources?.[key];
        if(existing!==counts[i]||existingSource?.startsWith(TECHNICAL_COUNT_SOURCE)&&existingSource!==source)
          throw Error('Conflicting generation-bound technical count '+key);
        continue;
      }
      (row.measurements??={})[key]=counts[i];
      (row.metricSources??={})[key]=source;
    }
    measured=true;
  }
  return measured;
}

export function applyRetainedOptOutExtracts(rows:ProgressRow[],receipts:OptOutReceipt[]) {
  if(receipts.length>64)throw Error('At most 64 retained opt-out sources required');
  const byId=new Map(rows.map(r=>[r.scanId,r])),matched=new Map<string,{state:string;source:string}>();
  const cmpGenerations=new Map<string,{creator:string;payloadSha256:string;omitted:boolean}>();
  const summary={sources:receipts.length,inspected:0,matched:0,added:0,alreadyRetained:0,unmatchedOrUnavailable:0};
  for(const receipt of receipts){
    const file=realpathSync(receipt.file);if(statSync(file).size>32_000_000)throw Error('Control extract exceeds byte bound');
    const bytes=readFileSync(file);if(bytes.length!==receipt.bytes||digest(bytes)!==receipt.sha256)throw Error('Control extract hash/size mismatch');
    const input=JSON.parse(bytes.toString('utf8'));
    if(![OPT_OUT_EXTRACT_VERSION,'certscore.mac-mini-direct-id-inventory.v1'].includes(input.version)||input.readOnly!==true||!Array.isArray(input.rows)||input.rows.length>5000)throw Error('Unsupported read-only control extract');
    const cmpBlockerOmitted=cmpBlockerOmittedByQuery(file,input);
    const seen=new Set<string>();
    for(const extract of input.rows){
      summary.inspected++;if(seen.has(extract.scanId))throw Error('Duplicate control-extract scan');seen.add(extract.scanId);
      const row=byId.get(extract.scanId),result=row?retainedOptOutState(extract,row):null;
      if(row&&retainedGenerationMatches(extract,row)){
        if(input.version==='certscore.mac-mini-direct-id-inventory.v1'&&
          (row.originProof!=='original_credential_verified'||row.originRequestId===extract.originalRequestId)&&
          applyTrackingReviews(row,extract.trackingReviews)&&!row.refs.some(r=>r.file===file&&r.role===TRACKING_REVIEW_REF)){
          row.refs.push({file,sha256:receipt.sha256,role:TRACKING_REVIEW_REF});
        }
        if(input.version==='certscore.mac-mini-direct-id-inventory.v1'&&
          (row.originProof!=='original_credential_verified'||row.originRequestId===extract.originalRequestId)&&
          applyTechnicalCounts(row,extract.technicalCounts)&&!row.refs.some(r=>r.file===file&&r.role===TECHNICAL_COUNT_REF)){
          row.refs.push({file,sha256:receipt.sha256,role:TECHNICAL_COUNT_REF});
        }
        if(input.version==='certscore.mac-mini-direct-id-inventory.v1'&&row.states['click.reject']==='completed'&&
          (row.originProof!=='original_credential_verified'||row.originRequestId===extract.originalRequestId)){
          const coverage=readCaliforniaRejectCoverage(extract.caReject);
          if(coverage){
            if(row.californiaRejectCoverage&&!isDeepStrictEqual(row.californiaRejectCoverage,coverage))throw Error('Conflicting generation-bound California Reject assessment');
            row.californiaRejectCoverage=coverage;
          }
        }
        if([CHOICE_AUDIT_VERSION,LEGACY_CHOICE_AUDIT_VERSION].includes(extract.choice_audit?.version)){
          if(input.version===DIRECT_ID_INVENTORY_VERSION&&extract.choice_audit.version===CHOICE_AUDIT_VERSION&&extract.choice_audit.priorityEvidence){
            const generation={creator:extract.originalRequestId,payloadSha256:extract.projection_payload_sha256,omitted:cmpBlockerOmitted};
            const prior=cmpGenerations.get(row.scanId);
            if(prior&&(prior.omitted||generation.omitted)&&(prior.creator!==generation.creator||prior.payloadSha256!==generation.payloadSha256))
              throw Error('Conflicting generation-bound CMP transport');
            cmpGenerations.set(row.scanId,{...generation,omitted:generation.omitted||prior?.omitted===true});
          }
          applyChoiceSummary(row,extract.choice_audit,`persisted_choice_extract/${row.projectionVersion}`,cmpBlockerOmitted);
          if(row.states['sealed.opt_out.coverage']==='available'&&!row.refs.some(r=>r.file===file&&r.role==='generation_matched_choice_extract'))
            row.refs.push({file,sha256:receipt.sha256,role:'generation_matched_choice_extract'});
        }
        if(input.version===DIRECT_ID_INVENTORY_VERSION&&
          (row.originProof!=='original_credential_verified'||row.originRequestId===extract.originalRequestId)&&
          applyPolicyReceipt(row,extract.policyReceipt)&&!row.refs.some(r=>r.file===file&&r.role==='generation_matched_policy_receipt')){
          row.refs.push({file,sha256:receipt.sha256,role:'generation_matched_policy_receipt'});
        }
        if(input.version==='certscore.mac-mini-direct-id-inventory.v1'&&extract.projection_version==='scan-report-projection-v27'&&extract.controlAccessibility!==undefined){
          if(applyControlAccessibility(row,extract.controlAccessibility)&&!row.refs.some(r=>r.file===file&&r.role==='generation_matched_control_accessibility_extract'))
            row.refs.push({file,sha256:receipt.sha256,role:'generation_matched_control_accessibility_extract'});
        }
      }
      if(!row||!result){summary.unmatchedOrUnavailable++;continue;}
      const prior=matched.get(row.scanId);if(prior&&(prior.state!==result.state||prior.source!==result.source))throw Error('Conflicting same-generation control extracts');matched.set(row.scanId,result);
      const old=row.states['sealed.control.privacyOptOut'];
      if(old!==undefined&&old!=='unavailable'){if(old!==result.state)throw Error('Control extract disagrees with original sealed assessment');summary.alreadyRetained++;continue;}
      row.states['sealed.control.privacyOptOut']=result.state;
      row.metricSources??={};row.metricSources['sealed.control.privacyOptOut']=result.source;
      row.refs.push({file,sha256:receipt.sha256,role:'generation_matched_persisted_control_extract'});summary.added++;
    }
  }
  summary.matched=matched.size;return summary;
}
