import { terminalConsentDecisionSchema, terminalConsentDecisionBound,
  type TerminalConsentDecision, type RegisteredTerminalWindow, type ConsentDecisionEvidence, type AfterActionCapture } from "@certscore/contracts";

type VerifiedState = {
  stateHash: string;
  observedAtEpochMs?: number;
  tcfPurposeEvidence?: ConsentDecisionEvidence["tcfPurposeEvidence"];
  tcfApiSource?: ConsentDecisionEvidence["tcfApiSource"];
  oneTrustGroupEvidence?: ConsentDecisionEvidence["oneTrustGroupEvidence"];
  cookieYesLegacyReceiptEvidence?: ConsentDecisionEvidence["cookieYesLegacyReceiptEvidence"];
  complianzReceiptEvidence?: ConsentDecisionEvidence["complianzReceiptEvidence"];
};

/** One read overlaps the final 250 ms of the existing window. A late, aborted,
 * wrong-document or inconclusive result is ignored; capture never awaits it. */
export function terminalConsentDecisionRead(input: {
  onOutcome?: (state: "started" | "unverified" | "verified" | "discarded") => void;
  action: "accept" | "reject"; authorizedTargetSha256?: string; parentScanStartedAtMs: number;
  dispatchedAtEpochMs: number; observationWindowMs: number; signal?: AbortSignal;
  registeredAtEpochMs?: number; resultDeadlineAtMs?: number;
  targetStillAuthorized: () => boolean; read: () => Promise<VerifiedState | undefined>;
}) {
  let terminal: TerminalConsentDecision | undefined;
  let started = false;
  let discarded = false;
  const anchor = input.registeredAtEpochMs ?? input.dispatchedAtEpochMs;
  const deadline = anchor + input.observationWindowMs;
  const allowedDeadline = Math.min(deadline, input.resultDeadlineAtMs ?? Infinity);
  const relative = (epoch: number) => Math.max(0, Math.round(epoch - input.parentScanStartedAtMs));
  const allowed = () => {
    try { return !input.signal?.aborted && Date.now() <= allowedDeadline && input.targetStillAuthorized(); }
    catch { return false; }
  };
  const reader = {
    start() {
      if (started || discarded || !input.authorizedTargetSha256 || !allowed()) return;
      started = true;
      input.onOutcome?.("started");
      const readStartedAtMs = relative(Date.now());
      void input.read().then(state => {
        if (discarded) return;
        if (!allowed()) { input.onOutcome?.("discarded"); return; }
        if (!state) { input.onOutcome?.("unverified"); return; }
        const now = Date.now();
        const result = terminalConsentDecisionSchema.safeParse({
          policyVersion: input.registeredAtEpochMs === undefined
            ? "bounded_terminal_consent_decision.v1" : "bounded_registered_terminal_consent_decision.v1",
          action: input.action,
          authorizedTargetSha256: input.authorizedTargetSha256,
          readStartedAtMs, readCompletedAtMs: relative(now),
          evidence: { policyVersion: "semantic_consent_registration.v2",
            decision: input.action === "accept" ? "granted" : "denied", basis: "verified_state",
            observedStateSha256: state.stateHash, observedAtMs: relative(state.observedAtEpochMs ?? now),
            timestampBasis: state.observedAtEpochMs === undefined ? "verified_state_observed" : "instrumented_state_write",
            ...(state.tcfPurposeEvidence ? { tcfPurposeEvidence: state.tcfPurposeEvidence } : {}),
            ...(state.tcfApiSource ? { tcfApiSource: state.tcfApiSource } : {}),
            ...(state.cookieYesLegacyReceiptEvidence ? {cookieYesLegacyReceiptEvidence:state.cookieYesLegacyReceiptEvidence} : {}),
            ...(state.complianzReceiptEvidence ? {complianzReceiptEvidence:state.complianzReceiptEvidence} : {}),
            ...(state.oneTrustGroupEvidence ? { oneTrustGroupEvidence: state.oneTrustGroupEvidence } : {}),
          },
        });
        if (result.success && (input.registeredAtEpochMs === undefined ||
          Buffer.byteLength(JSON.stringify(result.data)) <= 2048)) terminal = result.data;
        input.onOutcome?.(terminal ? "verified" : "unverified");
      }).catch(() => { if (!discarded) input.onOutcome?.("unverified"); });
    },
    tick() {
      // The existing observation loop drives this once, without a timer or a wait.
      const now = Date.now();
      if (now >= anchor && now >= deadline - 250 && now < allowedDeadline) reader.start();
    },
    discard() {
      if (!started || discarded) return;
      discarded = true;
      terminal = undefined;
      input.onOutcome?.("discarded");
    },
    retained(capture?: AfterActionCapture, registered?: RegisteredTerminalWindow) {
      if (!terminal) return undefined;
      if (input.signal?.aborted) { input.onOutcome?.("discarded"); return undefined; }
      try { if (!input.targetStillAuthorized()) { input.onOutcome?.("discarded"); return undefined; } }
      catch { input.onOutcome?.("discarded"); return undefined; }
      const bound = terminalConsentDecisionBound(terminal, capture,
        { action: input.action, authorizedTargetSha256: input.authorizedTargetSha256 }, input.action, registered);
      if (!bound) input.onOutcome?.("discarded");
      return bound ? terminal : undefined;
    },
  };
  return reader;
}
