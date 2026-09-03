export const PASSIVE_EVIDENCE_INITIAL_QUIET_WINDOW_MS = 250;

export type PassiveEvidenceQuietWindowResult = {
  elapsedMs: number;
  inFlightRequestCount: number;
  quietForMs: number;
  status: "quiet" | "timed_out";
};

export type PassiveEvidenceActivityTracker = {
  markRequestFinished(request: object, observedAtMs?: number): void;
  markRequestStarted(request: object, observedAtMs?: number): void;
  noteActivity(observedAtMs?: number): void;
  snapshot(observedAtMs?: number): {
    inFlightRequestCount: number;
    quietForMs: number;
  };
};

export function createPassiveEvidenceActivityTracker(
  initialObservedAtMs = Date.now(),
): PassiveEvidenceActivityTracker {
  const inFlightRequests = new Set<object>();
  let lastActivityAtMs = initialObservedAtMs;
  const noteActivity = (observedAtMs = Date.now()) => {
    lastActivityAtMs = Math.max(lastActivityAtMs, observedAtMs);
  };
  return {
    markRequestFinished(request, observedAtMs = Date.now()) {
      inFlightRequests.delete(request);
      noteActivity(observedAtMs);
    },
    markRequestStarted(request, observedAtMs = Date.now()) {
      inFlightRequests.add(request);
      noteActivity(observedAtMs);
    },
    noteActivity,
    snapshot(observedAtMs = Date.now()) {
      return {
        inFlightRequestCount: inFlightRequests.size,
        quietForMs: Math.max(0, observedAtMs - lastActivityAtMs),
      };
    },
  };
}

export async function waitForPassiveEvidenceQuietWindow(input: {
  now?: () => number;
  pollIntervalMs?: number;
  quietWindowMs?: number;
  timeoutMs: number;
  tracker: PassiveEvidenceActivityTracker;
  wait?: (durationMs: number) => Promise<void>;
}): Promise<PassiveEvidenceQuietWindowResult> {
  const now = input.now ?? Date.now;
  const wait = input.wait ?? ((durationMs: number) => new Promise<void>((resolve) => {
    setTimeout(resolve, durationMs);
  }));
  const quietWindowMs = Math.max(1, input.quietWindowMs ?? PASSIVE_EVIDENCE_INITIAL_QUIET_WINDOW_MS);
  const timeoutMs = Math.max(1, input.timeoutMs);
  const pollIntervalMs = Math.max(10, Math.min(input.pollIntervalMs ?? 25, quietWindowMs));
  const startedAtMs = now();

  // The quiet clock begins at this explicit post-navigation checkpoint. This
  // prevents activity that happened before DOM readiness from satisfying the
  // gate immediately while preserving the full hard timeout as a fail-closed
  // upper bound.
  input.tracker.noteActivity(startedAtMs);

  while (true) {
    const observedAtMs = now();
    const snapshot = input.tracker.snapshot(observedAtMs);
    const elapsedMs = Math.max(0, observedAtMs - startedAtMs);
    if (
      snapshot.inFlightRequestCount === 0 &&
      snapshot.quietForMs >= quietWindowMs
    ) {
      return { ...snapshot, elapsedMs, status: "quiet" };
    }
    if (elapsedMs >= timeoutMs) {
      return { ...snapshot, elapsedMs, status: "timed_out" };
    }
    await wait(Math.min(pollIntervalMs, timeoutMs - elapsedMs));
  }
}
