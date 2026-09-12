import assert from "node:assert/strict";
import test from "node:test";
import { buildRetainedRequestInventory } from "./retained-request-inventory";
import { buildSinglePageResourceInventory } from "./single-page-resource-inventory";
const event = { requestUrl: "https://example.test/script.js?session=secret", preConsent: true, timestampMs: 100, thirdParty: false, method: "GET" };
function input(events: unknown[]) { return { networkSummary: {metricBasis: "retained_unique_request_events", preConsentRequestCount: events.length, retainedRequestEventCount: events.length, totalRequestCount: events.length}, requestObservations: events }; }
test("complete request inventory counts every event without relying on vendor samples", () => {
  const requests = buildRetainedRequestInventory({...input([event, {...event,timestampMs:200}, {...event, method:"POST"}]), requestPurposeClassificationConfidence: []});
  assert.equal(requests?.length, 3);
  const inventory = buildSinglePageResourceInventory("page", [], requests);
  assert.equal(inventory.resources.length, 2);
  assert.deepEqual(inventory.requestMetric, {label:"Network requests",value:3,counts:{nonEssential:0,review:3,contextual:0,essential:0}});
  assert.equal(inventory.resources.reduce((n,row)=>n+row.eventCount,0),3);
  assert.deepEqual(inventory.mix.evidence,[{label:"Review",count:2}]);
  assert.equal(inventory.resources[0]?.occurrence.firstSeenMs,100);
  assert.ok(inventory.resources.every(row => row.inventoryEvidence !== "Essential"));
  assert.ok(inventory.resources.every(row => !row.name.includes("secret") && !row.key.includes("secret")));
});
test("missing, mismatched, or malformed retained events cannot produce a complete breakdown", () => {
  assert.equal(buildRetainedRequestInventory({...input([event]),requestObservations:[]}),null);
  assert.equal(buildRetainedRequestInventory(input([{...event,timestampMs:-1}])),null);
  assert.equal(buildRetainedRequestInventory(input([{...event,preConsent:false}])),null);
  assert.equal(buildRetainedRequestInventory(input([{...event,requestUrl:"bad"}])),null);
  assert.equal(buildRetainedRequestInventory(input([{...event,requestUrl:"javascript:alert(1)"}])),null);
  assert.equal(buildRetainedRequestInventory(input([{...event,requestUrl:"https://name:password@example.test/"}])),null);
  assert.equal(buildRetainedRequestInventory({}),null);
  assert.deepEqual(buildRetainedRequestInventory(input([])),[]);
});
test("canonical classification is shared with the site inventory; unknowns stay review", () => {
  const inventory = buildSinglePageResourceInventory("page", [], buildRetainedRequestInventory(input([event, {...event,requestUrl:"https://js.stripe.com/v3/",thirdParty:true}])));
  assert.ok(inventory.resources.some(row => row.inventoryEvidence === "Essential"));
  assert.ok(inventory.resources.some(row => row.inventoryEvidence === "Review"));
  assert.equal(inventory.services.flatMap(row=>row.resources).length,2);
});

test("inventories larger than the vendor display sample retain their complete denominator", () => {
  const requests = buildRetainedRequestInventory(input(Array.from({length:80},(_,index)=>({...event, requestUrl:`https://example.test/${index}`}))));
  assert.equal(requests?.length,80);
  const inventory=buildSinglePageResourceInventory("page",[],requests);
  assert.equal(inventory.requestMetric?.value,80);
  assert.equal(inventory.requestMetric?.counts.review,80);
  assert.equal(inventory.resources.length,80);
});
