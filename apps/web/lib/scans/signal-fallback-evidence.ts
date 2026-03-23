export function buildChildContextFallbackEvidence(input: {
  signalKey: string;
  signalLabel: string;
  signalValue: unknown;
  snapshot?: Record<string, unknown> | null;
}) {
  return {
    ageGatePresent: input.snapshot?.age_gate_present === true,
    childrenAudienceLikely: input.snapshot?.children_audience_likely === true,
    childrenPrivacyRiskScore:
      typeof input.snapshot?.children_privacy_risk_score === "number"
        ? input.snapshot.children_privacy_risk_score
        : null,
    dateOfBirthInputPresent: input.snapshot?.date_of_birth_input_present === true,
    formCollectsBirthdate: input.snapshot?.form_collects_birthdate === true,
    kidDirectedContentDetected: input.snapshot?.kid_directed_content_detected === true,
    mentionsCoppa: input.snapshot?.mentions_coppa === true,
    mentionsUnder13: input.snapshot?.mentions_under_13 === true,
    mentionsUnder16: input.snapshot?.mentions_under_16 === true,
    parentalConsentReferencePresent: input.snapshot?.parental_consent_reference_present === true,
    privacyPolicyPresent: input.snapshot?.privacy_policy_present === true,
    privacyContactChannelType:
      typeof input.snapshot?.privacy_contact_channel_type === "string"
        ? input.snapshot.privacy_contact_channel_type
        : null,
    policyChildrenReference: typeof input.signalValue === "string" ? input.signalValue : null,
    signalKey: input.signalKey,
    signalLabel: input.signalLabel,
    signalValue: input.signalValue
  };
}

export function isChildContextSignalKey(signalKey: string) {
  return /children_audience_likely|kid_directed_content_detected|form_collects_birthdate|policyChildrenReference|privacy\.children_privacy_context_without_supporting_disclosure/i.test(
    signalKey
  );
}
