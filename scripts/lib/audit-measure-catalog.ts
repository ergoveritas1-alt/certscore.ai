/** Current dashboard presentation only. Original contracts, rows and historical CSVs remain lossless. */
import {CATALOG_VIEW_BINDINGS} from './audit-evidence-catalog';
import {MASTER_CATALOG,masterFieldForLegacy} from './audit-evidence-master-catalog';
import {groupedProgressEntries} from './audit-progress-table';

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
export function buildAuditMeasureView(data:any){
 const all=groupedProgressEntries(data.metrics??[],data.quantities??[],(data.rows??[]).flatMap((r:any)=>r.findings??[]));
 const removals=all.filter(e=>e.kind==='metric'&&RETIRED_TABLE_MEASURES[e.id]).map(e=>{
  // Never silently retire a placeholder after a future producer starts supplying it.
  if((data.rows??[]).some((r:any)=>r.states?.[e.id]!==undefined&&r.states[e.id]!=='unavailable'))throw Error('Retired dashboard slot now has data; review required: '+e.id);
  return {id:e.id,...RETIRED_TABLE_MEASURES[e.id]!};
 });
 const entries=all.filter(e=>!removals.some(r=>r.id===e.id)).map(e=>({...e,canonicalLinks:auditMeasureLinks(e.id,e.kind)}));
 return {version:'certscore.audit-measure-catalog.v1',catalogVersion:MASTER_CATALOG.version,entries,removals,
  scope:'Current table uses reviewed canonical bindings. Related assessments and source variants are not equal-value aliases. Historical contracts, source rows and CSVs remain intact. Missing meaningful evidence stays visible.'};
}
