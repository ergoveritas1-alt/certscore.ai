import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import type {Page} from 'playwright';
import {capturePreConsentScreenshot} from './scanners/pre-consent-runtime-scanner';
test('view capture avoids dispatching a stalled compositor request',async()=>{
 const calls:boolean[]=[];const directory=await mkdtemp(join(tmpdir(),'capture-budget-'));const path=join(directory,'viewport.png');const bytes=Buffer.from('fixture viewport bytes');
 const page={context:()=>({newCDPSession:async()=>({send:async(_method:string,options:{fromSurface:boolean})=>{calls.push(options.fromSurface);if(options.fromSurface)return new Promise(()=>{});return {data:bytes.toString('base64')};},detach:async()=>{}})})} as unknown as Page;
 try{const result=await capturePreConsentScreenshot(page,path,{captureMode:'viewport_first',timeoutMs:400,screenshotErrors:[]});assert.equal(result.status,'available');assert.deepEqual(calls,[false]);assert.deepEqual(await readFile(path),bytes);}finally{await rm(directory,{recursive:true,force:true});}
});
test('a failed view capture retains the bounded surface compatibility fallback',async()=>{
 const calls:boolean[]=[];const directory=await mkdtemp(join(tmpdir(),'capture-surface-'));const path=join(directory,'viewport.png');const bytes=Buffer.from('surface fixture bytes');
 const page={context:()=>({newCDPSession:async()=>({send:async(_method:string,options:{fromSurface:boolean})=>{calls.push(options.fromSurface);if(!options.fromSurface)throw Error('View path unavailable');return {data:bytes.toString('base64')};},detach:async()=>{}})})}as unknown as Page;
 try{const result=await capturePreConsentScreenshot(page,path,{captureMode:'viewport_first',timeoutMs:400,screenshotErrors:[]});assert.equal(result.status,'available');assert.deepEqual(calls,[false,true]);assert.deepEqual(await readFile(path),bytes);}finally{await rm(directory,{recursive:true,force:true});}
});
