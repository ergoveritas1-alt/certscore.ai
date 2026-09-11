import assert from "node:assert/strict";
import test from "node:test";
import type { CanonicalEvidenceBundle } from "@certscore/contracts";
import { consentActionPassiveBarrierLimits } from "./consent-action-tail-policy";
import { actionLanePassiveAbsenceDisposition } from "./action-lane-passive-absence";

test("new passive vocabulary preserves action work ceiling without cancelling returned evidence", () => {
  const bundle = { consentUiObservations: [{ observedAtMs: 1, basis: [], controls: [
    { actionType: "accept_all", visible: true, classifierReasonCodes: ["observation_only_label"] },
    { actionType: "reject_all", visible: true, classifierReasonCodes: ["matched_reject"] },
  ] }] } as unknown as CanonicalEvidenceBundle;
  assert.deepEqual(consentActionPassiveBarrierLimits(bundle), { acceptPassiveBarrierOnly: true });
  assert.equal(actionLanePassiveAbsenceDisposition({ settled: true, passiveBarrierReached: true }), "keep_terminal");
  assert.equal(actionLanePassiveAbsenceDisposition({ settled: false, passiveBarrierReached: true, dispatchStartedAtMs: 1 }), "cancel_incomplete");
  assert.equal(actionLanePassiveAbsenceDisposition({ settled: false, passiveBarrierReached: false, dispatchStartedAtMs: 1 }), "await_passive_barrier");
});

test("unresolved passive inventory does not add action tail waits for missing candidates", () => {
  const bundle = { consentUiObservations: [{ observedAtMs: 1, basis: ["unresolved_visible_consent_decision"], controls: [
    { actionType: "accept_all", visible: true },
  ] }] } as unknown as CanonicalEvidenceBundle;
  assert.deepEqual(consentActionPassiveBarrierLimits(bundle), { rejectPassiveBarrierOnly: true });
});

test("ordinary existing complete and limited inventories keep their scheduling policy", () => {
  for (const limitationKeys of [[], ["geometry_capture_unavailable"]]) {
    const bundle = { consentSurfaceInspection: { limitationKeys }, consentUiObservations: [] } as unknown as CanonicalEvidenceBundle;
    assert.deepEqual(consentActionPassiveBarrierLimits(bundle), {});
  }
});
