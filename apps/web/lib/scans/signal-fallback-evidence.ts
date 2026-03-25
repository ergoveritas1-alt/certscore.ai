import {
  isMeaningfulPolicyText,
  normalizePolicySnippet,
  normalizePolicySnippetList
} from "./policy-snippet-normalization";

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

function getPolicyEnrichmentSnippetRecord(row: Record<string, unknown>) {
  return row.policyEvidenceSnippets && typeof row.policyEvidenceSnippets === "object"
    ? (row.policyEvidenceSnippets as Record<string, unknown>)
    : row.policy_evidence_snippets && typeof row.policy_evidence_snippets === "object"
      ? (row.policy_evidence_snippets as Record<string, unknown>)
      : null;
}

function getAffiliatePolicyFallbackRow(policyEnrichment: Array<Record<string, unknown>>) {
  const hasAffiliateEvidence = (row: Record<string, unknown>) => {
    const summary =
      typeof row.policySummaryShort === "string"
        ? row.policySummaryShort
        : typeof row.policy_summary_short === "string"
          ? row.policy_summary_short
          : null;
    const pageUrl =
      typeof row.pageUrl === "string"
        ? row.pageUrl
        : typeof row.page_url === "string"
          ? row.page_url
          : null;
    const snippets = getPolicyEnrichmentSnippetRecord(row);

    return (
      (typeof row.pageType === "string" && row.pageType === "affiliate_disclosure") ||
      (typeof row.page_type === "string" && row.page_type === "affiliate_disclosure") ||
      (typeof pageUrl === "string" && /affiliate/i.test(pageUrl)) ||
      (isMeaningfulPolicyText(summary) && /\baffiliate disclosure\b/i.test(summary)) ||
      Object.entries(snippets ?? {}).some(
        ([key, value]) =>
          /affiliate/i.test(key) &&
          ((typeof value === "string" && isMeaningfulPolicyText(value)) ||
            (Array.isArray(value) && value.some((entry) => typeof entry === "string" && isMeaningfulPolicyText(entry))))
      )
    );
  };

  return policyEnrichment.find(hasAffiliateEvidence) ?? null;
}

function getAffiliatePolicyFallbackSnippet(row: Record<string, unknown> | null) {
  if (!row) {
    return null;
  }

  const snippets = getPolicyEnrichmentSnippetRecord(row);
  const explicitAffiliateSnippet = Object.entries(snippets ?? {}).flatMap(([key, value]) => {
    if (!/affiliate/i.test(key)) {
      return [];
    }

    if (typeof value === "string" && isMeaningfulPolicyText(value)) {
      return [value];
    }

    if (Array.isArray(value)) {
      return value.filter((entry): entry is string => typeof entry === "string" && isMeaningfulPolicyText(entry));
    }

    return [];
  });

  if (explicitAffiliateSnippet.length > 0) {
    return normalizePolicySnippetList(explicitAffiliateSnippet)[0] ?? null;
  }

  const summary =
    typeof row.policySummaryShort === "string"
      ? row.policySummaryShort
      : typeof row.policy_summary_short === "string"
        ? row.policy_summary_short
        : null;

  if (isMeaningfulPolicyText(summary) && /\baffiliate disclosure\b/i.test(summary)) {
    return normalizePolicySnippet(summary);
  }

  return null;
}

export function buildSnapshotDisclosureFallbackEvidence(input: {
  keyPageDiscoverySummary?: unknown;
  policyEnrichment?: Array<Record<string, unknown>>;
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
  const successfulTitles = relevantRows.flatMap((row) =>
    typeof row.successfulPageTitle === "string" && row.successfulPageTitle.trim().length > 0 ? [row.successfulPageTitle] : []
  );
  const stopReasons = relevantRows.flatMap((row) =>
    typeof row.stopReason === "string" && row.stopReason.trim().length > 0 ? [row.stopReason] : []
  );
  const affiliatePolicyRow =
    /commerce\.affiliate_disclosure_present/i.test(input.signalKey)
      ? getAffiliatePolicyFallbackRow(input.policyEnrichment ?? [])
      : null;
  const affiliatePolicyPageUrl =
    affiliatePolicyRow && typeof (affiliatePolicyRow.pageUrl ?? affiliatePolicyRow.page_url) === "string"
      ? String(affiliatePolicyRow.pageUrl ?? affiliatePolicyRow.page_url)
      : null;
  const affiliatePolicySnippet = getAffiliatePolicyFallbackSnippet(affiliatePolicyRow);
  const affiliateTitleSnippet = successfulTitles.find((title) => /\baffiliate disclosure\b/i.test(title)) ?? null;

  return {
    affiliateDisclosurePresent: input.snapshot?.affiliate_disclosure_present === true,
    contactPagePresent: input.snapshot?.contact_page_present === true,
    keyPageAttemptCount: attemptedUrls.length > 0 ? attemptedUrls.length : null,
    keyPageAttemptedUrls: [...new Set(attemptedUrls)],
    keyPageDiscoverySource: getBestDiscoverySource(relevantRows),
    keyPageStopReason: stopReasons[0] ?? null,
    pageUrls: [...new Set([...successfulUrls, ...(affiliatePolicyPageUrl ? [affiliatePolicyPageUrl] : [])])],
    policySnippets: normalizePolicySnippetList([
      ...(affiliatePolicySnippet ? [affiliatePolicySnippet] : []),
      ...(affiliateTitleSnippet ? [affiliateTitleSnippet] : [])
    ]),
    privacyPolicyPresent: input.snapshot?.privacy_policy_present === true,
    signalKey: input.signalKey,
    signalLabel: input.signalLabel,
    signalValue: input.signalValue,
    sourceUrls: [...new Set([...successfulUrls, ...(affiliatePolicyPageUrl ? [affiliatePolicyPageUrl] : [])])],
    termsOfServicePresent: input.snapshot?.terms_of_service_present === true
  };
}

export function isChildContextSignalKey(signalKey: string) {
  return /children_audience_likely|kid_directed_content_detected|form_collects_birthdate|policyChildrenReference|privacy\.children_privacy_context_without_supporting_disclosure/i.test(
    signalKey
  );
}
