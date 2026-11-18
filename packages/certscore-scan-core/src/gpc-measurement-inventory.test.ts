import assert from "node:assert/strict";
import test from "node:test";
import type { CanonicalEvidenceBundle, GpcBoundedObservation } from "@certscore/contracts";
import { buildGpcMeasurementInventory } from "./gpc-measurement-inventory";
import { gpcDocumentHash } from "./gpc-signal-capture";

test("supplemental endpoints require matching signal, request and successful response proof", () => {
  const scanId = "fixture", sourceSha256 = "a".repeat(64), doc = "b".repeat(64);
  const url = "https://measure.fixture.test/g/collect?v=2&tid=G-FIXTURE&en=page_view&cid=private-value";
  const event = {eventId:"event", requestId:"request", method:"GET", resourceType:"fetch", requestUrl:url,
    timestampMs:5, requestHeaders:{secGpc:"1"}};
  const observation = {scanId, sourceSha256, documentUrlSha256:doc, delivery:{httpHeaderRetained:true, mainNavigatorReadbackRetained:true}} as GpcBoundedObservation;
  const bundle = {scanId, runtimeEvidenceGraphs:[{scenario:"gpc", captureId:scanId+":gpc_observation", sourceHash:"c".repeat(64)}],
    gpcObservationSession:{scanId, captureStartedAtMs:0, captureEndedAtMs:10, mainDocument:{documentUrlSha256:doc},
      requests:[{eventId:event.eventId, timestampMs:event.timestampMs, secGpc:"1", urlSha256:gpcDocumentHash(url)}]},
    networkEvents:[event], networkResponseEvents:[{requestId:event.requestId, responseUrl:url, timestampMs:6, status:200}],
  } as unknown as CanonicalEvidenceBundle;
  const read = (source = bundle) => buildGpcMeasurementInventory(source, sourceSha256, observation);
  assert.deepEqual(read()?.endpoints, [{hostname:"measure.fixture.test", role:"analytics", method:"GET", count:1, firstSeenMs:5}]);
  assert.doesNotMatch(JSON.stringify(read()), /private-value|G-FIXTURE/);
  assert.equal(buildGpcMeasurementInventory(bundle, "d".repeat(64), observation), undefined);
  for (const change of [
    (b: CanonicalEvidenceBundle) => { b.networkResponseEvents[0]!.status = undefined; },
    (b: CanonicalEvidenceBundle) => { b.networkResponseEvents[0]!.status = 503; },
    (b: CanonicalEvidenceBundle) => { b.networkResponseEvents[0]!.requestId = "other"; },
    (b: CanonicalEvidenceBundle) => { b.networkResponseEvents[0]!.responseUrl = "https://fixture.test/"; },
    (b: CanonicalEvidenceBundle) => { b.gpcObservationSession!.requests[0]!.secGpc = null; },
    (b: CanonicalEvidenceBundle) => { b.gpcObservationSession!.requests[0]!.urlSha256 = doc; },
    (b: CanonicalEvidenceBundle) => { b.networkEvents[0]!.timestampMs++; },
  ]) {
    const changed = structuredClone(bundle);
    change(changed);
    assert.equal(read(changed), undefined);
  }
});
