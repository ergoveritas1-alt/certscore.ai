import type {
  NanoConsentUiAssistProvider,
  NanoConsentUiClassificationInput,
  NanoConsentUiClassificationResult,
} from "./scanners/consent-flow-runtime-scanner.js";
import type { ConsentActionType } from "@certscore/contracts";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_NANO_MODEL = "gpt-5.4-nano";

const consentActionTypes = [
  "accept_all",
  "reject_all",
  "manage_preferences",
  "save_preferences",
  "close_banner",
  "reopen_preferences",
  "do_not_sell_share",
  "unknown",
] as const satisfies readonly ConsentActionType[];

interface OpenAiNanoConsentUiAssistProviderOptions {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
}

export function createOpenAiNanoConsentUiAssistProviderFromEnv(
  env: Record<string, string | undefined> = process.env,
): NanoConsentUiAssistProvider | undefined {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return undefined;
  }
  return createOpenAiNanoConsentUiAssistProvider({
    apiKey,
    model: env.CERTSCORE_V2_NANO_CONSENT_UI_MODEL?.trim() || env.VALIDATION_NANO_MODEL?.trim() || DEFAULT_NANO_MODEL,
  });
}

export function createOpenAiNanoConsentUiAssistProvider(
  options: OpenAiNanoConsentUiAssistProviderOptions,
): NanoConsentUiAssistProvider {
  const fetchImpl = options.fetchImpl ?? fetch;
  const model = options.model?.trim() || DEFAULT_NANO_MODEL;

  return {
    async classifyControls(input) {
      const parsed = await callNanoJson(fetchImpl, {
        apiKey: options.apiKey,
        model,
        system:
          "You classify observed consent UI controls. Return JSON only. Select only from the provided actionId values. Do not invent controls, URLs, vendors, policies, legal conclusions, or compliance findings. Return at most 8 classifications. Omit unrelated navigation, marketing, search, login, policy-document, and content controls. Mark shouldClick false unless the label and context strongly identify the action. Ambiguous continue-style labels should remain unknown unless the provided evidence strongly supports accept-all.",
        user: {
          pageUrl: input.pageUrl,
          candidates: input.candidates.filter(candidateLikelyConsentRelevant).slice(0, 16).map((candidate) => ({
            actionId: candidate.actionId,
            labelText: candidate.labelText,
            normalizedLabel: candidate.normalizedLabel,
            domLocation: candidate.domLocation,
            selectorSummary: candidate.selectorSummary,
          })),
          allowedActionTypes: consentActionTypes,
          outputShape: {
            classifications: [{
              actionId: "one provided actionId",
              actionType: consentActionTypes.join("|"),
              confidence: "0..1",
              shouldClick: false,
              uncertaintyNotes: ["optional"],
            }],
          },
        },
        maxCompletionTokens: 900,
      });
      return normalizeConsentClassification(input, parsed);
    },
  };
}

function candidateLikelyConsentRelevant(
  candidate: NanoConsentUiClassificationInput["candidates"][number],
): boolean {
  const value = `${candidate.normalizedLabel} ${candidate.labelText}`.toLowerCase();
  return /cookie|privacy|choice|choices|consent|preference|preferences|settings|options|ad choices|do not sell|do not share|accept|agree|allow|reject|decline|deny|refuse|necessary|essential|save|continue/.test(value);
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
    throw new Error(`Nano consent UI assist request failed with status ${response.status}`);
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

function normalizeConsentClassification(
  input: NanoConsentUiClassificationInput,
  parsed: Record<string, unknown>,
): NanoConsentUiClassificationResult {
  const candidatesById = new Set(input.candidates.map((candidate) => candidate.actionId));
  const candidateById = new Map(input.candidates.map((candidate) => [candidate.actionId, candidate]));
  return {
    assistId: input.assistId,
    classifications: arrayOfRecords(parsed.classifications)
      .filter((classification) => candidatesById.has(stringValue(classification.actionId)))
      .map((classification) => {
        const actionId = stringValue(classification.actionId);
        const confidence = confidenceValue(classification.confidence, 0.5);
        const actionType = enumValue(classification.actionType, consentActionTypes, "unknown");
        const candidate = candidateById.get(actionId);
        const explicitActionLabel = candidate ? explicitlyMatchesAction(candidate, actionType) : false;
        return {
          actionId,
          actionType,
          confidence,
          shouldClick: actionType !== "unknown" &&
            confidence >= 0.78 &&
            (booleanValue(classification.shouldClick, false) || explicitActionLabel),
          uncertaintyNotes: stringArray(classification.uncertaintyNotes, 5),
        };
      })
      .sort((left, right) => right.confidence - left.confidence || left.actionId.localeCompare(right.actionId)),
  };
}

function explicitlyMatchesAction(
  candidate: NanoConsentUiClassificationInput["candidates"][number],
  actionType: ConsentActionType,
): boolean {
  const value = `${candidate.normalizedLabel} ${candidate.labelText}`.toLowerCase();
  if (actionType === "accept_all") {
    return /accept all|allow all|agree to all|accept cookies|i agree|allow analytics|accept optional|^accept$|^agree$|^consent$/.test(value);
  }
  if (actionType === "reject_all") {
    return /reject all|reject optional|reject analytics|do not accept|decline all|deny all|refuse all|only necessary|necessary only|essential only|accept essential|accept necessary|^reject$|^decline$|^deny$|^refuse$/.test(value);
  }
  if (actionType === "do_not_sell_share") {
    return /do not sell|do not share|opt[- ]out|sale or sharing|targeted advertising|privacy choices|privacy settings|privacy preferences/.test(value);
  }
  return false;
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
