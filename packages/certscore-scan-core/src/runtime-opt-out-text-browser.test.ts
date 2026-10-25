import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {createArtifactWriter} from './artifact-writer';
import {preConsentRuntimeScanner} from './scanners/pre-consent-runtime-scanner';
import {GATE_RUNTIME_TEXT_TARGET as targetUrl,GATE_RUNTIME_TEXT_PAGE as pageUrl} from '@certscore/contracts';

test('Gate baseline retains original runtime read binding using entirely intercepted offline fixture navigation',async t=>{
 const browser=await chromium.launch({headless:true}),root=await mkdtemp(path.join(tmpdir(),'certscore-gate-text-'));
 const newContext=browser.newContext.bind(browser);let requests=0,mutations=0;const urls:string[]=[];
 t.mock.method(browser,'newContext',async(...args)=>{
  const context=await newContext(...args);
  // An intercepted redirect may bypass routing for its destination. Disable
  // networking before creating any page, and navigate directly to fixture bytes.
  await context.setOffline(true);
  await context.route('**/*',async route=>{
   requests++;urls.push(route.request().url());if(route.request().method()!=='GET')mutations++;
   if(route.request().url()===pageUrl)return route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="en"><head><title>Offline public-page fixture</title></head><body><h1>Public information</h1><p>${'Articles, products, services, information and contact details. '.repeat(20)}</p></body></html>`});
   return route.abort();
  });
  const newPage=context.newPage.bind(context);
  t.mock.method(context,'newPage',async()=>{
   const page=await newPage(),goto=page.goto.bind(page);
   t.mock.method(page,'goto',(url,options)=>goto(url===targetUrl?pageUrl:url,options));
   return page;
  });
  return context;
 });
 try{
  const result=await preConsentRuntimeScanner({url:targetUrl,normalizedUrl:targetUrl,browser,scanStartedAtMs:Date.now(),internalBudgetMs:20000,
   artifactWriter:await createArtifactWriter(root),captureScope:'runtime_evidence',screenshotMode:'never',waitMode:'fast'});
  const snapshot=result.domSnapshots[0]!,proof=snapshot.optOutSearch;
  assert.ok(proof?.version==='dom_opt_out_search.v3');assert.equal(proof.documentUrl,pageUrl);assert.equal(proof.result,'no_qualifying_signal');
  assert.equal(proof.documentToken,snapshot.documentIdentity?.token);assert.ok(proof.capturedAtMs<=snapshot.capturedAtMs);
  const text=await readFile(snapshot.path,'utf8');assert.equal(proof.textSha256,createHash('sha256').update(text).digest('hex'));
  assert.match(text,/Public information/);assert.doesNotMatch(text,/Hall of fame|celeb archives/i);
  assert.equal(result.consentUiObservations.length,0,'Runtime proof does not fabricate consent inspection');assert.equal(mutations,0);assert.equal(requests,1,JSON.stringify(urls));
 }finally{await browser.close();await rm(root,{recursive:true,force:true});}
});
