import type {
  NormalizedConcernAssertionLevel,
  NormalizedConcernExternalSurfacingEligibility,
  NormalizedConcernPromotionEligibility
} from "./normalized-concerns";
import { evaluatePolicyBehaviorContradictionEvidence } from "./contradiction-evidence-contract";
import {
  hasConcretePreconsentArtifact,
  hasConcreteReplayArtifact,
  hasConcreteRtbCookieSyncEvidence,
  hasConcreteSensitiveThirdPartyTrackingArtifact,
  hasScanLevelSensitiveSessionReplayCoPresenceArtifact,
  hasSensitiveSessionReplaySurfaceCooccurrenceArtifact,
  hasPreconsentSequenceEvidence,
  hasStrongFingerprintingEvidence,
  hasStrongPreconsentRuntimeEvidence,
  consentSurfaceGateAllowsConsentUxPromotion,
  evaluateConsentSurfaceGate
} from "./promotion-evidence-contracts";
import type { UnifiedFindingPacket } from "./unified-findings";
import { hasConcreteCookieRetentionReviewEvidence } from "./cookie-retention-review";
import { getRuntimeVendorDisclosureEvidence } from "./runtime-vendor-disclosure";

export type EvidenceRequirementType =
  | "consentTimelineSequence"
  | "nonEssentialRequestClassification"
  | "trackingCookieClassification"
  | "postRejectTimestampedRuntimeEvidence"
  | "postRejectRuntimeEvidence"
  | "successfulRejectInteraction"
  | "consentSurfaceEvaluable"
  | "consentSpecificBlockingInteraction"
  | "rejectAbsentFirstLayer"
  | "rejectPathDepthEvidence"
  | "materialChoiceAsymmetryEvidence"
  | "policyAnchor"
  | "runtimeAnchor"
  | "conflictBridge"
  | "policyBehaviorContradictionEvidence"
  | "negativeEvidenceSearchScope"
  | "sessionReplayVendorEvidence"
  | "rtbOrIdentitySyncEndpointEvidence"
  | "coverageNotMateriallyBlocked"
  | "ignoredRuntimeCookieInventoryOnly"
  | "privacyChoiceControlSearchScope"
  | "advertisingSharingRuntimeEvidence"
  | "cpraRelevantOptOutContext"
  | "crossDomainIdentifierEvidence"
  | "videoContentSurfaceEvidence"
  | "videoTrackingRuntimeEvidence"
  | "fingerprintingRuntimeEvidence"
  | "sensitiveInputSurfaceEvidence"
  | "sensitiveDataFieldEvidence"
  | "scanLevelSensitiveSessionReplayCoPresenceEvidence"
  | "sensitiveSessionReplayCooccurrenceEvidence"
  | "sensitiveThirdPartyTrackingEvidence"
  | "concreteCookieRetentionEvidence";

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
  consentSurfaceEvaluable: "A stable first-layer consent surface was observed in a pre-choice state and was visible or reachable.",
  consentSpecificBlockingInteraction: "Retained consent UI path evidence shows page access or interaction was blocked until choice.",
  rejectAbsentFirstLayer: "The same evaluated first-layer consent surface had accept/control candidates but no first-layer reject candidate.",
  rejectPathDepthEvidence: "Reject path depth and availability were inspected with an explicit outcome.",
  materialChoiceAsymmetryEvidence: "Structured UI evidence shows a material consent choice asymmetry or dark pattern.",
  policyAnchor: "A retained policy/disclosure source was fetched and can anchor the interpretation.",
  runtimeAnchor: "Concrete runtime request, cookie, vendor, or payload evidence anchors the finding.",
  conflictBridge: "Evidence explains the mismatch between runtime behavior and disclosure language.",
  policyBehaviorContradictionEvidence: "A complete policy/runtime contradiction bundle with specific anchors and bridge provenance was retained.",
  negativeEvidenceSearchScope: "The relevant policy/disclosure search scope was inspected and no adequate disclosure was found.",
  sessionReplayVendorEvidence: "Runtime evidence identifies a session replay vendor or replay artifact.",
  rtbOrIdentitySyncEndpointEvidence: "Concrete RTB, cookie-sync, or identity-sync endpoint evidence was retained.",
  coverageNotMateriallyBlocked: "Runtime coverage was not materially or severely blocked by bot defenses or interstitials.",
  ignoredRuntimeCookieInventoryOnly: "Runtime cookie inventory contains only operational cookies ignored by disclosure-gap promotion.",
  privacyChoiceControlSearchScope: "Retained search evidence shows privacy-choice or opt-out controls were inspected.",
  advertisingSharingRuntimeEvidence: "Runtime evidence identifies advertising, retargeting, RTB, or cross-context sharing vendors.",
  cpraRelevantOptOutContext: "Policy, UI, or scan-origin evidence establishes California/CPRA-relevant opt-out context.",
  crossDomainIdentifierEvidence: "Runtime evidence shows the same identifier-like value across multiple external destinations.",
  videoContentSurfaceEvidence: "A video-content page or media title was retained for the same-page observation.",
  videoTrackingRuntimeEvidence: "Runtime evidence identifies video-page tracking requests or vendors.",
  fingerprintingRuntimeEvidence: "Runtime evidence identifies high-entropy or fingerprinting-style browser/device signals.",
  sensitiveInputSurfaceEvidence: "A sensitive input or collection surface was retained.",
  sensitiveDataFieldEvidence: "Evidence identifies sensitive field types, payloads, or field labels.",
  scanLevelSensitiveSessionReplayCoPresenceEvidence: "Observed evidence includes session replay runtime and a same-page or same-flow linked sensitive input surface.",
  sensitiveSessionReplayCooccurrenceEvidence: "Observed evidence ties session replay runtime to a same-page or same-flow linked sensitive input surface.",
  sensitiveThirdPartyTrackingEvidence: "Observed evidence ties third-party tracking runtime to a sensitive collection surface.",
  concreteCookieRetentionEvidence: "Runtime cookie evidence includes name, domain, page attribution, classification, duration, and threshold basis."
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
    findingId: "long_lived_cookie_retention_review",
    unifiedFindingIds: [
      "cookie_retention_lifetime_review_signal",
      "long_lived_tracking_or_unknown_cookies_observed",
      "excessive_cookie_lifetime",
      "cookie_lifetime_non_compliant",
      "unknown_cookie_lifetime_review",
      "unknown_cookies_detected",
      "persistent_tracking_cookies_observed",
      "long_lived_tracking_cookie_observed",
      "long_lived_unknown_cookie_observed",
      "persistent_cookie_review",
      "persistent_identifier_cookie_review"
    ],
    requiredForStrong: [req("concreteCookieRetentionEvidence")],
    requiredForGood: [req("concreteCookieRetentionEvidence")],
    downgradeIf: [
      {
        ifMissing: "concreteCookieRetentionEvidence",
        to: "audit_only",
        reason: "Cookie retention review requires concrete runtime cookie name, domain, page attribution, classification, and duration evidence."
      }
    ],
    suppressIf: [],
    projectionEligibility: {
      executive: { requiresContractPass: true, minimumTier: "moderate" },
      gdprEprivacy: { requiresContractPass: true, minimumTier: "moderate" },
      ccpaCpra: { requiresContractPass: true, minimumTier: "moderate" },
      ftc: false
    },
    notes: "365 days is a CertScore review threshold, not a statutory cookie-lifetime threshold."
  },
  {
    findingId: "policy_behavior_contradiction_detected",
    unifiedFindingIds: [
      "policy_behavior_contradiction_detected",
      "policy_behavior_conflict",
      "consent_gated_tracking_claim_conflict",
      "runtime_vendor_not_disclosed",
      "third_party_domain_disclosure_gap",
      "unlisted_third_party_domains",
      "undisclosed_third_party_domains"
    ],
    requiredForStrong: [req("policyBehaviorContradictionEvidence")],
    requiredForGood: [req("policyBehaviorContradictionEvidence")],
    downgradeIf: [
      {
        ifMissing: "policyBehaviorContradictionEvidence",
        to: "audit_only",
        reason: "Policy/runtime contradictions require a specific policy anchor, concrete runtime anchor, and explicit bridge provenance."
      }
    ],
    suppressIf: [],
    projectionEligibility: {
      executive: { requiresContractPass: true, minimumTier: "strong" },
      gdprEprivacy: { requiresContractPass: true, minimumTier: "strong" },
      ccpaCpra: { requiresContractPass: true, minimumTier: "strong" },
      ftc: { requiresContractPass: true, minimumTier: "strong" }
    },
    notes: "Producer-provided complete/promotion fields are revalidated by WC01 before surfacing or executive projection."
  },
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
    requiredForGood: [
      req("successfulRejectInteraction"),
      req("postRejectTimestampedRuntimeEvidence"),
      req("nonEssentialRequestClassification")
    ],
    downgradeIf: [
      { ifMissing: "successfulRejectInteraction", to: "audit_only", reason: "Post-reject persistence requires a successful reject interaction." },
      { ifMissing: "postRejectTimestampedRuntimeEvidence", to: "audit_only", reason: "Post-reject persistence requires timestamped post-reject request rows." },
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
    requiredForStrong: [req("consentSurfaceEvaluable"), req("rejectAbsentFirstLayer"), req("rejectPathDepthEvidence"), req("coverageNotMateriallyBlocked")],
    requiredForGood: [req("consentSurfaceEvaluable"), req("rejectAbsentFirstLayer"), req("rejectPathDepthEvidence")],
    downgradeIf: [
      { ifMissing: "consentSurfaceEvaluable", to: "audit_only", reason: "Reject missing/hidden requires a stable first-layer consent surface observed in a pre-choice state." },
      { ifMissing: "rejectAbsentFirstLayer", to: "audit_only", reason: "Reject missing/hidden requires evidence that reject was absent from the evaluated first layer." },
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
    findingId: "forced_consent_interaction",
    unifiedFindingIds: ["forced_consent_wall"],
    requiredForStrong: [req("consentSpecificBlockingInteraction"), req("coverageNotMateriallyBlocked")],
    requiredForGood: [req("consentSpecificBlockingInteraction")],
    downgradeIf: [
      { ifMissing: "consentSpecificBlockingInteraction", to: "audit_only", reason: "Forced consent interaction requires retained consent-specific page blocking evidence." }
    ],
    suppressIf: [],
    projectionEligibility: {
      executive: { requiresContractPass: true, minimumTier: "strong" },
      gdprEprivacy: { requiresContractPass: true, minimumTier: "strong" },
      ccpaCpra: { requiresContractPass: true, minimumTier: "strong" },
      ftc: { requiresContractPass: true, minimumTier: "strong" }
    },
    notes: "Requires WS01-retained consent UI path evidence showing page access or interaction was blocked until choice."
  },
  {
    findingId: "dark_pattern_consent_signals_detected",
    unifiedFindingIds: ["accept_more_prominent_than_reject", "accept_only_banner", "dismiss_without_reject", "forced_consent_wall"],
    requiredForStrong: [req("consentSurfaceEvaluable"), req("materialChoiceAsymmetryEvidence"), req("coverageNotMateriallyBlocked")],
    requiredForGood: [req("consentSurfaceEvaluable"), req("materialChoiceAsymmetryEvidence")],
    downgradeIf: [
      { ifMissing: "consentSurfaceEvaluable", to: "audit_only", reason: "Consent UX promotion requires a stable first-layer consent surface observed in a pre-choice state." },
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
    unifiedFindingIds: [
      "cookie_disclosure_gap",
      "runtime_vendor_not_disclosed",
      "third_party_domain_disclosure_gap",
      "unlisted_third_party_domains",
      "undisclosed_third_party_domains"
    ],
    requiredForStrong: [req("runtimeAnchor"), req("policyAnchor"), req("negativeEvidenceSearchScope"), req("conflictBridge")],
    requiredForGood: [req("runtimeAnchor"), req("policyAnchor"), req("negativeEvidenceSearchScope"), req("conflictBridge")],
    downgradeIf: [
      { ifMissing: "policyAnchor", to: "audit_only", reason: "Without a policy/disclosure anchor this is coverage review, not a disclosure gap." },
      { ifMissing: "negativeEvidenceSearchScope", to: "audit_only", reason: "Disclosure gaps require retained negative search scope." },
      { ifMissing: "conflictBridge", to: "audit_only", reason: "Disclosure gaps require an explicit runtime-to-policy mismatch explanation." },
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
    requiredForStrong: [
      req("advertisingSharingRuntimeEvidence"),
      req("privacyChoiceControlSearchScope"),
      req("cpraRelevantOptOutContext"),
      req("coverageNotMateriallyBlocked")
    ],
    requiredForGood: [
      req("advertisingSharingRuntimeEvidence"),
      req("privacyChoiceControlSearchScope"),
      req("cpraRelevantOptOutContext")
    ],
    downgradeIf: [
      { ifMissing: "advertisingSharingRuntimeEvidence", to: "audit_only", reason: "Opt-out missing findings require retained advertising/sharing runtime evidence." },
      { ifMissing: "privacyChoiceControlSearchScope", to: "audit_only", reason: "Opt-out missing findings require retained evidence that privacy-choice controls were inspected." },
      { ifMissing: "cpraRelevantOptOutContext", to: "audit_only", reason: "CPRA CBA opt-out findings require California/CPRA-relevant opt-out context, not ad-vendor evidence alone." }
    ],
    suppressIf: [],
    projectionEligibility: {
      executive: { requiresContractPass: true, minimumTier: "strong" },
      gdprEprivacy: false,
      ccpaCpra: { requiresContractPass: true, minimumTier: "strong" },
      ftc: { requiresContractPass: true, minimumTier: "strong" }
    },
    notes: "WC01 may interpret an opt-out gap only after WS01/validation retain advertising/sharing evidence, control-search scope, and California/CPRA-relevant context."
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
    findingId: "possible_session_replay_on_sensitive_input_surface",
    unifiedFindingIds: ["possible_session_replay_on_sensitive_input_surface"],
    requiredForStrong: [req("sensitiveSessionReplayCooccurrenceEvidence"), req("coverageNotMateriallyBlocked")],
    requiredForGood: [req("sensitiveSessionReplayCooccurrenceEvidence")],
    downgradeIf: [
      { ifMissing: "sensitiveSessionReplayCooccurrenceEvidence", to: "audit_only", reason: "Possible sensitive replay findings require retained same-page or same-flow co-occurrence evidence between replay runtime and a sensitive input surface." }
    ],
    suppressIf: [],
    projectionEligibility: {
      executive: { requiresContractPass: true, minimumTier: "strong" },
      gdprEprivacy: { requiresContractPass: true, minimumTier: "strong" },
      ccpaCpra: { requiresContractPass: true, minimumTier: "strong" },
      ftc: { requiresContractPass: true, minimumTier: "strong" }
    },
    notes: "Represents possible replay risk on a sensitive input surface; WC01 owns risk framing and requires retained same-page or same-flow co-occurrence evidence."
  },
  {
    findingId: "session_replay_present_with_sensitive_surfaces_observed",
    unifiedFindingIds: ["session_replay_present_with_sensitive_surfaces_observed"],
    requiredForStrong: [
      req("scanLevelSensitiveSessionReplayCoPresenceEvidence"),
      req("sensitiveInputSurfaceEvidence"),
      req("coverageNotMateriallyBlocked")
    ],
    requiredForGood: [req("scanLevelSensitiveSessionReplayCoPresenceEvidence")],
    downgradeIf: [
      {
        ifMissing: "scanLevelSensitiveSessionReplayCoPresenceEvidence",
        to: "audit_only",
        reason: "Sensitive replay findings require retained same-page or same-flow evidence for both session replay runtime and a sensitive input surface."
      }
    ],
    suppressIf: [],
    projectionEligibility: {
      executive: { requiresContractPass: true, minimumTier: "strong" },
      gdprEprivacy: { requiresContractPass: true, minimumTier: "strong" },
      ccpaCpra: { requiresContractPass: true, minimumTier: "strong" },
      ftc: { requiresContractPass: true, minimumTier: "strong" }
    },
    notes: "Requires retained same-page or same-flow replay linkage; scan-level co-presence without linkage remains support/context only."
  },
  {
    findingId: "sensitive_data_collection_with_third_party_tracking_present",
    unifiedFindingIds: ["sensitive_data_collection_with_third_party_tracking_present"],
    requiredForStrong: [req("sensitiveInputSurfaceEvidence"), req("sensitiveDataFieldEvidence"), req("sensitiveThirdPartyTrackingEvidence"), req("coverageNotMateriallyBlocked")],
    requiredForGood: [req("sensitiveInputSurfaceEvidence"), req("sensitiveThirdPartyTrackingEvidence")],
    downgradeIf: [
      { ifMissing: "sensitiveInputSurfaceEvidence", to: "audit_only", reason: "Sensitive-data tracking findings require retained sensitive input surface evidence." },
      { ifMissing: "sensitiveThirdPartyTrackingEvidence", to: "audit_only", reason: "Sensitive-data tracking findings require observed co-occurrence between third-party tracking runtime and a sensitive collection surface." }
    ],
    suppressIf: [],
    projectionEligibility: {
      executive: { requiresContractPass: true, minimumTier: "strong" },
      gdprEprivacy: { requiresContractPass: true, minimumTier: "strong" },
      ccpaCpra: { requiresContractPass: true, minimumTier: "strong" },
      ftc: { requiresContractPass: true, minimumTier: "strong" }
    },
    notes: "Requires observed third-party tracking runtime and sensitive collection co-occurrence, not a legal conclusion."
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

function getStringValue(record: Record<string, unknown> | null | undefined, keys: string[]) {
  return getStringArrayValues(record, keys)[0] ?? null;
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

function getNestedObjectValue(record: Record<string, unknown> | null | undefined, paths: string[][]) {
  for (const path of paths) {
    let current: Record<string, unknown> | null | undefined = record;
    for (const key of path) {
      current = getObjectValue(current, [key]);
      if (!current) {
        break;
      }
    }
    if (current) {
      return current;
    }
  }
  return null;
}

function getOverlayKind(record: Record<string, unknown> | null | undefined) {
  const overlayEvidence = getObjectValue(record, ["overlayEvidence", "overlay_evidence"]);
  const consentSummary = getObjectValue(record, ["hybridConsentSummary", "hybrid_consent_summary"]);
  const uiSummary = getObjectValue(record, ["hybridUiSummary", "hybrid_ui_summary"]);
  return (
    getStringValue(record, ["overlayKind", "overlay_kind", "overlayType", "overlay_type", "blockerType", "blocker_type"]) ??
    getStringValue(overlayEvidence, ["overlayKind", "overlay_kind", "overlayType", "overlay_type", "blockerType", "blocker_type"]) ??
    getStringValue(consentSummary, ["overlayKind", "overlay_kind", "overlayType", "overlay_type"]) ??
    getStringValue(uiSummary, ["overlayKind", "overlay_kind", "overlayType", "overlay_type"])
  );
}

function hasIndependentConsentSurfaceText(record: Record<string, unknown> | null | undefined) {
  const consentSummary = getObjectValue(record, ["hybridConsentSummary", "hybrid_consent_summary"]);
  const uiSummary = getObjectValue(record, ["hybridUiSummary", "hybrid_ui_summary"]);
  const text = [
    ...getStringArrayValues(record, [
      "overlayActionLabels",
      "overlay_action_labels",
      "consentActionLabels",
      "consent_action_labels",
      "buttonLabels",
      "button_labels",
      "snippets",
      "snippet",
      "description",
      "observedBehavior",
      "observed_behavior"
    ]),
    ...getStringArrayValues(consentSummary, [
      "acceptActionLabels",
      "accept_action_labels",
      "rejectActionLabels",
      "reject_action_labels",
      "manageActionLabels",
      "manage_action_labels",
      "closeActionLabels",
      "close_action_labels",
      "bannerTextSnippet",
      "banner_text_snippet",
      "textSnippet",
      "text_snippet"
    ]),
    ...getStringArrayValues(uiSummary, ["buttonLabels", "button_labels", "actionLabels", "action_labels", "textSnippet", "text_snippet", "overlayText", "overlay_text"])
  ];
  return text.some((value) =>
    /accept all|reject all|decline|manage (?:options|preferences|choices)|cookie|cookies|consent|privacy|tracking|preferences?/i.test(value)
  );
}

function hasNonConsentOverlayWithoutIndependentConsentEvidence(record: Record<string, unknown> | null | undefined) {
  const overlayKind = getOverlayKind(record);
  return Boolean(
    overlayKind &&
      /bot|challenge|captcha|login|auth|paywall|subscribe|subscription|newsletter|age|regional|region|geo|app_install|install/i.test(overlayKind) &&
      !hasIndependentConsentSurfaceText(record)
  );
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
  return /analytics|advertising|marketing|retargeting|session_replay|personalization/i.test(value);
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
  if (hasPreconsentSequenceEvidence(rawEvidence) && hasTrackingCookieClassification(rawEvidence)) {
    return true;
  }
  if (
    getObjectArrayValues(rawEvidence, [
      "postRejectNonEssentialRequests",
      "post_reject_non_essential_requests",
      "consent_reject_post_reject_non_essential_requests"
    ]).some((row) => {
      const category = typeof row.category === "string" ? row.category : "";
      return /^(advertising|analytics|session_replay|marketing_automation|tag_manager)$/i.test(category);
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
  const rejectPath =
    getObjectValue(rawEvidence, ["rejectPathDepthAndAvailability", "reject_path_depth_and_availability"]) ??
    getObjectValue(rawEvidence, ["consentUiPathEvidence", "consent_ui_path_evidence"]) ??
    getNestedObjectValue(rawEvidence, [
      ["hybridRuntimeEvidence", "consentUiPathEvidence"],
      ["hybrid_runtime_evidence", "consentUiPathEvidence"],
      ["hybrid_runtime_evidence", "consent_ui_path_evidence"]
    ]);
  const suppressionChecks = getObjectValue(rawEvidence, ["suppressionChecks", "suppression_checks"]);
  return hasCredibleRejectInteractionAttribution(rawEvidence) && (
    rejectPath?.rejectInteractionSucceeded === true ||
    rejectPath?.reject_interaction_succeeded === true ||
    suppressionChecks?.reject_click_confirmed === true ||
    getBoolean(rawEvidence, ["consentRejectInteractionSucceeded", "consent_reject_interaction_succeeded"]) === true
  );
}

function getFirstStringValue(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function isCredibleRejectControlLabel(label: string | null) {
  if (!label) {
    return false;
  }
  if (/stream|subscribe|sign\s*in|log\s*in|continue|accept|agree|allow/i.test(label)) {
    return false;
  }
  if (label.length > 50 && !/cookie|privacy|consent|preference|choice|optional|necessary|essential/i.test(label)) {
    return false;
  }
  return /reject|decline\s+(?:all|optional|non[-\s]?essential|cookies)|deny|refuse|opt\s*out|save\s+settings|confirm\s+choices|manage\s+preferences|necessary only|essential only|only necessary/i.test(label);
}

function hasCredibleRejectInteractionAttribution(rawEvidence: Record<string, unknown> | null | undefined) {
  const attribution = getObjectValue(rawEvidence, ["rejectInteractionAttribution", "reject_interaction_attribution"]);
  const consentInteraction = getObjectValue(rawEvidence, ["consentInteraction", "consent_interaction", "consentRejectInteractionTrace", "consent_reject_interaction_trace"]);
  const source = attribution ?? consentInteraction;
  if (!source) {
    return false;
  }
  if (source.finalUrlHostChanged === true || source.final_url_host_changed === true) {
    return false;
  }
  const label = getFirstStringValue(source, [
    "clickedLabel",
    "clicked_label",
    "clickedText",
    "clicked_text",
    "controlText",
    "control_text",
    "text",
    "visibleText"
  ]);
  if (label) {
    return isCredibleRejectControlLabel(label);
  }
  const controlRole = getFirstStringValue(source, ["controlRole", "control_role"]);
  const controlSource = getFirstStringValue(source, ["controlSource", "control_source"]);
  const consentSurfaceDetected =
    source.consentSurfaceDetected === true ||
    source.consent_surface_detected === true ||
    /cmp_|consent|cookie|privacy/i.test(controlSource ?? "");
  if (consentSurfaceDetected && /^(reject|toggle|save)$/i.test(controlRole ?? "")) {
    return true;
  }
  const actionType = getFirstStringValue(source, ["actionType", "action_type", "consentActionType"]);
  return /^(reject_all|opt_out|essential_only|save_preferences)$/i.test(actionType ?? "");
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
  const gate = evaluateConsentSurfaceGate(rawEvidence);
  if (!consentSurfaceGateAllowsConsentUxPromotion(gate)) {
    return false;
  }
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
          : typeof rejectPath.layerInspected === "string"
            ? rejectPath.layerInspected
            : typeof rejectPath.layer_inspected === "string"
              ? rejectPath.layer_inspected
              : null;
  const inspected =
    rejectPath.bannerLayerInspected === true ||
    rejectPath.banner_layer_inspected === true ||
    rejectPath.rejectPathTested === true ||
    rejectPath.reject_path_tested === true ||
    rejectPath.layerInspected === "first_layer" ||
    rejectPath.layerInspected === "deeper_layer" ||
    rejectPath.layer_inspected === "first_layer" ||
    rejectPath.layer_inspected === "deeper_layer" ||
    typeof rejectPath.rejectClickDepth === "number" ||
    typeof rejectPath.reject_click_depth === "number" ||
    typeof rejectPath.observedRejectPathDepth === "number" ||
    typeof rejectPath.observed_reject_path_depth === "number" ||
    typeof rejectPath.acceptClickDepth === "number" ||
    typeof rejectPath.accept_click_depth === "number";
  const hasChoiceAsymmetry =
    rejectPath.choiceAsymmetry === "material" ||
    rejectPath.choice_asymmetry === "material" ||
    rejectPath.choiceAsymmetry === "minor" ||
    rejectPath.choice_asymmetry === "minor";
  const hasAvailabilityFact =
    typeof rejectPath.rejectAvailableOnFirstLayer === "boolean" ||
    typeof rejectPath.reject_available_on_first_layer === "boolean";
  return (
    (inspected && Boolean(status && ["available", "hidden", "not_found", "unavailable", "failed", "untested", "first_layer", "deeper_layer"].includes(status))) ||
    (inspected && hasChoiceAsymmetry && hasAvailabilityFact)
  );
}

function hasMaterialChoiceAsymmetryEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  if (hasNonConsentOverlayWithoutIndependentConsentEvidence(rawEvidence)) {
    return false;
  }
  if (!consentSurfaceGateAllowsConsentUxPromotion(evaluateConsentSurfaceGate(rawEvidence))) {
    return false;
  }

  const flags = getStringArrayValues(rawEvidence, ["flags", "evidenceFlags", "uiEvidenceFlags", "runtimeArtifacts"]);
  const artifactRefs = getStringArrayValues(rawEvidence, [
    "consentUiArtifactRefs",
    "consent_ui_artifact_refs"
  ]);
  const consentSummary = getObjectValue(rawEvidence, ["hybridConsentSummary", "hybrid_consent_summary"]);
  const consentVisual = getObjectValue(rawEvidence, ["hybridConsentVisual", "hybrid_consent_visual"]);
  const uiSummary = getObjectValue(rawEvidence, ["hybridUiSummary", "hybrid_ui_summary"]);
  const acceptLabels = getStringArrayValues(consentSummary, ["acceptActionLabels", "accept_action_labels"]);
  const rejectLabels = getStringArrayValues(consentSummary, ["rejectActionLabels", "reject_action_labels"]);
  const manageLabels = getStringArrayValues(consentSummary, ["manageActionLabels", "manage_action_labels"]);
  const closeLabels = getStringArrayValues(consentSummary, ["closeActionLabels", "close_action_labels"]);
  const bannerText =
    typeof consentSummary?.bannerTextSnippet === "string"
      ? consentSummary.bannerTextSnippet
      : typeof consentSummary?.banner_text_snippet === "string"
        ? consentSummary.banner_text_snippet
        : "";
  const retainedConsentUiText =
    acceptLabels.length > 0 ||
    rejectLabels.length > 0 ||
    manageLabels.length > 0 ||
    closeLabels.length > 0 ||
    bannerText.trim().length > 0;
  const surfaceObserved =
    getBoolean(rawEvidence, ["consentSurfaceObserved", "consent_surface_observed"]) === true ||
    consentSummary?.bannerPresent === true ||
    consentSummary?.banner_present === true;
  const structuredUiFact =
    rawEvidence?.reject_button_missing === true ||
    rawEvidence?.forced_consent_wall === true ||
    rawEvidence?.accept_only_banner === true ||
    rawEvidence?.dismiss_without_reject === true ||
    consentVisual?.ctaImbalanceDetected === true ||
    consentVisual?.cta_imbalance_detected === true ||
    consentVisual?.acceptOnly === true ||
    consentVisual?.accept_only === true ||
    consentVisual?.rejectHidden === true ||
    consentVisual?.reject_hidden === true ||
    consentVisual?.contrastAsymmetryDetected === true ||
    consentVisual?.contrast_asymmetry_detected === true ||
    consentSummary?.rejectDepthClass === "absent" ||
    consentSummary?.reject_depth_class === "absent" ||
    consentSummary?.pageInteractionBlocked === true ||
    consentSummary?.page_interaction_blocked === true ||
    uiSummary?.forcedActionRequired === true ||
    uiSummary?.forced_action_required === true;
  return (
    getBoolean(rawEvidence, ["materialChoiceAsymmetryObserved", "material_choice_asymmetry_observed"]) === true ||
    flags.some((flag) => /dark_pattern|accept_more_prominent|reject_button_missing|forced_consent_wall|accept_only_banner/.test(flag)) ||
    (surfaceObserved && structuredUiFact && (artifactRefs.length > 0 || retainedConsentUiText))
  );
}

function getConsentUiPathEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  return (
    getObjectValue(rawEvidence, ["consentUiPathEvidence", "consent_ui_path_evidence"]) ??
    getNestedObjectValue(rawEvidence, [
      ["hybridRuntimeEvidence", "consentUiPathEvidence"],
      ["hybrid_runtime_evidence", "consentUiPathEvidence"],
      ["hybrid_runtime_evidence", "consent_ui_path_evidence"]
    ]) ??
    getObjectValue(rawEvidence, ["rejectPathDepthAndAvailability", "reject_path_depth_and_availability"]) ??
    parseFirstObjectValue(rawEvidence?.consentUiPathEvidence ?? rawEvidence?.consent_ui_path_evidence) ??
    parseFirstObjectValue(rawEvidence?.rejectPathDepthAndAvailability ?? rawEvidence?.reject_path_depth_and_availability)
  );
}

function hasConsentSpecificBlockingInteraction(rawEvidence: Record<string, unknown> | null | undefined) {
  if (hasNonConsentOverlayWithoutIndependentConsentEvidence(rawEvidence)) {
    return false;
  }

  const path = getConsentUiPathEvidence(rawEvidence);
  const classifier = getStringValue(path, ["unrelatedOverlayClassifier", "unrelated_overlay_classifier"]);
  const source = getStringValue(path, ["blockingEvidenceSource", "blocking_evidence_source"]);
  const consentClassified =
    classifier === "consent_surface" ||
    Boolean(source && /consent/i.test(source)) ||
    rawEvidence?.forced_consent_wall === true;

  if (!consentClassified) {
    return false;
  }

  return (
    getBoolean(path, ["pageAccessBlockedUntilChoice", "page_access_blocked_until_choice"]) === true ||
    getBoolean(path, ["pageInteractionBlocked", "page_interaction_blocked"]) === true ||
    getBoolean(path, ["blockedPageInteraction", "blocked_page_interaction"]) === true ||
    getBoolean(path, ["forcedActionRequired", "forced_action_required"]) === true ||
    getBoolean(path, ["contentObstructed", "content_obstructed"]) === true
  );
}

function hasPolicyAnchor(rawEvidence: Record<string, unknown> | null | undefined) {
  if (getRuntimeVendorDisclosureEvidence(rawEvidence).some((row) => row.policySurfacesSearched.some((surface) => surface.reached))) {
    return true;
  }
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
  if (
    getRuntimeVendorDisclosureEvidence(rawEvidence).some(
      (row) => row.observedRuntimeDomains.length > 0 || row.observedRuntimeVendors.length > 0
    )
  ) {
    return true;
  }
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
  if (getRuntimeVendorDisclosureEvidence(rawEvidence).some((row) => row.mismatchRationale.trim().length > 0)) {
    return true;
  }
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
  if (getRuntimeVendorDisclosureEvidence(rawEvidence).some((row) => row.policySurfacesSearched.some((surface) => surface.reached))) {
    return true;
  }
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
  const optOutUiResult = String(
    cpraEvidence?.optOutUiResult ?? cpraEvidence?.opt_out_ui_result ?? rawEvidence?.optOutUiResult ?? rawEvidence?.opt_out_ui_result ?? ""
  );
  const choiceControlSearchScope = String(
    cpraEvidence?.choiceControlSearchScope ??
      cpraEvidence?.choice_control_search_scope ??
      rawEvidence?.choiceControlSearchScope ??
      rawEvidence?.choice_control_search_scope ??
      ""
  );
  return (
    getBoolean(rawEvidence, ["privacyChoiceControlSearchPerformed", "privacy_choice_control_search_performed"]) === true ||
    getStringArrayValues(rawEvidence, ["privacyChoiceSearchUrls", "privacy_choice_search_urls", "searchedPolicyUrls"]).length > 0 ||
    cpraEvidence?.choiceControlsInspected === true ||
    cpraEvidence?.choice_controls_inspected === true ||
    cpraEvidence?.optOutControlFound === false ||
    cpraEvidence?.opt_out_control_found === false ||
    rawEvidence?.choiceControlsInspected === true ||
    rawEvidence?.choice_controls_inspected === true ||
    rawEvidence?.optOutControlFound === false ||
    rawEvidence?.opt_out_control_found === false ||
    choiceControlSearchScope === "homepage_footer_privacy_surfaces" ||
    optOutUiResult === "generic_do_not_sell" ||
    optOutUiResult === "partial_no_icon" ||
    optOutUiResult === "full_cpra_compliant"
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
  const cbaVendorTier1 = getStringArrayValues(rawEvidence, ["cbaVendorTier1", "cba_vendor_tier1"]);
  const cbaVendorTier2 = getStringArrayValues(rawEvidence, ["cbaVendorTier2", "cba_vendor_tier2"]);
  const cpraAdvertisingSharingVendors = [
    ...getStringArrayValues(cpraEvidence, ["advertisingSharingVendors", "advertising_sharing_vendors"]),
    ...getStringArrayValues(cpraEvidence, ["cbaVendorTier1", "cba_vendor_tier1"]),
    ...getStringArrayValues(cpraEvidence, ["cbaVendorTier2", "cba_vendor_tier2"])
  ];
  const evidenceRows = getObjectArrayValues(rawEvidence, [
    "advertisingSharingRuntimeEvidence",
    "advertising_sharing_runtime_evidence",
    "crossDomainIdentifierSharingEvidence"
  ]);
  return (
    categories.some((category) => /advertising|retargeting|rtb|identity|marketing|cross_context/i.test(category)) ||
    vendors.length > 0 ||
    cbaVendorTier1.length > 0 ||
    cbaVendorTier2.length > 0 ||
    evidenceRows.length > 0 ||
    cpraAdvertisingSharingVendors.length > 0
  );
}

function hasCpraRelevantOptOutContext(rawEvidence: Record<string, unknown> | null | undefined) {
  const cpraEvidence = getObjectValue(rawEvidence, ["cpraCbaOptOutEvidence", "cpra_cba_opt_out_evidence"]);
  const policyCbaLanguage = String(
    cpraEvidence?.policyCbaLanguage ?? cpraEvidence?.policy_cba_language ?? rawEvidence?.policyCbaLanguage ?? rawEvidence?.policy_cba_language ?? ""
  );
  const optOutUiResult = String(
    cpraEvidence?.optOutUiResult ?? cpraEvidence?.opt_out_ui_result ?? rawEvidence?.optOutUiResult ?? rawEvidence?.opt_out_ui_result ?? ""
  );
  const scanOriginGeo = String(
    cpraEvidence?.scanOriginGeo ?? cpraEvidence?.scan_origin_geo ?? rawEvidence?.scanOriginGeo ?? rawEvidence?.scan_origin_geo ?? ""
  );

  return (
    (policyCbaLanguage.length > 0 && policyCbaLanguage !== "absent") ||
    (optOutUiResult.length > 0 && optOutUiResult !== "absent") ||
    /\b(?:ca|california)\b/i.test(scanOriginGeo)
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
      const key = typeof row.key === "string" ? row.key.trim() : "";
      const destinationClassification = typeof row.destinationClassification === "string"
        ? row.destinationClassification
        : typeof row.destination_classification === "string"
          ? row.destination_classification
          : "";
      const destinationDomain = typeof row.destinationDomain === "string"
        ? row.destinationDomain
        : typeof row.destination_domain === "string"
          ? row.destination_domain
          : "";
      const destinationEtld = typeof row.destinationEtldPlusOne === "string"
        ? row.destinationEtldPlusOne
        : typeof row.destination_etld_plus_one === "string"
          ? row.destination_etld_plus_one
          : "";
      const identifierClass = typeof row.identifierClass === "string"
        ? row.identifierClass
        : typeof row.identifier_class === "string"
          ? row.identifier_class
          : "";
      const knownSyncDestination = /(?:taboola|adnxs|demdex|id5-sync|id5|liveramp|pubmatic|rlcdn|rubiconproject|openx|adsrvr|3lift|crwdcntrl)(?:\.|$)/i.test(
        `${destinationDomain} ${destinationEtld} ${url}`
      );
      const namedIdentitySyncKey = /^(?:partner_?id|uid2|euid|id5id|tdid)$/i.test(key);
      const isStrongSingleDestinationIdentitySync =
        (/^(?:rtb|identity_graph)$/i.test(destinationClassification) ||
          /(?:identity|id5|demdex|rlcdn|liveramp|uidapi|crwdcntrl|adnxs|pubmatic|openx|rubicon|bidswitch|casalemedia|adsrvr)/i.test(
            `${destinationDomain} ${destinationEtld}`
          )) &&
        /^(?:durable_id|cookie_id)$/i.test(identifierClass) &&
        /^(?:uid|uuid|user_?id|visitor_?id|external_?id|identity|guid|sync_?id|match_?id|partner_?(?:uid|id)|buyeruid|bkuid|d_uuid|uid2|euid|id5id|tdid)$/i.test(key) &&
        ((knownSyncDestination && namedIdentitySyncKey) ||
          /(?:^|\/|[-_:])(?:sync|idsync|match|user[-_]?match|cookie[-_]?sync|setuid|getuid\w*)(?:\/|[-_:]|[?#&]|$)|\/tap\.php$|\/track\/cmf(?:\/|$)|\/ibs:dpid/i.test(
            url
          ));
      return (repeatedAcrossEtlds.length >= 2 || isStrongSingleDestinationIdentitySync) && valueHash.length >= 16 && /^https?:\/\//i.test(url);
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
    getBoolean(rawEvidence, [
      "fingerprintRuntimeEvidenceRetained",
      "fingerprint_runtime_evidence_retained",
      "fingerprintingRuntimeEvidenceRetained",
      "fingerprinting_runtime_evidence_retained"
    ]) === true ||
    getStringArrayValues(rawEvidence, [
      "fingerprintAttributeCategories",
      "fingerprint_attribute_categories",
      "fingerprintingSignals",
      "fingerprinting_signals",
      "highEntropySignals",
      "high_entropy_signals"
    ]).length > 0 ||
    getObjectArrayValues(rawEvidence, [
      "fingerprintRuntimeEvidence",
      "fingerprint_runtime_evidence",
      "fingerprintingRuntimeEvidence",
      "fingerprinting_runtime_evidence"
    ]).length > 0 ||
    getStringArrayValues(rawEvidence, ["runtimeRequestUrls", "runtime_request_urls"]).some((url) => /^https?:\/\//i.test(url) && /fingerprint|fp|collect|beacon/i.test(url))
  );
}

function hasSensitiveInputSurfaceEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  return (
    getBoolean(rawEvidence, ["sensitiveInputSurfaceObserved", "sensitive_input_surface_observed"]) === true ||
    getStringArrayValues(rawEvidence, ["sensitiveFieldContexts", "sensitive_field_contexts", "inputSurfaceUrls", "input_surface_urls"]).length > 0 ||
    getObjectArrayValues(rawEvidence, [
      "sensitiveFieldEvidence",
      "sensitive_field_evidence",
      "sensitiveInputSurfaceEvidence",
      "sensitive_input_surface_evidence"
    ]).length > 0 ||
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
  return hasConcreteSensitiveThirdPartyTrackingArtifact(rawEvidence);
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
    case "consentSpecificBlockingInteraction":
      return hasConsentSpecificBlockingInteraction(rawEvidence);
    case "consentSurfaceEvaluable": {
      const gate = evaluateConsentSurfaceGate(rawEvidence);
      return consentSurfaceGateAllowsConsentUxPromotion(gate);
    }
    case "rejectAbsentFirstLayer":
      return consentSurfaceGateAllowsConsentUxPromotion(evaluateConsentSurfaceGate(rawEvidence));
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
    case "policyBehaviorContradictionEvidence":
      return (
        evaluatePolicyBehaviorContradictionEvidence(rawEvidence).eligible ||
        getRuntimeVendorDisclosureEvidence(rawEvidence).some(
          (row) =>
            (row.parentFindingId === "policy_behavior_conflict" ||
              row.parentFindingId === "policy_behavior_contradiction_detected") &&
            row.coverageStatus !== "blocked" &&
            (row.observedRuntimeDomains.length > 0 || row.observedRuntimeVendors.length > 0) &&
            (row.unmatchedRuntimeVendors.length > 0 || row.unmatchedRuntimeDomains.length > 0) &&
            row.policySurfacesSearched.some((surface) => surface.reached) &&
            row.mismatchRationale.trim().length > 0
        )
      );
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
    case "cpraRelevantOptOutContext":
      return hasCpraRelevantOptOutContext(rawEvidence);
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
    case "scanLevelSensitiveSessionReplayCoPresenceEvidence":
      return hasScanLevelSensitiveSessionReplayCoPresenceArtifact(rawEvidence);
    case "sensitiveSessionReplayCooccurrenceEvidence":
      return hasSensitiveSessionReplaySurfaceCooccurrenceArtifact(rawEvidence);
    case "sensitiveThirdPartyTrackingEvidence":
      return hasSensitiveThirdPartyTrackingEvidence(rawEvidence);
    case "concreteCookieRetentionEvidence":
      return hasConcreteCookieRetentionReviewEvidence(rawEvidence);
  }
}

function downgradeFlag(type: EvidenceRequirementType) {
  switch (type) {
    case "consentTimelineSequence":
      return "missing_preconsent_sequence_evidence";
    case "nonEssentialRequestClassification":
      return "missing_concrete_preconsent_artifact";
    case "trackingCookieClassification":
    case "concreteCookieRetentionEvidence":
      return "missing_cookie_duration";
    case "sessionReplayVendorEvidence":
      return "missing_third_party_tracking_artifact";
    case "postRejectRuntimeEvidence":
    case "postRejectTimestampedRuntimeEvidence":
    case "successfulRejectInteraction":
      return "missing_post_reject_timing_evidence";
    case "consentSpecificBlockingInteraction":
      return "missing_specific_runtime_anchor";
    case "policyAnchor":
    case "negativeEvidenceSearchScope":
      return "missing_policy_side_evidence";
    case "runtimeAnchor":
    case "rtbOrIdentitySyncEndpointEvidence":
      return "missing_specific_runtime_anchor";
    case "policyBehaviorContradictionEvidence":
      return "missing_contradiction_bridge";
    case "coverageNotMateriallyBlocked":
      return "blocked_or_interstitial_evidence_observed";
    case "ignoredRuntimeCookieInventoryOnly":
      return "runtime_cookie_inventory_ignored_only";
    case "privacyChoiceControlSearchScope":
      return "missing_privacy_choice_control_search_scope";
    case "advertisingSharingRuntimeEvidence":
      return "missing_runtime_request_url_evidence";
    case "cpraRelevantOptOutContext":
      return "missing_cpra_relevant_opt_out_context";
    case "crossDomainIdentifierEvidence":
    case "videoTrackingRuntimeEvidence":
    case "fingerprintingRuntimeEvidence":
    case "videoContentSurfaceEvidence":
      return "missing_specific_runtime_anchor";
    case "sensitiveInputSurfaceEvidence":
    case "sensitiveDataFieldEvidence":
    case "scanLevelSensitiveSessionReplayCoPresenceEvidence":
    case "sensitiveSessionReplayCooccurrenceEvidence":
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
	  const policyBehaviorContradictionDecision = allRequirements.includes("policyBehaviorContradictionEvidence")
	    ? evaluatePolicyBehaviorContradictionEvidence(rawEvidence)
	    : null;

	  const negativeEvidenceFlags = orderNegativeEvidenceFlags([
	    ...new Set([
	      ...(policyBehaviorContradictionDecision && !policyBehaviorContradictionDecision.eligible
	        ? policyBehaviorContradictionDecision.negativeEvidenceFlags
	        : []),
	      ...(missingStrong.length > 0 ? missingStrong : missingGood).map(downgradeFlag)
	    ])
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
  const contradictionDetails = packet.details?.family === "contradiction" ? packet.details : null;
  const allEvidenceUrls = [...(packet.evidence?.pageUrls ?? []), ...(packet.evidence?.sourceUrls ?? [])];
  const contradictionRuntimeRequests =
    entities.runtimeRequestUrls ??
    entities.runtime_request_urls ??
    contradictionDetails?.runtimeEvidenceArtifacts ??
    allEvidenceUrls.filter((url) => /^https?:\/\//i.test(url));
  const contradictionRuntimeVendors =
    entities.runtimeVendors ??
    entities.runtime_vendors ??
    contradictionDetails?.vendors ??
    [];
  const sourceEvidenceIds = [
    ...(Array.isArray(entities.sourceEvidenceIds) ? entities.sourceEvidenceIds : []),
    ...(Array.isArray(entities.source_evidence_ids) ? entities.source_evidence_ids : []),
    ...(contradictionDetails?.sourceEvidenceIds ?? [])
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  const requestPurposeClassificationConfidence = parseObjectArrayValue(
    entities.requestPurposeClassificationConfidence ?? entities.request_purpose_classification_confidence
  );
  return {
    accept_more_prominent_than_reject:
      packet.unifiedFindingId === "accept_more_prominent_than_reject" ||
      packet.evidence?.flags?.some((flag) => /accept_button_prominence|accept_more_prominent/i.test(flag)) ||
      undefined,
    advertisingSharingRuntimeEvidence: entities.advertisingSharingRuntimeEvidence,
    botBlockChallengeEvidence: packet.concernContext?.negativeEvidenceFlags.includes("blocked_or_interstitial_evidence_observed")
      ? { blocked: true, coverageImpact: "material" }
      : undefined,
    consentActionableChoiceObserved: getBoolean(entities, ["consentActionableChoiceObserved", "consent_actionable_choice_observed"]),
    consentRejectInteractionSucceeded:
      packet.unifiedFindingId === "reject_did_not_reduce_tracking" &&
      (
        packet.evidence?.flags?.includes("reject_evidence_confirmed") ||
        packet.evidence?.flags?.includes("reject_evidence_review")
      )
        ? true
        : getBoolean(entities, ["consentRejectInteractionSucceeded", "consent_reject_interaction_succeeded"]) ?? undefined,
    consentSurfaceObserved:
      (entities.consentSurfaceObserved?.[0] ?? entities.consent_surface_observed?.[0]) === "true"
        ? true
        : (entities.consentSurfaceObserved?.[0] ?? entities.consent_surface_observed?.[0]) === "false"
          ? false
          : getBoolean(entities, ["consentSurfaceObserved", "consent_surface_observed"]) ?? undefined,
	    consentTimeline: parseFirstObjectValue(entities.consentTimeline ?? entities.consent_timeline),
	    contradictionEvidence: contradictionDetails
	      ? {
	          claim: contradictionDetails.claim ?? null,
	          contradictionBasis: contradictionDetails.contradictionBasis ?? null,
	          conflictBridge: {
	            conflictType: contradictionDetails.conflictType ?? null,
	            reasoning: contradictionDetails.conflictBridgeReasoning ?? null,
	            supportsPromotion: contradictionDetails.conflictSupportsPromotion === true,
	            provenance: {
	              bridgeRuleId: contradictionDetails.bridgeRuleId ?? getStringValue(entities, ["bridgeRuleId", "bridge_rule_id"]),
	              generatedBy: contradictionDetails.bridgeGeneratedBy ?? getStringValue(entities, ["bridgeGeneratedBy", "generated_by"]),
	              mappingType: contradictionDetails.bridgeMappingType ?? getStringValue(entities, ["bridgeMappingType", "mapping_type"]),
	              mappingVersion: contradictionDetails.bridgeMappingVersion ?? getStringValue(entities, ["bridgeMappingVersion", "mapping_version"]),
	              policyAnchorRef: contradictionDetails.policyAnchorRef ?? getStringValue(entities, ["policyAnchorRef", "policy_anchor_ref"]),
	              runtimeAnchorRef: contradictionDetails.runtimeAnchorRef ?? getStringValue(entities, ["runtimeAnchorRef", "runtime_anchor_ref"]),
	              sourceEvidenceIds
	            }
	          },
	          evidenceSufficiency: {
	            conflictBridgePresent: contradictionDetails.conflictType != null && contradictionDetails.conflictSupportsPromotion === true,
	            policyAnchorPresent: Boolean(contradictionDetails.policyClaimType && contradictionDetails.policySourceUrl && contradictionDetails.policySnippet),
	            promotionEligible: contradictionDetails.contradictionPromotionEligible === true,
	            reviewStatus: contradictionDetails.contradictionReviewStatus ?? null,
	            runtimeAnchorPresent: Boolean(contradictionDetails.runtimeObservationType && contradictionRuntimeRequests.length > 0)
	          },
	          policyAnchor: {
	            claimType: contradictionDetails.policyClaimType ?? null,
	            confidence: getNumberValue(entities, ["policyConfidence", "policy_confidence"]) ?? 0.72,
	            extractionStatus: getStringValue(entities, ["policyExtractionStatus", "policy_extraction_status"]) ?? "fetched",
	            normalizedClaim: contradictionDetails.claim ?? contradictionDetails.policySnippet ?? null,
	            snippet: contradictionDetails.policySnippet ?? null,
	            sourceUrl: contradictionDetails.policySourceUrl ?? null
	          },
	          policySnippet: contradictionDetails.policySnippet ?? null,
	          policySourceUrl: contradictionDetails.policySourceUrl ?? null,
	          runtimeAnchor: {
	            confidence: getNumberValue(entities, ["runtimeConfidence", "runtime_confidence"]) ?? 0.82,
	            cookies: getStringArrayValues(entities, ["runtimeCookies", "runtime_cookie_names"]),
	            observationType: contradictionDetails.runtimeObservationType ?? null,
	            phase: contradictionDetails.runtimePhase ?? "unknown",
	            requests: contradictionRuntimeRequests,
	            storageArtifacts: getStringArrayValues(entities, ["runtimeStorageArtifacts", "runtime_storage_artifacts"]),
	            vendors: contradictionRuntimeVendors
	          },
	          runtimeEvidenceArtifacts: contradictionDetails.runtimeEvidenceArtifacts ?? [],
	          runtimeSummary: contradictionDetails.observedBehavior ?? null,
	          runtimeVendors: contradictionRuntimeVendors,
	          sourceUrls: allEvidenceUrls,
	          supportingSignals: []
	        }
	      : undefined,
	    disclosureSearchScopeRetained:
      packet.confidenceInputs.hasPolicyTextEvidence &&
      (packet.evidence?.pageUrls?.length || packet.evidence?.sourceUrls?.length || packet.evidence?.snippets?.length)
        ? true
        : undefined,
    flags: packet.evidence?.flags ?? [],
    forced_consent_wall:
      packet.unifiedFindingId === "forced_consent_wall" ||
      packet.evidence?.flags?.some((flag) => /forced_consent_wall/i.test(flag)) ||
      undefined,
    crossDomainIdentifierSharingDestinationEtlds:
      entities.crossDomainIdentifierSharingDestinationEtlds ?? entities.cross_domain_identifier_sharing_destination_etlds,
    crossDomainIdentifierSharingEvidence:
      entities.crossDomainIdentifierSharingEvidence ?? entities.cross_domain_identifier_sharing_evidence,
    fingerprintArtifactRefs: entities.fingerprintArtifactRefs ?? entities.fingerprint_artifact_refs,
    fingerprintAttributeCategories:
      entities.fingerprintAttributeCategories ?? entities.fingerprint_attribute_categories ?? entities.fingerprintingSignals ?? entities.highEntropySignals,
    fingerprintTier: packet.evidence?.counts?.fingerprintTier,
    fingerprintingRuntimeEvidence: entities.fingerprintingRuntimeEvidence ?? entities.fingerprinting_runtime_evidence,
    fingerprintingSignals: entities.fingerprintingSignals ?? entities.fingerprintAttributeCategories ?? entities.highEntropySignals,
    inputSurfaceUrls: entities.inputSurfaceUrls ?? entities.input_surface_urls,
    metaPixelRequestUrls: entities.metaPixelRequestUrls ?? entities.meta_pixel_request_urls,
    disclosureMismatchExplained: packet.evidence?.flags?.includes("disclosureMismatchExplained") || packet.evidence?.flags?.includes("disclosure_mismatch_explained") || undefined,
    mismatchExplanation: entities.mismatchExplanation ?? entities.mismatch_explanation,
    mismatchRationale: entities.mismatchRationale ?? entities.mismatch_rationale,
    negativeDisclosureSearchPerformed:
      packet.evidence?.flags?.includes("negativeDisclosureSearchPerformed") ||
      packet.evidence?.flags?.includes("negative_disclosure_search_performed") ||
      packet.concernContext?.evidenceStrengthFlags.includes("policy_text") ||
      undefined,
    observedBehavior: entities.observedBehavior ?? entities.observed_behavior,
    policyAnchorRetained: packet.confidenceInputs.hasPolicyTextEvidence || undefined,
    policyExtractionStatus: entities.policyExtractionStatus ?? entities.policy_extraction_status,
    policySnippet: entities.policySnippet ?? entities.policy_snippet,
    policySourceUrl: allEvidenceUrls.find((url) => /cookie|privacy|legal|policy|notice/i.test(url)),
    consentPostRejectTrackerEvidenceUrls:
      entities.consentPostRejectTrackerEvidenceUrls ?? entities.consent_post_reject_tracker_evidence_urls,
    postRejectNonEssentialRequests: parseObjectArrayValue(
      entities.postRejectNonEssentialRequests ?? entities.post_reject_non_essential_requests
    ),
    postRejectNonEssentialRequestUrls: entities.postRejectNonEssentialRequestUrls ?? entities.post_reject_non_essential_request_urls,
    consentSurfaceDecisionStates: entities.consentSurfaceDecisionStates ?? entities.consent_surface_decision_states,
    consentSurfaceDiagnostics: parseFirstObjectValue(
      entities.consentSurfaceDiagnostics ?? entities.consent_surface_diagnostics
    ),
    rejectPathDepthAndAvailability: parseFirstObjectValue(
      entities.rejectPathDepthAndAvailability ?? entities.reject_path_depth_and_availability
    ),
    rejectCookieDiffProvenance: parseFirstObjectValue(entities.rejectCookieDiffProvenance ?? entities.reject_cookie_diff_provenance),
    rejectInteractionAttribution: parseFirstObjectValue(entities.rejectInteractionAttribution ?? entities.reject_interaction_attribution),
    suppressionChecks: parseFirstObjectValue(entities.suppressionChecks ?? entities.suppression_checks),
    privacyChoiceControlSearchPerformed: entities.privacyChoiceControlSearchPerformed,
    preconsentCookieCategories: entities.preconsentCookieCategories ?? entities.preconsent_cookie_categories,
    preconsentCookieEvidence: parseObjectArrayValue(entities.preconsentCookieEvidence ?? entities.preconsent_cookie_evidence),
    preconsent_cookie_evidence: parseObjectArrayValue(entities.preconsentCookieEvidence ?? entities.preconsent_cookie_evidence),
    cookieRetentionEvidence: parseObjectArrayValue(entities.cookieRetentionEvidence ?? entities.cookie_retention_evidence),
    cookie_retention_evidence: parseObjectArrayValue(entities.cookieRetentionEvidence ?? entities.cookie_retention_evidence),
    preconsentCookieTimingEvidence: entities.preconsentCookieTimingEvidence ?? entities.preconsent_cookie_timing_evidence,
    preconsentNonessentialCookieNames: entities.preconsentNonessentialCookieNames ?? entities.preconsent_nonessential_cookie_names,
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
    runtimeVendorDisclosureEvidence: parseObjectArrayValue(
      entities.runtimeVendorDisclosureEvidence ?? entities.runtime_vendor_disclosure_evidence
    ),
    observedRuntimeVendors: entities.observedRuntimeVendors ?? entities.observed_runtime_vendors,
    observedRuntimeDomains: entities.observedRuntimeDomains ?? entities.observed_runtime_domains,
    unmatchedRuntimeVendors: entities.unmatchedRuntimeVendors ?? entities.unmatched_runtime_vendors,
    unmatchedRuntimeDomains: entities.unmatchedRuntimeDomains ?? entities.unmatched_runtime_domains,
    policySurfacesSearched: parseObjectArrayValue(entities.policySurfacesSearched ?? entities.policy_surfaces_searched),
    runtimeVendorCategories: entities.runtimeVendorCategories ?? entities.runtime_vendor_categories,
    runtimeVendors: entities.runtimeVendors ?? consentTrackingDetails?.vendors,
    sensitiveDataTypes: entities.sensitiveDataTypes ?? entities.sensitive_data_types,
    sensitiveFieldContexts: entities.sensitiveFieldContexts ?? entities.sensitive_field_contexts,
    sensitiveFieldEvidence: entities.sensitiveFieldEvidence ?? entities.sensitive_field_evidence,
    sensitiveInputSurfaceEvidence: entities.sensitiveInputSurfaceEvidence ?? entities.sensitive_input_surface_evidence,
    sensitiveInputSurfaceObserved: entities.sensitiveInputSurfaceObserved,
    sensitivePayloadViolations: parseObjectArrayValue(
      entities.sensitivePayloadViolations ?? entities.sensitive_payload_violations
    ),
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
  const packetEvidenceDecision = evaluateFindingEvidenceContractForRawEvidence(
    packet.unifiedFindingId,
    packetToContractEvidence(packet)
  );

	  if (packet.concernContext) {
	    const requiresPolicyBehaviorContradictionEvidence = contract.requiredForStrong.some(
	      (requirement) => requirement.type === "policyBehaviorContradictionEvidence"
	    );
	    if (
	      packet.concernContext.promotionEligibilities.length > 0 &&
	      packet.concernContext.promotionEligibilities.every((value) => value === "eligible") &&
	      packet.concernContext.externalSurfacingEligibilities.every((value) => value === "eligible")
	    ) {
	      if (packetEvidenceDecision?.status === "pass_strong") {
	        return packetEvidenceDecision;
	      }
	      if (requiresPolicyBehaviorContradictionEvidence) {
	        return packetEvidenceDecision;
	      }

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

  return packetEvidenceDecision;
}

export function isFindingProjectionEligible(input: {
  lane: keyof FindingEvidenceContract["projectionEligibility"];
  packet: UnifiedFindingPacket;
}) {
	  const contract = getFindingEvidenceContractForUnifiedFinding(input.packet.unifiedFindingId);
	  if (!contract) {
	    if (input.packet.details?.family === "contradiction") {
	      return evaluatePolicyBehaviorContradictionEvidence(packetToContractEvidence(input.packet)).eligible;
	    }
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
