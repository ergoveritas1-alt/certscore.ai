import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {extraNativeSamples as read} from './audit-master-native-values';
import {readMasterContext,CONTEXT_PATHS} from './audit-master-context';
import {MASTER_VALUE_MAPPINGS} from './audit-master-value-mappings';
import {reportTechnicalEvidenceFixture} from '../../apps/web/server/scans/report-appendix-evidence.fixture';
import {accessibilityAuditFixture} from '../../packages/certscore-contracts/src/accessibility-audit.fixture';
import {siteIntegrityProjectionFixture} from '../../packages/certscore-contracts/src/site-integrity.fixture';
import {buildTimelineReportModel} from '../../apps/web/components/scans/report-lab/timeline-report-model';
import {reportRequestScanFixture} from '../../apps/web/server/scans/report-forms.fixture';
import {buildDetailedEvidenceExport} from '../../apps/web/lib/scans/detailed-evidence-report';
import {buildReportDisplayExport} from '../../apps/web/lib/api-v2/report-display-export';
import {resolveReportReferences} from './audit-master-values';
const scanId='11111111-1111-4111-8111-111111111111';
test('typed CMS detections and advisory records retain exact fields and reject cross-scan projections',()=>{
 const cms=reportTechnicalEvidenceFixture(scanId).cms,doc={scanId,cmsSecurity:cms};
 assert.equal(read(doc,'technology.detections.count','report')![0]!.value,cms.assessment.detections.length);
 assert.equal(read(doc,'technology.advisories.count','report')![0]!.value,cms.assessment.matches.length);
 assert.deepEqual(read(doc,'technology.detection.product','report')![0]!.value,{product:cms.assessment.detections[0]!.product,name:cms.assessment.detections[0]!.name});
 assert.ok(read(doc,'technology.detection.version','report')![0]!.qualification.includes(cms.sourceHash));
 assert.equal(read(doc,'technology.advisory.record','report')!.length,cms.assessment.matches.length);
 assert.throws(()=>read({...doc,scanId:'different'},'technology.detections.count','report'),/scan mismatch/);
 assert.deepEqual(read({scanId},'technology.detections.count','report'),[]);
 const duplicate=structuredClone(doc);duplicate.cmsSecurity.assessment.detections.push(duplicate.cmsSecurity.assessment.detections[0]!);
 assert.throws(()=>read(duplicate,'technology.detection.product','report'));
});
test('real detailed-evidence and full-file serializers preserve reviewed CMS values',()=>{
 const model=buildTimelineReportModel(reportRequestScanFixture());assert.ok('findings' in model);
 model.cmsSecurity=reportTechnicalEvidenceFixture(model.scan.id).cms;
 const detailed=buildDetailedEvidenceExport(model);
 const full=resolveReportReferences(buildReportDisplayExport({...model,cmsSecurity:detailed.cmsSecurity},{scanId:model.scan.id}));
 for(const id of ['technology.detections.count','technology.detection.product','technology.detection.version','technology.advisories.count','technology.advisory.record']){
  assert.deepEqual(read(model,id,'report'),read(full,id,'full'),id);
 }
});
test('site-integrity retains inspected versus evidence counts and exact link identity',()=>{
 const doc={scanId,siteIntegrity:{findingId:'site_integrity_hidden_outbound_links',evidence:{...siteIntegrityProjectionFixture,scanId}}};
 assert.equal(read(doc,'integrity.links.inspected_count','report')![0]!.value,40);
 assert.equal(read(doc,'integrity.links.evidence_count','report')![0]!.value,3);
 assert.equal(read(doc,'integrity.links.evidence','report')!.length,3);
 assert.throws(()=>read({...doc,scanId:'wrong'},'integrity.finding','report'),/mismatch/);
});
test('policy passage identities survive reorder; duplicate or malformed passages do not supply values',()=>{
 const doc={gdprTransparencyRows:[{id:'policy',policyEvidence:{capturedAt:'2026-11-06T12:00:00Z',documentTitle:'Privacy',sourceUrl:'https://fixture.test/privacy',sections:[{heading:'Collection',excerpt:'First retained passage.'},{heading:'Rights',excerpt:'Second retained passage.'}]}}]};
 const a=read(doc,'policies.passage.text','report')!;
 doc.gdprTransparencyRows[0]!.policyEvidence.sections.reverse();
 assert.deepEqual(read(doc,'policies.passage.text','full')!.sort((a,b)=>a.recordKey.localeCompare(b.recordKey)),a.sort((a,b)=>a.recordKey.localeCompare(b.recordKey)));
 doc.gdprTransparencyRows[0]!.policyEvidence.sections.push(doc.gdprTransparencyRows[0]!.policyEvidence.sections[0]!);
 assert.throws(()=>read(doc,'policies.passage.source_ref','report'),/Duplicate/);
 doc.gdprTransparencyRows[0]!.policyEvidence.capturedAt='unknown';
 assert.throws(()=>read(doc,'policies.passage.text','report'));
});
test('accessibility examples retain rule/node identity and absent historical coverage remains missing',()=>{
 const doc={scanId,accessibilityEvidence:accessibilityAuditFixture({scanId})};
 assert.equal(read(doc,'accessibility.examples.node','report')!.length,4);
 assert.deepEqual(read(doc,'accessibility.examples.coverage','report'),[]);
 assert.throws(()=>read({...doc,scanId:'wrong'},'accessibility.examples.node','report'),/scan mismatch/);
 doc.accessibilityEvidence.violations[0]!.representativeNodes.push(doc.accessibilityEvidence.violations[0]!.representativeNodes[0]!);
 assert.throws(()=>read(doc,'accessibility.examples.node','report'));
});
test('standard inventories retain caps, zero as an empty inventory and reject duplicate/raw/corrupt records',()=>{
 const packet={items:[{cookieName:'_example',domain:'fixture.test',party:'first_party'}],cap:{shown:1,total:3,truncated:true}};
 const doc={meta:{projectionVersion:'pulse-public-v11'},cookieStorageInventory:packet};
 assert.equal(read(doc,'tracking.inventory.cookie_record','standard')!.length,1);
 assert.ok(read(doc,'tracking.inventory.cookie_record','standard')![0]!.qualification.includes('"total":3'));
 assert.throws(()=>read({...doc,cookieStorageInventory:{...packet,cap:{...packet.cap,truncated:false}}},'tracking.inventory.cookie_record','standard'),/cap mismatch/);
 assert.throws(()=>read({...doc,cookieStorageInventory:{items:[{...packet.items[0],value:'private'}],cap:packet.cap}},'tracking.inventory.cookie_record','standard'),/raw inventory/);
 assert.throws(()=>read({...doc,cookieStorageInventory:{items:[packet.items[0],packet.items[0]],cap:{shown:2,total:2,truncated:false}}},'tracking.inventory.cookie_record','standard'),/Duplicate/);
 assert.equal(read({...doc,cookieStorageInventory:{items:[],cap:{shown:0,total:0,truncated:false}}},'tracking.inventory.cookie_record','standard')![0]!.availability,'empty_inventory');
 const observations={...doc,cookieStorageInventory:{items:[{...packet.items[0],firstObservedAtMs:10},{...packet.items[0],firstObservedAtMs:20}],cap:{shown:2,total:2,truncated:false}}};
 assert.equal(read(observations,'tracking.inventory.cookie_record','standard')!.length,2);
 const vendor={name:'Example',domains:['b.test','a.test']};
 const values=read({meta:doc.meta,trackerVendorInventory:{items:[vendor],cap:{shown:1,total:1,truncated:false}}},'tracking.inventory.vendor_record','standard')!;
 assert.equal(values[0]!.recordKey,'["Example",["a.test","b.test"],[]]');
 const recognitions={meta:doc.meta,trackerVendorInventory:{items:[{...vendor,attributionSignatures:['sig1']},{...vendor,attributionSignatures:['sig2']}],cap:{shown:2,total:2,truncated:false}}};
 assert.equal(read(recognitions,'tracking.inventory.vendor_record','standard')!.length,2);
});
test('audit origin and canonical choice records keep unknown and neutral distinct',()=>{
 assert.equal(read({originProof:'mac_mini_archive'},'operations.provenance.original_creator','audit')![0]!.availability,'unknown');
 assert.equal(read({originProof:'original_credential_verified'},'operations.provenance.original_creator','audit')![0]!.availability,'available');
 const key='sealed.choice_finding.gpc_neutral',doc={states:{[key]:'not_surfaced'},metricSources:{[key]:'sealed_assessment/certscore.audit-choice-summary.v2'}};
 assert.deepEqual(read(doc,'privacy.choice.result_record','audit')![0]!.value,{id:'gpc_neutral',state:'not_surfaced'});
 assert.throws(()=>read({...doc,metricSources:{}},'privacy.choice.result_record','audit'),/source/);
});
test('snapshot context verifies receipt bytes, keeps nested ancestry, pending IDs, reuse units and missing summary dates',()=>{
 const dir=mkdtempSync(join(tmpdir(),'certscore-context-'));try{
  const file=join(dir,'cache-manifest.json'),cache={version:'certscore.mac-mini-evidence-cache.v1',sourceWrites:0,receipts:[{scanId,state:'source_unavailable'},{scanId:'copied',state:'copied'}],transferCounts:{localFilesReused:7,newFiles:2}};
  const bytes=Buffer.from(JSON.stringify(cache));writeFileSync(file,bytes);
  const retainedReports=[{originalArtifact:{originalArtifact:{sha256:'a'.repeat(64)}}}],data={retainedReports,exclusionCounts:{canary:2},days:[{date:'2026-11-06',completeDay:false,inventoryHours:4,sampleOnly:false,metrics:{}}],rows:[{reportable:true,createdAt:'2026-11-05T12:00:00Z',states:{},metricSources:{}}],sources:[{file,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length}]};
  const result=readMasterContext(data);assert.equal(Object.keys(result).length,10);
  assert.equal(result['operations.acquisition.pending_ids'].value.count,1);
  assert.deepEqual(result['operations.acquisition.cache_reuse'].value.unit,'local_files');
  assert.equal(result['operations.series.summary_coverage'].value['2026-11-05']['unavailable_source/not_returned'],1);
  assert.equal(result['operations.provenance.receipt_ancestry'].value.sha256,createHash('sha256').update(JSON.stringify(retainedReports)).digest('hex'));
  assert.deepEqual(data.retainedReports,retainedReports);
  writeFileSync(file,JSON.stringify({...cache,sourceWrites:1}));assert.throws(()=>readMasterContext(data),/Changed cache receipt/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('mixed measurements cannot acquire pooled rates; context routes never count as scan mappings',()=>{
 assert.throws(()=>readMasterContext({days:[{metrics:{x:{source:'mixed_sources',rate:0,deltaPp:null}}}]}),/not null/);
 const empty=readMasterContext({});assert.equal(empty['operations.acquisition.pending_ids'].status,'not_retained');
 for(const id of Object.keys(CONTEXT_PATHS))assert.equal(MASTER_VALUE_MAPPINGS.items.find(i=>i.legacyId===id)!.views.audit.mode,'context');
 for(const item of MASTER_VALUE_MAPPINGS.items)for(const route of Object.values(item.views))if(route.mode==='mapping_gap')assert.ok(route.guidanceId,`${item.legacyId} missing guidance`);
});
