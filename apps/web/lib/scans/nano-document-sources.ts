function getString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function getStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0) : [];
}

function getDocumentType(row: Record<string, unknown>, extracted: Record<string, unknown>) {
  return (
    getString(row.document_type) ??
    getString(row.documentType) ??
    getString(extracted.page_type) ??
    getString(extracted.pageType)
  );
}

function getDocumentUrl(row: Record<string, unknown>, extracted: Record<string, unknown>) {
  return (
    getString(row.canonical_url) ??
    getString(row.canonicalUrl) ??
    getString(row.source_url) ??
    getString(row.sourceUrl) ??
    getString(extracted.page_url) ??
    getString(extracted.pageUrl)
  );
}

export function buildNanoPolicyInputsFromDocumentSources(documentSources: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  function hasSemanticPayload(extracted: Record<string, unknown>) {
    return [
      "policy_actionable_flags",
      "policyActionableFlags",
      "policy_dsar_mechanism",
      "policyDsarMechanism",
      "policy_rights_signals",
      "policyRightsSignals",
      "policy_summary_short",
      "policySummaryShort",
      "policy_do_not_sell",
      "policyDoNotSell"
    ].some((key) => key in extracted);
  }

  const rows: Array<Record<string, unknown>> = [];

  for (const row of documentSources) {
    const sourceStatus = getString(row.source_status) ?? getString(row.sourceStatus) ?? "ready";
    const extractionStatus = getString(row.extraction_status) ?? getString(row.extractionStatus) ?? "pending";
    if (sourceStatus === "failed" || sourceStatus === "rejected" || extractionStatus !== "ready") {
      continue;
    }

    const extracted = getRecord(row.extracted_fields_json) ?? getRecord(row.extractedFieldsJson) ?? {};
    if (!hasSemanticPayload(extracted)) {
      continue;
    }
    const metadata = getRecord(row.metadata_json) ?? getRecord(row.metadataJson) ?? {};
    const pageType = getDocumentType(row, extracted);
    const pageUrl = getDocumentUrl(row, extracted);
    const semanticConfidence = getNumber(row.semantic_confidence) ?? getNumber(row.semanticConfidence);
    const evidenceRefs = getStringArray(row.evidence_refs ?? row.evidenceRefs);

    if (typeof pageType !== "string" || typeof pageUrl !== "string") {
      continue;
    }

    rows.push({
      ...extracted,
      metadata_json: metadata,
      page_type: pageType,
      page_url: pageUrl,
      policy_evidence_snippets: extracted.policy_evidence_snippets ?? extracted.policyEvidenceSnippets ?? {},
      policy_semantic_confidence:
        semanticConfidence ??
        getNumber(extracted.policy_semantic_confidence) ??
        getNumber(extracted.policySemanticConfidence),
      source_document_id: getString(row.id),
      source_document_source: getString(row.source) ?? getString(row.document_source) ?? "nano_doc_retrieval",
      source_document_type: pageType,
      source_evidence_refs: evidenceRefs
    });
  }

  return rows;
}
