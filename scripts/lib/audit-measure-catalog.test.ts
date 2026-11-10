import test from 'node:test';import assert from 'node:assert/strict';
import {auditStateCsvMetrics,auditMeasureLinks,buildAuditMeasureView,forwardAuditMeasures,RETIRED_TABLE_MEASURES} from './audit-measure-catalog';
import {progressEngine} from './audit-progress-engine';
import {MASTER_CATALOG} from './audit-evidence-master-catalog';
const metric=(id:string)=>({id,label:id,group:'Test',denominator:'Fixture scans',success:[]});
test('opt-out stages share one table row while every original CSV metric remains',()=>{
 const ids=['sealed.opt_out.action_completion','sealed.opt_out.dispatch','sealed.opt_out.coverage','sealed.opt_out.configured','sealed.opt_out.conditional_control','sealed.opt_out.supported_route','sealed.opt_out.dispatch_reason','sealed.opt_out.choice_confirmation','sealed.opt_out.post_confirmation_observation','sealed.opt_out.registration','sealed.opt_out.confirmation_basis','sealed.opt_out.capture','sealed.opt_out.observation'];
 const data={metrics:ids.map(metric),rows:[]};const v=buildAuditMeasureView(data);
 assert.deepEqual(v.tableEntries.map(e=>e.id),[ids[0]]);assert.equal(v.tableEntries[0]!.label,'Opt-out execution and verification');
 assert.deepEqual(new Set(v.tableEntries[0]!.details.map(e=>e.id)),new Set(ids.slice(1)));
 assert.deepEqual(auditStateCsvMetrics(data).map(e=>e.id),ids);
});
test('retire only reviewed unsupported slots; preserve terminal and CMP coverage gaps',()=>{
 const ids=[...Object.keys(RETIRED_TABLE_MEASURES),'sealed.terminal.audit_accept','sealed.terminal.audit_reject','sealed.choice_evidence.paired_cmp','sealed.opt_out.action_completion'];
 const data={metrics:ids.map(metric),rows:[{states:Object.fromEntries(ids.map(id=>[id,'unavailable']))}]};
 const before=JSON.stringify(data),v=buildAuditMeasureView(data);
 assert.equal(v.removals.length,9);assert.equal(v.entries.length,4);assert.equal(JSON.stringify(data),before);
 assert.ok(v.entries.every(e=>e.canonicalLinks.length>0));
});

test('forward measures retire obsolete sources and retain distinct evidence under its report question',()=>{
 const ids=['control.reject','sealed.control.reject','gpc_finding','click.reject','execution.reject',
  'registration.reject','sealed.terminal.audit_reject','detail.reject.verdict','detail.reject.reason'];
 const input=ids.map(id=>({...metric(id),kind:'metric'}));
 const before=JSON.stringify(input),view=forwardAuditMeasures(input);
 assert.deepEqual(view.tableEntries.map(entry=>entry.id),['control.reject','click.reject','registration.reject','detail.reject.verdict']);
 assert.deepEqual(view.retired.map(entry=>entry.id),['sealed.control.reject','gpc_finding']);
 assert.deepEqual(view.tableEntries.find(entry=>entry.id==='registration.reject')!.details.map(entry=>entry.id),['sealed.terminal.audit_reject']);
 assert.deepEqual(view.tableEntries.find(entry=>entry.id==='detail.reject.verdict')!.details.map(entry=>entry.id),['detail.reject.reason']);
 assert.equal(JSON.stringify(input),before);
 assert.deepEqual(auditStateCsvMetrics({metrics:ids.map(metric)}).map(entry=>entry.id),view.entries.map(entry=>entry.id));
});
test('a formerly retired slot returning zero/unknown or positive evidence requires explicit re-review',()=>{
 for(const value of ['unknown','not_observed','fetched'])assert.throws(()=>buildAuditMeasureView({metrics:[metric('policy_fetch')],rows:[{states:{policy_fetch:value}}]}),/now has data/);
});
test('new unmapped measures fail closed instead of falling into a catch-all',()=>{
 assert.throws(()=>auditMeasureLinks('new_unreviewed_metric','metric'),/lacks canonical review/);
});
test('source variants, checklist verdicts and observation fields do not become equal-value aliases',()=>{
 const observation=auditMeasureLinks('control.accept','metric')[0]!,retained=auditMeasureLinks('sealed.control.accept','metric')[0]!,check=auditMeasureLinks('checklist.accept_consent_control','metric')[0]!;
 assert.equal(observation.relationship,'direct_field');assert.equal(retained.relationship,'source_variant');assert.equal(check.relationship,'assessment_context');
 assert.notDeepEqual(observation,retained);assert.deepEqual(check.masterFieldIds,[]);
 assert.notDeepEqual(auditMeasureLinks('checklist.controller_contact_disclosure','metric')[0]!.masterFieldIds,auditMeasureLinks('verdict.controller_contact_disclosure','metric')[0]!.masterFieldIds);
});
test('finding identity and neutral choice records stay distinct',()=>{
 assert.equal(auditMeasureLinks('wcag_example','finding')[0]!.relationship,'inventory_identity');
 assert.equal(auditMeasureLinks('sealed.choice_finding.gpc_response','metric')[0]!.recordType,'privacy.canonical_choice_result');
});
test('the assessed sale/sharing state leads and exact neutral record surfacing is supporting evidence',()=>{
 const presence='sealed.opt_out.presence',record='sealed.choice_finding.california_sale_sharing_opt_out_assessment';
 const view=buildAuditMeasureView({metrics:[metric(presence),metric(record)],rows:[]});
 assert.deepEqual(view.tableEntries.map(entry=>entry.id),[presence]);
 assert.deepEqual(view.tableEntries[0]!.details.map(entry=>entry.id),[record]);
});
test('all mapped record and field references exist in the v2 master catalog',()=>{
 const ids=['control.accept','sealed.control.accept','terminal.accept','sealed.terminal.audit_accept','detail.gpc.paired_collection','sealed.choice_evidence.paired_cmp','sealed.opt_out.coverage','sealed.checklist.analytics_vendor_observed'];
 for(const id of ids)for(const link of auditMeasureLinks(id,'metric')){assert.ok(MASTER_CATALOG.records.some(r=>r.id===link.recordType));for(const f of link.masterFieldIds)assert.ok(MASTER_CATALOG.fields.some(m=>m.id===f&&m.recordType===link.recordType));}
});

test('same-source checklist aliases retire from the chart and CSV only while their evidence agrees',()=>{
 const id='checklist.legal_basis_disclosure_observed',survivor='topic.legal_basis';
 const metrics=[metric(id),{...metric(survivor),success:['observed']},metric('verdict.legal_basis_disclosure_observed')];
 const rows=[{createdAt:'2026-11-07T12:00:00Z',reportable:true,defaultSource:'public_export/v11/v27',findings:[],
   states:{[id]:'observed',[survivor]:'observed','verdict.legal_basis_disclosure_observed':'review_signal'},metricSources:{} as Record<string,string>}];
 const days=progressEngine().aggregate({days:[{date:'2026-11-07',completeDay:true}],metrics},rows);
 const data={metrics,rows,days};
 const view=buildAuditMeasureView(data);
 assert.deepEqual(view.checklistAliases.map(alias=>alias.id),[id]);
 assert.deepEqual(view.entries.map(entry=>entry.id).sort(),[survivor,'verdict.legal_basis_disclosure_observed']);
 assert.deepEqual(auditStateCsvMetrics(data).map(metric=>metric.id),[survivor,'verdict.legal_basis_disclosure_observed']);
 for(const change of ['state','source','denominator'] as const){
  const different=structuredClone(data);
  if(change==='state')different.rows[0]!.states[id]='unknown';
  if(change==='source')different.rows[0]!.metricSources[id]='other';
  if(change==='denominator')different.days[0]!.metrics[id].denominator=0;
  assert.ok(auditStateCsvMetrics(different).some(metric=>metric.id===id),change);
  assert.ok(buildAuditMeasureView(different).entries.some(entry=>entry.id===id),change);
 }
});

test('four canonical GPC questions own the diagnostics without merging their values',()=>{
 const primary=MASTER_CATALOG.questionGroups.map(q=>q.primaryMetric);
 const diagnostics=['detail.gpc.response','detail.gpc.paired_pair','detail.gpc.assessment_coverage','sealed.choice_evidence.paired_cmp','gpc.paired.duration_ms','sealed.choice_finding.gpc_response'];
 const view=buildAuditMeasureView({metrics:[...primary,...diagnostics.filter(id=>!id.startsWith('gpc.paired.'))].map(id=>({...metric(id),group:'GPC'})),quantities:[{id:'gpc.paired.duration_ms',label:'Interval',unit:'ms'}],rows:[]});
 assert.deepEqual(view.tableEntries.map(e=>e.id),primary);
 assert.ok(diagnostics.every(id=>view.tableEntries.some(e=>e.details.some(d=>d.id===id))));
 assert.ok(view.tableEntries.find(e=>e.id==='detail.gpc.cmp_receipt')!.details.some(d=>d.id==='detail.gpc.response'));
 assert.ok(view.tableEntries.find(e=>e.id==='detail.gpc.cmp_receipt')!.details.some(d=>d.id==='detail.gpc.assessment_coverage'));
});
