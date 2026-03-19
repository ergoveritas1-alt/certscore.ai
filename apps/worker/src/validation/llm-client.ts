import { z } from "zod";
import { getWorkerEnv } from "../env";
import type { ValidationRunFindingRow } from "./repository";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const PROMPT_VERSION = "validation_verdict_v1";
const DEFAULT_TIMEOUT_MS = 20_000;

const verdictSchema = z.object({
  confidence: z.coerce.number().min(0).max(1),
  evidence: z.array(z.string()).max(5).default([]),
  rationale: z.string().min(1),
  verdict: z.enum(["supported", "inconclusive", "not_supported"])
});

function normalizeConfidence(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.min(1, value));
  }

  if (typeof value === "string") {
    const normalized = value.trim().replace(/%$/, "");
    const parsed = Number.parseFloat(normalized);
    if (Number.isFinite(parsed)) {
      const scaled = normalized.endsWith("%") || parsed > 1 ? parsed / 100 : parsed;
      return Math.max(0, Math.min(1, scaled));
    }
  }

  return 0.5;
}

function normalizeEvidence(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry)).slice(0, 5);
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return [value.trim()];
  }

  return [];
}

function normalizeVerdictPayload(value: unknown) {
  const candidate = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};

  return {
    confidence: normalizeConfidence(candidate.confidence),
    evidence: normalizeEvidence(candidate.evidence),
    rationale: typeof candidate.rationale === "string" && candidate.rationale.trim().length > 0 ? candidate.rationale.trim() : "No rationale returned.",
    verdict:
      candidate.verdict === "supported" || candidate.verdict === "not_supported" || candidate.verdict === "inconclusive"
        ? candidate.verdict
        : "inconclusive"
  };
}

function buildPrompt(finding: ValidationRunFindingRow) {
  return [
    "You are reviewing the validity of an automated website compliance finding.",
    "Judge only whether the automated finding is supported by the supplied evidence.",
    "Do not make new factual claims beyond the evidence payload.",
    "If the evidence is too weak or ambiguous, return inconclusive.",
    'Return JSON with keys: verdict, confidence, rationale, evidence.'
  ].join("\n");
}

function buildUserMessage(finding: ValidationRunFindingRow) {
  return JSON.stringify(
    {
      finding: {
        category: finding.category,
        description: finding.description,
        pageUrl: finding.page_url,
        ruleKey: finding.rule_key,
        severity: finding.severity,
        title: finding.title
      },
      evidence: finding.evidence_json
    },
    null,
    2
  );
}

function extractJsonObject(raw: string) {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return trimmed;
}

export async function requestValidationVerdict(finding: ValidationRunFindingRow) {
  const env = getWorkerEnv();
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for validation verdicting.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: env.VALIDATION_OPENAI_MODEL,
        temperature: 0,
        max_completion_tokens: 500,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: buildPrompt(finding)
          },
          {
            role: "user",
            content: buildUserMessage(finding)
          }
        ]
      })
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Validation verdict request failed with ${response.status}${body ? `: ${body}` : ""}`);
    }

    const payload = (await response.json()) as {
      model?: string;
      choices?: Array<{
        message?: {
          content?: string | Array<{ text?: string }>;
        };
      }>;
    };

    const content = payload.choices?.[0]?.message?.content;
    const rawContent =
      typeof content === "string"
        ? content
        : Array.isArray(content)
          ? content.map((entry) => (typeof entry?.text === "string" ? entry.text : "")).join("").trim()
          : "";

    const parsed = verdictSchema.parse(normalizeVerdictPayload(JSON.parse(extractJsonObject(rawContent))));
    return {
      ...parsed,
      model: payload.model ?? env.VALIDATION_OPENAI_MODEL,
      promptVersion: PROMPT_VERSION
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Validation verdict request timed out after ${DEFAULT_TIMEOUT_MS}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
