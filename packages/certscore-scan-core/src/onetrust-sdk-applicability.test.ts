import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import { runInNewContext } from "node:vm";
import { ONETRUST_IKEA_APPLICABILITY as pin, ONETRUST_REVIEWED_SDKS, oneTrustGroupEvidenceSchema, consentDecisionEvidenceSchema } from "@certscore/contracts";
import { chromium, type BrowserContext, type CDPSession, type Page, type Request, type Response } from "playwright";
import { createOneTrustSdkSourceCapture, installOneTrustSdkSourceCapture, readOneTrustSdkSource } from "./onetrust-sdk-source";
import { captureOneTrustBaseline } from "./onetrust-consent-state";
import { verifiedChangedOneTrustDecision } from "./consent-action-semantic-state";

function fixture(productionDigest = false, document = pin.documentUrl as string, sdk: {sdkUrl:string;sdkBytes:number;sdkSha256:string} = pin) {
  const emitter = new EventEmitter(), frame = {}, child = {};
  let url: string = document, body = Buffer.alloc(sdk.sdkBytes), calls = 0;
  let deliverBody: (() => Promise<Buffer>) | undefined;
  const data = {IsIABEnabled:false,VendorLevelOptOut:false,UseGoogleVendors:false,
    Groups:[1,2,3,4,5].map(i => ({CustomGroupId:`C000${i}`,Status:i === 1 ? "always active" : "inactive",
      Type:"COOKIE",Parent:null,GroupName:`Category ${i}`,IsIabPurpose:false,
      ShowInPopup:i !== 5,AlwaysShowCategory:i <= 2,FirstPartyCookies:i <= 2 ? [{}] : [],Hosts:[],GeneralVendorsIds:null,VendorServices:null}))};
  const after="groups=C0001:1,C0002:1&receipt=after";
  let cookie = {name:"OptanonConsent",value:"groups=C0001:1,C0002:0&receipt=before",domain:"www.ikea.com",path:"/"};
  let writes = [{storageType:"cookie",name:"OptanonConsent",value:after,observedAtEpochMs:Date.now()+5,sequence:1}];
  const scripts = [{src:sdk.sdkUrl}];
  let duringRead: (()=>void) | undefined, duringCookieRead: (()=>void) | undefined;
  const scope = Object.assign(emitter,{url:()=>url,mainFrame:()=>frame,
    evaluate:async (fn:Function,arg:unknown) => {
      if (String(fn).includes("__certscoreReadPostAcceptWrites")) return writes;
      calls++;
      const result = runInNewContext(`(${fn.toString()})(argument)`,{
        window:{OneTrust:{GetDomainData:()=>data}},document:{scripts},argument:arg});
      duringRead?.(); return result;
    }}) as unknown as Page;
  const capture = productionDigest ? installOneTrustSdkSourceCapture(scope)
    : createOneTrustSdkSourceCapture(scope,()=>sdk.sdkSha256);
  const native = Object.assign(new EventEmitter(), { send: async (command: string) => command === "Page.enable" ? {} :
    { frameTree: { frame: { id: "fixture-main", loaderId: "fixture-loader", url } } } });
  const context = {cookies:async()=>{duringCookieRead?.();return [cookie];}} as unknown as BrowserContext;
  async function receive(change:Record<string,unknown>={}) {
    const req={url:()=>sdk.sdkUrl,method:()=>"GET",resourceType:()=>"script",frame:()=>frame,redirectedFrom:()=>null,...change} as unknown as Request;
    const res={request:()=>req,status:()=>200,fromServiceWorker:()=>false,url:()=>sdk.sdkUrl,headers:()=>({}),body:()=>deliverBody?.() ?? Promise.resolve(body),...change} as unknown as Response;
    emitter.emit("request",req);emitter.emit("response",res);await new Promise(resolve=>setImmediate(resolve));
  }
  return {scope,context,data,scripts,capture,receive,after,cookie:()=>cookie,
    setCookie:(value:typeof cookie)=>{cookie=value;},setWrites:(value:typeof writes)=>{writes=value;},
    setBody:(value:Buffer)=>{body=value;},deferBody:(value:()=>Promise<Buffer>)=>{deliverBody=value;},
    navigate:(next=document)=>{url=next;emitter.emit("framenavigated",frame);},
    enableNative: async (deferPair = false) => {
      capture.bindNativeSession(native as unknown as CDPSession); await new Promise(resolve => setImmediate(resolve));
      native.emit("Page.frameNavigated", { frame: { id: "fixture-main", loaderId: "fixture-loader", url } });
      if (!deferPair) emitter.emit("framenavigated", frame);
    },
    completeNativePair: async () => {
      emitter.emit("framenavigated", frame); await new Promise(resolve => setImmediate(resolve));
    },
    sameDocumentNoop: async () => {
      native.emit("Page.navigatedWithinDocument", { frameId: "fixture-main", url, navigationType: "historyApi" });
      emitter.emit("framenavigated", frame); await new Promise(resolve => setImmediate(resolve));
    },
    duringRead:(fn:()=>void)=>{duringRead=fn;},duringCookieRead:(fn:()=>void)=>{duringCookieRead=fn;},calls:()=>calls,child};
}

test("native continuity supports only a fresh baseline and cannot retrofit earlier applicability", async () => {
  const f = fixture(); await f.enableNative(); await f.receive();
  const before = await captureOneTrustBaseline(f.context, f.scope);
  assert.equal(before?.status, "verified"); if (before?.status !== "verified") throw Error("baseline");
  assert.ok(before.applicability); const retainedBefore = JSON.stringify(before);
  await f.sameDocumentNoop();
  const after = await captureOneTrustBaseline(f.context, f.scope);
  assert.equal(after?.status, "verified"); if (after?.status !== "verified") throw Error("fresh baseline");
  assert.ok(after.applicability?.source.documentContinuity);
  assert.notEqual(after.applicability!.source, before.applicability!.source);
  assert.equal(JSON.stringify(before), retainedBefore, "a checkpoint never mutates an earlier baseline");
  const at = Date.now(); f.cookie().value = f.after;
  f.setWrites([{ storageType: "cookie", name: "OptanonConsent", value: f.after, observedAtEpochMs: at, sequence: 1 }]);
  const input = { context: f.context, scope: f.scope, cookieName: "OptanonConsent", actionAt: at };
  assert.equal(await verifiedChangedOneTrustDecision({ ...input, oneTrustBaseline: before }), undefined);
  const result = await verifiedChangedOneTrustDecision({ ...input, oneTrustBaseline: after });
  assert.equal(result?.decision, "granted");
  assert.ok(oneTrustGroupEvidenceSchema.safeParse(result?.oneTrustGroupEvidence).success);
  f.capture.dispose();
});

test("only actual reviewed SDK bytes pass the production digest", async()=>{
  const f=fixture(true);await f.receive();assert.equal(f.capture.snapshot(),undefined);f.capture.dispose();
});
for (const variant of ["wrong_url","redirect","worker","iframe","status","oversize","wrong_size","response_error"] as const) {
  test(`SDK source rejects ${variant}`,async()=>{
    const f=fixture();
    if(variant === "wrong_size")f.setBody(Buffer.alloc(3));
    await f.receive(variant === "wrong_url" ? {url:()=>pin.sdkUrl+"?other"} : variant === "redirect" ? {redirectedFrom:()=>({})}
      :variant === "worker" ? {fromServiceWorker:()=>true}:variant === "iframe" ? {frame:()=>f.child}
      :variant === "response_error" ? {status:()=>{throw Error("detached optional response");}} :variant === "status" ? {status:()=>304}:variant === "oversize" ? {headers:()=>({"content-length":"99999999"})}:{});
    assert.equal(f.capture.snapshot(),undefined);f.capture.dispose();
  });
}

test("SDK source is invalidated by duplicate loads, same-URL navigation and disposal",async()=>{
  const f=fixture();await f.receive();const source=f.capture.snapshot();assert.ok(source);
  await f.receive();assert.equal(f.capture.snapshot(),undefined);
  f.navigate();await f.receive();assert.ok(f.capture.snapshot());
  assert.notEqual(f.capture.snapshot()?.documentEpochSha256,source.documentEpochSha256);
  f.capture.dispose();assert.equal(readOneTrustSdkSource(f.scope),undefined);
  assert.equal((f.scope as unknown as EventEmitter).listenerCount("response"),0);
});
test("an unreviewed SDK load invalidates earlier source proof even if its script tag disappears",async()=>{
  const f=fixture();await f.receive();assert.ok(f.capture.snapshot());
  await f.receive({url:()=>pin.sdkUrl+"?unreviewed"});assert.equal(f.capture.snapshot(),undefined);f.capture.dispose();
});

for(const mode of ["navigation","dispose"] as const)test(`a late body cannot outlive ${mode}`,async()=>{
  const f=fixture();let resolve!:(v:Buffer)=>void;f.deferBody(()=>new Promise(r=>{resolve=r;}));await f.receive();
  if(mode === "navigation")f.navigate();else f.capture.dispose();resolve(Buffer.alloc(pin.sdkBytes));
  await new Promise(r=>setImmediate(r));assert.equal(f.capture.snapshot(),undefined);f.capture.dispose();
});

test("same-session flat COOKIE applicability confirms a complete effective receipt and retains declared inputs",async()=>{
  const f=fixture();await f.receive();const baseline=await captureOneTrustBaseline(f.context,f.scope);
  assert.equal(baseline?.status,"verified");if(baseline?.status!=="verified")throw Error("baseline");
  assert.deepEqual(baseline.groupIds,["C0001","C0002"]);assert.equal(baseline.applicability?.inputs.groups.length,5);
  const actionAt=Date.now();f.cookie().value=f.after;
  f.setWrites([{storageType:"cookie",name:"OptanonConsent",value:f.after,observedAtEpochMs:actionAt,sequence:1}]);
  const result=await verifiedChangedOneTrustDecision({context:f.context,scope:f.scope,cookieName:"OptanonConsent",
    actionAt,oneTrustBaseline:baseline});
  assert.equal(result?.decision,"granted");assert.equal(f.calls(),2,"one existing SDK read per checkpoint");
  const proof=result!.oneTrustGroupEvidence!;
  assert.equal(proof.policyVersion,"onetrust_cookie_groups.v3-sdk-applicability");assert.ok(oneTrustGroupEvidenceSchema.safeParse(proof).success);
  const evidence={policyVersion:"semantic_consent_registration.v2",decision:"granted",basis:"verified_state",
    timestampBasis:"instrumented_state_write",observedAtMs:10,observedStateSha256:result!.stateHash,oneTrustGroupEvidence:proof};
  assert.ok(consentDecisionEvidenceSchema.safeParse(evidence).success);
  assert.equal(consentDecisionEvidenceSchema.safeParse({...evidence,timestampBasis:"verified_state_observed"}).success,false);
  for(const change of [{applicability:undefined},{policyVersion:"onetrust_cookie_groups.v2"},{configuredGroupIds:["C0001"]},
    {applicability:{...proof.applicability!,configurationSha256:"f".repeat(64)}},
    {applicability:{...proof.applicability!,source:{...proof.applicability!.source,sdkSha256:"f".repeat(64)}}},
    {groups:proof.groups.map(g=>({...g,alwaysActive:!g.alwaysActive}))}]) {
    assert.equal(oneTrustGroupEvidenceSchema.safeParse({...proof,...change}).success,false);
  }
  f.capture.dispose();
});

for(const mode of ["late_source","no_write","incomplete","unknown_group","identity","changed_input","navigation","during_read","during_readback","conflicting_script","unsupported_type","hierarchy","nested_subgroups","malformed_subgroups","iab","unknown_inventory"] as const) {
  test(`effective-universe confirmation fails closed for ${mode}`,async()=>{
    const f=fixture();if(mode!=="late_source")await f.receive();
    if(mode === "conflicting_script")f.scripts.push({src:f.scripts[0]!.src+"?conflict"});
    if(mode === "unsupported_type")f.data.Groups[2]!.Type="BRANCH";
    if(mode === "hierarchy")(f.data.Groups[2] as any).Parent="C0002";
    if(mode === "nested_subgroups")(f.data.Groups[2] as any).SubGroups=[{CustomGroupId:"child"}];
    if(mode === "malformed_subgroups")(f.data.Groups[2] as any).SubGroups={};
    if(mode === "iab")f.data.IsIABEnabled=true;
    if(mode === "unknown_inventory")(f.data.Groups[2] as any).Hosts={};
    const baseline=await captureOneTrustBaseline(f.context,f.scope);assert.equal(baseline?.status,"verified");
    if(baseline?.status!=="verified")throw Error("baseline");f.cookie().value=f.after;
    const actionAt=Date.now();f.setWrites([{storageType:"cookie",name:"OptanonConsent",value:f.after,observedAtEpochMs:actionAt,sequence:1}]);
    if(mode === "late_source")await f.receive();
    if(mode === "no_write")f.setWrites([]);
    if(mode === "incomplete")f.cookie().value="groups=C0001:1&receipt=after";
    if(mode === "unknown_group")f.cookie().value="groups=C0001:1,C0002:1,C0003:1&receipt=after";
    if(mode === "identity")f.setCookie({...f.cookie(),path:"/other"});
    if(mode === "changed_input")f.data.Groups[2]!.AlwaysShowCategory=true;
    if(mode === "navigation")f.navigate();
    if(mode === "during_read")f.duringRead(()=>f.navigate());
    if(mode === "during_readback")f.duringCookieRead(()=>f.navigate());
    const result=await verifiedChangedOneTrustDecision({context:f.context,scope:f.scope,cookieName:"OptanonConsent",
      actionAt,oneTrustBaseline:baseline});
    assert.equal(result,undefined);f.capture.dispose();
  });
}

for (const action of ["accept", "reject"] as const) test(`local browser: SDK-bound ${action} reader needs no bundler globals`, async()=>{
  const browser=await chromium.launch({headless:true});
  try {
    const context=await browser.newContext();
    const groups=fixture().data.Groups;
    await context.route("**/*",async route=>{
      const url=route.request().url();
      if(url === pin.sdkUrl)await route.fulfill({contentType:"text/javascript",body:Buffer.alloc(pin.sdkBytes,32)});
      else if(url === pin.documentUrl)await route.fulfill({contentType:"text/html",body:`<!doctype html>
        <script src="${pin.sdkUrl}"></script><button>Choose</button><script>
        window.OneTrust={GetDomainData:()=>(${JSON.stringify({IsIABEnabled:false,VendorLevelOptOut:false,UseGoogleVendors:false,Groups:groups})})};
        document.cookie='OptanonConsent=groups=C0001:1,C0002:0&receipt=before;path=/';
        window.__certscoreReadPostAcceptWrites=()=>window.writes||[];
        document.querySelector('button').onclick=()=>{const value='groups=C0001:1,C0002:${action === "accept" ? 1 : 0}&receipt=after';
          document.cookie='OptanonConsent='+value+';path=/';window.writes=[{storageType:'cookie',name:'OptanonConsent',value,observedAtEpochMs:Date.now(),sequence:1}];};
        </script>`});
      else await route.abort();
    });
    const page=await context.newPage(),capture=createOneTrustSdkSourceCapture(page,()=>pin.sdkSha256);
    await page.goto(pin.documentUrl);
    // Fixture-only synchronization. Production never waits for optional source hashing.
    for(let i=0;i<100 && !capture.snapshot();i++)await new Promise(r=>setTimeout(r,5));
    assert.ok(capture.snapshot(),"fixture response was already received");
    const readErrors:string[]=[];const evaluate=page.evaluate.bind(page);
    page.evaluate=(async(...args:any[])=>{try{return await evaluate(args[0],args[1]);}catch(error){readErrors.push(String(error));throw error;}}) as Page["evaluate"];
    const baseline=await captureOneTrustBaseline(context,page);assert.equal(baseline?.status,"verified",readErrors.join("; "));
    if(baseline?.status!=="verified")throw Error("baseline");assert.ok(baseline.applicability);
    const actionAt=Date.now();await page.locator("button").click();
    const result=await verifiedChangedOneTrustDecision({context,scope:page,cookieName:"OptanonConsent",oneTrustBaseline:baseline,actionAt});
    assert.equal(result?.decision,action === "accept" ? "granted" : "denied");
    assert.ok(result?.observedAtEpochMs);capture.dispose();await context.close();
  } finally {await browser.close();}
});

test("baseline cookie reads cannot carry applicability across a document change",async()=>{
  const f=fixture();await f.receive();f.duringCookieRead(()=>f.navigate());
  const baseline=await captureOneTrustBaseline(f.context,f.scope);
  assert.equal(baseline?.status,"invalid");if(baseline?.status!=="invalid")throw Error("invalid baseline expected");
  assert.equal(baseline.diagnosticReason,"configuration_changed");f.capture.dispose();
});

for (const sdk of ONETRUST_REVIEWED_SDKS) test(`reviewed SDK effective categories bind to a new document: ${sdk.sdkUrl}`,async()=>{
  const f=fixture(false,"https://example.org/privacy/",sdk);await f.receive();
  const baseline=await captureOneTrustBaseline(f.context,f.scope);
  assert.equal(baseline?.status,"verified");if(baseline?.status!=="verified")throw Error("baseline");
  assert.equal(baseline.applicability?.policyVersion,"onetrust_effective_categories.v2");
  assert.notEqual(baseline.applicability?.source.documentSha256,pin.documentSha256);
  const at=Date.now();f.cookie().value=f.after;f.setWrites([{storageType:"cookie",name:"OptanonConsent",value:f.after,observedAtEpochMs:at,sequence:1}]);
  const result=await verifiedChangedOneTrustDecision({context:f.context,scope:f.scope,cookieName:"OptanonConsent",actionAt:at,oneTrustBaseline:baseline});
  assert.equal(result?.decision,"granted");assert.equal(result?.oneTrustGroupEvidence?.policyVersion,"onetrust_cookie_groups.v4-effective-categories");
  assert.ok(oneTrustGroupEvidenceSchema.safeParse(result?.oneTrustGroupEvidence).success);
  assert.equal(oneTrustGroupEvidenceSchema.safeParse({...result!.oneTrustGroupEvidence,policyVersion:"onetrust_cookie_groups.v3-sdk-applicability"}).success,false);
  assert.equal(f.calls(),2);f.capture.dispose();
});

test("legacy SDK preserves an unavailable unused flag as unknown; modern SDK requires it",async()=>{
  for (const sdk of [ONETRUST_REVIEWED_SDKS.find(sdk=>sdk.sdkUrl.includes("/202211.2.0/"))!, ONETRUST_REVIEWED_SDKS[0]!]) {
    const f=fixture(false,"https://example.org/privacy/",sdk);
    for (const group of f.data.Groups) delete (group as Partial<typeof group>).AlwaysShowCategory;
    await f.receive();
    const baseline=await captureOneTrustBaseline(f.context,f.scope);
    assert.equal(baseline?.status,"verified");if(baseline?.status!=="verified")throw Error("baseline");
    const legacy=sdk.sdkUrl.includes("202211.2.0");
    if (legacy) assert.ok(baseline.applicability?.inputs.groups.every(g=>g.alwaysShowCategory===null));
    else assert.equal(baseline.applicability,undefined);
    const at=Date.now();f.cookie().value=f.after;
    f.setWrites([{storageType:"cookie",name:"OptanonConsent",value:f.after,observedAtEpochMs:at,sequence:1}]);
    const result=await verifiedChangedOneTrustDecision({context:f.context,scope:f.scope,cookieName:"OptanonConsent",actionAt:at,oneTrustBaseline:baseline});
    assert.equal(result?.decision,legacy?"granted":undefined);
    f.capture.dispose();
  }
});


test("feature-flag-dependent category exclusion cannot confirm a receipt",async()=>{
  const sdk=ONETRUST_REVIEWED_SDKS.find(s=>s.sdkUrl.includes("/202505.1.0/"))!;
  const f=fixture(false,"https://example.org/privacy/",sdk);f.data.Groups[2]!.AlwaysShowCategory=true;
  await f.receive();const baseline=await captureOneTrustBaseline(f.context,f.scope);
  assert.equal(baseline?.status,"verified");if(baseline?.status!=="verified")throw Error("baseline");
  assert.equal(baseline.applicability,undefined);
  const at=Date.now();f.cookie().value=f.after;f.setWrites([{storageType:"cookie",name:"OptanonConsent",value:f.after,observedAtEpochMs:at,sequence:1}]);
  assert.equal(await verifiedChangedOneTrustDecision({context:f.context,scope:f.scope,cookieName:"OptanonConsent",actionAt:at,oneTrustBaseline:baseline}),undefined);
  f.capture.dispose();
});

for (const action of ["accept","reject"] as const) test(`new active scope preserves a visible required category while excluding a source-hidden declaration: ${action}`,async()=>{
  const sdk=ONETRUST_REVIEWED_SDKS.find(s=>s.sdkUrl.includes("/202505.1.0/"))!;
  const f=fixture(false,"https://example.org/",sdk);
  // Retained Sympatico shape: a hidden required declaration plus an active required group.
  f.data.Groups[4]!.Status="always active";f.data.Groups[4]!.FirstPartyCookies=[{}];
  await f.receive();const baseline=await captureOneTrustBaseline(f.context,f.scope);
  assert.equal(baseline?.status,"verified");if(baseline?.status!=="verified")throw Error();
  assert.equal(baseline.applicability?.policyVersion,"onetrust_effective_categories.v3-active-scope");
  const at=Date.now(),value=`groups=C0001:1,C0002:${action==="accept"?1:0}&receipt=after`;
  f.cookie().value=value;f.setWrites([{storageType:"cookie",name:"OptanonConsent",value,observedAtEpochMs:at,sequence:1}]);
  const state=await verifiedChangedOneTrustDecision({context:f.context,scope:f.scope,cookieName:"OptanonConsent",oneTrustBaseline:baseline,actionAt:at});
  assert.equal(state?.decision,action==="accept"?"granted":"denied");
  const proof=state!.oneTrustGroupEvidence!;assert.equal(proof.policyVersion,"onetrust_cookie_groups.v5-active-scope");
  assert.ok(oneTrustGroupEvidenceSchema.safeParse(proof).success);
  assert.equal(oneTrustGroupEvidenceSchema.safeParse({...proof,policyVersion:"onetrust_cookie_groups.v4-effective-categories",applicability:{...proof.applicability,policyVersion:"onetrust_effective_categories.v2"}}).success,false,"historical rules cannot acquire active-scope exclusions");
  f.data.Groups[4]!.ShowInPopup=true;
  assert.equal(await verifiedChangedOneTrustDecision({context:f.context,scope:f.scope,cookieName:"OptanonConsent",oneTrustBaseline:baseline,actionAt:at}),undefined,"scope drift cannot confirm");f.capture.dispose();
});

for(const [mode,expected] of [["missing","script_element_missing"],["duplicate","script_url_mismatch"],["different","script_url_mismatch"],["overflow","script_inventory_limit"],["optional","category_no_optional"],["iab","category_iab_unsupported"]] as const)test(`precise OneTrust rejection: ${mode}`,async()=>{
 const f=fixture();await f.receive();
 if(mode==="missing")f.scripts.splice(0);
 if(mode==="duplicate")f.scripts.push({src:f.scripts[0]!.src+"?conflict"});
 if(mode==="different")f.scripts[0]!.src+="?changed";
 if(mode==="overflow")f.scripts.push(...Array.from({length:256},()=>({src:"https://example.org/other.js"})));
 if(mode==="optional")for(const g of f.data.Groups)if(g.Status!=="always active"){g.AlwaysShowCategory=false;g.FirstPartyCookies=[];g.Hosts=[];}
 if(mode==="iab")f.data.IsIABEnabled=true;
 const baseline=await captureOneTrustBaseline(f.context,f.scope);assert.ok(baseline?.diagnosticReasons?.includes(expected));assert.equal(baseline?.status,"verified");
 if(baseline?.status==="verified")assert.equal(baseline.applicability,undefined);
 assert.equal(f.calls(),1,"diagnostics use the existing read");f.capture.dispose();
});

test("identical script elements bind one verified network source; count drift or distinct loads stay unverified",async()=>{
 const f=fixture();f.scripts.push({...f.scripts[0]!});await f.receive();
 const baseline=await captureOneTrustBaseline(f.context,f.scope);assert.equal(baseline?.status,"verified");if(baseline?.status!=="verified")throw Error();
 assert.equal(baseline.applicability?.scriptBinding?.matchingElements,2);assert.equal(baseline.applicability?.policyVersion,"onetrust_effective_categories.v3-active-scope");
 const at=Date.now();f.cookie().value=f.after;f.setWrites([{storageType:"cookie",name:"OptanonConsent",value:f.after,observedAtEpochMs:at,sequence:1}]);
 const get=()=>verifiedChangedOneTrustDecision({context:f.context,scope:f.scope,cookieName:"OptanonConsent",oneTrustBaseline:baseline,actionAt:at});
 const result=await get();assert.equal(result?.decision,"granted");assert.ok(oneTrustGroupEvidenceSchema.safeParse(result!.oneTrustGroupEvidence).success);
 f.scripts.push({...f.scripts[0]!});assert.equal(await get(),undefined,"changed element count changes source/config fingerprint");f.scripts.pop();
 await f.receive();assert.equal(await get(),undefined,"two loads remain unsupported even with equal URLs");f.capture.dispose();
});
test("more than eight identical script elements exceed the binding budget",async()=>{
 const f=fixture();f.scripts.push(...Array.from({length:8},()=>({...f.scripts[0]!})));await f.receive();
 const baseline=await captureOneTrustBaseline(f.context,f.scope);assert.ok(baseline?.diagnosticReasons?.includes("script_multiple_elements"));if(baseline?.status==="verified")assert.equal(baseline.applicability,undefined);f.capture.dispose();
});


test("interleaved commit source enables a fresh canonical decision without upgrading the earlier baseline", async () => {
  const f = fixture(); await f.enableNative(true); await f.receive();
  const early = await captureOneTrustBaseline(f.context, f.scope);
  assert.equal(early?.status, "verified"); if (early?.status !== "verified") throw Error("baseline");
  assert.equal(early.applicability, undefined);
  const retained = JSON.stringify(early);
  await f.completeNativePair();
  const fresh = await captureOneTrustBaseline(f.context, f.scope);
  assert.equal(fresh?.status, "verified"); if (fresh?.status !== "verified") throw Error("baseline");
  assert.equal(fresh.applicability?.source.documentContinuity?.navigationType, "documentCommit");
  const at = Date.now(); f.cookie().value = f.after;
  f.setWrites([{ storageType: "cookie", name: "OptanonConsent", value: f.after, observedAtEpochMs: at, sequence: 1 }]);
  const input = { context: f.context, scope: f.scope, cookieName: "OptanonConsent", actionAt: at };
  assert.equal(await verifiedChangedOneTrustDecision({...input, oneTrustBaseline: early}), undefined);
  assert.equal((await verifiedChangedOneTrustDecision({...input, oneTrustBaseline: fresh}))?.decision, "granted");
  assert.equal(JSON.stringify(early), retained); f.capture.dispose();
});
