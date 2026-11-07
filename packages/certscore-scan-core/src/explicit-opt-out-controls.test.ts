import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
import {runSaleSharingOptOutObserver} from './sale-sharing-opt-out-observer';
import {bindAccessibilityNodesToDom} from './consent-accessibility-dom-binding';
import {captureConsentControlGeometry} from './consent-control-geometry';
import {filterAccessibilityTreeToFirstLayer,consentControlsFromAccessibilityTree,consentUiControlActionTypeFromClassification,buildConsentUiObservationFromEvidence,consentUiObservationFromConfirmedGeometryControls} from './scanners/pre-consent-runtime-scanner';
import {conditionalOptOutCandidate} from '../../../apps/v2-dag-lambda/src/conditional-opt-out';
import {conditionalConsentFixture} from '../../../apps/v2-dag-lambda/src/test-fixtures/conditional-opt-out';
import {canonicalEvidenceBundleSchema, classifyConsentControlLabel} from '@certscore/contracts';

test('bounded observer supports reviewed native/anchor entrances and preserves legacy actions', {timeout:45000},async()=>{
 let mode='button',clicks=0;
 const server=createServer((req,res)=>{
  if(req.url==='/submitted'){clicks++;res.end();return;}
  const banner=mode.startsWith('banner');
  const tag=mode.startsWith('button')||banner?'button':'a';
  const id=banner?'onetrust-pc-btn-handler':'ot-sdk-btn';
  const href=mode==='external'?'https://example.com/':mode==='script'?'javascript:void(0)':mode==='fragment'?'#privacy':'#';
  const suffix=mode==='button-suffix'?', Opens the preference center dialog':'';
  const attrs=mode==='target'?'target="_blank"':mode==='download'?'download':mode==='form-attribute'?'form="elsewhere"':'';
  const visible=mode==='conflicting-name'?'Accept all':mode==='banner-generic'?'Cookie Settings':'Your Privacy Choices';
  const entrance=`<${tag} class="${banner?'cookie-setting-link':'ot-sdk-show-settings'}" id="${id}" ${tag==='a'?`href="${href}"`:''} ${attrs} aria-label="${mode==='banner-generic'?'Cookie Settings':'Your Privacy Choices'}${suffix}">${visible}</${tag}>`;
  res.setHeader('content-type','text/html');res.end(`<!doctype html><body>${mode==='form'?'<form>':''}${banner&&mode!=='banner-outside'?'<div id="onetrust-banner-sdk">':''}${entrance}${mode==='banner-duplicate'?entrance:''}${banner&&mode!=='banner-outside'?'</div>':''}${mode==='banner-footer'||mode==='banner-generic'?'<button class="ot-sdk-show-settings">Your Privacy Choices</button>':''}${mode==='duplicate'?entrance.replace('id="ot-sdk-btn"','id="other"'):''}${mode==='form'?'</form>':''}
   <div id="onetrust-pc-sdk" hidden><button type="button" class="save-preference-btn-handler onetrust-close-btn-handler">Do Not Sell My Personal Information</button></div>
   <script>let state=2;window.__gpp=(command,cb)=>cb({gppVersion:'1.1',cmpStatus:'loaded',signalStatus:'ready',applicableSections:[8],sectionList:[8],parsedSections:{usca:{Version:1,SaleOptOutNotice:1,SharingOptOutNotice:1,SaleOptOut:state,SharingOptOut:state}}},true);
   document.getElementById('${id}').onclick=e=>{${mode==='unprevented'?'':'e.preventDefault();'}document.getElementById('onetrust-pc-sdk').hidden=false;};
   document.querySelector('.save-preference-btn-handler').onclick=()=>{state=1;fetch('/submitted');};</script>`);
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.ok(address&&typeof address!=='string');
 const url=`http://127.0.0.1:${address.port}/`,browser=await chromium.launch({headless:true});
 try{
  for(const scenario of ['button','button-suffix','anchor','external','script','fragment','target','download','form','form-attribute','conflicting-name','duplicate','unprevented','legacy-anchor','banner','banner-footer','banner-generic','banner-outside','banner-duplicate','banner-legacy']){
   mode=scenario;clicks=0;
   const packet=await runSaleSharingOptOutObserver({browser,parentDispatchSha256:'a'.repeat(64),deadlineAtMs:Date.now()+5000,
    config:{enabled:true,policyVersion:'bounded_sale_sharing_opt_out.v1',scanId:scenario,exactTargetUrl:url,...(['legacy-anchor','banner-legacy'].includes(scenario)?{}:{controlPolicy:'explicit_opt_out_controls.v1' as const})}});
   if(['button','button-suffix','anchor','banner','banner-footer'].includes(scenario)){
    assert.equal(packet.registration,'confirmed',JSON.stringify(packet));assert.equal(packet.status,'complete');assert.equal(packet.actionCount,2);assert.equal(clicks,1);
    assert.equal(packet.entranceControl?.visibleText,'Your Privacy Choices');assert.equal(packet.entranceControl?.tagName,scenario==='anchor'?'a':'button');
    assert.ok(Date.parse(packet.completedAt)-Date.parse(packet.startedAt)<=3000);assert.equal(packet.observationWindowMs,500);
   }else{assert.equal(packet.submitted,false,`${scenario}: ${JSON.stringify(packet)}`);assert.equal(clicks,0);assert.notEqual(packet.registration,'confirmed');}
  }
 }finally{await browser.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test('real AX source binds the extended name to the native opt-out locator within existing reads',async()=>{
 const url='https://fixture.certscore.ai/',browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage();await page.route(url,route=>route.fulfill({contentType:'text/html',body:'<section role="dialog" aria-label="We use cookies"><button id="onetrust-pc-btn-handler" aria-label="Your Privacy Choices, Opens the preference center dialog">Your Privacy Choices</button><button>Accept all</button></section>'}));
  await page.goto(url);const cdp=await page.context().newCDPSession(page);await cdp.send('Page.enable');
  const frame=(await cdp.send('Page.getFrameTree')).frameTree.frame;
  const document={url,identity:{source:'cdp_loader_id' as const,token:frame.loaderId}};
  const tree=await cdp.send('Accessibility.getFullAXTree');const visible=await filterAccessibilityTreeToFirstLayer(cdp,tree.nodes,page.viewportSize());
  const nodes=await bindAccessibilityNodesToDom(cdp,visible,document);const controls=consentControlsFromAccessibilityTree(nodes,url).controls.map(control=>({
   ...control,actionType:consentUiControlActionTypeFromClassification(classifyConsentControlLabel({label:control.label,linkRole:control.role,contextText:control.nearbyConsentText,hasConsentContext:control.consentContextEvidence==='local_surface'}))??control.actionType,
  }));
  const optOut=controls.find(c=>c.label.startsWith('Your Privacy Choices'));assert.ok(optOut?.domBinding?.optOutControl);
  assert.equal(controls.find(c=>c.label==='Accept all')?.domBinding?.version,'ax_backend_dom_binding.v1');
  const observation=buildConsentUiObservationFromEvidence({controls,documentUrl:url,documentIdentity:document.identity,text:'We use cookies',scanStartedAtMs:Date.now()});
  const original=conditionalConsentFixture();const bundle=canonicalEvidenceBundleSchema.parse({...original,url,consentUiObservations:[observation]});
  const input={bundle,scanId:bundle.scanId,targetUrl:url,sourceSha256:'a'.repeat(64)};
  assert.equal(conditionalOptOutCandidate({...input,boundControls:true}).reason,'supported_control');
  assert.equal(conditionalOptOutCandidate(input).status,'skipped','historical policy cannot gain new binding authority');
  const geometry=await captureConsentControlGeometry(page,{documentIdentity:document.identity});
  const projected=consentUiObservationFromConfirmedGeometryControls({geometry,scanStartedAtMs:Date.now()-1000});
  assert.equal(projected?.controls.filter(c=>c.actionType==='do_not_sell_share').length,1,'confirmed native geometry retains opt-out alongside A/R/O');
  const corroborated=structuredClone(bundle);
  corroborated.consentUiObservations.push(projected!);
  assert.equal(conditionalOptOutCandidate({...input,bundle:corroborated,boundControls:true}).reason,'supported_control','same-document exact-ID geometry corroborates the native AX binding');
  const hidden=structuredClone(geometry);
  for(const candidate of hidden.candidates)if(candidate.actionType==='do_not_sell_share')candidate.decisionStatus='covered';
  assert.equal(consentUiObservationFromConfirmedGeometryControls({geometry:hidden,scanStartedAtMs:Date.now()-1000})?.controls.some(c=>c.actionType==='do_not_sell_share')??false,false);
  const ambiguous=structuredClone(bundle);
  const second=structuredClone(ambiguous.consentUiObservations[0]!.controls.find(c=>c.actionType==='do_not_sell_share')!);
  second.domBinding!.backendNodeId+=1;
  second.domBinding!.axNodeId+='-second';
  second.selectorHint=`ax:${second.domBinding!.axNodeId}`;
  ambiguous.consentUiObservations[0]!.controls.push(second);
  assert.equal(conditionalOptOutCandidate({...input,bundle:canonicalEvidenceBundleSchema.parse(ambiguous),boundControls:true}).reason,'ambiguous_control','different native nodes sharing a CSS recipe stay ambiguous');
  const changed=structuredClone(bundle);changed.consentUiObservations[0]!.controls.find(c=>c.actionType==='do_not_sell_share')!.label='Accept all';
  assert.equal(canonicalEvidenceBundleSchema.safeParse(changed).success,false,'label drift breaks the native binding');
 }finally{await browser.close();}
});
