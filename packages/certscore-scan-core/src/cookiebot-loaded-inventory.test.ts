import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { cmpLoadedInventorySchema, projectLoadedCmpInventory } from "@certscore/contracts";
import { KNOWN_CMP_REGISTRY } from "@website-signal-risk-scanner/shared";
import { readCookiebotLoadedInventory } from "./cookiebot-loaded-inventory.js";
import { readPreferenceControls, classifyControls } from "./cmp-preferences-observer.js";

const cmp = KNOWN_CMP_REGISTRY.find(c => c.canonicalName === "Cookiebot")!;
const card = (name:string,type="HTTP Cookie",purpose="Audience measurement",duration="2 years") => `<div class="CybotCookiebotDialogDetailBodyContentCookieInfo"><strong class="CybotCookiebotDialogDetailBodyContentCookieInfoTitle">${name}</strong><span class="CybotCookiebotDialogDetailBodyContentCookieInfoDescription">${purpose}</span><div class="CybotCookiebotDialogDetailBodyContentCookieInfoFooterContent"><b>Maximum Storage Duration</b>: ${duration}</div><div class="CybotCookiebotDialogDetailBodyContentCookieInfoFooterContent"><b>Type</b>: ${type}</div></div>`;
const group = (provider:string,records:string) => `<li class="CybotCookiebotDialogDetailBodyContentCookieGroup"><a class="CybotCookiebotDialogDetailBodyContentCookieProvider">${provider}<div class="CybotCookiebotDialogDetailBodyContentCookieInfoCount">2</div></a><div hidden>${records}</div></li>`;
const fixture = `<div id="CybotCookiebotDialog"><div id="CybotCookiebotDialogTabContentDetails" role="tabpanel" aria-label="Details"><ul>${group('Google',card('_ga [x10]')+card('key','HTML Local Storage'))}${group('<span>one.example</span><span>two.example</span>',card('other','Pixel Tracker'))}</ul></div></div>`;

test("Cookiebot loaded declarations preserve storage types, named providers and collapsed provenance without clicks", async () => {
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage();let requests=0;await page.route('**/*',r=>{requests++;return r.abort()});
    await page.setContent(fixture);await page.evaluate(()=>{document.addEventListener('click',()=>{throw Error('No clicks permitted')})});
    const panel=page.locator('#CybotCookiebotDialogTabContentDetails');
    const inventory=cmpLoadedInventorySchema.parse(await readCookiebotLoadedInventory(panel,cmp.preferenceLoadedInventory!));
    assert.deepEqual(inventory.records.map(row=>[row.name,row.storageType,row.provider]),[['_ga','cookie','Google'],['key','local_storage','Google'],['other','pixel',null]]);
    assert.deepEqual(projectLoadedCmpInventory(inventory),{declarations:[{name:'_ga',purpose:'Audience measurement',duration:'2 years',source:'cmp_loaded_inventory'}],services:[{name:'Google',source:'cmp_loaded_inventory',sourceRef:'provider:0/record:0'}]});
    assert.equal(inventory.truncated,false);assert.equal(requests,0);
    const reserved=await readCookiebotLoadedInventory(panel,cmp.preferenceLoadedInventory!,1);
    assert.equal(reserved.records.length,1);assert.equal(reserved.truncated,true,"Respect room already used by visible declarations");
    assert.equal(await panel.locator('[hidden]').count(),2,'Collapsed declaration sections remain closed');
    await panel.evaluate(p=>p.innerHTML='<ul>'+p.querySelector('li')!.outerHTML.repeat(101)+'</ul>');
    const bounded=cmpLoadedInventorySchema.parse(await readCookiebotLoadedInventory(panel,cmp.preferenceLoadedInventory!));
    assert.equal(bounded.records.length,100);assert.equal(bounded.truncated,true);
    await page.setContent(`<div id="panel">${group('Provider',card('bad name')+card('unknown','Unknown','','')+card('valid','HTTP Cookie','x'.repeat(500)))}</div>`);
    const malformed=cmpLoadedInventorySchema.parse(await readCookiebotLoadedInventory(page.locator('#panel'),cmp.preferenceLoadedInventory!));
    assert.equal(malformed.unresolvedRecords,2);assert.equal(malformed.records[0]?.storageType,'unknown');
    assert.equal(malformed.records[1]?.purpose.length,240);assert.equal(requests,0);
    await page.locator('.CybotCookiebotDialogDetailBodyContentCookieInfoFooterContent').nth(4).evaluate(node=>node.innerHTML='<b>Maximum Storage Duration</b>');
    const missing=await readCookiebotLoadedInventory(page.locator('#panel'),cmp.preferenceLoadedInventory!);
    assert.equal(missing.unresolvedRecords,3);assert.equal(missing.records[1]?.duration,'');
    assert.equal((await readCookiebotLoadedInventory(page.locator('#panel'),cmp.preferenceLoadedInventory!,NaN)).records.length,0);
    assert.equal(cmpLoadedInventorySchema.safeParse({...inventory,records:[inventory.records[0],inventory.records[0]]}).success,false);
  } finally {await browser.close()}
});

test("Cookiebot styled inline switches require an exact heading, unique native input and visible sibling hit target", async () => {
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage();
    const content=`<style>input{position:absolute;opacity:0;width:1px;height:1px}.CybotCookiebotDialogBodyLevelButtonSlider{display:inline-block;width:40px;height:20px;background:red}</style><div id="CybotCookiebotDialog"><div id="CybotCookiebotDialogTabContentDetails" role="tabpanel"><div class="CybotCookiebotDialogDetailBodyContentCookieContainerHeader"><h3 role="heading" id="CybotCookiebotDialogBodyLevelButtonStatisticsInlineLabel">Statistics</h3><div><input type="checkbox" role="switch" id="CybotCookiebotDialogBodyLevelButtonStatisticsInline" aria-labelledby="CybotCookiebotDialogBodyLevelButtonStatisticsInlineLabel"><span class="CybotCookiebotDialogBodyLevelButtonSlider" aria-hidden="true"></span></div></div></div></div>`;
    const read=()=>readPreferenceControls(page.locator('#CybotCookiebotDialogTabContentDetails'),cmp.preferenceCategoryInventory);
    await page.setContent(content);
    assert.deepEqual(classifyControls((await read()).controls),[{label:'Statistics',enabled:true,checked:false,kind:'category'}]);
    for (const mutate of [
      ()=>document.querySelector('input')!.setAttribute('aria-labelledby','wrong'),
      ()=>document.querySelector('input')!.setAttribute('aria-hidden','true'),
      ()=>document.querySelector('.CybotCookiebotDialogDetailBodyContentCookieContainerHeader')!.setAttribute('hidden',''),
      ()=>document.querySelector('input')!.parentElement!.insertAdjacentHTML('beforeend',document.querySelector('input')!.outerHTML),
      ()=>document.querySelector('body')!.insertAdjacentHTML('beforeend','<div style="position:fixed;inset:0;background:white"></div>'),
      ()=>document.querySelector('.CybotCookiebotDialogBodyLevelButtonSlider')!.setAttribute('style','position:absolute;left:2000px'),
    ]) {
      await page.setContent(content);await page.evaluate(mutate);
      assert.deepEqual(classifyControls((await read()).controls),[]);
    }
  }finally{await browser.close()}
});
