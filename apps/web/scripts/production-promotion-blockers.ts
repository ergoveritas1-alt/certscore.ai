import {
  buildRuntimeCookieInventory,
  classifyRuntimeCookieCategory,
  isNonEssentialCookieCategory
} from "../lib/scans/runtime-cookie-evidence";

export type PromotionBlockerFindingId =
  | "behavioral_analytics_disclosure_present"
  | "cookie_disclosure_gap"
  | "missing_dsar_mechanism"
  | "preconsent_tracking"
  | "privacy_rights_path_present"
  | "targeted_advertising_disclosure_present"
  | "tracking_technologies_disclosure_present";

export type PromotionBlockerAssessment = {
  blockers: string[];
  evidence: Record<string, boolean | number | string | string[] | null>;
  findingId: PromotionBlockerFindingId;
  promotionReady: boolean;
};

export type PromotionBlockerInput = {
  consentBaselineTrackerEvidenceUrls?: string[] | null;
  cookieGapValidationEvidence?: Record<string, unknown> | null;
  dataAccessRequestPresent?: boolean | null;
  dataDeletionRequestPresent?: boolean | null;
  domain?: string | null;
  hybridRuntimeEvidence?: Record<string, unknown> | null;
  policyActionableFlags?: string[] | null;
  policyCoverageRatio?: number | null;
  policyDsarMechanism?: string | null;
  policyEvidenceSnippets?: Record<string, unknown> | null;
  policyExtractionStatus?: string | null;
  policyPageUrl?: string | null;
  policyPageType?: string | null;
  policyPositiveSignalPresent?: boolean | null;
  policyRightsSignals?: string[] | null;
  policySemanticConfidence?: number | null;
  policySnippetCount?: number | null;
  policyStructurallyWeak?: boolean | null;
  preconsentTrackingDetected?: boolean | null;
  preconsentViolationEvidenceUrls?: string[] | null;
  privacyRequestFormPresent?: boolean | null;
  scanId?: string | null;
  sectionReviewNoDsarMechanism?: boolean | null;
  trackingBeforeConsentDetected?: boolean | null;
};

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getStringArray(value: unknown) {
  return Array.isArray(value)
    ? [...new Set(value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim()))]
    : [];
}

function getNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function flattenSnippetValues(value: unknown): string[] {
  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }
  if (Array.isArray(value)) {
    return value.flatMap(flattenSnippetValues);
  }
  const record = getRecord(value);
  if (record) {
    return Object.values(record).flatMap(flattenSnippetValues);
  }
  return [];
}

function getPolicySnippets(input: PromotionBlockerInput) {
  return flattenSnippetValues(input.policyEvidenceSnippets);
}

function getPolicySnippetRecord(input: PromotionBlockerInput) {
  return getRecord(input.policyEvidenceSnippets);
}

function getPositiveDisclosureSnippetKeys(
  findingId:
    | "behavioral_analytics_disclosure_present"
    | "targeted_advertising_disclosure_present"
    | "tracking_technologies_disclosure_present"
) {
  switch (findingId) {
    case "behavioral_analytics_disclosure_present":
      return [
        "topic:session_replay_disclosure",
        "session_replay_disclosure",
        "behavioral_analytics_disclosure",
        "product_analytics_disclosure"
      ];
    case "targeted_advertising_disclosure_present":
      return ["topic:targeted_advertising_disclosure", "targeted_advertising_disclosure"];
    case "tracking_technologies_disclosure_present":
      return ["topic:tracking_technologies_disclosure", "tracking_technologies_disclosure"];
  }
}

function getPositiveDisclosurePolicySnippets(
  input: PromotionBlockerInput,
  findingId:
    | "behavioral_analytics_disclosure_present"
    | "targeted_advertising_disclosure_present"
    | "tracking_technologies_disclosure_present"
) {
  const record = getPolicySnippetRecord(input);
  const selected = record
    ? getPositiveDisclosureSnippetKeys(findingId).flatMap((key) => flattenSnippetValues(record[key]))
    : [];
  return selected.length > 0 ? selected : getPolicySnippets(input);
}

function hasPolicyAnchor(input: PromotionBlockerInput) {
  return Boolean(input.policyPageUrl && /^https?:\/\//i.test(input.policyPageUrl));
}

function getValidationCookiePolicyUrl(input: PromotionBlockerInput) {
  const validation = getRecord(input.cookieGapValidationEvidence);
  return getString(validation?.cookiePolicyUrl ?? validation?.cookie_policy_url);
}

function getEffectiveCookieGapPolicyUrl(input: PromotionBlockerInput) {
  return input.policyPageUrl ?? getValidationCookiePolicyUrl(input);
}

function hasFetchedPolicy(input: PromotionBlockerInput) {
  return input.policyExtractionStatus === "fetched" && input.policyStructurallyWeak !== true;
}

function getPolicyConfidence(input: PromotionBlockerInput) {
  return typeof input.policySemanticConfidence === "number" ? input.policySemanticConfidence : null;
}

function hasMinimumPolicyConfidence(input: PromotionBlockerInput, minimum = 0.6) {
  const confidence = getPolicyConfidence(input);
  return typeof confidence === "number" && confidence >= minimum;
}

function getRuntimeCookieNames(input: PromotionBlockerInput) {
  const hybrid = getRecord(input.hybridRuntimeEvidence);
  const validation = getRecord(input.cookieGapValidationEvidence);
  const inventory = buildRuntimeCookieInventory({ hybridRuntimeEvidence: hybrid });
  return [
    ...inventory.cookieNames,
    ...getStringArray(hybrid?.runtimeCookieNames ?? hybrid?.runtime_cookie_names),
    ...getStringArray(hybrid?.unmatchedCookieNames ?? hybrid?.unmatched_cookie_names),
    ...getStringArray(validation?.runtimeCookieNames ?? validation?.runtime_cookie_names),
    ...getStringArray(validation?.unmatchedCookieNames ?? validation?.unmatched_cookie_names)
  ].filter((value, index, values) => values.indexOf(value) === index);
}

function getUnmatchedCookieNames(input: PromotionBlockerInput) {
  const hybrid = getRecord(input.hybridRuntimeEvidence);
  const validation = getRecord(input.cookieGapValidationEvidence);
  const inventory = buildRuntimeCookieInventory({ hybridRuntimeEvidence: hybrid });
  return [
    ...inventory.unmatchedCookieNames,
    ...getStringArray(hybrid?.unmatchedCookieNames ?? hybrid?.unmatched_cookie_names),
    ...getStringArray(validation?.unmatchedCookieNames ?? validation?.unmatched_cookie_names)
  ].filter((value, index, values) => values.indexOf(value) === index);
}

function getUnmatchedCookieCount(input: PromotionBlockerInput) {
  const validation = getRecord(input.cookieGapValidationEvidence);
  const hybrid = getRecord(input.hybridRuntimeEvidence);
  const explicit =
    getNumber(validation?.unmatchedCookieCount ?? validation?.unmatched_cookie_count) ??
    getNumber(hybrid?.unmatchedCookieCount ?? hybrid?.unmatched_cookie_count);
  return explicit ?? getUnmatchedCookieNames(input).length;
}

function getUnmatchedThirdPartyCookieCount(input: PromotionBlockerInput) {
  const validation = getRecord(input.cookieGapValidationEvidence);
  const hybrid = getRecord(input.hybridRuntimeEvidence);
  return (
    getNumber(validation?.unmatchedThirdPartyCookieCount ?? validation?.unmatched_third_party_cookie_count) ??
    getNumber(hybrid?.unmatchedThirdPartyCookieCount ?? hybrid?.unmatched_third_party_cookie_count) ??
    0
  );
}

function hasPromotionGradeUnmatchedCookie(input: PromotionBlockerInput) {
  if (getUnmatchedThirdPartyCookieCount(input) > 0) {
    return true;
  }
  const validation = getRecord(input.cookieGapValidationEvidence);
  const hybrid = getRecord(input.hybridRuntimeEvidence);
  const inventory = buildRuntimeCookieInventory({ hybridRuntimeEvidence: hybrid });
  if (inventory.unmatchedRows.some((row) => row.nonEssential || row.party === "third_party" && row.category !== "necessary")) {
    return true;
  }
  const categories = [
    ...getStringArray(validation?.unmatchedCookieCategories ?? validation?.unmatched_cookie_categories),
    ...getStringArray(hybrid?.unmatchedCookieCategories ?? hybrid?.unmatched_cookie_categories)
  ];
  if (categories.some(isNonEssentialCookieCategory)) {
    return true;
  }
  return getUnmatchedCookieNames(input).some((name) => isNonEssentialCookieCategory(classifyRuntimeCookieCategory(name)));
}

function isLikelyPolicyUrl(value: string | null | undefined, pattern: RegExp) {
  if (!value) {
    return false;
  }
  try {
    const parsed = new URL(value);
    const path = parsed.pathname.toLowerCase().replace(/\/+$/, "") || "/";
    if (path === "/" || parsed.hostname.toLowerCase() === "www.cookieyes.com" && path.startsWith("/product/")) {
      return false;
    }
    return pattern.test(`${path}${parsed.search.toLowerCase()}`);
  } catch {
    return pattern.test(value.toLowerCase());
  }
}

function disclosurePatternFor(findingId: PromotionBlockerFindingId) {
  switch (findingId) {
    case "behavioral_analytics_disclosure_present":
      return /behavioral analytics|behavioural analytics|session replay|session recording|heat ?map|product analytics|hotjar|fullstory|mouseflow|contentsquare|microsoft clarity/i;
    case "targeted_advertising_disclosure_present":
      return /targeted advertis(?:e|ing)|interest-based advertis(?:e|ing)|personalized ads?|cross-context behavioral advertis(?:e|ing)/i;
    case "tracking_technologies_disclosure_present":
      return /tracking technolog(?:y|ies)|cookies? and similar technolog(?:y|ies)|pixels?|web beacons?|tags?|tracking scripts?/i;
    default:
      return null;
  }
}

function getPreconsentCookieRows(hybridRuntimeEvidence: Record<string, unknown> | null | undefined) {
  return buildRuntimeCookieInventory({ hybridRuntimeEvidence }).rows.map((row) => ({
    beforeConsent: row.timingEvidence === "before_consent_cookie_write",
    category: row.category,
    initiatorDomain: row.initiatorDomain,
    initiatorUrl: row.initiatorUrl,
    initiatorVendor: row.initiatorVendor,
    name: row.cookieName,
    nonEssential: row.nonEssential,
    timingEvidence: row.timingEvidence
  }));
}

export function classifyPreconsentPromotionBlockers(input: PromotionBlockerInput): PromotionBlockerAssessment {
  const concreteRequestUrls = [
    ...(input.consentBaselineTrackerEvidenceUrls ?? []),
    ...(input.preconsentViolationEvidenceUrls ?? [])
  ].filter((url) => /^https?:\/\//i.test(url));
  const cookieRows = getPreconsentCookieRows(input.hybridRuntimeEvidence);
  const beforeConsentCookieRows = cookieRows.filter((row) => row.beforeConsent);
  const nonEssentialCookieRows = beforeConsentCookieRows.filter((row) => row.nonEssential);
  const necessaryOnly = beforeConsentCookieRows.length > 0 && nonEssentialCookieRows.length === 0;
  const hasSequence =
    input.preconsentTrackingDetected === true ||
    input.trackingBeforeConsentDetected === true ||
    beforeConsentCookieRows.length > 0 ||
    concreteRequestUrls.length > 0;
  const blockers: string[] = [];

  if (!hasSequence) {
    blockers.push("missing_preconsent_sequence");
  }
  if (concreteRequestUrls.length === 0) {
    blockers.push("missing_concrete_tracker_request_url");
  }
  if (cookieRows.length === 0) {
    blockers.push("missing_cookie_observation_artifacts");
  } else if (beforeConsentCookieRows.length === 0) {
    blockers.push("missing_cookie_before_consent_timing");
  } else if (necessaryOnly) {
    blockers.push("necessary_cookie_only");
  } else if (nonEssentialCookieRows.length === 0) {
    blockers.push("missing_nonessential_cookie_classification");
  }

  const promotionReady = hasSequence && (concreteRequestUrls.length > 0 || nonEssentialCookieRows.length > 0);
  return {
    blockers: promotionReady ? [] : blockers,
    evidence: {
      concreteRequestUrlCount: concreteRequestUrls.length,
      cookieObservationCount: cookieRows.length,
      firstConcreteRequestUrl: concreteRequestUrls[0] ?? null,
      nonEssentialCookieNames: nonEssentialCookieRows.map((row) => row.name).filter(Boolean) as string[],
      preconsentCookieNames: beforeConsentCookieRows.map((row) => row.name).filter(Boolean) as string[],
      sequenceEvidence: hasSequence
    },
    findingId: "preconsent_tracking",
    promotionReady
  };
}

export function classifyDsarPromotionBlockers(input: PromotionBlockerInput): PromotionBlockerAssessment {
  const mechanism = input.policyDsarMechanism?.trim() || null;
  const rightsSignals = input.policyRightsSignals ?? [];
  const hasExplicitAbsence =
    /^(absent|none|missing|not_found)$/i.test(mechanism ?? "") ||
    input.sectionReviewNoDsarMechanism === true;
  const hasPolicyAnchor = Boolean(input.policyPageUrl && /^https?:\/\//i.test(input.policyPageUrl));
  const confidence = input.policySemanticConfidence ?? null;
  const blockers: string[] = [];

  if (!hasPolicyAnchor) {
    blockers.push("missing_policy_anchor_url");
  }
  if (input.policyExtractionStatus !== "fetched") {
    blockers.push(input.policyExtractionStatus ? "policy_extraction_incomplete" : "missing_policy_extraction_status");
  }
  if (input.policyStructurallyWeak === true) {
    blockers.push("policy_structurally_weak");
  }
  if (typeof confidence !== "number" || confidence < 0.75) {
    blockers.push("low_policy_semantic_confidence");
  }
  if (!hasExplicitAbsence) {
    blockers.push("missing_explicit_dsar_absence");
  }
  if (mechanism && !/^(absent|none|missing|not_found|unknown|null)$/i.test(mechanism)) {
    blockers.push("dsar_mechanism_present");
  }
  if (rightsSignals.length > 0) {
    blockers.push("rights_signals_present");
  }

  const promotionReady = blockers.length === 0;
  return {
    blockers,
    evidence: {
      policyCoverageRatio: input.policyCoverageRatio ?? null,
      policyDsarMechanism: mechanism,
      policyExtractionStatus: input.policyExtractionStatus ?? null,
      policyPageUrl: input.policyPageUrl ?? null,
      policyRightsSignals: rightsSignals,
      policySemanticConfidence: confidence,
      policySnippetCount: input.policySnippetCount ?? null,
      sectionReviewNoDsarMechanism: input.sectionReviewNoDsarMechanism === true
    },
    findingId: "missing_dsar_mechanism",
    promotionReady
  };
}

export function classifyPrivacyRightsPathPromotionBlockers(input: PromotionBlockerInput): PromotionBlockerAssessment {
  const rightsSignals = input.policyRightsSignals ?? [];
  const snippets = getPolicySnippets(input);
  const concreteSnapshotMechanism =
    input.privacyRequestFormPresent === true ||
    input.dataAccessRequestPresent === true ||
    input.dataDeletionRequestPresent === true;
  const dsarMechanism = input.policyDsarMechanism?.trim() || null;
  const actionableRightsSignal = rightsSignals.some((value) =>
    /access|delete|deletion|correct|correction|export|portable|opt[-_\s]?out|privacy_controls|privacy_contact|authorized_agent|appeal/i.test(value)
  );
  const actionableSnippet = snippets.some((value) =>
    /(?:privacy rights|rights (?:portal|center)|privacy (?:portal|center|request)|(?:access|delete|deletion|correction|opt-out|data) request|request (?:access|deletion|correction|a copy)|submit (?:a )?request|exercise (?:your )?rights|privacy@|data protection officer|\bdpo\b|webform|request form)/i.test(value)
  );
  const meaningfulMechanism = Boolean(dsarMechanism && !/^(?:none|unknown|absent|null|missing|not_found)$/i.test(dsarMechanism));
  const blockers: string[] = [];

  if (!hasPolicyAnchor(input)) {
    blockers.push("missing_policy_anchor_url");
  }
  if (!hasFetchedPolicy(input)) {
    blockers.push(input.policyExtractionStatus ? "policy_extraction_incomplete" : "missing_policy_extraction_status");
  }
  if (!hasMinimumPolicyConfidence(input)) {
    blockers.push("low_policy_semantic_confidence");
  }
  if (!concreteSnapshotMechanism && !actionableRightsSignal && !actionableSnippet && !meaningfulMechanism) {
    blockers.push("missing_actionable_rights_path_evidence");
  }

  return {
    blockers,
    evidence: {
      actionableRightsSignal,
      actionableSnippet,
      concreteSnapshotMechanism,
      policyDsarMechanism: dsarMechanism,
      policyExtractionStatus: input.policyExtractionStatus ?? null,
      policyPageUrl: input.policyPageUrl ?? null,
      policyRightsSignals: rightsSignals,
      policySemanticConfidence: getPolicyConfidence(input),
      snippetCount: snippets.length
    },
    findingId: "privacy_rights_path_present",
    promotionReady: blockers.length === 0
  };
}

export function classifyPositiveDisclosurePromotionBlockers(
  input: PromotionBlockerInput,
  findingId:
    | "behavioral_analytics_disclosure_present"
    | "targeted_advertising_disclosure_present"
    | "tracking_technologies_disclosure_present"
): PromotionBlockerAssessment {
  const snippets = getPositiveDisclosurePolicySnippets(input, findingId);
  const pattern = disclosurePatternFor(findingId);
  const highValueSnippet = pattern ? snippets.some((value) => pattern.test(value)) : false;
  const blockers: string[] = [];

  if (!hasPolicyAnchor(input)) {
    blockers.push("missing_policy_anchor_url");
  }
  if (!hasFetchedPolicy(input)) {
    blockers.push(input.policyExtractionStatus ? "policy_extraction_incomplete" : "missing_policy_extraction_status");
  }
  if (!hasMinimumPolicyConfidence(input)) {
    blockers.push("low_policy_semantic_confidence");
  }
  if (input.policyPositiveSignalPresent !== true) {
    blockers.push("missing_policy_positive_signal");
  }
  if (snippets.length === 0) {
    blockers.push("missing_policy_snippet");
  } else if (!highValueSnippet) {
    blockers.push("generic_or_low_value_disclosure_text");
  }

  return {
    blockers,
    evidence: {
      highValueSnippet,
      policyExtractionStatus: input.policyExtractionStatus ?? null,
      policyPageUrl: input.policyPageUrl ?? null,
      policyPositiveSignalPresent: input.policyPositiveSignalPresent === true,
      policySemanticConfidence: getPolicyConfidence(input),
      snippetCount: snippets.length,
      snippetPreview: snippets[0]?.slice(0, 180) ?? null
    },
    findingId,
    promotionReady: blockers.length === 0
  };
}

export function classifyCookieDisclosureGapPromotionBlockers(input: PromotionBlockerInput): PromotionBlockerAssessment {
  const hybrid = getRecord(input.hybridRuntimeEvidence);
  const inventory = buildRuntimeCookieInventory({ hybridRuntimeEvidence: hybrid });
  const runtimeCookieNames = getRuntimeCookieNames(input);
  const unmatchedCookieNames = getUnmatchedCookieNames(input);
  const unmatchedCookieCount = getUnmatchedCookieCount(input);
  const unmatchedThirdPartyCookieCount = getUnmatchedThirdPartyCookieCount(input);
  const promotionGradeUnmatchedCookie = hasPromotionGradeUnmatchedCookie(input);
  const validationBacked = Boolean(getRecord(input.cookieGapValidationEvidence));
  const effectivePolicyUrl = getEffectiveCookieGapPolicyUrl(input);
  const hasCookiePolicyUrl = isLikelyPolicyUrl(effectivePolicyUrl, /cookie|privacy|legal|policy|notice/);
  const hasCookieGapSignal = input.policyPositiveSignalPresent === true || validationBacked;
  const blockers: string[] = [];

  if (!effectivePolicyUrl || !/^https?:\/\//i.test(effectivePolicyUrl)) {
    blockers.push("missing_policy_anchor_url");
  }
  if (!hasCookiePolicyUrl) {
    blockers.push("missing_cookie_or_privacy_policy_anchor");
  }
  if (!validationBacked && !hasFetchedPolicy(input)) {
    blockers.push(input.policyExtractionStatus ? "policy_extraction_incomplete" : "missing_policy_extraction_status");
  }
  if (!validationBacked && !hasMinimumPolicyConfidence(input)) {
    blockers.push("low_policy_semantic_confidence");
  }
  if (!hasCookieGapSignal) {
    blockers.push("missing_cookie_gap_signal");
  }
  if (runtimeCookieNames.length === 0) {
    blockers.push("missing_runtime_cookie_inventory");
  }
  if (unmatchedCookieCount <= 0) {
    blockers.push("missing_unmatched_cookie_inventory");
  }
  if (unmatchedCookieCount > 0 && !promotionGradeUnmatchedCookie) {
    blockers.push("missing_unmatched_nonessential_or_third_party_cookie");
  }

  return {
    blockers,
    evidence: {
      policyExtractionStatus: input.policyExtractionStatus ?? null,
      policyPageType: input.policyPageType ?? null,
      policyPageUrl: effectivePolicyUrl ?? null,
      policySemanticConfidence: getPolicyConfidence(input),
      runtimeCookieCategories: inventory.cookieCategories.slice(0, 8),
      runtimeCookieCount: runtimeCookieNames.length,
      runtimeNonEssentialCookieCount: inventory.nonEssentialCookieNames.length,
      sampleCookieInitiatorDomains: inventory.rows
        .flatMap((row) => row.initiatorDomain)
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .slice(0, 8),
      sampleCookieInitiatorVendors: inventory.rows
        .flatMap((row) => row.initiatorVendor)
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .slice(0, 8),
      sampleRuntimeCookieNames: runtimeCookieNames.slice(0, 8),
      sampleUnmatchedCookieNames: unmatchedCookieNames.slice(0, 8),
      validationBacked,
      unmatchedCookieCount,
      unmatchedThirdPartyCookieCount
    },
    findingId: "cookie_disclosure_gap",
    promotionReady: blockers.length === 0
  };
}

export function classifyPromotionBlockers(input: PromotionBlockerInput & { findingId: PromotionBlockerFindingId }) {
  switch (input.findingId) {
    case "preconsent_tracking":
      return classifyPreconsentPromotionBlockers(input);
    case "missing_dsar_mechanism":
      return classifyDsarPromotionBlockers(input);
    case "privacy_rights_path_present":
      return classifyPrivacyRightsPathPromotionBlockers(input);
    case "cookie_disclosure_gap":
      return classifyCookieDisclosureGapPromotionBlockers(input);
    case "behavioral_analytics_disclosure_present":
    case "targeted_advertising_disclosure_present":
    case "tracking_technologies_disclosure_present":
      return classifyPositiveDisclosurePromotionBlockers(input, input.findingId);
  }
}

export function summarizePromotionBlockers(assessments: PromotionBlockerAssessment[]) {
  const blockerCounts = new Map<string, number>();
  const readyCount = assessments.filter((assessment) => assessment.promotionReady).length;

  for (const assessment of assessments) {
    for (const blocker of assessment.blockers) {
      blockerCounts.set(blocker, (blockerCounts.get(blocker) ?? 0) + 1);
    }
  }

  return {
    blockerCounts: [...blockerCounts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])),
    candidateCount: assessments.length,
    readyCount
  };
}
