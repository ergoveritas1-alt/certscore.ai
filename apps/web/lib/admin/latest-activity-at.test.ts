import assert from "node:assert/strict";
import test from "node:test";
import { latestActivityAt } from "./latest-activity-at";

test("latest activity selects the newer requested or associated timestamp", () => {
  assert.equal(
    latestActivityAt("2026-08-12T22:50:04.138Z", "2026-08-12T22:50:04.144Z"),
    "2026-08-12T22:50:04.144Z"
  );
  assert.equal(
    latestActivityAt("2026-08-12T22:50:05.000Z", "2026-08-12T22:50:04.999Z"),
    "2026-08-12T22:50:05.000Z"
  );
});

test("latest activity accepts database Date values and ignores missing values", () => {
  assert.equal(latestActivityAt(null, new Date("2026-08-12T22:50:04.144Z")), "2026-08-12T22:50:04.144Z");
  assert.equal(latestActivityAt(null, undefined, ""), null);
});
