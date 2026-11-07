import test from 'node:test';import assert from 'node:assert/strict';import {activateReviewedOptOutAfterProducer} from './reviewed-opt-out-release';
test('failed, skipped or unverified producer deployment cannot activate consumer dispatch',async()=>{
 let calls=0;for(const status of ['failed','skipped']){assert.deepEqual(await activateReviewedOptOutAfterProducer([{status:'succeeded'},{status}],async()=>{calls++;},[async()=>++calls]),[]);}assert.equal(calls,0);
 await assert.rejects(activateReviewedOptOutAfterProducer([{status:'succeeded'}],async()=>{throw Error('region mismatch');},[async()=>++calls]),/region mismatch/);assert.equal(calls,0);
});
test('all consumers activate only after code deployment and regional producer verification',async()=>{
 const events:string[]=[];const values=await activateReviewedOptOutAfterProducer(Array.from({length:4},()=>({status:'succeeded'})),async()=>{events.push('verified');},[async()=>{events.push('web');return 'web';},async()=>{events.push('validation');return 'validation';}]);assert.equal(events[0],'verified');assert.deepEqual(values,['web','validation']);assert.equal(events.length,3);
});
