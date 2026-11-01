import assert from "node:assert/strict";
import test from "node:test";
import {createServer} from "node:http";
import {chromium,type Page} from "playwright";
import {runPostAcceptObserver} from "./post-accept-observer";
import {runPostRefusalObserver} from "./post-refusal-observer";

for(const action of ["accept","reject"] as const)
for(const variant of ["replacement","cancelled_read","delayed_valid"] as const) {
  test(`${action}: closed-shadow packet records only an input-boundary commit: ${variant}`,async()=>{
    const clicks:Array<{action:string;at:number}>=[];let commits=0,prepared=0,validationEnded=0,page:Page|undefined;
    const controller=new AbortController(),opposite=action==="accept"?"reject":"accept";
    const server=createServer((request,response)=>{
      if(request.url?.startsWith('/clicked/')){clicks.push({action:request.url.split('/').pop()!,at:Date.now()});response.end('ok');return;}
      response.setHeader('content-type','text/html');response.end(`<div id="host" style="display:block;width:200px;height:100px"></div><script>
        const root=document.querySelector('#host').attachShadow({mode:'closed'});
        root.innerHTML='<button style="position:fixed;left:20px;top:20px;width:150px;height:50px">${action==='accept'?'Accept all':'Reject all'}</button>';
        root.querySelector('button').onclick=()=>{localStorage.setItem('consent','${action==='accept'?'granted':'denied'}');fetch('/clicked/${action}');};
        window.replaceChoice=()=>{const old=root.querySelector('button'),n=document.createElement('button');n.style.cssText=old.style.cssText;n.textContent='${opposite==='accept'?'Accept all':'Reject all'}';n.onclick=()=>fetch('/clicked/${opposite}');old.replaceWith(n);};</script>`);
    });
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
    const browser=await chromium.launch({headless:true}),newContext=browser.newContext.bind(browser);
    browser.newContext=async options=>{
      const context=await newContext(options),newPage=context.newPage.bind(context),originalSession=context.newCDPSession.bind(context);
      context.newPage=async()=>{page=await newPage();return page;};
      context.newCDPSession=async target=>{
        const session=await originalSession(target),send=session.send.bind(session);let moved=false;
        session.send=(async(method:string,parameters?:any)=>{
          if(moved&&method==='DOM.describeNode'){
            if(variant==='cancelled_read'){queueMicrotask(()=>controller.abort());return new Promise(()=>{});}
            if(variant==='delayed_valid')await new Promise(resolve=>setTimeout(resolve,40));
            const result=await send(method as any,parameters);validationEnded=Date.now();return result;
          }
          const result=await send(method as any,parameters);
          if(method==='Input.dispatchMouseEvent'&&parameters?.type==='mouseMoved'){
            moved=true;prepared++;if(variant==='replacement')await page!.evaluate(()=>(window as any).replaceChoice());
          }
          return result;
        }) as typeof session.send;return session;
      };return context;
    };
    const started=Date.now();
    try {
      const recipe={recipeId:'closed-packet-fixture-v1',resolverMethod:'local_fixture_recipe' as const,controlSelector:'#host',bannerSelector:'#host',
        accessibleControl:{kind:'closed_shadow_accessible_control' as const,scopeSelector:'#host',intent:action},
        confirmation:{kind:'local_storage_equals' as const,key:'consent',expectedValue:action==='accept'?'granted':'denied'}};
      const input={browser,url:`http://127.0.0.1:${(server.address() as {port:number}).port}/`,scanId:`closed-packet-${action}-${variant}`,
        scanStartedAtMs:started,boundControlDispatch:true,signal:controller.signal,actionSearchTimeoutMs:1500,confirmationTimeoutMs:100,observationWindowMs:200,
        interactionAuthorization:{kind:'loopback' as const,authorizationId:'loopback_local_lab' as const},onActionDispatchCommitted:()=>{commits++;}};
      const packet=action==='accept'?await runPostAcceptObserver({...input,recipe:{...recipe,artifactVersion:'certscore.post_accept_action_recipe.v1'}})
        :await runPostRefusalObserver({...input,recipe:{...recipe,artifactVersion:'certscore.post_refusal_action_recipe.v1'}});
      const registration='acceptanceRegistration' in packet?packet.acceptanceRegistration:packet.refusalRegistration;
      assert.equal(prepared,1,'the fixture must reach actual dispatch preparation');
      if(variant==='delayed_valid'){
        assert.deepEqual(clicks.map(row=>row.action),[action]);assert.equal(commits,1);assert.equal(registration.status,'confirmed');
        assert.ok(registration.actionDispatchedAtMs!==undefined);assert.ok(registration.actionDispatchedAtMs>=validationEnded-started);
        assert.ok(clicks[0]!.at>=started+registration.actionDispatchedAtMs);
      } else {
        assert.deepEqual(clicks,[]);assert.equal(commits,0);assert.equal(registration.actionDispatchedAtMs,undefined);
        assert.equal(registration.status,variant==='cancelled_read'?'aborted':'not_attempted');
        assert.notEqual(packet.afterActionCapture?.activationStatus,'completed');
      }
    } finally {await browser.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
  });
}
