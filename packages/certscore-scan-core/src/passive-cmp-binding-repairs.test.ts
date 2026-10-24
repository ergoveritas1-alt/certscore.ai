import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { chromium } from 'playwright';
import { runCmpPreferencesObserver } from './cmp-preferences-observer.js';
import { policySurfaceObservationsFromRetainedRenderedLinks, policySurfaceScanner } from './scanners/policy-surface-scanner.js';
import { mergePolicySurfaceObservations } from './policy-surface-projection.js';
import { createArtifactWriter } from './artifact-writer.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

// Retained ReadCube/Gimbal shapes, without third-party scripts or public traffic.
test('passive OneTrust readiness and outside-root Options preserve loaded facts without panel authority', {timeout:30000}, async()=>{
 let mode='readcube',mutations=0;
 const server=createServer((req,res)=>{
  if(req.url==='/mutation'){mutations++;res.end();return;}
  res.setHeader('content-type','text/html');
  res.end(`<main>Public content</main><footer><nav aria-label="Navigation menu"><a href="#" id="ot-sdk-btn" class="ot-sdk-show-settings" onclick="fetch('/mutation')">Cookie settings</a></nav></footer>
   ${mode==='gimbal'?'':'<div id="onetrust-consent-sdk"><section id="onetrust-banner-sdk"><button id="onetrust-pc-btn-handler" onclick="fetch(\'/mutation\')">Cookies settings</button><button>Necessary only</button></section><section id="onetrust-pc-sdk" hidden><label><input type="checkbox" checked>Hidden Advertising</label></section></div>'}
   <script>let reads=0,ready=${mode==='readcube'?'false':'true'};
   window.OneTrust={ToggleInfoDisplay:()=>fetch('/mutation'),GetDomainData:()=>{
   if(!ready&&!reads++)setTimeout(()=>ready=true,35);
   ${mode==='drift'?"history.replaceState({},'', '/changed');":''}
   return {Groups:ready?[{CustomGroupId:'C0002',GroupName:'Performance Cookies',FirstPartyCookies:[{Name:'_ga',description:'Audience measurement'}]}]:[]};
   }};document.addEventListener('click',()=>fetch('/mutation'));document.addEventListener('submit',()=>fetch('/mutation'));</script>`);
 });
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();assert.ok(address&&typeof address!=='string');
 const browser=await chromium.launch({headless:true});
 try{for(mode of ['readcube','gimbal','drift']){
  const p=await runCmpPreferencesObserver({browser,parentDispatchSha256:'a'.repeat(64),config:{policyVersion:'bounded_cmp_preferences.v1',enabled:true,scanId:mode,exactTargetUrl:`http://127.0.0.1:${address.port}/`,computeBudgetPolicy:'coverage_25_gb_seconds.v1'}});
  assert.equal(mutations,0);assert.equal(p.action.count,0);assert.equal(p.action.opened,false);
  assert.equal(p.inspectionDiagnostic?.budgetMs,6510);assert.equal(p.captureMode,'passive_cmp_inventory.v1');
  assert.equal(p.controlInventoryComplete,false);assert.equal(p.declarationInventoryComplete,false);assert.deepEqual(p.controls,[]);
  if(mode==='drift'){assert.equal(p.documentToken,null);assert.deepEqual(p.declarations,[]);assert.equal(p.checkpoints,undefined);}
  else{assert.equal(p.status,'completed',JSON.stringify(p));assert.equal(p.support.provider,'OneTrust');assert.equal(p.declarations[0]?.name,'_ga');assert.ok(p.documentToken);assert.equal(p.captureProgress?.documentToken,p.documentToken);assert.equal(p.checkpoints?.declarations,true);}
 }}finally{await browser.close();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});

test('visible link merge keeps the child label, selector and clickability together, never an ancestor locator',()=>{
 const visible=policySurfaceObservationsFromRetainedRenderedLinks({links:[{domLocation:'footer',href:'https://infillion.example/',pageUrl:'https://infillion.example/',linkText:'Cookie settings',selector:'#ot-sdk-btn',linkVisibility:'visible',accessibleNameSource:'text'}]})[0]!;
 assert.ok(visible);
 const ancestor={...visible,observationId:'ancestor',selector:'nav[aria-label="Navigation menu"]',clickable:false,confidence:1,linkText:'Privacy Cookie settings',linkVisibility:undefined};
 for(const order of [[ancestor,visible],[visible,ancestor]]){
  const merged=mergePolicySurfaceObservations(order,[])[0]!;
  assert.equal(merged.linkText,'Cookie settings');assert.equal(merged.selector,'#ot-sdk-btn');assert.equal(merged.clickable,true);
 }
 assert.equal(mergePolicySurfaceObservations([ancestor],[{...visible,selector:undefined}])[0]?.selector,undefined,'A missing child locator must not borrow an ancestor');
 for(const invalid of [{...visible,linkVisibility:'hidden' as const},{...visible,accessibleNameSource:'none' as const},{...visible,linkSourcePageUrl:undefined},{...visible,clickable:false}]){
  assert.equal(mergePolicySurfaceObservations([ancestor],[invalid])[0]?.selector,ancestor.selector);
 }
});

test('policy discovery binds a rendered Gimbal-like footer control rather than the named navigation ancestor', {timeout:20000}, async()=>{
 let mutations=0;
 const server=createServer((req,res)=>{
  if(req.url==='/mutation'){mutations++;res.end();return;}
  res.setHeader('content-type','text/html');
  if(req.url!=='/'){res.statusCode=404;res.end('Not found');return;}
  res.end(`<html><body><main>Example public page</main><footer id="footer"></footer><script>document.getElementById('footer').innerHTML='<nav aria-label="Navigation menu"><a href="#" id="ot-sdk-btn" class="ot-sdk-show-settings">Cookie settings</a></nav>';document.addEventListener('click',()=>fetch('/mutation'));</script></body></html>`);
 });
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const addr=server.address();assert.ok(addr&&typeof addr!=='string');
 const dir=await mkdtemp(`${tmpdir()}/passive-policy-binding-`),url=`http://127.0.0.1:${addr.port}/`;
 try{
 const result=await policySurfaceScanner({url,normalizedUrl:url,scanStartedAtMs:Date.now(),internalBudgetMs:6000,discoveryMode:'fast',artifactWriter:await createArtifactWriter(dir)});
 const row=result.policySurfaceObservations.find(r=>r.linkText==='Cookie settings');assert.ok(row,JSON.stringify(result.policySurfaceObservations));
 assert.equal(row.selector,'#ot-sdk-btn');assert.equal(row.clickable,true);assert.equal(row.linkVisibility,'visible');
 assert.equal(result.policySurfaceObservations.some(r=>r.selector?.startsWith('nav[')),false);assert.equal(mutations,0);
 }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await rm(dir,{recursive:true,force:true});}
});

test('new provider scopes are passive-only and runtime observations retain exact CMP identities', {timeout:30000}, async()=>{
 const {preConsentRuntimeScanner}=await import('./scanners/pre-consent-runtime-scanner.js');
 let mode='ensighten',mutations=0;
 const server=createServer((req,res)=>{
  if(req.url==='/mutation'){mutations++;res.end();return;}
  res.setHeader('content-type','text/html');
  res.end(`<main>Example public content.</main><section ${mode==='ensighten'?'id="ensNotifyBanner"':'class="ccm-root"'}><p>We use cookies for analytics and advertising. Choose your cookie settings.</p><button id="${mode==='ensighten'?'ensAcceptAll':'ccm-accept'}">Accept all</button><button id="${mode==='ensighten'?'ensRejectAll':'ccm-reject'}">Reject all optional</button><button id="${mode==='ensighten'?'ensOpenModal':'ccm-settings'}">Manage cookies</button></section><script>document.addEventListener('click',()=>fetch('/mutation'));document.addEventListener('submit',()=>fetch('/mutation'));</script>`);
 });
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const addr=server.address();assert.ok(addr&&typeof addr!=='string');
 const dir=await mkdtemp(`${tmpdir()}/passive-provider-`),url=`http://127.0.0.1:${addr.port}/`;
 const browser=await chromium.launch({headless:true});
 try{for(mode of ['ensighten','ccm19']){
  const expected=mode==='ensighten'?'Ensighten Privacy':'CCM19';
  const packet=await runCmpPreferencesObserver({browser,parentDispatchSha256:'a'.repeat(64),config:{policyVersion:'bounded_cmp_preferences.v1',enabled:true,scanId:mode,exactTargetUrl:url,computeBudgetPolicy:'coverage_25_gb_seconds.v1'}});
  assert.equal(packet.support.provider,expected,JSON.stringify(packet));assert.equal(packet.status,'completed');
  assert.equal(packet.action.count,0);assert.equal(packet.action.opened,false);assert.equal(packet.controlInventoryComplete,false);
  const result=await preConsentRuntimeScanner({url,normalizedUrl:url,scanStartedAtMs:Date.now(),internalBudgetMs:6000,cmpBasicScanId:mode,artifactWriter:await createArtifactWriter(dir+'/'+mode),captureScope:'consent_proof',screenshotMode:'never'});
  assert.ok(result.cmpRuntimeObservations?.some(r=>r.vendor===expected),JSON.stringify(result.cmpRuntimeObservations));
  assert.equal(result.cmpBasicEvidence?.provider,expected);assert.equal(mutations,0);
 }}finally{await browser.close();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await rm(dir,{recursive:true,force:true});}
});
