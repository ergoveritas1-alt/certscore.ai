import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync} from 'node:fs';import {tmpdir} from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {extractExportRow} from './audit-progress-export';import {verifyChoiceEvidence} from './audit-progress-choice-verification';
import {applyChoiceSummary,choiceSummaryFromRecord} from './audit-progress-choice';
import {applyRetainedOptOutExtracts} from './audit-progress-opt-out';
import {CONTROL_ACCESSIBILITY_KEYS} from './audit-progress-control-accessibility';
import {buildAuditDeltaQuery} from './audit-delta-query';
import {CMP_BLOCKER_NOT_PROJECTED,CMP_DELIVERY_KEY} from './audit-progress-priority-evidence';

test('dispatch rejection details independently replay from hash-verified summaries and reject conflicts',()=>{
 const scanId='11111111-1111-4111-8111-111111111111';
 const counts=Array(14).fill(0);counts[12]=1;
 const decision={version:'conditional_opt_out_dispatch.v3',scanId,status:'skipped',reason:'unsupported_or_unverified_control',sourceSha256:'a'.repeat(64),controlObserved:true,supportedRoute:false,observationId:'original-control',rejection:[1,1,1,1,0,counts,[[0,0,12,2]]]};
 const record={scan:{id:scanId},snapshot:{consentControlAssessment:{scan:{noGo:false}}},events:[{eventType:'v2_lambda_result.received',metadataJson:{artifactVerification:{optOutDispatch:'conditional_no_dispatch_recorded',conditionalOptOutDecision:decision}}}]};
 const bytes=JSON.stringify({report_projection_payload:record});
 const file=path.join(mkdtempSync(path.join(tmpdir(),'audit-dispatch-rejection-')),'projection.json');writeFileSync(file,bytes);
 const ref={file,sha256:createHash('sha256').update(bytes).digest('hex'),role:'checksum_verified_projection'};
 const row=extractExportRow({scanId,domain:'example.com',scanStatus:'completed',timestamps:{createdAt:'2026-11-09T12:00:00Z'}},ref);
 applyChoiceSummary(row,choiceSummaryFromRecord(record),'persisted_report_choice_summary/fixture');
 assert.deepEqual(row.optOutRejection,{receipt:decision.rejection,sourceSha256:decision.sourceSha256});
 assert.equal(verifyChoiceEvidence({rows:[row],optOutExtracts:[]}).sourceMismatchCount,0);
 const changed=structuredClone(record);changed.events[0]!.metadataJson.artifactVerification.conditionalOptOutDecision.sourceSha256='b'.repeat(64);
 assert.throws(()=>applyChoiceSummary(row,choiceSummaryFromRecord(changed),'fixture'),/Conflicting generation-bound opt-out rejection/);
 row.optOutRejection!.receipt[6][0]![3]=1;
 assert.throws(()=>verifyChoiceEvidence({rows:[row],optOutExtracts:[]}),/Opt-out rejection receipt/);
});

test('CMP omission requires hash-bound fallback SQL and yields to a matched detailed blocker',()=>{
 const scanId='11111111-1111-4111-8111-111111111111';
 const createdAt='2026-11-07T15:00:00.000Z',sourceHash='a'.repeat(64);
 const projectionVersion='scan-report-projection-v27';
 const makeRow=()=>extractExportRow({scanId,domain:'example.com',scanStatus:'completed',timestamps:{createdAt},
  meta:{projectionVersion:'pulse-public-v11',reportProjectionVersion:projectionVersion,reportProjectionSourceHash:sourceHash}},
 {file:'/unused-fixture',sha256:'a'.repeat(64),role:'fixture'});
 const inventory=(blocker:string,includeDetails:boolean,payloadHash='b'.repeat(64))=>{
  const dir=mkdtempSync(path.join(tmpdir(),'audit-cmp-transport-'));
  const sql=buildAuditDeltaQuery({overlapStartUtc:'2026-11-07T00:00:00Z',windowEndUtc:'2026-11-08T00:00:00Z'},false,true,includeDetails);
  writeFileSync(path.join(dir,'delta-inventory.sql'),sql);
  const choice=choiceSummaryFromRecord({scan:{id:scanId},snapshot:{consentControlAssessment:{scan:{noGo:false}}},
   runtimeArtifacts:{gpcCmpPairBlocker:blocker}});
  const file=path.join(dir,'delta-inventory.json');
  const bytes=Buffer.from(JSON.stringify({version:'certscore.mac-mini-direct-id-inventory.v1',readOnly:true,
   choiceAuditVersion:'certscore.audit-choice-summary.v2',querySha256:createHash('sha256').update(sql).digest('hex'),
   rows:[{scanId,isMacMini:true,isCanary:false,originalRequestId:'origin',created_at:createdAt,status:'completed',
    projection_status:'ready',projection_version:projectionVersion,projection_source_hash:sourceHash,
    projection_payload_sha256:payloadHash,choice_audit:choice}]}));
  writeFileSync(file,bytes);
  return {file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
 };
 const fallback=inventory('source_missing',false);
 const detailed=inventory('gpc_checkpoint_unavailable',true);
 const only=makeRow();
 applyRetainedOptOutExtracts([only],[fallback]);
 assert.equal(only.states[CMP_DELIVERY_KEY],CMP_BLOCKER_NOT_PROJECTED);
 assert.match(only.metricSources![CMP_DELIVERY_KEY]!,/cmp-blocker-omitted$/);
 assert.equal(only.states['sealed.choice_evidence.paired_cmp'],undefined);
 for(const sources of [[detailed,fallback],[fallback,detailed]]){
  const row=makeRow();
  applyRetainedOptOutExtracts([row],sources);
  assert.equal(row.states[CMP_DELIVERY_KEY],'gpc_checkpoint_unavailable');
  assert.equal(verifyChoiceEvidence({rows:[row],optOutExtracts:sources}).sourceMismatchCount,0);
  row.metricSources![CMP_DELIVERY_KEY]='incorrect-scope';
  assert.throws(()=>verifyChoiceEvidence({rows:[row],optOutExtracts:sources}),/Choice evidence source scope/);
 }
 const actualAbsence=inventory('source_missing',true);
 assert.throws(()=>applyRetainedOptOutExtracts([makeRow()],[detailed,actualAbsence]),/Conflicting persisted choice summary/);
 assert.throws(()=>applyRetainedOptOutExtracts([makeRow()],[detailed,inventory('source_missing',false,'c'.repeat(64))]),/Conflicting generation-bound CMP transport/);
 writeFileSync(path.join(path.dirname(fallback.file),'delta-inventory.sql'),'changed');
 assert.throws(()=>applyRetainedOptOutExtracts([makeRow()],[fallback]),/SQL hash mismatch/);
});
test('source reconciliation rejects a tampered GPC row even when its aggregate could balance',()=>{
 const packet={scanId:'11111111-1111-4111-8111-111111111111',domain:'example.com',scanStatus:'completed',timestamps:{createdAt:'2026-11-05T12:00:00Z'},meta:{projectionVersion:'pulse-public-v11',reportProjectionVersion:'scan-report-projection-v27'}};
 const bytes=JSON.stringify(packet),file=path.join(mkdtempSync(path.join(tmpdir(),'audit-choice-proof-')),'export.json');writeFileSync(file,bytes);
 const ref={file,sha256:createHash('sha256').update(bytes).digest('hex'),role:'hash_verified_bot_archive_export'};
 const row=extractExportRow(packet,ref);assert.equal(verifyChoiceEvidence({rows:[row],optOutExtracts:[]}).sourceMismatchCount,0);
 row.states['detail.gpc.paired_pair']='measured';assert.throws(()=>verifyChoiceEvidence({rows:[row],optOutExtracts:[]}),/GPC source state/);
 row.states['detail.gpc.paired_pair']='unavailable';row.measurements!['gpc.session.recipients']=0;assert.throws(()=>verifyChoiceEvidence({rows:[row],optOutExtracts:[]}),/GPC source quantity/);
});
test('source reconciliation rejects invented conditional timing',()=>{
 const scanId='11111111-1111-4111-8111-111111111111';
 const decision={version:'conditional_opt_out_dispatch.v2',scanId,status:'skipped',reason:'insufficient_remaining_time',sourceSha256:'a'.repeat(64),controlObserved:true,supportedRoute:true,observationId:'control',recipeVersion:'recipe',remainingTimeMs:2400,decidedAtMs:10000};
 const record={scan:{id:scanId},snapshot:{consentControlAssessment:{scan:{noGo:false}}},events:[{eventType:'v2_lambda_result.received',metadataJson:{artifactVerification:{optOutDispatch:'conditional_no_dispatch_recorded',conditionalOptOutDecision:decision}}}]};
 const bytes=JSON.stringify({report_projection_payload:record});
 const file=path.join(mkdtempSync(path.join(tmpdir(),'audit-choice-timing-')),'projection.json');writeFileSync(file,bytes);
 const ref={file,sha256:createHash('sha256').update(bytes).digest('hex'),role:'checksum_verified_projection'};
 const row=extractExportRow({scanId,domain:'example.com',scanStatus:'completed',timestamps:{createdAt:'2026-11-05T12:00:00Z'}},ref);
 applyChoiceSummary(row,choiceSummaryFromRecord(record),'persisted_report_choice_summary/fixture');
 assert.equal(row.measurements!['sealed.opt_out.decision_remaining_ms'],2400);
 assert.equal(verifyChoiceEvidence({rows:[row],optOutExtracts:[]}).sourceMismatchCount,0);
 row.measurements!['sealed.opt_out.decision_remaining_ms']=0;
 assert.throws(()=>verifyChoiceEvidence({rows:[row],optOutExtracts:[]}),/Choice source quantity/);
});

test('control accessibility requires a matched private generation and independently replays the two states',()=>{
 const scanId='11111111-1111-4111-8111-111111111111';
 const createdAt='2026-11-07T15:00:00.000Z';
 const sourceHash='a'.repeat(64);
 const version='persisted-canonical-report-projection-v7';
 const report={scanId,domain:'example.com',scanStatus:'completed',timestamps:{createdAt},
  meta:{projectionVersion:'pulse-public-v11',reportProjectionVersion:'scan-report-projection-v27',reportProjectionSourceHash:sourceHash},
  accessibilityAudit:{required:true,status:'completed',failedRuleCount:4}};
 const dir=mkdtempSync(path.join(tmpdir(),'audit-control-accessibility-'));
 const write=(name:string,value:unknown)=>{
  const file=path.join(dir,name),body=Buffer.from(JSON.stringify(value));
  writeFileSync(file,body);
  return {file,sha256:createHash('sha256').update(body).digest('hex'),bytes:body.length};
 };
 const publicRef={...write('export.json',report),role:'hash_verified_bot_archive_export'};
 const makeRow=()=>extractExportRow(report,publicRef);
 const extract={scanId,isMacMini:true,isCanary:false,originalRequestId:'origin',status:'completed',
  projection_status:'ready',projection_version:'scan-report-projection-v27',projection_source_hash:sourceHash,
  projection_payload_sha256:'b'.repeat(64),created_at:createdAt,controlAccessibility:[version,'observed','Gap observed']};
 const inventory=(name:string,patch:Record<string,unknown>={})=>write(name,{version:'certscore.mac-mini-direct-id-inventory.v1',
  readOnly:true,rows:[{...extract,...patch}]});
 const [evidence,verdict]=CONTROL_ACCESSIBILITY_KEYS;
 const row=makeRow(),source=inventory('valid.json');
 assert.equal(row.states[evidence],undefined,'page-wide failure cannot establish a control outcome');
 applyRetainedOptOutExtracts([row],[source]);
 assert.equal(row.states[evidence],'observed');
 assert.equal(row.states[verdict],'gap_observed');
 assert.equal(row.refs.at(-1)?.role,'generation_matched_control_accessibility_extract');
 assert.equal(verifyChoiceEvidence({rows:[row],optOutExtracts:[source]}).sourceMismatchCount,0);
 assert.throws(()=>verifyChoiceEvidence({rows:[row],optOutExtracts:[{...source,sha256:'c'.repeat(64)}]}),/hash\/size/);
 row.metricSources![verdict]='page-wide';
 assert.throws(()=>verifyChoiceEvidence({rows:[row],optOutExtracts:[source]}),/Control accessibility source scope/);
 delete row.states[verdict];
 assert.throws(()=>verifyChoiceEvidence({rows:[row],optOutExtracts:[source]}),/Control accessibility source state/);
 const detailed=inventory('detail.json',{controlAccessibility:[version,'not_testable','Not testable',[1,'partial',16,1,0,0,0]]});
 const detailedRow=makeRow();applyRetainedOptOutExtracts([detailedRow],[detailed]);
 assert.deepEqual(detailedRow.controlAccessibilityCoverage?.reasons,['control_results_missing']);
 assert.equal(verifyChoiceEvidence({rows:[detailedRow],optOutExtracts:[detailed]}).sourceMismatchCount,0);
 detailedRow.controlAccessibilityCoverage!.completed=1;
 assert.throws(()=>verifyChoiceEvidence({rows:[detailedRow],optOutExtracts:[detailed]}),/Control coverage receipt/);
 const limited=inventory('limited.json',{controlAccessibility:[version,'not_testable','Not testable']});
 const partial=makeRow();
 applyRetainedOptOutExtracts([partial],[limited]);
 assert.equal(partial.states[evidence],'not_testable');
 assert.throws(()=>applyRetainedOptOutExtracts([partial],[source]),/Conflicting persisted control accessibility/);
 for(const [index,patch] of [{isCanary:true},{projection_status:'pending'},{originalRequestId:null},
  {projection_source_hash:'d'.repeat(64)},{projection_payload_sha256:null},{created_at:'2026-11-07T15:00:01Z'},
  {controlAccessibility:['unknown-version','observed','Gap observed']},{controlAccessibility:[version,'observed',null]}].entries()){
  const rejected=makeRow();
  applyRetainedOptOutExtracts([rejected],[inventory(`rejected-${index}.json`,patch)]);
  assert.equal(rejected.states[evidence],undefined);
 }
});
