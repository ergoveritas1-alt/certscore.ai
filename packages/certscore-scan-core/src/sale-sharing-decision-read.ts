import type { Page } from "playwright";
import { parseGpcGppPing } from "./gpc-gpp-parser.js";

// One callback read, no retry/polling. This slice is inside the original capture
// deadline and is never borrowed from the anchored post-confirmation window.
export const SALE_SHARING_DECISION_READ_MS = 50;

/** Serialized into the page with the canonical parser. Raw GPP never leaves it. */
export function readSaleSharingDecisionInPage(parsePing: typeof parseGpcGppPing, timeoutMs: number) {
  type State = {sectionId:7|8;sale:1|2;sharing:1|2};
  type Result = {status:"observed"|"unavailable"|"timeout"|"invalid"|"duplicate"|"failed";state:State|null};
  return new Promise<Result>(resolve=>{
    let done=false, calls=0;
    const finish=(result:Result)=>{if(done)return;done=true;clearTimeout(timer);resolve(result);};
    const timer=setTimeout(()=>finish({status:"timeout",state:null}),timeoutMs);
    try {
      const api=(window as unknown as {__gpp?:(command:string,callback:(data:unknown,ok:boolean)=>void)=>void}).__gpp;
      if(typeof api!=="function"){finish({status:"unavailable",state:null});return;}
      api.call(window,"ping",(data,ok)=>{
        if(done)return;
        calls++;
        let state:ReturnType<typeof parseGpcGppPing>["state"]=null;
        try { if(ok===true)state=parsePing(data).state; } catch {/* Malformed provider data stays unknown. */}
        const decision:State|null=state && [1,2].includes(state.saleOptOut) && [1,2].includes(state.sharingOptOut)
          ? {sectionId:state.sectionId,sale:state.saleOptOut as 1|2,sharing:state.sharingOptOut as 1|2}:null;
        // Detect duplicate synchronous callbacks without adding a settle delay.
        queueMicrotask(()=>finish(calls!==1?{status:"duplicate",state:null}:{status:decision?"observed":"invalid",state:decision}));
      });
    } catch { finish({status:"failed",state:null}); }
  });
}

export async function readSaleSharingDecision(page:Page, timeoutMs:number) {
  const bounded=Math.max(1,Math.min(SALE_SHARING_DECISION_READ_MS,Math.floor(timeoutMs)));
  return page.evaluate<Awaited<ReturnType<typeof readSaleSharingDecisionInPage>>>(
    `(() => {const __name=fn=>fn;const parseGpcGppPing=${parseGpcGppPing.toString()};return (${readSaleSharingDecisionInPage.toString()})(parseGpcGppPing,${bounded});})()`);
}
