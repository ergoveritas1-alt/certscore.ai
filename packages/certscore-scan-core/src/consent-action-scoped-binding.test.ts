import assert from "node:assert/strict";
import test from "node:test";
import {createServer} from "node:http";
import {chromium, type Page} from "playwright";
import {runPostAcceptObserver} from "./post-accept-observer";
import {runPostRefusalObserver} from "./post-refusal-observer";

for (const action of ["accept", "reject"] as const)
for (const mutationKind of ["replacement", "reorder"] as const) test(`${action}: enabled binding retains the scoped-accessible native node after ${mutationKind}`, async () => {
  const choices: string[] = [], opposite = action === "accept" ? "reject" : "accept";
  const server = createServer((request,response) => {
    if (request.url?.startsWith("/clicked/")) {choices.push(request.url.split("/").pop()!);response.end("ok");return;}
    response.setHeader("content-type","text/html");response.end(`<section id="banner" role="dialog" aria-label="Cookie consent"><p>Choose optional cookies.</p>
      <button type="button" data-original>${action === "accept" ? "Accept all" : "Reject all"}</button>
      <button type="button" data-other>${opposite === "accept" ? "Accept all" : "Reject all"}</button></section><script>
      document.querySelector('[data-original]').onclick=()=>{localStorage.setItem('consent','${action === "accept" ? "granted" : "denied"}');fetch('/clicked/${action}');};
      document.querySelector('[data-other]').onclick=()=>fetch('/clicked/${opposite}');</script>`);
  });
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  const browser = await chromium.launch({headless:true});let page: Page | undefined, mutation: Promise<unknown> | undefined;
  const newContext=browser.newContext.bind(browser);
  browser.newContext=async options=>{const context=await newContext(options),newPage=context.newPage.bind(context);context.newPage=async()=>{page=await newPage();return page;};return context;};
  try {
    const recipe={recipeId:"scoped-native-binding-fixture-v1",resolverMethod:"local_fixture_recipe" as const,controlSelector:"#banner",bannerSelector:"#banner",
      accessibleControl:{kind:"scoped_accessible_control" as const,scopeSelector:"#banner",intent:action},
      confirmation:{kind:"local_storage_equals" as const,key:"consent",expectedValue:action==="accept"?"granted":"denied"}};
    const input={browser,boundControlDispatch:true,url:`http://127.0.0.1:${(server.address() as {port:number}).port}/`,scanId:`scoped-binding-${action}`,
      actionSearchTimeoutMs:1500,confirmationTimeoutMs:50,observationWindowMs:100,
      interactionAuthorization:{kind:"loopback" as const,authorizationId:"loopback_local_lab" as const},
      onLifecycleEvent:()=>{mutation=page!.evaluate(({opposite,mutationKind})=>{
        const old=document.querySelector('[data-original]')!;
        if(mutationKind==='reorder'){old.parentElement!.append(old);return;}
        const replacement=document.createElement('button');replacement.type='button';
        replacement.textContent=opposite==='accept'?'Accept all':'Reject all';replacement.onclick=()=>{void fetch('/clicked/'+opposite);};old.replaceWith(replacement);
      },{opposite,mutationKind});}};
    const packet=action==="accept"?await runPostAcceptObserver({...input,recipe:{...recipe,artifactVersion:"certscore.post_accept_action_recipe.v1"}})
      :await runPostRefusalObserver({...input,recipe:{...recipe,artifactVersion:"certscore.post_refusal_action_recipe.v1"}});
    await mutation;assert.deepEqual(choices,mutationKind === "reorder" ? [action] : []);
    const registration="acceptanceRegistration" in packet?packet.acceptanceRegistration:packet.refusalRegistration;
    assert.equal(registration.status === "confirmed", mutationKind === "reorder");
  } finally {await browser.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
