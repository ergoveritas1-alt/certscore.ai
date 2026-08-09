import { createHash } from "node:crypto";
import {
  policyModelReviewArtifactSchema,
  type PolicyModelReviewArtifact,
} from "@certscore/contracts";
import {
  POLICY_REVIEW_TOPICS,
  selectEscalatedPolicyReviewText,
  type PolicyReviewPacket,
  type PolicyReviewTopic,
} from "./model-policy-review";
import { routeNanoPolicyReview } from "./policy-review-routing";

const ESCALATION_TRANSPORT_VERSION = "policy_mini_escalation_transport.v1";
const EXTRACTION_REUSE_TRANSPORT_VERSION = "policy_extraction_reuse_transport.v2";

const EXTRACTION_REUSABLE_TOPICS = [
  "processing_purposes",
  "legal_basis",
  "data_retention",
  "vendor_disclosures",
  "data_subject_rights",
] as const satisfies readonly PolicyReviewTopic[];

const EXTRACTION_TOPIC_TO_COVERAGE_AREA = {
  processing_purposes: "processing_purposes",
  legal_basis: "legal_basis",
  data_retention: "data_retention",
  vendor_disclosures: "recipients_or_vendor_categories",
  data_subject_rights: "data_subject_rights",
} as const satisfies Record<(typeof EXTRACTION_REUSABLE_TOPICS)[number], string>;

const TOPIC_TO_RETAINED_COVERAGE_AREA = {
  processing_purposes: "processing_purposes",
  legal_basis: "legal_basis",
  data_retention: "data_retention",
  international_transfers: "international_transfers",
  vendor_disclosures: "recipients_or_vendor_categories",
  data_subject_rights: "data_subject_rights",
} as const satisfies Partial<Record<PolicyReviewTopic, string>>;

export type RetainedExtractionReuseDecision = {
  canReuseObserved: boolean;
  evidenceExcerpt: string | null;
  evidenceSource: string | null;
  reasonCodes: string[];
  sourceDocumentId: string | null;
  sourceUrl: string | null;
  topic: PolicyReviewTopic;
};

const BASE_CANDIDATE_KEYS = new Set([
  "canonical_url",
  "content_coverage",
  "document_evaluation_state",
  "document_fetch_state",
  "document_owner_entity",
  "document_type",
  "ownership_confidence",
  "ownership_reason_codes",
  "page_type",
  "page_url",
  "retained_policy_section_quality",
  "semantic_confidence",
  "target_relationship",
  "title",
]);

const TOPIC_CANDIDATE_KEYS = {
  processing_purposes: ["policy_mentions", "retained_article13_section_evidence"],
  legal_basis: ["policy_mentions", "retained_article13_section_evidence"],
  data_retention: ["policy_retention_periods", "retained_article13_section_evidence"],
  international_transfers: ["policy_transfer_mechanisms", "retained_article13_section_evidence"],
  vendor_disclosures: ["policy_mentions", "retained_article13_section_evidence"],
  data_subject_rights: [
    "policy_dsar_mechanism",
    "policy_rights_signals",
    "retained_article13_section_evidence",
  ],
  cookie_inventory: ["policy_cookie_disclosures"],
  policy_runtime_consistency: [
    "policy_cookie_disclosures",
    "policy_mentions",
    "policy_retention_periods",
    "policy_rights_signals",
    "policy_transfer_mechanisms",
    "retained_article13_section_evidence",
  ],
} as const satisfies Record<PolicyReviewTopic, readonly string[]>;

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizedText(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function normalizedUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString();
  } catch {
    return value.trim();
  }
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function collectBoundedStrings(value: unknown, output: string[], depth = 0) {
  if (output.length >= 48 || depth > 4) return;
  if (typeof value === "string") {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (normalized.length >= 8 && !output.includes(normalized)) {
      output.push(normalized.slice(0, 500));
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value.slice(0, 24)) {
      collectBoundedStrings(entry, output, depth + 1);
    }
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const entry of Object.values(value as Record<string, unknown>).slice(0, 24)) {
      collectBoundedStrings(entry, output, depth + 1);
    }
  }
}

function extractionEscalationPassages(
  packet: PolicyReviewPacket,
  topics: readonly PolicyReviewTopic[],
) {
  const passages: string[] = [];
  const collectCandidate = (candidate: Record<string, unknown>) => {
    for (const topic of topics) {
      for (const key of TOPIC_CANDIDATE_KEYS[topic]) {
        if (key !== "retained_article13_section_evidence") {
          collectBoundedStrings(candidate[key], passages);
          continue;
        }
        const coverageArea = TOPIC_TO_RETAINED_COVERAGE_AREA[
          topic as keyof typeof TOPIC_TO_RETAINED_COVERAGE_AREA
        ];
        const retainedEvidence = candidate[key];
        if (!coverageArea || !Array.isArray(retainedEvidence)) continue;
        for (const entry of retainedEvidence.slice(0, 24)) {
          const retained = record(entry);
          if (stringValue(retained.coverageArea) === coverageArea) {
            collectBoundedStrings(retained, passages);
          }
        }
      }
    }
  };
  packet.documents.forEach((document) => collectCandidate(document.extractedCandidates));
  packet.policyCandidates.forEach(collectCandidate);
  return passages.slice(0, 48);
}

/**
 * Reuses only typed, topic-specific retained evidence that is still provably
 * bound to the retained target-policy document. This is intentionally an
 * observed-only route: absence, transfer validity, cookie/runtime comparison,
 * missing provenance, and unmatched excerpts continue to Mini.
 */
export function routeRetainedExtractionPolicyReview(
  packet: PolicyReviewPacket,
): RetainedExtractionReuseDecision[] {
  const retainedCanonicalBundleVerified =
    packet.evidenceCoverage.policySurfaceInspection.retainedCanonicalBundleVerified === true;
  return POLICY_REVIEW_TOPICS.map((topic) => {
    if (!EXTRACTION_REUSABLE_TOPICS.includes(
      topic as (typeof EXTRACTION_REUSABLE_TOPICS)[number],
    )) {
      return {
        canReuseObserved: false,
        evidenceExcerpt: null,
        evidenceSource: null,
        reasonCodes: ["topic_requires_mini_interpretation"],
        sourceDocumentId: null,
        sourceUrl: null,
        topic,
      };
    }
    const coverageArea = EXTRACTION_TOPIC_TO_COVERAGE_AREA[
      topic as (typeof EXTRACTION_REUSABLE_TOPICS)[number]
    ];
    for (const document of packet.documents) {
      if (
        !["target_controller", "first_party_brand"].includes(document.targetRelationship) ||
        document.documentEvaluationState !== "usable" ||
        document.documentFetchState !== "fetched" ||
        (document.ownershipConfidence ?? 0) < 0.8
      ) continue;
      const evidence = document.extractedCandidates.retained_article13_section_evidence;
      if (!Array.isArray(evidence)) continue;
      for (const rawEntry of evidence) {
        const entry = record(rawEntry);
        const excerpt = stringValue(entry.selectedPolicySectionExcerpt);
        const sourceUrl = stringValue(entry.selectedPolicySectionUrl);
        const evidenceSource = stringValue(entry.evidenceSource);
        if (
          stringValue(entry.coverageArea) !== coverageArea ||
          stringValue(entry.selectedEvidenceStrength) !== "strong" ||
          stringValue(entry.signalObserved) !== "observed" ||
          stringValue(entry.extractionLimitation) ||
          !excerpt ||
          !sourceUrl ||
          !["deterministic", "nano", "deterministic_plus_nano"].includes(evidenceSource ?? "") ||
          normalizedUrl(sourceUrl) !== normalizedUrl(document.canonicalUrl) ||
          (
            !retainedCanonicalBundleVerified &&
            !normalizedText(document.text).includes(normalizedText(excerpt))
          )
        ) continue;
        return {
          canReuseObserved: true,
          evidenceExcerpt: excerpt.slice(0, 360),
          evidenceSource,
          reasonCodes: [
            "retained_topic_evidence_verified",
            "retained_excerpt_bound_to_target_policy",
            "extraction_reuse_shadow_only",
          ],
          sourceDocumentId: document.documentId,
          sourceUrl: document.canonicalUrl,
          topic,
        };
      }
    }
    return {
      canReuseObserved: false,
      evidenceExcerpt: null,
      evidenceSource: null,
      reasonCodes: ["no_verified_retained_topic_evidence"],
      sourceDocumentId: null,
      sourceUrl: null,
      topic,
    };
  });
}

function compactCandidates(
  candidates: Array<Record<string, unknown>>,
  topics: readonly PolicyReviewTopic[],
) {
  const allowed = new Set(BASE_CANDIDATE_KEYS);
  for (const topic of topics) {
    for (const key of TOPIC_CANDIDATE_KEYS[topic]) allowed.add(key);
  }
  return candidates.map((candidate) => Object.fromEntries(
    Object.entries(candidate).filter(([key]) => allowed.has(key)),
  ));
}

export function buildBoundedMiniTopicTransport(input: {
  documentTextLimit?: number;
  expandRuntimeConsistencyAnchors?: boolean;
  packet: PolicyReviewPacket;
  passageExcerpts?: readonly string[];
  preambleChars?: number;
  topics: readonly PolicyReviewTopic[];
  transportVersion: string;
}) {
  const passageExcerpts = [...new Set(input.passageExcerpts ?? [])].slice(0, 48);
  const documents = input.packet.documents.map((document) => ({
    ...document,
    extractedCandidates: {},
    text: selectEscalatedPolicyReviewText({
      expandRuntimeConsistencyAnchors: input.expandRuntimeConsistencyAnchors,
      nanoExcerpts: passageExcerpts,
      preambleChars: input.preambleChars,
      rawText: document.text,
      topics: input.topics,
    }, input.documentTextLimit),
  }));
  const runtimeRequired = input.topics.some((topic) =>
    topic === "cookie_inventory" || topic === "policy_runtime_consistency"
  );
  const transportProjection = {
    transportVersion: input.transportVersion,
    originalContentHash: input.packet.contentHash,
    topics: input.topics,
    documents: documents.map((document) => ({
      documentId: document.documentId,
      text: document.text,
    })),
    passageExcerpts,
    runtimeRequired,
  };
  const packet: PolicyReviewPacket = {
    ...input.packet,
    contentHash: sha256(JSON.stringify(transportProjection)),
    documents,
    policyCandidates: compactCandidates(input.packet.policyCandidates, input.topics),
    runtimeContext: runtimeRequired ? input.packet.runtimeContext : {},
  };
  const fullTextCharacters = input.packet.documents.reduce(
    (sum, document) => sum + document.text.length,
    0,
  );
  const transportedTextCharacters = documents.reduce(
    (sum, document) => sum + document.text.length,
    0,
  );
  return {
    metrics: {
      contractVersion: input.transportVersion,
      fullTextCharacters,
      reductionRate: fullTextCharacters > 0
        ? 1 - transportedTextCharacters / fullTextCharacters
        : 0,
      transportedTextCharacters,
    },
    packet,
  };
}

export function buildMiniEscalationTransport(input: {
  nanoArtifact: PolicyModelReviewArtifact;
  packet: PolicyReviewPacket;
}) {
  const routingDecisions = routeNanoPolicyReview(input.nanoArtifact);
  const topics = routingDecisions
    .filter((decision) => decision.requiresMiniEscalation)
    .map((decision) => decision.topic);
  const escalatedRows = input.nanoArtifact.rows.filter((row) => topics.includes(row.topic));
  const nanoExcerpts = escalatedRows.flatMap((row) => [
    ...row.evidenceExcerpts,
    ...row.conflictingExcerpts,
  ]);
  const bounded = buildBoundedMiniTopicTransport({
    packet: input.packet,
    passageExcerpts: nanoExcerpts,
    topics,
    transportVersion: ESCALATION_TRANSPORT_VERSION,
  });
  return {
    metrics: bounded.metrics,
    packet: bounded.packet,
    routingDecisions,
    topics,
  };
}

export function buildMiniExtractionReuseTransport(packet: PolicyReviewPacket) {
  const reuseDecisions = routeRetainedExtractionPolicyReview(packet);
  const topics = reuseDecisions
    .filter((decision) => !decision.canReuseObserved)
    .map((decision) => decision.topic);
  const passageExcerpts = extractionEscalationPassages(packet, topics);
  const bounded = buildBoundedMiniTopicTransport({
    documentTextLimit: 3_600,
    expandRuntimeConsistencyAnchors: false,
    packet,
    passageExcerpts,
    preambleChars: 360,
    topics,
    transportVersion: EXTRACTION_REUSE_TRANSPORT_VERSION,
  });
  return {
    metrics: {
      ...bounded.metrics,
      retainedPassageCount: passageExcerpts.length,
    },
    packet: bounded.packet,
    reuseDecisions,
    topics,
  };
}

export function composeExtractionReuseShadowArtifact(input: {
  canonicalFallback?: boolean;
  miniArtifact: PolicyModelReviewArtifact;
  packet: PolicyReviewPacket;
  reuseDecisions: readonly RetainedExtractionReuseDecision[];
  topics: readonly PolicyReviewTopic[];
}) {
  const miniByTopic = new Map(input.miniArtifact.rows.map((row) => [row.topic, row]));
  const reuseByTopic = new Map(input.reuseDecisions.map((decision) => [
    decision.topic,
    decision,
  ]));
  const rows = POLICY_REVIEW_TOPICS.flatMap((topic) => {
    const reuse = reuseByTopic.get(topic);
    if (reuse?.canReuseObserved) {
      return [{
        topic,
        status: "observed" as const,
        confidence: 1,
        sourceDocumentIds: reuse.sourceDocumentId ? [reuse.sourceDocumentId] : [],
        sourceUrls: reuse.sourceUrl ? [reuse.sourceUrl] : [],
        evidenceExcerpts: reuse.evidenceExcerpt ? [reuse.evidenceExcerpt] : [],
        conflictingExcerpts: [],
        reasonCodes: reuse.reasonCodes,
        rationale: "Reused verified topic-specific evidence bound to the retained target policy; no new extraction call was made.",
      }];
    }
    const miniRow = miniByTopic.get(topic);
    return miniRow ? [miniRow] : [];
  });
  const completed = input.miniArtifact.status === "completed" &&
    input.topics.every((topic) => miniByTopic.has(topic)) &&
    rows.length === POLICY_REVIEW_TOPICS.length;
  return policyModelReviewArtifactSchema.parse({
    contractVersion: input.miniArtifact.contractVersion,
    mode: "shadow",
    status: completed ? "completed" : "failed",
    scanId: input.packet.scanId,
    cacheKey: sha256(`${input.packet.contentHash}:${input.miniArtifact.cacheKey}:extraction-reuse`),
    rows: completed ? rows : [],
    deterministicLegalFrameworkSignals: input.miniArtifact.deterministicLegalFrameworkSignals,
    deterministicPolicyReviewSignals: input.miniArtifact.deterministicPolicyReviewSignals,
    failureReason: completed
      ? null
      : input.miniArtifact.failureReason ?? "Extraction-reuse review was incomplete.",
    provenance: {
      ...input.miniArtifact.provenance,
      requestedModel: input.canonicalFallback
        ? "gpt-5.4-mini:canonical-fallback"
        : "hybrid:retained-extraction+gpt-5.4-mini",
      resolvedModel: input.canonicalFallback
        ? "gpt-5.4-mini:canonical-fallback"
        : "hybrid:retained-extraction+gpt-5.4-mini",
      taskType: "policy_semantic_extraction_reuse_shadow_review",
      contentHash: input.packet.contentHash,
      inputRefs: input.packet.documents.map((document) => document.documentId),
      outputRefs: rows.flatMap((row) => row.sourceDocumentIds).slice(0, 100),
      reasonCodes: [
        ...(input.canonicalFallback
          ? ["canonical_mini_fallback_no_additional_model_call"]
          : [
              "verified_retained_extraction_reuse",
              "mini_bounded_escalation_review",
            ]),
        "extraction_reuse_shadow_non_projectable",
      ],
      usedForProductionProjection: false,
    },
    productionEligible: false,
  });
}

export function composeHybridPolicyReviewArtifact(input: {
  miniArtifact: PolicyModelReviewArtifact;
  nanoArtifact: PolicyModelReviewArtifact;
  packet: PolicyReviewPacket;
  topics: readonly PolicyReviewTopic[];
}) {
  const miniByTopic = new Map(input.miniArtifact.rows.map((row) => [row.topic, row]));
  const nanoByTopic = new Map(input.nanoArtifact.rows.map((row) => [row.topic, row]));
  const rows = POLICY_REVIEW_TOPICS.flatMap((topic) => {
    const nanoRow = nanoByTopic.get(topic);
    const miniRow = miniByTopic.get(topic);
    // Mini is authoritative whenever routing escalates a topic. Its row has
    // already been checked against the complete retained packet by the
    // deterministic invariants, so Nano disagreement must not suppress
    // evidence Mini recovered from the bounded topic review.
    const row = input.topics.includes(topic) ? miniRow : nanoRow;
    return row ? [row] : [];
  });
  const completed =
    input.nanoArtifact.status === "completed" &&
    input.miniArtifact.status === "completed" &&
    rows.length === POLICY_REVIEW_TOPICS.length;
  return policyModelReviewArtifactSchema.parse({
    contractVersion: input.nanoArtifact.contractVersion,
    mode: "shadow",
    status: completed ? "completed" : "failed",
    scanId: input.packet.scanId,
    cacheKey: sha256(`${input.nanoArtifact.cacheKey}:${input.miniArtifact.cacheKey}`),
    rows: completed ? rows : [],
    deterministicLegalFrameworkSignals: input.miniArtifact.deterministicLegalFrameworkSignals,
    deterministicPolicyReviewSignals: input.miniArtifact.deterministicPolicyReviewSignals,
    failureReason: completed
      ? null
      : input.miniArtifact.failureReason ?? input.nanoArtifact.failureReason ?? "Hybrid review was incomplete.",
    provenance: {
      ...input.miniArtifact.provenance,
      requestedModel: "hybrid:gpt-5.4-nano+gpt-5.4-mini",
      resolvedModel: "hybrid:gpt-5.4-nano+gpt-5.4-mini",
      taskType: "policy_semantic_hybrid_shadow_review",
      contentHash: input.packet.contentHash,
      inputRefs: input.packet.documents.map((document) => document.documentId),
      outputRefs: rows.flatMap((row) => row.sourceDocumentIds).slice(0, 100),
      reasonCodes: [
        "nano_observed_only_bypass",
        "mini_bounded_escalation_review",
        "hybrid_shadow_non_projectable",
      ],
      usedForProductionProjection: false,
    },
    productionEligible: false,
  });
}
