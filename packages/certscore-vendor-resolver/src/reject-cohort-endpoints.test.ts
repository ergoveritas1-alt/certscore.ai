import assert from "node:assert/strict";
import test from "node:test";
import { resolveCanonicalVendor, classifyCanonicalCollectionEndpoint, isCanonicalAdvertisingCollectionCandidate } from "./index";

test("retained Heap and HubSpot collectors resolve without treating adjacent assets as collection",()=>{
 for(const [url,vendor] of [["https://heapanalytics.com/h","Heap"],["https://track.hubspot.com/__ptc.gif","HubSpot"],
  ["https://track-eu1.hubspot.com/__ptc.gif","HubSpot"]]) {
  const observation=resolveCanonicalVendor({type:"request",url}).observation;
  assert.equal(observation?.vendor,vendor);assert.equal(observation?.purpose,"analytics");
  assert.deepEqual(classifyCanonicalCollectionEndpoint(url,"image"),{observed:true,category:"analytics_collection"});
 }
 for(const url of ["https://heapanalytics.com/h-extra","https://heapanalytics.com.example.test/h",
  "https://track.hubspot.com/__ptc.gif.js","https://track.hubspot.com.example.test/__ptc.gif"])
  assert.notEqual(resolveCanonicalVendor({type:"request",url}).observation?.purpose,"analytics");
});
test("Shopify telemetry attribution retains mixed-purpose uncertainty and cannot qualify as advertising",()=>{
 for(const path of ["/v1/produce","/unstable/produce_batch"]) {
  const url=`https://monorail-edge.shopifysvc.com${path}`;
  assert.equal(resolveCanonicalVendor({type:"request",url}).observation?.vendor,"Shopify");
  assert.equal(resolveCanonicalVendor({type:"request",url}).observation?.purpose,"unknown");
  assert.equal(classifyCanonicalCollectionEndpoint(url,"fetch").category,"mixed_telemetry");
  assert.equal(isCanonicalAdvertisingCollectionCandidate(url,"fetch"),false);
 }
 assert.equal(resolveCanonicalVendor({type:"request",url:"https://example.test/.well-known/shopify/monorail/unstable/produce_batch"}).observation,null);
});
