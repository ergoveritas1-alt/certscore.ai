import type { ConsentConfirmationDiagnostics, ConsentConfirmationReason } from "@certscore/contracts";

export function confirmationDiagnostics() {
  let initialPasses = 0, terminalPasses = 0;
  let terminalRead: ConsentConfirmationDiagnostics["terminalRead"] = "not_started";
  const reasons = new Set<ConsentConfirmationReason>();
  const initialReasons = new Set<ConsentConfirmationReason>(), terminalReasons = new Set<ConsentConfirmationReason>();
  let reasonsTruncated = false;
  function reason(phase: Set<ConsentConfirmationReason>, value: ConsentConfirmationReason) {
    if (!reasons.has(value) && reasons.size === 12) { reasonsTruncated = true; return; }
    reasons.add(value); phase.add(value);
  }
  return {
    pass(terminal: boolean) { if (terminal) terminalPasses = Math.min(10_000, terminalPasses + 1); else initialPasses = Math.min(10_000, initialPasses + 1); },
    reason(value: ConsentConfirmationReason) { reason(initialReasons, value); },
    terminalReason(value: ConsentConfirmationReason) { reason(terminalReasons, value); },
    terminal(state: ConsentConfirmationDiagnostics["terminalRead"]) { terminalRead = state; },
    retained(): ConsentConfirmationDiagnostics { return {policyVersion: "consent_confirmation_diagnostics.v3", diagnosticOnly: true,
      initialPasses, terminalPasses, reasons: [...reasons], initialReasons: [...initialReasons],
      terminalReasons: [...terminalReasons], reasonsTruncated, terminalRead}; },
  };
}
