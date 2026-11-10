import {CONTROL_ACCESSIBILITY_REASONS} from '../../packages/certscore-contracts/src/control-accessibility-assessment';
import {z} from 'zod';
import type {Metric,ProgressRow} from './audit-progress';
import {returnedState} from './audit-progress-contracts';

const checkId='accessibility_consent_controls';
const projectionVersion='persisted-canonical-report-projection-v7';
export const CONTROL_ACCESSIBILITY_KEYS=[`sealed.checklist.${checkId}`,`sealed.verdict.${checkId}`] as const;
const sourcePrefix='persisted_control_accessibility_extract/';
const legacyReceipt=z.tuple([
 z.literal(projectionVersion),
 z.enum(['observed','not_observed','not_testable','not_applicable']),
 z.enum(['Observed','No match found','Not confirmed','Not observed','Not testable','Gap observed','Review signal','Insufficient evidence','Out of scope']),
]);

const detailReceipt=z.tuple([z.literal(1),z.enum(['completed','partial','unavailable','no_controls']),
 z.number().int().min(0).max(2**CONTROL_ACCESSIBILITY_REASONS.length-1),
 z.number().int().min(0).max(8),z.number().int().min(0).max(8),z.number().int().min(0).max(8),z.number().int().min(0).max(8)]);
const receipt=z.union([legacyReceipt,z.tuple([...legacyReceipt.items,detailReceipt.nullable()])]);
export function readControlAccessibilityDetail(value:unknown){
 const p=detailReceipt.safeParse(value);if(!p.success)return undefined;
 const [version,status,mask,controls,completed,issues,review]=p.data;
 if(completed>controls||issues>controls||review>controls||status==='completed'&&(mask!==0||completed!==controls||!controls)||
  status==='unavailable'&&controls!==0||status==='no_controls'&&(controls!==0||!(mask&1)))throw Error('Conflicting control accessibility coverage');
 return {version,status,reasons:CONTROL_ACCESSIBILITY_REASONS.filter((_,i)=>mask&2**i),controls,completed,issues,review};
}
export const CONTROL_ACCESSIBILITY_METRICS:Metric[]=[
 {id:`checklist.${checkId}`,label:'Accessibility of privacy/consent controls',group:'Accessibility',denominator:'Readable reportable scans; matched canonical assessment required',success:[]},
 {id:`verdict.${checkId}`,label:'Accessibility of privacy/consent controls · returned verdict',group:'Accessibility',denominator:'Readable reportable scans; matched canonical verdict required',success:[]},
];

// Read only the exact persisted row and its version. A duplicate is ambiguous,
// even when both copies have identical values.
const checklistSql=(id:string)=>`(select case when count(*)=1 then jsonb_build_array(
 p.report_projection_payload#>>'{canonicalReportProjection,artifactVersion}',
 min(x->>'evidenceState'),min(x->>'status')) end
 from jsonb_path_query(p.report_projection_payload,'strict $.canonicalReportProjection.checklistRows[*]?(@.id=="${id}")','{}',true) x
 where p.report_projection_status='ready')`;
export const CONTROL_ACCESSIBILITY_SQL=checklistSql(checkId).replace("min(x->>'status')", "min(x->>'status'),jsonb_agg(x#>'{criticalEvidence,retainedEvidence,controlAccessibilityReceipt}')->0");

export const TRACKING_REVIEW_CHECKS=[
 ['sensitive_surfaces_third_party_tracking','Sensitive surfaces with 3rd party tracking'],
 ['cross_border_endpoint_review','Cross-border analytics / tracking endpoint review'],
] as const;
export const TRACKING_REVIEW_SQL=`jsonb_build_array(${TRACKING_REVIEW_CHECKS.map(([id])=>checklistSql(id)).join(',')})`;
export const TRACKING_REVIEW_SOURCE='persisted_tracking_review_extract/';
export const TRACKING_REVIEW_REF='generation_matched_tracking_reviews';
export const TRACKING_REVIEW_KEYS=TRACKING_REVIEW_CHECKS.flatMap(([id])=>[`sealed.checklist.${id}`,`sealed.verdict.${id}`]);

export function applyTrackingReviews(row:ProgressRow,value:unknown){
 if(value==null)return false;
 if(!Array.isArray(value)||value.length!==TRACKING_REVIEW_CHECKS.length)throw Error('Invalid tracking review receipt');
 let matched=false;
 for(const [i,[id,label]] of TRACKING_REVIEW_CHECKS.entries()){
  if(value[i]===null)continue;
  const parsed=receipt.safeParse(value[i]);
  if(!parsed.success)throw Error('Invalid persisted tracking review '+id);
  const [version,evidence,verdict]=parsed.data;
  const source=TRACKING_REVIEW_SOURCE+row.projectionVersion+'/'+version;
  for(const [kind,state,title] of [['checklist',evidence,label],['verdict',returnedState(verdict),label+' · returned verdict']]){
   const key=`sealed.${kind}.${id}`;
   const old=row.states[key];
   if(old!==undefined&&old!=='unavailable'){
    if(old!==state)throw Error('Conflicting persisted tracking review '+key);
   }else{
    row.states[key]=state!;
    (row.metricSources??={})[key]=source;
   }
   (row.retainedMetricLabels??={})[`${kind}.${id}`]=title!;
  }
  matched=true;
 }
 return matched;
}

export function isControlAccessibilityExtract(source:string|undefined){
 return source?.startsWith(sourcePrefix)===true;
}

/** The caller must first verify the immutable inventory and exact ready generation. */
export function applyControlAccessibility(row:ProgressRow,value:unknown){
 const parsed=receipt.safeParse(value);
 if(!parsed.success)return;
 const [version,evidence,verdict,detail]=parsed.data;
 const coverage=readControlAccessibilityDetail(detail);
 if(coverage){
  if(row.controlAccessibilityCoverage&&JSON.stringify(row.controlAccessibilityCoverage)!==JSON.stringify(coverage))throw Error('Conflicting control accessibility receipt');
  row.controlAccessibilityCoverage=coverage;
 }
 const values=[evidence,returnedState(verdict)];
 const source=`${sourcePrefix}${row.projectionVersion}/${version}`;
 for(const [index,key] of CONTROL_ACCESSIBILITY_KEYS.entries()){
  const next=values[index]!,old=row.states[key];
  if(old!==undefined&&old!=='unavailable'){
   if(old!==next)throw Error(`Conflicting persisted control accessibility: ${row.scanId}/${key}`);
   continue;
  }
  row.states[key]=next;
  (row.metricSources??={})[key]=source;
 }
 return true;
}
