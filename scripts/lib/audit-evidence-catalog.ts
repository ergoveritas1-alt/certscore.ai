/** Audit-only evidence dictionary. IDs describe facts, not report placement or export paths.
 * These definitions introduce no capture, inference, scoring or historical rewriting.
 */
export const EVIDENCE_KINDS=['observation','action','assessment','finding','coverage','provenance','operation'] as const;
export type EvidenceKind=typeof EVIDENCE_KINDS[number];
export const REPRESENTATIONS=['detailed','summarized','derived','referenced','omitted'] as const;
export type Representation=typeof REPRESENTATIONS[number];
export type EvidenceView='report'|'standard'|'full'|'audit';
export const AVAILABILITY_STATES={
 available:'A valid, applicable, source-bound value is retained. It may be positive, negative or zero.',
 unknown:'The source explicitly records an unresolved value.',
 not_assessed:'The source explicitly says this item was not assessed.',
 not_retained:'An applicable source or value was not retained; absence is not a negative observation.',
 unsupported_version:'This source/schema version does not support the item.',
 invalid_or_unbound:'Retained evidence fails schema, identity, generation, source or scope checks.',
 not_applicable:'Explicit source-backed applicability excludes the item.',
} as const;
export const EVIDENCE_DOMAINS=[
 {id:'consent',label:'Consent & CMP'}, {id:'gpc',label:'Global Privacy Control'},
 {id:'tracking',label:'Tracking & storage'}, {id:'policies',label:'Policies & disclosures'},
 {id:'privacy',label:'Privacy rights & opt-out'}, {id:'accessibility',label:'Accessibility'},
 {id:'collection',label:'Forms & collection'}, {id:'technology',label:'Technology'},
 {id:'integrity',label:'Site integrity'}, {id:'transport',label:'Connection security'},
 {id:'page',label:'Page metadata'}, {id:'operations',label:'Audit operations & provenance'},
] as const;
export type EvidenceDomain=typeof EVIDENCE_DOMAINS[number]['id'];
type ValueType='state'|'boolean'|'count'|'milliseconds'|'text'|'reference'|'records';
export type CatalogItem={id:string;domain:EvidenceDomain;subject:string;label:string;kind:EvidenceKind;valueType:ValueType;definition:string;
 scope:'retained_scan_generation'|'paired_window'|'full_gpc_visit'|'after_accept'|'after_reject'|'audit_cohort';
 cardinality:'one_per_scope'|'one_per_record';
 sourceBinding:readonly string[];
};
type Leaf={id:string;label:string;kind:EvidenceKind;valueType:ValueType;definition:string;metrics?:string[];related?:boolean;
 auditBasis?:'finding_inventory'|'operational_receipt';representations?:Partial<Record<EvidenceView,Representation>>;perRecord?:boolean;scope?:CatalogItem['scope']};
export type CatalogBinding={sourceNoteKey:string;itemId:string;metricIds:string[];metricRelationship:'direct'|'related';auditBasis:'metrics'|'finding_inventory'|'operational_receipt'|'none';representations:Partial<Record<EvidenceView,Representation>>};
const items:CatalogItem[]=[],bindings:CatalogBinding[]=[];
function add(sourceNoteKey:string,domain:EvidenceDomain,subject:string,leaves:Leaf[]){
 for(const leaf of leaves){
  const id=domain+'.'+leaf.id;
  if(items.some(i=>i.id===id))throw Error('Duplicate canonical evidence ID: '+id);
  items.push({id,domain,subject,label:leaf.label,kind:leaf.kind,valueType:leaf.valueType,definition:leaf.definition,
   scope:leaf.scope??(domain==='operations'?'audit_cohort':'retained_scan_generation'),cardinality:leaf.perRecord?'one_per_record':'one_per_scope',
   sourceBinding:['scan_or_cohort_identity','original_source_hash','schema_version','assessment_or_engine_version','generation','capture_scope_and_time']});
  bindings.push({sourceNoteKey,itemId:id,metricIds:leaf.metrics??[],metricRelationship:leaf.related?'related':'direct',
   auditBasis:leaf.metrics?.length?'metrics':leaf.auditBasis??'none',representations:leaf.representations??{}});
 }
}
const leaf=(id:string,label:string,kind:EvidenceKind,valueType:ValueType,definition:string,metrics:string[]=[],extra:Partial<Leaf>={}):Leaf=>({id,label,kind,valueType,definition,metrics,...extra});
const record=(id:string,label:string,definition:string,extra:Partial<Leaf>={})=>leaf(id,label,'observation','text',definition,[],{perRecord:true,...extra});
const count=(id:string,label:string,definition:string,metric:string,extra:Partial<Leaf>={})=>leaf(id,label,'observation','count',definition,[metric],extra);
function check(key:string,domain:EvidenceDomain,subject:string,id:string,label:string,metric:string,verdict?:string){
 add(key,domain,subject,[leaf(id+'.evidence_state',label+' · evidence state','assessment','state','Returned evidence state for '+label.toLowerCase()+'. It is distinct from the returned verdict.',[metric]),
  ...(verdict?[leaf(id+'.verdict',label+' · verdict','assessment','state','Returned verdict for '+label.toLowerCase()+'. It does not replace the underlying evidence state.',[verdict])]:[])]);
}

add('site_integrity.findings','integrity','Findings',[leaf('finding','Site-integrity finding','finding','records','One retained canonical site-integrity finding with its original eligibility and evidence.',[],{perRecord:true,auditBasis:'finding_inventory'})]);
add('site_integrity.links','integrity','Link inspection',[
 count('links.inspected_count','Links inspected','Number of links inspected within the retained capture scope.','site.links_inspected'),
 count('links.evidence_count','Retained link-evidence count','Retained link evidence records; not unique destinations or new findings.','site.link_evidence'),
 record('links.evidence','Link evidence record','One retained link record and its source context; diagnostic details may be omitted from output views.'),
]);
add('cmp.provider','consent','CMP identity',[leaf('cmp.provider','CMP provider','observation','text','Recognized CMP identity in the retained source; recognition does not establish action support.',['cmp_provider'])]);
for(const [id,label,metric] of [
 ['banner','Cookie banner available','checklist.consent_surface_observed'],['reject','Reject option available','checklist.reject_all_path_availability'],
 ['prominence','Accept / Reject prominence','sealed.cmp_check.prominence'],['categories','Category selection','sealed.cmp_check.categories'],
 ['services','Services identified','sealed.cmp_check.services'],['privacy_link','Privacy-policy link','privacy_policy'],
 ['privacy_access','Pre-consent policy accessibility','sealed.cmp_check.privacy_access'],['consent_record','Client-side consent record','sealed.cmp_check.consent_record'],
 ['implementation','Activity after choices','sealed.cmp_check.implementation'],['duration','Consent-cookie expiry','sealed.cmp_check.duration'],
 ['declared_not_found','Declared cookies compared with capture','sealed.cmp_check.declared_not_found'],['found_not_declared','Observed cookies absent from declarations','sealed.cmp_check.found_not_declared'],['cookie_information','Cookie information available','sealed.cmp_check.cookie_information'],
] as const)add('cmp.'+id,'consent','CMP criteria',[leaf('cmp.criterion.'+id,label+' · CMP assessment','assessment','state','The named retained CMP criterion assessment, including explicit not-assessed/limited states.',[metric],{related:!metric.startsWith('sealed.cmp_check.')})]);
add('cmp.defaults','consent','CMP signals',[
 leaf('cmp.framework','CMP framework signal','observation','state','Returned evidence for a recognized framework signal.',['checklist.cmp_framework_signal_observed']),
 leaf('cmp.optional_defaults','Optional-purpose default state','observation','state','Returned evidence about optional-purpose defaults; not an executed choice.',['checklist.consent_optional_defaults_on']),
]);
add('cmp.screenshots','consent','Visual evidence',[
 leaf('visual.banner_ref','Banner screenshot reference','provenance','reference','Retained banner screenshot reference; not embedded image bytes.',[],{representations:{standard:'referenced',full:'referenced'}}),
 leaf('visual.reject_ref','Reject screenshot reference','provenance','reference','Retained Reject screenshot reference under its own capture scope.',[],{representations:{standard:'referenced',full:'referenced'}}),
 leaf('visual.prominence_ref','Prominence screenshot reference','provenance','reference','Retained comparison screenshot reference; not an independent prominence assessment.',[],{representations:{standard:'referenced',full:'referenced'}}),
]);
for(const action of ['accept','reject','options'] as const)add('consent.'+action,'consent',action==='options'?'Options':action==='accept'?'Accept':'Reject',[
 leaf(action+'.control_presence','Control presence','observation','state','Source-bound first-layer '+action+' control presence; unknown and unavailable are not absence.',['control.'+action],{representations:{standard:'detailed',full:'detailed'}}),
]);
for(const action of ['accept','reject'] as const){
 const label=action==='accept'?'Accept':'Reject',scope=action==='accept'?'after_accept':'after_reject';
 add('consent.'+action+'_execution','consent',label,[
  leaf(action+'.click_completed','Click completed','action','boolean','Whether the authorized '+label+' click completed. It does not establish registration.',['click.'+action],{scope}),
  leaf(action+'.execution_status','Execution status','action','state','Canonical operational '+label+' execution status under its retained policy.',['execution.'+action],{scope}),
  leaf(action+'.returned_verdict','Returned path verdict','assessment','state','The returned '+label+' path verdict, independent of the execution state.',['detail.'+action+'.verdict'],{scope}),
  leaf(action+'.capture_stop_reason','Capture stop reason','coverage','state','Why the retained after-click observation ended.',['detail.'+action+'.stop'],{scope}),
 ]);
 add('consent.'+action+'_registration','consent',label,[leaf(action+'.initial_registration','Initial registration','assessment','state','Original initial-choice registration assessment; a later witness never rewrites it.',['registration.'+action],{scope})]);
 add('consent.'+action+'_terminal','consent',label,[
  leaf(action+'.terminal_verification','Terminal verification','assessment','state','Verification of the terminal decision with matching action, authorized control, source and capture timing.',['terminal.'+action,'sealed.terminal.'+action,'sealed.terminal.audit_'+action],{scope}),
  leaf(action+'.terminal_witness','Terminal witness','provenance','records','The bound terminal decision witness itself, distinct from a public verification summary.',[],{scope,representations:{report:'omitted',standard:'omitted',full:'omitted',audit:'omitted'}}),
 ]);
 add('consent.'+action+'_activity','consent',label,[
  count(action+'.request_count','After-click request count','Requests retained during the '+label+' after-click scope.',action+'.requests',{scope}),
  count(action+'.storage_write_count','After-click storage-write count','Storage writes retained during the '+label+' after-click scope.',action+'.storage_writes',{scope}),
  leaf(action+'.observation_coverage','After-click observation coverage','coverage','state','Window completion, truncation and projectability for the '+label+' capture.',['detail.'+action+'.projectable'],{scope}),
 ]);
}
for(const [id,label,metric] of [['tracking','Pre-consent third-party tracking','pre_consent_third_party_tracking'],['iframes','Third-party iframes','third_party_iframe_pre_consent'],['social','Social-media embeds','social_media_embed_pre_consent'],['embedded','Embedded content','embedded_content_pre_consent'],['replay','Replay / fingerprinting review','session_replay_fingerprinting_review'],['device','Device-identification signals','device_identification_fingerprinting_signal_observed']] as const)
 check('tracking.'+id,'tracking','Tracking checks',id,label,'checklist.'+metric,'verdict.'+metric);
add('tracking.per_page','tracking','Sitewide observations',[leaf('page.observation','Per-page observation','observation','records','One retained observation associated with its page and capture scope.',[],{perRecord:true})]);
check('policy.link','policies','Discovery','discovery.link','Privacy-policy discovery','privacy_policy','verdict.privacy_notice_availability');
for(const [id,label,verdict] of [['controller_contact','Controller / contact','controller_contact_disclosure'],['processing_purposes','Processing purposes','processing_purposes_disclosure'],['legal_basis','Legal basis','legal_basis_disclosure_observed'],['recipients_or_vendor_categories','Recipients / vendor categories','recipients_vendor_categories_disclosure'],['data_retention','Retention','retention_disclosure_observed'],['data_subject_rights','Data-subject rights','data_subject_rights_disclosure'],['international_transfers','International transfers','international_transfers_disclosure'],['dpo_contact','DPO contact','dpo_contact_point_disclosure'],['supervisory_authority','Supervisory authority','supervisory_authority_complaint_disclosure'],['automated_decision_making_or_profiling','Automated decisions / profiling','automated_decision_making_profiling_disclosure']] as const)
 check('policy.'+id,'policies','Disclosure topics','topic.'+id,label,'topic.'+id,'verdict.'+verdict);
check('policy.cookie_notice','policies','Disclosure checks','cookie_notice','Cookie notice','checklist.cookie_notice_policy_availability','verdict.cookie_notice_policy_availability');
check('policy.stale_framework','policies','Disclosure checks','stale_framework','Outdated transfer framework','checklist.outdated_transfer_framework_reference','verdict.outdated_transfer_framework_reference');
add('policy.passages','policies','Supporting passages',[
 record('passage.text','Passage text','One retained supporting excerpt, not the full governing document.'),
 leaf('passage.source_ref','Passage source reference','provenance','reference','Original document/source reference for a retained supporting passage.',[],{perRecord:true,representations:{report:'referenced',standard:'referenced',full:'referenced'}}),
]);
add('accessibility.coverage','accessibility','Audit coverage',[
 leaf('audit.status','Accessibility audit status','coverage','state','Returned accessibility audit status; required=false is excluded.',['accessibility']),
 leaf('audit.scope','Accessibility evaluation coverage','coverage','state','Retained scope and evaluation coverage, distinct from a failure count.',['accessibility.coverage']),
]);
add('accessibility.rules','accessibility','Automated findings',[
 count('rules.failed_count','Failed-rule count','Number of failed rules within the retained audit scope.','accessibility.failed_rules'),
 count('nodes.affected_count','Affected-node count','Number of affected nodes reported by the retained engine/scope.','accessibility.affected_nodes'),
]);
add('accessibility.manual','accessibility','Manual review',[count('rules.review_count','Manual-review rule count','Rules needing manual review; not automated failures.','accessibility.review_rules')]);
add('accessibility.examples','accessibility','Examples',[
 leaf('examples.coverage','Example coverage','coverage','state','Retained versus omitted example coverage.',['accessibility.examples']),
 record('examples.node','Node example','One retained bounded node example; not a complete DOM.'),
]);
for(const [i,id,label] of [[0,'platform','Platform'],[1,'version','Platform version'],[2,'industry','Estimated industry'],[3,'language','Language'],[4,'title','Page title']] as const)
 add('page_information.metadata_'+i,'page','Page metadata',[leaf(id,label,'observation','text','The retained '+label.toLowerCase()+' field; unknown display omission is not an absent property.',[],{representations:{report:'detailed',full:'detailed'}})]);
add('runtime.classification','tracking','Storage classification',[
 leaf('storage.classification','Storage classification','assessment','state','Returned pre-consent storage classification.',['detail.storage.classification']),
 count('storage.unclassified_count','Unclassified storage count','Retained storage records with unresolved classification.','storage.unclassified'),
]);
add('runtime.writes','tracking','Storage proof',[
 count('storage.proven_writes','Timestamped cookie writes','Writes with retained timestamp proof; distinct from snapshot presence.','storage.proven_writes'),
 count('storage.snapshot_records','Snapshot-only cookie records','Late/initial snapshot records without equivalent timestamped-write proof.','storage.snapshot_only'),
]);
add('runtime.inventory','tracking','Inventories',[
 count('inventory.cookie_count','Distinct cookie count','Distinct retained cookie inventory count under its source definition.','inventory.cookies'),
 count('inventory.vendor_count','Recognized vendor count','Recognized vendor inventory count; presence does not establish collection.','inventory.vendors'),
 leaf('inventory.cookie_record','Cookie inventory record','observation','records','One bounded cookie inventory record; no raw cookie value.',[],{perRecord:true}),
 leaf('inventory.vendor_record','Vendor inventory record','observation','records','One bounded recognized vendor record and classification context.',[],{perRecord:true}),
]);
add('runtime.requests','tracking','Request inventory',[
 count('requests.unclassified_count','Unclassified request count','Returned unresolved request count within the bounded inventory.','inventory.unclassified_requests'),
 leaf('requests.inventory_cap','Request inventory cap','coverage','state','Whether the returned request inventory is truncated, complete within its scope or inconsistent.',['detail.inventory.requests']),
]);
add('privacy.workpaper','privacy','California review',[
 leaf('california.assessment','California review assessment','assessment','records','Retained California review assessment under its original policy; not a legal conclusion.'),
 leaf('california.coverage','California review coverage','coverage','records','Retained assessed/limited families for the California review.'),
]);
add('privacy.rights','privacy','California assessments',[
 leaf('rights.assessment','Rights assessment','assessment','records','Retained consumer-rights disclosure assessment under its source policy.'),
 leaf('collection_notice.assessment','Collection-notice assessment','assessment','records','Retained collection-notice matching assessment and scope.'),
 leaf('sale_sharing.assessment','Sale/sharing assessment','assessment','records','Retained sale/sharing assessment; collection alone does not establish purpose.'),
]);
add('privacy.optout','privacy','Opt-out control',[leaf('optout.control_presence','First-layer opt-out presence','observation','state','Exact first-layer opt-out control observation under the canonical inspection contract.',['control.privacyOptOut','sealed.control.privacyOptOut'])]);
add('privacy.canonical','privacy','Canonical results',[leaf('choice.result_record','Canonical choice result record','assessment','records','An exact canonical GPC/GPP/opt-out assessment/result record. Neutral records are not findings.',[],{perRecord:true,auditBasis:'finding_inventory'})]);
for(const [id,label] of [['https_delivery','HTTPS delivery'],['tls_certificate','TLS certificate'],['http_redirect','HTTP redirect'],['mixed_content','Mixed content'],['form_transport','Form transport']] as const)
 check('transport.'+id,'transport','Connection checks',id,label,'checklist.transport_security_'+id,'verdict.transport_security_'+id);
add('forms.counts','collection','Form capture',[
 count('forms.observed_count','Observed form count','Observed main-document forms within the retained capture scope.','forms.observed'),
 leaf('forms.pre_consent_capture','Pre-consent capture state','coverage','state','Returned pre-consent form capture state.',['detail.forms.before']),
 leaf('forms.after_accept_capture','After-Accept capture state','coverage','state','Returned after-Accept form capture state, distinct from pre-consent.',['detail.forms.after']),
]);
for(const [id,label] of [['label','Field label'],['input_type','Input type'],['semantic_category','Semantic category'],['required','Required state'],['state','Field state'],['confidence','Field confidence']] as const)
 add('forms.fields','collection','Field inventory',[leaf('field.'+id,label,'observation',id==='required'?'boolean':'text','One retained form field’s '+label.toLowerCase()+'. Entered values are not retained.',[],{perRecord:true,representations:{report:'detailed',full:'detailed'}})]);
add('forms.action','collection','Form destination metadata',[
 record('form.method','Form method','Retained form HTTP method; no submission is implied.',{representations:{report:'detailed',full:'detailed'}}),
 record('form.action_host','Form action host','Retained action host for the form, not proof of recipient collection.',{representations:{report:'detailed',full:'detailed'}}),
 record('form.action_relationship','Form action relationship','Retained first/third-party relationship for the form action.'),
 leaf('form.evidence_refs','Form evidence references','provenance','reference','References for one retained form/field observation.',[],{perRecord:true,representations:{report:'referenced',standard:'referenced',full:'referenced'}}),
]);
add('forms.snapshots','collection','Form snapshots',[
 leaf('snapshot.status','Form snapshot status','coverage','state','Returned availability/limitation state of a retained form snapshot.'),
 leaf('snapshot.reference','Form snapshot reference','provenance','reference','Retained snapshot link; image bytes are separate.',[],{perRecord:true,representations:{report:'referenced',full:'referenced'}}),
]);

add('gpc.delivery','gpc','Delivery',[
 leaf('delivery.http_header','GPC HTTP header proof','observation','boolean','Retained HTTP signal-delivery proof; not navigator delivery.',[],{representations:{standard:'detailed',full:'detailed'}}),
 leaf('delivery.navigator','GPC navigator readback','observation','boolean','Retained main-frame navigator readback; not full-context verification.',[],{representations:{standard:'detailed',full:'detailed'}}),
 leaf('delivery.verification','GPC verification by scope','assessment','state','Separate bounded main-document and matched paired-window verification; historical gpc_delivery remains an independent compatibility series.',['gpc_delivery']),
 leaf('response.status','GPC response assessment','assessment','state','Returned response assessment under its original source/policy.',['detail.gpc.response']),
]);
add('gpc.receipt','gpc','CMP receipt & readiness',[
 leaf('cmp.receipt','CMP GPC receipt','observation','state','Whether the CMP reports receiving GPC; not proof of honoring.',['detail.gpc.cmp_receipt']),
 leaf('cmp.readiness','Semantic-readiness reason','coverage','state','Readiness reason at the retained checkpoint; not permanent API availability.',['detail.gpc.semantic_readiness']),
 leaf('cmp.checkpoint_ms','Semantic checkpoint time','coverage','milliseconds','Time of the semantic read after document commit.',['gpc.session.semantic_read_ms'],{scope:'full_gpc_visit'}),
]);
add('gpc.pair','gpc','Paired behavioral window',[
 leaf('pair.availability','Behavioral-pair availability','coverage','state','Availability of the verified baseline/GPC behavioral pair.',['detail.gpc.paired_pair'],{scope:'paired_window'}),
 leaf('pair.window_verification','Matched-window verification','coverage','state','Verification of comparable retained request windows.',['detail.gpc.paired_window'],{scope:'paired_window'}),
 leaf('pair.duration_ms','Matched-window duration','coverage','milliseconds','Duration of the matched request interval, not the full GPC visit.',['gpc.paired.duration_ms'],{scope:'paired_window'}),
 ...(['baseline','gpc'] as const).flatMap(side=>['advertising','analytics'].map(category=>count('pair.'+side+'.'+category+'_requests',(side==='baseline'?'Without GPC':'With GPC')+' '+category+' requests','Retained '+category+' request count in the '+side+' matched window.','gpc.paired.'+side+'.'+category+'_requests',{scope:'paired_window'}))),
]);
add('gpc.cmp_pair','gpc','Paired CMP snapshots',[
 leaf('cmp_pair.availability','Paired CMP availability','coverage','state','Availability of baseline/GPC CMP snapshots bound to the same retained assessment.',['detail.gpc.paired_cmp','sealed.choice_evidence.paired_cmp'],{scope:'paired_window'}),
 leaf('cmp_pair.scope','Paired CMP scope','coverage','state','Main-document/full-context/section-version scope of the bound pair.',['detail.gpc.paired_cmp_scope','sealed.choice_evidence.paired_cmp_scope'],{scope:'paired_window'}),
 ...(['baseline','gpc'] as const).flatMap(side=>['sale','sharing'].map(setting=>leaf('cmp_pair.'+side+'.'+setting,(side==='baseline'?'Without GPC':'With GPC')+' '+setting+' setting','observation','state','The retained '+setting+' state in the '+side+' snapshot; no earlier state is inferred.',['detail.gpc.paired_'+side+'_'+setting,'sealed.choice_evidence.paired_'+side+'_'+setting],{scope:'paired_window',representations:{standard:'detailed',full:'detailed'}}))),
 ...(['sale','sharing'] as const).map(setting=>leaf('cmp_pair.'+setting+'_transition',setting==='sale'?'Sale-setting transition':'Sharing-setting transition','assessment','state','Descriptive baseline-to-GPC '+setting+' difference between independent bound visits; not causation.',['detail.gpc.paired_'+setting+'_transition','sealed.choice_evidence.paired_'+setting+'_transition'],{scope:'paired_window'})),
]);
add('gpc.full_visit','gpc','Full-visit activity',[
 count('visit.advertising_collection','Full-visit advertising collection','Retained successful advertising collection across the GPC visit.','gpc.session.advertising_collection',{scope:'full_gpc_visit'}),
 count('visit.classified_requests','Full-visit classified requests','Retained classified request count across the GPC visit.','gpc.session.classified_requests',{scope:'full_gpc_visit'}),
 leaf('visit.horizon_ms','Full-visit request horizon','coverage','milliseconds','Request horizon after document commit, independent of an early paired-window zero.',['gpc.session.through_ms'],{scope:'full_gpc_visit'}),
 leaf('visit.request_coverage','Full-visit request coverage','coverage','state','Coverage/truncation of the retained full-visit request observation.',['detail.gpc.session_request_coverage'],{scope:'full_gpc_visit'}),
 leaf('visit.early_zero_later_positive','Early zero / later positive','assessment','state','A verified early paired-window zero with separately bound positive full-visit collection.',['detail.gpc.early_zero_later_collection'],{scope:'full_gpc_visit'}),
]);
add('gpc.samples','gpc','Activity classification',[
 count('activity.supported_count','Supported activity-role requests','Retained requests with supported activity roles under the source qualification policy.','gpc.session.supported_activity_requests',{scope:'full_gpc_visit'}),
 count('activity.unresolved_count','Unresolved activity-role requests','Retained requests whose activity roles remain unresolved.','gpc.session.unresolved_activity_requests',{scope:'full_gpc_visit'}),
 count('activity.processing_declarations','Requests with processing declarations','Retained request-local processing declarations; not proof of honoring.','gpc.session.processing_context_requests',{scope:'full_gpc_visit'}),
 count('activity.recipients','Distinct retained recipients','Distinct retained advertising-collection recipients under the canonical source resolver.','gpc.session.recipients',{scope:'full_gpc_visit'}),
 leaf('activity.sample_cap','Full-visit sample cap','coverage','state','Truncation/cap state for retained request samples.',['detail.gpc.request_sample_cap'],{scope:'full_gpc_visit'}),
 ...(['baseline','gpc'] as const).flatMap(side=>['collection','identified'].map(kind=>count('pair.'+side+'.'+kind+'_samples',(side==='baseline'?'Without GPC':'With GPC')+' '+kind+' samples','Count of retained '+kind+' samples under the paired sample cap; not the entire request inventory.','gpc.paired.'+side+'.'+kind+'_sample',{scope:'paired_window'}))),
]);
add('cms.detections','technology','Detections',[
 count('detections.count','Technology detection count','Count in the verified sealed technology assessment; not all plugin/inventory details.','technology.detections'),
 record('detection.product','Detected product','One retained technology/CMS/plugin identity; no detection is invented.'),
 record('detection.version','Detected version','Retained version evidence and confidence; absence never implies a version.'),
]);
add('cms.advisories','technology','Advisories',[
 count('advisories.count','Advisory-match count','Retained advisory matches under the original catalog version.','technology.matches'),
 leaf('advisory.record','Advisory match','assessment','records','One retained advisory match with its detection/version evidence and qualification.',[],{perRecord:true}),
]);

for(const [key,subject,fields] of [
 ['configuration','Opt-out configuration',[['configured','Configured enablement','operation'],['lane','Worker outcome','operation'],['lane_stop','Worker limitation','coverage']]],
 ['route','Opt-out route & signal',[['presence','Broader route/signal presence','observation'],['basis','Presence assessment basis','provenance'],['scope','Inspection scope','coverage'],['signal_scope','Signal scope','coverage'],['signal_basis','Signal kind','observation'],['policy_methods','Declared policy methods','observation']]],
 ['dispatch','Opt-out execution',[['packet','Packet availability','coverage'],['recipe','Recipe selection','operation'],['dispatch','Dispatch status','action'],['actions','Action execution','action'],['dispatch_reason','Dispatch/skip reason','coverage']]],
 ['submission','Opt-out outcomes',[['submission','Submission','action'],['registration','Initial state registration','assessment'],['choice_confirmation','Recorded choice confirmation','assessment'],['confirmation_basis','Confirmation basis','provenance'],['post_confirmation_observation','Post-confirmation observation','observation'],['observation','Observation outcome','assessment'],['effectiveness','Effectiveness assessment','assessment']]],
] as const)add('audit_choices.'+key,'privacy',subject,fields.map(([id,label,kind])=>leaf('optout.'+id,label,kind,'state','Source-bound '+label.toLowerCase()+' for the explicit opt-out lane. Keep it separate from presence and other action stages.',['sealed.opt_out.'+id])));
add('audit_gpc.coverage','gpc','Paired activity coverage',[
 leaf('pair.baseline_opportunity','Baseline / both-zero coverage','coverage','state','Whether retained paired activity is informative, including both-zero coverage; not success or failure.',['detail.gpc.paired_advertising_opportunity'],{scope:'paired_window'}),
 leaf('pair.sample_cap','Paired sample cap','coverage','state','Retained paired collection/identifier sample cap and proof coverage.',['detail.gpc.paired_sample_cap'],{scope:'paired_window'}),
]);
add('audit_gpc.source_groups','operations','Measurement qualification',[leaf('series.compatibility','Measurement compatibility','coverage','records','Separate window, schema, source, engine and qualification-policy groups. Incompatible rates/deltas stay null.',[],{auditBasis:'operational_receipt'})]);
add('audit_operations.acquisition','operations','Acquisition',[
 ...['pending_ids','cache_reuse','id_additions','id_updates'].map(id=>leaf('acquisition.'+id,id.replaceAll('_',' '),'operation',id==='pending_ids'?'records':'count','Retained daily acquisition accounting for '+id.replaceAll('_',' ')+'. ID-only records do not establish evidence content.',[],{auditBasis:'operational_receipt'})),
]);
add('audit_operations.integrity','operations','Provenance',[
 leaf('provenance.original_creator','Original creator proof','provenance','records','Original creation-request credential proof, distinct from later retrieval identity.',[],{auditBasis:'operational_receipt'}),
 leaf('provenance.source_hash','Source hash / generation binding','provenance','reference','Original source hash and exact generation binding; changed bytes cannot silently replace evidence.',[],{auditBasis:'operational_receipt',representations:{standard:'referenced',full:'referenced'}}),
 leaf('provenance.receipt_ancestry','Retained receipt ancestry','provenance','records','Complete nested original-artifact receipt ancestry, carried forward unchanged.',[],{auditBasis:'operational_receipt'}),
]);
add('audit_operations.gaps','operations','Cohort accounting',[
 leaf('cohort.outcome','Attempt outcome','operation','state','Returned mutually exclusive attempt/report outcome within the retained cohort.',['outcome']),
 leaf('cohort.publication','Publication status','operation','state','Retained publication outcome; not inferred from file existence.',['publication']),
 leaf('cohort.exclusions','Exclusions','operation','records','Explicit canary/test/other exclusions before denominators.',[],{auditBasis:'operational_receipt'}),
 leaf('cohort.missing_days','Missing-day coverage','coverage','records','Calendar-day inventory gaps; missing days are not zero activity.',[],{auditBasis:'operational_receipt'}),
 leaf('cohort.missing_files','Missing-file coverage','coverage','state','Missing/unavailable export receipts, preserving ID-only proof boundaries.',['evidence']),
]);
add('audit_references.graphs','tracking','Relationship references',[
 count('graph.node_count','Graph node reference count','Retained node reference metadata; deferred bytes are not verified by the count.','graph.nodes'),
 count('graph.edge_count','Graph edge reference count','Retained edge reference metadata; not causal ancestry proof.','graph.edges'),
 leaf('graph.ancestry','Request ancestry references','provenance','reference','Retained request/source ancestry references; not newly fetched graph bytes.',[],{representations:{report:'referenced',standard:'referenced'}}),
]);
add('audit_references.destinations','collection','Destination tracing',[
 leaf('destination.trace_availability','Destination-trace availability','coverage','state','Availability of the verified retained form-destination trace.',['sealed.detail.sealed.form_destinations']),
 count('destination.event_count','Destination-trace event count','Number of retained trace events; not submissions or proven recipient collection.','form.events'),
]);
add('audit_inventory.records','operations','Canonical inventories',[
 leaf('inventory.record_identity','Canonical record identity','provenance','records','Exact canonical record identities and surfaced/not-surfaced/not-returned states.',[],{auditBasis:'finding_inventory'}),
 leaf('inventory.completeness','Finding-inventory completeness','coverage','state','Whether the returned finding inventory can support its denominator.',['detail.inventory.findings']),
]);
add('audit_inventory.versions','operations','Daily measurement',[
 leaf('series.rate','Qualified daily rate','assessment','records','Rate and sample size computed only within a compatible source/schema/engine series.',[],{auditBasis:'operational_receipt'}),
 leaf('series.summary_coverage','Summary coverage by date/version','coverage','records','Availability of new summaries by retained date and source version; historical omissions remain unavailable.',[],{auditBasis:'operational_receipt'}),
]);
add('audit_policy.fetch','policies','Source acquisition',[
 leaf('source.fetch','Candidate fetch state','operation','state','Source-bound fetch outcome of relevant policy candidates, not all discovered links.',['sealed.policy_fetch','sealed.operations.policy_fetch']),
 leaf('source.ownership','Producer-declared ownership','assessment','state','Producer-declared usable target-owned policy candidate; not independent legal-entity verification.',['sealed.policy_owner','sealed.operations.policy_owner']),
]);
add('audit_policy.bytes','policies','Text integrity',[
 leaf('text.local_verification','Local text-byte verification','provenance','state','Hash/size verification of already-retained local policy text with complete source metadata.',['sealed.policy_full_text']),
 leaf('text.producer_receipt','Producer text-verification receipt','provenance','state','Retained producer verification receipt; not a new local byte read or semantic review.',['sealed.operations.policy_text_receipt']),
]);

export const EVIDENCE_CATALOG={
 version:'certscore.audit-evidence-catalog.v1',domains:EVIDENCE_DOMAINS,kinds:EVIDENCE_KINDS,items,
 availabilityStates:AVAILABILITY_STATES,
 availabilityEvaluation:'not_evaluated_in_catalog_view',
 scope:'Reviewed decomposition of the existing 99 coverage topics. Collection-valued items retain their source bounds; this is not a claim to enumerate every raw packet field or acquire deeper evidence.',
 invariants:['No outcome is inferred from missing evidence.','Negative observations and measured zero are values, not availability states.','Original source/schema/generation/window bindings remain distinct.','Output omission differs from a scan not retaining evidence.','Views overlap; full report JSON is not a guaranteed superset.'],
};
export const CATALOG_VIEW_BINDINGS=bindings;
