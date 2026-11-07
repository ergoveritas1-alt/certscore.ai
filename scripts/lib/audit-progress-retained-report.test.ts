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
 const row:any={scanId:'one',reportable:true,publicProjectionSourceHash:'old',states:{},refs:[]};const result=applyRetainedReports([row],[ref]);assert.equal(result.matched,0);assert.equal(result.filled,0);assert.equal(row.retainedReportInput,'generation_unverifiable');assert.deepEqual(row.states,{});assert.throws(()=>applyRetainedReports([row],[{...ref,sha256:'invalid'}]),/receipt/);
});

function retainedFixture(label='Original'){
 const id=fixture.assessment.scan.scanId,createdAt='2026-11-02T12:00:00Z';
 const row:any={scanId:id,reportable:true,createdAt,site:'example.test',region:'us-west-1',publicProjectionSourceHash:'a'.repeat(64),projectionVersion:'scan-report-projection-v27',states:{'control.accept':'unknown'},refs:[]};
 const payload={scan:{id,status:'completed'},snapshot:{consentControlAssessment:fixture.assessment},canonicalReportProjection:{checklistRows:[{id:'test_check',label,status:'Review signal',evidenceState:'observed'}],globalUnifiedFindings:[]}};
 const serialized=JSON.stringify(normalizeProjectionJson(payload));
 const envelope:any={scanId:id,isMacMini:true,isCanary:false,originalRequestId:'fixture',created_at:createdAt,status:'completed',snapshot:{report_projection_source_hash:row.publicProjectionSourceHash,report_projection_version:row.projectionVersion,report_projection_status:'ready',report_projection_payload:payload,report_projection_payload_sha256:createHash('sha256').update(serialized).digest('hex'),report_projection_payload_size_bytes:Buffer.byteLength(serialized)}};
 return {row,envelope};
}
function receipt(envelope:any){const b=Buffer.from(JSON.stringify(envelope)),file=path.join(mkdtempSync(path.join(tmpdir(),'retained-input-')),'record.json');writeFileSync(file,b);return {file,bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')};}
test('missing report input is distinct from unavailable scanner detail and measured zero',()=>{
 const {row}=retainedFixture();const result=applyRetainedReports([row],[]);
 assert.equal(row.retainedReportInput,'missing_input');assert.equal(result.inputCoverage.eligible,1);
 assert.equal(result.inputCoverage.states.missing_input,1);assert.deepEqual(row.states,{'control.accept':'unknown'});assert.equal(row.measurements,undefined);
});
test('duplicate report receipts count once and do not duplicate evidence references',()=>{
 const {row,envelope}=retainedFixture(),ref=receipt(envelope);
 const result=applyRetainedReports([row],[ref,ref]);
 assert.equal(result.matched,1);assert.equal(result.duplicateReceipts,1);assert.equal(row.retainedReportInput,'verified_report');
 assert.equal(row.refs.filter((r:any)=>r.role==='checksum_verified_persisted_report_generation').length,1);
 assert.equal(result.inputCoverage.states.verified_report,1);assert.equal(row.states['control.accept'],'unknown');
});
test('conflicting valid payloads for the same generation supplement no metrics in either order',()=>{
 const first=retainedFixture('First'),second=retainedFixture('Second'),a=receipt(first.envelope),b=receipt(second.envelope);
 for(const inputs of [[a,b],[b,a]]){
  const row=structuredClone(first.row),result=applyRetainedReports([row],inputs);
  assert.equal(result.matched,0);assert.equal(result.filled,0);assert.equal(row.retainedReportInput,'conflicting_generation');
  assert.deepEqual(row.states,first.row.states);assert.equal(row.measurements,undefined);assert.deepEqual(row.refs,[]);
 }
});
test('wrong generation, unprovable generation and rejected provenance stay distinct',()=>{
 for(const [change,expected] of [
  [(e:any)=>{e.snapshot.report_projection_source_hash='b'.repeat(64);},'generation_mismatch'],
  [(e:any)=>{e.snapshot.report_projection_version='different';},'generation_mismatch'],
  [(e:any)=>{delete e.snapshot.report_projection_source_hash;},'generation_unverifiable'],
  [(e:any)=>{delete e.originalRequestId;},'rejected_provenance'],
  [(e:any)=>{e.isCanary=true;},'rejected_provenance'],
 ] as const){const {row,envelope}=retainedFixture();change(envelope);const result=applyRetainedReports([row],[receipt(envelope)]);assert.equal(row.retainedReportInput,expected);assert.equal(result.matched,0);assert.equal(row.states['sealed.control.accept'],undefined);}
});
test('a matching input wins over an unrelated generation regardless of receipt order',()=>{
 const good=retainedFixture(),bad=retainedFixture();bad.envelope.snapshot.report_projection_source_hash='b'.repeat(64);
 const a=receipt(good.envelope),b=receipt(bad.envelope);
 for(const inputs of [[a,b],[b,a]]){const row=structuredClone(good.row);assert.equal(applyRetainedReports([row],inputs).matched,1);assert.equal(row.retainedReportInput,'verified_report');}
});
test('nonreportable rows are outside the input coverage denominator',()=>{
 const {row,envelope}=retainedFixture();row.reportable=false;const result=applyRetainedReports([row],[receipt(envelope)]);
 assert.equal(result.inputCoverage.eligible,0);assert.equal(row.retainedReportInput,undefined);assert.equal(result.matched,0);
});
