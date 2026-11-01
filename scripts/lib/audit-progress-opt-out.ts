/** Audit-only projection of already-persisted control states. No findings or re-assessment. */
import {readFileSync,realpathSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {consentControlAssessmentSchema} from '../../packages/certscore-contracts/src/consent-control-assessment';
import {botOriginSql} from './audit-bot-origin';
import type {ProgressRow} from './audit-progress';

export const OPT_OUT_INPUT_VERSION='certscore.audit-opt-out-inputs.v1';
export const OPT_OUT_EXTRACT_VERSION='certscore.audit-opt-out-extract.v1';
export type OptOutReceipt={file:string;sha256:string;bytes:number};
const digest=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
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

export function retainedOptOutState(extract:any,row:ProgressRow):{state:string;source:string}|null {
  if(!row.reportable||extract.scanId!==row.scanId||extract.isMacMini!==true||extract.isCanary!==false||!extract.originalRequestId||extract.publicationRequestStatus==='terminal_failure')return null;
  if(!['completed','completed_limited'].includes(extract.status)||extract.projection_status!=='ready'||
    !['scan-report-projection-v26','scan-report-projection-v27'].includes(extract.projection_version)||extract.projection_version!==row.projectionVersion||
    !/^[a-f0-9]{64}$/.test(extract.projection_payload_sha256??'')||
    !/^[a-f0-9]{64}$/.test(row.publicProjectionSourceHash??'')||extract.projection_source_hash!==row.publicProjectionSourceHash)return null;
  if(!Number.isFinite(Date.parse(extract.created_at))||Math.abs(Date.parse(extract.created_at)-Date.parse(row.createdAt))>=1)return null;
  const parsed=assessmentSchema.safeParse(extract.control_assessment);if(!parsed.success)return null;
  const a=parsed.data,c=a.controls.privacyOptOut;
  if(a.scan.scanId!==row.scanId||a.scan.noGo||a.artifactVersion!==a.provenance.contractVersion)return null;
  // An explicit canonical unknown is retained even when its reason is unverified
  // document/layer coverage. Only binary observations require matched first-layer proof.
  if(c.state!=='unknown'&&(a.document.identityStatus!=='matched'||c.layer!=='first_layer'))return null;
  if(a.artifactVersion==='2.2'&&(!c.inspection||c.state==='not_observed'&&(c.inspection.status!=='complete'||!c.inspection.evidenceRefs.some(r=>['CanonicalEvidenceBundle.json','ConsentControlGeometryEvidence.json'].includes(r)))))return null;
  return {state:c.state,source:`persisted_control_extract/${a.provenance.projectorVersion}/${extract.projection_version}/${OPT_OUT_EXTRACT_VERSION}`};
}

export function applyRetainedOptOutExtracts(rows:ProgressRow[],receipts:OptOutReceipt[]) {
  if(receipts.length>64)throw Error('At most 64 retained opt-out sources required');
  const byId=new Map(rows.map(r=>[r.scanId,r])),matched=new Map<string,{state:string;source:string}>();
  const summary={sources:receipts.length,inspected:0,matched:0,added:0,alreadyRetained:0,unmatchedOrUnavailable:0};
  for(const receipt of receipts){
    const file=realpathSync(receipt.file);if(statSync(file).size>32_000_000)throw Error('Control extract exceeds byte bound');
    const bytes=readFileSync(file);if(bytes.length!==receipt.bytes||digest(bytes)!==receipt.sha256)throw Error('Control extract hash/size mismatch');
    const input=JSON.parse(bytes.toString('utf8'));
    if(![OPT_OUT_EXTRACT_VERSION,'certscore.mac-mini-direct-id-inventory.v1'].includes(input.version)||input.readOnly!==true||!Array.isArray(input.rows)||input.rows.length>5000)throw Error('Unsupported read-only control extract');
    const seen=new Set<string>();
    for(const extract of input.rows){
      summary.inspected++;if(seen.has(extract.scanId))throw Error('Duplicate control-extract scan');seen.add(extract.scanId);
      const row=byId.get(extract.scanId),result=row?retainedOptOutState(extract,row):null;
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
