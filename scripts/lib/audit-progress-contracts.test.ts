import test from 'node:test';import assert from 'node:assert/strict';
import {extractExportRow,exportedState} from './audit-progress-export';
import {progressEngine} from './audit-progress-engine';
import {makeContracts,publicSource,namespaceSealed,monthMetricRegistry} from './audit-progress-contracts';
import {METRICS,mergeVerifiedProgress} from './audit-progress';
import {QUANTITIES,evidenceMetricRegistry} from './audit-progress-evidence';
const ref={file:'/retained/export.json',sha256:'a'.repeat(64),role:'fixture'};
const base:any={scanId:'11111111-1111-4111-8111-111111111111',domain:'example.com',scanStatus:'completed',timestamps:{createdAt:'2026-10-26T12:00:00Z'},meta:{projectionVersion:'pulse-public-v4',reportProjectionVersion:'scan-report-projection-v27'},consentSurfaceEvidence:{firstLayerConsentChoices:{rejectControlObserved:false,capturedBeforeInteraction:true,layerInspected:'first_layer',controlInventoryComplete:true}}};
const row=(extra:any={})=>extractExportRow({...base,...extra},ref);
const metric=METRICS.find(m=>m.id==='control.reject')!;
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

test('sealed-only historical checklist measures survive without duplicating public-source measures',()=>{
 const m={id:'checklist.retained_internal_only',label:'Internal',group:'Checks',denominator:'reportable',success:[]};
 assert.ok(monthMetricRegistry([metric],[metric,m]).some(x=>x.id==='sealed.'+m.id));
 assert.ok(!monthMetricRegistry([m],[m]).some(x=>x.id==='sealed.'+m.id));
 const r=row({consentSurfaceEvidence:{}});assert.equal(aggregate([r])[0].metrics[metric.id].rate,null);assert.equal(aggregate([r])[0].metrics[metric.id].denominator,1);
});
