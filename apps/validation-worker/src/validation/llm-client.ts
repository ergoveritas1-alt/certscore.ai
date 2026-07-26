import {
  VALIDATION_PROMPT_VERSION,
  buildFinancialJudgePrompt,
  financialJudgeInputSchema,
  financialJudgeOutputSchema,
  type FinancialJudgeInput,
  type ValidationAgreementScore
} from "@website-signal-risk-scanner/validation-shared";
import { getWorkerEnv } from "../env";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

type OpenAiJsonPayload = {
  messages: Array<{
    content: string;
    role: "system" | "user" | "assistant";
  }>;
  model?: string;
  response_format?:
    | { type: "json_object" }
    | {
        type: "json_schema";
        json_schema: {
          name: string;
          strict: true;
          schema: Record<string, unknown>;
        };
      };
  temperature?: number;
};

type OpenAiJsonResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  model?: string;
};

function agreementScoreForVerdict(verdict: "supported" | "inconclusive" | "not_supported"): ValidationAgreementScore {
  if (verdict === "supported") {
    return 100;
  }
  if (verdict === "inconclusive") {
    return 50;
  }
  return 0;
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

async function callOpenAiJson(input: { apiKey: string; payload: OpenAiJsonPayload }) {
  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input.payload)
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`OpenAI call failed with ${response.status}${errorBody ? `: ${errorBody}` : ""}`);
  }

  return (await response.json()) as OpenAiJsonResponse;
}

function errorLooksLikeQuotaFailure(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return message.includes("429") || message.includes("insufficient_quota") || message.includes("quota");
}

async function callOpenAiJsonWithQuotaFallback(input: { apiKey: string; payload: OpenAiJsonPayload; fallbackModel?: string }) {
  try {
    return await callOpenAiJson(input);
  } catch (error) {
    const fallbackModel = input.fallbackModel?.trim();
    const primaryModel = input.payload.model?.trim();
    const canRetryWithFallback =
      Boolean(fallbackModel) && Boolean(primaryModel) && fallbackModel !== primaryModel && errorLooksLikeQuotaFailure(error);

    if (!canRetryWithFallback) {
      throw error;
    }

    return await callOpenAiJson({
      apiKey: input.apiKey,
      payload: {
        ...input.payload,
        model: fallbackModel
      }
    });
  }
}

function buildFallbackValidationVerdict(input: { model: string; note: string }) {
  return {
    agreementScore: 50 as ValidationAgreementScore,
    confidence: 0.2,
    evidence: {
      note: input.note
    },
    model: input.model,
    promptVersion: VALIDATION_PROMPT_VERSION,
    rationale: input.note,
    verdict: "inconclusive" as const
  };
}

export async function validateFindingWithLlm(input: {
  domain: string;
  finding: Record<string, unknown>;
  scanEvidence: Record<string, unknown>;
}) {
  const env = getWorkerEnv();

  if (!env.OPENAI_API_KEY) {
    return buildFallbackValidationVerdict({
      model: env.CERTSCORE_REVIEW_MODEL,
      note: "The validation worker could not call the model because OPENAI_API_KEY is not configured."
    });
  }

  let payload: OpenAiJsonResponse;
  try {
    payload = await callOpenAiJsonWithQuotaFallback({
      apiKey: env.OPENAI_API_KEY,
      payload: {
        model: env.CERTSCORE_REVIEW_MODEL,
        temperature: 0,
        response_format: {
          type: "json_object"
        },
        messages: [
          {
            role: "system",
            content:
              "You validate website compliance scan findings. Return JSON with keys verdict, confidence, rationale, and evidence. Verdict must be supported, inconclusive, or not_supported. Use inconclusive when evidence is weak. Do not invent evidence. Use the narrowest conclusion supported by the record. Prefer direct, specific evidence over indirect, adjacent, or generic signals. Do not upgrade generic indicators, heuristic flags, or evidence from another page into a stronger substantive conclusion unless the record explicitly supports that conclusion. When direct and indirect evidence conflict, prefer the direct evidence. When evidence is mixed, scope is unclear, or support is indirect, default to inconclusive rather than a stronger claim. Distinguish what the evidence directly supports from what it does not clearly establish."
          },
          {
            role: "user",
            content: JSON.stringify(
              {
                domain: input.domain,
                finding: input.finding,
                scanEvidence: input.scanEvidence
              },
              null,
              2
            )
          }
        ]
      }
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown OpenAI validation error.";
    return buildFallbackValidationVerdict({
      model: env.CERTSCORE_REVIEW_MODEL,
      note: `The validation worker could not complete the model call and fell back to inconclusive review. ${reason}`
    });
  }

  const rawContent = payload.choices?.[0]?.message?.content ?? "";
  const parsed = JSON.parse(extractJson(rawContent)) as {
    confidence?: number;
    evidence?: Record<string, unknown>;
    rationale?: string;
    verdict?: "supported" | "inconclusive" | "not_supported";
  };
  const verdict = parsed.verdict ?? "inconclusive";

  return {
    agreementScore: agreementScoreForVerdict(verdict),
    confidence:
      typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0.5,
    evidence: parsed.evidence ?? {},
    model: payload.model ?? env.CERTSCORE_REVIEW_MODEL,
    promptVersion: VALIDATION_PROMPT_VERSION,
    rationale: parsed.rationale ?? "No rationale returned.",
    verdict
  };
}

function validationVerdictForFinancialJudge(verdict: "confirm" | "keep_audit_only" | "suppress") {
  if (verdict === "confirm") {
    return "supported" as const;
  }
  if (verdict === "keep_audit_only") {
    return "inconclusive" as const;
  }
  return "not_supported" as const;
}

function buildFallbackFinancialJudgeVerdict(note: string) {
  const env = getWorkerEnv();
  const fallbackVerdict = {
    buyerFacingEligible: false,
    confidence: 0.2,
    evidenceStrength: "thin" as const,
    rationaleCode: "thin_single_source_evidence" as const,
    retained: true,
    verdict: "keep_audit_only" as const
  };

  return {
    agreementScore: agreementScoreForVerdict(validationVerdictForFinancialJudge(fallbackVerdict.verdict)),
    confidence: fallbackVerdict.confidence,
    evidence: {
      financialJudgeVerdict: fallbackVerdict,
      note
    },
    model: env.CERTSCORE_REVIEW_MODEL,
    promptVersion: VALIDATION_PROMPT_VERSION,
    rationale: note,
    verdict: validationVerdictForFinancialJudge(fallbackVerdict.verdict)
  };
}

export async function validateFinancialFindingWithLlm(input: FinancialJudgeInput) {
  const env = getWorkerEnv();
  const parsedInput = financialJudgeInputSchema.parse(input);

  if (!env.OPENAI_API_KEY) {
    return buildFallbackFinancialJudgeVerdict(
      "The financial judge could not call the model because OPENAI_API_KEY is not configured."
    );
  }

  let payload: OpenAiJsonResponse;
  try {
    payload = await callOpenAiJsonWithQuotaFallback({
      apiKey: env.OPENAI_API_KEY,
      payload: {
        model: env.CERTSCORE_REVIEW_MODEL,
        temperature: 0,
        response_format: {
          type: "json_object"
        },
        messages: [
          {
            role: "user",
            content: buildFinancialJudgePrompt(parsedInput)
          }
        ]
      }
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown OpenAI financial judge error.";
    return buildFallbackFinancialJudgeVerdict(
      `The financial judge could not complete the model call and was downgraded to audit-only. ${reason}`
    );
  }

  const rawContent = payload.choices?.[0]?.message?.content ?? "";
  let judge;
  try {
    judge = financialJudgeOutputSchema.parse(JSON.parse(extractJson(rawContent)));
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Financial judge output could not be parsed.";
    return buildFallbackFinancialJudgeVerdict(`The financial judge returned malformed JSON and was downgraded to audit-only. ${reason}`);
  }
  const verdict = validationVerdictForFinancialJudge(judge.verdict);

  return {
    agreementScore: agreementScoreForVerdict(verdict),
    confidence: judge.confidence,
    evidence: {
      financialJudgeVerdict: judge
    },
    model: payload.model ?? env.CERTSCORE_REVIEW_MODEL,
    promptVersion: VALIDATION_PROMPT_VERSION,
    rationale: `Financial judge ${judge.verdict.replaceAll("_", " ")} (${judge.rationaleCode}).`,
    verdict
  };
}

export type BatchedValidationFinding = {
  finding: Record<string, unknown>;
  findingId: string;
  routingReasonCodes: string[];
};

export type BatchedValidationVerdict = {
  agreementScore: ValidationAgreementScore;
  confidence: number;
  evidence: Record<string, unknown>;
  findingId: string;
  model: string;
  promptVersion: string;
  rationale: string;
  verdict: "supported" | "inconclusive" | "not_supported";
};

const validationBatchJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["verdicts"],
  properties: {
    verdicts: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["findingId", "verdict", "confidence", "rationale", "evidence"],
        properties: {
          findingId: { type: "string", maxLength: 120 },
          verdict: {
            type: "string",
            enum: ["supported", "inconclusive", "not_supported"]
          },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          rationale: { type: "string", maxLength: 1_000 },
          evidence: {
            type: "object",
            additionalProperties: false,
            required: ["supportingRefs", "conflictingRefs", "reasonCodes"],
            properties: {
              supportingRefs: {
                type: "array",
                maxItems: 20,
                items: { type: "string", maxLength: 500 }
              },
              conflictingRefs: {
                type: "array",
                maxItems: 20,
                items: { type: "string", maxLength: 500 }
              },
              reasonCodes: {
                type: "array",
                maxItems: 20,
                items: { type: "string", maxLength: 120 }
              }
            }
          }
        }
      }
    }
  }
} as const;

function boundedJson(value: unknown, maxChars: number) {
  const serialized = JSON.stringify(value);
  if (serialized.length <= maxChars) {
    return serialized;
  }
  return `${serialized.slice(0, maxChars)}…[bounded]`;
}

function buildBatchFallbacks(input: {
  items: BatchedValidationFinding[];
  model: string;
  note: string;
}): Map<string, BatchedValidationVerdict> {
  return new Map<string, BatchedValidationVerdict>(
    input.items.map((item) => {
      const fallback = buildFallbackValidationVerdict({
        model: input.model,
        note: input.note
      });
      return [
        item.findingId,
        {
          ...fallback,
          findingId: item.findingId,
          evidence: {
            ...fallback.evidence,
            modelRoleFailure: true,
            routingReasonCodes: item.routingReasonCodes
          }
        }
      ];
    })
  );
}

export async function validateFindingsBatchWithLlm(input: {
  domain: string;
  items: BatchedValidationFinding[];
  modelRole: "extraction" | "review" | "escalation";
  scanEvidence: Record<string, unknown>;
}) {
  const env = getWorkerEnv();
  const model =
    input.modelRole === "extraction"
      ? env.CERTSCORE_EXTRACTION_MODEL
      : input.modelRole === "escalation"
        ? env.CERTSCORE_ESCALATION_MODEL
        : env.CERTSCORE_REVIEW_MODEL;
  if (input.items.length === 0) {
    return new Map<string, BatchedValidationVerdict>();
  }
  if (!model) {
    return buildBatchFallbacks({
      items: input.items,
      model: input.modelRole,
      note: `No ${input.modelRole} model is configured; the batched review is inconclusive.`
    });
  }
  if (!env.OPENAI_API_KEY) {
    return buildBatchFallbacks({
      items: input.items,
      model,
      note: "OPENAI_API_KEY is not configured; the batched review is inconclusive."
    });
  }

  let payload: OpenAiJsonResponse;
  try {
    payload = await callOpenAiJson({
      apiKey: env.OPENAI_API_KEY,
      payload: {
        model,
        temperature: 0,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "validation_finding_batch",
            strict: true,
            schema: validationBatchJsonSchema
          }
        },
        messages: [
          {
            role: "system",
            content: [
              "Review retained website-scan findings as bounded evidence questions.",
              "Return one result for every findingId.",
              "Verdict must be supported, inconclusive, or not_supported.",
              "Do not invent evidence, legal conclusions, vendors, timing, or runtime facts.",
              "Prefer direct evidence over adjacent keywords.",
              "A passage about retention does not prove processing purposes.",
              "A transfer framework reference does not prove processing purposes.",
              "When evidence conflicts, capture the conflict and use inconclusive unless the direct evidence resolves it.",
              "This output is advisory and cannot create or upgrade a production finding."
            ].join(" ")
          },
          {
            role: "user",
            content: JSON.stringify({
              domain: input.domain,
              modelRole: input.modelRole,
              retainedScanEvidenceJsonExcerpt: boundedJson(input.scanEvidence, 18_000),
              findings: input.items.map((item) => ({
                findingId: item.findingId,
                findingJsonExcerpt: boundedJson(item.finding, 8_000),
                routingReasonCodes: item.routingReasonCodes
              }))
            })
          }
        ]
      }
    });
  } catch (error) {
    return buildBatchFallbacks({
      items: input.items,
      model,
      note: `The ${input.modelRole} batch failed safely: ${error instanceof Error ? error.message : "unknown error"}`
    });
  }

  try {
    const parsed = JSON.parse(extractJson(payload.choices?.[0]?.message?.content ?? "")) as {
      verdicts?: Array<{
        confidence?: number;
        evidence?: Record<string, unknown>;
        findingId?: string;
        rationale?: string;
        verdict?: "supported" | "inconclusive" | "not_supported";
      }>;
    };
    const expectedIds = new Set(input.items.map((item) => item.findingId));
    const result = new Map<string, BatchedValidationVerdict>();
    for (const row of parsed.verdicts ?? []) {
      if (
        typeof row.findingId !== "string" ||
        !expectedIds.has(row.findingId) ||
        result.has(row.findingId)
      ) {
        continue;
      }
      const verdict =
        row.verdict === "supported" || row.verdict === "not_supported"
          ? row.verdict
          : "inconclusive";
      result.set(row.findingId, {
        agreementScore: agreementScoreForVerdict(verdict),
        confidence:
          typeof row.confidence === "number" && Number.isFinite(row.confidence)
            ? Math.max(0, Math.min(1, row.confidence))
            : 0.5,
        evidence: {
          ...(row.evidence ?? {}),
          modelRole: input.modelRole,
          usedForProductionProjection: false
        },
        findingId: row.findingId,
        model: payload.model ?? model,
        promptVersion: `${VALIDATION_PROMPT_VERSION}.batch.v1`,
        rationale: row.rationale ?? "No rationale returned.",
        verdict
      });
    }
    const missing = input.items.filter((item) => !result.has(item.findingId));
    const fallbacks = buildBatchFallbacks({
      items: missing,
      model,
      note: `The ${input.modelRole} batch omitted this finding and was treated as inconclusive.`
    });
    for (const [findingId, verdict] of fallbacks) {
      result.set(findingId, verdict);
    }
    return result;
  } catch (error) {
    return buildBatchFallbacks({
      items: input.items,
      model,
      note: `The ${input.modelRole} batch returned malformed structured output and was treated as inconclusive. ${
        error instanceof Error ? error.message : ""
      }`
    });
  }
}
