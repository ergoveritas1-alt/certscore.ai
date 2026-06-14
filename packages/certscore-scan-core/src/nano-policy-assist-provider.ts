import type {
  NanoLinkClassificationInput,
  NanoLinkClassificationResult,
  NanoTopicExtractionInput,
  NanoTopicExtractionResult,
  PolicyNanoAssistProvider,
} from "./scanners/policy-surface-scanner.js";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_NANO_MODEL = "gpt-5.4-nano";

const surfaceTypes = [
  "privacy_policy",
  "cookie_policy",
  "california_notice",
  "notice_at_collection",
  "do_not_sell_or_share",
  "your_privacy_choices",
  "cookie_settings",
  "consent_preferences",
  "terms",
  "ai_disclosure",
  "accessibility_statement",
  "unknown",
] as const;

const policyTopics = [
  "cookies",
  "analytics",
  "advertising",
  "targeted_advertising",
  "sale_or_share",
  "do_not_sell_or_share",
  "global_privacy_control",
  "california_privacy_rights",
  "notice_at_collection",
  "sensitive_personal_information",
  "profiling_or_automated_decision_making",
  "session_replay_or_behavioral_analytics",
  "third_party_disclosures",
  "vendor_list",
  "consent_withdrawal",
  "cookie_settings",
  "data_retention",
  "ai_generated_content",
  "ai_features",
  "contact_privacy",
  "accessibility",
  "unknown",
] as const;

const MAX_LINK_CANDIDATES_FOR_PROMPT = 120;
const MAX_RANKED_LINK_CANDIDATES = 8;
const MIN_OBSERVED_LINK_CONFIDENCE = 0.58;
const MIN_GUESSED_LINK_CONFIDENCE = 0.82;

interface OpenAiNanoPolicyAssistProviderOptions {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
}

export function createOpenAiNanoPolicyAssistProviderFromEnv(
  env: Record<string, string | undefined> = process.env,
): PolicyNanoAssistProvider | undefined {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return undefined;
  }
  return createOpenAiNanoPolicyAssistProvider({
    apiKey,
    model: env.CERTSCORE_V2_NANO_POLICY_MODEL?.trim() || env.VALIDATION_NANO_MODEL?.trim() || DEFAULT_NANO_MODEL,
  });
}

export function createOpenAiNanoPolicyAssistProvider(
  options: OpenAiNanoPolicyAssistProviderOptions,
): PolicyNanoAssistProvider {
  const fetchImpl = options.fetchImpl ?? fetch;
  const model = options.model?.trim() || DEFAULT_NANO_MODEL;

  return {
    async classifyLinks(input) {
      const promptCandidates = policyPromptCandidates(input.candidates);
      const parsed = await callNanoJson(fetchImpl, {
        apiKey: options.apiKey,
        model,
        system:
          "You classify and rank website links for policy-surface discovery. Return JSON only. Select only from the provided candidateId values. Do not invent URLs, vendors, policies, or legal conclusions. Prefer observed footer/header/nav/body links for privacy, cookie, privacy choices, do-not-sell/share, California, notice-at-collection, GPC, preference-center, accessibility, and terms surfaces. Treat common-path guesses as fallback candidates only. When all candidates are common-path guesses, rank exact standard policy/control paths such as /privacy, /privacy-policy, /privacy-notice, /cookie-policy, /privacy-choices, /california-privacy-notice, /terms, and /accessibility when the path itself clearly names the surface; otherwise mark shouldFetch false. Avoid generic social, login, contact, account, marketing, careers, help, and unrelated legal links. Preserve uncertainty and select ambiguous controls only when the text or URL clearly indicates a privacy/control surface. For observationOnly candidates, shouldFetch true means retain the observed control as evidence; it will not be clicked or fetched. Return at most 8 rankedCandidates.",
        user: {
          pageUrl: input.pageUrl,
          candidates: promptCandidates.map((candidate) => ({
            candidateId: candidate.candidateId,
            url: candidate.url,
            normalizedUrl: candidate.normalizedUrl,
            linkText: candidate.linkText,
            surroundingTextExcerpt: candidate.surroundingTextExcerpt,
            domLocation: candidate.domLocation,
            sameOrigin: candidate.sameOrigin,
            discoveryMethod: candidate.discoveryMethod,
            selector: candidate.selector,
            fetchable: candidate.fetchable,
            clickable: candidate.clickable,
            mayLeadToConsentControls: candidate.mayLeadToConsentControls,
            observationOnly: candidate.observationOnly,
            deterministicSurfaceType: candidate.deterministicSurfaceType,
            deterministicScore: candidate.deterministicScore,
            deterministicKeywordMatches: candidate.deterministicKeywordMatches,
          })),
          outputShape: {
            rankedCandidates: [{
              candidateId: "one provided candidateId",
              likelySurfaceType: surfaceTypes.join("|"),
              shouldFetch: true,
              priorityRank: 1,
              confidence: "0..1",
              reason: "short evidence-scoped reason",
              uncertaintyNotes: ["optional"],
            }],
          },
        },
        maxCompletionTokens: 900,
      });
      return normalizeLinkClassification(input, parsed);
    },
    async extractTopics(input) {
      const parsed = await callNanoJson(fetchImpl, {
        apiKey: options.apiKey,
        model,
        system:
          "You extract policy-surface topics and vendor/control mentions from a bounded excerpt. Return JSON only. Use only the supplied excerpt and metadata. Do not infer legal compliance, do not invent vendors, and do not add topics unsupported by the text. Mark AI topics only when the excerpt describes artificial-intelligence features, AI-generated content, automated decisions, or a policy/disclosure about AI use; do not mark AI merely because the letters AI appear in navigation, branding, or unrelated words.",
        user: {
          surfaceUrl: input.surfaceUrl,
          surfaceType: input.surfaceType,
          title: input.title,
          excerpt: input.excerpt,
          deterministicTopicHits: input.deterministicTopicHits,
          allowedTopics: policyTopics,
          outputShape: {
            observedTopics: ["allowed topic strings"],
            mentionedVendors: ["vendor names explicitly present in excerpt"],
            mentionedPurposes: ["short purpose labels explicitly supported"],
            mentionedRights: ["rights/control labels explicitly supported"],
            mentionedControls: ["control labels explicitly supported"],
            confidence: "0..1",
            uncertaintyNotes: ["optional"],
          },
        },
        maxCompletionTokens: 700,
      });
      return normalizeTopicExtraction(input, parsed);
    },
  };
}

async function callNanoJson(
  fetchImpl: typeof fetch,
  input: {
    apiKey: string;
    model: string;
    system: string;
    user: unknown;
    maxCompletionTokens: number;
  },
): Promise<Record<string, unknown>> {
  const response = await fetchImpl(OPENAI_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: JSON.stringify(input.user, null, 2) },
      ],
      max_completion_tokens: input.maxCompletionTokens,
    }),
  });

  if (!response.ok) {
    throw new Error(`Nano policy assist request failed with status ${response.status}`);
  }

  const payload = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(extractJson(content)) as unknown;
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {};
}

function normalizeLinkClassification(
  input: NanoLinkClassificationInput,
  parsed: Record<string, unknown>,
): NanoLinkClassificationResult {
  const candidatesById = new Map(input.candidates.map((candidate) => [candidate.candidateId, candidate]));
  const rankedCandidates = arrayOfRecords(parsed.rankedCandidates)
    .filter((candidate) => candidatesById.has(stringValue(candidate.candidateId)))
    .map((candidate, index) => {
      const candidateId = stringValue(candidate.candidateId);
      return {
        candidateId,
        likelySurfaceType: enumValue(candidate.likelySurfaceType, surfaceTypes, "unknown"),
        shouldFetch: booleanValue(candidate.shouldFetch, false),
        priorityRank: intValue(candidate.priorityRank, index + 1),
        confidence: confidenceValue(candidate.confidence, 0.5),
        reason: stringValue(candidate.reason).slice(0, 240),
        uncertaintyNotes: stringArray(candidate.uncertaintyNotes, 5),
      };
    })
    .filter((candidate) => {
      const source = candidatesById.get(candidate.candidateId);
      const minimumConfidence = source?.discoveryMethod === "guessed_common_path"
        ? MIN_GUESSED_LINK_CONFIDENCE
        : MIN_OBSERVED_LINK_CONFIDENCE;
      return (
        candidate.shouldFetch &&
        candidate.likelySurfaceType !== "unknown" &&
        candidate.confidence >= minimumConfidence
      );
    })
    .sort((left, right) =>
      left.priorityRank - right.priorityRank ||
      right.confidence - left.confidence ||
      left.candidateId.localeCompare(right.candidateId),
    )
    .slice(0, MAX_RANKED_LINK_CANDIDATES);

  return {
    assistId: input.assistId,
    rankedCandidates,
  };
}

function policyPromptCandidates(
  candidates: NanoLinkClassificationInput["candidates"],
): NanoLinkClassificationInput["candidates"] {
  return candidates
    .filter((candidate) =>
      candidate.discoveryMethod === "guessed_common_path" ||
      candidate.deterministicSurfaceType !== "unknown" ||
      candidate.deterministicKeywordMatches.length > 0,
    )
    .sort((left, right) =>
      candidatePromptPriority(left) - candidatePromptPriority(right) ||
      right.deterministicScore - left.deterministicScore ||
      left.candidateId.localeCompare(right.candidateId),
    )
    .slice(0, MAX_LINK_CANDIDATES_FOR_PROMPT);
}

function candidatePromptPriority(
  candidate: NanoLinkClassificationInput["candidates"][number],
): number {
  const discoveryPriority =
    candidate.discoveryMethod === "footer_link" ? 0 :
    candidate.discoveryMethod === "header_link" ? 10 :
    candidate.discoveryMethod === "page_text_link" ? 20 :
    candidate.discoveryMethod === "guessed_common_path" ? 60 :
    40;
  const surfacePriority = [
    "privacy_policy",
    "cookie_policy",
    "your_privacy_choices",
    "do_not_sell_or_share",
    "cookie_settings",
    "consent_preferences",
    "california_notice",
    "notice_at_collection",
    "accessibility_statement",
    "terms",
    "ai_disclosure",
  ].indexOf(candidate.deterministicSurfaceType);
  return discoveryPriority + (surfacePriority >= 0 ? surfacePriority : 50);
}

function normalizeTopicExtraction(
  input: NanoTopicExtractionInput,
  parsed: Record<string, unknown>,
): NanoTopicExtractionResult {
  return {
    assistId: input.assistId,
    observedTopics: enumArray(parsed.observedTopics, policyTopics, 16),
    mentionedVendors: stringArray(parsed.mentionedVendors, 24),
    mentionedPurposes: stringArray(parsed.mentionedPurposes, 12),
    mentionedRights: stringArray(parsed.mentionedRights, 12),
    mentionedControls: stringArray(parsed.mentionedControls, 12),
    confidence: confidenceValue(parsed.confidence, 0.5),
    uncertaintyNotes: stringArray(parsed.uncertaintyNotes, 5),
  };
}

function extractJson(content: string): string {
  const trimmed = content.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  return start >= 0 && end > start ? trimmed.slice(start, end + 1) : "{}";
}

function arrayOfRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === "object" && !Array.isArray(item),
    )
    : [];
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function intValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(1, Math.round(value))
    : fallback;
}

function confidenceValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : fallback;
}

function enumValue<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  fallback: T[number],
): T[number] {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? value as T[number]
    : fallback;
}

function enumArray<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  maxItems: number,
): T[number][] {
  return unique(
    (Array.isArray(value) ? value : [])
      .filter((item): item is T[number] =>
        typeof item === "string" && (allowed as readonly string[]).includes(item),
      ),
  ).slice(0, maxItems);
}

function stringArray(value: unknown, maxItems: number): string[] {
  return unique(
    (Array.isArray(value) ? value : [])
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .map((item) => item.slice(0, 120)),
  ).slice(0, maxItems);
}

function unique<T extends string>(values: T[]): T[] {
  return [...new Set(values)];
}
