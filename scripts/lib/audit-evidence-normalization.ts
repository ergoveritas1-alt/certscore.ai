/** Source-reviewed logical taxonomy: every current ID survives; no producer/export/metric migration. */
import {EVIDENCE_CATALOG,type CatalogItem} from './audit-evidence-catalog';
type Decision='normalize_field'|'keep_distinct'|'alias_candidate'|'move_metadata'|'retire_standalone';
type Layer='evidence'|'context'|'provenance'|'measurement'|'operations';
type Assignment={itemId:string;field:string;dimensions:Record<string,string>;decision:Decision;note?:string};
const labels:Record<Decision,string>={normalize_field:'Normalize as field',keep_distinct:'Keep distinct',alias_candidate:'Alias candidate',move_metadata:'Move to metadata',retire_standalone:'Retire standalone item'};
const proposals:{id:string;title:string;layer:Layer;reason:string;assignments:Assignment[]}[]=[];
const f=(itemId:string,field:string,dimensions:Record<string,string>={},decision:Decision='normalize_field',note?:string):Assignment=>({itemId,field,dimensions,decision,note});
const fields=(prefix:string,names:string[],decision:Decision='normalize_field')=>names.map(name=>f(prefix+'.'+name,name,{},decision));
function group(id:string,title:string,layer:Layer,reason:string,assignments:Assignment[]){proposals.push({id,title,layer,reason,assignments});}

group('cmp.identity','CMP identity','evidence','Provider and framework are attributes of the recognized CMP. Recognition does not establish action support.',[
 f('consent.cmp.provider','provider'),f('consent.cmp.framework','framework')]);
group('cmp.criterion_assessment','CMP criterion assessment','evidence','Use one assessment record type keyed by criterion. Each criterion remains separately addressable; related checklist states are not replacement values.',
 ['banner','reject','prominence','categories','services','privacy_link','privacy_access','consent_record','implementation','duration','declared_not_found','found_not_declared','cookie_information'].map(criterion=>f('consent.cmp.criterion.'+criterion,'assessment',{criterion})));
group('cmp.default_preference','Default preference observation','evidence','A default-state observation is independent of a user action or consent registration.',[f('consent.cmp.optional_defaults','state',{},'keep_distinct')]);
group('evidence.visual_reference','Visual evidence reference','provenance','Use a typed attachment reference with purpose and capture identity. Different screenshots remain different evidence.',
 ['banner','reject','prominence'].map(purpose=>f('consent.visual.'+purpose+'_ref','reference',{purpose},'move_metadata')));
group('privacy.control_observation','Privacy control observation','evidence','Use one control-observation type keyed by control kind and original locator/source. First-layer presence remains distinct from broader routes and execution.',[
 ...['accept','reject','options'].map(control=>f('consent.'+control+'.control_presence','presence',{control})),f('privacy.optout.control_presence','presence',{control:'privacy_opt_out'})]);
group('consent.choice_execution','Consent choice execution','evidence','Accept/Reject share a record shape with a required action dimension. Click completion, operational status and returned verdict remain separate fields and enums.',
 ['accept','reject'].flatMap(action=>['click_completed','execution_status','returned_verdict'].map(field=>f('consent.'+action+'.'+field,field,{action}))));
group('consent.initial_registration','Initial choice registration','evidence','Keep initial registration as its own time-bound assessment. A later witness does not rewrite it.',
 ['accept','reject'].map(action=>f('consent.'+action+'.initial_registration','assessment',{action},'keep_distinct')));
group('consent.terminal_verification','Terminal choice verification','evidence','A terminal assessment and its supporting witness belong together, but the witness is provenance, not another result. It must bind the exact action/control/time.',
 ['accept','reject'].flatMap(action=>[f('consent.'+action+'.terminal_verification','assessment',{action},'keep_distinct'),f('consent.'+action+'.terminal_witness','proof.witness',{action},'move_metadata')]));
group('consent.post_choice_capture','Post-choice observation','evidence','Put capture measures and limits in one action-scoped record. Counts, coverage and stop reason are different attributes; preserve request and storage units.',
 ['accept','reject'].flatMap(action=>['request_count','storage_write_count','observation_coverage','capture_stop_reason'].map(field=>f('consent.'+action+'.'+field,field,{action}))));

for(const [domain,subjects] of [
 ['tracking',['tracking','iframes','social','embedded','replay','device']],
 ['policies',['discovery.link','topic.controller_contact','topic.processing_purposes','topic.legal_basis','topic.recipients_or_vendor_categories','topic.data_retention','topic.data_subject_rights','topic.international_transfers','topic.dpo_contact','topic.supervisory_authority','topic.automated_decision_making_or_profiling','cookie_notice','stale_framework']],
 ['transport',['https_delivery','tls_certificate','http_redirect','mixed_content','form_transport']],
] as const)group(domain+'.check_assessment',domain==='policies'?'Policy disclosure assessment':domain==='tracking'?'Tracking assessment':'Connection-security assessment','evidence','One record per named check retains evidence_state and verdict as separate fields. Neither can be derived from the other. Check identity and historical policy version remain required.',
 subjects.flatMap(check=>['evidence_state','verdict'].map(field=>f(domain+'.'+check+'.'+field,field,{check}))));
group('tracking.page_observation','Page-scoped observation','evidence','Keep the page association and capture scope; a per-page record is not a duplicate of a site summary.',[f('tracking.page.observation','record',{},'keep_distinct')]);
group('tracking.storage_observation','Storage observation summary','evidence','Group storage classification and inventory diagnostics. Timestamp-proven writes and snapshot presence are independent facts, not interchangeable counts.',[
 ...fields('tracking.storage',['classification','unclassified_count','proven_writes','snapshot_records'])]);
group('tracking.cookie_inventory','Cookie inventory','evidence','Inventory records and the source-provided count belong in one bounded inventory. Do not recompute a distinct count from a truncated returned record list.',[
 f('tracking.inventory.cookie_count','distinct_count'),f('tracking.inventory.cookie_record','records')]);
group('tracking.vendor_inventory','Vendor inventory','evidence','Group recognized vendors with their count; vendor presence does not establish collection. Preserve source classification and inventory bounds.',[
 f('tracking.inventory.vendor_count','recognized_count'),f('tracking.inventory.vendor_record','records')]);
group('tracking.request_inventory','Request inventory coverage','measurement','Treat classification gaps and inventory cap as context for the returned request inventory, not separate risk findings.',fields('tracking.requests',['unclassified_count','inventory_cap'],'move_metadata'));
group('tracking.graph_receipt','Request-graph receipt','provenance','Node/edge reference counts are receipt diagnostics; ancestry carries distinct proof. Group them without inferring graph completeness or causation.',fields('tracking.graph',['node_count','edge_count','ancestry'],'move_metadata'));
group('policy.supporting_passage','Supporting policy passage','evidence','Text and source reference are attributes of one excerpt record. Keep document identity and offsets/references where retained; an excerpt is not full text.',[
 f('policies.passage.text','text'),f('policies.passage.source_ref','source_reference')]);
group('policy.source_receipt','Policy source receipt','provenance','Group source acquisition/ownership and verification receipts; producer claims and local byte verification remain separate fields with different proof scopes.',[
 f('policies.source.fetch','fetch'),f('policies.source.ownership','declared_ownership'),f('policies.text.local_verification','local_byte_verification'),f('policies.text.producer_receipt','producer_verification_receipt')].map(a=>({...a,decision:'move_metadata' as const})));
group('privacy.california_review','California review','evidence','The review and its coverage describe the same review record. Coverage remains separate from the substantive assessment and is not a legal conclusion.',fields('privacy.california',['assessment','coverage']));
group('privacy.disclosure_assessment','Privacy disclosure assessment','evidence','Use an assessment record keyed by family. Rights, collection notice and sale/sharing remain independent families, not one combined verdict.',
 ['rights','collection_notice','sale_sharing'].map(family=>f('privacy.'+family+'.assessment','assessment',{family},'keep_distinct')));
group('privacy.canonical_choice_result','Canonical choice result','evidence','Keep exact canonical record IDs and neutral states. Do not merge neutral results into findings or duplicate inventory identity as a new outcome.',[f('privacy.choice.result_record','record',{},'keep_distinct')]);
group('privacy.optout_route','Opt-out route and signal','evidence','Represent an inspected route/signal with presence, basis and scope. First-layer control presence stays in the separate control record; declared policy methods are not execution.',fields('privacy.optout',['presence','basis','scope','signal_scope','signal_basis','policy_methods']));
group('privacy.optout_attempt','Opt-out attempt','evidence','One attempt record holds configuration, dispatch and worker execution. Preserve each stage and its source: enablement is not dispatch, a packet is not action, and worker outcome is not effectiveness.',fields('privacy.optout',['configured','lane','lane_stop','packet','recipe','dispatch','actions','dispatch_reason']));
group('privacy.optout_outcome','Opt-out outcome','evidence','Group outcome fields while retaining submission, initial registration, confirmation and post-confirmation observation as distinct facts. Confirmation alone is not effectiveness.',fields('privacy.optout',['submission','registration','choice_confirmation','confirmation_basis','post_confirmation_observation','observation','effectiveness']));

group('accessibility.audit','Accessibility audit','evidence','One audit has status, scope, failure/review counts and bounded examples. Preserve units: rules versus affected nodes, failures versus manual review, and example completeness.',[
 f('accessibility.audit.status','status'),f('accessibility.audit.scope','scope'),f('accessibility.rules.failed_count','failed_rule_count'),f('accessibility.nodes.affected_count','affected_node_count'),f('accessibility.rules.review_count','manual_review_rule_count'),f('accessibility.examples.coverage','examples.coverage'),f('accessibility.examples.node','examples.records')]);
group('collection.capture','Form inventory capture','evidence','Form count and before/after capture states are attributes of a capture record. Before-consent and after-Accept remain distinct phases.',[
 f('collection.forms.observed_count','observed_count'),f('collection.forms.pre_consent_capture','capture_state',{phase:'pre_consent'}),f('collection.forms.after_accept_capture','capture_state',{phase:'after_accept'})]);
group('collection.field','Form field','evidence','One field record holds label, input type, semantic category, required state, observed state and confidence. These are useful attributes, not six separate concepts; entered values remain excluded.',fields('collection.field',['label','input_type','semantic_category','required','state','confidence']));
group('collection.form_destination','Form destination','evidence','Method, action host, relationship and evidence references belong to one form destination. Keep target/source identity; a form action is not a completed submission.',fields('collection.form',['method','action_host','action_relationship','evidence_refs']));
group('collection.snapshot_receipt','Form snapshot receipt','provenance','Reference and availability belong to the same snapshot receipt; a missing reference does not prove absence of a form.',fields('collection.snapshot',['status','reference'],'move_metadata'));
group('collection.destination_trace','Destination trace','evidence','Trace availability and event count belong together; event count is neither submission count nor successful collection.',fields('collection.destination',['trace_availability','event_count']));

group('gpc.signal_delivery','GPC signal delivery','evidence','HTTP delivery, navigator readback and combined verification belong to one delivery record as distinct fields. Do not collapse channels or main-document/full-context proof.',fields('gpc.delivery',['http_header','navigator','verification']));
group('gpc.response_assessment','GPC response assessment','evidence','Retain the returned policy-bound response independently of delivery, CMP receipt or paired activity differences.',[f('gpc.response.status','assessment',{},'keep_distinct')]);
group('gpc.cmp_checkpoint','CMP semantic checkpoint','evidence','Receipt, readiness and read time describe one semantic checkpoint. A readiness limit is not permanent API absence or GPC honoring.',fields('gpc.cmp',['receipt','readiness','checkpoint_ms']));
group('gpc.behavioral_pair','GPC behavioral comparison','evidence','Use one paired-comparison record with arm/category/sample-kind dimensions. Preserve independent visit identities, matched horizon, sample caps and all denominators; never mix with full-visit measurements.',[
 ...fields('gpc.pair',['availability','window_verification','duration_ms','baseline_opportunity','sample_cap']),
 ...['baseline','gpc'].flatMap(arm=>['advertising','analytics'].map(category=>f('gpc.pair.'+arm+'.'+category+'_requests','request_count',{arm,category}))),
 ...['baseline','gpc'].flatMap(arm=>['collection','identified'].map(sample_kind=>f('gpc.pair.'+arm+'.'+sample_kind+'_samples','sample_count',{arm,sample_kind}))),
]);
group('gpc.cmp_comparison','GPC paired CMP comparison','evidence','Use one CMP comparison with per-arm/per-purpose snapshots and separately derived transition fields. Snapshot checkpoint time is not the behavioral window. Independent visits do not establish causation.',[
 ...fields('gpc.cmp_pair',['availability','scope']),
 ...['baseline','gpc'].flatMap(arm=>['sale','sharing'].map(purpose=>f('gpc.cmp_pair.'+arm+'.'+purpose,'snapshot_state',{arm,purpose}))),
 ...['sale','sharing'].map(purpose=>f('gpc.cmp_pair.'+purpose+'_transition','transition',{purpose})),
]);
group('gpc.full_visit_activity','GPC full-visit activity','evidence','One full-visit activity record holds measures and coverage with their exact qualification policies and units. Supported/unresolved roles, declarations and recipients are different measures; do not sum overlaps.',[
 ...fields('gpc.visit',['advertising_collection','classified_requests','horizon_ms','request_coverage']),
 ...fields('gpc.activity',['supported_count','unresolved_count','processing_declarations','recipients','sample_cap']),
]);
group('gpc.cross_window_comparison','Early-window versus full-visit comparison','evidence','Keep this cross-window assessment separately linked to both inputs; an early zero cannot erase later collection.',[f('gpc.visit.early_zero_later_positive','assessment',{},'keep_distinct')]);

group('technology.detection','Technology detection','evidence','Product and version belong to the same scoped detection record, with confidence, evidence references and conflicting-version states. Page summaries are not aliases of these records.',[
 f('technology.detection.product','product',{role:'inventory_detection'}),f('technology.detection.version','version',{role:'inventory_detection'}),
]);
group('page.technology_summary','Page technology summary','context','Source review resolved the alias candidates: describeSiteTechnology produces a display summary using generator declarations and CMS indicators. It can combine products and replace conflicting versions with Unknown; the detection inventory has different scope and conflict semantics.',[
 f('page.platform','platform',{},'keep_distinct','Keep the summary identity. Do not use it as a canonical product detection or collapse its source into the inventory.'),
 f('page.version','version',{},'keep_distinct','Keep the display-summary version identity. Unknown/conflicting summaries and scoped detection versions are not interchangeable.'),
]);
group('technology.inventory_summary','Technology inventory summary','measurement','The inventory count has a different cardinality from one product/version. Retain its bounded source definition; do not derive a total from an incomplete displayed list.',[f('technology.detections.count','count',{},'move_metadata')]);
group('technology.advisory_inventory','Technology advisory matches','evidence','Group advisory records and their count under the matching catalog version. A detection or version string alone is not an advisory finding.',[f('technology.advisories.count','match_count'),f('technology.advisory.record','records')]);
group('integrity.finding','Site-integrity finding','evidence','A canonical finding with source and policy identity is a meaningful record; do not merge it into evidence-volume diagnostics.',[f('integrity.finding','record',{},'keep_distinct')]);
group('integrity.link_inspection','Link inspection','evidence','Group inspected count, retained evidence count and records. These counts use different units/scopes and are not interchangeable or necessarily derivable from returned records.',fields('integrity.links',['inspected_count','evidence_count','evidence']));
group('page.context','Page context','context','Title/language and estimated industry are page context. Source review confirms industry is used by the benchmark display; retain it outside the core evidence layer, without treating a benchmark label as observed site evidence.',[
 f('page.title','title',{},'move_metadata'),f('page.language','language',{},'move_metadata'),f('page.industry','estimated_industry',{},'move_metadata','Retain the existing benchmark/context use. No deletion is recommended; this is contextual metadata rather than observed evidence.')]);

group('audit.acquisition_receipt','Audit acquisition receipt','operations','Acquisition bookkeeping belongs to the audit operation, not an observed-site evidence catalog. Retain pending IDs and separate additions, updates and reuse.',fields('operations.acquisition',['pending_ids','cache_reuse','id_additions','id_updates'],'move_metadata'));
group('evidence.provenance','Evidence provenance','provenance','Use common provenance fields on each bound record, preserving creator identity, source/generation and complete receipt ancestry. Shared structure never permits substituting one source for another.',fields('operations.provenance',['original_creator','source_hash','receipt_ancestry'],'move_metadata'));
group('audit.cohort_receipt','Audit cohort receipt','operations','Put outcome, publication, exclusions and missing-day/file accounting in operational metadata. These remain independent states and eligibility boundaries, never inferred from one another.',fields('operations.cohort',['outcome','publication','exclusions','missing_days','missing_files'],'move_metadata'));
group('audit.canonical_inventory','Canonical result inventory','measurement','Record identity and inventory completeness are inventory metadata. The identity registry references actual results rather than creating duplicate assessment/finding objects.',fields('operations.inventory',['record_identity','completeness'],'move_metadata'));
group('audit.measurement_series','Qualified audit measurement series','measurement','A daily rate, compatibility key and summary coverage describe an aggregate series, not a site-level observation. Preserve source/schema/engine/version/window and null incompatible rates.',fields('operations.series',['compatibility','rate','summary_coverage'],'move_metadata'));

const definitions=new Map(EVIDENCE_CATALOG.items.map(i=>[i.id,i]));
const reviewed=new Map<string,ReturnType<typeof makeReview>>();
function makeReview(proposal:typeof proposals[number],a:Assignment,item:CatalogItem){return {
 decision:a.decision,label:labels[a.decision],proposedConceptId:proposal.id,proposedConcept:proposal.title,layer:proposal.layer,
 field:a.field,dimensions:a.dimensions,reason:proposal.reason,itemReason:a.note??('Retain “'+item.label+'” as '+a.field+' with its original '+item.kind+' meaning and '+item.cardinality+' cardinality.'),
 originalKind:item.kind,originalScope:item.scope,originalCardinality:item.cardinality,sourceBinding:item.sourceBinding,
 deletion:a.decision==='alias_candidate'?'conditional_alias_only':a.decision==='retire_standalone'?'standalone_catalog_entry_only':'not_recommended',
 migration:'Logical catalog mapping only. Preserve the current ID for compatibility; source values, API fields and audit metrics retain their existing contracts.',
};}
for(const p of proposals){
 const slots=new Set<string>();
 for(const a of p.assignments){
  const item=definitions.get(a.itemId);if(!item)throw Error('Normalization references unknown item: '+a.itemId);
  if(reviewed.has(a.itemId))throw Error('Duplicate normalization assignment: '+a.itemId);
  const slot=a.field+'|'+JSON.stringify(Object.entries(a.dimensions).sort());
  if(slots.has(slot))throw Error('Lossy normalization slot: '+p.id+'/'+slot);slots.add(slot);
  reviewed.set(a.itemId,makeReview(p,a,item));
 }
}
const missing=[...definitions.keys()].filter(id=>!reviewed.has(id));if(missing.length)throw Error('Unreviewed canonical items: '+missing.join(', '));
export function normalizationFor(id:string){const value=reviewed.get(id);if(!value)throw Error('Unreviewed canonical item: '+id);return value;}
export const NORMALIZATION_REVIEW={version:'certscore.audit-taxonomy-review.v2',status:'logical_catalog_reviewed',reviewedItems:reviewed.size,
 proposedConcepts:proposals.map(p=>({id:p.id,title:p.title,layer:p.layer,reason:p.reason,itemIds:p.assignments.map(a=>a.itemId)})),
 decisions:Object.entries(labels).map(([id,label])=>({id,label,count:[...reviewed.values()].filter(r=>r.decision===id).length})),
 wholeEvidenceDeletionsRecommended:0,
 basis:'The logical master organizes record types, fields, dimensions, proof and aggregate metrics. All 231 compatibility IDs remain addressable. Source review rejects the two page/technology aliases and retains industry as benchmark context. This establishes catalog structure, not new producer payloads or deployed parity; native schemas remain authoritative for values.',
 workflow:[
 'Agree record types, field definitions, units, cardinality and required identity/scope/version dimensions. Retain observation, assessment, action, coverage and proof as separate field meanings.',
 'Validate the proposed item-to-concept/field map against retained producer contracts. Prove conditional aliases with exact identity/source/time equivalence; keep conflicting observations. Do not synthesize missing values.',
 'Version the adopted catalog and its old-ID compatibility map, then align report, standard JSON, full evidence and audit as separate projections. Add parity checks before any consumer migration; preserve historical versions and omissions.',
 ],
 decisionsNeeded:[] as {itemIds:string[];question:string}[],
};
