import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import fixture from '../../apps/web/lib/scans/test-fixtures/dollar-general-consent-assessment.json';
import {retainedOptOutState,historicalOptOutSql,applyRetainedOptOutExtracts,OPT_OUT_EXTRACT_VERSION} from './audit-progress-opt-out';
import type {ProgressRow} from './audit-progress';
import {verifyChoiceEvidence} from './audit-progress-choice-verification';
import {CHOICE_AUDIT_VERSION,choiceSummaryFromRecord} from './audit-progress-choice';
import {buildAuditDeltaQuery} from './audit-delta-query';
import {extractExportRow} from './audit-progress-export';
const id=fixture.assessment.scan.scanId;
const row=():ProgressRow=>({scanId:id,site:'dollargeneral.com',createdAt:'2026-10-29T12:00:00Z',region:'us-west-1',producer:'unknown',profile:'unknown',assessmentVersion:'pulse-public-v10',projectionVersion:'scan-report-projection-v27',publicProjectionSourceHash:'a'.repeat(64),originRequestId:'archive',states:{'control.privacyOptOut':'unavailable'},findings:[],findingInventory:true,reportable:true,refs:[]});
const extract=()=>({scanId:id,isMacMini:true,isCanary:false,originalRequestId:'original',publicationRequestStatus:'ready',status:'completed',created_at:'2026-10-29T12:00:00.000123Z',projection_source_hash:'a'.repeat(64),projection_payload_sha256:'b'.repeat(64),projection_version:'scan-report-projection-v27',projection_status:'ready',control_assessment:structuredClone(fixture.assessment)});
function receipt(rows:any[],version=OPT_OUT_EXTRACT_VERSION as string){const file=path.join(mkdtempSync(path.join(tmpdir(),'opt-out-extract-')),'extract.json');writeFileSync(file,JSON.stringify({version,readOnly:true,rows}));const b=readFileSync(file);return {file,sha256:createHash('sha256').update(b).digest('hex'),bytes:b.length};}
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
test('daily California Reject reasons require a completed click and matching persisted generation',()=>{
 const policy='california-post-reject.v6-auctions';
 const record={...extract(),caReject:[1,policy,'insufficient_evidence','cookie_tracking_rejection',false,['request_proof_incomplete']]};
 const input=(r:unknown)=>receipt([r],'certscore.mac-mini-direct-id-inventory.v1');
 const completed=()=>({...row(),states:{'click.reject':'completed'}});
 const matched=completed();
 applyRetainedOptOutExtracts([matched],[input(record)]);
 assert.deepEqual(matched.californiaRejectCoverage,{policyVersion:policy,status:'insufficient_evidence',reasons:['request_proof_incomplete']});
 for(const [candidate,scan] of [
  [record,row()],
  [{...record,projection_source_hash:'f'.repeat(64)},completed()],
  [{...record,caReject:null},completed()],
  [{...record,caReject:[1,policy,'qualified_collection','cookie_tracking_rejection',false,[]]},completed()],
 ] as const){
  applyRetainedOptOutExtracts([scan],[input(candidate)]);
  assert.equal(scan.californiaRejectCoverage,undefined);
 }
 const conflict={...record,caReject:[1,policy,'no_eligible_collection','cookie_tracking_rejection',false,null]};
 assert.throws(()=>applyRetainedOptOutExtracts([matched],[input(conflict)]),/Conflicting generation-bound/);
});
test('technical counts preserve zero and reject conflicting or mismatched receipts',()=>{
 const record={...extract(),technicalCounts:[['certscore.site-integrity-projection.v1',0],['certscore.cms-security-projection.v2',2,0,'certscore.cms-catalogue.2026-10-11.v4']]};
 const input=(r:unknown)=>receipt([r],'certscore.mac-mini-direct-id-inventory.v1');
 const matched=row(),source=input(record);
 applyRetainedOptOutExtracts([matched],[source]);
 applyRetainedOptOutExtracts([matched],[source]);
 assert.deepEqual(matched.measurements,{'site.link_evidence':0,'technology.detections':2,'technology.matches':0});
 assert.equal(matched.refs.filter(ref=>ref.role==='generation_matched_technical_counts').length,1);
 assert.match(matched.metricSources!['technology.matches']!,/^verified_persisted_technical_counts\//);
 const mismatch=row();
 applyRetainedOptOutExtracts([mismatch],[input({...record,projection_source_hash:'f'.repeat(64)})]);
 assert.equal(mismatch.measurements,undefined);
 assert.throws(()=>applyRetainedOptOutExtracts([matched],[input({...record,technicalCounts:[['certscore.site-integrity-projection.v1',1],null]})]),/Conflicting generation-bound technical count/);
 assert.throws(()=>applyRetainedOptOutExtracts([row()],[input({...record,technicalCounts:[['certscore.site-integrity-projection.v1',13],null]})]),/Invalid verified technical counts/);
});
test('tracking review receipts preserve separate evidence and verdicts for the matched generation',()=>{
 const version='persisted-canonical-report-projection-v7';
 const record={...extract(),trackingReviews:[[version,'observed','Insufficient evidence'],[version,'not_testable','Not testable']]};
 const input=(r:unknown)=>receipt([r],'certscore.mac-mini-direct-id-inventory.v1');
 const matched=row();
 applyRetainedOptOutExtracts([matched],[input(record)]);
 assert.equal(matched.states['sealed.checklist.sensitive_surfaces_third_party_tracking'],'observed');
 assert.equal(matched.states['sealed.verdict.sensitive_surfaces_third_party_tracking'],'insufficient_evidence');
 assert.equal(matched.states['sealed.checklist.cross_border_endpoint_review'],'not_testable');
 const mismatch=row();
 applyRetainedOptOutExtracts([mismatch],[input({...record,projection_source_hash:'f'.repeat(64)})]);
 assert.equal(mismatch.states['sealed.checklist.cross_border_endpoint_review'],undefined);
 assert.throws(()=>applyRetainedOptOutExtracts([matched],[input({...record,trackingReviews:[null,[version,'not_observed','Not observed']]})]),/Conflicting persisted tracking review/);
});
test('the independent producer receipt survives a size-bound choice summary and rejects unbound inputs',()=>{
 const value={version:'certscore.audit-policy-provenance.v1',
  binding:{scanId:id,createdAt:'2026-10-29T12:00:00.000Z',generation:'scan-report-projection-v27',sourceHash:'a'.repeat(64)},
  bundle:'d'.repeat(64),fetch:'fetched',owner:1,text:'producer_verified_complete_receipt',t:0,r:0};
 const selected={...extract(),choice_audit:{version:'certscore.audit-choice-summary.v2',availability:'size_bound'},policyReceipt:value};
 const key='sealed.operations.policy_text_receipt';
 const makeRow=():ProgressRow=>({...row(),createdAt:value.binding.createdAt,originProof:'original_credential_verified',originRequestId:'original'});
 const direct=(selection:unknown)=>receipt([selection],'certscore.mac-mini-direct-id-inventory.v1');
 const matched=makeRow(),source=direct(selected);
 applyRetainedOptOutExtracts([matched],[source]);
 assert.equal(matched.states[key],value.text);
 assert.equal(matched.states['sealed.operations.transfer_framework_check'],'checked_no_signal');
 assert.equal(matched.states['sealed.operations.transfer_framework_reasons'],'reason_mask_0');
 assert.match(matched.metricSources![key]!,/^persisted_policy_receipt\//);
 assert.equal(matched.states['sealed.policy_full_text'],undefined);
 assert.equal(matched.refs.filter(ref=>ref.role==='generation_matched_policy_receipt').length,1);
 assert.equal(verifyChoiceEvidence({rows:[matched],optOutExtracts:[source]}).sourceMismatchCount,0);
 for(const patch of [
  {isCanary:true},{originalRequestId:'different'},{projection_status:'pending'},{projection_payload_sha256:null},
  {policyReceipt:null},{policyReceipt:{...value,extra:'unexpected'}},
  ...[{scanId:'wrong'},{createdAt:'2026-10-29T12:00:00.001Z'},{generation:'old'},{sourceHash:'f'.repeat(64)}].map(binding=>
    ({policyReceipt:{...value,binding:{...value.binding,...binding}}})),
 ]){
  const rejected=makeRow();
  applyRetainedOptOutExtracts([rejected],[direct({...selected,...patch})]);
  assert.equal(rejected.states[key],undefined);
 }
 const conflicting=direct({...selected,policyReceipt:{...value,text:'producer_verified_limited_receipt'}});
 assert.throws(()=>applyRetainedOptOutExtracts([matched],[conflicting]),/Conflicting generation-bound policy receipt/);
});

test('Accept stop diagnostics require matching original creator and consistent ready payload across deliveries',()=>{
 const key='sealed.priority_evidence.accept_path_reason',hash='a'.repeat(64);
 const candidate={...extract(),choice_audit:choiceSummaryFromRecord({
  scan:{id},snapshot:{consentControlAssessment:fixture.assessment},
  runtimeArtifacts:{acceptPathDiagnostic:[hash,'dispatch_guard_rejected'],postAcceptEvidenceProjection:{execution:{clickCompleted:false}}},
  events:[{eventType:'v2_lambda_result.received',metadataJson:{artifactMetadata:{scanArtifactUri:{sha256:hash}}}}],
 })};
 const input=(r:unknown)=>receipt([r],'certscore.mac-mini-direct-id-inventory.v1');
 const verified=()=>({...row(),originProof:'original_credential_verified',originRequestId:'original'});
 const matched=verified();
 applyRetainedOptOutExtracts([matched],[input(candidate)]);
 assert.equal(matched.states[key],'dispatch_guard_rejected');
 for(const [report, e] of [
  [row(),candidate],
  [verified(),{...candidate,originalRequestId:'other-creator'}],
  [verified(),{...candidate,projection_payload_sha256:null}],
 ] as const){
  applyRetainedOptOutExtracts([report],[input(e)]);
  assert.equal(report.states[key],undefined);
 }
 assert.throws(()=>applyRetainedOptOutExtracts([verified()],[input(candidate),
  input({...candidate,projection_payload_sha256:'c'.repeat(64)})]),/Conflicting generation-bound Accept diagnostic payload/);
 const withoutReason={...candidate,choice_audit:choiceSummaryFromRecord({
  scan:{id},snapshot:{consentControlAssessment:fixture.assessment},
  runtimeArtifacts:{postAcceptEvidenceProjection:{execution:{clickCompleted:false}}},
 })};
 for(const choice_audit of [withoutReason.choice_audit,undefined,{version:'future_summary'}]){
  const omitted=input({...withoutReason,choice_audit,projection_payload_sha256:'c'.repeat(64)});
  for(const order of [[input(candidate),omitted],[omitted,input(candidate)]])
   assert.throws(()=>applyRetainedOptOutExtracts([verified()],order),/Conflicting generation-bound Accept diagnostic payload/);
 }
 const repeat=verified();
 applyRetainedOptOutExtracts([repeat],[input(withoutReason),input(candidate)]);
 assert.equal(repeat.states[key],'dispatch_guard_rejected');
});

test('the daily archive path replays both diagnostics against the exact frozen query and report generation',()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'forward-coverage-'));
 const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
 const cms='cms_document_mismatch',accept='target_navigation_failed';
 const key='sealed.priority_evidence.accept_path_reason';
 const exportFile=path.join(directory,id+'.json');
 const archive={
  scanId:id,scanStatus:'completed',domain:'dollargeneral.com',
  timestamps:{createdAt:row().createdAt},
  meta:{reportProjectionVersion:row().projectionVersion,reportProjectionSourceHash:row().publicProjectionSourceHash},
 };
 const publicRef={file:exportFile,sha256:sha(JSON.stringify(archive)),role:'hash_verified_bot_archive_export'};
 const daily=():ProgressRow=>({...extractExportRow(archive,publicRef),originProof:'mac_mini_archive'});
 const legacy={...extract(),technicalCounts:[null,'source_missing']};
 const forward={...extract(),technicalCounts:[null,cms],choice_audit:choiceSummaryFromRecord({
  scan:{id},snapshot:{consentControlAssessment:fixture.assessment},
  runtimeArtifacts:{acceptPathDiagnostic:['a'.repeat(64),accept],postAcceptEvidenceProjection:{execution:{clickCompleted:false}}},
  events:[{eventType:'v2_lambda_result.received',metadataJson:{artifactMetadata:{scanArtifactUri:{sha256:'a'.repeat(64)}}}}],
 })};
 const sql=buildAuditDeltaQuery({overlapStartUtc:'2026-10-28T00:00:00Z',windowEndUtc:'2026-10-30T00:00:00Z',
  includeForwardCoverageDiagnostics:true},false,true,true,true,true,true,true,true);
 const sqlFile=path.join(directory,'delta-inventory.sql');
 const file=path.join(directory,'delta-inventory.json');
 const save=(e:unknown)=> {
  const bytes=JSON.stringify({version:'certscore.mac-mini-direct-id-inventory.v1',readOnly:true,choiceAuditVersion:CHOICE_AUDIT_VERSION,
   forwardCoverageDiagnosticsProjected:true,querySha256:sha(sql),rows:[e]});
  writeFileSync(file,bytes);return {file,sha256:sha(bytes),bytes:Buffer.byteLength(bytes)};
 };
 try {
  writeFileSync(exportFile,JSON.stringify(archive));writeFileSync(sqlFile,sql);
  const source=save(forward),older=receipt([legacy],'certscore.mac-mini-direct-id-inventory.v1');
  for(const receipts of [[older,source],[source,older]]){
   const matched=daily();
   applyRetainedOptOutExtracts([matched],receipts);
   assert.equal(matched.states[key],accept);
   assert.equal(matched.technicalCountUnavailable?.reasons['technology.detections'],cms);
   assert.equal(matched.measurements?.['technology.detections'],undefined);
   assert.equal(matched.originProof,'mac_mini_archive');
   assert.equal(matched.originRequestId,daily().originRequestId);
   assert.equal(matched.states['click.accept'],daily().states['click.accept']);
   assert.equal(verifyChoiceEvidence({rows:[matched],optOutExtracts:receipts}).sourceMismatchCount,0);
  }
  for(const patch of [{projection_payload_sha256:'c'.repeat(64)},{originalRequestId:'other-creator'}]){
   const conflict=receipt([{...legacy,...patch}],'certscore.mac-mini-direct-id-inventory.v1');
   for(const order of [[conflict,source],[source,conflict]])
    assert.throws(()=>applyRetainedOptOutExtracts([daily()],order),/Conflicting generation-bound Accept diagnostic payload or CMS diagnostic provenance/);
  }
  const exactCreatorButWrongGeneration=save({...forward,projection_source_hash:'f'.repeat(64)});
  const mismatch=daily();
  applyRetainedOptOutExtracts([mismatch],[exactCreatorButWrongGeneration]);
  assert.equal(mismatch.states[key],undefined);
  assert.equal(mismatch.technicalCountUnavailable,undefined);
  const restored=save(forward);
  const clicked=daily();
  clicked.states['click.accept']='completed';
  applyRetainedOptOutExtracts([clicked],[restored]);
  assert.equal(clicked.states[key],undefined);
  writeFileSync(exportFile,JSON.stringify({...archive,scanStatus:'failed'}));
  assert.throws(()=>applyRetainedOptOutExtracts([daily()],[restored]),/Diagnostic archive source hash mismatch/);
  writeFileSync(sqlFile,sql+' ');
  assert.throws(()=>applyRetainedOptOutExtracts([daily()],[restored]),/Audit query SQL hash mismatch/);
 }finally{rmSync(directory,{recursive:true,force:true});}
});
