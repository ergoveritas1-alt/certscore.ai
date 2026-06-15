import {
  type CoverageLimitation,
  type FindingCandidate,
  type RegulatoryReviewArea,
  type RegulatoryReviewEvidenceCapability,
  type RegulatoryReviewOutput,
  type RegulatoryReviewRow,
  type RegulatoryReviewRowStatus,
  regulatoryReviewOutputSchema,
} from "@certscore/contracts";

const PRE_CONSENT_MODULE = "preConsentRuntimeScanner";
const CONSENT_FLOW_MODULE = "consentFlowRuntimeScanner";
const POLICY_SURFACE_MODULE = "policySurfaceScanner";

type RegulatoryReviewInput = {
  coverageLimitations: CoverageLimitation[];
  findingCandidates: FindingCandidate[];
  generatedAt?: string;
  reviewId: string;
  scanId: string;
  sourceModulesPresent: string[];
  url: string;
};

type RowSeed = {
  defaultStatus?: RegulatoryReviewRowStatus;
  evidenceCapability: RegulatoryReviewEvidenceCapability;
  id: string;
  includeEligibleMissingCorroborators?: boolean;
  label: string;
  matchedStatus?: RegulatoryReviewRowStatus;
  missingSignal?: string;
  note: string;
  regulatoryMapping?: string[];
  requiredModules?: string[];
  sourceFindingKeys?: string[];
};

type AreaSeed = Omit<RegulatoryReviewArea, "rows" | "sourceStage"> & {
  rows: RowSeed[];
};

export function projectRegulatoryReview(input: RegulatoryReviewInput): RegulatoryReviewOutput {
  const candidatesByKey = new Map(input.findingCandidates.map((candidate) => [candidate.findingKey, candidate]));
  const moduleSet = new Set(input.sourceModulesPresent);
  const areas = regulatoryAreaSeeds().map((area): RegulatoryReviewArea => ({
    ...area,
    rows: area.rows.map((row) => projectRow(row, candidatesByKey, moduleSet, input.coverageLimitations)),
    sourceStage: "certscore-review-engine",
  }));

  return regulatoryReviewOutputSchema.parse({
    reviewVersion: "certscore.v2.regulatory_review.1",
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    sourceReviewId: input.reviewId,
    scanId: input.scanId,
    url: input.url,
    areas,
    notes: [
      "Internal v2 localhost/admin regulatory review projection only.",
      "Rows are evidence-led review signals, not legal determinations.",
      "Unsupported or incomplete scanner coverage is projected as not testable, not as a positive result.",
    ],
  });
}

function projectRow(
  seed: RowSeed,
  candidatesByKey: Map<string, FindingCandidate>,
  moduleSet: Set<string>,
  coverageLimitations: CoverageLimitation[],
): RegulatoryReviewRow {
  const sessionReplayStrictRow = projectSessionReplayStrictRow(seed, candidatesByKey, moduleSet);
  if (sessionReplayStrictRow) {
    return sessionReplayStrictRow;
  }

  const sourceFindingKeys = seed.sourceFindingKeys ?? [];
  const candidates = sourceFindingKeys
    .map((key) => candidatesByKey.get(key))
    .filter((candidate): candidate is FindingCandidate => Boolean(candidate));
  const eligibleCandidates = candidates.filter((candidate) => candidate.eligibility.status === "eligible");
  const deferredCandidates = candidates.filter((candidate) => candidate.eligibility.status === "deferred");
  const requiredModules = seed.requiredModules ?? modulesRequiredByCandidates(candidates);
  const missingModules = requiredModules.filter((moduleName) => !moduleSet.has(moduleName));
  const relatedLimitations = coverageLimitations.filter((limitation) =>
    sourceFindingKeys.some((key) => limitation.affectedFindingKeys.includes(key)) ||
    requiredModules.some((moduleName) => limitation.sourceModulesRequired.includes(moduleName))
  );
  const incompleteMatchedCandidates = candidates.filter((candidate) =>
    candidate.eligibility.status === "not_eligible" &&
    candidate.matchedCriteria.length > 0 &&
    candidate.missingCorroborators.length > 0
  );

  const status: RegulatoryReviewRowStatus =
    eligibleCandidates.length > 0
      ? seed.matchedStatus ?? "review_signal"
      : deferredCandidates.length > 0 ||
          missingModules.length > 0 ||
          relatedLimitations.length > 0 ||
          (seed.evidenceCapability === "near_term_supported" && incompleteMatchedCandidates.length > 0)
        ? "not_testable"
        : seed.defaultStatus ?? defaultStatusForCapability(seed.evidenceCapability);

  return {
    id: seed.id,
    label: seed.label,
    note: noteForStatus(seed, status, eligibleCandidates, missingModules),
    status,
    evidenceCapability: seed.evidenceCapability,
    evidenceRefs: evidenceRefsForCandidates(eligibleCandidates.length > 0 ? eligibleCandidates : candidates),
    regulatoryMapping: seed.regulatoryMapping ?? [],
    sourceFindingKeys,
    missingOrIncompleteSourceSignals: missingSignalsForRow(
      seed,
      missingModules,
      relatedLimitations,
      deferredCandidates,
      eligibleCandidates,
    ),
  };
}

function noteForStatus(
  seed: RowSeed,
  status: RegulatoryReviewRowStatus,
  eligibleCandidates: FindingCandidate[],
  missingModules: string[],
) {
  if (eligibleCandidates.length > 0) {
    return seed.note;
  }
  if (status === "not_testable") {
    const missing = missingModules.length > 0 ? ` Missing module coverage: ${missingModules.join(", ")}.` : "";
    return `${seed.note} v2 did not retain enough source evidence to evaluate this row.${missing}`;
  }
  return seed.note;
}

function modulesRequiredByCandidates(candidates: FindingCandidate[]) {
  return uniqueStrings(candidates.flatMap((candidate) => candidate.sourceModulesRequired));
}

function defaultStatusForCapability(capability: RegulatoryReviewEvidenceCapability): RegulatoryReviewRowStatus {
  return capability === "policy_mapping_only" ? "not_testable" : "not_observed";
}

function evidenceRefsForCandidates(candidates: FindingCandidate[]) {
  return uniqueStrings(candidates.flatMap((candidate) => {
    const refs = candidate.sourceEvidenceRefs.map((ref) =>
      ref.label ?? ref.eventId ?? ref.artifactId ?? ref.refId
    );
    return refs.length > 0 ? refs : [candidate.title];
  })).slice(0, 8);
}

function missingSignalsForRow(
  seed: RowSeed,
  missingModules: string[],
  limitations: CoverageLimitation[],
  deferredCandidates: FindingCandidate[],
  eligibleCandidates: FindingCandidate[],
) {
  return uniqueStrings([
    seed.missingSignal,
    ...(seed.includeEligibleMissingCorroborators
      ? eligibleCandidates.flatMap((candidate) => candidate.missingCorroborators)
      : []),
    ...missingModules.map((moduleName) => `Missing or incomplete ${moduleName} coverage.`),
    ...limitations.map((limitation) => limitation.description),
    ...deferredCandidates.flatMap((candidate) => candidate.eligibility.reasons),
  ].filter((value): value is string => Boolean(value))).slice(0, 8);
}

function regulatoryAreaSeeds(): AreaSeed[] {
  return [
    {
      id: "california-privacy",
      navLabel: "CCPA/CPRA",
      title: "California CCPA / CPRA",
      subtitle: "Notice, opt-out, GPC, targeted advertising, and post-opt-out tracking review signals.",
      summary: "California privacy review is limited to retained public-web evidence relevant to CCPA / CPRA coverage that v2 can currently support.",
      maturityLabel: "Beta",
      rows: californiaRows(),
    },
    {
      id: "gdpr-eprivacy",
      navLabel: "GDPR/ePrivacy",
      title: "GDPR / ePrivacy",
      subtitle: "Pre-consent cookies/storage, tracking before consent, consent surface, reject path, post-choice controls, post-reject tracking, and endpoint review signals.",
      summary: "GDPR/ePrivacy review is limited to retained public-web evidence for consent and tracking behavior in the tested context.",
      maturityLabel: "Beta",
      rows: gdprRows(),
    },
  ];
}

function gdprRows(): RowSeed[] {
  return [
    row("pre_consent_cookies_storage", "Cookies or storage before consent", "Whether non-essential cookies or browser storage were observed before a recorded consent action.", "currently_supported", {
      sourceFindingKeys: ["third_party_cookie_pre_consent", "vendor_associated_cookie_pre_consent", "non_essential_storage_pre_consent"],
      matchedStatus: "gap_observed",
      requiredModules: [PRE_CONSENT_MODULE],
    }),
    row("pre_consent_third_party_tracking", "Pre-consent third-party tracking", "Whether analytics, advertising, cross-site measurement, or similar third-party requests were observed before recorded consent.", "currently_supported", {
      sourceFindingKeys: ["pre_consent_tracking_detected"],
      matchedStatus: "gap_observed",
      requiredModules: [PRE_CONSENT_MODULE],
    }),
    row("consent_surface_observed", "Consent banner / preference surface", "Whether an actionable cookie/consent banner or preference surface was observed in the tested context.", "currently_supported", {
      sourceFindingKeys: ["consent_banner_observed_or_not_observed"],
      matchedStatus: "checked",
      includeEligibleMissingCorroborators: true,
      requiredModules: [PRE_CONSENT_MODULE],
    }),
    row("cookie_notice_availability", "Cookie notice availability", "Whether a cookie notice, cookie policy, or equivalent cookie-specific disclosure surface was observed with retained bounded evidence.", "currently_supported", {
      sourceFindingKeys: ["cookie_policy_observed_or_not_observed"],
      matchedStatus: "checked",
      includeEligibleMissingCorroborators: true,
      requiredModules: [POLICY_SURFACE_MODULE],
    }),
    row("reject_all_path_availability", "Decline / reject option availability", "Whether a reject-all or equivalent refusal path was available from the observed consent surface.", "currently_supported", {
      sourceFindingKeys: ["reject_control_observed_or_not_observed", "reject_action_succeeded_or_not_testable"],
      matchedStatus: "checked",
      includeEligibleMissingCorroborators: true,
      requiredModules: [CONSENT_FLOW_MODULE],
    }),
    row("post_reject_tracking_reduction", "Tracking after refusal", "Whether non-essential tracking materially decreased after a reject action was recorded.", "currently_supported", {
      sourceFindingKeys: ["tracking_after_refusal_review_signal", "reject_did_not_reduce_tracking_review_signal", "vendors_persist_after_reject_review_signal", "cookies_persist_after_reject_review_signal"],
      matchedStatus: "review_signal",
      requiredModules: [CONSENT_FLOW_MODULE],
    }),
    row("accept_reject_parity", "Accept vs reject path comparability", "Whether v2 retained a comparable runtime measurement of accept and reject consent paths.", "currently_supported", {
      sourceFindingKeys: ["accept_reject_runtime_delta_observed"],
      matchedStatus: "review_signal",
      includeEligibleMissingCorroborators: true,
      requiredModules: [CONSENT_FLOW_MODULE],
    }),
    row("preference_withdrawal_control", "Post-choice consent controls", "Whether CertScore observed a way to reopen or change consent preferences after the initial choice.", "currently_supported", {
      sourceFindingKeys: ["post_choice_consent_control_observed"],
      matchedStatus: "checked",
      requiredModules: [CONSENT_FLOW_MODULE],
    }),
    row("session_replay_fingerprinting_review", "Session replay / fingerprinting review", "Whether retained runtime evidence showed session replay, behavioral recording, or fingerprinting-like signals.", "currently_supported", {
      sourceFindingKeys: ["session_replay_or_behavioral_analytics_observed"],
      matchedStatus: "review_signal",
      includeEligibleMissingCorroborators: true,
      requiredModules: [PRE_CONSENT_MODULE],
    }),
    row("session_replay_before_consent", "Session replay before consent", "Whether session replay or behavioral recording collection was observed before a recorded consent action.", "currently_supported", {
      sourceFindingKeys: ["session_replay_or_behavioral_analytics_observed"],
      matchedStatus: "gap_observed",
      requiredModules: [PRE_CONSENT_MODULE],
    }),
    row("session_replay_disclosure_alignment", "Session replay disclosure alignment", "Whether observed session replay or behavioral analytics vendors were clearly disclosed in reviewed privacy/cookie surfaces.", "currently_supported", {
      sourceFindingKeys: ["session_replay_or_behavioral_analytics_observed"],
      matchedStatus: "gap_observed",
      requiredModules: [PRE_CONSENT_MODULE, POLICY_SURFACE_MODULE],
    }),
    row("session_replay_sensitive_surface", "Session replay on sensitive surfaces", "Whether session replay or behavioral analytics was observed on the same page or flow as a sensitive collection surface.", "currently_supported", {
      sourceFindingKeys: ["session_replay_or_behavioral_analytics_observed"],
      matchedStatus: "gap_observed",
      requiredModules: [PRE_CONSENT_MODULE],
    }),
    row("session_replay_after_refusal", "Session replay after refusal / opt-out", "Whether session replay or behavioral analytics persisted after a successful reject or opt-out action proof.", "currently_supported", {
      sourceFindingKeys: ["session_replay_or_behavioral_analytics_observed"],
      matchedStatus: "gap_observed",
      requiredModules: [PRE_CONSENT_MODULE, CONSENT_FLOW_MODULE],
    }),
    row("policy_runtime_vendor_alignment_review", "Policy/runtime vendor alignment", "Whether retained policy evidence mentions vendors that overlap with resolved runtime tracking vendors.", "currently_supported", {
      sourceFindingKeys: ["policy_runtime_vendor_alignment_review_signal"],
      matchedStatus: "review_signal",
      includeEligibleMissingCorroborators: true,
      requiredModules: [PRE_CONSENT_MODULE, POLICY_SURFACE_MODULE],
    }),
    row("cross_border_endpoint_review", "Cross-border endpoint review", "Whether endpoint geography or transfer-review evidence was retained for observed third-party processing.", "currently_supported", {
      sourceFindingKeys: ["endpoint_transfer_review_signal"],
      matchedStatus: "review_signal",
      includeEligibleMissingCorroborators: true,
      requiredModules: [PRE_CONSENT_MODULE],
    }),
  ];
}

function californiaRows(): RowSeed[] {
  return [
    row("privacy_notice_availability", "Privacy notice availability", "Whether a public privacy notice or privacy policy was observed and reachable from the tested context.", "currently_supported", {
      includeEligibleMissingCorroborators: true,
      sourceFindingKeys: ["privacy_notice_observed_or_not_observed"],
      matchedStatus: "checked",
      requiredModules: [POLICY_SURFACE_MODULE],
    }),
    row("notice_at_collection", "Notice at collection", "Whether public collection-context surfaces included nearby privacy notice or disclosure cues.", "near_term_supported", {
      includeEligibleMissingCorroborators: true,
      sourceFindingKeys: ["notice_at_collection_observed"],
      matchedStatus: "checked",
      requiredModules: [POLICY_SURFACE_MODULE],
    }),
    row("do_not_sell_share_availability", "Do Not Sell or Share availability", "Whether a public Do Not Sell or Share opt-out path was observed in retained policy-surface evidence.", "currently_supported", {
      includeEligibleMissingCorroborators: true,
      sourceFindingKeys: ["do_not_sell_or_share_link_observed"],
      matchedStatus: "checked",
      requiredModules: [POLICY_SURFACE_MODULE],
    }),
    row("gpc_opt_out_signal_handling", "GPC / opt-out signal handling", "Whether an opt-out preference signal such as GPC was sent and appeared honored or recognized.", "near_term_supported", {
      sourceFindingKeys: ["gpc_runtime_probe_with_disclosure_observed", "gpc_disclosure_observed"],
      matchedStatus: "checked",
      includeEligibleMissingCorroborators: true,
      requiredModules: [POLICY_SURFACE_MODULE, CONSENT_FLOW_MODULE],
    }),
    row("targeted_advertising_signals", "Targeted advertising signals", "Whether advertising, retargeting, social pixel, or cross-context tracking signals were observed.", "currently_supported", {
      sourceFindingKeys: ["targeted_advertising_runtime_signal"],
      matchedStatus: "review_signal",
      requiredModules: [PRE_CONSENT_MODULE],
    }),
    row("post_opt_out_tracking_behavior", "Post-opt-out tracking behavior", "Whether targeted advertising, sale/share, or non-essential tracking decreased after opt-out or reject.", "near_term_supported", {
      sourceFindingKeys: ["post_opt_out_targeted_advertising_behavior_signal"],
      matchedStatus: "review_signal",
      requiredModules: [PRE_CONSENT_MODULE, CONSENT_FLOW_MODULE],
    }),
  ];
}

function projectSessionReplayStrictRow(
  seed: RowSeed,
  candidatesByKey: Map<string, FindingCandidate>,
  moduleSet: Set<string>,
): RegulatoryReviewRow | null {
  if (![
    "session_replay_before_consent",
    "session_replay_disclosure_alignment",
    "session_replay_sensitive_surface",
    "session_replay_after_refusal",
  ].includes(seed.id)) {
    return null;
  }

  const sourceFindingKeys = seed.sourceFindingKeys ?? ["session_replay_or_behavioral_analytics_observed"];
  const candidate = candidatesByKey.get("session_replay_or_behavioral_analytics_observed");
  const requiredModules = seed.requiredModules ?? [PRE_CONSENT_MODULE];
  const missingModules = requiredModules.filter((moduleName) => !moduleSet.has(moduleName));
  const observed = candidate?.eligibility.status === "eligible";
  const evidenceRefs = candidate ? evidenceRefsForCandidates([candidate]) : [];
  const missingCoverage = missingModules.map((moduleName) => `Missing or incomplete ${moduleName} coverage.`);

  if (!candidate || !observed) {
    return {
      id: seed.id,
      label: seed.label,
      note: seed.note,
      status: missingModules.length > 0 ? "not_testable" : "not_observed",
      evidenceCapability: seed.evidenceCapability,
      evidenceRefs,
      regulatoryMapping: seed.regulatoryMapping ?? [],
      sourceFindingKeys,
      missingOrIncompleteSourceSignals: missingCoverage,
    };
  }

  if (seed.id === "session_replay_before_consent") {
    const preConsentCollectionObserved =
      candidate.matchedCriteria.includes("collection_endpoint_observed") &&
      candidateHasPreConsentSessionReplaySource(candidate);
    return {
      id: seed.id,
      label: seed.label,
      note: preConsentCollectionObserved
        ? "Session replay or behavioral recording collection was retained before a recorded consent action."
        : "Session replay was observed, but retained evidence did not show session replay collection before a recorded consent action.",
      status: preConsentCollectionObserved ? "gap_observed" : "not_observed",
      evidenceCapability: seed.evidenceCapability,
      evidenceRefs,
      regulatoryMapping: seed.regulatoryMapping ?? [],
      sourceFindingKeys,
      missingOrIncompleteSourceSignals: preConsentCollectionObserved
        ? []
        : uniqueStrings([...missingCoverage, ...candidate.missingCorroborators]),
    };
  }

  const noteByRow: Record<string, string> = {
    session_replay_disclosure_alignment:
      "Session replay was observed, but retained policy/cookie disclosure comparison evidence was not available for this scan context.",
    session_replay_sensitive_surface:
      "Session replay was observed, but retained evidence did not show same-context sensitive-surface overlap.",
    session_replay_after_refusal:
      "Session replay after refusal was not testable because no successful reject or opt-out action proof was retained for comparison.",
  };
  const missingSignalByRow: Record<string, string> = {
    session_replay_disclosure_alignment:
      "Session replay vendor disclosure comparison evidence was not retained.",
    session_replay_sensitive_surface:
      "Sensitive-surface overlap evidence was not retained for observed session replay.",
    session_replay_after_refusal:
      "Post-refusal session replay comparison requires successful reject or opt-out action proof.",
  };

  return {
    id: seed.id,
    label: seed.label,
    note: noteByRow[seed.id] ?? seed.note,
    status: seed.id === "session_replay_sensitive_surface" ? "not_observed" : "not_testable",
    evidenceCapability: seed.evidenceCapability,
    evidenceRefs,
    regulatoryMapping: seed.regulatoryMapping ?? [],
    sourceFindingKeys,
    missingOrIncompleteSourceSignals: uniqueStrings([
      ...missingCoverage,
      missingSignalByRow[seed.id] ?? "",
    ]),
  };
}

function candidateHasPreConsentSessionReplaySource(candidate: FindingCandidate) {
  return candidate.relatedVendors.some((vendor) =>
    vendor.matchSources.some((source) =>
      source.consentStateAtTime === "pre_consent" &&
      (
        source.sourceScanner === PRE_CONSENT_MODULE ||
        source.scenario === "fresh_pre_consent" ||
        source.scenario === "baseline_pre_consent" ||
        source.scenario === "gpc_enabled"
      )
    )
  );
}

function row(
  id: string,
  label: string,
  note: string,
  evidenceCapability: RegulatoryReviewEvidenceCapability,
  extra: Partial<RowSeed> = {},
): RowSeed {
  return {
    id,
    label,
    note,
    evidenceCapability,
    ...extra,
  };
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}
