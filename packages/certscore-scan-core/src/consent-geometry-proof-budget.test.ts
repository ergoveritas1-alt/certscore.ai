import assert from "node:assert/strict";
import test from "node:test";
import { consentGeometryProofCdpBudget } from "./consent-geometry-proof-budget.js";

test("representative 450ms screenshot reserves useful time for both existing capture mechanisms", () => {
  assert.equal(consentGeometryProofCdpBudget(450), 225);
  assert.equal(consentGeometryProofCdpBudget(2_500), 1_750);
  for (const budget of [2, 50, 250, 450, 750, 1_000, 2_500, 10_000]) {
    const cdp = consentGeometryProofCdpBudget(budget);
    assert.ok(cdp >= 1 && cdp < budget && cdp <= 1_750);
  }
  assert.equal(consentGeometryProofCdpBudget(Number.NaN), 1);
});
