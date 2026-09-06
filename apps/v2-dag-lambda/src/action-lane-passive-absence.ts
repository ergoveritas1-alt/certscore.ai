/** Independent sessions can disagree. Passive absence never negates a returned
 * action result; an unfinished action adds no tail wait solely for that dispute. */
export function actionLanePassiveAbsenceDisposition(input: {
  dispatchStartedAtMs?: number;
  settled: boolean;
  passiveBarrierReached: boolean;
}): "keep_terminal" | "cancel_not_dispatched" | "await_passive_barrier" | "cancel_incomplete" {
  if (input.settled) return "keep_terminal";
  if (input.dispatchStartedAtMs === undefined) return "cancel_not_dispatched";
  return input.passiveBarrierReached ? "cancel_incomplete" : "await_passive_barrier";
}
