import assert from 'node:assert/strict';
import test from 'node:test';
import {getEventListeners} from 'node:events';
import {readWithinActionBoundary as read, requireWithinActionBoundary as required,ActionOperationStopped} from './action-operation-boundary';
test('signal-only boundary interrupts a permanently pending read and removes its listener',async()=>{
 const controller=new AbortController();const pending=read(()=>new Promise<string>(()=>{}),'unknown',Infinity,controller.signal);
 controller.abort();assert.equal(await pending,'unknown');assert.equal(getEventListeners(controller.signal,'abort').length,0);
});
test('expired boundaries never start browser work',async()=>{
 let starts=0;assert.equal(await read(async()=>{starts++;return 'late';},'unknown',Date.now()-1),'unknown');assert.equal(starts,0);
});
test('late resource is disposed once without extending the original deadline',async()=>{
 let release!:(value:{id:number})=>void, disposed=0;
 const pending=required(()=>new Promise<{id:number}>(r=>release=r),Date.now()+20,undefined,async()=>{disposed++;});
 await assert.rejects(pending,ActionOperationStopped);release({id:1});await new Promise(r=>setTimeout(r,10));assert.equal(disposed,1);
});
test('late rejection is observed and cannot turn an unavailable read into success',async()=>{
 let reject!:(error:Error)=>void;const pending=read(()=>new Promise<string>((_,r)=>reject=r),'unknown',Date.now()+20);
 assert.equal(await pending,'unknown');reject(new Error('late RPC failure'));await new Promise(r=>setTimeout(r,10));
});
test('successful reads preserve values and remove abort listeners',async()=>{
 const controller=new AbortController();assert.equal(await required(async()=>42,Date.now()+1000,controller.signal),42);
 assert.equal(getEventListeners(controller.signal,'abort').length,0);
});
