import assert from 'node:assert/strict';import test from 'node:test';
import {buildFullEvidenceExport,assertFullEvidenceSuperset,resolveFullEvidenceReferences,REPORT_FOCUSES,type FullEvidenceInput} from './full-evidence-export';
import {buildFullEvidencePackage} from './full-evidence-package';
import {buildFullEvidenceReportView} from './full-evidence-report-view';
import {buildReportDisplayExport} from './report-display-export';
import {buildPulseProjection} from '../pulse/projection';
import {buildTimelineReportModel} from '../../components/scans/report-lab/timeline-report-model';
import {reportFormsScanFixture} from '../../server/scans/report-forms.fixture';
import {buildReportEvidencePage,ReportPageCursorError} from './report-evidence-page';
const id='11111111-1111-4111-8111-111111111111',hash='a'.repeat(64);
function fixture():FullEvidenceInput{
 const repeated={name:'retained resource '.repeat(40),key:'one'};
 const standardEvidence={type:'certscore_pulse_evidence',scanId:id,scan_id:id,meta:{detail:'evidence',evidenceSafety:'bounded_structured_public_evidence',reportProjectionSourceHash:hash,reportProjectionVersion:'scan-report-projection-v27',projectionVersion:'pulse-public-v11',schemaVersion:'0.5.5'},inventory:{zero:0,negative:false,unknown:null},retained:{source:'original',scope:'paired_window'}};
 const reportViews=Object.fromEntries(REPORT_FOCUSES.map(reviewFocus=>[reviewFocus,buildReportDisplayExport({scan:{id},reviewFocus,findings:[{id:reviewFocus,title:reviewFocus}],resourceInventory:{resources:[repeated],services:[{resources:[repeated]}]}})])) as unknown as FullEvidenceInput['reportViews'];
 return {scanId:id,sourceHash:hash,projectionVersion:'scan-report-projection-v27',standardEvidence,reportViews,defaultFocus:'gdpr_eprivacy'};
}
test('full package retains standard values exactly, both focused reports and stable legacy root fields',()=>{
 const input=fixture(),before=JSON.stringify(input),result=buildFullEvidenceExport(input);
 assertFullEvidenceSuperset(result,input);assert.equal(JSON.stringify(input),before);
 assert.deepEqual(result.standardEvidence,input.standardEvidence);
 for(const focus of REPORT_FOCUSES)assert.deepEqual(resolveFullEvidenceReferences(result,result.reportViews[focus]),resolveFullEvidenceReferences(input.reportViews[focus]));
 assert.match(JSON.stringify(result),/reportViews\/ccpa_cpra\/resourceInventory\/resources\/0/);
 assert.equal(result.standardEvidence.inventory.zero,0);assert.equal(result.standardEvidence.inventory.negative,false);assert.equal(result.standardEvidence.inventory.unknown,null);
});
test('removed/changed standard fields, wrong scans and mismatched generations fail closed',()=>{
 const input=fixture(),result=buildFullEvidenceExport(input);
 const removed=structuredClone(result);delete removed.standardEvidence.inventory.zero;assert.throws(()=>assertFullEvidenceSuperset(removed,input),/lost or changed/);
 const changed=structuredClone(result);changed.standardEvidence.inventory.zero=1;assert.throws(()=>assertFullEvidenceSuperset(changed,input),/lost or changed/);
 for(const patch of [{sourceHash:'b'.repeat(64)},{projectionVersion:'wrong'},{scanId:'other'}])assert.throws(()=>buildFullEvidenceExport({...input,...patch}),/mismatch/);
 const wrong=fixture();wrong.reportViews.ccpa_cpra.scan.id='wrong';assert.throws(()=>buildFullEvidenceExport(wrong),/identity/);
 const missing=structuredClone(result);delete missing.reportViews.ccpa_cpra;assert.throws(()=>assertFullEvidenceSuperset(missing,input),/lost or changed/);
});
test('same-document pointers reject cycles, dangling references and prototype traversal',()=>{
 for(const pointer of ['/missing','/__proto__','/constructor','/bad~2escape'])assert.throws(()=>resolveFullEvidenceReferences({a:{reportContentRef:pointer}}));
 assert.throws(()=>resolveFullEvidenceReferences({a:{reportContentRef:'/b'},b:{reportContentRef:'/a'}}),/Cyclic/);
});
test('actual standard/projected report producers compose a stable superset without raw runtime fields',()=>{
 const record=reportFormsScanFixture();record.canonicalReportProjection!.globalUnifiedFindings=[];record.canonicalReportProjection!.ownerUnifiedFindings=[];record.accessPostureSummary={homepageFetchStatus:null,interruptionLabel:null,interruptionReason:null,stopOutcomeTitle:null,stopReason:null,stopReviewTitle:null} as any;record.snapshot={...record.snapshot,report_projection_source_hash:hash,report_projection_version:'scan-report-projection-v27'} as typeof record.snapshot;
 (record.runtimeArtifacts as any).rawRequestBody='NEVER_EXPORT_SECRET';
 const report=buildTimelineReportModel(record);assert.ok(!('resultDisposition' in report));
 const standard=buildPulseProjection({scanRecord:record,detail:'evidence',format:'json',freshnessMode:'latest',requestedUrl:report.scan.url,pulseRequestId:'report-evidence-'+record.scan.id,resolutionMode:'retained_report',waitSeconds:0,generatedAtIso:record.scan.completedAt??record.scan.startedAt??record.scan.createdAt}) as Record<string,any>;
 const full=buildFullEvidencePackage(record,report),again=buildFullEvidencePackage(record,report);
 assert.deepEqual(full.standardEvidence,JSON.parse(JSON.stringify(standard)));assert.deepEqual(full,again);
 assert.doesNotMatch(JSON.stringify(full),/NEVER_EXPORT_SECRET/);
 for(const focus of REPORT_FOCUSES){const view=buildFullEvidenceReportView(report,focus,standard);assert.deepEqual(resolveFullEvidenceReferences(full,full.reportViews[focus]),resolveFullEvidenceReferences(JSON.parse(JSON.stringify(view))));}
 const fields=resolveFullEvidenceReferences(full,full.reportViews.gdpr_eprivacy).collectionTableRows;
 assert.ok(fields.length>0);assert.ok(fields.flatMap((r:any)=>r.form.fields).every((f:any)=>typeof f.confidence==='number'&&typeof f.disabled==='boolean'&&typeof f.readOnly==='boolean'));
 assert.ok(full.exportContent.exclusions.includes('raw_cookie_values'));
});
test('pagination is stable, reconstructs the full package, and rejects a different representation cursor',()=>{
 const input=fixture();input.standardEvidence.rows=Array.from({length:160},(_,i)=>({i,text:'retained '.repeat(150)}));const full=buildFullEvidenceExport(input);
 const first=buildReportEvidencePage({scanId:id,report:full});assert.ok(first.pagination.nextCursor);
 assert.equal(first.snapshot,buildReportEvidencePage({scanId:id,report:buildFullEvidenceExport(input)}).snapshot);
 assert.deepEqual(first.coverage.exclusions,full.exportContent.exclusions);
 assert.throws(()=>buildReportEvidencePage({scanId:id,report:input.reportViews.gdpr_eprivacy,cursor:first.pagination.nextCursor}),ReportPageCursorError);
 const entries=[...first.entries];let cursor:string|null=first.pagination.nextCursor;
 while(cursor){const next=buildReportEvidencePage({scanId:id,report:full,cursor});entries.push(...next.entries);cursor=next.pagination.nextCursor;}
 let reconstructed:any;
 for(const entry of entries){assert.equal(entry.stringPart,undefined);if(entry.path===''){reconstructed=entry.value;continue;}const parts=entry.path.slice(1).split('/').map(p=>p.replaceAll('~1','/').replaceAll('~0','~'));let at=reconstructed;for(const key of parts.slice(0,-1))at=at[key];at[parts.at(-1)!]=entry.value;}
 assert.deepEqual(reconstructed,JSON.parse(JSON.stringify(full)));
});
test('full package byte bound fails instead of silently dropping evidence',()=>{
 const input=fixture();input.standardEvidence.large='x'.repeat(24*1024*1024);
 assert.throws(()=>buildFullEvidenceExport(input),/byte bound/);
});
test('additional report facts preserve safe provenance and omit internal document tokens',async()=>{
 const {siteIntegrityProjectionFixture}=await import('../../../../packages/certscore-contracts/src/site-integrity.fixture');
 const {reportTechnicalEvidenceFixture}=await import('../../server/scans/report-appendix-evidence.fixture');
 const record=reportFormsScanFixture(),report=buildTimelineReportModel(record);
 assert.ok(!('resultDisposition' in report));
 const integrity={findingId:'integrity',title:'Retained site integrity',description:'Observed links',summary:'Bounded capture',action:'Review',severity:'medium',evidence:{...siteIntegrityProjectionFixture,scanId:record.scan.id}};
 const enriched={...report,siteIntegrity:integrity,formDestinations:reportTechnicalEvidenceFixture(record.scan.id).forms} as typeof report;
 const view=buildFullEvidenceReportView(enriched,'gdpr_eprivacy',{}),extra=view.reportEvidence;
 assert.equal(extra.siteIntegrity?.evidence.sourceHash,siteIntegrityProjectionFixture.sourceHash);
 assert.deepEqual(extra.siteIntegrity?.evidence.observation.links,siteIntegrityProjectionFixture.observation.links);
 assert.equal(extra.formDestinations?.trace.coverage.activeSubmission,false);
 assert.equal(extra.formDestinations?.trace.requests[0]?.relation,'temporal_only');
 assert.doesNotMatch(JSON.stringify(extra),/documentToken|scoreEffects/);
 enriched.siteIntegrity!.evidence.scanId='wrong';
 assert.throws(()=>buildFullEvidenceReportView(enriched,'gdpr_eprivacy',{}),/scan mismatch/);
});
