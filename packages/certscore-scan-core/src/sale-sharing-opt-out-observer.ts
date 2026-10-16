import { chromium, type Browser, type BrowserContext, type Locator, type Page } from "playwright";
import { classifyConsentControlLabel, saleSharingOptOutDispatchSchema, saleSharingOptOutEvidenceSchema, SALE_SHARING_OPT_OUT_POLICY, SALE_SHARING_OPT_OUT_CAPTURE_BUDGET_MS, type SaleSharingOptOutDispatch, type SaleSharingOptOutEvidence } from "@certscore/contracts";
import { KNOWN_CMP_REGISTRY } from "@website-signal-risk-scanner/shared";
import { resolveCanonicalVendor } from "@certscore/vendor-resolver";
import { chromiumContextOptions, chromiumLaunchOptions } from "./playwright-runtime.js";
import { installPublicNetworkGuardRoute } from "./public-network-guard.js";
import { installWebBotAuthRoute } from "./web-bot-auth-routing.js";
import { dispatchLocatorClickWithVerifiedGeometry } from "./cmp-control-actionability.js";
import { parseGpcGppPing } from "./gpc-gpp-parser.js";

/** Explicit visitor choice only. No GPC injection, cookie Reject, arbitrary form,
 * preference toggles, generic Save, personal data, retry or persistent state. */
export async function runSaleSharingOptOutObserver(input: {
  config: SaleSharingOptOutDispatch; parentDispatchSha256: string; signal?: AbortSignal; browser?: Browser;
}): Promise<SaleSharingOptOutEvidence> {
  const config=saleSharingOptOutDispatchSchema.parse(input.config), started=Date.now(), deadline=started+SALE_SHARING_OPT_OUT_CAPTURE_BUDGET_MS;
  const packet:SaleSharingOptOutEvidence={contractVersion:"certscore.sale-sharing-opt-out-evidence.v1",policyVersion:SALE_SHARING_OPT_OUT_POLICY,
    scanId:config.scanId,parentDispatchSha256:input.parentDispatchSha256,targetUrl:config.exactTargetUrl,documentToken:null,
    startedAt:new Date(started).toISOString(),completedAt:new Date(started).toISOString(),status:"unsupported",recipeVersion:null,provider:null,
    actionCount:0,submitted:false,registration:"not_attempted",confirmedAt:null,before:null,after:null,
    observationWindowMs:0,captureComplete:false,truncated:false,requests:[],limitations:[]};
  let browser=input.browser, context:BrowserContext|undefined, expired=false, changed=false;
  const cancel=()=>{expired=true;void context?.close().catch(()=>undefined);if(!input.browser)void browser?.close().catch(()=>undefined);};
  const timer=setTimeout(cancel,SALE_SHARING_OPT_OUT_CAPTURE_BUDGET_MS);
  input.signal?.addEventListener("abort",cancel,{once:true});
  const remaining=()=>{if(expired||input.signal?.aborted||Date.now()>=deadline)throw new Error("observation_budget_or_cancellation");return Math.max(1,deadline-Date.now());};
  try {
    remaining();
    browser??=await chromium.launch({...chromiumLaunchOptions({headless:true}),timeout:remaining()});
    remaining(); context=await browser.newContext(chromiumContextOptions());remaining();
    await installWebBotAuthRoute(context);await installPublicNetworkGuardRoute(context);
    const page=await context.newPage();page.setDefaultTimeout(remaining());
    await context.route("**/*",async route=>{
      if(route.request().isNavigationRequest() && (route.request().frame()!==page.mainFrame() || route.request().url()!==config.exactTargetUrl)) await route.abort();
      else await route.fallback();
    });
    context.on("page",newPage=>{if(newPage!==page)void newPage.close();});
    const response=await page.goto(config.exactTargetUrl,{waitUntil:"domcontentloaded",timeout:remaining()});
    if(!response || response.status()>=400 || page.url()!==config.exactTargetUrl)throw new Error("document_access_or_target_mismatch");
    const cdp=await context.newCDPSession(page);await cdp.send("Page.enable");
    packet.documentToken=(await cdp.send("Page.getFrameTree")).frameTree.frame.loaderId;
    cdp.on("Page.frameNavigated",({frame})=>{if(!frame.parentId && frame.loaderId!==packet.documentToken)changed=true;});
    const bound=async()=>{remaining();if(changed||page.url()!==config.exactTargetUrl || (await cdp.send("Page.getFrameTree")).frameTree.frame.loaderId!==packet.documentToken)throw new Error("document_changed");};
    const readDecision=async()=>{await bound();const value=await readSaleSharingDecision(page);await bound();return value;};
    const matches=[];
    for(const definition of KNOWN_CMP_REGISTRY.filter(row=>row.saleSharingOptOut)){
      const recipe=definition.saleSharingOptOut!;
      if(await page.locator(recipe.entranceSelector).count()===1 || await page.locator(recipe.dialogSelector).count()===1)matches.push({definition,recipe});
    }
    if(matches.length!==1){packet.limitations.push("no_unique_registered_recipe");return finish();}
    const {definition,recipe}=matches[0]!;packet.provider=definition.canonicalName;packet.recipeVersion=recipe.version;
    const safeControl=async(control:Locator,submit:boolean)=>{
      if(await control.count()!==1 || !await control.isVisible() || !await control.isEnabled({timeout:remaining()}))return false;
      const label=await control.evaluate(node=>{
        const el=node as HTMLElement;
        if(el.tagName!=="BUTTON" || el.closest("form") || el.hasAttribute("form") || el.getAttribute("type")==="submit")return null;
        return el.getAttribute("aria-label")||el.innerText;
      });
      if(!label)return false;
      const normalized=label.trim().toLowerCase().replace(/\s+/g," ");
      const classified=classifyConsentControlLabel({label,usage:"action",hasConsentContext:true,hasPreferenceContext:true});
      return classified.intent==="privacy_opt_out" && classified.matchStrength==="direct" && (!submit || recipe.submitLabels.includes(normalized));
    };
    const dialog=page.locator(recipe.dialogSelector);
    if(await dialog.count()!==1 || !await dialog.isVisible()){
      const entrance=page.locator(recipe.entranceSelector);
      if(!await safeControl(entrance,false)){packet.limitations.push("privacy_choice_entrance_not_actionable");return finish();}
      await bound();remaining();packet.actionCount++;
      await dispatchLocatorClickWithVerifiedGeometry(entrance,remaining(),()=>{remaining();if(changed||page.url()!==config.exactTargetUrl)throw new Error("document_changed");});await bound();
    }
    if(await dialog.count()!==1 || !await dialog.isVisible() || await dialog.locator('input:not([type="hidden"]), textarea, select, form').count()){
      packet.limitations.push("unsupported_preference_fields_or_dialog");return finish();
    }
    const submit=dialog.locator(recipe.submitSelector);
    if(!await safeControl(submit,true)){packet.limitations.push("explicit_sale_sharing_submission_unavailable");return finish();}
    packet.before=await readDecision();
    if(!packet.before || (packet.before.sale===1 && packet.before.sharing===1)){packet.limitations.push("decision_baseline_unavailable_or_already_opted_out");return finish();}
    if(remaining()<900)throw new Error("insufficient_capture_budget");
    await bound();packet.actionCount++;packet.registration="unconfirmed";
    await dispatchLocatorClickWithVerifiedGeometry(submit,remaining(),()=>{remaining();if(changed||page.url()!==config.exactTargetUrl)throw new Error("document_changed");});packet.submitted=true;await bound();
    packet.after=await readDecision();
    if(!packet.after || packet.after.sectionId!==packet.before.sectionId || packet.after.sale!==1 || packet.after.sharing!==1){packet.status="limited";packet.limitations.push("sale_sharing_registration_unconfirmed");return finish();}
    const confirmed=Date.now();packet.registration="confirmed";packet.confirmedAt=new Date(confirmed).toISOString();
    // Only request dispatches after the confirmation grace period are retained.
    // Host/vendor/purpose only: no query, path, body, cookie or personal values.
    const starts=new WeakMap<import("playwright").Request,number>();
    page.on("request",request=>{starts.set(request,Date.now()-confirmed);});
    page.on("response",response=>{
      const request=response.request();
      const elapsed=starts.get(request)??-1;
      if(changed || Date.now()>confirmed+750 || elapsed<250 || elapsed>750)return;
      try{
        const url=new URL(request.url());
        const vendor=resolveCanonicalVendor({type:"request",url:request.url(),sourceScanner:"sale-sharing-opt-out",matchSource:"network_request"}).observation;
        if(!vendor || vendor.purpose !== "advertising" || vendor.confidence < 0.9)return;
        if(packet.requests.length===32){packet.truncated=true;return;}
        packet.requests.push({hostname:url.hostname,vendor:vendor.vendor,purpose:vendor.purpose as "advertising",msAfterConfirmation:elapsed,httpStatus:response.status()});
      }catch{/* Unclassifiable traffic is not an eligible finding. */}
    });
    await page.waitForTimeout(750);await bound();
    const terminal=await readDecision();
    if(!terminal || terminal.sectionId!==packet.after.sectionId || terminal.sale!==1 || terminal.sharing!==1)throw new Error("decision_changed_during_capture");
    packet.observationWindowMs=500;packet.captureComplete=true;packet.status=packet.truncated?"limited":"complete";
    if(packet.truncated)packet.limitations.push("request_capture_truncated");
  }catch{
    packet.status="limited";packet.captureComplete=false;packet.requests=[];
    packet.limitations.push(changed?"document_changed":"observation_incomplete");
    if(changed){packet.registration=packet.submitted?"unconfirmed":"not_attempted";packet.confirmedAt=null;packet.before=null;packet.after=null;packet.documentToken=null;}
  }finally{clearTimeout(timer);input.signal?.removeEventListener("abort",cancel);await context?.close().catch(()=>undefined);if(!input.browser)await browser?.close().catch(()=>undefined);}
  return finish();
  function finish(){if(packet.status==="complete" && (expired||input.signal?.aborted||Date.now()>deadline)){packet.status="limited";packet.captureComplete=false;packet.requests=[];packet.limitations.push("observation_budget_or_cancellation");}packet.completedAt=new Date().toISOString();return saleSharingOptOutEvidenceSchema.parse(packet);}
}

async function readSaleSharingDecision(page:Page):Promise<SaleSharingOptOutEvidence["before"]>{
  const read=(parsePing: typeof parseGpcGppPing)=>{
    let accepting=true,calls=0,success=false,result:unknown=null;
    try{(window as unknown as {__gpp?:(command:string,callback:(data:unknown,ok:boolean)=>void)=>void}).__gpp?.("ping",(data,ok)=>{if(accepting){calls++;success=ok===true;result=data;}});}catch{return null;}
    accepting=false;
    if(calls!==1||!success)return null;
    return parsePing(result).state;
  };
  // Parse inside the page so raw GPP strings and unrelated fields never leave it.
  const state=await page.evaluate<ReturnType<typeof parseGpcGppPing>["state"]>(`(() => {const __name=fn=>fn;const parseGpcGppPing=${parseGpcGppPing.toString()};return (${read.toString()})(parseGpcGppPing);})()`);
  return state && [1,2].includes(state.saleOptOut)&&[1,2].includes(state.sharingOptOut)
    ? {sectionId:state.sectionId,sale:state.saleOptOut as 1|2,sharing:state.sharingOptOut as 1|2}:null;
}
