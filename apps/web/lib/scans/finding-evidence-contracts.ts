import type {
  NormalizedConcernAssertionLevel,
  NormalizedConcernExternalSurfacingEligibility,
  NormalizedConcernPromotionEligibility
} from "./normalized-concerns";
import {
  hasConcretePreconsentArtifact,
  hasConcreteReplayArtifact,
  hasConcreteRtbCookieSyncEvidence,
  hasPreconsentSequenceEvidence,
  hasStrongPreconsentRuntimeEvidence
} from "./promotion-evidence-contracts";
import type { UnifiedFindingPacket } from "./unified-findings";

export type EvidenceRequirementType =
  | "consentTimelineSequence"
  | "nonEssentialRequestClassification"
  | "trackingCookieClassification"
  | "postRejectRuntimeEvidence"
  | "successfulRejectInteraction"
  | "rejectPathDepthEvidence"
  | "materialChoiceAsymmetryEvidence"
  | "policyAnchor"
  | "runtimeAnchor"
  | "conflictBridge"
  | "negativeEvidenceSearchScope"
  | "sessionReplayVendorEvidence"
  | "rtbOrIdentitySyncEndpointEvidence"
  | "coverageNotMateriallyBlocked";

export type EvidenceRequirement = {
  type: EvidenceRequirementType;
  description: string;
};

export type DowngradeRule = {
  ifMissing: EvidenceRequirementType;
  to: "moderate" | "weak" | "audit_only";
  reason: string;
};

export type SuppressionRule = {
  ifPresent?: EvidenceRequirementType;
  ifMissing?: EvidenceRequirementType;
  reason: string;
};

export type ProjectionEligibilityRule = boolean | {
  requiresContractPass: true;
  minimumTier?: "moderate" | "strong";
};

export type FindingEvidenceContract = {
  findingId: string;
  unifiedFindingIds: string[];
  requiredForStrong: EvidenceRequirement[];
  requiredForGood: EvidenceRequirement[];
  downgradeIf: DowngradeRule[];
  suppressIf: SuppressionRule[];
  projectionEligibility: {
    executive: ProjectionEligibilityRule;
    gdprEprivacy: ProjectionEligibilityRule;
    ccpaCpra: ProjectionEligibilityRule;
    ftc: ProjectionEligibilityRule;
  };
  notes: string;
};

export type FindingEvidenceContractDecision = {
  allowedNarrativeTier: NormalizedConcernAssertionLevel;
  externalSurfacingEligibility: NormalizedConcernExternalSurfacingEligibility;
  missingRequirements: EvidenceRequirementType[];
  negativeEvidenceFlags: string[];
  promotionEligibility: NormalizedConcernPromotionEligibility;
  satisfiedRequirements: EvidenceRequirementType[];
  status: "pass_strong" | "pass_good" | "downgrade" | "suppress";
};

const REQUIREMENT_DESCRIPTIONS: Record<EvidenceRequirementType, string> = {
  consentTimelineSequence: "Observed consent timeline has a non-essential request or cookie before CMP visibility or user action.",
  nonEssentialRequestClassification: "Runtime request or cookie is classified non-essential from structured evidence.",
  trackingCookieClassification: "Cookie evidence is classified analytics, advertising, marketing, retargeting, or session replay.",
  postRejectRuntimeEvidence: "Timestamped post-reject runtime activity shows non-essential tracking persisted.",
  successfulRejectInteraction: "Reject interaction succeeded before post-reject activity was evaluated.",
  rejectPathDepthEvidence: "Reject path depth and availability were inspected with an explicit outcome.",
  materialChoiceAsymmetryEvidence: "Structured UI evidence shows a material consent choice asymmetry or dark pattern.",
  policyAnchor: "A retained policy/disclosure source was fetched and can anchor the interpretation.",
  runtimeAnchor: "Concrete runtime request, cookie, vendor, or payload evidence anchors the finding.",
  conflictBridge: "Evidence explains the mismatch between runtime behavior and disclosure language.",
  negativeEvidenceSearchScope: "The relevant policy/disclosure search scope was inspected and no adequate disclosure was found.",
  sessionReplayVendorEvidence: "Runtime evidence identifies a session replay vendor or replay artifact.",
  rtbOrIdentitySyncEndpointEvidence: "Concrete RTB, cookie-sync, or identity-sync endpoint evidence was retained.",
  coverageNotMateriallyBlocked: "Runtime coverage was not materially or severely blocked by bot defenses or interstitials."
};

function req(type: EvidenceRequirementType): EvidenceRequirement {
  return { type, description: REQUIREMENT_DESCRIPTIONS[type] };
}

const PRECONSENT_STRONG = [
  req("consentTimelineSequence"),
  req("nonEssentialRequestClassification"),
  req("coverageNotMateriallyBlocked")
];

const PRECONSENT_COOKIE_STRONG = [
  req("consentTimelineSequence"),
  req("trackingCookieClassification"),
  req("coverageNotMateriallyBlocked")
];

export const FINDING_EVIDENCE_CONTRACTS = [
  {
    findingId: "pre_consent_tracking_detected",
    unifiedFindingIds: ["preconsent_tracking"],
    requiredForStrong: PRECONSENT_STRONG,
    requiredForGood: [req("runtimeAnchor")],
    downgradeIf: [
      { ifMissing: "consentTimelineSequence", to: "audit_only", reason: "Pre-consent framing needs observed timeline sequence evidence." },
      { ifMissing: "nonEssentialRequestClassification", to: "audit_only", reason: "Pre-consent tracking needs non-essential classification evidence." },
      { ifMissing: "coverageNotMateriallyBlocked", to: "audit_only", reason: "Material bot blocking makes positive runtime conclusions unsafe." }
    ],
    suppressIf: [],
    projectionEligibility: {
      executive: { requiresContractPass: true, minimumTier: "strong" },
      gdprEprivacy: { requiresContractPass: true, minimumTier: "strong" },
      ccpaCpra: { requiresContractPass: true, minimumTier: "strong" },
      ftc: { requiresContractPass: true, minimumTier: "strong" }
    },
    notes: "Snapshot booleans are never sufficient; strong requires timeline plus non-essential runtime evidence."
  },
  {
    findingId: "third_party_tracking_before_consent",
    unifiedFindingIds: ["preconsent_tracking"],
    requiredForStrong: PRECONSENT_STRONG,
    requiredForGood: [req("runtimeAnchor")],
    downgradeIf: [
      { ifMissing: "consentTimelineSequence", to: "audit_only", reason: "Third-party pre-consent framing needs observed timeline sequence evidence." },
      { ifMissing: "nonEssentialRequestClassification", to: "audit_only", reason: "Mixed-use third-party endpoints need non-essential classification evidence." }
    ],
    suppressIf: [],
    projectionEligibility: {
      executive: { requiresContractPass: true, minimumTier: "strong" },
      gdprEprivacy: { requiresContractPass: true, minimumTier: "strong" },
      ccpaCpra: { requiresContractPass: true, minimumTier: "strong" },
      ftc: { requiresContractPass: true, minimumTier: "strong" }
    },
    notes: "Shares the preconsent_tracking unified packet contract until split into a separate unified finding."
  },
  {
    findingId: "tracking_cookies_set_before_consent",
    unifiedFindingIds: ["preconsent_tracking"],
    requiredForStrong: PRECONSENT_COOKIE_STRONG,
    requiredForGood: [req("runtimeAnchor")],
    downgradeIf: [
      { ifMissing: "consentTimelineSequence", to: "audit_only", reason: "Cookie-before-consent framing needs observed timeline evidence." },
      { ifMissing: "trackingCookieClassification", to: "audit_only", reason: "Cookie evidence must be classified as non-essential tracking." }
    ],
    suppressIf: [],
    projectionEligibility: {
      executive: { requiresContractPass: true, minimumTier: "strong" },
      gdprEprivacy: { requiresContractPass: true, minimumTier: "strong" },
      ccpaCpra: { requiresContractPass: true, minimumTier: "strong" },
      ftc: { requiresContractPass: true, minimumTier: "strong" }
    },
    notes: "Cookie names or categories alone are not enough without timing."
  },
  {
    findingId: "analytics_cookies_before_consent",
    unifiedFindingIds: ["preconsent_tracking"],
    requiredForStrong: PRECONSENT_COOKIE_STRONG,
    requiredForGood: [req("runtimeAnchor")],
    downgradeIf: [
      { ifMissing: "consentTimelineSequence", to: "audit_only", reason: "Analytics-cookie pre-consent framing needs observed timeline evidence." },
      { ifMissing: "trackingCookieClassification", to: "audit_only", reason: "Analytics cookie classification must be explicit." }
    ],
    suppressIf: [],
    projectionEligibility: {
      executive: { requiresContractPass: true, minimumTier: "strong" },
      gdprEprivacy: { requiresContractPass: true, minimumTier: "strong" },
      ccpaCpra: { requiresContractPass: true, minimumTier: "strong" },
      ftc: { requiresContractPass: true, minimumTier: "strong" }
    },
    notes: "Currently enforced through the canonical preconsent_tracking unified finding."
  },
  {
    findingId: "non_essential_tracking_continued_after_reject",
    unifiedFindingIds: ["reject_did_not_reduce_tracking", "reject_did_not_reduce_third_party_cookies"],
    requiredForStrong: [
      req("successfulRejectInteraction"),
      req("postRejectRuntimeEvidence"),
      req("nonEssentialRequestClassification"),
      req("coverageNotMateriallyBlocked")
    ],
    requiredForGood: [req("successfulRejectInteraction"), req("postRejectRuntimeEvidence")],
    downgradeIf: [
      { ifMissing: "successfulRejectInteraction", to: "audit_only", reason: "Post-reject persistence requires a successful reject interaction." },
      { ifMissing: "postRejectRuntimeEvidence", to: "audit_only", reason: "Post-reject persistence requires timestamped post-reject runtime activity." },
      { ifMissing: "nonEssentialRequestClassification", to: "audit_only", reason: "Post-reject persistence requires non-essential classification evidence." }
    ],
    suppressIf: [],
    projectionEligibility: {
      executive: { requiresContractPass: true, minimumTier: "strong" },
      gdprEprivacy: { requiresContractPass: true, minimumTier: "strong" },
      ccpaCpra: false,
      ftc: { requiresContractPass: true, minimumTier: "strong" }
    },
    notes: "Reject-path findings cannot rely on baseline tracking deltas without a successful reject path."
  },
  {
    findingId: "reject_option_missing_or_hidden",
    unifiedFindingIds: ["reject_button_missing"],
    requiredForStrong: [req("rejectPathDepthEvidence"), req("coverageNotMateriallyBlocked")],
    requiredForGood: [req("rejectPathDepthEvidence")],
    downgradeIf: [
      { ifMissing: "rejectPathDepthEvidence", to: "audit_only", reason: "Reject missing/hidden requires inspected reject path depth and availability evidence." }
    ],
    suppressIf: [],
    projectionEligibility: {
      executive: { requiresContractPass: true, minimumTier: "strong" },
      gdprEprivacy: { requiresContractPass: true, minimumTier: "strong" },
      ccpaCpra: { requiresContractPass: true, minimumTier: "strong" },
      ftc: { requiresContractPass: true, minimumTier: "strong" }
    },
    notes: "Must distinguish untested, unavailable, hidden, failed, and not found paths."
  },
  {
    findingId: "dark_pattern_consent_signals_detected",
    unifiedFindingIds: ["accept_more_prominent_than_reject", "accept_only_banner", "dismiss_without_reject", "forced_consent_wall"],
    requiredForStrong: [req("materialChoiceAsymmetryEvidence"), req("coverageNotMateriallyBlocked")],
    requiredForGood: [req("materialChoiceAsymmetryEvidence")],
    downgradeIf: [
      { ifMissing: "materialChoiceAsymmetryEvidence", to: "audit_only", reason: "Dark-pattern surfacing requires normalized UI/interaction evidence." }
    ],
    suppressIf: [],
    projectionEligibility: {
      executive: { requiresContractPass: true, minimumTier: "strong" },
      gdprEprivacy: { requiresContractPass: true, minimumTier: "strong" },
      ccpaCpra: { requiresContractPass: true, minimumTier: "strong" },
      ftc: { requiresContractPass: true, minimumTier: "strong" }
    },
    notes: "A single weak boolean does not satisfy this contract."
  },
  {
    findingId: "cookie_disclosure_gap",
    unifiedFindingIds: ["cookie_disclosure_gap"],
    requiredForStrong: [req("runtimeAnchor"), req("policyAnchor"), req("negativeEvidenceSearchScope"), req("conflictBridge")],
    requiredForGood: [req("runtimeAnchor"), req("policyAnchor")],
    downgradeIf: [
      { ifMissing: "policyAnchor", to: "audit_only", reason: "Without a policy/disclosure anchor this is coverage review, not a disclosure gap." },
      { ifMissing: "negativeEvidenceSearchScope", to: "audit_only", reason: "Disclosure gaps require retained negative search scope." },
      { ifMissing: "runtimeAnchor", to: "audit_only", reason: "Disclosure gaps require observed runtime cookie/vendor behavior." }
    ],
    suppressIf: [],
    projectionEligibility: {
      executive: { requiresContractPass: true, minimumTier: "strong" },
      gdprEprivacy: { requiresContractPass: true, minimumTier: "strong" },
      ccpaCpra: { requiresContractPass: true, minimumTier: "strong" },
      ftc: { requiresContractPass: true, minimumTier: "strong" }
    },
    notes: "Policy-unavailable cases remain coverage/review, not confirmed disclosure gaps."
  },
  {
    findingId: "session_replay_undisclosed",
    unifiedFindingIds: ["session_replay_undisclosed"],
    requiredForStrong: [req("sessionReplayVendorEvidence"), req("policyAnchor"), req("negativeEvidenceSearchScope"), req("conflictBridge")],
    requiredForGood: [req("sessionReplayVendorEvidence"), req("policyAnchor")],
    downgradeIf: [
      { ifMissing: "sessionReplayVendorEvidence", to: "audit_only", reason: "Undisclosed replay requires concrete replay vendor/runtime evidence." },
      { ifMissing: "negativeEvidenceSearchScope", to: "audit_only", reason: "Undisclosed replay requires searched disclosure scope." }
    ],
    suppressIf: [],
    projectionEligibility: {
      executive: { requiresContractPass: true, minimumTier: "strong" },
      gdprEprivacy: { requiresContractPass: true, minimumTier: "strong" },
      ccpaCpra: { requiresContractPass: true, minimumTier: "strong" },
      ftc: { requiresContractPass: true, minimumTier: "strong" }
    },
    notes: "Runtime replay alone can support review, but not undisclosed-session-replay surfacing."
  },
  {
    findingId: "rtb_cookie_sync_observed",
    unifiedFindingIds: ["rtb_cookie_sync_observed"],
    requiredForStrong: [req("rtbOrIdentitySyncEndpointEvidence"), req("coverageNotMateriallyBlocked"), req("consentTimelineSequence")],
    requiredForGood: [req("rtbOrIdentitySyncEndpointEvidence"), req("coverageNotMateriallyBlocked")],
    downgradeIf: [
      { ifMissing: "rtbOrIdentitySyncEndpointEvidence", to: "audit_only", reason: "RTB/identity sync requires concrete endpoint evidence." },
      { ifMissing: "consentTimelineSequence", to: "moderate", reason: "RTB can surface as runtime evidence, but pre-consent framing requires timeline evidence." }
    ],
    suppressIf: [],
    projectionEligibility: {
      executive: { requiresContractPass: true, minimumTier: "moderate" },
      gdprEprivacy: { requiresContractPass: true, minimumTier: "moderate" },
      ccpaCpra: { requiresContractPass: true, minimumTier: "moderate" },
      ftc: false
    },
    notes: "Moderate runtime RTB surfacing does not imply pre-consent RTB without a consent timeline."
  }
] as const satisfies readonly FindingEvidenceContract[];

const CONTRACT_BY_UNIFIED_ID = new Map<string, FindingEvidenceContract>();
for (const contract of FINDING_EVIDENCE_CONTRACTS) {
  for (const unifiedFindingId of contract.unifiedFindingIds) {
    if (!CONTRACT_BY_UNIFIED_ID.has(unifiedFindingId)) {
      CONTRACT_BY_UNIFIED_ID.set(unifiedFindingId, contract);
    }
  }
}

export function getFindingEvidenceContractForUnifiedFinding(unifiedFindingId: string | null | undefined) {
  return unifiedFindingId ? CONTRACT_BY_UNIFIED_ID.get(unifiedFindingId) ?? null : null;
}

function getStringArrayValues(record: Record<string, unknown> | null | undefined, keys: string[]) {
  const values: string[] = [];
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "string" && value.trim().length > 0) {
      values.push(value.trim());
    } else if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === "string" && entry.trim().length > 0) {
          values.push(entry.trim());
        }
      }
    }
  }
  return [...new Set(values)];
}

function getObjectValue(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }
  return null;
}

function getObjectArrayValues(record: Record<string, unknown> | null | undefined, keys: string[]) {
  const values: Array<Record<string, unknown>> = [];
  for (const key of keys) {
    const value = record?.[key];
    if (Array.isArray(value)) {
      values.push(...value.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry)));
    }
  }
  return values;
}

function getBoolean(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    if (typeof record?.[key] === "boolean") {
      return record[key] as boolean;
    }
  }
  return null;
}

function isPromotionCookieCategory(value: string) {
  return /analytics|advertising|marketing|retargeting|session_replay/i.test(value);
}

function isPromotionCookieName(value: string) {
  return /(^_ga|^_gid|^_gat|ga_|goog|gtm|doubleclick|^_fbp|^_fbc|gcl_|ttclid|ttp|li_sugr|bcookie|lidc|uuid2|xandr|adnxs|muid|demdex|adobeorg|kndctr_.*adobeorg|mbox|qsi_replaysession|qualtrics|hotjar|fullstory|clarity|contentsquare|mouseflow|_hj)/i.test(value);
}

function isIgnoredRuntimeCookieName(value: string) {
  return /^(awsalb|awsalbcors|__cf_bm|cf_clearance|optanonconsent|optanonalertboxclosed|geo_country|trp-country|trp-language)$/i.test(value.trim());
}

function hasOnlyIgnoredCookieEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  const runtimeCookieNames = getStringArrayValues(rawEvidence, ["runtime_cookie_names", "runtimeCookieNames"]);
  const unmatchedCookieNames = getStringArrayValues(rawEvidence, ["unmatched_cookie_names", "unmatchedCookieNames"]);
  const candidateCookieNames = unmatchedCookieNames.length > 0 ? unmatchedCookieNames : runtimeCookieNames;
  return candidateCookieNames.length > 0 && candidateCookieNames.every(isIgnoredRuntimeCookieName);
}

function hasTrackingCookieClassification(rawEvidence: Record<string, unknown> | null | undefined) {
  const categories = getStringArrayValues(rawEvidence, [
    "preconsent_cookie_categories",
    "preconsentCookieCategories",
    "unmatched_cookie_categories",
    "unmatchedCookieCategories",
    "runtime_cookie_categories",
    "runtimeCookieCategories"
  ]);
  const names = getStringArrayValues(rawEvidence, [
    "preconsent_cookie_names",
    "preconsentCookieNames",
    "preconsent_nonessential_cookie_names",
    "preconsentNonessentialCookieNames",
    "runtime_cookie_names",
    "runtimeCookieNames",
    "unmatched_cookie_names",
    "unmatchedCookieNames"
  ]);
  return categories.some(isPromotionCookieCategory) || names.some(isPromotionCookieName);
}

function hasNonEssentialRequestClassification(rawEvidence: Record<string, unknown> | null | undefined) {
  if (hasStrongPreconsentRuntimeEvidence(rawEvidence)) {
    return true;
  }
  return getObjectArrayValues(rawEvidence, [
    "requestPurposeClassificationConfidence",
    "request_purpose_classification_confidence"
  ]).some((row) => {
    const essentiality =
      typeof row.essentiality === "string"
        ? row.essentiality
        : typeof row.classification === "string"
          ? row.classification
          : null;
    const confidence =
      typeof row.confidence === "number"
        ? row.confidence
        : typeof row.score === "number"
          ? row.score
          : null;
    return essentiality === "non_essential" && typeof confidence === "number" && confidence >= 0.7;
  });
}

function hasCoverageNotMateriallyBlocked(rawEvidence: Record<string, unknown> | null | undefined) {
  const botBlock = getObjectValue(rawEvidence, ["botBlockChallengeEvidence", "bot_block_challenge_evidence"]);
  const impact =
    typeof botBlock?.coverageImpact === "string"
      ? botBlock.coverageImpact
      : typeof botBlock?.coverage_impact === "string"
        ? botBlock.coverage_impact
        : null;
  return !(botBlock?.blocked === true && (impact === "material" || impact === "severe"));
}

function hasSuccessfulRejectInteraction(rawEvidence: Record<string, unknown> | null | undefined) {
  const rejectPath = getObjectValue(rawEvidence, ["rejectPathDepthAndAvailability", "reject_path_depth_and_availability"]);
  return (
    rejectPath?.rejectInteractionSucceeded === true ||
    rejectPath?.reject_interaction_succeeded === true ||
    getBoolean(rawEvidence, ["consentRejectInteractionSucceeded", "consent_reject_interaction_succeeded"]) === true
  );
}

function hasPostRejectRuntimeEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  return (
    getStringArrayValues(rawEvidence, [
      "postRejectNonEssentialRequestUrls",
      "post_reject_non_essential_request_urls",
      "postRejectRuntimeRequestUrls",
      "post_reject_runtime_request_urls"
    ]).length > 0 ||
    getObjectArrayValues(rawEvidence, [
      "postRejectNonEssentialRequests",
      "post_reject_non_essential_requests",
      "postRejectTrackingActivity",
      "post_reject_tracking_activity"
    ]).length > 0 ||
    getBoolean(rawEvidence, ["postRejectNonEssentialActivityObserved", "post_reject_non_essential_activity_observed"]) === true
  );
}

function hasRejectPathDepthEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  const rejectPath = getObjectValue(rawEvidence, ["rejectPathDepthAndAvailability", "reject_path_depth_and_availability"]);
  if (!rejectPath) {
    return false;
  }
  const status =
    typeof rejectPath.availability === "string"
      ? rejectPath.availability
      : typeof rejectPath.status === "string"
        ? rejectPath.status
        : typeof rejectPath.outcome === "string"
          ? rejectPath.outcome
          : null;
  const inspected =
    rejectPath.bannerLayerInspected === true ||
    rejectPath.banner_layer_inspected === true ||
    rejectPath.rejectPathTested === true ||
    rejectPath.reject_path_tested === true;
  return inspected && Boolean(status && ["available", "hidden", "not_found", "unavailable", "failed", "untested"].includes(status));
}

function hasMaterialChoiceAsymmetryEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  const flags = getStringArrayValues(rawEvidence, ["flags", "evidenceFlags", "uiEvidenceFlags", "runtimeArtifacts"]);
  return (
    getBoolean(rawEvidence, ["materialChoiceAsymmetryObserved", "material_choice_asymmetry_observed"]) === true ||
    flags.some((flag) => /dark_pattern|accept_more_prominent|reject_button_missing|forced_consent_wall|accept_only_banner/.test(flag))
  );
}

function hasPolicyAnchor(rawEvidence: Record<string, unknown> | null | undefined) {
  return (
    getStringArrayValues(rawEvidence, ["policySourceUrl", "policy_source_url", "policyUrls", "policy_urls", "sourceUrls"]).some((url) =>
      /^https?:\/\//i.test(url) && /cookie|privacy|legal|policy|notice/i.test(url)
    ) ||
    getBoolean(rawEvidence, ["policyAnchorRetained", "policy_anchor_retained"]) === true ||
    rawEvidence?.policyExtractionStatus === "fetched" ||
    rawEvidence?.policy_extraction_status === "fetched"
  );
}

function hasRuntimeAnchor(rawEvidence: Record<string, unknown> | null | undefined) {
  return (
    hasConcretePreconsentArtifact(rawEvidence) ||
    hasConcreteReplayArtifact(rawEvidence) ||
    hasConcreteRtbCookieSyncEvidence(rawEvidence) ||
    hasTrackingCookieClassification(rawEvidence) ||
    getStringArrayValues(rawEvidence, ["runtimeRequestUrls", "runtime_request_urls", "requestUrls", "runtimeVendors"]).length > 0
  );
}

function hasConflictBridge(rawEvidence: Record<string, unknown> | null | undefined) {
  return (
    getBoolean(rawEvidence, ["disclosureMismatchExplained", "disclosure_mismatch_explained"]) === true ||
    getStringArrayValues(rawEvidence, [
      "mismatchExplanation",
      "mismatch_explanation",
      "conflictBridgeReasoning",
      "conflict_bridge_reasoning",
      "observedBehavior",
      "policySnippet"
    ]).length >= 2
  );
}

function hasNegativeEvidenceSearchScope(rawEvidence: Record<string, unknown> | null | undefined) {
  return (
    getBoolean(rawEvidence, ["negativeDisclosureSearchPerformed", "negative_disclosure_search_performed"]) === true ||
    getBoolean(rawEvidence, ["disclosureSearchScopeRetained", "disclosure_search_scope_retained"]) === true ||
    getStringArrayValues(rawEvidence, ["searchedPolicyUrls", "searched_policy_urls", "policySearchScope", "policy_search_scope"]).length > 0
  );
}

function hasSessionReplayVendorEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  return hasConcreteReplayArtifact(rawEvidence) ||
    getStringArrayValues(rawEvidence, [
      "sessionReplayVendors",
      "session_replay_vendors",
      "sessionReplayRuntimeArtifacts",
      "session_replay_runtime_artifacts"
    ]).length > 0;
}

function isRequirementSatisfied(type: EvidenceRequirementType, rawEvidence: Record<string, unknown> | null | undefined) {
  switch (type) {
    case "consentTimelineSequence":
      return hasPreconsentSequenceEvidence(rawEvidence);
    case "nonEssentialRequestClassification":
      return hasNonEssentialRequestClassification(rawEvidence);
    case "trackingCookieClassification":
      return hasTrackingCookieClassification(rawEvidence);
    case "postRejectRuntimeEvidence":
      return hasPostRejectRuntimeEvidence(rawEvidence);
    case "successfulRejectInteraction":
      return hasSuccessfulRejectInteraction(rawEvidence);
    case "rejectPathDepthEvidence":
      return hasRejectPathDepthEvidence(rawEvidence);
    case "materialChoiceAsymmetryEvidence":
      return hasMaterialChoiceAsymmetryEvidence(rawEvidence);
    case "policyAnchor":
      return hasPolicyAnchor(rawEvidence);
    case "runtimeAnchor":
      return hasRuntimeAnchor(rawEvidence);
    case "conflictBridge":
      return hasConflictBridge(rawEvidence);
    case "negativeEvidenceSearchScope":
      return hasNegativeEvidenceSearchScope(rawEvidence);
    case "sessionReplayVendorEvidence":
      return hasSessionReplayVendorEvidence(rawEvidence);
    case "rtbOrIdentitySyncEndpointEvidence":
      return hasConcreteRtbCookieSyncEvidence(rawEvidence);
    case "coverageNotMateriallyBlocked":
      return hasCoverageNotMateriallyBlocked(rawEvidence);
  }
}

function downgradeFlag(type: EvidenceRequirementType) {
  switch (type) {
    case "consentTimelineSequence":
      return "missing_preconsent_sequence_evidence";
    case "nonEssentialRequestClassification":
      return "missing_concrete_preconsent_artifact";
    case "trackingCookieClassification":
    case "sessionReplayVendorEvidence":
      return "missing_third_party_tracking_artifact";
    case "postRejectRuntimeEvidence":
    case "successfulRejectInteraction":
      return "missing_post_reject_timing_evidence";
    case "policyAnchor":
    case "negativeEvidenceSearchScope":
      return "missing_policy_side_evidence";
    case "runtimeAnchor":
    case "rtbOrIdentitySyncEndpointEvidence":
      return "missing_specific_runtime_anchor";
    case "coverageNotMateriallyBlocked":
      return "blocked_or_interstitial_evidence_observed";
    default:
      return "missing_specific_runtime_anchor";
  }
}

function orderNegativeEvidenceFlags(flags: string[]) {
  const order = new Map([
    ["missing_concrete_preconsent_artifact", 10],
    ["missing_preconsent_sequence_evidence", 20]
  ]);
  return [...flags].sort((left, right) => (order.get(left) ?? 100) - (order.get(right) ?? 100));
}

export function evaluateFindingEvidenceContractForRawEvidence(
  unifiedFindingId: string | null | undefined,
  rawEvidence: Record<string, unknown> | null | undefined
): FindingEvidenceContractDecision | null {
  const contract = getFindingEvidenceContractForUnifiedFinding(unifiedFindingId);
  if (!contract) {
    return null;
  }

  const allRequirements = [...new Set([...contract.requiredForStrong, ...contract.requiredForGood].map((requirement) => requirement.type))];
  const satisfiedRequirements = allRequirements.filter((type) => isRequirementSatisfied(type, rawEvidence));
  const missingStrong = contract.requiredForStrong
    .map((requirement) => requirement.type)
    .filter((type) => !satisfiedRequirements.includes(type));
  const missingGood = contract.requiredForGood
    .map((requirement) => requirement.type)
    .filter((type) => !satisfiedRequirements.includes(type));

  const negativeEvidenceFlags = orderNegativeEvidenceFlags([
    ...new Set((missingStrong.length > 0 ? missingStrong : missingGood).map(downgradeFlag))
  ]);

  if (unifiedFindingId === "cookie_disclosure_gap" && hasOnlyIgnoredCookieEvidence(rawEvidence)) {
    return {
      allowedNarrativeTier: "weak",
      externalSurfacingEligibility: "suppress",
      missingRequirements: missingStrong,
      negativeEvidenceFlags: [...new Set([...negativeEvidenceFlags, "runtime_cookie_inventory_ignored_only"])],
      promotionEligibility: "blocked",
      satisfiedRequirements,
      status: "suppress"
    };
  }

  if (missingStrong.length === 0) {
    return {
      allowedNarrativeTier: "strong",
      externalSurfacingEligibility: "eligible",
      missingRequirements: [],
      negativeEvidenceFlags,
      promotionEligibility: "eligible",
      satisfiedRequirements,
      status: "pass_strong"
    };
  }

  const hardDowngradeMissing = contract.downgradeIf
    .filter((rule) => rule.to === "audit_only" && missingStrong.includes(rule.ifMissing))
    .map((rule) => rule.ifMissing);
  if (hardDowngradeMissing.length > 0) {
    return {
      allowedNarrativeTier: "weak",
      externalSurfacingEligibility: "audit_only",
      missingRequirements: [...new Set([...hardDowngradeMissing, ...missingGood])],
      negativeEvidenceFlags,
      promotionEligibility: "internal_only",
      satisfiedRequirements,
      status: "downgrade"
    };
  }

  if (missingGood.length === 0) {
    return {
      allowedNarrativeTier: "moderate",
      externalSurfacingEligibility: "eligible",
      missingRequirements: missingStrong,
      negativeEvidenceFlags,
      promotionEligibility: "eligible",
      satisfiedRequirements,
      status: "pass_good"
    };
  }

  return {
    allowedNarrativeTier: "weak",
    externalSurfacingEligibility: "audit_only",
    missingRequirements: [...new Set([...missingStrong, ...missingGood])],
    negativeEvidenceFlags,
    promotionEligibility: "internal_only",
    satisfiedRequirements,
    status: "downgrade"
  };
}

function packetToContractEvidence(packet: UnifiedFindingPacket): Record<string, unknown> {
  const entities = packet.evidence?.entities ?? {};
  const consentTrackingDetails = packet.details?.family === "consent_tracking" ? packet.details : null;
  return {
    botBlockChallengeEvidence: packet.concernContext?.negativeEvidenceFlags.includes("blocked_or_interstitial_evidence_observed")
      ? { blocked: true, coverageImpact: "material" }
      : undefined,
    consentTimeline: (entities.consentTimeline ?? entities.consent_timeline)?.map((value) => {
      try {
        return JSON.parse(value) as unknown;
      } catch {
        return value;
      }
    }),
    disclosureSearchScopeRetained:
      packet.confidenceInputs.hasPolicyTextEvidence &&
      (packet.evidence?.pageUrls?.length || packet.evidence?.sourceUrls?.length || packet.evidence?.snippets?.length)
        ? true
        : undefined,
    flags: packet.evidence?.flags ?? [],
    negativeDisclosureSearchPerformed: packet.concernContext?.evidenceStrengthFlags.includes("policy_text") || undefined,
    policyAnchorRetained: packet.confidenceInputs.hasPolicyTextEvidence || undefined,
    policySourceUrl: [...(packet.evidence?.pageUrls ?? []), ...(packet.evidence?.sourceUrls ?? [])].find((url) =>
      /cookie|privacy|legal|policy|notice/i.test(url)
    ),
    postRejectNonEssentialRequestUrls: entities.postRejectNonEssentialRequestUrls ?? entities.post_reject_non_essential_request_urls,
    preconsentCookieCategories: entities.preconsentCookieCategories ?? entities.preconsent_cookie_categories,
    preconsentCookieNames: entities.preconsentCookieNames ?? entities.preconsent_cookie_names,
    requestPurposeClassificationConfidence: entities.requestPurposeClassificationConfidence?.map((value) => {
      try {
        return JSON.parse(value) as unknown;
      } catch {
        return value;
      }
    }),
    rtb_cookie_sync_evidence: entities.rtb_cookie_sync_evidence?.map((value) => {
      try {
        return JSON.parse(value) as unknown;
      } catch {
        return value;
      }
    }),
    runtimeRequestUrls: entities.runtimeRequestUrls ?? consentTrackingDetails?.requestUrls,
    runtimeVendors: entities.runtimeVendors ?? consentTrackingDetails?.vendors,
    searchedPolicyUrls: packet.evidence?.pageUrls,
    sessionReplayRuntimeArtifacts: entities.session_replay_runtime_artifacts ?? entities.sessionReplayRuntimeArtifacts,
    sessionReplayVendors: entities.sessionReplayVendors ?? entities.session_replay_vendors,
    unmatchedCookieCategories: entities.unmatched_cookie_categories ?? entities.unmatchedCookieCategories,
    unmatchedCookieNames: entities.unmatched_cookie_names ?? entities.unmatchedCookieNames
  };
}

export function evaluateFindingEvidenceContractForPacket(packet: UnifiedFindingPacket) {
  const contract = getFindingEvidenceContractForUnifiedFinding(packet.unifiedFindingId);
  if (!contract) {
    return null;
  }

  if (packet.concernContext) {
    if (
      packet.concernContext.promotionEligibilities.length > 0 &&
      packet.concernContext.promotionEligibilities.every((value) => value === "eligible") &&
      packet.concernContext.externalSurfacingEligibilities.every((value) => value === "eligible")
    ) {
      return {
        allowedNarrativeTier: packet.concernContext.assertionLevels.includes("strong") ? "strong" : "moderate",
        externalSurfacingEligibility: "eligible",
        missingRequirements: [],
        negativeEvidenceFlags: [],
        promotionEligibility: "eligible",
        satisfiedRequirements: contract.requiredForGood.map((requirement) => requirement.type),
        status: packet.concernContext.assertionLevels.includes("strong") ? "pass_strong" : "pass_good"
      } satisfies FindingEvidenceContractDecision;
    }

    if (
      packet.concernContext.promotionEligibilities.length > 0 &&
      packet.concernContext.promotionEligibilities.every((value) => value !== "eligible")
    ) {
      return {
        allowedNarrativeTier: "weak",
        externalSurfacingEligibility: "audit_only",
        missingRequirements: [],
        negativeEvidenceFlags: packet.concernContext.negativeEvidenceFlags,
        promotionEligibility: "internal_only",
        satisfiedRequirements: [],
        status: "downgrade"
      } satisfies FindingEvidenceContractDecision;
    }
  }

  return evaluateFindingEvidenceContractForRawEvidence(packet.unifiedFindingId, packetToContractEvidence(packet));
}

export function isFindingProjectionEligible(input: {
  lane: keyof FindingEvidenceContract["projectionEligibility"];
  packet: UnifiedFindingPacket;
}) {
  const contract = getFindingEvidenceContractForUnifiedFinding(input.packet.unifiedFindingId);
  if (!contract) {
    return true;
  }

  const rule = contract.projectionEligibility[input.lane];
  if (rule === false) {
    return false;
  }
  if (rule === true) {
    return true;
  }

  const decision = evaluateFindingEvidenceContractForPacket(input.packet);
  if (!decision || decision.promotionEligibility !== "eligible") {
    return false;
  }
  if (rule.minimumTier === "strong") {
    return decision.allowedNarrativeTier === "strong";
  }
  if (rule.minimumTier === "moderate") {
    return decision.allowedNarrativeTier === "moderate" || decision.allowedNarrativeTier === "strong";
  }
  return true;
}
