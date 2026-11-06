import type {Page} from 'playwright';
import {readTrustArcConsent,type TrustArcConsentRead} from './trustarc-consent-read.js';
import {dispatchLocatorClickWithVerifiedGeometry,inspectLocatorActionability,locatorActionabilitySupportsVerifiedDispatch} from './cmp-control-actionability.js';
export const REDHAT_EXACT_LABEL=/^\s*Do\s+Not\s+Sell\s+or\s+Share\s+My\s+Personal\s+Information\s*$/i;
export const REDHAT_CONTROL='.truste_box_overlay_inner[role="dialog"] div[name="trustarc_cm"].trustarc_newcm_container.truste_popframe div.pdynamicbutton button';
// Direct button only: preserve 750 ms follow-up, 50 ms terminal read, 250 ms
// reserve and 100 ms pre-dispatch margin; no panel-opening action is needed.
export const REDHAT_DIRECT_READINESS_RESERVE_MS=750+50+250+100;
/** Exact reviewed Red Hat control; the enclosing v4 worker supplies authorization. */
export async function waitForRedHatControl(page:Page,cutoff:number){
 const inPage=({cutoff}:{cutoff:number})=>new Promise<{reason:string;checks:number;probeMs:number}>(resolve=>{
  let done=false,checks=0,spent=0,pending:ReturnType<typeof setTimeout>|undefined;const roots=new Set<Node>();let observer:MutationObserver;let timer:ReturnType<typeof setTimeout>;
  const finish=(reason:string)=>{if(done)return;done=true;observer?.disconnect();clearTimeout(timer);clearTimeout(pending);document.removeEventListener('readystatechange',event);resolve({reason,checks,probeMs:Math.ceil(spent)});};
  const watch=(root:Node)=>{if(!roots.has(root)){roots.add(root);observer.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','hidden','aria-hidden']});}};
  const check=()=>{
   if(done)return;if(Date.now()>=cutoff)return finish('cutoff');if(document.readyState==='loading')return;
   if(checks>=32)return finish('check_limit');checks++;const start=performance.now();let reason:string|undefined;
   const panels=document.querySelectorAll('.truste_box_overlay_inner[role="dialog"]');
   if(panels.length>1)reason='ambiguous_dialog';
   if(panels.length===1){const hosts=panels[0]!.querySelectorAll('div[name="trustarc_cm"].trustarc_newcm_container.truste_popframe');if(hosts.length>1)reason='ambiguous_portal';
    if(hosts.length===1){const root=hosts[0]!.shadowRoot??hosts[0]!;if(root instanceof ShadowRoot)watch(root);const candidates=root.querySelectorAll('div.pdynamicbutton button');
     const controls:HTMLElement[]=[];
     if(candidates.length>32)reason='control_candidate_limit';else for(const candidate of candidates){const el=candidate as HTMLElement;const label=el.innerText;if(label.length<=120&&label.trim().toLowerCase().replace(/\s+/g,' ')==='do not sell or share my personal information')controls.push(el);}
     if(controls.length>1)reason='ambiguous_control';else if(controls.length===1){const el=controls[0]!;const style=getComputedStyle(el);if(style.display!=='none'&&style.visibility==='visible'&&style.opacity!=='0'&&el.getClientRects().length)reason='ready';}
    }
   }
   spent+=performance.now()-start;if(spent>=10)return finish('probe_budget');if(Date.now()>=cutoff)return finish('cutoff');if(reason)finish(reason);
  };
  const event=()=>{if(done||pending!==undefined)return;pending=setTimeout(()=>{pending=undefined;check();},Math.max(1,Math.ceil((cutoff-Date.now())/Math.max(1,28-checks))));};
  observer=new MutationObserver(event);watch(document);document.addEventListener('readystatechange',event);timer=setTimeout(()=>finish('cutoff'),Math.max(0,cutoff-Date.now()));check();
 });
 return page.evaluate(`(() => {const __name=fn=>fn;return (${inPage.toString()})(${JSON.stringify({cutoff})});})()`);
}
export function stableAssertedChange(before:TrustArcConsentRead,after:TrustArcConsentRead,terminal:TrustArcConsentRead){
 if(before.status!=='observed'||after.status!=='observed'||terminal.status!=='observed'||!before.decision||!after.decision||!terminal.decision)return false;
 if(after.decision.source!=='asserted'||terminal.decision.source!=='asserted'||after.decision.selectedCategoryIndices.includes(0))return false;
 return JSON.stringify(after.decision)===JSON.stringify(terminal.decision)&&JSON.stringify(before.decision)!==JSON.stringify(after.decision);
}
export async function verifyRedHatAction(page:Page,input:{deadline:number;started:number;expectedUrl:string;bound:()=>Promise<void>;assertCurrent:()=>void;signal?:AbortSignal;record:any;documentIdentity?:()=>string;prepareTerminal?:()=>Promise<void>}){
 const {record}=input;record.actions=0;record.submitted=false;record.choiceRegistered=false;record.optOutEffectiveness='not_established';
 const remaining=()=>{if(input.signal?.aborted||Date.now()>=input.deadline)throw Error('capture_deadline');return input.deadline-Date.now();};
 await input.bound();record.readiness=await waitForRedHatControl(page,input.deadline-REDHAT_DIRECT_READINESS_RESERVE_MS);await input.bound();
 record.readinessAtMs=Date.now()-input.started;if(record.readiness.reason!=='ready'){record.stop=record.readiness.reason==='cutoff'?'control_not_ready_with_action_reserve':`control_readiness_${record.readiness.reason}`;return;}
 const control=page.locator(REDHAT_CONTROL).filter({hasText:REDHAT_EXACT_LABEL});if(await control.count()!==1){record.stop='no_unique_bound_control';return;}
 const handle=await control.elementHandle({timeout:Math.min(100,remaining())});if(!handle){record.stop='control_disappeared';return;}
 try{
  const inspectProof=(el:HTMLElement|SVGElement)=>{
   if(!(el instanceof HTMLButtonElement)||el.disabled||el.closest('form')||el.hasAttribute('form')||el.type==='submit'&&el.form)return null;
   const root=el.getRootNode(),panels=document.querySelectorAll('.truste_box_overlay_inner[role="dialog"]');if(panels.length!==1)return null;
   const panel=panels[0]!,hosts=panel.querySelectorAll('div[name="trustarc_cm"].trustarc_newcm_container.truste_popframe');if(hosts.length!==1)return null;const host=hosts[0]!;
   if(root instanceof ShadowRoot?root.host!==host:root!==document||!host.contains(el))return null;
   let eu:unknown=window;for(const key of ['truste','eu']){if(!eu||(typeof eu!=='object'&&typeof eu!=='function'))return null;const d=Object.getOwnPropertyDescriptor(eu,key);eu=d&&'value'in d?d.value:undefined;}
   if(!eu||typeof eu!=='object')return null;const dialogId=Object.getOwnPropertyDescriptor(eu,'popdiv3'),portalId=Object.getOwnPropertyDescriptor(eu,'popframe');
   if(!dialogId||!('value'in dialogId)||dialogId.value!==panel.id||!portalId||!('value'in portalId)||portalId.value!==host.id||!/^pop-div3\d{1,32}$/.test(panel.id)||!/^pop-frame\d{1,32}$/.test(host.id))return null;
   let parent:Element|null=el;for(let n=0;parent&&n<32;n++){if(parent.matches('form,[hidden],[inert],[aria-hidden="true"]'))return null;if(parent===panel)break;const tree=parent.getRootNode();parent=parent.parentElement??(tree instanceof ShadowRoot?tree.host:null);}if(parent!==panel)return null;
   const visible=el.innerText;if(visible.length>120||visible.trim().toLowerCase().replace(/\s+/g,' ')!=='do not sell or share my personal information')return null;
   let name=el.getAttribute('aria-label')||visible;const ids=el.getAttribute('aria-labelledby')?.trim().split(/\s+/);
   if(ids){if(ids.length>4)return null;const texts=[];for(const id of ids){const nodes=(root as Document|ShadowRoot).querySelectorAll(`[id="${CSS.escape(id)}"]`);if(nodes.length!==1)return null;texts.push(nodes[0]!.textContent??'');}name=texts.join(' ');}
   if(name.length>120||name.trim().toLowerCase().replace(/\s+/g,' ')!==visible.trim().toLowerCase().replace(/\s+/g,' '))return null;
   return {visibleLabel:visible,accessibleLabel:name,dialogId:panel.id,portalId:host.id,openShadow:root instanceof ShadowRoot,selector:'div.pdynamicbutton button'};
  };
  const proof=await handle.evaluate(inspectProof);
  await input.bound();if(!proof){record.stop='control_binding_or_label_unverified';return;}record.control=proof;
  const actionability=await inspectLocatorActionability(control,{boundElement:handle,scope:page,deadlineAtMs:input.deadline-1100,signal:input.signal});await input.bound();record.actionability=actionability;
  if(!locatorActionabilitySupportsVerifiedDispatch(actionability)){record.stop='control_not_actionable';return;}
  const read=async(phase:string)=>{await input.bound();const atMs=Date.now()-input.started;const documentBefore=input.documentIdentity?.();let value=await readTrustArcConsent(page,input.expectedUrl,Math.min(50,remaining()));await input.bound();const documentAfter=input.documentIdentity?.();if(documentBefore!==documentAfter)value={version:'trustarc.granular-consent-read.v1',status:'document_changed',decision:null};record[phase]={atMs,value,documentTokenSha256:documentAfter};return value;};
  const before=await read('before');if(before.status!=='observed'){record.stop='baseline_state_unavailable';return;}
  if(before.decision?.source==='asserted'){record.stop='prior_explicit_choice_present';return;}
  if(before.decision?.source!=='implied'||JSON.stringify(before.decision.selectedCategoryIndices)!=='[0]'){record.stop='baseline_state_unsupported';return;}
  if(remaining()<=1100){record.stop='insufficient_action_reserve';return;}
  await input.bound();
  if(JSON.stringify(await handle.evaluate(inspectProof))!==JSON.stringify(proof)){record.stop='control_changed_before_dispatch';return;}
  await input.bound();
  await dispatchLocatorClickWithVerifiedGeometry(control,remaining()-1050,()=>{input.assertCurrent();if(remaining()<=1050||page.url()!==input.expectedUrl)throw Error('action_reserve_or_document_changed');},{boundElement:handle,scope:page,deadlineAtMs:input.deadline-1050,signal:input.signal,onDispatchCommitted:()=>{record.actions++;record.dispatchedAtMs=Date.now()-input.started;}});
  record.submitted=true;await input.bound();const after=await read('after');
  // A pending immediate read must not discard the already-reserved terminal read.
  // Only a stable initial + terminal asserted change supports the full confirmed window.
  const anchor=Date.now();if(remaining()<=1050){record.stop='insufficient_follow_up_reserve';return;}
  await new Promise(resolve=>setTimeout(resolve,750));remaining();await input.prepareTerminal?.();await input.bound();const terminal=await read('terminal');
  record.followUpMs=Date.now()-anchor;record.choiceRegistered=stableAssertedChange(before,after,terminal);
  record.terminalCategoryChangeObserved=terminal.status==='observed'&&terminal.decision?.source==='asserted'&&!terminal.decision.selectedCategoryIndices.includes(0)&&JSON.stringify(before.decision)!==JSON.stringify(terminal.decision);
  record.stop=record.choiceRegistered?'explicit_choice_registered':record.terminalCategoryChangeObserved?'terminal_category_change_only':'terminal_state_unconfirmed';
  record.confirmationScope=record.choiceRegistered?(record.after.documentTokenSha256===record.terminal.documentTokenSha256?'same_document':'asserted_category_choice_persisted_across_verified_reload'):'unconfirmed';
  record.effectiveObservationWindowMs=record.choiceRegistered&&record.after.documentTokenSha256===record.terminal.documentTokenSha256?500:0;
 }finally{void handle.dispose().catch(()=>undefined);}
}
