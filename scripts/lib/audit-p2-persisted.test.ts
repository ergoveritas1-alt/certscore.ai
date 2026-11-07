import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {loadPersistedP2Sources,persistedP2Fields,PERSISTED_P2_IDS} from './audit-p2-persisted';
import {createP2Coverage} from './audit-p2-coverage';
import {normalizeProjectionJson} from '../../apps/web/server/scans/scan-report-projection-contract';
import consentFixture from '../../apps/web/lib/scans/test-fixtures/dollar-general-consent-assessment.json';
const hash=(b:string|Uint8Array)=>createHash('sha256').update(b).digest('hex');
function fixture(){
 const root=mkdtempSync(path.join(tmpdir(),'p2-persisted-')),scanId=consentFixture.assessment.scan.scanId,createdAt='2026-10-31T12:00:00Z';
 const save=(name:string,value:any)=>{const bytes=Buffer.from(JSON.stringify(value)),file=path.join(root,name);writeFileSync(file,bytes);return {file,bytes:bytes.length,sha256:hash(bytes)};};
 const bundle=save('bundle.json',{scanId,policySurfaceObservations:[]}),manifest=save('manifest.json',{scanId,auxiliaryArtifacts:[],privacyCaptureProfile:'presence_only_six_workers.v1'});
 const original=[{...bundle,kind:'scanArtifactUri',uri:'s3://fixture/bundle'},{...manifest,kind:'manifestUri',uri:'s3://fixture/manifest'}];
 const assessment:any=structuredClone(consentFixture.assessment);
 assessment.californiaPrivacyReview={contractVersion:'certscore.california-privacy-review.v1',policyVersion:'california-privacy-review.v1',scanId,documentUrl:assessment.scan.finalUrl,capturedAt:createdAt,sourceHash:bundle.sha256,verificationStatus:'verified',scoreEffect:'none',applicability:'not_determined',inspection:null,choiceSurface:'unknown',controls:[],controlsTruncated:false,optOutEffectiveness:'not_assessed',noticeAdequacy:'not_assessed',noticeTopics:[],noticeEvidenceRefs:[]};
 const pageUrl='https://example.test/';
 const form:any={contractVersion:'certscore.collection-surface-assessment.v1',scanId,assessedAt:createdAt,assessmentStatus:'observed',sourceInventoryContractVersion:'certscore.collection-surface-inventory.v1',sourceHash:'c'.repeat(64),sourceLane:'runtime_evidence',pageUrl,productionProjectable:true,limitationKeys:[],evidenceRefs:[],coverage:{status:'complete',documentScope:'main_document',interactionMode:'none',candidateFormCount:1,retainedFormCount:1,candidateFieldCount:2,retainedFieldCount:2,inspectedFormCandidateCount:1,inspectedFieldCandidateCount:2,candidateScanTruncated:false,retentionTruncated:false,reasonCodes:[]},forms:[{formRef:'form_0',structure:'native_form',surfaceType:'newsletter',pageUrl,method:'post',actionRelationship:'self',candidateFieldCount:2,retainedFieldCount:2,fieldsTruncated:false,confidence:1,directVsInferred:'direct',evidenceRefs:[],fields:[0,1].map(i=>({fieldRef:'field_'+i,elementType:'input',inputType:'email',semanticCategory:'email',label:'Email',required:false,disabled:false,readOnly:false,evidenceRefs:[],confidence:1,directVsInferred:'direct'}))}]};
 const payload:any={scan:{id:scanId,createdAt,status:'completed'},snapshot:{consentControlAssessment:assessment},canonicalReportProjection:{collectionSurfaceAssessment:form},events:[{eventType:'v2_lambda_result.received',metadataJson:{artifactMetadata:Object.fromEntries(original.map(r=>[r.kind,{sha256:r.sha256,sizeBytes:r.bytes}])),artifactPointers:Object.fromEntries(original.map(r=>[r.kind,r.uri]))}}]};
 const origin={scanId,originalRequestId:'pulse_req_fixture',isMacMini:true,isCanary:false,publicationRequestStatus:'completed'};
 const originRef=save('bot-origins.json',{version:'certscore.audit-bot-origin.v1',readOnly:true,rows:[origin]});
 const ancestry=save('receipts.json',{version:'certscore.audit-retained-artifacts.v1',scanId,root,receipts:original});
 const snapshot=()=>{const serialized=JSON.stringify(normalizeProjectionJson(payload));return {scan_id:scanId,report_projection_status:'ready',report_projection_version:'scan-report-projection-v27',report_projection_source_hash:'a'.repeat(64),report_projection_payload:payload,report_projection_payload_sha256:hash(serialized),report_projection_payload_size_bytes:Buffer.byteLength(serialized)};};
 const row:any={scanId,createdAt,reportable:true,publicProjectionSourceHash:'a'.repeat(64),projectionVersion:'scan-report-projection-v27',originProof:'original_credential_verified',originRequestId:origin.originalRequestId,refs:[]};
 const data:any={rows:[row],sources:[originRef],retainedReports:[]};
 const refresh=()=>{const s=snapshot(),ref=save('snapshot.json',s);row.refs=[{...ref,role:'checksum_verified_projection'},...original.map(o=>({file:o.file,sha256:o.sha256,role:o.kind}))];data.retainedReports=[{...save('retained.json',{...origin,created_at:createdAt,snapshot:s}),artifacts:ancestry}];};refresh();
 return {data,row,payload,form,assessment,bundle,manifest,save,refresh,snapshot,origin,ancestry};
}
test('both existing receipt formats reconcile once per scan and never reconstruct CMP or customer views',()=>{
 const f=fixture(),result=loadPersistedP2Sources(f.data);assert.equal(result.byScan.size,1);assert.equal(result.summary.consistentDuplicateSources,1);
 const source=result.byScan.get(f.row.scanId)!;assert.deepEqual(source.fields.map(f=>f.legacyId),PERSISTED_P2_IDS);assert.ok(source.fields.every(f=>!f.legacyId.startsWith('consent.')));
 assert.equal(source.fields.find(f=>f.legacyId==='privacy.california.assessment')!.samples.length,1);
 assert.equal(source.fields.find(f=>f.legacyId==='privacy.california.coverage')!.samples.length,0); // v1 has no coverage child.
 const p=createP2Coverage();p.add(f.row,[],{},source);const i=p.finish().items.find(i=>i.legacyId==='privacy.california.assessment')!;
 assert.equal(i.availableScans,1);assert.equal(i.groups[0]!.sourceView,'persisted_assessment');assert.equal(i.aggregateRate,null);assert.equal(i.groups[0]!.facets.choiceSurface!.unknown,1);
 assert.equal(p.finish().items.find(i=>i.legacyId==='consent.cmp.criterion.banner'),undefined,'report display duplicate is not a separate audit requirement');
});
test('source checksum, original ancestry, creator and payload checks fail closed',()=>{
 const changed=fixture();writeFileSync(changed.data.retainedReports[0].file,'changed');assert.throws(()=>loadPersistedP2Sources(changed.data),/receipt mismatch/);
 const ancestry=fixture();writeFileSync(ancestry.bundle.file,'changed');assert.throws(()=>loadPersistedP2Sources(ancestry.data),/checksum|receipt/);
 const creator=fixture();creator.row.originRequestId='pulse_req_other';assert.throws(()=>loadPersistedP2Sources(creator.data),/creator conflict/);
 const payload=fixture();const s=payload.snapshot();s.report_projection_payload_sha256='f'.repeat(64);payload.data.retainedReports=[{...payload.save('wrong.json',{...payload.origin,created_at:payload.row.createdAt,snapshot:s}),artifacts:payload.ancestry}];assert.throws(()=>loadPersistedP2Sources(payload.data),/payload checksum/);
});
test('old generations and missing current source bindings cannot supplement the current cohort',()=>{
 const f=fixture();f.row.publicProjectionSourceHash='b'.repeat(64);let r=loadPersistedP2Sources(f.data);assert.equal(r.byScan.size,0);assert.equal(r.summary.rejected.generation_or_time_mismatch,2);
 delete f.row.publicProjectionSourceHash;r=loadPersistedP2Sources(f.data);assert.equal(r.byScan.size,0);assert.equal(r.summary.rejected.current_export_source_binding_missing,2);
});
test('conflicting aliases and same-generation values block rather than selecting a convenient source',()=>{
 const aliases=fixture();aliases.payload.snapshot.consent_control_assessment={...aliases.assessment,assessmentStatus:'different'};aliases.refresh();assert.throws(()=>loadPersistedP2Sources(aliases.data),/Conflicting generation-bound/);
 const conflict=fixture();const field=conflict.form.forms[0].fields[0];field.required=!field.required;
 conflict.data.retainedReports=[{...conflict.save('conflicting.json',{...conflict.origin,created_at:conflict.row.createdAt,snapshot:conflict.snapshot()}),artifacts:conflict.ancestry}];assert.throws(()=>loadPersistedP2Sources(conflict.data),/conflicting retained values/);
});
test('unknown field and destination values stay distinct from known booleans and record denominators',()=>{
 const f=fixture();for(const form of f.form.forms){form.actionRelationship='unknown';for(const field of form.fields){field.semanticCategory='unknown';field.required=false;field.disabled=true;field.readOnly=true;}}f.refresh();
 const source=loadPersistedP2Sources(f.data).byScan.get(f.row.scanId)!;const p=createP2Coverage();p.add(f.row,[],{},source);
 const items=p.finish().items,unknown=items.find(i=>i.legacyId==='collection.field.semantic_category')!,required=items.find(i=>i.legacyId==='collection.field.required')!;
 assert.ok(unknown.retainedRecords>0);assert.equal(unknown.records,0);assert.equal(unknown.unknownRecords,unknown.retainedRecords);assert.equal(unknown.availableScans,0);assert.equal(unknown.scansWithRecords,1);
 assert.equal(required.records,unknown.retainedRecords);assert.equal(required.availableScans,1);assert.equal(required.groups.reduce((n,g)=>n+(g.values.false??0),0),required.records);
 assert.equal(items.find(i=>i.legacyId==='collection.field.state')!.groups[0]!.values['disabled=true;readOnly=true']!>0,true);
});
test('complete empty inventories count separately; limited and not-testable zero records are not measured empty',()=>{
 const f=fixture();f.form.forms=[];f.form.assessmentStatus='not_observed';Object.assign(f.form.coverage,{status:'complete',retainedFormCount:0,retainedFieldCount:0,candidateFormCount:0,candidateFieldCount:0,retentionTruncated:false,candidateScanTruncated:false});f.refresh();
 const check=()=>{const p=createP2Coverage();p.add(f.row,[],{},loadPersistedP2Sources(f.data).byScan.get(f.row.scanId));return p.finish().items.find(i=>i.legacyId==='collection.field.required')!;};
 let i=check();assert.equal(i.emptyInventoryScans,1);assert.equal(i.records,0);assert.equal(i.scansWithRecords,0);
 f.form.assessmentStatus='not_testable';f.form.coverage.retainedFormCount=1;f.form.coverage.retainedFieldCount=2;f.refresh();i=check();assert.equal(i.emptyInventoryScans,0);assert.equal(i.availableScans,0);
 f.form.assessmentStatus='limited';f.form.coverage.status='limited';f.form.coverage.retainedFormCount=0;f.form.coverage.retainedFieldCount=0;f.refresh();i=check();assert.equal(i.emptyInventoryScans,0);assert.equal(i.availableScans,0);
});
test('California child original hash and form record identity must remain bound',()=>{
 const f=fixture();f.assessment.californiaPrivacyReview.sourceHash='b'.repeat(64);assert.throws(()=>persistedP2Fields(f.payload,f.row.scanId,f.bundle.sha256),/California original source/);
 const duplicate=fixture();duplicate.form.forms.push(structuredClone(duplicate.form.forms[0]));assert.throws(()=>persistedP2Fields(duplicate.payload,duplicate.row.scanId,duplicate.bundle.sha256),/form identity/);
 const invalid=fixture();invalid.assessment.californiaPrivacyReview.contractVersion='unsupported';const p=persistedP2Fields(invalid.payload,invalid.row.scanId,invalid.bundle.sha256);assert.equal(p.fields.find(f=>f.legacyId==='privacy.california.assessment')!.status,'invalid_or_unbound');
});
