export type PolicyCoverageEvent = {
  createdAt?: string;
  eventType: string;
  metadataJson?: unknown;
  metadata?: unknown;
};

export type PolicyCoverageContext = {
  documentSourceCount: number | null;
  extractionCharacterCount: number | null;
  policyDocumentCount: number | null;
  policyEnrichmentCount: number | null;
  weakPolicyEvidence: boolean;
  weakPolicyEvidenceReason: "no_policy_documents" | "thin_policy_extraction" | null;
};

const THIN_POLICY_EXTRACTION_CHARACTER_THRESHOLD = 1_000;

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function getNumber(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function getEventMetadata(event: PolicyCoverageEvent) {
  return getRecord(event.metadataJson) ?? getRecord(event.metadata) ?? null;
}

export function derivePolicyCoverageContext(input: {
  events?: PolicyCoverageEvent[];
  policyEnrichmentCount?: number | null;
}): PolicyCoverageContext {
  const enrichmentEvents = (input.events ?? [])
    .filter((event) => event.eventType === "signals.nano_doc_enrichment_completed")
    .sort((left, right) => {
      const leftMs = Date.parse(left.createdAt ?? "");
      const rightMs = Date.parse(right.createdAt ?? "");
      if (Number.isFinite(leftMs) && Number.isFinite(rightMs)) {
        return rightMs - leftMs;
      }
      return 0;
    })
    .map(getEventMetadata)
    .filter((event): event is Record<string, unknown> => Boolean(event));
  const latestEvent = enrichmentEvents[0] ?? null;
  const policyDocumentCount =
    getNumber(latestEvent, ["policyDocumentCount", "policy_document_count"]) ??
    (typeof input.policyEnrichmentCount === "number" ? input.policyEnrichmentCount : null);
  const policyEnrichmentCount =
    getNumber(latestEvent, ["policyEnrichmentCount", "policy_enrichment_count"]) ??
    (typeof input.policyEnrichmentCount === "number" ? input.policyEnrichmentCount : null);
  const documentSourceCount = getNumber(latestEvent, ["documentSourceCount", "document_source_count"]);
  const extractionCharacterCount = getNumber(latestEvent, [
    "freshExtractionCharacterCount",
    "fresh_extraction_character_count"
  ]);
  const noPolicyDocuments =
    policyDocumentCount !== null && policyDocumentCount <= 0 &&
    policyEnrichmentCount !== null && policyEnrichmentCount <= 0;
  const thinPolicyExtraction =
    policyDocumentCount !== null &&
    policyDocumentCount > 0 &&
    extractionCharacterCount !== null &&
    extractionCharacterCount > 0 &&
    extractionCharacterCount < THIN_POLICY_EXTRACTION_CHARACTER_THRESHOLD;
  const weakPolicyEvidenceReason = noPolicyDocuments
    ? "no_policy_documents"
    : thinPolicyExtraction
      ? "thin_policy_extraction"
      : null;

  return {
    documentSourceCount,
    extractionCharacterCount,
    policyDocumentCount,
    policyEnrichmentCount,
    weakPolicyEvidence: weakPolicyEvidenceReason !== null,
    weakPolicyEvidenceReason
  };
}

export function getWeakPolicyEvidenceLimitation(context: PolicyCoverageContext) {
  if (context.weakPolicyEvidenceReason === "no_policy_documents") {
    return "No usable privacy, cookie, or legal policy document was retained, so policy-dependent regulatory rows are not testable from this scan.";
  }

  if (context.weakPolicyEvidenceReason === "thin_policy_extraction") {
    return "Policy extraction retained only a very small amount of text, so policy-dependent regulatory rows are not treated as cleanly evaluated.";
  }

  return null;
}
