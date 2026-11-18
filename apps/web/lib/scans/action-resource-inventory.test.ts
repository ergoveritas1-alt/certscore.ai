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

test("a full after-click clock with verified navigation remains a partial choice observation", () => {
  const projection = afterRejectClickProjection("advertising");
  const counted = projectActionResourceInventory({ ...input, projection: {
    ...projection,
    interactionDiagnostics: {
      ...projection.interactionDiagnostics,
      postClickNavigation: { scope: "main_frame", outcome: "main_frame_navigated", elapsedAfterClickMs: 45 },
    },
  } });
  assert.equal(counted?.measurement?.documentChanged, true);
  assert.equal(counted?.measurement?.requestCoverage, "limited");
  assert.equal(counted?.measurement?.elapsedMs, 510);
  assert.equal(counted?.inventory.resources[0]?.inventoryEvidence, "Non-essential");
});

test("a legacy cookie-write attempt cannot add a flagged item without stored or sent evidence", () => {
  const p = afterRejectProjection();
  const row = { ...p.postRefusalActivity[0], activityType: "storage_write", storageType: "cookie", storageName: "_fbp" };
  const capture = projectActionResourceInventory({ ...input, projection: {
    ...p, scoringEvidence: undefined, postRefusalActivity: [row],
  } });
  assert.ok(capture);
  assert.equal(capture.inventory.resources[0]?.inventoryEvidence, "Unclassified");
});

test("choice request identities ignore query variants and keep positive evidence across repetitions", () => {
  const p = afterRejectClickProjection();
  const source = p.afterActionRequests![0]!;
  const repeat = { ...source, requestId: "another", sanitizedUrl: source.sanitizedUrl + "?test=1" };
  const capture = projectActionResourceInventory({ ...input, projection: {
    ...p, afterActionCapture: { ...p.afterActionCapture, requestIds: [source.requestId, repeat.requestId],
      requestAncestry: [source, repeat].map(r => ({ requestId: r.requestId, rootStartedAtMs: r.rootStartedAtMs })) },
    afterActionRequests: [{ ...source, nonEssential: false, vendor: undefined, purpose: "unknown" }, repeat],
  } });
  assert.ok(capture);
  assert.equal(capture.inventory.resources.length, 1);
  assert.equal(capture.inventory.resources[0]?.inventoryEvidence, "Non-essential");
});
