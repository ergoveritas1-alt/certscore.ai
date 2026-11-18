import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import fixture from '../../apps/web/lib/scans/test-fixtures/dollar-general-consent-assessment.json';
import {retainedOptOutState,historicalOptOutSql,applyRetainedOptOutExtracts,OPT_OUT_EXTRACT_VERSION,REJECT_ACTIVITY_REF} from './audit-progress-opt-out';
import type {ProgressRow} from './audit-progress';
import {verifyChoiceEvidence} from './audit-progress-choice-verification';
import {CHOICE_AUDIT_VERSION,choiceMetricRegistry,choiceSummaryFromRecord} from './audit-progress-choice';
import {buildAuditDeltaQuery} from './audit-delta-query';
import {extractExportRow} from './audit-progress-export';
import {REJECT_ACTIVITY_KEY} from './audit-progress-priority-evidence';
import {progressEngine} from './audit-progress-engine';
import {EVIDENCE_METRICS} from './audit-progress-evidence';
const id=fixture.assessment.scan.scanId;
const row=():ProgressRow=>({scanId:id,site:'dollargeneral.com',createdAt:'2026-10-29T12:00:00Z',region:'us-west-1',producer:'unknown',profile:'unknown',assessmentVersion:'pulse-public-v10',projectionVersion:'scan-report-projection-v27',publicProjectionSourceHash:'a'.repeat(64),originRequestId:'archive',states:{'control.privacyOptOut':'unavailable'},findings:[],findingInventory:true,reportable:true,refs:[]});
const extract=()=>({scanId:id,isMacMini:true,isCanary:false,originalRequestId:'original',publicationRequestStatus:'ready',status:'completed',created_at:'2026-10-29T12:00:00.000123Z',projection_source_hash:'a'.repeat(64),projection_payload_sha256:'b'.repeat(64),projection_version:'scan-report-projection-v27',projection_status:'ready',control_assessment:structuredClone(fixture.assessment)});
function receipt(rows:any[],version=OPT_OUT_EXTRACT_VERSION as string){const file=path.join(mkdtempSync(path.join(tmpdir(),'opt-out-extract-')),'extract.json');writeFileSync(file,JSON.stringify({version,readOnly:true,rows}));const b=readFileSync(file);return {file,sha256:createHash('sha256').update(b).digest('hex'),bytes:b.length};}
test('bounded Reject activity counts a completed unconfirmed click only with the matching packet and generation',()=>{
 const root=mkdtempSync(path.join(tmpdir(),'audit-reject-activity-'));
 const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
 const packet='c'.repeat(64), base=row(), exportFile=path.join(root,id+'.json');
 const archive={
  scanId:id,scanStatus:'completed',domain:base.site,timestamps:{createdAt:base.createdAt},
  meta:{projectionVersion:'pulse-public-v11',reportProjectionVersion:base.projectionVersion,reportProjectionSourceHash:base.publicProjectionSourceHash},
  postRefusalObservation:{
   status:'unconfirmed',verdict:'no_confirmed_post_refusal_verdict',
   execution:{policyVersion:'choice_path_execution.v1',status:'succeeded',clickCompleted:true,observationCompleted:true,consentConfirmed:false},
   confirmation:{policyVersion:'choice_confirmation_summary.v2',sourcePacketSha256:packet,initialRegistrationStatus:'unconfirmed'},
   afterAction:{requestCount:4,storageWriteCount:2},
  },
 };
 const publicRef={file:exportFile,sha256:sha(JSON.stringify(archive)),role:'hash_verified_bot_archive_export'};
 const daily=():ProgressRow=>({...extractExportRow(archive,publicRef),originProof:'mac_mini_archive'});
 const sql=buildAuditDeltaQuery({overlapStartUtc:'2026-10-28T00:00:00Z',windowEndUtc:'2026-10-30T00:00:00Z',
  includeRejectActivityReceipt:true},false);
 const input=(patch:Record<string,unknown>={})=>{
  const dir=mkdtempSync(path.join(root,'inventory-'));
  const file=path.join(dir,'delta-inventory.json');
  const bytes=JSON.stringify({version:'certscore.mac-mini-direct-id-inventory.v1',readOnly:true,choiceAuditVersion:CHOICE_AUDIT_VERSION,
   rejectActivityReceiptProjected:true,querySha256:sha(sql),rows:[{...extract(),auditRejectActivity:[1,id,packet,'request'],...patch}]});
  writeFileSync(file,bytes);writeFileSync(path.join(dir,'delta-inventory.sql'),sql);
  return {file,sha256:sha(bytes),bytes:Buffer.byteLength(bytes)};
 };
 try {
  writeFileSync(exportFile,JSON.stringify(archive));
  const matched=daily(),source=input(),legacy=receipt([extract()],'certscore.mac-mini-direct-id-inventory.v1');
  applyRetainedOptOutExtracts([matched],[legacy,source]);
  assert.equal(matched.states[REJECT_ACTIVITY_KEY],'request');
  assert.match(matched.metricSources![REJECT_ACTIVITY_KEY]!,/certscore\.audit-reject-activity\.v1\/bounded_after_action_capture\.v2$/);
  assert.ok(choiceMetricRegistry([matched]).some(metric=>metric.id===REJECT_ACTIVITY_KEY));
  assert.equal(matched.states['detail.reject.verdict'],'no_confirmed_post_refusal_verdict');
  assert.ok(matched.refs.some(ref=>ref.role===REJECT_ACTIVITY_REF&&ref.sha256===source.sha256));
  const metrics=EVIDENCE_METRICS.filter(m=>m.id==='detail.reject.activity_all'||m.id==='detail.reject.verdict');
  const days=[{date:'2026-10-29',completeDay:false}];
  const [day]=progressEngine().aggregate({metrics,days,findingIds:[]},[matched]);
  assert.equal(day.metrics['detail.reject.activity_all'].numerator,1);
  assert.equal(day.metrics['detail.reject.verdict'].numerator,0);
  assert.deepEqual(day.metrics['detail.reject.activity_all'].activityCoverage,{completedClicks:1,classifiedCompletedClicks:1,observedCompletedClicks:1});
  assert.equal(verifyChoiceEvidence({rows:[matched],optOutExtracts:[legacy,source],metrics,days}).sourceMismatchCount,0);
  for(const [result,requestOrWrite] of [
   ['request',1],['storage_write',1],['request_and_storage_write',1],['cookie_snapshot',0],
   ['request_and_cookie_snapshot',1],['storage_write_and_cookie_snapshot',1],['request_and_storage_write_and_cookie_snapshot',1],
  ] as const){
   const scan=daily(),receipt=input({auditRejectActivity:[2,id,packet,result]});
   applyRetainedOptOutExtracts([scan],[receipt]);
   assert.equal(scan.states[REJECT_ACTIVITY_KEY],result);
   assert.match(scan.metricSources![REJECT_ACTIVITY_KEY]!,/certscore\.audit-reject-activity\.v2\/retained_reject_presence$/);
   const [day]=progressEngine().aggregate({metrics,days,findingIds:[]},[scan]);
   const observed=day.metrics['detail.reject.activity_all'];
   assert.equal(observed.numerator,1);
   assert.deepEqual(observed.activityCoverage,{completedClicks:1,classifiedCompletedClicks:requestOrWrite,observedCompletedClicks:requestOrWrite});
   assert.equal(verifyChoiceEvidence({rows:[scan],optOutExtracts:[receipt],metrics,days}).sourceMismatchCount,0);
   scan.findings=[{id:'post_reject_click_tracking',label:'Non-essential cookies or services after Reject',family:'other',top:null}];
   assert.equal(progressEngine().aggregate({metrics,days},[scan])[0].metrics['detail.reject.activity_all'].numerator,1);
  }
  for(const [patch,state] of [
   [{auditRejectActivity:[1,id,'d'.repeat(64),'request']},'invalid_or_unbound'],
   [{auditRejectActivity:[2,id,'d'.repeat(64),'cookie_snapshot']},'invalid_or_unbound'],
   [{auditRejectActivity:[1,id,packet,'cookie_snapshot']},'invalid_or_unbound'],
   [{auditRejectActivity:[3,id,packet,'cookie_snapshot']},'invalid_or_unbound'],
   [{auditRejectActivity:[1,id,packet,'classification_unavailable']},'classification_unavailable'],
   [{auditRejectActivity:null},'receipt_unavailable'],
   [{projection_source_hash:'f'.repeat(64)},undefined],
  ] as const){
   const unbound=daily();applyRetainedOptOutExtracts([unbound],[input(patch)]);
   assert.equal(unbound.states[REJECT_ACTIVITY_KEY],state);
   const [day]=progressEngine().aggregate({metrics,days,findingIds:[]},[unbound]);
   assert.equal(day.metrics['detail.reject.activity_all'].counts.unavailable,1);
  }
  const historical=daily();applyRetainedOptOutExtracts([historical],[legacy]);
  assert.equal(historical.states[REJECT_ACTIVITY_KEY],undefined);
  assert.ok(!choiceMetricRegistry([historical]).some(metric=>metric.id===REJECT_ACTIVITY_KEY));
  assert.throws(()=>applyRetainedOptOutExtracts([daily()],[source,input({auditRejectActivity:[1,id,packet,'storage_write']})]),/Conflicting generation-bound post-Reject/);
  assert.throws(()=>applyRetainedOptOutExtracts([daily()],[source,input({originalRequestId:'other'})]),/Reject activity provenance/);
  assert.throws(()=>applyRetainedOptOutExtracts([daily()],[input({auditRejectActivity:undefined})]),/Missing frozen daily query or column/);
  writeFileSync(exportFile,JSON.stringify({...archive,scanStatus:'failed'}));
  assert.throws(()=>applyRetainedOptOutExtracts([daily()],[source]),/Diagnostic archive source hash mismatch/);
 } finally {rmSync(root,{recursive:true,force:true});}
});
test('a navigation block joins the original no-go export and ready inventory generation',()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'navigation-audit-'));
 try{
  const base=row(), file=path.join(directory,id+'.json');
  const bytes=JSON.stringify({scanId:id,scanStatus:'completed_limited',resultDisposition:'no_go',timestamps:{createdAt:base.createdAt},
   meta:{reportProjectionVersion:base.projectionVersion,reportProjectionSourceHash:base.publicProjectionSourceHash}});
  writeFileSync(file,bytes);
  const noGo=():ProgressRow=>({...base,reportable:false,originProof:'mac_mini_archive',states:{outcome:'no_go'},
   refs:[{file,sha256:createHash('sha256').update(bytes).digest('hex'),role:'hash_verified_bot_archive_export'}]});
  const block={initial:'timeout',terminal:'ERR_BLOCKED_BY_CLIENT',mode:'https_apex_www_recovery',guard:{reason:'dns_resolution_failed',resolverCode:'ENOTFOUND'}};
  const source=(patch:Record<string,unknown>={})=>receipt([{...extract(),auditNavigationBlock:block,...patch}],'certscore.mac-mini-direct-id-inventory.v1');
  const good=noGo();
  applyRetainedOptOutExtracts([good],[source()]);
  assert.deepEqual(good.navigationBlock,block);
  assert.deepEqual(good.states,{outcome:'no_go'});
  assert.ok(good.refs.some(r=>r.role==='runtime_navigation_block'));
  for(const patch of [{projection_source_hash:'c'.repeat(64)},{isCanary:true},{projection_status:'pending'}]){
   const scan=noGo();applyRetainedOptOutExtracts([scan],[source(patch)]);assert.equal(scan.navigationBlock,undefined);
  }
  assert.throws(()=>applyRetainedOptOutExtracts([noGo()],[source(),source({projection_payload_sha256:'f'.repeat(64)})]),/Conflicting navigation/);
  assert.throws(()=>applyRetainedOptOutExtracts([noGo()],[source({auditNavigationBlock:{...block,url:'private'}})]));
 }finally{rmSync(directory,{recursive:true,force:true});}
});
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
