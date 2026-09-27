function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/** URLs backed by a complete, verified, owned policy document in the persisted projection. */
export function verifiedPolicyDocumentUrls(
  runtimeArtifacts: Record<string, unknown> | null | undefined,
): string[] | null {
  const summary = record(runtimeArtifacts?.policyDisclosureSummary ?? runtimeArtifacts?.policy_disclosure_summary);
  const projection = record(summary?.policyTextEvidenceProjection ?? summary?.policy_text_evidence_projection);
  if (!projection || !Array.isArray(projection.documents)) return null;
  const documents = projection.documents;
  const urls = documents.flatMap((value) => {
    const document = record(value);
    if (
      document?.extractionStatus !== "complete" ||
      document.artifactVerificationStatus !== "verified" ||
      document.documentRole !== "policy_document" ||
      !["target_controller", "first_party_brand"].includes(String(document.targetRelationship))
    ) return [];
    const url = document.finalUrl ?? document.requestedUrl;
    if (typeof url !== "string") return [];
    try {
      const parsed = new URL(url);
      return parsed.protocol === "https:" || parsed.protocol === "http:"
        ? [parsed.href]
        : [];
    } catch {
      return [];
    }
  });
  return [...new Set(urls)];
}
