import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {createP2Coverage,P2_AUDIT_IDS} from './audit-p2-coverage';
import {adaptMasterView,type ViewInput,type AdaptedView} from './audit-master-values';
import {COVERAGE_MATRIX} from './audit-progress-coverage-matrix';
import {gpcProductFixture} from '../../apps/web/lib/scans/test-fixtures/gpc-product';
import {reportRequestScanFixture} from '../../apps/web/server/scans/report-forms.fixture';
import {siteIntegrityProjectionFixture} from '../../packages/certscore-contracts/src/site-integrity.fixture';
import {buildTimelineReportModel} from '../../apps/web/components/scans/report-lab/timeline-report-model';
import {buildFullEvidencePackage} from '../../apps/web/lib/api-v2/full-evidence-package';
import {extraNativeSamples} from './audit-master-native-values';
import {publicSiteIntegritySchema} from './audit-public-site-integrity';
const scanId='00000000-0000-4000-8000-000000000001',createdAt='2026-11-06T12:00:00Z',sourceHash='a'.repeat(64);
function adapt(doc:any,view:ViewInput['view']='standard',schema='pulse-public-v11'){
 const bytes=Buffer.from(JSON.stringify(doc));return adaptMasterView({view,schema,bytes,sha256:createHash('sha256').update(bytes).digest('hex'),binding:{scanId,createdAt,generation:'scan-report-projection-v27',sourceHash,creatorIdentity:'fixture'}});
}
function publicDoc(){const f=gpcProductFixture({scanId});return {scanId,scanStatus:'completed',timestamps:{createdAt},meta:{projectionVersion:'pulse-public-v11',reportProjectionSourceHash:sourceHash,reportProjectionVersion:'scan-report-projection-v27'},gpcResponse:{...f.assessment,cmpStateComparison:f.cmpStateComparison,activityComparison:f.activityComparison}};}
const row={createdAt,originProof:'original_credential_verified'};
test('GPC delivery booleans remain separate; changed binding and missing views remain unavailable',()=>{
 const d=publicDoc(),v=adapt(d),p=createP2Coverage();p.add(row,[v],{standard:'pulse-public-v11'});p.add(row,[],{});
 const item=p.finish().items.find(i=>i.legacyId==='gpc.delivery.http_header')!;assert.equal(item.availableScans,1);assert.equal(item.unavailableScans,1);assert.equal(item.aggregateRate,null);assert.equal(item.groups.find(g=>g.records)?.values.true,1);
 d.gpcResponse.observation.sourceSha256='b'.repeat(64);const changed=adapt(d);assert.notEqual(changed.fields.find(f=>f.legacyId==='gpc.delivery.navigator')!.samples[0]?.availability,'available');
 const scope=v.fields.find(f=>f.legacyId==='gpc.delivery.http_header')!;scope.samples[0]!.value=false;const q=createP2Coverage();q.add(row,[v],{standard:'pulse-public-v11'});assert.equal(q.finish().items.find(i=>i.legacyId===scope.legacyId)!.groups[0]!.values.false,1);
 assert.throws(()=>{const bytes=Buffer.from(JSON.stringify(d));adaptMasterView({view:'standard',schema:'pulse-public-v11',bytes,sha256:'wrong',binding:v.binding});},/Changed source bytes/);
});
test('P2 groups preserve UTC day, source version, policy, creator and field-versus-scan units',()=>{
 const field={legacyId:'collection.field.state',masterFieldId:'test',status:'evaluated',reason:'fixture',samples:[{recordKey:'one',value:{disabled:true,readOnly:true},qualification:'collection-surface-form.v1/limited',availability:'available'},{recordKey:'two',value:{disabled:false,readOnly:true},qualification:'collection-surface-form.v1/limited',availability:'available'}]};
 const v={view:'report',binding:adapt(publicDoc()).binding,sha256:'x',fields:[field]} as AdaptedView;const p=createP2Coverage();p.add(row,[v],{report:'v1'});p.add({...row,createdAt:'2026-11-05T23:00:00Z',originProof:'mac_mini_archive'},[v],{report:'v2'});
 const i=p.finish().items.find(i=>i.legacyId===field.legacyId)!;assert.equal(i.availableScans,2);assert.equal(i.records,4);assert.equal(i.groups.length,2);assert.equal(i.groups[0]!.coverageRate,1);assert.equal(i.aggregateRate,null);assert.equal(i.groups[0]!.values['disabled=true;readOnly=true'],1);
 field.samples=[];field.status='not_retained';const missing=createP2Coverage();missing.add(row,[v],{report:'v1'});assert.equal(missing.finish().items.find(i=>i.legacyId===field.legacyId)!.availableScans,0);
});
test('full-v2 link evidence is readable without reconstructing its private document token',()=>{
 const projection={...structuredClone(siteIntegrityProjectionFixture),scanId};const {documentToken:_,...observation}=projection.observation;const evidence={...projection,observation};
 const doc={scan:{id:scanId},reportEvidence:{siteIntegrity:{findingId:'site_integrity_hidden_outbound_links',evidence}}};
 assert.equal(extraNativeSamples(doc,'integrity.links.inspected_count','full')![0]!.value,projection.observation.inspectedLinks);
 assert.equal(extraNativeSamples(doc,'integrity.links.evidence','full')!.length,projection.observation.links.length);
 assert.equal(publicSiteIntegritySchema.safeParse({...evidence,observation:{...observation,documentToken:'invented'}}).success,false);
 assert.throws(()=>extraNativeSamples({...doc,scan:{id:'wrong'}},'integrity.links.evidence','full'),/mismatch/);
 assert.equal(publicSiteIntegritySchema.safeParse({...evidence,observation:{...observation,links:[observation.links[0],observation.links[0]]}}).success,false);
 assert.deepEqual(extraNativeSamples({scan:{id:scanId}},'integrity.links.evidence','full'),[]);
});
test('real full producer retains field flags and the audit supplement counts forms without submitting or acquiring',()=>{
 const s=reportRequestScanFixture();s.snapshot={...s.snapshot,report_projection_status:'ready',report_projection_source_hash:sourceHash,report_projection_version:'scan-report-projection-v27'} as any;
 s.canonicalReportProjection!.globalUnifiedFindings=[];s.canonicalReportProjection!.ownerUnifiedFindings=[];
 const model=buildTimelineReportModel(s);assert.ok('findings' in model);(model as any).siteIntegrity={findingId:'site_integrity_hidden_outbound_links',title:'Hidden outbound links',description:'Fixture',summary:'Fixture',action:'Review',severity:'high',evidence:{...structuredClone(siteIntegrityProjectionFixture),scanId:s.scan.id}};const doc=buildFullEvidencePackage(s,model),bytes=Buffer.from(JSON.stringify(doc));
 const view=adaptMasterView({view:'full',schema:'certscore.full-evidence.v2',bytes,sha256:createHash('sha256').update(bytes).digest('hex'),binding:{scanId:s.scan.id,createdAt:s.scan.createdAt,generation:'scan-report-projection-v27',sourceHash,creatorIdentity:'fixture'}});
 assert.equal(view.fields.find(f=>f.legacyId==='integrity.links.evidence')!.samples.length,3);assert.equal(view.fields.find(f=>f.legacyId==='integrity.links.inspected_count')!.samples[0]!.value,40);
 const p=createP2Coverage();p.add({createdAt:s.scan.createdAt},[view],{full:'certscore.full-evidence.v2'});const i=p.finish().items.find(i=>i.legacyId==='collection.field.required')!;
 assert.equal(i.availableScans,1);assert.equal(i.records,9);assert.equal(i.groups[0]!.values.false,8);assert.equal(i.groups.reduce((n,g)=>n+(g.values.false??0),0),9);assert.equal(i.groups.length,2);
});
test('P2 badges distinguish accepted subsets, local implementation and the retained coverage reader',()=>{
 const all=COVERAGE_MATRIX.domains.flatMap(d=>d.items),item=(id:string)=>all.find(i=>i.canonicalId===id)!;
 for(const id of P2_AUDIT_IDS){assert.equal(item(id).viewReview.audit!.resolution,['collection.field.input_type','collection.field.required','collection.field.state'].includes(id)?'intentional_subset':'implemented_locally');assert.equal(item(id).valueMapping.views.audit.mode,'retained_aggregate');}
 assert.equal(item('collection.field.required').viewReview.standard!.resolution,'intentional_subset');assert.equal(item('policies.text.local_verification').viewReview.standard!.priority,null);
 assert.equal(item('integrity.links.evidence').viewReview.full!.resolution,'implemented_locally');assert.equal(item('gpc.pair.baseline_opportunity').viewReview.report!.resolution,'implemented_locally');
});

test('privacy assessment stays typed, neutral and separate from its missing later-version subassessments',()=>{
 const review={contractVersion:'certscore.california-privacy-review.v1',policyVersion:'california-privacy-review.v1',scanId,documentUrl:'https://fixture.test/',capturedAt:createdAt,sourceHash:'b'.repeat(64),verificationStatus:'verified',scoreEffect:'none',applicability:'not_determined',inspection:null,choiceSurface:'unknown',controls:[],controlsTruncated:false,optOutEffectiveness:'not_assessed',noticeAdequacy:'not_assessed',noticeTopics:[],noticeEvidenceRefs:[]};
 const doc={scan:{id:scanId},californiaPrivacyReview:review},v=adapt(doc,'report','scan-report-display.local.v1'),p=createP2Coverage();p.add(row,[v],{report:'scan-report-display.local.v1'});
 const all=p.finish().items;assert.equal(all.find(i=>i.legacyId==='privacy.california.assessment')!.availableScans,1);assert.equal(all.find(i=>i.legacyId==='privacy.california.coverage')!.availableScans,0);assert.deepEqual(all.find(i=>i.legacyId==='privacy.california.assessment')!.groups[0]!.values,{});
 review.scanId='wrong';assert.equal(adapt(doc,'report','scan-report-display.local.v1').fields.find(f=>f.legacyId==='privacy.california.assessment')!.status,'invalid_or_unbound');
});

test('baseline and both-zero context appears in Web, PDF and DOCX without hiding later collection',async()=>{
 const {documentFixture}=await import('./report-format-fixtures');const {pdfText,docxText}=await import('./report-format-test-io');
 const {renderCanonicalReportPdf}=await import('../../apps/web/server/scans/report-export-pdf');const {renderCanonicalReportDocx}=await import('../../apps/web/server/scans/report-export-docx');
 const {GpcActivityComparison}=await import('../../apps/web/components/scans/gpc-activity-comparison');const {renderToStaticMarkup}=await import('react-dom/server');const React=await import('react');
 const {report}=documentFixture('ccpa_cpra',false,false,true),pair=report.gpcResponse!.activityComparison!;
 const html=renderToStaticMarkup(React.createElement(GpcActivityComparison,{comparison:pair}));assert.match(html,/Baseline/);assert.match(html,/Advertising \/ marketing/);assert.ok((html.match(/>0<\/td>/g)??[]).length>=4);
 for(const text of [pdfText(renderCanonicalReportPdf(report)),docxText(await renderCanonicalReportDocx(report))]){assert.match(text,/Paired advertising requests 0 -> 0/);assert.match(text,/Full-visit advertising collection 1/);assert.match(text,/Differences do not establish GPC causation/);}
 const v=adapt({scan:{id:scanId},gpcResponse:{...report.gpcResponse,observation:{...report.gpcResponse!.observation,scanId},activityComparison:{...pair,scanId}}},'report','scan-report-display.local.v1');assert.equal(v.fields.find(f=>f.legacyId==='gpc.pair.baseline_opportunity')!.samples[0]!.value,'both_sides_zero');
});
