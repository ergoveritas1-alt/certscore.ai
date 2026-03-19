export type BehaviorDisclosureEvaluationInput = {
  behaviorKey: string;
  disclosureEvidence: string[];
  disclosurePresent: boolean;
  runtimeDetected: boolean;
  runtimeEvidence: string[];
  vendors: string[];
};

export type BehaviorDisclosureEvaluation = {
  behaviorKey: string;
  disclosureEvidence: string[];
  disclosurePresent: boolean;
  mismatchDetected: boolean;
  runtimeDetected: boolean;
  runtimeEvidence: string[];
  vendors: string[];
};

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function evaluateBehaviorDisclosure(input: BehaviorDisclosureEvaluationInput): BehaviorDisclosureEvaluation {
  const runtimeEvidence = uniqueStrings(input.runtimeEvidence);
  const disclosureEvidence = uniqueStrings(input.disclosureEvidence);
  const vendors = uniqueStrings(input.vendors);
  const runtimeDetected = input.runtimeDetected || runtimeEvidence.length > 0 || vendors.length > 0;
  const disclosurePresent = input.disclosurePresent || disclosureEvidence.length > 0;

  return {
    behaviorKey: input.behaviorKey,
    disclosureEvidence,
    disclosurePresent,
    mismatchDetected: runtimeDetected && !disclosurePresent,
    runtimeDetected,
    runtimeEvidence,
    vendors
  };
}
