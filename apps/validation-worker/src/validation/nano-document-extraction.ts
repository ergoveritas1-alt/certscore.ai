import { getWorkerEnv } from "../env";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

type NanoDocumentSourceRow = Record<string, unknown>;

export type NanoDocumentExtractionResult = {
  extractedFields: Record<string, unknown>;
  extractionStatus: "ready" | "insufficient" | "failed";
  metadata: Record<string, unknown>;
  semanticConfidence: number | null;
};

function getString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0) : [];
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function inferMentionTopics(documentText: string | null, title: string | null) {
  const haystack = `${title ?? ""}\n${documentText ?? ""}`.toLowerCase();
  const topics = new Set<string>();

  if (/\bglobal privacy control\b|\bgpc\b/.test(haystack)) {
    topics.add("gpc_disclosure");
  }
  if (/tracking technolog|cookies?|pixels?|web beacons?|local storage|sdk/.test(haystack)) {
    topics.add("tracking_technologies_disclosure");
  }
  if (/targeted advertising|personalized advertising|interest-based advertising/.test(haystack)) {
    topics.add("targeted_advertising_disclosure");
  }
  if (/third[- ]party advertising|advertising partners|third parties .* advertising/.test(haystack)) {
    topics.add("third_party_advertising_disclosure");
  }
  if (/session replay|heatmap|behavioral analytics|replay tools?/.test(haystack)) {
    topics.add("session_replay_disclosure");
  }
  if (/children|under 13|under 16|minor/.test(haystack)) {
    topics.add("children");
  }

  return [...topics];
}

function inferContactChannelType(documentText: string | null, parsedValue: string | null) {
  if (parsedValue && parsedValue !== "unknown" && parsedValue !== "none") {
    return parsedValue;
  }

  const text = (documentText ?? "").toLowerCase();
  if (/\bprivacy@[\w.-]+\.[a-z]{2,}\b/.test(text) || /\b[a-z0-9._%+-]+@[\w.-]+\.[a-z]{2,}\b/.test(text)) {
    return "email";
  }
  if (/privacy request form|submit.*request|webform|online form/.test(text)) {
    return "form";
  }
  if (/privacy portal|request portal/.test(text)) {
    return "portal";
  }

  return parsedValue ?? "none";
}

function extractJson(raw: string) {
  const trimmed = raw.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch?.[1]?.trim() ?? trimmed;
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return candidate.slice(firstBrace, lastBrace + 1);
  }
  return candidate;
}

export function normalizeNanoDocumentExtraction(input: {
  documentText: string | null;
  parsed: Record<string, unknown>;
  row: NanoDocumentSourceRow;
}): NanoDocumentExtractionResult {
  const documentType =
    getString(input.parsed.page_type) ??
    getString(input.parsed.pageType) ??
    getString(input.row.document_type) ??
    getString(input.row.documentType) ??
    "privacy_policy";
  const pageUrl =
    getString(input.row.canonical_url) ??
    getString(input.row.canonicalUrl) ??
    getString(input.row.source_url) ??
    getString(input.row.sourceUrl);
  const mentionsRaw = Array.isArray(input.parsed.policy_mentions)
    ? input.parsed.policy_mentions
    : Array.isArray(input.parsed.policyMentions)
      ? input.parsed.policyMentions
      : [];
  const policyMentions = mentionsRaw
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry))
    .map((entry) => ({ topic: getString(entry.topic) ?? getString(entry.name) ?? "" }))
    .filter((entry) => entry.topic.length > 0);
  const inferredMentionTopics = inferMentionTopics(input.documentText, getString(input.row.title) ?? null);
  const mergedPolicyMentions = [
    ...policyMentions,
    ...inferredMentionTopics
      .filter((topic) => !policyMentions.some((entry) => entry.topic === topic))
      .map((topic) => ({ topic }))
  ];
  const semanticConfidence =
    getNumber(input.parsed.semantic_confidence) ??
    getNumber(input.parsed.semanticConfidence) ??
    getNumber(input.parsed.confidence);

  const extractedFields: Record<string, unknown> = {
    page_type: documentType,
    page_url: pageUrl,
    policy_actionable_flags: getStringArray(input.parsed.policy_actionable_flags ?? input.parsed.policyActionableFlags),
    policy_ambiguity_score:
      getNumber(input.parsed.policy_ambiguity_score) ??
      getNumber(input.parsed.policyAmbiguityScore),
    policy_arbitration_present: input.parsed.policy_arbitration_present === true || input.parsed.policyArbitrationPresent === true,
    policy_children_reference:
      getString(input.parsed.policy_children_reference) ??
      getString(input.parsed.policyChildrenReference) ??
      "unknown",
    policy_cookie_disclosures: Array.isArray(input.parsed.policy_cookie_disclosures)
      ? input.parsed.policy_cookie_disclosures
      : Array.isArray(input.parsed.policyCookieDisclosures)
        ? input.parsed.policyCookieDisclosures
        : [],
    policy_coverage_ratio:
      getNumber(input.parsed.policy_coverage_ratio) ??
      getNumber(input.parsed.policyCoverageRatio),
    policy_do_not_sell:
      getString(input.parsed.policy_do_not_sell) ??
      getString(input.parsed.policyDoNotSell) ??
      "unknown",
    policy_dsar_mechanism:
      getString(input.parsed.policy_dsar_mechanism) ??
      getString(input.parsed.policyDsarMechanism) ??
      "unknown",
    policy_mentions: mergedPolicyMentions,
    policy_rights_signals: getStringArray(input.parsed.policy_rights_signals ?? input.parsed.policyRightsSignals),
    policy_semantic_confidence: semanticConfidence,
    policy_snippet_count:
      getNumber(input.parsed.policy_snippet_count) ??
      getNumber(input.parsed.policySnippetCount),
    policy_structurally_weak:
      input.parsed.policy_structurally_weak === true || input.parsed.policyStructurallyWeak === true,
    policy_summary_short:
      getString(input.parsed.policy_summary_short) ??
      getString(input.parsed.policySummaryShort) ??
      (input.documentText ? input.documentText.slice(0, 280) : null),
    policy_transfer_mechanisms: Array.isArray(input.parsed.policy_transfer_mechanisms)
      ? input.parsed.policy_transfer_mechanisms
      : Array.isArray(input.parsed.policyTransferMechanisms)
        ? input.parsed.policyTransferMechanisms
        : [],
    policy_retention_periods: Array.isArray(input.parsed.policy_retention_periods)
      ? input.parsed.policy_retention_periods
      : Array.isArray(input.parsed.policyRetentionPeriods)
        ? input.parsed.policyRetentionPeriods
        : [],
    privacy_contact_channel_type: inferContactChannelType(
      input.documentText,
      getString(input.parsed.privacy_contact_channel_type) ?? getString(input.parsed.privacyContactChannelType)
    )
  };

  const hasMeaningfulSemanticField =
    Boolean(getString(extractedFields.policy_summary_short)) ||
    getStringArray(extractedFields.policy_rights_signals).length > 0 ||
    getStringArray(extractedFields.policy_actionable_flags).length > 0 ||
    mergedPolicyMentions.length > 0;

  return {
    extractedFields,
    extractionStatus: hasMeaningfulSemanticField ? "ready" : "insufficient",
    metadata: {
      normalizedAt: new Date().toISOString()
    },
    semanticConfidence
  };
}

export async function extractNanoDocumentSourceWithLlm(row: NanoDocumentSourceRow): Promise<NanoDocumentExtractionResult> {
  const env = getWorkerEnv();
  const documentText = getString(row.document_text) ?? getString(row.documentText);
  const title = getString(row.title);
  const documentType = getString(row.document_type) ?? getString(row.documentType) ?? "privacy_policy";

  if (!documentText || documentText.length < 40) {
    return { extractedFields: {}, extractionStatus: "insufficient", metadata: { reason: "missing_document_text" }, semanticConfidence: null };
  }

  if (!env.OPENAI_API_KEY) {
    return { extractedFields: {}, extractionStatus: "insufficient", metadata: { reason: "missing_openai_api_key" }, semanticConfidence: null };
  }

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: env.VALIDATION_NANO_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You extract structured legal-document semantics from website legal pages. Return JSON only. Use these enums exactly when applicable: policy_dsar_mechanism = present|partial|absent|unknown, policy_do_not_sell = present_link|present_text|absent|unknown, policy_children_reference = under_13|under_16|none|unknown, privacy_contact_channel_type = email|form|portal|none. policy_rights_signals must be a string array of short tokens like access_request, delete_request, correction_request, portability_request, opt_out_request, appeal_request. policy_mentions must be an array of objects with topic. Allowed topics include gpc_disclosure, tracking_technologies_disclosure, targeted_advertising_disclosure, third_party_advertising_disclosure, children, session_replay_disclosure. Also return numeric policy_ambiguity_score (0-100), numeric policy_coverage_ratio (0-1), numeric policy_snippet_count, boolean policy_structurally_weak, and arrays for policy_transfer_mechanisms and policy_retention_periods when clearly disclosed. Keep policy_summary_short under 280 chars. If uncertain, prefer unknown, empty arrays, and low confidence."
        },
        {
          role: "user",
          content: JSON.stringify(
            {
              documentType,
              sourceUrl: getString(row.canonical_url) ?? getString(row.source_url),
              title,
              text: documentText.slice(0, 12000)
            },
            null,
            2
          )
        }
      ]
    })
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    return { extractedFields: {}, extractionStatus: "failed", metadata: { error: `openai_${response.status}`, errorBody }, semanticConfidence: null };
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    model?: string;
  };

  const parsed = JSON.parse(extractJson(payload.choices?.[0]?.message?.content ?? "{}")) as Record<string, unknown>;
  const normalized = normalizeNanoDocumentExtraction({
    documentText,
    parsed,
    row
  });

  return {
    ...normalized,
    metadata: {
      ...normalized.metadata,
      model: payload.model ?? env.VALIDATION_NANO_MODEL
    }
  };
}
