import { MAX_AUDIT_POLICY_PROVENANCE_BYTES, type AuditPolicyProvenanceBinding } from '../../packages/certscore-contracts/src/audit-policy-provenance';
import {optOutExecutionAssessmentSchema} from '../../packages/certscore-contracts/src/redhat-opt-out';
/** Audit-only summaries of persisted choices/findings. No capture, finding creation or rescoring. */
import {z} from 'zod';
import {broadOptOutAssessmentSchema} from '../../packages/certscore-contracts/src/broad-opt-out-assessment';
import {legacyOptOutExecutionOutcome,saleSharingOptOutEvidenceSchema,saleSharingOptOutLaneOutcomeSchema} from '../../packages/certscore-contracts/src/sale-sharing-opt-out';
import {OPT_OUT_DISPATCH_STATES,retainedOptOutDispatch} from '../../packages/certscore-contracts/src/privacy-capture-profile';
import {conditionalOptOutDecisionSchema,retainedConditionalOptOutDecision} from '../../packages/certscore-contracts/src/conditional-opt-out-decision';
import {PRIORITY_EVIDENCE_METRICS, priorityEvidenceSql, priorityEvidenceStates, priorityCoverageStates, withBoundedPriority, jsonbBytes} from './audit-progress-priority-evidence';
import {OPERATIONS_EVIDENCE_METRICS, operationsEvidenceFromRecord, operationsEvidenceStates} from './audit-progress-operations-evidence';
import {projectOptOutLaneOutcome} from '../../apps/web/server/scans/opt-out-lane-projection';
import type {ProgressRow,Metric} from './audit-progress';
export const LEGACY_CHOICE_AUDIT_VERSION='certscore.audit-choice-summary.v1';
export const CHOICE_AUDIT_VERSION='certscore.audit-choice-summary.v2';
const optOutOutcomeIds=['action_completion','choice_confirmation','post_confirmation_observation'] as const;
export const OPT_OUT_OUTCOME_METRIC_IDS=[...optOutOutcomeIds,'confirmation_basis','stop'].map(id=>'sealed.opt_out.'+id);
const hash=z.string().regex(/^[a-f0-9]{64}$/), code=z.string().regex(/^[a-zA-Z0-9_.:-]{1,160}$/);
const packetKeys=['contractVersion','policyVersion','scanId','status','provider','recipeVersion','actionCount','submitted','registration','before','after','observationWindowMs','captureComplete','truncated','limitations'] as const;
const packetPick=Object.fromEntries(packetKeys.map(k=>[k,true])) as Record<typeof packetKeys[number],true>;
const packetSchema=saleSharingOptOutEvidenceSchema.innerType().pick(packetPick);
const dispatchSchema=z.enum(OPT_OUT_DISPATCH_STATES);
const summarySchema=z.object({
 version:z.enum([LEGACY_CHOICE_AUDIT_VERSION,CHOICE_AUDIT_VERSION]),scanId:z.string().min(1),noGo:z.literal(false),
 configured:z.boolean().nullable(),reviewScanId:z.string().nullable(),reviewVersion:code.nullable(),
 reviewSourceHash:hash.nullable(),reviewDocumentUrl:z.string().url().nullable(),reviewVerification:z.string().nullable(),
 broad:z.unknown().nullable(),signalScope:code.nullable(),signalBasis:code.nullable(),
 policyMethodCount:z.number().int().min(0).max(32).nullable(),
 effectiveness:z.enum(['not_assessed','bounded_observation']).nullable(),
 packetVerification:z.string().nullable(),packet:z.unknown().nullable(),lane:z.unknown().nullable(),
 execution:z.unknown().optional(),packetSha256:hash.nullable().optional(),
 dispatch:z.unknown().optional(),conditional:z.unknown().optional(),priorityEvidence:z.unknown().optional(),operationsEvidence:z.unknown().optional(),
 findings:z.array(z.object({id:code,label:z.string().min(1).max(240),surfaced:z.boolean()})).max(64).nullable(),
}).strict();
export const CHOICE_METRICS:Metric[]=[
 ['coverage','Persisted opt-out/GPC summary availability'],['lane','Explicit opt-out worker outcome'],['lane_stop','Explicit opt-out worker limitation'],['configured','Explicit opt-out configured enablement'],
 ['conditional_control','First-layer opt-out control observed in verified source'],['legacy_eligible_control','Legacy opt-out control at an eligible action target'],['supported_route','Supported opt-out action route'],
 ['dispatch','Effective opt-out dispatch status'],['submission','Explicit opt-out submission'],['registration','Sale/sharing state confirmation'],['capture','Follow-up capture after sale/sharing state confirmation'],
 ['action_completion','Opt-out action completed'],['choice_confirmation','Recorded opt-out choice confirmation'],['confirmation_basis','Opt-out confirmation evidence'],['post_confirmation_observation','Tracking observation after confirmed choice'],
 ['dispatch_reason','Conditional opt-out dispatch or skip reason'],
 ['presence','Sale/sharing opt-out route or signal assessment'],['basis','Broader opt-out assessment basis'],
 ['scope','Broader opt-out inspection scope'],['signal_scope','Opt-out signal scope'],['signal_basis','Opt-out signal kind'],
 ['policy_methods','Retained policy opt-out methods'],['packet','Explicit opt-out evidence availability'],
 ['recipe','Explicit opt-out recipe selection'],['actions','Explicit opt-out action execution'],
 ['observation','Explicit opt-out observation outcome'],['effectiveness','Explicit opt-out effectiveness assessment'],
 ['stop','Explicit opt-out limitation reasons'],['findings_coverage','Canonical GPC/opt-out finding inventory'],
].map(([id,label])=>({id:`sealed.opt_out.${id}`,label:label!,group:'Opt-out',denominator:'Readable reportable scans; generation-matched persisted summary required; missing evidence remains unavailable',success:[]}));
const relevantFinding=(id:string)=>/gpc|gpp|^california_.*(?:opt_out|sale_sharing|post_reject|reject_potential)/.test(id);
const obj=(v:any)=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
const get=(v:any,path:string[])=>path.reduce((o,k)=>obj(o)[k],v)??null;
// The daily projection and the retained report reader share these fixed fields.
const summaryFields:Record<string,string[]>={
 scanId:['scan','id'],noGo:['assessment','scan','noGo'],configured:['scan','scanConfigJson','execution','v2DagLambda','saleSharingOptOutEnabled'],
 reviewScanId:['assessment','californiaPrivacyReview','scanId'],reviewVersion:['assessment','californiaPrivacyReview','contractVersion'],
 reviewSourceHash:['assessment','californiaPrivacyReview','sourceHash'],reviewDocumentUrl:['assessment','californiaPrivacyReview','documentUrl'],
 reviewVerification:['assessment','californiaPrivacyReview','verificationStatus'],broad:['assessment','californiaPrivacyReview','broadOptOutAssessment'],
 signalScope:['assessment','californiaPrivacyReview','optOutPresenceSignal','scope'],signalBasis:['assessment','californiaPrivacyReview','optOutPresenceSignal','basis'],
 lane:['runtimeArtifacts','saleSharingOptOutLaneOutcome'],effectiveness:['assessment','californiaPrivacyReview','optOutEffectiveness'],packetVerification:['assessment','californiaPrivacyReview','optOutObservation','verificationStatus'],
 execution:['assessment','californiaPrivacyReview','optOutExecution'],
 packetSha256:['assessment','californiaPrivacyReview','optOutObservation','sha256'],
};
const packetPath=['assessment','californiaPrivacyReview','optOutObservation','evidence'];
const methodsPath=['assessment','californiaPrivacyReview','policyChoiceMethods','methods'];
export function choiceSummaryFromRecord(record:any,original?:{manifest?:any;bundle?:any;bundleSource?:{sha256:string;sizeBytes:number}}){
 const a=record.snapshot?.consentControlAssessment??record.runtimeArtifacts?.consentControlAssessment??record.snapshot?.consent_control_assessment;
 const results=Array.isArray(record.events)?record.events.filter((e:any)=>e?.eventType==='v2_lambda_result.received'):[];
 const expected=results.length===1?results[0].metadataJson?.artifactMetadata?.scanArtifactUri:null;
 const bound=original?.bundleSource&&original.bundleSource.sha256===expected?.sha256&&original.bundleSource.sizeBytes===expected?.sizeBytes&&original.bundle?.scanId===record.scan?.id;
 const rawLane=saleSharingOptOutLaneOutcomeSchema.safeParse(original?.bundle?.saleSharingOptOutLaneOutcome).data;
 const originalLane=bound?projectOptOutLaneOutcome(original!.bundle):rawLane?{...rawLane,preActionStop:undefined}:undefined;
 const source={...record,assessment:a,runtimeArtifacts:{...record.runtimeArtifacts,...(originalLane?{saleSharingOptOutLaneOutcome:originalLane}:{})}};
 const packet=get(source,packetPath),methods=get(source,methodsPath),findings=record.canonicalReportProjection?.globalUnifiedFindings;
 const relevant=Array.isArray(findings)?findings.filter(f=>typeof f.unifiedFindingId==='string'&&relevantFinding(f.unifiedFindingId)):null;
 const verified=results.length===1?dispatchSchema.safeParse(results[0].metadataJson?.artifactVerification?.optOutDispatch):null;
 const conditional=original?.manifest?retainedConditionalOptOutDecision(original.manifest,get(source,['scan','id']),originalLane):undefined;
 const eventConditional=results.length===1?conditionalOptOutDecisionSchema.safeParse(results[0].metadataJson?.artifactVerification?.conditionalOptOutDecision):undefined;
 if(conditional&&eventConditional?.success&&JSON.stringify(conditional)!==JSON.stringify(eventConditional.data))throw Error('Conflicting verified conditional opt-out decision');
 const retained=original?retainedOptOutDispatch(original.manifest?.privacyCaptureProfile,originalLane):undefined;
 if(retained&&verified?.success&&retained!==verified.data)throw Error('Conflicting verified opt-out dispatch status');
 const base={version:CHOICE_AUDIT_VERSION,...Object.fromEntries(Object.entries(summaryFields).map(([k,p])=>[k,get(source,p)])),
  conditional:conditional??(eventConditional?.success?eventConditional.data:null),
  dispatch:retained??(verified?.success?verified.data:null),
  policyMethodCount:Array.isArray(methods)?methods.length:null,
  packet:packet?Object.fromEntries(packetKeys.map(k=>[k,get(packet,[k])])):null,
  findings:relevant&&relevant.length<=64?relevant.map(f=>({id:f.unifiedFindingId,label:f.title,surfaced:f.surfacingDecision?.reportable===true&&f.presentationDecision?.status==='surface'})):null};
 const operationsEvidence=operationsEvidenceFromRecord(record,results.length===1?results[0]:null);
 const preferred=withBoundedPriority(base,record);
 const combined={...preferred,operationsEvidence};
 return operationsEvidence&&jsonbBytes(combined)<=8192&&!preferred.availability?combined:preferred;
}
const sqlPath=(p:string[])=>{
 const assessment=p[0]==='assessment';
 const review=assessment&&p[1]==='californiaPrivacyReview';
 const root=review?'j.ca':assessment?'a.value':'p.report_projection_payload';
 return `${root}#>'{${p.slice(review?2:assessment?1:0).join(',')}}'`;
};
// Nested receipts keep their exact shape so unknown keys fail closed and an
// explicitly null timestamp remains distinguishable from an omitted field.
const boundedReceiptSql=(value:string,keys:string[])=>`case when jsonb_typeof(${value})='object' then
 case when octet_length((${value})::text)<=2048 and ((${value}) - array[${keys.map(k=>`'${k}'`).join(',')}])='{}'::jsonb then ${value} end end`;
const conditionalPath="e#>'{metadataJson,artifactVerification,conditionalOptOutDecision}'";
const dispatchPath="e#>>'{metadataJson,artifactVerification,optOutDispatch}'";
const dispatchReceiptSql=()=>`select
 case when count(*)=1 then max(case when ${dispatchPath} in (${OPT_OUT_DISPATCH_STATES.map(s=>`'${s}'`).join(',')}) then ${dispatchPath} end) end as dispatch,
 case when count(*)=1 then max((${boundedReceiptSql(conditionalPath,Object.keys(conditionalOptOutDecisionSchema.innerType().shape))})::text)::jsonb end as conditional
 from jsonb_array_elements(case when jsonb_typeof(p.report_projection_payload->'events')='array' then p.report_projection_payload->'events' else '[]'::jsonb end) e
 where e->>'eventType'='v2_lambda_result.received'`;
const choiceAuditSql=`jsonb_build_object('version','${CHOICE_AUDIT_VERSION}',
 ${Object.entries(summaryFields).map(([key,field])=>{
  const value=sqlPath(field);
  if(key==='execution')return `'${key}',${boundedReceiptSql(value,Object.keys(optOutExecutionAssessmentSchema.shape))}`;
  if(key==='packetSha256')return `'${key}',case when jsonb_typeof(${value})='string' and (${value})#>>'{}' ~ '^[a-f0-9]{64}$' then ${value} end`;
  return `'${key}',${value}`;
 }).join(',\n ')},
 'dispatch',r1.dispatch,
 'conditional',r1.conditional,
 'policyMethodCount',case when jsonb_typeof(${sqlPath(methodsPath)})='array' then jsonb_array_length(${sqlPath(methodsPath)}) else null end,
 'packet',case when jsonb_typeof(${sqlPath(packetPath)})='object' then jsonb_build_object(${packetKeys.map(k=>`'${k}',${sqlPath([...packetPath,k])}`).join(',')}) else null end,
 'findings',case when jsonb_typeof(p.report_projection_payload#>'{canonicalReportProjection,globalUnifiedFindings}')='array' then
 (select case when count(*)<=64 then coalesce(jsonb_agg(jsonb_build_object('id',f->'unifiedFindingId','label',f->'title','surfaced',coalesce(f#>'{surfacingDecision,reportable}'='true'::jsonb and f#>>'{presentationDecision,status}'='surface',false))), '[]'::jsonb) else null end
 from jsonb_array_elements(p.report_projection_payload#>'{canonicalReportProjection,globalUnifiedFindings}') f
 where f->>'unifiedFindingId' ~ 'gpc|gpp|^california_.*(opt_out|sale_sharing|post_reject|reject_potential)') else null end)`;

// A fixed per-row transport cap keeps the existing one-query output bounded.
// Short SQL aliases preserve the reserved launch headroom for 100 pending IDs.
export function choiceAuditSqlForTransport(includeOperations:boolean,includeCmpBlocker=includeOperations){
 const suffix=includeOperations?', o1':'';
 // Only the private fixed-shape receipt may leave the ready payload.
 const policyColumn=includeOperations?`,(select case when p.report_projection_status='ready'
  and jsonb_typeof(v)='object' and jsonb_typeof(v->'binding')='object'
  and octet_length(v::text)<=${MAX_AUDIT_POLICY_PROVENANCE_BYTES} then
  case when v-array['version','binding','bundle','fetch','owner','text']='{}'::jsonb
   and (v->'binding')-array['scanId','createdAt','generation','sourceHash']='{}'::jsonb then v end end
  from (select p.report_projection_payload->'auditPolicyProvenance' v) q) as o1`:'';
 return `(with bc as materialized (
 select ${choiceAuditSql} as s, ${priorityEvidenceSql(includeCmpBlocker)} as j${policyColumn} from (${dispatchReceiptSql()}) r1,
 lateral (select a.value->'californiaPrivacyReview' ca) j
 ), bo as materialized (
 select s, octet_length(s::text)>8192 as x,
 case when octet_length((s || jsonb_build_object('priorityEvidence',j))::text)<=8192
 then s || jsonb_build_object('priorityEvidence',j)
 else s || jsonb_build_object('priorityEvidence',j || jsonb_build_object('accept',null,'reject',null,'cmp',null,'transport','size_bound')) end as y${suffix}
 from bc
 ) select case
 when x then jsonb_build_object('version','${CHOICE_AUDIT_VERSION}','availability','size_bound')
 when octet_length(y::text)>8192 then case when octet_length((s || jsonb_build_object('priorityEvidence','size_bound'))::text)<=8192 then s || jsonb_build_object('priorityEvidence','size_bound') else s end
 ${includeOperations?`when o1 is not null
 and octet_length((y || jsonb_build_object('operationsEvidence',o1))::text)<=8192
 then y || jsonb_build_object('operationsEvidence',o1)`:''}
 else y end from bo)`;
}
export const CHOICE_AUDIT_SQL=choiceAuditSqlForTransport(true);

export function choiceSummaryAudit(value:unknown,scanId:string,policyBinding?:AuditPolicyProvenanceBinding){
 const measurements:Record<string,number>={};
 const states:Record<string,string>={},scopes:Record<string,string>={},labels:Record<string,string>={};
 if(Buffer.byteLength(JSON.stringify(value)??'null')>8192)return {states,scopes,labels,measurements};
 const parsed=summarySchema.safeParse(value);
 if(!parsed.success||parsed.data.scanId!==scanId)return {states,scopes,labels,measurements};
 const s=parsed.data;
 if(s.version===CHOICE_AUDIT_VERSION){
  for(const [key,result] of Object.entries({...priorityEvidenceStates(s.priorityEvidence,scanId),...priorityCoverageStates(s.priorityEvidence,scanId),...operationsEvidenceStates(s.operationsEvidence,scanId,policyBinding)})){
   states[key]=result.value;
   scopes[key]=`${s.version}/${result.scope}`;
  }
 }
 const set=(id:string,v:string,scope='summary')=>{const key=`sealed.opt_out.${id}`;states[key]=v;scopes[key]=`${s.version}/${scope}`;};
 set('coverage','available');
 if(s.configured!==null)set('configured',s.configured?'enabled':'disabled');
 const lane=saleSharingOptOutLaneOutcomeSchema.safeParse(s.lane);
 if(lane.success){set('lane',lane.data.status,'sale_sharing_lane_outcome.v1');set('lane_stop',lane.data.limitationCode??'none_retained','sale_sharing_lane_outcome.v1');}
 const dispatch=dispatchSchema.safeParse(s.dispatch);
 const conditional=conditionalOptOutDecisionSchema.safeParse(s.conditional);
 if(dispatch.success)set('dispatch',['excluded_by_profile','conditional_no_dispatch_recorded'].includes(dispatch.data)&&lane.success?'profile_dispatch_conflict':dispatch.data,'effective_dispatch.v1');
 else if(lane.success)set('dispatch','dispatch_recorded','sale_sharing_lane_outcome.v1');
 if(s.lane==null&&s.packet===null&&s.execution==null&&dispatch.success&&
   !(conditional.success&&conditional.data.scanId===scanId&&conditional.data.status==='dispatched')&&
   (dispatch.data==='conditional_no_dispatch_recorded'||dispatch.data==='excluded_by_profile')){
  const disposition=dispatch.data==='excluded_by_profile'?'excluded_by_profile':'not_dispatched';
  for(const outcome of optOutOutcomeIds)set(outcome,disposition,'effective_dispatch.v1');
 }
 if(lane.success&&lane.data.status==='joined'&&lane.data.preActionStop&&s.packet===null&&s.execution==null&&
   (!dispatch.success||dispatch.data==='dispatch_recorded')){
  const scope='verified_pre_action_lane.v1';
  set('action_completion','not_completed',scope);set('choice_confirmation','not_attempted',scope);
  set('post_confirmation_observation','not_measured',scope);set('stop',lane.data.preActionStop,scope);
 }
 if(conditional.success&&conditional.data.scanId===scanId&&conditional.data.status!=='pending'){
  const c=conditional.data;
  const consistent=(c.status==='dispatched'?s.dispatch==='dispatch_recorded':s.dispatch==='conditional_no_dispatch_recorded')&&!(c.status==='skipped'&&lane.success);
  if(consistent){
   const scope=c.version;
   if(c.controlObserved!==undefined){
    const current=c.version==='conditional_opt_out_dispatch.v3';
    set(current?'conditional_control':'legacy_eligible_control',c.controlObserved?'observed':current?'not_observed_in_source':'not_observed_at_eligible_target',scope);
   }
   if(c.supportedRoute!==undefined)set('supported_route',c.supportedRoute?'supported':'unsupported_or_unverified',scope);
   set('dispatch_reason',c.reason,scope);
   if(c.remainingTimeMs!==undefined){measurements['sealed.opt_out.decision_remaining_ms']=c.remainingTimeMs;scopes['sealed.opt_out.decision_remaining_ms']=scope;}
   if(c.status==='dispatched'&&c.decidedAtMs!==undefined){measurements['sealed.opt_out.dispatch_elapsed_ms']=c.decidedAtMs;scopes['sealed.opt_out.dispatch_elapsed_ms']=scope;}
  }
 }

 const reviewBound=s.reviewScanId===scanId&&s.reviewSourceHash&&s.reviewDocumentUrl&&s.reviewVerification==='verified';
 if(reviewBound){
  const broad=broadOptOutAssessmentSchema.safeParse(s.broad);
  if(broad.success&&broad.data.scanId===scanId&&broad.data.sourceHash===s.reviewSourceHash&&broad.data.documentUrl===s.reviewDocumentUrl){
   set('presence',broad.data.state,broad.data.version);set('basis',broad.data.basis,broad.data.version);
   set('scope','scope' in broad.data&&broad.data.scope?broad.data.scope:'scope_not_retained',broad.data.version);
  }
  if(s.signalScope)set('signal_scope',s.signalScope,s.reviewVersion!);
  if(s.signalBasis)set('signal_basis',s.signalBasis,s.reviewVersion!);
  if(s.policyMethodCount!==null)set('policy_methods',s.policyMethodCount>0?'methods_retained':'no_methods_retained',s.reviewVersion!);
  if(s.effectiveness)set('effectiveness',s.effectiveness,s.reviewVersion!);
  set('packet',s.packet===null?'no_packet_retained':'invalid_or_unbound',s.reviewVersion!);
  const packet=packetSchema.safeParse(s.packet);
  if(packet.success&&s.packetVerification==='verified'&&packet.data.scanId===scanId){
   const p=packet.data,confirmed=p.registration==='confirmed';
   const consistent=(!p.submitted||p.actionCount>0&&p.registration!=='not_attempted')&&
    (!confirmed||p.submitted&&p.before&&p.after&&p.before.sectionId===p.after.sectionId&&p.after.sale===1&&p.after.sharing===1&&(p.before.sale===2||p.before.sharing===2))&&
    (p.status!=='complete'||confirmed&&p.captureComplete&&!p.truncated&&p.observationWindowMs===500&&!p.limitations.length);
   if(consistent){const scope=`${p.contractVersion}/${p.policyVersion}/${p.recipeVersion??'no_recipe'}`;
    set('packet','retained',scope);set('capture',p.status==='complete'&&p.captureComplete?'complete':p.registration==='confirmed'?'limited':'not_confirmed',scope);set('recipe',p.recipeVersion?'selected':'not_selected',scope);
    set('actions',p.actionCount>0?'action_recorded':'no_action_recorded',scope);set('submission',p.submitted?'submitted':'not_submitted',scope);
    const legacy=p.contractVersion==='certscore.sale-sharing-opt-out-evidence.v4'?undefined:legacyOptOutExecutionOutcome(p);
    const execution=optOutExecutionAssessmentSchema.safeParse(s.execution);
    if(execution.success&&s.version===CHOICE_AUDIT_VERSION&&execution.data.scanId===scanId&&execution.data.packetSha256===s.packetSha256&&execution.data.actionCompleted===p.submitted&&
      (legacy?execution.data.confirmationBasis===legacy.confirmationBasis&&execution.data.choiceConfirmation===legacy.choiceConfirmation&&execution.data.postConfirmationObservation===legacy.postConfirmationObservation&&execution.data.observationWindowMs===legacy.observationWindowMs:
       execution.data.confirmationBasis==='cmp_explicit_choice'&&(p.submitted?['confirmed_terminal','unconfirmed'].includes(execution.data.choiceConfirmation):execution.data.choiceConfirmation==='not_attempted')&&execution.data.postConfirmationObservation==='not_measured'&&execution.data.observationWindowMs===0)){
      const e=execution.data;set('action_completion',e.actionCompleted?'completed':'not_completed',e.version);set('choice_confirmation',e.choiceConfirmation,e.version);
      if(e.choiceConfirmation==='confirmed_initial'||e.choiceConfirmation==='confirmed_terminal')set('confirmation_basis',e.confirmationBasis,e.version);
      set('post_confirmation_observation',e.postConfirmationObservation,e.version);
    }else if(s.execution==null&&legacy){
      const basis=`${scope}/legacy_packet_outcome.v1`;
      set('action_completion',legacy.actionCompleted?'completed':'not_completed',basis);
      set('choice_confirmation',legacy.choiceConfirmation,basis);
      if(legacy.choiceConfirmation==='confirmed_initial')set('confirmation_basis',legacy.confirmationBasis,basis);
      set('post_confirmation_observation',legacy.postConfirmationObservation,basis);
    }
    set('registration',p.registration,scope);set('observation',p.status,scope);set('stop',p.limitations.length?[...new Set(p.limitations)].sort().join('+'):'none_retained',scope);
   }
  }
 }
 if(s.findings){
  if(new Set(s.findings.map(f=>f.id)).size!==s.findings.length)return {states,scopes,labels,measurements};
  set('findings_coverage','available');
  for(const f of s.findings){const key=`sealed.choice_finding.${f.id}`;states[key]=f.surfaced?'surfaced':'not_surfaced';scopes[key]=s.version;labels[key]=f.label;}
 }
 return {states,scopes,labels,measurements};
}
export function applyChoiceSummary(row:ProgressRow,value:unknown,source:string){
 if(!row.reportable)return;
 const policyBinding=row.projectionVersion==='scan-report-projection-v27'&&row.publicProjectionSourceHash
  ? {scanId:row.scanId,createdAt:row.createdAt,generation:row.projectionVersion,sourceHash:row.publicProjectionSourceHash} as const
  : undefined;
 const result=choiceSummaryAudit(value,row.scanId,policyBinding);
 row.metricSources??={};row.retainedMetricLabels??={};row.measurements??={};
 for(const [key,value] of Object.entries(result.measurements)){
  if(row.measurements[key]!==undefined&&row.measurements[key]!==value)throw Error(`Conflicting opt-out timing: ${key}`);
  row.measurements[key]=value;row.metricSources[key]=`${source}/${result.scopes[key]}`;
 }
 for(const [id,v] of Object.entries(result.states)){
  // Transport diagnostics describe the query, not a replay of a full local record.
  if(id.startsWith('sealed.priority_evidence.')&&source.startsWith('persisted_report_choice_summary/'))continue;
  if(row.states[id]!==undefined&&row.states[id]!=='unavailable'&&row.states[id]!==v)throw Error(`Conflicting persisted choice summary: ${id}`);
  if(row.states[id]!==undefined&&row.states[id]!=='unavailable')continue;
  row.states[id]=v;row.metricSources[id]=`${source}/${result.scopes[id]}`;
 }
 Object.assign(row.retainedMetricLabels,result.labels);
}
export function choiceMetricRegistry(rows:ProgressRow[]):Metric[]{
 const ids=new Map<string,string>();for(const r of rows)for(const [k,v] of Object.entries(r.retainedMetricLabels??{}))if(k.startsWith('sealed.choice_finding.'))ids.set(k,v);
 // Only an explicitly retained complete canonical subset can establish a missing ID.
 for(const row of rows)if(row.states['sealed.opt_out.findings_coverage']==='available')for(const id of ids.keys()){
  row.states[id]??='not_returned';row.metricSources??={};row.metricSources[id]??=row.metricSources['sealed.opt_out.findings_coverage']!;
 }
 return [...CHOICE_METRICS,...PRIORITY_EVIDENCE_METRICS,...OPERATIONS_EVIDENCE_METRICS,...[...ids].sort(([a],[b])=>a.localeCompare(b)).map(([id,label])=>({id,label:`${id==='sealed.choice_finding.gpc_response'?'GPC response assessment':label} · canonical record`,group:'Canonical GPC & opt-out records',denominator:'Readable reportable scans; exact persisted canonical IDs, not a risk or failure rate',success:[]}))];
}
