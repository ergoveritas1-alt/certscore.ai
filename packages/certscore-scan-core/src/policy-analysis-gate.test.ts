import assert from "node:assert/strict";
import test from "node:test";
import { canStartPolicyAnalysis, createPolicyAnalysisGate } from "./policy-analysis-gate";

test("policy analysis permission waits for capture and settles all waiters once", async () => {
  const gate = createPolicyAnalysisGate();
  let ran = false;
  const a = gate.permission.then(value => { ran = true; return value; });
  await Promise.resolve(); assert.equal(ran, false);
  gate.finish(true); gate.discard();
  assert.deepEqual(await Promise.all([a, gate.permission]), [true, true]);
});

for (const reason of ["failure", "timeout", "no_inspection", "skipped"] as const) {
  test(`policy analysis permission cannot reopen after ${reason}`, async () => {
    const gate = createPolicyAnalysisGate(); gate.discard(); gate.finish(true);
    assert.equal(await gate.permission, false);
  });
}

for (const alreadyAborted of [false, true]) {
  test(`policy analysis cancellation settles without capture (already aborted: ${alreadyAborted})`, async () => {
    const controller = new AbortController(); if (alreadyAborted) controller.abort();
    const gate = createPolicyAnalysisGate(controller.signal); controller.abort(); gate.finish(true);
    assert.equal(await gate.permission, false);
  });
}

test("late work rechecks remaining budget and cancellation after permission", async () => {
  const controller = new AbortController(), gate = createPolicyAnalysisGate(controller.signal);
  gate.finish(true); assert.equal(await gate.permission, true);
  assert.equal(canStartPolicyAnalysis(controller.signal, 1000, 750), true);
  assert.equal(canStartPolicyAnalysis(controller.signal, 1000, 751), false);
  assert.equal(canStartPolicyAnalysis(controller.signal, 1000, 1000), false);
  assert.equal(canStartPolicyAnalysis(controller.signal, 1000, 1200), false);
  controller.abort();
  assert.equal(canStartPolicyAnalysis(controller.signal, 1000, 100), false);
});
