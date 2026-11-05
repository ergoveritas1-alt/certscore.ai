import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {runLocalIsolatedLambdaWorker} from './local-isolated-lambda-worker';

async function fixture(source: string, run: (entrypoint:string)=>Promise<void>) {
 const dir=await mkdtemp(path.join(tmpdir(),'certscore-local-isolation-'));
 try {const entrypoint=path.join(dir,'worker.cjs');await writeFile(entrypoint,source);await run(entrypoint);}finally{await rm(dir,{recursive:true,force:true});}
}
test('CPU-only policy work leaves browser timers responsive and awaits local message persistence',async()=>{
 await fixture(`process.once('message',()=>{process.send({type:'sqs',body:'started'});const end=Date.now()+350;while(Date.now()<end){};process.send({type:'result',result:{status:'completed'}},()=>process.exit(0))})`,async entrypoint=>{
  let ticks=0, persisted=false;let timer:ReturnType<typeof setInterval>|undefined;
  try {
   const result=await runLocalIsolatedLambdaWorker({entrypoint,workspaceRoot:process.cwd(),payload:{},onMessage:async body=>{
    assert.equal(body,'started');timer=setInterval(()=>ticks++,10);await new Promise(r=>setTimeout(r,450));persisted=true;
   }});
   assert.deepEqual(result,{status:'completed'});assert.equal(persisted,true);assert.ok(ticks>=10,`Only ${ticks} timer ticks during CPU work`);
  }finally{if(timer)clearInterval(timer);}
 });
});
test('aborted isolated work rejects without waiting for CPU work to finish',async()=>{
 await fixture(`process.once('message',()=>{process.send({type:'sqs',body:'started'});while(true){}})`,async entrypoint=>{
  const controller=new AbortController();
  await assert.rejects(runLocalIsolatedLambdaWorker({entrypoint,workspaceRoot:process.cwd(),payload:{},signal:controller.signal,
   onMessage:async()=>{controller.abort();}}),/aborted/);
 });
});
test('worker exit without a result is a failure, not an empty successful capture',async()=>{
 await fixture(`process.once('message',()=>process.exit(2))`,async entrypoint=>{
  await assert.rejects(runLocalIsolatedLambdaWorker({entrypoint,workspaceRoot:process.cwd(),payload:{},onMessage:async()=>{}}),/exited before its result/);
 });
});
