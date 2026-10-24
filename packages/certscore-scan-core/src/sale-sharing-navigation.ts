import type {Page} from "playwright";

/** Replaces the original DOMContentLoaded wait, under the same absolute deadline.
 * An already parsed document with a callable API and a reviewed recipe need not wait
 * for unrelated deferred scripts. Otherwise retain the original readiness gate.
 * No polling, navigation recovery, additional visit or semantic API call. */
export async function waitForSaleSharingDocument(
  page:Page, recipes:readonly {entranceSelector:string;dialogSelector:string}[], timeoutMs:number,
):Promise<"parsed_recipe"|"domcontentloaded"> {
  const input={recipes:[...recipes],timeoutMs:Math.max(1,Math.floor(timeoutMs))};
  return page.evaluate(`(() => {const __name=fn=>fn;return (${waitForSaleSharingDocumentInPage.toString()})(${JSON.stringify(input)});})()`);
}

function waitForSaleSharingDocumentInPage({recipes,timeoutMs}:{recipes:{entranceSelector:string;dialogSelector:string}[];timeoutMs:number}) {
  return new Promise<"parsed_recipe"|"domcontentloaded">((resolve,reject)=>{
    let checkedParsed=false;
    const cleanup=()=>{clearTimeout(timer);document.removeEventListener("readystatechange",parsed);document.removeEventListener("DOMContentLoaded",loaded);};
    const finish=(state:"parsed_recipe"|"domcontentloaded")=>{cleanup();resolve(state);};
    const loaded=()=>finish("domcontentloaded");
    const parsed=()=>{
      if(document.readyState==="complete"){loaded();return;}
      if(document.readyState!=="interactive" || checkedParsed)return;
      checkedParsed=true;
      // This is readiness only. Unique, visible, safe controls and semantic
      // transition are independently verified immediately before any action.
      if(typeof (window as unknown as {__gpp?:unknown}).__gpp==="function" &&
        recipes.filter(recipe=>document.querySelector(recipe.entranceSelector)||document.querySelector(recipe.dialogSelector)).length===1)
        finish("parsed_recipe");
    };
    const timer=setTimeout(()=>{cleanup();reject(new Error("navigation_readiness_deadline"));},timeoutMs);
    document.addEventListener("readystatechange",parsed);
    document.addEventListener("DOMContentLoaded",loaded,{once:true});
    // DOMContentLoaded may already have fired while async subresources remain.
    const navigation=performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming|undefined;
    if(navigation && navigation.domContentLoadedEventStart>0)loaded();else parsed();
  });
}
