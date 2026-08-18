import assert from "node:assert/strict";
import test from "node:test";

import { validRequestId } from "./request-id";

test("scan submission recovery accepts opaque generated ids and rejects unsafe lookup keys", () => {
  assert.equal(validRequestId("4410d1d5-54cc-46dd-84bb-60f9bba56e8d"), true);
  assert.equal(validRequestId("bx01-1787093529928-abcdef0123456789"), true);
  assert.equal(validRequestId("short"), false);
  assert.equal(validRequestId("../../scan"), false);
  assert.equal(validRequestId("a".repeat(121)), false);
});
