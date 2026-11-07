import type {Page} from 'playwright';
import {SALE_SHARING_DECISION_READ_MS} from './sale-sharing-decision-read.js';

/** Category facts only. No mapping of category indices to sale/sharing, no
 * implicit preference treated as an expressed choice, and no GPP replacement.
 * Source: https://trustarchelp.zendesk.com/hc/en-us/articles/1500002659141-CCM-Advanced-API-Integration
 * A future action recipe must verify original route, loader and action binding
 * before/after this read. This helper does not register or enable any recipe. */
export type TrustArcGranularDecision = {
  source:'asserted'|'implied';
  selectedCategoryIndices:number[];
};
export type TrustArcConsentRead = {
  version:'trustarc.granular-consent-read.v1';
  status:'observed'|'api_unavailable'|'invalid_response'|'document_changed'|'budget_exhausted'|'api_failed';
  decision:TrustArcGranularDecision|null;
};

/** Fixed-field decoder; never traverses vendors, cookies or arbitrary payloads.
 * Do not use getConsentDecision's highest-category integer as a granular list. */
export function parseTrustArcGranularDecision(raw:unknown):TrustArcGranularDecision|null {
  try {
    if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
    const own=(object:object,key:string)=>{const d=Object.getOwnPropertyDescriptor(object,key);return d&&'value'in d?d.value:undefined;};
    const source=own(raw,'source'),values=own(raw,'consentDecision');
    if(!['asserted','implied'].includes(source)||!Array.isArray(values))return null;
    const length=own(values,'length');if(!Number.isInteger(length)||length<1||length>16)return null;
    const indices:number[]=[];
    for(let i=0;i<length;i++){
      const value=own(values,String(i));
      if(!Number.isInteger(value)||value<0||value>64||indices.includes(value))return null;
      indices.push(value);
    }
    // The documented no-preference sentinel cannot coexist with a selection.
    if(indices.includes(0)&&indices.length!==1)return null;
    return {source,selectedCategoryIndices:indices.sort((a,b)=>a-b)};
  } catch {return null;}
}

/** One synchronous, same-document, read-only API call. No listener, retry,
 * polling, SDK opening, choice mutation or vendor-domain query. The caller's
 * existing absolute capture cancellation is still required for a hung SDK. */
export function readTrustArcConsentInPage(parse:typeof parseTrustArcGranularDecision,expectedUrl:string,budgetMs:number):TrustArcConsentRead {
  const result=(status:TrustArcConsentRead['status'],decision:TrustArcGranularDecision|null=null):TrustArcConsentRead=>({version:'trustarc.granular-consent-read.v1',status,decision});
  const start=performance.now();
  if(!Number.isFinite(budgetMs)||budgetMs<=0||budgetMs>50)return result('budget_exhausted');
  if(window.top!==window||location.href!==expectedUrl||location.protocol!=='https:')return result('document_changed');
  try {
    const own=(object:unknown,key:string)=>{
      if(!object||(typeof object!=='object'&&typeof object!=='function'))return undefined;
      const d=Object.getOwnPropertyDescriptor(object,key);return d&&'value'in d?d.value:undefined;
    };
    const cma=own(own(window,'truste'),'cma'),call=own(cma,'callApi');
    if(typeof call!=='function')return result('api_unavailable');
    if(performance.now()-start>=budgetMs)return result('budget_exhausted');
    const decision=parse(call.call(cma,'getGDPRConsentDecision',location.hostname));
    if(location.href!==expectedUrl)return result('document_changed');
    if(performance.now()-start>=budgetMs)return result('budget_exhausted');
    return decision?result('observed',decision):result('invalid_response');
  } catch {return result('api_failed');}
}

/** Not wired into production lanes until an evidence-backed recipe exists.
 * No raw API payload leaves the page. Loader/session binding belongs to the
 * action worker; this read alone never establishes registration or honoring. */
export async function readTrustArcConsent(page:Page,expectedUrl:string,remainingReadBudgetMs:number):Promise<TrustArcConsentRead> {
  const budget=Math.min(SALE_SHARING_DECISION_READ_MS,Math.floor(remainingReadBudgetMs));
  if(!Number.isFinite(budget)||budget<=0)return {version:'trustarc.granular-consent-read.v1',status:'budget_exhausted',decision:null};
  return page.evaluate(`(() => {const __name=fn=>fn;return (${readTrustArcConsentInPage.toString()})(${parseTrustArcGranularDecision.toString()},${JSON.stringify(expectedUrl)},${budget});})()`);
}
