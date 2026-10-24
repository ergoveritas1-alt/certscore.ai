import {createHash} from "node:crypto";
import { chromium, type Browser, type BrowserContext, type Locator } from "playwright";
import { describeCaptureFailure, classifyConsentControlLabel, saleSharingOptOutDispatchSchema, saleSharingOptOutEvidenceSchema, SALE_SHARING_REDIRECT_POLICY, SALE_SHARING_EXACT_ROUTE_POLICY, SALE_SHARING_OPT_OUT_CAPTURE_BUDGET_MS, type SaleSharingOptOutDispatch, type SaleSharingOptOutEvidence } from "@certscore/contracts";
import { KNOWN_CMP_REGISTRY } from "@website-signal-risk-scanner/shared";
import { CANONICAL_VENDOR_RESOLVER_VERSION, resolveCanonicalVendor, isCanonicalAdvertisingCollectionCandidate } from "@certscore/vendor-resolver";
import { chromiumContextOptions, chromiumLaunchOptions } from "./playwright-runtime.js";
import { installPublicNetworkGuardRoute,assertPublicNetworkUrl,publicNetworkGuardEnabled } from "./public-network-guard.js";
import { installWebBotAuthRoute } from "./web-bot-auth-routing.js";
import { dispatchLocatorClickWithVerifiedGeometry, inspectLocatorActionability, locatorActionabilitySupportsVerifiedDispatch } from "./cmp-control-actionability.js";
import { readSaleSharingDecision, SALE_SHARING_DECISION_READ_MS } from "./sale-sharing-decision-read.js";
import { waitForSaleSharingDocument } from "./sale-sharing-navigation.js";
import { installSaleSharingRedirectGuard } from "./sale-sharing-redirect.js";
import { safeSaleSharingSettingsEntrance } from "./sale-sharing-settings-entrance.js";
import { waitForSaleSharingSettingsDocument } from "./sale-sharing-settings-readiness.js";
import { createGimbalPageWithGuards, usesGimbalSetupOverlap } from "./gimbal-setup-overlap.js";

/** Explicit visitor choice only. No GPC injection, cookie Reject, arbitrary form,
 * preference toggles, generic Save, personal data, retry or persistent state. */
export async function runSaleSharingOptOutObserver(input: {
  config: SaleSharingOptOutDispatch; parentDispatchSha256: string; signal?: AbortSignal; browser?: Browser; deadlineAtMs?: number;
}): Promise<SaleSharingOptOutEvidence> {
  const config=saleSharingOptOutDispatchSchema.parse(input.config), started=Date.now();
  const captureBudgetMs=Math.max(1,Math.min(SALE_SHARING_OPT_OUT_CAPTURE_BUDGET_MS,(input.deadlineAtMs??Infinity)-started-250)),deadline=started+captureBudgetMs;
  const exactRoute=config.policyVersion===SALE_SHARING_EXACT_ROUTE_POLICY;
  const redirectedPolicy=exactRoute||config.policyVersion===SALE_SHARING_REDIRECT_POLICY;
  const packet:SaleSharingOptOutEvidence={contractVersion:exactRoute?"certscore.sale-sharing-opt-out-evidence.v3":redirectedPolicy?"certscore.sale-sharing-opt-out-evidence.v2":"certscore.sale-sharing-opt-out-evidence.v1",policyVersion:config.policyVersion,
    scanId:config.scanId,parentDispatchSha256:input.parentDispatchSha256,targetUrl:config.exactTargetUrl,documentToken:null,
    ...(redirectedPolicy?{actionTargetUrl:null,tlsValidated:false,...(exactRoute?{exactRouteAuthorization:config.exactRouteAuthorization,exactRouteProof:null}:{redirectAuthorization:config.redirectAuthorization,redirectProof:null})}:{}),
    startedAt:new Date(started).toISOString(),completedAt:new Date(started).toISOString(),status:"unsupported",recipeVersion:null,provider:null,
    actionCount:0,submitted:false,registration:"not_attempted",confirmedAt:null,before:null,after:null,
    observationWindowMs:0,captureComplete:false,truncated:false,requests:[],limitations:[],
    executionDiagnostics:{version:"sale_sharing_execution_diagnostics.v1",milestones:[],decisionReads:[],
      navigation:{version:"sale_sharing_navigation.v1",targetState:"unobserved",readiness:"unobserved",blockedNavigation:"none",failure:"none"}}};
  const navigation=packet.executionDiagnostics!.navigation!;
  const definitions=KNOWN_CMP_REGISTRY.filter(row=>row.saleSharingOptOut);
  const timing=exactRoute && definitions.some(row=>row.saleSharingOptOut?.settingsEntrances?.some(entry=>entry.originalTargetUrl===config.exactTargetUrl))
    ? {version:"sale_sharing_timing.v1" as const,captureMs:captureBudgetMs} as NonNullable<NonNullable<SaleSharingOptOutEvidence["executionDiagnostics"]>["timing"]>
    : undefined;
  if(timing)packet.executionDiagnostics!.timing=timing;
  const offset=()=>Math.min(SALE_SHARING_OPT_OUT_CAPTURE_BUDGET_MS,Math.max(0,Date.now()-started));
  const mark=(stage:NonNullable<SaleSharingOptOutEvidence["executionDiagnostics"]>["milestones"][number]["stage"])=>{
    packet.executionDiagnostics!.milestones.push({stage,elapsedMs:Math.min(SALE_SHARING_OPT_OUT_CAPTURE_BUDGET_MS,Date.now()-started)});
  };
  // Reserve the full anchored window, terminal read and cleanup within capture.
  const submissionReserveMs=750+SALE_SHARING_DECISION_READ_MS+250;
  let browser=input.browser, context:BrowserContext|undefined, expired=false, changed=false;
  let redirectGuard:Awaited<ReturnType<typeof installSaleSharingRedirectGuard>>|undefined;
  const expectedTarget=()=>redirectedPolicy?redirectGuard?.actionTarget()??config.exactTargetUrl:config.exactTargetUrl;
  const networkAbort=new AbortController();
  let stage: "browser_launch"|"context_setup"|"navigation"|"document_binding"|"recipe_inspection"|"choice_action"|"post_choice_capture" = "browser_launch";
  const cancel=()=>{expired=true;networkAbort.abort();void context?.close().catch(()=>undefined);if(!input.browser)void browser?.close().catch(()=>undefined);};
  const timer=setTimeout(cancel,captureBudgetMs);
  input.signal?.addEventListener("abort",cancel,{once:true});
  const remaining=()=>{if(expired||input.signal?.aborted||Date.now()>=deadline||(input.deadlineAtMs!==undefined&&Date.now()+250>=input.deadlineAtMs))throw new Error("observation_budget_or_cancellation");return Math.max(1,deadline-Date.now());};
  try {
    remaining();
    browser??=await chromium.launch({...chromiumLaunchOptions({headless:true}),timeout:remaining()});
    if(timing)timing.launchMs=offset();
    stage="context_setup";
    remaining(); context=await browser.newContext({...chromiumContextOptions(),...(redirectedPolicy?{ignoreHTTPSErrors:false,serviceWorkers:"block" as const}:{})});remaining();
    const page=usesGimbalSetupOverlap(config)
      ? await createGimbalPageWithGuards({context,signal:networkAbort.signal,remaining,
        installIdentityGuard:()=>installWebBotAuthRoute(context!),
        installNetworkGuard:()=>installPublicNetworkGuardRoute(context!),
      })
      : await (async()=>{
        await installWebBotAuthRoute(context!);await installPublicNetworkGuardRoute(context!);
        return context!.newPage();
      })();
    page.setDefaultTimeout(remaining());
    await context.route("**/*",async route=>{
      if(route.request().isNavigationRequest() && (route.request().frame()!==page.mainFrame() || (!redirectedPolicy&&route.request().url()!==config.exactTargetUrl))) {
        const main=route.request().frame()===page.mainFrame();
        if(main || navigation.blockedNavigation==="none")navigation.blockedNavigation=main?"main_frame":"subframe";
        if(main)changed=true;
        await route.abort();
      }
      else await route.fallback();
    });
    context.on("page",newPage=>{if(newPage!==page)void newPage.close();});
    const cdp=await context.newCDPSession(page);await cdp.send("Page.enable");
    if(redirectedPolicy)redirectGuard=await installSaleSharingRedirectGuard({cdp,config,
      mainFrameId:(await cdp.send("Page.getFrameTree")).frameTree.frame.id,remaining,onInvalidated:()=>{changed=true;},
      validatePublicUrl:async url=>{if(publicNetworkGuardEnabled())await assertPublicNetworkUrl(url,{signal:networkAbort.signal});},
    });
    let committedLoader:string|undefined,mainFrameId:string|undefined;
    cdp.on("Page.frameNavigated",({frame})=>{
      if(frame.parentId)return;
      if(frame.url!==expectedTarget() || committedLoader!==undefined)changed=true;
      committedLoader??=frame.loaderId;mainFrameId??=frame.id;
    });
    cdp.on("Page.navigatedWithinDocument",({frameId,url})=>{if(frameId===mainFrameId && url!==expectedTarget())changed=true;});
    if(timing)timing.contextMs=offset();
    stage="navigation";
    // Inspect the committed response before waiting for page scripts. HTTP errors
    // and changed targets must not consume the remainder of the action budget.
    if(timing)timing.navigationMs=offset();
    const response=await page.goto(config.exactTargetUrl,{waitUntil:"commit",timeout:remaining()});
    if(timing)timing.commitMs=offset();
    if(!response)throw new Error("document_response_missing");
    navigation.responseStatus=response.status();
    navigation.targetState=page.url()===config.exactTargetUrl?"exact":"different";
    if(response.status()>=400)throw new Error("document_http_error");
    if(page.url()!==expectedTarget()||redirectedPolicy&&!redirectGuard?.actionTarget())throw new Error("document_target_mismatch");
    if(redirectedPolicy){packet.actionTargetUrl=expectedTarget();if(exactRoute)packet.exactRouteProof=redirectGuard!.routeProof();else packet.redirectProof=redirectGuard!.proof();packet.tlsValidated=true;}
    stage="document_binding";
    const bound=async()=>{
      remaining();
      // Drain this CDP session before consulting its commit events: Playwright's
      // separate session can resolve goto(commit) before our event is delivered.
      const frame=(await cdp.send("Page.getFrameTree")).frameTree.frame;
      remaining();
      if(changed||!committedLoader||page.url()!==expectedTarget()||frame.url!==expectedTarget()||frame.loaderId!==committedLoader)throw new Error("document_changed");
    };
    await bound();
    // Settings authority is source-specific, v3-only and requires the complete
    // retained route. Direct visits to either destination gain no new actions.
    const recipes=definitions.map(row=>{
      const recipe=row.saleSharingOptOut!;
      const settings=exactRoute && packet.exactRouteProof?.hops.length
        ? recipe.settingsEntrances?.find(entry=>entry.originalTargetUrl===config.exactTargetUrl && entry.actionTargetUrl===expectedTarget())
        : undefined;
      return {...recipe,settings,entranceSelector:[recipe.entranceSelector,settings?.buttonSelector,settings?.anchorSelector].filter(Boolean).join(", ")};
    });
    stage="navigation";
    if(recipes.some(recipe=>recipe.settings)){
      const ready=await waitForSaleSharingSettingsDocument(page,recipes,deadline-submissionReserveMs-250-100,expectedTarget(),config.exactTargetUrl);
      if(timing){timing.readinessMs=offset();timing.readiness=ready.diagnostics;}
      if(!ready.state){
        await bound();
        throw new Error(ready.diagnostics.reason==="cutoff"?"settings_readiness_cutoff":"settings_readiness_incomplete");
      }
      navigation.readiness=ready.state;
    }else{
      navigation.readiness=await waitForSaleSharingDocument(page,recipes,remaining());
      if(timing)timing.readinessMs=offset();
    }
    stage="document_binding";
    await bound();packet.documentToken=committedLoader!;mark("usable_document");
    const readDecision=async(phase:"before"|"after"|"terminal")=>{
      await bound();const readStarted=Date.now();
      const value=await readSaleSharingDecision(page,Math.min(SALE_SHARING_DECISION_READ_MS,remaining()));
      packet.executionDiagnostics!.decisionReads.push({phase,status:value.status,elapsedMs:Math.min(SALE_SHARING_OPT_OUT_CAPTURE_BUDGET_MS,Date.now()-readStarted)});
      await bound();return value.state;
    };
    stage="recipe_inspection";
    // One bounded DOM read, independent of how many reviewed providers exist.
    // Discovery is top-document only; never infer actionable shadow/frame controls.
    const indexes=await page.evaluate(recipes=>recipes.flatMap((recipe,index)=>
      document.querySelectorAll(recipe.entranceSelector).length || document.querySelectorAll(recipe.dialogSelector).length ? [index] : []),
      recipes);
    await bound();
    if(indexes.length!==1){packet.limitations.push(indexes.length?"ambiguous_registered_recipe":"no_unique_registered_recipe");return finish();}
    const definition=definitions[indexes[0]!]!,recipe=recipes[indexes[0]!]!;
    packet.provider=definition.canonicalName;packet.recipeVersion=recipe.version;mark("recipe_selected");
    const safeControl=async(control:Locator,submit:boolean)=>{
      if(await control.count()!==1 || !await control.isVisible() || !await control.isEnabled({timeout:remaining()}))return false;
      const label=await control.evaluate(node=>{
        const el=node as HTMLElement;
        if(el.tagName!=="BUTTON" || el.closest("form") || el.hasAttribute("form") || el.getAttribute("type")==="submit")return null;
        // Use the browser-accessible naming precedence; missing referenced IDs
        // fail closed rather than borrowing unrelated nearby text.
        const labelledBy=el.getAttribute("aria-labelledby")?.trim();
        if(labelledBy){
          const ids=labelledBy.split(/\s+/);
          if(ids.length>4 || ids.some(id=>document.querySelectorAll(`[id="${CSS.escape(id)}"]`).length!==1))return null;
          const name=ids.map(id=>document.getElementById(id)!.textContent??"").join(" ");
          return name.length<=300?name:null;
        }
        const name=el.getAttribute("aria-label")||el.innerText;
        return name.length<=300?name:null;
      });
      if(!label)return false;
      // An accessible opt-out name cannot authorize a visibly different action.
      const visibleText=await control.innerText({timeout:remaining()});
      if(visibleText.trim()){
        const visible=classifyConsentControlLabel({label:visibleText,usage:"action",hasConsentContext:true,hasPreferenceContext:true});
        if(visible.intent!=="privacy_opt_out" || visible.matchStrength!=="direct")return false;
      }
      const normalized=label.trim().toLowerCase().replace(/\s+/g," ");
      const classified=classifyConsentControlLabel({label,usage:"action",hasConsentContext:true,hasPreferenceContext:true});
      return classified.intent==="privacy_opt_out" && classified.matchStrength==="direct" &&
        (submit ? recipe.submitLabels.includes(normalized) : !recipe.entranceLabels || recipe.entranceLabels.includes(normalized));
    };
    stage="choice_action";
    const dialog=page.locator(recipe.dialogSelector);
    if(await dialog.count()!==1 || !await dialog.isVisible()){
      let entrance=page.locator(definition.saleSharingOptOut!.entranceSelector),settingsSelected=false;
      if(timing)timing.entrance="explicit";
      if(recipe.settings){
        const primary=page.locator(recipe.settings.buttonSelector);
        const anchor=recipe.settings.anchorSelector?page.locator(recipe.settings.anchorSelector):undefined;
        // Choose once before any click. A present but unsafe/hidden/duplicate
        // native control must not cause an anchor fallback or a second attempt.
        if(await primary.count()>0){entrance=primary;settingsSelected=true;if(timing)timing.entrance="native_settings";}
        else if(anchor && await anchor.count()>0){entrance=anchor;settingsSelected=true;if(timing)timing.entrance="anchor_settings";}
      }
      if(settingsSelected)packet.recipeVersion=recipe.settings!.version;
      const entranceSafe=settingsSelected
        ? await safeSaleSharingSettingsEntrance(entrance,recipe.settings!,remaining())
        : await safeControl(entrance,false);
      if(timing)timing.entranceMs=offset();
      if(!entranceSafe){packet.limitations.push("privacy_choice_entrance_not_actionable");return finish();}
      await bound();if(remaining()<submissionReserveMs+250)throw new Error("insufficient_capture_budget");
      await dispatchLocatorClickWithVerifiedGeometry(entrance,remaining()-submissionReserveMs,()=>{
        if(remaining()<=submissionReserveMs)throw new Error("insufficient_capture_budget");
        if(changed||page.url()!==expectedTarget())throw new Error("document_changed");packet.actionCount++;
      });await bound();
    }else if(timing){timing.entrance="visible_dialog";timing.entranceMs=offset();}
    if(await dialog.count()!==1 || !await dialog.isVisible() || await dialog.locator('input:not([type="hidden"]), textarea, select, form').count()){
      packet.limitations.push("unsupported_preference_fields_or_dialog");return finish();
    }
    const submit=dialog.locator(recipe.submitSelector);
    if(!await safeControl(submit,true)){packet.limitations.push("explicit_sale_sharing_submission_unavailable");return finish();}
    const actionability=await inspectLocatorActionability(submit);await bound();
    if(!locatorActionabilitySupportsVerifiedDispatch(actionability)){packet.limitations.push("explicit_sale_sharing_submission_not_actionable");return finish();}
    mark("control_actionable");
    packet.before=await readDecision("before");
    if(!packet.before || (packet.before.sale===1 && packet.before.sharing===1)){packet.limitations.push(packet.before?"already_opted_out":"decision_baseline_unavailable");return finish();}
    if(remaining()<=submissionReserveMs+SALE_SHARING_DECISION_READ_MS)throw new Error("insufficient_capture_budget");
    await bound();
    await dispatchLocatorClickWithVerifiedGeometry(submit,remaining()-submissionReserveMs,()=>{
      if(remaining()<=submissionReserveMs)throw new Error("insufficient_capture_budget");
      if(changed||page.url()!==expectedTarget())throw new Error("document_changed");
      packet.actionCount++;packet.registration="unconfirmed";
    });packet.submitted=true;mark("submitted");await bound();
    packet.after=await readDecision("after");
    if(!packet.after || packet.after.sectionId!==packet.before.sectionId || packet.after.sale!==1 || packet.after.sharing!==1){packet.status="limited";packet.limitations.push("sale_sharing_registration_unconfirmed");return finish();}
    stage="post_choice_capture";
    const confirmed=Date.now();packet.registration="confirmed";packet.confirmedAt=new Date(confirmed).toISOString();mark("confirmed");
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
        packet.requests.push({hostname:url.hostname,vendor:vendor.vendor,purpose:vendor.purpose as "advertising",msAfterConfirmation:elapsed,httpStatus:response.status(),
          ...(response.status() < 400 && request.method() !== "OPTIONS" && url.protocol === "https:" &&
            vendor.registryAttribution?.matchKind === "endpoint" && isCanonicalAdvertisingCollectionCandidate(request.url(),request.resourceType()) ? {
              collectionEvidence:{contractVersion:"canonical_advertising_collection.v1" as const,
                endpointSha256:createHash("sha256").update(request.url()).digest("hex"),registryVersion:CANONICAL_VENDOR_RESOLVER_VERSION,
                ruleIds:vendor.registryAttribution.ruleIds.slice(0,16)}} : {})});
      }catch{/* Unclassifiable traffic is not an eligible finding. */}
    });
    await page.waitForTimeout(750);await bound();
    const terminal=await readDecision("terminal");
    if(!terminal || terminal.sectionId!==packet.after.sectionId || terminal.sale!==1 || terminal.sharing!==1)throw new Error("decision_changed_during_capture");
    packet.observationWindowMs=500;packet.captureComplete=true;mark("observation_completed");packet.status=packet.truncated?"limited":"complete";
    if(packet.truncated)packet.limitations.push("request_capture_truncated");
  }catch(error){
    if(redirectGuard?.failure())packet.limitations.push(redirectGuard.failure()!);
    if(stage==="navigation" || stage==="document_binding"){
      const message=error instanceof Error?error.message:"";
      navigation.failure=message==="document_http_error"?"http_error":message==="document_response_missing"?"response_missing":message==="document_target_mismatch"?"target_mismatch":
        input.signal?.aborted?"cancelled":expired||Date.now()>=deadline||message==="settings_readiness_cutoff"||/deadline|Timeout/.test(message)||error instanceof Error&&error.name==="TimeoutError"?"deadline":
        changed||message==="document_changed"?"document_changed":/net::|dns/i.test(message)?"network_failure":"other";
    }
    packet.executionDiagnostic=describeCaptureFailure(error,stage);
    packet.status="limited";packet.captureComplete=false;packet.requests=[];
    const budgetExpired=expired || Date.now()>=deadline || (error instanceof Error && (error.name === "TimeoutError" || error.message==="navigation_readiness_deadline"));
    const failureCode=error instanceof Error && ["insufficient_capture_budget","document_response_missing","document_http_error","document_target_mismatch","settings_readiness_cutoff","settings_readiness_incomplete"].includes(error.message)?error.message:`${stage}_failed`;
    packet.limitations.push(changed?"document_changed":input.signal?.aborted?"observation_cancelled":budgetExpired?`${stage}_budget_exhausted`:failureCode);
    if(changed){packet.registration=packet.submitted?"unconfirmed":"not_attempted";packet.confirmedAt=null;packet.before=null;packet.after=null;packet.documentToken=null;}
  }finally{clearTimeout(timer);networkAbort.abort();input.signal?.removeEventListener("abort",cancel);let cleanupTimer:ReturnType<typeof setTimeout>|undefined;
    await Promise.race([Promise.all([context?.close().catch(()=>undefined),!input.browser?browser?.close().catch(()=>undefined):undefined]),new Promise<void>(resolve=>{cleanupTimer=setTimeout(resolve,250);})]);
    if(cleanupTimer)clearTimeout(cleanupTimer);}
  return finish();
  function finish(){if(packet.status==="complete" && (expired||input.signal?.aborted||Date.now()>deadline)){packet.status="limited";packet.captureComplete=false;packet.requests=[];packet.limitations.push("observation_budget_or_cancellation");}packet.completedAt=new Date().toISOString();return saleSharingOptOutEvidenceSchema.parse(packet);}
}
