import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync} from 'node:fs';import {tmpdir} from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {extractExportRow} from './audit-progress-export';import {verifyChoiceEvidence} from './audit-progress-choice-verification';
import {applyChoiceSummary,choiceSummaryFromRecord} from './audit-progress-choice';
import {applyRetainedOptOutExtracts} from './audit-progress-opt-out';
import {CONTROL_ACCESSIBILITY_KEYS} from './audit-progress-control-accessibility';
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
