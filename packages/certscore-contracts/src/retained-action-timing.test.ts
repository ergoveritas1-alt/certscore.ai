import assert from "node:assert/strict";
import test from "node:test";
import { retainActionTiming, retainedActionTimingSchema, validateRetainedActionTiming } from "./retained-action-timing";

for (const action of ["accept", "reject"] as const) {
  test(`${action}: timing requires a retained packet and completed click`, () => {
    const input = { action, clickCompleted: true, actionDispatchedAtMs: 100,
      requests: [{ startedAtMs: 90 }, { startedAtMs: 250, hostname: "example.test" }] };
    assert.equal(retainActionTiming(input), undefined);
    assert.equal(retainActionTiming({ ...input, packetSha256: "a".repeat(64), clickCompleted: false }), undefined);
    const timing = retainActionTiming({ ...input, packetSha256: "a".repeat(64) })!;
    assert.equal(timing.firstRequest?.startedAtMs, 250);
    assert.equal(timing.observationEndedAtMs, undefined);
  });

  test(`${action}: the action window excludes later image-only traffic`, () => {
    const timing = retainActionTiming({ action, packetSha256: "a".repeat(64), clickCompleted: true,
      actionDispatchedAtMs: 100, observationEndedAtMs: 500,
      requests: [{ startedAtMs: 800 }, { startedAtMs: 500 }, { startedAtMs: 80 }] })!;
    assert.equal(timing.firstRequest?.startedAtMs, 500);
    assert.equal(retainedActionTimingSchema.safeParse({ ...timing, observationEndedAtMs: 99 }).success, false);
    assert.equal(retainedActionTimingSchema.safeParse({ ...timing, firstRequest: { startedAtMs: 501 } }).success, false);
  });

  test(`${action}: projection timing binds to the source action and dispatch`, () => {
    const timing = retainActionTiming({ action, packetSha256: "a".repeat(64), clickCompleted: true,
      actionDispatchedAtMs: 100, requests: [] })!;
    const source = { packetSha256: "a".repeat(64), actionControlProof: { action },
      interactionDiagnostics: { click: { outcome: "completed" } }, afterActionCapture: { actionDispatchedAtMs: 100 } };
    const schema = (projection: Parameters<typeof validateRetainedActionTiming>[1]) => retainedActionTimingSchema.superRefine((value, context) =>
      validateRetainedActionTiming(value, projection, action, context));
    assert.equal(schema(source).safeParse(timing).success, true);
    assert.equal(schema({ ...source, actionControlProof: { action: action === "accept" ? "reject" : "accept" } }).safeParse(timing).success, false);
    assert.equal(schema({ ...source, afterActionCapture: { actionDispatchedAtMs: 101 } }).safeParse(timing).success, false);
    assert.equal(schema({ ...source, interactionDiagnostics: { click: { outcome: "failed" } } }).safeParse(timing).success, false);
    const ended = { ...timing, observationEndedAtMs: 500 };
    assert.equal(schema({ ...source, registeredObservationCompletion: { completedAtMs: 500 } }).safeParse(ended).success, true);
    assert.equal(schema({ ...source, registeredObservationCompletion: { completedAtMs: 501 } }).safeParse(ended).success, false);
    assert.equal(schema({ ...source, afterActionCapture: { actionDispatchedAtMs: 100, captureEndedAtMs: 501 } }).safeParse(ended).success, false);
  });
}
