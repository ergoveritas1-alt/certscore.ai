import { isMeaningfulPolicyText } from "./policy-snippet-normalization";
import { getDomain as getTldtsDomain, getHostname as getTldtsHostname } from "tldts";

export type PolicyEnrichmentRow = Record<string, unknown>;
export const MAX_PUBLIC_POLICY_SURFACES = 5;

export type PublicPolicySurfaceProjection = {
  type: string;
  url: string | null;
};

export function isClearlyNonPolicySurfaceUrl(value: string | null | undefined) {
  if (!value) return false;
  try {
    const pathname = new URL(value).pathname.toLowerCase().replace(/\/+$/, "") || "/";
    return pathname === "/" || /\/(?:account-rules|acceptable-behaviou?r-statement|careers?|jobs?|news|events?|support|contact)(?:\/|$)/.test(pathname);
  } catch {
    return false;
  }
}

export function meaningfulPolicySurfaceTitle(type: string, value: string | null | undefined) {
  if (value) {
    try {
      const segments = new URL(value).pathname.split("/").filter(Boolean);
      const slug = segments.at(-1)?.replace(/\.(?:html?|pdf)$/i, "");
      if (slug && !/^(?:privacy|cookie|terms|policy)$/.test(slug)) {
        return slug.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
      }
    } catch {
      // Fall through to the semantic type label.
    }
  }
  if (/cookie/i.test(type)) return "Cookie policy";
  if (/terms/i.test(type)) return "Terms of service";
  return "Privacy policy";
}

function policySurfaceRegistrableDomain(value: string | null | undefined) {
  if (!value) return null;
  const hostname = getTldtsHostname(value.includes("://") ? value : `https://${value}`);
  return hostname ? getTldtsDomain(hostname, { allowPrivateDomains: true }) ?? hostname : null;
}

function canonicalPolicySurfaceIdentity(value: string | null) {
  if (!value) return "";
  try {
    const url = new URL(value);
    url.hostname = url.hostname.replace(/^www\./i, "").toLowerCase();
    url.search = "";
    url.hash = "";
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString();
  } catch {
    return value.trim().toLowerCase();
  }
}

function publicPolicySurfaceScore(surface: PublicPolicySurfaceProjection, siteDomain: string | null) {
  const surfaceDomain = policySurfaceRegistrableDomain(surface.url);
  const firstParty = Boolean(siteDomain && surfaceDomain && siteDomain === surfaceDomain);
  const type = surface.type.toLowerCase();
  const typeScore = /privacy(?:[_ ]policy| notice)/.test(type)
    ? 40
    : /cookie(?:[_ ]policy| notice|[_ ]settings)/.test(type)
      ? 32
      : /terms/.test(type)
        ? 24
        : /privacy_choice|consent_preferences|do_not_sell/.test(type)
          ? 20
          : 4;
  const documentScore = /\.pdf(?:[?#]|$)/i.test(surface.url ?? "") ? 6 : 0;
  let canonicalCoreDocumentScore = 0;
  try {
    const pathname = new URL(surface.url ?? "").pathname.toLowerCase().replace(/\/+$/, "") || "/";
    if (/^\/(?:privacy|privacy-policy|privacy-notice)$/.test(pathname)) canonicalCoreDocumentScore = 18;
    else if (/^\/(?:cookies?|cookie-policy|cookie-notice)$/.test(pathname)) canonicalCoreDocumentScore = 14;
    else if (/^\/(?:terms|terms-of-service|terms-and-conditions)$/.test(pathname)) canonicalCoreDocumentScore = 10;
  } catch {
    canonicalCoreDocumentScore = 0;
  }
  return (firstParty ? 100 : 0) + typeScore + documentScore + canonicalCoreDocumentScore;
}

/**
 * Keeps customer-facing policy cards bounded and first-party focused. External
 * vendor notices remain in raw policy enrichment/vendor-disclosure evidence.
 */
export function prioritizePublicPolicySurfaces<T extends PublicPolicySurfaceProjection>(
  surfaces: T[],
  options: { limit?: number; siteDomain?: string | null } = {}
) {
  const limit = Math.max(0, options.limit ?? MAX_PUBLIC_POLICY_SURFACES);
  const siteDomain = policySurfaceRegistrableDomain(options.siteDomain);
  const policyOnly = surfaces.filter((surface) => !isClearlyNonPolicySurfaceUrl(surface.url));
  const deduped = policyOnly.filter((surface, index, rows) => {
    const identity = `${surface.type.toLowerCase()}:${canonicalPolicySurfaceIdentity(surface.url)}`;
    return rows.findIndex((candidate) =>
      `${candidate.type.toLowerCase()}:${canonicalPolicySurfaceIdentity(candidate.url)}` === identity
    ) === index;
  });
  const firstParty = deduped.filter((surface) =>
    Boolean(siteDomain && policySurfaceRegistrableDomain(surface.url) === siteDomain)
  );
  const eligible = firstParty.length > 0
    ? deduped.filter((surface) =>
        surface.url === null ||
        policySurfaceRegistrableDomain(surface.url) === siteDomain
      )
    : deduped;
  const ranked = eligible
    .map((surface, index) => ({ index, score: publicPolicySurfaceScore(surface, siteDomain), surface }))
    .sort((left, right) => right.score - left.score || left.index - right.index);
  const selected = ranked.slice(0, limit);
  for (const pattern of [/privacy/i, /cookie/i, /terms/i]) {
    const candidate = ranked.find((entry) => pattern.test(entry.surface.type));
    if (!candidate || selected.includes(candidate) || selected.length === 0) continue;
    const replaceIndex = [...selected].reverse().findIndex((entry) =>
      selected.filter((other) => other.surface.type === entry.surface.type).length > 1
    );
    const actualReplaceIndex = replaceIndex < 0 ? selected.length - 1 : selected.length - 1 - replaceIndex;
    selected.splice(actualReplaceIndex, 1, candidate);
  }
  return selected
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ surface }) => surface);
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
}

export function getPolicyEvidenceSnippets(row: PolicyEnrichmentRow) {
  return row.policyEvidenceSnippets && typeof row.policyEvidenceSnippets === "object"
    ? (row.policyEvidenceSnippets as Record<string, unknown>)
    : row.policy_evidence_snippets && typeof row.policy_evidence_snippets === "object"
      ? (row.policy_evidence_snippets as Record<string, unknown>)
      : row.evidenceSnippets && typeof row.evidenceSnippets === "object"
        ? (row.evidenceSnippets as Record<string, unknown>)
        : row.evidence_snippets && typeof row.evidence_snippets === "object"
          ? (row.evidence_snippets as Record<string, unknown>)
          : null;
}

function snippetSelectorMatches(key: string, selector: string | RegExp) {
  return typeof selector === "string" ? key === selector : selector.test(key);
}

export function getPolicyEvidenceSnippetValues(row: PolicyEnrichmentRow, selectors: Array<string | RegExp>) {
  const snippets = getPolicyEvidenceSnippets(row);
  if (!snippets) {
    return [];
  }

  const values: string[] = [];
  for (const [key, value] of Object.entries(snippets)) {
    if (!selectors.some((selector) => snippetSelectorMatches(key, selector))) {
      continue;
    }

    if (typeof value === "string" && isMeaningfulPolicyText(value) && value.trim().toLowerCase() !== "nano") {
      values.push(value);
    } else if (Array.isArray(value)) {
      values.push(...value.filter((entry): entry is string => isMeaningfulPolicyText(entry) && entry.trim().toLowerCase() !== "nano"));
    }
  }

  return uniqueStrings(values);
}

export function getPolicyRightsSignals(row: PolicyEnrichmentRow, snippets?: Record<string, unknown> | null) {
  return normalizeStringArray(
    Array.isArray(row.policyRightsSignals)
      ? row.policyRightsSignals
      : Array.isArray(row.policy_rights_signals)
        ? row.policy_rights_signals
        : snippets?.policy_rights_signals
  );
}

export function getPolicyMentions(row: PolicyEnrichmentRow) {
  return Array.isArray(row.policyMentions)
    ? row.policyMentions
    : Array.isArray(row.policy_mentions)
      ? row.policy_mentions
      : [];
}

export function getPolicyPageType(row: PolicyEnrichmentRow) {
  return typeof row.pageType === "string"
    ? row.pageType
    : typeof row.page_type === "string"
      ? row.page_type
      : null;
}

export function getPolicyPageUrl(row: PolicyEnrichmentRow) {
  return typeof row.pageUrl === "string"
    ? row.pageUrl
    : typeof row.page_url === "string"
      ? row.page_url
      : null;
}

export function getPolicySummaryText(row: PolicyEnrichmentRow) {
  return isMeaningfulPolicyText(row.policySummaryShort)
    ? row.policySummaryShort
    : isMeaningfulPolicyText(row.policy_summary_short)
      ? row.policy_summary_short
      : null;
}

export function getPrivacyContactChannelType(row: PolicyEnrichmentRow) {
  return typeof row.privacyContactChannelType === "string" && row.privacyContactChannelType.trim().length > 0
    ? row.privacyContactChannelType
    : typeof row.privacy_contact_channel_type === "string" && row.privacy_contact_channel_type.trim().length > 0
      ? row.privacy_contact_channel_type
      : null;
}

export function getPolicyChildrenReference(row: PolicyEnrichmentRow) {
  return isMeaningfulPolicyText(row.policyChildrenReference)
    ? row.policyChildrenReference
    : isMeaningfulPolicyText(row.policy_children_reference)
      ? row.policy_children_reference
      : null;
}

export function getPolicyActionableFlags(row: PolicyEnrichmentRow) {
  return normalizeStringArray(
    Array.isArray(row.policyActionableFlags)
      ? row.policyActionableFlags
      : row.policy_actionable_flags
  );
}

export function getPolicySemanticConfidence(row: PolicyEnrichmentRow) {
  const value =
    typeof row.policySemanticConfidence === "number" && Number.isFinite(row.policySemanticConfidence)
      ? row.policySemanticConfidence
      : typeof row.policy_semantic_confidence === "number" && Number.isFinite(row.policy_semantic_confidence)
        ? row.policy_semantic_confidence
        : null;

  return typeof value === "number" ? Math.max(0, Math.min(1, value)) : null;
}

export function getPolicyAmbiguityScore(row: PolicyEnrichmentRow) {
  return typeof row.policyAmbiguityScore === "number" && Number.isFinite(row.policyAmbiguityScore)
    ? row.policyAmbiguityScore
    : typeof row.policy_ambiguity_score === "number" && Number.isFinite(row.policy_ambiguity_score)
      ? row.policy_ambiguity_score
      : null;
}

export function getPolicyCookieDisclosures(row: PolicyEnrichmentRow) {
  return Array.isArray(row.policyCookieDisclosures)
    ? row.policyCookieDisclosures
    : Array.isArray(row.policy_cookie_disclosures)
      ? row.policy_cookie_disclosures
      : [];
}

export function getPolicyCoverageRatio(row: PolicyEnrichmentRow) {
  return typeof row.policyCoverageRatio === "number" && Number.isFinite(row.policyCoverageRatio)
    ? row.policyCoverageRatio
    : typeof row.policy_coverage_ratio === "number" && Number.isFinite(row.policy_coverage_ratio)
      ? row.policy_coverage_ratio
      : null;
}

export function getPolicySnippetCount(row: PolicyEnrichmentRow) {
  return typeof row.policySnippetCount === "number" && Number.isFinite(row.policySnippetCount)
    ? row.policySnippetCount
    : typeof row.policy_snippet_count === "number" && Number.isFinite(row.policy_snippet_count)
      ? row.policy_snippet_count
      : null;
}

export function getPolicyStructurallyWeak(row: PolicyEnrichmentRow) {
  return row.policyStructurallyWeak === true || row.policy_structurally_weak === true;
}

export function getPolicyDsarMechanism(row: PolicyEnrichmentRow) {
  return isMeaningfulPolicyText(row.policyDsarMechanism)
    ? row.policyDsarMechanism
    : isMeaningfulPolicyText(row.policy_dsar_mechanism)
      ? row.policy_dsar_mechanism
      : null;
}

export function getPolicyDoNotSell(row: PolicyEnrichmentRow) {
  return isMeaningfulPolicyText(row.policyDoNotSell)
    ? row.policyDoNotSell
    : isMeaningfulPolicyText(row.policy_do_not_sell)
      ? row.policy_do_not_sell
      : null;
}

export function getPrimaryPolicyEnrichmentRow(rows: PolicyEnrichmentRow[]) {
  return rows.find((row) => getPolicyPageType(row) === "privacy_policy") ?? rows[0] ?? null;
}

export function getPolicyRowsForPageType(rows: PolicyEnrichmentRow[], pageType: string) {
  return rows.filter((row) => getPolicyPageType(row) === pageType);
}

export function getFirstPolicyRowByPageTypes(rows: PolicyEnrichmentRow[], pageTypes: string[]) {
  const wantedTypes = new Set(pageTypes);
  return rows.find((row) => wantedTypes.has(String(getPolicyPageType(row) ?? ""))) ?? null;
}

export function getPolicyRowEvidenceRefs(rows: PolicyEnrichmentRow[]) {
  return uniqueStrings(rows.map(getPolicyPageUrl));
}
