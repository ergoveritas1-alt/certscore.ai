import assert from "node:assert/strict";
import test from "node:test";
import type { Page } from "playwright";
import { waitForConsentDocumentReady,waitForConsentDocumentOrNamedControl,isRegisteredLoadingOneTrustRecipe } from "./consent-document-readiness.js";
import {buildCanonicalPostAcceptActionRecipes} from "./post-accept-cmp-recipes";
import {buildCanonicalPostRefusalActionRecipes} from "./post-refusal-cmp-recipes";
import type {ConsentActionDiscovery} from "./consent-action-discovery";

test("document readiness spends only the remaining caller deadline and never polls DOM", async () => {
  const deadline = Date.now() + 250;
  let calls = 0;
  const page = { waitForLoadState: async (state: string, options: { timeout: number }) => {
    calls++;
    assert.equal(state, "domcontentloaded");
    assert.ok(options.timeout > 0 && options.timeout <= 250);
  } } as Page;
  assert.equal(await waitForConsentDocumentReady(page, deadline), true);
  assert.equal(calls, 1);
  assert.equal(await waitForConsentDocumentReady(page, Date.now() - 1), false);
  assert.equal(calls, 1);
});

test("readiness timeout and cancellation fail closed without a fresh wait", async () => {
  const failed = { waitForLoadState: async () => { throw new Error("timeout"); } } as unknown as Page;
  assert.equal(await waitForConsentDocumentReady(failed, Date.now() + 100), false);
  const controller = new AbortController();
  let finish!: () => void;
  const pending = { waitForLoadState: () => new Promise<void>(resolve => { finish = resolve; }) } as Page;
  const result = waitForConsentDocumentReady(pending, Date.now() + 500, controller.signal);
  controller.abort();
  assert.equal(await result, false);
  finish();
});

const discovery={revision:0,waitForSignal:async()=>{}} as unknown as ConsentActionDiscovery;
for(const action of ['accept','reject'] as const)test(`loading probe ${action} accepts only the unchanged registered first-layer contract`,()=>{
  const recipe=(action==='accept'?buildCanonicalPostAcceptActionRecipes():buildCanonicalPostRefusalActionRecipes()).find(r=>r.cmpId==='OneTrust')!;
  assert.ok(isRegisteredLoadingOneTrustRecipe(recipe,action));
  for(const change of [{recipeId:'invented'},{cmpId:'other'},{controlSelector:'#arbitrary'}, {bannerSelector:'#arbitrary'},
    {controlFrameUrl:'https://other.test/'},{bannerFrameUrl:'https://other.test/'},{accessibleControl:{}},{preActionRequirement:{}},{customControlBinding:{}},
    {confirmation:{kind:'canonical_accept_transition'}},{confirmation:{...recipe.confirmation,cookieName:'other'}}]){
    assert.equal(isRegisteredLoadingOneTrustRecipe({...recipe,...change},action),false);
  }
});
for(const mode of ['deadline','cancel'] as const)test(`loading probe ${mode} never creates a late resolution or fresh deadline`,async()=>{
  const controller=new AbortController();let probeSignal:AbortSignal|undefined,release!:(value:string)=>void;
  const page={waitForLoadState:()=>new Promise(()=>{})} as unknown as Page;
  let started!:(value?:unknown)=>void;const probeStarted=new Promise(resolve=>{started=resolve;});
  const result=waitForConsentDocumentOrNamedControl({page,deadlineAtMs:Date.now()+40,signal:controller.signal,discovery,
    probe:async(_slice,signal)=>{probeSignal=signal;started();return await new Promise<string>(r=>{release=r;});}});
  if(mode==='cancel'){await probeStarted;controller.abort();}
  assert.deepEqual(await result,{documentReady:false});assert.equal(probeSignal?.aborted,true);
  release('late');
});

test("positive loading probe uses one existing document wait and preserves the verified candidate",async()=>{
  let waits=0;const page={waitForLoadState:()=>{waits++;return new Promise(()=>{});}} as unknown as Page;
  const candidate={status:'found',control:'already verified by the registered resolver'};
  const result=await waitForConsentDocumentOrNamedControl({page,deadlineAtMs:Date.now()+100,discovery,
    probe:async()=>candidate});assert.deepEqual(result,{documentReady:false,resolution:candidate});assert.equal(waits,1);
});

test("an exhausted probe preserves observed DOM readiness without granting a late candidate",async()=>{
  let release!:(value:string)=>void;
  let markReady!:()=>void;
  const page={waitForLoadState:()=>new Promise<void>(resolve=>{markReady=resolve;})} as unknown as Page;
  const result=await waitForConsentDocumentOrNamedControl({page,deadlineAtMs:Date.now()+40,discovery,
    probe:()=>{markReady();return new Promise<string>(resolve=>{release=resolve;});}});
  assert.equal(result.documentReady,true);assert.equal(result.resolution,undefined);release('late');
});

test("an already ready document does not run an additional early named-control probe",async()=>{
  let probes=0;const page={waitForLoadState:async()=>{}} as unknown as Page;
  const result=await waitForConsentDocumentOrNamedControl({page,deadlineAtMs:Date.now()+100,discovery,
    probe:async()=>{probes++;return undefined;}});
  assert.deepEqual(result,{documentReady:true});assert.equal(probes,0);
});

test("document readiness releases a stalled early probe without waiting for or reusing its result",async()=>{
  let markReady!:()=>void, release!:(value:string)=>void, started!:()=>void;
  let probeSignal:AbortSignal|undefined, waits=0;
  const probeStarted=new Promise<void>(resolve=>{started=resolve;});
  const page={waitForLoadState:()=>{waits++;return new Promise<void>(resolve=>{markReady=resolve;});}} as unknown as Page;
  const result=waitForConsentDocumentOrNamedControl({page,deadlineAtMs:Date.now()+2000,discovery,
    probe:async(_slice,signal)=>{probeSignal=signal;started();return new Promise<string>(resolve=>{release=resolve;});}});
  await probeStarted;markReady();
  let timer:ReturnType<typeof setTimeout>|undefined;
  try {
    const outcome=await Promise.race([result,new Promise<'still_waiting'>(resolve=>{timer=setTimeout(()=>resolve('still_waiting'),150);})]);
    assert.deepEqual(outcome,{documentReady:true});
    assert.equal(probeSignal?.aborted,true);
    assert.equal(waits,1);
  } finally {if(timer)clearTimeout(timer);release('late candidate');await result;}
  assert.deepEqual(await result,{documentReady:true},"a late candidate cannot replace the ready result");
});
