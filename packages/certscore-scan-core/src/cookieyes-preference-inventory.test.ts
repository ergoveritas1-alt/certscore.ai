import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { readCookieYesPreferenceInventory } from "./cookieyes-preference-inventory.js";
import { captureCmpBasicEvidence } from "./cmp-basic-capture.js";

const fixture = `<div class="cky-consent-container"><button onclick="window.actions++">Settings</button></div><script>
window.actions=0;window.getters=0;
window.cookieyes={_ckyStore:{_categories:[{slug:'analytics',cookies:[{cookieID:'_ga'},{cookieID:'unknown'},{cookieID:'wrong'},{cookieID:'missing'}]}],
 _language:{_active:'en',_store:new Map([['en',{cookies:{
 _ga:{cookie_id:'_ga',description:'<p>Audience <b>measurement</b></p><style>private</style>',duration:'2 years',value:'private'},
 unknown:{cookie_id:'unknown',description:'<p>Description is currently not available.</p>',duration:'N/A'},
 wrong:{cookie_id:'other',description:'Must not borrow',duration:'30 days'}
 }}]])}}};
Object.defineProperty(window.cookieyes,'_ckyConsentStore',{get(){window.getters++;throw Error('Do not read consent values')}});
</script>`;

test("CookieYes loaded names and bound localized details stay factual, partial and read-only", async () => {
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage();await page.setContent(fixture);
    const inventory=await readCookieYesPreferenceInventory(page);
    assert.deepEqual(inventory?.declarations,[
      {name:'_ga',purpose:'Audience measurement',duration:'2 years',source:'cmp_api_inventory'},
      ...['unknown','wrong','missing'].map(name=>({name,purpose:'',duration:'',source:'cmp_api_inventory'})),
    ]);
    assert.deepEqual(inventory?.services,[]);assert.deepEqual(inventory?.categories,[]);
    assert.equal(inventory?.unresolved,true);assert.ok(!JSON.stringify(inventory).includes('private'));
    assert.equal(await page.evaluate(()=>(window as any).getters),0);
    const input={page,scanId:'cookieyes',targetUrl:'https://example.test/',scanStartedAtMs:Date.now(),readBinding:()=>({url:page.url(),token:'loader-1'}),isCurrent:()=>true};
    const packet=await captureCmpBasicEvidence(input);assert.ok(packet);
    assert.deepEqual(packet.declarations,inventory?.declarations);
    assert.ok(packet.limitations.includes('loaded_configuration_not_visibility_proof'));
    assert.ok(packet.limitations.includes('declaration_inventory_not_complete'));
    assert.equal(await page.evaluate(()=>(window as any).actions),0);
    let requests=0;
    await page.route('**/*',route=>{requests++;return route.abort();});
    await page.evaluate(()=>{(window as any).cookieyes._ckyStore._language._store.get('en').cookies._ga.description='<img src="https://example.invalid/unexpected">Audience measurement';});
    assert.equal((await readCookieYesPreferenceInventory(page))?.declarations[0]?.purpose,'Audience measurement');
    await page.waitForTimeout(50);
    assert.equal(requests,0,'Parsing loaded descriptions must not fetch embedded resources');
    let reads=0;
    assert.equal(await captureCmpBasicEvidence({...input,readBinding:()=>({url:page.url(),token:++reads===1?'old':'new'})}),undefined);
    await page.locator('body').evaluate(body=>body.insertAdjacentHTML('beforeend','<div id="onetrust-banner-sdk"></div>'));
    assert.equal(await captureCmpBasicEvidence(input),undefined,'Ambiguous CMPs cannot borrow loaded data');
  }finally{await browser.close();}
});

test("CookieYes unavailable data, getters, oversized lists and wrong languages fail closed", async () => {
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage();await page.setContent(fixture);
    await page.evaluate(()=>{Object.defineProperty((window as any).cookieyes,'_ckyStore',{get(){(window as any).getters++;throw Error('getter')}});});
    assert.equal(await readCookieYesPreferenceInventory(page),undefined);
    assert.equal(await page.evaluate(()=>(window as any).getters),0);
    await page.setContent(fixture);
    await page.evaluate(()=>{(window as any).cookieyes._ckyStore._language._active='fr'});
    assert.ok((await readCookieYesPreferenceInventory(page))!.declarations.every(row=>!row.purpose&&!row.duration));
    await page.setContent(fixture);
    await page.evaluate(()=>{(window as any).cookieyes._ckyStore._categories=Array.from({length:33},(_,i)=>({slug:'cat'+i,cookies:Array.from({length:101},(_,n)=>({cookieID:'cookie'+n}))}));});
    const bounded=await readCookieYesPreferenceInventory(page);
    assert.equal(bounded?.declarations.length,100);assert.equal(bounded?.truncated,true);
    await page.setContent(fixture);
    await page.evaluate(()=>{
      const s=(window as any).cookieyes._ckyStore;
      Object.defineProperty(s._categories[0].cookies[0],'cookieID',{get(){(window as any).getters++;return 'fake'}});
      s._language._store.get('en').cookies.wrong.cookie_id='wrong';
      s._language._store.get('en').cookies.wrong.description='x'.repeat(4097);
    });
    const malformed=await readCookieYesPreferenceInventory(page);
    assert.ok(!malformed!.declarations.some(row=>row.name==='fake'||row.name==='_ga'));
    assert.equal(malformed!.declarations.find(row=>row.name==='wrong')?.purpose,'');
    assert.equal(await page.evaluate(()=>(window as any).getters),0);
  }finally{await browser.close();}
});
