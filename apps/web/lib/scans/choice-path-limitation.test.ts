import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {readChoicePathLimitation} from './choice-path-execution';
const rows=JSON.parse(readFileSync(new URL('../../../../packages/certscore-contracts/fixtures/retained-unconfirmed-actions-20261113.json',import.meta.url),'utf8'));
test('both actions distinguish a completed unconfirmed capture from a missing result',()=>{
 for(const row of rows){
  const before=JSON.stringify(row.projection);
  assert.equal(readChoicePathLimitation(row.projection,row.action)?.code,'consent_state_unconfirmed');
  assert.equal(JSON.stringify(row.projection),before);
  assert.equal(readChoicePathLimitation(null,row.action,{status:'failed'})?.code,'verified_result_unavailable');
  assert.equal(readChoicePathLimitation({...row.projection,execution:{...row.projection.execution,consentConfirmed:true}},row.action,{status:'failed'})?.code,'verified_result_unavailable');
  assert.equal(readChoicePathLimitation(null,row.action,{status:'not_applicable'}),null);
 }
});

test('Accept and Reject distinguish explicit worker failure and result deadline without inferring a click',()=>{
 for(const action of ['accept','reject'] as const){
  assert.equal(readChoicePathLimitation(null,action,{status:'failed',limitationCode:action+'_path_worker_failed'})?.code,'worker_failed');
  assert.equal(readChoicePathLimitation(null,action,{status:'timed_out',limitationCode:action+'_path_timeout'})?.code,'result_deadline_exceeded');
  assert.equal(readChoicePathLimitation(null,action,{status:'failed',limitationCode:action+'_path_incomplete_at_passive_barrier'})?.code,'passive_inspection_cutoff');
  assert.equal(readChoicePathLimitation(null,action,{status:'failed',limitationCode:'untrusted content'})?.code,'verified_result_unavailable');
 }
});
