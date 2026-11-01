import assert from "node:assert/strict";
import test from "node:test";
import {createServer} from "node:http";
import {chromium} from "playwright";
import {dispatchClosedShadowAccessibleControl} from "./cmp-accessible-action";
import {createConsentActionFrameBinding} from "./consent-action-frame-binding";

test("closed-shadow dispatch must not click an opposite node replacing its resolved coordinate target", async () => {
  const browser = await chromium.launch({headless: true});
  try {
    const page = await browser.newPage({viewport: {width: 900, height: 700}});
    await page.setContent(`<test-consent></test-consent><script>
      window.choices=[];const root=document.querySelector('test-consent').attachShadow({mode:'closed'});
      root.innerHTML='<button style="position:fixed;left:20px;top:20px;width:150px;height:50px">Accept all</button>';
      root.querySelector('button').onclick=()=>window.choices.push('accept');
      window.replaceChoice=()=>{const old=root.querySelector('button'),n=document.createElement('button');
        n.style.cssText=old.style.cssText;n.textContent='Reject all';n.onclick=()=>window.choices.push('reject');old.replaceWith(n);};
    </script>`);
    const context = page.context(), originalSession = context.newCDPSession.bind(context);
    context.newCDPSession = async target => {
      const session = await originalSession(target), send = session.send.bind(session);
      session.send = (async (method: string, parameters?: any) => {
        const result = await send(method as any, parameters);
        if (method === "Input.dispatchMouseEvent" && parameters?.type === "mouseMoved") {
          await page.evaluate(() => (window as any).replaceChoice());
        }
        return result;
      }) as typeof session.send;
      return session;
    };
    await assert.rejects(dispatchClosedShadowAccessibleControl(page, {kind: "closed_shadow_accessible_control", scopeSelector: "test-consent", intent: "accept"},
      undefined, undefined, {bindClosedShadowTarget: true}), /bound_target_changed/);
    assert.deepEqual(await page.evaluate(() => (window as any).choices), []);
  } finally {await browser.close();}
});

test("closed-shadow dispatch rechecks selected-document invalidation after a late same-URL reload", async () => {
  let clicks = 0;
  const server = createServer((request,response) => {
    if (request.url === "/clicked") {clicks++;response.end("ok");return;}
    response.setHeader("content-type", "text/html");response.end(`<test-consent></test-consent><script>
      const root=document.querySelector('test-consent').attachShadow({mode:'closed'});
      root.innerHTML='<button style="position:fixed;left:20px;top:20px;width:150px;height:50px">Accept all</button>';
      root.querySelector('button').onclick=()=>fetch('/clicked');</script>`);
  });
  await new Promise<void>(resolve => server.listen(0,"127.0.0.1",resolve));
  const browser = await chromium.launch({headless:true}), binding = createConsentActionFrameBinding();
  try {
    const page = await browser.newPage({viewport:{width:900,height:700}});
    await page.goto(`http://127.0.0.1:${(server.address() as {port:number}).port}/`);binding.bind(page,page);
    const context=page.context(), originalSession=context.newCDPSession.bind(context);
    context.newCDPSession=async target=>{
      const session=await originalSession(target),send=session.send.bind(session);
      session.send=(async(method:string,parameters?:any)=>{
        const result=await send(method as any,parameters);
        if(method==="Input.dispatchMouseEvent"&&parameters?.type==="mouseMoved")await page.reload();
        return result;
      }) as typeof session.send;return session;
    };
    await assert.rejects(dispatchClosedShadowAccessibleControl(page,{kind:"closed_shadow_accessible_control",scopeSelector:"test-consent",intent:"accept"},()=>binding.assertCurrent()),/source_document/);
    assert.equal(binding.signal.aborted,true);assert.equal(clicks,0);
  } finally {binding.dispose();await browser.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test("bound closed-shadow dispatch preserves a stable button with descendants", async () => {
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage({viewport:{width:900,height:700}});
    await page.setContent(`<test-consent></test-consent><script>window.choices=[];
      const root=document.querySelector('test-consent').attachShadow({mode:'closed'});
      root.innerHTML='<button style="position:fixed;left:20px;top:20px;width:150px;height:50px"><span>Accept all</span></button>';
      root.querySelector('button').onclick=()=>window.choices.push('accept');</script>`);
    await dispatchClosedShadowAccessibleControl(page,{kind:"closed_shadow_accessible_control",scopeSelector:"test-consent",intent:"accept"},undefined,undefined,{bindClosedShadowTarget:true});
    assert.deepEqual(await page.evaluate(()=>(window as any).choices),['accept']);
  } finally {await browser.close();}
});

test("bound closed-shadow dispatch stops a pending final read on cancellation without input", async () => {
  const browser=await chromium.launch({headless:true}), controller=new AbortController();let pressed=0;
  try {
    const page=await browser.newPage({viewport:{width:900,height:700}});
    await page.setContent(`<test-consent></test-consent><script>const root=document.querySelector('test-consent').attachShadow({mode:'closed'});
      root.innerHTML='<button style="position:fixed;left:20px;top:20px;width:150px;height:50px">Accept all</button>';</script>`);
    const context=page.context(),originalSession=context.newCDPSession.bind(context);
    context.newCDPSession=async target=>{
      const session=await originalSession(target),send=session.send.bind(session);let moved=false;
      session.send=(async(method:string,parameters?:any)=>{
        if(moved && method==="DOM.describeNode") {queueMicrotask(()=>controller.abort());return new Promise(()=>{});}
        if(method==="Input.dispatchMouseEvent"&&parameters?.type==="mousePressed")pressed++;
        const result=await send(method as any,parameters);
        if(method==="Input.dispatchMouseEvent"&&parameters?.type==="mouseMoved")moved=true;
        return result;
      }) as typeof session.send;return session;
    };
    await assert.rejects(dispatchClosedShadowAccessibleControl(page,{kind:"closed_shadow_accessible_control",scopeSelector:"test-consent",intent:"accept"},
      undefined,undefined,{bindClosedShadowTarget:true,signal:controller.signal}),/aborted_or_expired/);
    assert.equal(pressed,0);
  } finally {await browser.close();}
});

test("stalled CDP detachment cannot hold the completed dispatch result", async () => {
  const browser=await chromium.launch({headless:true});let detachments=0, commits=0;
  try {
    const page=await browser.newPage({viewport:{width:900,height:700}});
    await page.setContent(`<test-consent></test-consent><script>window.choices=[];const root=document.querySelector('test-consent').attachShadow({mode:'closed'});
      root.innerHTML='<button style="position:fixed;left:20px;top:20px;width:150px;height:50px">Accept all</button>';
      root.querySelector('button').onclick=()=>window.choices.push('accept');</script>`);
    const context=page.context(), originalSession=context.newCDPSession.bind(context);
    context.newCDPSession=async target=>{const session=await originalSession(target);session.detach=async()=>{detachments++;return new Promise(()=>{});};return session;};
    let timer:NodeJS.Timeout|undefined;
    try {
      const result=await Promise.race([dispatchClosedShadowAccessibleControl(page,{kind:"closed_shadow_accessible_control",scopeSelector:"test-consent",intent:"accept"},
        undefined,undefined,{bindClosedShadowTarget:true},()=>{commits++;}).then(()=>"done"),new Promise<string>(resolve=>{timer=setTimeout(()=>resolve("waiting"),500);})]);
      assert.equal(result,"done");assert.equal(commits,1);assert.equal(detachments,2);
      assert.deepEqual(await page.evaluate(()=>(window as any).choices),['accept']);
    } finally {if(timer)clearTimeout(timer);}
  } finally {await browser.close();}
});

for (const stage of ["preparation", "final_validation"] as const) test(`a stalled CDP ${stage} expires without committing or pressing`, async () => {
  const browser=await chromium.launch({headless:true});let pressed=0,commits=0,readStarted=false;
  try {
    const page=await browser.newPage({viewport:{width:900,height:700}});
    await page.setContent(`<test-consent></test-consent><script>const root=document.querySelector('test-consent').attachShadow({mode:'closed'});
      root.innerHTML='<button style="position:fixed;left:20px;top:20px;width:150px;height:50px">Accept all</button>';</script>`);
    const context=page.context(),originalSession=context.newCDPSession.bind(context);
    context.newCDPSession=async target=>{const session=await originalSession(target),send=session.send.bind(session);let moved=false;
      session.send=(async(method:string,parameters?:any)=>{
        if((stage === "preparation" && method === "DOM.enable") || (stage === "final_validation" && moved && method === "DOM.describeNode")){
          readStarted=true;return new Promise(()=>{});
        }
        if(method==="Input.dispatchMouseEvent"&&parameters?.type==="mousePressed")pressed++;
        const result=await send(method as any,parameters);if(method==="Input.dispatchMouseEvent"&&parameters?.type==="mouseMoved")moved=true;return result;
      }) as typeof session.send;return session;};
    await assert.rejects(dispatchClosedShadowAccessibleControl(page,{kind:"closed_shadow_accessible_control",scopeSelector:"test-consent",intent:"accept"},
      undefined,undefined,{bindClosedShadowTarget:true,deadlineAtMs:Date.now()+500},()=>{commits++;}),/aborted_or_expired/);
    assert.equal(readStarted,true);assert.equal(commits,0);assert.equal(pressed,0);
  } finally {await browser.close();}
});
