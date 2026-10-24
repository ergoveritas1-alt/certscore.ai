import type { Page } from "playwright";
import type { SaleSharingOptOutEvidence } from "@certscore/contracts";

type Timing = NonNullable<NonNullable<SaleSharingOptOutEvidence["executionDiagnostics"]>["timing"]>;
type Diagnostics = NonNullable<Timing["readiness"]>;
type Recipe = { entranceSelector: string; dialogSelector: string };
type Result = { state: "parsed_recipe" | "domcontentloaded" | null; diagnostics: Diagnostics };

/** Exact retained OneTrust sources. Observing a load never requests a script. */
const SCRIPT_URLS = [
  "https://cdn.cookielaw.org/scripttemplates/otSDKStub.js",
  "https://cdn.cookielaw.org/scripttemplates/202609.1.0/otBannerSdk.js",
];

/** Called only after original-route and final-document verification. The cutoff
 * is absolute and leaves the existing opening reserve plus its 100 ms margin.
 * Closing the observer context also destroys every listener on cancellation. */
export async function waitForSaleSharingSettingsDocument(
  page: Page, recipes: readonly Recipe[], cutoffAtMs: number, targetUrl: string,
  verifiedOriginalTargetUrl?: string,
): Promise<Result> {
  if (Date.now() >= cutoffAtMs) return {state:null,diagnostics:{reason:"cutoff",checks:0,probeMs:0,matched:null,gpp:null}};
  // The caller supplies the original dispatch only after complete route proof.
  // A direct destination visit or a different source gains no new checkpoint.
  const scriptUrls = verifiedOriginalTargetUrl === "https://gimbal.com/" && targetUrl === "https://infillion.com/"
    ? [...SCRIPT_URLS, "https://cdn.cookielaw.org/scripttemplates/202604.1.0/otBannerSdk.js"]
    : SCRIPT_URLS;
  const input = {recipes:[...recipes],cutoffAtMs,targetUrl,scriptUrls};
  return page.evaluate(`(() => {const __name=fn=>fn;return (${settingsReadinessInPage.toString()})(${JSON.stringify(input)});})()`);
}

function settingsReadinessInPage(input: {recipes:Recipe[];cutoffAtMs:number;targetUrl:string;scriptUrls:string[]}): Promise<Result> {
  return new Promise(resolve=>{
    let done=false,parsedChecked=false,loaded=false,checks=0,probeWork=0;
    let matched:number|null=null,gpp:boolean|null=null;
    const seen=new WeakSet<HTMLScriptElement>();
    const cleanup=()=>{
      clearTimeout(timer);
      document.removeEventListener("readystatechange",parsed);
      document.removeEventListener("DOMContentLoaded",onLoaded);
      document.removeEventListener("load",onScript,true);
      window.removeEventListener("pagehide",onPageHide);
    };
    const finish=(reason:Diagnostics["reason"],state:Result["state"]=null)=>{
      if(done)return;done=true;cleanup();
      resolve({state,diagnostics:{reason,checks,probeMs:Math.min(3000,Math.ceil(probeWork)),matched,gpp}});
    };
    const valid=()=>{
      if(done)return false;
      if(location.href!==input.targetUrl){finish("document_changed");return false;}
      if(Date.now()>=input.cutoffAtMs){finish("cutoff");return false;}
      return true;
    };
    const inspect=(probeStart?:number)=>{
      const withinProbe=()=>probeStart===undefined||probeWork+performance.now()-probeStart<10;
      const exhausted=()=>{matched=null;gpp=null;return false;};
      matched=0;
      for(const recipe of input.recipes){
        if(!withinProbe())return exhausted();
        let found=Boolean(document.querySelector(recipe.entranceSelector));
        if(!withinProbe())return exhausted();
        if(!found)found=Boolean(document.querySelector(recipe.dialogSelector));
        if(!withinProbe())return exhausted();
        if(found)matched=Math.min(2,matched+1);
      }
      gpp=typeof (window as unknown as {__gpp?:unknown}).__gpp==="function";
      return withinProbe()||exhausted();
    };
    const onLoaded=()=>{
      if(!valid())return;loaded=true;inspect();
      if(!valid())return;
      // Existing post-DCL Settings opening does not require GPP. Submission does.
      if(matched===1)finish("domcontentloaded","domcontentloaded");
      else if(matched===2 || checks===2)finish("incomplete");
    };
    const parsed=()=>{
      if(!valid())return;
      if(document.readyState==="complete"){if(!loaded)onLoaded();return;}
      if(document.readyState!=="interactive"||parsedChecked)return;
      parsedChecked=true;inspect();
      if(!valid())return;
      if(gpp&&matched===1)finish("parsed_recipe","parsed_recipe");
    };
    const onScript=(event:Event)=>{
      if(done||checks>=2||!event.isTrusted||!(event.target instanceof HTMLScriptElement))return;
      const script=event.target;
      if(script.getRootNode()!==document||seen.has(script)||!input.scriptUrls.includes(script.src))return;
      if(!valid())return;
      seen.add(script);checks++;
      const start=performance.now();
      // Only exact selectors and callable-API presence; no API invocation.
      const completed=inspect(start);probeWork+=performance.now()-start;
      if(!valid())return;
      // Native DOM queries cannot be preempted mid-call. Never continue or act
      // on an over-budget probe; no subsequent probe receives another 10 ms.
      if(!completed||probeWork>=10){finish("probe_budget");return;}
      if(document.readyState!=="loading"&&matched===1&&(loaded||gpp))
        finish("script_recipe",loaded?"domcontentloaded":"parsed_recipe");
      else if(checks===2){
        document.removeEventListener("load",onScript,true);
        if(loaded)finish("incomplete");
      }
    };
    const onPageHide=()=>finish("document_changed");
    const timer=setTimeout(()=>finish("cutoff"),Math.max(0,input.cutoffAtMs-Date.now()));
    document.addEventListener("readystatechange",parsed);
    document.addEventListener("DOMContentLoaded",onLoaded,{once:true});
    document.addEventListener("load",onScript,true);
    window.addEventListener("pagehide",onPageHide,{once:true});
    const navigation=performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming|undefined;
    if(navigation?.domContentLoadedEventStart)onLoaded();else parsed();
  });
}
