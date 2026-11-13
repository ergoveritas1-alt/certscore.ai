import assert from 'node:assert/strict';
import test from 'node:test';
import {chromium} from 'playwright';
import {readCmpApiConsentSnapshot} from './cmp-api-consent-state.js';
import {evaluateCmpApiConfirmation} from './cmp-api-confirmation.js';

// Source-reviewed Osano setup creates a store per script execution and assigns
// its API to Osano.cm. UI handlers retain their own store. The saved event is
// documented as a complete consent object; a different store's defaults are
// not a readback of the clicked control. All traffic is blocked in this fixture.
for (const action of ['accept','reject'] as const) {
  for (const mode of ['single','replace_before_baseline','replace_after_baseline','overlapping_instances','old_instance_event'] as const) {
    test(`Osano ${action}: ${mode}`, async () => {
      const browser = await chromium.launch({headless:true});
      try {
        const page = await browser.newPage();
        await page.route('**/*', route => route.abort());
        await page.setContent(`<button id="choice">${action === 'accept' ? 'Akzeptieren' : 'Nicht wesentliche Cookies ablehnen'}</button><script>
          window.instances=[];
          window.make=()=>{
            const instance={state:{ESSENTIAL:'ACCEPT',ANALYTICS:'DENY',MARKETING:'DENY',PERSONALIZATION:'DENY',STORAGE:'DENY',OPT_OUT:'DENY'},listeners:[]};
            instance.api={getConsent:()=>({...instance.state}),addEventListener:(event,listener)=>{
              if(event!=='osano-cm-consent-saved')throw Error('Unexpected listener');instance.listeners.push(listener);
            }};
            instance.save=()=>{for(const k of ['ANALYTICS','MARKETING','PERSONALIZATION'])instance.state[k]=${JSON.stringify(action === 'accept' ? 'ACCEPT' : 'DENY')};instance.listeners.forEach(fn=>fn({...instance.state}));};
            window.instances.push(instance);window.Osano={cm:instance.api};return instance;
          };
          const original=window.make();document.querySelector('button').onclick=()=>original.save();
        </script>`);
        if (mode !== 'single' && mode !== 'overlapping_instances') await readCmpApiConsentSnapshot(page,'osano');
        if (mode === 'replace_before_baseline') {
          await page.evaluate(() => { const instance=(window as any).make();document.querySelector('button')!.onclick=()=>instance.save(); });
        } else if (mode === 'overlapping_instances' || mode === 'old_instance_event') {
          await page.evaluate(() => (window as any).make());
        }
        const baseline = await readCmpApiConsentSnapshot(page,'osano');
        assert.ok(baseline);
        const dispatched = await page.evaluate(() => Date.now());
        if (mode === 'replace_after_baseline') {
          await page.evaluate(() => {const instance=(window as any).make();document.querySelector('button')!.onclick=()=>instance.save();});
          await readCmpApiConsentSnapshot(page,'osano');
        }
        await page.click('#choice');
        const snapshot = await readCmpApiConsentSnapshot(page,'osano');
        assert.ok(snapshot);
        const result = evaluateCmpApiConfirmation({provider:'osano',baseline,snapshot,
          decision:action === 'accept' ? 'granted' : 'denied',actionDispatchedAtEpochMs:dispatched});
        assert.equal(result.eligible,mode === 'single' || mode === 'replace_before_baseline');
        if (mode === 'replace_after_baseline') assert.deepEqual(result,{eligible:false,reason:'configuration_changed'});
        if (mode === 'overlapping_instances' || mode === 'old_instance_event') {
          assert.equal(snapshot.eventSequence,0,'An event from the hidden API must not leak into the exposed API tracker');
          assert.equal(snapshot.decision,'denied');
          assert.deepEqual(result,{eligible:false,reason:action === 'accept' ? 'opposite_or_mixed_decision' : 'api_saved_event_unverified'});
        }
        assert.equal(await page.evaluate(() => (window as any).instances.at(-1).listeners.length),1);
        assert.equal('instanceGeneration' in snapshot,false,'Only the binding hash leaves the reader');
      } finally {await browser.close();}
    });
  }
}

import {readFileSync} from 'node:fs';
const retained = JSON.parse(readFileSync(new URL('../fixtures/sanity-osano-unconfirmed-20261113.json',import.meta.url),'utf8')) as Array<{
  scanId:string;action:'accept'|'reject';packetSha256:string;packetSizeBytes:number;
  apiObservations:Array<{phase:string;valueSha256:string;decision:'denied';eventSequence:number}>;reasons:string[];
}>;
for (const row of retained) test(`retained Sanity ${row.scanId} ${row.action}: defaults cannot establish a saved choice`,()=>{
  assert.match(row.packetSha256,/^[a-f0-9]{64}$/);assert.ok(row.packetSizeBytes>0);
  const baseline=row.apiObservations.find(o=>o.phase==='baseline');
  const terminal=row.apiObservations.find(o=>o.phase==='terminal');
  assert.ok(baseline&&terminal);assert.equal(terminal.valueSha256,baseline.valueSha256);
  assert.equal(terminal.eventSequence,0);
  const result=evaluateCmpApiConfirmation({provider:'osano',baseline:{canonicalState:baseline.valueSha256,eventSequence:baseline.eventSequence},
    snapshot:{canonicalState:terminal.valueSha256,decision:terminal.decision,eventSequence:terminal.eventSequence},
    decision:row.action==='accept'?'granted':'denied',actionDispatchedAtEpochMs:1});
  assert.equal(result.eligible,false);
  if(!result.eligible)assert.ok(row.reasons.includes(result.reason));
});
