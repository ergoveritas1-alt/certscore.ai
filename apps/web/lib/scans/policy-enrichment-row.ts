import { isMeaningfulPolicyText } from "./policy-snippet-normalization";

export type PolicyEnrichmentRow = Record<string, unknown>;

export function getPolicyEvidenceSnippets(row: PolicyEnrichmentRow) {
  return row.policyEvidenceSnippets && typeof row.policyEvidenceSnippets === "object"
    ? (row.policyEvidenceSnippets as Record<string, unknown>)
    : row.policy_evidence_snippets && typeof row.policy_evidence_snippets === "object"
      ? (row.policy_evidence_snippets as Record<string, unknown>)
      : null;
}

export function getPolicyRightsSignals(row: PolicyEnrichmentRow, snippets?: Record<string, unknown> | null) {
  return Array.isArray(row.policyRightsSignals)
    ? row.policyRightsSignals
    : Array.isArray(row.policy_rights_signals)
      ? row.policy_rights_signals
      : Array.isArray(snippets?.policy_rights_signals)
        ? snippets.policy_rights_signals
        : [];
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
  return Array.isArray(row.policyActionableFlags)
    ? row.policyActionableFlags
    : Array.isArray(row.policy_actionable_flags)
      ? row.policy_actionable_flags
      : [];
}
