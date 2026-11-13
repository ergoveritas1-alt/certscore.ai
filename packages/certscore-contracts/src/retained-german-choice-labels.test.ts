import assert from 'node:assert/strict';
import test from 'node:test';
import {classifyConsentControlLabel} from './consent-control-label-classifier';
// Retained localhost geometry: flic.kr d03c08a3-1f92-4d7e-aab5-b35cad90ad4e
// and sanity.io 92ac426c-5594-4d0c-b687-a55b3777b44c. No public traffic.
const scopeText='Diese Website verwendet Technologien wie Cookies, um wesentliche Funktionen der Website zu ermöglichen sowie für analytik, personalisierung und gezielte werbung.';
for(const usage of ['observation','action'] as const) {
 for(const [label,intent] of [['Akzeptieren','accept'],['Nicht wesentliche Cookies ablehnen','reject']] as const) {
  test(`retained German Osano ${intent} is recognized for ${usage}`,()=>{
   const result=classifyConsentControlLabel({label,usage,scopeKind:'dialog',scopeText,hasConsentContext:true});
   assert.equal(result.intent,intent);
   assert.equal(result.matchStrength,'direct');
  });
 }
 test(`German unrelated nonessential rejection is not a cookie choice for ${usage}`,()=>{
  for(const label of ['Nicht wesentliche Angebote ablehnen','Nicht wesentliche Cookies','Nicht wesentliche Cookies akzeptieren']) {
   assert.notEqual(classifyConsentControlLabel({label,usage,scopeKind:'dialog',scopeText,hasConsentContext:true}).intent,'reject');
  }
 });
}
