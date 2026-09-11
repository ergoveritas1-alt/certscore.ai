import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
import {runPostAcceptObserver} from './post-accept-observer';
import {runPostRefusalObserver} from './post-refusal-observer';
import {CERTSCORE_OWNED_ANALYTICS_ACCEPT_RECIPE} from './post-accept-cmp-recipes';

for (const action of ['accept','reject'] as const) {
  test(`${action}: a bound control completes the uniqueness sweep within the existing outer budget`, async () => {
    let clicks=0;
    const server=createServer((req,res)=>{
      if(req.url==='/clicked'){clicks++;res.end('ok');return;}
      res.setHeader('Content-Type','text/html');
      res.end(`<style>#cookie-banner{position:fixed;top:20px;left:20px;background:white;padding:20px;z-index:10}button{padding:12px}</style>
        <section id="cookie-banner" role="dialog" aria-label="Cookie consent preferences"><p>We use optional cookies for analytics. Choose your consent.</p>
        <button id="choice" onclick="fetch('/clicked')">${action==='accept'?'Accept all':'Reject all'}</button></section>
        <iframe srcdoc="<p>Unrelated frame</p>"></iframe><iframe srcdoc="<p>Another unrelated frame</p>"></iframe>`);
    });
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
    const browser=await chromium.launch({headless:true});
    const newContext=browser.newContext.bind(browser);
    // Reproduce browser-transport latency while retaining actual Chromium DOM,
    // frame uniqueness, geometry, authorization and click behavior.
    browser.newContext=async(options)=>{
      const context=await newContext(options),newPage=context.newPage.bind(context);
      context.newPage=async()=>{
        const page=await newPage();
        const patch=(scope:any)=>{const locator=scope.locator.bind(scope);scope.locator=(...args:any[])=>{
          const result=locator(...args),count=result.count.bind(result);
          result.count=async()=>{await new Promise(resolve=>setTimeout(resolve,110));return count();};return result;
        };};
        patch(page);page.on('frameattached',patch);return page;
      };return context;
    };
    try {
      const url=`http://127.0.0.1:${(server.address() as any).port}/`;
      const common={browser,url,scanId:'binding-'+action,interactionAuthorization:{kind:'loopback' as const,authorizationId:'loopback_local_lab'},actionSearchTimeoutMs:5000,confirmationTimeoutMs:100,observationWindowMs:50,productionProjectable:false};
      const packet=action==='accept'?await runPostAcceptObserver({...common,allowCanonicalAcceptDiscovery:true,
        recipe:{...CERTSCORE_OWNED_ANALYTICS_ACCEPT_RECIPE,recipeId:'missing-recipe',controlSelector:'#absent'}})
        :await runPostRefusalObserver({...common,allowCanonicalRejectDiscovery:true,
          recipe:{artifactVersion:'certscore.post_refusal_action_recipe.v1',recipeId:'missing-recipe',resolverMethod:'owned_site_recipe',controlSelector:'#absent',bannerSelector:'#cookie-banner',confirmation:{kind:'local_storage_equals',key:'consent',expectedValue:'denied'}}});
      assert.equal(clicks,1,JSON.stringify({resolver:packet.resolver,diagnostics:packet.interactionDiagnostics,limitations:packet.limitations}));
      assert.equal(packet.afterActionCapture?.activationStatus,'completed');
      assert.equal(packet.afterActionCapture?.stopReason,'window_elapsed');
      assert.equal(packet.afterActionCapture?.requestsDropped,0);
    } finally {await browser.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
  });
}

for (const [name,acceptLabel,rejectLabel] of [
  ['negated','I Accept Cookies','I Do Not Accept Cookies'],
  ['necessary','Zustimmen','Nur notwendige Funktionscookies akzeptieren'],
  ['category-en','Accept all non-essential cookies','Reject all non-essential cookies'],
  ['category-de','Alle nicht notwendigen Cookies akzeptieren','Alle nicht notwendigen Cookies ablehnen'],
  ['category-fr','Accepter tous les cookies non essentiels','Refuser tous les cookies non essentiels'],
]) for (const action of ['accept','reject'] as const) {
  test(`${name}: ${action} clicks only the correct choice and preserves unverified capture`, async () => {
    const clicked:string[]=[];
    const server=createServer((req,res)=>{
      if(req.url?.startsWith('/clicked/')){clicked.push(req.url.split('/').pop()!);res.end('ok');return;}
      res.setHeader('Content-Type','text/html');res.end(`<style>#cookie-banner{position:fixed;top:20px;left:20px;padding:20px;background:white}button{padding:12px;margin:10px}</style>
        <section id="cookie-banner" role="dialog" aria-label="Cookie consent preferences"><p>Choose your consent to optional analytics cookies.</p>
        <button id="accept" onclick="fetch('/clicked/accept')">${acceptLabel}</button>
        <button id="reject" onclick="fetch('/clicked/reject')">${rejectLabel}</button></section>`);
    });
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
    try {
      const common={url:`http://127.0.0.1:${(server.address() as any).port}/`,scanId:`semantic-${name}-${action}`,interactionAuthorization:{kind:'loopback' as const,authorizationId:'loopback_local_lab'},actionSearchTimeoutMs:3000,confirmationTimeoutMs:100,observationWindowMs:50,productionProjectable:true};
      const packet=action==='accept'?await runPostAcceptObserver({...common,allowCanonicalAcceptDiscovery:true,recipe:{...CERTSCORE_OWNED_ANALYTICS_ACCEPT_RECIPE,recipeId:'missing-recipe',controlSelector:'#absent'}})
        :await runPostRefusalObserver({...common,allowCanonicalRejectDiscovery:true,recipe:{artifactVersion:'certscore.post_refusal_action_recipe.v1',recipeId:'missing-recipe',resolverMethod:'owned_site_recipe',controlSelector:'#absent',bannerSelector:'#cookie-banner',confirmation:{kind:'local_storage_equals',key:'consent',expectedValue:'denied'}}});
      assert.deepEqual(clicked,[action]);
      assert.equal(packet.actionControlProof?.classifierIntent,action);
      assert.equal(packet.afterActionCapture?.activationStatus,'completed');
      assert.equal(packet.afterActionCapture?.stopReason,'window_elapsed');
      assert.equal(packet.afterActionCapture?.requestsDropped,0);
      assert.equal(packet.productionProjectable,false,'a correct click does not manufacture semantic registration');
    } finally {await new Promise<void>(resolve=>server.close(()=>resolve()));}
  });
}
