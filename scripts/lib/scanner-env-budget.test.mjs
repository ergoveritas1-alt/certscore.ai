import test from 'node:test';
import assert from 'node:assert/strict';
import { scannerEnvironmentWithinBudget, REVIEWED_WORKER_FLAGS } from './scanner-env-budget.mjs';
const primary='CERTSCORE_V2_DAG_LAMBDA_RESULT_QUEUE_URL';
const alias='CERTSCORE_V2_DAG_LAMBDA_US_WEST_RESULT_QUEUE_URL';
const fixture={ [primary]:'https://sqs.us-west-1.amazonaws.com/000000000000/example', CRYPTIC_VALUE:'é'.repeat(1930) };
fixture[alias]=fixture[primary];
test('only removes an exact unused US alias and preserves the original queue and other configuration',()=>{
 const copy={...fixture};
 const {next,bytes,originalBytes,deduplicated}=scannerEnvironmentWithinBudget('us-west-1',fixture,REVIEWED_WORKER_FLAGS,true);
 assert.equal(deduplicated,true);assert.ok(originalBytes>4096&&bytes<=4096);
 const {[alias]:_ignored,...kept}=fixture;
 assert.deepEqual(next,{...kept,...REVIEWED_WORKER_FLAGS});assert.deepEqual(fixture,copy);
});
test('rejects other regions, disabled repair, and different queue destinations',()=>{
 for(const [region,env,enabled] of [['eu-west-1',fixture,true],['us-west-1',fixture,false],['us-west-1',{...fixture,[alias]:fixture[primary]+'-other'},true]])
   assert.throws(()=>scannerEnvironmentWithinBudget(region,env,REVIEWED_WORKER_FLAGS,enabled),/4 KiB/);
 assert.equal(scannerEnvironmentWithinBudget('us-west-1',{[primary]:'q',[alias]:'q'},REVIEWED_WORKER_FLAGS,true).next[alias],'q');
});
