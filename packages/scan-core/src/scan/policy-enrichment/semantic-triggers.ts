export type PolicyLlmTriggerInput = {
  aiAssistantWidgetDetected: boolean;
  aiDisclosureTextPresent: boolean;
  autoRenewDisclosurePresent: boolean;
  freeTrialDetected: boolean;
  highSensitivityDataCollectionDetected: boolean;
  policyBehaviorConflictCandidate: boolean;
  sessionReplayWithoutDisclosureCandidate: boolean;
  subscriptionTermsPresent: boolean;
};

export function derivePolicyLlmTriggerReasons(input: PolicyLlmTriggerInput) {
  const reasons = new Set<string>();

  if (input.policyBehaviorConflictCandidate) {
    reasons.add("policy_behavior_conflict_candidate");
  }

  if (input.sessionReplayWithoutDisclosureCandidate) {
    reasons.add("session_replay_undisclosed");
  }

  if ((input.subscriptionTermsPresent || input.freeTrialDetected) && !input.autoRenewDisclosurePresent) {
    reasons.add("subscription_disclosure_review");
  }

  if (input.highSensitivityDataCollectionDetected) {
    reasons.add("sensitive_collection_review");
  }

  if (input.aiAssistantWidgetDetected && !input.aiDisclosureTextPresent) {
    reasons.add("ai_disclosure_review");
  }

  return [...reasons].sort();
}
