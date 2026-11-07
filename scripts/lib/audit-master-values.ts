import {gpcVerificationScopes} from './audit-gpc-verification-scopes';
/** Offline, hash-bound value adapters. Results are audit-only; never supplement producer evidence. */
import {createHash} from 'node:crypto';
import {extraNativeSamples} from './audit-master-native-values';
import {verifyFullEvidenceExport} from '../../apps/web/lib/api-v2/full-evidence-export';
import {MASTER_CATALOG,masterFieldForLegacy} from './audit-evidence-master-catalog';
import {mappingFor,MASTER_VALUE_MAPPINGS} from './audit-master-value-mappings';
import type {EvidenceView} from './audit-evidence-catalog';
import {extractExportRow} from './audit-progress-export';
import {gpcBoundedObservationSchema} from '../../packages/certscore-api-contracts/src/gpc-bounded-observation';
import {pairedGpcAudit} from './audit-progress-gpc';
import {choicePathExecutionSchema} from '../../packages/certscore-contracts/src/choice-path-execution';
import {collectionSurfaceFormSchema} from '../../packages/certscore-contracts/src/collection-surface-form';
import {californiaPrivacyReviewSchema} from '../../packages/certscore-contracts/src/california-privacy-review';
import {publicCmpAuditSchema} from '../../packages/certscore-api-contracts/src/detailed-evidence';
import {siteMetadataProjectionSchema,describeSiteTechnology} from '../../packages/certscore-contracts/src/site-metadata';
export type Binding={scanId:string;createdAt:string;generation:string;sourceHash:string;creatorIdentity:string};
export type ViewInput={view:EvidenceView;schema:string;bytes:Uint8Array;sha256:string;binding:Binding};
export type ValueSample={recordKey:string;value:unknown;qualification:string;availability:string;comparisonScope?:string};
export type FieldValue={legacyId:string;masterFieldId:string;status:string;reason:string;samples:ValueSample[]};
export type AdaptedView={view:EvidenceView;binding:Binding;sha256:string;fields:FieldValue[]};
const hash=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const obj=(v:any):Record<string,any>=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
const own=(v:any,k:string)=>Object.prototype.hasOwnProperty.call(obj(v),k)?v[k]:undefined;
const get=(v:any,p:string)=>p.split('.').reduce((v,k)=>own(v,k),v);
export function stableValue(v:any):string{return JSON.stringify(v===undefined?null:v&&typeof v==='object'?Array.isArray(v)?v.map(x=>JSON.parse(stableValue(x))):Object.fromEntries(Object.keys(v).sort().map(k=>[k,JSON.parse(stableValue(v[k]))])):v);}
/** RFC6901 references only within this immutable JSON document, with expansion and cycle bounds. */
export function resolveReportReferences(root:any):any{
 let visited=0;const forbidden=new Set(['__proto__','constructor','prototype']);
 function walk(v:any,ancestors:Set<any>,depth:number):any{
  if(++visited>250000||depth>64)throw Error('Report reference expansion limit');
  if(!v||typeof v!=='object')return v;
  if(ancestors.has(v))throw Error('Cyclic report reference');const next=new Set(ancestors).add(v);
  if(Object.hasOwn(v,'reportContentRef')){
   if(Object.keys(v).length!==1||typeof v.reportContentRef!=='string'||!v.reportContentRef.startsWith('/'))throw Error('Invalid report reference');
   let target=root;for(const raw of v.reportContentRef.slice(1).split('/')){
    if(/~(?![01])/.test(raw))throw Error('Invalid pointer escape');const k=raw.replaceAll('~1','/').replaceAll('~0','~');
    if(forbidden.has(k)||!target||typeof target!=='object'||!Object.hasOwn(target,k))throw Error('Dangling or unsafe report reference');target=target[k];
   }return walk(target,next,depth+1);
  }
  if(Array.isArray(v))return v.map(x=>walk(x,next,depth+1));
  return Object.fromEntries(Object.entries(v).map(([k,x])=>{if(forbidden.has(k))throw Error('Unsafe report key');return[k,walk(x,next,depth+1)];}));
 }return walk(root,new Set(),0);
}
function availability(value:unknown){
 if(value==='unknown'||value==='Unknown')return 'unknown';
 if(['unavailable','not_checked','not_retained','reason_not_retained'].includes(String(value)))return 'not_retained';
 if(['not_assessed','Not assessed'].includes(String(value)))return 'not_assessed';
 if(['unsupported_schema','unsupported_version','Feature not supported'].includes(String(value)))return 'unsupported_version';
 if(value==='invalid_or_unbound')return 'invalid_or_unbound';
 if(['not_applicable','Not applicable'].includes(String(value)))return 'not_applicable';return 'available';
}
function checkBinding(input:ViewInput,doc:any){
 const b=input.binding;
 if(input.bytes.length>32*1024*1024)throw Error('Input byte cap');
 if(hash(input.bytes)!==input.sha256)throw Error('Changed source bytes');
 if(!/^[a-f0-9-]{36}$/i.test(b.scanId)||!/^[a-f0-9]{64}$/.test(b.sourceHash)||!b.generation||!b.creatorIdentity||!Number.isFinite(Date.parse(b.createdAt)))throw Error('Missing source binding');
 const id=input.view==='report'||input.view==='full'?doc.scan?.id:doc.scanId;
 if(id!==b.scanId)throw Error('Scan binding mismatch');
 if(input.view==='standard'){
  if(doc.meta?.reportProjectionSourceHash!==b.sourceHash||doc.meta?.reportProjectionVersion!==b.generation||doc.meta?.projectionVersion!==input.schema||Date.parse(doc.timestamps?.createdAt)!==Date.parse(b.createdAt))throw Error('Source generation mismatch');
 }else if(input.view==='audit'){
  if(doc.publicProjectionSourceHash!==b.sourceHash||doc.projectionVersion!==b.generation||Date.parse(doc.createdAt)!==Date.parse(b.createdAt))throw Error('Audit generation mismatch');
 }else if(doc.scan?.createdAtIso&&Date.parse(doc.scan.createdAtIso)!==Date.parse(b.createdAt))throw Error('Report time mismatch');
 if(input.view==='full'&&doc.exportContent?.scope==='full_customer_evidence'){
  const binding=doc.exportContent.binding;if(input.schema!=='certscore.full-evidence.v2'||doc.exportContent.version!==input.schema||binding?.scanId!==b.scanId||binding?.sourceHash!==b.sourceHash||binding?.projectionVersion!==b.generation)throw Error('Full package generation mismatch');
 }
 if(input.view==='full'&&!['report_display_content','full_customer_evidence'].includes(doc.exportContent?.scope))throw Error('Not a full report display export');
}
function metricSamples(row:any,id:string,metrics:string[]):ValueSample[]{
 return metrics.flatMap(metric=>{
  const isQuantity=Object.hasOwn(row.measurements??{},metric),raw=isQuantity?row.measurements[metric]:own(row.states,metric);
  if(raw===undefined)return [];
  if(isQuantity&&(!Number.isSafeInteger(raw)||raw<0))throw Error('Invalid nonnegative measurement');
  let value=raw;
  if(/\.click_completed$/.test(id))value=raw==='completed'?true:raw==='incomplete'?false:raw;
  const source=row.metricSources?.[metric]??(metric.startsWith('sealed.')?'unavailable_sealed_assessment':/^(site|technology|graph|form)\./.test(metric)?'unavailable_sealed_projection':row.defaultSource);
  return [{recordKey:metric,value,qualification:String(source??'unavailable_source'),availability:/\.click_completed$/.test(id)&&raw==='not_attempted'?'not_assessed':/\.click_completed$/.test(id)&&raw==='unsupported'?'unsupported_version':availability(raw)}];
 });
}
function nativeSamples(doc:any,id:string,view:EvidenceView):ValueSample[]{
 const extra=extraNativeSamples(doc,id,view);if(extra!==undefined)return extra;
 const values:ValueSample[]=[];const add=(recordKey:string,value:any,qualification:string)=>{if(value!==undefined&&value!==null)values.push({recordKey,value,qualification,availability:availability(value)});};
 const path=mappingFor(id).views.report.paths[0]??mappingFor(id).views.standard.paths[0]!;
 if(id==='gpc.delivery.http_header'||id==='gpc.delivery.navigator'){
  const bound=gpcVerificationScopes(doc).find(s=>s.recordKey==='bounded_main_document');
  if(!bound)return [];
  if(bound.availability!=='available')return [{...bound,recordKey:'scope'}];
  const delivery=bound.value as {httpHeader:boolean;navigator:boolean};
  add('scope',id.endsWith('http_header')?delivery.httpHeader:delivery.navigator,bound.qualification);
 }else if(path?.startsWith('gpcResponse → pairedGpcAudit/')){
  const g=doc.gpcResponse?.assessment?{...doc.gpcResponse.assessment,activityComparison:doc.gpcResponse.activityComparison,cmpStateComparison:doc.gpcResponse.cmpStateComparison}:doc.gpcResponse;
  const checked=pairedGpcAudit({...doc,scanId:doc.scan?.id??doc.scanId,gpcResponse:g});
  const metric=path.split('pairedGpcAudit/')[1]!;const value=checked.measurements[metric]??checked.states[metric];
  const qualifier=metric.startsWith('gpc.session.')||metric.includes('session_')?checked.sessionScope:metric.includes('cmp')||metric.includes('_transition')?checked.cmpScope:checked.scope;
  add(metric,value,'shared-gpc/'+qualifier);
 }else if(id.startsWith('gpc.cmp_pair.')){
  const checked=pairedGpcAudit({...doc,scanId:doc.scanId??doc.scan?.id});
  if(checked.states['detail.gpc.paired_cmp']!=='available')return [{recordKey:'scope',value:null,qualification:checked.cmpScope,availability:checked.states['detail.gpc.paired_cmp']==='invalid_or_unbound'?'invalid_or_unbound':'not_retained'}];
  add('scope',get(doc,mappingFor(id).views.standard.paths[0]!),checked.cmpScope+'/'+stableValue(doc.gpcResponse.cmpStateComparison.sourceHashes));
 }else if(id.startsWith('collection.field.')||id.startsWith('collection.form.')||id.startsWith('collection.snapshot.')){
  if(Array.isArray(doc.collectionTableRows)&&doc.collectionTableRows.length===0)return [{recordKey:'@inventory',value:[],qualification:'collection-surface-form.v1/explicit_empty_inventory',availability:'empty_inventory'}];
  for(const row of doc.collectionTableRows??[]){
   const form=collectionSurfaceFormSchema.parse(row.form);
   if(!row.id||!row.capturedAt)throw Error('Missing form capture identity');
   const key=stableValue([row.id,form.pageUrl,form.formRef,row.capturedAt,row.capturePhase??'before',row.captureProvenance??null]);
   const scope='collection-surface-form.v1/'+stableValue({candidate:form.candidateFieldCount,retained:form.retainedFieldCount,truncated:form.fieldsTruncated,limited:row.captureLimited??null});
   if(id.startsWith('collection.field.'))for(const field of form.fields){
    const name=id.split('.').at(-1)!;const value=name==='state'?{disabled:field.disabled,readOnly:field.readOnly}:own(field,({input_type:'inputType',semantic_category:'semanticCategory'} as Record<string,string>)[name]??name);
    add(key+'/'+field.fieldRef,value,scope);
   }else if(id.startsWith('collection.form.'))add(key,own(form,({method:'method',action_host:'actionHostname',action_relationship:'actionRelationship',evidence_refs:'evidenceRefs'} as Record<string,string>)[id.split('.').at(-1)!]!),scope);
   else add(key,id.endsWith('.status')?row.snapshot?.status:row.snapshot?.url,scope);
  }
 }else if(id.startsWith('page.')&&id!=='page.industry'){
  if(!doc.siteMetadata)return [];
  const parsed=siteMetadataProjectionSchema.parse(doc.siteMetadata);const name=id.split('.').at(-1)!;
  add('scope',name==='platform'||name==='version'?describeSiteTechnology(parsed.observation)[name]:own(parsed.observation,name),parsed.contractVersion+'/'+parsed.sourceHash+'/'+parsed.documentUrl+'/'+parsed.capturedAtMs);
 }else if(/^consent\.(accept|reject)\.(execution_status|click_completed)$/.test(id)){
  const action=id.split('.')[1]!,raw=doc[action+'Path']?.execution;if(raw===undefined)return [];
  const execution=choicePathExecutionSchema.parse(raw);add('scope',id.endsWith('.click_completed')?execution.clickCompleted:execution.status,'choice-path-execution/'+execution.policyVersion);
 }else if(id.startsWith('consent.cmp.criterion.')){
  if(!doc.cmpAudit)return [];const cmp=publicCmpAuditSchema.parse(doc.cmpAudit);if(cmp.scanId!==doc.scan.id||!['cmp_audit_report.v1','cmp_audit_report.v2','cmp_audit_report.v3'].includes(cmp.version)||!cmp.assessmentSourceHash)throw Error('Unbound CMP criterion');
  const matches=cmp.rows.filter((r:any)=>r.id===id.split('.').at(-1));if(matches.length>1)throw Error('Duplicate criterion identity');
  add('scope',matches[0]?.status,cmp.version+'/'+cmp.assessmentSourceHash);
 }else if(id.startsWith('privacy.')&&path?.startsWith('californiaPrivacyReview')){
  if(!doc.californiaPrivacyReview)return [];const review=californiaPrivacyReviewSchema.parse(doc.californiaPrivacyReview);if(review.scanId!==doc.scan.id)throw Error('Privacy assessment scan mismatch');
  add('scope',get({californiaPrivacyReview:review},path),review.contractVersion+'/'+review.policyVersion+'/'+review.sourceHash+'/'+review.documentUrl+'/'+review.capturedAt);
 }else {
  const value=get(doc,path),type=masterFieldForLegacy(id).valueContract.type;
  if(value!==undefined&&value!==null){if(['count','milliseconds'].includes(type)&&(!Number.isSafeInteger(value)||value<0))throw Error('Invalid native quantity');if(['state','text'].includes(type)&&typeof value!=='string')throw Error('Invalid native state/text');}
  add('scope',value,'report-display-native/'+path);
 }
 const keys=values.map(v=>v.recordKey);if(new Set(keys).size!==keys.length)throw Error('Duplicate record identity');return values;
}
export function adaptMasterView(input:ViewInput):AdaptedView{
 let doc=JSON.parse(Buffer.from(input.bytes).toString('utf8'));checkBinding(input,doc);
 let nestedStandard:AdaptedView|undefined;
 if(input.view==='full'&&input.schema==='certscore.full-evidence.v2'){
  verifyFullEvidenceExport(doc);
  const bytes=Buffer.from(JSON.stringify(doc.standardEvidence));nestedStandard=adaptMasterView({view:'standard',schema:doc.standardEvidence?.meta?.projectionVersion,bytes,sha256:hash(bytes),binding:input.binding});
 }
 if(input.view==='full')doc=resolveReportReferences(doc);
 const supported=(MASTER_VALUE_MAPPINGS.supportedSchemas[input.view] as string[]).includes(input.schema);
 const row=input.view==='standard'&&supported?extractExportRow(doc,{file:'immutable-input',sha256:input.sha256,role:'hash_verified_bot_archive_export'}):doc;
 const fields=MASTER_CATALOG.fields.map(f=>{
  const route=mappingFor(f.legacyId).views[input.view];
  const nested=nestedStandard?.fields.find(n=>n.legacyId===f.legacyId);if(nested&&!f.legacyId.startsWith('integrity.')&&['metric','native'].includes(mappingFor(f.legacyId).views.standard.mode))return {...nested,reason:'Full v2 retains this unchanged standard evidence value at /standardEvidence. '+nested.reason};
  const base={legacyId:f.legacyId,masterFieldId:f.id,reason:route.reason};
  if(!supported)return {...base,status:'unsupported_version',samples:[]};
  if(route.mode!=='native'&&route.mode!=='metric')return {...base,status:route.mode,samples:[]};
  try{
   const valueDoc=nestedStandard?(doc.reportViews?.[/^(privacy|gpc)\./.test(f.legacyId)?'ccpa_cpra':'gdpr_eprivacy']??doc):doc;
   const samples=route.mode==='metric'?metricSamples(row,f.legacyId,route.paths):nativeSamples(valueDoc,f.legacyId,input.view);
   if(nested&&f.legacyId.startsWith('integrity.'))samples.push(...nested.samples); // Keep standard metrics and scoped report records distinct, including their units/qualifiers.
   if(input.view==='standard'&&f.legacyId==='gpc.delivery.verification')samples.push(...gpcVerificationScopes(doc));
   // All four views retain the exact ScanFormsSummary.totalObserved count. This explicit equivalence is for field parity only, never trend/rate aggregation.
   if(f.legacyId==='collection.forms.observed_count')for(const sample of samples){if(route.mode==='native'||sample.qualification.startsWith('public_export/')){sample.recordKey='forms.observed';sample.comparisonScope='scan-forms-summary.totalObserved.v1';}}
   return {...base,status:samples.length?'evaluated':'not_retained',samples};
  }catch(error){return {...base,status:'invalid_or_unbound',reason:String(error),samples:[]};}
 });return {view:input.view,binding:input.binding,sha256:input.sha256,fields};
}
export function compareMasterViews(a:AdaptedView,b:AdaptedView){
 if(stableValue(a.binding)!==stableValue(b.binding))throw Error('Conflicting scan, generation, creator or source bindings');
 return a.fields.map(left=>{
  const right=b.fields.find(f=>f.masterFieldId===left.masterFieldId);if(!right)throw Error('Incomplete master view');
  const comparable=left.samples.filter(l=>l.availability==='available').flatMap(l=>right.samples.filter(r=>r.availability==='available'&&r.recordKey===l.recordKey&&(r.qualification===l.qualification||(l.comparisonScope!==undefined&&l.comparisonScope===r.comparisonScope))).map(r=>({recordKey:l.recordKey,qualification:l.qualification,equal:stableValue(l.value)===stableValue(r.value)})));
  const unmatched=left.samples.length+right.samples.length-2*comparable.length;
  return {legacyId:left.legacyId,masterFieldId:left.masterFieldId,status:comparable.some(c=>!c.equal)?'mismatch':comparable.length?unmatched?'partial_match':'match':'not_comparable',comparisons:comparable.length,unmatched,details:comparable,leftStatus:left.status,rightStatus:right.status};
 });
}
