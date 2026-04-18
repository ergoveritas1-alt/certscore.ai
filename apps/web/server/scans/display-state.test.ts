import assert from "node:assert/strict";
import test from "node:test";
import { deriveDisplayCreatedAt } from "./display-state";

test("keeps created timestamp when it is before scan start", () => {
  const displayCreatedAt = deriveDisplayCreatedAt({
    completedAt: "2026-04-18T11:30:06.441Z",
    createdAt: "2026-04-18T11:29:37.356Z",
    startedAt: "2026-04-18T11:29:37.718Z"
  });

  assert.equal(displayCreatedAt, "2026-04-18T11:29:37.356Z");
});

test("falls back to lifecycle timestamp when created timestamp is later than scan start", () => {
  const displayCreatedAt = deriveDisplayCreatedAt({
    completedAt: "2026-04-18T11:30:06.441Z",
    createdAt: "2026-04-18T18:29:37.356Z",
    startedAt: "2026-04-18T11:29:37.718Z"
  });

  assert.equal(displayCreatedAt, "2026-04-18T11:29:37.718Z");
});
