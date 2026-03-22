import {
  getReportUnifiedFinding,
  getReportUnifiedFindingByAlias,
  getReportUnifiedFindingForSignal,
  getReportUnifiedFindingForValidationRule,
  type ReportSignalSource,
  type ReportUnifiedFindingCategoryAlignment
} from "@website-signal-risk-scanner/shared";
import {
  buildCanonicalReviewFindingPresentation,
  normalizeFindingName,
  type CanonicalReviewFindingPresentation,
  type ReviewFindingSeverity
} from "./canonical-review-finding";
import {
  findValidationFindingForKeys,
  type ScanValidationFinding
} from "./validation-review-linking";

export type UnifiedFindingDetails =
  | {
      family: "coverage_gap";
      gapKind: "surface_missing" | "fetch_failed" | "bounded_discovery_unresolved";
      pageType: string;
      attemptCount?: number | null;
      attemptedUrls?: string[];
      bestDiscoverySource?: string | null;
      guessedOnly?: boolean | null;
      stopReason?: string | null;
    }
  | {
      family: "policy_extraction";
      kind: string;
      pageType?: string;
      confidence?: number | null;
      ambiguityScore?: number | null;
    }
  | {
      family: "rights_gap";
      kind: string;
      frictionScore?: number | null;
      unmatchedItems?: string[];
    }
  | {
      family: "contradiction";
      kind: string;
      claim?: string | null;
      observedBehavior?: string | null;
      vendors?: string[];
    }
  | {
      family: "consent_tracking";
      kind: string;
      vendors?: string[];
      requestUrls?: string[];
    }
  | {
      family: "sensitive_data";
      kind: string;
      dataTypes?: string[];
    }
  | {
      family: "commercial";
      kind: string;
    }
  | {
      family: "accessibility";
      kind: string;
      ruleExamples?: string[];
    };

export type UnifiedFindingPacket = {
  unifiedFindingId: string;
  title: string;
  severity: ReviewFindingSeverity;
  summary: string;
  confidenceBand: "high" | "moderate" | "low";
  confidenceInputs: {
    evidenceQualityFlags: string[];
    hasConcretePayloadEvidence: boolean;
    hasDirectRuntimeEvidence: boolean;
    hasKeyPageDiscoveryEvidence: boolean;
    hasPolicyTextEvidence: boolean;
    hasStructuredValidationEvidence: boolean;
    isFallbackOnly: boolean;
    issueCount: number;
    signalCount: number;
    sourceCount: number;
    sourceKinds: Array<"issue" | "signal" | "validation">;
    validationCount: number;
  };
  categoryAlignments: ReportUnifiedFindingCategoryAlignment[];
  sourceRefs: Array<
    | { kind: "signal"; key: string; label?: string; source: ReportSignalSource }
    | { kind: "validation"; ruleKey: string; title?: string }
    | { kind: "issue"; title: string }
  >;
  evidence?: {
    counts?: Record<string, number>;
    entities?: Record<string, string[]>;
    flags?: string[];
    pageUrls?: string[];
    snippets?: string[];
    sourceUrls?: string[];
  };
  details?: UnifiedFindingDetails;
};

export type UnifiedFindingCandidate = {
  categoryId?: string;
  description: string;
  evidence?: string[];
  fallbackEvidence?: Record<string, unknown>;
  linkedValidationFinding?: ScanValidationFinding | null;
  observedValue: string | null;
  severity: ReviewFindingSeverity;
  sourceType: "issue" | "signal";
  signalKey?: string;
  signalLabel?: string;
  signalSource?: ReportSignalSource;
  title: string;
};

export type UnifiedFindingDisplayPacket = UnifiedFindingPacket & {
  linkedValidationFinding: ScanValidationFinding | null;
  observedValue: string | null;
  presentation: CanonicalReviewFindingPresentation;
  referenceLabel?: string;
  referenceUrl?: string;
  sourceLabel?: string;
  sourceUrl?: string;
};

const COVERAGE_FINDING_IDS = new Set([
  "privacy_policy_missing_surface",
  "privacy_policy_unavailable",
  "terms_missing_surface",
  "terms_unavailable",
  "cookie_policy_missing_surface",
  "cookie_policy_unavailable",
  "accessibility_statement_missing_surface",
  "accessibility_statement_unavailable",
  "contact_page_missing_surface",
  "contact_page_unavailable",
  "bounded_key_page_discovery_unresolved"
]);

const POLICY_EXTRACTION_FINDING_IDS = new Set([
  "low_confidence_policy_extraction",
  "policy_extraction_provider_error",
  "disclosure_likely_obstructed",
  "cookie_policy_structurally_obstructed",
  "policy_clarity_risk",
  "rule_only_policy_row_present"
]);

const RIGHTS_GAP_FINDING_IDS = new Set([
  "missing_dsar_mechanism",
  "missing_dsar_high_exposure",
  "rights_fulfillment_friction",
  "cookie_disclosure_gap",
  "missing_retention_disclosure",
  "missing_transfer_disclosure"
]);

const CONTRADICTION_FINDING_IDS = new Set([
  "policy_behavior_conflict",
  "consent_gated_tracking_claim_conflict",
  "do_not_sell_sharing_disclosure_conflict",
  "privacy_terms_conflict",
  "privacy_cookie_policy_conflict",
  "functional_misalignment",
  "session_replay_undisclosed",
  "missing_technical_disclosure"
]);

const CONSENT_TRACKING_FINDING_IDS = new Set([
  "preconsent_tracking",
  "reject_did_not_reduce_tracking",
  "reject_did_not_reduce_third_party_cookies",
  "consent_surface_required_deeper_sweep",
  "accept_flow_unavailable_after_reject",
  "reject_button_missing",
  "accept_more_prominent_than_reject",
  "forced_consent_wall",
  "accept_only_banner",
  "dismiss_without_reject",
  "session_replay_observed",
  "retargeting_pixel_observed"
]);

const SENSITIVE_DATA_FINDING_IDS = new Set([
  "high_sensitivity_data_collection",
  "health_information_collection",
  "geolocation_collection",
  "ssn_collection",
  "government_id_collection",
  "financial_information_collection",
  "minors_or_age_gated_collection_context"
]);

const COMMERCIAL_FINDING_IDS = new Set([
  "discount_claim_present",
  "original_price_comparison_present",
  "limited_time_pressure",
  "store_credit_only_remedy",
  "restrictive_termination_or_suspension_terms"
]);

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
}

function getSeverityWeight(severity: ReviewFindingSeverity | null | undefined) {
  if (severity === "high") {
    return 3;
  }
  if (severity === "medium") {
    return 2;
  }
  return 1;
}

function maxSeverity(left: ReviewFindingSeverity, right: ReviewFindingSeverity): ReviewFindingSeverity {
  return getSeverityWeight(left) >= getSeverityWeight(right) ? left : right;
}

function getBestObservedValue(values: Array<string | null | undefined>) {
  return values.find((value): value is string => typeof value === "string" && value.trim().length > 0) ?? null;
}

function getFindingFamily(id: string): UnifiedFindingDetails["family"] {
  if (COVERAGE_FINDING_IDS.has(id)) {
    return "coverage_gap";
  }
  if (POLICY_EXTRACTION_FINDING_IDS.has(id)) {
    return "policy_extraction";
  }
  if (RIGHTS_GAP_FINDING_IDS.has(id)) {
    return "rights_gap";
  }
  if (CONTRADICTION_FINDING_IDS.has(id)) {
    return "contradiction";
  }
  if (CONSENT_TRACKING_FINDING_IDS.has(id)) {
    return "consent_tracking";
  }
  if (SENSITIVE_DATA_FINDING_IDS.has(id)) {
    return "sensitive_data";
  }
  if (COMMERCIAL_FINDING_IDS.has(id)) {
    return "commercial";
  }
  return "accessibility";
}

function getCoveragePageType(id: string) {
  if (id.startsWith("privacy_policy_")) {
    return "privacy_policy";
  }
  if (id.startsWith("terms_")) {
    return "terms_of_service";
  }
  if (id.startsWith("cookie_policy_")) {
    return "cookie_policy";
  }
  if (id.startsWith("accessibility_statement_")) {
    return "accessibility_statement";
  }
  if (id.startsWith("contact_page_")) {
    return "contact_page";
  }
  return "unknown";
}

function buildUnifiedFindingDetails(input: {
  fallbackEvidence?: Record<string, unknown> | null;
  findingId: string;
  linkedValidationFinding?: ScanValidationFinding | null;
  observedValue: string | null;
  summary: string;
}) {
  const family = getFindingFamily(input.findingId);

  if (family === "coverage_gap") {
    return {
      family,
      gapKind: input.findingId.endsWith("_unavailable")
        ? "fetch_failed"
        : input.findingId === "bounded_key_page_discovery_unresolved"
          ? "bounded_discovery_unresolved"
          : "surface_missing",
      pageType: getCoveragePageType(input.findingId),
      attemptCount:
        typeof input.fallbackEvidence?.keyPageAttemptCount === "number" ? input.fallbackEvidence.keyPageAttemptCount : null,
      attemptedUrls: Array.isArray(input.fallbackEvidence?.keyPageAttemptedUrls)
        ? input.fallbackEvidence.keyPageAttemptedUrls.filter((value): value is string => typeof value === "string")
        : [],
      bestDiscoverySource:
        typeof input.fallbackEvidence?.keyPageDiscoverySource === "string"
          ? input.fallbackEvidence.keyPageDiscoverySource
          : null,
      guessedOnly:
        typeof input.fallbackEvidence?.keyPageGuessedOnly === "boolean" ? input.fallbackEvidence.keyPageGuessedOnly : null,
      stopReason: typeof input.fallbackEvidence?.keyPageStopReason === "string" ? input.fallbackEvidence.keyPageStopReason : null
    } satisfies UnifiedFindingDetails;
  }

  if (family === "policy_extraction") {
    return {
      family,
      kind: input.findingId,
      confidence:
        typeof input.linkedValidationFinding?.systemConfidenceScore === "number"
          ? input.linkedValidationFinding.systemConfidenceScore
          : typeof input.fallbackEvidence?.signalValue === "number"
            ? input.fallbackEvidence.signalValue
            : null,
      ambiguityScore:
        typeof input.fallbackEvidence?.signalValue === "number" && input.findingId === "policy_clarity_risk"
          ? input.fallbackEvidence.signalValue
          : null
    } satisfies UnifiedFindingDetails;
  }

  if (family === "rights_gap") {
    return {
      family,
      kind: input.findingId,
      frictionScore:
        typeof input.fallbackEvidence?.consentFrictionDelta === "number"
          ? input.fallbackEvidence.consentFrictionDelta
          : typeof input.fallbackEvidence?.signalValue === "number"
            ? input.fallbackEvidence.signalValue
            : null,
      unmatchedItems: Array.isArray(input.linkedValidationFinding?.evidence?.unmatchedCookieNames)
        ? (input.linkedValidationFinding?.evidence?.unmatchedCookieNames as string[])
        : []
    } satisfies UnifiedFindingDetails;
  }

  if (family === "contradiction") {
    const vendors = uniqueStrings([
      ...(Array.isArray(input.linkedValidationFinding?.evidence?.runtimeVendors)
        ? (input.linkedValidationFinding?.evidence?.runtimeVendors as string[])
        : []),
      ...(Array.isArray(input.linkedValidationFinding?.evidence?.relatedVendors)
        ? (input.linkedValidationFinding?.evidence?.relatedVendors as string[])
        : [])
    ]);

    return {
      family,
      kind: input.findingId,
      claim: typeof input.linkedValidationFinding?.evidence?.claim === "string" ? input.linkedValidationFinding.evidence.claim : null,
      observedBehavior: input.summary,
      vendors
    } satisfies UnifiedFindingDetails;
  }

  if (family === "consent_tracking") {
    const vendors = uniqueStrings([
      ...(Array.isArray(input.linkedValidationFinding?.evidence?.preconsent_tracker_vendors)
        ? (input.linkedValidationFinding?.evidence?.preconsent_tracker_vendors as string[])
        : []),
      ...(Array.isArray(input.linkedValidationFinding?.evidence?.persisted_tracker_vendors)
        ? (input.linkedValidationFinding?.evidence?.persisted_tracker_vendors as string[])
        : [])
    ]);

    return {
      family,
      kind: input.findingId,
      vendors,
      requestUrls: uniqueStrings([
        ...(Array.isArray(input.linkedValidationFinding?.evidence?.preconsent_tracker_evidence_urls)
          ? (input.linkedValidationFinding?.evidence?.preconsent_tracker_evidence_urls as string[])
          : [])
      ])
    } satisfies UnifiedFindingDetails;
  }

  if (family === "sensitive_data") {
    return {
      family,
      kind: input.findingId,
      dataTypes: uniqueStrings(
        Array.isArray(input.fallbackEvidence?.sensitivePayloadViolations)
          ? (input.fallbackEvidence?.sensitivePayloadViolations as Array<Record<string, unknown>>).map((row) =>
              typeof row.detectedType === "string" ? row.detectedType : null
            )
          : []
      )
    } satisfies UnifiedFindingDetails;
  }

  if (family === "commercial") {
    return { family, kind: input.findingId } satisfies UnifiedFindingDetails;
  }

  if (family === "accessibility") {
    return {
      family,
      kind: input.findingId,
      ruleExamples: uniqueStrings(
        Array.isArray(input.fallbackEvidence?.accessibilityRuleExamples)
          ? (input.fallbackEvidence?.accessibilityRuleExamples as Array<Record<string, unknown>>).map((row) =>
              typeof row.ruleCode === "string" ? row.ruleCode : null
            )
          : []
      )
    } satisfies UnifiedFindingDetails;
  }

  return undefined;
}

function extractEvidenceFromFallback(fallbackEvidence?: Record<string, unknown> | null) {
  if (!fallbackEvidence) {
    return {
      counts: {} as Record<string, number>,
      entities: {} as Record<string, string[]>,
      flags: [] as string[],
      pageUrls: [] as string[],
      snippets: [] as string[],
      sourceUrls: [] as string[]
    };
  }

  const pageUrls = uniqueStrings([
    ...(Array.isArray(fallbackEvidence.pageUrls) ? (fallbackEvidence.pageUrls as string[]) : []),
    ...(Array.isArray(fallbackEvidence.keyPageAttemptedUrls) ? (fallbackEvidence.keyPageAttemptedUrls as string[]) : []),
    typeof fallbackEvidence.consentBlockerUrl === "string" ? fallbackEvidence.consentBlockerUrl : null
  ]);

  const sourceUrls = uniqueStrings([
    ...(Array.isArray(fallbackEvidence.keyPageAttemptedUrls) ? (fallbackEvidence.keyPageAttemptedUrls as string[]) : [])
  ]);

  const snippets = uniqueStrings([
    typeof fallbackEvidence.consentBlockerTextSnippet === "string" ? fallbackEvidence.consentBlockerTextSnippet : null
  ]);

  const counts: Record<string, number> = {};
  for (const key of [
    "consentFrictionDelta",
    "consentOptInClicks",
    "consentOptOutClicks",
    "keyPageAttemptCount"
  ]) {
    const value = fallbackEvidence[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      counts[key] = value;
    }
  }

  const entities: Record<string, string[]> = {};
  if (Array.isArray(fallbackEvidence.keyPageAttemptedUrls)) {
    entities.attemptedUrls = uniqueStrings(fallbackEvidence.keyPageAttemptedUrls as string[]);
  }

  const flags = uniqueStrings([
    fallbackEvidence.keyPageGuessedOnly === true ? "guessed_only" : null,
    fallbackEvidence.consentRedirectOrAuthRequired === true ? "redirect_or_auth_required" : null,
    typeof fallbackEvidence.signalKey === "string" ? fallbackEvidence.signalKey : null
  ]);

  return { counts, entities, flags, pageUrls, snippets, sourceUrls };
}

function extractEvidenceFromValidationFinding(finding?: ScanValidationFinding | null) {
  if (!finding?.evidence) {
    return {
      counts: {} as Record<string, number>,
      entities: {} as Record<string, string[]>,
      flags: [] as string[],
      pageUrls: [] as string[],
      snippets: [] as string[],
      sourceUrls: [] as string[]
    };
  }

  const evidence = finding.evidence as Record<string, unknown>;
  const pageUrls = new Set<string>();
  const sourceUrls = new Set<string>();
  const snippets = new Set<string>();
  const flags = new Set<string>();
  const counts: Record<string, number> = {};
  const entities: Record<string, string[]> = {};

  const addEntity = (key: string, values: string[]) => {
    const cleaned = uniqueStrings(values);
    if (cleaned.length === 0) {
      return;
    }
    entities[key] = uniqueStrings([...(entities[key] ?? []), ...cleaned]);
  };

  for (const [key, value] of Object.entries(evidence)) {
    if (typeof value === "string") {
      if (/^https?:\/\//i.test(value.trim())) {
        if (/pageurl|page_url/i.test(key)) {
          pageUrls.add(value);
        } else {
          sourceUrls.add(value);
        }
      } else if (/claim|observed|summary|snippet|evidence|description|rationale/i.test(key)) {
        snippets.add(value);
      }
      continue;
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      if (/count|score|confidence|delta|attempt/i.test(key)) {
        counts[key] = value;
      }
      continue;
    }

    if (value === true) {
      flags.add(key);
      continue;
    }

    if (!Array.isArray(value)) {
      continue;
    }

    const stringValues = value.filter((entry): entry is string => typeof entry === "string");
    if (stringValues.length === 0) {
      continue;
    }

    if (stringValues.some((entry) => /^https?:\/\//i.test(entry.trim()))) {
      for (const entry of stringValues) {
        if (/pageurl|page_url/i.test(key)) {
          pageUrls.add(entry);
        } else {
          sourceUrls.add(entry);
        }
      }
    } else if (/vendor|cookie|selector|url|page|rule/i.test(key)) {
      addEntity(key, stringValues);
    } else {
      for (const entry of stringValues.slice(0, 5)) {
        snippets.add(entry);
      }
    }
  }

  return {
    counts,
    entities,
    flags: [...flags],
    pageUrls: [...pageUrls],
    snippets: [...snippets],
    sourceUrls: [...sourceUrls]
  };
}

function mergeEvidence(
  current: UnifiedFindingPacket["evidence"] | undefined,
  next: ReturnType<typeof extractEvidenceFromFallback>,
  candidateEvidence: string[] | undefined,
  linkedValidationFinding?: ScanValidationFinding | null
) {
  const validationEvidence = extractEvidenceFromValidationFinding(linkedValidationFinding);
  const pageUrls = uniqueStrings([
    ...(current?.pageUrls ?? []),
    ...(next.pageUrls ?? []),
    ...(validationEvidence.pageUrls ?? []),
    ...(candidateEvidence ?? []).filter((entry) => /^https?:\/\//i.test(entry.trim())),
    linkedValidationFinding?.pageUrl ?? null
  ]);

  const sourceUrls = uniqueStrings([
    ...(current?.sourceUrls ?? []),
    ...(next.sourceUrls ?? []),
    ...(validationEvidence.sourceUrls ?? [])
  ]);

  const snippets = uniqueStrings([
    ...(current?.snippets ?? []),
    ...(next.snippets ?? []),
    ...(validationEvidence.snippets ?? []),
    ...(candidateEvidence ?? []).filter((entry) => !/^https?:\/\//i.test(entry.trim())).slice(0, 2)
  ]);

  return {
    counts: { ...(current?.counts ?? {}), ...(next.counts ?? {}), ...(validationEvidence.counts ?? {}) },
    entities: {
      ...(current?.entities ?? {}),
      ...(next.entities ?? {}),
      ...(validationEvidence.entities ?? {})
    },
    flags: uniqueStrings([...(current?.flags ?? []), ...(next.flags ?? []), ...(validationEvidence.flags ?? [])]),
    pageUrls,
    snippets,
    sourceUrls
  };
}

function getSourceUrl(packet: UnifiedFindingPacket) {
  return packet.evidence?.pageUrls?.[0];
}

function hasConcretePayloadEvidence(fallbackEvidence?: Record<string, unknown> | null) {
  if (!Array.isArray(fallbackEvidence?.sensitivePayloadViolations)) {
    return false;
  }

  return fallbackEvidence.sensitivePayloadViolations.some(
    (row): boolean =>
      Boolean(row) &&
      typeof row === "object" &&
      (row as { evidenceStrength?: unknown }).evidenceStrength !== "detector_only"
  );
}

function deriveConfidenceInputs(input: {
  packet: UnifiedFindingPacket;
  validationFindings: ScanValidationFinding[];
  fallbackEvidenceRows: Array<Record<string, unknown> | null | undefined>;
}) {
  const sourceKinds = [...new Set(input.packet.sourceRefs.map((sourceRef) => sourceRef.kind))];
  const signalCount = input.packet.sourceRefs.filter((sourceRef) => sourceRef.kind === "signal").length;
  const validationCount = input.packet.sourceRefs.filter((sourceRef) => sourceRef.kind === "validation").length;
  const issueCount = input.packet.sourceRefs.filter((sourceRef) => sourceRef.kind === "issue").length;
  const validationEvidenceRows = input.validationFindings
    .map((finding) => finding.evidence)
    .filter((evidence): evidence is Record<string, unknown> => Boolean(evidence) && typeof evidence === "object");
  const allEvidenceRows = [...validationEvidenceRows, ...input.fallbackEvidenceRows.filter(Boolean) as Record<string, unknown>[]];
  const evidenceQualityFlags = uniqueStrings([
    ...(input.packet.evidence?.flags ?? []),
    ...allEvidenceRows.flatMap((row) =>
      Object.entries(row)
        .filter(([, value]) => value === true)
        .map(([key]) => key)
    )
  ]);

  const hasDirectRuntimeEvidence =
    validationEvidenceRows.some((row) =>
      Object.keys(row).some((key) => /runtime|request|network|tracker|vendor/i.test(key))
    );

  const hasPolicyTextEvidence = allEvidenceRows.some((row) =>
    Object.keys(row).some((key) => /claim|policy|disclosure|summary|snippet|description|pageurl|page_url/i.test(key))
  );

  const hasKeyPageDiscoveryEvidence = allEvidenceRows.some((row) =>
    Object.keys(row).some((key) => /keyPage|attemptedUrls|attemptCount|stopReason|discovery/i.test(key))
  );

  const hasStructuredValidationEvidence = validationEvidenceRows.length > 0;
  const concretePayloadEvidence = input.fallbackEvidenceRows.some((row) => hasConcretePayloadEvidence(row));
  const isFallbackOnly = validationCount === 0 && !hasDirectRuntimeEvidence && signalCount > 0;

  return {
    evidenceQualityFlags,
    hasConcretePayloadEvidence: concretePayloadEvidence,
    hasDirectRuntimeEvidence,
    hasKeyPageDiscoveryEvidence,
    hasPolicyTextEvidence,
    hasStructuredValidationEvidence,
    isFallbackOnly,
    issueCount,
    signalCount,
    sourceCount: input.packet.sourceRefs.length,
    sourceKinds,
    validationCount
  };
}

function deriveConfidenceBand(
  inputs: UnifiedFindingPacket["confidenceInputs"],
  severity: ReviewFindingSeverity
): UnifiedFindingPacket["confidenceBand"] {
  let score = 0;

  if (inputs.signalCount > 0) {
    score += 1;
  }
  if (inputs.validationCount > 0) {
    score += 2;
  }
  if (inputs.issueCount > 0) {
    score += 1;
  }
  if (inputs.hasStructuredValidationEvidence) {
    score += 1;
  }
  if (inputs.sourceKinds.length > 1) {
    score += 1;
  }
  if (inputs.hasDirectRuntimeEvidence) {
    score += 2;
  }
  if (inputs.hasPolicyTextEvidence) {
    score += 1;
  }
  if (inputs.hasKeyPageDiscoveryEvidence) {
    score += 1;
  }
  if (inputs.hasConcretePayloadEvidence) {
    score += 2;
  }
  if (inputs.hasKeyPageDiscoveryEvidence || inputs.hasConcretePayloadEvidence) {
    score += 1;
  }
  if (inputs.isFallbackOnly) {
    score -= inputs.hasConcretePayloadEvidence ? 0 : 2;
  }
  if (inputs.hasKeyPageDiscoveryEvidence && inputs.validationCount === 0 && inputs.issueCount === 0) {
    score -= 1;
  }
  if (severity === "high" && inputs.validationCount === 0 && !inputs.hasDirectRuntimeEvidence && !inputs.hasConcretePayloadEvidence) {
    score -= 1;
  }

  if (score >= 5) {
    return "high";
  }
  if (score >= 2) {
    return "moderate";
  }
  return "low";
}

function getSourceLabel(packet: UnifiedFindingPacket) {
  const sourceUrl = getSourceUrl(packet);
  if (!sourceUrl) {
    return undefined;
  }

  const lowered = sourceUrl.toLowerCase();
  if (lowered.includes("/terms")) {
    return "TOS";
  }
  if (lowered.includes("/privacy")) {
    return "Privacy Policy";
  }
  if (lowered.includes("/cookie")) {
    return "Cookie Policy";
  }
  if (lowered.includes("/refund")) {
    return "Refund Policy";
  }
  return "Source";
}

function selectPrimaryValidationFinding(findings: ScanValidationFinding[]) {
  return (
    [...findings].sort((left, right) => {
      const severityDelta =
        getSeverityWeight((right.severity as ReviewFindingSeverity | null | undefined) ?? "low") -
        getSeverityWeight((left.severity as ReviewFindingSeverity | null | undefined) ?? "low");
      if (severityDelta !== 0) {
        return severityDelta;
      }

      return (right.systemConfidenceScore ?? right.modelConfidence ?? -1) - (left.systemConfidenceScore ?? left.modelConfidence ?? -1);
    })[0] ?? null
  );
}

function appendUniqueSourceRef(
  sourceRefs: UnifiedFindingPacket["sourceRefs"],
  nextSourceRef: UnifiedFindingPacket["sourceRefs"][number]
) {
  const alreadyPresent = sourceRefs.some((sourceRef) => {
    if (sourceRef.kind !== nextSourceRef.kind) {
      return false;
    }

    if (sourceRef.kind === "signal" && nextSourceRef.kind === "signal") {
      return sourceRef.source === nextSourceRef.source && sourceRef.key === nextSourceRef.key;
    }

    if (sourceRef.kind === "validation" && nextSourceRef.kind === "validation") {
      return sourceRef.ruleKey === nextSourceRef.ruleKey;
    }

    if (sourceRef.kind === "issue" && nextSourceRef.kind === "issue") {
      return sourceRef.title === nextSourceRef.title;
    }

    return false;
  });

  return alreadyPresent ? sourceRefs : [...sourceRefs, nextSourceRef];
}

function appendUniqueValidationFinding(
  findings: ScanValidationFinding[],
  nextFinding: ScanValidationFinding
) {
  return findings.some((finding) => finding.id === nextFinding.id || finding.ruleKey === nextFinding.ruleKey)
    ? findings
    : [...findings, nextFinding];
}

export function buildUnifiedFindingPackets(input: {
  reviewFindingCandidates: UnifiedFindingCandidate[];
  validationFindings: ScanValidationFinding[];
}) {
  const packets = new Map<string, UnifiedFindingPacket>();
  const validationByPacket = new Map<string, ScanValidationFinding[]>();
  const fallbackEvidenceByPacket = new Map<string, Array<Record<string, unknown> | null | undefined>>();

  const addCandidate = (
    findingId: string,
    candidate: UnifiedFindingCandidate,
    linkedValidationFinding?: ScanValidationFinding | null
  ) => {
    const definition = getReportUnifiedFinding(findingId);
    if (!definition) {
      return;
    }

    const existing = packets.get(findingId);
    const fallbackEvidence = extractEvidenceFromFallback(candidate.fallbackEvidence ?? null);
    const nextPacket: UnifiedFindingPacket = existing ?? {
      unifiedFindingId: definition.id,
      title: definition.label,
      severity: candidate.severity,
      summary: candidate.description,
      confidenceBand: "low",
      confidenceInputs: {
        evidenceQualityFlags: [],
        hasConcretePayloadEvidence: false,
        hasDirectRuntimeEvidence: false,
        hasKeyPageDiscoveryEvidence: false,
        hasPolicyTextEvidence: false,
        hasStructuredValidationEvidence: false,
        isFallbackOnly: false,
        issueCount: 0,
        signalCount: 0,
        sourceCount: 0,
        sourceKinds: [],
        validationCount: 0
      },
      categoryAlignments: definition.categoryAlignments,
      sourceRefs: [],
      evidence: undefined,
      details: undefined
    };

    nextPacket.severity = maxSeverity(nextPacket.severity, candidate.severity);
    if (!existing || nextPacket.summary.trim().length === 0) {
      nextPacket.summary = candidate.description;
    }

    if (candidate.sourceType === "signal" && candidate.signalSource && candidate.signalKey) {
      nextPacket.sourceRefs = appendUniqueSourceRef(nextPacket.sourceRefs, {
        kind: "signal",
        key: candidate.signalKey,
        label: candidate.signalLabel,
        source: candidate.signalSource
      });
    } else {
      nextPacket.sourceRefs = appendUniqueSourceRef(nextPacket.sourceRefs, { kind: "issue", title: candidate.title });
    }

    if (linkedValidationFinding) {
      nextPacket.sourceRefs = appendUniqueSourceRef(nextPacket.sourceRefs, {
        kind: "validation",
        ruleKey: linkedValidationFinding.ruleKey,
        title: linkedValidationFinding.title
      });
      validationByPacket.set(
        findingId,
        appendUniqueValidationFinding(validationByPacket.get(findingId) ?? [], linkedValidationFinding)
      );
    }

    fallbackEvidenceByPacket.set(findingId, [
      ...(fallbackEvidenceByPacket.get(findingId) ?? []),
      candidate.fallbackEvidence
    ]);

    nextPacket.evidence = mergeEvidence(nextPacket.evidence, fallbackEvidence, candidate.evidence, linkedValidationFinding);
    nextPacket.details = buildUnifiedFindingDetails({
      fallbackEvidence: candidate.fallbackEvidence ?? null,
      findingId,
      linkedValidationFinding,
      observedValue: candidate.observedValue,
      summary: candidate.description
    });
    nextPacket.confidenceInputs = deriveConfidenceInputs({
      fallbackEvidenceRows: fallbackEvidenceByPacket.get(findingId) ?? [],
      packet: nextPacket,
      validationFindings: validationByPacket.get(findingId) ?? []
    });
    nextPacket.confidenceBand = deriveConfidenceBand(nextPacket.confidenceInputs, nextPacket.severity);
    packets.set(findingId, nextPacket);
  };

  for (const candidate of input.reviewFindingCandidates) {
    const mappedFinding =
      candidate.sourceType === "signal" && candidate.signalSource && candidate.signalKey
        ? getReportUnifiedFindingForSignal(candidate.signalSource, candidate.signalKey)
        : getReportUnifiedFindingByAlias(candidate.title) ??
          (candidate.linkedValidationFinding
            ? getReportUnifiedFindingForValidationRule(candidate.linkedValidationFinding.ruleKey)
            : null);

    if (!mappedFinding) {
      continue;
    }

    addCandidate(mappedFinding.id, candidate, candidate.linkedValidationFinding ?? null);
  }

  for (const validationFinding of input.validationFindings) {
    const mappedFinding =
      getReportUnifiedFindingForValidationRule(validationFinding.ruleKey) ??
      getReportUnifiedFindingByAlias(validationFinding.title);

    if (!mappedFinding) {
      continue;
    }

    const syntheticCandidate: UnifiedFindingCandidate = {
      categoryId: undefined,
      description: validationFinding.description ?? validationFinding.title,
      evidence: [],
      fallbackEvidence: validationFinding.evidence ?? undefined,
      linkedValidationFinding: validationFinding,
      observedValue: null,
      severity:
        validationFinding.severity === "high" || validationFinding.severity === "medium" || validationFinding.severity === "low"
          ? validationFinding.severity
          : "medium",
      sourceType: "issue",
      title: validationFinding.title
    };

    addCandidate(mappedFinding.id, syntheticCandidate, validationFinding);
  }

  return [...packets.values()].sort(
    (left, right) =>
      getSeverityWeight(right.severity) - getSeverityWeight(left.severity) || left.title.localeCompare(right.title)
  );
}

export function buildUnifiedFindingDisplayPackets(input: {
  reviewFindingCandidates: UnifiedFindingCandidate[];
  validationFindings: ScanValidationFinding[];
  validationFindingLookup: Map<string, ScanValidationFinding>;
}) {
  const packets = buildUnifiedFindingPackets({
    reviewFindingCandidates: input.reviewFindingCandidates,
    validationFindings: input.validationFindings
  });

  return packets.map((packet, index, rows): UnifiedFindingDisplayPacket => {
    const linkedValidationFinding = selectPrimaryValidationFinding(
      packet.sourceRefs
        .filter((sourceRef): sourceRef is Extract<typeof sourceRef, { kind: "validation" }> => sourceRef.kind === "validation")
        .flatMap((sourceRef) => {
          const matched = findValidationFindingForKeys(input.validationFindingLookup, [sourceRef.ruleKey]);
          return matched ? [matched] : [];
        })
    );

    const siblingRows = rows.filter((row) => row.unifiedFindingId !== packet.unifiedFindingId);
    const presentation = buildCanonicalReviewFindingPresentation(
      {
        evidence: packet.evidence?.pageUrls ?? [],
        fallbackEvidence: {
          ...(packet.evidence ?? {}),
          summary: packet.summary,
          unifiedFindingId: packet.unifiedFindingId
        },
        linkedValidationFinding,
        observedValue: getBestObservedValue([packet.evidence?.snippets?.[0] ?? null, packet.summary]),
        severity: packet.severity,
        title: packet.title
      },
      siblingRows.map((row) => ({
        evidence: row.evidence?.pageUrls ?? [],
        fallbackEvidence: row.evidence ?? null,
        linkedValidationFinding: null,
        observedValue: row.summary,
        severity: row.severity,
        title: row.title
      }))
    );

    return {
      ...packet,
      linkedValidationFinding,
      observedValue: getBestObservedValue([packet.evidence?.snippets?.[0] ?? null, packet.summary]),
      presentation: {
        ...presentation,
        findingName: normalizeFindingName(packet.title)
      },
      referenceLabel: presentation.suggestedBestPractice?.label,
      referenceUrl: presentation.suggestedBestPractice?.url,
      sourceLabel: getSourceLabel(packet),
      sourceUrl: getSourceUrl(packet)
    };
  });
}

export function getUnifiedFindingOwnerCategoryId(packet: UnifiedFindingPacket) {
  return packet.categoryAlignments.find((alignment) => alignment.relation === "owner")?.evidenceCategoryId ?? null;
}

export function getUnifiedFindingCategoryRelation(packet: UnifiedFindingPacket, categoryId: string) {
  return packet.categoryAlignments.find((alignment) => alignment.evidenceCategoryId === categoryId)?.relation ?? null;
}
