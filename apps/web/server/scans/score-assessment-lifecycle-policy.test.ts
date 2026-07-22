import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyVersionedScoreLifecycleTime,
  VERSIONED_SCORE_LIFECYCLE_STARTED_AT
} from "./score-assessment-lifecycle-policy";

test("versioned score lifecycle never backfills historical scans", () => {
  assert.equal(
    classifyVersionedScoreLifecycleTime("2026-07-22T06:29:59.999Z"),
    "historical"
  );
  assert.equal(
    classifyVersionedScoreLifecycleTime(VERSIONED_SCORE_LIFECYCLE_STARTED_AT),
    "eligible"
  );
  assert.equal(
    classifyVersionedScoreLifecycleTime("2026-07-22T06:32:17.393Z"),
    "eligible"
  );
});

test("versioned score lifecycle fails closed without a valid scoring time", () => {
  assert.equal(classifyVersionedScoreLifecycleTime(null), "missing_or_invalid");
  assert.equal(classifyVersionedScoreLifecycleTime(undefined), "missing_or_invalid");
  assert.equal(classifyVersionedScoreLifecycleTime("not-a-time"), "missing_or_invalid");
});
