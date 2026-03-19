import { VALIDATION_PROMPT_VERSION, type ValidationAgreementScore } from "@website-signal-risk-scanner/validation-shared";
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
