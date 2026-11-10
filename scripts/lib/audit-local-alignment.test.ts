import {adaptMasterView,type ViewInput} from './audit-master-values';
import {buildTimelineReportModel} from '../../apps/web/components/scans/report-lab/timeline-report-model';
import {buildFullEvidencePackage} from '../../apps/web/lib/api-v2/full-evidence-package';
import {verifyFullEvidenceExport} from '../../apps/web/lib/api-v2/full-evidence-export';
import assert from 'node:assert/strict';import test from 'node:test';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createHash} from 'node:crypto';
import {buildCustomerConsentEvidence} from '../../apps/web/lib/api-v2/customer-consent-evidence';
import {customerConsentEvidenceSchema} from '../../packages/certscore-api-contracts/src/customer-consent-evidence';
import {reportRequestScanFixture} from '../../apps/web/server/scans/report-forms.fixture';
import {readIdChanges} from './audit-id-changes';import {readMasterContext} from './audit-master-context';
import {gpcVerificationScopes} from './audit-gpc-verification-scopes';import {gpcProductFixture} from '../../apps/web/lib/scans/test-fixtures/gpc-product';
import {extraNativeSamples} from './audit-master-native-values';
function fixture(){const s=reportRequestScanFixture();s.snapshot={...s.snapshot,report_projection_status:'ready',report_projection_source_hash:'a'.repeat(64),report_projection_version:'scan-report-projection-v27',consent_control_assessment:structuredClone(s.runtimeArtifacts!.consentControlAssessment)} as any;return s;}
test('bounded customer packet uses persisted observations, preserves unknown, and does not expose raw proof',()=>{
 const s=fixture(),a=(s.snapshot as any).consent_control_assessment;a.controls.reject.state='unknown';a.assessmentStatus='limited';a.coverage.status='limited';const before=JSON.stringify(s);
 const p=buildCustomerConsentEvidence(s)!;assert.equal(p.status,'available');assert.equal(p.controls.find(c=>c.id==='reject')!.state,'unknown');assert.equal(p.criteria.length,13);assert.ok(Buffer.byteLength(JSON.stringify(p))<=8192);
 assert.equal(JSON.stringify(s),before);assert.doesNotMatch(JSON.stringify(p),/documentToken|canonicalDocument|selector|rawValue/);
 const doc={scanId:s.scan.id,timestamps:{createdAt:s.scan.createdAt},meta:{reportProjectionSourceHash:p.binding.reportSourceHash,reportProjectionVersion:p.binding.reportVersion},customerConsentEvidence:p};
 assert.equal(extraNativeSamples(doc,'consent.cmp.criterion.banner','standard')!.length,1);
 assert.throws(()=>extraNativeSamples({...doc,meta:{...doc.meta,reportProjectionSourceHash:'b'.repeat(64)}},'consent.cmp.criterion.banner','standard'),/generation/);
 const duplicate=structuredClone(p);duplicate.controls.push(duplicate.controls[0]!);assert.equal(customerConsentEvidenceSchema.safeParse(duplicate).success,false);
});
test('missing, conflicting and cross-scan persisted controls never fall back to live/runtime evidence',()=>{
 const s=fixture();delete (s.snapshot as any).consent_control_assessment;
 assert.equal(buildCustomerConsentEvidence(s)!.reason,'persisted_assessment_not_retained');
 (s.snapshot as any).consent_control_assessment=structuredClone(s.runtimeArtifacts!.consentControlAssessment);
 (s.snapshot as any).consent_control_assessment.scan.scanId='other';assert.equal(buildCustomerConsentEvidence(s)!.status,'unavailable');
 (s.snapshot as any).consentControlAssessment=structuredClone(s.runtimeArtifacts!.consentControlAssessment);assert.equal(buildCustomerConsentEvidence(s)!.reason,'conflicting_persisted_assessments');
 (s.snapshot as any).report_projection_status='pending';assert.equal(buildCustomerConsentEvidence(s),undefined);
});
test('GPC main-document and paired-window verification remain separate and changed bindings stay unavailable',()=>{
 const f=gpcProductFixture({scanId:'00000000-0000-4000-8000-000000000099'}),g={...f.assessment,cmpStateComparison:f.cmpStateComparison,activityComparison:f.activityComparison},doc={scanId:f.assessment.observation.scanId,gpcResponse:g};
 const samples=gpcVerificationScopes(doc);assert.deepEqual(samples.map(s=>s.recordKey),['bounded_main_document','matched_paired_window']);assert.equal(samples[0]!.availability,'available');assert.equal(samples[1]!.availability,'available');
 const standard={...doc,scanStatus:'completed',timestamps:{createdAt:'2026-11-06T12:00:00Z'},meta:{projectionVersion:'pulse-public-v11',reportProjectionVersion:'scan-report-projection-v27',reportProjectionSourceHash:'a'.repeat(64)}};const bytes=Buffer.from(JSON.stringify(standard));
 const adapted=adaptMasterView({view:'standard',schema:'pulse-public-v11',bytes,sha256:createHash('sha256').update(bytes).digest('hex'),binding:{scanId:doc.scanId!,createdAt:standard.timestamps.createdAt,generation:standard.meta.reportProjectionVersion,sourceHash:standard.meta.reportProjectionSourceHash,creatorIdentity:'fixture'}});
 const all=adapted.fields.find(f=>f.legacyId==='gpc.delivery.verification')!.samples;assert.ok(all.some(s=>s.recordKey==='gpc_delivery'));assert.ok(all.some(s=>s.recordKey==='bounded_main_document'));
 const changed=structuredClone(doc);changed.gpcResponse.observation.sourceSha256='0'.repeat(64);assert.notEqual(gpcVerificationScopes(changed).find(s=>s.recordKey==='bounded_main_document')?.availability,'available');
 const noPair=structuredClone(doc);delete (noPair.gpcResponse as any).activityComparison;const unpaired=gpcVerificationScopes(noPair);assert.equal(unpaired.find(s=>s.recordKey==='bounded_main_document')!.availability,'available');assert.equal(unpaired.find(s=>s.recordKey==='matched_paired_window')!.availability,'not_retained');
});
test('exact ID accounting distinguishes new, generation, status-only and unknown baseline, with receipt checks',()=>{
 const dir=mkdtempSync(join(tmpdir(),'certscore-id-ledger-'));try{
  const ref=(name:string,value:unknown)=>{const file=join(dir,name),b=Buffer.from(JSON.stringify(value));writeFileSync(file,b);return {file,sha256:createHash('sha256').update(b).digest('hex'),bytes:b.length};};
  const row=(n:number,extra={})=>({scanId:`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,originalRequestId:'request-'+n,isMacMini:true,isCanary:false,created_at:'2026-11-01T12:00:00Z',status:'completed',projection_source_hash:'a'.repeat(64),projection_payload_sha256:'c'.repeat(64),projection_version:'v27',...extra});
  const inv=(rows:any[],end:string)=>({version:'certscore.mac-mini-direct-id-inventory.v1',readOnly:true,rows,end});
  const oldInv=ref('old.json',inv([row(1),row(2),row(3),row(4)],'2026-11-05T12:00:00Z'));
  const previous=ref('prior-cache.json',{version:'certscore.mac-mini-evidence-cache.v1',sourceWrites:0,end:'2026-11-05T12:00:00Z',receipts:[{scanId:row(5).scanId,state:'source_unavailable'}],directInventory:oldInv});
  const current=ref('new.json',inv([row(1),row(2,{projection_source_hash:'b'.repeat(64)}),row(3,{status:'completed_limited'}),row(4,{projection_source_hash:null}),row(5),row(6),row(7,{isCanary:true})],'2026-11-06T12:00:00Z'));
  const cache={version:'certscore.mac-mini-evidence-cache.v1',sourceWrites:0,end:'2026-11-06T12:00:00Z',previousCache:previous,directInventory:current,receipts:[]};
  const ledger=readIdChanges(cache)!;assert.deepEqual(ledger.counts,{new_to_retained_inventory:1,report_generation_changed:1,status_only_changed:1,unchanged:1,prior_observation_unavailable:1,generation_unavailable:1,status_unavailable:0});assert.equal(ledger.rows.length,6);
  const cacheRef=ref('cache-manifest.json',{...cache,previousCache:undefined});const priorSnapshot=ref('prior-dashboard.json',{sources:[previous]});
  const context=readMasterContext({sources:[cacheRef],idChangeInputs:{currentCache:cacheRef,previousCache:previous,priorSnapshot}});assert.equal(context['operations.acquisition.id_additions'].value.count,1);assert.equal(context['operations.acquisition.id_updates'].value.statusOnly,1);
  assert.throws(()=>readMasterContext({sources:[cacheRef],idChangeInputs:{currentCache:{...cacheRef,sha256:'wrong'},previousCache:previous,priorSnapshot}}),/current-cache mismatch/);
  writeFileSync(oldInv.file,readFileSync(oldInv.file)+' ');assert.throws(()=>readIdChanges(cache),/receipt/);
  assert.equal(readIdChanges({}),undefined);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('real full package preserves the new bounded standard packet exactly without report expansion',()=>{
 const s=fixture();s.canonicalReportProjection!.globalUnifiedFindings=[];s.canonicalReportProjection!.ownerUnifiedFindings=[];const model=buildTimelineReportModel(s);assert.ok('findings' in model);
 const before=JSON.stringify(s),full=buildFullEvidencePackage(s,model);verifyFullEvidenceExport(full);
 assert.deepEqual(full.standardEvidence.customerConsentEvidence,buildCustomerConsentEvidence(s));
 assert.equal(full.standardEvidence.customerConsentEvidence.status,'available');
 assert.equal((full.reportViews.gdpr_eprivacy as any).customerConsentEvidence,undefined);
 assert.equal(JSON.stringify(s),before);
});

import {buildNormalizedConcerns} from '../../apps/web/lib/scans/normalized-concerns';
import {cmpAuditAssessmentSchema} from '@certscore/contracts';
test('cookie declaration counts travel from the persisted comparison without cookie names',()=>{
 const s=fixture();
 const assessment=(s.snapshot as any).consent_control_assessment;
 const ids=['categories','services','privacy_access','consent_record','duration','declared_not_found','found_not_declared','cookie_information','implementation','prominence'];
 assessment.cmpAudit=cmpAuditAssessmentSchema.parse({
  version:'cmp_audit_assessment.v6',scanId:s.scan.id,sourceSha256:'a'.repeat(64),
  support:{state:'partial',provider:'OneTrust',recipeVersion:'fixture',reason:'partial_inventory'},
  rows:ids.map(id=>id==='found_not_declared'?{
   id,status:'partially_assessed',detail:'Retained list comparison',evidenceRefs:['cmpBasicEvidence'],
   cookieComparison:{declarationPatternCount:3,observedCookieNameCount:4,unmatchedNameCount:2,
    unmatchedNames:['fixture-private-cookie'],allUnmatchedOnlyAfterAccept:false,declarationInventoryComplete:false},
  }:{id,status:'not_assessed',detail:'Unavailable',evidenceRefs:[]}),
 });
 s.canonicalReportProjection!.normalizedConcerns=buildNormalizedConcerns({runtimeArtifacts:{consentControlAssessment:assessment},reviewFindingCandidates:[],validationFindings:[]});
 const packet=buildCustomerConsentEvidence(s)!;
 assert.deepEqual(packet.cookieDeclarationCounts,{version:'certscore.cookie-declaration-counts.v1',observed:4,matched:2,declarationInventoryComplete:false});
 assert.doesNotMatch(JSON.stringify(packet),/fixture-private-cookie/);
 assert.equal(customerConsentEvidenceSchema.safeParse({...packet,cookieDeclarationCounts:{...packet.cookieDeclarationCounts,matched:5}}).success,false);
 assert.equal(customerConsentEvidenceSchema.safeParse({...packet,criteria:packet.criteria.map(c=>c.id==='found_not_declared'?{...c,status:'Review recommended'}:c)}).success,false);
 s.canonicalReportProjection!.normalizedConcerns=[];
 assert.equal(buildCustomerConsentEvidence(s)?.cookieDeclarationCounts,undefined);
});
