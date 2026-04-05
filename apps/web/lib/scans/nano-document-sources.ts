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

function getPolicyInputPageType(row: Record<string, unknown>) {
  return getString(row.page_type) ?? getString(row.pageType) ?? getString(row.source_document_type);
}

function getPolicyInputStrengthScore(row: Record<string, unknown>) {
  const pageType = getPolicyInputPageType(row);
  const pageUrl = getString(row.page_url) ?? getString(row.pageUrl) ?? getString(row.canonical_url) ?? getString(row.canonicalUrl);
  const summary = getString(row.policy_summary_short) ?? getString(row.policySummaryShort) ?? "";
  const semanticConfidence =
    getNumber(row.policy_semantic_confidence) ??
    getNumber(row.policySemanticConfidence) ??
    0;
  const ambiguityValue =
    getNumber(row.policy_ambiguity_score) ??
    getNumber(row.policyAmbiguityScore);
  const ambiguity = ambiguityValue ?? (semanticConfidence > 0 ? 25 : 100);
  const rightsSignals = getStringArray(row.policy_rights_signals ?? row.policyRightsSignals);
  const mentions = Array.isArray(row.policy_mentions)
    ? row.policy_mentions
    : Array.isArray(row.policyMentions)
      ? row.policyMentions
      : [];
  const contactChannel =
    getString(row.privacy_contact_channel_type) ?? getString(row.privacyContactChannelType) ?? "none";
  const structurallyWeak = row.policy_structurally_weak === true || row.policyStructurallyWeak === true;
  const retentionPeriods = Array.isArray(row.policy_retention_periods) ? row.policy_retention_periods : [];
  const retentionDisclosure =
    getString(row.policy_retention_disclosure) ?? getString(row.policyRetentionDisclosure);
  const fieldCoverage = getRecord(row.policy_field_coverage) ?? getRecord(row.policyFieldCoverage);
  const retentionCoverage = getRecord(fieldCoverage?.retention);

  let score = semanticConfidence * 100 - ambiguity;

  if (rightsSignals.length > 0) {
    score += 20;
  }
  if (mentions.length > 0) {
    score += 10;
  }
  if (contactChannel !== "none" && contactChannel !== "unknown") {
    score += 10;
  }
  if (summary.length > 0) {
    score += 5;
  }
  if (retentionPeriods.length > 0 || retentionCoverage?.found === true || (retentionDisclosure && retentionDisclosure !== "absent" && retentionDisclosure !== "unknown")) {
    score += 20;
  }
  if (pageType === "privacy_policy" && /privacy|personal data|personal information|retention|rights|cookies?/i.test(summary)) {
    score += 10;
  }
  if (pageType === "privacy_policy" && pageUrl) {
    try {
      const pathname = new URL(pageUrl).pathname.toLowerCase();
      if (pathname === "/privacy" || pathname.endsWith("/privacy") || pathname.includes("/privacy-policy") || pathname.includes("/legal/privacy")) {
        score += 15;
      }
      if (pathname.includes("privacy-preferences") || pathname.includes("privacy-request") || pathname.includes("request-center")) {
        score -= 20;
      }
    } catch {
      // Ignore malformed URLs and fall back to semantic scoring only.
    }
  }
  if (structurallyWeak) {
    score -= 30;
  }

  return score;
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

export function mergeNanoPolicyInputsWithFallback(input: {
  documentSources: Array<Record<string, unknown>>;
  fallbackRows: Array<Record<string, unknown>>;
}) {
  const documentRows = buildNanoPolicyInputsFromDocumentSources(input.documentSources);
  const strongestByPageType = new Map<string, Record<string, unknown>>();
  const passthroughRows: Array<Record<string, unknown>> = [];

  for (const row of [...documentRows, ...input.fallbackRows]) {
    const pageType = getPolicyInputPageType(row);
    if (!pageType) {
      passthroughRows.push(row);
      continue;
    }

    const existing = strongestByPageType.get(pageType);
    if (!existing || getPolicyInputStrengthScore(row) > getPolicyInputStrengthScore(existing)) {
      strongestByPageType.set(pageType, row);
    }
  }

  return [...strongestByPageType.values(), ...passthroughRows];
}

export function shouldPreferNanoDocumentSources(documentSources: Array<Record<string, unknown>>) {
  return documentSources.some((row) => {
    const sourceStatus = getString(row.source_status) ?? getString(row.sourceStatus);
    const extractionStatus = getString(row.extraction_status) ?? getString(row.extractionStatus);
    if (sourceStatus !== "ready" && sourceStatus !== "candidate") {
      return false;
    }

    return extractionStatus === "ready";
  });
}
