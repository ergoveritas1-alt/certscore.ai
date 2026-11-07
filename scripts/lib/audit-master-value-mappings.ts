import {NORMALIZED_CMP_ITEMS} from './audit-forward-utility';
import {P2_AUDIT_IDS} from './audit-p2-coverage';
/** Versioned local value routes. Historical payloads and acquisition remain unchanged. */
import {MASTER_CATALOG} from './audit-evidence-master-catalog';
import {CATALOG_VIEW_BINDINGS,type EvidenceView} from './audit-evidence-catalog';
import {COVERAGE_SOURCE_NOTES} from './audit-evidence-output-notes';
import {EXTRA_NATIVE_PATHS} from './audit-master-native-values';
import {CONTEXT_PATHS} from './audit-master-context';
import {CATALOG_GUIDANCE,unresolvedMappingReview} from './audit-master-gap-review';
export type ValueRoute={mode:'retained_aggregate'|'metric'|'native'|'context'|'summary_only'|'intentional_omission'|'not_projected'|'mapping_gap';paths:string[];reason:string;guidanceId?:string};
const native:Record<string,string>={
 'consent.cmp.provider':'consentVendor','page.industry':'scan.benchmark',
 'page.title':'siteMetadata.observation.title','page.language':'siteMetadata.observation.language',
 'page.platform':'siteMetadata.observation → describeSiteTechnology.platform','page.version':'siteMetadata.observation → describeSiteTechnology.version',
 'consent.visual.banner_ref':'scan.consentBannerPreview','consent.visual.reject_ref':'scan.consentRejectPreview','consent.visual.prominence_ref':'scan.consentProminencePreview',
 'privacy.california.assessment':'californiaPrivacyReview','privacy.california.coverage':'californiaPrivacyReview.reviewCoverage',
 'privacy.rights.assessment':'californiaPrivacyReview.rightsAssessment','privacy.collection_notice.assessment':'californiaPrivacyReview.collectionNoticeAssessment','privacy.sale_sharing.assessment':'californiaPrivacyReview.saleSharingAssessment',
 'accessibility.audit.status':'accessibilityAudit.status','accessibility.audit.scope':'accessibilityAudit.coverage',
 'accessibility.rules.failed_count':'accessibilityAudit.failedRuleCount','accessibility.nodes.affected_count':'accessibilityAudit.affectedNodeCount','accessibility.rules.review_count':'accessibilityAudit.reviewRuleCount',
 'collection.forms.observed_count':'formsSummary.totalObserved','collection.forms.pre_consent_capture':'formsSummary.preConsentCapture','collection.forms.after_accept_capture':'formsSummary.afterAcceptCapture',
};
// Selection rules are executable in audit-master-values; * means stable-key collection, never array-position identity.
for(const action of ['accept','reject']){
 native[`consent.${action}.execution_status`]=`${action}Path.execution.status`;
 native[`consent.${action}.click_completed`]=`${action}Path.execution.clickCompleted`;
}
for(const key of ['label','input_type','semantic_category','required','state','confidence'])native['collection.field.'+key]='collectionTableRows[*].form.fields[*].'+({input_type:'inputType',semantic_category:'semanticCategory',state:'{disabled,readOnly}'}[key]??key);
for(const [key,value] of Object.entries({method:'method',action_host:'actionHostname',action_relationship:'actionRelationship',evidence_refs:'evidenceRefs'}))native['collection.form.'+key]='collectionTableRows[*].form.'+value;
native['collection.snapshot.status']='collectionTableRows[*].snapshot.status';native['collection.snapshot.reference']='collectionTableRows[*].snapshot.url';
for(const b of CATALOG_VIEW_BINDINGS.filter(b=>b.itemId.startsWith('consent.cmp.criterion.')))native[b.itemId]='cmpAudit.rows[id='+b.itemId.split('.').at(-1)+'].status';
for(const side of ['baseline','gpc'])for(const axis of ['sale','sharing'])native[`gpc.cmp_pair.${side}.${axis}`]=`gpcResponse.cmpStateComparison.${side}.${axis}`;
const bindingMap=new Map(CATALOG_VIEW_BINDINGS.map(b=>[b.itemId,b]));
const notes=new Map(COVERAGE_SOURCE_NOTES.map(n=>[n.key,n]));
function route(id:string,view:EvidenceView):ValueRoute{
 const b=bindingMap.get(id)!;const note=notes.get(b.sourceNoteKey)!;
 if(view==='audit'&&NORMALIZED_CMP_ITEMS[id])return {mode:'intentional_omission',paths:[],reason:NORMALIZED_CMP_ITEMS[id]!.utility+' Separate audit display parity is not required.'};
 if(view==='audit'&&P2_AUDIT_IDS.includes(id))return {mode:'retained_aggregate',paths:['masterValueParity.p2Coverage.items['+id+']'],reason:'Exact typed retained-input reader, including verified same-generation persisted privacy assessments and initial passive form records, with UTC date/schema/policy/creator-qualified groups. Missing CMP criteria are not derived. This is an audit aggregation of existing source records, not a second observation, customer-view parity pass or daily metric replacement.'};
 const extra=EXTRA_NATIVE_PATHS[id]?.[view];
 if(extra)return {mode:'native',paths:[extra],reason:extra.startsWith('customerConsentEvidence')?'Local customer-consent-evidence.v1 extension, not deployed. Exact persisted CMP criteria; historical exports without this packet stay unavailable.':'Read the typed retained value with stable record identity, independent proof scopes and explicit coverage; no historical data changes.'};
 if(view==='audit'&&CONTEXT_PATHS[id])return {mode:'context',paths:[CONTEXT_PATHS[id]!],reason:'Frozen dashboard/window fact, not a per-scan observation. Read the separately verified snapshot-context receipt.'};
 if(view==='audit'){
  if(b.metricIds.length&&b.metricRelationship==='direct')return {mode:'metric',paths:b.metricIds,reason:'Read each original metric/source series independently. Sealed and public series are never interchangeable.'};
  const reviewed=b.auditBasis==='none'?undefined:unresolvedMappingReview(id,view);if(reviewed)return {...reviewed,paths:[]};
  return {mode:b.metricRelationship==='related'?'summary_only':b.auditBasis==='none'?'not_projected':'mapping_gap',paths:b.metricIds,reason:b.metricRelationship==='related'?'A related aggregate is not this canonical item.':'No exact stored per-item audit value. Operational receipts and inventory summaries need their own typed mapping.'};
 }
 if(view==='report'&&id==='gpc.pair.baseline_opportunity')return {mode:'native',paths:['gpcResponse → pairedGpcAudit/detail.gpc.paired_advertising_opportunity'],reason:'Derived baseline/both-zero context from the retained matched pair; no causation or honoring inference.'};
 if(b.representations[view]==='omitted'||['Not included','Not tabulated'].includes(note[view].status))return {mode:'intentional_omission',paths:[],reason:note[view].detail};
 if(id==='gpc.delivery.http_header'||id==='gpc.delivery.navigator')return {mode:'native',paths:['gpcResponse.observation.delivery.'+(id.endsWith('http_header')?'httpHeaderRetained':'mainNavigatorReadbackRetained')],reason:'Retained delivery boolean only after schema, scan, session, document and original GPC artifact binding.'};
 if(id.startsWith('gpc.cmp_pair.')&&native[id])return {mode:'native',paths:[native[id]!],reason:'Read each arm only after strict shared CMP pair binding validation.'};
 if(view==='standard'&&b.metricIds.some(m=>!m.startsWith('sealed.'))&&b.metricRelationship==='direct')return {mode:'metric',paths:b.metricIds.filter(m=>!m.startsWith('sealed.')),reason:'Re-extract native SDK JSON with the shared versioned audit engine; no sealed fallback.'};
 if(view!=='standard'&&id.startsWith('gpc.')&&b.metricRelationship==='direct'&&b.metricIds.some(m=>m.startsWith('detail.gpc.')||m.startsWith('gpc.')))return {mode:'native',paths:b.metricIds.filter(m=>!m.startsWith('sealed.')).map(m=>'gpcResponse → pairedGpcAudit/'+m),reason:'Recompute paired/full-visit facts through the shared strict source-bound GPC reader. Distinct windows and checkpoint scopes remain separate.'};
 if(view!=='standard'&&native[id])return {mode:'native',paths:[native[id]!],reason:'Read the retained report-display field, with native types, source qualification and record identity.'};
 if(view!=='standard'&&/^consent\.(accept|reject)\.(initial_registration|terminal_verification|returned_verdict|capture_stop_reason|request_count|storage_write_count|observation_coverage)$/.test(id))return {mode:'summary_only',paths:[id.includes('.accept.')?'acceptPath':'rejectPath'],reason:'The display path/confirmation summary does not retain this separately bound canonical observation.'};
 if(view==='standard'&&note.standard.status==='Partial')return {mode:'summary_only',paths:[],reason:'The SDK exposes related/partial context, not this complete canonical field: '+note.standard.detail};
 if(view!=='standard'&&(id.endsWith('.evidence_state')||id.endsWith('.verdict')||note[view].status==='Partial'))return {mode:'summary_only',paths:[],reason:'The report display is a summary, not a lossless copy of this canonical field: '+note[view].detail};
 const reviewed=unresolvedMappingReview(id,view);if(reviewed)return {...reviewed,paths:[]};
 return {mode:'mapping_gap',paths:[],reason:'Representation exists but no reviewed lossless native value route is registered. Do not infer it from labels, prose, counts or a related measure.'};
}
export const MASTER_VALUE_MAPPINGS={version:'certscore.master-value-mappings.v1',catalogVersion:MASTER_CATALOG.version,
 guidance:CATALOG_GUIDANCE,
 customerConsentV1:{version:'certscore.customer-consent-evidence.v1',status:'local_implementation_not_deployed',path:'/customerConsentEvidence',byteCap:8192,source:'ready persisted snapshot only',scope:'control observations, inspection provenance, CMP criteria and checklist evidence; no execution or terminal proof substitution'},
 supportedSchemas:{standard:['pulse-public-v4','pulse-public-v5','pulse-public-v10','pulse-public-v11'],report:['scan-report-display.local.v1'],full:['report_display_content.local.v1','certscore.full-evidence.v2'],audit:['certscore.mac-mini-daily-progress.v5']},
 fullV2:{version:'certscore.full-evidence.v2',standardPath:'/standardEvidence',reportPaths:['/reportViews/gdpr_eprivacy','/reportViews/ccpa_cpra'],subsetRules:['standard_evidence_exact','both_report_views_after_reference_resolution'],status:'local_implementation_not_deployed',historicalFullFiles:'Legacy report_display_content remains independently supported; never assume it was a superset.'},
 semantics:'Report/full adapter versions identify this reviewed local serializer, not a new public API contract. Historical payloads are not migrated; the separately versioned customer-consent extension is local and undeployed. Missing or incompatible views never count as parity passes.',
 crossViewEquivalences:[{legacyId:'collection.forms.observed_count',path:'ScanFormsSummary.totalObserved',policy:'scan-forms-summary.totalObserved.v1',scope:'Exact count under the same scan/source/generation; parity only, never aggregate source merging.'}],
 items:MASTER_CATALOG.fields.map(f=>({legacyId:f.legacyId,masterFieldId:f.id,views:Object.fromEntries((['report','standard','full','audit'] as const).map(v=>[v,route(f.legacyId,v)])) as Record<EvidenceView,ValueRoute>}))};
export const mappingFor=(id:string)=>{const m=MASTER_VALUE_MAPPINGS.items.find(m=>m.legacyId===id);if(!m)throw Error('Unmapped master item: '+id);return m;};
