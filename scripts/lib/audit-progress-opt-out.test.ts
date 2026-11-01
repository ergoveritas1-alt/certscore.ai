import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import fixture from '../../apps/web/lib/scans/test-fixtures/dollar-general-consent-assessment.json';
import {retainedOptOutState,historicalOptOutSql,applyRetainedOptOutExtracts,OPT_OUT_EXTRACT_VERSION} from './audit-progress-opt-out';
import type {ProgressRow} from './audit-progress';
const id=fixture.assessment.scan.scanId;
const row=():ProgressRow=>({scanId:id,site:'dollargeneral.com',createdAt:'2026-10-29T12:00:00Z',region:'us-west-1',producer:'unknown',profile:'unknown',assessmentVersion:'pulse-public-v10',projectionVersion:'scan-report-projection-v27',publicProjectionSourceHash:'a'.repeat(64),originRequestId:'archive',states:{'control.privacyOptOut':'unavailable'},findings:[],findingInventory:true,reportable:true,refs:[]});
const extract=()=>({scanId:id,isMacMini:true,isCanary:false,originalRequestId:'original',publicationRequestStatus:'ready',status:'completed',created_at:'2026-10-29T12:00:00.000123Z',projection_source_hash:'a'.repeat(64),projection_payload_sha256:'b'.repeat(64),projection_version:'scan-report-projection-v27',projection_status:'ready',control_assessment:structuredClone(fixture.assessment)});
function receipt(rows:any[]){const file=path.join(mkdtempSync(path.join(tmpdir(),'opt-out-extract-')),'extract.json');writeFileSync(file,JSON.stringify({version:OPT_OUT_EXTRACT_VERSION,readOnly:true,rows}));const b=readFileSync(file);return {file,sha256:createHash('sha256').update(b).digest('hex'),bytes:b.length};}
test('persisted opt-out extraction joins exact original scan, generation and canonical state',()=>{
 for(const state of ['observed','not_observed','unknown'] as const){const e=extract();e.control_assessment.controls.privacyOptOut.state=state;assert.equal(retainedOptOutState(e,row())?.state,state);}
 for(const patch of [{scanId:'other'},{isMacMini:false},{isCanary:true},{originalRequestId:null},{projection_source_hash:'c'.repeat(64)},{projection_payload_sha256:null},{projection_version:'scan-report-projection-v99'},{created_at:'2026-10-29T12:00:01Z'},{projection_status:'pending'},{publicationRequestStatus:'terminal_failure'}])assert.equal(retainedOptOutState({...extract(),...patch},row()),null);
 const e=extract();e.control_assessment.scan.noGo=true;assert.equal(retainedOptOutState(e,row()),null);
 const unknown:any=extract();unknown.control_assessment.controls.privacyOptOut.state='unknown';unknown.control_assessment.controls.privacyOptOut.layer='unknown';unknown.control_assessment.document.identityStatus='mismatched';assert.equal(retainedOptOutState(unknown,row())?.state,'unknown');
 assert.equal(retainedOptOutState(extract(),{...row(),reportable:false}),null);
});
test('malformed, wrong-document and incomplete negative assessments cannot fill gaps',()=>{
 for(const mutate of [(e:any)=>e.control_assessment={},(e:any)=>e.control_assessment.document.identityStatus='mismatched',(e:any)=>e.control_assessment.scan.scanId='other',(e:any)=>e.control_assessment.provenance.contractVersion='2.1',(e:any)=>e.control_assessment.controls.privacyOptOut.inspection.status='limited',(e:any)=>e.control_assessment.controls.privacyOptOut.inspection.evidenceRefs=[]]){const e=extract();mutate(e);assert.equal(retainedOptOutState(e,row()),null);}
});
test('verified extract supplements only retained opt-out and never upgrades public/origin/finding eligibility',()=>{
 const r=row(),before=structuredClone(r),rec=receipt([extract()]);const s=applyRetainedOptOutExtracts([r],[rec]);assert.equal(s.added,1);assert.equal(r.states['sealed.control.privacyOptOut'],'not_observed');assert.equal(r.states['control.privacyOptOut'],'unavailable');assert.match(r.metricSources!['sealed.control.privacyOptOut']!,/^persisted_control_extract\//);assert.equal(r.originRequestId,before.originRequestId);assert.equal(r.findingInventory,before.findingInventory);assert.deepEqual(r.findings,before.findings);
 const second=applyRetainedOptOutExtracts([r],[rec]);assert.equal(second.added,0);
 const conflict=extract();conflict.control_assessment.controls.privacyOptOut.state='observed';assert.throws(()=>applyRetainedOptOutExtracts([r],[receipt([conflict])]),/disagrees/);
 assert.throws(()=>applyRetainedOptOutExtracts([row()],[{...rec,sha256:'c'.repeat(64)}]),/hash\/size/);
 assert.throws(()=>applyRetainedOptOutExtracts([row()],[receipt([extract(),extract()])]),/Duplicate/);
});
test('historical query is read-only, bounded and extracts no raw packets or evidence inventories',()=>{
 const sql=historicalOptOutSql('2026-10-01T15:02:27Z','2026-11-01T15:02:27Z');
 assert.match(sql,/45s/);assert.match(sql,/limit 5001/);assert.match(sql,/"isMacMini" is true/);assert.match(sql,/"isCanary" is false/);assert.match(sql,/report_projection_status='ready'/);assert.match(sql,/originalRequestId/);assert.doesNotMatch(sql,/\b(update|delete|insert)\b|scanArtifactUri|a\.value->'evidence'/i);
 assert.throws(()=>historicalOptOutSql('2026-09-01','2026-11-01'),/32 days/);
});
