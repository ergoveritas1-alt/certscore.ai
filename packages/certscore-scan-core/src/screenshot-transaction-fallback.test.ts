import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import type {CDPSession,Page} from 'playwright';
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

test('consent viewport capture reuses its attached session without another acquisition or detach',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'capture-borrowed-')),path=join(directory,'viewport.png');
 let acquisitions=0,detaches=0;const calls:boolean[]=[];const bytes=Buffer.from('attached session viewport');
 const session={send:async(method:string,options:{fromSurface:boolean})=>{assert.equal(method,'Page.captureScreenshot');calls.push(options.fromSurface);return {data:bytes.toString('base64')};},detach:async()=>{detaches++;}} as unknown as CDPSession;
 const page={context:()=>({newCDPSession:()=>{acquisitions++;return new Promise(()=>{});}})} as unknown as Page;
 try{
  const result=await capturePreConsentScreenshot(page,path,{captureMode:'viewport_first',timeoutMs:100,screenshotErrors:[],borrowedCdpSession:session});
  assert.equal(result.status,'available');assert.deepEqual(calls,[false]);assert.equal(acquisitions,0);assert.equal(detaches,0);assert.deepEqual(await readFile(path),bytes);
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('borrowed session preserves the same surface fallback without detaching document/network observers',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'capture-borrowed-fallback-')),path=join(directory,'viewport.png');
 let detaches=0;const calls:boolean[]=[];const bytes=Buffer.from('attached surface viewport');
 const session={send:async(_method:string,options:{fromSurface:boolean})=>{calls.push(options.fromSurface);if(!options.fromSurface)throw Error('View unavailable');return {data:bytes.toString('base64')};},detach:async()=>{detaches++;}} as unknown as CDPSession;
 const page={context:()=>({newCDPSession:()=>{throw Error('Unexpected connection');}})} as unknown as Page;
 try{
  const result=await capturePreConsentScreenshot(page,path,{captureMode:'viewport_first',timeoutMs:100,screenshotErrors:[],borrowedCdpSession:session});
  assert.equal(result.status,'available');assert.deepEqual(calls,[false,true]);assert.equal(detaches,0);assert.deepEqual(await readFile(path),bytes);
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('a borrowed-session timeout preserves its owner and never writes a late screenshot',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'capture-borrowed-timeout-')),path=join(directory,'viewport.png');
 let detaches=0;const completions:Array<(v:{data:string})=>void>=[],errors:string[]=[];
 const session={send:()=>new Promise<{data:string}>(resolve=>completions.push(resolve)),detach:async()=>{detaches++;}} as unknown as CDPSession;
 const page={context:()=>({newCDPSession:()=>{throw Error('Unexpected connection');}})} as unknown as Page;
 try{
  const result=await capturePreConsentScreenshot(page,path,{captureMode:'viewport_first',fallbackMode:'bounded_viewport',timeoutMs:40,screenshotErrors:errors,borrowedCdpSession:session});
  assert.equal(result.status,'placeholder');assert.equal(result.failureReason,'screenshot_timeout');assert.equal(detaches,0);assert.ok(completions.length<=2);
  const placeholder=await readFile(path);for(const complete of completions)complete({data:Buffer.from('late pixels').toString('base64')});
  await new Promise<void>(resolve=>setImmediate(resolve));assert.deepEqual(await readFile(path),placeholder);assert.equal(detaches,0);
  assert.ok(errors.some(message=>message.startsWith('CDP viewport screenshot failed:')));
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('an exhausted screenshot transaction retains its original CDP acquisition errors',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'capture-acquisition-timeout-')),path=join(directory,'viewport.png');
 const errors:string[]=[];const page={context:()=>({newCDPSession:()=>new Promise(()=>{})}),screenshot:async()=>{throw Error('Viewport budget unavailable');}} as unknown as Page;
 try{
  const result=await capturePreConsentScreenshot(page,path,{captureMode:'viewport_first',timeoutMs:40,screenshotErrors:errors});
  assert.equal(result.status,'placeholder');assert.ok(errors.some(message=>message.includes('CDP viewport screenshot failed: Viewport CDP session acquisition timed out')));
  assert.ok(errors.some(message=>message.includes('1x1 screenshot placeholder')));
 }finally{await rm(directory,{recursive:true,force:true});}
});
