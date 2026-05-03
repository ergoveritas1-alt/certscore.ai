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
  hasStrongFingerprintingEvidence,
  hasStrongPreconsentRuntimeEvidence
} from "./promotion-evidence-contracts";
import type { UnifiedFindingPacket } from "./unified-findings";

export type EvidenceRequirementType =
  | "consentTimelineSequence"
  | "nonEssentialRequestClassification"
  | "trackingCookieClassification"
  | "postRejectTimestampedRuntimeEvidence"
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
  | "coverageNotMateriallyBlocked"
  | "ignoredRuntimeCookieInventoryOnly"
  | "privacyChoiceControlSearchScope"
  | "advertisingSharingRuntimeEvidence"
  | "crossDomainIdentifierEvidence"
  | "videoContentSurfaceEvidence"
  | "videoTrackingRuntimeEvidence"
  | "fingerprintingRuntimeEvidence"
  | "sensitiveInputSurfaceEvidence"
  | "sensitiveDataFieldEvidence"
  | "sensitiveThirdPartyTrackingEvidence";

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
  postRejectTimestampedRuntimeEvidence: "Timestamped post-reject runtime activity shows non-essential tracking persisted.",
  postRejectRuntimeEvidence: "Post-reject runtime activity or cookie-diff provenance shows non-essential tracking persisted.",
  successfulRejectInteraction: "Reject interaction succeeded before post-reject activity was evaluated.",
  rejectPathDepthEvidence: "Reject path depth and availability were inspected with an explicit outcome.",
  materialChoiceAsymmetryEvidence: "Structured UI evidence shows a material consent choice asymmetry or dark pattern.",
  policyAnchor: "A retained policy/disclosure source was fetched and can anchor the interpretation.",
  runtimeAnchor: "Concrete runtime request, cookie, vendor, or payload evidence anchors the finding.",
  conflictBridge: "Evidence explains the mismatch between runtime behavior and disclosure language.",
  negativeEvidenceSearchScope: "The relevant policy/disclosure search scope was inspected and no adequate disclosure was found.",
  sessionReplayVendorEvidence: "Runtime evidence identifies a session replay vendor or replay artifact.",
  rtbOrIdentitySyncEndpointEvidence: "Concrete RTB, cookie-sync, or identity-sync endpoint evidence was retained.",
  coverageNotMateriallyBlocked: "Runtime coverage was not materially or severely blocked by bot defenses or interstitials.",
  ignoredRuntimeCookieInventoryOnly: "Runtime cookie inventory contains only operational cookies ignored by disclosure-gap promotion.",
  privacyChoiceControlSearchScope: "Retained search evidence shows privacy-choice or opt-out controls were inspected.",
  advertisingSharingRuntimeEvidence: "Runtime evidence identifies advertising, retargeting, RTB, or cross-context sharing vendors.",
  crossDomainIdentifierEvidence: "Runtime evidence shows the same identifier-like value across multiple external destinations.",
  videoContentSurfaceEvidence: "A video-content page or media title was retained for the same-page observation.",
  videoTrackingRuntimeEvidence: "Runtime evidence identifies video-page tracking requests or vendors.",
  fingerprintingRuntimeEvidence: "Runtime evidence identifies high-entropy or fingerprinting-style browser/device signals.",
  sensitiveInputSurfaceEvidence: "A sensitive input or collection surface was retained.",
  sensitiveDataFieldEvidence: "Evidence identifies sensitive field types, payloads, or field labels.",
  sensitiveThirdPartyTrackingEvidence: "Runtime evidence identifies a third-party tracking endpoint on or near the sensitive collection surface."
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
      req("postRejectTimestampedRuntimeEvidence"),
      req("nonEssentialRequestClassification"),
      req("coverageNotMateriallyBlocked")
    ],
    requiredForGood: [req("successfulRejectInteraction"), req("postRejectRuntimeEvidence")],
    downgradeIf: [
      { ifMissing: "successfulRejectInteraction", to: "audit_only", reason: "Post-reject persistence requires a successful reject interaction." },
      { ifMissing: "postRejectTimestampedRuntimeEvidence", to: "moderate", reason: "Post-reject persistence lacks timestamped request rows, so it remains review-grade." },
      { ifMissing: "postRejectRuntimeEvidence", to: "audit_only", reason: "Post-reject persistence requires retained post-reject runtime activity or cookie-diff provenance." },
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
    suppressIf: [
      { ifPresent: "ignoredRuntimeCookieInventoryOnly", reason: "Operational cookies ignored by promotion cannot support a disclosure-gap finding." }
    ],
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
  },
  {
    findingId: "cpra_cba_opt_out_missing",
    unifiedFindingIds: ["cpra_cba_opt_out_missing"],
    requiredForStrong: [req("advertisingSharingRuntimeEvidence"), req("privacyChoiceControlSearchScope"), req("coverageNotMateriallyBlocked")],
    requiredForGood: [req("advertisingSharingRuntimeEvidence"), req("privacyChoiceControlSearchScope")],
    downgradeIf: [
      { ifMissing: "advertisingSharingRuntimeEvidence", to: "audit_only", reason: "Opt-out missing findings require retained advertising/sharing runtime evidence." },
      { ifMissing: "privacyChoiceControlSearchScope", to: "audit_only", reason: "Opt-out missing findings require retained evidence that privacy-choice controls were inspected." }
    ],
    suppressIf: [],
    projectionEligibility: {
      executive: { requiresContractPass: true, minimumTier: "strong" },
      gdprEprivacy: false,
      ccpaCpra: { requiresContractPass: true, minimumTier: "strong" },
      ftc: { requiresContractPass: true, minimumTier: "strong" }
    },
    notes: "WC01 may interpret an opt-out gap only after WS01/validation retain advertising/sharing evidence plus control-search scope."
  },
  {
    findingId: "cross_domain_identifier_sharing_observed",
    unifiedFindingIds: ["cross_domain_identifier_sharing_observed"],
    requiredForStrong: [req("crossDomainIdentifierEvidence"), req("coverageNotMateriallyBlocked")],
    requiredForGood: [req("crossDomainIdentifierEvidence")],
    downgradeIf: [
      { ifMissing: "crossDomainIdentifierEvidence", to: "audit_only", reason: "Cross-domain identifier sharing requires retained request-level identifier evidence." }
    ],
    suppressIf: [],
    projectionEligibility: {
      executive: { requiresContractPass: true, minimumTier: "strong" },
      gdprEprivacy: { requiresContractPass: true, minimumTier: "strong" },
      ccpaCpra: { requiresContractPass: true, minimumTier: "strong" },
      ftc: { requiresContractPass: true, minimumTier: "strong" }
    },
    notes: "A derived boolean is not enough; retained evidence must show an identifier-like value across destinations."
  },
  {
    findingId: "video_content_tracking_exposure",
    unifiedFindingIds: ["video_content_tracking_exposure"],
    requiredForStrong: [req("videoContentSurfaceEvidence"), req("videoTrackingRuntimeEvidence"), req("coverageNotMateriallyBlocked")],
    requiredForGood: [req("videoContentSurfaceEvidence"), req("videoTrackingRuntimeEvidence")],
    downgradeIf: [
      { ifMissing: "videoContentSurfaceEvidence", to: "audit_only", reason: "Video tracking exposure requires retained video-page or media-title evidence." },
      { ifMissing: "videoTrackingRuntimeEvidence", to: "audit_only", reason: "Video tracking exposure requires retained tracking request or vendor evidence." }
    ],
    suppressIf: [],
    projectionEligibility: {
      executive: { requiresContractPass: true, minimumTier: "strong" },
      gdprEprivacy: false,
      ccpaCpra: { requiresContractPass: true, minimumTier: "strong" },
      ftc: { requiresContractPass: true, minimumTier: "strong" }
    },
    notes: "WC01 owns regulatory framing; the contract only requires same-page video context plus runtime tracking evidence."
  },
  {
    findingId: "fingerprinting_observed",
    unifiedFindingIds: ["fingerprinting_observed"],
    requiredForStrong: [req("fingerprintingRuntimeEvidence"), req("coverageNotMateriallyBlocked")],
    requiredForGood: [req("fingerprintingRuntimeEvidence")],
    downgradeIf: [
      { ifMissing: "fingerprintingRuntimeEvidence", to: "audit_only", reason: "Fingerprinting surfacing requires retained high-entropy runtime evidence." }
    ],
    suppressIf: [],
    projectionEligibility: {
      executive: { requiresContractPass: true, minimumTier: "strong" },
      gdprEprivacy: { requiresContractPass: true, minimumTier: "strong" },
      ccpaCpra: { requiresContractPass: true, minimumTier: "strong" },
      ftc: { requiresContractPass: true, minimumTier: "strong" }
    },
    notes: "The report finding is probable_fingerprinting; the contract remains evidence-only and does not assert identifiability."
  },
  {
    findingId: "session_replay_on_sensitive_input_surface",
    unifiedFindingIds: ["session_replay_on_sensitive_input_surface"],
    requiredForStrong: [req("sessionReplayVendorEvidence"), req("sensitiveInputSurfaceEvidence"), req("coverageNotMateriallyBlocked")],
    requiredForGood: [req("sessionReplayVendorEvidence"), req("sensitiveInputSurfaceEvidence")],
    downgradeIf: [
      { ifMissing: "sessionReplayVendorEvidence", to: "audit_only", reason: "Sensitive replay findings require concrete replay vendor/runtime evidence." },
      { ifMissing: "sensitiveInputSurfaceEvidence", to: "audit_only", reason: "Sensitive replay findings require retained sensitive input surface evidence." }
    ],
    suppressIf: [],
    projectionEligibility: {
      executive: { requiresContractPass: true, minimumTier: "strong" },
      gdprEprivacy: { requiresContractPass: true, minimumTier: "strong" },
      ccpaCpra: { requiresContractPass: true, minimumTier: "strong" },
      ftc: { requiresContractPass: true, minimumTier: "strong" }
    },
    notes: "Requires replay runtime evidence and sensitive input surface evidence; WC01 owns risk framing."
  },
  {
    findingId: "sensitive_data_collection_with_third_party_tracking_present",
    unifiedFindingIds: ["sensitive_data_collection_with_third_party_tracking_present"],
    requiredForStrong: [req("sensitiveInputSurfaceEvidence"), req("sensitiveDataFieldEvidence"), req("sensitiveThirdPartyTrackingEvidence"), req("coverageNotMateriallyBlocked")],
    requiredForGood: [req("sensitiveInputSurfaceEvidence"), req("sensitiveThirdPartyTrackingEvidence")],
    downgradeIf: [
      { ifMissing: "sensitiveInputSurfaceEvidence", to: "audit_only", reason: "Sensitive-data tracking findings require retained sensitive input surface evidence." },
      { ifMissing: "sensitiveThirdPartyTrackingEvidence", to: "audit_only", reason: "Sensitive-data tracking findings require retained third-party runtime evidence." }
    ],
    suppressIf: [],
    projectionEligibility: {
      executive: { requiresContractPass: true, minimumTier: "strong" },
      gdprEprivacy: { requiresContractPass: true, minimumTier: "strong" },
      ccpaCpra: { requiresContractPass: true, minimumTier: "strong" },
      ftc: { requiresContractPass: true, minimumTier: "strong" }
    },
    notes: "Requires structured sensitive collection evidence plus runtime tracking context, not a legal conclusion."
  }
] as const satisfies readonly FindingEvidenceContract[];

const CONTRACT_BY_UNIFIED_ID = new Map<string, FindingEvidenceContract>();
const CONTRACT_BY_FINDING_ID = new Map<string, FindingEvidenceContract>();
for (const contract of FINDING_EVIDENCE_CONTRACTS) {
  CONTRACT_BY_FINDING_ID.set(contract.findingId, contract);
  for (const unifiedFindingId of contract.unifiedFindingIds) {
    if (!CONTRACT_BY_UNIFIED_ID.has(unifiedFindingId)) {
      CONTRACT_BY_UNIFIED_ID.set(unifiedFindingId, contract);
    }
  }
}

export function getFindingEvidenceContractForUnifiedFinding(unifiedFindingId: string | null | undefined) {
  return unifiedFindingId ? CONTRACT_BY_UNIFIED_ID.get(unifiedFindingId) ?? null : null;
}

export function getFindingEvidenceContractForFindingOrUnifiedId(findingId: string | null | undefined) {
  return findingId ? CONTRACT_BY_FINDING_ID.get(findingId) ?? CONTRACT_BY_UNIFIED_ID.get(findingId) ?? null : null;
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
    const value = record?.[key];
    const candidate = Array.isArray(value) ? value[0] : value;
    if (typeof candidate === "string") {
      if (/^true$/i.test(candidate.trim())) {
        return true;
      }
      if (/^false$/i.test(candidate.trim())) {
        return false;
      }
    }
  }
  return null;
}

function parseFirstObjectValue(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (Array.isArray(value)) {
    const objectEntry = value.find((entry) => entry && typeof entry === "object" && !Array.isArray(entry));
    if (objectEntry) {
      return objectEntry as Record<string, unknown>;
    }
  }
  const first = Array.isArray(value) ? value.find((entry) => typeof entry === "string" && entry.trim().length > 0) : value;
  if (typeof first !== "string") {
    return null;
  }
  try {
    const parsed = JSON.parse(first);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function parseObjectArrayValue(value: unknown) {
  const rawValues = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
  const objects: Record<string, unknown>[] = [];
  for (const rawValue of rawValues) {
    if (rawValue && typeof rawValue === "object" && !Array.isArray(rawValue)) {
      objects.push(rawValue as Record<string, unknown>);
      continue;
    }
    if (typeof rawValue !== "string" || rawValue.trim().length === 0) {
      continue;
    }
    try {
      const parsed = JSON.parse(rawValue);
      if (Array.isArray(parsed)) {
        objects.push(...parsed.filter((entry): entry is Record<string, unknown> => entry && typeof entry === "object" && !Array.isArray(entry)));
      } else if (parsed && typeof parsed === "object") {
        objects.push(parsed as Record<string, unknown>);
      }
    } catch {
      // Ignore compact evidence values that are plain strings rather than JSON objects.
    }
  }
  return objects;
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
  if (
    getObjectArrayValues(rawEvidence, [
      "postRejectNonEssentialRequests",
      "post_reject_non_essential_requests",
      "consent_reject_post_reject_non_essential_requests"
    ]).some((row) => {
      const category = typeof row.category === "string" ? row.category : "";
      return /^(advertising|analytics|session_replay|marketing_automation)$/i.test(category);
    })
  ) {
    return true;
  }
  if (hasPostRejectVendorCookieProvenance(rawEvidence)) {
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
  const suppressionChecks = getObjectValue(rawEvidence, ["suppressionChecks", "suppression_checks"]);
  return (
    rejectPath?.rejectInteractionSucceeded === true ||
    rejectPath?.reject_interaction_succeeded === true ||
    suppressionChecks?.reject_click_confirmed === true ||
    getBoolean(rawEvidence, ["consentRejectInteractionSucceeded", "consent_reject_interaction_succeeded"]) === true
  );
}

function getNumberValue(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function hasPostRejectVendorCookieProvenance(rawEvidence: Record<string, unknown> | null | undefined) {
  const provenance = getObjectValue(rawEvidence, [
    "rejectCookieDiffProvenance",
    "reject_cookie_diff_provenance",
    "consentRejectCookieDiffProvenance",
    "consent_reject_cookie_diff_provenance"
  ]);
  const summary = getObjectValue(provenance, ["summary"]);
  const thirdPartyAdded =
    getNumberValue(summary, ["thirdPartyAddedAfterRejectCount", "third_party_added_after_reject_count"]) ?? 0;
  const thirdPartyPersisted =
    getNumberValue(summary, ["thirdPartyPersistedAfterRejectCount", "third_party_persisted_after_reject_count"]) ?? 0;
  const changedCookieCount = getObjectArrayValues(provenance, ["changedCookies", "changed_cookies"]).filter((row) => {
    const firstPartyStatus = typeof row.firstPartyStatus === "string" ? row.firstPartyStatus : row.first_party_status;
    const change = typeof row.change === "string" ? row.change : "";
    return firstPartyStatus === "third_party" && (change === "added_after_reject" || change === "persisted_after_reject");
  }).length;
  const vendorNames = getStringArrayValues(rawEvidence, [
    "persisted_tracker_vendors",
    "post_reject_tracker_vendors",
    "runtimeVendors",
    "runtime_vendors"
  ]);
  return (
    vendorNames.some((vendor) => /adobe|ads|analytics|clarity|doubleclick|facebook|google|gtm|hubspot|linkedin|marketo|meta|munchkin|pixel|reddit|tiktok/i.test(vendor)) &&
    Math.max(thirdPartyAdded, thirdPartyPersisted, changedCookieCount) >= 3
  );
}

function hasPostRejectTimestampedRuntimeEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  return getObjectArrayValues(rawEvidence, [
    "postRejectNonEssentialRequests",
    "post_reject_non_essential_requests",
    "consent_reject_post_reject_non_essential_requests",
    "postRejectTrackingActivity",
    "post_reject_tracking_activity"
  ]).some((row) => {
    const url = typeof row.url === "string" ? row.url : typeof row.requestUrl === "string" ? row.requestUrl : row.request_url;
    const msAfterReject = row.ms_after_reject ?? row.msAfterReject;
    const tsMs = row.ts_ms ?? row.tsMs;
    return typeof tsMs === "number" && typeof msAfterReject === "number" && /^https?:\/\//i.test(String(url ?? ""));
  });
}

function hasPostRejectRuntimeEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  return (
    hasPostRejectTimestampedRuntimeEvidence(rawEvidence) ||
    hasPostRejectVendorCookieProvenance(rawEvidence) ||
    getStringArrayValues(rawEvidence, [
      "consentPostRejectTrackerEvidenceUrls",
      "consent_post_reject_tracker_evidence_urls"
    ]).filter((url) => /^https?:\/\//i.test(url)).length >= 3 ||
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
    getObjectArrayValues(rawEvidence, ["sensitivePayloadViolations", "sensitive_payload_violations"]).some((row) =>
      typeof row.requestUrl === "string" || typeof row.request_url === "string" || typeof row.vendorHost === "string"
    ) ||
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

function hasPrivacyChoiceControlSearchScope(rawEvidence: Record<string, unknown> | null | undefined) {
  const cpraEvidence = getObjectValue(rawEvidence, ["cpraCbaOptOutEvidence", "cpra_cba_opt_out_evidence"]);
  return (
    getBoolean(rawEvidence, ["privacyChoiceControlSearchPerformed", "privacy_choice_control_search_performed"]) === true ||
    getStringArrayValues(rawEvidence, ["privacyChoiceSearchUrls", "privacy_choice_search_urls", "searchedPolicyUrls"]).length > 0 ||
    cpraEvidence?.choiceControlsInspected === true ||
    cpraEvidence?.choice_controls_inspected === true ||
    cpraEvidence?.optOutControlFound === false ||
    cpraEvidence?.opt_out_control_found === false
  );
}

function hasAdvertisingSharingRuntimeEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  const cpraEvidence = getObjectValue(rawEvidence, ["cpraCbaOptOutEvidence", "cpra_cba_opt_out_evidence"]);
  const categories = getStringArrayValues(rawEvidence, [
    "runtimeVendorCategories",
    "runtime_vendor_categories",
    "crossDomainIdentifierSharingDestinationCategories"
  ]);
  const vendors = getStringArrayValues(rawEvidence, ["runtimeVendors", "runtime_vendors", "advertisingSharingVendors"]);
  const evidenceRows = getObjectArrayValues(rawEvidence, [
    "advertisingSharingRuntimeEvidence",
    "advertising_sharing_runtime_evidence",
    "crossDomainIdentifierSharingEvidence"
  ]);
  return (
    categories.some((category) => /advertising|retargeting|rtb|identity|marketing|cross_context/i.test(category)) ||
    vendors.length > 0 ||
    evidenceRows.length > 0 ||
    Array.isArray(cpraEvidence?.advertisingSharingVendors) && cpraEvidence.advertisingSharingVendors.length > 0
  );
}

function hasCrossDomainIdentifierEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  const rows = getObjectArrayValues(rawEvidence, ["crossDomainIdentifierSharingEvidence", "cross_domain_identifier_sharing_evidence"]);
  const destinations = getStringArrayValues(rawEvidence, [
    "crossDomainIdentifierSharingDestinationEtlds",
    "cross_domain_identifier_sharing_destination_etlds"
  ]);
  const valueHashCount = getObjectValue(rawEvidence, ["crossDomainIdentifierSummary", "cross_domain_identifier_summary"])?.valueHashCount;
  return (
    rows.some((row) => {
      const repeatedAcrossEtlds = Array.isArray(row.repeatedAcrossEtlds)
        ? row.repeatedAcrossEtlds
        : Array.isArray(row.repeated_across_etlds)
          ? row.repeated_across_etlds
          : [];
      const valueHash = typeof row.valueHash === "string" ? row.valueHash : typeof row.value_hash === "string" ? row.value_hash : "";
      const url = typeof row.requestUrlRedacted === "string"
        ? row.requestUrlRedacted
        : typeof row.request_url_redacted === "string"
          ? row.request_url_redacted
          : "";
      return repeatedAcrossEtlds.length >= 2 && valueHash.length >= 16 && /^https?:\/\//i.test(url);
    }) ||
    (destinations.length >= 2 && (typeof valueHashCount === "number" ? valueHashCount > 0 : rows.length > 0))
  );
}

function hasVideoContentSurfaceEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  return (
    getBoolean(rawEvidence, ["samePageVideoTrackingCorrelation", "same_page_video_tracking_correlation"]) === true ||
    getBoolean(rawEvidence, ["videoContentSurfaceObserved", "video_content_surface_observed"]) === true ||
    getStringArrayValues(rawEvidence, ["videoPageUrls", "video_page_urls"]).some((url) => /^https?:\/\//i.test(url)) ||
    getStringArrayValues(rawEvidence, ["videoTitleSnippets", "video_title_snippets"]).length > 0
  );
}

function hasVideoTrackingRuntimeEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  return (
    getStringArrayValues(rawEvidence, ["metaPixelRequestUrls", "meta_pixel_request_urls", "runtimeRequestUrls", "runtime_request_urls"]).some((url) =>
      /^https?:\/\//i.test(url) && /facebook|meta|doubleclick|google-analytics|googletagmanager|ads/i.test(url)
    ) ||
    getStringArrayValues(rawEvidence, ["runtimeVendors", "runtime_vendors"]).some((vendor) => /meta|facebook|pixel|analytics|advertising/i.test(vendor))
  );
}

function hasFingerprintingRuntimeEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  return (
    hasStrongFingerprintingEvidence(rawEvidence) ||
    getBoolean(rawEvidence, ["fingerprintingRuntimeEvidenceRetained", "fingerprinting_runtime_evidence_retained"]) === true ||
    getStringArrayValues(rawEvidence, ["fingerprintingSignals", "fingerprinting_signals", "highEntropySignals", "high_entropy_signals"]).length > 0 ||
    getObjectArrayValues(rawEvidence, ["fingerprintingRuntimeEvidence", "fingerprinting_runtime_evidence"]).length > 0 ||
    getStringArrayValues(rawEvidence, ["runtimeRequestUrls", "runtime_request_urls"]).some((url) => /^https?:\/\//i.test(url) && /fingerprint|fp|collect|beacon/i.test(url))
  );
}

function hasSensitiveInputSurfaceEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  return (
    getBoolean(rawEvidence, ["sensitiveInputSurfaceObserved", "sensitive_input_surface_observed"]) === true ||
    getStringArrayValues(rawEvidence, ["sensitiveFieldContexts", "sensitive_field_contexts", "inputSurfaceUrls", "input_surface_urls"]).length > 0 ||
    getObjectArrayValues(rawEvidence, ["sensitiveInputSurfaceEvidence", "sensitive_input_surface_evidence"]).length > 0 ||
    getObjectArrayValues(rawEvidence, ["sensitivePayloadViolations", "sensitive_payload_violations"]).some((row) => row.evidenceStrength !== "detector_only")
  );
}

function hasSensitiveDataFieldEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  return (
    getStringArrayValues(rawEvidence, ["sensitiveDataTypes", "sensitive_data_types", "sensitiveFieldLabels", "sensitive_field_labels"]).length > 0 ||
    getObjectArrayValues(rawEvidence, ["sensitiveFieldEvidence", "sensitive_field_evidence", "sensitivePayloadEvidence", "sensitive_payload_evidence"]).length > 0 ||
    getObjectArrayValues(rawEvidence, ["sensitivePayloadViolations", "sensitive_payload_violations"]).some((row) =>
      row.evidenceStrength !== "detector_only" &&
      (typeof row.detectedType === "string" ||
        typeof row.detected_type === "string" ||
        typeof row.requestUrl === "string" ||
        typeof row.request_url === "string")
    )
  );
}

function hasSensitiveThirdPartyTrackingEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  return hasRuntimeAnchor(rawEvidence);
}

function isRequirementSatisfied(type: EvidenceRequirementType, rawEvidence: Record<string, unknown> | null | undefined) {
  switch (type) {
    case "consentTimelineSequence":
      return hasPreconsentSequenceEvidence(rawEvidence);
    case "nonEssentialRequestClassification":
      return hasNonEssentialRequestClassification(rawEvidence);
    case "trackingCookieClassification":
      return hasTrackingCookieClassification(rawEvidence);
    case "postRejectTimestampedRuntimeEvidence":
      return hasPostRejectTimestampedRuntimeEvidence(rawEvidence);
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
    case "ignoredRuntimeCookieInventoryOnly":
      return hasOnlyIgnoredCookieEvidence(rawEvidence);
    case "privacyChoiceControlSearchScope":
      return hasPrivacyChoiceControlSearchScope(rawEvidence);
    case "advertisingSharingRuntimeEvidence":
      return hasAdvertisingSharingRuntimeEvidence(rawEvidence);
    case "crossDomainIdentifierEvidence":
      return hasCrossDomainIdentifierEvidence(rawEvidence);
    case "videoContentSurfaceEvidence":
      return hasVideoContentSurfaceEvidence(rawEvidence);
    case "videoTrackingRuntimeEvidence":
      return hasVideoTrackingRuntimeEvidence(rawEvidence);
    case "fingerprintingRuntimeEvidence":
      return hasFingerprintingRuntimeEvidence(rawEvidence);
    case "sensitiveInputSurfaceEvidence":
      return hasSensitiveInputSurfaceEvidence(rawEvidence);
    case "sensitiveDataFieldEvidence":
      return hasSensitiveDataFieldEvidence(rawEvidence);
    case "sensitiveThirdPartyTrackingEvidence":
      return hasSensitiveThirdPartyTrackingEvidence(rawEvidence);
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
    case "postRejectTimestampedRuntimeEvidence":
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
    case "ignoredRuntimeCookieInventoryOnly":
      return "runtime_cookie_inventory_ignored_only";
    case "privacyChoiceControlSearchScope":
      return "missing_policy_side_evidence";
    case "advertisingSharingRuntimeEvidence":
    case "crossDomainIdentifierEvidence":
    case "videoTrackingRuntimeEvidence":
    case "fingerprintingRuntimeEvidence":
    case "videoContentSurfaceEvidence":
      return "missing_specific_runtime_anchor";
    case "sensitiveInputSurfaceEvidence":
    case "sensitiveDataFieldEvidence":
      return "missing_concrete_sensitive_payload";
    case "sensitiveThirdPartyTrackingEvidence":
      return "missing_third_party_tracking_artifact";
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
  const contract = getFindingEvidenceContractForFindingOrUnifiedId(unifiedFindingId);
  if (!contract) {
    return null;
  }

  const allRequirements = [
    ...new Set([
      ...contract.requiredForStrong.map((requirement) => requirement.type),
      ...contract.requiredForGood.map((requirement) => requirement.type),
      ...contract.suppressIf.flatMap((rule) => [rule.ifMissing, rule.ifPresent].filter((type): type is EvidenceRequirementType => Boolean(type)))
    ])
  ];
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

  const suppressionRule = contract.suppressIf.find((rule) =>
    (rule.ifPresent ? satisfiedRequirements.includes(rule.ifPresent) : true) &&
    (rule.ifMissing ? !satisfiedRequirements.includes(rule.ifMissing) : true)
  );
  if (suppressionRule) {
    const suppressionRequirement = suppressionRule.ifPresent ?? suppressionRule.ifMissing;
    return {
      allowedNarrativeTier: "weak",
      externalSurfacingEligibility: "suppress",
      missingRequirements: missingStrong,
      negativeEvidenceFlags: suppressionRequirement
        ? [...new Set([...negativeEvidenceFlags, downgradeFlag(suppressionRequirement)])]
        : negativeEvidenceFlags,
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
  const allEvidenceUrls = [...(packet.evidence?.pageUrls ?? []), ...(packet.evidence?.sourceUrls ?? [])];
  const requestPurposeClassificationConfidence = parseObjectArrayValue(
    entities.requestPurposeClassificationConfidence ?? entities.request_purpose_classification_confidence
  );
  return {
    advertisingSharingRuntimeEvidence: entities.advertisingSharingRuntimeEvidence,
    botBlockChallengeEvidence: packet.concernContext?.negativeEvidenceFlags.includes("blocked_or_interstitial_evidence_observed")
      ? { blocked: true, coverageImpact: "material" }
      : undefined,
    consentActionableChoiceObserved: getBoolean(entities, ["consentActionableChoiceObserved", "consent_actionable_choice_observed"]),
    consentSurfaceObserved: getBoolean(entities, ["consentSurfaceObserved", "consent_surface_observed"]),
    consentTimeline: parseFirstObjectValue(entities.consentTimeline ?? entities.consent_timeline),
    disclosureSearchScopeRetained:
      packet.confidenceInputs.hasPolicyTextEvidence &&
      (packet.evidence?.pageUrls?.length || packet.evidence?.sourceUrls?.length || packet.evidence?.snippets?.length)
        ? true
        : undefined,
    flags: packet.evidence?.flags ?? [],
    crossDomainIdentifierSharingDestinationEtlds:
      entities.crossDomainIdentifierSharingDestinationEtlds ?? entities.cross_domain_identifier_sharing_destination_etlds,
    crossDomainIdentifierSharingEvidence:
      entities.crossDomainIdentifierSharingEvidence ?? entities.cross_domain_identifier_sharing_evidence,
    fingerprintingRuntimeEvidence: entities.fingerprintingRuntimeEvidence ?? entities.fingerprinting_runtime_evidence,
    fingerprintingSignals: entities.fingerprintingSignals ?? entities.highEntropySignals,
    inputSurfaceUrls: entities.inputSurfaceUrls ?? entities.input_surface_urls,
    metaPixelRequestUrls: entities.metaPixelRequestUrls ?? entities.meta_pixel_request_urls,
    negativeDisclosureSearchPerformed: packet.concernContext?.evidenceStrengthFlags.includes("policy_text") || undefined,
    policyAnchorRetained: packet.confidenceInputs.hasPolicyTextEvidence || undefined,
    policySourceUrl: allEvidenceUrls.find((url) => /cookie|privacy|legal|policy|notice/i.test(url)),
    consentPostRejectTrackerEvidenceUrls:
      entities.consentPostRejectTrackerEvidenceUrls ?? entities.consent_post_reject_tracker_evidence_urls,
    postRejectNonEssentialRequests:
      entities.postRejectNonEssentialRequests ?? entities.post_reject_non_essential_requests,
    postRejectNonEssentialRequestUrls: entities.postRejectNonEssentialRequestUrls ?? entities.post_reject_non_essential_request_urls,
    rejectCookieDiffProvenance: parseFirstObjectValue(entities.rejectCookieDiffProvenance ?? entities.reject_cookie_diff_provenance),
    rejectInteractionAttribution: parseFirstObjectValue(entities.rejectInteractionAttribution ?? entities.reject_interaction_attribution),
    privacyChoiceControlSearchPerformed: entities.privacyChoiceControlSearchPerformed,
    preconsentCookieCategories: entities.preconsentCookieCategories ?? entities.preconsent_cookie_categories,
    preconsentCookieNames: entities.preconsentCookieNames ?? entities.preconsent_cookie_names,
    requestPurposeClassificationConfidence,
    rtb_cookie_sync_evidence: entities.rtb_cookie_sync_evidence?.map((value) => {
      try {
        return JSON.parse(value) as unknown;
      } catch {
        return value;
      }
    }),
    runtimeRequestUrls: entities.runtimeRequestUrls ?? consentTrackingDetails?.requestUrls ?? allEvidenceUrls.filter((url) => /^https?:\/\//i.test(url)),
    runtimeVendorCategories: entities.runtimeVendorCategories ?? entities.runtime_vendor_categories,
    runtimeVendors: entities.runtimeVendors ?? consentTrackingDetails?.vendors,
    suppressionChecks: entities.suppressionChecks ?? entities.suppression_checks,
    sensitiveDataTypes: entities.sensitiveDataTypes ?? entities.sensitive_data_types,
    sensitiveFieldContexts: entities.sensitiveFieldContexts ?? entities.sensitive_field_contexts,
    sensitiveFieldEvidence: entities.sensitiveFieldEvidence ?? entities.sensitive_field_evidence,
    sensitiveInputSurfaceEvidence: entities.sensitiveInputSurfaceEvidence ?? entities.sensitive_input_surface_evidence,
    sensitiveInputSurfaceObserved: entities.sensitiveInputSurfaceObserved,
    searchedPolicyUrls: packet.evidence?.pageUrls,
    sessionReplayRuntimeArtifacts: entities.session_replay_runtime_artifacts ?? entities.sessionReplayRuntimeArtifacts,
    sessionReplayVendors: entities.sessionReplayVendors ?? entities.session_replay_vendors,
    videoContentSurfaceObserved:
      entities.videoContentSurfaceObserved ?? (packet.evidence?.pageUrls ?? []).some((url) => /video|watch|media/i.test(url)),
    videoPageUrls: entities.videoPageUrls ?? entities.video_page_urls ?? (packet.evidence?.pageUrls ?? []).filter((url) => /video|watch|media/i.test(url)),
    videoTitleSnippets: entities.videoTitleSnippets ?? entities.video_title_snippets ?? packet.evidence?.snippets,
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
