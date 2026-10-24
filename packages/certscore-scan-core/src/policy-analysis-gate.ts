/** One-shot permission for speculative CPU preparation, never for fetching or
 * evidence eligibility. The capture owner must settle this in its finally path. */
export function createPolicyAnalysisGate(signal?: AbortSignal) {
  let settle!: (allowed: boolean) => void;
  let settled = false;
  const permission = new Promise<boolean>(resolve => { settle = resolve; });
  const finish = (inspectionRetained: boolean) => {
    if (settled) return;
    settled = true;
    signal?.removeEventListener("abort", discard);
    settle(inspectionRetained && !signal?.aborted);
  };
  const discard = () => finish(false);
  signal?.addEventListener("abort", discard, { once: true });
  if (signal?.aborted) discard();
  return { permission, finish, discard };
}

/** Recheck at execution, since a fetch or a sibling preparation may finish
 * after permission was granted. Reuses the existing 250 ms warmup reserve. */
export function canStartPolicyAnalysis(signal: AbortSignal | undefined, deadlineAtMs: number, now = Date.now()) {
  return !signal?.aborted && deadlineAtMs - now >= 250;
}
