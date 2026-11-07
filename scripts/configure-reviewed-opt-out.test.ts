import test from 'node:test';
import assert from 'node:assert/strict';
import {configureReviewedOptOut,ROLLOUT_FLAGS} from './configure-reviewed-opt-out';
test('rollout configuration preserves resources, unrelated flags and sidecars',()=>{
 const task={cpu:'256',memory:'512',containerDefinitions:[{name:'validation-worker',environment:[{name:'OTHER',value:'yes'}]},{name:'sidecar',environment:[{name:'OTHER',value:'sidecar'}]}]};
 assert.equal(configureReviewedOptOut(task,'preserve','validation-worker'),task);
 const on=configureReviewedOptOut(task,'enable','validation-worker');assert.equal(on.cpu,task.cpu);assert.equal(on.memory,task.memory);assert.deepEqual(on.containerDefinitions[1],task.containerDefinitions[1]);
 for(const name of ROLLOUT_FLAGS)assert.equal(on.containerDefinitions[0]!.environment!.find(e=>e.name===name)!.value,'1');
 const off=configureReviewedOptOut(on,'disable','validation-worker');for(const name of ROLLOUT_FLAGS)assert.equal(off.containerDefinitions[0]!.environment!.find(e=>e.name===name)!.value,'0');
 assert.throws(()=>configureReviewedOptOut(task,'enable','other'));
 assert.throws(()=>configureReviewedOptOut(task,'bogus','validation-worker'));
 assert.deepEqual(task.containerDefinitions[0]!.environment,[{name:'OTHER',value:'yes'}]);
});
