import { getWorkerEnv } from "../env";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
export const NANO_DOCUMENT_NORMALIZATION_VERSION = 2;

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

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0).map((value) => value.trim()))];
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

function inferRightsSignals(documentText: string | null, parsedSignals: string[]) {
  const text = (documentText ?? "").toLowerCase();
  const inferred = new Set(parsedSignals);

  if (/\bright to request\b|\baccess\b/.test(text)) {
    inferred.add("access_request");
  }
  if (/\bdeletion\b|\berasure\b|\bdelete\b/.test(text)) {
    inferred.add("delete_request");
  }
  if (/\brectification\b|\bcorrection\b|\bcorrect\b/.test(text)) {
    inferred.add("correction_request");
  }
  if (/\bportability\b|machine-readable format/.test(text)) {
    inferred.add("portability_request");
  }
  if (/\bopt-?out\b|do not sell or share|global privacy control|opt-out preference signal/.test(text)) {
    inferred.add("opt_out_request");
  }
  if (/\bappeal\b/.test(text)) {
    inferred.add("appeal_request");
  }

  return [...inferred];
}

function inferTransferMechanisms(documentText: string | null, parsedMechanisms: string[]) {
  const text = (documentText ?? "").toLowerCase();
  const inferred = new Set(parsedMechanisms);

  if (/data privacy framework/.test(text)) {
    inferred.add("dpf");
  }
  if (/standard contractual clauses|\bsccs?\b/.test(text)) {
    inferred.add("scc");
  }
  if (/binding corporate rules|\bbcrs?\b/.test(text)) {
    inferred.add("bcr");
  }
  if (/adequacy decision/.test(text)) {
    inferred.add("adequacy");
  }

  return [...inferred];
}

function inferDoNotSell(documentText: string | null, parsedValue: string | null) {
  if (parsedValue && parsedValue !== "unknown") {
    return parsedValue;
  }

  const text = (documentText ?? "").toLowerCase();
  if (/do not sell or share my personal information/.test(text)) {
    return "present_text";
  }

  return parsedValue ?? "unknown";
}

function inferChildrenReference(documentText: string | null, parsedValue: string | null) {
  if (parsedValue && parsedValue !== "unknown") {
    return parsedValue;
  }

  const text = (documentText ?? "").toLowerCase();
  if (/under the age of 16|under 16/.test(text)) {
    return "under_16";
  }
  if (/under the age of 13|under 13/.test(text)) {
    return "under_13";
  }
  if (/\bchildren\b|\bminor\b/.test(text)) {
    return "none";
  }

  return parsedValue ?? "unknown";
}

export function hasRetentionInferenceCue(documentText: string | null) {
  const text = documentText ?? "";
  return /retain|retention|deleted within|stored for approximately|as long as reasonably necessary/i.test(text);
}

function collectRetentionInferenceWindows(normalizedText: string) {
  const cuePattern =
    /how\s+is\s+your\s+personal\s+information\s+retained|retention period varies based on|retain your personal information|retention|deleted within|stored for approximately|as long as reasonably necessary/gi;
  const windows: string[] = [];
  const spans: Array<{ start: number; end: number }> = [];

  for (const match of normalizedText.matchAll(cuePattern)) {
    const start = Math.max(0, match.index - 24);
    const end = Math.min(normalizedText.length, match.index + match[0].length + 520);
    const previous = spans[spans.length - 1];
    if (previous && start <= previous.end) {
      previous.end = Math.max(previous.end, end);
      continue;
    }
    spans.push({ start, end });
  }

  for (const span of spans) {
    const windowText = normalizedText.slice(span.start, span.end).trim();
    if (windowText.length > 0) {
      windows.push(windowText);
    }
  }

  return windows;
}

function inferRetentionPeriods(documentText: string | null, parsedPeriods: unknown[]) {
  if (parsedPeriods.length > 0) {
    return parsedPeriods;
  }

  const text = documentText ?? "";
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length === 0 || !hasRetentionInferenceCue(normalized)) {
    return parsedPeriods;
  }

  const inferred: Array<string | Record<string, unknown>> = [];
  const lower = normalized.toLowerCase();
  const retentionWindows = collectRetentionInferenceWindows(normalized);
  const periodValues = new Set<string>();

  for (const windowText of retentionWindows) {
    const explicitPeriodMatches = [
      ...windowText.matchAll(
        /\b(?:within|for|approximately|about|up to|no longer than)?\s*(\d+\s+(?:day|days|month|months|year|years))\b/gi
      )
    ];
    for (const match of explicitPeriodMatches) {
      const period = match[1]?.trim();
      if (period) {
        periodValues.add(period.toLowerCase());
      }
    }
  }
  inferred.push(...[...periodValues].map((value) => value));

  if (/retain your personal information for as long as reasonably necessary/.test(lower)) {
    inferred.push({
      basis: "criteria_based",
      summary: "Retained as long as reasonably necessary for disclosed purposes or legal requirements."
    });
  }

  if (/retention period varies based on/i.test(normalized)) {
    const bulletMatches = [
      ...normalized.matchAll(
        /retention period varies based on[^:]*:\s*(.+?)(?:at the end of the retention period|biometric retention schedule:|$)/gi
      )
    ];
    for (const match of bulletMatches) {
      const summary = match[1]?.trim();
      if (summary) {
        inferred.push({
          basis: "criteria_based",
          summary: summary.slice(0, 500)
        });
      }
    }
  }

  return inferred.length > 0 ? inferred : parsedPeriods;
}

function inferCookieDisclosures(documentText: string | null, parsedDisclosures: unknown[]) {
  if (Array.isArray(parsedDisclosures) && parsedDisclosures.length > 0) {
    return parsedDisclosures;
  }

  const text = documentText ?? "";
  const matches = [...text.matchAll(/([a-z0-9.-]+\.[a-z]{2,})\s+([A-Za-z0-9_.`,-\s]{2,220}?)\s+(First Party|Third Party)/g)];
  const inferred = matches
    .map((match) => {
      const provider = match[1]?.trim() ?? null;
      const rawCookies = match[2]
        ?.replace(/`/g, "")
        .split(",")
        .map((value) => value.trim())
        .filter((value) => /^[A-Za-z0-9_.-]{2,}$/.test(value)) ?? [];

      return rawCookies.map((cookieName) => ({
        confidence: 0.65,
        cookie_name: cookieName,
        provider,
        purpose: null,
        duration: null,
        snippet_hash: provider ? `${provider}:${cookieName}` : cookieName
      }));
    })
    .flat();

  return inferred;
}

function inferTermsActionableFlags(documentText: string | null, parsedFlags: string[]) {
  const text = (documentText ?? "").toLowerCase();
  const inferred = new Set(parsedFlags);

  if (/warranty|guarantee/.test(text)) {
    inferred.add("warranty_disclaimer_present");
  }

  if (/waive all rights to sue|limitation of liability|liable for any matter arising from or related to your use|assume all associated risks/.test(text)) {
    inferred.add("liability_waiver_present");
  }

  if (/copyright|reprint|reuse of information|dmca/.test(text)) {
    inferred.add("content_use_restrictions_present");
  }

  return [...inferred];
}

function inferPolicySummaryShort(input: {
  documentText: string | null;
  documentType: string;
  parsedSummary: string | null;
}) {
  if (input.parsedSummary) {
    return input.parsedSummary;
  }

  const text = (input.documentText ?? "").replace(/\s+/g, " ").trim();
  if (text.length === 0) {
    return null;
  }

  if (input.documentType === "terms_of_service") {
    const match = text.match(
      /((?:we make no representation, warranty or guarantee|visitors are encouraged to confirm[^.]+|by accessing [^.]+ you are agreeing to the foregoing[^.]+|to the fullest extent allowed by law waive all rights to sue[^.]+|the .* retains copyright on the content of this site[^.]+)[^.]*\.)/i
    );
    if (match?.[1]) {
      return match[1].slice(0, 280);
    }
  }

  return text.slice(0, 280);
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
  const parsedRightsSignals = getStringArray(input.parsed.policy_rights_signals ?? input.parsed.policyRightsSignals);
  const parsedActionableFlags = getStringArray(input.parsed.policy_actionable_flags ?? input.parsed.policyActionableFlags);
  const parsedTransferMechanisms = Array.isArray(input.parsed.policy_transfer_mechanisms)
    ? input.parsed.policy_transfer_mechanisms
    : Array.isArray(input.parsed.policyTransferMechanisms)
      ? input.parsed.policyTransferMechanisms
      : [];
  const parsedRetentionPeriods = Array.isArray(input.parsed.policy_retention_periods)
    ? input.parsed.policy_retention_periods
    : Array.isArray(input.parsed.policyRetentionPeriods)
      ? input.parsed.policyRetentionPeriods
      : [];
  const parsedCookieDisclosures = Array.isArray(input.parsed.policy_cookie_disclosures)
    ? input.parsed.policy_cookie_disclosures
    : Array.isArray(input.parsed.policyCookieDisclosures)
      ? input.parsed.policyCookieDisclosures
      : [];
  const inferredRightsSignals = inferRightsSignals(input.documentText, parsedRightsSignals);
  const inferredActionableFlags =
    documentType === "terms_of_service"
      ? inferTermsActionableFlags(input.documentText, parsedActionableFlags)
      : parsedActionableFlags;
  const inferredTransferMechanisms = inferTransferMechanisms(
    input.documentText,
    uniqueStrings(parsedTransferMechanisms.map((value) => (typeof value === "string" ? value : null)))
  );

  const extractedFields: Record<string, unknown> = {
    page_type: documentType,
    page_url: pageUrl,
    policy_actionable_flags: inferredActionableFlags,
    policy_ambiguity_score:
      getNumber(input.parsed.policy_ambiguity_score) ??
      getNumber(input.parsed.policyAmbiguityScore),
    policy_arbitration_present: input.parsed.policy_arbitration_present === true || input.parsed.policyArbitrationPresent === true,
    policy_children_reference:
      inferChildrenReference(
        input.documentText,
        getString(input.parsed.policy_children_reference) ?? getString(input.parsed.policyChildrenReference)
      ) ?? "unknown",
    policy_cookie_disclosures: inferCookieDisclosures(input.documentText, parsedCookieDisclosures),
    policy_coverage_ratio:
      getNumber(input.parsed.policy_coverage_ratio) ??
      getNumber(input.parsed.policyCoverageRatio),
    policy_do_not_sell:
      inferDoNotSell(input.documentText, getString(input.parsed.policy_do_not_sell) ?? getString(input.parsed.policyDoNotSell)) ?? "unknown",
    policy_dsar_mechanism:
      getString(input.parsed.policy_dsar_mechanism) ??
      getString(input.parsed.policyDsarMechanism) ??
      "unknown",
    policy_mentions: mergedPolicyMentions,
    policy_rights_signals: inferredRightsSignals,
    policy_semantic_confidence: semanticConfidence,
    policy_snippet_count:
      getNumber(input.parsed.policy_snippet_count) ??
      getNumber(input.parsed.policySnippetCount),
    policy_structurally_weak:
      input.parsed.policy_structurally_weak === true || input.parsed.policyStructurallyWeak === true,
    policy_summary_short: inferPolicySummaryShort({
      documentText: input.documentText,
      documentType,
      parsedSummary: getString(input.parsed.policy_summary_short) ?? getString(input.parsed.policySummaryShort)
    }),
    policy_transfer_mechanisms: inferredTransferMechanisms,
    policy_retention_periods: inferRetentionPeriods(input.documentText, parsedRetentionPeriods),
    privacy_contact_channel_type: inferContactChannelType(
      input.documentText,
      getString(input.parsed.privacy_contact_channel_type) ?? getString(input.parsed.privacyContactChannelType)
    )
  };

  const hasMeaningfulSemanticField =
    Boolean(getString(extractedFields.policy_summary_short)) ||
    getStringArray(extractedFields.policy_rights_signals).length > 0 ||
    getStringArray(extractedFields.policy_actionable_flags).length > 0 ||
    mergedPolicyMentions.length > 0 ||
    (Array.isArray(extractedFields.policy_transfer_mechanisms) && extractedFields.policy_transfer_mechanisms.length > 0) ||
    (Array.isArray(extractedFields.policy_cookie_disclosures) && extractedFields.policy_cookie_disclosures.length > 0);

  return {
    extractedFields,
    extractionStatus: hasMeaningfulSemanticField ? "ready" : "insufficient",
    metadata: {
      normalizedAt: new Date().toISOString(),
      normalization_version: NANO_DOCUMENT_NORMALIZATION_VERSION
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
            "You extract structured legal-document semantics from website legal pages. Return JSON only. Use these enums exactly when applicable: policy_dsar_mechanism = present|partial|absent|unknown, policy_do_not_sell = present_link|present_text|absent|unknown, policy_children_reference = under_13|under_16|none|unknown, privacy_contact_channel_type = email|form|portal|none. policy_rights_signals must be a string array of short tokens like access_request, delete_request, correction_request, portability_request, opt_out_request, appeal_request. policy_mentions must be an array of objects with topic. Allowed topics include gpc_disclosure, tracking_technologies_disclosure, targeted_advertising_disclosure, third_party_advertising_disclosure, children, session_replay_disclosure. Also return numeric policy_ambiguity_score (0-100), numeric policy_coverage_ratio (0-1), numeric policy_snippet_count, boolean policy_structurally_weak, and arrays for policy_transfer_mechanisms and policy_retention_periods when clearly disclosed. Treat Data Privacy Framework as a transfer mechanism. When a cookie notice contains a vendor/cookie table, populate policy_cookie_disclosures from it. Keep policy_summary_short under 280 chars. If uncertain, prefer unknown, empty arrays, and low confidence."
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
