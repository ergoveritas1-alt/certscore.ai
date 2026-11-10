import test from 'node:test';import assert from 'node:assert/strict';
import {optOutFunnel} from './audit-opt-out-funnel';
const row=(states:Record<string,string>,source='v1')=>({reportable:true,createdAt:'2026-11-09T12:00:00Z',
 states:Object.fromEntries(Object.entries(states).map(([k,v])=>['sealed.opt_out.'+k,v])),
 metricSources:Object.fromEntries(['dispatch','action_completion','choice_confirmation','post_confirmation_observation','observation'].map(k=>['sealed.opt_out.'+k,source]))});
const day=(rows:any[])=>optOutFunnel(rows)['2026-11-09']!;
test('zero dispatch stays untested; broad signals do not create attempts',()=>{
 const rows=[row({dispatch:'conditional_no_dispatch_recorded',presence:'observed',conditional_control:'not_observed_in_source'}),row({dispatch:'conditional_no_dispatch_recorded',presence:'observed',conditional_control:'observed',supported_route:'unsupported_or_unverified'}),row({dispatch:'excluded_by_profile'}),row({presence:'observed'})];
 const before=JSON.stringify(rows),d=day(rows);assert.equal(d.dispatched,0);assert.equal(d.unknown,1);assert.equal(d.excluded,1);assert.deepEqual(d.stages,[]);assert.equal(d.noQualifyingControlRecorded,1);assert.equal(d.controlWithoutSupportedRoute,1);assert.equal(d.broadSignals,3);assert.equal(JSON.stringify(rows),before);
});
test('stage denominators join the same report and retain missing outcomes',()=>{
 const d=day([row({dispatch:'dispatch_recorded',action_completion:'completed',choice_confirmation:'confirmed_terminal',post_confirmation_observation:'complete'}),row({dispatch:'dispatch_recorded',action_completion:'completed',choice_confirmation:'confirmed_initial',post_confirmation_observation:'limited'}),row({dispatch:'dispatch_recorded',action_completion:'not_completed',choice_confirmation:'confirmed_terminal'}),row({dispatch:'dispatch_recorded'}),row({dispatch:'conditional_no_dispatch_recorded',action_completion:'completed'})]);
 const s=d.stages[0]!;assert.equal(d.dispatched,4);assert.deepEqual(s.actions,{eligible:4,counts:{completed:2,not_completed:1,unavailable:1}});assert.equal(s.confirmations.eligible,2);assert.equal(s.afterTerminal.eligible,1);assert.equal(s.afterInitial.eligible,1);assert.equal(s.outOfSequence,1);assert.equal(d.orphanedOutcomes,1);
});
test('different source versions, days and excluded scans are not pooled into stage rates',()=>{
 const a=row({dispatch:'dispatch_recorded',action_completion:'completed'},'v1'),b=row({dispatch:'dispatch_recorded'},'v2');
 const c={...a,createdAt:'2026-11-09T07:00:00Z'},excluded={...a,reportable:false};
 const result=optOutFunnel([a,b,c,excluded]);assert.equal(result['2026-11-09']!.stages.length,2);assert.equal(result['2026-11-09']!.reportable,2);assert.equal(result['2026-11-08']!.reportable,1);
});
