import { PULSE_AGENT_DO_NOT_CALL_THIS } from "./constants";
import type { PulseAgentResponseClass } from "./types";

export function buildPulseAgentInterpretation(input: {
  responseClass: PulseAgentResponseClass;
  safeSummaryUse?: boolean;
}) {
  return {
    responseClass: input.responseClass,
    safeSummaryUse: input.safeSummaryUse ?? false,
    requiresHumanReview: true,
    doNotCallThis: PULSE_AGENT_DO_NOT_CALL_THIS
  };
}
