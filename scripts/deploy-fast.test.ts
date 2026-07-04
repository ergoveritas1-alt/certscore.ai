import assert from "node:assert/strict";
import test from "node:test";
import { selectWorkflowDispatchRef } from "./deploy-fast";

test("selectWorkflowDispatchRef uses the current branch when no explicit ref is provided", () => {
  assert.equal(
    selectWorkflowDispatchRef({
      currentBranch: "codex/fix-bild-german-gdpr-controls",
      explicitRef: null
    }),
    "codex/fix-bild-german-gdpr-controls"
  );
});

test("selectWorkflowDispatchRef preserves explicit branch or tag refs", () => {
  assert.equal(
    selectWorkflowDispatchRef({
      currentBranch: "main",
      explicitRef: "release-2026-07-04"
    }),
    "release-2026-07-04"
  );
});

test("selectWorkflowDispatchRef rejects raw commit SHAs", () => {
  assert.throws(
    () => selectWorkflowDispatchRef({
      currentBranch: "main",
      explicitRef: "6d4d057ba396c65d50d5fc34d79c570dd74e1721"
    }),
    /branch or tag/
  );
});

test("selectWorkflowDispatchRef rejects detached HEAD without an explicit dispatch ref", () => {
  assert.throws(
    () => selectWorkflowDispatchRef({ currentBranch: "HEAD", explicitRef: null }),
    /detached HEAD/
  );
});
