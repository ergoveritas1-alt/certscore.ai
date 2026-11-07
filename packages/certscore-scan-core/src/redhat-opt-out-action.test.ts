import test from 'node:test';import assert from 'node:assert/strict';import {chromium} from 'playwright';
import {verifyRedHatAction,stableAssertedChange} from './redhat-opt-out-action';
const url='https://www.redhat.com/en';
const read=(source:'implied'|'asserted',indices:number[])=>({version:'trustarc.granular-consent-read.v1' as const,status:'observed' as const,decision:{source,selectedCategoryIndices:indices}});
test('asserted state change requires a stable terminal read and does not imply purpose',()=>{
 assert.equal(stableAssertedChange(read('implied',[0]),read('asserted',[1]),read('asserted',[1])),true);
 for(const [before,after,terminal] of [[read('implied',[0]),read('implied',[1]),read('implied',[1])],[read('asserted',[1]),read('asserted',[1]),read('asserted',[1])],[read('implied',[0]),read('asserted',[1]),read('asserted',[1,3])],[read('implied',[0]),read('asserted',[0]),read('asserted',[0])]])assert.equal(stableAssertedChange(before!,after!,terminal!),false);
});
test('owned browser fixtures enforce Red Hat binding, safe action and unchanged reserves',async()=>{
 const browser=await chromium.launch({headless:true,args:['--host-resolver-rules=MAP * 127.0.0.1, EXCLUDE localhost']});
 try{for(const mode of ['prior_asserted','implied_nonzero','light','shadow','verified_loader_transition','crossed_read','siblings','shadow_siblings','wrong_accessible_label','candidate_overflow','wrong_label','form','duplicate','sdk_mismatch','recovered_late','late','slow_binding','unavailable','not_registered','delayed_registered','delayed_document','changed_document']){
  const context=await browser.newContext();await context.addInitScript('window.__name=(fn)=>fn');await context.route('**/*',route=>route.request().url()===url?route.fulfill({contentType:'text/html',body:'<html><body></body></html>'}):route.abort());const page=await context.newPage();await page.goto(url);
  await page.evaluate(mode=>{
   const state={source:mode==='prior_asserted'?'asserted':'implied',consentDecision:[mode==='implied_nonzero'?1:0]};let calls=0,clicks=0;
   (window as any).fixture={state,get calls(){return calls;},get clicks(){return clicks;}};
   (window as any).truste={eu:{popdiv3:mode==='sdk_mismatch'?'wrong':'pop-div3123',popframe:'pop-frame123'},cma:{callApi(command:string){calls++;if(mode==='unavailable')return null;return {...state,consentDecision:[...state.consentDecision]};}}};
   const add=()=>{const panel=document.createElement('div');panel.className='truste_box_overlay_inner';panel.id='pop-div3123';panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Your choices regarding the use of cookies on this site');panel.innerHTML='<div name="trustarc_cm" class="trustarc_newcm_container truste_popframe" id="pop-frame123"></div>';document.body.append(panel);const host=panel.firstElementChild!;const root=['shadow','shadow_siblings'].includes(mode)?host.attachShadow({mode:'open'}):host;root.innerHTML=`${mode==='form'?'<form>':''}<div class="pdynamicbutton"><button type="button">${mode==='wrong_label'?'Accept All':'Do Not Sell or Share My Personal Information'}</button>${mode==='duplicate'?'<button type="button">Do Not Sell or Share My Personal Information</button>':''}</div>${mode==='form'?'</form>':''}`;
    if(['siblings','shadow_siblings'].includes(mode)){const group=root.querySelector('.pdynamicbutton')!;for(const label of ['Accept All','Reject All']){const sibling=document.createElement('button');sibling.type='button';sibling.textContent=label;sibling.addEventListener('click',()=>{throw Error('wrong_lane_clicked');});group.prepend(sibling);}}
    if(mode==='wrong_accessible_label')root.querySelector('button')!.setAttribute('aria-label','Accept All');
    if(mode==='candidate_overflow')for(let i=0;i<32;i++){const sibling=document.createElement('button');sibling.textContent='Accept All';root.querySelector('.pdynamicbutton')!.append(sibling);}
    root.querySelector('button:last-child')!.addEventListener('click',()=>{clicks++;if(mode==='delayed_registered')setTimeout(()=>{state.source='asserted';state.consentDecision=[1];},200);else if(!['not_registered','delayed_document'].includes(mode)){state.source='asserted';state.consentDecision=[1];}if(mode==='changed_document')history.replaceState(null,'','/changed');if(mode==='delayed_document')setTimeout(()=>history.replaceState(null,'','/changed'),100);});};
   if(mode==='recovered_late'||mode==='slow_binding')setTimeout(add,1700);else if(mode==='late')setTimeout(add,1950);else add();
  },mode);
  const started=Date.now(),record:any={};let documentToken='document-a',identityReads=0;const assertCurrent=()=>assert.equal(page.url(),url);const bound=async()=>{if(mode==='slow_binding')await new Promise(resolve=>setTimeout(resolve,80));assertCurrent();};
  try{await verifyRedHatAction(page,{started,deadline:started+3000,expectedUrl:url,bound,assertCurrent,record,documentIdentity:()=>mode==='crossed_read'?String(++identityReads):documentToken,prepareTerminal:async()=>{if(mode==='verified_loader_transition')documentToken='document-b';}});}catch(error){record.failed=String(error);}
  const actual=await page.evaluate(()=>({clicks:(window as any).fixture.clicks,calls:(window as any).fixture.calls}));
  if(['light','shadow','verified_loader_transition','siblings','shadow_siblings','recovered_late'].includes(mode)){assert.equal(record.choiceRegistered,true,JSON.stringify({mode,record}));assert.equal(actual.clicks,1);assert.equal(actual.calls,3);assert.ok(record.followUpMs>=750);assert.ok(Date.now()-started<3000);assert.equal(record.optOutEffectiveness,'not_established');}
  else if(['not_registered','delayed_registered','delayed_document','changed_document'].includes(mode)){assert.equal(actual.clicks,1);assert.equal(record.choiceRegistered,false);}
  else{assert.equal(actual.clicks,0,mode);assert.equal(record.actions,0);assert.equal(record.choiceRegistered,false);}
  if(['not_registered','delayed_registered'].includes(mode)){assert.equal(actual.calls,3);assert.ok(record.followUpMs>=750);assert.equal(record.effectiveObservationWindowMs,0);assert.ok(Date.now()-started<3000);assert.equal(record.terminalCategoryChangeObserved,mode==='delayed_registered');assert.equal(record.stop,mode==='delayed_registered'?'terminal_category_change_only':'terminal_state_unconfirmed');}
  if(mode==='crossed_read'){assert.equal(record.stop,'baseline_state_unavailable');assert.equal(record.before.value.status,'document_changed');}
  if(mode==='verified_loader_transition'){assert.equal(record.confirmationScope,'asserted_category_choice_persisted_across_verified_reload');assert.equal(record.effectiveObservationWindowMs,0);assert.notEqual(record.after.documentTokenSha256,record.terminal.documentTokenSha256);}
  if(mode==='delayed_document'){assert.ok(record.failed);assert.equal(actual.calls,2);assert.equal(record.terminal,undefined);}
  if(mode==='candidate_overflow')assert.equal(record.stop,'control_readiness_control_candidate_limit');
  if(mode==='wrong_accessible_label')assert.equal(record.stop,'control_binding_or_label_unverified');
  if(mode==='duplicate')assert.equal(record.stop,'control_readiness_ambiguous_control');
  if(mode==='recovered_late'){assert.ok(record.readinessAtMs>1600);assert.ok(record.dispatchedAtMs<1950);}
  if(mode==='slow_binding')assert.ok(record.stop==='insufficient_action_reserve'||record.stop==='control_not_actionable'||record.failed,JSON.stringify(record));
  if(mode==='late'){assert.equal(record.stop,'control_not_ready_with_action_reserve');assert.ok(Date.now()-started<2200);assert.equal(actual.calls,0);}
  await context.close();
 }}finally{await browser.close();}
});
