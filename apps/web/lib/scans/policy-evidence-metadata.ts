export type DerivedPolicyPageType =
  | "privacy_policy"
  | "cookie_policy"
  | "terms_of_service"
  | "accessibility_statement"
  | "affiliate_disclosure"
  | "contact_page"
  | "non_policy"
  | null;

function getBooleanValue(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function getStringValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function normalizeDerivedPolicyPageType(value: unknown): DerivedPolicyPageType {
  switch (value) {
    case "privacy_policy":
    case "cookie_policy":
    case "terms_of_service":
    case "accessibility_statement":
    case "affiliate_disclosure":
    case "contact_page":
    case "non_policy":
      return value;
    default:
      return null;
  }
}

export function derivePolicyPageTypeFromEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  return (
    normalizeDerivedPolicyPageType(rawEvidence?.normalizedConcernPolicyPageType) ??
    normalizeDerivedPolicyPageType(rawEvidence?.policyPageType) ??
    normalizeDerivedPolicyPageType(rawEvidence?.policy_page_type) ??
    normalizeDerivedPolicyPageType(rawEvidence?.pageType) ??
    normalizeDerivedPolicyPageType(rawEvidence?.page_type)
  );
}

export function derivePolicyPrimarySourceFromEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  const explicit =
    getBooleanValue(rawEvidence?.normalizedConcernPolicyIsPrimarySource) ??
    getBooleanValue(rawEvidence?.policyIsPrimarySource) ??
    getBooleanValue(rawEvidence?.policy_is_primary_source) ??
    getBooleanValue(rawEvidence?.isPrimaryPolicy) ??
    getBooleanValue(rawEvidence?.is_primary_policy) ??
    getBooleanValue(rawEvidence?.isPrimaryPolicyEnrichment) ??
    getBooleanValue(rawEvidence?.is_primary_policy_enrichment);

  if (explicit !== null) {
    return explicit;
  }

  const sourceRole = getStringValue(rawEvidence?.policySourceRole) ?? getStringValue(rawEvidence?.normalizedConcernPolicySourceRole);
  if (sourceRole === "primary_policy") {
    return true;
  }
  if (sourceRole === "secondary_policy" || sourceRole === "non_policy") {
    return false;
  }

  return null;
}
