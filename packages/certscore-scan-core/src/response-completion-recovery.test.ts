import assert from 'node:assert/strict';
import test from 'node:test';
import {createResponseCompletionRecovery} from './response-completion-recovery';

test('response recovery is exact-request bound, deduplicated and frozen at publication',async()=>{
 let frozen=false,calls=0,lookups=0;
 const handles=new Map<object,{request:object}|null>();
 const recovery=createResponseCompletionRecovery({finalized:()=>frozen,responseFor:async(request:object)=>{lookups++;return handles.get(request)??null;},requestOf:r=>r.request,capture:async r=>{if(recovery.begin(r.request))calls++;}});
 const captured={};handles.set(captured,{request:captured});assert.equal(recovery.begin(captured),true);assert.equal(recovery.recover(captured),undefined);assert.equal(lookups,0);
 const missed={};handles.set(missed,{request:missed});await recovery.recover(missed);assert.equal(calls,1);assert.equal(recovery.recover(missed),undefined);
 const foreign={};handles.set(foreign,{request:{}});await recovery.recover(foreign);assert.equal(calls,1);
 frozen=true;assert.equal(recovery.recover({}),undefined);assert.equal(recovery.begin({}),false);
});

test('late response recovery cannot write after freeze and the fallback is bounded',async()=>{
 let frozen=false,calls=0,lookups=0;
 let release!:(value:{request:object}|null)=>void;
 const pending=new Promise<{request:object}|null>(resolve=>{release=resolve;});
 const recovery=createResponseCompletionRecovery({finalized:()=>frozen,responseFor:async(_:object)=>{lookups++;return pending;},requestOf:r=>r.request,capture:async()=>{calls++;}});
 const request={};const task=recovery.recover(request);frozen=true;release({request});await task;assert.equal(calls,0);
 frozen=false;await Promise.all(Array.from({length:20},()=>recovery.recover({})));assert.equal(lookups,8);assert.equal(calls,0);
});
