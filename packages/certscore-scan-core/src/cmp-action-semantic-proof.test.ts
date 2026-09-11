import assert from 'node:assert/strict';
import test from 'node:test';
import {chromium} from 'playwright';
import {buildConsentActionControlProof} from './cmp-action-control-proof';

test('semantic veto in visible text survives a positive accessible label at final action proof', async()=>{
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage();
    for(const [aria,label] of [['Accept all','I Do Not Accept Cookies'],['Accept all','Nur notwendige Funktionscookies akzeptieren'],['Reject all','What happens if I reject all'],['Reject all','Que se passe-t-il si je refuse ?'],['Accept all','Accept all or reject all'],['Accept all','Accepter ou refuser'],['Reject all','Alle akzeptieren oder alle ablehnen']]){
      await page.setContent(`<button id="choice" style="padding:20px" aria-label="${aria}">${label}</button>`);
      const result=await buildConsentActionControlProof({action:aria.startsWith('Accept')?'accept':'reject',page,control:page.locator('#choice'),observedAtMs:1,recipeId:'fixture',selectorHint:'#choice'});
      assert.notEqual(result.status,'verified',label);
    }
    await page.setContent('<button id="choice" style="padding:20px" aria-label="Accept all">Accept all</button>');
    const result=await buildConsentActionControlProof({action:'accept',page,control:page.locator('#choice'),observedAtMs:1,recipeId:'fixture',selectorHint:'#choice'});
    assert.equal(result.status,'verified');
  }finally{await browser.close();}
});
