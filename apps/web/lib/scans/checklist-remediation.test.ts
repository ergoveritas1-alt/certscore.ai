import assert from "node:assert/strict";
import test from "node:test";
import { checklistRemediation } from "./checklist-remediation";
test("unconfirmed consent guidance investigates capture, not policy disclosure or assumed absence", () => {
  const result = checklistRemediation({ rowId: "options_settings_preferences_control", status: "Not confirmed" });
  assert.match(result!.steps.join(" "), /Options.*evidence limitation.*confirmed consent registration/);
  assert.doesNotMatch(result!.steps.join(" "), /update the privacy/);
});
test("DPO guidance separates applicability and designation", () => {
  assert.match(checklistRemediation({ rowId: "dpo_contact_point_disclosure", status: "Not confirmed" })!.steps.join(" "), /applicability|designation is required separately/);
  assert.equal(checklistRemediation({ rowId: "accept_consent_control", status: "Observed" })!.kind, "none");
});
test("runtime guidance preserves evidence limits and defines scenario-specific retests", () => {
  const storage = checklistRemediation({ rowId: "pre_consent_cookies_storage", status: "Gap observed" })!;
  assert.match(storage.steps.join(" "), /directly observed write from snapshot presence/);
  assert.match(storage.steps.join(" "), /fresh session.*Reject.*Accept/);
  const replay = checklistRemediation({ rowId: "session_replay_fingerprinting_review", status: "Needs review" })!;
  assert.match(replay.steps.join(" "), /field masking/);
  assert.equal(checklistRemediation({ rowId: "session_replay_fingerprinting_review", status: "Not observed" })?.kind, "none");
});
