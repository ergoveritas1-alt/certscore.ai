import assert from "node:assert/strict";
import test from "node:test";
import { formSnapshotExplanation } from "./form-snapshot-status";
test("snapshot display uses retained reasons and leaves historical causes unspecified", () => {
  assert.equal(formSnapshotExplanation("review_timed_out"), "Image safety review reached its time limit.");
  assert.equal(formSnapshotExplanation("no_visible_context"), "No visible form detail remained in the masked image.");
  assert.equal(formSnapshotExplanation(), "Reason not recorded for this scan.");
  assert.equal(formSnapshotExplanation("guessed_hidden_form"), "Reason not recorded for this scan.");
});
