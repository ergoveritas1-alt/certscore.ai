// Replays the retained flic.kr pattern: one canonical candidate repeatedly lost
// during bounded cross-frame binding. Traffic is loopback-only.
import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'node:http';
import {chromium, type Frame} from 'playwright';
import {runPostAcceptObserver} from './post-accept-observer';
import {runPostRefusalObserver} from './post-refusal-observer';

for (const action of ['accept','reject'] as const) for (const mode of ['single','duplicate','cancelled','deadline'] as const) {
  const duplicateNamed=mode==='duplicate';
  const controller=new AbortController();
  test(`${action} retained flic.kr geometry fallback completes slow uniqueness: mode=${mode}`, async () => {
    let clicks=0;
    const server=createServer((req,res)=>{
      if(req.url==='/clicked'){clicks++;res.end('ok');return;}
      res.setHeader('Content-Type','text/html');
      res.end(`<style>#cookie-banner{position:fixed;top:20px;left:20px;background:white;padding:20px;z-index:10}button{padding:12px}</style>
        <section id="cookie-banner" role="dialog" aria-label="Cookie consent preferences"><p>We use optional cookies for analytics. Choose your consent.</p>
        <button id="choice" onclick="localStorage.setItem('consent','${action==='accept'?'accepted':'rejected'}');fetch('/clicked')">${action==='accept'?'Accept all':'Reject all'}</button>${duplicateNamed ? `<button id="other">${action==='accept'?'Accept all':'Reject all'}</button>` : ''}</section>
        <iframe srcdoc="<p>Unrelated frame</p>"></iframe><iframe srcdoc="<p>Another unrelated frame</p>"></iframe>`);
    });
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
    const browser=await chromium.launch({headless:true});
    const newContext=browser.newContext.bind(browser);
    const delayedFrames = new Set<Frame>();
    // Reproduce browser-transport latency while retaining actual Chromium DOM,
    // frame uniqueness, geometry, authorization and click behavior.
    browser.newContext=async(options)=>{
      const context=await newContext(options),newPage=context.newPage.bind(context);
      context.newPage=async()=>{
        const page=await newPage();
        const patch=(scope:Frame)=>{const locator=scope.locator.bind(scope);scope.locator=(...args:Parameters<Frame['locator']>)=>{
          const result=locator(...args),count=result.count.bind(result);
          result.count=async()=>{delayedFrames.add(scope);if(mode==='cancelled')controller.abort();await new Promise(resolve=>setTimeout(resolve,450));return count();};return result;
        };};
        // Stress cross-frame uniqueness without delaying unrelated main-frame
        // readiness probes that share the bounded search window.
        await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
        page.on('frameattached',patch);return page;
      };return context;
    };
    try {
      const url=`http://127.0.0.1:${(server.address() as any).port}/`;
      const common={browser,url,scanId:'binding-'+action,interactionAuthorization:{kind:'loopback' as const,authorizationId:'loopback_local_lab'},actionSearchTimeoutMs:mode==='deadline'?800:5000,signal:controller.signal,confirmationTimeoutMs:100,observationWindowMs:50,productionProjectable:false};
      const recipe={recipeId:'named-fixture',resolverMethod:'owned_site_recipe' as const,controlSelector:'#absent-named-recipe',bannerSelector:'#cookie-banner',confirmation:{kind:'local_storage_equals' as const,key:'consent',expectedValue:'never'}};
      const packet=action==='accept'?await runPostAcceptObserver({...common,allowCanonicalAcceptDiscovery:true,recipe:{...recipe,artifactVersion:'certscore.post_accept_action_recipe.v1'}}):await runPostRefusalObserver({...common,allowCanonicalRejectDiscovery:true,recipe:{...recipe,artifactVersion:'certscore.post_refusal_action_recipe.v1'}});
      if (mode!=='single') {
        assert.equal(clicks,0);
        assert.equal(packet.interactionDiagnostics?.click.outcome,"not_attempted");
        return;
      }
      assert.equal(clicks,1,JSON.stringify({resolver:packet.resolver,diagnostics:packet.interactionDiagnostics,limitations:packet.limitations}));
      assert.equal(delayedFrames.size,2,'the uniqueness sweep must inspect both competing frames');
      assert.equal(packet.interactionDiagnostics?.click.outcome,'completed');
      assert.equal(('acceptanceRegistration' in packet ? packet.acceptanceRegistration : packet.refusalRegistration).status,'confirmed');
    } finally {await browser.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
  });
}

