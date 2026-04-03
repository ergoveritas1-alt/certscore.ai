import type { KeyPageFetchQuality } from "@website-signal-risk-scanner/shared";
import {
  isMeaningfulPolicyText,
  normalizePolicySnippet,
  normalizePolicySnippetList
} from "./policy-snippet-normalization";
import {
  getFirstPolicyRowByPageTypes,
  getPolicyEvidenceSnippets as getSharedPolicyEvidenceSnippets,
  getPolicyPageType as getSharedPolicyPageType,
  getPolicyPageUrl as getSharedPolicyPageUrl,
  getPolicySummaryText as getSharedPolicySummaryText
} from "./policy-enrichment-row";

export type FetchQuality = KeyPageFetchQuality;

function isFetchQuality(value: unknown): value is FetchQuality {
  return (
    value === "verified_content" ||
    value === "thin_content" ||
    value === "blocked_interstitial" ||
    value === "unreachable"
  );
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
}

type NormalizedPolicyRow = {
  pageType: string | null;
  pageUrl: string | null;
  policyEvidenceSnippets: Record<string, unknown> | null;
  policySummaryShort: string | null;
  raw: Record<string, unknown>;
};

const BLOCKED_OR_INTERSTITIAL_TEXT_PATTERN =
  /unable to authorize your request|access denied|verify you are human|captcha|bot challenge|request blocked|security check|temporarily unavailable|forbidden|we(?:'|’)re sorry, but we were unable to authorize your request/i;

function getFetchQualityFromEvidence(input: {
  attemptedUrls?: string[];
  pageUrls?: string[];
  snippets?: string[];
  stopReason?: string | null;
}): FetchQuality {
  const attemptedUrls = input.attemptedUrls ?? [];
  const pageUrls = input.pageUrls ?? [];
  const snippets = input.snippets ?? [];
  const stopReason = input.stopReason ?? null;

  if (snippets.some((snippet) => BLOCKED_OR_INTERSTITIAL_TEXT_PATTERN.test(snippet)) || (stopReason && /blocked|challenge|captcha|forbidden|auth/i.test(stopReason))) {
    return "blocked_interstitial";
  }
  if (pageUrls.length > 0 && snippets.length > 0) {
    return "verified_content";
  }
  if (pageUrls.length > 0 || snippets.length > 0) {
    return "thin_content";
  }
  if (attemptedUrls.length > 0 || stopReason) {
    return "unreachable";
  }

  return "thin_content";
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

function getExplicitFetchQuality(rows: Array<Record<string, unknown>>): FetchQuality | null {
  const values = rows.flatMap((row) => (isFetchQuality(row.fetchQuality) ? [row.fetchQuality] : []));

  if (values.includes("blocked_interstitial")) {
    return "blocked_interstitial";
  }
  if (values.includes("verified_content")) {
    return "verified_content";
  }
  if (values.includes("thin_content")) {
    return "thin_content";
  }
  if (values.includes("unreachable")) {
    return "unreachable";
  }

  return null;
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

function normalizePolicyRow(row: Record<string, unknown>): NormalizedPolicyRow {
  return {
    pageType: getSharedPolicyPageType(row),
    pageUrl: getSharedPolicyPageUrl(row),
    policyEvidenceSnippets: getSharedPolicyEvidenceSnippets(row),
    policySummaryShort: getSharedPolicySummaryText(row),
    raw: row
  };
}

function getPolicyEnrichmentSnippetRecord(row: NormalizedPolicyRow | null) {
  if (!row) {
    return null;
  }

  return row.policyEvidenceSnippets;
}

function getPolicyPageUrl(row: NormalizedPolicyRow | null) {
  return row?.pageUrl ?? null;
}

function getPolicySummaryShort(row: NormalizedPolicyRow | null) {
  if (!row) {
    return null;
  }

  return row.policySummaryShort;
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
            canonicalUrl: typeof row.canonicalUrl === "string" ? row.canonicalUrl : null,
            ogUrl:
              typeof row.ogUrl === "string"
                ? row.ogUrl
                : typeof row.og_url === "string"
                  ? row.og_url
                  : null,
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
  const row = getFirstPolicyRowByPageTypes(policyEnrichment, pageTypes);
  return row ? normalizePolicyRow(row) : null;
}

function getPolicySnippetCandidates(row: NormalizedPolicyRow | null, snippetKeys: string[]) {
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

function getCookiePolicySnippetCandidates(row: NormalizedPolicyRow | null) {
  return getPolicySnippetCandidates(row, [
    "cookie_table",
    "cookie_notice",
    "cookies",
    "tracking_technologies",
    "targeted_advertising",
    "privacy_choices",
    "do_not_sell"
  ]);
}

function hasCookieLikeEvidenceText(value: string | null | undefined) {
  if (!isMeaningfulPolicyText(value)) {
    return false;
  }

  return /cookie|tracking technolog|analytical cookies|marketing cookies|privacy choices|your privacy choices|gpc|global privacy control|opt-out preference/i.test(
    value
  );
}

function isGenericCookiePathUrl(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  try {
    const parsed = new URL(value);
    return /\/(?:legal\/)?cookies\/?$/i.test(parsed.pathname);
  } catch {
    return /\/(?:legal\/)?cookies\/?$/i.test(value);
  }
}

function getCookiePolicyFallbackRow(policyEnrichment: Array<Record<string, unknown>>) {
  const scoredRows = policyEnrichment
    .map((policyRow) => {
      const row = normalizePolicyRow(policyRow);
      const pageType = String(row.pageType ?? "");
      const pageUrl = getPolicyPageUrl(row);
      const policySummaryShort = getPolicySummaryShort(row);
      const snippets = getCookiePolicySnippetCandidates(row);
      const combinedText = [...snippets, ...(policySummaryShort ? [policySummaryShort] : [])];
      const hasCookieEvidence = combinedText.some((entry) => hasCookieLikeEvidenceText(entry));

      if (!hasCookieEvidence && pageType !== "cookie_policy") {
        return null;
      }

      let score = 0;
      if (pageType === "cookie_policy") {
        score += 5;
      }
      if (pageType === "privacy_policy") {
        score += 3;
      }
      if (pageUrl && !isMachineReadablePolicyEndpoint(pageUrl)) {
        score += 2;
      }
      if (pageUrl && !isWeakRootLikeUrl(pageUrl)) {
        score += 2;
      }
      if (snippets.some((entry) => hasCookieLikeEvidenceText(entry))) {
        score += 3;
      }
      if (combinedText.some((entry) => /your privacy choices|privacy choices/i.test(entry))) {
        score += 1;
      }
      if (combinedText.some((entry) => /gpc|global privacy control|opt-out preference/i.test(entry))) {
        score += 1;
      }
      if (pageUrl && /\/legal\/privacy\/us-residents\/?$/i.test(pageUrl)) {
        score += 3;
      } else if (pageUrl && /us-residents|privacy-notice|privacy-notice/i.test(pageUrl)) {
        score += 2;
      }

      return {
        row,
        score
      };
    })
    .filter((entry): entry is { row: NormalizedPolicyRow; score: number } => entry !== null)
    .sort((left, right) => right.score - left.score);

  return scoredRows[0]?.row ?? null;
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
  const hasAffiliateEvidence = (row: NormalizedPolicyRow) => {
    const summary = row.policySummaryShort;
    const pageUrl = row.pageUrl;
    const snippets = getPolicyEnrichmentSnippetRecord(row);

    return (
      row.pageType === "affiliate_disclosure" ||
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

  return policyEnrichment.map(normalizePolicyRow).find(hasAffiliateEvidence) ?? null;
}

function getAffiliatePolicyFallbackSnippet(row: NormalizedPolicyRow | null) {
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

  const summary = row.policySummaryShort;

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
        : isContactSurfaceSignal
          ? ["contact", "contact_page"]
          : isDoNotSellSignal
            ? ["privacy_policy", "cookie_policy"]
            : []
  );
  const cookiePolicyRow = isCookieSurfaceSignal ? getCookiePolicyFallbackRow(input.policyEnrichment ?? []) : null;
  const effectiveGenericPolicyRow = cookiePolicyRow ?? genericPolicyRow;
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
  const genericPolicyPageUrl = getPolicyPageUrl(effectiveGenericPolicyRow);
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
            ? getPolicySnippetCandidates(effectiveGenericPolicyRow, [
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
  const reanchoredCookieSignalToPolicyEvidence =
    isCookieSurfaceSignal &&
    Boolean(genericHumanPolicyPageUrl) &&
    !nonWeakSuccessfulUrls.includes(genericHumanPolicyPageUrl ?? "");
  const effectiveGenericPageUrls =
    reanchoredCookieSignalToPolicyEvidence && genericHumanPolicyPageUrl
      ? [genericHumanPolicyPageUrl]
      : genericPageUrls;
  const effectiveGenericSourceUrls =
    reanchoredCookieSignalToPolicyEvidence && genericHumanPolicyPageUrl
      ? [genericHumanPolicyPageUrl]
      : genericSourceUrls;

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
  const explicitFetchQuality = getExplicitFetchQuality(relevantRows);
  const hasExplicitChoiceSurfaceUrl = uniqueStrings([...effectiveGenericPageUrls, ...effectiveGenericSourceUrls]).some((url) =>
    /privacy-choices|privacy_choices|your-privacy-choices|do-not-sell|do-not-share|opt-?out|ad-choices|cookie/i.test(url)
  );
  const shouldReanchorGuessedDoNotSellToPolicyPage =
    isDoNotSellSignal &&
    !hasExplicitChoiceSurfaceUrl &&
    genericHumanPolicyPageUrl !== null &&
    relevantRows.length > 0 &&
    relevantRows.every(
      (row) =>
        typeof row.bestDiscoverySource !== "string" ||
        !["footer_link", "header_link", "body_link", "legal_hub", "second_hop_legal_hub"].includes(row.bestDiscoverySource)
    );
  const reanchoredDoNotSellPageUrls = shouldReanchorGuessedDoNotSellToPolicyPage ? [genericHumanPolicyPageUrl] : effectiveGenericPageUrls;
  const reanchoredDoNotSellSourceUrls = shouldReanchorGuessedDoNotSellToPolicyPage ? [genericHumanPolicyPageUrl] : effectiveGenericSourceUrls;

  return {
    affiliateDisclosurePresent: input.snapshot?.affiliate_disclosure_present === true,
    contactPagePresent: input.snapshot?.contact_page_present === true,
    fetchQuality:
      (!reanchoredCookieSignalToPolicyEvidence ? explicitFetchQuality : null) ??
      getFetchQualityFromEvidence({
        attemptedUrls,
        pageUrls:
          preferredDoNotSellPageUrls.length > 0
            ? preferredDoNotSellPageUrls
            : reanchoredDoNotSellPageUrls,
        snippets: preferredDoNotSellSnippets.length > 0 ? preferredDoNotSellSnippets : genericPolicySnippets,
        stopReason: !reanchoredCookieSignalToPolicyEvidence ? stopReasons[0] ?? null : null
      }),
    keyPageAttemptCount: attemptedUrls.length > 0 ? attemptedUrls.length : null,
    keyPageAttemptedUrls: [...new Set(attemptedUrls)],
    keyPageDiscoverySource: getBestDiscoverySource(relevantRows),
    keyPageGuessedOnly:
      relevantRows.length > 0 &&
      relevantRows.every(
        (row) =>
          typeof row.bestDiscoverySource !== "string" ||
          !["footer_link", "header_link", "body_link", "legal_hub", "second_hop_legal_hub"].includes(row.bestDiscoverySource)
      ),
    keyPageStopReason: stopReasons[0] ?? null,
    keyPageTitleRecords: successfulTitleRecords,
    pageUrls: preferredDoNotSellPageUrls.length > 0 ? preferredDoNotSellPageUrls : reanchoredDoNotSellPageUrls,
    policySnippets: preferredDoNotSellSnippets.length > 0 ? preferredDoNotSellSnippets : genericPolicySnippets,
    doNotSellLinkPresent: input.snapshot?.do_not_sell_link_present === true,
    privacyPolicyPresent: input.snapshot?.privacy_policy_present === true,
    signalKey: input.signalKey,
    signalLabel: input.signalLabel,
    signalValue: input.signalValue,
    sourceUrls: preferredDoNotSellSourceUrls.length > 0 ? preferredDoNotSellSourceUrls : reanchoredDoNotSellSourceUrls,
    termsOfServicePresent: input.snapshot?.terms_of_service_present === true,
    policySummaryShort:
      genericPolicySnippets.length === 0 && effectiveGenericPolicyRow ? getPolicySummaryShort(effectiveGenericPolicyRow) : null
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
  const titleRecords = getSuccessfulKeyPageTitleRecords(preferredRows);
  const stopReasons = getStopReasons(relevantRows);
  const explicitFetchQuality = getExplicitFetchQuality(preferredRows);

  return {
    accessibilityContactMethodPresent: input.snapshot?.accessibility_contact_method_present === true,
    fetchQuality:
      explicitFetchQuality ??
      getFetchQualityFromEvidence({
        attemptedUrls,
        pageUrls: successfulUrls,
        snippets: titleSnippets,
        stopReason: stopReasons[0] ?? null
      }),
    keyPageAttemptCount: attemptedUrls.length > 0 ? attemptedUrls.length : null,
    keyPageAttemptedUrls: attemptedUrls,
    keyPageDiscoverySource: getBestDiscoverySource(relevantRows),
    keyPageGuessedOnly:
      relevantRows.length > 0 &&
      relevantRows.every(
        (row) =>
          typeof row.bestDiscoverySource !== "string" ||
          !["footer_link", "header_link", "body_link", "legal_hub", "second_hop_legal_hub"].includes(row.bestDiscoverySource)
      ),
    keyPageStopReason: stopReasons[0] ?? null,
    keyPageTitleRecords: titleRecords,
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
  const policyRow = getCookiePolicyFallbackRow(input.policyEnrichment ?? []);
  const primarySuccessfulUrl = successfulUrls[0] ?? null;
  const policyPageUrl = getPolicyPageUrl(policyRow);
  const shouldPreferPolicyRow =
    (!policyPageUrl
      ? false
      : (isWeakRootLikeUrl(primarySuccessfulUrl) && !isWeakRootLikeUrl(policyPageUrl)) ||
        (isGenericCookiePathUrl(primarySuccessfulUrl) &&
          titleSnippets.length === 0 &&
          getCookiePolicySnippetCandidates(policyRow).length > 0 &&
          policyPageUrl !== primarySuccessfulUrl) ||
        Boolean(
          cookiePolicyRows.some(
            (row) =>
              row.fetchQuality === "blocked_interstitial" ||
              (typeof row.stopReason === "string" && /blocked|challenge|captcha|forbidden|auth/i.test(row.stopReason))
          )
        ));
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
      : getCookiePolicySnippetCandidates(policyRow);
  const explicitFetchQuality = getExplicitFetchQuality(cookiePolicyRows);
  const reanchoredToPolicyEvidence =
    shouldPreferPolicyRow &&
    Boolean(policyPageUrl) &&
    !successfulUrls.includes(policyPageUrl ?? "");

  return {
    fetchQuality:
      (!reanchoredToPolicyEvidence ? explicitFetchQuality : null) ??
      getFetchQualityFromEvidence({
        attemptedUrls: !reanchoredToPolicyEvidence ? attemptedUrls : [],
        pageUrls: retainedPageUrls,
        snippets: policySnippets,
        stopReason: !reanchoredToPolicyEvidence ? stopReasons[0] ?? null : null
      }),
    keyPageAttemptCount: attemptedUrls.length > 0 ? attemptedUrls.length : null,
    keyPageAttemptedUrls: attemptedUrls,
    keyPageDiscoverySource: getBestDiscoverySource(cookiePolicyRows),
    keyPageGuessedOnly:
      cookiePolicyRows.length > 0 &&
      cookiePolicyRows.every(
        (row) =>
          typeof row.bestDiscoverySource !== "string" ||
          !["footer_link", "header_link", "body_link", "legal_hub", "second_hop_legal_hub"].includes(row.bestDiscoverySource)
      ),
    keyPageStopReason: stopReasons[0] ?? null,
    keyPageTitleRecords: getSuccessfulKeyPageTitleRecords(cookiePolicyRows),
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
