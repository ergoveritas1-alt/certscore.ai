import {
  isMeaningfulPolicyText,
  normalizePolicySnippet,
  normalizePolicySnippetList
} from "./policy-snippet-normalization";

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
}

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

function getPolicyPageUrl(row: Record<string, unknown> | null) {
  if (!row) {
    return null;
  }

  return typeof (row.pageUrl ?? row.page_url) === "string" ? String(row.pageUrl ?? row.page_url) : null;
}

function getPolicySummaryShort(row: Record<string, unknown> | null) {
  if (!row) {
    return null;
  }

  return isMeaningfulPolicyText(row.policySummaryShort ?? row.policy_summary_short)
    ? String(row.policySummaryShort ?? row.policy_summary_short)
    : null;
}

function getKeyPageSummaryRowsForTypes(summary: unknown, pageTypes: string[]) {
  const wantedTypes = new Set(pageTypes);
  return getKeyPageDiscoverySummaryRows(summary).filter((row) => wantedTypes.has(String(row.pageType ?? "")));
}

function getSuccessfulKeyPageUrls(summaryRows: Array<Record<string, unknown>>) {
  return summaryRows.flatMap((row) =>
    typeof row.successfulUrl === "string" && row.successfulUrl.trim().length > 0 ? [row.successfulUrl] : []
  );
}

function getSuccessfulKeyPageTitles(summaryRows: Array<Record<string, unknown>>) {
  return summaryRows.flatMap((row) =>
    typeof row.successfulPageTitle === "string" && row.successfulPageTitle.trim().length > 0 ? [row.successfulPageTitle] : []
  );
}

function getSuccessfulKeyPageTitleRecords(summaryRows: Array<Record<string, unknown>>) {
  return summaryRows.flatMap((row) =>
    typeof row.successfulPageTitle === "string" && row.successfulPageTitle.trim().length > 0
      ? [
          {
            title: row.successfulPageTitle,
            url: typeof row.successfulUrl === "string" ? row.successfulUrl : null
          }
        ]
      : []
  );
}

function getAttemptedKeyPageUrls(summaryRows: Array<Record<string, unknown>>) {
  return summaryRows.flatMap((row) =>
    Array.isArray(row.attemptedUrls) ? row.attemptedUrls.filter((value): value is string => typeof value === "string") : []
  );
}

function getBestCandidateKeyPageUrls(summaryRows: Array<Record<string, unknown>>) {
  return summaryRows.flatMap((row) =>
    typeof row.bestCandidateUrl === "string" && row.bestCandidateUrl.trim().length > 0 ? [row.bestCandidateUrl] : []
  );
}

function getBestCandidateAnchorTexts(summaryRows: Array<Record<string, unknown>>) {
  return summaryRows.flatMap((row) =>
    typeof row.bestCandidateAnchorText === "string" && row.bestCandidateAnchorText.trim().length > 0
      ? [row.bestCandidateAnchorText]
      : []
  );
}

function getStopReasons(summaryRows: Array<Record<string, unknown>>) {
  return summaryRows.flatMap((row) =>
    typeof row.stopReason === "string" && row.stopReason.trim().length > 0 ? [row.stopReason] : []
  );
}

function getPolicyRowByPageTypes(policyEnrichment: Array<Record<string, unknown>>, pageTypes: string[]) {
  const wantedTypes = new Set(pageTypes);
  return (
    policyEnrichment.find((row) => wantedTypes.has(String(row.pageType ?? row.page_type ?? ""))) ??
    null
  );
}

function getPolicySnippetCandidates(row: Record<string, unknown> | null, snippetKeys: string[]) {
  if (!row) {
    return [] as string[];
  }

  const snippets = getPolicyEnrichmentSnippetRecord(row);
  const policySummaryShort = getPolicySummaryShort(row);
  const keyedSnippets = snippetKeys.flatMap((key) =>
    isMeaningfulPolicyText(snippets?.[key]) ? [String(snippets?.[key])] : []
  );

  return normalizePolicySnippetList([
    ...keyedSnippets,
    ...(policySummaryShort ? [policySummaryShort] : [])
  ]);
}

function isWeakRootLikeUrl(value: string | null) {
  if (!value) {
    return false;
  }

  try {
    const parsed = new URL(value);
    const pathname = parsed.pathname.trim();
    const isRootPath = pathname === "" || pathname === "/";
    return isRootPath;
  } catch {
    return /\/?#?$/.test(value);
  }
}

function isMachineReadablePolicyEndpoint(value: string | null) {
  if (!value) {
    return false;
  }

  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();

    return (
      host === "privacyportal.onetrust.com" ||
      path.includes("/request/v1/enterprisepolicy/") ||
      path.includes("/digitalpolicy/content") ||
      path.includes("/api/")
    );
  } catch {
    return /privacyportal\.onetrust\.com|\/request\/v1\/enterprisepolicy\/|\/digitalpolicy\/content|\/api\//i.test(value);
  }
}

function isLikelyHomepageTitle(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return (
    normalized.includes("breaking news") ||
    normalized.includes("latest news and videos") ||
    normalized === "home" ||
    normalized.endsWith("| home")
  );
}

function isLikelyPrivacyChoiceSnippet(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  return /privacy choices|privacy rights|do not sell|do not share|targeted advertising|opt out of targeted advertising|cookie settings/i.test(
    value
  );
}

function isLikelyLocaleSubdomainUrl(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    const labels = host.split(".");
    if (labels.length < 3) {
      return false;
    }

    const subdomain = labels[0] ?? "";
    return /^(arabic|ar|es|fr|de|it|pt|jp|ja|kr|ko|cn|zh|ru|tr|nl|sv|no|da|fi|pl|cs|he|id|th|vi)$/i.test(
      subdomain
    );
  } catch {
    return false;
  }
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

  if (
    isMeaningfulPolicyText(summary) &&
    (/\baffiliate disclosure\b/i.test(summary) ||
      /\baffiliate\b/i.test(summary) ||
      /\bcommission\b/i.test(summary) ||
      /\bearn(?:s|ed|ing)?\b.{0,40}\b(?:purchase|purchases|link|links|recommendation|recommendations)\b/i.test(summary) ||
      /\brevenue\b.{0,40}\b(?:purchase|purchases|link|links|recommendation|recommendations)\b/i.test(summary))
  ) {
    return normalizePolicySnippet(summary);
  }

  return null;
}

export function buildSnapshotDisclosureFallbackEvidence(input: {
  keyPageDiscoverySummary?: unknown;
  policyEnrichment?: Array<Record<string, unknown>>;
  relatedSignals?: Array<{ key: string; value: unknown }>;
  signalKey: string;
  signalLabel: string;
  signalValue: unknown;
  snapshot?: Record<string, unknown> | null;
}) {
  const summaryRows = getKeyPageDiscoverySummaryRows(input.keyPageDiscoverySummary);
  const isAffiliateSignal = /commerce\.affiliate_disclosure_present/i.test(input.signalKey);
  const isPrivacySurfaceSignal = /disclosure\.privacy_policy_present/i.test(input.signalKey);
  const isTermsSurfaceSignal = /disclosure\.terms_of_service_present/i.test(input.signalKey);
  const isCookieSurfaceSignal = /disclosure\.cookie_policy_present/i.test(input.signalKey);
  const isContactSurfaceSignal = /disclosure\.contact_page_present/i.test(input.signalKey);
  const isDoNotSellSignal = /privacy\.do_not_sell_link_present/i.test(input.signalKey);
  const relevantPageTypes = isAffiliateSignal
    ? new Set(["affiliate_disclosure"])
    : isPrivacySurfaceSignal
      ? new Set(["privacy_policy"])
      : isTermsSurfaceSignal
        ? new Set(["terms_of_service"])
        : isCookieSurfaceSignal
          ? new Set(["cookie_policy"])
          : isContactSurfaceSignal
            ? new Set(["contact", "contact_page"])
            : isDoNotSellSignal
              ? new Set(["privacy_policy", "cookie_policy"])
            : new Set([
                "privacy_policy",
                "terms_of_service",
                "contact",
                "contact_page",
                "affiliate_disclosure"
              ]);
  const relevantRows = summaryRows.filter((row) => relevantPageTypes.has(String(row.pageType ?? "")));
  const attemptedUrls = getAttemptedKeyPageUrls(relevantRows);
  const bestCandidateUrls = getBestCandidateKeyPageUrls(relevantRows);
  const successfulUrls = getSuccessfulKeyPageUrls(relevantRows);
  const successfulTitles = getSuccessfulKeyPageTitles(relevantRows);
  const successfulTitleRecords = getSuccessfulKeyPageTitleRecords(relevantRows);
  const bestCandidateAnchorTexts = getBestCandidateAnchorTexts(relevantRows);
  const stopReasons = getStopReasons(relevantRows);
  const relatedSignals = Array.isArray(input.relatedSignals) ? input.relatedSignals : [];
  const relatedSignalUrls = uniqueStrings(
    relatedSignals.flatMap((signal) =>
      typeof signal.value === "string" && signal.value.trim().length > 0 ? [signal.value] : []
    )
  );
  const canonicalTermsSignalUrls = isTermsSurfaceSignal
    ? relatedSignalUrls.filter(
        (url) => !isMachineReadablePolicyEndpoint(url) && !isWeakRootLikeUrl(url) && !isLikelyLocaleSubdomainUrl(url)
      )
    : [];
  const genericPolicyRow = getPolicyRowByPageTypes(
    input.policyEnrichment ?? [],
    isPrivacySurfaceSignal
      ? ["privacy_policy"]
      : isTermsSurfaceSignal
        ? ["terms_of_service"]
        : isCookieSurfaceSignal
          ? ["cookie_policy"]
          : isContactSurfaceSignal
            ? ["contact", "contact_page"]
            : isDoNotSellSignal
              ? ["privacy_policy", "cookie_policy"]
            : []
  );
  const affiliatePolicyRow =
    isAffiliateSignal
      ? getAffiliatePolicyFallbackRow(input.policyEnrichment ?? [])
      : null;
  const affiliateAttemptedUrls = attemptedUrls.filter((url) => /affiliate/i.test(url));
  const preferredAffiliateSuccessfulUrls = successfulUrls.filter((url) => !isMachineReadablePolicyEndpoint(url));
  const hasAffiliateSuccessfulUrl =
    preferredAffiliateSuccessfulUrls.some((url) => /affiliate/i.test(url)) ||
    successfulUrls.some((url) => /affiliate/i.test(url) && !isMachineReadablePolicyEndpoint(url));
  const affiliatePolicyPageUrl =
    !hasAffiliateSuccessfulUrl
      ? getPolicyPageUrl(affiliatePolicyRow)
      : null;
  const affiliatePolicySnippet = getAffiliatePolicyFallbackSnippet(affiliatePolicyRow);
  const affiliateTitleSnippet = successfulTitles.find((title) => /\baffiliate disclosure\b/i.test(title)) ?? null;
  const nonMachineSuccessfulUrls = successfulUrls.filter((url) => !isMachineReadablePolicyEndpoint(url));
  const nonMachineAttemptedUrls = attemptedUrls.filter((url) => !isMachineReadablePolicyEndpoint(url));
  const nonMachineBestCandidateUrls = bestCandidateUrls.filter((url) => !isMachineReadablePolicyEndpoint(url));
  const nonWeakSuccessfulUrls = nonMachineSuccessfulUrls.filter((url) => !isWeakRootLikeUrl(url));
  const nonWeakAttemptedUrls = nonMachineAttemptedUrls.filter((url) => !isWeakRootLikeUrl(url));
  const nonWeakBestCandidateUrls = nonMachineBestCandidateUrls.filter((url) => !isWeakRootLikeUrl(url));
  const genericPolicyPageUrl = getPolicyPageUrl(genericPolicyRow);
  const genericHumanPolicyPageUrl =
    genericPolicyPageUrl && !isMachineReadablePolicyEndpoint(genericPolicyPageUrl) ? genericPolicyPageUrl : null;
  const shouldUseGenericPolicySnippetCandidates = !(
    isTermsSurfaceSignal &&
    canonicalTermsSignalUrls.length > 0 &&
    isLikelyLocaleSubdomainUrl(genericPolicyPageUrl)
  );
  const genericTitleSnippets = normalizePolicySnippetList(
    successfulTitleRecords
      .filter(
        ({ title, url }) =>
          !/\baffiliate disclosure\b/i.test(title) &&
          !((isCookieSurfaceSignal || isDoNotSellSignal) && isLikelyHomepageTitle(title)) &&
          !(
            isTermsSurfaceSignal &&
            canonicalTermsSignalUrls.length > 0 &&
            isLikelyLocaleSubdomainUrl(url)
          )
      )
      .map(({ title }) => title)
  );
  const affiliatePageUrls =
    /commerce\.affiliate_disclosure_present/i.test(input.signalKey)
      ? uniqueStrings([
          ...(preferredAffiliateSuccessfulUrls.length > 0 ? preferredAffiliateSuccessfulUrls : affiliateAttemptedUrls),
          ...(affiliatePolicyPageUrl ? [affiliatePolicyPageUrl] : [])
        ])
      : uniqueStrings([
          ...(nonMachineSuccessfulUrls.length > 0 ? nonMachineSuccessfulUrls : []),
          ...attemptedUrls,
          ...(affiliatePolicyPageUrl ? [affiliatePolicyPageUrl] : [])
        ]);
  const affiliateSourceUrls =
    /commerce\.affiliate_disclosure_present/i.test(input.signalKey)
      ? uniqueStrings([
          ...affiliatePageUrls,
          ...successfulUrls.filter((url) => isMachineReadablePolicyEndpoint(url))
        ])
      : uniqueStrings([
          ...affiliatePageUrls,
          ...successfulUrls.filter((url) => isMachineReadablePolicyEndpoint(url))
        ]);

  const genericPageUrls =
    isPrivacySurfaceSignal || isTermsSurfaceSignal || isCookieSurfaceSignal || isContactSurfaceSignal || isDoNotSellSignal
      ? uniqueStrings([
          ...(isTermsSurfaceSignal ? canonicalTermsSignalUrls : []),
          ...((isCookieSurfaceSignal || isDoNotSellSignal)
            ? (nonWeakSuccessfulUrls.length > 0
                ? nonWeakSuccessfulUrls
                : nonWeakAttemptedUrls.length > 0
                  ? nonWeakAttemptedUrls
                  : nonWeakBestCandidateUrls)
            : nonMachineSuccessfulUrls.length > 0
              ? nonMachineSuccessfulUrls
              : nonMachineAttemptedUrls.length > 0
                ? nonMachineAttemptedUrls
                : nonMachineBestCandidateUrls),
          ...((genericHumanPolicyPageUrl &&
            !(
              isCookieSurfaceSignal &&
              isWeakRootLikeUrl(genericHumanPolicyPageUrl)
            ))
            ? [genericHumanPolicyPageUrl]
            : [])
        ])
      : affiliatePageUrls;
  const genericSourceUrls =
    isPrivacySurfaceSignal || isTermsSurfaceSignal || isCookieSurfaceSignal || isContactSurfaceSignal || isDoNotSellSignal
      ? uniqueStrings([
          ...genericPageUrls,
          ...(isTermsSurfaceSignal ? canonicalTermsSignalUrls : []),
          ...(isCookieSurfaceSignal ? [] : successfulUrls.filter((url) => isMachineReadablePolicyEndpoint(url)))
        ])
      : affiliateSourceUrls;
  const genericPolicySnippets =
    isAffiliateSignal
      ? normalizePolicySnippetList([
          ...(affiliateTitleSnippet ? [affiliateTitleSnippet] : []),
          ...(affiliatePolicySnippet && affiliatePolicySnippet !== affiliateTitleSnippet ? [affiliatePolicySnippet] : [])
        ])
      : normalizePolicySnippetList([
          ...genericTitleSnippets,
          ...(((genericTitleSnippets.length === 0 || isDoNotSellSignal) && shouldUseGenericPolicySnippetCandidates)
            ? getPolicySnippetCandidates(genericPolicyRow, [
                "privacy_notice",
                "terms_summary",
                "cookie_notice",
                "cookie_table",
                "cookies",
                "targeted_advertising",
                "privacy_choices",
                "do_not_sell",
                "contact"
              ])
            : []),
          ...((genericTitleSnippets.length === 0 || isDoNotSellSignal) ? bestCandidateAnchorTexts : [])
        ]);

  const preferredDoNotSellPageUrls = isDoNotSellSignal
    ? uniqueStrings(genericPageUrls.filter((url) => !isWeakRootLikeUrl(url) && !isMachineReadablePolicyEndpoint(url)))
    : [];
  const preferredDoNotSellSourceUrls = isDoNotSellSignal
    ? uniqueStrings(genericSourceUrls.filter((url) => !isWeakRootLikeUrl(url) && !isMachineReadablePolicyEndpoint(url)))
    : [];
  const preferredDoNotSellSnippets = isDoNotSellSignal
    ? normalizePolicySnippetList(
        genericPolicySnippets.filter(
          (snippet) => !isLikelyHomepageTitle(snippet) && isLikelyPrivacyChoiceSnippet(snippet)
        )
      )
    : [];

  return {
    affiliateDisclosurePresent: input.snapshot?.affiliate_disclosure_present === true,
    contactPagePresent: input.snapshot?.contact_page_present === true,
    keyPageAttemptCount: attemptedUrls.length > 0 ? attemptedUrls.length : null,
    keyPageAttemptedUrls: [...new Set(attemptedUrls)],
    keyPageDiscoverySource: getBestDiscoverySource(relevantRows),
    keyPageStopReason: stopReasons[0] ?? null,
    pageUrls: preferredDoNotSellPageUrls.length > 0 ? preferredDoNotSellPageUrls : genericPageUrls,
    policySnippets: preferredDoNotSellSnippets.length > 0 ? preferredDoNotSellSnippets : genericPolicySnippets,
    doNotSellLinkPresent: input.snapshot?.do_not_sell_link_present === true,
    privacyPolicyPresent: input.snapshot?.privacy_policy_present === true,
    signalKey: input.signalKey,
    signalLabel: input.signalLabel,
    signalValue: input.signalValue,
    sourceUrls: preferredDoNotSellSourceUrls.length > 0 ? preferredDoNotSellSourceUrls : genericSourceUrls,
    termsOfServicePresent: input.snapshot?.terms_of_service_present === true,
    policySummaryShort:
      genericPolicySnippets.length === 0 && genericPolicyRow ? getPolicySummaryShort(genericPolicyRow) : null
  };
}

export function buildAccessibilitySupportFallbackEvidence(input: {
  keyPageDiscoverySummary?: unknown;
  signalKey: string;
  signalLabel: string;
  signalValue: unknown;
  snapshot?: Record<string, unknown> | null;
}) {
  const relevantRows = getKeyPageSummaryRowsForTypes(input.keyPageDiscoverySummary, [
    "accessibility_statement",
    "contact",
    "contact_page"
  ]);
  const accessibilityRows = relevantRows.filter((row) => String(row.pageType ?? "") === "accessibility_statement");
  const preferredRows = accessibilityRows.length > 0 ? accessibilityRows : relevantRows;
  const successfulUrls = uniqueStrings(getSuccessfulKeyPageUrls(preferredRows));
  const attemptedUrls = uniqueStrings(getAttemptedKeyPageUrls(relevantRows));
  const titleSnippets = normalizePolicySnippetList(getSuccessfulKeyPageTitles(preferredRows));
  const stopReasons = getStopReasons(relevantRows);

  return {
    accessibilityContactMethodPresent: input.snapshot?.accessibility_contact_method_present === true,
    keyPageAttemptCount: attemptedUrls.length > 0 ? attemptedUrls.length : null,
    keyPageAttemptedUrls: attemptedUrls,
    keyPageDiscoverySource: getBestDiscoverySource(relevantRows),
    keyPageStopReason: stopReasons[0] ?? null,
    pageUrls: successfulUrls,
    policySnippets: titleSnippets,
    signalKey: input.signalKey,
    signalLabel: input.signalLabel,
    signalValue: input.signalValue,
    sourceUrls: successfulUrls
  };
}

export function buildCookiePolicyFallbackEvidence(input: {
  keyPageDiscoverySummary?: unknown;
  policyEnrichment?: Array<Record<string, unknown>>;
  signalKey: string;
  signalLabel: string;
  signalValue: unknown;
}) {
  const cookiePolicyRows = getKeyPageSummaryRowsForTypes(input.keyPageDiscoverySummary, ["cookie_policy"]);
  const successfulUrls = uniqueStrings(getSuccessfulKeyPageUrls(cookiePolicyRows));
  const attemptedUrls = uniqueStrings(getAttemptedKeyPageUrls(cookiePolicyRows));
  const titleSnippets = normalizePolicySnippetList(getSuccessfulKeyPageTitles(cookiePolicyRows));
  const stopReasons = getStopReasons(cookiePolicyRows);
  const policyRow = getPolicyRowByPageTypes(input.policyEnrichment ?? [], ["cookie_policy"]);
  const primarySuccessfulUrl = successfulUrls[0] ?? null;
  const policyPageUrl = getPolicyPageUrl(policyRow);
  const shouldPreferPolicyRow = isWeakRootLikeUrl(primarySuccessfulUrl) && !isWeakRootLikeUrl(policyPageUrl);
  const shouldDropWeakRootFallback =
    isWeakRootLikeUrl(primarySuccessfulUrl) &&
    !policyPageUrl;
  const retainedPageUrls = shouldPreferPolicyRow
    ? uniqueStrings([policyPageUrl])
    : shouldDropWeakRootFallback
      ? []
    : uniqueStrings([...successfulUrls, ...(policyPageUrl && successfulUrls.length === 0 ? [policyPageUrl] : [])]);
  const policySnippets =
    titleSnippets.length > 0 && !shouldPreferPolicyRow && !shouldDropWeakRootFallback
      ? titleSnippets
      : getPolicySnippetCandidates(policyRow, [
          "cookie_table",
          "cookie_notice",
          "cookies",
          "tracking_technologies",
          "targeted_advertising"
        ]);

  return {
    keyPageAttemptCount: attemptedUrls.length > 0 ? attemptedUrls.length : null,
    keyPageAttemptedUrls: attemptedUrls,
    keyPageDiscoverySource: getBestDiscoverySource(cookiePolicyRows),
    keyPageStopReason: stopReasons[0] ?? null,
    pageUrl: retainedPageUrls[0] ?? null,
    pageUrls: retainedPageUrls,
    policySnippets,
    policySummaryShort: titleSnippets.length === 0 || shouldPreferPolicyRow ? getPolicySummaryShort(policyRow) : null,
    signalKey: input.signalKey,
    signalLabel: input.signalLabel,
    signalValue: input.signalValue,
    sourceUrls: retainedPageUrls
  };
}

export function isChildContextSignalKey(signalKey: string) {
  return /children_audience_likely|kid_directed_content_detected|form_collects_birthdate|policyChildrenReference|privacy\.children_privacy_context_without_supporting_disclosure/i.test(
    signalKey
  );
}
