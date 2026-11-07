import assert from 'node:assert/strict';import test from 'node:test';import {createHash} from 'node:crypto';
import {adaptMasterView,compareMasterViews,resolveReportReferences,type ViewInput,type Binding} from './audit-master-values';
import {MASTER_VALUE_MAPPINGS} from './audit-master-value-mappings';
import {buildReportDisplayExport} from '../../apps/web/lib/api-v2/report-display-export';
const binding:Binding={scanId:'11111111-1111-4111-8111-111111111111',createdAt:'2026-11-06T12:00:00.000Z',generation:'scan-report-projection-v27',sourceHash:'a'.repeat(64),creatorIdentity:'fixture-original-creator'};
const input=(view:ViewInput['view'],doc:any):ViewInput=>{const bytes=Buffer.from(JSON.stringify(doc));return {view,bytes,sha256:createHash('sha256').update(bytes).digest('hex'),binding,schema:{standard:'pulse-public-v11',report:'scan-report-display.local.v1',full:'report_display_content.local.v1',audit:'certscore.mac-mini-daily-progress.v5'}[view]};};
const form={formRef:'form-1',structure:'native_form',surfaceType:'contact',pageUrl:'https://fixture.test/',method:'post',actionRelationship:'self',candidateFieldCount:1,retainedFieldCount:1,fieldsTruncated:false,fields:[{fieldRef:'field-1',elementType:'input',inputType:'email',semanticCategory:'email',label:'Email',required:false,disabled:true,readOnly:false,evidenceRefs:[],confidence:0.7,directVsInferred:'direct'}],evidenceRefs:[],confidence:1,directVsInferred:'direct'};
const report=()=>({scan:{id:binding.scanId,createdAtIso:binding.createdAt,benchmark:'Context only'},reviewFocus:'all',collectionTableRows:[{id:'row1',form:structuredClone(form),capturedAt:binding.createdAt,snapshot:{status:'unavailable'}}],consentVendor:'CMP fixture',siteMetadata:{contractVersion:'certscore.site-metadata-projection.v1',sourceHash:'b'.repeat(64),documentUrl:'https://fixture.test/',evidenceRef:'fixture',capturedAtMs:10,observation:{contractVersion:'certscore.site-metadata.v1',title:'Fixture',language:'en',generators:['Ghost 5.1'],wordpressAssetObserved:false}}});
const field=(view:ReturnType<typeof adaptMasterView>,id:string)=>view.fields.find(f=>f.legacyId===id)!;
test('every v2 field has four explicit value routes without promoting gaps to implementations',()=>{
 assert.equal(MASTER_VALUE_MAPPINGS.items.length,231);for(const item of MASTER_VALUE_MAPPINGS.items)assert.deepEqual(Object.keys(item.views),['report','standard','full','audit']);
 assert.equal(MASTER_VALUE_MAPPINGS.items.find(i=>i.legacyId==='consent.accept.terminal_verification')!.views.full.mode,'summary_only');
});
test('actual report serializer preserves native form values and page metadata under parity',()=>{
 const r=report();const full=buildReportDisplayExport(r,{scanId:binding.scanId});
 const a=adaptMasterView(input('report',r)),b=adaptMasterView(input('full',full));
 for(const id of ['collection.field.confidence','collection.field.state','collection.field.required','collection.form.method','page.title','page.language']){
  assert.equal(field(a,id).status,'evaluated',id);assert.equal(compareMasterViews(a,b).find(f=>f.legacyId===id)!.status,'match',id);
 }
 assert.deepEqual(field(a,'collection.field.state').samples[0]!.value,{disabled:true,readOnly:false});
 assert.equal(field(a,'collection.field.confidence').samples[0]!.value,0.7);
 assert.equal(field(a,'collection.field.required').samples[0]!.value,false);
 const mutated=structuredClone(full) as any;mutated.collectionTableRows[0].form.fields[0].confidence=0.8;
 assert.equal(compareMasterViews(a,adaptMasterView(input('full',mutated))).find(f=>f.legacyId==='collection.field.confidence')!.status,'mismatch');
});
test('missing, malformed, and duplicate records never become matching zero/absence',()=>{
 const r=report();r.collectionTableRows[0]!.form.fields[0]!.confidence=2;
 assert.equal(field(adaptMasterView(input('report',r)),'collection.field.confidence').status,'invalid_or_unbound');
 const duplicate=report();duplicate.collectionTableRows.push(duplicate.collectionTableRows[0]!);
 assert.equal(field(adaptMasterView(input('report',duplicate)),'collection.field.confidence').status,'invalid_or_unbound');
 const a=adaptMasterView(input('report',{scan:{id:binding.scanId}}));
 assert.equal(compareMasterViews(a,a).find(f=>f.legacyId==='collection.field.confidence')!.status,'not_comparable');
});
test('record order does not create false differences and partial inventories stay separate',()=>{
 const r=report();r.collectionTableRows.push({...structuredClone(r.collectionTableRows[0]!),id:'row2'});
 const s=structuredClone(r);s.collectionTableRows.reverse();
 const a=adaptMasterView(input('report',r));assert.equal(compareMasterViews(a,adaptMasterView(input('report',s))).find(f=>f.legacyId==='collection.field.confidence')!.status,'match');
 s.collectionTableRows[0]!.form.fieldsTruncated=true;s.collectionTableRows[0]!.form.candidateFieldCount=2;
 assert.equal(compareMasterViews(a,adaptMasterView(input('report',s))).find(f=>f.legacyId==='collection.field.confidence')!.status,'partial_match');
});
test('changed bytes and cross-generation/creator bindings reject parity',()=>{
 const i=input('report',report());assert.throws(()=>adaptMasterView({...i,sha256:'0'.repeat(64)}),/Changed source bytes/);
 assert.throws(()=>adaptMasterView({...i,binding:{...binding,scanId:'22222222-2222-4222-8222-222222222222'}}),/Scan binding/);
 const a=adaptMasterView(i);for(const key of ['sourceHash','generation','creatorIdentity','createdAt'])assert.throws(()=>compareMasterViews(a,{...a,binding:{...binding,[key]:'different'}}),/Conflicting/);
 assert.equal(field(adaptMasterView({...i,schema:'future-version'}),'page.title').status,'unsupported_version');
});
test('full export references resolve with bounded same-document identity and reject unsafe pointers',()=>{
 assert.deepEqual(resolveReportReferences({'a/b':{value:0},ref:{reportContentRef:'/a~1b'}}).ref,{value:0});
 for(const ref of ['/missing','/__proto__','/constructor','/a~2b'])assert.throws(()=>resolveReportReferences({ref:{reportContentRef:ref}}));
 assert.throws(()=>resolveReportReferences({a:{reportContentRef:'/b'},b:{reportContentRef:'/a'}}),/Cyclic/);
});
test('display confirmation is never promoted to initial registration or terminal verification',()=>{
 const a=adaptMasterView(input('report',{scan:{id:binding.scanId},acceptPath:{registrationConfirmed:true}}));
 assert.equal(field(a,'consent.accept.terminal_verification').status,'summary_only');assert.equal(field(a,'consent.accept.initial_registration').status,'summary_only');
});

test('standard and audit preserve measured zero, execution, and missing terminal evidence separately',async()=>{
 const {extractExportRow}=await import('./audit-progress-export');
 const doc={scanId:binding.scanId,scanStatus:'completed',timestamps:{createdAt:binding.createdAt},meta:{projectionVersion:'pulse-public-v11',reportProjectionVersion:binding.generation,reportProjectionSourceHash:binding.sourceHash},formsSummary:{totalObserved:0},postAcceptObservation:{execution:{policyVersion:'choice_path_execution.v1',status:'succeeded',clickCompleted:true,observationCompleted:true,consentConfirmed:false},registrationStatus:'unconfirmed'}};
 const standard=adaptMasterView(input('standard',doc));const row=extractExportRow(doc,{file:'fixture',sha256:'b'.repeat(64),role:'hash_verified_bot_archive_export'});
 const audit=adaptMasterView(input('audit',row));const results=compareMasterViews(standard,audit);
 assert.equal(field(standard,'collection.forms.observed_count').samples[0]!.value,0);
 assert.equal(results.find(r=>r.legacyId==='collection.forms.observed_count')!.status,'match');
 assert.equal(field(standard,'consent.accept.initial_registration').samples[0]!.value,'unconfirmed');
 assert.equal(field(standard,'consent.accept.terminal_verification').samples[0]!.availability,'not_retained');
 assert.equal(results.find(r=>r.legacyId==='consent.accept.terminal_verification')!.status,'not_comparable');
 row.measurements!['forms.observed']=1;assert.equal(compareMasterViews(standard,adaptMasterView(input('audit',row))).find(r=>r.legacyId==='collection.forms.observed_count')!.status,'mismatch');
});
test('CMP snapshot arms use shared strict source bindings; a changed source never supplies a value',async()=>{
 const {gpcProductFixture}=await import('../../apps/web/lib/scans/test-fixtures/gpc-product');const f=gpcProductFixture({scanId:binding.scanId});
 const scanId=f.assessment.observation.scanId!;const doc={scanId,scanStatus:'completed',timestamps:{createdAt:binding.createdAt},meta:{projectionVersion:'pulse-public-v11',reportProjectionVersion:binding.generation,reportProjectionSourceHash:binding.sourceHash},gpcResponse:{...f.assessment,cmpStateComparison:f.cmpStateComparison}};
 const i={...input('standard',doc),binding:{...binding,scanId}};const standard=adaptMasterView(i);assert.equal(field(standard,'gpc.delivery.http_header').samples[0]!.value,true);
 for(const side of ['baseline','gpc'] as const)for(const axis of ['sale','sharing'] as const)assert.equal(field(standard,`gpc.cmp_pair.${side}.${axis}`).samples[0]!.value,f.cmpStateComparison![side][axis]);
 const broken=structuredClone(doc);broken.gpcResponse.cmpStateComparison!.sourceHashes.gpc='0'.repeat(64);
 const invalid=adaptMasterView({...input('standard',broken),binding:{...binding,scanId}});
 assert.equal(field(invalid,'gpc.cmp_pair.baseline.sale').samples[0]!.availability,'invalid_or_unbound');
 assert.equal(field(invalid,'gpc.cmp_pair.baseline.sale').samples[0]!.value,null);
});
test('one native observed-form count reconciles across all four real output shapes',async()=>{
 const {extractExportRow}=await import('./audit-progress-export');
 const r={...report(),formsSummary:{totalObserved:0,countStatus:'captured',preConsentCapture:'complete',afterAcceptCapture:'not_requested'}};
 const standard={scanId:binding.scanId,scanStatus:'completed',timestamps:{createdAt:binding.createdAt},meta:{projectionVersion:'pulse-public-v11',reportProjectionVersion:binding.generation,reportProjectionSourceHash:binding.sourceHash},formsSummary:r.formsSummary};
 const row=extractExportRow(standard,{file:'fixture',sha256:'b'.repeat(64),role:'hash_verified_bot_archive_export'});
 const views=[adaptMasterView(input('report',r)),adaptMasterView(input('full',buildReportDisplayExport(r,{scanId:binding.scanId}))),adaptMasterView(input('standard',standard)),adaptMasterView(input('audit',row))];
 for(let i=0;i<4;i++)for(let j=i+1;j<4;j++)assert.equal(compareMasterViews(views[i]!,views[j]!).find(f=>f.legacyId==='collection.forms.observed_count')!.status,'match',views[i]!.view+'/'+views[j]!.view);
});
test('full v2 reads the preserved standard packet without changing legacy full-file behavior',async()=>{
 const {buildFullEvidenceExport}=await import('../../apps/web/lib/api-v2/full-evidence-export');
 const standard={type:'certscore_pulse_evidence',scanId:binding.scanId,scanStatus:'completed',timestamps:{createdAt:binding.createdAt},meta:{projectionVersion:'pulse-public-v11',reportProjectionVersion:binding.generation,reportProjectionSourceHash:binding.sourceHash,detail:'evidence',evidenceSafety:'bounded_structured_public_evidence'},formsSummary:{totalObserved:0}};
 const view=(reviewFocus:'gdpr_eprivacy'|'ccpa_cpra')=>buildReportDisplayExport({...report(),reviewFocus},{scanId:binding.scanId});
 const full=buildFullEvidenceExport({scanId:binding.scanId,sourceHash:binding.sourceHash,projectionVersion:binding.generation,standardEvidence:standard,defaultFocus:'gdpr_eprivacy',reportViews:{gdpr_eprivacy:view('gdpr_eprivacy'),ccpa_cpra:view('ccpa_cpra')}});
 const adapted=adaptMasterView({...input('full',full),schema:'certscore.full-evidence.v2'});
 assert.equal(field(adapted,'collection.forms.observed_count').samples[0]!.value,0);
 assert.equal(compareMasterViews(adaptMasterView(input('standard',standard)),adapted).find(r=>r.legacyId==='collection.forms.observed_count')!.status,'match');
 const corrupt=structuredClone(full);corrupt.standardEvidence.formsSummary.totalObserved=9;
 assert.throws(()=>adaptMasterView({...input('full',corrupt),schema:'certscore.full-evidence.v2'}),/component receipt/);
 assert.throws(()=>adaptMasterView({...input('full',{...full,exportContent:{...full.exportContent,binding:{...full.exportContent.binding,sourceHash:'f'.repeat(64)}}}),schema:'certscore.full-evidence.v2'}),/generation mismatch/);
});
test('terminal catalog retains historical sealed witnesses independently of public and new query series',()=>{
 const row={scanId:binding.scanId,createdAt:binding.createdAt,projectionVersion:binding.generation,publicProjectionSourceHash:binding.sourceHash,
  states:{'terminal.accept':'unavailable','sealed.terminal.accept':'verified','sealed.terminal.audit_accept':'unavailable'},
  metricSources:{'terminal.accept':'public_export/pulse-public-v11/scan-report-projection-v27','sealed.terminal.accept':'sealed_assessment/retained-original-generation','sealed.terminal.audit_accept':'sealed_assessment/audit-priority-v1'},measurements:{}};
 const values=field(adaptMasterView(input('audit',row)),'consent.accept.terminal_verification').samples;
 assert.equal(values.length,3);assert.equal(values.find(v=>v.recordKey==='sealed.terminal.accept')!.value,'verified');
 assert.equal(new Set(values.map(v=>v.qualification)).size,3);
 assert.equal(values.filter(v=>v.availability==='available').length,1);
});
