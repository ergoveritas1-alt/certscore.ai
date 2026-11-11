import {hasPriorityCoverage,jsonbBytes} from './audit-progress-priority-evidence';
import {CHOICE_AUDIT_VERSION} from './audit-progress-choice';
import {choiceAuditSqlForTransport} from './audit-progress-choice';
import {botOriginWindowSql} from './audit-bot-origin';
import {OPT_OUT_EXTRACT_SQL,OPT_OUT_ASSESSMENT_JOIN_SQL} from './audit-progress-opt-out';
import {CONTROL_ACCESSIBILITY_SQL,TRACKING_REVIEW_SQL} from './audit-progress-control-accessibility';
import {auditSqlOverrideFits} from './audit-prod-db-bounded';
import {CALIFORNIA_REJECT_COVERAGE_SQL} from './audit-california-reject-coverage';
import {MAX_AUDIT_POLICY_PROVENANCE_BYTES} from '../../packages/certscore-contracts/src/audit-policy-provenance';

// ECS rejected an 8,174-byte compact override. Leave room for launch
// serialization before choosing among the existing query variants.
const DELTA_OVERRIDE_HEADROOM_BYTES = 192;
/** Pure offline query builder; never starts a task. */
export function buildAuditDeltaQuery(b:any,includeOperations:boolean,includePrivacyForm=false,includeControlAccessibility=false,includeCaliforniaReject=false,includeTechnicalCounts=false,includeTrackingReviews=false,includePolicyReceipt=false,includeComparison=false):string{
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
 ${includeComparison?`case when not o."isCanary" and p.report_projection_status='ready' and p.report_projection_payload#>>'{scan,id}'=s.id::text and octet_length((p.report_projection_payload#>'{runtimeArtifacts,auditComparison}')::text)<=512
 then p.report_projection_payload#>'{runtimeArtifacts,auditComparison}' end "auditComparison",`:''}
 ${OPT_OUT_EXTRACT_SQL} control_assessment,
 ${choiceAuditSqlForTransport(includeOperations,includeControlAccessibility||includeOperations)} choice_audit,
 ${includeControlAccessibility?`case when not o."isCanary" and p.report_projection_payload#>>'{scan,id}'=s.id::text then ${CONTROL_ACCESSIBILITY_SQL} end "controlAccessibility",`:''}
 ${includePrivacyForm ? `case when not o."isCanary" then p.report_projection_payload->>'auditPrivacyForm' end "auditPrivacyForm",` : ''}
 ${includeCaliforniaReject ? `${CALIFORNIA_REJECT_COVERAGE_SQL} "caReject",` : ''}
 ${includeTechnicalCounts ? `${technicalCountsSql()} "technicalCounts",` : ''}
 ${includeTrackingReviews ? `case when not o."isCanary" and p.report_projection_payload#>>'{scan,id}'=s.id::text then ${TRACKING_REVIEW_SQL} end "trackingReviews",` : ''}
 ${includePolicyReceipt ? policyReceiptSql : ''}
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

// This producer-only slot is validated at persistence and again on audit
// intake. Transport it separately so a full choice summary cannot evict it.
const policyReceipt="p.report_projection_payload->'auditPolicyProvenance'";
const policyReceiptSql=`case when not o."isCanary" and p.report_projection_status='ready' and octet_length((${policyReceipt})::text)<=${MAX_AUDIT_POLICY_PROVENANCE_BYTES} then ${policyReceipt} end "policyReceipt",`;

export function technicalCountsSql(){
 const fields=[
  ['siteIntegrity','{observation,links}'],
  ['cmsSecurity','{assessment,detections}','{assessment,matches}'],
 ];
 const sources=fields.map(([key],i)=>`a->'${key}' t${i}`).join(',');
 const values=fields.map(([, ...paths],i)=>{
  const ref=`t${i}`;
  const lengths=paths.map(path=>`jsonb_array_length(${ref}#>'${path}')`).join(',');
  const arrays=paths.map(path=>`jsonb_typeof(${ref}#>'${path}')='array'`).join(' and ');
  const catalogue=i===1?`${ref}#>>'{assessment,catalogueVersion}'`:null;
  const catalogueGuard=catalogue?` and length(${catalogue})<80`:'';
  return `case when ${ref} is null or ${ref}='null'::jsonb then to_jsonb('source_missing'::text)
   when ${ref}->>'verificationStatus' is distinct from 'verified' then to_jsonb('source_unverified'::text)
   when ${ref}->>'scanId' is distinct from s.id::text or ${ref}->>'sourceHash' is distinct from h then to_jsonb('source_binding_mismatch'::text)
   when length(${ref}->>'contractVersion')<80 and ${arrays}${catalogueGuard}
   then jsonb_build_array(${ref}->>'contractVersion',${lengths}${catalogue?','+catalogue:''})
   else to_jsonb('source_schema_incomplete'::text) end`;
 }).join(',');
 return `coalesce((select jsonb_build_array(${values}) from
  (select p.report_projection_payload->'runtimeArtifacts' a) v,
  lateral (select jsonb_path_query_array(p.report_projection_payload,'$.events[*] ? (@.eventType == "v2_lambda_result.received")') e) w,
  lateral (select ${sources},e#>>'{0,metadataJson,artifactMetadata,scanArtifactUri,sha256}' h) t
  where p.report_projection_status='ready' and not o."isCanary"
  and p.report_projection_payload#>>'{scan,id}'=s.id::text and e->1 is null and h~'^[0-9a-f]{64}$'),
  '["original_source_binding_unavailable","original_source_binding_unavailable"]'::jsonb)`;
}

export function planAuditDeltaQuery(b:any,marker:string){
 const privacyForm=b.includePrivacyFormReceipts===true;
 // Same-document control coverage is required alongside the existing receipts.
 // An oversized launch blocks acquisition instead of silently omitting it.
 const candidates=[
  {controlAccessibility:true},
 ].map(variant=>{
  const sql=buildAuditDeltaQuery(b,false,privacyForm,variant.controlAccessibility,true,true,true,true,true);
  const measured=auditSqlOverrideFits({marker,readOnly:true,sql});
  const planningLimitBytes=measured.limitBytes-DELTA_OVERRIDE_HEADROOM_BYTES;
  return {...variant,operations:false,policyReceipt:true,privacyForm,sql,override:{...measured,planningLimitBytes,fits:measured.bytes<=planningLimitBytes}};
 });
 return {selected:candidates.find(candidate=>candidate.override.fits)??candidates.at(-1)!,expanded:candidates[0]!.override};
}
/** Offline only. Preserve priority order and required columns; shrink the exact
 * pending prefix until the actual dates/container fit. Never start a task here. */
export function fitAuditDeltaQuery(b:any,marker:string){
 const planned:string[]=b.pendingRefreshIds??[];
 const initial=planAuditDeltaQuery(b,marker); // Validate all IDs before shrinking.
 for(let count=planned.length;count>=0;count--){
  const plan=count===planned.length?initial:planAuditDeltaQuery({...b,pendingRefreshIds:planned.slice(0,count)},marker);
  if(plan.selected.override.fits)return {...plan,pendingRefreshIds:planned.slice(0,count),deferredPendingIds:planned.slice(count),plannedPendingIds:planned};
 }
 throw Error('Required query exceeds planning cap even with zero pending IDs; no task started');
}
/** Current query contract only; historical manifests keep their original readable versions. */
export function assertCurrentPriorityExtraction(rows:any[]){
 for(const row of rows)if(['completed','completed_limited'].includes(row.status)){
  const summary=row.choice_audit;
  if(summary?.version!==CHOICE_AUDIT_VERSION||summary.availability!=='size_bound'&&!hasPriorityCoverage(summary.priorityEvidence)&&jsonbBytes({...summary,priorityEvidence:'size_bound'})<=8192)throw Error('Current completed-row query omitted v2 priority coverage diagnostics');
 }
}
