import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
import {projectPostAcceptEvidenceForReport,projectPostRefusalEvidenceForReport} from '@certscore/contracts';
import {runPostAcceptObserver} from './post-accept-observer';
import {runPostRefusalObserver} from './post-refusal-observer';

for (const action of ['accept','reject'] as const) for (const failure of ['confirmation','terminal-storage'] as const) {
  test(`${action}: preserve click and freeze capture during ${failure}`, async () => {
    let dispatched=false, injected=false, lateRequests=0;
    const server=createServer((req,res)=>{
      if(req.url==='/late'){lateRequests++;res.end('ok');return;}
      res.setHeader('content-type','text/html');
      res.end(`<section id="banner" aria-label="Cookie consent"><p>Choose optional cookies</p><button id="choice">${action==='accept'?'Accept all':'Reject all'}</button></section>`);
    });
    await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
    const address=server.address();assert.ok(address&&typeof address!=='string');
    const url=`http://127.0.0.1:${address.port}/`;
    const browser=await chromium.launch({headless:true});
    const newContext=browser.newContext.bind(browser);
    browser.newContext=async options=>{
      const context=await newContext(options),cookies=context.cookies.bind(context),newPage=context.newPage.bind(context);
      context.cookies=async(...args)=>{
        if(dispatched&&failure==='confirmation'){injected=true;throw new Error('injected cookie read failure');}
        return cookies(...args);
      };
      context.newPage=async()=>{
        const page=await newPage(),evaluate=page.evaluate.bind(page);
        await page.route('**/*',route=>new URL(route.request().url()).origin===new URL(url).origin?route.continue():route.abort());
        page.evaluate=(async(fn:any,arg:any)=>{
          if(dispatched&&failure==='terminal-storage'&&String(fn).includes('Object.entries(window.localStorage)')){
            injected=true;
            await evaluate(async()=>{await fetch('/late');localStorage.setItem('late-write','late');});
            await new Promise(r=>setTimeout(r,100));
          }
          return evaluate(fn,arg);
        }) as typeof page.evaluate;
        return page;
      };return context;
    };
    try {
      const common={browser,url,scanId:`boundary-${action}-${failure}`,interactionAuthorization:{kind:'loopback' as const,authorizationId:'loopback_local_lab'},actionSearchTimeoutMs:3000,confirmationTimeoutMs:50,observationWindowMs:350,onActionDispatchCommitted:()=>{dispatched=true;}};
      const recipe={recipeId:'boundary-fixture',resolverMethod:'local_fixture_recipe' as const,controlSelector:'#choice',bannerSelector:'#banner',confirmation:failure==='confirmation'?{kind:'cmp_cookie_changed' as const,cookieName:'fixture-consent'}:{kind:'local_storage_equals' as const,key:'consent',expectedValue:'never'}};
      const packet=action==='accept'?await runPostAcceptObserver({...common,recipe:{...recipe,artifactVersion:'certscore.post_accept_action_recipe.v1'}}):await runPostRefusalObserver({...common,recipe:{...recipe,artifactVersion:'certscore.post_refusal_action_recipe.v1'}});
      const projection='acceptanceRegistration' in packet?projectPostAcceptEvidenceForReport({packet,packetSha256:'a'.repeat(64)}):projectPostRefusalEvidenceForReport({packet,packetSha256:'a'.repeat(64)});
      assert.equal(projection.execution?.clickCompleted,true);
      assert.ok(injected);
      assert.equal(packet.interactionDiagnostics?.click.outcome,'completed');
      assert.equal(packet.afterActionCapture?.activationStatus,'completed');
      assert.equal(packet.productionProjectable,false);
      if(failure==='terminal-storage'){
        assert.equal(lateRequests,1);
        assert.equal(packet.network.requests.some(row=>row.sanitizedUrl.includes('/late')),false);
        assert.equal(packet.afterActionCapture?.storageWrites.some(row=>row.name==='late-write'),false);
      }
    } finally {await browser.close();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
  });
}
