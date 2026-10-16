import type { ScannerImageControl, ScannerImageState } from "./scanner-image-provenance.js";

const FLAG = "CERTSCORE_CMP_PREFERENCE_INSPECTION_ENABLED";
const ACTION_FLAGS = ["CERTSCORE_POST_ACCEPT_WORKER_ENABLED", "CERTSCORE_POST_REFUSAL_REJECT_WORKER_ENABLED"];

function requireEnabledActions(state: ScannerImageState) {
  if (ACTION_FLAGS.some(key => state.variables[key] !== "1")) {
    throw new Error("Accept and Reject must remain enabled; refusing configuration change.");
  }
}

/** Configuration-only kill switch. Never changes code, capacity or other settings. */
export async function disableCmpPreferenceLane(control: ScannerImageControl, apply: boolean) {
  const before = await control.read();
  requireEnabledActions(before);
  const expected = { ...before.variables, [FLAG]: "0" };
  const changed = before.variables[FLAG] !== "0";
  if (apply && changed) {
    await control.environment(expected, before.revisionId);
    await control.wait();
  }
  const after = apply ? await control.read() : before;
  requireEnabledActions(after);
  if (apply && (after.imageUri !== before.imageUri || Object.keys(after.variables).length !== Object.keys(expected).length ||
    Object.entries(expected).some(([key, value]) => after.variables[key] !== value))) {
    throw new Error("Scanner configuration failed to converge or unrelated settings changed.");
  }
  return { applied: apply, changed: apply && changed, wouldChange: changed,
    imageUri: after.imageUri, revisionId: after.revisionId,
    preferences: apply ? after.variables[FLAG] : before.variables[FLAG] ?? null,
    accept: after.variables[ACTION_FLAGS[0]!], reject: after.variables[ACTION_FLAGS[1]!] };
}
