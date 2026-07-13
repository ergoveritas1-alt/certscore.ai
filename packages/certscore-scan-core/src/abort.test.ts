import assert from "node:assert/strict";
import test from "node:test";
import { abortReason, boundedCleanup, throwIfAborted } from "./abort.js";

test("throwIfAborted preserves the shared cancellation reason", () => {
  const controller = new AbortController();
  const reason = new Error("scanner deadline reached");
  controller.abort(reason);
  assert.equal(abortReason(controller.signal), reason);
  assert.throws(() => throwIfAborted(controller.signal), (error) => error === reason);
});

test("boundedCleanup does not let slow browser cleanup consume the publication reserve", async () => {
  const startedAt = Date.now();
  await boundedCleanup(new Promise(() => undefined), 20);
  assert.ok(Date.now() - startedAt < 200);
});
