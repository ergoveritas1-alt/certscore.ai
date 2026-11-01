import assert from 'node:assert/strict';
import test from 'node:test';
import type { OneTrustBaseline } from './onetrust-consent-state';
import { createConsentCookieReadGate } from './consent-cookie-read-gate';
import { firstVerifiedConsentRead } from './consent-confirmation-read';

test('a permanently invalid OneTrust baseline keeps one diagnostic read per confirmation invocation',async()=>{
  const baseline:OneTrustBaseline={status:'invalid',reason:'configuration_unverifiable',diagnosticReason:'configuration_missing'};
  let skipped=0;
  const gate=createConsentCookieReadGate<string>('OptanonConsent',baseline,()=>{skipped++;});let reads=0;
  for(let i=0;i<30;i++)assert.equal(await gate(async()=>{reads++;return undefined;}),undefined);
  assert.equal(reads,1);
  assert.equal(skipped,29,'suppressed intermediate observations must be declared incomplete');
  const terminal=createConsentCookieReadGate<string>('OptanonConsent',baseline);
  await terminal(async()=>{reads++;return undefined;});assert.equal(reads,2,'terminal invocation must obtain its own current diagnostic snapshot');
});

test('a pending invalid-baseline diagnostic cannot delay an independent verified TCF result',async()=>{
  const gate=createConsentCookieReadGate<string>('OptanonConsent',undefined);
  let complete:(v:string|undefined)=>void=()=>{};
  const cookie=gate(()=>new Promise(resolve=>{complete=resolve;}));
  assert.equal(await firstVerifiedConsentRead([cookie,Promise.resolve('verified-tcf')]),'verified-tcf');
  complete(undefined);assert.equal(await cookie,undefined);
});

test('invalid baseline gates share pending and failed reads without promoting a result',async()=>{
  let reads=0,release:(v:string|undefined)=>void=()=>{};
  const gate=createConsentCookieReadGate<string>('OptanonConsent',undefined);
  const first=gate(()=>{reads++;return new Promise(resolve=>{release=resolve;});});
  const second=gate(async()=>{reads++;return 'unverified';});
  assert.equal(reads,1);assert.equal(first,second);release('not-a-verified-decision');
  assert.equal(await first,undefined);assert.equal(await second,undefined);
  const failed=createConsentCookieReadGate<string>('OptanonConsent',undefined);
  await assert.rejects(failed(async()=>{reads++;throw Error('read unavailable');}));
  await assert.rejects(failed(async()=>{reads++;return 'must not retry';}));
  assert.equal(reads,2);
});

test('verified OneTrust and other cookie branches retain their independent repeated reads',async()=>{
  const baseline:OneTrustBaseline={status:'verified',identityHash:'a'.repeat(64),valueHash:'b'.repeat(64),coverage:'complete',
    groupIds:['C0001','C0002'],configurationHash:'c'.repeat(64)};
  for(const [name,before] of [['OptanonConsent',baseline],['CookieConsent',undefined],[undefined,undefined]] as const){
    const gate=createConsentCookieReadGate<string>(name,before);let reads=0;
    for(let i=0;i<3;i++)assert.equal(await gate(async()=>{reads++;return 'verified-'+reads;}),'verified-'+(i+1));
    assert.equal(reads,3);
  }
});
