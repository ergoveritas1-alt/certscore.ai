import {
  VALIDATION_PROMPT_VERSION,
  buildFinancialCommercialClaimPrompt,
  financialCommercialClaimCandidateInputSchema,
  financialCommercialClaimClassificationSchema,
  type FinancialCommercialClaimCandidateInput,
  buildFinancialJudgePrompt,
  financialJudgeInputSchema,
  financialJudgeOutputSchema,
  type FinancialJudgeInput,
  type ValidationAgreementScore
} from "@website-signal-risk-scanner/validation-shared";
import { getWorkerEnv } from "../env";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

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

export async function validateFindingWithLlm(input: {
  domain: string;
  finding: Record<string, unknown>;
  scanEvidence: Record<string, unknown>;
}) {
  const env = getWorkerEnv();

  if (!env.OPENAI_API_KEY) {
    return {
      agreementScore: 50 as ValidationAgreementScore,
      confidence: 0.2,
      evidence: {
        note: "OPENAI_API_KEY not configured"
      },
      model: env.VALIDATION_OPENAI_MODEL,
      promptVersion: VALIDATION_PROMPT_VERSION,
      rationale: "The validation worker could not call the model because OPENAI_API_KEY is not configured.",
      verdict: "inconclusive" as const
    };
  }

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: env.VALIDATION_OPENAI_MODEL,
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
    })
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`OpenAI validation call failed with ${response.status}${errorBody ? `: ${errorBody}` : ""}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
    model?: string;
  };

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
    model: payload.model ?? env.VALIDATION_OPENAI_MODEL,
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
    model: getWorkerEnv().VALIDATION_OPENAI_MODEL,
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

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: env.VALIDATION_OPENAI_MODEL,
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
    })
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`OpenAI financial judge call failed with ${response.status}${errorBody ? `: ${errorBody}` : ""}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
    model?: string;
  };

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
    model: payload.model ?? env.VALIDATION_OPENAI_MODEL,
    promptVersion: VALIDATION_PROMPT_VERSION,
    rationale: `Financial judge ${judge.verdict.replaceAll("_", " ")} (${judge.rationaleCode}).`,
    verdict
  };
}

export async function classifyFinancialCommercialClaimWithLlm(input: FinancialCommercialClaimCandidateInput) {
  const env = getWorkerEnv();
  const parsedInput = financialCommercialClaimCandidateInputSchema.parse(input);

  if (!env.OPENAI_API_KEY) {
    return null;
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
      response_format: {
        type: "json_object"
      },
      messages: [
        {
          role: "user",
          content: buildFinancialCommercialClaimPrompt(parsedInput)
        }
      ]
    })
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(
      `OpenAI financial commercial claim classification failed with ${response.status}${errorBody ? `: ${errorBody}` : ""}`
    );
  }

  const payload = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };

  const rawContent = payload.choices?.[0]?.message?.content ?? "";
  return financialCommercialClaimClassificationSchema.parse(JSON.parse(extractJson(rawContent)));
}
