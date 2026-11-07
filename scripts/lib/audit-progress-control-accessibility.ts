import {z} from 'zod';
import type {Metric,ProgressRow} from './audit-progress';
import {returnedState} from './audit-progress-contracts';

const checkId='accessibility_consent_controls';
const projectionVersion='persisted-canonical-report-projection-v7';
export const CONTROL_ACCESSIBILITY_KEYS=[`sealed.checklist.${checkId}`,`sealed.verdict.${checkId}`] as const;
const sourcePrefix='persisted_control_accessibility_extract/';
const receipt=z.tuple([
 z.literal(projectionVersion),
 z.enum(['observed','not_observed','not_testable','not_applicable']),
 z.enum(['Observed','No match found','Not confirmed','Not observed','Not testable','Gap observed','Review signal','Insufficient evidence','Out of scope']),
]);

export const CONTROL_ACCESSIBILITY_METRICS:Metric[]=[
 {id:`checklist.${checkId}`,label:'Accessibility of privacy/consent controls',group:'Accessibility',denominator:'Readable reportable scans; matched canonical assessment required',success:[]},
 {id:`verdict.${checkId}`,label:'Accessibility of privacy/consent controls · returned verdict',group:'Accessibility',denominator:'Readable reportable scans; matched canonical verdict required',success:[]},
];

// Read only the exact persisted row and its version. A duplicate is ambiguous,
// even when both copies have identical values.
export const CONTROL_ACCESSIBILITY_SQL=`(select case when count(*)=1 then jsonb_build_array(
 left(p.report_projection_payload#>>'{canonicalReportProjection,artifactVersion}',48),
 min(left(x->>'evidenceState',24)), min(left(x->>'status',24))) end
 from jsonb_path_query(p.report_projection_payload,'strict $.canonicalReportProjection.checklistRows[*]?(@.id=="${checkId}")','{}',true) x
 where p.report_projection_status='ready')`;

export function isControlAccessibilityExtract(source:string|undefined){
 return source?.startsWith(sourcePrefix)===true;
}

/** The caller must first verify the immutable inventory and exact ready generation. */
export function applyControlAccessibility(row:ProgressRow,value:unknown){
 const parsed=receipt.safeParse(value);
 if(!parsed.success)return;
 const [version,evidence,verdict]=parsed.data;
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
