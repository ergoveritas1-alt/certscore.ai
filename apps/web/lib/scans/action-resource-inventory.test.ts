import assert from "node:assert/strict";
import test from "node:test";
import { projectActionResourceInventory } from "./action-resource-inventory";
import { observedControlAssessment } from "./test-fixtures/observed-control-assessment";
import { afterRejectProjection, afterRejectClickProjection } from "./test-fixtures/after-reject-scoring";

const input = {pageId:"fixture", action:"reject" as const, assessment:observedControlAssessment};
test("registered inventory retains request classification and the click clock without a new capture envelope", () => {
  const projection = afterRejectProjection("advertising"), original = structuredClone(projection);
  const result = projectActionResourceInventory({...input, projection})!;
  assert.equal(result.scope, "retained_capture");
  assert.equal(result.inventory.resources.length,1);
  assert.equal(result.inventory.resources[0]?.occurrence.firstSeenMs,90);
  assert.equal(result.inventory.resources[0]?.inventoryEvidence,"Non-essential");
  assert.equal(result.inventory.mix.type[0]?.count,1);
  assert.match(result.note,/storage presence does not establish a new write/);
  assert.deepEqual(projection,original);
});
test("activity-only historical records remain an explicitly bounded sample", () => {
  const projection={...afterRejectProjection(),scoringEvidence:undefined};
  const result=projectActionResourceInventory({...input,projection})!;
  assert.equal(result.scope,"activity_sample");
  assert.match(result.note,/Counts are sample counts/);
  assert.equal(result.inventory.resources[0]?.occurrence.firstSeenMs,80);
  assert.equal(result.clockLabel,"Times from confirmed Reject");
  assert.equal(projectActionResourceInventory({...input,projection:{...projection,postRefusalActivity:[]}}),null);
});
test("click-only inventories preserve unknown classification and do not promote consent registration", () => {
  const projection=afterRejectClickProjection();
  const row=projection.afterActionRequests![0]!;row.nonEssential=false;row.purpose="unknown";
  projection.scoringEvidence=undefined;
  const result=projectActionResourceInventory({...input,projection})!;
  assert.equal(result.inventory.resources[0]?.inventoryEvidence,"Unclassified");
  assert.equal(projection.registrationStatus,"unconfirmed");
  assert.equal(projectActionResourceInventory({...input,projection:{...projection,afterActionRequests:[]}}),null);
  assert.equal(projectActionResourceInventory({...input,projection,assessment:undefined}),null);
  assert.equal(projectActionResourceInventory({...input,projection:{...projection,packetSha256:undefined}}),null);
});
