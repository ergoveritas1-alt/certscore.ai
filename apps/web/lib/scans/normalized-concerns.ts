import {
  getReportUnifiedFindingByAlias,
  getReportUnifiedFindingForSignal,
  getReportUnifiedFindingForValidationRule,
  type ReportSignalSource
} from "@website-signal-risk-scanner/shared";

import type { ReviewFindingSeverity } from "./canonical-review-finding";
import { deriveConcernPolicy } from "./concern-policy";
import type { ScanValidationFinding } from "./validation-review-linking";

export type NormalizedConcernOriginType =
  | "snapshot_signal"
  | "compatibility_signal"
  | "policy_enrichment"
  | "policy_review_queue"
  | "validation_rule";

export type NormalizedConcernEvidenceStrengthFlag =
  | "direct_runtime"
  | "policy_text"
  | "page_attributed"
  | "structured_validation"
  | "concrete_payload"
  | "key_page_discovery"
  | "fallback_only";

export type NormalizedConcernPageScope = "domain" | "page" | "multi_page" | "policy_page";

export type NormalizedConcernPromotionEligibility = "eligible" | "internal_only" | "blocked";

export type NormalizedConcernExternalSurfacingEligibility = "eligible" | "audit_only" | "suppress";

export type NormalizedConcernAssertionLevel = "weak" | "moderate" | "strong";

export type NormalizedConcernNegativeEvidenceFlag =
  | "no_consent_surface_observed"
  | "no_consent_actionable_choice_observed"
  | "no_direct_runtime_replay_artifact_observed"
  | "no_direct_runtime_retargeting_artifact_observed"
  | "policy_rights_language_observed"
  | "policy_target_retrievable"
  | "policy_target_parsing_incomplete"
  | "missing_behavior_side_evidence"
  | "missing_policy_side_evidence"
  | "missing_contradiction_mapping";

export type NormalizedConcernEvidenceBundle = {
  counts: Record<string, number>;
  entities: Record<string, string[]>;
  flags: string[];
  pageUrls: string[];
  policySnippets: string[];
  rawEvidence: Record<string, unknown> | null;
  runtimeArtifacts: string[];
  sourceUrls: string[];
};

export type NormalizedConcern = {
  allowedNarrativeTier: NormalizedConcernAssertionLevel;
  categoryId?: string;
  canonicalConcernKey: string;
  description: string;
  evidenceBundle: NormalizedConcernEvidenceBundle;
  evidenceStrengthFlags: NormalizedConcernEvidenceStrengthFlag[];
  externalSurfacingEligibility: NormalizedConcernExternalSurfacingEligibility;
  linkedValidationFinding?: ScanValidationFinding | null;
  linkedValidationRuleKeys?: string[];
  negativeEvidenceFlags: NormalizedConcernNegativeEvidenceFlag[];
  observedValue: string | null;
  originKey: string;
  originType: NormalizedConcernOriginType;
  pageScope: NormalizedConcernPageScope;
  promotionEligibility: NormalizedConcernPromotionEligibility;
  severity: ReviewFindingSeverity;
  signalKey?: string;
  signalLabel?: string;
  signalSource?: ReportSignalSource;
  sourceType: "issue" | "signal" | "validation";
  suggestedUnifiedFindingId?: string;
  title: string;
};

export type ReviewFindingCandidateInput = {
  categoryId?: string;
  description: string;
  evidence?: string[];
  fallbackEvidence?: Record<string, unknown>;
  linkedValidationFinding?: ScanValidationFinding | null;
  observedValue: string | null;
  severity: ReviewFindingSeverity;
  signalKey?: string;
  signalLabel?: string;
  signalSource?: ReportSignalSource;
  sourceType: "issue" | "signal";
  title: string;
};

export type ConcernBackedUnifiedFindingCandidate = ReviewFindingCandidateInput & {
  normalizedConcern: NormalizedConcern;
};

export type PolicyReviewConcernInput = {
  categoryId?: string;
  description: string;
  evidence: Record<string, unknown> | null | undefined;
  observedValue?: string | null;
  pageUrl?: string | null;
  reason: string;
  ruleKey: string;
  severity: ReviewFindingSeverity;
  title: string;
};

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
}

function normalizeTitleKey(title: string) {
  return title.trim().toLowerCase();
}

function addEntity(target: Record<string, string[]>, key: string, values: string[]) {
  const cleaned = uniqueStrings(values);
  if (cleaned.length === 0) {
    return;
  }

  target[key] = uniqueStrings([...(target[key] ?? []), ...cleaned]);
}

function getStringArrayEvidence(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
}

function hasConcretePayloadEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  if (!Array.isArray(rawEvidence?.sensitivePayloadViolations) && !Array.isArray(rawEvidence?.sensitive_payload_violations)) {
    return false;
  }

  const rows = Array.isArray(rawEvidence?.sensitivePayloadViolations)
    ? rawEvidence.sensitivePayloadViolations
    : Array.isArray(rawEvidence?.sensitive_payload_violations)
      ? rawEvidence.sensitive_payload_violations
      : [];

  return rows.some(
    (row): boolean =>
      Boolean(row) &&
      typeof row === "object" &&
      (row as { evidenceStrength?: unknown }).evidenceStrength !== "detector_only"
  );
}

function extractEvidenceFromRaw(rawEvidence: Record<string, unknown> | null | undefined) {
  if (!rawEvidence) {
    return {
      counts: {} as Record<string, number>,
      entities: {} as Record<string, string[]>,
      flags: [] as string[],
      pageUrls: [] as string[],
      policySnippets: [] as string[],
      runtimeArtifacts: [] as string[],
      sourceUrls: [] as string[]
    };
  }

  const counts: Record<string, number> = {};
  const entities: Record<string, string[]> = {};
  const flags = new Set<string>();
  const pageUrls = new Set<string>();
  const sourceUrls = new Set<string>();
  const policySnippets = new Set<string>();
  const runtimeArtifacts = new Set<string>();

  for (const [key, value] of Object.entries(rawEvidence)) {
    if (typeof value === "string") {
      if (/^https?:\/\//i.test(value.trim())) {
        if (/pageurl|page_url/i.test(key)) {
          pageUrls.add(value);
        } else {
          sourceUrls.add(value);
        }
      } else if (/claim|policy|disclosure|summary|snippet|description|rationale/i.test(key)) {
        policySnippets.add(value);
      } else if (/runtime|request|network|artifact/i.test(key)) {
        runtimeArtifacts.add(value);
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

    const stringValues = getStringArrayEvidence(value);
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
      continue;
    }

    if (/runtime_vendors?|sessionReplayRuntimeVendors|relatedVendors/i.test(key)) {
      addEntity(entities, key, stringValues);
      continue;
    }

    if (/runtime|request|network|artifact/i.test(key)) {
      for (const entry of stringValues) {
        runtimeArtifacts.add(entry);
      }
      continue;
    }

    if (/operator_relationship|policyRightsSignals|rights_signals?/i.test(key)) {
      addEntity(entities, key, stringValues);
      continue;
    }

    if (/vendor|cookie|selector|url|page|rule|entity/i.test(key)) {
      addEntity(entities, key, stringValues);
      continue;
    }

    for (const entry of stringValues.slice(0, 5)) {
      if (/policy|disclosure|summary|snippet/i.test(key)) {
        policySnippets.add(entry);
      } else {
        policySnippets.add(entry);
      }
    }
  }

  return {
    counts,
    entities,
    flags: [...flags],
    pageUrls: [...pageUrls],
    policySnippets: [...policySnippets],
    runtimeArtifacts: [...runtimeArtifacts],
    sourceUrls: [...sourceUrls]
  };
}

function extractEvidenceFromValidationFinding(finding?: ScanValidationFinding | null) {
  return extractEvidenceFromRaw(finding?.evidence ?? null);
}

function mergeConcernEvidenceBundles(
  left: ReturnType<typeof extractEvidenceFromRaw>,
  right: ReturnType<typeof extractEvidenceFromValidationFinding>,
  candidateEvidence?: string[]
): NormalizedConcernEvidenceBundle {
  return {
    counts: { ...left.counts, ...right.counts },
    entities: { ...left.entities, ...right.entities },
    flags: uniqueStrings([...left.flags, ...right.flags]),
    pageUrls: uniqueStrings([
      ...left.pageUrls,
      ...right.pageUrls,
      ...(candidateEvidence ?? []).filter((entry) => /^https?:\/\//i.test(entry.trim()))
    ]),
    policySnippets: uniqueStrings([
      ...left.policySnippets,
      ...right.policySnippets,
      ...(candidateEvidence ?? []).filter((entry) => !/^https?:\/\//i.test(entry.trim())).slice(0, 3)
    ]),
    rawEvidence: left === right ? null : null,
    runtimeArtifacts: uniqueStrings([...left.runtimeArtifacts, ...right.runtimeArtifacts]),
    sourceUrls: uniqueStrings([...left.sourceUrls, ...right.sourceUrls])
  };
}

function isPolicyLikeUrl(url: string) {
  const lowered = url.toLowerCase();
  return /\/privacy|\/terms|\/cookie|policy|notice/.test(lowered);
}

function derivePageScope(bundle: NormalizedConcernEvidenceBundle): NormalizedConcernPageScope {
  const urls = uniqueStrings([...bundle.pageUrls, ...bundle.sourceUrls]);
  if (urls.length === 0) {
    return "domain";
  }
  if (urls.length > 1) {
    return "multi_page";
  }
  return isPolicyLikeUrl(urls[0]!) ? "policy_page" : "page";
}

function deriveOriginTypeFromCandidate(candidate: ReviewFindingCandidateInput): NormalizedConcernOriginType {
  if (candidate.sourceType === "signal") {
    if (candidate.signalSource === "snapshot_signal") {
      return "snapshot_signal";
    }
    if (candidate.signalSource === "policy_enrichment_signal") {
      return "policy_enrichment";
    }
    return "compatibility_signal";
  }

  if (candidate.linkedValidationFinding?.findingSource === "policy_review_queue") {
    return "policy_review_queue";
  }

  if (candidate.linkedValidationFinding) {
    return "validation_rule";
  }

  return "compatibility_signal";
}

function resolveSuggestedUnifiedFindingId(input: {
  originType: NormalizedConcernOriginType;
  originKey: string;
  signalKey?: string;
  signalSource?: ReportSignalSource;
  title: string;
  linkedValidationFinding?: ScanValidationFinding | null;
}) {
  if (input.signalKey && input.signalSource) {
    const signalMatch = getReportUnifiedFindingForSignal(input.signalSource, input.signalKey);
    if (signalMatch) {
      return signalMatch.id;
    }
  }

  if (input.linkedValidationFinding) {
    const validationMatch = getReportUnifiedFindingForValidationRule(input.linkedValidationFinding.ruleKey);
    if (validationMatch) {
      return validationMatch.id;
    }
  }

  const originValidationMatch =
    input.originType === "validation_rule" || input.originType === "policy_review_queue"
      ? getReportUnifiedFindingForValidationRule(input.originKey)
      : null;
  if (originValidationMatch) {
    return originValidationMatch.id;
  }

  return getReportUnifiedFindingByAlias(input.title)?.id ?? undefined;
}

function deriveCanonicalConcernKey(input: {
  originKey: string;
  originType: NormalizedConcernOriginType;
  suggestedUnifiedFindingId?: string;
  title: string;
}) {
  return (
    input.suggestedUnifiedFindingId ??
    `${input.originType}:${input.originKey || normalizeTitleKey(input.title)}`
  );
}

function deriveEvidenceStrengthFlags(input: {
  bundle: NormalizedConcernEvidenceBundle;
  linkedValidationFinding?: ScanValidationFinding | null;
  originType: NormalizedConcernOriginType;
  rawEvidence?: Record<string, unknown> | null;
}) {
  const flags = new Set<NormalizedConcernEvidenceStrengthFlag>();

  if (input.bundle.runtimeArtifacts.length > 0) {
    flags.add("direct_runtime");
  }
  if (input.bundle.policySnippets.length > 0) {
    flags.add("policy_text");
  }
  if (input.bundle.pageUrls.length > 0 || input.bundle.sourceUrls.length > 0) {
    flags.add("page_attributed");
  }
  if (input.linkedValidationFinding || input.originType === "validation_rule") {
    flags.add("structured_validation");
  }
  if (hasConcretePayloadEvidence(input.rawEvidence)) {
    flags.add("concrete_payload");
  }
  if (
    Array.isArray(input.rawEvidence?.keyPageAttemptedUrls) ||
    typeof input.rawEvidence?.keyPageAttemptCount === "number" ||
    typeof input.rawEvidence?.keyPageDiscoverySource === "string" ||
    typeof input.rawEvidence?.keyPageStopReason === "string"
  ) {
    flags.add("key_page_discovery");
  }
  if (!input.linkedValidationFinding && input.originType !== "validation_rule") {
    flags.add("fallback_only");
  }

  return [...flags];
}


function buildConcernFromSharedInput(input: {
  categoryId?: string;
  description: string;
  evidence?: string[];
  linkedValidationFinding?: ScanValidationFinding | null;
  observedValue: string | null;
  originKey: string;
  originType: NormalizedConcernOriginType;
  rawEvidence?: Record<string, unknown> | null;
  severity: ReviewFindingSeverity;
  signalKey?: string;
  signalLabel?: string;
  signalSource?: ReportSignalSource;
  sourceType: "issue" | "signal" | "validation";
  title: string;
}) {
  const fallbackBundle = extractEvidenceFromRaw(input.rawEvidence ?? null);
  const validationBundle = extractEvidenceFromValidationFinding(input.linkedValidationFinding ?? null);
  const evidenceBundle = {
    ...mergeConcernEvidenceBundles(fallbackBundle, validationBundle, input.evidence),
    rawEvidence: input.rawEvidence ?? null
  };
  const suggestedUnifiedFindingId = resolveSuggestedUnifiedFindingId({
    linkedValidationFinding: input.linkedValidationFinding,
    originKey: input.originKey,
    originType: input.originType,
    signalKey: input.signalKey,
    signalSource: input.signalSource,
    title: input.title
  });
  const canonicalConcernKey = deriveCanonicalConcernKey({
    originKey: input.originKey,
    originType: input.originType,
    suggestedUnifiedFindingId,
    title: input.title
  });
  const evidenceStrengthFlags = deriveEvidenceStrengthFlags({
    bundle: evidenceBundle,
    linkedValidationFinding: input.linkedValidationFinding,
    originType: input.originType,
    rawEvidence: input.rawEvidence ?? null
  });
  const eligibility = deriveConcernPolicy({
    concern: {
      canonicalConcernKey,
      originKey: input.originKey,
      originType: input.originType,
      suggestedUnifiedFindingId,
      title: input.title
    },
    evidenceStrengthFlags,
    rawEvidence: input.rawEvidence ?? null
  });

  return {
    allowedNarrativeTier: eligibility.allowedNarrativeTier,
    categoryId: input.categoryId,
    canonicalConcernKey,
    description: input.description,
    evidenceBundle,
    evidenceStrengthFlags,
    externalSurfacingEligibility: eligibility.externalSurfacingEligibility,
    linkedValidationFinding: input.linkedValidationFinding ?? null,
    negativeEvidenceFlags: eligibility.negativeEvidenceFlags,
    observedValue: input.observedValue,
    originKey: input.originKey,
    originType: input.originType,
    pageScope: derivePageScope(evidenceBundle),
    promotionEligibility: eligibility.promotionEligibility,
    severity: input.severity,
    signalKey: input.signalKey,
    signalLabel: input.signalLabel,
    signalSource: input.signalSource,
    sourceType: input.sourceType,
    suggestedUnifiedFindingId,
    title: input.title
  } satisfies NormalizedConcern;
}

export function normalizeConcernFromReviewFindingCandidate(candidate: ReviewFindingCandidateInput): NormalizedConcern {
  const originType = deriveOriginTypeFromCandidate(candidate);
  const originKey =
    candidate.sourceType === "signal" && candidate.signalKey
      ? candidate.signalKey
      : candidate.linkedValidationFinding?.ruleKey ?? normalizeTitleKey(candidate.title);

  return buildConcernFromSharedInput({
    categoryId: candidate.categoryId,
    description: candidate.description,
    evidence: candidate.evidence,
    linkedValidationFinding: candidate.linkedValidationFinding ?? null,
    observedValue: candidate.observedValue,
    originKey,
    originType,
    rawEvidence: candidate.fallbackEvidence ?? null,
    severity: candidate.severity,
    signalKey: candidate.signalKey,
    signalLabel: candidate.signalLabel,
    signalSource: candidate.signalSource,
    sourceType: candidate.sourceType,
    title: candidate.title
  });
}

export function normalizeConcernFromValidationFinding(finding: ScanValidationFinding): NormalizedConcern {
  return buildConcernFromSharedInput({
    description: finding.description ?? finding.title,
    evidence: [],
    linkedValidationFinding: finding,
    observedValue: null,
    originKey: finding.ruleKey,
    originType: "validation_rule",
    rawEvidence: finding.evidence ?? null,
    severity:
      finding.severity === "high" || finding.severity === "medium" || finding.severity === "low"
        ? finding.severity
        : "medium",
    sourceType: "validation",
    title: finding.title
  });
}

export function normalizeConcernFromPolicyReviewQueue(input: PolicyReviewConcernInput): NormalizedConcern {
  const rawEvidence = {
    ...(input.evidence ?? {}),
    pageUrl: input.pageUrl ?? null,
    policy_review_reason: input.reason
  };

  return buildConcernFromSharedInput({
    categoryId: input.categoryId,
    description: input.description,
    evidence: [],
    linkedValidationFinding: null,
    observedValue: input.observedValue ?? null,
    originKey: input.ruleKey,
    originType: "policy_review_queue",
    rawEvidence,
    severity: input.severity,
    sourceType: "issue",
    title: input.title
  });
}

export function buildNormalizedConcerns(input: {
  reviewFindingCandidates: ReviewFindingCandidateInput[];
  validationFindings: ScanValidationFinding[];
}) {
  return [
    ...input.reviewFindingCandidates.map((candidate) => normalizeConcernFromReviewFindingCandidate(candidate)),
    ...input.validationFindings.map((finding) => normalizeConcernFromValidationFinding(finding))
  ];
}

export function buildUnifiedFindingCandidatesFromConcerns(concerns: NormalizedConcern[]): ConcernBackedUnifiedFindingCandidate[] {
  return concerns
    .filter((concern) => concern.promotionEligibility !== "blocked")
    .map((concern) => ({
      categoryId: concern.categoryId,
      description: concern.description,
      evidence: [...concern.evidenceBundle.pageUrls, ...concern.evidenceBundle.sourceUrls],
      fallbackEvidence: {
        ...(concern.evidenceBundle.rawEvidence ?? {}),
        normalizedConcernAllowedNarrativeTier: concern.allowedNarrativeTier,
        normalizedConcernCanonicalKey: concern.canonicalConcernKey,
        normalizedConcernOriginType: concern.originType,
        normalizedConcernPageScope: concern.pageScope,
        normalizedConcernPromotionEligibility: concern.promotionEligibility,
        normalizedConcernExternalSurfacingEligibility: concern.externalSurfacingEligibility,
        normalizedConcernEvidenceStrengthFlags: concern.evidenceStrengthFlags,
        normalizedConcernNegativeEvidenceFlags: concern.negativeEvidenceFlags,
        runtimeEvidenceArtifacts: concern.evidenceBundle.runtimeArtifacts,
        policySnippets: concern.evidenceBundle.policySnippets,
        pageUrls: concern.evidenceBundle.pageUrls,
        sourceUrls: concern.evidenceBundle.sourceUrls,
        counts: concern.evidenceBundle.counts,
        entities: concern.evidenceBundle.entities,
        flags: concern.evidenceBundle.flags
      },
      linkedValidationFinding: concern.linkedValidationFinding ?? null,
      normalizedConcern: concern,
      observedValue: concern.observedValue,
      severity: concern.severity,
      signalKey: concern.signalKey,
      signalLabel: concern.signalLabel,
      signalSource: concern.signalSource,
      sourceType: concern.sourceType === "validation" ? "issue" : concern.sourceType,
      title: concern.title
    }));
}
