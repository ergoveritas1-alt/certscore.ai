export type RuntimeStabilityState = {
  bannerDetected: boolean;
  elapsedMs: number;
  inflightRequests: number;
  lastActivityElapsedMs: number;
  maxWaitMs: number;
  minWaitMs: number;
  quietWindowMs: number;
};

export function shouldContinueRuntimeWait(state: RuntimeStabilityState) {
  if (state.elapsedMs >= state.maxWaitMs) {
    return false;
  }

  if (state.elapsedMs < state.minWaitMs) {
    return true;
  }

  if (state.bannerDetected && state.inflightRequests === 0) {
    return false;
  }

  return state.inflightRequests > 0 || state.lastActivityElapsedMs < state.quietWindowMs;
}
