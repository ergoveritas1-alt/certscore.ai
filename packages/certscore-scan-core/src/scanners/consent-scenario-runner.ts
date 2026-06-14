import type { ConsentFlowScenario, ConsentState } from "@certscore/contracts";

export type ScenarioIdFactory = (prefix: string) => string;

export function createConsentScenarioIdFactory(scenario: ConsentFlowScenario): ScenarioIdFactory {
  const counts = new Map<string, number>();
  const scenarioPrefix = scenario.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
  return (prefix: string) => {
    const next = (counts.get(prefix) ?? 0) + 1;
    counts.set(prefix, next);
    return `${prefix}_${scenarioPrefix}_${next}`;
  };
}

export function consentStateForScenarioExecution(scenario: ConsentFlowScenario): ConsentState {
  switch (scenario) {
    case "accept_all_flow":
      return "post_accept";
    case "reject_all_flow":
    case "privacy_opt_out_flow":
      return "post_reject";
    default:
      return "pre_consent";
  }
}
