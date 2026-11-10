import test from 'node:test';
import assert from 'node:assert/strict';
import {optOutDispatchRejectionSchema, type OptOutDispatchRejection} from './opt-out-dispatch-rejection';
import {conditionalOptOutDecisionSchema} from './conditional-opt-out-decision';

test('compact rejection is bounded and tied to an original skipped v3 source',()=>{
 const receipt:OptOutDispatchRejection=[1,1,32,4096,7,Array(14).fill(4096),Array.from({length:8},(_,i)=>[31,120+i,12,255])];
 assert.ok(optOutDispatchRejectionSchema.safeParse(receipt).success);
 assert.ok(Buffer.byteLength(JSON.stringify(receipt))<=512);
 const decision={version:'conditional_opt_out_dispatch.v3',scanId:'scan',status:'skipped',reason:'unsupported_or_unverified_control',sourceSha256:'a'.repeat(64),supportedRoute:false,rejection:receipt};
 assert.ok(conditionalOptOutDecisionSchema.safeParse(decision).success);
 for(const patch of [{sourceSha256:undefined},{version:'conditional_opt_out_dispatch.v2'},{status:'pending'},{reason:'worker_disabled'},{supportedRoute:true}])assert.equal(conditionalOptOutDecisionSchema.safeParse({...decision,...patch}).success,false);
 const {rejection,...legacy}=decision;
 assert.ok(conditionalOptOutDecisionSchema.safeParse({...legacy,version:'conditional_opt_out_dispatch.v2'}).success);
 for(const mutate of [
  (r:OptOutDispatchRejection)=>{r[6].push([1,1,12,0]);},
  (r:OptOutDispatchRejection)=>{r[6][1]=r[6][0]!;},
  (r:OptOutDispatchRejection)=>{r[5][12]=0;},
  (r:OptOutDispatchRejection)=>{r[2]=31;},
  (r:OptOutDispatchRejection)=>{r[6][0]=[-1,-1,12,0];},
  (r:OptOutDispatchRejection)=>{r[6][0]=[0,0,3,255];},
 ]){const invalid=structuredClone(receipt);mutate(invalid);assert.equal(optOutDispatchRejectionSchema.safeParse(invalid).success,false);}
});
