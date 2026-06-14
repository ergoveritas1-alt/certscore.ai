import type {
  Wc01V2ShadowProjection,
  Wc01V2ShadowRow,
  Wc01V2ShadowVendorRef,
} from "./wc01-shadow-contract";
import { WC01_V2_SHADOW_PROJECTION_CONTRACT_VERSION } from "./wc01-shadow-contract";
import {
  containsBlockedRawFields,
  containsForbiddenGapObservedToken,
} from "./wc01-shadow-output";

export const WC01_V2_ALLOWLIST_DRY_RUN_VERSION =
  "wc01.v2_allowlist_dry_run.1";

export const WC01_V2_NORMALIZED_CONCERN_CANDIDATE_DRAFT_VERSION =
  "wc01.v2_normalized_concern_candidate_draft.1";

export type Wc01V2ProposedConcernFamily =
  | "tracker_inventory"
  | "pre_consent_tracking"
  | "pre_consent_cookie_storage"
  | "consent_surface"
  | "session_replay_behavioral_analytics";

export type Wc01V2NormalizedConcernCandidateDraft = {
  draftVersion: typeof WC01_V2_NORMALIZED_CONCERN_CANDIDATE_DRAFT_VERSION;
  source: {
    rowId: string;
    shadowStatus: string;
    shadowWc01AssessmentStatus: string;
    sourceFindingKey: string;
    scanId?: string;
    reviewId?: string;
    url?: string;
  };
  proposedConcernKey: string;
  proposedConcernFamily: Wc01V2ProposedConcernFamily;
  status: "candidate_review_only";
  productionEligible: false;
  topFindingEligible: false;
  gapEligible: false;
  evidence: {
    excerptIds: string[];
    sourceRefIds: string[];
    displaySafeExcerptCount: number;
    capped: boolean;
    omittedCount: number;
  };
  vendors: Array<{
    name: string;
    product?: string;
    purposes: string[];
    diagnosticOnly: boolean;
  }>;
  purposeClassification: {
    supportingPurposes: string[];
    diagnosticPurposes: string[];
  };
  confidence: {
    band?: string;
    directVsInferred?: string;
  };
  gate: {
    passed: true;
    gateId: string;
    matchedCriteria: string[];
    caveats: string[];
  };
};

export type Wc01V2BlockedRow = {
  rowId: string;
  sourceFindingKey: string;
  tier:
    | "tier_b_review_only"
    | "tier_c_never_tracker_default"
    | "tier_a_failed_gates"
    | "unsupported";
  status: string;
  blockReasons: string[];
  missingRequirements?: string[];
  blockedPurposes?: string[];
};

export type Wc01V2AllowlistDryRun = {
  dryRunVersion: typeof WC01_V2_ALLOWLIST_DRY_RUN_VERSION;
  source: Wc01V2ShadowProjection["source"];
  productionEligible: false;
  candidates: Wc01V2NormalizedConcernCandidateDraft[];
  blockedRows: Wc01V2BlockedRow[];
  guardrails: {
    noGapObserved: boolean;
    noTopFindingEligibility: boolean;
    noGapEligibility: boolean;
    noRawBlockedFields: boolean;
    noProductionEligibility: boolean;
  };
};

type TierAGateConfig = {
  allowedStatuses: Wc01V2ShadowRow["status"][];
  blockedPurposes: Set<string>;
  gateId: string;
  proposedConcernFamily: Wc01V2ProposedConcernFamily;
  proposedConcernKey: string;
  requiredPurposes?: Set<string>;
};

type GateEvaluation = {
  passed: boolean;
  blockReasons: string[];
  missingRequirements: string[];
  blockedPurposes: string[];
};

const allowedTrackerPurposes = new Set([
  "advertising",
  "analytics",
  "session_replay",
  "behavioral_analytics",
  "marketing_automation",
  "advertising_measurement",
  "identity_resolution",
  "social_pixel",
  "retargeting",
]);

const blockedTrackerPurposes = new Set([
  "security",
  "performance_monitoring",
  "customer_support",
  "cdn",
  "static",
  "site_owned_infrastructure",
  "infrastructure",
  "fraud_prevention",
  "bot_defense",
  "rum",
  "live_chat",
  "consent_management",
  "unknown",
]);

const diagnosticOnlyPurposes = new Set([
  ...blockedTrackerPurposes,
  "tag_management",
  "consent_management",
  "strictly_necessary",
]);

const tierCDiagnosticPurposes = new Set([
  "security",
  "performance_monitoring",
  "customer_support",
  "cdn",
  "static",
  "site_owned_infrastructure",
  "infrastructure",
  "fraud_prevention",
  "bot_defense",
  "rum",
  "live_chat",
  "unknown",
]);

const TIER_A_CONFIGS: Record<string, TierAGateConfig> = {
  third_party_vendors_observed: {
    allowedStatuses: ["observed"],
    blockedPurposes: blockedTrackerPurposes,
    gateId: "tier_a.third_party_vendors_observed.v1",
    proposedConcernFamily: "tracker_inventory",
    proposedConcernKey: "v2_runtime_tracker_inventory_candidate",
    requiredPurposes: allowedTrackerPurposes,
  },
  pre_consent_tracking_detected: {
    allowedStatuses: ["observed"],
    blockedPurposes: new Set([...blockedTrackerPurposes, "tag_management"]),
    gateId: "tier_a.pre_consent_tracking_detected.v1",
    proposedConcernFamily: "pre_consent_tracking",
    proposedConcernKey: "v2_pre_consent_tracking_candidate",
    requiredPurposes: allowedTrackerPurposes,
  },
  third_party_cookie_pre_consent: {
    allowedStatuses: ["observed"],
    blockedPurposes: new Set([...blockedTrackerPurposes, "strictly_necessary"]),
    gateId: "tier_a.third_party_cookie_pre_consent.v1",
    proposedConcernFamily: "pre_consent_cookie_storage",
    proposedConcernKey: "v2_pre_consent_cookie_storage_candidate",
    requiredPurposes: allowedTrackerPurposes,
  },
  consent_banner_observed_or_not_observed: {
    allowedStatuses: ["observed", "checked", "not_observed"],
    blockedPurposes: new Set(),
    gateId: "tier_a.consent_banner_observed_or_not_observed.v1",
    proposedConcernFamily: "consent_surface",
    proposedConcernKey: "v2_consent_surface_candidate",
  },
  session_replay_or_behavioral_analytics_observed: {
    allowedStatuses: ["observed"],
    blockedPurposes: new Set([
      ...blockedTrackerPurposes,
      "tag_management",
      "rum",
      "performance_monitoring",
      "customer_support",
      "live_chat",
    ]),
    gateId: "tier_a.session_replay_or_behavioral_analytics_observed.v1",
    proposedConcernFamily: "session_replay_behavioral_analytics",
    proposedConcernKey: "v2_session_replay_behavioral_analytics_candidate",
    requiredPurposes: new Set(["session_replay", "behavioral_analytics", "analytics"]),
  },
};

const TIER_B_FINDING_KEY_PATTERNS = [
  /unresolved.*endpoint/i,
  /policy_runtime_vendor_alignment/i,
  /accept_reject_runtime_delta/i,
  /tracking_after_refusal/i,
  /reject_did_not_reduce/i,
  /persist_after_reject/i,
  /post_reject/i,
  /appear_only_after_accept/i,
  /policy|privacy_notice|cookie_policy|privacy_choices|do_not_sell|gpc_disclosure|notice_at_collection|policy_vendor_mentions/i,
];

const REVIEW_ONLY_STATUSES = new Set([
  "review_signal",
  "coverage_limitation",
  "not_testable",
  "assisted_candidate",
]);

const RAW_LEGAL_CONCLUSION_PATTERN =
  /\b(violation|violates|illegal|unlawful|noncompliant|non-compliant)\b/i;

const DIRECT_EVIDENCE_KINDS = new Set([
  "network_request",
  "network_response",
  "cookie",
  "storage",
  "script",
  "iframe",
]);

const COOKIE_EVIDENCE_KINDS = new Set(["cookie", "storage", "browser_cookie", "set_cookie"]);
const UI_EVIDENCE_KINDS = new Set(["ui_control", "dom_text", "screenshot", "consent_surface", "page_text"]);
const SESSION_REPLAY_COLLECTION_MARKERS = [
  "session_replay_collection_observed",
  "collection_endpoint_observed",
  "session_replay_vendor_observation",
  "behavioral_analytics_collection_observed",
];

export function projectWc01V2ShadowToAllowlistDryRun(
  shadow: Wc01V2ShadowProjection,
): Wc01V2AllowlistDryRun {
  validateShadowProjection(shadow);

  const candidates: Wc01V2NormalizedConcernCandidateDraft[] = [];
  const blockedRows: Wc01V2BlockedRow[] = [];

  for (const row of shadow.rows) {
    const config = TIER_A_CONFIGS[row.sourceFindingKey];
    if (!config) {
      blockedRows.push(blockRow(row, classifyNonTierARow(row), reasonsForNonTierARow(row)));
      continue;
    }

    const tierCBlock = tierCOnlyBlock(row);
    if (tierCBlock) {
      blockedRows.push(blockRow(row, "tier_c_never_tracker_default", tierCBlock.reasons, [], tierCBlock.blockedPurposes));
      continue;
    }

    if (row.sourceFindingKey === "third_party_vendors_observed") {
      blockedRows.push(blockRow(
        row,
        "tier_a_failed_gates",
        [
          "inventory_only_signal",
          "requires_pre_consent_or_collection_context",
          "inventory_signal_requires_stronger_tracking_context",
        ],
        ["stronger_tracking_context"],
        diagnosticPurposesForRow(row),
      ));
      continue;
    }

    if (row.sourceFindingKey === "consent_banner_observed_or_not_observed") {
      blockedRows.push(blockRow(
        row,
        "tier_a_failed_gates",
        [
          "consent_surface_gate_split_required",
          row.status === "not_observed"
            ? "consent_absence_requires_bounded_search_scope"
            : "consent_surface_mapping_blocked_for_now",
        ],
        [
          "split_consent_surface_gate",
          row.status === "not_observed"
            ? "bounded_absence_search_scope_evidence"
            : "observed_surface_gate_definition",
        ],
      ));
      continue;
    }

    const gate = evaluateTierAGate(row, config, shadow.source.url);
    if (!gate.passed) {
      blockedRows.push(blockRow(
        row,
        "tier_a_failed_gates",
        gate.blockReasons,
        gate.missingRequirements,
        gate.blockedPurposes,
      ));
      continue;
    }

    candidates.push(buildCandidateDraft(row, shadow, config));
  }

  const dryRun: Wc01V2AllowlistDryRun = {
    dryRunVersion: WC01_V2_ALLOWLIST_DRY_RUN_VERSION,
    source: shadow.source,
    productionEligible: false,
    candidates,
    blockedRows,
    guardrails: {
      noGapObserved: !containsForbiddenGapObservedToken({ candidates, blockedRows }),
      noTopFindingEligibility: candidates.every((candidate) => !candidate.topFindingEligible),
      noGapEligibility: candidates.every((candidate) => !candidate.gapEligible),
      noRawBlockedFields: !containsBlockedRawFields({ candidates, blockedRows }),
      noProductionEligibility:
        shadow.productionEligible === false &&
        candidates.every((candidate) => !candidate.productionEligible),
    },
  };

  assertDryRunGuardrails(dryRun);
  return dryRun;
}

export function parseWc01V2ShadowProjectionJson(raw: string): Wc01V2ShadowProjection {
  if (raw.includes("gap_observed")) {
    throw new Error("Wc01V2ShadowProjection contains forbidden gap status token.");
  }
  if (containsBlockedRawFields(raw)) {
    throw new Error("Wc01V2ShadowProjection contains raw blocked evidence fields.");
  }
  if (RAW_LEGAL_CONCLUSION_PATTERN.test(raw)) {
    throw new Error("Wc01V2ShadowProjection contains legal-conclusion language.");
  }

  const parsed = JSON.parse(raw) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("Wc01V2ShadowProjection must be a JSON object.");
  }
  validateShadowProjection(parsed as Wc01V2ShadowProjection);
  return parsed as Wc01V2ShadowProjection;
}

export function projectWc01V2ShadowJsonToAllowlistDryRun(raw: string) {
  return projectWc01V2ShadowToAllowlistDryRun(parseWc01V2ShadowProjectionJson(raw));
}

function validateShadowProjection(shadow: Wc01V2ShadowProjection) {
  if (!isRecord(shadow)) {
    throw new Error("Wc01V2ShadowProjection must be a JSON object.");
  }
  if (shadow.contractVersion !== WC01_V2_SHADOW_PROJECTION_CONTRACT_VERSION) {
    throw new Error("Unsupported Wc01V2ShadowProjection contract version.");
  }
  if (shadow.productionEligible !== false) {
    throw new Error("Wc01V2ShadowProjection must not be production eligible.");
  }
  if (!Array.isArray(shadow.rows)) {
    throw new Error("Wc01V2ShadowProjection.rows must be an array.");
  }
  if (shadow.rows.some((row) => row.topFindingEligible !== false)) {
    throw new Error("Wc01V2ShadowProjection contains top-finding eligible rows.");
  }
  if (shadow.rows.some((row) => row.gapEligible !== false)) {
    throw new Error("Wc01V2ShadowProjection contains gap-eligible rows.");
  }
}

function evaluateTierAGate(row: Wc01V2ShadowRow, config: TierAGateConfig, sourceUrl: string): GateEvaluation {
  const blockReasons: string[] = [];
  const missingRequirements: string[] = [];
  const blockedPurposes = blockedPurposesForRow(row, config.blockedPurposes);

  if (!config.allowedStatuses.includes(row.status)) {
    blockReasons.push("status_not_allowed_for_tier_a");
    missingRequirements.push("allowed_status");
  }
  if (row.evidence.sourceRefIds.length === 0) {
    blockReasons.push("missing_source_refs");
    missingRequirements.push("sourceRefIds");
  }
  if (!hasExcerptEvidence(row)) {
    blockReasons.push("missing_excerpt_or_display_safe_evidence");
    missingRequirements.push("excerptIds_or_displaySafeExcerpts");
  }
  if (hasCoverageOrIncompleteModule(row)) {
    blockReasons.push("coverage_or_source_module_incomplete");
    missingRequirements.push("completed_required_source_modules");
  }
  if (hasDisallowedReviewDemotion(row)) {
    blockReasons.push("review_only_or_disallowed_demotion_present");
    missingRequirements.push("no_disallowed_demotion_reasons");
  }
  if (blockedPurposes.length > 0 && !hasAllowedPurpose(row, config.requiredPurposes)) {
    blockReasons.push("blocked_purposes_only");
  }
    if (diagnosticPurposesForRow(row).length > 0 && !supportingPurposesForRow(row, config.requiredPurposes).length) {
      blockReasons.push("diagnostic_purpose_not_supporting");
      blockReasons.push("tracker_supporting_purpose_absent");
    }
  const tierCDiagnostics = tierCDiagnosticPurposesForRow(row);
  if (tierCDiagnostics.length > 0) {
    blockReasons.push("tier_c_diagnostic_purpose_present");
    blockReasons.push("mixed_tracker_and_tier_c_purpose_requires_evidence_subset_gate");
    missingRequirements.push("tracker_purpose_evidence_subset_gate");
  }

  switch (row.sourceFindingKey) {
    case "third_party_vendors_observed":
      requireAllowedVendorPurpose(row, config, blockReasons, missingRequirements);
      requireDirectRuntimeEvidence(row, blockReasons, missingRequirements);
      break;
    case "pre_consent_tracking_detected":
      requireAllowedVendorPurpose(row, config, blockReasons, missingRequirements);
      requireDirectRuntimeEvidence(row, blockReasons, missingRequirements);
      requireHighConfidence(row, blockReasons, missingRequirements);
      requirePreConsentEvidence(row, blockReasons, missingRequirements);
      if (hasOnlyPurposes(row, ["tag_management", "consent_management"])) {
        blockReasons.push("tag_or_consent_management_only");
      }
      if (hasOnlyPurposes(row, ["tag_management"])) {
        blockReasons.push("tag_management_diagnostic_only");
      }
      if (hasOnlyPurposes(row, ["consent_management"])) {
        blockReasons.push("consent_management_diagnostic_only");
      }
      break;
    case "third_party_cookie_pre_consent":
      requireDirectCookieEvidence(row, blockReasons, missingRequirements);
      requirePreConsentEvidence(row, blockReasons, missingRequirements);
      requireCookiePartyContext(row, sourceUrl, blockReasons, missingRequirements);
      if (row.vendors.length > 0) {
        requireAllowedVendorPurpose(row, config, blockReasons, missingRequirements);
      }
      if (hasOnlyPurposes(row, ["strictly_necessary", "consent_management", "security", "customer_support", "unknown"])) {
        blockReasons.push("non_tracker_cookie_purpose_only");
      }
      break;
    case "consent_banner_observed_or_not_observed":
      requireConsentUiEvidence(row, blockReasons, missingRequirements);
      break;
    case "session_replay_or_behavioral_analytics_observed":
      requireAllowedVendorPurpose(row, config, blockReasons, missingRequirements);
      requireSessionReplayCollectionEvidence(row, blockReasons, missingRequirements);
      if (hasOnlyPurposes(row, ["rum", "performance_monitoring", "customer_support", "live_chat", "tag_management", "security", "unknown"])) {
        blockReasons.push("non_session_replay_purpose_only");
      }
      break;
  }

  return {
    passed: blockReasons.length === 0 && missingRequirements.length === 0,
    blockReasons: uniqueStrings(blockReasons),
    missingRequirements: uniqueStrings(missingRequirements),
    blockedPurposes,
  };
}

function buildCandidateDraft(
  row: Wc01V2ShadowRow,
  shadow: Wc01V2ShadowProjection,
  config: TierAGateConfig,
): Wc01V2NormalizedConcernCandidateDraft {
  const reviewOnlyReasons = row.policy.reviewOnlyReasons.filter((reason) => reason !== "shadow_projection_only");
  const purposeClassification = {
    supportingPurposes: supportingPurposesForRow(row, config.requiredPurposes),
    diagnosticPurposes: diagnosticPurposesForRow(row),
  };
  return {
    draftVersion: WC01_V2_NORMALIZED_CONCERN_CANDIDATE_DRAFT_VERSION,
    source: {
      rowId: row.rowId,
      shadowStatus: row.status,
      shadowWc01AssessmentStatus: row.wc01AssessmentStatus,
      sourceFindingKey: row.sourceFindingKey,
      scanId: shadow.source.scanId,
      reviewId: shadow.source.reviewId,
      url: shadow.source.url,
    },
    proposedConcernKey: config.proposedConcernKey,
    proposedConcernFamily: config.proposedConcernFamily,
    status: "candidate_review_only",
    productionEligible: false,
    topFindingEligible: false,
    gapEligible: false,
    evidence: {
      excerptIds: uniqueStrings(row.evidence.excerptIds),
      sourceRefIds: uniqueStrings(row.evidence.sourceRefIds),
      displaySafeExcerptCount: row.evidence.displaySafeExcerpts.length,
      capped: row.evidence.capped,
      omittedCount: row.evidence.omittedCount,
    },
    vendors: diagnosticVendors(row.vendors),
    purposeClassification,
    confidence: {
      band: row.confidence.band,
      directVsInferred: row.confidence.directVsInferred,
    },
    gate: {
      passed: true,
      gateId: config.gateId,
      matchedCriteria: uniqueStrings(row.policy.matchedCriteria),
      caveats: uniqueStrings([
        "dry_run_only",
        "candidate_review_only",
        "not_production_normalized_concern",
        ...(purposeClassification.diagnosticPurposes.length > 0
          ? ["diagnostic_purpose_not_supporting"]
          : []),
        ...(purposeClassification.diagnosticPurposes.includes("tag_management")
          ? ["tag_management_diagnostic_only"]
          : []),
        ...(purposeClassification.diagnosticPurposes.includes("consent_management")
          ? ["consent_management_diagnostic_only"]
          : []),
        ...(row.sourceFindingKey === "third_party_cookie_pre_consent" && !hasThirdPartyCookieStorageContext(row, shadow.source.url)
          ? ["third_party_context_requires_policy_review"]
          : []),
        ...reviewOnlyReasons,
      ]),
    },
  };
}

function blockRow(
  row: Wc01V2ShadowRow,
  tier: Wc01V2BlockedRow["tier"],
  blockReasons: string[],
  missingRequirements: string[] = [],
  blockedPurposes: string[] = [],
): Wc01V2BlockedRow {
  const blocked: Wc01V2BlockedRow = {
    rowId: row.rowId,
    sourceFindingKey: row.sourceFindingKey,
    tier,
    status: row.status,
    blockReasons: uniqueStrings(blockReasons),
  };
  const missing = uniqueStrings(missingRequirements);
  const purposes = uniqueStrings(blockedPurposes);
  if (missing.length > 0) {
    blocked.missingRequirements = missing;
  }
  if (purposes.length > 0) {
    blocked.blockedPurposes = purposes;
  }
  return blocked;
}

function classifyNonTierARow(row: Wc01V2ShadowRow): Wc01V2BlockedRow["tier"] {
  if (row.status === "assisted_candidate" || TIER_B_FINDING_KEY_PATTERNS.some((pattern) => pattern.test(row.sourceFindingKey))) {
    return "tier_b_review_only";
  }
  if (tierCOnlyBlock(row)) {
    return "tier_c_never_tracker_default";
  }
  return "unsupported";
}

function reasonsForNonTierARow(row: Wc01V2ShadowRow) {
  if (row.status === "assisted_candidate") {
    return ["assisted_candidate_review_only"];
  }
  if (TIER_B_FINDING_KEY_PATTERNS.some((pattern) => pattern.test(row.sourceFindingKey))) {
    return ["tier_b_review_only_by_design"];
  }
  if (tierCOnlyBlock(row)) {
    return ["tier_c_non_tracker_purpose_only"];
  }
  return ["source_finding_key_not_allowlisted"];
}

function tierCOnlyBlock(row: Wc01V2ShadowRow) {
  const purposes = vendorPurposes(row);
  const blockedPurposes = blockedPurposesForRow(row, blockedTrackerPurposes);
  if (purposes.length > 0 && blockedPurposes.length === purposes.length && !hasAllowedPurpose(row, allowedTrackerPurposes)) {
    return {
      reasons: ["tier_c_non_tracker_purpose_only"],
      blockedPurposes,
    };
  }
  if (row.vendors.length > 0 && purposes.length === 0) {
    return {
      reasons: ["vendor_purpose_missing_or_unknown"],
      blockedPurposes: ["unknown"],
    };
  }
  return null;
}

function requireAllowedVendorPurpose(
  row: Wc01V2ShadowRow,
  config: TierAGateConfig,
  blockReasons: string[],
  missingRequirements: string[],
) {
  if (!config.requiredPurposes || hasAllowedPurpose(row, config.requiredPurposes)) {
    return;
  }
  blockReasons.push("missing_allowed_vendor_purpose");
  missingRequirements.push("allowed_vendor_purpose");
}

function requireDirectRuntimeEvidence(
  row: Wc01V2ShadowRow,
  blockReasons: string[],
  missingRequirements: string[],
) {
  const hasDirect = row.confidence.directVsInferred === "direct" ||
    row.evidence.displaySafeExcerpts.some((excerpt) =>
      excerpt.directVsInferred === "direct" &&
      DIRECT_EVIDENCE_KINDS.has(excerpt.evidenceKind)
    );
  if (!hasDirect) {
    blockReasons.push("missing_direct_runtime_evidence");
    missingRequirements.push("direct_runtime_evidence");
  }
}

function requireHighConfidence(
  row: Wc01V2ShadowRow,
  blockReasons: string[],
  missingRequirements: string[],
) {
  if (row.confidence.band !== "high") {
    blockReasons.push("missing_high_confidence_runtime_evidence");
    missingRequirements.push("high_confidence_runtime_evidence");
  }
}

function requirePreConsentEvidence(
  row: Wc01V2ShadowRow,
  blockReasons: string[],
  missingRequirements: string[],
) {
  const hasPreConsent = row.evidence.displaySafeExcerpts.some((excerpt) =>
    excerpt.consentStateAtTime === "pre_consent" ||
    /pre_consent/i.test(excerpt.scenario ?? "") ||
    /pre_consent/i.test(excerpt.sourceScanner ?? "")
  );
  const missingPreConsent = row.policy.missingCorroborators.some((value) =>
    /pre_consent|consent_state|concrete_preconsent/i.test(value)
  ) || row.policy.demotionReasons.some((value) =>
    /missing_concrete_preconsent_artifact|missing_preconsent_sequence_evidence/i.test(value)
  );
  if (!hasPreConsent || missingPreConsent) {
    blockReasons.push("missing_pre_consent_or_consent_state_evidence");
    missingRequirements.push("pre_consent_consent_state_evidence");
  }
}

function requireDirectCookieEvidence(
  row: Wc01V2ShadowRow,
  blockReasons: string[],
  missingRequirements: string[],
) {
  const hasCookie = row.evidence.displaySafeExcerpts.some((excerpt) =>
    COOKIE_EVIDENCE_KINDS.has(excerpt.evidenceKind) ||
    excerpt.cookieNames.length > 0 ||
    /cookie|storage/i.test(excerpt.displayLabel)
  );
  if (!hasCookie) {
    blockReasons.push("missing_direct_cookie_or_storage_evidence");
    missingRequirements.push("direct_cookie_or_storage_evidence");
  }
}

function requireCookiePartyContext(
  row: Wc01V2ShadowRow,
  sourceUrl: string,
  blockReasons: string[],
  missingRequirements: string[],
) {
  if (hasKnownFirstPartyOnlyCookieStorageContext(row, sourceUrl)) {
    blockReasons.push("first_party_only_cookie_or_storage_context");
    missingRequirements.push("third_party_cookie_or_storage_context");
  }
}

function requireConsentUiEvidence(
  row: Wc01V2ShadowRow,
  blockReasons: string[],
  missingRequirements: string[],
) {
  if (REVIEW_ONLY_STATUSES.has(row.status)) {
    blockReasons.push("consent_banner_status_not_mappable");
    missingRequirements.push("observed_checked_or_not_observed_status");
  }
  const hasUiEvidence = row.evidence.displaySafeExcerpts.some((excerpt) =>
    UI_EVIDENCE_KINDS.has(excerpt.evidenceKind) ||
    /consent|cookie|privacy|banner|control|search|scope|screenshot/i.test([
      excerpt.displayLabel,
      excerpt.displayValueRedacted,
      excerpt.sourceEventType,
    ].join(" "))
  );
  if (!hasUiEvidence || row.evidence.sourceRefIds.length === 0) {
    blockReasons.push(row.status === "not_observed" ? "missing_bounded_absence_or_search_scope_evidence" : "missing_consent_ui_evidence");
    missingRequirements.push(row.status === "not_observed" ? "bounded_absence_search_scope_evidence" : "consent_ui_or_control_evidence");
  }
}

function requireSessionReplayCollectionEvidence(
  row: Wc01V2ShadowRow,
  blockReasons: string[],
  missingRequirements: string[],
) {
  const criteria = [
    ...row.policy.matchedCriteria,
    ...row.vendors.flatMap((vendor) => vendor.basis),
    ...row.evidence.displaySafeExcerpts.map((excerpt) =>
      [excerpt.evidenceKind, excerpt.displayLabel, excerpt.path, excerpt.displayValueRedacted].join(" ")
    ),
  ].join(" ");
  const hasExplicitCollectionMarker = SESSION_REPLAY_COLLECTION_MARKERS.some((marker) => criteria.includes(marker));
  const hasCollection = hasExplicitCollectionMarker ||
    /session[_ -]?replay.*collect|behavioral[_ -]?analytics.*collect|\/rec\/|\/record|\/collect/i.test(criteria);
  const libraryOnly = /library_only|library_loaded_only|session_replay_library_observed/i.test(criteria) && !hasExplicitCollectionMarker;
  if (!hasCollection || libraryOnly) {
    blockReasons.push(libraryOnly ? "library_only_without_collection" : "missing_session_replay_collection_evidence");
    missingRequirements.push("session_replay_collection_evidence");
  }
}

function hasExcerptEvidence(row: Wc01V2ShadowRow) {
  return row.evidence.excerptIds.length > 0 || row.evidence.displaySafeExcerpts.length > 0;
}

function hasCoverageOrIncompleteModule(row: Wc01V2ShadowRow) {
  return row.status === "coverage_limitation" ||
    row.policy.reviewOnlyReasons.some((reason) =>
      reason === "coverage_limitation_present" ||
      reason === "source_module_missing_or_incomplete"
    );
}

function hasDisallowedReviewDemotion(row: Wc01V2ShadowRow) {
  const reasons = [
    ...row.policy.reviewOnlyReasons.filter((reason) => reason !== "shadow_projection_only"),
    ...row.policy.demotionReasons,
  ];
  return reasons.some((reason) =>
    /review_signal_only|coverage_limitation_present|source_module_missing_or_incomplete|library_only_without_collection|missing_concrete_preconsent_artifact|missing_preconsent_sequence_evidence|strictly_necessary_storage_only/i.test(reason)
  );
}

function hasAllowedPurpose(row: Wc01V2ShadowRow, allowedPurposes: Set<string> | undefined) {
  if (!allowedPurposes) {
    return true;
  }
  return vendorPurposes(row).some((purpose) => allowedPurposes.has(purpose));
}

function supportingPurposesForRow(row: Wc01V2ShadowRow, allowedPurposes: Set<string> | undefined) {
  if (!allowedPurposes) {
    return [];
  }
  return uniqueStrings(vendorPurposes(row).filter((purpose) =>
    allowedPurposes.has(purpose) && !diagnosticOnlyPurposes.has(purpose)
  ));
}

function diagnosticPurposesForRow(row: Wc01V2ShadowRow) {
  return uniqueStrings(vendorPurposes(row).filter((purpose) => diagnosticOnlyPurposes.has(purpose)));
}

function tierCDiagnosticPurposesForRow(row: Wc01V2ShadowRow) {
  return uniqueStrings(vendorPurposes(row).filter((purpose) => tierCDiagnosticPurposes.has(purpose)));
}

function hasOnlyPurposes(row: Wc01V2ShadowRow, purposes: string[]) {
  const normalized = vendorPurposes(row);
  return normalized.length > 0 && normalized.every((purpose) => purposes.includes(purpose));
}

function blockedPurposesForRow(row: Wc01V2ShadowRow, blockedPurposes: Set<string>) {
  return uniqueStrings(vendorPurposes(row).filter((purpose) => blockedPurposes.has(purpose)));
}

function vendorPurposes(row: Wc01V2ShadowRow) {
  return uniqueStrings(row.vendors.map((vendor) => normalizePurpose(vendor.purpose)));
}

function diagnosticVendors(vendors: Wc01V2ShadowVendorRef[]) {
  const grouped = new Map<string, { name: string; product?: string; purposes: Set<string>; diagnosticOnly: boolean }>();
  for (const vendor of vendors) {
    const name = safeVendorName(vendor);
    const product = stringOrUndefined(vendor.product);
    const key = `${name}::${product ?? ""}`;
    const existing = grouped.get(key) ?? {
      name,
      product,
      purposes: new Set<string>(),
      diagnosticOnly: true,
    };
    const purpose = normalizePurpose(vendor.purpose);
    if (purpose) {
      existing.purposes.add(purpose);
    }
    grouped.set(key, existing);
  }
  return [...grouped.values()].map((vendor) => ({
    name: vendor.name,
    product: vendor.product,
    purposes: [...vendor.purposes].sort(),
    diagnosticOnly: vendor.diagnosticOnly,
  }));
}

function hasThirdPartyCookieStorageContext(row: Wc01V2ShadowRow, sourceUrl: string) {
  const sourceSite = registrableDomain(sourceUrl);
  if (!sourceSite) {
    return false;
  }
  return row.evidence.displaySafeExcerpts.some((excerpt) => {
    if (!isCookieOrStorageExcerpt(excerpt)) {
      return false;
    }
    const excerptSite = registrableDomain(excerpt.hostname);
    return Boolean(excerptSite && excerptSite !== sourceSite);
  });
}

function hasKnownFirstPartyOnlyCookieStorageContext(row: Wc01V2ShadowRow, sourceUrl: string) {
  const sourceSite = registrableDomain(sourceUrl);
  if (!sourceSite) {
    return false;
  }
  const cookieStorageExcerpts = row.evidence.displaySafeExcerpts.filter(isCookieOrStorageExcerpt);
  if (cookieStorageExcerpts.length === 0) {
    return false;
  }
  return cookieStorageExcerpts.every((excerpt) => {
    const excerptSite = registrableDomain(excerpt.hostname);
    return Boolean(excerptSite && excerptSite === sourceSite);
  });
}

function isCookieOrStorageExcerpt(excerpt: Wc01V2ShadowRow["evidence"]["displaySafeExcerpts"][number]) {
  return COOKIE_EVIDENCE_KINDS.has(excerpt.evidenceKind) ||
    excerpt.cookieNames.length > 0 ||
    /cookie|storage/i.test(excerpt.displayLabel);
}

function registrableDomain(value: string | undefined) {
  if (!value) {
    return null;
  }
  let hostname = value;
  try {
    hostname = new URL(value).hostname;
  } catch {
    hostname = value;
  }
  const labels = hostname.toLowerCase().split(".").filter(Boolean);
  if (labels.length < 2) {
    return hostname.toLowerCase();
  }
  return labels.slice(-2).join(".");
}

function safeVendorName(vendor: Wc01V2ShadowVendorRef) {
  return stringOrUndefined(vendor.vendor) ?? stringOrUndefined(vendor.entity) ?? "unknown_vendor";
}

function stringOrUndefined(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function normalizePurpose(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim().toLowerCase().replace(/[-\s]+/g, "_")
    : "unknown";
}

function assertDryRunGuardrails(dryRun: Wc01V2AllowlistDryRun) {
  const serialized = JSON.stringify(dryRun);
  if (serialized.includes("gap_observed")) {
    throw new Error("Allowlist dry-run output contains forbidden gap status token.");
  }
  if (containsBlockedRawFields(serialized)) {
    throw new Error("Allowlist dry-run output contains raw blocked evidence fields.");
  }
  if (RAW_LEGAL_CONCLUSION_PATTERN.test(serialized)) {
    throw new Error("Allowlist dry-run output contains legal-conclusion language.");
  }
  if (!Object.values(dryRun.guardrails).every(Boolean)) {
    throw new Error("Allowlist dry-run guardrails failed.");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim().length > 0))].sort();
}
