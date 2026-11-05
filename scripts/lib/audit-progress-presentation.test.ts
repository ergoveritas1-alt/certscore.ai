import assert from 'node:assert/strict';
import test from 'node:test';
import {auditPresentation,makeAuditTargetReview} from './audit-progress-presentation';
const ui=auditPresentation(),metric={kind:'metric',id:'control.reject'};
test('missing-only rows collapse but explicit failures, measured negatives and limited useful results remain visible',()=>{
 for(const state of ['unavailable','unknown','not_assessed','intentionally_omitted'])assert.equal(ui.hasEvidence(metric,{counts:{[state]:4},denominator:4}),false);
 for(const state of ['failed','reject_path_timeout','publication_failed','not_observed','limited_with_results','no_go'])assert.equal(ui.hasEvidence(metric,{counts:{[state]:4},denominator:4}),true,state);
 assert.equal(ui.attention({counts:{unknown:2,failed:1}}),true);
 assert.equal(ui.hasEvidence({kind:'quantity'},{measured:1,total:0}),true);
 assert.equal(ui.hasEvidence({kind:'finding'},{denominator:0,incompletePositives:1}),true);
});
test('missing reason labels do not invent capture failure or inapplicability',()=>{
 assert.equal(ui.gapLabel(metric,{denominator:4,counts:{unavailable:4}}),'No retained value');
 assert.equal(ui.gapLabel(metric,{denominator:4,counts:{intentionally_omitted:4}}),'Not scheduled');
 assert.equal(ui.gapLabel(metric,{denominator:4,counts:{not_assessed:4}}),'Not assessed');
 assert.equal(ui.gapLabel(metric,{denominator:0,counts:{}}),'No eligible reports');
 assert.equal(ui.gapLabel(metric,{denominator:4,counts:{not_observed:4}}),null);
 assert.equal(ui.gapLabel({kind:'finding'},{denominator:0,incompletePositives:2}),'Retained positives');
 assert.equal(ui.gapLabel({kind:'finding'},{denominator:0,eligible:5,incompletePositives:0}),'No complete inventories');
});
test('public headline preserves latest-version sample even with ID-only/missing groups, without changing aggregation',()=>{
 const v={source:'mixed_sources',denominator:30,series:{'public_export/pulse-public-v5/scan-report-projection-v27':{denominator:20,rate:50},'public_export/pulse-public-v11/scan-report-projection-v27':{denominator:8,rate:25},unavailable_source:{denominator:2,rate:null}}};
 const before=structuredClone(v),p=ui.cohort(v)!;
 assert.equal(p.label,'Latest export v11');assert.equal(p.value.rate,25);assert.equal(p.selected,8);assert.equal(p.total,30);assert.deepEqual(v,before);
});
test('a latest export with missing measurements never falls back to an older measured result',()=>{
 const v={source:'mixed_sources',eligible:9,series:{'public_export/pulse-public-v5/scan-report-projection-v27':{eligible:8,total:10},'public_export/pulse-public-v11/scan-report-projection-v27':{eligible:1,total:null}}};
 assert.equal(ui.cohort(v)!.value.total,null);
});
test('ambiguous same-version scopes and tied other cohorts never get blended or arbitrarily selected',()=>{
 const series={'public_export/pulse-public-v11/scan-report-projection-v27/a':{denominator:5},'public_export/pulse-public-v11/scan-report-projection-v27/b':{denominator:2}};
 assert.equal(ui.cohort({source:'mixed_sources',series}),null);
 assert.equal(ui.cohort({source:'mixed_sources',series:{'sealed/a':{denominator:5},'sealed/b':{denominator:5}}}),null);
 assert.equal(ui.cohort({source:'mixed_sources',denominator:8,series:{'sealed/a':{denominator:5},'sealed/b':{denominator:3}}})!.label,'Largest cohort');
});
const register=()=>({version:'certscore.audit-target-proposal.v2',sourceSha256:'f'.repeat(64),goals:{semantic:{status:'new_engineering_proposal_not_existing_gate',target:'95% recall and 99% precision',denominator:'Adjudicated positives and emitted claims',verification:'Independent validation required'},aro:{status:'existing_documented_policy_goal',target:'95% agreement',denominator:'Human adjudicated pages'}},items:[{id:'control.reject',kind:'state',healthyDailyTarget:null,healthyDailyRange:null,signalClass:'P + H',recommendedGoalIds:['aro','semantic'],targetDecision:'No prevalence target'}]});
test('numeric validation goals remain proposed/scoped, with no healthy daily value or achieved flag',()=>{
 const r=register(),before=structuredClone(r),v=makeAuditTargetReview(r),t=v.items['metric:control.reject'];
 assert.equal(t.dailyStatus,'Not calibrated');assert.equal(t.primaryGoal,'aro');assert.equal(v.goals.semantic.status,'Proposed goal');assert.equal(v.goals.aro.status,'Existing scoped goal');assert.equal(ui.category(metric,t),'Site observations');assert.deepEqual(r,before);
});
test('target adapter rejects incompatible calibrated values, duplicate items and unknown goals',()=>{
 const r:any=register();r.items[0].healthyDailyTarget=.3;assert.throws(()=>makeAuditTargetReview(r));r.items[0].healthyDailyTarget=null;r.items.push(r.items[0]);assert.throws(()=>makeAuditTargetReview(r));r.items.pop();r.items[0].recommendedGoalIds=['invented'];assert.throws(()=>makeAuditTargetReview(r));
});
