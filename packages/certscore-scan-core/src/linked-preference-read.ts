import type { Page } from 'playwright';
import { classifyPrivacySurface } from '@certscore/contracts';
import { readPreferenceControlsInDocument } from './cmp-preference-control-read.js';

/** One positively observed, same-origin settings destination. No guessed URL,
 * choice execution, external account journey or arbitrary link fallback. */
export async function observedLinkedPreferenceTarget(page: Page) {
  const sourceUrl=page.url();
  const inventory=await page.locator('a[href]').evaluateAll(nodes=>({overflow:nodes.length>1000,links:nodes.slice(0,1000).flatMap(node=>{
    if(node.closest('form,[role="dialog"],[role="alertdialog"]'))return [];
    const rect=node.getBoundingClientRect(),style=getComputedStyle(node);
    if(rect.width<=0||rect.height<=0||style.display==='none'||style.visibility!=='visible'||Number(style.opacity)===0||node.closest('[hidden],[inert],[aria-hidden="true"]'))return [];
    return [{url:(node as HTMLAnchorElement).href,label:(node.getAttribute('aria-label')||node.textContent||'').replace(/\s+/g,' ').trim().slice(0,160)}];
  })}));
  if(inventory.overflow)return null;
  const choices=inventory.links.flatMap(link=>{
    const type=classifyPrivacySurface({linkText:link.label}).surfaceType;
    if(!['consent_preferences','your_privacy_choices','do_not_sell_or_share'].includes(type))return [];
    try{
      const source=new URL(sourceUrl),url=new URL(link.url);url.hash='';
      if(url.origin!==source.origin||url.pathname===source.pathname||url.username||url.password||url.search||
        !(url.protocol==='https:'||url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))return [];
      return [{label:link.label,url:url.href,priority:type==='consent_preferences'?0:1}];
    }catch{return [];}
  }).sort((a,b)=>a.priority-b.priority);
  const best=choices.filter(choice=>choice.priority===choices[0]?.priority);
  const unique=[...new Set(best.map(choice=>choice.url))];
  return unique.length===1 ? best.find(choice=>choice.url===unique[0])! : null;
}

/** Positive, labelled control states only. This never changes a checkbox,
 * radio, switch, form or privacy preference and cannot prove enforcement. */
export async function readLinkedPrivacyChoices(page:Page) {
  const result=await page.locator('main input[type="radio"],main input[type="checkbox"],main [role="radio"],main [role="checkbox"],main [role="switch"],[role="main"] input[type="radio"],[role="main"] input[type="checkbox"]').evaluateAll(readPreferenceControlsInDocument,undefined);
  return {overflow:result.overflow,controls:result.controls.filter(control=>control.visible&&control.label.trim()).map(control=>({
    label:control.label,kind:'unclassified' as const,enabled:control.enabled,checked:control.checked,
  }))};
}
