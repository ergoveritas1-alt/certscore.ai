import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync} from 'node:fs';import {tmpdir} from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {applyRetainedReports} from './audit-progress-retained-report';
import fixture from '../../apps/web/lib/scans/test-fixtures/dollar-general-consent-assessment.json';
import {normalizeProjectionJson} from '../../apps/web/server/scans/scan-report-projection-contract';
for(const scanStatus of ['completed','completed_limited'])test('verified same-generation '+scanStatus+' report restores persisted states without overwriting public evidence',()=>{
 const id=fixture.assessment.scan.scanId,createdAt='2026-10-31T12:00:00Z';
 const payload={scan:{id,status:scanStatus},snapshot:{consentControlAssessment:fixture.assessment},runtimeArtifacts:{postAcceptEvidenceProjection:{execution:{policyVersion:'choice_path_execution.v1',status:'succeeded',clickCompleted:true,observationCompleted:true,consentConfirmed:false},registrationStatus:'unconfirmed'}},canonicalReportProjection:{checklistRows:[{id:'new_canonical_check',label:'Canonical check',status:'Review signal',evidenceState:'observed'}],globalUnifiedFindings:[]}};
 const serialized=JSON.stringify(normalizeProjectionJson(payload));
 const snapshot={report_projection_source_hash:'a'.repeat(64),report_projection_version:'scan-report-projection-v27',report_projection_status:'ready',report_projection_payload:payload,report_projection_payload_sha256:createHash('sha256').update(serialized).digest('hex'),report_projection_payload_size_bytes:Buffer.byteLength(serialized)};
 const b=Buffer.from(JSON.stringify({scanId:id,isMacMini:true,isCanary:false,originalRequestId:'creator',created_at:createdAt,status:scanStatus,snapshot}));
 const file=path.join(mkdtempSync(path.join(tmpdir(),'retained-valid-')),'record.json');writeFileSync(file,b);
 const row:any={scanId:id,reportable:true,publicProjectionSourceHash:'a'.repeat(64),projectionVersion:'scan-report-projection-v27',createdAt,site:'example.com',region:'us-west-1',states:{'control.accept':'unknown'},refs:[]};
 const result=applyRetainedReports([row],[{file,bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')}]);assert.equal(result.matched,1);assert.equal(row.states['sealed.control.accept'],'observed');assert.equal(row.states['control.accept'],'unknown');assert.equal(row.findings,undefined);assert.equal(row.states['sealed.terminal.accept'],'unavailable');assert.equal(row.states['sealed.registration.accept'],'unconfirmed');assert.equal(row.states['sealed.checklist.new_canonical_check'],'observed');assert.equal(row.retainedMetricLabels?.['checklist.new_canonical_check'],'Canonical check');
});
test('full projection import rejects changed transport bytes and never supplements a changed generation',()=>{
 const file=path.join(mkdtempSync(path.join(tmpdir(),'retained-report-')),'record.json');const b=Buffer.from(JSON.stringify({scanId:'one',isMacMini:true,isCanary:false,originalRequestId:'creator',snapshot:{report_projection_source_hash:'new'}}));writeFileSync(file,b);const ref={file,bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')};
 const row:any={scanId:'one',reportable:true,publicProjectionSourceHash:'old',states:{},refs:[]};assert.deepEqual(applyRetainedReports([row],[ref]),{matched:0,filled:0});assert.deepEqual(row.states,{});assert.throws(()=>applyRetainedReports([row],[{...ref,sha256:'invalid'}]),/receipt/);
});
