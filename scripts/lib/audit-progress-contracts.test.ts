import test from 'node:test';import assert from 'node:assert/strict';
import {extractExportRow,exportedState} from './audit-progress-export';
import {progressEngine} from './audit-progress-engine';
import {makeContracts,publicSource,namespaceSealed,monthMetricRegistry,PUBLIC_SOURCE_PAIRS} from './audit-progress-contracts';
import {METRICS,mergeVerifiedProgress} from './audit-progress';
import {QUANTITIES,evidenceMetricRegistry,retainedEvidenceMetricRegistry} from './audit-progress-evidence';
const ref={file:'/retained/export.json',sha256:'a'.repeat(64),role:'fixture'};
const base:any={scanId:'11111111-1111-4111-8111-111111111111',domain:'example.com',scanStatus:'completed',timestamps:{createdAt:'2026-10-26T12:00:00Z'},meta:{projectionVersion:'pulse-public-v4',reportProjectionVersion:'scan-report-projection-v27'},consentSurfaceEvidence:{firstLayerConsentChoices:{rejectControlObserved:false,capturedBeforeInteraction:true,layerInspected:'first_layer',controlInventoryComplete:true}}};
const row=(extra:any={})=>extractExportRow({...base,...extra},ref);
const metric=METRICS.find(m=>m.id==='control.reject')!;
const v10meta={projectionVersion:'pulse-public-v10',reportProjectionVersion:'scan-report-projection-v27'};
function aggregate(rows:any[],metrics:any[]=[metric],quantities:any[]=[]) {return progressEngine().aggregate({days:[{date:'2026-10-26',completeDay:false,inventoryHours:0},{date:'2026-10-27',completeDay:false,inventoryHours:0}],metrics,quantities,findingIds:['x']},rows);}
test('concerns, gaps, not-testable and not-confirmed never become control observations or not-checked',()=>{
 for(const state of ['Partial concern','Potential gap','Not confirmed','Not testable','Unknown','Not checked']){
  const r=row({gdprEprivacyChecklistRows:{items:[{id:'reject_all_path_availability',evidenceLabel:state,status:'Gap observed'}]}});
  assert.equal(r.states['control.reject'],'not_observed');assert.equal(r.states['checklist.reject_all_path_availability'],state.toLowerCase().replaceAll(' ','_'));assert.equal(r.states['verdict.reject_all_path_availability'],'gap_observed');
 }
 assert.equal(exportedState({status:'Observed'}),'unavailable');assert.equal(exportedState({evidenceState:null,evidenceLabel:'Observed'}),'unknown');assert.equal(exportedState(undefined),'unavailable');
});
test('presence requires captured first-layer facts, never a concern verdict or incomplete negative inventory',()=>{
 assert.equal(row({consentSurfaceEvidence:{}}).states['control.reject'],'unavailable');
 for(const first of [{rejectControlObserved:false},{rejectControlObserved:true,capturedBeforeInteraction:false},{rejectControlObserved:null,controlInventoryComplete:true}])assert.equal(row({consentSurfaceEvidence:{firstLayerConsentChoices:first}}).states['control.reject'],'unknown');
 const r=row();assert.equal(aggregate([r])[0].metrics['control.reject'].rate,0);assert.deepEqual(metric.success,['observed']);
});
test('mixed sources cannot form an aggregate rate or delta, while all unresolved rows remain counted',()=>{
 const a=row(),b=row({scanId:'22222222-2222-4222-8222-222222222222',meta:{projectionVersion:'pulse-public-v5',reportProjectionVersion:'scan-report-projection-v27'}}),c=row({timestamps:{createdAt:'2026-10-27T12:00:00Z'},consentSurfaceEvidence:{}});
 const d=aggregate([a,b,c]);assert.equal(d[0].metrics[metric.id].denominator,2);assert.equal(d[0].metrics[metric.id].rate,null);assert.equal(Object.keys(d[0].metrics[metric.id].series).length,2);assert.equal(d[1].metrics[metric.id].deltaPp,null);assert.equal(d[1].metrics[metric.id].counts.unavailable,1);
});
test('same-source partial days permit descriptive deltas; empty days retain null denominators/rates',()=>{
 const a=row(),b=row({timestamps:{createdAt:'2026-10-27T12:00:00Z'},consentSurfaceEvidence:{firstLayerConsentChoices:{rejectControlObserved:true,capturedBeforeInteraction:true,layerInspected:'first_layer'}}});
 const d=aggregate([a,b]);assert.equal(d[1].metrics[metric.id].deltaPp,100);assert.equal(d[1].metrics[metric.id].comparison,'partial_day');assert.equal(aggregate([])[0].metrics[metric.id].rate,null);assert.equal(aggregate([])[0].metrics[metric.id].denominator,0);
});
test('sealed overrides and quantity supplements cannot silently replace public observations',()=>{
 const a=row({formsSummary:{totalObserved:0}}),b={...row(),assessmentVersion:'2.2.4',states:{'control.reject':'observed',evidence:'generation_matched'},measurements:{'forms.observed':99,'graph.nodes':10}};
 const m=mergeVerifiedProgress(a,b);assert.equal(m.states[metric.id],'not_observed');assert.equal(m.states['sealed.control.reject'],'observed');assert.equal(m.measurements?.['forms.observed'],0);assert.equal(m.measurements?.['graph.nodes'],10);
 const deferred=namespaceSealed({...b,states:{...b.states,'detail.sealed.relationships':'deferred_reference_metadata'}}),inline=namespaceSealed({...b,states:{...b.states,'detail.sealed.relationships':'inline_projection'}});assert.notEqual(deferred.metricSources?.['graph.nodes'],inline.metricSources?.['graph.nodes']);
});
test('quantity medians keep zero, missing denominator and invalid/non-reportable rows separate',()=>{
 const rows=[0,null,-1,4].map((n,i)=>row({scanId:`11111111-1111-4111-8111-11111111111${i}`,formsSummary:{totalObserved:n}}));rows.push({...row(),reportable:false,measurements:{'forms.observed':100}});
 const q=QUANTITIES.find(q=>q.id==='forms.observed')!,d=aggregate(rows,[],[q])[0].quantities[q.id];assert.equal(d.median,2);assert.equal(d.eligible,4);assert.equal(d.measured,2);assert.equal(d.missing,2);assert.equal(d.total,4);
});
test('accessibility counts separate engine identities even when version and scope match',()=>{
 const audit=(engine:string,n:number)=>({required:true,status:'completed',engine,engineVersion:'1.0',scope:'page',failedRuleCount:n});
 const a=row({accessibilityAudit:audit('engine-a',1)}),b=row({scanId:'22222222-2222-4222-8222-222222222222',accessibilityAudit:audit('engine-b',9)});
 const q=QUANTITIES.find(q=>q.id==='accessibility.failed_rules')!;
 const mixed=aggregate([a,b],[],[q])[0].quantities[q.id];
 assert.notEqual(a.metricSources?.[q.id],b.metricSources?.[q.id]);assert.equal(mixed.source,'mixed_sources');assert.equal(mixed.median,null);assert.equal(Object.keys(mixed.series).length,2);
 const next={...b,createdAt:'2026-10-27T12:00:00Z'};
 const days=aggregate([a,next],[],[q]);assert.equal(days[1].quantities[q.id].delta,null);assert.equal(Object.values(days[1].quantities[q.id].series).every((s:any)=>s.delta===null),true);
 const same=row({timestamps:{createdAt:'2026-10-27T12:00:00Z'},accessibilityAudit:audit('engine-a',4)});
 assert.equal(aggregate([a,same],[],[q])[1].quantities[q.id].delta,3);
});
test('canonical inventories require coherent caps; unknown top selection never becomes zero',()=>{
 const r=row({projectedFindings:{items:[{id:'x',label:'Finding'}],cap:{truncated:true,total:2}}});assert.equal(r.findingInventory,false);
 let d=aggregate([r],[])[0].findings.x;assert.equal(d.denominator,0);assert.equal(d.incompletePositives,1);assert.equal(d.top,null);
 assert.equal(row({projectedFindings:{items:[],cap:{truncated:false,total:3}}}).findingInventory,false);
});
test('explicit nonrequired accessibility is excluded from states and quantities, missing audit stays unavailable',()=>{
 const r=row({accessibilityAudit:{required:false,status:'completed',failedRuleCount:0}});assert.equal(r.states.accessibility,undefined);assert.equal(r.states['accessibility.results'],undefined);assert.equal(r.measurements?.['accessibility.failed_rules'],undefined);
 assert.equal(row().states.accessibility,'unavailable');
});
test('every state, quantity and finding has a contract; unreviewed schemas fail closed',()=>{
 const metrics=[...METRICS,...evidenceMetricRegistry([row()])],c=makeContracts(metrics,QUANTITIES);assert.equal(c.metrics.length,metrics.length);assert.equal(c.quantities.length,21);for(const m of [...c.metrics,...c.quantities])for(const k of ['meaning','eligiblePopulation','numerator','denominator','source','field','stateMapping','supportedVersions','comparison'])assert.ok(k in m);
 assert.match(publicSource({}),/historical_unversioned/);assert.throws(()=>publicSource({meta:{projectionVersion:'pulse-public-v99'}}),/Unreviewed/);
});
test('CSV uses the same per-source denominators, state deltas and null values as charts',()=>{
 const d=aggregate([row()]);const csv=progressEngine().stateCsv(d,[metric]);assert.match(csv,/source,state,count,denominator,percent,deltaPp/);assert.ok(csv.includes('"not_observed","1","1","100",""'));
});

test('public and retained checklist sources remain separately addressable',()=>{
 const m={id:'checklist.retained_internal_only',label:'Internal',group:'Checks',denominator:'reportable',success:[]};
 assert.ok(monthMetricRegistry([metric],[metric,m]).some(x=>x.id==='sealed.'+m.id));
 assert.deepEqual(monthMetricRegistry([m],[m]).map(x=>x.id),[m.id,'sealed.'+m.id]);
 const r=row({consentSurfaceEvidence:{}});assert.equal(aggregate([r])[0].metrics[metric.id].rate,null);assert.equal(aggregate([r])[0].metrics[metric.id].denominator,1);
});

test('v10 adoption is exact-pair scoped and future/intermediate schemas still fail closed',()=>{
 assert.equal(publicSource({meta:v10meta}),'public_export/pulse-public-v10/scan-report-projection-v27');
 for(const meta of [{...v10meta,reportProjectionVersion:'scan-report-projection-v26'},{projectionVersion:'pulse-public-v10'},...['v6','v7','v8','v9','v12'].map(v=>({...v10meta,projectionVersion:'pulse-public-'+v}))])assert.throws(()=>publicSource({meta}),/Unreviewed/);
 const contract=makeContracts([metric],[]).metrics[0]!;assert.deepEqual(contract.supportedVersions,PUBLIC_SOURCE_PAIRS);assert.ok(!contract.supportedVersions.includes('pulse-public-v10/scan-report-projection-v26'));
});

test('v10 checklist-only, unknown and complete negative inventories retain separate meanings',()=>{
 const evidence={gdprEprivacyChecklistRows:{items:[{id:'reject_all_path_availability',evidenceLabel:'Partial concern',status:'Review signal'}]}};
 for(const [first,expected] of [[{},'unavailable'],[{rejectControlObserved:null},'unknown'],[{rejectControlObserved:false,capturedBeforeInteraction:true,layerInspected:'first_layer',controlInventoryComplete:true},'not_observed'],[{rejectControlObserved:true,capturedBeforeInteraction:true,layerInspected:'first_layer'},'observed']]as const){
  const r=row({...evidence,meta:v10meta,consentSurfaceEvidence:{firstLayerConsentChoices:first}});
  assert.equal(r.states['control.reject'],expected);assert.equal(r.states['checklist.reject_all_path_availability'],'partial_concern');assert.equal(r.states['verdict.reject_all_path_availability'],'review_signal');
 }
});

test('v10 public confirmation summaries do not replace initial status or bound terminal witnesses',()=>{
 const execution={policyVersion:'choice_path_execution.v1',status:'succeeded_with_confirmation',clickCompleted:true,observationCompleted:true,consentConfirmed:true};
 // Use the same validated execution shape as the retained public observation.
 const r=row({meta:v10meta,postAcceptObservation:{status:'unconfirmed',execution,confirmation:{contractVersion:'choice_confirmation_summary.v2',terminalDecisionVerified:true,initialRegistrationStatus:'confirmed'}}});
 assert.equal(r.states['execution.accept'],'succeeded_with_confirmation');assert.equal(r.states['registration.accept'],'unconfirmed');assert.equal(r.states['terminal.accept'],'unavailable');
});

test('v10 and v5 remain separate series with no pooled rate, median or cross-version delta',()=>{
 const a=row({meta:v10meta,formsSummary:{totalObserved:0}}),b=row({scanId:'22222222-2222-4222-8222-222222222222',meta:{...v10meta,projectionVersion:'pulse-public-v5'},formsSummary:{totalObserved:4}});
 const q=QUANTITIES.find(q=>q.id==='forms.observed')!,d=aggregate([a,b],[metric],[q])[0];
 assert.equal(d.metrics[metric.id].denominator,2);assert.equal(d.metrics[metric.id].rate,null);assert.equal(Object.keys(d.metrics[metric.id].series).length,2);assert.equal(d.quantities[q.id].median,null);
 const next={...a,createdAt:'2026-10-27T12:00:00Z'};assert.equal(aggregate([b,next])[1].metrics[metric.id].deltaPp,null);
});

test('v11 opt-out presence is exact-pair scoped and uses independent negative coverage',()=>{
 const meta={...v10meta,projectionVersion:'pulse-public-v11'};
 assert.equal(publicSource({meta}),'public_export/pulse-public-v11/scan-report-projection-v27');
 for(const bad of [{projectionVersion:meta.projectionVersion},{...meta,reportProjectionVersion:'scan-report-projection-v26'}])assert.throws(()=>publicSource({meta:bad}),/Unreviewed/);
 const capture={capturedBeforeInteraction:true,layerInspected:'first_layer',controlInventoryComplete:true};
 const extract=(first:any,extra:any={})=>row({...extra,meta,consentSurfaceEvidence:{firstLayerConsentChoices:first}}).states['control.privacyOptOut'];
 assert.equal(extract({...capture,privacyOptOutControlObserved:true}),'observed');
 assert.equal(extract({...capture,privacyOptOutControlObserved:false,privacyOptOutControlInventoryComplete:true}),'not_observed');
 for(const first of [{...capture,privacyOptOutControlObserved:false}, {...capture,privacyOptOutControlObserved:null},
  {...capture,privacyOptOutControlObserved:true,capturedBeforeInteraction:false},
  {...capture,privacyOptOutControlObserved:true,layerInspected:'deeper_layer'}])assert.equal(extract(first),'unknown');
 assert.equal(extract({...capture,controls:[{actionType:'do_not_sell_share',label:'Do Not Sell'}]}),'unavailable');
 assert.equal(extract({...capture,privacyOptOutControlObserved:true},{resultDisposition:'no_go'}),undefined);
 for(const version of ['pulse-public-v4','pulse-public-v5','pulse-public-v10'])assert.equal(row({meta:{...meta,projectionVersion:version},consentSurfaceEvidence:{firstLayerConsentChoices:{...capture,privacyOptOutControlObserved:true}}}).states['control.privacyOptOut'],'unavailable');
 const metric=METRICS.find(m=>m.id==='control.privacyOptOut')!;
 const publicRow=row({meta,consentSurfaceEvidence:{firstLayerConsentChoices:{...capture,privacyOptOutControlObserved:true}}});
 const historical=row({scanId:'22222222-2222-4222-8222-222222222222'});
 assert.equal(aggregate([publicRow,historical],[metric])[0].metrics[metric.id].rate,null);
 const retained=monthMetricRegistry(METRICS,METRICS).find(m=>m.id==='sealed.control.privacyOptOut')!;
 assert.equal(retained.label,'Opt-out control presence · retained assessment');assert.equal(retained.group,'Controls');
 const merged=mergeVerifiedProgress(historical,{...historical,states:{evidence:'generation_matched','control.privacyOptOut':'observed'}});
 assert.equal(merged.states['control.privacyOptOut'],'unavailable');assert.equal(merged.states['sealed.control.privacyOptOut'],'observed');
});

test('an unavailable public checklist cannot suppress a valid retained canonical result',()=>{
 const m={id:'checklist.consent_choice_quality',label:'Choice quality',group:'Consent',denominator:'reportable',success:[]};
 const r=row();r.states[m.id]='unavailable';r.states['sealed.'+m.id]='observed';r.metricSources!['sealed.'+m.id]='sealed_assessment/2.2.4/scan-report-projection-v27/persisted_projection';
 const registry=monthMetricRegistry([m],[m]);const d=aggregate([r],registry);
 assert.equal(d[0].metrics[m.id].counts.unavailable,1);assert.equal(d[0].metrics['sealed.'+m.id].counts.observed,1);
 assert.equal(new Set(registry.map(x=>x.id)).size,registry.length);
});

test('new canonical-only checklist IDs register without relying on older audit inventories',()=>{
 const r=row();r.retainedMetricLabels={'checklist.new_canonical_check':'Canonical check','verdict.new_canonical_check':'Canonical verdict'};
 r.states['sealed.checklist.new_canonical_check']='observed';
 const registry=monthMetricRegistry([],retainedEvidenceMetricRegistry([r]));
 assert.ok(registry.some(m=>m.id==='sealed.checklist.new_canonical_check'));assert.ok(registry.some(m=>m.id==='sealed.verdict.new_canonical_check'));
 assert.equal(r.metricLabels?.['checklist.new_canonical_check'],undefined);
});
