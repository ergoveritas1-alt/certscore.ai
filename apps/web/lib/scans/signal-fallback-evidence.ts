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

function getKeyPageDiscoverySummaryRows(summary: unknown) {
  if (!summary || typeof summary !== "object") {
    return [] as Array<Record<string, unknown>>;
  }

  const pageSummaries = (summary as { pageSummaries?: unknown }).pageSummaries;
  if (!Array.isArray(pageSummaries)) {
    return [] as Array<Record<string, unknown>>;
  }

  return pageSummaries.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object");
}

function getBestDiscoverySource(summaryRows: Array<Record<string, unknown>>) {
  const preferredSources = ["footer_link", "header_link", "body_link", "legal_hub", "second_hop_legal_hub"];

  for (const source of preferredSources) {
    const match = summaryRows.find((row) => row.bestDiscoverySource === source);
    if (match) {
      return source;
    }
  }

  const fallback = summaryRows.find((row) => typeof row.bestDiscoverySource === "string");
  return typeof fallback?.bestDiscoverySource === "string" ? fallback.bestDiscoverySource : null;
}

export function buildSnapshotDisclosureFallbackEvidence(input: {
  keyPageDiscoverySummary?: unknown;
  signalKey: string;
  signalLabel: string;
  signalValue: unknown;
  snapshot?: Record<string, unknown> | null;
}) {
  const summaryRows = getKeyPageDiscoverySummaryRows(input.keyPageDiscoverySummary);
  const relevantPageTypes = /commerce\.affiliate_disclosure_present/i.test(input.signalKey)
    ? new Set(["affiliate_disclosure"])
    : new Set([
        "privacy_policy",
        "terms_of_service",
        "contact",
        "contact_page",
        "affiliate_disclosure"
      ]);
  const relevantRows = summaryRows.filter((row) => relevantPageTypes.has(String(row.pageType ?? "")));
  const attemptedUrls = relevantRows.flatMap((row) =>
    Array.isArray(row.attemptedUrls) ? row.attemptedUrls.filter((value): value is string => typeof value === "string") : []
  );
  const successfulUrls = relevantRows.flatMap((row) =>
    typeof row.successfulUrl === "string" && row.successfulUrl.trim().length > 0 ? [row.successfulUrl] : []
  );
  const stopReasons = relevantRows.flatMap((row) =>
    typeof row.stopReason === "string" && row.stopReason.trim().length > 0 ? [row.stopReason] : []
  );

  return {
    affiliateDisclosurePresent: input.snapshot?.affiliate_disclosure_present === true,
    contactPagePresent: input.snapshot?.contact_page_present === true,
    keyPageAttemptCount: attemptedUrls.length > 0 ? attemptedUrls.length : null,
    keyPageAttemptedUrls: [...new Set(attemptedUrls)],
    keyPageDiscoverySource: getBestDiscoverySource(relevantRows),
    keyPageStopReason: stopReasons[0] ?? null,
    pageUrls: [...new Set(successfulUrls)],
    privacyPolicyPresent: input.snapshot?.privacy_policy_present === true,
    signalKey: input.signalKey,
    signalLabel: input.signalLabel,
    signalValue: input.signalValue,
    sourceUrls: [...new Set(successfulUrls)],
    termsOfServicePresent: input.snapshot?.terms_of_service_present === true
  };
}

export function isChildContextSignalKey(signalKey: string) {
  return /children_audience_likely|kid_directed_content_detected|form_collects_birthdate|policyChildrenReference|privacy\.children_privacy_context_without_supporting_disclosure/i.test(
    signalKey
  );
}
