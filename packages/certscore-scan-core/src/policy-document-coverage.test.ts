import assert from 'node:assert/strict';
import test from 'node:test';
import {chromium} from 'playwright';
import {assessPolicyDocumentRoleForChildSelection,extractCandidates,bestRenderedPolicyDocumentText,renderedPolicySemanticTextCandidates,compactPolicyResponseHtml} from './scanners/policy-surface-scanner';

test('a fetched navigation body cannot become a supporting policy solely from its source link label',()=>{
 const candidate=extractCandidates('https://site.test/','<a href="/privacy">Privacy Policy</a>','Privacy Policy')[0]!;
 const result=assessPolicyDocumentRoleForChildSelection(candidate,{fetchCandidates:[],observedChildCandidates:[]},{
  substantiveDisclosureSignalCount:0,evidenceBoundObservedTopicCount:0,governingPolicyBodyAssessment:{
   contractVersion:'governing_policy_body_assessment.v1',state:'insufficient',canonicalContextTermCount:0,
   documentTextChars:6000,evidenceBoundObservedTopicCount:0,substantiveDisclosureSignalCount:0,reasonCodes:[]}});
 assert.equal(result.role,'unknown');assert.ok(result.reasonCodes.includes('retained_document_has_no_substantive_privacy_body'));
 const substantive=assessPolicyDocumentRoleForChildSelection(candidate,{fetchCandidates:[],observedChildCandidates:[]},{substantiveDisclosureSignalCount:2});
 assert.equal(substantive.role,'policy_document');
});

test('passive document capture retains bound collapsed disclosures without opening controls or hidden unrelated content',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage();
  const opening='Privacy Policy. We collect personal information to provide services. We retain personal information as necessary for service delivery. '.repeat(8);
  const rights='California Privacy Rights. You have the right to access personal information. You may request that we delete or correct personal information. We will not discriminate against you for exercising your privacy rights.';
  const html=`<html lang="en"><head><title>Privacy Notice</title></head><body><main><h1>Privacy Policy</h1><p>${opening}</p><button aria-controls="ca" aria-expanded="false">California rights</button><section id="ca" hidden>${rights}</section></main><aside hidden id="unrelated">Unrelated hidden template text</aside></body></html>`;
  await page.route('https://fixture.certscore.ai/**',route=>route.fulfill({contentType:'text/html',body:html}));
  await page.goto('https://fixture.certscore.ai/privacy');
  const visible=await page.locator('body').innerText();assert.doesNotMatch(visible,/You may request/);
  const candidates=await renderedPolicySemanticTextCandidates(page);
  const text=bestRenderedPolicyDocumentText(await page.content(),[visible,...candidates]);
  assert.match(text,/You may request that we delete or correct/);
  assert.doesNotMatch(text,/Unrelated hidden template/);
  assert.equal(await page.locator('button').getAttribute('aria-expanded'),'false');
  assert.equal(await page.locator('#ca').isVisible(),false);
 }finally{await browser.close();}
});

test('a substantive legal privacy-choices section is distinct from an interactive consent banner',()=>{
 const rights='Your Privacy Choices. We collect personal information to provide our services. You may request deletion and correction of your personal information. We retain information only for the purposes described. '.repeat(8);
 const text=bestRenderedPolicyDocumentText(`<main><section id="privacy-choices">${rights}</section></main><section id="cookie-banner">We use cookies.<button>Accept all</button><button>Reject all</button></section>`,[]);
 assert.match(text,/request deletion and correction/);assert.doesNotMatch(text,/Accept all/);
});

test('large application code cannot displace the middle of a source notice before text extraction',()=>{
 const rights='California Consumer Privacy Act Notice. You have the right to know, correct and delete personal information. We do not discriminate against you for exercising your privacy rights. ';
 const raw=`<html><head><style>${'x'.repeat(520000)}</style><script type="application/json">${JSON.stringify({assets:'x'.repeat(520000)})}</script><script type="application/ld+json">{"articleBody":"Privacy policy: we collect personal information."}</script></head><body><main><h1>Privacy Policy</h1><p>${rights.repeat(8)}</p><details><summary>California notice</summary><p>${rights}</p></details><a href="/california">California notice</a></main></body></html>`;
 const compact=compactPolicyResponseHtml(raw);
 assert.ok(compact.length<500000);assert.match(compact,/<details>/);assert.match(compact,/href="\/california"/);
 assert.match(compact,/application\/ld\+json/);assert.match(bestRenderedPolicyDocumentText(compact,[]),/right to know, correct and delete/);
 assert.equal(compactPolicyResponseHtml('<p>Short policy text</p>'),'<p>Short policy text</p>');
});

test('legal notice expansion is exact, unique and never changes privacy choices or submits a form',async()=>{
 const {expandCaliforniaNoticeText}=await import('./scanners/policy-surface-scanner');
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage();
  for(const mode of ['valid','smooth-scroll','choice','form','ambiguous']){
   const label=mode==='choice'?'Do Not Sell or Share My Personal Information':'2. California Consumer Privacy Act (CCPA) Notice';
   const button=`<button type="button" aria-controls="notice" aria-expanded="false">${label}</button>`;
   const html=`<html style="scroll-behavior:smooth"><body><main>${mode==='smooth-scroll'?'<div style="height:25000px">Long policy introduction</div>':''}${mode==='form'?'<form>':''}${button}${mode==='ambiguous'?button:''}${mode==='form'?'</form>':''}<section id="notice" hidden></section></main><script>for(const button of document.querySelectorAll('button'))button.onclick=()=>{button.setAttribute('aria-expanded','true');document.getElementById('notice').hidden=false;document.getElementById('notice').textContent='California consumers may request deletion.';};</script></body></html>`;
   await page.route('https://legal-fixture.certscore.ai/**',route=>route.fulfill({contentType:'text/html',body:html}));
   await page.goto('https://legal-fixture.certscore.ai/'+mode);
   const expanded=await expandCaliforniaNoticeText(page,Date.now()+1500);
   assert.equal(expanded,['valid','smooth-scroll'].includes(mode),mode);
   assert.equal(await page.locator('#notice').isVisible(),['valid','smooth-scroll'].includes(mode),mode);
   await page.unroute('https://legal-fixture.certscore.ai/**');
  }
 }finally{await browser.close();}
});

test('legal accordion with overridden ARIA IDs requires an exact owning item and one region',async()=>{
 const {expandCaliforniaNoticeText}=await import('./scanners/policy-surface-scanner');
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage();
  for(const mode of ['valid','wrong-value','duplicate-region','form']){
   const region='<div data-slot="accordion-content" role="region" id="notice-body" hidden data-state="closed"></div>';
   const html=`<main>${mode==='form'?'<form>':''}<div data-slot="accordion-item" data-accordion-section="true" data-accordion-value="${mode==='wrong-value'?'other':'california-notice'}"><h3><button type="button" id="california-notice" data-slot="accordion-trigger" aria-expanded="false">2. California Consumer Privacy Act (CCPA) Notice</button></h3>${region}${mode==='duplicate-region'?region:''}</div>${mode==='form'?'</form>':''}</main><script>document.querySelector('button').onclick=()=>{document.querySelector('button').setAttribute('aria-expanded','true');document.querySelector('[role=region]').hidden=false;document.querySelector('[role=region]').textContent='You may request access and deletion.';};</script>`;
   await page.route('https://accordion-fixture.certscore.ai/**',route=>route.fulfill({contentType:'text/html',body:html}));
   await page.goto('https://accordion-fixture.certscore.ai/'+mode);
   assert.equal(await expandCaliforniaNoticeText(page,Date.now()+1500),mode==='valid',mode);
   assert.equal(await page.locator('[role=region]').first().isVisible(),mode==='valid',mode);
   await page.unroute('https://accordion-fixture.certscore.ai/**');
  }
 }finally{await browser.close();}
});
