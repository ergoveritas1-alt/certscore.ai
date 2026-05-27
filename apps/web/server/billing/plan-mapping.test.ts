import assert from "node:assert/strict";
import test from "node:test";
import {
  getCheckoutCancelPath,
  getPublicCheckoutPlanCode,
  normalizeCheckoutPlan,
  parseSelfServeCheckoutPlan
} from "./plan-mapping";

test("normalizes public Starter alias to the internal individual plan", () => {
  assert.equal(normalizeCheckoutPlan("starter"), "individual");
  assert.equal(normalizeCheckoutPlan("individual"), "individual");
  assert.equal(getPublicCheckoutPlanCode("individual"), "starter");
});

test("accepts Pro for self-serve checkout", () => {
  assert.equal(normalizeCheckoutPlan("pro"), "pro");
  assert.equal(parseSelfServeCheckoutPlan("pro"), "pro");
  assert.equal(getPublicCheckoutPlanCode("pro"), "pro");
});

test("rejects unknown plans and Custom for self-serve checkout", () => {
  assert.equal(normalizeCheckoutPlan("custom"), null);
  assert.equal(normalizeCheckoutPlan("team"), null);
  assert.equal(normalizeCheckoutPlan("free"), null);
  assert.throws(() => parseSelfServeCheckoutPlan("custom"), /Starter or Pro/);
});

test("checkout cancellation URL never exposes an internal individual plan name", () => {
  assert.equal(getCheckoutCancelPath("individual"), "/pricing?checkout=cancelled&plan=starter");
  assert.equal(getCheckoutCancelPath("pro"), "/pricing?checkout=cancelled&plan=pro");
});
