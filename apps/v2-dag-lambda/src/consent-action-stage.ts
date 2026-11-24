export type ConsentActionStage =
  | "not_started"
  | "gate_declined"
  | "not_dispatched"
  | "worker_failed"
  | "worker_deadline_exceeded"
  | "packet_deadline_exceeded"
  | "packet_not_joined"
  | "exact_recheck_failed"
  | "packet_joined";

/** A terminal coordinator observation. It cannot grant action authority. */
export function consentActionStage(input: {
  started: boolean;
  dispatchStartedAtMs?: number;
  workerReturned: boolean;
  workerFailed?: boolean;
  workerReturnedAtMs?: number;
  deadlineAtMs?: number;
  timedOut: boolean;
  packetJoined: boolean;
  gateDeclined: boolean;
  recheck?: "passed" | "failed" | "not_run" | "unavailable";
}): ConsentActionStage {
  if (!input.started) return "not_started";
  if (input.gateDeclined) return "gate_declined";
  if (input.dispatchStartedAtMs === undefined) return "not_dispatched";
  if (input.recheck === "failed") return "exact_recheck_failed";
  if (input.packetJoined) return "packet_joined";
  if (input.timedOut) {
    const responseAfterDeadline = input.workerReturnedAtMs !== undefined && input.deadlineAtMs !== undefined &&
      input.workerReturnedAtMs >= input.deadlineAtMs;
    return input.workerReturned && !responseAfterDeadline ? "packet_deadline_exceeded" : "worker_deadline_exceeded";
  }
  if (input.workerFailed || !input.workerReturned) return "worker_failed";
  return "packet_not_joined";
}
