import assert from "node:assert/strict";
import test from "node:test";
import { CAMPAIGN_ATTRIBUTION_STORAGE_KEY, CAMPAIGN_SESSION_KEY, captureCampaignAttribution, getStoredCampaignAttribution, getFirstTouchCampaignAttribution, markCampaignLandingSeen, normalizeCampaignAttribution, readCampaignAttributionFromSearch } from "./campaign-attribution";
import { saveAnalyticsConsent } from "../analytics/consent";
function storage() {
 const values = new Map<string,string>();
 return {values, getItem:(k:string)=>values.get(k)??null, setItem:(k:string,v:string)=>{values.set(k,v)},removeItem:(k:string)=>{values.delete(k)}};
}
function browser(run:(w:any)=>void) {
 const original=Object.getOwnPropertyDescriptor(globalThis,"window");
 const w={localStorage:storage(),sessionStorage:storage(),certscoreAnalyticsConsent:"granted",location:{pathname:"/insights/session-replay-study-2026",search:"?utm_source=linkedin&utm_medium=organic_social&utm_campaign=replay"},dispatchEvent:()=>true};
 Object.defineProperty(globalThis,"window",{configurable:true,value:w});
 try {run(w)} finally {if(original)Object.defineProperty(globalThis,"window",original);else Reflect.deleteProperty(globalThis,"window")}
}
test("only bounded supported campaign fields are accepted",()=>{
 assert.deepEqual(readCampaignAttributionFromSearch("?utm_source=x&gclid=ignored"),{utm_source:"x"});
 assert.equal(normalizeCampaignAttribution({utm_source:"\u0000bad"}),null);
 assert.equal(normalizeCampaignAttribution({utm_content:"person@example.com"}),null);
 assert.equal(normalizeCampaignAttribution({utm_term:"https://private.example/path"}),null);
 assert.equal(normalizeCampaignAttribution({utm_source:"x".repeat(201)}),null);
});
test("no grant means no campaign persistence or landing marker; later grant can capture current landing",()=>browser(w=>{
 w.certscoreAnalyticsConsent="denied";
 assert.equal(captureCampaignAttribution().attribution,null);markCampaignLandingSeen();
 assert.equal(w.localStorage.values.size,0);assert.equal(w.sessionStorage.values.size,0);
 w.certscoreAnalyticsConsent="granted";
 assert.equal(captureCampaignAttribution().isNewLanding,true);markCampaignLandingSeen();
 assert.equal(captureCampaignAttribution().isNewLanding,false);
}));
test("first touch is distinct; later campaigns replace complete field sets, never merge",()=>browser(w=>{
 captureCampaignAttribution();
 w.location.search="?utm_source=x";captureCampaignAttribution();
 assert.equal(getFirstTouchCampaignAttribution()?.utm_source,"linkedin");
 assert.deepEqual(getStoredCampaignAttribution(),{utm_source:"x"});
 assert.deepEqual(captureCampaignAttribution("").attribution,{utm_source:"x"});
}));
test("expired records and legacy records do not silently restore attribution",()=>browser(w=>{
 for(const [store,key] of [[w.localStorage,CAMPAIGN_ATTRIBUTION_STORAGE_KEY],[w.sessionStorage,CAMPAIGN_SESSION_KEY]] as const)store.setItem(key,JSON.stringify({expiresAt:1,attribution:{utm_source:"old"}}));
 assert.equal(getFirstTouchCampaignAttribution(),null);assert.equal(getStoredCampaignAttribution(),null);
 w.localStorage.setItem("certscore:campaign-attribution:v1",JSON.stringify({utm_source:"old"}));captureCampaignAttribution("");
 assert.equal(w.localStorage.getItem("certscore:campaign-attribution:v1"),null);
}));
test("revocation removes attribution and landing bookkeeping",()=>browser(w=>{
 captureCampaignAttribution();markCampaignLandingSeen();saveAnalyticsConsent("denied");
 assert.equal(w.localStorage.getItem(CAMPAIGN_ATTRIBUTION_STORAGE_KEY),null);
 assert.equal(w.sessionStorage.getItem(CAMPAIGN_SESSION_KEY),null);
 assert.equal(getStoredCampaignAttribution(),null);
}));
test("storage failure never blocks the page",()=>browser(w=>{
 w.localStorage={getItem:()=>{throw Error()},setItem:()=>{throw Error()},removeItem:()=>{throw Error()}};
 w.sessionStorage=w.localStorage;
 assert.doesNotThrow(()=>captureCampaignAttribution());assert.equal(getStoredCampaignAttribution(),null);
}));
