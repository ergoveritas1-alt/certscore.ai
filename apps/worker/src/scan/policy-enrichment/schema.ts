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
  effective_date: fieldSchema(z.string().max(40).nullable()),
  governing_law: fieldSchema(z.string().max(120).nullable()),
  arbitration_present: fieldSchema(z.boolean().nullable()),
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

const defaultExtraction = {
  effective_date: { value: null, confidence: 0, snippet: null },
  governing_law: { value: null, confidence: 0, snippet: null },
  arbitration_present: { value: null, confidence: 0, snippet: null },
  mentions_gdpr: { value: null, confidence: 0, snippet: null },
  do_not_sell: { value: "unknown", confidence: 0, snippet: null },
  dsar_mechanism: { value: "unknown", confidence: 0, snippet: null },
  data_access_request_present: { value: null, confidence: 0, snippet: null },
  data_deletion_request_present: { value: null, confidence: 0, snippet: null },
  privacy_contact_channel_type: { value: null, confidence: 0, snippet: null },
  retention_disclosure: { value: null, confidence: 0, snippet: null },
  policy_claim_no_sale: { value: null, confidence: 0, snippet: null },
  policy_claim_no_tracking: { value: null, confidence: 0, snippet: null },
  policy_claim_privacy_protective: { value: null, confidence: 0, snippet: null },
  data_categories: [],
  retention_statements: [],
  transfer_mechanisms: [],
  children_reference: { value: null, confidence: 0, snippet: null },
  summary: { text: null, confidence: 0 }
} as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeExtractionDefaults(input: unknown) {
  if (!isPlainObject(input)) {
    return defaultExtraction;
  }

  const normalizedRetentionStatements = Array.isArray(input.retention_statements)
    ? input.retention_statements.map((item) => {
        if (!isPlainObject(item)) {
          return item;
        }

        if (item.category === "customer data") {
          return {
            ...item,
            category: "other"
          };
        }

        if (item.period_text === null) {
          return null;
        }

        return item;
      }).filter((item): item is Exclude<typeof item, null> => item !== null)
    : input.retention_statements;

  const normalizedChildrenReference =
    isPlainObject(input.children_reference) && input.children_reference.value === "under_18"
      ? {
          ...input.children_reference,
          value: "under_16"
        }
      : isPlainObject(input.children_reference)
        ? input.children_reference
        : {};

  return {
    ...defaultExtraction,
    ...input,
    retention_statements: Array.isArray(normalizedRetentionStatements)
      ? normalizedRetentionStatements
      : defaultExtraction.retention_statements,
    effective_date: { ...defaultExtraction.effective_date, ...(isPlainObject(input.effective_date) ? input.effective_date : {}) },
    governing_law: { ...defaultExtraction.governing_law, ...(isPlainObject(input.governing_law) ? input.governing_law : {}) },
    arbitration_present: { ...defaultExtraction.arbitration_present, ...(isPlainObject(input.arbitration_present) ? input.arbitration_present : {}) },
    mentions_gdpr: { ...defaultExtraction.mentions_gdpr, ...(isPlainObject(input.mentions_gdpr) ? input.mentions_gdpr : {}) },
    do_not_sell: { ...defaultExtraction.do_not_sell, ...(isPlainObject(input.do_not_sell) ? input.do_not_sell : {}) },
    dsar_mechanism: { ...defaultExtraction.dsar_mechanism, ...(isPlainObject(input.dsar_mechanism) ? input.dsar_mechanism : {}) },
    data_access_request_present: {
      ...defaultExtraction.data_access_request_present,
      ...(isPlainObject(input.data_access_request_present) ? input.data_access_request_present : {})
    },
    data_deletion_request_present: {
      ...defaultExtraction.data_deletion_request_present,
      ...(isPlainObject(input.data_deletion_request_present) ? input.data_deletion_request_present : {})
    },
    privacy_contact_channel_type: {
      ...defaultExtraction.privacy_contact_channel_type,
      ...(isPlainObject(input.privacy_contact_channel_type) ? input.privacy_contact_channel_type : {})
    },
    retention_disclosure: {
      ...defaultExtraction.retention_disclosure,
      ...(isPlainObject(input.retention_disclosure)
        ? {
            ...input.retention_disclosure,
            value: input.retention_disclosure.value === "unknown" ? null : input.retention_disclosure.value
          }
        : {})
    },
    policy_claim_no_sale: {
      ...defaultExtraction.policy_claim_no_sale,
      ...(isPlainObject(input.policy_claim_no_sale) ? input.policy_claim_no_sale : {})
    },
    policy_claim_no_tracking: {
      ...defaultExtraction.policy_claim_no_tracking,
      ...(isPlainObject(input.policy_claim_no_tracking) ? input.policy_claim_no_tracking : {})
    },
    policy_claim_privacy_protective: {
      ...defaultExtraction.policy_claim_privacy_protective,
      ...(isPlainObject(input.policy_claim_privacy_protective) ? input.policy_claim_privacy_protective : {})
    },
    children_reference: {
      ...defaultExtraction.children_reference,
      ...normalizedChildrenReference
    },
    summary: { ...defaultExtraction.summary, ...(isPlainObject(input.summary) ? input.summary : {}) }
  };
}

function validateSnippetInChunk(chunkText: string, snippet: string | null) {
  if (!snippet) {
    return true;
  }

  return findSnippetInText(chunkText, snippet) !== null;
}

export function validatePolicyChunkJson(input: { chunkText: string; rawJson: string }) {
  const parsedJson = JSON.parse(input.rawJson) as unknown;
  const parsed = extractionSchema.parse(mergeExtractionDefaults(parsedJson));

  const sanitizeSnippet = (snippet: string | null) => {
    const clamped = clampSnippet(snippet);
    return validateSnippetInChunk(input.chunkText, clamped) ? clamped : null;
  };

  const normalized: PolicyChunkExtraction = {
    effectiveDate: {
      value: parsed.effective_date.value,
      confidence: parsed.effective_date.confidence,
      snippet: sanitizeSnippet(parsed.effective_date.snippet)
    },
    governingLaw: {
      value: parsed.governing_law.value,
      confidence: parsed.governing_law.confidence,
      snippet: sanitizeSnippet(parsed.governing_law.snippet)
    },
    arbitrationPresent: {
      value: parsed.arbitration_present.value,
      confidence: parsed.arbitration_present.confidence,
      snippet: sanitizeSnippet(parsed.arbitration_present.snippet)
    },
    mentionsGdpr: {
      value: parsed.mentions_gdpr.value,
      confidence: parsed.mentions_gdpr.confidence,
      snippet: sanitizeSnippet(parsed.mentions_gdpr.snippet)
    },
    doNotSell: {
      value: parsed.do_not_sell.value,
      confidence: parsed.do_not_sell.confidence,
      snippet: sanitizeSnippet(parsed.do_not_sell.snippet)
    },
    dsarMechanism: {
      value: parsed.dsar_mechanism.value,
      confidence: parsed.dsar_mechanism.confidence,
      snippet: sanitizeSnippet(parsed.dsar_mechanism.snippet)
    },
    dataAccessRequestPresent: {
      value: parsed.data_access_request_present.value,
      confidence: parsed.data_access_request_present.confidence,
      snippet: sanitizeSnippet(parsed.data_access_request_present.snippet)
    },
    dataDeletionRequestPresent: {
      value: parsed.data_deletion_request_present.value,
      confidence: parsed.data_deletion_request_present.confidence,
      snippet: sanitizeSnippet(parsed.data_deletion_request_present.snippet)
    },
    privacyContactChannelType: {
      value: parsed.privacy_contact_channel_type.value,
      confidence: parsed.privacy_contact_channel_type.confidence,
      snippet: sanitizeSnippet(parsed.privacy_contact_channel_type.snippet)
    },
    retentionDisclosure: {
      value: parsed.retention_disclosure.value,
      confidence: parsed.retention_disclosure.confidence,
      snippet: sanitizeSnippet(parsed.retention_disclosure.snippet)
    },
    policyClaimNoSale: {
      value: parsed.policy_claim_no_sale.value,
      confidence: parsed.policy_claim_no_sale.confidence,
      snippet: sanitizeSnippet(parsed.policy_claim_no_sale.snippet)
    },
    policyClaimNoTracking: {
      value: parsed.policy_claim_no_tracking.value,
      confidence: parsed.policy_claim_no_tracking.confidence,
      snippet: sanitizeSnippet(parsed.policy_claim_no_tracking.snippet)
    },
    policyClaimPrivacyProtective: {
      value: parsed.policy_claim_privacy_protective.value,
      confidence: parsed.policy_claim_privacy_protective.confidence,
      snippet: sanitizeSnippet(parsed.policy_claim_privacy_protective.snippet)
    },
    dataCategories: parsed.data_categories.map((item) => ({
      value: item.category,
      confidence: item.confidence,
      snippet: sanitizeSnippet(item.snippet)
    })),
    retentionStatements: parsed.retention_statements.map((item) => ({
      category: item.category,
      periodText: item.period_text,
      confidence: item.confidence,
      snippet: sanitizeSnippet(item.snippet)
    })),
    transferMechanisms: parsed.transfer_mechanisms.map((item) => ({
      mechanism: item.mechanism,
      confidence: item.confidence,
      snippet: sanitizeSnippet(item.snippet)
    })),
    childrenReference: {
      value: parsed.children_reference.value,
      confidence: parsed.children_reference.confidence,
      snippet: sanitizeSnippet(parsed.children_reference.snippet)
    },
    summary: {
      text: parsed.summary.text ? clampSnippet(parsed.summary.text, 280) : null,
      confidence: parsed.summary.confidence
    }
  };

  return normalized;
}
