import assert from "node:assert/strict";
import test from "node:test";
import {chromium} from "playwright";
import {installDeferredConsentReadiness, primeDeferredConsentReadiness, waitForDeferredConsentReadiness} from "./deferred-consent-readiness";

for (const completes of [true, false]) test(`deferred consent ${completes ? 'waits for handler restoration' : 'stops within the original deadline'}`, async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage();
    await installDeferredConsentReadiness(page);
    await page.route('https://fixture.test/**', route => route.fulfill({contentType:'text/html',body:`
      <script type="text/rocketlazyloadscript"></script><button>Accept all</button>
      <script>
      window.clicks=0;window.ready=false;
      document.addEventListener('click',e=>{if(!window.ready)e.stopImmediatePropagation()},true);
      document.querySelector('button').addEventListener('click',()=>window.clicks++);
      document.querySelector('button').addEventListener('mouseover',()=>{
        document.querySelector('script[type="text/rocketlazyloadscript"]').remove();
        ${completes ? `setTimeout(()=>{window.dispatchEvent(new Event('rocket-allScriptsLoaded'));window.ready=true},150);` : ''}
      },{once:true});
      </script>`}));
    await page.goto('https://fixture.test/');
    const control=page.getByRole('button',{name:'Accept all'}), started=Date.now();
    const ready=await waitForDeferredConsentReadiness({page,control,cmpId:'Borlabs Cookie',deadlineAtMs:started+550});
    assert.equal(ready,completes);assert.equal(await page.evaluate(()=> (window as any).clicks),0);
    if(ready){await control.click();assert.equal(await page.evaluate(()=> (window as any).clicks),1);}
    assert.ok(Date.now()-started<1200);
    // Other CMPs and sites without the loader do not acquire a new wait.
    assert.equal(await waitForDeferredConsentReadiness({page,control,cmpId:'Other',deadlineAtMs:Date.now()}),true);
  } finally {await browser.close();}
});


test('deferred loader first-move suppression is primed without a consent click',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage();await installDeferredConsentReadiness(page);
  await page.route('https://fixture.test/**',r=>r.fulfill({contentType:'text/html',body:`<button>Accept all</button><script>
  // Retained loader fingerprint: RocketLazyLoadScripts / rocket-allScriptsLoaded
  window.moves=0;window.clicks=0;window.addEventListener('click',()=>window.clicks++);
  window.addEventListener('mousemove',()=>{if(++window.moves===2)setTimeout(()=>window.dispatchEvent(new Event('rocket-allScriptsLoaded')),50)});
  </script>`}));
  await page.goto('https://fixture.test/');await primeDeferredConsentReadiness(page);
  assert.equal(await waitForDeferredConsentReadiness({page,control:page.getByRole('button'),cmpId:'Borlabs Cookie',deadlineAtMs:Date.now()+700}),true);
  assert.ok(await page.evaluate(()=>(window as any).moves)>=2);
  assert.equal(await page.evaluate(()=>(window as any).clicks),0);
 }finally{await browser.close();}
});
