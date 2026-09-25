import assert from "node:assert/strict";
import test from "node:test";
import type { GpcBoundedObservation } from "@certscore/contracts";
import { describeGpcObservedFacts } from "./gpc-observed-facts";

export function observedGpcFixture(): GpcBoundedObservation {
  return {
    contractVersion: "certscore.gpc-bounded-observation.v1", scope: "main_document_and_retained_http_requests",
    status: "complete", sourceSha256: "a".repeat(64), sessionSha256: "b".repeat(64), documentUrlSha256: "c".repeat(64),
    delivery: { httpHeaderRetained: true, mainNavigatorReadbackRetained: true, fullContextVerified: false },
    semanticProbe: "observed", registration: { basis: "current_recorded_state", sale: "opted_out", sharing: "not_opted_out", cmpGpcSignal: "received", causedByGpc: "not_established" },
    acknowledgment: { observed: true, captureComplete: true },
    requests: { count: 3, blockedBeforeTransmissionCount: 0, complete: true, fromMs: 0, documentCommittedAtMs: 0, throughMs: 1000,
      classifiedCount: 2, collectionCount: 1, evidenceIds: ["r1", "r2"], samplesTruncated: false },
    limitationKeys: [], scoreEffect: "none", legalInterpretation: "not_assessed",
  };
}

test("leads with recorded activity and state without turning them into honoring or a failure", () => {
  const observation = observedGpcFixture(), before = structuredClone(observation);
  const facts = describeGpcObservedFacts(observation);
  assert.equal(facts[0]?.value, "2 tracking requests observed with GPC");
  assert.deepEqual(facts.find(f => f.label === "Site-recorded sale opt-out"), { label: "Site-recorded sale opt-out", value: "Opted out" });
  assert.deepEqual(facts.find(f => f.label === "Site-recorded sharing opt-out"), { label: "Site-recorded sharing opt-out", value: "Not opted out" });
  assert.ok(facts.some(f => f.label === "Visible GPC acknowledgment"));
  assert.doesNotMatch(JSON.stringify(facts), /honored|compliant|violation|failed|indeterminate/i);
  assert.deepEqual(observation, before);
});

test("partial observations retain positive facts but cannot turn zero into absence", () => {
  const observation = observedGpcFixture();
  observation.status = "limited";
  observation.requests.complete = false;
  assert.match(describeGpcObservedFacts(observation)[0]!.value, /2 tracking requests/);
  observation.requests.classifiedCount = 0;
  observation.registration.sale = "unknown";
  observation.registration.sharing = "unknown";
  observation.registration.cmpGpcSignal = "unknown";
  observation.acknowledgment.observed = false;
  assert.deepEqual(describeGpcObservedFacts(observation), [{ label: "GPC signal", value: "Observed on the page request and in the browser" }]);
  observation.status = "complete";
  observation.requests.complete = true;
  assert.equal(describeGpcObservedFacts(observation)[0]?.value, "No classified tracking requests observed in this capture");
});

test("missing or unavailable observations do not acquire facts from comparison deltas", () => {
  assert.deepEqual(describeGpcObservedFacts(), []);
  assert.deepEqual(describeGpcObservedFacts({ ...observedGpcFixture(), status: "unavailable" }), []);
  for (const key of ["sourceSha256", "sessionSha256", "documentUrlSha256"] as const) {
    assert.deepEqual(describeGpcObservedFacts({ ...observedGpcFixture(), [key]: null }), []);
  }
});
