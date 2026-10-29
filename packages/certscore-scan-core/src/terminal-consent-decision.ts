import { terminalConsentDecisionSchema, terminalConsentDecisionBound,
  type TerminalConsentDecision, type ConsentDecisionEvidence, type AfterActionCapture } from "@certscore/contracts";

type VerifiedState = {
  stateHash: string;
  observedAtEpochMs?: number;
  tcfPurposeEvidence?: ConsentDecisionEvidence["tcfPurposeEvidence"];
  tcfApiSource?: ConsentDecisionEvidence["tcfApiSource"];
  oneTrustGroupEvidence?: ConsentDecisionEvidence["oneTrustGroupEvidence"];
  complianzReceiptEvidence?: ConsentDecisionEvidence["complianzReceiptEvidence"];
};

/** One read overlaps the final 250 ms of the existing window. A late, aborted,
 * wrong-document or inconclusive result is ignored; capture never awaits it. */
export function terminalConsentDecisionRead(input: {
  onOutcome?: (state: "started" | "unverified" | "verified" | "discarded") => void;
  action: "accept" | "reject"; authorizedTargetSha256?: string; parentScanStartedAtMs: number;
  dispatchedAtEpochMs: number; observationWindowMs: number; signal?: AbortSignal;
  targetStillAuthorized: () => boolean; read: () => Promise<VerifiedState | undefined>;
}) {
  let terminal: TerminalConsentDecision | undefined;
  let started = false;
  const deadline = input.dispatchedAtEpochMs + input.observationWindowMs;
  const relative = (epoch: number) => Math.max(0, Math.round(epoch - input.parentScanStartedAtMs));
  const allowed = () => {
    try { return !input.signal?.aborted && Date.now() <= deadline && input.targetStillAuthorized(); }
    catch { return false; }
  };
  return {
    start() {
      if (started || !input.authorizedTargetSha256 || !allowed()) return;
      started = true;
      input.onOutcome?.("started");
      const readStartedAtMs = relative(Date.now());
      void input.read().then(state => {
        if (!allowed()) { input.onOutcome?.("discarded"); return; }
        if (!state) { input.onOutcome?.("unverified"); return; }
        const now = Date.now();
        const result = terminalConsentDecisionSchema.safeParse({
          policyVersion: "bounded_terminal_consent_decision.v1", action: input.action,
          authorizedTargetSha256: input.authorizedTargetSha256,
          readStartedAtMs, readCompletedAtMs: relative(now),
          evidence: { policyVersion: "semantic_consent_registration.v2",
            decision: input.action === "accept" ? "granted" : "denied", basis: "verified_state",
            observedStateSha256: state.stateHash, observedAtMs: relative(state.observedAtEpochMs ?? now),
            timestampBasis: state.observedAtEpochMs === undefined ? "verified_state_observed" : "instrumented_state_write",
            ...(state.tcfPurposeEvidence ? { tcfPurposeEvidence: state.tcfPurposeEvidence } : {}),
            ...(state.tcfApiSource ? { tcfApiSource: state.tcfApiSource } : {}),
            ...(state.complianzReceiptEvidence ? {complianzReceiptEvidence:state.complianzReceiptEvidence} : {}),
            ...(state.oneTrustGroupEvidence ? { oneTrustGroupEvidence: state.oneTrustGroupEvidence } : {}),
          },
        });
        if (result.success) terminal = result.data;
        input.onOutcome?.(result.success ? "verified" : "unverified");
      }).catch(() => { input.onOutcome?.("unverified"); });
    },
    retained(capture: AfterActionCapture) {
      if (!terminal) return undefined;
      if (input.signal?.aborted) { input.onOutcome?.("discarded"); return undefined; }
      try { if (!input.targetStillAuthorized()) { input.onOutcome?.("discarded"); return undefined; } }
      catch { input.onOutcome?.("discarded"); return undefined; }
      const bound = terminalConsentDecisionBound(terminal, capture,
        { action: input.action, authorizedTargetSha256: input.authorizedTargetSha256 }, input.action);
      if (!bound) input.onOutcome?.("discarded");
      return bound ? terminal : undefined;
    },
  };
}
