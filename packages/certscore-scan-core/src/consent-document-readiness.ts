import type { Page } from "playwright";
import { KNOWN_CMP_REGISTRY } from "@website-signal-risk-scanner/shared";
import type { ConsentActionDiscovery } from "./consent-action-discovery";
import { cmpActionRecipeEnabled } from "./cmp-action-recipe-policy";

/** This only permits inspecting the existing registered first-layer recipe.
 * It cannot grant an interaction, infer absence, or supply semantic consent. */
export function isRegisteredLoadingOneTrustRecipe(recipe: {
  recipeId:string; cmpId?:string; controlSelector:string; bannerSelector?:string;
  controlFrameUrl?:string; bannerFrameUrl?:string; accessibleControl?:unknown;
  preActionRequirement?:unknown; customControlBinding?:unknown;
  confirmation:{kind:string;cookieName?:string};
}, action:"accept"|"reject") {
  const definition=KNOWN_CMP_REGISTRY.find(entry=>entry.canonicalName==="OneTrust");
  const selectors=action==="accept"?definition?.acceptControlSelectors:definition?.rejectControlSelectors;
  const confirmation=action==="accept"?definition?.acceptConfirmation:definition?.rejectConfirmation;
  return recipe.cmpId==="OneTrust" && cmpActionRecipeEnabled({canonicalName:"OneTrust",action}) &&
    recipe.recipeId.startsWith(`canonical-cmp:OneTrust:${action}:`) &&
    Boolean(selectors?.length) && recipe.controlSelector===selectors!.join(", ") &&
    recipe.bannerSelector===definition?.domSelectors?.[0] &&
    !recipe.controlFrameUrl && !recipe.bannerFrameUrl && !recipe.accessibleControl &&
    !recipe.preActionRequirement && !recipe.customControlBinding &&
    confirmation?.kind==="tcf_purposes_or_cmp_cookie_changed" &&
    recipe.confirmation.kind===`tcf_purposes_${action==="accept"?"granted":"denied"}_or_cmp_cookie_changed` &&
    recipe.confirmation.cookieName===confirmation.cookieName;
}

/** Route positive named-control probes during the *same* document-ready wait.
 * No broad geometry, new visit, new deadline or SDK call. A timeout/partial
 * probe is never a negative inventory. Full action proof still follows. */
export async function waitForConsentDocumentOrNamedControl<T>(input:{
  page:Page; deadlineAtMs:number; signal?:AbortSignal; discovery?:ConsentActionDiscovery;
  probe:(sliceMs:number, signal:AbortSignal)=>Promise<T|undefined>;
}):Promise<{documentReady:boolean;resolution?:T}> {
  if(!input.discovery) return {documentReady:await waitForConsentDocumentReady(input.page,input.deadlineAtMs,input.signal)};
  if(input.signal?.aborted||Date.now()>=input.deadlineAtMs)return {documentReady:false};
  const stop=new AbortController();
  const abort=()=>stop.abort();input.signal?.addEventListener("abort",abort,{once:true});
  const deadlineTimer=setTimeout(abort,Math.max(0,input.deadlineAtMs-Date.now()));
  const cancelled=new Promise<undefined>(resolve=>stop.signal.addEventListener("abort",()=>resolve(undefined),{once:true}));
  if(input.signal?.aborted)stop.abort();
  let ready=false,done=false;
  const documentWait=waitForConsentDocumentReady(input.page,input.deadlineAtMs,stop.signal)
    .then(value=>{ready=value;done=true;});
  try {
    // Drain the native ready wait before considering an early probe. A page
    // already at DCL must not acquire an extra failed named-control sweep.
    await new Promise<void>(resolve=>setImmediate(resolve));
    while(!input.signal?.aborted&&Date.now()<input.deadlineAtMs) {
      if(done)return {documentReady:ready};
      const revision=input.discovery.revision;
      // DCL must release this wait even if an optional early probe's browser
      // RPC is still pending. Finally cancels that probe; its late result is
      // discarded and ordinary live control resolution still runs afterward.
      const outcome=await Promise.race([
        cancelled.then(()=>({kind:"cancelled" as const})),
        documentWait.then(()=>({kind:"document" as const})),
        input.probe(Math.min(750,Math.max(0,input.deadlineAtMs-Date.now())),stop.signal)
          .then(resolution=>({kind:"probe" as const,resolution}),()=>({kind:"probe" as const,resolution:undefined})),
      ]);
      // A delayed uniqueness sweep cannot acquire a fresh deadline here.
      if(stop.signal.aborted||input.signal?.aborted||Date.now()>=input.deadlineAtMs)return {documentReady:ready};
      if(outcome.kind==="document")return {documentReady:ready};
      if(outcome.kind==="probe"&&outcome.resolution!==undefined)return {documentReady:ready,resolution:outcome.resolution};
      if(done)return {documentReady:ready};
      await Promise.race([documentWait,input.discovery.waitForSignal(revision,
        Math.min(150,Math.max(0,input.deadlineAtMs-Date.now())),stop.signal)]);
    }
    return {documentReady:ready};
  } finally {clearTimeout(deadlineTimer);stop.abort();input.signal?.removeEventListener("abort",abort);}
}

/** Spend the caller's existing search window on page initialization before
 * running whole-document selectors/geometry. No new deadline or polling loop.
 * The caller still verifies the loaded target and live control before acting. */
export async function waitForConsentDocumentReady(page: Page, deadlineAtMs: number, signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted || Date.now() >= deadlineAtMs) return false;
  let abort: (() => void) | undefined;
  const cancelled = new Promise<false>(resolve => {
    abort = () => resolve(false);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) resolve(false);
  });
  try {
    return await Promise.race([
      page.waitForLoadState("domcontentloaded", { timeout: Math.max(1, deadlineAtMs - Date.now()) })
        .then(() => !signal?.aborted && Date.now() < deadlineAtMs, () => false),
      cancelled,
    ]);
  } finally {
    if (abort) signal?.removeEventListener("abort", abort);
  }
}
