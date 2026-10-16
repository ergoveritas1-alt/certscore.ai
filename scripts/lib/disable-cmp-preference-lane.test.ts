import assert from "node:assert/strict";
import test from "node:test";
import { disableCmpPreferenceLane } from "./disable-cmp-preference-lane.js";
import type { ScannerImageControl, ScannerImageState } from "./scanner-image-provenance.js";

function fixture() {
  let state: ScannerImageState = { imageUri: "unchanged-image", revisionId: "revision-1", state: "Active", updateStatus: "Successful",
    variables: { CERTSCORE_CMP_PREFERENCE_INSPECTION_ENABLED: "1", CERTSCORE_POST_ACCEPT_WORKER_ENABLED: "1",
      CERTSCORE_POST_REFUSAL_REJECT_WORKER_ENABLED: "1", OTHER: "preserved" } };
  const updates: unknown[] = [];
  const control: ScannerImageControl = {
    async read() { return structuredClone(state); },
    async environment(variables, revisionId) { assert.equal(revisionId, state.revisionId); updates.push(variables); state = { ...state, variables, revisionId: "revision-2" }; },
    async code() { assert.fail("No code deployment allowed"); }, async wait() {},
  };
  return { control, updates, setState(next: ScannerImageState) { state = next; } };
}

test("preference kill switch preserves actions and unrelated configuration, and is idempotent", async () => {
  const f = fixture();
  assert.equal((await disableCmpPreferenceLane(f.control, false)).wouldChange, true);
  assert.equal(f.updates.length, 0);
  const result = await disableCmpPreferenceLane(f.control, true);
  assert.equal(result.preferences, "0"); assert.equal(result.accept, "1"); assert.equal(result.reject, "1");
  assert.equal((await f.control.read()).variables.OTHER, "preserved");
  assert.equal((await disableCmpPreferenceLane(f.control, true)).changed, false);
  assert.equal(f.updates.length, 1);
});

test("preference kill switch fails closed if actions are disabled or unrelated state drifts", async () => {
  const f = fixture(), original = await f.control.read();
  f.setState({ ...original, variables: { ...original.variables, CERTSCORE_POST_ACCEPT_WORKER_ENABLED: "0" } });
  await assert.rejects(disableCmpPreferenceLane(f.control, true), /Accept and Reject/);
  assert.equal(f.updates.length, 0);
  f.setState(original);
  f.control.environment = async variables => { f.setState({ ...original, variables: { ...variables, OTHER: "drifted" } }); };
  await assert.rejects(disableCmpPreferenceLane(f.control, true), /unrelated settings changed/);
});
