import { createHash } from "node:crypto";
import {
  POLICY_REVIEW_TOPIC_DEFINITIONS,
  LEGAL_FRAMEWORK_VALIDITY_REGISTRY,
  classifyGdprTransparencyTopics,
  evaluateLegalFrameworkValidity,
  policyModelReviewArtifactSchema,
  policyModelReviewRowSchema,
  type CanonicalEvidenceBundle,
  type PolicyModelReviewArtifact,
  type PolicyModelReviewRow,
  type VerifiedPolicyEvidencePacket
} from "@certscore/contracts";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_RESPONSES_API_URL = "https://api.openai.com/v1/responses";
export const POLICY_MODEL_REVIEW_CONTRACT_VERSION = "policy_model_review.v2" as const;
export const POLICY_MODEL_REVIEW_PROMPT_VERSION = "policy_semantic_review.v5";
const POLICY_REVIEW_SCHEMA_VERSION = "policy_semantic_review_output.v2";
const POLICY_REVIEW_INVARIANT_VERSION = "policy_review_invariants.v10";
const MAX_DOCUMENTS = 6;
const MAX_DOCUMENT_TEXT_CHARS = 18_000;
const MAX_PACKET_TEXT_CHARS = 54_000;
export const POLICY_REVIEW_TOPICS = [
  "processing_purposes",
  "legal_basis",
  "data_retention",
  "international_transfers",
  "vendor_disclosures",
  "data_subject_rights",
  "cookie_inventory",
  "policy_runtime_consistency"
] as const;
export const STATIC_POLICY_REVIEW_TOPICS = [
  "processing_purposes",
  "legal_basis",
  "data_retention",
  "international_transfers",
  "vendor_disclosures",
  "data_subject_rights",
] as const;
export const RUNTIME_POLICY_REVIEW_TOPICS = [
  "cookie_inventory",
  "policy_runtime_consistency",
] as const;
export type PolicyReviewTopic = (typeof POLICY_REVIEW_TOPICS)[number];

const POLICY_REVIEW_TEXT_ANCHORS_BY_TOPIC = {
  processing_purposes: [
    /\b(?:how we use|purposes? for which|processing purposes?)\b/i,
  ],
  legal_basis: [
    /\b(?:legal basis|lawful basis|article 6|legitimate interests?)\b/i,
  ],
  data_retention: [
    /\b(?:retention|how long we retain|as long as necessary|retention criteria)\b/i,
  ],
  international_transfers: [
    /\b(?:international transfers?|cross-border transfers?|data transfers?)\b/i,
    /\b(?:personal data|personal information|information|data)\b.{0,100}\b(?:transferred|processed|stored|accessed)\b.{0,140}\b(?:united states|other jurisdictions|other countries|outside)\b/i,
  ],
  vendor_disclosures: [
    /\b(?:sharing personal information|how we share|categories of third parties|service providers|advertising networks|analytics providers)\b/i,
  ],
  data_subject_rights: [
    /\b(?:your privacy rights|your rights|california privacy rights|other state privacy rights)\b/i,
    /\b(?:contact us|privacy officer|privacy office|data protection officer|controller)\b/i,
    /\b(?:supervisory authority|data protection authority|lodge a complaint)\b/i,
  ],
  cookie_inventory: [
    /\b(?:cookie inventory|cookies? and other technologies|cookie names?)\b/i,
  ],
  policy_runtime_consistency: [],
} as const satisfies Record<PolicyReviewTopic, readonly RegExp[]>;

const POLICY_REVIEW_TEXT_ANCHORS = Object.values(
  POLICY_REVIEW_TEXT_ANCHORS_BY_TOPIC,
).flat();

type FetchLike = typeof fetch;

export type PolicyReviewPacketDocument = {
  canonicalUrl: string;
  contentCoverage: {
    status: "complete" | "partial" | "truncated" | "malformed" | "unknown";
    sourceTextChars: number | null;
    extractedSectionCount: number | null;
    retainedSectionCount: number | null;
    retainedStrongSectionCount: number | null;
    retainedTableRowCount: number | null;
    limitationKeys: string[];
    packetTextTruncated: boolean;
  };
  documentEvaluationState: "not_attempted" | "usable" | "insufficient" | "blocked" | "unknown";
  documentFetchState: "not_attempted" | "fetched" | "failed" | "skipped_budget" | "unknown";
  documentId: string;
  documentOwnerEntity: string | null;
  documentType: string;
  extractedCandidates: Record<string, unknown>;
  ownershipConfidence: number | null;
  ownershipReasonCodes: string[];
  targetRelationship: "target_controller" | "first_party_brand" | "service_provider" | "unrelated" | "unknown";
  text: string;
};

export type PolicyReviewPacket = {
  contentHash: string;
  documents: PolicyReviewPacketDocument[];
  evidenceCoverage: {
    coverageLimitations: Array<Record<string, unknown>>;
    policySurfaceInspection: Record<string, unknown>;
    runtimeCoverage: Record<string, unknown>;
  };
  policyCandidates: Array<Record<string, unknown>>;
  runtimeContext: Record<string, unknown>;
  scanContext: {
    region: string | null;
    targetUrl: string | null;
  };
  scanDate: string | null;
  scanId: string;
};

type ReviewUsage = {
  cachedPromptTokens: number | null;
  completionTokens: number | null;
  promptTokens: number | null;
  totalTokens: number | null;
};

const policyReviewRowOutputSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "status",
    "confidence",
    "sourceDocumentIds",
    "sourceUrls",
    "evidenceExcerpts",
    "conflictingExcerpts",
    "reasonCodes",
    "rationale"
  ],
  properties: {
    status: {
      type: "string",
      enum: [
        "observed",
        "not_observed_with_sufficient_coverage",
        "ambiguous",
        "conflicting",
        "insufficient_retained_evidence"
      ]
    },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    sourceDocumentIds: {
      type: "array",
      maxItems: 4,
      items: { type: "string", maxLength: 120 }
    },
    sourceUrls: {
      type: "array",
      maxItems: 4,
      items: { type: "string", maxLength: 2000 }
    },
    evidenceExcerpts: {
      type: "array",
      maxItems: 2,
      items: { type: "string", maxLength: 360 }
    },
    conflictingExcerpts: {
      type: "array",
      maxItems: 1,
      items: { type: "string", maxLength: 360 }
    },
    reasonCodes: {
      type: "array",
      maxItems: 12,
      items: { type: "string", maxLength: 120 }
    },
    rationale: { type: "string", maxLength: 320 }
  }
} as const;

function policyReviewJsonSchemaFor(topics: readonly PolicyReviewTopic[]) {
  return {
  type: "object",
  additionalProperties: false,
  required: ["rows"],
  properties: {
    rows: {
      type: "object",
      additionalProperties: false,
      required: [...topics],
      properties: Object.fromEntries(
        topics.map((topic) => [topic, policyReviewRowOutputSchema])
      )
    }
  }
  } as const;
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getStringArray(value: unknown, max = 16) {
  return Array.isArray(value)
    ? value.flatMap((entry) => {
      const normalized = getString(entry);
      return normalized ? [normalized] : [];
    }).slice(0, max)
    : [];
}

function sameCanonicalHostname(left: string | null | undefined, right: string | null | undefined) {
  if (!left || !right) {
    return false;
  }
  try {
    const normalize = (value: string) =>
      new URL(value).hostname.toLowerCase().replace(/^www\./, "");
    return normalize(left) === normalize(right);
  } catch {
    return false;
  }
}

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

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function boundContextValue(value: unknown, depth = 0): unknown {
  if (typeof value === "string") {
    return value.slice(0, 500);
  }
  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return value;
  }
  if (depth >= 3) {
    return "[bounded]";
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((entry) => boundContextValue(entry, depth + 1));
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 30)
        .map(([key, entry]) => [key.slice(0, 120), boundContextValue(entry, depth + 1)])
    );
  }
  return null;
}

function compactRuntimeContext(value: Record<string, unknown> | null | undefined) {
  if (!value) {
    return {};
  }
  const allowedKeys = [
    "cmp",
    "cmpRuntime",
    "consent",
    "consentUi",
    "cookies",
    "localStorageKeys",
    "preconsent",
    "sessionReplay",
    "sessionStorageKeys",
    "storageKeys",
    "trackerVendors",
    "vendors"
  ];
  return Object.fromEntries(
    allowedKeys.flatMap((key) => (key in value ? [[key, boundContextValue(value[key])]] : []))
  );
}

function compactPolicyCandidate(row: Record<string, unknown>) {
  const allowedKeys = [
    "canonical_url",
    "document_type",
    "extraction_status",
    "page_type",
    "page_url",
    "policy_cookie_disclosures",
    "policy_coverage_ratio",
    "policy_dsar_mechanism",
    "policy_mentions",
    "policy_retention_periods",
    "policy_rights_signals",
    "policy_structurally_weak",
    "policy_summary_short",
    "policy_transfer_mechanisms",
    "content_coverage",
    "document_evaluation_state",
    "document_fetch_state",
    "document_owner_entity",
    "ownership_confidence",
    "ownership_reason_codes",
    "retained_article13_section_evidence",
    "retained_policy_section_quality",
    "semantic_confidence",
    "target_relationship",
    "title"
  ];
  return Object.fromEntries(
    allowedKeys.flatMap((key) => (key in row ? [[key, boundContextValue(row[key])]] : []))
  );
}

export function selectBoundedPolicyReviewText(rawText: string, limit = MAX_DOCUMENT_TEXT_CHARS) {
  if (rawText.length <= limit) {
    return rawText;
  }

  const excerpts: string[] = [];
  let retainedChars = 0;
  const addExcerpt = (start: number, end: number) => {
    if (retainedChars >= limit) {
      return;
    }
    const excerpt = rawText
      .slice(Math.max(0, start), Math.min(rawText.length, end))
      .trim();
    if (!excerpt || excerpts.some((retained) => retained.includes(excerpt))) {
      return;
    }
    const separator = excerpts.length > 0 ? "\n\n[…]\n\n" : "";
    const remaining = limit - retainedChars - separator.length;
    if (remaining <= 0) {
      return;
    }
    const boundedExcerpt = excerpt.slice(0, remaining);
    excerpts.push(`${separator}${boundedExcerpt}`);
    retainedChars += separator.length + boundedExcerpt.length;
  };

  // Preserve document identity and scope, then retain topic-balanced passages
  // from the complete source before reserving space for late contact sections.
  addExcerpt(0, 2_400);
  const retentionPattern = new RegExp(
    "\\b(?:how long do we keep|additional information about data retention|retention|how long we retain|as long as necessary|retention criteria)\\b",
    "gi",
  );
  let strongestRetentionBounds: { end: number; score: number; start: number } | null = null;
  for (const match of rawText.matchAll(retentionPattern)) {
    if (match.index === undefined) continue;
    const start = match.index;
    const end = Math.min(rawText.length, start + 1_600);
    const score = retentionEvidenceSpecificityScore(rawText.slice(start, end));
    if (!strongestRetentionBounds || score > strongestRetentionBounds.score) {
      strongestRetentionBounds = { end, score, start };
    }
  }
  if (strongestRetentionBounds) {
    addExcerpt(strongestRetentionBounds.start, strongestRetentionBounds.end);
  }
  for (const anchor of POLICY_REVIEW_TEXT_ANCHORS) {
    const match = anchor.exec(rawText);
    anchor.lastIndex = 0;
    if (!match || match.index === undefined) {
      continue;
    }
    addExcerpt(match.index - 320, match.index + match[0].length + 1_180);
  }
  addExcerpt(rawText.length - 3_200, rawText.length);

  return excerpts.join("").slice(0, limit);
}

export function selectEscalatedPolicyReviewText(input: {
  nanoExcerpts?: readonly string[];
  rawText: string;
  topics: readonly PolicyReviewTopic[];
}, limit = 7_000) {
  const excerpts: string[] = [];
  let retainedChars = 0;
  const addExcerpt = (value: string) => {
    if (retainedChars >= limit) return;
    const excerpt = value.trim();
    if (!excerpt) return;
    const normalized = excerpt.replace(/\s+/g, " ").toLowerCase();
    if (excerpts.some((retained) =>
      retained.replace(/\s+/g, " ").toLowerCase().includes(normalized)
    )) return;
    const separator = excerpts.length > 0 ? "\n\n[…]\n\n" : "";
    const remaining = limit - retainedChars - separator.length;
    if (remaining <= 0) return;
    const bounded = excerpt.slice(0, remaining);
    excerpts.push(`${separator}${bounded}`);
    retainedChars += separator.length + bounded.length;
  };

  addExcerpt(input.rawText.slice(0, 900));
  for (const excerpt of input.nanoExcerpts ?? []) {
    const exactIndex = input.rawText.indexOf(excerpt);
    if (exactIndex >= 0) {
      addExcerpt(input.rawText.slice(
        Math.max(0, exactIndex - 360),
        Math.min(input.rawText.length, exactIndex + excerpt.length + 720),
      ));
    }
  }
  const includeAllTopics = input.topics.includes("policy_runtime_consistency");
  const anchorTopics = includeAllTopics ? POLICY_REVIEW_TOPICS : input.topics;
  for (const topic of anchorTopics) {
    for (const anchor of POLICY_REVIEW_TEXT_ANCHORS_BY_TOPIC[topic]) {
      const match = anchor.exec(input.rawText);
      anchor.lastIndex = 0;
      if (match?.index === undefined) continue;
      addExcerpt(input.rawText.slice(
        Math.max(0, match.index - 360),
        Math.min(input.rawText.length, match.index + match[0].length + 1_240),
      ));
    }
  }
  if (input.topics.includes("data_subject_rights")) {
    addExcerpt(input.rawText.slice(-1_200));
  }
  return excerpts.join("").slice(0, limit);
}

export function buildPolicyReviewPacket(input: {
  documentSources: Array<Record<string, unknown>>;
  evidenceCoverage?: {
    coverageLimitations?: unknown;
    policySurfaceInspection?: unknown;
    runtimeCoverage?: unknown;
  };
  policyCandidates?: Array<Record<string, unknown>>;
  runtimeArtifacts?: Record<string, unknown> | null;
  scanContext?: {
    region?: string | null;
    targetUrl?: string | null;
  };
  scanDate?: string | null;
  scanId: string;
}): PolicyReviewPacket | null {
  let remainingChars = MAX_PACKET_TEXT_CHARS;
  const documents = input.documentSources
    .filter((row) => (getString(row.source_status) ?? "ready") === "ready")
    .filter((row) => (getString(row.extraction_status) ?? "ready") !== "failed")
    .flatMap((row): PolicyReviewPacketDocument[] => {
      if (remainingChars <= 0) {
        return [];
      }
      const documentId = getString(row.id);
      const canonicalUrl = getString(row.canonical_url) ?? getString(row.source_url);
      const rawText = getString(row.document_text);
      if (!documentId || !canonicalUrl || !rawText) {
        return [];
      }
      const extractedFields = getRecord(row.extracted_fields_json);
      const textLimit = Math.min(MAX_DOCUMENT_TEXT_CHARS, remainingChars);
      const text = selectBoundedPolicyReviewText(rawText, textLimit);
      remainingChars -= text.length;
      const rawCoverage = getRecord(
        row.content_coverage ?? extractedFields.content_coverage,
      );
      const retainedSectionQuality = Array.isArray(
        extractedFields.retained_policy_section_quality,
      )
        ? extractedFields.retained_policy_section_quality
        : [];
      const rawTargetRelationship =
        getString(row.target_relationship) ??
        getString(extractedFields.target_relationship) ??
        (sameCanonicalHostname(canonicalUrl, input.scanContext?.targetUrl)
          ? "target_controller"
          : "unknown");
      const targetRelationship = [
        "target_controller",
        "first_party_brand",
        "service_provider",
        "unrelated",
        "unknown",
      ].includes(rawTargetRelationship)
        ? rawTargetRelationship as PolicyReviewPacketDocument["targetRelationship"]
        : "unknown";
      const contentStatus = getString(rawCoverage.status);
      return [{
        canonicalUrl,
        contentCoverage: {
          status: ["complete", "partial", "truncated", "malformed"].includes(contentStatus ?? "")
            ? contentStatus as PolicyReviewPacketDocument["contentCoverage"]["status"]
            : "unknown",
          sourceTextChars: getNumber(rawCoverage.sourceTextChars),
          extractedSectionCount: getNumber(rawCoverage.extractedSectionCount),
          retainedSectionCount: getNumber(rawCoverage.retainedSectionCount),
          retainedStrongSectionCount: retainedSectionQuality.filter(
            (quality) => quality === "strong",
          ).length,
          retainedTableRowCount: getNumber(rawCoverage.retainedTableRowCount),
          limitationKeys: getStringArray(rawCoverage.limitationKeys),
          packetTextTruncated: rawText.length > text.length,
        },
        documentEvaluationState: (
          getString(row.document_evaluation_state) ??
          getString(extractedFields.document_evaluation_state) ??
          "unknown"
        ) as PolicyReviewPacketDocument["documentEvaluationState"],
        documentFetchState: (
          getString(row.document_fetch_state) ??
          getString(extractedFields.document_fetch_state) ??
          "unknown"
        ) as PolicyReviewPacketDocument["documentFetchState"],
        documentId,
        documentOwnerEntity:
          getString(row.document_owner_entity) ??
          getString(extractedFields.document_owner_entity),
        documentType: getString(row.document_type) ?? "unknown",
        extractedCandidates: compactPolicyCandidate(extractedFields),
        ownershipConfidence:
          getNumber(row.ownership_confidence) ??
          getNumber(extractedFields.ownership_confidence) ??
          (targetRelationship === "target_controller" ? 0.9 : null),
        ownershipReasonCodes: getStringArray(
          row.ownership_reason_codes ?? extractedFields.ownership_reason_codes,
          12,
        ).concat(
          targetRelationship === "target_controller" &&
          !getString(row.target_relationship) &&
          !getString(extractedFields.target_relationship)
            ? ["same_canonical_hostname_as_scan_target"]
            : [],
        ).slice(0, 12),
        targetRelationship,
        text
      }];
    })
    .slice(0, MAX_DOCUMENTS);

  if (documents.length === 0) {
    return null;
  }

  const policyCandidates = (input.policyCandidates ?? []).slice(0, 40).map(compactPolicyCandidate);
  const runtimeContext = compactRuntimeContext(input.runtimeArtifacts);
  const evidenceCoverage = {
    coverageLimitations: Array.isArray(input.evidenceCoverage?.coverageLimitations)
      ? input.evidenceCoverage.coverageLimitations
        .slice(0, 20)
        .map((entry) => boundContextValue(entry) as Record<string, unknown>)
      : [],
    policySurfaceInspection: getRecord(
      boundContextValue(input.evidenceCoverage?.policySurfaceInspection),
    ),
    runtimeCoverage: getRecord(
      boundContextValue(input.evidenceCoverage?.runtimeCoverage),
    ),
  };
  const scanContext = {
    region: input.scanContext?.region ?? null,
    targetUrl: input.scanContext?.targetUrl ?? null,
  };
  const contentHash = sha256(stableJson({
    documents: documents.map((document) => ({
      canonicalUrl: document.canonicalUrl,
      contentCoverage: document.contentCoverage,
      documentEvaluationState: document.documentEvaluationState,
      documentType: document.documentType,
      documentOwnerEntity: document.documentOwnerEntity,
      extractedCandidates: document.extractedCandidates,
      ownershipConfidence: document.ownershipConfidence,
      targetRelationship: document.targetRelationship,
      text: document.text
    })),
    evidenceCoverage,
    policyCandidates,
    runtimeContext,
    scanContext,
    scanDate: input.scanDate ?? null,
  }));

  return {
    contentHash,
    documents,
    evidenceCoverage,
    policyCandidates,
    runtimeContext,
    scanContext,
    scanDate: input.scanDate ?? null,
    scanId: input.scanId
  };
}

function canonicalBundleDocumentType(surfaceType: string) {
  if (surfaceType === "terms") {
    return "terms_of_service";
  }
  return surfaceType;
}

function canonicalBundlePolicyText(
  surface: CanonicalEvidenceBundle["policySurfaceObservations"][number],
  scanDate: string
) {
  const retainedSections = (surface.retainedPolicySections ?? []).map((section) => ({
    heading: section.heading,
    text: section.textExcerpt
  }));
  const frameworkSections = retainedSections.filter(
    (section) => evaluateLegalFrameworkValidity(section.text, scanDate).length > 0
  );
  const parts = [
    surface.textExcerpt ?? "",
    ...frameworkSections.map((section) => `[${section.heading}]\n${section.text}`),
    ...(surface.article13DisclosureSignals ?? []).flatMap((signal) => [
      signal.selectedPolicySectionExcerpt ?? "",
      signal.evidenceText ?? ""
    ]),
    ...retainedSections.map((section) => `[${section.heading}]\n${section.text}`)
  ];
  return [...new Set(parts.map((part) => part.trim()).filter(Boolean))].join("\n\n");
}

export function buildPolicyReviewPacketFromCanonicalBundle(
  bundle: CanonicalEvidenceBundle,
  options: { scanId?: string; verifiedRetainedBundle?: boolean } = {}
) {
  const policySurfaces = bundle.policySurfaceObservations
    .filter((surface) => surface.documentEvaluationState === "usable" || surface.status === "fetched")
    .map((surface) => ({
      reviewText: canonicalBundlePolicyText(surface, bundle.completedAt),
      surface
    }))
    .filter(({ reviewText }) => getString(reviewText));
  const sourcePreference = (row: Record<string, unknown>) => {
    const extractedFields = getRecord(row.extracted_fields_json);
    const contentCoverage = getRecord(extractedFields.content_coverage);
    const targetRelationship = getString(extractedFields.target_relationship);
    return (
      (getString(extractedFields.document_evaluation_state) === "usable" ? 16 : 0) +
      (getString(extractedFields.document_fetch_state) === "fetched" ? 8 : 0) +
      (getString(contentCoverage.status) === "complete" ? 8 : 0) +
      (targetRelationship === "target_controller" ? 8 : 0) +
      (targetRelationship === "first_party_brand" ? 4 : 0) +
      (getNumber(extractedFields.ownership_confidence) ?? 0) * 4 +
      (getNumber(extractedFields.semantic_confidence) ?? 0) * 2
    );
  };
  const documentSourcesByContent = new Map<string, Record<string, unknown>>();
  for (const { reviewText, surface } of policySurfaces) {
    const canonicalUrl = surface.normalizedUrl ?? surface.finalUrl ?? surface.url;
    const documentType = canonicalBundleDocumentType(surface.surfaceType);
    const targetRelationship =
      surface.targetRelationship ??
      (sameCanonicalHostname(
        canonicalUrl,
        bundle.normalizedUrl ?? bundle.url,
      )
        ? "target_controller"
        : "unknown");
    const candidate = {
      id: surface.observationId,
      canonical_url: canonicalUrl,
      document_type: documentType,
      document_text: reviewText,
      extraction_status: "ready",
      source_status: "ready",
      extracted_fields_json: {
        content_coverage: surface.contentCoverage ?? null,
        document_evaluation_state: surface.documentEvaluationState ?? null,
        document_fetch_state: surface.documentFetchState ?? null,
        document_owner_entity: surface.documentOwnerEntity ?? null,
        ownership_confidence: surface.ownershipConfidence ?? null,
        ownership_reason_codes: [
          ...(surface.ownershipReasonCodes ?? []),
          ...(
            !surface.targetRelationship &&
            targetRelationship === "target_controller"
              ? ["same_canonical_hostname_as_scan_target"]
              : []
          ),
        ],
        title: surface.title ?? surface.linkText ?? null,
        page_type: documentType,
        page_url: canonicalUrl,
        policy_mentions: surface.observedTopics.map((topic) => ({ topic })),
        policy_cookie_disclosures: surface.policyCookieDisclosures,
        policy_rights_signals: surface.mentionedRights,
        retained_article13_section_evidence: surface.retainedArticle13SectionEvidence ?? [],
        retained_policy_section_quality: (surface.retainedPolicySections ?? []).map(
          (section) => section.quality,
        ),
        policy_summary_short: surface.textExcerpt?.slice(0, 1_200) ?? null,
        semantic_confidence: surface.confidence,
        target_relationship: targetRelationship,
      }
    };
    // The retained bundle may contain the same policy through localized,
    // redirected, or query-parameter URL variants. Preserve every retained
    // surface in the bundle, but send only one copy of identical policy text
    // to semantic review. This changes review transport, not evidence capture.
    const contentKey = `${documentType}:${sha256(reviewText)}`;
    const existing = documentSourcesByContent.get(contentKey);
    if (!existing || sourcePreference(candidate) > sourcePreference(existing)) {
      documentSourcesByContent.set(contentKey, candidate);
    }
  }
  const documentSources = [...documentSourcesByContent.values()];
  const policyCandidates = documentSources.map((source) => ({
    canonical_url: source.canonical_url,
    document_type: source.document_type,
    ...getRecord(source.extracted_fields_json),
  }));
  const sessionReplayVendors = bundle.normalizedVendorObservations
    .filter((observation) => observation.purpose === "session_replay")
    .map((observation) => ({
      confidence: observation.confidence,
      matchedCookieNames: observation.matchedCookieNames,
      matchedHostnames: observation.matchedHostnames,
      product: observation.product ?? null,
      vendor: observation.vendor
    }));

  return buildPolicyReviewPacket({
    documentSources,
    evidenceCoverage: {
      coverageLimitations: [],
      policySurfaceInspection: {
        ...(bundle.policySurfaceInspection ?? {}),
        ...(options.verifiedRetainedBundle
          ? { retainedCanonicalBundleVerified: true }
          : {}),
      },
      runtimeCoverage: bundle.runtimeCoverage ?? {},
    },
    policyCandidates,
    runtimeArtifacts: {
      cmp: bundle.cmpRuntimeObservations.slice(0, 8).map((observation) => ({
        confidence: observation.confidence,
        entity: observation.entity,
        observedAtMs: observation.observedAtMs,
        product: observation.product ?? null,
        vendor: observation.vendor
      })),
      consentUi: bundle.consentUiObservations.slice(0, 8).map((observation) => ({
        acceptControlObserved: observation.acceptControlObserved,
        captureStatus: observation.captureStatus ?? null,
        likelyPresent: observation.likelyPresent,
        managePreferencesControlObserved: observation.managePreferencesControlObserved,
        observedAtMs: observation.observedAtMs,
        rejectControlObserved: observation.rejectControlObserved,
        visibleChoiceLabels: observation.visibleChoiceLabels
      })),
      cookies: bundle.cookieEvents.slice(0, 80).map((event) => ({
        cookieDomain: event.cookieDomain ?? null,
        cookieName: event.cookieName,
        cookieParty: event.cookieParty,
        cookiePurpose: event.cookiePurpose,
        observedAtMs: event.timestampMs
      })),
      storageKeys: bundle.storageSnapshots.slice(0, 20).flatMap((snapshot) => [
        ...snapshot.localStorageKeys,
        ...snapshot.sessionStorageKeys
      ]).slice(0, 100),
      preconsent: bundle.derivedRuntimeSignals,
      sessionReplay: sessionReplayVendors,
      trackerVendors: bundle.normalizedVendorObservations.slice(0, 40).map((observation) => ({
        confidence: observation.confidence,
        matchedCookieNames: observation.matchedCookieNames,
        matchedHostnames: observation.matchedHostnames,
        product: observation.product ?? null,
        purpose: observation.purpose,
        vendor: observation.vendor
      }))
    },
    scanContext: {
      region: bundle.region ?? null,
      targetUrl: bundle.normalizedUrl ?? bundle.url,
    },
    scanDate: bundle.completedAt,
    scanId: options.scanId ?? bundle.scanId
  });
}

export function buildPolicyReviewPacketFromVerifiedPolicyEvidence(
  packet: VerifiedPolicyEvidencePacket,
) {
  return buildPolicyReviewPacketFromCanonicalBundle({
    scanId: packet.scanId,
    completedAt: packet.scanDate,
    url: packet.targetUrl,
    normalizedUrl: packet.normalizedUrl,
    region: packet.region ?? undefined,
    modulesRun: [packet.moduleRun],
    policySurfaceObservations: packet.policySurfaceObservations,
    policySurfaceInspection: packet.policySurfaceInspection,
    cmpRuntimeObservations: [],
    consentUiObservations: [],
    cookieEvents: [],
    storageSnapshots: [],
    normalizedVendorObservations: [],
    derivedRuntimeSignals: {},
  } as unknown as CanonicalEvidenceBundle, { scanId: packet.scanId });
}

function buildStaticPolicyReviewProjection(packet: PolicyReviewPacket) {
  const inspection = packet.evidenceCoverage.policySurfaceInspection;
  const scanTimestamp = packet.scanDate ? Date.parse(packet.scanDate) : Number.NaN;
  const frameworkBoundaryDates = LEGAL_FRAMEWORK_VALIDITY_REGISTRY.flatMap((entry) => [
    entry.effectiveFrom,
    entry.invalidatedFrom,
    entry.supersededFrom,
  ])
    .filter((value): value is string => typeof value === "string")
    .filter((value) => !Number.isFinite(scanTimestamp) || Date.parse(`${value}T00:00:00.000Z`) <= scanTimestamp)
    .sort();
  const legalFrameworkValidityEpoch = frameworkBoundaryDates.at(-1) ?? null;
  const legalFrameworkRegistryHash = sha256(stableJson(
    LEGAL_FRAMEWORK_VALIDITY_REGISTRY.map((entry) => ({
      canonicalId: entry.canonicalId,
      canonicalStatus: entry.canonicalStatus,
      effectiveFrom: entry.effectiveFrom,
      invalidatedFrom: entry.invalidatedFrom ?? null,
      supersededFrom: entry.supersededFrom ?? null,
      supersededBy: entry.supersededBy ?? null,
    })),
  ));
  return {
    documents: packet.documents,
    evidenceCoverage: {
      coverageLimitations: packet.evidenceCoverage.coverageLimitations,
      policySurfaceInspection: {
        outcome: getString(inspection.outcome),
        coverageStatus: getString(inspection.coverageStatus),
        linkDiscoveryCoverageStatus: getString(inspection.linkDiscoveryCoverageStatus),
        documentRetrievalCoverageStatus: getString(inspection.documentRetrievalCoverageStatus),
        inspectionCompleted: inspection.inspectionCompleted === true,
        privacyPolicyObserved: inspection.privacyPolicyObserved === true,
        limitationKeys: getStringArray(inspection.limitationKeys),
        legalFrameworkRegistryHash,
      },
      runtimeCoverage: {},
    },
    policyCandidates: packet.policyCandidates,
    runtimeContext: {},
    // The execution region is infrastructure provenance, not a static policy
    // semantic input. The retained documents already encode the jurisdictional
    // variant that was actually served. Runtime comparison remains region-aware
    // in the terminal phase.
    scanContext: {
      region: null,
      targetUrl: packet.scanContext.targetUrl,
    },
    // Framework validity changes only at registry boundaries. Keying static
    // policy semantics by that epoch preserves date-correct evaluation while
    // allowing unchanged policies to reuse Mini review across ordinary days.
    scanDate: legalFrameworkValidityEpoch,
  } satisfies Omit<PolicyReviewPacket, "contentHash" | "scanId">;
}

export function buildPolicyStaticContentHash(packet: PolicyReviewPacket) {
  const projection = buildStaticPolicyReviewProjection(packet);
  return sha256(stableJson({
    ...projection,
    scanContext: {
      ...projection.scanContext,
      // Target URL is scan identity. Static reuse remains bound by the typed
      // document ownership and target-relationship fields retained below.
      targetUrl: null,
    },
    documents: projection.documents.map((document) => {
      const { documentId: _scanSpecificDocumentId, ...stableDocument } = document;
      return stableDocument;
    }),
  }));
}

/**
 * Returns the exact bounded input used for the six policy-only semantic rows.
 * Early and terminal consumers must use this projection for both transport and
 * identity so non-semantic runtime/provenance differences cannot split a join.
 */
export function buildStaticPolicyReviewPacket(
  packet: PolicyReviewPacket,
): PolicyReviewPacket {
  const staticProjection = buildStaticPolicyReviewProjection(packet);
  return {
    ...staticProjection,
    contentHash: buildPolicyStaticContentHash(packet),
    scanId: packet.scanId,
  };
}

export function buildPolicyReviewCacheKey(input: {
  candidateReviewCacheKey?: string;
  contentHash: string;
  model: string;
  reviewPhase?: "full" | "static" | "runtime_delta" | "escalated" | "critic";
}) {
  const reasoningEffort = input.reviewPhase === "static" ? "low" : "model_default";
  return sha256(stableJson({
    contentHash: input.contentHash,
    candidateReviewCacheKey: input.candidateReviewCacheKey ?? null,
    contractVersion: POLICY_MODEL_REVIEW_CONTRACT_VERSION,
    model: input.model,
    promptVersion: POLICY_MODEL_REVIEW_PROMPT_VERSION,
    schemaVersion: POLICY_REVIEW_SCHEMA_VERSION,
    invariantVersion: POLICY_REVIEW_INVARIANT_VERSION,
    reasoningEffort,
    reviewPhase: input.reviewPhase ?? "full",
  }));
}

function excerptAround(text: string, matchedAlias: string) {
  const index = text.toLocaleLowerCase().indexOf(matchedAlias.toLocaleLowerCase());
  if (index < 0) {
    return matchedAlias.slice(0, 1_200);
  }
  const start = Math.max(0, index - 260);
  return text.slice(start, Math.min(text.length, index + matchedAlias.length + 500)).trim().slice(0, 1_200);
}

export function deriveDeterministicLegalFrameworkSignals(packet: PolicyReviewPacket) {
  return packet.documents.flatMap((document) =>
    evaluateLegalFrameworkValidity(document.text, packet.scanDate).map((match) => ({
      frameworkId: match.canonicalId,
      validityStatus:
        match.statusAtScan === "superseded" || match.statusAtScan === "not_yet_effective"
          ? "outdated" as const
          : match.statusAtScan,
      sourceDocumentId: document.documentId,
      sourceUrl: document.canonicalUrl,
      excerpt: excerptAround(document.text, match.matchedAlias)
    }))
  );
}

export function deriveDeterministicPolicyReviewSignals(packet: PolicyReviewPacket) {
  return deriveDeterministicLegalFrameworkSignals(packet)
    .filter((signal) =>
      signal.validityStatus === "outdated" ||
      signal.validityStatus === "invalidated"
    )
    .map((signal) => ({
      findingKey: "outdated_transfer_framework_referenced" as const,
      displayLabel: "Outdated transfer framework referenced" as const,
      status: "observed" as const,
      frameworkId: signal.frameworkId,
      validityStatus: signal.validityStatus,
      sourceDocumentId: signal.sourceDocumentId,
      sourceUrl: signal.sourceUrl,
      excerpt: signal.excerpt,
      reasonCodes: [
        "canonical_legal_framework_registry_match",
        "scan_date_aware_validity_check",
      ],
    }));
}

function buildSystemPrompt(
  topics: readonly PolicyReviewTopic[] = POLICY_REVIEW_TOPICS,
  boundedEscalationTransport = false,
  criticReview = false,
) {
  return [
    "You perform evidence-scoped privacy policy review for a website risk-signal product.",
    `Canonical review labels are: ${Object.values(POLICY_REVIEW_TOPIC_DEFINITIONS).map((definition) => definition.displayLabel).join("; ")}.`,
    `Classify exactly these topics once each: ${topics.join(", ")}.`,
    "Do not make a legal determination and do not invent facts.",
    "Observed requires a directly relevant substantive passage, not merely disclosure-shaped text.",
    "A retention passage is not processing-purposes evidence.",
    "A transfer-framework or certification passage is not processing-purposes evidence.",
    "Classify observed cookie/storage names as observed when at least one specific, non-placeholder cookie or storage identifier is retained in policy or runtime evidence.",
    "This topic measures retained identifier presence only and does not require a complete policy inventory.",
    "International-transfer disclosure and outdated transfer-framework references are separate checks. Do not mark international-transfer disclosure conflicting merely because a disclosed mechanism is obsolete; the deterministic registry reports that separately.",
    "For policy/runtime comparison, compare a specific retained policy promise only with a directly comparable runtime fact in the same jurisdiction and consent state. Mutual silence is not alignment.",
    "Use conflicting only when retained passages or directly comparable policy/runtime evidence materially disagree.",
    "Use not_observed_with_sufficient_coverage only when the packet coverage metadata establishes a usable governing source, complete relevant capture, correct target ownership, and any required usable runtime lane.",
    "Use insufficient_retained_evidence when absence could be caused by incomplete capture.",
    "The deterministic legal-framework registry supplied separately is authoritative for framework dates and validity.",
    "Return bounded verbatim excerpts and source references.",
    "Keep each rationale under 320 characters, retain at most two evidence excerpts and one conflicting excerpt per topic, and keep each excerpt under 360 characters.",
    "Never promote or create a customer-facing finding.",
    ...(boundedEscalationTransport
      ? [
          "This is a verified bounded passage projection for escalated topics. Omitted text is not evidence of absence. Use insufficient_retained_evidence unless the supplied typed coverage and retained passage establish the requested status.",
        ]
      : []),
    ...(criticReview
      ? [
          "Act as an independent critic of the supplied candidate review. Re-read the retained evidence yourself; do not defer to the candidate labels or confidence.",
          "Search specifically for wrong-topic evidence, unsupported absence, ownership errors, contradictions, and excerpts that do not support the candidate status.",
          "Return your own complete classification for every requested topic using the canonical schema.",
        ]
      : []),
  ].join(" ");
}

/**
 * Builds the bounded transport view sent to Mini. The retained bundle remains
 * unchanged and the typed packet remains available for deterministic invariant
 * enforcement. Large extracted-candidate evidence is carried only once instead
 * of being duplicated in every document.
 */
export function buildPolicyReviewInput(packet: PolicyReviewPacket) {
  const normalizedDocumentTexts = packet.documents.map((document) =>
    document.text.replace(/\s+/g, " ").trim().toLowerCase()
  );
  const isAlreadyRetainedInDocumentText = (value: unknown) => {
    const text = getString(value)?.replace(/\s+/g, " ").trim().toLowerCase();
    return Boolean(text && normalizedDocumentTexts.some((documentText) =>
      documentText.includes(text)
    ));
  };
  const deterministicAndExtractionCandidates = packet.policyCandidates.map((candidate) => {
    const retainedArticle13Evidence = Array.isArray(
      candidate.retained_article13_section_evidence,
    )
      ? candidate.retained_article13_section_evidence
      : [];
    const {
      retained_article13_section_evidence: _duplicatedRetainedArticle13Evidence,
      policy_summary_short: policySummaryShort,
      ...boundedCandidate
    } = candidate;
    const compactRetainedArticle13Evidence = retainedArticle13Evidence
      .slice(0, 24)
      .map((entry) => {
        const evidence = getRecord(entry);
        const excerpt = getString(evidence.selectedPolicySectionExcerpt);
        const excerptRetainedInDocument = isAlreadyRetainedInDocumentText(excerpt);
        return {
          coverageArea: getString(evidence.coverageArea),
          selectedPolicySectionHeading: getString(evidence.selectedPolicySectionHeading),
          selectedPolicySectionUrl: getString(evidence.selectedPolicySectionUrl),
          evidenceSource: getString(evidence.evidenceSource),
          selectedEvidenceStrength: getString(evidence.selectedEvidenceStrength),
          signalObserved: getString(evidence.signalObserved),
          extractionLimitation: getString(evidence.extractionLimitation),
          excerptRetainedInDocument,
          ...(
            excerpt && !excerptRetainedInDocument
              ? { selectedPolicySectionExcerpt: excerpt.slice(0, 500) }
              : {}
          ),
        };
      });
    return {
      ...boundedCandidate,
      ...(
        policySummaryShort && !isAlreadyRetainedInDocumentText(policySummaryShort)
          ? { policy_summary_short: policySummaryShort }
          : {}
      ),
      retained_article13_section_evidence: compactRetainedArticle13Evidence,
      retained_article13_section_evidence_count: retainedArticle13Evidence.length,
    };
  });
  return {
    scanDate: packet.scanDate,
    scanContext: packet.scanContext,
    documents: packet.documents.map((document) => ({
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
      text: document.text,
    })),
    evidenceCoverage: packet.evidenceCoverage,
    // Canonical policy text usually includes the retained Article 13 passages.
    // Keep the typed index, but omit repeated excerpts only when their exact
    // normalized text is present in the transported document. Unmatched
    // excerpts remain available to Mini and the complete packet is unchanged.
    deterministicAndExtractionCandidates,
    runtimeContext: packet.runtimeContext,
    deterministicLegalFrameworkSignals: deriveDeterministicLegalFrameworkSignals(packet),
  };
}

const POLICY_TOPIC_TO_COVERAGE_AREA = {
  processing_purposes: "processing_purposes",
  legal_basis: "legal_basis",
  data_retention: "data_retention",
  international_transfers: "international_transfers",
  vendor_disclosures: "recipients_or_vendor_categories",
  data_subject_rights: "data_subject_rights",
} as const;

function isTargetPolicyDocument(document: PolicyReviewPacketDocument) {
  return document.targetRelationship === "target_controller" ||
    document.targetRelationship === "first_party_brand";
}

function documentHasCompleteCapture(document: PolicyReviewPacketDocument) {
  return document.documentEvaluationState === "usable" &&
    document.documentFetchState === "fetched" &&
    document.contentCoverage.status === "complete" &&
    !document.contentCoverage.packetTextTruncated &&
    document.contentCoverage.limitationKeys.length === 0;
}

function runtimeCoverageIsUsable(packet: PolicyReviewPacket) {
  return getString(packet.evidenceCoverage.runtimeCoverage.coverageStatus) === "usable";
}

function policyInspectionIsComplete(packet: PolicyReviewPacket) {
  return getString(packet.evidenceCoverage.policySurfaceInspection.coverageStatus) === "complete" &&
    packet.evidenceCoverage.coverageLimitations.length === 0;
}

function retainedTopicSectionIsComplete(
  document: PolicyReviewPacketDocument,
  topic: keyof typeof POLICY_TOPIC_TO_COVERAGE_AREA,
) {
  const retainedEvidence = document.extractedCandidates.retained_article13_section_evidence;
  if (!Array.isArray(retainedEvidence)) {
    return documentHasCompleteCapture(document);
  }
  const area = POLICY_TOPIC_TO_COVERAGE_AREA[topic];
  return retainedEvidence.some((entry) => {
    const record = getRecord(entry);
    return getString(record.coverageArea) === area &&
      getString(record.selectedEvidenceStrength) === "strong" &&
      !getString(record.extractionLimitation);
  });
}

function topicCoverageIsSufficient(
  packet: PolicyReviewPacket,
  topic: PolicyModelReviewRow["topic"],
) {
  if (topic === "cookie_inventory") {
    return runtimeCoverageIsUsable(packet) ||
      packet.documents.some((document) =>
        isTargetPolicyDocument(document) &&
        document.documentType === "cookie_policy" &&
        documentHasCompleteCapture(document)
      );
  }
  const targetDocuments = packet.documents.filter(isTargetPolicyDocument);
  if (topic === "policy_runtime_consistency") {
    return runtimeCoverageIsUsable(packet) &&
      policyInspectionIsComplete(packet) &&
      targetDocuments.some(documentHasCompleteCapture);
  }
  return policyInspectionIsComplete(packet) &&
    targetDocuments.some((document) =>
      documentHasCompleteCapture(document) &&
      retainedTopicSectionIsComplete(
        document,
        topic as keyof typeof POLICY_TOPIC_TO_COVERAGE_AREA,
      )
    );
}

function insufficientCoverageRow(
  row: PolicyModelReviewRow,
  reasonCode: string,
  rationale: string,
) {
  return policyModelReviewRowSchema.parse({
    ...row,
    status: "insufficient_retained_evidence",
    comparisonOutcome: row.topic === "policy_runtime_consistency"
      ? "insufficient_comparison_evidence"
      : undefined,
    confidence: Math.min(row.confidence, 0.8),
    sourceDocumentIds: [],
    sourceUrls: [],
    evidenceExcerpts: [],
    conflictingExcerpts: [],
    reasonCodes: [...new Set([...row.reasonCodes, reasonCode])].slice(0, 20),
    rationale,
  });
}

function comparisonOutcomeForStatus(status: PolicyModelReviewRow["status"]) {
  if (status === "observed") {
    return "no_material_mismatch_retained" as const;
  }
  if (status === "conflicting") {
    return "material_contradiction_retained" as const;
  }
  if (status === "ambiguous") {
    return "ambiguous_comparison" as const;
  }
  return "insufficient_comparison_evidence" as const;
}

function conflictIsOnlyFrameworkValidity(
  row: PolicyModelReviewRow,
  packet: PolicyReviewPacket,
) {
  if (
    row.topic !== "international_transfers" ||
    row.status !== "conflicting" ||
    row.conflictingExcerpts.length === 0
  ) {
    return false;
  }
  return row.conflictingExcerpts.every((excerpt) =>
    evaluateLegalFrameworkValidity(excerpt, packet.scanDate).length > 0
  );
}

function policyCookieIdentifiers(packet: PolicyReviewPacket) {
  const identifiers = new Set<string>();
  for (const candidate of packet.policyCandidates) {
    const disclosures = candidate.policy_cookie_disclosures;
    if (!Array.isArray(disclosures)) {
      continue;
    }
    for (const disclosure of disclosures) {
      const cookieName = getString(getRecord(disclosure).cookieName);
      if (cookieName) {
        identifiers.add(cookieName);
      }
    }
  }
  const namedCookiePattern = /\bcookie\s+name\s+([A-Za-z0-9_.#-]{2,200})/gi;
  const strongCookieIdentifierPattern =
    /(?:^|[\s("'`])(_{1,2}[A-Za-z0-9][A-Za-z0-9_.-]{1,199})(?=$|[\s,;:)"'`])/g;
  for (const document of packet.documents) {
    let match: RegExpExecArray | null;
    while ((match = namedCookiePattern.exec(document.text))) {
      const candidate = match[1]?.trim();
      if (
        candidate &&
        !["cookie", "cookies", "name", "provider", "purpose", "duration", "expiry"].includes(candidate.toLowerCase())
      ) {
        identifiers.add(candidate);
      }
    }
    while ((match = strongCookieIdentifierPattern.exec(document.text))) {
      const candidate = match[1]?.trim();
      if (candidate) {
        identifiers.add(candidate);
      }
    }
  }
  return [...identifiers].slice(0, 100);
}

function runtimeCookieIdentifiers(packet: PolicyReviewPacket) {
  const identifiers = new Set<string>();
  const addIdentifier = (value: unknown) => {
    const identifier = getString(value);
    if (
      identifier &&
      identifier.length >= 2 &&
      !["cookie", "cookies", "name", "unknown", "n/a", "none"].includes(identifier.toLowerCase())
    ) {
      identifiers.add(identifier);
    }
  };
  const cookies = packet.runtimeContext.cookies;
  if (Array.isArray(cookies)) {
    for (const cookie of cookies) {
      const record = getRecord(cookie);
      addIdentifier(record.cookieName);
      addIdentifier(record.storageName);
      addIdentifier(record.name);
    }
  }
  for (const key of ["storageKeys", "localStorageKeys", "sessionStorageKeys"]) {
    const storageKeys = packet.runtimeContext[key];
    if (Array.isArray(storageKeys)) {
      storageKeys.forEach(addIdentifier);
    }
  }
  for (const key of ["trackerVendors", "sessionReplay"]) {
    const observations = packet.runtimeContext[key];
    if (!Array.isArray(observations)) {
      continue;
    }
    for (const observation of observations) {
      const matchedCookieNames = getRecord(observation).matchedCookieNames;
      if (Array.isArray(matchedCookieNames)) {
        matchedCookieNames.forEach(addIdentifier);
      }
    }
  }
  return [...identifiers].slice(0, 100);
}

function hasSufficientCookiePolicyCoverage(packet: PolicyReviewPacket) {
  return packet.documents.some((document) =>
    document.documentType === "cookie_policy" && document.text.length >= 500
  ) || packet.policyCandidates.some((candidate) =>
    (getString(candidate.document_type) === "cookie_policy" || getString(candidate.page_type) === "cookie_policy") &&
    (getString(candidate.policy_summary_short)?.length ?? 0) >= 200
  );
}

function hasSubstantiveRetentionEvidence(packet: PolicyReviewPacket) {
  const policyText = packet.documents.map((document) => document.text).join("\n");
  return [
    /\b(?:retention|storage)\s+period\b/i,
    /\bretention periods?\b.{0,120}\b(?:between|from|up to|at least|no more than)\s+\d+\b/i,
    /\bretain(?:ed|ing|s)?\b.{0,220}\b(?:for\s+(?:up to\s+)?(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)|as long as|no longer than|until|necessary|required by law|legal obligation|purpose for which)\b/i,
    /\b(?:delete|erase|anonymi[sz]e)(?:d|s|ing)?\b.{0,180}\b(?:after|at the end|when|once|no longer|within\s+\d+)\b/i,
    /\b(?:kept|stored)\b.{0,180}\b(?:for\s+(?:up to\s+)?(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)|as long as|until|necessary|required by law)\b/i
  ].some((pattern) => pattern.test(policyText));
}

function normalizePolicyReviewExcerpt(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  const quotePairs = [
    ["“", "”"],
    ["\"", "\""],
    ["‘", "’"],
    ["'", "'"]
  ] as const;
  for (const [opening, closing] of quotePairs) {
    if (
      normalized.length >= 2 &&
      normalized.startsWith(opening) &&
      normalized.endsWith(closing)
    ) {
      return normalized.slice(opening.length, -closing.length).trim();
    }
  }
  return normalized;
}

function retentionEvidenceSpecificityScore(value: string) {
  const text = normalizePolicyReviewExcerpt(value);
  let score = Math.min(10, Math.floor(text.length / 60));
  if (/\b(?:retain|retained|retaining|keep|kept|storage period|retention period|delete|deleted|erase|anonymi[sz]e)\b/i.test(text)) score += 8;
  if (/\b(?:as long as necessary|for the purposes?|account remains active|entire duration|after you close|no longer than|until|within\s+\d+)\b/i.test(text)) score += 14;
  if (/\b(?:tax|accounting|legal claims?|disputes?|fraud|security|contractual|statutory retention obligations?)\b/i.test(text)) score += 12;
  if (/\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:days?|months?|years?)\b/i.test(text)) score += 16;
  return score;
}

function isTopicRelevantRetentionExcerpt(value: string) {
  const text = normalizePolicyReviewExcerpt(value);
  if (!text) return false;
  if (
    /\b(?:data rollover|rollover data|monthly data|data included in (?:the|your) plan|mobile data|internet data)\b/i.test(text) &&
    !/\b(?:personal (?:data|information)|privacy|retention|retain(?:ed|ing|s)?)\b/i.test(text)
  ) {
    return false;
  }
  return /\bretention periods?\b/i.test(text) ||
    (/\bstorage periods?\b/i.test(text) &&
      /\b(?:personal (?:data|information)|user (?:data|information)|customer (?:data|information)|records?)\b/i.test(text)) ||
    /\bretain(?:ed|ing|s)?\b.{0,220}\b(?:for|as long as|no longer than|until|necessary|required by law|legal obligation|purpose for which)\b/i.test(text) ||
    /\b(?:delete|erase|anonymi[sz]e)(?:d|s|ing)?\b.{0,180}\b(?:after|at the end|when|once|no longer|within\s+\d+)\b/i.test(text) ||
    /\b(?:kept|stored)\b.{0,180}\b(?:for|as long as|until|necessary|required by law)\b/i.test(text);
}

function boundedRetentionExcerpt(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  const anchors = [
    /\bHow Long Do We Keep Your Personal Information\??/i,
    /\bAdditional Information About Data Retention\b/i,
    /\b(?:we|you) (?:keep|retain) (?:your |the )?(?:personal )?(?:information|data)\b/i,
    /\b(?:your |the )?(?:personal )?(?:information|data) (?:is|will be) (?:deleted|erased|anonymi[sz]ed)\b/i,
    /\b(?:retention|storage) period\b/i,
  ];
  let best = "";
  for (const anchor of anchors) {
    const matches = normalized.matchAll(new RegExp(anchor.source, "gi"));
    for (const match of matches) {
      if (match.index === undefined) continue;
      const excerpt = normalized.slice(
        match.index,
        Math.min(normalized.length, match.index + 760),
      );
      if (retentionEvidenceSpecificityScore(excerpt) > retentionEvidenceSpecificityScore(best)) {
        best = excerpt;
      }
    }
  }
  if (best.length <= 600) return best.trim();
  const bounded = best.slice(0, 600);
  const lastSentenceBoundary = Math.max(
    bounded.lastIndexOf(". "),
    bounded.lastIndexOf("; "),
    bounded.lastIndexOf("? "),
    bounded.lastIndexOf("! "),
  );
  if (lastSentenceBoundary >= 180) {
    return bounded.slice(0, lastSentenceBoundary + 1).trim();
  }
  const lastWordBoundary = bounded.lastIndexOf(" ");
  return bounded.slice(0, Math.max(1, lastWordBoundary)).trim();
}

function canonicalRetentionEvidence(
  row: PolicyModelReviewRow,
  packet: PolicyReviewPacket,
): CanonicalRetainedTopicEvidence | null {
  const referencedIds = new Set(row.sourceDocumentIds);
  const documents = packet.documents
    .filter((document) =>
      isTargetPolicyDocument(document) &&
      document.documentFetchState === "fetched" &&
      document.documentEvaluationState === "usable"
    )
    .sort((left, right) =>
      Number(referencedIds.has(right.documentId)) - Number(referencedIds.has(left.documentId))
    );
  const currentExcerpt = normalizePolicyReviewExcerpt(
    row.evidenceExcerpts[0] ?? row.conflictingExcerpts[0] ?? "",
  );
  let selected: CanonicalRetainedTopicEvidence | null = isTopicRelevantRetentionExcerpt(currentExcerpt)
    ? {
        excerpt: currentExcerpt,
        provenance: "review_excerpt",
        sourceDocumentId: row.sourceDocumentIds[0] ?? "",
        sourceUrl: row.sourceUrls[0] ?? "",
      }
    : null;
  for (const document of documents) {
    const excerpt = boundedRetentionExcerpt(document.text);
    if (
      isTopicRelevantRetentionExcerpt(excerpt) &&
      retentionEvidenceSpecificityScore(excerpt) >
        retentionEvidenceSpecificityScore(selected?.excerpt ?? "")
    ) {
      selected = {
        excerpt,
        provenance: "verified_retained_packet",
        sourceDocumentId: document.documentId,
        sourceUrl: document.canonicalUrl,
      };
    }
  }
  return selected;
}

type CanonicalRetainedTopicEvidence = {
  excerpt: string;
  provenance: "review_excerpt" | "verified_retained_packet";
  sourceDocumentId: string;
  sourceUrl: string;
};

function canonicalRetainedTopicEvidence(
  row: PolicyModelReviewRow,
  packet: PolicyReviewPacket,
  topic:
    | "processing_purposes"
    | "legal_basis"
    | "international_transfers"
    | "recipients_or_vendor_categories"
    | "data_subject_rights",
): CanonicalRetainedTopicEvidence | null {
  const retainedEvidenceText = [
    ...row.evidenceExcerpts,
    ...row.conflictingExcerpts,
  ].join("\n");
  if (
    classifyGdprTransparencyTopics({ text: retainedEvidenceText }).matches.some(
      (match) => match.topic === topic,
    )
  ) {
    return {
      excerpt: row.evidenceExcerpts[0] ?? row.conflictingExcerpts[0] ?? "",
      provenance: "review_excerpt",
      sourceDocumentId: row.sourceDocumentIds[0] ?? "",
      sourceUrl: row.sourceUrls[0] ?? "",
    };
  }

  const coverageArea = Object.entries(POLICY_TOPIC_TO_COVERAGE_AREA)
    .find(([, area]) => area === topic)?.[1];
  if (!coverageArea) {
    return null;
  }

  for (const sourceDocumentId of row.sourceDocumentIds) {
    const document = packet.documents.find((candidate) =>
      candidate.documentId === sourceDocumentId
    );
    if (
      !document ||
      !isTargetPolicyDocument(document) ||
      document.documentFetchState !== "fetched" ||
      document.documentEvaluationState !== "usable"
    ) {
      continue;
    }
    const retainedEvidence = document.extractedCandidates.retained_article13_section_evidence;
    if (!Array.isArray(retainedEvidence)) {
      continue;
    }
    for (const entry of retainedEvidence) {
      const evidence = getRecord(entry);
      const excerpt = getString(evidence.selectedPolicySectionExcerpt);
      const sourceUrl = getString(evidence.selectedPolicySectionUrl) ?? document.canonicalUrl;
      if (
        getString(evidence.coverageArea) === coverageArea &&
        getString(evidence.signalObserved) === "observed" &&
        getString(evidence.selectedEvidenceStrength) === "strong" &&
        excerpt &&
        excerpt.length >= 30
      ) {
        return {
          excerpt: excerpt.slice(0, 360),
          provenance: "verified_retained_packet",
          sourceDocumentId: document.documentId,
          sourceUrl,
        };
      }
    }
  }
  return null;
}

function hasSubstantiveDataSubjectRightsEvidence(packet: PolicyReviewPacket) {
  const policyText = packet.documents.map((document) => document.text).join("\n");
  return [
    /\bright to (?:access|rectif|correct|erase|erasure|delete|object|restrict|restriction|portability|data portability)\b/i,
    /\brights? to (?:request|obtain)\b.{0,100}\b(?:access|copy|correct|rectif|delete|erase|restrict|port)\b/i,
    /\bright of (?:access|rectification|erasure|objection|restriction|data portability)\b/i,
    /\byou (?:can|may) (?:request |obtain )?access your (?:personal )?(?:information|data)\b/i,
    /\b(?:request|ask us to)\b.{0,100}\b(?:access|copy|correct|rectif|delete|erase|restrict|port)\b/i,
    /\blodge (?:a )?complaint\b/i,
    /\bcomplain to (?:a |the )?(?:supervisory authority|data protection authority|regulator)\b/i
  ].some((pattern) => pattern.test(policyText));
}

function enforcePolicyReviewInvariants(
  rows: PolicyModelReviewRow[],
  packet: PolicyReviewPacket
) {
  const policyIdentifiers = policyCookieIdentifiers(packet);
  const runtimeIdentifiers = runtimeCookieIdentifiers(packet);
  const cookieIdentifiers = [...new Set([...policyIdentifiers, ...runtimeIdentifiers])];
  const enforcedRows = rows.map((row): PolicyModelReviewRow => {
    const referencedDocuments = row.sourceDocumentIds.flatMap((documentId) => {
      const document = packet.documents.find((candidate) =>
        candidate.documentId === documentId
      );
      return document ? [document] : [];
    });
    if (
      ["observed", "conflicting"].includes(row.status) &&
      referencedDocuments.length > 0 &&
      referencedDocuments.every((document) => !isTargetPolicyDocument(document)) &&
      row.topic !== "cookie_inventory"
    ) {
      return insufficientCoverageRow(
        row,
        "cited_policy_sources_not_attributed_to_target",
        "The retained passages were not attributed to the scanned organization or a confirmed first-party brand, so they cannot establish this target-policy result.",
      );
    }
    if (
      row.status === "not_observed_with_sufficient_coverage" &&
      !topicCoverageIsSufficient(packet, row.topic)
    ) {
      return insufficientCoverageRow(
        row,
        "sufficient_coverage_precondition_not_met",
        "The retained evidence does not establish complete, usable coverage of the governing source required to support an absence conclusion.",
      );
    }
    if (conflictIsOnlyFrameworkValidity(row, packet)) {
      return policyModelReviewRowSchema.parse({
        ...row,
        status: "observed",
        confidence: Math.max(0.85, row.confidence),
        conflictingExcerpts: [],
        reasonCodes: [
          ...new Set([
            ...row.reasonCodes.filter((code) => !/conflict/i.test(code)),
            "international_transfer_disclosure_observed",
            "framework_validity_reported_separately",
          ]),
        ].slice(0, 20),
        rationale:
          "International-transfer disclosure was retained. Any outdated or invalidated transfer-framework reference is reported as a separate deterministic review signal.",
      });
    }
    if (row.topic === "policy_runtime_consistency") {
      if (!topicCoverageIsSufficient(packet, row.topic)) {
        return insufficientCoverageRow(
          row,
          "policy_runtime_comparison_precondition_not_met",
          "A reliable policy/runtime comparison requires a governing target policy, usable runtime coverage, and directly comparable retained evidence.",
        );
      }
      const normalizedStatus = row.status === "not_observed_with_sufficient_coverage"
        ? "ambiguous" as const
        : row.status;
      return policyModelReviewRowSchema.parse({
        ...row,
        status: normalizedStatus,
        comparisonOutcome: comparisonOutcomeForStatus(normalizedStatus),
        reasonCodes: [
          ...new Set([
            ...row.reasonCodes,
            "typed_policy_runtime_comparison",
          ]),
        ].slice(0, 20),
      });
    }
    if (row.topic === "data_retention" && row.status === "observed" && !hasSubstantiveRetentionEvidence(packet)) {
      if (!topicCoverageIsSufficient(packet, row.topic)) {
        return insufficientCoverageRow(
          row,
          "retention_evidence_truncated_or_incomplete",
          "The retained retention section ended before a period or substantive criterion was captured, so the result cannot be determined from retained evidence.",
        );
      }
      return policyModelReviewRowSchema.parse({
        ...row,
        status: "ambiguous",
        confidence: Math.min(row.confidence, 0.8),
        sourceDocumentIds: [],
        sourceUrls: [],
        evidenceExcerpts: [],
        conflictingExcerpts: [],
        reasonCodes: ["generic_retention_mention_without_period_or_criteria"],
        rationale: "A generic reference to retaining data does not establish a retention period or substantive retention criteria."
      });
    }
    if (row.topic === "data_retention" && row.status === "observed") {
      const canonicalEvidence = canonicalRetentionEvidence(row, packet);
      if (canonicalEvidence) {
        return policyModelReviewRowSchema.parse({
          ...row,
          sourceDocumentIds: canonicalEvidence.sourceDocumentId
            ? [canonicalEvidence.sourceDocumentId]
            : row.sourceDocumentIds,
          sourceUrls: canonicalEvidence.sourceUrl
            ? [canonicalEvidence.sourceUrl]
            : row.sourceUrls,
          evidenceExcerpts: canonicalEvidence.excerpt
            ? [canonicalEvidence.excerpt]
            : row.evidenceExcerpts,
          reasonCodes: [
            ...new Set([
              ...row.reasonCodes,
              canonicalEvidence.provenance === "verified_retained_packet"
                ? "verified_retention_passage_selected"
                : "review_retention_passage_normalized",
            ]),
          ].slice(0, 20),
        });
      }
      return policyModelReviewRowSchema.parse({
        ...row,
        status: "ambiguous",
        confidence: Math.min(row.confidence, 0.8),
        sourceDocumentIds: [],
        sourceUrls: [],
        evidenceExcerpts: [],
        conflictingExcerpts: [],
        reasonCodes: [
          ...new Set([
            ...row.reasonCodes,
            "retention_excerpt_not_topic_relevant",
          ]),
        ].slice(0, 20),
        rationale:
          "The proposed passage did not contain topic-relevant personal-data retention evidence, so no observed retention credit is projected.",
      });
    }
    const canonicalTopic = row.topic === "processing_purposes"
      ? "processing_purposes" as const
      : row.topic === "legal_basis"
        ? "legal_basis" as const
        : row.topic === "international_transfers"
          ? "international_transfers" as const
          : row.topic === "vendor_disclosures"
            ? "recipients_or_vendor_categories" as const
          : null;
    if (
      canonicalTopic &&
      row.status === "observed"
    ) {
      const canonicalEvidence = canonicalRetainedTopicEvidence(row, packet, canonicalTopic);
      if (canonicalEvidence) {
        return policyModelReviewRowSchema.parse({
          ...row,
          sourceDocumentIds: canonicalEvidence.sourceDocumentId
            ? [canonicalEvidence.sourceDocumentId]
            : row.sourceDocumentIds,
          sourceUrls: canonicalEvidence.sourceUrl ? [canonicalEvidence.sourceUrl] : row.sourceUrls,
          evidenceExcerpts: canonicalEvidence.excerpt ? [canonicalEvidence.excerpt] : row.evidenceExcerpts,
          reasonCodes: [
            ...new Set([
              ...row.reasonCodes,
              canonicalEvidence.provenance === "verified_retained_packet"
                ? "verified_retained_topic_evidence"
                : "review_excerpt_topic_evidence_verified",
            ]),
          ].slice(0, 20),
        });
      }
      return policyModelReviewRowSchema.parse({
        ...row,
        status: "ambiguous",
        confidence: Math.min(row.confidence, 0.8),
        sourceDocumentIds: [],
        sourceUrls: [],
        evidenceExcerpts: [],
        conflictingExcerpts: [],
        reasonCodes: [`${row.topic}_topic_relevance_not_deterministically_confirmed`],
        rationale:
          `Retained text did not meet the canonical relevance floor for ${POLICY_REVIEW_TOPIC_DEFINITIONS[row.topic].displayLabel}; nearby or disclosure-shaped wording is not sufficient.`,
      });
    }
    if (
      row.topic === "data_subject_rights" &&
      row.status === "observed" &&
      !hasSubstantiveDataSubjectRightsEvidence(packet) &&
      !canonicalRetainedTopicEvidence(row, packet, "data_subject_rights")
    ) {
      if (!topicCoverageIsSufficient(packet, row.topic)) {
        return insufficientCoverageRow(
          row,
          "rights_evidence_truncated_or_incomplete",
          "The retained evidence does not completely capture the governing rights section, so substantive rights coverage cannot be determined.",
        );
      }
      return policyModelReviewRowSchema.parse({
        ...row,
        status: "ambiguous",
        confidence: Math.min(row.confidence, 0.8),
        sourceDocumentIds: [],
        sourceUrls: [],
        evidenceExcerpts: [],
        conflictingExcerpts: [],
        reasonCodes: ["preference_or_opt_out_language_without_substantive_rights"],
        rationale: "Email unsubscribe or advertising opt-out language does not establish substantive data-subject rights such as access, correction, deletion, objection, portability, or complaint rights."
      });
    }
    if (row.topic !== "cookie_inventory") {
      return row;
    }
    if (cookieIdentifiers.length > 0) {
      const sourceReasonCodes = [
        ...(policyIdentifiers.length > 0 ? ["policy_cookie_name_observed"] : []),
        ...(runtimeIdentifiers.length > 0 ? ["runtime_cookie_storage_name_observed"] : [])
      ];
      return policyModelReviewRowSchema.parse({
        ...row,
        status: "observed",
        confidence: Math.max(
          row.confidence,
          runtimeIdentifiers.length > 0 && !runtimeCoverageIsUsable(packet) ? 0.85 : 0.95,
        ),
        evidenceExcerpts: row.evidenceExcerpts.length > 0
          ? row.evidenceExcerpts
          : [`Retained cookie/storage names: ${cookieIdentifiers.slice(0, 20).join(", ")}.`],
        reasonCodes: [
          ...new Set([
            ...row.reasonCodes,
            "retained_cookie_storage_name_observed",
            ...sourceReasonCodes
          ])
        ].slice(0, 20),
        rationale:
          `The scan retained ${cookieIdentifiers.length} identifiable cookie/storage name${cookieIdentifiers.length === 1 ? "" : "s"} from ${policyIdentifiers.length > 0 && runtimeIdentifiers.length > 0 ? "policy and runtime evidence" : policyIdentifiers.length > 0 ? "policy evidence" : "runtime evidence"}.`
      });
    }
    if (row.status !== "observed") {
      return row;
    }
    const sufficientCoverage = topicCoverageIsSufficient(packet, row.topic) ||
      hasSufficientCookiePolicyCoverage(packet);
    return policyModelReviewRowSchema.parse({
      ...row,
      status: sufficientCoverage
        ? "not_observed_with_sufficient_coverage"
        : "insufficient_retained_evidence",
      confidence: Math.min(row.confidence, sufficientCoverage ? 0.9 : 0.75),
      sourceDocumentIds: [],
      sourceUrls: [],
      evidenceExcerpts: [],
      conflictingExcerpts: [],
      reasonCodes: [
        "deterministic_cookie_storage_name_required",
        sufficientCoverage
          ? "retained_cookie_categories_without_named_identifiers"
          : "cookie_storage_name_coverage_not_retained"
      ],
      rationale: sufficientCoverage
        ? "Retained cookie-policy evidence did not contain a typed or directly named cookie identifier; categories alone do not establish a named-cookie inventory."
        : "The retained evidence did not contain an identifiable cookie or storage name."
    });
  });
  return enforcedRows.map((row) =>
    policyModelReviewRowSchema.parse({
      ...row,
      reasonCodes: [
        ...new Set([
          ...row.reasonCodes,
          "policy_review_invariants_applied_v1"
        ])
      ].slice(0, 20)
    })
  );
}

function parseRows(
  raw: string,
  packet: PolicyReviewPacket,
  topics: readonly PolicyReviewTopic[] = POLICY_REVIEW_TOPICS,
): PolicyModelReviewRow[] {
  const parsed = JSON.parse(raw) as { rows?: unknown };
  if (typeof parsed.rows !== "object" || parsed.rows === null || Array.isArray(parsed.rows)) {
    throw new Error("Structured policy review output did not include the required topic map.");
  }
  const rowMap = parsed.rows as Record<string, unknown>;
  const retainedSourceUrls = new Set(
    packet.documents.map((document) => document.canonicalUrl),
  );
  const rows = topics.map((topic) => {
    const candidate = getRecord(rowMap[topic]);
    const candidateSourceUrls = Array.isArray(candidate.sourceUrls)
      ? candidate.sourceUrls.filter((value): value is string => typeof value === "string")
      : [];
    const verifiedSourceUrls = candidateSourceUrls.filter((value) =>
      retainedSourceUrls.has(value)
    );
    const candidateReasonCodes = Array.isArray(candidate.reasonCodes)
      ? candidate.reasonCodes.filter((value): value is string => typeof value === "string")
      : [];
    const row = policyModelReviewRowSchema.parse({
      ...candidate,
      reasonCodes: [...new Set([
        ...candidateReasonCodes,
        ...(verifiedSourceUrls.length < candidateSourceUrls.length
          ? ["unverified_source_url_removed"]
          : []),
      ])].slice(0, 20),
      sourceUrls: verifiedSourceUrls,
      topic
    });
    return policyModelReviewRowSchema.parse({
      ...row,
      evidenceExcerpts: row.evidenceExcerpts.map(normalizePolicyReviewExcerpt),
      conflictingExcerpts: row.conflictingExcerpts.map(normalizePolicyReviewExcerpt),
    });
  });
  return enforcePolicyReviewInvariants(rows, packet);
}

function buildFailureArtifact(input: {
  cacheKey: string;
  failureReason: string;
  mode: "shadow" | "enforced";
  model: string;
  packet: PolicyReviewPacket;
  startedAt: number;
}): PolicyModelReviewArtifact {
  return policyModelReviewArtifactSchema.parse({
    contractVersion: POLICY_MODEL_REVIEW_CONTRACT_VERSION,
    mode: input.mode,
    status: "failed",
    scanId: input.packet.scanId,
    cacheKey: input.cacheKey,
    rows: [],
    deterministicLegalFrameworkSignals: deriveDeterministicLegalFrameworkSignals(input.packet),
    deterministicPolicyReviewSignals: deriveDeterministicPolicyReviewSignals(input.packet),
    failureReason: input.failureReason,
    provenance: {
      role: "review",
      provider: "openai",
      requestedModel: input.model,
      resolvedModel: input.model,
      taskType: "policy_semantic_review",
      promptVersion: POLICY_MODEL_REVIEW_PROMPT_VERSION,
      schemaVersion: POLICY_REVIEW_SCHEMA_VERSION,
      inputRefs: input.packet.documents.map((document) => document.documentId),
      outputRefs: [],
      contentHash: input.packet.contentHash,
      confidence: null,
      reasonCodes: ["model_review_failed"],
      uncertaintyNotes: [input.failureReason.slice(0, 500)],
      latencyMs: Date.now() - input.startedAt,
      usedForProductionProjection: false
    },
    productionEligible: false
  });
}

function responseOutputText(payload: {
  output?: Array<{
    content?: Array<{
      refusal?: string;
      text?: string;
      type?: string;
    }>;
    type?: string;
  }>;
  output_text?: string;
}) {
  if (typeof payload.output_text === "string" && payload.output_text.length > 0) {
    return payload.output_text;
  }
  for (const output of payload.output ?? []) {
    if (output.type !== "message") {
      continue;
    }
    for (const content of output.content ?? []) {
      if (content.type === "refusal" && content.refusal) {
        throw new Error(`OpenAI policy review was refused: ${content.refusal.slice(0, 500)}`);
      }
      if (content.type === "output_text" && content.text) {
        return content.text;
      }
    }
  }
  throw new Error("OpenAI policy review did not return structured output text.");
}

export async function reviewPolicyPacketWithModel(input: {
  apiKey?: string;
  candidateArtifact?: PolicyModelReviewArtifact;
  fetchImpl?: FetchLike;
  mode: "shadow" | "enforced";
  model: string;
  packet: PolicyReviewPacket;
  reviewPhase?: "full" | "static" | "runtime_delta" | "escalated" | "critic";
  transportPacket?: PolicyReviewPacket;
  topics?: readonly PolicyReviewTopic[];
}): Promise<PolicyModelReviewArtifact> {
  const startedAt = Date.now();
  const topics = input.topics ?? POLICY_REVIEW_TOPICS;
  const cacheKey = buildPolicyReviewCacheKey({
    candidateReviewCacheKey: input.candidateArtifact?.cacheKey,
    contentHash: input.transportPacket?.contentHash ?? input.packet.contentHash,
    model: input.model,
    reviewPhase: input.reviewPhase,
  });
  if (!input.apiKey) {
    return buildFailureArtifact({
      cacheKey,
      failureReason: "OPENAI_API_KEY is not configured.",
      mode: input.mode,
      model: input.model,
      packet: input.packet,
      startedAt
    });
  }

  try {
    const useResponsesApi = /^gpt-5\.6(?:-|$)/.test(input.model);
    const reasoningEffort = input.reviewPhase === "static" ? "low" : null;
    const boundedEscalationTransport = input.reviewPhase === "escalated";
    const criticReview = input.reviewPhase === "critic";
    const reviewInput = JSON.stringify({
      ...buildPolicyReviewInput(input.transportPacket ?? input.packet),
      ...(input.candidateArtifact
        ? {
            candidateReview: input.candidateArtifact.rows.map((row) => ({
              confidence: row.confidence,
              evidenceExcerpts: row.evidenceExcerpts,
              reasonCodes: row.reasonCodes,
              status: row.status,
              topic: row.topic,
            })),
          }
        : {}),
      ...(boundedEscalationTransport
        ? {
            transport: {
              boundedPassageProjection: true,
              fullRetainedContentHash: input.packet.contentHash,
              transportContentHash: input.transportPacket?.contentHash ?? input.packet.contentHash,
            },
          }
        : {}),
    });
    const maxCompletionTokens = input.reviewPhase === "runtime_delta"
      ? 2_200
      : input.reviewPhase === "escalated"
        ? Math.min(6_000, Math.max(1_200, topics.length * 800))
        : 6_000;
    const response = await (input.fetchImpl ?? fetch)(
      useResponsesApi ? OPENAI_RESPONSES_API_URL : OPENAI_API_URL,
      {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(
        useResponsesApi
          ? {
            model: input.model,
            instructions: buildSystemPrompt(topics, boundedEscalationTransport, criticReview),
            input: reviewInput,
            max_output_tokens: maxCompletionTokens,
            reasoning: { effort: reasoningEffort ?? "medium" },
            text: {
              format: {
                type: "json_schema",
                name: "policy_semantic_review",
                strict: true,
                schema: policyReviewJsonSchemaFor(topics)
              }
            }
          }
          : {
            model: input.model,
            max_completion_tokens: maxCompletionTokens,
            ...(reasoningEffort
              ? { reasoning_effort: reasoningEffort }
              : { temperature: 0 }),
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "policy_semantic_review",
                strict: true,
                schema: policyReviewJsonSchemaFor(topics)
              }
            },
            messages: [
              { role: "system", content: buildSystemPrompt(topics, boundedEscalationTransport, criticReview) },
              {
                role: "user",
                content: reviewInput
              }
            ]
          }
      )
    });
    if (!response.ok) {
      throw new Error(`OpenAI policy review failed with ${response.status}: ${(await response.text()).slice(0, 500)}`);
    }
    const payload = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      incomplete_details?: unknown;
      model?: string;
      output?: Array<{
        content?: Array<{
          refusal?: string;
          text?: string;
          type?: string;
        }>;
        type?: string;
      }>;
      output_text?: string;
      status?: string;
      usage?: {
        completion_tokens?: number;
        input_tokens?: number;
        output_tokens?: number;
        prompt_tokens?: number;
        total_tokens?: number;
        input_tokens_details?: { cached_tokens?: number };
        prompt_tokens_details?: { cached_tokens?: number };
      };
    };
    if (useResponsesApi && payload.status !== "completed") {
      throw new Error(
        `OpenAI policy review response was ${payload.status ?? "unknown"}: ${JSON.stringify(payload.incomplete_details ?? null).slice(0, 500)}`
      );
    }
    const rawOutput = useResponsesApi
      ? responseOutputText(payload)
      : payload.choices?.[0]?.message?.content ?? "";
    const rows = parseRows(rawOutput, input.packet, topics);
    const usage: ReviewUsage = {
      cachedPromptTokens:
        payload.usage?.prompt_tokens_details?.cached_tokens ??
        payload.usage?.input_tokens_details?.cached_tokens ??
        null,
      completionTokens:
        payload.usage?.completion_tokens ??
        payload.usage?.output_tokens ??
        null,
      promptTokens:
        payload.usage?.prompt_tokens ??
        payload.usage?.input_tokens ??
        null,
      totalTokens: payload.usage?.total_tokens ?? null
    };

    return policyModelReviewArtifactSchema.parse({
      contractVersion: POLICY_MODEL_REVIEW_CONTRACT_VERSION,
      mode: input.mode,
      status: "completed",
      scanId: input.packet.scanId,
      cacheKey,
      rows,
      deterministicLegalFrameworkSignals: deriveDeterministicLegalFrameworkSignals(input.packet),
      deterministicPolicyReviewSignals: deriveDeterministicPolicyReviewSignals(input.packet),
      failureReason: null,
      provenance: {
        role: "review",
        provider: "openai",
        requestedModel: input.model,
        resolvedModel: payload.model ?? input.model,
        taskType: input.reviewPhase === "static"
          ? "policy_semantic_static_review"
          : input.reviewPhase === "runtime_delta"
            ? "policy_semantic_runtime_delta_review"
            : input.reviewPhase === "escalated"
              ? "policy_semantic_escalation_review"
              : input.reviewPhase === "critic"
                ? "policy_semantic_critic_review"
              : "policy_semantic_review",
        promptVersion: POLICY_MODEL_REVIEW_PROMPT_VERSION,
        schemaVersion: POLICY_REVIEW_SCHEMA_VERSION,
        inputRefs: input.packet.documents.map((document) => document.documentId),
        outputRefs: rows.flatMap((row) => row.sourceDocumentIds).slice(0, 100),
        contentHash: input.packet.contentHash,
        confidence: rows.length > 0
          ? rows.reduce((sum, row) => sum + row.confidence, 0) / rows.length
          : null,
        reasonCodes: [
          "shadow_review_only",
          `policy_review_phase_${input.reviewPhase ?? "full"}`,
          `reasoning_effort_${reasoningEffort ?? "model_default"}`,
          ...(useResponsesApi
            ? ["responses_api"]
            : [])
        ],
        uncertaintyNotes: [],
        latencyMs: Date.now() - startedAt,
        promptTokens: usage.promptTokens,
        cachedPromptTokens: usage.cachedPromptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
        usedForProductionProjection: false
      },
      productionEligible: false
    });
  } catch (error) {
    return buildFailureArtifact({
      cacheKey,
      failureReason: error instanceof Error ? error.message : "Unknown policy review failure.",
      mode: input.mode,
      model: input.model,
      packet: input.packet,
      startedAt
    });
  }
}

export const reviewPolicyPacketWithMini = reviewPolicyPacketWithModel;

export function summarizePolicyReviewArtifact(artifact: PolicyModelReviewArtifact) {
  const statusCounts = Object.fromEntries(
    [
      "observed",
      "not_observed_with_sufficient_coverage",
      "ambiguous",
      "conflicting",
      "insufficient_retained_evidence"
    ].map((status) => [status, artifact.rows.filter((row) => row.status === status).length])
  );
  return {
    rowCount: artifact.rows.length,
    statusCounts,
    deterministicLegalFrameworkSignalCount: artifact.deterministicLegalFrameworkSignals.length,
    deterministicPolicyReviewSignalCount: artifact.deterministicPolicyReviewSignals.length,
    latencyMs: artifact.provenance.latencyMs,
    promptTokens: artifact.provenance.promptTokens,
    cachedPromptTokens: artifact.provenance.cachedPromptTokens,
    completionTokens: artifact.provenance.completionTokens,
    totalTokens: artifact.provenance.totalTokens,
    productionEligible: artifact.productionEligible
  };
}
