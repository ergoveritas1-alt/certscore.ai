import type { ConsentConfirmationDiagnostics, ConsentConfirmationReason } from "@certscore/contracts";

export function confirmationDiagnostics() {
  let initialPasses = 0, terminalPasses = 0;
  let terminalRead: ConsentConfirmationDiagnostics["terminalRead"] = "not_started";
  const reasons = new Set<ConsentConfirmationReason>();
  return {
    pass(terminal: boolean) { if (terminal) terminalPasses = Math.min(10_000, terminalPasses + 1); else initialPasses = Math.min(10_000, initialPasses + 1); },
    reason(reason: ConsentConfirmationReason) { reasons.add(reason); },
    terminal(state: ConsentConfirmationDiagnostics["terminalRead"]) { terminalRead = state; },
    retained(): ConsentConfirmationDiagnostics { return {policyVersion: "consent_confirmation_diagnostics.v1", diagnosticOnly: true,
      initialPasses, terminalPasses, reasons: [...reasons], terminalRead}; },
  };
}
