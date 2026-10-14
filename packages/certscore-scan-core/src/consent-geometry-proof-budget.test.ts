import assert from "node:assert/strict";
import test from "node:test";
import { consentGeometryProofCdpBudget, consentProminenceSettleBudgetMs } from "./consent-geometry-proof-budget.js";

test("representative 450ms screenshot reserves useful time for both existing capture mechanisms", () => {
  assert.equal(consentGeometryProofCdpBudget(450), 225);
  assert.equal(consentGeometryProofCdpBudget(2_500), 1_750);
  for (const budget of [2, 50, 250, 450, 750, 1_000, 2_500, 10_000]) {
    const cdp = consentGeometryProofCdpBudget(budget);
    assert.ok(cdp >= 1 && cdp < budget && cdp <= 1_750);
  }
  assert.equal(consentGeometryProofCdpBudget(Number.NaN), 1);
});

test("prominence settling stays within the approved 7.5 GB-second compute ceiling", () => {
  for (const memory of [512, 1024, 3008, 4096, 10240]) {
    const ms = consentProminenceSettleBudgetMs(memory);
    assert.ok(ms > 0 && ms <= 3000);
    assert.ok(ms / 1000 * memory / 1024 <= 7.5);
  }
  assert.equal(consentProminenceSettleBudgetMs(), 2553);
  for (const memory of [0, -1, NaN, Infinity, 10241]) assert.equal(consentProminenceSettleBudgetMs(memory), 750);
});
