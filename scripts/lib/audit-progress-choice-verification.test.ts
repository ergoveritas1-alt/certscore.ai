import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync} from 'node:fs';import {tmpdir} from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {extractExportRow} from './audit-progress-export';import {verifyChoiceEvidence} from './audit-progress-choice-verification';
import {applyChoiceSummary,choiceSummaryFromRecord} from './audit-progress-choice';
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
