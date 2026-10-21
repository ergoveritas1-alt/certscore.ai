import assert from "node:assert/strict";
import test from "node:test";
import {classifyCanonicalCollectionEndpoint,isCanonicalAdvertisingCollectionCandidate} from "./collection-endpoints";

test("verification telemetry and sync bootstrap never qualify solely from advertising vendor ownership",()=>{
 for(const url of [
  "https://pixel.adsafeprotected.com/services/pub?sessionId=session-fixture&url=https%3A%2F%2Fsite.test",
  "https://pagead2.googlesyndication.com/pagead/sodar?id=sodar2&jk=fixture",
  "https://ads.pubmatic.com/AdServer/js/user_sync.html?kdntuid=1&p=123&gpp=fixture",
  "https://ads.pubmatic.com/AdServer/js/user_sync.html?p=123&predirect=https%3A%2F%2Fpartner.test",
 ]) assert.equal(isCanonicalAdvertisingCollectionCandidate(url,"document"),false,url);
 assert.equal(classifyCanonicalCollectionEndpoint("https://ads.pubmatic.com/AdServer/js/user_sync.html","document").category,"identity_sync_bootstrap");
 // The bootstrap exclusion cannot erase a separate observed collector or an
 // identity-sync request, or neutralize a different vendor by path alone.
 for(const url of ["https://ads.pubmatic.com/AdServer/AdServerServlet?uid=fixture", "https://dpm.demdex.net/id?d_cid=fixture", "https://www.facebook.com/tr/?id=fixture&ev=PageView"])
  assert.equal(isCanonicalAdvertisingCollectionCandidate(url,"image"),true,url);
});

test("telemetry and pd bootstrap are separate from transmitted identity and advertising events",()=>{
 for(const id of ['xbid','av-js','unknown']) {
  const url=`https://pagead2.googlesyndication.com/pagead/gen_204?id=${id}&type=fle-fetch-start2`;
  assert.equal(classifyCanonicalCollectionEndpoint(url,'image').category,'advertising_measurement_support');
  assert.equal(isCanonicalAdvertisingCollectionCandidate(url,'image'),false);
 }
 assert.equal(isCanonicalAdvertisingCollectionCandidate('https://google-bidout-d.openx.net/w/1.0/pd?plm=5','document'),false);
 assert.equal(isCanonicalAdvertisingCollectionCandidate('https://google-bidout-d.openx.net/w/1.0/pd?uid=identity-fixture','document'),true);
 assert.equal(isCanonicalAdvertisingCollectionCandidate('https://u.openx.net/w/1.0/cm?uid=identity-fixture','image'),true);
 assert.equal(isCanonicalAdvertisingCollectionCandidate('https://www.google.com/ccm/collect?tid=fixture','fetch'),false);
 const restricted='https://www.facebook.com/tr/?id=publisher-fixture&ev=PageView&dpo=LDU&fbp=identity-fixture';
 assert.equal(classifyCanonicalCollectionEndpoint(restricted,'image').category,'restricted_use_advertising_collection');
 assert.equal(isCanonicalAdvertisingCollectionCandidate(restricted,'image'),true);
 assert.equal(classifyCanonicalCollectionEndpoint('https://other.test/tr/?dpo=LDU','image').category,'advertising_collection');
});

test('Google matching pixels and Amazon identity/bid collectors receive narrow endpoint attribution',async()=>{
 const {resolveCanonicalVendor}=await import('./index');
 for(const url of ['https://cm.g.doubleclick.net/pixel?google_nid=publisher','https://s.amazon-adsystem.com/iu3?d=publisher','https://aax.amazon-adsystem.com/e/dtb/bid/123/0/prebid?adunitid=publisher']){
  const v=resolveCanonicalVendor({type:'request',url,sourceScanner:'gpc_observation',matchSource:'network_request'}).observation!;
  assert.equal(v.registryAttribution?.matchKind,'endpoint',url);assert.equal(isCanonicalAdvertisingCollectionCandidate(url,'image'),true,url);
 }
 for(const url of ['https://cm.g.doubleclick.net/partnerpixels','https://cm.g.doubleclick.net/pixel.js','https://s.amazon-adsystem.com/iu30','https://unknown.test/iu3']){
  const v=resolveCanonicalVendor({type:'request',url,sourceScanner:'gpc_observation',matchSource:'network_request'}).observation;
  assert.notEqual(v?.registryAttribution?.matchKind,'endpoint',url);
 }
});

test("GPT dictionary downloads and consent telemetry cannot become advertising collection", () => {
  for (const url of [
    "https://securepubads.g.doubleclick.net/pagead/managed/dict/m202610200101/gpt",
    "https://securepubads.g.doubleclick.net/tag/js/gpt.js",
    "https://pagead2.googlesyndication.com/ccm/collect",
    "https://ad.doubleclick.net/ccm/s/collect",
  ]) assert.equal(isCanonicalAdvertisingCollectionCandidate(url, "fetch"), false, url);
  assert.equal(isCanonicalAdvertisingCollectionCandidate("https://securepubads.g.doubleclick.net/gampad/ads?iu=fixture", "fetch"), true);
  assert.equal(isCanonicalAdvertisingCollectionCandidate("https://bcp.crwdcntrl.net/6/map?xcid=fixture", "xhr"), true);
});
