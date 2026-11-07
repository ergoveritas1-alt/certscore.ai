/** Current dashboard presentation only. Original contracts, rows and historical CSVs remain lossless. */
import {CATALOG_VIEW_BINDINGS} from './audit-evidence-catalog';
import {MASTER_CATALOG,masterFieldForLegacy} from './audit-evidence-master-catalog';
import {groupedProgressEntries} from './audit-progress-table';
import {isDeepStrictEqual} from 'node:util';
import {TOPIC_ROWS,type Metric,type ProgressRow} from './audit-progress';

export const RETIRED_TABLE_MEASURES:Record<string,{reason:string;replacements:string[]}>={
 policy_fetch:{reason:'Public export never supplies sealed policy-fetch receipts.',replacements:['sealed.policy_fetch','sealed.operations.policy_fetch']},
 policy_owner:{reason:'Public export never supplies sealed policy-ownership receipts.',replacements:['sealed.policy_owner','sealed.operations.policy_owner']},
 policy_full_text:{reason:'Public export never supplies local full-text verification.',replacements:['sealed.policy_full_text','sealed.operations.policy_text_receipt']},
 cmp_dispatch:{reason:'Public export never supplies CMP worker dispatch receipts.',replacements:['sealed.cmp_dispatch','sealed.operations.cmp_coordinator']},
 publication:{reason:'Public export never supplies the independent sealed publication record.',replacements:['sealed.publication']},
 'detail.sealed.site_integrity':{reason:'Sealed-only projection availability was duplicated into an unsupported public slot.',replacements:['sealed.detail.sealed.site_integrity']},
 'detail.sealed.technology':{reason:'Sealed-only projection availability was duplicated into an unsupported public slot.',replacements:['sealed.detail.sealed.technology']},
 'detail.sealed.relationships':{reason:'Sealed-only projection availability was duplicated into an unsupported public slot.',replacements:['sealed.detail.sealed.relationships']},
 'detail.sealed.form_destinations':{reason:'Unsupported public projection slot; typed destination trace and its event count are the meaningful measures.',replacements:['sealed.detail.sealed.form_destinations','form.events']},
};
type Link={recordType:string;recordLabel:string;masterFieldIds:string[];relationship:'direct_field'|'source_variant'|'assessment_context'|'inventory_identity';basis:string};
const records=new Map(MASTER_CATALOG.records.map(r=>[r.id,r]));
function record(id:string,basis:string,relationship:Link['relationship']='assessment_context'):Link{
 const r=records.get(id);if(!r)throw Error('Unknown canonical record '+id);
 return {recordType:id,recordLabel:r.title,masterFieldIds:[],relationship,basis};
}
function field(legacyId:string,basis:string,relationship:Link['relationship']='source_variant'):Link{
 const f=masterFieldForLegacy(legacyId);return {...record(f.recordType,basis,relationship),masterFieldIds:[f.id]};
}
const extras:Record<string,[string,string]>={
 cmp_dispatch:['audit.acquisition_receipt','Persisted inventory worker state, distinct from coordinator dispatch.'],
 gpc_path:['gpc.response_assessment','Observation-path availability; not the response assessment verdict.'],
 gpc_finding:['privacy.canonical_choice_result','Aggregate result-record presence; public list and persisted canonical inventory remain distinct.'],
 'accessibility.results':['accessibility.audit','Availability of returned rule-result counts.'],
 'accessibility.review':['accessibility.audit','Manual-review count presence; not failed-rule count.'],
 'detail.gpc.paired_collection':['gpc.behavioral_pair','Successful-collection sample availability in the matched window.'],
 'detail.gpc.paired_identifiers':['gpc.behavioral_pair','Identifier sample availability and proof scope in the matched window.'],
 'detail.gpc.session_collection':['gpc.full_visit_activity','Full-visit advertising collection availability; separate from early paired samples.'],
 'detail.gpc.semantic_probe':['gpc.cmp_checkpoint','Semantic probe status, distinct from readiness and receipt.'],
 'detail.gpc.acknowledgment':['gpc.cmp_checkpoint','Retained acknowledgment; not opt-out state or honoring.'],
 'detail.gpc.sale':['gpc.cmp_checkpoint','Single checkpoint sale setting; not paired transition.'],
 'detail.gpc.sharing':['gpc.cmp_checkpoint','Single checkpoint sharing setting; not paired transition.'],
 'detail.gpc.activity_comparison':['gpc.behavioral_pair','Returned comparison status; not inferred causation.'],
 'detail.forms.count':['collection.capture','Count availability, distinct from returned form count.'],
 'detail.inventory.cookies':['tracking.cookie_inventory','Returned cookie inventory cap/completeness.'],
 'detail.inventory.vendors':['tracking.vendor_inventory','Returned vendor inventory cap/completeness.'],
 'detail.inventory.policy':['policy.source_receipt','Returned policy inventory cap/completeness.'],
 'detail.navigation.host':['page.context','Navigation host relationship, not evidence of a target defect.'],
 'detail.sealed.site_integrity':['integrity.finding','Bound site-integrity projection availability.'],
 'detail.sealed.technology':['technology.detection','Bound technology projection availability.'],
 'detail.sealed.relationships':['tracking.graph_receipt','Bound graph projection availability.'],
 'selection.status':['audit.cohort_receipt','ID-only status; never detailed report eligibility.'],
 'opt_out.coverage':['audit.measurement_series','Version-qualified persisted choice-summary coverage.'],
 'opt_out.conditional_control':['privacy.control_observation','Verified scheduling control observation; distinct from public and persisted control states.'],
 'opt_out.legacy_eligible_control':['privacy.control_observation','Legacy eligible control selection; not a current action or visibility result.'],
 'opt_out.supported_route':['privacy.optout_route','Supported action route, not successful dispatch.'],
 'opt_out.capture':['privacy.optout_outcome','Follow-up capture status; distinct from choice confirmation.'],
 'opt_out.action_completion':['privacy.optout_attempt','Completed action assessment, not dispatch or semantic outcome.'],
 'opt_out.stop':['privacy.optout_attempt','Explicit limitation reasons; absence is not successful completion.'],
 'opt_out.findings_coverage':['audit.canonical_inventory','Exact canonical choice-result inventory coverage.'],
 'opt_out.decision_remaining_ms':['privacy.optout_attempt','Remaining budget at verified dispatch decision.'],
 'opt_out.dispatch_elapsed_ms':['privacy.optout_attempt','Elapsed time to dispatch; only actual dispatches qualify.'],
 'operations.cmp_coordinator':['audit.acquisition_receipt','CMP coordinator receipt; not worker completion.'],
};
const checklistConcepts:Record<string,string>={
 accessibility_consent_controls:'accessibility.audit',advertising_retargeting_vendor_signal_observed:'tracking.vendor_inventory',analytics_vendor_observed:'tracking.vendor_inventory',
 consent_choice_quality:'consent.choice_execution',cross_border_endpoint_review:'tracking.check_assessment',preference_withdrawal_control:'privacy.control_observation',
 public_collection_surfaces:'collection.capture',retargeting_behavioral_advertising_signal_observed:'tracking.vendor_inventory',sensitive_surfaces_third_party_tracking:'tracking.check_assessment',
 accept_consent_control:'privacy.control_observation',options_settings_preferences_control:'privacy.control_observation',reject_all_path_availability:'privacy.control_observation',
 cmp_framework_signal_observed:'cmp.identity',consent_surface_observed:'cmp.criterion_assessment',consent_optional_defaults_on:'cmp.default_preference',
 consent_browsing_as_consent:'consent.choice_execution',post_reject_tracking_reduction:'consent.post_choice_capture',pre_consent_cookies_storage:'tracking.storage_observation',
};
const topicChecks:Record<string,string>={controller_contact_disclosure:'controller_contact',processing_purposes_disclosure:'processing_purposes',legal_basis_disclosure_observed:'legal_basis',recipients_vendor_categories_disclosure:'recipients_or_vendor_categories',retention_disclosure_observed:'data_retention',data_subject_rights_disclosure:'data_subject_rights',international_transfers_disclosure:'international_transfers',dpo_contact_point_disclosure:'dpo_contact',supervisory_authority_complaint_disclosure:'supervisory_authority',automated_decision_making_profiling_disclosure:'automated_decision_making_or_profiling'};
export function auditMeasureLinks(id:string,kind:string):Link[]{
 if(id.startsWith('sealed.priority_evidence.'))return [field('operations.series.summary_coverage','Priority delivery coverage for '+id.split('.').at(-1)+'; source absence, eligibility and transport omission are distinct.','source_variant')];
 if(kind==='finding')return [record('audit.canonical_inventory','Exact returned finding ID '+id+'; separate finding identity, policy and inventory completeness.','inventory_identity')];
 const direct=CATALOG_VIEW_BINDINGS.filter(b=>b.metricIds.includes(id));
 if(direct.length)return direct.map(b=>field(b.itemId,b.metricRelationship==='related'?'Related checklist assessment; not the exact CMP criterion.':'Reviewed catalog metric binding.',b.metricRelationship==='related'?'assessment_context':'direct_field'));
 if(id.startsWith('customer_cmp_check.')){
  const criterion=id.slice('customer_cmp_check.'.length);
  const original=CATALOG_VIEW_BINDINGS.find(b=>b.metricIds.includes('sealed.cmp_check.'+criterion));
  if(original)return [field(original.itemId,'Named CMP criterion from the generation-bound customer packet; separate from the internal assessment series.','source_variant')];
 }
 const key=id.replace(/^sealed\./,'');
 if(id!==key){
  const original=CATALOG_VIEW_BINDINGS.filter(b=>b.metricIds.includes(key));
  if(original.length)return original.map(b=>field(b.itemId,'Persisted assessment source variant; original states and denominators remain separate from public observations.','source_variant'));
 }
 if(key.startsWith('choice_finding.'))return [field('privacy.choice.result_record','Exact canonical record ID '+key.slice(15)+'; neutral records are not adverse findings.')];
 const check=key.match(/^(checklist|verdict)\.(.+)$/);
 if(check){
  const [,type,name]=check,topic=topicChecks[name!];
  if(topic)return [field('policies.topic.'+topic+'.'+(type==='verdict'?'verdict':'evidence_state'),'Exact named policy checklist '+type+'; never inferred from policy text.')];
  if(name==='privacy_notice_availability')return [field('policies.discovery.link.'+(type==='verdict'?'verdict':'evidence_state'),'Privacy-notice checklist '+type+'; independent of source fetch.')];
  if(checklistConcepts[name!])return [record(checklistConcepts[name!]!,'Named checklist '+name+' / '+type+'; related assessment, not underlying observation or exact CMP criterion.')];
 }
 const reason=key.match(/^detail\.(accept|reject)\.reason$/);
 if(reason)return [record('consent.choice_execution',reason[1]+' indeterminate reason; separate from execution status and terminal verification.')];
 if(extras[key])return [record(...extras[key]!)];
 throw Error('Audit measure lacks canonical review: '+kind+':'+id);
}
type ChecklistAliasInput={
 metrics?:Metric[];
 rows?:Pick<ProgressRow,'states'|'metricSources'>[];
 days?:{metrics:Record<string,any>}[];
};

function stateSeries(value:any){
 const {source,counts,denominator,stateDeltaPp,comparison}=value;
 return {source,counts,denominator,stateDeltaPp,comparison};
}

function stateBreakdown(value:any){
 return {...stateSeries(value),series:Object.fromEntries(Object.entries(value.series).map(([source,series])=>[source,stateSeries(series)]))};
}

/** The two views read the same checklist evidence field. Retire the count-only
 * alias only if both projections still agree for every scan and source. */
export function reviewedChecklistAliases(data:ChecklistAliasInput){
 const metrics=new Map((data.metrics??[]).map(metric=>[metric.id,metric]));
 const aliases:{id:string;reason:string;replacements:string[]}[]=[];
 if(!data.rows?.length||!data.days?.length)return aliases;
 for(const [check,topic] of Object.entries(TOPIC_ROWS)){
  for(const prefix of ['', 'sealed.']){
   const id=prefix+'checklist.'+check,replacement=prefix+topic;
   const metric=metrics.get(id),survivor=metrics.get(replacement);
   if(!metric||metric.success.length!==0||!isDeepStrictEqual(survivor?.success,['observed']))continue;
   if(!data.rows.every(row=>row.states[id]===row.states[replacement]&&
       row.metricSources?.[id]===row.metricSources?.[replacement]))continue;
   if(!data.days.every(day=>day.metrics[id]&&day.metrics[replacement]&&
       isDeepStrictEqual(stateBreakdown(day.metrics[id]),stateBreakdown(day.metrics[replacement]))))continue;
   aliases.push({id,reason:'Same checklist evidence state, denominator and source breakdown as the surviving row.',replacements:[replacement]});
  }
 }
 return aliases;
}

export function auditStateCsvMetrics(data:ChecklistAliasInput,aliases=reviewedChecklistAliases(data)){
 const removed=new Set(aliases.map(alias=>alias.id));
  const useful=new Set(forwardAuditMeasures((data.metrics??[]).map(metric=>({...metric,kind:'metric'}))).entries.map(entry=>entry.id));
  return (data.metrics??[]).filter(metric=>!removed.has(metric.id)&&useful.has(metric.id));
}

/** Forward report questions. Supporting fields explain these questions and never
 * become interchangeable rates or implicit fallbacks for the primary source. */
const FORWARD_MEASURES:Record<string,string[]>={
 outcome:['evidence','selection.status','sealed.publication'],
 'control.accept':[],
 'control.reject':[],
 'control.options':[],
 'sealed.control.privacyOptOut':['sealed.opt_out.scope','sealed.opt_out.basis','sealed.opt_out.signal_scope','sealed.opt_out.signal_basis','sealed.opt_out.policy_methods'],
 'click.accept':['execution.accept','sealed.priority_evidence.accept'],
 'registration.accept':['sealed.terminal.audit_accept'],
 'detail.accept.verdict':['detail.accept.projectable','detail.accept.reason','detail.accept.stop','accept.requests','accept.storage_writes'],
 'click.reject':['execution.reject','sealed.priority_evidence.reject'],
 'registration.reject':['sealed.terminal.audit_reject'],
 'detail.reject.verdict':['detail.reject.projectable','detail.reject.reason','detail.reject.stop','reject.requests','reject.storage_writes'],
 gpc_delivery:['gpc_path'],
 'detail.gpc.response':['detail.gpc.semantic_probe','detail.gpc.semantic_readiness','detail.gpc.cmp_receipt'],
 'sealed.choice_evidence.paired_cmp':['sealed.choice_evidence.paired_baseline_sale','sealed.choice_evidence.paired_baseline_sharing','sealed.choice_evidence.paired_gpc_sale','sealed.choice_evidence.paired_gpc_sharing','sealed.choice_evidence.paired_sale_transition','sealed.choice_evidence.paired_sharing_transition','sealed.choice_evidence.paired_cmp_scope','sealed.priority_evidence.cmp'],
 'detail.gpc.paired_pair':['detail.gpc.paired_collection','detail.gpc.paired_identifiers','detail.gpc.paired_sample_cap','detail.gpc.paired_advertising_opportunity','gpc.paired.duration_ms','gpc.paired.baseline.advertising_requests','gpc.paired.gpc.advertising_requests','gpc.paired.baseline.analytics_requests','gpc.paired.gpc.analytics_requests','gpc.paired.baseline.collection_sample','gpc.paired.gpc.collection_sample','gpc.paired.baseline.identified_sample','gpc.paired.gpc.identified_sample'],
 'detail.gpc.session_collection':['detail.gpc.session_request_coverage','detail.gpc.early_zero_later_collection','detail.gpc.request_sample_cap','gpc.session.advertising_collection','gpc.session.classified_requests','gpc.session.through_ms','gpc.session.semantic_read_ms','gpc.session.supported_activity_requests','gpc.session.unresolved_activity_requests','gpc.session.processing_context_requests','gpc.session.recipients'],
 'sealed.choice_finding.gpc_response':[],
 'sealed.choice_finding.gpp_propagation_inconsistency':[],
 'sealed.choice_finding.california_frictionless_gpc_exception':[],
 'sealed.choice_finding.california_post_reject_collection':[],
 'sealed.opt_out.dispatch':['sealed.opt_out.coverage','sealed.opt_out.configured','sealed.opt_out.conditional_control','sealed.opt_out.supported_route','sealed.opt_out.dispatch_reason'],
 'sealed.opt_out.action_completion':['sealed.opt_out.lane','sealed.opt_out.lane_stop','sealed.opt_out.recipe','sealed.opt_out.packet','sealed.opt_out.actions','sealed.opt_out.submission','sealed.opt_out.stop'],
 'sealed.opt_out.choice_confirmation':['sealed.opt_out.registration','sealed.opt_out.confirmation_basis'],
 'sealed.opt_out.post_confirmation_observation':['sealed.opt_out.capture','sealed.opt_out.observation'],
 'sealed.opt_out.presence':['sealed.opt_out.basis','sealed.opt_out.scope','sealed.opt_out.effectiveness','sealed.choice_finding.california_sale_sharing_opt_out_assessment','sealed.opt_out.findings_coverage'],
 privacy_policy:['verdict.privacy_notice_availability'],
 'checklist.cookie_notice_policy_availability':['verdict.cookie_notice_policy_availability'],
 'checklist.outdated_transfer_framework_reference':['verdict.outdated_transfer_framework_reference'],
 'sealed.operations.policy_text_receipt':['sealed.operations.policy_fetch','sealed.operations.policy_owner','detail.inventory.policy'],
 accessibility:['accessibility.results','accessibility.coverage','accessibility.examples'],
 'accessibility.failed_rules':['accessibility.affected_nodes'],
 'accessibility.review_rules':[],
 cmp_provider:['sealed.operations.cmp_coordinator'],
 'detail.forms.before':['forms.observed','detail.forms.count'],
 'detail.forms.after':[],
 'sealed.detail.sealed.form_destinations':['form.events'],
 'detail.storage.classification':['storage.unclassified','storage.proven_writes','storage.snapshot_only'],
 'inventory.cookies':['detail.inventory.cookies'],
 'inventory.vendors':['detail.inventory.vendors'],
 'detail.inventory.requests':['inventory.unclassified_requests'],
 'detail.inventory.findings':[],
 'site.link_evidence':['site.links_inspected','sealed.detail.sealed.site_integrity'],
 'technology.matches':['technology.detections','sealed.detail.sealed.technology'],
};
const FORWARD_CHECKS=[
 'consent_browsing_as_consent','consent_optional_defaults_on','consent_surface_observed',
 'device_identification_fingerprinting_signal_observed','embedded_content_pre_consent',
 'pre_consent_cookies_storage','pre_consent_third_party_tracking','session_replay_fingerprinting_review',
 'social_media_embed_pre_consent','third_party_iframe_pre_consent',
 'transport_security_form_transport','transport_security_http_redirect','transport_security_https_delivery',
 'transport_security_mixed_content','transport_security_tls_certificate',
];
for(const id of FORWARD_CHECKS)FORWARD_MEASURES['checklist.'+id]=['verdict.'+id];
for(const [check,topic] of Object.entries(TOPIC_ROWS)){
 if(topic!=='privacy_policy')FORWARD_MEASURES[topic]=['verdict.'+check,'checklist.'+check];
}
for(const id of ['cross_border_endpoint_review','sensitive_surfaces_third_party_tracking','public_collection_surfaces','preference_withdrawal_control','accessibility_consent_controls']){
 FORWARD_MEASURES['sealed.checklist.'+id]=['sealed.verdict.'+id];
}
for(const id of ['declared_not_found','duration','found_not_declared','implementation','prominence','services']){
 FORWARD_MEASURES['customer_cmp_check.'+id]=[];
}
FORWARD_MEASURES['customer_cmp_check.services']=['customer_cmp_check.categories','customer_cmp_check.cookie_information'];
FORWARD_MEASURES['customer_cmp_check.implementation']=['customer_cmp_check.consent_record'];

export function forwardAuditMeasures<T extends {id:string;kind:string}>(all:T[]){
 const byId=new Map(all.map(entry=>[entry.id,entry]));
 const parent=new Map(Object.entries(FORWARD_MEASURES).flatMap(([id,details])=>details.map(detail=>[detail,id] as const)));
 // Exact finding IDs stay individually measurable inside the matching check.
 for(const entry of all){
  if(entry.kind!=='finding')continue;
  const prefix='regulatory_gap__gdpr_eprivacy__';
  const check=entry.id.startsWith(prefix)?entry.id.slice(prefix.length):null;
  const owner=check?(TOPIC_ROWS[check]??'checklist.'+check):null;
  if(owner&&byId.has(owner)&&Object.hasOwn(FORWARD_MEASURES,owner))parent.set(entry.id,owner);
 }
 const findingOwners:Record<string,string>={
  regulatory_gap__gdpr_eprivacy__accept_consent_control:'control.accept',
  regulatory_gap__gdpr_eprivacy__reject_all_path_availability:'control.reject',
  regulatory_gap__gdpr_eprivacy__options_settings_preferences_control:'control.options',
  regulatory_gap__gdpr_eprivacy__post_reject_tracking_reduction:'detail.reject.verdict',
  reject_option_missing_or_hidden:'control.reject',
  asymmetric_consent_ui:'customer_cmp_check.prominence',
  pre_consent_tracking_detected:'checklist.pre_consent_third_party_tracking',
  third_party_cookie_pre_consent:'checklist.pre_consent_cookies_storage',
  analytics_cookie_pre_consent:'checklist.pre_consent_cookies_storage',
  cmp_load_order_gap:'checklist.consent_surface_observed',
  rtb_cookie_sync_observed:'checklist.pre_consent_third_party_tracking',
  policy_behavior_contradiction_detected:'privacy_policy',
  session_recording_services_detected:'checklist.session_replay_fingerprinting_review',
  post_accept_consent_dependent_activity:'detail.accept.verdict',
  post_reject_click_tracking:'detail.reject.verdict',
  accept_reject_outcomes_indistinguishable:'detail.reject.verdict',
  cross_border_endpoint_transfer_review_signal:'sealed.checklist.cross_border_endpoint_review',
  visual_contrast_accessibility_issue:'accessibility.failed_rules',
  semantic_labeling_accessibility_issue:'accessibility.failed_rules',
  keyboard_navigation_accessibility_issue:'accessibility.failed_rules',
  text_alternative_accessibility_issue:'accessibility.failed_rules',
 };
 for(const entry of all)if(entry.kind==='finding'&&findingOwners[entry.id]&&byId.has(findingOwners[entry.id]!))parent.set(entry.id,findingOwners[entry.id]!);
 const entries=all.filter(entry=>Object.hasOwn(FORWARD_MEASURES,entry.id)||parent.has(entry.id)||entry.kind==='finding');
 const tableEntries=entries.filter(entry=>!parent.has(entry.id)||!byId.has(parent.get(entry.id)!))
  .map(entry=>({...entry,details:entries.filter(detail=>parent.get(detail.id)===entry.id)}));
 return {entries,tableEntries,retired:all.filter(entry=>!entries.includes(entry)).map(entry=>({
  id:entry.id,reason:'No separate forward report question beyond the selected canonical measures and their supporting evidence.',
 }))};
}

export function auditQuantityCsvMetrics(data:{quantities?:any[]}){
 return forwardAuditMeasures((data.quantities??[]).map(quantity=>({...quantity,kind:'quantity'}))).entries;
}

export function buildAuditMeasureView(data:any){
 const all=groupedProgressEntries(data.metrics??[],data.quantities??[],(data.rows??[]).flatMap((r:any)=>r.findings??[]));
 const removals=all.filter(e=>e.kind==='metric'&&RETIRED_TABLE_MEASURES[e.id]).map(e=>{
  // Never silently retire a placeholder after a future producer starts supplying it.
  if((data.rows??[]).some((r:any)=>r.states?.[e.id]!==undefined&&r.states[e.id]!=='unavailable'))throw Error('Retired dashboard slot now has data; review required: '+e.id);
  return {id:e.id,...RETIRED_TABLE_MEASURES[e.id]!};
 });
 const checklistAliases=reviewedChecklistAliases(data);
 removals.push(...checklistAliases);
 const reviewed=all.filter(e=>!removals.some(r=>r.id===e.id)).map(e=>({...e,canonicalLinks:auditMeasureLinks(e.id,e.kind)}));
 const grouped=reviewed.map(entry=>{
  let group=(entry.group??'Other report signals').replace(/^Retained · /,'');
  if(['GPC details','Canonical GPC & opt-out records'].includes(group))group='GPC';
  if(['A/R paths','A/R verdicts'].includes(group)||entry.id==='sealed.choice_finding.california_post_reject_collection')group='Accept & Reject';
  if(entry.id==='sealed.choice_finding.california_sale_sharing_opt_out_assessment')group='Opt-out';
  if(group==='CMP details')group='Consent & CMP';
  if(entry.id==='sealed.detail.sealed.form_destinations')group='Forms';
  const label=(entry.label??entry.id).replace(/ · retained assessment$/,'').replace(/ · audit extract$/,'');
  return {...entry,group,label};
 });
 const groupOrder=[...new Set(grouped.map(entry=>entry.group))];
 grouped.sort((a,b)=>groupOrder.indexOf(a.group)-groupOrder.indexOf(b.group));
 const {entries,tableEntries,retired}=forwardAuditMeasures(grouped);
 return {version:'certscore.audit-measure-catalog.v2',catalogVersion:MASTER_CATALOG.version,entries,tableEntries,retired,removals,checklistAliases,
  scope:'Current table uses reviewed canonical bindings. Related assessments and source variants are not equal-value aliases. Historical contracts, source rows and CSVs remain intact. Missing meaningful evidence stays visible.'};
}
