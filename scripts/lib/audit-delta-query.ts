import {hasPriorityCoverage,jsonbBytes} from './audit-progress-priority-evidence';
import {CHOICE_AUDIT_VERSION} from './audit-progress-choice';
import {choiceAuditSqlForTransport} from './audit-progress-choice';
import {botOriginWindowSql} from './audit-bot-origin';
import {OPT_OUT_EXTRACT_SQL,OPT_OUT_ASSESSMENT_JOIN_SQL} from './audit-progress-opt-out';
import {CONTROL_ACCESSIBILITY_SQL} from './audit-progress-control-accessibility';
import {auditSqlOverrideFits} from './audit-prod-db-bounded';
/** Pure offline query builder; never starts a task. */
export function buildAuditDeltaQuery(b:any,includeOperations:boolean,includePrivacyForm=false,includeControlAccessibility=false):string{
const origin=botOriginWindowSql(b.overlapStartUtc,b.windowEndUtc);
const pending:string[]=b.pendingRefreshIds??[];
if(!Array.isArray(pending)||pending.length>100||new Set(pending).size!==pending.length||pending.some(id=>!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id)))throw Error('At most 100 distinct pending scan UUIDs required');
function innerSql(value:string){
 const marker='select row_to_json(result) from (';
 if(!value.includes(marker)||!value.includes(') result;'))throw Error('Unsupported canonical origin SQL');
 return value.slice(value.indexOf(marker)+marker.length,value.lastIndexOf(') result;')).replace(/order by s.id(?: limit 5001)?\s*$/,'');
}

// Transport UUIDs as exact 16-byte values to preserve all 100 targets within
// the ECS override cap. Resolve origin exactly once for each selected ID.
const packed=Buffer.concat(pending.map(id=>Buffer.from(id.replaceAll('-',''),'hex'))).toString('base64');
const where=/where s\.created_at[^\n]+/;
const range=innerSql(origin).match(where)?.[0];if(!range)throw Error('Missing canonical overlap predicate');
const inner=innerSql(origin).replace(where,'where s.id in (select id from selected)');
const targets=pending.length?` union select encode(substring(decode('${packed}','base64') from i for 16),'hex')::uuid from generate_series(1,${pending.length*16},16) i`:'';
const sql=`set statement_timeout='45s';
with selected as materialized (select s.id from public.scans s ${range}${targets}),origins as materialized (${inner})
select row_to_json(r) from (
 select o.*,s.created_at,s.updated_at,s.status,d.hostname,
 s.scan_config_json->>'scanFrom' scan_from,
 p.report_projection_source_hash projection_source_hash,
 p.report_projection_payload_sha256 projection_payload_sha256,
 p.report_projection_version projection_version,p.report_projection_status projection_status,
 ${OPT_OUT_EXTRACT_SQL} control_assessment,
 ${choiceAuditSqlForTransport(includeOperations,includeControlAccessibility||includeOperations)} choice_audit,
 ${includeControlAccessibility?`case when not o."isCanary" and p.report_projection_payload#>>'{scan,id}'=s.id::text then ${CONTROL_ACCESSIBILITY_SQL} end "controlAccessibility",`:''}
 ${includePrivacyForm ? `case when not o."isCanary" then p.report_projection_payload->>'auditPrivacyForm' end "auditPrivacyForm",` : ''}
 count(*) over() cohort_total
 from origins o join public.scans s on s.id=o."scanId"
 left join public.domains d on d.id=s.domain_id
 left join public.scan_snapshots p on p.scan_id=s.id
 ${OPT_OUT_ASSESSMENT_JOIN_SQL}
 where o."isMacMini" is true
 order by s.created_at,s.id limit 5001
) r;`;
// Strip layout around SQL punctuation and collapse other whitespace. Quoted
// literals and identifiers are matched first, so their bytes stay intact.
return sql.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|\s*[(),]\s*|\s+/g,
 token=>token.trim() || ' ').trim();
}

export function planAuditDeltaQuery(b:any,marker:string){
 const privacyForm=b.includePrivacyFormReceipts===true;
 // Prefer both optional sources, then the control-specific assessment. Keep
 // paired CMP blockers in either variant and preserve the required core.
 const candidates=[
  {operations:true,controlAccessibility:true},
  {operations:false,controlAccessibility:true},
  {operations:true,controlAccessibility:false},
  {operations:false,controlAccessibility:false},
 ].map(variant=>{
  const sql=buildAuditDeltaQuery(b,variant.operations,privacyForm,variant.controlAccessibility);
  return {...variant,privacyForm,sql,override:auditSqlOverrideFits({marker,readOnly:true,sql})};
 });
 return {selected:candidates.find(candidate=>candidate.override.fits)??candidates.at(-1)!,expanded:candidates[0]!.override};
}
/** Current query contract only; historical manifests keep their original readable versions. */
export function assertCurrentPriorityExtraction(rows:any[]){
 for(const row of rows)if(['completed','completed_limited'].includes(row.status)){
  const summary=row.choice_audit;
  if(summary?.version!==CHOICE_AUDIT_VERSION||summary.availability!=='size_bound'&&!hasPriorityCoverage(summary.priorityEvidence)&&jsonbBytes({...summary,priorityEvidence:'size_bound'})<=8192)throw Error('Current completed-row query omitted v2 priority coverage diagnostics');
 }
}
