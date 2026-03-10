import { z } from "zod";
import { clampSnippet, findSnippetInText } from "./normalize";
import type { PolicyChunkExtraction } from "./types";

const confidenceSchema = z.number().min(0).max(1);
const snippetSchema = z.string().max(240).nullable();

const fieldSchema = <T extends z.ZodTypeAny>(value: T) =>
  z.object({
    value,
    confidence: confidenceSchema,
    snippet: snippetSchema
  });

const extractionSchema = z.object({
  mentions_gdpr: fieldSchema(z.boolean().nullable()),
  do_not_sell: fieldSchema(z.enum(["present_link", "present_text", "absent", "unknown"])),
  dsar_mechanism: fieldSchema(z.enum(["present", "partial", "absent", "unknown"])),
  data_access_request_present: fieldSchema(z.boolean().nullable()),
  data_deletion_request_present: fieldSchema(z.boolean().nullable()),
  privacy_contact_channel_type: fieldSchema(z.enum(["email", "form", "portal", "none"]).nullable()),
  retention_disclosure: fieldSchema(z.enum(["none", "vague", "specific"]).nullable()),
  policy_claim_no_sale: fieldSchema(z.boolean().nullable()),
  policy_claim_no_tracking: fieldSchema(z.boolean().nullable()),
  policy_claim_privacy_protective: fieldSchema(z.boolean().nullable()),
  data_categories: z.array(
    z.object({
      category: z.enum(["email", "ip", "payment", "health", "biometric", "location", "other"]),
      confidence: confidenceSchema,
      snippet: snippetSchema
    })
  ),
  retention_statements: z.array(
    z.object({
      category: z.enum(["account data", "transaction data", "logs", "other"]),
      period_text: z.string().min(1),
      confidence: confidenceSchema,
      snippet: snippetSchema
    })
  ),
  transfer_mechanisms: z.array(
    z.object({
      mechanism: z.enum(["SCC", "adequacy", "contract", "none"]),
      confidence: confidenceSchema,
      snippet: snippetSchema
    })
  ),
  children_reference: fieldSchema(z.enum(["under_13", "under_16", "none", "unknown"]).nullable()),
  summary: z.object({
    text: z.string().max(280).nullable(),
    confidence: confidenceSchema
  })
});

function validateSnippetInChunk(chunkText: string, snippet: string | null) {
  if (!snippet) {
    return true;
  }

  return findSnippetInText(chunkText, snippet) !== null;
}

export function validatePolicyChunkJson(input: { chunkText: string; rawJson: string }) {
  const parsedJson = JSON.parse(input.rawJson) as unknown;
  const parsed = extractionSchema.parse(parsedJson);
  const snippets = [
    parsed.mentions_gdpr.snippet,
    parsed.do_not_sell.snippet,
    parsed.dsar_mechanism.snippet,
    parsed.data_access_request_present.snippet,
    parsed.data_deletion_request_present.snippet,
    parsed.privacy_contact_channel_type.snippet,
    parsed.retention_disclosure.snippet,
    parsed.policy_claim_no_sale.snippet,
    parsed.policy_claim_no_tracking.snippet,
    parsed.policy_claim_privacy_protective.snippet,
    parsed.children_reference.snippet,
    ...parsed.data_categories.map((item) => item.snippet),
    ...parsed.retention_statements.map((item) => item.snippet),
    ...parsed.transfer_mechanisms.map((item) => item.snippet)
  ];

  if (snippets.some((snippet) => !validateSnippetInChunk(input.chunkText, clampSnippet(snippet)))) {
    throw new Error("Policy chunk extraction returned a snippet that does not appear in the source chunk.");
  }

  const normalized: PolicyChunkExtraction = {
    mentionsGdpr: {
      value: parsed.mentions_gdpr.value,
      confidence: parsed.mentions_gdpr.confidence,
      snippet: clampSnippet(parsed.mentions_gdpr.snippet)
    },
    doNotSell: {
      value: parsed.do_not_sell.value,
      confidence: parsed.do_not_sell.confidence,
      snippet: clampSnippet(parsed.do_not_sell.snippet)
    },
    dsarMechanism: {
      value: parsed.dsar_mechanism.value,
      confidence: parsed.dsar_mechanism.confidence,
      snippet: clampSnippet(parsed.dsar_mechanism.snippet)
    },
    dataAccessRequestPresent: {
      value: parsed.data_access_request_present.value,
      confidence: parsed.data_access_request_present.confidence,
      snippet: clampSnippet(parsed.data_access_request_present.snippet)
    },
    dataDeletionRequestPresent: {
      value: parsed.data_deletion_request_present.value,
      confidence: parsed.data_deletion_request_present.confidence,
      snippet: clampSnippet(parsed.data_deletion_request_present.snippet)
    },
    privacyContactChannelType: {
      value: parsed.privacy_contact_channel_type.value,
      confidence: parsed.privacy_contact_channel_type.confidence,
      snippet: clampSnippet(parsed.privacy_contact_channel_type.snippet)
    },
    retentionDisclosure: {
      value: parsed.retention_disclosure.value,
      confidence: parsed.retention_disclosure.confidence,
      snippet: clampSnippet(parsed.retention_disclosure.snippet)
    },
    policyClaimNoSale: {
      value: parsed.policy_claim_no_sale.value,
      confidence: parsed.policy_claim_no_sale.confidence,
      snippet: clampSnippet(parsed.policy_claim_no_sale.snippet)
    },
    policyClaimNoTracking: {
      value: parsed.policy_claim_no_tracking.value,
      confidence: parsed.policy_claim_no_tracking.confidence,
      snippet: clampSnippet(parsed.policy_claim_no_tracking.snippet)
    },
    policyClaimPrivacyProtective: {
      value: parsed.policy_claim_privacy_protective.value,
      confidence: parsed.policy_claim_privacy_protective.confidence,
      snippet: clampSnippet(parsed.policy_claim_privacy_protective.snippet)
    },
    dataCategories: parsed.data_categories.map((item) => ({
      value: item.category,
      confidence: item.confidence,
      snippet: clampSnippet(item.snippet)
    })),
    retentionStatements: parsed.retention_statements.map((item) => ({
      category: item.category,
      periodText: item.period_text,
      confidence: item.confidence,
      snippet: clampSnippet(item.snippet)
    })),
    transferMechanisms: parsed.transfer_mechanisms.map((item) => ({
      mechanism: item.mechanism,
      confidence: item.confidence,
      snippet: clampSnippet(item.snippet)
    })),
    childrenReference: {
      value: parsed.children_reference.value,
      confidence: parsed.children_reference.confidence,
      snippet: clampSnippet(parsed.children_reference.snippet)
    },
    summary: {
      text: parsed.summary.text ? clampSnippet(parsed.summary.text, 280) : null,
      confidence: parsed.summary.confidence
    }
  };

  return normalized;
}
