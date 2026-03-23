import { createAdminClient } from "@website-signal-risk-scanner/db";
import {
  SCAN_EVENT_TYPES,
  VALIDATION_DEFAULT_INTERVAL_MINUTES,
  VALIDATION_DEFAULT_RUN_MODE,
  type FindingCategory,
  type FindingSeverity,
  type ScanPage,
  type ValidationPipelineState,
  type ValidationRunMode,
  type ValidationRunStatus,
  type ValidationVerdict
} from "@website-signal-risk-scanner/shared";
import { extractHostname, normalizeUrl } from "@website-signal-risk-scanner/shared";
import type { ObservedPageEvidence, ScanSignalHit } from "@website-signal-risk-scanner/shared";
import { getWorkerEnv } from "../env";
import { buildFinancialSectionReviewFindings } from "./financial-review";
import { getCooldownDaysForRank, getNextDueAt, getRankBand, isValidValidationInterval, VALIDATION_FINDING_LIMIT, VALIDATION_SETTINGS_KEY } from "./constants";

type ValidationSettingsRow = {
  automatic_interval_minutes: number;
  last_scheduled_at: string | null;
  last_tranco_sync_at: string | null;
  last_worker_heartbeat_at: string | null;
  last_worker_host: string | null;
  last_worker_started_at: string | null;
  next_due_at: string | null;
  operator_note: string | null;
  pipeline_enabled: boolean;
  run_mode: ValidationRunMode;
  singleton_key: string;
  updated_at: string;
  updated_by_user_id: string | null;
};

type ValidationTargetRow = {
  active: boolean;
  backoff_until: string | null;
  cooldown_until: string | null;
  deny_reason: string | null;
  denylisted: boolean;
  hostname: string;
  id: string;
  last_completed_at: string | null;
  last_error: string | null;
  last_run_at: string | null;
  last_status: string | null;
  normalized_url: string;
  rank_band: string | null;
  tranco_rank: number | null;
};

type ValidationRunRow = {
  average_agreement_score: number | null;
  completed_at: string | null;
  created_at: string;
  domain_id: string | null;
  error_message: string | null;
  finding_count: number;
  hostname: string;
  id: string;
  normalized_url: string;
  rank_band: string | null;
  reviewed_finding_count: number;
  scan_id: string | null;
  started_at: string | null;
  status: ValidationRunStatus;
  tranco_rank: number | null;
  trigger_mode: ValidationRunMode;
  validation_target_id: string | null;
};

export type ValidationRunRecord = {
  averageAgreementScore: number | null;
  completedAt: string | null;
  createdAt: string;
  domainId: string | null;
  errorMessage: string | null;
  findingCount: number;
  hostname: string;
  id: string;
  normalizedUrl: string;
  rankBand: string | null;
  reviewedFindingCount: number;
  scanId: string | null;
  startedAt: string | null;
  status: ValidationRunStatus;
  targetId: string | null;
  trancoRank: number | null;
  triggerMode: ValidationRunMode;
};

type ScanSignalRow = {
  category: string;
  signal_key: string;
  signal_label: string;
  signal_value_json: boolean | number | string | string[] | null;
  value_type: "boolean" | "number" | "text" | "string_array";
};

type ScanSnapshotRow = {
  cmp_vendor_name: string | null;
  consent_withdrawal_mechanism_present: boolean | null;
  cookie_banner_present: boolean;
  date_of_birth_input_present?: boolean | null;
  dark_pattern_reject_button_missing: boolean;
  address_input_present?: boolean | null;
  email_input_present?: boolean | null;
  form_collects_geolocation?: boolean | null;
  form_collects_health_information?: boolean | null;
  form_collects_ssn?: boolean | null;
  legal_coverage_score: number | null;
  phone_input_present?: boolean | null;
  preconsent_tracking_detected: boolean;
  privacy_policy_present: boolean;
  privacy_policy_word_count: number | null;
  reject_all_present: boolean;
  third_party_cookie_set_before_consent: boolean | null;
  tracking_before_consent_detected: boolean | null;
};

type ScanRuntimeArtifactsRow = {
  consent_blocker_page_title?: string | null;
  consent_blocker_text_snippet?: string | null;
  consent_blocker_type?: "auth_wall" | "external_redirect" | "extra_click_path" | null;
  consent_blocker_url?: string | null;
  consent_evidence_pass_count?: number | null;
  consent_accept_click_count?: number | null;
  consent_friction_delta?: number | null;
  consent_opt_in_clicks?: number | null;
  consent_opt_in_evidence_log?: Array<{
    action?: string | null;
    selectorHint?: string | null;
    stepIndex?: number | null;
    text?: string | null;
    urlAfterClick?: string | null;
  }> | null;
  consent_opt_out_clicks?: number | null;
  consent_opt_out_evidence_log?: Array<{
    action?: string | null;
    selectorHint?: string | null;
    stepIndex?: number | null;
    text?: string | null;
    urlAfterClick?: string | null;
  }> | null;
  consent_post_reject_tracker_evidence_urls: string[] | null;
  consent_post_reject_tracker_vendor_names: string[] | null;
  consent_redirect_or_auth_required?: boolean | null;
  consent_reject_persisted_tracker_vendor_names: string[] | null;
  consent_reject_reduced_tracking: boolean | null;
  consent_reject_click_count?: number | null;
  consent_withdrawal_mechanism_present?: boolean | null;
  initial_cookie_count?: number | null;
  key_page_discovery_summary?: {
    pageSummaries?: Array<{
      attemptCount?: number | null;
      attemptedUrls?: string[] | null;
      bestDiscoverySource?: string | null;
      guessedOnly?: boolean | null;
      pageType?: string | null;
      stopReason?: string | null;
    }> | null;
  } | null;
  sensitive_payload_violations?: Array<{
    detectedType?: string | null;
    evidenceStrength?: string | null;
    matchSnippet?: string | null;
    requestMethod?: string | null;
    requestUrl?: string | null;
    sourceField?: string | null;
    sourceLocation?: "request_body" | "url_query" | null;
    sourcePattern?: "generic_pattern" | "keyed_field" | null;
    timestamp?: string | null;
    vendorHost?: string | null;
  }> | null;
  script_src_domains?: string[] | null;
  third_party_request_domains?: string[] | null;
};

type ScanAccessibilityRuleExampleRow = {
  description: string;
  help: string;
  help_url: string;
  impact: string | null;
  node_count: number;
  page_url: string;
  representative_selectors: string[] | null;
  rule_code: string;
  rule_group: string;
  severity: string;
};

type ScanPageEvidenceRow = {
  container_dom_path: string | null;
  container_selector: string | null;
  crawl_depth: number | null;
  dom_path: string | null;
  evidence_id: string;
  matched_text: string | null;
  metadata: Record<string, unknown> | null;
  page_role: ObservedPageEvidence["pageRole"];
  page_type: ObservedPageEvidence["pageType"];
  page_url: string;
  scan_id: string;
  screenshot_ref: string | null;
  selector: string | null;
  sibling_index: number | null;
  source_kind: ObservedPageEvidence["sourceKind"];
  token_end: number | null;
  token_start: number | null;
};

type ScanSignalHitRow = {
  detector_name: string;
  detector_type: ScanSignalHit["detectorType"];
  detector_version: string;
  evidence_refs: string[] | null;
  id: string;
  page_role: ScanSignalHit["pageRole"];
  page_type: ScanSignalHit["pageType"];
  page_url: string;
  payload: Record<string, unknown> | null;
  scan_id: string;
  signal_key: string;
};

type ValidationSnapshotFallbackRow = {
  cookie_banner_present: boolean;
  dark_pattern_reject_button_missing: boolean;
  legal_coverage_score: number | null;
  preconsent_tracking_detected: boolean;
  privacy_policy_present: boolean;
  privacy_policy_word_count: number | null;
  reject_all_present: boolean;
  third_party_cookie_set_before_consent: boolean | null;
  tracking_before_consent_detected: boolean | null;
};

type SnapshotSupplementRow = {
  accessibility_litigation_risk_score: number | null;
  retargeting_pixel_detected: boolean | null;
};

type PolicyReviewQueueRow = {
  id: string;
  policy_enrichment_id: string | null;
  reason: string;
  review_status: string | null;
  scan_id: string;
};

type PolicyEnrichmentLookupRow = {
  id: string;
  policy_ambiguity_score?: number | null;
  policy_coverage_ratio?: number | null;
  policy_effective_date?: string | null;
  policy_field_coverage?: Record<string, unknown>;
  policy_governing_law?: string | null;
  policy_notice_contact_present?: boolean | null;
  page_type: string | null;
  page_url: string | null;
  policy_semantic_confidence?: number | null;
  policy_snippet_count?: number | null;
  policy_structurally_weak?: boolean | null;
  policy_summary_short?: string | null;
  policy_termination_or_suspension_present?: boolean | null;
  policy_cancellation_or_refund_present?: boolean | null;
  policy_arbitration_present?: boolean | null;
};

export type ValidationRunFindingInsert = {
  category: FindingCategory;
  description: string;
  evidence_json: Record<string, unknown>;
  finding_id: string | null;
  page_url: string | null;
  rank: number;
  rule_key: string;
  severity: FindingSeverity;
  subtype: string | null;
  title: string;
};

export type ValidationRunFindingRow = ValidationRunFindingInsert & {
  id: string;
  validation_run_id: string;
};

type ValidationRunFindingDbRow = Omit<ValidationRunFindingInsert, "rank"> & {
  finding_rank: number;
  id: string;
  validation_run_id: string;
};

export type ValidationVerdictInsert = {
  agreement_score: 0 | 50 | 100;
  confidence: number;
  evidence_json: Record<string, unknown>;
  model: string;
  prompt_version: string;
  rationale: string;
  system_confidence_band: "very_high" | "high" | "moderate" | "low" | "very_low";
  system_confidence_explanation: string;
  system_confidence_score: number;
  validation_run_finding_id: string;
  verdict: ValidationVerdict;
};

type ValidationSupportingSignalValue =
  | ScanSignalRow["signal_value_json"]
  | {
      sampleUrls: string[];
      totalObservedUrls: number;
      vendorsObserved: string[];
    };

export type ValidationEvidencePacket = {
  claim: string;
  consentBlockerPageTitle?: string | null;
  consentBlockerTextSnippet?: string | null;
  consentBlockerType?: "auth_wall" | "external_redirect" | "extra_click_path" | null;
  consentBlockerUrl?: string | null;
  consentEvidencePassCount?: number | null;
  consentFrictionDelta?: number | null;
  consentOptInClicks?: number | null;
  consentOptOutClicks?: number | null;
  consentRedirectOrAuthRequired?: boolean | null;
  keyPageAttemptCount?: number | null;
  keyPageAttemptedUrls?: string[];
  keyPageDiscoverySource?: string | null;
  keyPageGuessedOnly?: boolean | null;
  keyPageStopReason?: string | null;
  confidenceBasis: string[];
  missingEvidence: string[];
  pageUrls: string[];
  policyEvidence: string[];
  reviewPolicy: {
    claimType: "behavior_without_disclosure" | "tracking_before_consent" | "tracking_after_reject" | "automated_accessibility";
    contraryEvidenceTypes: string[];
    detectorStrength: "strong" | "medium" | "weak";
    gapTolerance: "high" | "low" | "medium";
    requiredSupportTypes: string[];
    rubric: {
      inconclusiveIf: string[];
      notSupportedIf: string[];
      supportedIf: string[];
    };
  };
  runtimeEvidence: string[];
  sensitivePayloadViolations?: Array<{
    detectedType: string;
    evidenceStrength?: "confirmed" | "suspected" | null;
    matchSnippet: string;
    requestMethod: string;
    requestUrl: string;
    sourceField?: string | null;
    sourceInputHint?: string | null;
    sourceMatchesSensitiveInputHint?: boolean | null;
    sourceLocation?: "request_body" | "url_query" | null;
    sourcePattern?: "generic_pattern" | "keyed_field" | null;
    timestamp: string;
    vendorHost: string | null;
  }>;
  supportingSignals: Array<{
    category: ScanSignalRow["category"];
    key: string;
    label: string;
    value: ValidationSupportingSignalValue;
  }>;
};

type ValidationEvidencePolicyReviewPayload = ValidationEvidencePacket & {
  pageType: string | null;
  pageUrl: string | null;
  policyEnrichmentId: string | null;
  policyAmbiguityScore: number | null;
  policyArbitrationPresent: boolean | null;
  policyCancellationOrRefundPresent: boolean | null;
  policyCoverageRatio: number | null;
  policyEffectiveDate: string | null;
  policyFieldCoverage: Record<string, unknown>;
  policyGoverningLaw: string | null;
  policyNoticeContactPresent: boolean | null;
  reviewQueueReason: string;
  reviewStatus: string | null;
  policySemanticConfidence: number | null;
  policySnippetCount: number | null;
  policyStructurallyWeak: boolean | null;
  policySummaryShort: string | null;
  policyTerminationOrSuspensionPresent: boolean | null;
};

type ValidationEvidenceBuildContext = {
  accessibilityRuleExamples: ScanAccessibilityRuleExampleRow[];
  runtimeArtifacts: ScanRuntimeArtifactsRow | null;
  scanSignalsByKey: Map<string, ScanSignalRow>;
  snapshot: ScanSnapshotRow | null;
};

type ValidationEvidenceAugmentation = {
  confidenceBasis?: string[];
  keyPageAttemptCount?: number | null;
  keyPageAttemptedUrls?: string[];
  keyPageDiscoverySource?: string | null;
  keyPageGuessedOnly?: boolean | null;
  keyPageStopReason?: string | null;
  missingEvidence?: string[];
  pageUrls?: string[];
  policyEvidence?: string[];
  reviewPolicy?: Omit<Partial<ValidationEvidencePacket["reviewPolicy"]>, "rubric"> & {
    rubric?: Partial<ValidationEvidencePacket["reviewPolicy"]["rubric"]>;
  };
  runtimeEvidence?: string[];
  supportingSignals?: ValidationEvidencePacket["supportingSignals"];
};

type ValidationEvidenceAugmenter = (input: {
  context: ValidationEvidenceBuildContext;
  packet: ValidationEvidencePacket;
  row: ScanSignalRow;
}) => ValidationEvidenceAugmentation | null;

type ValidationFindingDefinition = {
  buildEvidence?: (row: ScanSignalRow, context: ValidationEvidenceBuildContext) => ValidationEvidencePacket;
  category: FindingCategory;
  description: string;
  ruleKey: string;
  severity: FindingSeverity;
  subtype: string | null;
  title: string;
};

type PreconsentEvidenceSummary = {
  sampleUrls: string[];
  totalObservedUrls: number;
  vendorsObserved: string[];
};

function normalizeEvidenceUrl(url: string) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString().replace(/\/$/, parsed.pathname === "/" ? "/" : "");
  } catch {
    return url.trim();
  }
}

function inferVendorFromUrl(url: string) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();

    if (hostname.includes("yandex")) {
      return "Yandex";
    }
    if (hostname.includes("viqeo") || hostname.includes("vqserve")) {
      return "Viqeo";
    }
    if (hostname.includes("adriver")) {
      return "AdRiver";
    }
    if (hostname.includes("googlesyndication") || hostname.includes("doubleclick") || hostname.includes("google")) {
      return "Google Ads";
    }
    if (hostname.includes("liveinternet") || hostname.endsWith("li.ru") || hostname.endsWith("yadro.ru")) {
      return "LiveInternet";
    }

    const parts = hostname.split(".").filter(Boolean);
    if (parts.length >= 2) {
      return parts.slice(-2).join(".");
    }
    return hostname;
  } catch {
    return null;
  }
}

function summarizePreconsentEvidenceUrls(evidenceUrls: string[], trackerVendors: string[]): PreconsentEvidenceSummary {
  const normalizedUrls = [...new Set(
    evidenceUrls
      .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
      .map((entry) => normalizeEvidenceUrl(entry))
  )];

  const inferredVendors = normalizedUrls
    .map((entry) => inferVendorFromUrl(entry))
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);

  const vendorsObserved = [...new Set([...trackerVendors, ...inferredVendors])].slice(0, 8);

  return {
    sampleUrls: normalizedUrls.slice(0, 5),
    totalObservedUrls: evidenceUrls.length,
    vendorsObserved
  };
}

function mergeSupportingSignals(
  current: ValidationEvidencePacket["supportingSignals"],
  next: ValidationEvidencePacket["supportingSignals"] | undefined
) {
  if (!next || next.length === 0) {
    return current;
  }

  const merged = [...current];
  const seen = new Set(current.map((signal) => `${signal.category}:${signal.key}:${JSON.stringify(signal.value)}`));
  for (const signal of next) {
    const key = `${signal.category}:${signal.key}:${JSON.stringify(signal.value)}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(signal);
  }
  return merged;
}

function mergeReviewPolicy(
  current: ValidationEvidencePacket["reviewPolicy"],
  next: ValidationEvidenceAugmentation["reviewPolicy"]
): ValidationEvidencePacket["reviewPolicy"] {
  if (!next) {
    return current;
  }

  return {
    claimType: next.claimType ?? current.claimType,
    contraryEvidenceTypes: uniqueStrings([...(current.contraryEvidenceTypes ?? []), ...(next.contraryEvidenceTypes ?? [])]),
    detectorStrength: next.detectorStrength ?? current.detectorStrength,
    gapTolerance: next.gapTolerance ?? current.gapTolerance,
    requiredSupportTypes: uniqueStrings([...(current.requiredSupportTypes ?? []), ...(next.requiredSupportTypes ?? [])]),
    rubric: {
      inconclusiveIf: uniqueStrings([...(current.rubric.inconclusiveIf ?? []), ...(next.rubric?.inconclusiveIf ?? [])]),
      notSupportedIf: uniqueStrings([...(current.rubric.notSupportedIf ?? []), ...(next.rubric?.notSupportedIf ?? [])]),
      supportedIf: uniqueStrings([...(current.rubric.supportedIf ?? []), ...(next.rubric?.supportedIf ?? [])])
    }
  };
}

function applyEvidenceAugmentation(
  packet: ValidationEvidencePacket,
  augmentation: ValidationEvidenceAugmentation | null
): ValidationEvidencePacket {
  if (!augmentation) {
    return packet;
  }

  return {
    ...packet,
    confidenceBasis: uniqueStrings([...(packet.confidenceBasis ?? []), ...(augmentation.confidenceBasis ?? [])]),
    keyPageAttemptCount:
      augmentation.keyPageAttemptCount !== undefined ? augmentation.keyPageAttemptCount : packet.keyPageAttemptCount,
    keyPageAttemptedUrls: uniqueStrings([...(packet.keyPageAttemptedUrls ?? []), ...(augmentation.keyPageAttemptedUrls ?? [])]),
    keyPageDiscoverySource:
      augmentation.keyPageDiscoverySource !== undefined ? augmentation.keyPageDiscoverySource : packet.keyPageDiscoverySource,
    keyPageGuessedOnly:
      augmentation.keyPageGuessedOnly !== undefined ? augmentation.keyPageGuessedOnly : packet.keyPageGuessedOnly,
    keyPageStopReason:
      augmentation.keyPageStopReason !== undefined ? augmentation.keyPageStopReason : packet.keyPageStopReason,
    missingEvidence: uniqueStrings([...(packet.missingEvidence ?? []), ...(augmentation.missingEvidence ?? [])]),
    pageUrls: uniqueStrings([...(packet.pageUrls ?? []), ...(augmentation.pageUrls ?? [])]),
    policyEvidence: uniqueStrings([...(packet.policyEvidence ?? []), ...(augmentation.policyEvidence ?? [])]),
    reviewPolicy: mergeReviewPolicy(packet.reviewPolicy, augmentation.reviewPolicy),
    runtimeEvidence: uniqueStrings([...(packet.runtimeEvidence ?? []), ...(augmentation.runtimeEvidence ?? [])]),
    supportingSignals: mergeSupportingSignals(packet.supportingSignals, augmentation.supportingSignals)
  };
}

function composeEvidencePacket(input: {
  augmenters?: ValidationEvidenceAugmenter[];
  basePacket: ValidationEvidencePacket;
  context?: ValidationEvidenceBuildContext;
  row: ScanSignalRow;
}) {
  if (!input.context || !input.augmenters || input.augmenters.length === 0) {
    return input.basePacket;
  }

  return input.augmenters.reduce(
    (packet, augmenter) => applyEvidenceAugmentation(packet, augmenter({ context: input.context!, packet, row: input.row })),
    input.basePacket
  );
}

function toSupportingSignal(
  row: ScanSignalRow,
  overrides?: Partial<Pick<ValidationEvidencePacket["supportingSignals"][number], "key" | "label" | "value">>
) {
  return {
    category: row.category,
    key: overrides?.key ?? row.signal_key,
    label: overrides?.label ?? row.signal_label,
    value: overrides?.value ?? row.signal_value_json
  } satisfies ValidationEvidencePacket["supportingSignals"][number];
}

const KEY_PAGE_SURFACE_MISSING_MISSING_EVIDENCE =
  "The disclosure could still exist at an untested, localized, or consolidated URL outside the bounded discovery scope.";

function buildKeyPageSurfaceMissingEvidence(input: {
  claim: string;
  context: ValidationEvidenceBuildContext;
  extraAugmenters?: ValidationEvidenceAugmenter[];
  pageType: ScanPage["pageType"];
  row: ScanSignalRow;
}) {
  return buildDefaultEvidencePacket(input.row, input.claim, {
    augmenters: [augmentWithKeyPageCoverageContext(input.pageType), ...(input.extraAugmenters ?? [])],
    context: input.context,
    missingEvidence: [KEY_PAGE_SURFACE_MISSING_MISSING_EVIDENCE]
  });
}

const VALIDATION_SIGNAL_FINDING_DEFINITIONS: Record<
  string,
  ValidationFindingDefinition
> = {
  "privacy.reject_control_missing_detected": {
    buildEvidence: (row, context) =>
      buildDefaultEvidencePacket(row, "A consent experience was detected without a clear reject-all control.", {
        augmenters: [augmentWithConsentControlSnapshotContext()],
        context,
        missingEvidence: ["Banner HTML or page-level consent UI evidence was not retained in this packet."]
      }),
    category: "privacy",
    description: "A consent experience was detected without a clear reject-all control.",
    ruleKey: "privacy.reject_control_missing_detected",
    severity: "high",
    subtype: "consent_controls",
    title: "Reject-all control missing"
  },
  "privacy.trackers_before_consent_detected": {
    buildEvidence: buildPreconsentTrackingEvidence,
    category: "privacy",
    description: "Tracking activity appears to occur before the visitor can make a consent choice.",
    ruleKey: "privacy.trackers_before_consent_detected",
    severity: "high",
    subtype: "preconsent_tracking",
    title: "Trackers observed before consent"
  },
  "privacy.preconsent_tracking_detected": {
    buildEvidence: buildPreconsentTrackingEvidence,
    category: "privacy",
    description: "Tracking activity appears to occur before the visitor can make a consent choice.",
    ruleKey: "privacy.trackers_before_consent_detected",
    severity: "high",
    subtype: "preconsent_tracking",
    title: "Trackers observed before consent"
  },
  "privacy.preconsent_violation_count": {
    buildEvidence: buildPreconsentTrackingEvidence,
    category: "privacy",
    description: "Pre-consent tracker requests were observed before the visitor could make a consent choice.",
    ruleKey: "privacy.trackers_before_consent_detected",
    severity: "high",
    subtype: "preconsent_tracking",
    title: "Trackers observed before consent"
  },
  "privacy.consent_reject_persisted_tracker_vendors": {
    buildEvidence: buildRejectPersistenceEvidence,
    category: "privacy",
    description: "Trackers continued to persist after a reject-style consent interaction.",
    ruleKey: "privacy.trackers_persist_after_reject_detected",
    severity: "high",
    subtype: "consent_enforcement",
    title: "Trackers persisted after reject"
  },
  "disclosure.privacy_policy_limited": {
    buildEvidence: (row, context) =>
      buildDefaultEvidencePacket(row, "A privacy policy was detected, but its coverage appeared limited or incomplete.", {
        augmenters: [augmentWithPrivacyPolicyCoverageSnapshotContext()],
        context,
        missingEvidence: ["Policy excerpts or structured coverage diagnostics were not retained in this packet."]
      }),
    category: "legal",
    description: "A privacy policy was detected, but its coverage appeared limited or incomplete.",
    ruleKey: "disclosure.privacy_policy_limited",
    severity: "medium",
    subtype: "policy_coverage",
    title: "Privacy policy coverage limited"
  },
  "disclosure.disclosure_language_missing_detected": {
    buildEvidence: (row) => buildDefaultEvidencePacket(row, "Promotional or affiliate disclosure language appears to be missing."),
    category: "legal",
    description: "Promotional or affiliate disclosure language appears to be missing.",
    ruleKey: "disclosure.disclosure_language_missing_detected",
    severity: "high",
    subtype: "disclosure_language",
    title: "Disclosure language missing"
  },
  "context.session_replay_without_disclosure_detected": {
    buildEvidence: buildSessionReplayEvidence,
    category: "privacy",
    description: "Session replay behavior appears present without a corresponding disclosure on the site.",
    ruleKey: "privacy.session_replay_without_disclosure_detected",
    severity: "high",
    subtype: "session_replay_disclosure",
    title: "Session replay without disclosure"
  },
  "context.policy_behavior_conflict_detected": {
    buildEvidence: buildPolicyBehaviorConflictEvidence,
    category: "privacy",
    description: "Observed site behavior may conflict with the site’s public-facing policy language.",
    ruleKey: "context.policy_behavior_conflict_detected",
    severity: "high",
    subtype: "policy_behavior_conflict",
    title: "Policy/behavior conflict"
  },
  "privacy.cookie_runtime_disclosure_gap_detected": {
    buildEvidence: buildCookieDisclosureGapEvidence,
    category: "privacy",
    description: "Observed cookie or tracker activity may not be fully reflected in the current cookie disclosure surface.",
    ruleKey: "cookie_runtime.disclosure_gap",
    severity: "high",
    subtype: "cookie_disclosure_gap",
    title: "Cookie disclosure gap"
  },
  "commerce.high_sensitivity_data_collection_detected": {
    buildEvidence: buildHighSensitivityPayloadEvidence,
    category: "privacy",
    description:
      "Potential high-sensitivity data collection risk is present, with confidence increasing only when plaintext third-party payload matches are confirmed.",
    ruleKey: "commerce.high_sensitivity_data_collection_detected",
    severity: "medium",
    subtype: "sensitive_data_collection",
    title: "Potential high-sensitivity data collection risk"
  },
  "privacy.policy_runtime_functional_misalignment_detected": {
    buildEvidence: buildRightsFrictionEvidence,
    category: "privacy",
    description: "Observed runtime consent flows may impose more friction on opt-out than opt-in.",
    ruleKey: "scan_signal.privacy.policy_runtime_functional_misalignment_detected",
    severity: "high",
    subtype: "scan_signal_review",
    title: "High-confidence functional misalignment"
  },
  "privacy.user_rights_friction_score": {
    buildEvidence: buildRightsFrictionEvidence,
    category: "privacy",
    description: "Observed runtime consent flows may impose more friction on opt-out than opt-in.",
    ruleKey: "scan_signal.privacy.user_rights_friction_score",
    severity: "high",
    subtype: "scan_signal_review",
    title: "Potential rights-fulfillment friction"
  },
  "accessibility.wcag_error_count_total": {
    buildEvidence: buildAccessibilityEvidence,
    category: "accessibility",
    description: "Automated accessibility testing surfaced WCAG rule violations on this site.",
    ruleKey: "accessibility.wcag_errors_detected",
    severity: "medium",
    subtype: "automated_accessibility",
    title: "Automated accessibility issues detected"
  },
  "accessibility.accessibility_risk_score": {
    buildEvidence: buildAccessibilityRiskSignalEvidence,
    category: "accessibility",
    description: "Scanner-derived accessibility risk indicator is elevated.",
    ruleKey: "scan_snapshot.accessibility.accessibility_risk_score",
    severity: "medium",
    subtype: "snapshot_review",
    title: "Accessibility risk score"
  },
  "disclosure.privacy_policy_surface_missing": {
    buildEvidence: (row, context) =>
      buildKeyPageSurfaceMissingEvidence({
        claim: "A privacy policy surface was not detected during the scan.",
        context,
        pageType: "privacy_policy",
        row
      }),
    category: "legal",
    description: "A privacy policy surface was not detected during the scan.",
    ruleKey: "disclosure.privacy_policy_surface_missing",
    severity: "high",
    subtype: "key_page_coverage",
    title: "Privacy policy surface not detected"
  },
  "disclosure.privacy_policy_fetch_failed": {
    buildEvidence: (row, context) =>
      buildKeyPageFetchFailureEvidence(row, context, "The privacy policy target page was detected but could not be fetched successfully."),
    category: "legal",
    description: "The privacy policy target page was detected but could not be fetched successfully.",
    ruleKey: "disclosure.privacy_policy_fetch_failed",
    severity: "high",
    subtype: "key_page_coverage",
    title: "Privacy policy page unavailable"
  },
  "disclosure.terms_of_service_surface_missing": {
    buildEvidence: (row, context) =>
      buildKeyPageSurfaceMissingEvidence({
        claim: "A terms page surface was not detected during the scan.",
        context,
        pageType: "terms_of_service",
        row
      }),
    category: "legal",
    description: "A terms page surface was not detected during the scan.",
    ruleKey: "disclosure.terms_of_service_surface_missing",
    severity: "medium",
    subtype: "key_page_coverage",
    title: "Terms page surface not detected"
  },
  "disclosure.terms_of_service_fetch_failed": {
    buildEvidence: (row, context) =>
      buildKeyPageFetchFailureEvidence(row, context, "The terms page target URL was detected but could not be fetched successfully."),
    category: "legal",
    description: "The terms page target URL was detected but could not be fetched successfully.",
    ruleKey: "disclosure.terms_of_service_fetch_failed",
    severity: "medium",
    subtype: "key_page_coverage",
    title: "Terms page unavailable"
  },
  "disclosure.cookie_policy_surface_missing": {
    buildEvidence: (row, context) =>
      buildKeyPageSurfaceMissingEvidence({
        claim: "A cookie policy surface was not detected during the scan.",
        context,
        extraAugmenters: [augmentWithCookieRuntimeCorroboration()],
        pageType: "cookie_policy",
        row
      }),
    category: "legal",
    description: "A cookie policy surface was not detected during the scan.",
    ruleKey: "disclosure.cookie_policy_surface_missing",
    severity: "medium",
    subtype: "key_page_coverage",
    title: "Cookie policy surface not detected"
  },
  "disclosure.cookie_policy_fetch_failed": {
    buildEvidence: (row, context) =>
      buildKeyPageFetchFailureEvidence(row, context, "The cookie policy target URL was detected but could not be fetched successfully."),
    category: "legal",
    description: "The cookie policy target URL was detected but could not be fetched successfully.",
    ruleKey: "disclosure.cookie_policy_fetch_failed",
    severity: "medium",
    subtype: "key_page_coverage",
    title: "Cookie policy unavailable"
  },
  "disclosure.accessibility_statement_surface_missing": {
    buildEvidence: (row, context) =>
      buildKeyPageSurfaceMissingEvidence({
        claim: "An accessibility statement surface was not detected during the scan.",
        context,
        pageType: "accessibility_statement",
        row
      }),
    category: "accessibility",
    description: "An accessibility statement surface was not detected during the scan.",
    ruleKey: "disclosure.accessibility_statement_surface_missing",
    severity: "medium",
    subtype: "key_page_coverage",
    title: "Accessibility statement surface not detected"
  },
  "disclosure.accessibility_statement_fetch_failed": {
    buildEvidence: (row, context) =>
      buildKeyPageFetchFailureEvidence(row, context, "The accessibility statement target URL was detected but could not be fetched successfully."),
    category: "accessibility",
    description: "The accessibility statement target URL was detected but could not be fetched successfully.",
    ruleKey: "disclosure.accessibility_statement_fetch_failed",
    severity: "medium",
    subtype: "key_page_coverage",
    title: "Accessibility statement unavailable"
  },
  "disclosure.contact_page_surface_missing": {
    buildEvidence: (row, context) =>
      buildKeyPageSurfaceMissingEvidence({
        claim: "A contact page surface was not detected during the scan.",
        context,
        pageType: "contact",
        row
      }),
    category: "legal",
    description: "A contact page surface was not detected during the scan.",
    ruleKey: "disclosure.contact_page_surface_missing",
    severity: "medium",
    subtype: "key_page_coverage",
    title: "Contact page surface not detected"
  },
  "disclosure.contact_page_fetch_failed": {
    buildEvidence: (row, context) =>
      buildKeyPageFetchFailureEvidence(row, context, "The contact page target URL was detected but could not be fetched successfully."),
    category: "legal",
    description: "The contact page target URL was detected but could not be fetched successfully.",
    ruleKey: "disclosure.contact_page_fetch_failed",
    severity: "medium",
    subtype: "key_page_coverage",
    title: "Contact page unavailable"
  }
};

const PRECONSENT_FINDING_SIGNAL_KEYS = [
  "privacy.trackers_before_consent_detected",
  "privacy.preconsent_tracking_detected",
  "privacy.preconsent_violation_count",
  "privacy.preconsent_tracker_vendors",
  "privacy.preconsent_tracker_evidence_urls"
] as const;

function describeKeyPageDiscoverySource(source: string | null) {
  switch (source) {
    case "footer_link":
      return "rendered footer links";
    case "header_link":
      return "rendered header links";
    case "body_link":
      return "rendered page links";
    case "legal_hub":
      return "a legal hub page";
    case "same_brand_subdomain":
      return "same-brand discovery";
    case "rendered_link":
      return "rendered site links";
    case "sitemap":
      return "the sitemap";
    case "second_hop_legal_hub":
      return "a secondary legal hub";
    case "guessed_slug":
      return "guessed slugs";
    default:
      return null;
  }
}

function describeKeyPageStopReason(stopReason: string | null) {
  if (stopReason === "repeated_failures") {
    return "The bounded fetch recorded repeated hard failures for those discovered targets.";
  }

  if (stopReason === "all_attempts_failed") {
    return "Every bounded fetch attempt for those discovered targets failed.";
  }

  if (stopReason === "budget_exhausted") {
    return "The bounded discovery budget was exhausted before a successful fetch.";
  }

  return null;
}

function getKeyPageTypeForSignal(signalKey: string) {
  if (signalKey === "disclosure.privacy_policy_surface_missing") {
    return "privacy_policy";
  }
  if (signalKey === "disclosure.terms_of_service_surface_missing") {
    return "terms_of_service";
  }
  if (signalKey === "disclosure.cookie_policy_surface_missing") {
    return "cookie_policy";
  }
  if (signalKey === "disclosure.accessibility_statement_surface_missing") {
    return "accessibility_statement";
  }
  if (signalKey === "disclosure.contact_page_surface_missing") {
    return "contact";
  }
  if (signalKey === "disclosure.privacy_policy_fetch_failed") {
    return "privacy_policy";
  }
  if (signalKey === "disclosure.terms_of_service_fetch_failed") {
    return "terms_of_service";
  }
  if (signalKey === "disclosure.cookie_policy_fetch_failed") {
    return "cookie_policy";
  }
  if (signalKey === "disclosure.accessibility_statement_fetch_failed") {
    return "accessibility_statement";
  }
  if (signalKey === "disclosure.contact_page_fetch_failed") {
    return "contact";
  }
  return null;
}

function getKeyPageDiscoverySummaryForPageType(
  context: ValidationEvidenceBuildContext,
  pageType: ScanPage["pageType"] | null
) {
  const pageSummaries = context.runtimeArtifacts?.key_page_discovery_summary?.pageSummaries;

  if (!pageType || !Array.isArray(pageSummaries)) {
    return null;
  }

  const match = pageSummaries.find((summary) => summary?.pageType === pageType);
  if (!match) {
    return null;
  }

  return {
    attemptCount: typeof match.attemptCount === "number" ? match.attemptCount : null,
    attemptedUrls: Array.isArray(match.attemptedUrls)
      ? match.attemptedUrls.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : [],
    bestDiscoverySource: typeof match.bestDiscoverySource === "string" ? match.bestDiscoverySource : null,
    guessedOnly: match.guessedOnly === true,
    stopReason: typeof match.stopReason === "string" ? match.stopReason : null
  };
}

function getKeyPageDiscoverySummaryForSignal(context: ValidationEvidenceBuildContext, signalKey: string) {
  return getKeyPageDiscoverySummaryForPageType(context, getKeyPageTypeForSignal(signalKey));
}

function isGenericValidationConcernSignal(row: ScanSignalRow) {
  const key = row.signal_key;
  const value = row.signal_value_json;

  if (!isActiveSignalValue(value, row.value_type)) {
    return false;
  }

  const negativePatterns = [
    /dark_pattern/,
    /preconsent/,
    /conflict/,
    /mismatch/,
    /retargeting_pixel/,
    /session_replay/,
    /functional_misalignment/,
    /technical_disclosure/,
    /disclosure_gap/,
    /surface_missing/,
    /fetch_failed/,
    /structurally_obstructed/,
    /likely_obstructed/,
    /high_sensitivity_data_collection_detected/,
    /limited_time_offer_language_present/,
    /discount_claim_present/,
    /original_price_comparison_present/,
    /store_credit_only/,
    /termination_for_cause/,
    /service_suspension_or_termination/
  ];

  if (negativePatterns.some((pattern) => pattern.test(key))) {
    return true;
  }

  if (typeof value === "number") {
    return /risk_score|ambiguity_score|friction_score/i.test(key) && value > 0;
  }

  return false;
}

function getGenericValidationFindingSeverity(row: ScanSignalRow): FindingSeverity {
  if (/preconsent|session_replay|conflict|mismatch|functional_misalignment|technical_disclosure|disclosure_gap/i.test(row.signal_key)) {
    return "high";
  }

  if (/privacy_policy_(surface_missing|fetch_failed)/i.test(row.signal_key)) {
    return "high";
  }

  if (/structurally_obstructed|likely_obstructed|surface_missing|fetch_failed/i.test(row.signal_key)) {
    return "medium";
  }

  if (typeof row.signal_value_json === "number" && /risk_score|ambiguity_score|friction_score/i.test(row.signal_key)) {
    return row.signal_value_json >= 70 ? "high" : "medium";
  }

  if (/store_credit_only|termination_for_cause|service_suspension_or_termination|high_sensitivity_data_collection_detected|retargeting_pixel/i.test(row.signal_key)) {
    return "medium";
  }

  return "medium";
}

function mapScanSignalCategoryToFindingCategory(row: ScanSignalRow): FindingCategory {
  if (row.category === "disclosure") {
    return "legal";
  }

  if (row.category === "context" || row.category === "commerce" || row.category === "security") {
    return "privacy";
  }

  return row.category === "accessibility" ? "accessibility" : "privacy";
}

function getGenericValidationFindingTitle(row: ScanSignalRow) {
  if (row.signal_key === "privacy.policy_runtime_functional_misalignment_detected") {
    return "High-confidence functional misalignment";
  }

  if (row.signal_key === "disclosure.policy_runtime_missing_technical_disclosure_detected") {
    return "Missing technical disclosure";
  }

  if (row.signal_key === "disclosure.policy_runtime_disclosure_likely_obstructed") {
    return "Disclosure likely obstructed";
  }

  if (row.signal_key === "privacy.cookie_runtime_disclosure_gap_detected") {
    return "Cookie disclosure gap";
  }

  if (row.signal_key === "disclosure.cookie_policy_structurally_obstructed") {
    return "Cookie policy structurally obstructed";
  }

  if (row.signal_key === "disclosure.privacy_policy_surface_missing") {
    return "Privacy policy surface not detected";
  }

  if (row.signal_key === "disclosure.privacy_policy_fetch_failed") {
    return "Privacy policy page unavailable";
  }

  if (row.signal_key === "disclosure.terms_of_service_surface_missing") {
    return "Terms page surface not detected";
  }

  if (row.signal_key === "disclosure.terms_of_service_fetch_failed") {
    return "Terms page unavailable";
  }

  if (row.signal_key === "disclosure.cookie_policy_surface_missing") {
    return "Cookie policy surface not detected";
  }

  if (row.signal_key === "disclosure.cookie_policy_fetch_failed") {
    return "Cookie policy unavailable";
  }

  if (row.signal_key === "disclosure.accessibility_statement_surface_missing") {
    return "Accessibility statement surface not detected";
  }

  if (row.signal_key === "disclosure.accessibility_statement_fetch_failed") {
    return "Accessibility statement unavailable";
  }

  if (row.signal_key === "disclosure.contact_page_surface_missing") {
    return "Contact page surface not detected";
  }

  if (row.signal_key === "disclosure.contact_page_fetch_failed") {
    return "Contact page unavailable";
  }

  if (row.signal_key === "privacy.user_rights_friction_score" && typeof row.signal_value_json === "number") {
    return row.signal_value_json >= 100 ? "Critical user-rights fulfillment friction" : "High user-rights fulfillment friction";
  }

  if (row.signal_key === "accessibility.accessibility_risk_score" && typeof row.signal_value_json === "number") {
    return "Elevated accessibility risk score";
  }

  return row.signal_label;
}

function buildGenericValidationFinding(row: ScanSignalRow): ValidationFindingDefinition {
  const title = getGenericValidationFindingTitle(row);
  return {
    buildEvidence: () =>
      buildDefaultEvidencePacket(
        row,
        `${title} was elevated during the scan and merits reviewer attention.`
      ),
    category: mapScanSignalCategoryToFindingCategory(row),
    description: `${title} was elevated during the scan and merits reviewer attention.`,
    ruleKey: `scan_signal.${row.signal_key}`,
    severity: getGenericValidationFindingSeverity(row),
    subtype: "scan_signal_review",
    title
  } satisfies ValidationFindingDefinition;
}

function getValidationFindingDefinitionForSignal(row: ScanSignalRow) {
  return (
    VALIDATION_SIGNAL_FINDING_DEFINITIONS[row.signal_key as keyof typeof VALIDATION_SIGNAL_FINDING_DEFINITIONS] ??
    (isGenericValidationConcernSignal(row) ? buildGenericValidationFinding(row) : null)
  );
}

export function buildValidationEvidencePacketForSignal(row: ScanSignalRow, context: ValidationEvidenceBuildContext) {
  const definition = getValidationFindingDefinitionForSignal(row);
  if (!definition) {
    return null;
  }

  return definition.buildEvidence ? definition.buildEvidence(row, context) : buildDefaultEvidencePacket(row, definition.description);
}

function buildDefaultEvidencePacket(
  row: ScanSignalRow,
  claim: string,
  options?: {
    augmenters?: ValidationEvidenceAugmenter[];
    context?: ValidationEvidenceBuildContext;
    missingEvidence?: string[];
    reviewPolicy?: ValidationEvidenceAugmentation["reviewPolicy"];
  }
): ValidationEvidencePacket {
  const basePacket: ValidationEvidencePacket = {
    claim,
    confidenceBasis: ["Automated detector fired for this signal."],
    missingEvidence: options?.missingEvidence ?? ["No rule-specific evidence builder has been configured yet."],
    pageUrls: [],
    policyEvidence: [],
    reviewPolicy: {
      claimType: "behavior_without_disclosure",
      contraryEvidenceTypes: ["contrary_runtime_evidence", "contrary_policy_disclosure"],
      detectorStrength: "medium",
      gapTolerance: "medium",
      requiredSupportTypes: ["detector_signal"],
      rubric: {
        inconclusiveIf: [
          "The detector is weak or ambiguous.",
          "Important coverage gaps make the claim uncertain."
        ],
        notSupportedIf: [
          "There is clear contrary evidence that the claim is false."
        ],
        supportedIf: [
          "The detector fired and supporting evidence exists with no meaningful contrary evidence."
        ]
      }
    },
    runtimeEvidence: [],
    supportingSignals: [
      toSupportingSignal(row)
    ]
  };

  const packetWithReviewPolicy = options?.reviewPolicy
    ? applyEvidenceAugmentation(basePacket, { reviewPolicy: options.reviewPolicy })
    : basePacket;

  return composeEvidencePacket({
    augmenters: options?.augmenters,
    basePacket: packetWithReviewPolicy,
    context: options?.context,
    row
  });
}

function augmentWithKeyPageCoverageContext(pageType: ScanPage["pageType"]): ValidationEvidenceAugmenter {
  return ({ context, row }) => {
    const summary = getKeyPageDiscoverySummaryForPageType(context, pageType);
    if (!summary) {
      return null;
    }

    const attemptedUrls = summary.attemptedUrls ?? [];
    const attemptCount = summary.attemptCount ?? (attemptedUrls.length > 0 ? attemptedUrls.length : null);
    const discoverySource = summary.bestDiscoverySource ?? null;
    const discoverySourceText = describeKeyPageDiscoverySource(discoverySource);
    const guessedOnly = summary.guessedOnly === true;
    const stopReasonText = describeKeyPageStopReason(summary.stopReason ?? null);
    const hasCoverageContext =
      attemptCount !== null || attemptedUrls.length > 0 || discoverySource !== null || summary.stopReason !== null;

    if (!hasCoverageContext) {
      return null;
    }

    return {
      confidenceBasis: [
        attemptCount
          ? `Bounded discovery evaluated ${attemptCount} candidate URL${attemptCount === 1 ? "" : "s"} while looking for this disclosure surface.`
          : "Bounded discovery context was retained while looking for this disclosure surface.",
        discoverySourceText && !guessedOnly
          ? `The retained discovery context shows those candidate locations came from ${discoverySourceText}.`
          : attemptedUrls.length > 0
            ? "The retained discovery context includes specific candidate URLs considered during the scan."
            : null,
        guessedOnly ? "Discovery relied on guessed candidate paths rather than confirmed site links." : null,
        stopReasonText
      ].filter((value): value is string => typeof value === "string" && value.length > 0),
      keyPageAttemptCount: attemptCount,
      keyPageAttemptedUrls: attemptedUrls,
      keyPageDiscoverySource: discoverySource,
      keyPageGuessedOnly: guessedOnly,
      keyPageStopReason: summary.stopReason ?? null,
      pageUrls: attemptedUrls,
      reviewPolicy: {
        detectorStrength: guessedOnly ? "weak" : discoverySourceText && !guessedOnly ? "strong" : "medium",
        requiredSupportTypes: ["key_page_coverage_context"],
        rubric: {
          inconclusiveIf: [
            "The bounded discovery context is too thin to show how thoroughly the surface was searched.",
            ...(guessedOnly ? ["Discovery relied on guessed paths rather than confirmed site links."] : [])
          ],
          supportedIf: [
            "Retained key-page discovery context shows the scan searched for the disclosure surface and did not confirm it."
          ]
        }
      },
      supportingSignals: [
        ...(attemptCount
          ? [
              {
                category: row.category,
                key: `${row.signal_key}.attempt_count`,
                label: "Key-page discovery attempt count",
                value: attemptCount
              } satisfies ValidationEvidencePacket["supportingSignals"][number]
            ]
          : []),
        ...(discoverySource
          ? [
              {
                category: row.category,
                key: `${row.signal_key}.discovery_source`,
                label: "Key-page discovery source",
                value: discoverySource
              } satisfies ValidationEvidencePacket["supportingSignals"][number]
            ]
          : [])
      ]
    };
  };
}

function augmentWithCookieRuntimeCorroboration(): ValidationEvidenceAugmenter {
  return ({ context }) => {
    const trackerSignals = [
      context.scanSignalsByKey.get("privacy.third_party_cookie_count"),
      context.scanSignalsByKey.get("privacy.tracker_vendors"),
      context.scanSignalsByKey.get("privacy.preconsent_tracking_detected"),
      context.scanSignalsByKey.get("privacy.preconsent_tracker_vendors")
    ].filter((signal): signal is ScanSignalRow => Boolean(signal));

    const thirdPartyCookieCount =
      typeof context.scanSignalsByKey.get("privacy.third_party_cookie_count")?.signal_value_json === "number"
        ? (context.scanSignalsByKey.get("privacy.third_party_cookie_count")?.signal_value_json as number)
        : null;
    const trackerVendors = trackerSignals.flatMap((signal) =>
      Array.isArray(signal.signal_value_json)
        ? signal.signal_value_json.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        : []
    );
    const runtimeDomains = uniqueStrings([
      ...(context.runtimeArtifacts?.third_party_request_domains ?? []),
      ...(context.runtimeArtifacts?.script_src_domains ?? [])
    ]).slice(0, 5);
    const preconsentTrackingDetected = context.scanSignalsByKey.get("privacy.preconsent_tracking_detected")?.signal_value_json === true;

    if (
      trackerSignals.length === 0 &&
      runtimeDomains.length === 0 &&
      thirdPartyCookieCount === null &&
      !preconsentTrackingDetected
    ) {
      return null;
    }

    return {
      confidenceBasis: [
        typeof thirdPartyCookieCount === "number" && thirdPartyCookieCount > 0
          ? `Separate runtime signals observed ${thirdPartyCookieCount} third-party cookie${thirdPartyCookieCount === 1 ? "" : "s"} during the scan.`
          : null,
        trackerVendors.length > 0
          ? `Tracker or vendor evidence was also present elsewhere in the scan, including ${trackerVendors.slice(0, 4).join(", ")}.`
          : null,
        preconsentTrackingDetected ? "A separate pre-consent tracking detector also fired during the scan." : null
      ].filter((value): value is string => typeof value === "string" && value.length > 0),
      runtimeEvidence: runtimeDomains.map((domain) => `observed runtime domain: ${domain}`),
      supportingSignals: trackerSignals.map((signal) => toSupportingSignal(signal))
    };
  };
}

function augmentWithConsentControlSnapshotContext(): ValidationEvidenceAugmenter {
  return ({ context }) => {
    const snapshot = context.snapshot;
    if (!snapshot || !snapshot.cookie_banner_present) {
      return null;
    }

    const rejectMissing = !snapshot.reject_all_present || snapshot.dark_pattern_reject_button_missing;
    if (!rejectMissing) {
      return null;
    }

    const hasWithdrawalSignal = typeof snapshot.consent_withdrawal_mechanism_present === "boolean";

    return {
      confidenceBasis: [
        "Snapshot signals recorded a visible consent surface.",
        snapshot.dark_pattern_reject_button_missing
          ? "The snapshot explicitly flagged a missing reject control."
          : "The snapshot did not record a reject-all control on the detected banner.",
        hasWithdrawalSignal
          ? snapshot.consent_withdrawal_mechanism_present
            ? "A withdrawal mechanism was present elsewhere in the experience, but the initial reject control still appeared incomplete."
            : "The snapshot did not record a separate withdrawal mechanism."
          : null
      ].filter((value): value is string => typeof value === "string" && value.length > 0),
      reviewPolicy: {
        detectorStrength: "strong",
        requiredSupportTypes: ["consent_snapshot_context"],
        rubric: {
          inconclusiveIf: [
            "The snapshot context does not clearly show whether a reject control was present on the initial consent surface."
          ],
          supportedIf: [
            "Snapshot evidence shows a consent surface with no clear reject-all control or a missing reject button."
          ]
        }
      },
      supportingSignals: [
        {
          category: "privacy",
          key: "privacy.cookie_banner_present",
          label: "Cookie banner present",
          value: snapshot.cookie_banner_present
        },
        {
          category: "privacy",
          key: "privacy.reject_all_present",
          label: "Reject all present",
          value: snapshot.reject_all_present
        },
        {
          category: "privacy",
          key: "privacy.dark_pattern_reject_button_missing",
          label: "Reject button missing",
          value: snapshot.dark_pattern_reject_button_missing
        },
        ...(hasWithdrawalSignal
          ? [
              {
                category: "privacy",
                key: "privacy.consent_withdrawal_mechanism_present",
                label: "Consent withdrawal mechanism present",
                value: snapshot.consent_withdrawal_mechanism_present
              } satisfies ValidationEvidencePacket["supportingSignals"][number]
            ]
          : [])
      ]
    };
  };
}

function augmentWithPrivacyPolicyCoverageSnapshotContext(): ValidationEvidenceAugmenter {
  return ({ context }) => {
    const snapshot = context.snapshot;
    if (!snapshot || !snapshot.privacy_policy_present) {
      return null;
    }

    const wordCount = snapshot.privacy_policy_word_count;
    const legalCoverageScore = snapshot.legal_coverage_score;
    const lowWordCount = typeof wordCount === "number" && wordCount > 0 && wordCount < 250;
    const lowCoverageScore = typeof legalCoverageScore === "number" && legalCoverageScore > 0 && legalCoverageScore < 70;

    if (!lowWordCount && !lowCoverageScore) {
      return null;
    }

    return {
      confidenceBasis: [
        "Snapshot signals confirmed that a privacy policy surface was present.",
        lowWordCount
          ? `The retained snapshot estimated only ${wordCount} word${wordCount === 1 ? "" : "s"} on the privacy policy.`
          : null,
        lowCoverageScore
          ? `The retained legal coverage score was ${legalCoverageScore}, below the current completeness threshold.`
          : null
      ].filter((value): value is string => typeof value === "string" && value.length > 0),
      reviewPolicy: {
        detectorStrength: lowWordCount && lowCoverageScore ? "strong" : "medium",
        requiredSupportTypes: ["policy_coverage_snapshot_context"],
        rubric: {
          inconclusiveIf: [
            "The snapshot context does not include enough policy-size or policy-coverage detail to judge completeness."
          ],
          supportedIf: [
            "Snapshot evidence shows the privacy policy was present but materially thin or weak on coverage metrics."
          ]
        }
      },
      supportingSignals: [
        {
          category: "disclosure",
          key: "disclosure.privacy_policy_present",
          label: "Privacy policy present",
          value: snapshot.privacy_policy_present
        },
        ...(typeof legalCoverageScore === "number"
          ? [
              {
                category: "context",
                key: "context.legal_coverage_score",
                label: "Legal coverage score",
                value: legalCoverageScore
              } satisfies ValidationEvidencePacket["supportingSignals"][number]
            ]
          : []),
        ...(typeof wordCount === "number"
          ? [
              {
                category: "disclosure",
                key: "disclosure.privacy_policy_word_count",
                label: "Privacy policy word count",
                value: wordCount
              } satisfies ValidationEvidencePacket["supportingSignals"][number]
            ]
          : [])
      ]
    };
  };
}

function buildKeyPageFetchFailureEvidence(
  row: ScanSignalRow,
  context: ValidationEvidenceBuildContext,
  claim: string
): ValidationEvidencePacket {
  const summary = getKeyPageDiscoverySummaryForSignal(context, row.signal_key);
  const attemptedUrlsFromSignal = Array.isArray(row.signal_value_json)
    ? row.signal_value_json.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
  const attemptedUrls = attemptedUrlsFromSignal.length > 0 ? attemptedUrlsFromSignal : (summary?.attemptedUrls ?? []);
  const attemptCount = summary?.attemptCount ?? (attemptedUrls.length > 0 ? attemptedUrls.length : null);
  const discoverySource = summary?.bestDiscoverySource ?? null;
  const discoverySourceText = describeKeyPageDiscoverySource(discoverySource);
  const guessedOnly = summary?.guessedOnly === true;
  const stopReason = summary?.stopReason ?? null;
  const stopReasonText = describeKeyPageStopReason(stopReason);

  return {
    claim,
    confidenceBasis: [
      attemptCount
        ? `The scan attempted to fetch ${attemptCount} candidate URL${attemptCount === 1 ? "" : "s"} for this disclosure and none returned retrievable content.`
        : "The scan attempted to fetch candidate disclosure URLs and none returned retrievable content.",
      discoverySourceText && !guessedOnly
        ? `Those targets were discovered via ${discoverySourceText} rather than guessed slugs.`
        : attemptedUrls.length > 0
          ? "The retained evidence includes specific candidate URLs that were attempted during the bounded fetch."
          : null,
      guessedOnly ? "The attempted targets came from guessed candidate paths rather than confirmed site links." : null,
      stopReasonText
    ].filter((value): value is string => typeof value === "string" && value.length > 0),
    keyPageAttemptCount: attemptCount,
    keyPageAttemptedUrls: attemptedUrls,
    keyPageDiscoverySource: discoverySource,
    keyPageGuessedOnly: guessedOnly,
    keyPageStopReason: stopReason,
    missingEvidence: ["The disclosure could still exist at an untested, localized, or consolidated URL outside the bounded fetch."],
    pageUrls: attemptedUrls,
    policyEvidence: [],
    reviewPolicy: {
      claimType: "behavior_without_disclosure",
      contraryEvidenceTypes: ["contrary_runtime_evidence", "contrary_policy_disclosure"],
      detectorStrength: guessedOnly ? "weak" : discoverySourceText && !guessedOnly ? "strong" : "medium",
      gapTolerance: "medium",
      requiredSupportTypes: ["detector_signal", "bounded_fetch_failure_evidence"],
      rubric: {
        inconclusiveIf: [
          "The page could exist at an untested or localized URL outside the bounded discovery scope.",
          "Coverage gaps or route variation leave the page location uncertain."
        ],
        notSupportedIf: [
          "The disclosure is retrievable at a confirmed site URL.",
          "The failed candidate URLs are unrelated to the expected disclosure."
        ],
        supportedIf: [
          "Specific candidate URLs were attempted during the bounded fetch and did not return retrievable content.",
          "The scan retained discovery provenance showing how those candidate URLs were found."
        ]
      }
    },
    runtimeEvidence: [],
    supportingSignals: [
      {
        category: row.category,
        key: row.signal_key,
        label: row.signal_label,
        value: row.signal_value_json
      },
      ...(attemptCount
        ? [{
            category: row.category,
            key: `${row.signal_key}.attempt_count`,
            label: "Bounded fetch attempt count",
            value: attemptCount
          } satisfies ValidationEvidencePacket["supportingSignals"][number]]
        : []),
      ...(discoverySource
        ? [{
            category: row.category,
            key: `${row.signal_key}.discovery_source`,
            label: "Discovery source",
            value: discoverySource
          } satisfies ValidationEvidencePacket["supportingSignals"][number]]
        : [])
    ]
  };
}

function normalizePolicyPageTypeLabel(pageType: string | null) {
  switch (pageType) {
    case "privacy_policy":
      return "Privacy Policy";
    case "terms_of_service":
      return "TOS";
    case "cookie_policy":
      return "Cookie Policy";
    default:
      return "Policy";
  }
}

function buildPolicyReviewDescription(reason: string) {
  switch (reason) {
    case "policy_behavior_conflict_candidate":
      return "Observed site behavior may conflict with the site’s public-facing policy language.";
    case "session_replay_without_disclosure_detected":
      return "Session replay behavior may be present without a clear matching disclosure in the scanned policy pages.";
    case "missing_dsar_high_exposure":
      return "The site may have elevated exposure while still lacking a clear DSAR path in policy disclosures.";
    case "low_confidence_critical_fields":
      return "Critical policy extraction fields were low confidence and need manual review in the scan report.";
    default:
      return `This issue was added to the scan report review queue under ${reason.replaceAll("_", " ")}.`;
  }
}

function buildPolicyReviewEvidencePayload(input: {
  policyEnrichmentId: string | null;
  enrichment?: PolicyEnrichmentLookupRow;
  reason: string;
  reviewStatus: string | null;
}): ValidationEvidencePolicyReviewPayload {
  const summary = input.enrichment?.policy_summary_short?.trim() ?? null;
  const pageUrl = input.enrichment?.page_url ?? null;
  const pageType = input.enrichment?.page_type ?? null;
  const policyCoverageRatio = input.enrichment?.policy_coverage_ratio ?? null;
  const policySemanticConfidence = input.enrichment?.policy_semantic_confidence ?? null;
  const policyAmbiguityScore = input.enrichment?.policy_ambiguity_score ?? null;
  const policySnippetCount = input.enrichment?.policy_snippet_count ?? null;
  const policyStructurallyWeak = input.enrichment?.policy_structurally_weak ?? null;

  const confidenceBasis = [
    input.reason === "policy_behavior_conflict_candidate"
      ? "Policy review logic flagged a possible mismatch between public-facing policy language and observed site behavior."
      : input.reason === "low_confidence_critical_fields"
        ? "Policy extraction retained low-confidence critical fields that need manual review."
        : buildPolicyReviewDescription(input.reason),
    summary ? `Retained policy summary: ${summary}` : null,
    typeof policyCoverageRatio === "number"
      ? `Policy coverage ratio: ${Math.round(policyCoverageRatio * 100)}%.`
      : null,
    typeof policySemanticConfidence === "number"
      ? `Policy semantic confidence: ${policySemanticConfidence.toFixed(2)}.`
      : null,
    typeof policyAmbiguityScore === "number"
      ? `Policy ambiguity score: ${policyAmbiguityScore.toFixed(2)}.`
      : null,
    typeof policySnippetCount === "number"
      ? `Policy snippet count retained: ${policySnippetCount}.`
      : null,
    policyStructurallyWeak === true ? "The policy surface also showed structural weakness signals." : null
  ].filter((value): value is string => typeof value === "string" && value.length > 0);

  const missingEvidence = [
    input.reason === "policy_behavior_conflict_candidate"
      ? "Concrete runtime evidence or direct policy excerpts proving the specific conflict on a live page."
      : null,
    input.reason === "low_confidence_critical_fields"
      ? "Higher-confidence extraction or direct excerpts for the affected policy fields."
      : null,
    input.reason === "session_replay_without_disclosure_detected"
      ? "Direct runtime page evidence showing the replay behavior that lacks matching disclosure."
      : null,
    input.reason === "missing_dsar_high_exposure"
      ? "Direct disclosure excerpts confirming whether a DSAR path is actually present."
      : null
  ].filter((value): value is string => typeof value === "string" && value.length > 0);

  return {
    claim:
      input.reason === "policy_behavior_conflict_candidate"
        ? "Observed site behavior may conflict with the site’s public-facing policy language."
        : buildPolicyReviewDescription(input.reason),
    confidenceBasis,
    missingEvidence,
    pageUrls: pageUrl ? [pageUrl] : [],
    policyEvidence: summary ? [summary] : [],
    reviewPolicy: {
      claimType: "behavior_without_disclosure",
      contraryEvidenceTypes: ["contrary_runtime_evidence", "contrary_policy_disclosure"],
      detectorStrength:
        input.reason === "policy_behavior_conflict_candidate" &&
        typeof policySemanticConfidence === "number" &&
        policySemanticConfidence >= 0.7
          ? "strong"
          : "medium",
      gapTolerance: "medium",
      requiredSupportTypes: ["policy_review_queue_context", ...(summary ? ["policy_summary"] : [])],
      rubric: {
        inconclusiveIf: [
          "The retained policy summary is too thin to show the exact conflicting claim.",
          "Runtime evidence of the suspected conflicting behavior is missing or ambiguous."
        ],
        notSupportedIf: [
          "Direct policy excerpts and runtime evidence show no actual mismatch."
        ],
        supportedIf: [
          "Policy review queue context flagged the issue.",
          "Retained policy context is specific enough to understand what needs review."
        ]
      }
    },
    runtimeEvidence: [],
    supportingSignals: [],
    pageType,
    pageUrl,
    policyEnrichmentId: input.policyEnrichmentId,
    policyAmbiguityScore,
    policyArbitrationPresent: input.enrichment?.policy_arbitration_present ?? null,
    policyCancellationOrRefundPresent: input.enrichment?.policy_cancellation_or_refund_present ?? null,
    policyCoverageRatio,
    policyEffectiveDate: input.enrichment?.policy_effective_date ?? null,
    policyFieldCoverage: input.enrichment?.policy_field_coverage ?? {},
    policyGoverningLaw: input.enrichment?.policy_governing_law ?? null,
    policyNoticeContactPresent: input.enrichment?.policy_notice_contact_present ?? null,
    reviewQueueReason: input.reason,
    reviewStatus: input.reviewStatus,
    policySemanticConfidence,
    policySnippetCount,
    policyStructurallyWeak,
    policySummaryShort: summary,
    policyTerminationOrSuspensionPresent: input.enrichment?.policy_termination_or_suspension_present ?? null
  };
}

function buildAccessibilityRiskSnapshotEvidence(score: number): ValidationEvidencePacket & {
  snapshotField: string;
  value: number;
} {
  return {
    claim: "Scanner-derived accessibility risk indicators were elevated and warrant manual accessibility review.",
    confidenceBasis: [
      `Accessibility risk score: ${score}.`,
      "This score helps prioritize review, but automated accessibility testing does not determine full conformance on its own."
    ],
    missingEvidence: [
      "Affected page URLs or representative rule examples for the highest-priority accessibility barriers."
    ],
    pageUrls: [],
    policyEvidence: [],
    reviewPolicy: {
      claimType: "automated_accessibility",
      contraryEvidenceTypes: ["scan_coverage_too_thin", "score_not_supported_by_rule_output"],
      detectorStrength: "medium",
      gapTolerance: "high",
      requiredSupportTypes: ["summary_risk_score"],
      rubric: {
        inconclusiveIf: [
          "The score is present but no representative page or rule evidence is retained."
        ],
        notSupportedIf: [
          "The retained automated rule output does not support the score."
        ],
        supportedIf: [
          "The score is elevated and used as a prioritization signal for manual accessibility review."
        ]
      }
    },
    runtimeEvidence: [],
    supportingSignals: [
      {
        category: "accessibility",
        key: "accessibility.accessibility_risk_score",
        label: "Accessibility risk score",
        value: score
      }
    ],
    snapshotField: "accessibility_litigation_risk_score",
    value: score
  };
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => (typeof value === "string" ? value.trim() : "")).filter(Boolean))];
}

function getRelevantAccessibilityExamples(
  context: ValidationEvidenceBuildContext,
  row: ScanSignalRow
) {
  const examples = context.accessibilityRuleExamples;
  if (examples.length === 0) {
    return [] as ScanAccessibilityRuleExampleRow[];
  }

  const groupFilters: string[] = [];
  if (row.signal_key === "accessibility.wcag_aria_error_count") {
    groupFilters.push("aria");
  }
  if (row.signal_key === "accessibility.wcag_focus_indicator_issue_count") {
    groupFilters.push("focus");
  }
  if (row.signal_key === "accessibility.wcag_keyboard_navigation_issue_count") {
    groupFilters.push("keyboard");
  }
  if (row.signal_key === "accessibility.wcag_link_name_error_count") {
    groupFilters.push("link-name");
  }
  if (row.signal_key === "accessibility.wcag_form_label_error_count") {
    groupFilters.push("label", "form");
  }
  if (row.signal_key === "accessibility.wcag_landmark_issue_count") {
    groupFilters.push("landmark");
  }
  if (row.signal_key === "accessibility.wcag_contrast_failures_count") {
    groupFilters.push("contrast", "color-contrast");
  }

  const filtered =
    groupFilters.length === 0
      ? examples
      : examples.filter((example) =>
          groupFilters.some((filter) => example.rule_group.toLowerCase().includes(filter))
        );

  return filtered.slice(0, 5);
}

function buildSessionReplayEvidence(row: ScanSignalRow, context: ValidationEvidenceBuildContext): ValidationEvidencePacket {
  const trackerSignals = [
    context.scanSignalsByKey.get("privacy.tracker_vendors"),
    context.scanSignalsByKey.get("commerce.session_replay_tool_detected"),
    context.scanSignalsByKey.get("privacy.session_replay_runtime_detected"),
    context.scanSignalsByKey.get("privacy.session_replay_runtime_vendors"),
    context.scanSignalsByKey.get("disclosure.session_replay_disclosure_present"),
    context.scanSignalsByKey.get("disclosure.session_replay_disclosure_pages")
  ].filter(Boolean) as ScanSignalRow[];
  const vendors = Array.isArray(context.scanSignalsByKey.get("privacy.tracker_vendors")?.signal_value_json)
    ? (context.scanSignalsByKey.get("privacy.tracker_vendors")?.signal_value_json as string[])
    : [];
  const runtimeReplayVendors = Array.isArray(context.scanSignalsByKey.get("privacy.session_replay_runtime_vendors")?.signal_value_json)
    ? (context.scanSignalsByKey.get("privacy.session_replay_runtime_vendors")?.signal_value_json as string[])
    : [];
  const likelyReplayVendors = uniqueStrings([
    ...vendors.filter((vendor) => /fullstory|session|replay/i.test(vendor)),
    ...runtimeReplayVendors
  ]);
  const requestDomains = context.runtimeArtifacts?.third_party_request_domains ?? [];
  const scriptDomains = context.runtimeArtifacts?.script_src_domains ?? [];
  const disclosurePages = Array.isArray(context.scanSignalsByKey.get("disclosure.session_replay_disclosure_pages")?.signal_value_json)
    ? (context.scanSignalsByKey.get("disclosure.session_replay_disclosure_pages")?.signal_value_json as string[])
    : [];
  const disclosurePresent = context.scanSignalsByKey.get("disclosure.session_replay_disclosure_present")?.signal_value_json === true;

  return {
    claim: "Session replay behavior appears present without a corresponding disclosure on the site.",
    confidenceBasis: [
      "A context-level detector flagged session replay without disclosure.",
      likelyReplayVendors.length > 0 ? `Likely replay vendors detected: ${likelyReplayVendors.join(", ")}.` : "Replay vendor names were not isolated with high confidence.",
      disclosurePresent
        ? "A separate disclosure-presence signal also exists, so the wording and scope of that disclosure should be checked manually."
        : disclosurePages.length > 0
          ? `Possible session-replay disclosure mentions were retained on ${disclosurePages.length} page${disclosurePages.length === 1 ? "" : "s"}.`
          : "No dedicated session-replay disclosure pages were retained with this packet."
    ],
    missingEvidence: [
      "Direct disclosure excerpt or explicit no-disclosure policy excerpt.",
      "Page-level evidence URL showing the replay script on a specific page."
    ],
    pageUrls: [],
    policyEvidence: disclosurePages,
    reviewPolicy: {
      claimType: "behavior_without_disclosure",
      contraryEvidenceTypes: ["explicit_session_replay_disclosure", "evidence_detector_is_misfiring"],
      detectorStrength: likelyReplayVendors.length > 0 ? "strong" : "medium",
      gapTolerance: "medium",
      requiredSupportTypes: [
        "derived_mismatch_detector",
        ...(likelyReplayVendors.length > 0 ? ["vendor_evidence"] : []),
        ...(disclosurePages.length > 0 || disclosurePresent ? ["disclosure_context"] : [])
      ],
      rubric: {
        inconclusiveIf: [
          "Replay vendor evidence is weak or ambiguous.",
          "Disclosure search coverage is materially incomplete.",
          "The detector fired but the supporting evidence is internally inconsistent."
        ],
        notSupportedIf: [
          "There is explicit disclosure covering session replay behavior.",
          "There is convincing evidence that the detected vendor is not a session replay tool."
        ],
        supportedIf: [
          "A positive mismatch detector is present.",
          "Replay vendor evidence exists.",
          "There is no meaningful contrary disclosure evidence."
        ]
      }
    },
    runtimeEvidence: uniqueStrings([
      ...requestDomains.filter((domain) => /fullstory|replay/i.test(domain)),
      ...scriptDomains.filter((domain) => /fullstory|replay/i.test(domain))
    ]),
    supportingSignals: [
      toSupportingSignal(row),
      ...trackerSignals.map((signal) => toSupportingSignal(signal))
    ]
  };
}

function buildPolicyBehaviorConflictEvidence(row: ScanSignalRow, context: ValidationEvidenceBuildContext): ValidationEvidencePacket {
  const relatedSignals = [
    context.scanSignalsByKey.get("context.policy_terms_conflict_detected"),
    context.scanSignalsByKey.get("context.privacy_cookie_policy_conflict_detected"),
    context.scanSignalsByKey.get("context.session_replay_without_disclosure_detected"),
    context.scanSignalsByKey.get("privacy.cookie_runtime_disclosure_gap_detected"),
    context.scanSignalsByKey.get("privacy.policy_runtime_functional_misalignment_detected")
  ].filter(Boolean) as ScanSignalRow[];

  const conflictLabels = relatedSignals.map((signal) => signal.signal_label).slice(0, 3);

  return {
    claim: "Observed site behavior may conflict with the site’s public-facing policy language.",
    confidenceBasis: [
      "A policy-versus-behavior conflict detector fired during the scan.",
      conflictLabels.length > 0
        ? `Related contradiction signals also surfaced: ${conflictLabels.join(", ")}.`
        : "No narrower contradiction sibling was retained with this packet."
    ],
    missingEvidence: [
      "Direct policy excerpts and page-level runtime evidence showing the exact mismatch."
    ],
    pageUrls: [],
    policyEvidence: [],
    reviewPolicy: {
      claimType: "behavior_without_disclosure",
      contraryEvidenceTypes: ["contrary_runtime_evidence", "contrary_policy_disclosure"],
      detectorStrength: relatedSignals.length > 0 ? "strong" : "medium",
      gapTolerance: "medium",
      requiredSupportTypes: ["detector_signal", ...(relatedSignals.length > 0 ? ["related_conflict_signals"] : [])],
      rubric: {
        inconclusiveIf: [
          "The detector fired, but the exact conflicting policy statement is not yet retained.",
          "Runtime evidence of the suspected mismatch remains incomplete."
        ],
        notSupportedIf: [
          "Direct policy excerpts and runtime evidence show no meaningful contradiction."
        ],
        supportedIf: [
          "The detector fired and related contradiction signals support the concern.",
          "There is no meaningful contrary evidence showing the behavior aligns with the public policy language."
        ]
      }
    },
    runtimeEvidence: [],
    supportingSignals: [
      toSupportingSignal(row),
      ...relatedSignals.map((signal) => toSupportingSignal(signal))
    ]
  };
}

function buildCookieDisclosureGapEvidence(row: ScanSignalRow, context: ValidationEvidenceBuildContext): ValidationEvidencePacket {
  const relatedSignals = [
    context.scanSignalsByKey.get("privacy.third_party_cookie_count"),
    context.scanSignalsByKey.get("privacy.tracker_vendors"),
    context.scanSignalsByKey.get("disclosure.cookie_policy_surface_missing"),
    context.scanSignalsByKey.get("disclosure.cookie_policy_fetch_failed"),
    context.scanSignalsByKey.get("disclosure.cookie_policy_structurally_obstructed")
  ].filter(Boolean) as ScanSignalRow[];

  const trackerVendors = Array.isArray(context.scanSignalsByKey.get("privacy.tracker_vendors")?.signal_value_json)
    ? (context.scanSignalsByKey.get("privacy.tracker_vendors")?.signal_value_json as string[])
    : [];
  const thirdPartyCookieCount =
    typeof context.scanSignalsByKey.get("privacy.third_party_cookie_count")?.signal_value_json === "number"
      ? (context.scanSignalsByKey.get("privacy.third_party_cookie_count")?.signal_value_json as number)
      : null;
  const runtimeDomains = uniqueStrings([
    ...(context.runtimeArtifacts?.third_party_request_domains ?? []),
    ...(context.runtimeArtifacts?.script_src_domains ?? [])
  ]).slice(0, 5);
  const cookiePolicyState = relatedSignals
    .filter((signal) => /cookie_policy_(surface_missing|fetch_failed|structurally_obstructed)/i.test(signal.signal_key))
    .map((signal) => signal.signal_label)
    .slice(0, 2);
  const cookiePolicySummary = getKeyPageDiscoverySummaryForPageType(context, "cookie_policy");

  return {
    claim: "Observed cookie or tracker activity may not be fully reflected in the current cookie disclosure surface.",
    confidenceBasis: [
      "A cookie runtime-versus-disclosure gap detector fired during the scan.",
      typeof thirdPartyCookieCount === "number"
        ? `Separate scan signals observed ${thirdPartyCookieCount} third-party cookie${thirdPartyCookieCount === 1 ? "" : "s"}.`
        : "Separate third-party cookie count evidence was not retained.",
      trackerVendors.length > 0
        ? `Tracker or vendor evidence included ${trackerVendors.slice(0, 4).join(", ")}.`
        : "Specific tracker vendors were not isolated in this packet.",
      cookiePolicyState.length > 0
        ? `The cookie disclosure surface also showed related issues: ${cookiePolicyState.join(", ")}.`
        : null
    ].filter((value): value is string => typeof value === "string" && value.length > 0),
    missingEvidence: [
      "A direct mapping between the observed cookies or vendors and the site’s named cookie disclosures.",
      ...(cookiePolicySummary?.guessedOnly ? ["Confirmed cookie policy page retrieval rather than guessed-path discovery context."] : [])
    ],
    keyPageAttemptCount: cookiePolicySummary?.attemptCount ?? null,
    keyPageAttemptedUrls: cookiePolicySummary?.attemptedUrls ?? [],
    keyPageDiscoverySource: cookiePolicySummary?.bestDiscoverySource ?? null,
    keyPageGuessedOnly: cookiePolicySummary?.guessedOnly ?? null,
    keyPageStopReason: cookiePolicySummary?.stopReason ?? null,
    pageUrls: cookiePolicySummary?.attemptedUrls ?? [],
    policyEvidence: [],
    reviewPolicy: {
      claimType: "behavior_without_disclosure",
      contraryEvidenceTypes: ["complete_cookie_disclosure", "observed_activity_not_tracking_related"],
      detectorStrength: trackerVendors.length > 0 || runtimeDomains.length > 0 ? "strong" : "medium",
      gapTolerance: "medium",
      requiredSupportTypes: [
        "detector_signal",
        ...(typeof thirdPartyCookieCount === "number" && thirdPartyCookieCount > 0 ? ["cookie_count_evidence"] : []),
        ...(trackerVendors.length > 0 ? ["tracker_vendor_evidence"] : [])
      ],
      rubric: {
        inconclusiveIf: [
          "The detector fired but the specific mismatch between runtime activity and disclosure text is not yet retained.",
          "Cookie policy discovery remains too weak to confirm whether the disclosure surface was fully reviewed."
        ],
        notSupportedIf: [
          "The current cookie disclosures clearly name the observed cookies, vendors, and purposes.",
          "The observed runtime activity is not reasonably cookie or tracker related."
        ],
        supportedIf: [
          "A cookie disclosure-gap detector fired.",
          "Separate cookie, vendor, or runtime evidence supports the presence of undisclosed cookie activity."
        ]
      }
    },
    runtimeEvidence: runtimeDomains.map((domain) => `observed runtime domain: ${domain}`),
    supportingSignals: [
      toSupportingSignal(row),
      ...relatedSignals.map((signal) => toSupportingSignal(signal))
    ]
  };
}

function buildPreconsentTrackingEvidence(row: ScanSignalRow, context: ValidationEvidenceBuildContext): ValidationEvidencePacket {
  const trackingDetectedSignal = context.scanSignalsByKey.get("privacy.preconsent_tracking_detected");
  const violationCountSignal = context.scanSignalsByKey.get("privacy.preconsent_violation_count");
  const trackerVendorsSignal = context.scanSignalsByKey.get("privacy.preconsent_tracker_vendors");
  const evidenceUrlsSignal = context.scanSignalsByKey.get("privacy.preconsent_tracker_evidence_urls");
  const thirdPartyCookieCountSignal = context.scanSignalsByKey.get("privacy.third_party_cookie_count");

  const evidenceUrls = Array.isArray(evidenceUrlsSignal?.signal_value_json)
    ? (evidenceUrlsSignal.signal_value_json as string[])
    : [];
  const trackerVendors = Array.isArray(trackerVendorsSignal?.signal_value_json)
    ? (trackerVendorsSignal.signal_value_json as string[])
    : [];
  const violationCount = violationCountSignal?.signal_value_json;
  const evidenceSummary = summarizePreconsentEvidenceUrls(evidenceUrls, trackerVendors);
  const observedVendors = evidenceSummary.vendorsObserved;
  const supportingSignals = [
    trackingDetectedSignal
      ? {
          category: trackingDetectedSignal.category,
          key: trackingDetectedSignal.signal_key,
          label: trackingDetectedSignal.signal_label,
          value: trackingDetectedSignal.signal_value_json
        }
      : null,
    violationCountSignal
      ? {
          category: violationCountSignal.category,
          key: violationCountSignal.signal_key,
          label: violationCountSignal.signal_label,
          value: violationCountSignal.signal_value_json
        }
      : null,
    {
      category: evidenceUrlsSignal?.category ?? "privacy",
      key: "privacy.preconsent_tracker_evidence_urls",
      label: "Pre-consent tracker evidence summary",
      value: evidenceSummary
    },
    thirdPartyCookieCountSignal
      ? {
          category: thirdPartyCookieCountSignal.category,
          key: thirdPartyCookieCountSignal.signal_key,
          label: thirdPartyCookieCountSignal.signal_label,
          value: thirdPartyCookieCountSignal.signal_value_json
        }
      : null
  ].filter(Boolean) as ValidationEvidencePacket["supportingSignals"];

  if (trackerVendorsSignal && observedVendors.length > 0) {
    supportingSignals.push({
      category: trackerVendorsSignal.category,
      key: trackerVendorsSignal.signal_key,
      label: "Pre-consent tracker vendors",
      value: observedVendors
    });
  }

  return {
    claim: "Tracking activity appears to occur before the visitor can make a consent choice.",
    confidenceBasis: [
      "A pre-consent tracking detector fired during the scan.",
      typeof violationCount === "number"
        ? `Pre-consent tracker violation count: ${String(violationCount)}.`
        : "A specific violation count was not available."
      ,
      evidenceSummary.totalObservedUrls > 0
        ? `Concrete pre-consent request evidence was captured (${Math.min(evidenceSummary.sampleUrls.length, 5)} representative URLs retained).`
        : "Concrete request URLs were not retained in this packet.",
      observedVendors.length > 0 ? `Known tracker vendors observed before consent: ${observedVendors.join(", ")}.` : "Specific pre-consent tracker vendors were not isolated."
    ],
    missingEvidence: evidenceSummary.totalObservedUrls > 0 ? [] : ["Concrete request URLs or cookie evidence captured before consent."],
    pageUrls: [],
    policyEvidence: [],
    reviewPolicy: {
      claimType: "tracking_before_consent",
      contraryEvidenceTypes: ["consent_already_granted", "evidence_captured_after_choice"],
      detectorStrength: "strong",
      gapTolerance: "medium",
      requiredSupportTypes: ["detector_signal", "request_or_cookie_evidence", "tracker_vendor_evidence"],
      rubric: {
        inconclusiveIf: [
          "The timing of tracking relative to consent is unclear.",
          "The detector fired but no concrete request, cookie, or vendor evidence supports it.",
          "Coverage gaps make the detector result uncertain."
        ],
        notSupportedIf: [
          "The evidence shows tracking only after a valid consent choice.",
          "The observed network activity is not reasonably tracking-related."
        ],
        supportedIf: [
          "A pre-consent detector fired.",
          "Concrete request, cookie, or vendor evidence supports the detector.",
          "There is no meaningful contrary timing evidence."
        ]
      }
    },
    runtimeEvidence: evidenceSummary.sampleUrls,
    supportingSignals
  };
}

function buildRejectPersistenceEvidence(row: ScanSignalRow, context: ValidationEvidenceBuildContext): ValidationEvidencePacket {
  const persistedVendors =
    (Array.isArray(context.runtimeArtifacts?.consent_reject_persisted_tracker_vendor_names)
      ? context.runtimeArtifacts?.consent_reject_persisted_tracker_vendor_names
      : null) ??
    (Array.isArray(row.signal_value_json) ? row.signal_value_json : []);
  const postRejectEvidenceUrls = Array.isArray(context.runtimeArtifacts?.consent_post_reject_tracker_evidence_urls)
    ? context.runtimeArtifacts.consent_post_reject_tracker_evidence_urls
    : [];
  const reducedTracking = context.runtimeArtifacts?.consent_reject_reduced_tracking;
  const rejectWorked =
    reducedTracking !== null ||
    postRejectEvidenceUrls.length > 0 ||
    persistedVendors.length > 0;

  return {
    claim: "Trackers continued to persist after a reject-style consent interaction.",
    confidenceBasis: [
      rejectWorked
        ? "The consent audit successfully completed a reject-style interaction."
        : "The consent audit attempted a reject-style interaction, but completion certainty was limited.",
      reducedTracking === true
        ? "Tracking decreased after reject, but some vendors or requests still persisted."
        : "Reject interaction did not fully suppress observed tracker activity.",
      postRejectEvidenceUrls.length > 0
        ? `Concrete post-reject request evidence was captured (${Math.min(postRejectEvidenceUrls.length, 5)} URLs retained).`
        : "Concrete post-reject request URLs were not retained in this packet.",
      persistedVendors.length > 0
        ? `Tracker vendors persisted after reject: ${persistedVendors.join(", ")}.`
        : "Specific post-reject tracker vendors were not isolated."
    ],
    missingEvidence: [
      ...(postRejectEvidenceUrls.length > 0 ? [] : ["Concrete request URLs captured after the reject interaction."]),
      ...(rejectWorked ? [] : ["A clearly confirmed reject interaction completion state."])
    ],
    pageUrls: [],
    policyEvidence: [],
    reviewPolicy: {
      claimType: "tracking_after_reject",
      contraryEvidenceTypes: ["reject_fully_suppressed_tracking", "reject_step_failed", "retained_request_is_strictly_necessary"],
      detectorStrength: "strong",
      gapTolerance: "medium",
      requiredSupportTypes: ["consent_audit_signal", "post_reject_vendor_or_request_evidence"],
      rubric: {
        inconclusiveIf: [
          "The reject interaction did not complete reliably.",
          "Evidence after reject is incomplete or ambiguous.",
          "The retained post-reject request is concrete but its purpose is unclear."
        ],
        notSupportedIf: [
          "The evidence shows tracking was fully suppressed after reject.",
          "The retained request is reasonably essential rather than tracking-related."
        ],
        supportedIf: [
          "The reject interaction completed.",
          "Concrete post-reject vendor or request evidence exists.",
          "There is no meaningful contrary suppression evidence."
        ]
      }
    },
    runtimeEvidence: postRejectEvidenceUrls.slice(0, 5),
    supportingSignals: [
      {
        category: row.category,
        key: row.signal_key,
        label: row.signal_label,
        value: row.signal_value_json
      },
      {
        category: "privacy",
        key: "privacy.persisted_tracker_vendors_after_reject",
        label: "Persisted tracker vendors after reject",
        value: persistedVendors
      },
      {
        category: "privacy",
        key: "privacy.reject_interaction_completed",
        label: "Reject interaction completed",
        value: rejectWorked
      }
    ]
  };
}

function buildHighSensitivityPayloadEvidence(row: ScanSignalRow, context: ValidationEvidenceBuildContext): ValidationEvidencePacket {
  function inferSensitiveInputHint(violation: {
    detectedType: string;
    sourceField?: string | null;
  }) {
    const snapshot = context.snapshot;
    const sourceField = violation.sourceField?.toLowerCase() ?? "";

    if (violation.detectedType === "email_detected" && snapshot?.email_input_present) {
      return "email input present on the page";
    }
    if (violation.detectedType === "phone_detected" && snapshot?.phone_input_present) {
      return "phone input present on the page";
    }
    if (violation.detectedType === "date_of_birth_detected" && snapshot?.date_of_birth_input_present) {
      return "date-of-birth input present on the page";
    }
    if (violation.detectedType === "ssn_detected" && snapshot?.form_collects_ssn) {
      return "SSN or government ID collection hinted on the page";
    }
    if (violation.detectedType === "health_condition_detected" && snapshot?.form_collects_health_information) {
      return "health-information collection hinted on the page";
    }
    if (violation.detectedType === "precise_address_detected" && snapshot?.address_input_present) {
      return "address input present on the page";
    }
    if (violation.detectedType === "postal_code_detected" && snapshot?.address_input_present) {
      return "address or postal input present on the page";
    }
    if (violation.detectedType === "precise_geolocation_detected" && snapshot?.form_collects_geolocation) {
      return "geolocation collection hinted on the page";
    }
    if (sourceField.includes("email") && snapshot?.email_input_present) {
      return "email input present on the page";
    }
    if ((sourceField.includes("phone") || sourceField.includes("tel") || sourceField.includes("mobile")) && snapshot?.phone_input_present) {
      return "phone input present on the page";
    }
    if ((sourceField.includes("zip") || sourceField.includes("postal")) && snapshot?.address_input_present) {
      return "address or postal input present on the page";
    }
    if ((sourceField.includes("lat") || sourceField.includes("lon") || sourceField.includes("lng")) && snapshot?.form_collects_geolocation) {
      return "geolocation collection hinted on the page";
    }

    return null;
  }

  const payloadViolations: NonNullable<ValidationEvidencePacket["sensitivePayloadViolations"]> = Array.isArray(
    context.runtimeArtifacts?.sensitive_payload_violations
  )
    ? context.runtimeArtifacts.sensitive_payload_violations
        .filter(
          (
            violation
          ): violation is {
            detectedType?: string | null;
            evidenceStrength?: string | null;
            matchSnippet?: string | null;
            requestMethod?: string | null;
            requestUrl?: string | null;
            sourceField?: string | null;
            sourceLocation?: "request_body" | "url_query" | null;
            sourcePattern?: "generic_pattern" | "keyed_field" | null;
            timestamp?: string | null;
            vendorHost?: string | null;
          } => Boolean(violation && typeof violation === "object")
        )
        .map((violation) => {
          const evidenceStrength: "confirmed" | "suspected" =
            violation.evidenceStrength === "suspected" ? "suspected" : "confirmed";

          return {
            detectedType: violation.detectedType ?? "unknown",
            evidenceStrength,
            matchSnippet: violation.matchSnippet ?? "",
            requestMethod: violation.requestMethod ?? "GET",
            requestUrl: violation.requestUrl ?? "",
            sourceField: violation.sourceField ?? null,
            sourceInputHint: inferSensitiveInputHint({
              detectedType: violation.detectedType ?? "unknown",
              sourceField: violation.sourceField ?? null
            }),
            sourceMatchesSensitiveInputHint: inferSensitiveInputHint({
              detectedType: violation.detectedType ?? "unknown",
              sourceField: violation.sourceField ?? null
            })
              ? true
              : false,
            sourceLocation: violation.sourceLocation ?? null,
            sourcePattern: violation.sourcePattern ?? null,
            timestamp: violation.timestamp ?? "",
            vendorHost: violation.vendorHost ?? null
          };
        })
        .filter((violation) => violation.requestUrl.length > 0)
    : [];

  const confirmedPayloadViolations = payloadViolations.filter((violation) => violation.evidenceStrength === "confirmed");
  const suspectedPayloadViolations = payloadViolations.filter((violation) => violation.evidenceStrength !== "confirmed");

  const runtimeEvidence = payloadViolations.slice(0, 5).map((violation) => {
    const dataType = violation.detectedType.replace(/_detected$/, "").replace(/_/g, " ");
    const strengthLabel = violation.evidenceStrength === "confirmed" ? "confirmed" : "suspected";
    const sourceDetail = violation.sourceField
      ? ` via ${violation.sourceField} in the ${violation.sourceLocation === "url_query" ? "request URL" : "request body"}`
      : violation.sourceLocation === "url_query"
        ? " via request URL parameters"
        : violation.sourceLocation === "request_body"
          ? " via request body"
          : "";
    const snippetDetail = violation.matchSnippet ? ` (${violation.matchSnippet})` : "";
    const inputHintDetail = violation.sourceInputHint ? ` [${violation.sourceInputHint}]` : "";
    return `${strengthLabel} ${dataType}${sourceDetail} in ${violation.requestMethod} ${violation.requestUrl}${snippetDetail}${inputHintDetail}`;
  });

  const sourceFieldEvidence = payloadViolations.filter((violation) => typeof violation.sourceField === "string" && violation.sourceField.length > 0);
  const hintedPayloadViolations = payloadViolations.filter((violation) => violation.sourceMatchesSensitiveInputHint === true);

  return {
    claim:
      confirmedPayloadViolations.length > 0
        ? "Plaintext high-sensitivity values appear to have been transmitted to third-party endpoints."
        : suspectedPayloadViolations.length > 0
          ? "Third-party request payloads contain field-level indicators of high-sensitivity data collection risk."
        : "Potential high-sensitivity data collection risk is present, but direct payload exfiltration was not confirmed.",
    confidenceBasis: confirmedPayloadViolations.length > 0
      ? [
          "The site exposed a high-sensitivity data collection signal.",
          `Confirmed payload inspection captured ${confirmedPayloadViolations.length} third-party request${confirmedPayloadViolations.length === 1 ? "" : "s"} containing plaintext high-sensitivity values.`,
          sourceFieldEvidence.length > 0
            ? `Retained evidence ties the matched values to named outbound field${sourceFieldEvidence.length === 1 ? "" : "s"} such as ${sourceFieldEvidence.slice(0, 3).map((violation) => violation.sourceField).join(", ")}.`
            : "Captured evidence came from outbound request parameters or request bodies rather than inferred page structure alone."
        ]
      : suspectedPayloadViolations.length > 0
        ? [
            "The site exposed a high-sensitivity data collection signal.",
            `Payload inspection retained ${suspectedPayloadViolations.length} third-party request${suspectedPayloadViolations.length === 1 ? "" : "s"} with field-level indicators of high-sensitivity data.`,
            sourceFieldEvidence.length > 0
              ? `Retained evidence ties the indicators to named outbound field${sourceFieldEvidence.length === 1 ? "" : "s"} such as ${sourceFieldEvidence.slice(0, 3).map((violation) => violation.sourceField).join(", ")}.`
              : "The retained evidence is stronger than a raw detector signal, but it does not yet prove plaintext exfiltration with the same confidence as direct email or phone matches."
          ,
            hintedPayloadViolations.length > 0
              ? `The site also exposed corresponding sensitive input hints, including ${hintedPayloadViolations
                  .slice(0, 2)
                  .map((violation) => violation.sourceInputHint)
                  .filter((value): value is string => typeof value === "string" && value.length > 0)
                  .join(" and ")}.`
              : "The retained indicators may reflect user-input collection, but the evidence does not yet prove that the values were transmitted in plaintext."
          ]
      : [
          "The site exposed a high-sensitivity data collection signal.",
          "No plaintext email or phone match was confirmed in the retained third-party request payload evidence.",
          "The signal may still indicate sensitive collection risk based on form or page context, but direct exfiltration proof is incomplete."
        ],
    missingEvidence:
      confirmedPayloadViolations.length > 0
        ? []
        : suspectedPayloadViolations.length > 0
          ? ["Confirmed plaintext third-party payload evidence showing that the retained indicators were transmitted as unmasked high-sensitivity values."]
          : ["Confirmed third-party payload evidence showing plaintext high-sensitivity transmission."],
    pageUrls: [],
    policyEvidence: [],
    reviewPolicy: {
      claimType: "behavior_without_disclosure",
      contraryEvidenceTypes: ["payload_redacted", "first_party_only_transmission"],
      detectorStrength: confirmedPayloadViolations.length > 0 ? "strong" : suspectedPayloadViolations.length > 0 ? "medium" : "medium",
      gapTolerance: "medium",
      requiredSupportTypes:
        payloadViolations.length > 0 ? ["detector_signal", "request_or_cookie_evidence"] : ["detector_signal"],
      rubric: {
        inconclusiveIf: [
          "Third-party payload timing or contents are unclear.",
          "A high-sensitivity detector fired but no plaintext payload match was retained."
        ],
        notSupportedIf: [
          "Observed payloads are first-party only.",
          "The retained evidence does not show plaintext or field-level high-sensitivity payload indicators."
        ],
        supportedIf: [
          "A high-sensitivity detector fired.",
          "Third-party request evidence contains plaintext or strong field-level indicators of high-sensitivity data."
        ]
      }
    },
    runtimeEvidence: runtimeEvidence.slice(0, 3),
    sensitivePayloadViolations: payloadViolations.slice(0, 3),
    supportingSignals: [
      {
        category: row.category,
        key: row.signal_key,
        label: row.signal_label,
        value: row.signal_value_json
      }
    ]
  };
}

function shouldSuppressDetectorOnlyValidationFinding(input: {
  evidencePacket: ValidationEvidencePacket;
  signalKey: string;
}) {
  if (/commerce\.high_sensitivity_data_collection_detected/i.test(input.signalKey)) {
    return (input.evidencePacket.sensitivePayloadViolations?.length ?? 0) === 0;
  }

  if (/privacy\.(policy_runtime_functional_misalignment_detected|user_rights_friction_score)/i.test(input.signalKey)) {
    const optInClicks =
      typeof input.evidencePacket.consentOptInClicks === "number" ? input.evidencePacket.consentOptInClicks : null;
    const optOutClicks =
      typeof input.evidencePacket.consentOptOutClicks === "number" ? input.evidencePacket.consentOptOutClicks : null;
    const frictionDelta =
      typeof input.evidencePacket.consentFrictionDelta === "number" ? input.evidencePacket.consentFrictionDelta : null;
    const blockerType =
      typeof input.evidencePacket.consentBlockerType === "string" ? input.evidencePacket.consentBlockerType : null;
    const blockerUrl =
      typeof input.evidencePacket.consentBlockerUrl === "string" ? input.evidencePacket.consentBlockerUrl : null;

    return !(
      input.evidencePacket.consentRedirectOrAuthRequired === true ||
      blockerType !== null ||
      blockerUrl !== null ||
      (typeof frictionDelta === "number" && frictionDelta > 0) ||
      (typeof optInClicks === "number" && typeof optOutClicks === "number" && optOutClicks > optInClicks)
    );
  }

  return false;
}

function normalizeConsentEvidenceLog(
  value: ScanRuntimeArtifactsRow["consent_opt_in_evidence_log"] | ScanRuntimeArtifactsRow["consent_opt_out_evidence_log"]
) {
  return Array.isArray(value)
    ? value
        .filter((step): step is NonNullable<typeof value>[number] => Boolean(step && typeof step === "object"))
        .map((step) => ({
          action: typeof step.action === "string" ? step.action : "unknown",
          selectorHint: typeof step.selectorHint === "string" ? step.selectorHint : null,
          stepIndex: typeof step.stepIndex === "number" ? step.stepIndex : null,
          text: typeof step.text === "string" ? step.text : "",
          urlAfterClick: typeof step.urlAfterClick === "string" ? step.urlAfterClick : null
        }))
        .filter((step) => step.text.length > 0)
    : [];
}

function buildRightsFrictionEvidence(row: ScanSignalRow, context: ValidationEvidenceBuildContext): ValidationEvidencePacket {
  const optInClicks = context.runtimeArtifacts?.consent_opt_in_clicks ?? context.runtimeArtifacts?.consent_accept_click_count ?? null;
  const optOutClicks = context.runtimeArtifacts?.consent_opt_out_clicks ?? context.runtimeArtifacts?.consent_reject_click_count ?? null;
  const frictionDelta = context.runtimeArtifacts?.consent_friction_delta ?? (
    typeof optInClicks === "number" && typeof optOutClicks === "number" ? optOutClicks - optInClicks : null
  );
  const blockerType = context.runtimeArtifacts?.consent_blocker_type ?? null;
  const blockerUrl = context.runtimeArtifacts?.consent_blocker_url ?? null;
  const blockerPageTitle = context.runtimeArtifacts?.consent_blocker_page_title ?? null;
  const blockerTextSnippet = context.runtimeArtifacts?.consent_blocker_text_snippet ?? null;
  const evidencePassCount = context.runtimeArtifacts?.consent_evidence_pass_count ?? null;
  const redirectOrAuthRequired = context.runtimeArtifacts?.consent_redirect_or_auth_required === true;
  const optInEvidenceLog = normalizeConsentEvidenceLog(context.runtimeArtifacts?.consent_opt_in_evidence_log);
  const optOutEvidenceLog = normalizeConsentEvidenceLog(context.runtimeArtifacts?.consent_opt_out_evidence_log);
  const concreteEvidenceAvailable =
    (typeof optInClicks === "number" && typeof optOutClicks === "number") ||
    redirectOrAuthRequired ||
    blockerType !== null ||
    blockerUrl !== null ||
    optInEvidenceLog.length > 0 ||
    optOutEvidenceLog.length > 0;

  const runtimeEvidence = [
    ...optInEvidenceLog.slice(0, 3).map((step) => `opt-in step ${step.stepIndex ?? "?"}: ${step.text}`),
    ...optOutEvidenceLog.slice(0, 5).map((step) => `opt-out step ${step.stepIndex ?? "?"}: ${step.text}`)
  ];
  if (blockerTextSnippet) {
    runtimeEvidence.push(`blocker snippet: ${blockerTextSnippet}`);
  }

  const supportingSignals = [
    {
      category: row.category,
      key: row.signal_key,
      label: row.signal_label,
      value: row.signal_value_json
    }
  ];

  if (typeof optInClicks === "number") {
    supportingSignals.push({
      category: "privacy",
      key: "privacy.consent_accept_click_count",
      label: "Accept click count",
      value: optInClicks
    });
  }

  if (typeof optOutClicks === "number") {
    supportingSignals.push({
      category: "privacy",
      key: "privacy.consent_reject_click_count",
      label: "Reject click count",
      value: optOutClicks
    });
  }

  if (typeof frictionDelta === "number") {
    supportingSignals.push({
      category: "privacy",
      key: "privacy.user_rights_friction_score.runtime_delta",
      label: "Consent friction delta",
      value: frictionDelta
    });
  }

  if (redirectOrAuthRequired) {
    supportingSignals.push({
      category: "privacy",
      key: "privacy.consent_redirect_or_auth_required",
      label: "Redirect or auth required",
      value: true
    });
  }
  if (blockerType) {
    supportingSignals.push({
      category: "privacy",
      key: "privacy.user_rights_friction_score.blocker_type",
      label: "Consent blocker type",
      value: blockerType
    });
  }
  if (typeof evidencePassCount === "number" && evidencePassCount > 0) {
    supportingSignals.push({
      category: "privacy",
      key: "privacy.user_rights_friction_score.evidence_pass_count",
      label: "Consent evidence pass count",
      value: evidencePassCount
    });
  }

  const strongEvidence =
    redirectOrAuthRequired ||
    blockerType !== null ||
    blockerUrl !== null ||
    (typeof frictionDelta === "number" && frictionDelta > 0) ||
    (typeof optInClicks === "number" && typeof optOutClicks === "number" && optOutClicks > optInClicks);
  const claim = row.signal_key === "privacy.policy_runtime_functional_misalignment_detected"
    ? strongEvidence
      ? "The observed consent workflow appears functionally asymmetric: opting out required more friction than opting in."
      : "A consent-symmetry detector flagged possible functional misalignment, but the retained runtime evidence does not yet confirm it."
    : strongEvidence
      ? "The observed consent workflow appears to impose more friction on opt-out than opt-in."
      : "Potential rights-fulfillment friction is present, but the retained runtime evidence remains incomplete.";

  return {
    claim,
    consentBlockerPageTitle: blockerPageTitle,
    consentBlockerTextSnippet: blockerTextSnippet,
    consentBlockerType: blockerType,
    consentBlockerUrl: blockerUrl,
    consentEvidencePassCount: evidencePassCount,
    consentFrictionDelta: frictionDelta,
    consentOptInClicks: optInClicks,
    consentOptOutClicks: optOutClicks,
    consentRedirectOrAuthRequired: redirectOrAuthRequired,
    confidenceBasis: strongEvidence
      ? [
          "A consent-symmetry detector fired during the scan.",
          typeof optInClicks === "number" && typeof optOutClicks === "number"
            ? `Opt-in completed in ${optInClicks} click${optInClicks === 1 ? "" : "s"} while opt-out required ${optOutClicks} click${optOutClicks === 1 ? "" : "s"}.`
            : "A completed runtime traversal captured asymmetry in the consent flow.",
          redirectOrAuthRequired
            ? "The opt-out path triggered a redirect or authentication barrier."
            : "Evidence logs captured the clicked controls used to complete the consent flow."
        ]
      : [
          "A consent-symmetry detector fired during the scan.",
          "The runtime artifact now includes click-path evidence, but the captured traversal did not conclusively prove asymmetry.",
          "Manual review is still needed to verify whether the live rights-fulfillment path is materially harder than the opt-in path."
        ],
    missingEvidence:
      concreteEvidenceAvailable
        ? []
        : ["Completed opt-in and opt-out click-path evidence showing whether the flows are symmetric."],
    pageUrls: blockerUrl ? [blockerUrl] : [],
    policyEvidence: [],
    reviewPolicy: {
      claimType: "behavior_without_disclosure",
      contraryEvidenceTypes: ["symmetric_choice_path", "documented_equivalent_opt_out"],
      detectorStrength: strongEvidence ? "strong" : "medium",
      gapTolerance: "medium",
      requiredSupportTypes: strongEvidence ? ["detector_signal", "runtime_click_path_evidence"] : ["detector_signal"],
      rubric: {
        inconclusiveIf: [
          "The detector fired but the runtime click-path evidence is incomplete.",
          "The scan did not complete both sides of the consent flow."
        ],
        notSupportedIf: [
          "The retained runtime evidence shows the opt-out and opt-in paths were materially equivalent.",
          "A redirect or login wall was not actually encountered on the opt-out path."
        ],
        supportedIf: [
          "The scan recorded concrete opt-in and opt-out click counts or a redirect/auth barrier.",
          "The retained evidence log supports the observed asymmetry."
        ]
      }
    },
    runtimeEvidence,
    supportingSignals
  };
}

function buildAccessibilityEvidence(row: ScanSignalRow, context: ValidationEvidenceBuildContext): ValidationEvidencePacket {
  const relatedSignals = [
    context.scanSignalsByKey.get("accessibility.wcag_error_count_total"),
    context.scanSignalsByKey.get("accessibility.wcag_aria_error_count"),
    context.scanSignalsByKey.get("accessibility.wcag_focus_indicator_issue_count")
  ].filter(Boolean) as ScanSignalRow[];
  const examples = getRelevantAccessibilityExamples(context, row);
  const pageUrls = uniqueStrings(examples.map((example) => example.page_url));
  const exampleSnippets = examples.map((example) => {
    const selector = Array.isArray(example.representative_selectors) ? example.representative_selectors[0] : null;
    return selector
      ? `${example.rule_code} on ${example.page_url} (${selector})`
      : `${example.rule_code} on ${example.page_url}`;
  });

  return {
    claim: "Automated accessibility testing surfaced WCAG rule violations on this site.",
    confidenceBasis: [
      typeof row.signal_value_json === "number" ? `Automated WCAG error count: ${row.signal_value_json}.` : "Automated accessibility rule violations were recorded.",
      examples.length > 0
        ? `Representative page-level examples were retained across ${pageUrls.length} page${pageUrls.length === 1 ? "" : "s"}.`
        : "Representative page-level accessibility examples were not retained with this packet."
    ],
    missingEvidence: examples.length > 0 ? [] : ["Rule-level example rows or affected page URLs for the highest-priority violations."],
    pageUrls,
    policyEvidence: [],
    reviewPolicy: {
      claimType: "automated_accessibility",
      contraryEvidenceTypes: ["rule_output_invalidated", "scan_coverage_too_thin"],
      detectorStrength: "strong",
      gapTolerance: "high",
      requiredSupportTypes: ["automated_rule_counts", ...(examples.length > 0 ? ["page_level_rule_examples"] : [])],
      rubric: {
        inconclusiveIf: [
          "The automated findings are too sparse or coverage is materially incomplete."
        ],
        notSupportedIf: [
          "There is convincing evidence that the automated rule output is invalid or unrelated."
        ],
        supportedIf: [
          "Automated rule violations were recorded.",
          "There is no meaningful contrary evidence undermining those results."
        ]
      }
    },
    runtimeEvidence: exampleSnippets,
    supportingSignals: [
      ...relatedSignals.map((signal) => ({
        category: signal.category,
        key: signal.signal_key,
        label: signal.signal_label,
        value: signal.signal_value_json
      })),
      ...(examples.length > 0
        ? [{
            category: row.category,
            key: `${row.signal_key}.page_examples`,
            label: "Representative accessibility examples",
            value: exampleSnippets
          } satisfies ValidationEvidencePacket["supportingSignals"][number]]
        : [])
    ]
  };
}

function buildAccessibilityRiskSignalEvidence(row: ScanSignalRow, context: ValidationEvidenceBuildContext): ValidationEvidencePacket {
  const relatedSignals = [
    context.scanSignalsByKey.get("accessibility.wcag_error_count_total"),
    context.scanSignalsByKey.get("accessibility.wcag_aria_error_count"),
    context.scanSignalsByKey.get("accessibility.wcag_focus_indicator_issue_count"),
    context.scanSignalsByKey.get("accessibility.wcag_keyboard_navigation_issue_count"),
    context.scanSignalsByKey.get("accessibility.wcag_link_name_error_count")
  ].filter(Boolean) as ScanSignalRow[];

  const packet = buildAccessibilityRiskSnapshotEvidence(
    typeof row.signal_value_json === "number" ? row.signal_value_json : 0
  );
  const examples = getRelevantAccessibilityExamples(context, row);
  const pageUrls = uniqueStrings(examples.map((example) => example.page_url));
  const exampleSnippets = examples.map((example) => {
    const selector = Array.isArray(example.representative_selectors) ? example.representative_selectors[0] : null;
    return selector
      ? `${example.rule_code} on ${example.page_url} (${selector})`
      : `${example.rule_code} on ${example.page_url}`;
  });

  return {
    ...packet,
    confidenceBasis: [
      ...(packet.confidenceBasis ?? []),
      examples.length > 0
        ? `Representative page-level accessibility examples were retained across ${pageUrls.length} page${pageUrls.length === 1 ? "" : "s"}.`
        : "Representative page-level accessibility examples were not retained with this score.",
      relatedSignals.length > 0
        ? `Related automated accessibility signals were also retained: ${relatedSignals
            .map((signal) => `${signal.signal_label} (${String(signal.signal_value_json)})`)
            .slice(0, 3)
            .join(", ")}.`
        : "No additional automated rule-family signals were retained with this score."
    ],
    missingEvidence: examples.length > 0 ? [] : packet.missingEvidence,
    pageUrls,
    runtimeEvidence: exampleSnippets,
    supportingSignals: [
      {
        category: row.category,
        key: row.signal_key,
        label: row.signal_label,
        value: row.signal_value_json
      },
      ...relatedSignals.map((signal) => toSupportingSignal(signal)),
      ...(examples.length > 0
        ? [{
            category: row.category,
            key: `${row.signal_key}.page_examples`,
            label: "Representative accessibility examples",
            value: exampleSnippets
          } satisfies ValidationEvidencePacket["supportingSignals"][number]]
        : [])
    ]
  };
}

function isActiveSignalValue(value: ScanSignalRow["signal_value_json"], valueType: ScanSignalRow["value_type"]) {
  if (valueType === "boolean") {
    return value === true;
  }

  if (valueType === "number") {
    return typeof value === "number" && value > 0;
  }

  if (valueType === "text") {
    return typeof value === "string" && value.trim().length > 0;
  }

  return Array.isArray(value) && value.length > 0;
}

function buildSnapshotFallbackFindings(snapshot: ValidationSnapshotFallbackRow): Omit<ValidationRunFindingInsert, "rank">[] {
  const findings: Omit<ValidationRunFindingInsert, "rank">[] = [];

  if (
    snapshot.preconsent_tracking_detected ||
    snapshot.tracking_before_consent_detected === true ||
    snapshot.third_party_cookie_set_before_consent === true
  ) {
    findings.push({
      category: "privacy",
      description: "Tracking activity appears to occur before the visitor can make a consent choice.",
      evidence_json: {
        claim: "Tracking activity appears to occur before the visitor can make a consent choice.",
        confidenceBasis: ["Snapshot fallback detected pre-consent tracking indicators."],
        missingEvidence: ["Request-level evidence URLs were not available in snapshot fallback mode."],
        pageUrls: [],
        policyEvidence: [],
        runtimeEvidence: [],
        supportingSignals: [
          {
            category: "privacy",
            key: "privacy.preconsent_tracking_detected",
            label: "Pre-consent tracking detected",
            value: snapshot.preconsent_tracking_detected
          },
          {
            category: "privacy",
            key: "privacy.third_party_cookie_set_before_consent",
            label: "Third-party cookies before consent",
            value: snapshot.third_party_cookie_set_before_consent
          },
          {
            category: "privacy",
            key: "privacy.tracking_before_consent_detected",
            label: "Tracking before consent detected",
            value: snapshot.tracking_before_consent_detected
          }
        ]
      },
      finding_id: null,
      page_url: null,
      rule_key: "privacy.trackers_before_consent_detected",
      severity: "high",
      subtype: "preconsent_tracking",
      title: "Trackers observed before consent"
    });
  }

  if (
    snapshot.cookie_banner_present &&
    (!snapshot.reject_all_present || snapshot.dark_pattern_reject_button_missing)
  ) {
    findings.push({
      category: "privacy",
      description: "A consent experience was detected without a clear reject-all control.",
      evidence_json: {
        claim: "A consent experience was detected without a clear reject-all control.",
        confidenceBasis: ["Snapshot fallback indicates a consent surface without a clear reject control."],
        missingEvidence: ["Banner HTML or page-level consent UI evidence was not available in snapshot fallback mode."],
        pageUrls: [],
        policyEvidence: [],
        runtimeEvidence: [],
        supportingSignals: [
          {
            category: "privacy",
            key: "privacy.cookie_banner_present",
            label: "Cookie banner present",
            value: snapshot.cookie_banner_present
          },
          {
            category: "privacy",
            key: "privacy.reject_all_present",
            label: "Reject all present",
            value: snapshot.reject_all_present
          },
          {
            category: "privacy",
            key: "privacy.dark_pattern_reject_button_missing",
            label: "Reject button missing",
            value: snapshot.dark_pattern_reject_button_missing
          }
        ]
      },
      finding_id: null,
      page_url: null,
      rule_key: "privacy.reject_control_missing_detected",
      severity: "high",
      subtype: "consent_controls",
      title: "Reject-all control missing"
    });
  }

  if (
    snapshot.privacy_policy_present &&
    (
      (((snapshot.privacy_policy_word_count ?? 0) > 0) && ((snapshot.privacy_policy_word_count ?? 0) < 250)) ||
      (((snapshot.legal_coverage_score ?? 100) > 0) && ((snapshot.legal_coverage_score ?? 100) < 70))
    )
  ) {
    findings.push({
      category: "legal",
      description: "A privacy policy was detected, but its coverage appeared limited or incomplete.",
      evidence_json: {
        claim: "A privacy policy was detected, but its coverage appeared limited or incomplete.",
        confidenceBasis: ["Snapshot fallback indicates weak privacy-policy coverage signals."],
        missingEvidence: ["Policy excerpts or structured coverage diagnostics were not available in snapshot fallback mode."],
        pageUrls: [],
        policyEvidence: [],
        runtimeEvidence: [],
        supportingSignals: [
          {
            category: "disclosure",
            key: "disclosure.privacy_policy_present",
            label: "Privacy policy present",
            value: snapshot.privacy_policy_present
          },
          {
            category: "context",
            key: "context.legal_coverage_score",
            label: "Legal coverage score",
            value: snapshot.legal_coverage_score
          },
          {
            category: "disclosure",
            key: "disclosure.privacy_policy_word_count",
            label: "Privacy policy word count",
            value: snapshot.privacy_policy_word_count
          }
        ]
      },
      finding_id: null,
      page_url: null,
      rule_key: "disclosure.privacy_policy_limited",
      severity: "medium",
      subtype: "policy_coverage",
      title: "Privacy policy coverage limited"
    });
  }

  return findings;
}

function addDays(now: Date, days: number) {
  return new Date(now.getTime() + days * 24 * 60 * 60_000);
}

export async function insertValidationAuditEvent(input: {
  actorUserId?: string | null;
  eventType: string;
  metadata?: Record<string, unknown>;
  reason?: string | null;
}) {
  const supabase = createAdminClient();
  const { error } = await supabase.from("validation_audit_events").insert({
    actor_user_id: input.actorUserId ?? null,
    event_type: input.eventType,
    metadata_json: input.metadata ?? null,
    reason: input.reason ?? null
  });

  if (error) {
    throw new Error(`Failed to insert validation audit event: ${error.message}`);
  }
}

export async function ensureValidationSettings() {
  const supabase = createAdminClient();
  const env = getWorkerEnv();
  const { data, error } = await supabase
    .from("validation_settings")
    .upsert(
      {
        singleton_key: VALIDATION_SETTINGS_KEY,
        run_mode: env.VALIDATION_DEFAULT_RUN_MODE ?? VALIDATION_DEFAULT_RUN_MODE,
        automatic_interval_minutes: env.VALIDATION_DEFAULT_SAMPLE_INTERVAL_MINUTES ?? VALIDATION_DEFAULT_INTERVAL_MINUTES
      },
      { onConflict: "singleton_key" }
    )
    .select(
      "singleton_key, pipeline_enabled, run_mode, automatic_interval_minutes, updated_at, updated_by_user_id, operator_note, next_due_at, last_scheduled_at, last_tranco_sync_at, last_worker_heartbeat_at, last_worker_started_at, last_worker_host"
    )
    .single();

  if (error || !data) {
    throw new Error(`Failed to load validation settings: ${error?.message ?? "Unknown error"}`);
  }

  const row = data as ValidationSettingsRow;
  if (!isValidValidationInterval(row.automatic_interval_minutes)) {
    const { error: updateError } = await supabase
      .from("validation_settings")
      .update({ automatic_interval_minutes: VALIDATION_DEFAULT_INTERVAL_MINUTES })
      .eq("singleton_key", VALIDATION_SETTINGS_KEY);

    if (updateError) {
      throw new Error(`Failed to normalize validation interval: ${updateError.message}`);
    }

    return {
      automaticIntervalMinutes: VALIDATION_DEFAULT_INTERVAL_MINUTES,
      lastScheduledAt: row.last_scheduled_at,
      lastTrancoSyncAt: row.last_tranco_sync_at,
      nextDueAt: row.next_due_at,
      operatorNote: row.operator_note,
      pipelineEnabled: row.pipeline_enabled,
      runMode: row.run_mode,
      updatedAt: row.updated_at,
      updatedByUserId: row.updated_by_user_id
    };
  }

  return {
    automaticIntervalMinutes: row.automatic_interval_minutes,
    lastScheduledAt: row.last_scheduled_at,
    lastTrancoSyncAt: row.last_tranco_sync_at,
    nextDueAt: row.next_due_at,
    operatorNote: row.operator_note,
    pipelineEnabled: row.pipeline_enabled,
    runMode: row.run_mode,
    updatedAt: row.updated_at,
    updatedByUserId: row.updated_by_user_id
  };
}

export async function getValidationPipelineState(): Promise<ValidationPipelineState> {
  const env = getWorkerEnv();

  if (!env.VALIDATION_PIPELINE_ENABLED) {
    return "paused_by_env";
  }

  const settings = await ensureValidationSettings();
  return settings.pipelineEnabled ? "running" : "paused_by_admin";
}

export async function setValidationScheduleState(input: {
  lastScheduledAt?: Date | null;
  lastTrancoSyncAt?: Date | null;
  nextDueAt?: Date | null;
}) {
  const supabase = createAdminClient();
  const patch: Record<string, string | null> = {};

  if (input.lastScheduledAt !== undefined) {
    patch.last_scheduled_at = input.lastScheduledAt ? input.lastScheduledAt.toISOString() : null;
  }

  if (input.lastTrancoSyncAt !== undefined) {
    patch.last_tranco_sync_at = input.lastTrancoSyncAt ? input.lastTrancoSyncAt.toISOString() : null;
  }

  if (input.nextDueAt !== undefined) {
    patch.next_due_at = input.nextDueAt ? input.nextDueAt.toISOString() : null;
  }

  if (Object.keys(patch).length === 0) {
    return;
  }

  const { error } = await supabase.from("validation_settings").update(patch).eq("singleton_key", VALIDATION_SETTINGS_KEY);
  if (error) {
    throw new Error(`Failed to update validation scheduler state: ${error.message}`);
  }
}

export async function recordValidationWorkerHeartbeat(input: {
  host: string;
  startedAt?: Date;
  heartbeatAt?: Date;
}) {
  const supabase = createAdminClient();
  const patch: Record<string, string | null> = {
    last_worker_heartbeat_at: (input.heartbeatAt ?? new Date()).toISOString(),
    last_worker_host: input.host
  };

  if (input.startedAt) {
    patch.last_worker_started_at = input.startedAt.toISOString();
  }

  const { error } = await supabase
    .from("validation_settings")
    .upsert(
      {
        singleton_key: VALIDATION_SETTINGS_KEY,
        ...patch
      },
      { onConflict: "singleton_key" }
    );

  if (error) {
    throw new Error(`Failed to record validation worker heartbeat: ${error.message}`);
  }
}

export async function getActiveValidationRunCount() {
  const supabase = createAdminClient();
  const { count, error } = await supabase
    .from("validation_runs")
    .select("id", { count: "exact", head: true })
    .in("status", ["waiting_for_scan", "queued", "collecting", "ranking", "validating"]);

  if (error) {
    throw new Error(`Failed to count active validation runs: ${error.message}`);
  }

  return count ?? 0;
}

export async function getValidationRunById(validationRunId: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("validation_runs")
    .select(
      "id, validation_target_id, domain_id, scan_id, hostname, normalized_url, tranco_rank, rank_band, trigger_mode, status, error_message, finding_count, reviewed_finding_count, average_agreement_score, created_at, started_at, completed_at"
    )
    .eq("id", validationRunId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load validation run ${validationRunId}: ${error.message}`);
  }

  const row = (data as ValidationRunRow | null) ?? null;
  if (!row) {
    return null;
  }

  return {
    averageAgreementScore: row.average_agreement_score,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    domainId: row.domain_id,
    errorMessage: row.error_message,
    findingCount: row.finding_count,
    hostname: row.hostname,
    id: row.id,
    normalizedUrl: row.normalized_url,
    rankBand: row.rank_band,
    reviewedFindingCount: row.reviewed_finding_count,
    scanId: row.scan_id,
    startedAt: row.started_at,
    status: row.status,
    targetId: row.validation_target_id,
    trancoRank: row.tranco_rank,
    triggerMode: row.trigger_mode
  } satisfies ValidationRunRecord;
}

export async function updateValidationRun(
  validationRunId: string,
  patch: Partial<{
    average_agreement_score: number | null;
    completed_at: string | null;
    domain_id: string | null;
    error_message: string | null;
    finding_count: number;
    reviewed_finding_count: number;
    scan_id: string | null;
    started_at: string | null;
    status: ValidationRunStatus;
  }>
) {
  const supabase = createAdminClient();
  const { error } = await supabase.from("validation_runs").update(patch).eq("id", validationRunId);
  if (error) {
    throw new Error(`Failed to update validation run ${validationRunId}: ${error.message}`);
  }
}

export async function updateValidationTargetAfterRun(input: {
  errorMessage?: string | null;
  hostname: string;
  lastStatus: ValidationRunStatus | "skipped";
  trancoRank: number | null;
}) {
  const supabase = createAdminClient();
  const { data: target, error: loadError } = await supabase
    .from("validation_targets")
    .select("id, consecutive_failures")
    .eq("hostname", input.hostname)
    .maybeSingle();

  if (loadError) {
    throw new Error(`Failed to load validation target ${input.hostname}: ${loadError.message}`);
  }

  if (!target) {
    return;
  }

  const now = new Date();
  const consecutiveFailures =
    input.lastStatus === "completed" ? 0 : Number((target as { consecutive_failures?: number }).consecutive_failures ?? 0) + 1;
  const patch: Record<string, string | number | null> = {
    consecutive_failures: consecutiveFailures,
    last_completed_at: now.toISOString(),
    last_error: input.errorMessage ?? null,
    last_status: input.lastStatus
  };

  if (input.lastStatus === "completed") {
    patch.cooldown_until = addDays(now, getCooldownDaysForRank(input.trancoRank)).toISOString();
    patch.backoff_until = null;
  } else if (input.errorMessage && /(captcha|blocked|403|429|forbidden)/i.test(input.errorMessage)) {
    patch.backoff_until = addDays(now, 90).toISOString();
  } else if (input.lastStatus === "failed") {
    patch.backoff_until = addDays(now, Math.min(1 << Math.max(0, consecutiveFailures - 1), 14)).toISOString();
  }

  const { error } = await supabase.from("validation_targets").update(patch).eq("id", (target as { id: string }).id);
  if (error) {
    throw new Error(`Failed to update validation target ${input.hostname}: ${error.message}`);
  }
}

export async function createValidationRun(input: {
  hostname: string;
  normalizedUrl: string;
  targetId?: string | null;
  trancoRank?: number | null;
  triggerMode: ValidationRunMode;
  triggeredByUserId?: string | null;
}) {
  const supabase = createAdminClient();
  const rankBand = getRankBand(input.trancoRank ?? null);
  const { data, error } = await supabase
    .from("validation_runs")
    .insert({
      hostname: input.hostname,
      normalized_url: input.normalizedUrl,
      rank_band: rankBand,
      status: "queued",
      tranco_rank: input.trancoRank ?? null,
      trigger_mode: input.triggerMode,
      triggered_by_user_id: input.triggeredByUserId ?? null,
      validation_target_id: input.targetId ?? null
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create validation run for ${input.hostname}: ${error?.message ?? "Unknown error"}`);
  }

  return (data as { id: string }).id;
}

export async function ensureValidationRunForCompletedManualScan(input: { scanId: string }) {
  const supabase = createAdminClient();
  const { data: scan, error: scanError } = await supabase
    .from("scans")
    .select("id, organization_id, domain_id, submitted_by_user_id, status, scan_type, scan_config_json")
    .eq("id", input.scanId)
    .maybeSingle();

  if (scanError) {
    throw new Error(`Failed to load completed scan ${input.scanId}: ${scanError.message}`);
  }

  const scanRow =
    (scan as {
      domain_id: string | null;
      id: string;
      organization_id: string | null;
      scan_config_json: Record<string, unknown> | null;
      scan_type: string;
      status: string;
      submitted_by_user_id: string | null;
    } | null) ?? null;

  if (!scanRow || scanRow.status !== "completed" || scanRow.scan_type !== "full" || !scanRow.organization_id || !scanRow.domain_id) {
    return null;
  }

  const source =
    scanRow.scan_config_json && typeof scanRow.scan_config_json.source === "string"
      ? scanRow.scan_config_json.source
      : null;

  if (source !== "manual-dashboard" && source !== "manual-rescan") {
    return null;
  }

  const { data: existingRun, error: existingRunError } = await supabase
    .from("validation_runs")
    .select("id")
    .eq("scan_id", input.scanId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingRunError) {
    throw new Error(`Failed to check validation runs for scan ${input.scanId}: ${existingRunError.message}`);
  }

  if (existingRun) {
    return (existingRun as { id: string }).id;
  }

  const { data: domain, error: domainError } = await supabase
    .from("domains")
    .select("id, hostname, normalized_url")
    .eq("id", scanRow.domain_id)
    .eq("organization_id", scanRow.organization_id)
    .maybeSingle();

  if (domainError) {
    throw new Error(`Failed to load domain for completed scan ${input.scanId}: ${domainError.message}`);
  }

  if (!domain) {
    return null;
  }

  const { data: previousRun, error: previousRunError } = await supabase
    .from("validation_runs")
    .select("tranco_rank, rank_band")
    .eq("domain_id", scanRow.domain_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (previousRunError) {
    throw new Error(`Failed to load previous validation run for completed scan ${input.scanId}: ${previousRunError.message}`);
  }

  const { data: run, error: runError } = await supabase
    .from("validation_runs")
    .insert({
      domain_id: (domain as { id: string }).id,
      hostname: (domain as { hostname: string }).hostname,
      normalized_url: (domain as { normalized_url: string }).normalized_url,
      rank_band: (previousRun as { rank_band: string | null } | null)?.rank_band ?? null,
      scan_id: input.scanId,
      status: "queued",
      tranco_rank: (previousRun as { tranco_rank: number | null } | null)?.tranco_rank ?? null,
      trigger_mode: "manual",
      triggered_by_user_id: scanRow.submitted_by_user_id
    })
    .select("id")
    .single();

  if (runError || !run) {
    throw new Error(`Failed to create validation run for completed scan ${input.scanId}: ${runError?.message ?? "Unknown error"}`);
  }

  await insertValidationAuditEvent({
    eventType: "validation.manual_run_queued",
    metadata: {
      domainId: (domain as { id: string }).id,
      hostname: (domain as { hostname: string }).hostname,
      reason: "manual_scan_completed",
      scanId: input.scanId,
      validationRunId: (run as { id: string }).id
    },
    actorUserId: scanRow.submitted_by_user_id
  });

  return (run as { id: string }).id;
}

export async function getEligibleTargetForAutomaticRun(now = new Date()) {
  const supabase = createAdminClient();
  const activeTargetIds = new Set<string>();
  const { data: activeRuns, error: activeRunsError } = await supabase
    .from("validation_runs")
    .select("validation_target_id")
    .in("status", ["waiting_for_scan", "queued", "collecting", "ranking", "validating"]);

  if (activeRunsError) {
    throw new Error(`Failed to load active validation runs: ${activeRunsError.message}`);
  }

  for (const row of (activeRuns ?? []) as Array<{ validation_target_id: string | null }>) {
    if (row.validation_target_id) {
      activeTargetIds.add(row.validation_target_id);
    }
  }

  const bands = Object.entries({
    "1k-5k": 20,
    "5k-20k": 30,
    "20k-50k": 30,
    "50k-100k": 20
  });
  const random = Math.random() * 100;
  let cumulative = 0;
  let selectedBand = "5k-20k";
  for (const [band, weight] of bands) {
    cumulative += weight;
    if (random <= cumulative) {
      selectedBand = band;
      break;
    }
  }

  const candidateBands = [selectedBand, ...bands.map(([band]) => band).filter((band) => band !== selectedBand)];
  for (const band of candidateBands) {
    const { data, error } = await supabase
      .from("validation_targets")
      .select("id, hostname, normalized_url, active, denylisted, deny_reason, cooldown_until, backoff_until, tranco_rank, rank_band, last_run_at, last_completed_at, last_status, last_error")
      .eq("active", true)
      .eq("denylisted", false)
      .eq("rank_band", band)
      .order("tranco_rank", { ascending: true })
      .limit(500);

    if (error) {
      throw new Error(`Failed to load validation targets for band ${band}: ${error.message}`);
    }

    const eligible = ((data ?? []) as ValidationTargetRow[]).filter((target) => {
      if (activeTargetIds.has(target.id)) {
        return false;
      }

      const cooldownUntil = target.cooldown_until ? new Date(target.cooldown_until).getTime() : 0;
      const backoffUntil = target.backoff_until ? new Date(target.backoff_until).getTime() : 0;
      return cooldownUntil <= now.getTime() && backoffUntil <= now.getTime();
    });

    if (eligible.length === 0) {
      continue;
    }

    const selected = eligible[Math.floor(Math.random() * eligible.length)] ?? null;
    if (selected) {
      return {
        hostname: selected.hostname,
        id: selected.id,
        normalizedUrl: selected.normalized_url,
        rankBand: selected.rank_band,
        trancoRank: selected.tranco_rank
      };
    }
  }

  return null;
}

export async function upsertValidationTargets(rows: Array<{ hostname: string; normalizedUrl: string; trancoRank: number; source: string }>) {
  if (rows.length === 0) {
    return 0;
  }

  const supabase = createAdminClient();
  let inserted = 0;
  const batchSize = 500;
  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize).map((row) => ({
      active: true,
      hostname: row.hostname,
      normalized_url: row.normalizedUrl,
      rank_band: getRankBand(row.trancoRank),
      source: row.source,
      tranco_rank: row.trancoRank
    }));

    const { error } = await supabase.from("validation_targets").upsert(batch, { onConflict: "hostname" });
    if (error) {
      throw new Error(`Failed to upsert validation targets: ${error.message}`);
    }
    inserted += batch.length;
  }

  return inserted;
}

export async function markValidationTargetRunQueued(hostname: string) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("validation_targets")
    .update({ last_run_at: new Date().toISOString(), last_status: "queued", last_error: null })
    .eq("hostname", hostname);

  if (error) {
    throw new Error(`Failed to mark validation target ${hostname} as queued: ${error.message}`);
  }
}

export async function ensureAnonymousValidationDomain(hostname: string, normalizedUrl: string) {
  const supabase = createAdminClient();
  const { data: existing, error: existingError } = await supabase
    .from("domains")
    .select("id, hostname, normalized_url")
    .is("organization_id", null)
    .eq("normalized_url", normalizedUrl)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Failed to load validation domain ${normalizedUrl}: ${existingError.message}`);
  }

  if (existing) {
    return existing as { id: string; hostname: string; normalized_url: string };
  }

  const { data, error } = await supabase
    .from("domains")
    .insert({
      hostname,
      normalized_url: normalizedUrl
    })
    .select("id, hostname, normalized_url")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create validation domain ${hostname}: ${error?.message ?? "Unknown error"}`);
  }

  return data as { id: string; hostname: string; normalized_url: string };
}

export async function createValidationScan(input: {
  domainId: string;
  hostname: string;
  normalizedUrl: string;
  pagesRequested?: number;
}) {
  const supabase = createAdminClient();
  const pagesRequested = Math.max(3, input.pagesRequested ?? 8);
  const scanConfig = {
    hostname: input.hostname,
    maxPages: pagesRequested,
    normalizedUrl: input.normalizedUrl,
    processor: "agentic-validation-v1",
    profile: "agentic-validation-v1",
    source: "validation-manual"
  };

  const { data, error } = await supabase
    .from("scans")
    .insert({
      domain_id: input.domainId,
      pages_requested: pagesRequested,
      pages_scanned: 0,
      scan_config_json: scanConfig,
      scan_type: "full",
      status: "queued"
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create validation scan for ${input.hostname}: ${error?.message ?? "Unknown error"}`);
  }

  const scanId = (data as { id: string }).id;
  const { error: domainError } = await supabase.from("domains").update({ latest_scan_id: scanId }).eq("id", input.domainId);
  if (domainError) {
    throw new Error(`Failed to set validation domain latest scan: ${domainError.message}`);
  }

  return scanId;
}

export async function insertValidationScanEvent(input: {
  domainId?: string | null;
  eventType: string;
  message: string;
  metadata?: Record<string, unknown>;
  scanId?: string | null;
}) {
  const supabase = createAdminClient();
  const { error } = await supabase.from("scan_events").insert({
    domain_id: input.domainId ?? null,
    event_type: input.eventType,
    message: input.message,
    metadata_json: input.metadata ?? null,
    organization_id: null,
    scan_id: input.scanId ?? null
  });

  if (error) {
    throw new Error(`Failed to insert validation scan event: ${error.message}`);
  }
}

export async function loadRankableFindings(scanId: string) {
  const supabase = createAdminClient();
  const [
    { data: signalRows, error },
    { data: snapshot, error: snapshotError },
    { data: runtimeArtifacts, error: runtimeArtifactsError },
    { data: snapshotSupplements, error: snapshotSupplementError },
    { data: policyQueue, error: policyQueueError },
    { data: accessibilityRuleExamples, error: accessibilityRuleExamplesError },
    { data: pageEvidenceRows, error: pageEvidenceError },
    { data: signalHitRows, error: signalHitsError }
  ] = await Promise.all([
    supabase
      .from("scan_signals")
      .select("category, signal_key, signal_label, signal_value_json, value_type")
      .eq("scan_id", scanId),
    supabase
      .from("scan_snapshots")
      .select(
        "cmp_vendor_name, consent_withdrawal_mechanism_present, cookie_banner_present, dark_pattern_reject_button_missing, legal_coverage_score, preconsent_tracking_detected, privacy_policy_present, privacy_policy_word_count, reject_all_present, third_party_cookie_set_before_consent, tracking_before_consent_detected, email_input_present, phone_input_present, address_input_present, date_of_birth_input_present, form_collects_ssn, form_collects_health_information, form_collects_geolocation"
      )
      .eq("scan_id", scanId)
      .maybeSingle(),
    supabase
      .from("scan_runtime_artifacts")
      .select(
        "consent_accept_click_count, consent_blocker_page_title, consent_blocker_text_snippet, consent_blocker_type, consent_blocker_url, consent_evidence_pass_count, consent_friction_delta, consent_opt_in_clicks, consent_opt_in_evidence_log, consent_opt_out_clicks, consent_opt_out_evidence_log, consent_post_reject_tracker_evidence_urls, consent_post_reject_tracker_vendor_names, consent_redirect_or_auth_required, consent_reject_click_count, consent_reject_persisted_tracker_vendor_names, consent_reject_reduced_tracking, key_page_discovery_summary, sensitive_payload_violations, third_party_request_domains, script_src_domains"
      )
      .eq("scan_id", scanId)
      .maybeSingle(),
    supabase
      .from("scan_snapshots")
      .select("retargeting_pixel_detected, accessibility_litigation_risk_score")
      .eq("scan_id", scanId)
      .maybeSingle(),
    supabase
      .from("policy_review_queue")
      .select("id, policy_enrichment_id, reason, review_status, scan_id")
      .eq("scan_id", scanId),
    supabase
      .from("scan_accessibility_rule_examples")
      .select("page_url, rule_code, rule_group, severity, impact, help, help_url, description, node_count, representative_selectors")
      .eq("scan_id", scanId)
      .order("node_count", { ascending: false })
      .limit(10),
    supabase
      .from("scan_page_evidence")
      .select("scan_id, evidence_id, page_url, page_type, page_role, crawl_depth, source_kind, matched_text, selector, dom_path, container_selector, container_dom_path, sibling_index, token_start, token_end, screenshot_ref, metadata")
      .eq("scan_id", scanId),
    supabase
      .from("scan_signal_hits")
      .select("scan_id, id, signal_key, detector_name, detector_type, detector_version, page_url, page_type, page_role, evidence_refs, payload")
      .eq("scan_id", scanId)
  ]);

  if (error) {
    throw new Error(`Failed to load validation findings for scan ${scanId}: ${error.message}`);
  }

  if (snapshotError) {
    throw new Error(`Failed to load validation snapshot context for scan ${scanId}: ${snapshotError.message}`);
  }

  if (runtimeArtifactsError) {
    throw new Error(`Failed to load validation runtime context for scan ${scanId}: ${runtimeArtifactsError.message}`);
  }

  if (snapshotSupplementError) {
    throw new Error(`Failed to load validation snapshot supplements for scan ${scanId}: ${snapshotSupplementError.message}`);
  }

  if (policyQueueError) {
    throw new Error(`Failed to load validation policy review queue for scan ${scanId}: ${policyQueueError.message}`);
  }

  if (accessibilityRuleExamplesError) {
    throw new Error(`Failed to load validation accessibility examples for scan ${scanId}: ${accessibilityRuleExamplesError.message}`);
  }

  const pageEvidenceTableMissing =
    pageEvidenceError?.message.includes("Could not find the table 'public.scan_page_evidence' in the schema cache") ?? false;
  if (pageEvidenceError && !pageEvidenceTableMissing) {
    throw new Error(`Failed to load financial page evidence for scan ${scanId}: ${pageEvidenceError.message}`);
  }

  const signalHitsTableMissing =
    signalHitsError?.message.includes("Could not find the table 'public.scan_signal_hits' in the schema cache") ?? false;
  if (signalHitsError && !signalHitsTableMissing) {
    throw new Error(`Failed to load financial signal hits for scan ${scanId}: ${signalHitsError.message}`);
  }

  const rows = (signalRows ?? []) as ScanSignalRow[];
  const context: ValidationEvidenceBuildContext = {
    accessibilityRuleExamples: (accessibilityRuleExamples ?? []) as ScanAccessibilityRuleExampleRow[],
    runtimeArtifacts: (runtimeArtifacts as ScanRuntimeArtifactsRow | null) ?? null,
    scanSignalsByKey: new Map(rows.map((row) => [row.signal_key, row])),
    snapshot: (snapshot as ScanSnapshotRow | null) ?? null
  };

  if (rows.length === 0) {
    const { data: snapshot, error: snapshotError } = await supabase
      .from("scan_snapshots")
      .select(
        "cookie_banner_present, reject_all_present, dark_pattern_reject_button_missing, preconsent_tracking_detected, tracking_before_consent_detected, third_party_cookie_set_before_consent, privacy_policy_present, privacy_policy_word_count, legal_coverage_score"
      )
      .eq("scan_id", scanId)
      .maybeSingle();

    if (snapshotError) {
      throw new Error(`Failed to load validation snapshot fallback for scan ${scanId}: ${snapshotError.message}`);
    }

    if (snapshot) {
      return buildSnapshotFallbackFindings(snapshot as ValidationSnapshotFallbackRow);
    }

    return [];
  }

  const findings: Omit<ValidationRunFindingInsert, "rank">[] = [];
  const primaryPreconsentRow = PRECONSENT_FINDING_SIGNAL_KEYS
    .map((key) => context.scanSignalsByKey.get(key))
    .find((row): row is ScanSignalRow => row != null && isActiveSignalValue(row.signal_value_json, row.value_type));

  if (primaryPreconsentRow) {
    const definition = VALIDATION_SIGNAL_FINDING_DEFINITIONS["privacy.preconsent_tracking_detected"]!;
    findings.push({
      category: definition.category,
      description: definition.description,
      evidence_json: definition.buildEvidence
        ? definition.buildEvidence(primaryPreconsentRow, context)
        : buildDefaultEvidencePacket(primaryPreconsentRow, definition.description),
      finding_id: null,
      page_url: null,
      rule_key: definition.ruleKey,
      severity: definition.severity,
      subtype: definition.subtype,
      title: definition.title
    });
  }

  const suppressedSignalKeys = new Set<string>(primaryPreconsentRow ? PRECONSENT_FINDING_SIGNAL_KEYS : []);

  for (const row of rows) {
    if (!isActiveSignalValue(row.signal_value_json, row.value_type)) {
      continue;
    }

    if (suppressedSignalKeys.has(row.signal_key)) {
      continue;
    }

    const definition = getValidationFindingDefinitionForSignal(row);
    if (!definition) {
      continue;
    }

    const evidencePacket = buildValidationEvidencePacketForSignal(row, context)!;

    if (shouldSuppressDetectorOnlyValidationFinding({ evidencePacket, signalKey: row.signal_key })) {
      continue;
    }

    findings.push({
      category: definition.category,
      description: definition.description,
      evidence_json: evidencePacket,
      finding_id: null,
      page_url: null,
      rule_key: definition.ruleKey,
      severity: definition.severity,
      subtype: definition.subtype,
      title: definition.title
    });
  }

  const queueRows = (policyQueue ?? []) as PolicyReviewQueueRow[];
  const enrichmentIds = queueRows
    .map((row) => row.policy_enrichment_id)
    .filter((value): value is string => typeof value === "string" && value.length > 0);

  let policyEnrichmentRows: PolicyEnrichmentLookupRow[] = [];
  if (enrichmentIds.length > 0) {
    const { data: enrichmentRows, error: enrichmentError } = await supabase
      .from("policy_enrichment")
      .select("id, page_type, page_url, policy_ambiguity_score, policy_arbitration_present, policy_cancellation_or_refund_present, policy_coverage_ratio, policy_effective_date, policy_field_coverage, policy_governing_law, policy_notice_contact_present, policy_semantic_confidence, policy_snippet_count, policy_structurally_weak, policy_summary_short, policy_termination_or_suspension_present")
      .in("id", enrichmentIds);

    if (enrichmentError) {
      throw new Error(`Failed to load validation policy enrichment for scan ${scanId}: ${enrichmentError.message}`);
    }

    policyEnrichmentRows = (enrichmentRows ?? []) as PolicyEnrichmentLookupRow[];
  }

  const existingRuleKeys = new Set(findings.map((finding) => finding.rule_key));
  const existingTitles = new Set(findings.map((finding) => finding.title.trim().toLowerCase()));

  for (const row of queueRows) {
    const enrichment = row.policy_enrichment_id
      ? policyEnrichmentRows.find((candidate) => candidate.id === row.policy_enrichment_id)
      : undefined;
    const pageType = enrichment?.page_type ?? "unknown";
    const pageTypeLabel = normalizePolicyPageTypeLabel(pageType);
    const title =
      row.reason === "low_confidence_critical_fields"
        ? `Low-confidence extraction ${pageTypeLabel}`
        : `${row.reason.replaceAll("_", " ")} ${pageTypeLabel}`.replace(/\b\w/g, (char) => char.toUpperCase());
    const ruleKey = `policy_review.${row.reason}.${String(pageType).toLowerCase()}`;

    if (existingRuleKeys.has(ruleKey) || existingTitles.has(title.trim().toLowerCase())) {
      continue;
    }

    findings.push({
      category: "legal",
      description: buildPolicyReviewDescription(row.reason),
      evidence_json: buildPolicyReviewEvidencePayload({
        enrichment,
        policyEnrichmentId: row.policy_enrichment_id,
        reason: row.reason,
        reviewStatus: row.review_status
      }),
      finding_id: null,
      page_url: enrichment?.page_url ?? null,
      rule_key: ruleKey,
      severity: row.reason === "policy_behavior_conflict_candidate" ? "high" : "medium",
      subtype: "policy_review_queue",
      title
    });
    existingRuleKeys.add(ruleKey);
    existingTitles.add(title.trim().toLowerCase());
  }

  const snapshotSupplement = (snapshotSupplements as SnapshotSupplementRow | null) ?? null;
  if (snapshotSupplement?.retargeting_pixel_detected === true) {
    const title = "Retargeting pixel detected";
    const ruleKey = "scan_snapshot.commerce.retargeting_pixel_detected";

    if (!existingRuleKeys.has(ruleKey) && !existingTitles.has(title.toLowerCase())) {
      findings.push({
        category: "privacy",
        description: "Advertising or retargeting technology appears to be active and merits direct review.",
        evidence_json: {
          snapshotField: "retargeting_pixel_detected",
          value: true
        },
        finding_id: null,
        page_url: null,
        rule_key: ruleKey,
        severity: "high",
        subtype: "snapshot_review",
        title
      });
      existingRuleKeys.add(ruleKey);
      existingTitles.add(title.toLowerCase());
    }
  }

  if (typeof snapshotSupplement?.accessibility_litigation_risk_score === "number") {
    const title = "Accessibility risk score";
    const ruleKey = "scan_snapshot.accessibility.accessibility_risk_score";

    if (!existingRuleKeys.has(ruleKey) && !existingTitles.has(title.toLowerCase())) {
      findings.push({
        category: "accessibility",
        description: "Scanner-derived risk indicator is elevated.",
        evidence_json: buildAccessibilityRiskSnapshotEvidence(snapshotSupplement.accessibility_litigation_risk_score),
        finding_id: null,
        page_url: null,
        rule_key: ruleKey,
        severity: "medium",
        subtype: "snapshot_review",
        title
      });
    }
  }

  const normalizedPageEvidence: ObservedPageEvidence[] = (((pageEvidenceTableMissing ? [] : pageEvidenceRows) ?? []) as ScanPageEvidenceRow[]).map((row) => ({
    evidenceId: row.evidence_id,
    scanId: row.scan_id,
    pageUrl: row.page_url,
    pageType: row.page_type,
    pageRole: row.page_role,
    crawlDepth: row.crawl_depth,
    sourceKind: row.source_kind,
    matchedText: row.matched_text,
    selector: row.selector,
    domPath: row.dom_path,
    containerSelector: row.container_selector,
    containerDomPath: row.container_dom_path,
    siblingIndex: row.sibling_index,
    tokenStart: row.token_start,
    tokenEnd: row.token_end,
    screenshotRef: row.screenshot_ref,
    metadata: row.metadata
  }));
  const normalizedSignalHits: ScanSignalHit[] = (((signalHitsTableMissing ? [] : signalHitRows) ?? []) as ScanSignalHitRow[]).map((row) => ({
    id: row.id,
    scanId: row.scan_id,
    signalKey: row.signal_key,
    detectorName: row.detector_name,
    detectorType: row.detector_type,
    detectorVersion: row.detector_version,
    pageUrl: row.page_url,
    pageType: row.page_type,
    pageRole: row.page_role,
    evidenceRefs: Array.isArray(row.evidence_refs) ? row.evidence_refs : [],
    payload: row.payload ?? {}
  }));

  findings.push(
    ...buildFinancialSectionReviewFindings({
      pageEvidence: normalizedPageEvidence,
      signalHits: normalizedSignalHits
    })
  );

  return findings.filter((finding, index, allFindings) => {
    return allFindings.findIndex((candidate) => candidate.rule_key === finding.rule_key) === index;
  });
}

export async function replaceValidationRunFindings(validationRunId: string, findings: ValidationRunFindingInsert[]) {
  const supabase = createAdminClient();
  const { error: deleteError } = await supabase.from("validation_run_findings").delete().eq("validation_run_id", validationRunId);
  if (deleteError) {
    throw new Error(`Failed to clear validation run findings: ${deleteError.message}`);
  }

  if (findings.length === 0) {
    return [] as ValidationRunFindingRow[];
  }

  const { data, error } = await supabase
    .from("validation_run_findings")
    .insert(findings.map(({ rank, ...finding }) => ({ ...finding, finding_rank: rank, rank, validation_run_id: validationRunId })))
    .select("id, validation_run_id, category, subtype, rule_key, title, description, severity, page_url, evidence_json, finding_rank");

  if (error) {
    throw new Error(`Failed to insert validation run findings: ${error.message}`);
  }

  return ((data ?? []) as ValidationRunFindingDbRow[]).map((row) => ({
    ...row,
    rank: row.finding_rank
  }));
}

export async function listValidationRunFindings(validationRunId: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("validation_run_findings")
    .select("id, validation_run_id, category, subtype, rule_key, title, description, severity, page_url, evidence_json, finding_rank")
    .eq("validation_run_id", validationRunId)
    .order("finding_rank", { ascending: true })
    .limit(VALIDATION_FINDING_LIMIT);

  if (error) {
    throw new Error(`Failed to load validation run findings for ${validationRunId}: ${error.message}`);
  }

  return ((data ?? []) as ValidationRunFindingDbRow[]).map((row) => ({
    ...row,
    rank: row.finding_rank
  }));
}

export async function replaceValidationVerdict(input: ValidationVerdictInsert) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("validation_verdicts")
    .upsert({ ...input }, { onConflict: "validation_run_finding_id" });

  if (error) {
    throw new Error(`Failed to upsert validation verdict: ${error.message}`);
  }
}

export async function summarizeValidationRun(validationRunId: string) {
  const supabase = createAdminClient();
  const { data: runFindings, error: findingsError } = await supabase
    .from("validation_run_findings")
    .select("id")
    .eq("validation_run_id", validationRunId);

  if (findingsError) {
    throw new Error(`Failed to load validation run findings for summary ${validationRunId}: ${findingsError.message}`);
  }

  const findingIds = ((runFindings ?? []) as Array<{ id: string }>).map((row) => row.id);
  if (findingIds.length === 0) {
    await updateValidationRun(validationRunId, {
      average_agreement_score: null,
      completed_at: new Date().toISOString(),
      reviewed_finding_count: 0,
      status: "completed"
    });
    return;
  }

  const { data, error } = await supabase
    .from("validation_verdicts")
    .select("agreement_score")
    .in("validation_run_finding_id", findingIds);

  if (error) {
    throw new Error(`Failed to summarize validation run ${validationRunId}: ${error.message}`);
  }

  const verdicts = (data ?? []) as Array<{ agreement_score: number }>;
  const averageAgreementScore =
    verdicts.length > 0 ? Math.round(verdicts.reduce((sum, verdict) => sum + Number(verdict.agreement_score ?? 0), 0) / verdicts.length) : null;

  await updateValidationRun(validationRunId, {
    average_agreement_score: averageAgreementScore,
    completed_at: new Date().toISOString(),
    reviewed_finding_count: verdicts.length,
    status: "completed"
  });
}

export function normalizeValidationTargetUrl(input: string) {
  const normalizedUrl = normalizeUrl(input);
  return {
    hostname: extractHostname(normalizedUrl),
    normalizedUrl
  };
}

export function buildNextDueAt(intervalMinutes: number, from = new Date()) {
  return getNextDueAt({ from, intervalMinutes });
}
