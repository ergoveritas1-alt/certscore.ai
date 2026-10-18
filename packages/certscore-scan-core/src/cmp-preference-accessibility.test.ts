import assert from "node:assert/strict";
import test from "node:test";
import {chromium} from "playwright";
import {inspectPreferenceAccessibility} from "./cmp-preference-accessibility.js";

test("preference audit retains panel-scoped name evidence and never clicks or submits",{timeout:15000},async()=>{
 const browser=await chromium.launch({headless:true});try{
  const page=await browser.newPage();await page.setContent('<button id="outside"></button><section id="preferences" role="dialog" aria-label="Privacy settings"><button id="inside"></button><label><input type="checkbox">Analytics</label><button onclick="window.saved=true">Save</button></section>');
  const packet=await inspectPreferenceAccessibility({page,panel:page.locator('#preferences'),panelSelector:'#preferences',scanId:'fixture',documentUrl:'https://fixture.test/',documentToken:'loader',budgetMs:800,verify:async()=>{assert.equal(await page.locator('#preferences').count(),1);}});
  assert.ok(packet,'A local static preference panel must yield a bounded audit');assert.equal(packet.sourceLane,'cmp_preferences');assert.equal(packet.scope,'opened_preference_panel');
  const names=packet.violations.find(rule=>rule.ruleId==='button-name');assert.equal(names?.nodeCount,1);assert.ok(names?.representativeNodes.some(node=>JSON.stringify(node.selectors).includes('inside')));assert.ok(!JSON.stringify(packet).includes('#outside'));
  assert.equal(await page.evaluate(()=>Boolean((window as unknown as {saved?:boolean}).saved)),false);
  const unbound=await inspectPreferenceAccessibility({page,panel:page.locator('#preferences'),panelSelector:'#preferences',scanId:'fixture',documentUrl:'https://fixture.test/',documentToken:'loader',budgetMs:800,verify:async()=>{throw Error('document drift');}});assert.equal(unbound,undefined);
 }finally{await browser.close();}
});
