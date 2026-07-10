import assert from "node:assert/strict";
import test from "node:test";
import { adaptivePollIntervalMs } from "./poll.js";

test("adaptive polling checks quickly first and backs off for long scans", () => {
  assert.equal(adaptivePollIntervalMs(0), 1_000);
  assert.equal(adaptivePollIntervalMs(14_999), 1_000);
  assert.equal(adaptivePollIntervalMs(15_000), 2_000);
  assert.equal(adaptivePollIntervalMs(44_999), 2_000);
  assert.equal(adaptivePollIntervalMs(45_000), 5_000);
});
