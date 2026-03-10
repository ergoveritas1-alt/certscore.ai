import { readFileSync } from "node:fs";
import path from "node:path";
import { ruleBasedPolicyPreprocess } from "./rules";
import type { PolicyChunk, PolicyLlmClient } from "./types";

const PROMPT_DIR = path.join(__dirname, "prompts");

export const POLICY_EXTRACTION_CONFIG = {
  model: "gpt-4o-mini",
  modelVersion: "v1",
  promptVersion: "policy_extraction_v1",
  temperature: 0,
  maxTokens: 400
} as const;

export function loadPolicyPrompt(name: "policy_extraction_v1.txt" | "policy_extraction_v1_example.json") {
  return readFileSync(path.join(PROMPT_DIR, name), "utf8");
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

export function createPolicyLlmClient() {
  if (process.env.POLICY_ENRICHMENT_MOCK_LLM === "1") {
    return new MockPolicyLlmClient();
  }

  return null;
}
