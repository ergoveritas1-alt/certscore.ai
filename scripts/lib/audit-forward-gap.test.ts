import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import fixtures from '../../apps/web/lib/scans/test-fixtures/retained-terminal-confirmations.json';
import {gpcProductFixture} from '../../apps/web/lib/scans/test-fixtures/gpc-product';
import {priorityEvidenceFromRecord,priorityEvidenceStates,priorityCoverageStates,withBoundedPriority,jsonbBytes} from './audit-progress-priority-evidence';
import {choiceSummaryFromRecord,choiceSummaryAudit,applyChoiceSummary} from './audit-progress-choice';
import {buildAuditDeltaQuery,assertCurrentPriorityExtraction} from './audit-delta-query';import {auditSqlOverrideFits} from './audit-prod-db-bounded';
import {NORMALIZED_CMP_ITEMS,FORM_CONTEXT_ITEMS,FORWARD_UTILITY} from './audit-forward-utility';import {P2_AUDIT_IDS} from './audit-p2-coverage';import {COVERAGE_MATRIX} from './audit-progress-coverage-matrix';
const id='11111111-1111-4111-8111-111111111111';
const record=(runtimeArtifacts:any)=>({scan:{id},snapshot:{consentControlAssessment:{scan:{noGo:false}}},runtimeArtifacts,canonicalReportProjection:{globalUnifiedFindings:[]}});
test('actual retained terminal producer fixtures flow through summary and audit without hand-built witness substitutes',()=>{
 for(const f of fixtures){const action=f.action as 'accept'|'reject';const r=record({[action==='accept'?'postAcceptEvidenceProjection':'postRefusalEvidenceProjection']:f.projection});
 const result=choiceSummaryAudit(choiceSummaryFromRecord(r),id);
 assert.equal(result.states['sealed.terminal.audit_'+action],'verified');assert.equal(result.states['sealed.priority_evidence.'+action],'included');
 const bad=structuredClone(r);bad.runtimeArtifacts[action==='accept'?'postAcceptEvidenceProjection':'postRefusalEvidenceProjection'].actionControlProof.authorizedTargetSha256='f'.repeat(64);
 assert.equal(choiceSummaryAudit(choiceSummaryFromRecord(bad),id).states['sealed.terminal.audit_'+action],'unverified');
 }
});
test('paired producer packets survive compact transport with original scope and transitions',()=>{
 const f=gpcProductFixture({scanId:id,priorCmpState:true}),r=record({gpcResponseAssessment:f.assessment,gpcCmpStateComparison:f.cmpStateComparison});
 const s=choiceSummaryAudit(choiceSummaryFromRecord(r),id).states;assert.equal(s['sealed.choice_evidence.paired_cmp'],'available');assert.equal(s['sealed.priority_evidence.cmp'],'included');
 const bad=structuredClone(r);bad.runtimeArtifacts.gpcCmpStateComparison.sourceHashes.gpc='f'.repeat(64);const b=choiceSummaryAudit(choiceSummaryFromRecord(bad),id).states;assert.equal(b['sealed.choice_evidence.paired_cmp'],'invalid_or_unbound');assert.equal(b['sealed.priority_evidence.cmp'],'invalid_or_unbound');
});
test('paired CMP coverage explains a missing witness without creating a pair',()=>{
 const p=priorityEvidenceFromRecord(record({gpcCmpPairBlocker:'baseline_checkpoint_missing'}));
 const cmp='sealed.priority_evidence.cmp';
 assert.deepEqual(priorityCoverageStates(p,id)[cmp],{
  value:'baseline_checkpoint_missing',scope:'certscore.gpc-cmp-pair-blocker.v1',
 });
 assert.deepEqual(priorityEvidenceStates(p,id),{});
 const summary=choiceSummaryFromRecord(record({gpcCmpPairBlocker:'baseline_checkpoint_missing'}));
 assert.equal(choiceSummaryAudit(summary,id).states[cmp],'baseline_checkpoint_missing');
 assert.equal(choiceSummaryAudit(summary,id).states['sealed.choice_evidence.paired_cmp'],undefined);
 const unknown={...p,coverage:[p.coverage![0],p.coverage![1],'future_reason']};
 assert.equal(priorityCoverageStates(unknown,id)[cmp]?.value,'source_missing');
 const f=gpcProductFixture({scanId:id,priorCmpState:true});
 const included=priorityEvidenceFromRecord(record({gpcResponseAssessment:f.assessment,gpcCmpStateComparison:f.cmpStateComparison}));
 assert.equal(priorityCoverageStates({...included,coverage:p.coverage},id)[cmp]?.value,'invalid_coverage_receipt');
});
test('source missing, explicit no completed click, unresolved eligibility and malformed evidence remain distinct',()=>{
 const p=priorityEvidenceFromRecord(record({postAcceptEvidenceProjection:{execution:{clickCompleted:false}},postRefusalEvidenceProjection:{execution:{}}}));const s=priorityCoverageStates(p,id);
 assert.equal(s['sealed.priority_evidence.accept']?.value,'no_completed_click');assert.equal(s['sealed.priority_evidence.reject']?.value,'eligibility_unknown');assert.equal(s['sealed.priority_evidence.cmp']?.value,'source_missing');assert.deepEqual(priorityEvidenceStates(p,id),{});
 const q=priorityEvidenceFromRecord(record({postAcceptEvidenceProjection:{execution:{clickCompleted:true}}}));assert.equal(priorityCoverageStates(q,id)['sealed.priority_evidence.accept']?.value,'invalid_or_unbound');
 assert.deepEqual(priorityCoverageStates({version:p.version,accept:null,reject:null,cmp:null},id),{},'historical summaries acquire no fabricated reason');
});
test('summary cap returns explicit size omission without promoting a terminal or CMP result',()=>{
 const f=fixtures[0]!,r=record({[f.action==='accept'?'postAcceptEvidenceProjection':'postRefusalEvidenceProjection']:f.projection});const base:any=choiceSummaryFromRecord(record({}));delete base.priorityEvidence;
 let selected:any;for(let n=4000;n<8100;n+=50){const s=withBoundedPriority({...base,padding:'x'.repeat(n)},r);if(s.priorityEvidence?.transport==='size_bound'){selected=s;break;}}
 assert.ok(selected);assert.ok(jsonbBytes(selected)<=8192);assert.deepEqual(priorityEvidenceStates(selected.priorityEvidence,id),{});assert.equal(priorityCoverageStates(selected.priorityEvidence,id)['sealed.priority_evidence.'+f.action]?.value,'summary_size_bound');
 assert.deepEqual(withBoundedPriority({...base,padding:'x'.repeat(8200)},r),{version:base.version,availability:'size_bound'});
});
test('query delivery diagnostics do not mislabel local full-report replay or conflict across sources',()=>{
 const f=fixtures[0]!,r=record({[f.action==='accept'?'postAcceptEvidenceProjection':'postRefusalEvidenceProjection']:f.projection}),s=choiceSummaryFromRecord(r);const row:any={scanId:id,reportable:true,states:{},refs:[],metricSources:{}};
 applyChoiceSummary(row,s,'persisted_report_choice_summary/fixture');assert.equal(row.states['sealed.priority_evidence.'+f.action],undefined);assert.equal(row.states['sealed.terminal.audit_'+f.action],'verified');
 const limited={...s,priorityEvidence:{...s.priorityEvidence,accept:null,reject:null,cmp:null,transport:'size_bound'}};applyChoiceSummary(row,limited,'persisted_choice_extract/fixture');assert.equal(row.states['sealed.priority_evidence.'+f.action],'summary_size_bound');assert.equal(row.states['sealed.terminal.audit_'+f.action],'verified');
});
test('100 high-entropy pending UUIDs fit one bounded query; 101 and over-eight-day windows reject',()=>{
 const ids=Array.from({length:100},(_,i)=>{const h=createHash('sha256').update('pending-forward-'+i).digest('hex').slice(0,32);return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);});
 const b={overlapStartUtc:'2026-11-05T00:00:00.000Z',windowEndUtc:'2026-11-07T00:00:00.000Z',pendingRefreshIds:ids};
 const q=buildAuditDeltaQuery(b,false),fit=auditSqlOverrideFits({marker:'MACMINI_DELTA_IDS',readOnly:true,sql:q});assert.ok(fit.fits,JSON.stringify(fit));assert.match(q,/statement_timeout='45s'/);assert.match(q,/limit 5001/);assert.match(q,/priorityEvidence/);assert.match(q,/size_bound/);assert.doesNotMatch(q,/\b(?:INSERT|UPDATE|DELETE)\b/i);assert.throws(()=>buildAuditDeltaQuery({...b,pendingRefreshIds:[...ids,'11111111-1111-4111-8111-111111111111']},false),/100/);assert.throws(()=>buildAuditDeltaQuery({...b,overlapStartUtc:'2026-10-01T00:00:00.000Z'},false),/eight|8|window/i);
});

test('both optional assessments fit with 100 high-entropy pending UUIDs and required receipts', () => {
 const originalContainer = process.env.CALIBRATION_DB_ECS_CONTAINER;
 delete process.env.CALIBRATION_DB_ECS_CONTAINER;
 try {
  for (let sample = 0; sample < 256; sample++) {
   const pendingRefreshIds = Array.from({ length: 100 }, (_, index) => {
    const hex = createHash('sha256').update(`${sample}/${index}`).digest('hex').slice(0, 32);
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
   });
   const start = Date.UTC(2026, 0, 1) + sample * 87_524_688;
   const plan = {
    overlapStartUtc: new Date(start).toISOString(),
    windowEndUtc: new Date(start + 8 * 86_400_000).toISOString(),
    pendingRefreshIds,
   };
   const sql = buildAuditDeltaQuery(plan, false, true);
   const fit = auditSqlOverrideFits({ marker: 'MACMINI_DELTA_IDS', readOnly: true, sql });
   assert.match(sql, /->>'auditPrivacyForm'/);
   assert.ok(fit.limitBytes - fit.bytes >= 256, JSON.stringify({ sample, ...fit }));
   const full = buildAuditDeltaQuery(plan, true, true, true);
   const combined = auditSqlOverrideFits({ marker: 'MACMINI_DELTA_IDS', readOnly: true, sql: full });
   assert.match(full, /->>'auditPrivacyForm'/);
   assert.match(full, /"controlAccessibility"/);
   assert.match(full, /'operationsEvidence'/);
   assert.ok(combined.fits, JSON.stringify({ sample, ...combined }));
  }
 } finally {
  if (originalContainer === undefined) delete process.env.CALIBRATION_DB_ECS_CONTAINER;
  else process.env.CALIBRATION_DB_ECS_CONTAINER = originalContainer;
 }
});
test('utility review removes display duplicates and standalone form-context gap priorities without faking parity',()=>{
 for(const id of Object.keys(NORMALIZED_CMP_ITEMS)){assert.ok(!P2_AUDIT_IDS.includes(id));const item=COVERAGE_MATRIX.domains.flatMap(d=>d.items).find(i=>i.canonicalId===id)!;assert.equal(item.viewReview.audit!.resolution,'intentional_subset');assert.equal(item.valueMapping.views.audit.mode,'intentional_omission');}
 for(const id of FORM_CONTEXT_ITEMS){assert.ok(P2_AUDIT_IDS.includes(id),'existing context values remain readable');assert.ok(!COVERAGE_MATRIX.review.p2Cells.some(c=>c.id===id&&c.view==='audit'));}
 assert.equal(FORWARD_UTILITY.flatMap(x=>x.ids).length,21);
});

test('future report/full receipts cannot feed audit aggregates under a different scan generation or original creator',async()=>{
 const {verifyMasterValueParity}=await import('./audit-master-parity');
 const binding={scanId:id,createdAt:'2026-11-06T23:00:00Z',generation:'scan-report-projection-v27',sourceHash:'a'.repeat(64),creatorIdentity:'original_credential_verified/request'};
 const row:any={scanId:id,createdAt:binding.createdAt,projectionVersion:binding.generation,publicProjectionSourceHash:binding.sourceHash,originProof:'original_credential_verified',originRequestId:'request',reportable:true,refs:[],states:{},metricSources:{},measurements:{}};
 for(const patch of [{generation:'old'},{sourceHash:'b'.repeat(64)},{creatorIdentity:'someone-else'},{createdAt:'2026-11-05T23:00:00Z'}])assert.throws(()=>verifyMasterValueParity({rows:[row],retainedReports:[],masterViewReceipts:[{view:'full',file:'/nonexistent-not-read',sha256:'a'.repeat(64),schema:'certscore.full-evidence.v2',binding:{...binding,...patch}}]}),/does not match current/);
});

test('new completed query rows require diagnostic coverage but bounded core overflow remains explicit',()=>{
 assert.throws(()=>assertCurrentPriorityExtraction([{status:'completed',choice_audit:{version:'certscore.audit-choice-summary.v2'}}]),/omitted/);
 assert.doesNotThrow(()=>assertCurrentPriorityExtraction([{status:'completed',choice_audit:choiceSummaryFromRecord(record({}))}]));
 assert.doesNotThrow(()=>assertCurrentPriorityExtraction([{status:'completed',choice_audit:{version:'certscore.audit-choice-summary.v2',availability:'size_bound'}}]));
 assert.throws(()=>assertCurrentPriorityExtraction([{status:'completed',choice_audit:{version:'certscore.audit-choice-summary.v1'}}]),/omitted/);
});

test('optional diagnostics never evict a core that fits the hard row cap',()=>{
 const base={version:'certscore.audit-choice-summary.v2',padding:''};let exact:any;
 for(let n=7900;n<8200;n++){const v={...base,padding:'x'.repeat(n)};if(jsonbBytes(v)<=8192&&jsonbBytes({...v,priorityEvidence:'size_bound'})>8192){exact=v;break;}}
 assert.ok(exact);assert.deepEqual(withBoundedPriority(exact,record({})),exact);assert.doesNotThrow(()=>assertCurrentPriorityExtraction([{status:'completed',choice_audit:exact}]));
});


test('all four CMP arm states have bound public and persisted audit routes without merging independent scopes',async()=>{
 const {pairedGpcAudit}=await import('./audit-progress-gpc');
 const f=gpcProductFixture({scanId:id,priorCmpState:true});
 const report={scanId:id,gpcResponse:{...f.assessment,cmpStateComparison:f.cmpStateComparison}};
 const pub=pairedGpcAudit(report),sealed=choiceSummaryAudit(choiceSummaryFromRecord(record({gpcResponseAssessment:f.assessment,gpcCmpStateComparison:f.cmpStateComparison})),id);
 for(const side of ['baseline','gpc'] as const)for(const axis of ['sale','sharing'] as const){
  const key=`paired_${side}_${axis}`,value=f.cmpStateComparison![side][axis];
  assert.equal(pub.states['detail.gpc.'+key],value);assert.equal(sealed.states['sealed.choice_evidence.'+key],value);
  const item=COVERAGE_MATRIX.domains.flatMap(d=>d.items).find(i=>i.canonicalId===`gpc.cmp_pair.${side}.${axis}`)!;
  assert.equal(item.valueMapping.views.audit.mode,'metric');assert.equal(item.viewReview.audit!.resolution,'implemented_locally');
 }
 const bad=structuredClone(report);bad.gpcResponse.cmpStateComparison!.sourceHashes.baseline='f'.repeat(64);
 for(const side of ['baseline','gpc'])for(const axis of ['sale','sharing'])assert.equal(pairedGpcAudit(bad).states[`detail.gpc.paired_${side}_${axis}`],'unavailable');
});

test('registered terminal witnesses survive compact delivery and require full matching window evidence',()=>{
 for(const fixture of fixtures){
  const action=fixture.action as 'accept'|'reject';
  const key=action==='accept'?'postAcceptEvidenceProjection':'postRefusalEvidenceProjection';
  const original=fixture.projection;
  const target=original.terminalDecisionEvidence.authorizedTargetSha256;
  const start=original.terminalDecisionEvidence.evidence.observedAtMs;
  const projection={
   ...original,afterActionCapture:undefined,
   terminalDecisionEvidence:{...original.terminalDecisionEvidence,policyVersion:'bounded_registered_terminal_consent_decision.v1',
    readStartedAtMs:start+560,readCompletedAtMs:start+610},
   retainedActionTiming:{action,actionDispatchedAtMs:start-1},
   registeredObservationCompletion:{action,startedAtMs:start,requiredWindowMs:800,completedAtMs:start+800,termination:'window_elapsed'},
  };
  const state=(p:unknown)=>priorityEvidenceStates(priorityEvidenceFromRecord(record({[key]:p})),id)['sealed.terminal.audit_'+action];
  assert.deepEqual(state(projection),{value:'verified',scope:'bounded_registered_terminal_consent_decision.v1'});
  assert.equal(state({...projection,registeredObservationCompletion:undefined})?.value,'unverified');
  assert.equal(state({...projection,registeredObservationCompletion:{...projection.registeredObservationCompletion,termination:'evidence_satisfied'}})?.value,'unverified');
  assert.equal(state({...projection,terminalDecisionEvidence:{...projection.terminalDecisionEvidence,readCompletedAtMs:start+801}})?.value,'unverified');
  assert.equal(state({...projection,terminalDecisionEvidence:{...projection.terminalDecisionEvidence,readStartedAtMs:start+549}})?.value,'unverified');
  assert.equal(state({...projection,actionControlProof:{...projection.actionControlProof,authorizedTargetSha256:target==='f'.repeat(64)?'e'.repeat(64):'f'.repeat(64)}})?.value,'unverified');
 }
});
