import type {Page} from 'playwright';
import type {SaleSharingOptOutEvidence} from '@certscore/contracts';

type Diagnostics=NonNullable<NonNullable<SaleSharingOptOutEvidence['executionDiagnostics']>['boundControlReadiness']>;
type Recipe={entranceSelector:string;dialogSelector:string};
type Result={state:'parsed_recipe'|'domcontentloaded'|null;diagnostics:Diagnostics};

/** Readiness only, never action authority. One evaluation and bounded event-driven
 * inspections replace the opt-in lane's DCL gate. No SDK calls, polling or visits.
 * The host's existing capture timer closes the context on cancellation. */
export async function waitForExplicitOptOutControl(page:Page,recipes:readonly Recipe[],cutoffAtMs:number,captureDeadlineMs:number,targetUrl:string):Promise<Result>{
  const input={recipes:[...recipes],cutoffAtMs,captureDeadlineMs,targetUrl};
  return page.evaluate(`(() => {const __name=fn=>fn;return (${explicitOptOutReadinessInPage.toString()})(${JSON.stringify(input)});})()`);
}

function explicitOptOutReadinessInPage(input:{recipes:Recipe[];cutoffAtMs:number;captureDeadlineMs:number;targetUrl:string}):Promise<Result>{
  return new Promise(resolve=>{
    const started=Date.now();let done=false,checks=0,probeWork=0,matched:number|null=null;
    let observer:MutationObserver|undefined,timer:ReturnType<typeof setTimeout>|undefined,mutationTimer:ReturnType<typeof setTimeout>|undefined;
    // Coalesce event bursts across the available window, reserving slots for
    // lifecycle checks. This timer is armed only by a real DOM mutation.
    const mutationSpacingMs=Math.max(1,Math.ceil((input.cutoffAtMs-started)/28));
    let nextMutationAt=started+mutationSpacingMs;
    const clamp=(n:number)=>Math.min(3000,Math.max(0,Math.ceil(n)));
    const finish=(reason:Diagnostics['reason'],trigger:Diagnostics['trigger'])=>{
      if(done)return;done=true;
      observer?.disconnect();clearTimeout(timer);clearTimeout(mutationTimer);
      document.removeEventListener('readystatechange',onState);
      document.removeEventListener('DOMContentLoaded',onLoaded);
      window.removeEventListener('pagehide',onPageHide);
      resolve({state:reason==='ready'?(document.readyState==='complete'||performance.getEntriesByType('navigation').some(n=>(n as PerformanceNavigationTiming).domContentLoadedEventStart>0)?'domcontentloaded':'parsed_recipe'):null,
        diagnostics:{version:'explicit_opt_out_readiness.v1',reason,trigger,checks,probeMs:clamp(probeWork),elapsedMs:clamp(Date.now()-started),remainingCaptureMs:clamp(input.captureDeadlineMs-Date.now()),documentReadyState:document.readyState,matchedRecipes:matched}});
    };
    const inspect=(trigger:Diagnostics['trigger'])=>{
      if(done)return;
      if(location.href!==input.targetUrl){finish('document_changed',trigger);return;}
      if(Date.now()>=input.cutoffAtMs){finish('cutoff',trigger);return;}
      // Parser activity is not a reason to consume the bounded inspection slots.
      if(document.readyState==='loading')return;
      if(checks>=32){finish('check_limit',trigger);return;}
      checks++;const start=performance.now();matched=0;
      const within=()=>probeWork+performance.now()-start<10;
      const visible=(node:Element|null)=>{
        if(!node||!within())return false;
        const style=getComputedStyle(node);
        return style.display!=='none'&&style.visibility!=='hidden'&&style.visibility!=='collapse'&&style.opacity!=='0'&&node.getClientRects().length>0;
      };
      for(const recipe of input.recipes){
        if(!within())break;
        // Mirror the worker's one-time banner preference. A generic/unsafe
        // banner still receives all independent action checks after readiness.
        const banner=recipe.entranceSelector.includes('button#onetrust-pc-btn-handler')?document.querySelector('button#onetrust-pc-btn-handler'):null;
        const entrance=banner??document.querySelector(recipe.entranceSelector);
        if(visible(entrance)||within()&&visible(document.querySelector(recipe.dialogSelector)))matched=Math.min(2,matched+1);
      }
      probeWork+=performance.now()-start;
      if(probeWork>=10){matched=null;finish('probe_budget',trigger);return;}
      if(Date.now()>=input.cutoffAtMs){finish('cutoff',trigger);return;}
      if(matched>1){finish('ambiguous_recipe',trigger);return;}
      if(matched===1){finish('ready',trigger);return;}
      if(checks>=32)finish('check_limit',trigger);
    };
    const onState=()=>inspect('document_state'),onLoaded=()=>inspect('domcontentloaded'),onPageHide=()=>finish('document_changed','pagehide');
    inspect('initial');if(done)return;
    observer=new MutationObserver(()=>{
      if(done||mutationTimer!==undefined)return;
      mutationTimer=setTimeout(()=>{
        mutationTimer=undefined;nextMutationAt=Date.now()+mutationSpacingMs;inspect('mutation');
      },Math.max(0,nextMutationAt-Date.now()));
    });
    observer.observe(document,{childList:true,subtree:true,attributes:true,attributeFilter:['id','class','style','hidden','aria-hidden']});
    document.addEventListener('readystatechange',onState);
    document.addEventListener('DOMContentLoaded',onLoaded,{once:true});
    window.addEventListener('pagehide',onPageHide,{once:true});
    timer=setTimeout(()=>finish(location.href===input.targetUrl?'cutoff':'document_changed','cutoff'),Math.max(0,input.cutoffAtMs-Date.now()));
  });
}
