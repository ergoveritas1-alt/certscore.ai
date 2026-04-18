import { isMeaningfulPolicyText } from "./policy-snippet-normalization";

export type PolicyEnrichmentRow = Record<string, unknown>;

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
      : null;
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
  return isMeaningfulPolicyText(row.privacyContactChannelType)
    ? row.privacyContactChannelType
    : isMeaningfulPolicyText(row.privacy_contact_channel_type)
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
