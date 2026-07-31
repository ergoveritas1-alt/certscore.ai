import { createHash } from "node:crypto";
import {
  POLICY_REVIEW_TOPIC_DEFINITIONS,
  policyReviewStatusSchema,
  type PolicyReviewStatus,
  type PolicyReviewTopic
} from "@certscore/contracts";
import { z } from "zod";
import type { PolicyReviewPacket } from "./model-policy-review";
import {
  POLICY_REVIEW_EVALUATION_TOPICS,
  type PolicyReviewGoldLabels
} from "./model-review-evaluation";
import type { PolicyReviewGoldCorpus } from "./model-review-gold-corpus";

export const POLICY_REVIEW_INDEPENDENCE_ATTESTATION =
  "I reviewed only the retained evidence in this packet and did not consult model outputs or provisional labels.";

export const POLICY_REVIEW_TOPIC_GUIDANCE: Record<
  PolicyReviewTopic,
  { displayLabel: string; question: string; observedStandard: string }
> = {
  processing_purposes: {
    displayLabel: POLICY_REVIEW_TOPIC_DEFINITIONS.processing_purposes.displayLabel,
    question: "Does the retained policy evidence substantively explain why personal data is processed?",
    observedStandard:
      "Require purpose-specific processing language. Retention, security, or generic privacy language alone is not enough."
  },
  legal_basis: {
    displayLabel: POLICY_REVIEW_TOPIC_DEFINITIONS.legal_basis.displayLabel,
    question: "Does the retained policy evidence identify substantive legal bases for processing?",
    observedStandard:
      "Require an explicit legal-basis disclosure tied to processing, such as consent, contract, legal obligation, vital interests, public task, or legitimate interests."
  },
  data_retention: {
    displayLabel: POLICY_REVIEW_TOPIC_DEFINITIONS.data_retention.displayLabel,
    question: "Does the retained policy evidence explain retention periods or substantive retention criteria?",
    observedStandard:
      "Require a period or meaningful criteria. Generic statements such as keeping data only as long as necessary are ambiguous unless the surrounding text adds substance."
  },
  international_transfers: {
    displayLabel: POLICY_REVIEW_TOPIC_DEFINITIONS.international_transfers.displayLabel,
    question: "Does the retained policy evidence substantively explain international data transfers?",
    observedStandard:
      "Require destinations, transfer circumstances, or mechanisms. Framework validity is assessed separately and must not make this disclosure-presence row conflicting by itself."
  },
  vendor_disclosures: {
    displayLabel: POLICY_REVIEW_TOPIC_DEFINITIONS.vendor_disclosures.displayLabel,
    question: "Does the retained policy evidence identify processors, vendors, recipients, or recipient categories?",
    observedStandard:
      "Require named recipients/vendors or meaningful recipient categories. A generic statement that data may be shared is not enough."
  },
  data_subject_rights: {
    displayLabel: POLICY_REVIEW_TOPIC_DEFINITIONS.data_subject_rights.displayLabel,
    question: "Does the retained policy evidence substantively disclose applicable data-subject rights?",
    observedStandard:
      "Require rights such as access, correction, deletion, restriction, portability, objection, or complaint. Cookie preferences alone do not establish general rights coverage."
  },
  cookie_inventory: {
    displayLabel: POLICY_REVIEW_TOPIC_DEFINITIONS.cookie_inventory.displayLabel,
    question: "Did the scan retain one or more identifiable cookie or storage names from runtime or policy evidence?",
    observedStandard:
      "At least one specific, non-placeholder cookie or storage identifier retained from runtime or policy evidence is sufficient. This topic measures identifier presence, not policy inventory completeness."
  },
  policy_runtime_consistency: {
    displayLabel: POLICY_REVIEW_TOPIC_DEFINITIONS.policy_runtime_consistency.displayLabel,
    question: "Does a directly comparable retained runtime fact materially contradict a specific retained policy promise?",
    observedStandard:
      "Observed means no material mismatch was retained after comparing a specific promise with a directly comparable runtime fact. Conflicting means a material contradiction was retained. Mutual silence is not alignment; use insufficient retained evidence when the comparison cannot be made reliably."
  }
};

const packetDocumentSchema = z.object({
  canonicalUrl: z.string().url().max(2_000),
  contentCoverage: z.object({
    status: z.enum(["complete", "partial", "truncated", "malformed", "unknown"]),
    sourceTextChars: z.number().int().nonnegative().nullable(),
    extractedSectionCount: z.number().int().nonnegative().nullable(),
    retainedSectionCount: z.number().int().nonnegative().nullable(),
    retainedStrongSectionCount: z.number().int().nonnegative().nullable(),
    retainedTableRowCount: z.number().int().nonnegative().nullable(),
    limitationKeys: z.array(z.string().max(120)).max(16),
    packetTextTruncated: z.boolean()
  }).strict(),
  documentEvaluationState: z.enum(["not_attempted", "usable", "insufficient", "blocked", "unknown"]),
  documentFetchState: z.enum(["not_attempted", "fetched", "failed", "skipped_budget", "unknown"]),
  documentId: z.string().min(1).max(120),
  documentOwnerEntity: z.string().max(240).nullable(),
  documentType: z.string().min(1).max(120),
  ownershipConfidence: z.number().min(0).max(1).nullable(),
  ownershipReasonCodes: z.array(z.string().max(120)).max(12),
  targetRelationship: z.enum([
    "target_controller",
    "first_party_brand",
    "service_provider",
    "unrelated",
    "unknown"
  ]),
  text: z.string().min(1).max(18_000)
}).strict();

export const independentPolicyReviewPacketSchema = z.object({
  contractVersion: z.literal("policy_review_independent_packet.v2"),
  caseId: z.string().min(1).max(120),
  scanId: z.string().min(1).max(120),
  targetUrl: z.string().url().max(2_000),
  scanDate: z.string().datetime().nullable(),
  evidenceHash: z.string().regex(/^[a-f0-9]{64}$/),
  generatedAt: z.string().datetime(),
  productionEligible: z.literal(false),
  instructions: z.object({
    independenceAttestation: z.literal(POLICY_REVIEW_INDEPENDENCE_ATTESTATION),
    allowedStatuses: z.array(policyReviewStatusSchema).length(5),
    topics: z.record(z.object({
      displayLabel: z.string().min(1),
      question: z.string().min(1),
      observedStandard: z.string().min(1)
    }).strict())
  }).strict(),
  evidence: z.object({
    documents: z.array(packetDocumentSchema).min(1).max(6),
    evidenceCoverage: z.object({
      coverageLimitations: z.array(z.record(z.unknown())).max(20),
      policySurfaceInspection: z.record(z.unknown()),
      runtimeCoverage: z.record(z.unknown())
    }).strict(),
    scanContext: z.object({
      region: z.string().nullable(),
      targetUrl: z.string().url().nullable()
    }).strict(),
    runtimeContext: z.record(z.unknown())
  }).strict()
}).strict();

const independentTopicDecisionSchema = z.object({
  status: policyReviewStatusSchema,
  rationale: z.string().min(10).max(1_000),
  evidenceRefs: z.array(z.string().min(1).max(120)).min(1).max(12)
}).strict();

const independentTopicDecisionsSchema = z.object({
  processing_purposes: independentTopicDecisionSchema,
  legal_basis: independentTopicDecisionSchema,
  data_retention: independentTopicDecisionSchema,
  international_transfers: independentTopicDecisionSchema,
  vendor_disclosures: independentTopicDecisionSchema,
  data_subject_rights: independentTopicDecisionSchema,
  cookie_inventory: independentTopicDecisionSchema,
  policy_runtime_consistency: independentTopicDecisionSchema
}).strict();

export const independentPolicyReviewResponseSchema = z.object({
  contractVersion: z.literal("policy_review_independent_response.v1"),
  caseId: z.string().min(1).max(120),
  scanId: z.string().min(1).max(120),
  targetUrl: z.string().url().max(2_000),
  evidenceHash: z.string().regex(/^[a-f0-9]{64}$/),
  reviewer: z.object({
    reviewerId: z.string().min(2).max(120),
    reviewedAt: z.string().datetime(),
    reviewMethod: z.literal("human_evidence_only"),
    modelOutputsConsulted: z.literal(false),
    provisionalLabelsConsulted: z.literal(false),
    independenceAttestation: z.literal(POLICY_REVIEW_INDEPENDENCE_ATTESTATION)
  }).strict(),
  decisions: independentTopicDecisionsSchema
}).strict().superRefine((response, context) => {
  if (/(?:gpt|mini|nano|openai|model|assisted|automation)/i.test(response.reviewer.reviewerId)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Reviewer identity must identify an independent human reviewer.",
      path: ["reviewer", "reviewerId"]
    });
  }
});

export type IndependentPolicyReviewPacket = z.infer<
  typeof independentPolicyReviewPacketSchema
>;
export type IndependentPolicyReviewResponse = z.infer<
  typeof independentPolicyReviewResponseSchema
>;

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function evidenceHash(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

export function buildIndependentPolicyReviewPacket(input: {
  caseId: string;
  modelPacket: PolicyReviewPacket;
  targetUrl: string;
  generatedAt?: string;
}): IndependentPolicyReviewPacket {
  const evidence = {
    documents: input.modelPacket.documents.map((document) => ({
      canonicalUrl: document.canonicalUrl,
      contentCoverage: document.contentCoverage,
      documentEvaluationState: document.documentEvaluationState,
      documentFetchState: document.documentFetchState,
      documentId: document.documentId,
      documentOwnerEntity: document.documentOwnerEntity,
      documentType: document.documentType,
      ownershipConfidence: document.ownershipConfidence,
      ownershipReasonCodes: document.ownershipReasonCodes,
      targetRelationship: document.targetRelationship,
      text: document.text
    })),
    evidenceCoverage: input.modelPacket.evidenceCoverage,
    scanContext: input.modelPacket.scanContext,
    runtimeContext: input.modelPacket.runtimeContext
  };
  return independentPolicyReviewPacketSchema.parse({
    contractVersion: "policy_review_independent_packet.v2",
    caseId: input.caseId,
    scanId: input.modelPacket.scanId,
    targetUrl: input.targetUrl,
    scanDate: input.modelPacket.scanDate,
    evidenceHash: evidenceHash(evidence),
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    productionEligible: false,
    instructions: {
      independenceAttestation: POLICY_REVIEW_INDEPENDENCE_ATTESTATION,
      allowedStatuses: [
        "observed",
        "not_observed_with_sufficient_coverage",
        "ambiguous",
        "conflicting",
        "insufficient_retained_evidence"
      ],
      topics: POLICY_REVIEW_TOPIC_GUIDANCE
    },
    evidence
  });
}

export function buildIndependentPolicyReviewResponseTemplate(
  packet: IndependentPolicyReviewPacket
) {
  return {
    contractVersion: "policy_review_independent_response.v1" as const,
    caseId: packet.caseId,
    scanId: packet.scanId,
    targetUrl: packet.targetUrl,
    evidenceHash: packet.evidenceHash,
    reviewer: {
      reviewerId: "REPLACE_WITH_HUMAN_REVIEWER_ID",
      reviewedAt: "REPLACE_WITH_ISO_8601_TIMESTAMP",
      reviewMethod: "human_evidence_only" as const,
      modelOutputsConsulted: false as const,
      provisionalLabelsConsulted: false as const,
      independenceAttestation: POLICY_REVIEW_INDEPENDENCE_ATTESTATION
    },
    decisions: Object.fromEntries(
      POLICY_REVIEW_EVALUATION_TOPICS.map((topic) => [
        topic,
        {
          status: "REPLACE_WITH_ALLOWED_STATUS",
          rationale: "Explain the evidence-scoped basis for this label.",
          evidenceRefs: ["REPLACE_WITH_DOCUMENT_ID_OR_runtime_context"]
        }
      ])
    )
  };
}

function responseLabels(response: IndependentPolicyReviewResponse): PolicyReviewGoldLabels {
  return Object.fromEntries(
    POLICY_REVIEW_EVALUATION_TOPICS.map((topic) => [
      topic,
      response.decisions[topic].status
    ])
  ) as Record<PolicyReviewTopic, PolicyReviewStatus>;
}

function responseEvidenceNotes(response: IndependentPolicyReviewResponse) {
  return POLICY_REVIEW_EVALUATION_TOPICS.map((topic) => {
    const decision = response.decisions[topic];
    return `${topic}: ${decision.rationale} Evidence: ${decision.evidenceRefs.join(", ")}.`;
  });
}

export function mergeIndependentPolicyReviewResponses(input: {
  corpus: PolicyReviewGoldCorpus;
  packets: IndependentPolicyReviewPacket[];
  responses: IndependentPolicyReviewResponse[];
}): PolicyReviewGoldCorpus {
  const packetsByCaseId = new Map(input.packets.map((packet) => [packet.caseId, packet]));
  const responseCaseIds = new Set<string>();
  const responsesByCaseId = new Map<string, IndependentPolicyReviewResponse>();
  for (const rawResponse of input.responses) {
    const response = independentPolicyReviewResponseSchema.parse(rawResponse);
    if (responseCaseIds.has(response.caseId)) {
      throw new Error(`Duplicate independent response for ${response.caseId}.`);
    }
    responseCaseIds.add(response.caseId);
    responsesByCaseId.set(response.caseId, response);
  }

  const entries = input.corpus.entries.map((entry) => {
    const response = responsesByCaseId.get(entry.caseId);
    if (!response) {
      return entry;
    }
    const packet = packetsByCaseId.get(entry.caseId);
    if (!packet) {
      throw new Error(`Missing reviewer packet for ${entry.caseId}.`);
    }
    independentPolicyReviewPacketSchema.parse(packet);
    if (
      response.scanId !== entry.scanId ||
      response.scanId !== packet.scanId ||
      response.targetUrl !== entry.targetUrl ||
      response.targetUrl !== packet.targetUrl ||
      response.evidenceHash !== packet.evidenceHash
    ) {
      throw new Error(`Independent response does not match retained evidence for ${entry.caseId}.`);
    }
    const validEvidenceRefs = new Set([
      "runtime_context",
      ...packet.evidence.documents.map((document) => document.documentId)
    ]);
    for (const topic of POLICY_REVIEW_EVALUATION_TOPICS) {
      for (const evidenceRef of response.decisions[topic].evidenceRefs) {
        if (!validEvidenceRefs.has(evidenceRef)) {
          throw new Error(
            `Unknown evidence ref ${evidenceRef} for ${entry.caseId}/${topic}.`
          );
        }
      }
    }
    return {
      ...entry,
      reviewStatus: "independently_reviewed" as const,
      reviewer: response.reviewer.reviewerId,
      reviewedAt: response.reviewer.reviewedAt,
      evidenceNotes: responseEvidenceNotes(response),
      expected: responseLabels(response),
      baseline:
        entry.reviewStatus === "provisional" && !entry.baseline
          ? entry.expected
          : entry.baseline
    };
  });

  for (const caseId of responseCaseIds) {
    if (!input.corpus.entries.some((entry) => entry.caseId === caseId)) {
      throw new Error(`Independent response references unknown corpus case ${caseId}.`);
    }
  }

  return {
    ...input.corpus,
    entries
  };
}
