import assert from "node:assert/strict";
import test from "node:test";
import { assessWebDeployAncestry } from "./assert-forward-web-deploy";

const LIVE_SHA = "a".repeat(40);
const TARGET_SHA = "b".repeat(40);

test("forward web deployments are allowed", () => {
  assert.deepEqual(
    assessWebDeployAncestry({
      allowNonDescendant: false,
      isAncestor: true,
      liveSha: LIVE_SHA,
      targetSha: TARGET_SHA
    }),
    { allowed: true, reason: "forward_deploy" }
  );
});

test("the current live web revision can be redeployed", () => {
  assert.deepEqual(
    assessWebDeployAncestry({
      allowNonDescendant: false,
      isAncestor: false,
      liveSha: LIVE_SHA,
      targetSha: LIVE_SHA
    }),
    { allowed: true, reason: "same_revision" }
  );
});

test("non-descendant web deployments fail closed", () => {
  assert.deepEqual(
    assessWebDeployAncestry({
      allowNonDescendant: false,
      isAncestor: false,
      liveSha: LIVE_SHA,
      targetSha: TARGET_SHA
    }),
    { allowed: false, reason: "non_descendant" }
  );
});

test("an explicit emergency override permits a non-descendant deployment", () => {
  assert.deepEqual(
    assessWebDeployAncestry({
      allowNonDescendant: true,
      isAncestor: false,
      liveSha: LIVE_SHA,
      targetSha: TARGET_SHA
    }),
    { allowed: true, reason: "explicit_override" }
  );
});

test("invalid revision identifiers are rejected", () => {
  assert.throws(
    () => assessWebDeployAncestry({
      allowNonDescendant: false,
      isAncestor: true,
      liveSha: "main",
      targetSha: TARGET_SHA
    }),
    /Live web revision must be a full 40-character Git SHA/
  );
});

test("an explicit emergency override permits a legacy non-SHA live revision", () => {
  assert.deepEqual(
    assessWebDeployAncestry({
      allowNonDescendant: true,
      isAncestor: false,
      liveSha: "legacy-release-tag",
      targetSha: TARGET_SHA
    }),
    { allowed: true, reason: "explicit_override_unverifiable_live_revision" }
  );
});

test("an invalid target revision is rejected even with an emergency override", () => {
  assert.throws(
    () => assessWebDeployAncestry({
      allowNonDescendant: true,
      isAncestor: false,
      liveSha: LIVE_SHA,
      targetSha: "release-tag"
    }),
    /Target web revision must be a full 40-character Git SHA/
  );
});
