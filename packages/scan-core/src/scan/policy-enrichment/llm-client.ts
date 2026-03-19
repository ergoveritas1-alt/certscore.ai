import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { ruleBasedPolicyPreprocess } from "./rules";
import type { PolicyChunk, PolicyLlmClient } from "./types";

const PROMPT_DIR = path.join(__dirname, "prompts");
const PROMPT_DIR_CANDIDATES = [
  PROMPT_DIR,
  path.resolve(__dirname, "../../../src/scan/policy-enrichment/prompts"),
  path.resolve(process.cwd(), "src/scan/policy-enrichment/prompts"),
  path.resolve(process.cwd(), "packages/scan-core/src/scan/policy-enrichment/prompts"),
  path.resolve(process.cwd(), "apps/worker/src/scan/policy-enrichment/prompts")
];

export const POLICY_EXTRACTION_CONFIG = {
  model: "gpt-4o-mini",
  modelVersion: "v1",
  promptVersion: "policy_extraction_v1",
  temperature: 0,
  maxTokens: 1200
} as const;

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_TIMEOUT_MS = 15_000;

export type PolicyPromptName =
  | "policy_extraction_v1.txt"
  | "policy_extraction_v1_example.json"
  | "terms_extraction_v1.txt"
  | "terms_extraction_v1_example.json";

export type PolicyLlmFailureCode = "empty_response" | "invalid_json" | "provider_error" | "timeout";

export class PolicyLlmError extends Error {
  constructor(
    readonly code: PolicyLlmFailureCode,
    message: string
  ) {
    super(message);
    this.name = "PolicyLlmError";
  }
}

function extractJsonObject(raw: string) {
  const trimmed = raw.trim();

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    const fenced = fencedMatch[1].trim();
    if (fenced.startsWith("{") && fenced.endsWith("}")) {
      return fenced;
    }
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return trimmed;
}

export function loadPolicyPrompt(name: PolicyPromptName) {
  for (const promptDir of PROMPT_DIR_CANDIDATES) {
    const candidatePath = path.join(promptDir, name);
    if (existsSync(candidatePath)) {
      return readFileSync(candidatePath, "utf8");
    }
  }

  throw new Error(`Missing policy prompt asset: ${name}`);
}

export function resolvePolicyPromptName(pageType: string | null | undefined) {
  return pageType === "terms_of_service" ? "terms_extraction_v1.txt" : "policy_extraction_v1.txt";
}

function resolvePolicyExampleName(promptName: PolicyPromptName) {
  return promptName === "terms_extraction_v1.txt" ? "terms_extraction_v1_example.json" : "policy_extraction_v1_example.json";
}

type PolicyLlmEnv = NodeJS.ProcessEnv & {
  LLM_ENRICHMENT_ENABLED?: string;
  LLM_ENRICHMENT_TIMEOUT_MS?: string;
  OPENAI_API_KEY?: string;
  POLICY_ENRICHMENT_MOCK_LLM?: string;
};

function isLlmEnrichmentEnabled(env: PolicyLlmEnv) {
  return env.LLM_ENRICHMENT_ENABLED === "1";
}

function getTimeoutMs(env: PolicyLlmEnv) {
  const parsed = Number(env.LLM_ENRICHMENT_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  return Number.isFinite(parsed) ? Math.max(1_000, parsed) : DEFAULT_TIMEOUT_MS;
}

class MockPolicyLlmClient implements PolicyLlmClient {
  async extractPolicyChunk(input: { chunk: PolicyChunk; promptName: string; promptText: string }) {
    const quick = ruleBasedPolicyPreprocess({ text: input.chunk.text });
    const response = {
      mentions_gdpr: {
        value: quick.mentions.some((mention) => mention.topic === "gdpr") || null,
        confidence: quick.mentions.some((mention) => mention.topic === "gdpr") ? 0.84 : 0,
        snippet: quick.evidenceSnippets["topic:gdpr"] ?? null
      },
      effective_date: {
        value: quick.updateDate,
        confidence: quick.updateDate ? 0.82 : 0,
        snippet: quick.evidenceSnippets.effective_date ?? null
      },
      governing_law: {
        value: quick.governingLaw,
        confidence: quick.governingLaw ? 0.8 : 0,
        snippet: quick.evidenceSnippets.governing_law ?? null
      },
      arbitration_present: {
        value: quick.arbitrationPresent,
        confidence: quick.arbitrationPresent ? 0.84 : 0.3,
        snippet: quick.evidenceSnippets.arbitration ?? null
      },
      do_not_sell: {
        value: quick.doNotSell,
        confidence: quick.doNotSell === "unknown" ? 0 : 0.8,
        snippet: quick.evidenceSnippets.do_not_sell ?? null
      },
      dsar_mechanism: {
        value: quick.dsarMechanism,
        confidence: quick.dsarMechanism === "unknown" ? 0 : quick.dsarMechanism === "partial" ? 0.62 : 0.82,
        snippet: quick.evidenceSnippets.dsar ?? null
      },
      data_access_request_present: {
        value: quick.dataAccessRequestPresent,
        confidence: quick.dataAccessRequestPresent ? 0.8 : 0.4,
        snippet: quick.evidenceSnippets.dsar ?? null
      },
      data_deletion_request_present: {
        value: quick.dataDeletionRequestPresent,
        confidence: quick.dataDeletionRequestPresent ? 0.8 : 0.4,
        snippet: quick.evidenceSnippets.dsar ?? null
      },
      privacy_contact_channel_type: {
        value: quick.privacyContactChannelType,
        confidence: quick.privacyContactChannelType && quick.privacyContactChannelType !== "none" ? 0.76 : 0.4,
        snippet: quick.evidenceSnippets.dsar ?? null
      },
      retention_disclosure: {
        value: quick.retentionDisclosure,
        confidence: quick.retentionDisclosure === "specific" ? 0.86 : quick.retentionDisclosure === "vague" ? 0.64 : 0.48,
        snippet: quick.evidenceSnippets.retention ?? null
      },
      policy_claim_no_sale: {
        value: quick.policyClaimNoSale,
        confidence: quick.policyClaimNoSale ? 0.84 : 0.36,
        snippet: quick.evidenceSnippets.do_not_sell ?? null
      },
      policy_claim_no_tracking: {
        value: quick.policyClaimNoTracking,
        confidence: quick.policyClaimNoTracking ? 0.78 : 0.35,
        snippet: quick.evidenceSnippets.claim_no_tracking ?? null
      },
      policy_claim_privacy_protective: {
        value: quick.policyClaimPrivacyProtective,
        confidence: quick.policyClaimPrivacyProtective ? 0.72 : 0.3,
        snippet: quick.evidenceSnippets.claim_privacy_protective ?? null
      },
      data_categories: quick.dataCategories.map((category) => ({
        category: category === "email" || category === "ip" || category === "payment" || category === "health" || category === "biometric" || category === "location" ? category : "other",
        confidence: 0.72,
        snippet: quick.evidenceSnippets[`data_category:${category}`] ?? null
      })),
      retention_statements: quick.retentionStatements.map((item) => ({
        category: item.category,
        period_text: item.periodText,
        confidence: item.confidence,
        snippet: item.snippet
      })),
      transfer_mechanisms: quick.transferMechanisms.map((item) => ({
        mechanism: item.mechanism,
        confidence: item.confidence,
        snippet: item.snippet
      })),
      children_reference: {
        value: quick.childrenReference,
        confidence: quick.childrenReference === "none" ? 0.65 : quick.childrenReference === "unknown" ? 0 : 0.84,
        snippet: quick.evidenceSnippets.children ?? null
      },
      summary: {
        text: quick.summary,
        confidence: Math.max(0.5, quick.semanticConfidence)
      }
    };

    return {
      model: "mock-policy-extractor",
      modelVersion: "v1",
      promptVersion: input.promptName.replace(".txt", ""),
      rawJson: JSON.stringify(response)
    };
  }
}

class OpenAiPolicyLlmClient implements PolicyLlmClient {
  constructor(
    private readonly apiKey: string,
    private readonly timeoutMs: number
  ) {}

  async extractPolicyChunk(input: { chunk: PolicyChunk; promptName: string; promptText: string }) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const exampleJson = loadPolicyPrompt(resolvePolicyExampleName(input.promptName as PolicyPromptName));

    try {
      const response = await fetch(OPENAI_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: POLICY_EXTRACTION_CONFIG.model,
          temperature: POLICY_EXTRACTION_CONFIG.temperature,
          max_completion_tokens: POLICY_EXTRACTION_CONFIG.maxTokens,
          response_format: {
            type: "json_object"
          },
          messages: [
            {
              role: "system",
              content: input.promptText
            },
            {
              role: "assistant",
              content: exampleJson
            },
            {
              role: "user",
              content: `CHUNK_ID: ${input.chunk.chunkId}\nTEXT:\n${input.chunk.text}`
            }
          ]
        })
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        throw new PolicyLlmError(
          "provider_error",
          `OpenAI policy extraction failed with ${response.status}${errorBody ? `: ${errorBody}` : ""}`
        );
      }

      const payload = (await response.json()) as {
        model?: string;
        choices?: Array<{
          message?: {
            content?: string | Array<{ text?: string; type?: string }>;
          };
        }>;
      };
      const content = payload.choices?.[0]?.message?.content;
      const rawContent =
        typeof content === "string"
          ? content
          : Array.isArray(content)
            ? content
                .map((item) => (item && typeof item.text === "string" ? item.text : ""))
                .join("")
                .trim()
            : "";

      if (!rawContent) {
        throw new PolicyLlmError("empty_response", "OpenAI policy extraction returned an empty response.");
      }

      const rawJson = extractJsonObject(rawContent);

      return {
        model: payload.model ?? POLICY_EXTRACTION_CONFIG.model,
        modelVersion: POLICY_EXTRACTION_CONFIG.modelVersion,
        promptVersion: input.promptName.replace(".txt", ""),
        rawJson
      };
    } catch (error) {
      if (error instanceof PolicyLlmError) {
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new PolicyLlmError("timeout", `OpenAI policy extraction timed out after ${this.timeoutMs}ms.`);
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createPolicyLlmClient(env: PolicyLlmEnv = process.env) {
  if (env.POLICY_ENRICHMENT_MOCK_LLM === "1") {
    return new MockPolicyLlmClient();
  }

  if (!isLlmEnrichmentEnabled(env) || !env.OPENAI_API_KEY) {
    return null;
  }

  return new OpenAiPolicyLlmClient(env.OPENAI_API_KEY, getTimeoutMs(env));
}

export function getPolicyLlmAvailability(env: PolicyLlmEnv = process.env) {
  return {
    enabled: isLlmEnrichmentEnabled(env),
    hasApiKey: Boolean(env.OPENAI_API_KEY),
    mock: env.POLICY_ENRICHMENT_MOCK_LLM === "1",
    timeoutMs: getTimeoutMs(env)
  };
}
