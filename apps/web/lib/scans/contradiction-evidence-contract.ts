function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
}

function getStringArray(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    if (Array.isArray(record?.[key])) {
      return uniqueStrings(record[key] as string[]);
    }
  }

  return [] as string[];
}

function getFirstString(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    if (typeof record?.[key] === "string") {
      const value = String(record[key]).trim();
      if (value.length > 0) {
        return value;
      }
    }
  }

  return null;
}

export type ContradictionEvidenceBundle = {
  claim: string | null;
  policySnippet: string | null;
  policySourceUrl: string | null;
  policySummaryShort: string | null;
  relatedVendors: string[];
  runtimeEvidenceArtifacts: string[];
  runtimeSummary: string | null;
  runtimeVendors: string[];
  sourceUrls: string[];
  supportingSignals: string[];
};

export function getContradictionEvidenceBundle(record: Record<string, unknown> | null | undefined): ContradictionEvidenceBundle | null {
  if (!record || typeof record !== "object") {
    return null;
  }

  const nested =
    record.contradictionEvidence && typeof record.contradictionEvidence === "object"
      ? (record.contradictionEvidence as Record<string, unknown>)
      : null;
  const source = nested ?? record;

  const claim = getFirstString(source, ["claim"]);
  const policySnippet =
    getStringArray(source, ["policySnippets", "policy_snippets"])[0] ??
    getFirstString(source, ["policySnippet", "policy_snippet", "claim"]);
  const policySourceUrl = getFirstString(source, ["policySourceUrl", "policy_source_url", "pageUrl", "page_url", "sourceUrl", "source_url"]);
  const policySummaryShort = getFirstString(source, ["policySummaryShort", "policy_summary_short", "policySummary", "policy_summary"]);
  const runtimeSummary = getFirstString(source, ["runtimeSummary", "runtime_summary", "observedBehavior", "observed_behavior"]);
  const runtimeEvidenceArtifacts = getStringArray(source, [
    "runtimeEvidenceArtifacts",
    "runtime_evidence_artifacts",
    "runtimeEvidence",
    "runtime_evidence"
  ]);
  const runtimeVendors = getStringArray(source, ["runtimeVendors", "runtime_vendors"]);
  const relatedVendors = getStringArray(source, ["relatedVendors", "related_vendors"]);
  const supportingSignals = getStringArray(source, ["supportingSignals", "supporting_signals"]);
  const sourceUrls = uniqueStrings([
    ...getStringArray(source, ["sourceUrls", "source_urls"]),
    policySourceUrl
  ]);

  const hasContent =
    Boolean(claim) ||
    Boolean(policySnippet) ||
    Boolean(policySourceUrl) ||
    Boolean(policySummaryShort) ||
    Boolean(runtimeSummary) ||
    runtimeEvidenceArtifacts.length > 0 ||
    runtimeVendors.length > 0 ||
    relatedVendors.length > 0 ||
    supportingSignals.length > 0;

  if (!hasContent) {
    return null;
  }

  return {
    claim,
    policySnippet,
    policySourceUrl,
    policySummaryShort,
    relatedVendors,
    runtimeEvidenceArtifacts,
    runtimeSummary,
    runtimeVendors,
    sourceUrls,
    supportingSignals
  };
}
