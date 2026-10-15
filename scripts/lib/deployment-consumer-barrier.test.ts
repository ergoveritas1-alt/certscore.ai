import assert from 'node:assert/strict';
import test from 'node:test';
import { deployConsumersBeforeProducer } from './deployment-consumer-barrier';
const outcome=(status:string)=>({status});
const deferred=()=>{let resolve!:(value:ReturnType<typeof outcome>)=>void;const promise=new Promise<ReturnType<typeof outcome>>(r=>{resolve=r});return {promise,resolve};};
test('producer waits for both concurrent consumers, including a skipped unchanged consumer',async()=>{
 const a=deferred(),b=deferred(),events:string[]=[];
 const work=deployConsumersBeforeProducer({consumers:[()=>{events.push('web');return a.promise},()=>{events.push('validation');return b.promise}],producer:async()=>{events.push('scanner');return outcome('succeeded')},skippedProducer:()=>outcome('skipped')});
 await Promise.resolve();assert.deepEqual(events,['web','validation']);a.resolve(outcome('succeeded'));await Promise.resolve();assert.equal(events.includes('scanner'),false);b.resolve(outcome('skipped'));assert.deepEqual((await work).map(x=>x.status),['succeeded','skipped','succeeded']);assert.deepEqual(events,['web','validation','scanner']);
});
test('failed consumer never promotes scanner and still waits for the other consumer',async()=>{
 const b=deferred();let invoked=false,finished=false;
 const work=deployConsumersBeforeProducer({consumers:[async()=>outcome('failed'),()=>b.promise],producer:async()=>{invoked=true;return outcome('succeeded')},skippedProducer:()=>outcome('skipped')}).then(x=>{finished=true;return x});
 await Promise.resolve();assert.equal(finished,false);assert.equal(invoked,false);b.resolve(outcome('succeeded'));assert.deepEqual((await work).map(x=>x.status),['failed','succeeded','skipped']);assert.equal(invoked,false);
});
test('rejected consumer fails closed after the second consumer terminates',async()=>{
 const b=deferred();let invoked=false;
 const work=deployConsumersBeforeProducer({consumers:[async()=>{throw Error('monitor failed')},()=>b.promise],producer:async()=>{invoked=true;return outcome('succeeded')},skippedProducer:()=>outcome('skipped')});
 b.resolve(outcome('succeeded'));await assert.rejects(work,/Consumer deployment/);assert.equal(invoked,false);
});

test('empty or unresolved consumer results cannot authorize a producer promotion',async()=>{
 let invoked=false;const producer=async()=>{invoked=true;return outcome('succeeded')};
 await assert.rejects(deployConsumersBeforeProducer({consumers:[],producer,skippedProducer:()=>outcome('skipped')}),/At least one consumer/);
 const result=await deployConsumersBeforeProducer({consumers:[async()=>outcome('pending')],producer,skippedProducer:()=>outcome('skipped')});
 assert.equal(result.at(-1)?.status,'skipped');assert.equal(invoked,false);
});
