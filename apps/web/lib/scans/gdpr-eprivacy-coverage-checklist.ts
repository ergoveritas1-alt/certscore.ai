import type { UnifiedFindingDisplayPacket } from "./unified-findings";
import type { CertScoreFindingEvidenceDetails } from "./finding-registry";
import type {
  GdprEprivacyCoverageCriticalEvidence,
  GdprEprivacyCoverageOutcome,
  GdprEprivacyCoverageSourceSignalGap
} from "./gdpr-eprivacy-coverage-policy";
import { buildRegulatoryChecklistEvidenceHighlights } from "./regulatory-checklist-evidence-highlights";
import { getRuntimeVendorDisclosureEvidence } from "./runtime-vendor-disclosure";

export type GdprEprivacyCoverageChecklistStatus =
  | "Observed"
  | "Not observed"
  | "Not testable"
  | "Gap observed"
  | "Review signal"
  | "Insufficient evidence"
  | "Out of scope";

export type GdprEprivacyCoverageChecklistTone = "neutral" | "review" | "warning" | "muted";

export type RegulatoryEvidenceState = "observed" | "not_observed" | "not_testable" | "not_applicable";

export type RegulatoryAssessmentStatus =
  | "gap_observed"
  | "review_signal"
  | "checked"
  | "coverage_limitation"
  | "not_applicable";

export type GdprEprivacyCoverageChecklistItem = {
  assessmentStatus: RegulatoryAssessmentStatus;
  criticalEvidence: GdprEprivacyCoverageCriticalEvidence;
  evidenceState: RegulatoryEvidenceState;
  id: string;
  label: string;
  note: string;
  status: GdprEprivacyCoverageChecklistStatus;
  tone: GdprEprivacyCoverageChecklistTone;
  explanation: string;
  evidenceRefs: string[];
  limitation?: string;
};

type ChecklistRowDefinition = {
  id: string;
  label: string;
  explanation: string;
  findingIds: string[];
  defaultFindingStatus: Exclude<GdprEprivacyCoverageChecklistStatus, "Not observed" | "Not testable" | "Out of scope">;
  notObservedText: string;
  requiresPublicWebCoverage?: boolean;
};

export type GdprEprivacyCoverageChecklistInput = {
  coverageLimited: boolean;
  coverageOutcomes?: Record<string, GdprEprivacyCoverageOutcome>;
  projectedFindings?: Array<{
    evidenceDetails?: CertScoreFindingEvidenceDetails;
    evidencePreview?: string[];
    id: string;
    label: string;
  }>;
  scanCompleted: boolean;
  unifiedFindings: UnifiedFindingDisplayPacket[];
};

const CHECKLIST_ROWS: ChecklistRowDefinition[] = [
  {
    id: "consent_surface_observed",
    label: "Consent banner / preference surface",
    explanation: "Whether an actionable cookie/consent banner or preference surface was observed in the tested context.",
    findingIds: [],
    defaultFindingStatus: "Observed",
    notObservedText: "No actionable consent surface issue was surfaced from the canonical report findings.",
    requiresPublicWebCoverage: true
  },
  {
    id: "pre_consent_cookies_storage",
    label: "Cookies or storage before consent",
    explanation: "Whether non-essential cookies or browser storage were observed before a recorded consent action.",
    findingIds: [
      "adtech_cookie_pre_consent",
      "analytics_cookie_pre_consent",
      "third_party_cookie_pre_consent"
    ],
    defaultFindingStatus: "Gap observed",
    notObservedText: "No pre-consent non-essential cookie or storage finding was surfaced in this scan context.",
    requiresPublicWebCoverage: true
  },
  {
    id: "pre_consent_third_party_tracking",
    label: "Pre-consent third-party tracking",
    explanation: "Whether analytics, advertising, cross-site measurement, or similar third-party requests were observed before recorded consent.",
    findingIds: [
      "preconsent_tracking",
      "pre_consent_tracking_detected",
      "third_party_tracking_pre_consent"
    ],
    defaultFindingStatus: "Gap observed",
    notObservedText: "No pre-consent third-party tracking finding was surfaced in this scan context.",
    requiresPublicWebCoverage: true
  },
  {
    id: "reject_all_path_availability",
    label: "Decline / reject option availability",
    explanation: "Whether a reject-all or equivalent refusal path was available from the observed consent surface.",
    findingIds: [
      "accept_only_banner",
      "dismiss_without_reject",
      "forced_consent_wall",
      "accept_more_prominent_than_reject",
      "reject_button_missing",
      "reject_option_missing_or_hidden"
    ],
    defaultFindingStatus: "Gap observed",
    notObservedText: "No reject-path availability finding was surfaced in this scan context.",
    requiresPublicWebCoverage: true
  },
  {
    id: "post_reject_tracking_reduction",
    label: "Tracking after refusal",
    explanation: "Whether non-essential tracking materially decreased after a reject action was recorded.",
    findingIds: [
      "reject_did_not_reduce_tracking",
      "reject_did_not_reduce_third_party_cookies",
      "reject_tracking_persists_after_reject"
    ],
    defaultFindingStatus: "Gap observed",
    notObservedText: "No post-reject tracking persistence finding was surfaced in this scan context.",
    requiresPublicWebCoverage: true
  },
  {
    id: "preference_withdrawal_control",
    label: "Post-choice consent controls",
    explanation: "Whether CertScore observed a way to reopen or change consent preferences after the initial choice.",
    findingIds: [
      "consent_control_not_reopenable",
      "consent_preference_reopen_control_not_observed"
    ],
    defaultFindingStatus: "Gap observed",
    notObservedText: "No consent preference reopen-control finding was surfaced in this scan context.",
    requiresPublicWebCoverage: true
  },
  {
    id: "runtime_vendor_disclosure_alignment",
    label: "Runtime vendors vs. disclosures",
    explanation: "Whether observed runtime vendors were clearly matched by name or known domain alias in reviewed public privacy/cookie disclosures.",
    findingIds: [
      "cookie_disclosure_gap",
      "do_not_sell_sharing_disclosure_conflict",
      "missing_technical_disclosure",
      "policy_behavior_conflict",
      "policy_behavior_contradiction_detected",
      "session_replay_undisclosed",
      "third_party_recipient_disclosure_missing"
    ],
    defaultFindingStatus: "Review signal",
    notObservedText: "No runtime vendor disclosure-alignment finding was surfaced in this scan context.",
    requiresPublicWebCoverage: true
  },
  {
    id: "sensitive_surfaces_third_party_tracking",
    label: "Sensitive surfaces with third-party tracking",
    explanation: "Whether forms or sensitive flows appeared alongside third-party tracking or measurement scripts.",
    findingIds: [
      "sensitive_collection_surface_observed",
      "sensitive_data_collection_with_third_party_tracking_present"
    ],
    defaultFindingStatus: "Review signal",
    notObservedText: "No sensitive-surface third-party tracking finding was surfaced in this scan context.",
    requiresPublicWebCoverage: true
  },
  {
    id: "session_replay_fingerprinting_review",
    label: "Session replay / behavioral analytics",
    explanation: "Whether session replay, behavioral recording, or behavioral analytics signals were observed in the tested context.",
    findingIds: [
      "fingerprinting_observed",
      "fingerprinting_related_signals_observed",
      "possible_session_replay_on_sensitive_input_surface",
      "probable_fingerprinting",
      "session_replay_observed",
      "session_replay_present_with_sensitive_surfaces_observed",
      "session_recording_services_detected"
    ],
    defaultFindingStatus: "Review signal",
    notObservedText: "No session replay or fingerprinting-related finding was surfaced in this scan context.",
    requiresPublicWebCoverage: true
  },
  {
    id: "cross_border_endpoint_review",
    label: "Cross-border analytics / tracking endpoint review",
    explanation: "Whether transfer-relevant analytics, behavioral tracking, adtech, or identifier-bearing third-party endpoints were observed.",
    findingIds: [
      "cross_border_endpoint_transfer_review_signal",
      "cross_border_vendor_disclosure_gap",
      "missing_transfer_disclosure"
    ],
    defaultFindingStatus: "Review signal",
    notObservedText: "No public-web cross-border endpoint review finding was surfaced in this scan context.",
    requiresPublicWebCoverage: true
  },
  {
    id: "accessibility_consent_controls",
    label: "Accessibility of consent controls",
    explanation: "Whether consent controls appeared reachable and understandable through basic automated accessibility checks.",
    findingIds: [],
    defaultFindingStatus: "Review signal",
    notObservedText: "No consent-control accessibility finding was surfaced in this scan context.",
    requiresPublicWebCoverage: true
  }
];

function getChecklistTone(status: GdprEprivacyCoverageChecklistStatus): GdprEprivacyCoverageChecklistTone {
  switch (status) {
    case "Gap observed":
    case "Review signal":
    case "Insufficient evidence":
    case "Observed":
      return "warning";
    case "Out of scope":
      return "muted";
    default:
      return "neutral";
  }
}

function getAssessmentStatus(status: GdprEprivacyCoverageChecklistStatus): RegulatoryAssessmentStatus {
  switch (status) {
    case "Gap observed":
      return "gap_observed";
    case "Review signal":
      return "review_signal";
    case "Insufficient evidence":
    case "Not testable":
      return "coverage_limitation";
    case "Out of scope":
      return "not_applicable";
    case "Observed":
    case "Not observed":
    default:
      return "checked";
  }
}

function getEvidenceState(input: {
  id: string;
  status: GdprEprivacyCoverageChecklistStatus;
  assessmentStatus: RegulatoryAssessmentStatus;
}): RegulatoryEvidenceState {
  if (input.status === "Not testable" || input.status === "Insufficient evidence" || input.assessmentStatus === "coverage_limitation") {
    return "not_testable";
  }
  if (input.status === "Out of scope" || input.assessmentStatus === "not_applicable") {
    return "not_applicable";
  }
  if (input.status === "Not observed") {
    return "not_observed";
  }
  if (
    input.status === "Gap observed" &&
    (
      input.id === "reject_all_path_availability" ||
      input.id === "preference_withdrawal_control"
    )
  ) {
    return "not_observed";
  }

  return "observed";
}

function buildChecklistItem(input: {
  criticalEvidence: GdprEprivacyCoverageCriticalEvidence;
  evidenceRefs: string[];
  explanation: string;
  id: string;
  label: string;
  limitation?: string;
  status: GdprEprivacyCoverageChecklistStatus;
}): GdprEprivacyCoverageChecklistItem {
  const assessmentStatus = getAssessmentStatus(input.status);
  const evidenceState = getEvidenceState({
    assessmentStatus,
    id: input.id,
    status: input.status
  });

  return {
    assessmentStatus,
    criticalEvidence: input.criticalEvidence,
    evidenceRefs: input.evidenceRefs,
    evidenceState,
    explanation: input.explanation,
    id: input.id,
    label: input.label,
    limitation: input.limitation,
    note: input.explanation,
    status: input.status,
    tone: getChecklistTone(input.status)
  };
}

function compactEvidenceRef(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.length <= 140) {
    return trimmed;
  }

  return `${trimmed.slice(0, 137).trimEnd()}...`;
}

function formatSourceRef(ref: UnifiedFindingDisplayPacket["sourceRefs"][number]) {
  switch (ref.kind) {
    case "signal":
      return `Signal: ${ref.label ?? ref.key}`;
    case "validation":
      return `Validation: ${ref.title ?? ref.ruleKey}`;
    case "issue":
      return `Review issue: ${ref.title}`;
    default:
      return null;
  }
}

function getEvidenceRefs(findings: UnifiedFindingDisplayPacket[]) {
  const refs = new Set<string>();

  for (const finding of findings) {
    refs.add(finding.presentation?.findingName || finding.title || finding.unifiedFindingId);

    for (const sourceRef of finding.sourceRefs ?? []) {
      const formatted = formatSourceRef(sourceRef);
      if (formatted) {
        refs.add(formatted);
      }
    }

    for (const artifact of finding.evidence?.flags ?? []) {
      refs.add(`Evidence flag: ${artifact}`);
    }
    for (const artifact of finding.concernContext?.evidenceStrengthFlags ?? []) {
      refs.add(`Evidence strength: ${artifact.replaceAll("_", " ")}`);
    }
    for (const url of [...(finding.evidence?.pageUrls ?? []), ...(finding.evidence?.sourceUrls ?? [])]) {
      refs.add(`Source: ${url}`);
    }
  }

  return [...refs].flatMap((value) => {
    const compact = compactEvidenceRef(value);
    return compact ? [compact] : [];
  }).slice(0, 6);
}

function getProjectedEvidenceRefs(findings: NonNullable<GdprEprivacyCoverageChecklistInput["projectedFindings"]>) {
  const refs = new Set<string>();

  for (const finding of findings) {
    refs.add(finding.label);
    for (const preview of finding.evidencePreview ?? []) {
      refs.add(preview);
    }
  }

  return [...refs].flatMap((value) => {
    const compact = compactEvidenceRef(value);
    return compact ? [compact] : [];
  }).slice(0, 6);
}

function normalizeFindingStatus(
  definition: ChecklistRowDefinition,
  findings: UnifiedFindingDisplayPacket[]
): Exclude<GdprEprivacyCoverageChecklistStatus, "Not observed" | "Not testable" | "Out of scope"> {
  if (
    findings.some((finding) =>
      isRuntimeVendorDisclosureAlignmentGapEvidence(definition.id, finding) ||
      isCrossBorderDisclosureGapEvidence(definition.id, finding) ||
      isSensitiveSurfaceGapEvidence(definition.id, finding)
    )
  ) {
    return "Gap observed";
  }

  if (
    definition.defaultFindingStatus !== "Observed" &&
    findings.some((finding) => !isFindingPresentationStatusSufficientForCoverageRow(definition.id, finding))
  ) {
    return "Insufficient evidence";
  }

  return definition.defaultFindingStatus;
}

function isCrossBorderDisclosureGapEvidence(rowId: string, finding: UnifiedFindingDisplayPacket) {
  if (rowId !== "cross_border_endpoint_review") {
    return false;
  }

  if (finding.unifiedFindingId === "cross_border_vendor_disclosure_gap") {
    return true;
  }

  if (finding.unifiedFindingId !== "missing_transfer_disclosure") {
    return false;
  }

  const entities = finding.evidence?.entities ?? {};
  return entities.crossBorderDisclosureGapBasis?.some((value) => value === "transfer_endpoint_runtime_vendor_not_disclosed") === true;
}

function isRuntimeVendorDisclosureAlignmentGapEvidence(rowId: string, finding: UnifiedFindingDisplayPacket) {
  if (
    rowId !== "runtime_vendor_disclosure_alignment" ||
    !(
      finding.unifiedFindingId === "policy_behavior_conflict" ||
      finding.unifiedFindingId === "policy_behavior_contradiction_detected" ||
      finding.unifiedFindingId === "cookie_disclosure_gap"
    )
  ) {
    return false;
  }

  const entities = finding.evidence?.entities ?? {};
  const subtypes = entities.findingSubtype ?? [];
  const hasRuntimeVendorNotDisclosedSubtype = Array.isArray(subtypes) &&
    subtypes.some((subtype) => subtype === "runtime_vendor_not_disclosed");
  const disclosureRows = getRuntimeVendorDisclosureEvidence(entities);
  return (
    hasRuntimeVendorNotDisclosedSubtype &&
    disclosureRows.some((row) => {
      const unmatchedRuntimeCount = row.unmatchedRuntimeVendors.length + row.unmatchedRuntimeDomains.length;
      const observedRuntimeCount = row.observedRuntimeVendors.length + row.observedRuntimeDomains.length;
      const reachedPolicySurfaces = row.policySurfacesSearched.filter((surface) =>
        surface.reached && Boolean(surface.url) && Boolean(surface.snippet)
      ).length;
      return (
        row.coverageStatus === "usable" &&
        row.directVsInferred !== "inferred" &&
        observedRuntimeCount > 0 &&
        unmatchedRuntimeCount > 0 &&
        row.unmatchedVendorDisclosureCount > 0 &&
        reachedPolicySurfaces > 0
      );
    })
  );
}

function isRuntimeVendorDisclosureAlignmentEvidence(rowId: string, finding: UnifiedFindingDisplayPacket) {
  return (
    rowId === "runtime_vendor_disclosure_alignment" &&
    finding.unifiedFindingId === "policy_behavior_conflict" &&
    (
      finding.evidence?.entities?.findingSubtype?.includes("runtime_vendor_not_disclosed") ||
      (finding.evidence?.entities?.runtimeVendorDisclosureEvidence?.length ?? 0) > 0
    )
  );
}

function isSensitiveSurfaceReviewEvidence(rowId: string, finding: UnifiedFindingDisplayPacket) {
  return (
    rowId === "sensitive_surfaces_third_party_tracking" &&
    finding.unifiedFindingId === "sensitive_collection_surface_observed"
  );
}

function isSensitiveSurfaceGapEvidence(rowId: string, finding: UnifiedFindingDisplayPacket) {
  return (
    rowId === "sensitive_surfaces_third_party_tracking" &&
    finding.unifiedFindingId === "sensitive_data_collection_with_third_party_tracking_present"
  );
}

function isFindingPresentationStatusSufficientForCoverageRow(rowId: string, finding: UnifiedFindingDisplayPacket) {
  if (finding.presentationDecision.status === "surface") {
    return true;
  }

  return (
    isRuntimeVendorDisclosureAlignmentEvidence(rowId, finding) ||
    isSensitiveSurfaceReviewEvidence(rowId, finding)
  );
}

function getSessionReplayEvidenceFromOutcome(outcome: GdprEprivacyCoverageOutcome | undefined) {
  const evidence = outcome?.criticalEvidence.retainedEvidence.sessionReplayEvidence;
  return evidence && typeof evidence === "object" && !Array.isArray(evidence)
    ? evidence as Record<string, unknown>
    : null;
}

function getStringArrayEntity(values: unknown) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values.filter((value): value is string => typeof value === "string" && value.trim().length > 0);
}

function sessionReplayEvidenceHasPreConsentSignal(evidence: Record<string, unknown> | null) {
  return (
    evidence?.preConsentObserved === true ||
    getStringArrayEntity(evidence?.consentStates).some((value) => /pre[_ -]?consent/i.test(value))
  );
}

function sessionReplayEvidenceHasPostConsentSignal(evidence: Record<string, unknown> | null) {
  return (
    evidence?.postAcceptObserved === true ||
    getStringArrayEntity(evidence?.consentStates).some((value) => /post[_ -]?(?:accept|consent)|after[_ -]?consent/i.test(value))
  );
}

function getSessionReplayVendorsFromEvidence(evidence: Record<string, unknown> | null) {
  return getStringArrayEntity(evidence?.vendors);
}

function getSessionReplayFindingVendors(findings: UnifiedFindingDisplayPacket[]) {
  const vendors = new Set<string>();

  for (const finding of findings) {
    const entities = finding.evidence?.entities ?? {};
    for (const key of [
      "sessionReplayVendors",
      "session_replay_runtime_vendors",
      "runtimeVendors",
      "vendors"
    ]) {
      for (const vendor of getStringArrayEntity(entities[key])) {
        vendors.add(vendor);
      }
    }
  }

  return [...vendors];
}

function hasSessionReplayFindingPreConsentEvidence(findings: UnifiedFindingDisplayPacket[]) {
  return findings.some((finding) => {
    const entities = finding.evidence?.entities ?? {};
    return (
      getStringArrayEntity(entities.consentStates).some((value) => /pre[_ -]?consent/i.test(value)) ||
      getStringArrayEntity(entities.runtimePhase).some((value) => /pre[_ -]?consent/i.test(value)) ||
      (finding.evidence?.flags ?? []).some((value) => /pre[_ -]?consent/i.test(value))
    );
  });
}

function hasSessionReplayGapFinding(findings: UnifiedFindingDisplayPacket[]) {
  return findings.some((finding) =>
    finding.unifiedFindingId === "possible_session_replay_on_sensitive_input_surface" ||
    finding.unifiedFindingId === "session_replay_present_with_sensitive_surfaces_observed" ||
    finding.unifiedFindingId === "session_replay_undisclosed"
  );
}

function formatVendorPhrase(vendors: string[]) {
  if (vendors.length === 0) {
    return null;
  }

  if (vendors.length === 1) {
    return vendors[0] ?? null;
  }

  if (vendors.length === 2) {
    return `${vendors[0]} and ${vendors[1]}`;
  }

  return `${vendors.slice(0, -1).join(", ")}, and ${vendors.at(-1)}`;
}

function getFindingEntityStrings(findings: UnifiedFindingDisplayPacket[], keys: string[]) {
  const values = new Set<string>();

  for (const finding of findings) {
    const entities = finding.evidence?.entities ?? {};
    for (const key of keys) {
      const entityValues = entities[key];
      if (!Array.isArray(entityValues)) {
        continue;
      }
      for (const value of entityValues) {
        if (typeof value === "string" && value.trim().length > 0) {
          values.add(value.trim());
        }
      }
    }
  }

  return [...values];
}

function getFindingEntityRows(findings: UnifiedFindingDisplayPacket[], keys: string[]) {
  const rows: Record<string, unknown>[] = [];

  for (const finding of findings) {
    const entities = finding.evidence?.entities ?? {};
    for (const key of keys) {
      const entityValues = entities[key];
      if (!Array.isArray(entityValues)) {
        continue;
      }
      for (const value of entityValues) {
        if (value && typeof value === "object" && !Array.isArray(value)) {
          rows.push(value as Record<string, unknown>);
          continue;
        }
        if (typeof value !== "string") {
          continue;
        }
        try {
          const parsed = JSON.parse(value) as unknown;
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            rows.push(parsed as Record<string, unknown>);
          }
        } catch {
          // Keep malformed row strings in Advanced Evidence only.
        }
      }
    }
  }

  return rows;
}

function getStringValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function uniqueEntityStrings(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function isTransferRelevantVendorName(value: string) {
  return /google tag manager|google analytics|microsoft clarity|hotjar|contentsquare|fullstory|logrocket|segment|mixpanel|amplitude|meta|facebook|google ads|doubleclick|bing|microsoft advertising|linkedin|appnexus|xandr|tiktok/i.test(value);
}

function buildCrossBorderEndpointEvidenceHighlights(findings: UnifiedFindingDisplayPacket[]) {
  const endpointRows = getFindingEntityRows(findings, [
    "endpointJurisdictionEvidence",
    "crossBorderEndpointEvidence"
  ]);
  const vendors = uniqueEntityStrings([
    ...getFindingEntityStrings(findings, [
      "endpointTransferReviewVendors",
      "observedRuntimeVendors",
      "runtimeVendors",
      "relatedVendors",
      "unmatchedRuntimeVendors"
    ]),
    ...endpointRows.flatMap((row) => [
      getStringValue(row.matchedVendorName),
      getStringValue(row.matched_vendor_name),
      getStringValue(row.vendor),
      getStringValue(row.vendorName),
      getStringValue(row.vendor_name)
    ])
  ]).filter(isTransferRelevantVendorName);

  if (vendors.length === 0) {
    return [];
  }

  return [
    `Transfer-relevant advertising, analytics, or behavioral tracking endpoints were observed for ${formatVendorPhrase(vendors.slice(0, 6))}. Additional third-party asset endpoints were retained as supporting runtime context.`
  ];
}

function getRowEvidenceHighlights(input: {
  findings: UnifiedFindingDisplayPacket[];
  projectedFindings: NonNullable<GdprEprivacyCoverageChecklistInput["projectedFindings"]>;
  rowId: string;
}) {
  if (input.rowId === "cross_border_endpoint_review") {
    const crossBorderHighlights = buildCrossBorderEndpointEvidenceHighlights(input.findings);
    if (crossBorderHighlights.length > 0) {
      return crossBorderHighlights;
    }
  }

  return input.projectedFindings.flatMap(buildRegulatoryChecklistEvidenceHighlights).slice(0, 3);
}

function specializeSessionReplayChecklistRow(input: {
  definition: ChecklistRowDefinition;
  evidenceRefs: string[];
  findings: UnifiedFindingDisplayPacket[];
  status: GdprEprivacyCoverageChecklistStatus;
  coverageOutcome?: GdprEprivacyCoverageOutcome;
}) {
  if (input.definition.id !== "session_replay_fingerprinting_review") {
    return {
      evidenceRefs: input.evidenceRefs,
      explanation: input.definition.explanation,
      label: input.definition.label,
      status: input.status
    };
  }

  const outcomeEvidence = getSessionReplayEvidenceFromOutcome(input.coverageOutcome);
  const vendors = [
    ...new Set([
      ...getSessionReplayFindingVendors(input.findings),
      ...getSessionReplayVendorsFromEvidence(outcomeEvidence)
    ])
  ];
  const vendorPhrase = formatVendorPhrase(vendors);
  const preConsentObserved =
    (input.status === "Gap observed" || input.coverageOutcome?.status === "Gap observed") &&
    (
      sessionReplayEvidenceHasPreConsentSignal(outcomeEvidence) ||
      hasSessionReplayFindingPreConsentEvidence(input.findings)
    );
  const gapObserved = input.status === "Gap observed" || input.coverageOutcome?.status === "Gap observed" || hasSessionReplayGapFinding(input.findings);
  const postConsentOrNotPreConsent =
    sessionReplayEvidenceHasPostConsentSignal(outcomeEvidence) ||
    outcomeEvidence?.preConsentObserved === false ||
    /pre-consent replay (?:not retained|evidence was not retained|evidence retained)/i.test(input.coverageOutcome?.limitation ?? "") ||
    input.findings.some((finding) => finding.unifiedFindingId === "session_replay_observed" || finding.unifiedFindingId === "session_recording_services_detected");

  if (gapObserved) {
    return {
      evidenceRefs: input.evidenceRefs,
      explanation: preConsentObserved
        ? "CertScore observed session replay or behavioral analytics before a recorded consent action. Review consent timing, disclosure, masking/exclusion settings, sensitive-page coverage, and withdrawal controls."
        : "CertScore observed session replay or behavioral analytics in a higher-risk context, such as sensitive-surface co-presence, disclosure mismatch, post-reject persistence, or retained payload exposure. Review consent timing, disclosure, masking/exclusion settings, sensitive-page coverage, and withdrawal controls.",
      label: preConsentObserved
        ? "Session replay before consent observed"
        : "Session replay disclosure or sensitive-surface gap observed",
      status: "Gap observed" as const
    };
  }

  if (input.status === "Observed" || input.status === "Review signal" || postConsentOrNotPreConsent) {
    const timingPhrase = sessionReplayEvidenceHasPostConsentSignal(outcomeEvidence)
      ? "observed after the pre-consent phase"
      : "not observed pre-consent in retained evidence";
    return {
      evidenceRefs: input.evidenceRefs,
      explanation: `CertScore observed session replay or behavioral analytics vendors ${timingPhrase}${vendorPhrase ? `, including ${vendorPhrase}` : ""}. Because these tools can capture user interaction behavior, review consent timing, disclosure, masking/exclusion settings, sensitive-page coverage, and withdrawal controls.`,
      label: "Session replay / behavioral analytics observed",
      status: "Review signal" as const
    };
  }

  if (input.status === "Not observed") {
    return {
      evidenceRefs: input.evidenceRefs,
      explanation: "No eligible session replay, behavioral recording, or fingerprinting-like signal was observed in the tested context.",
      label: "No session replay / behavioral analytics observed",
      status: input.status
    };
  }

  if (input.status === "Not testable") {
    return {
      evidenceRefs: input.evidenceRefs,
      explanation: "Session replay and behavioral analytics review was not testable from retained runtime evidence for this scan context.",
      label: "Session replay review not testable",
      status: input.status
    };
  }

  return {
    evidenceRefs: input.evidenceRefs,
    explanation: input.definition.explanation,
    label: input.definition.label,
    status: input.status
  };
}

function specializeChecklistRow(input: {
  definition: ChecklistRowDefinition;
  evidenceRefs: string[];
  findings: UnifiedFindingDisplayPacket[];
  status: GdprEprivacyCoverageChecklistStatus;
  coverageOutcome?: GdprEprivacyCoverageOutcome;
}) {
  if (input.definition.id === "session_replay_fingerprinting_review") {
    return specializeSessionReplayChecklistRow(input);
  }

  if (input.definition.id === "consent_surface_observed" && input.status === "Observed") {
    return {
      evidenceRefs: input.evidenceRefs,
      explanation: "An actionable cookie/consent banner or preference surface was observed in the tested context.",
      label: input.definition.label,
      status: "Observed" as const
    };
  }

  if (input.definition.id === "preference_withdrawal_control" && input.status === "Gap observed") {
    return {
      evidenceRefs: input.evidenceRefs,
      explanation:
        "No obvious cookie preferences, privacy settings, or consent-preference reopen control was observed after the recorded consent choice in the tested context.",
      label: input.definition.label,
      status: "Gap observed" as const
    };
  }

  if (input.definition.id === "runtime_vendor_disclosure_alignment" && input.status === "Gap observed") {
    const extractionQualityNote = hasLimitedDisclosureSnippetEvidence(input.findings)
      ? " Reviewed disclosure surfaces were reached, but retained snippets appear limited; verify full policy/cookie disclosure coverage during manual review."
      : "";
    return {
      evidenceRefs: input.evidenceRefs,
      explanation:
        `Observed runtime vendors were not clearly matched by name or known domain alias in the reviewed public privacy / cookie disclosures.${extractionQualityNote}`,
      label: input.definition.label,
      status: "Gap observed" as const
    };
  }

  if (input.definition.id === "cross_border_endpoint_review" && input.status === "Gap observed") {
    return {
      evidenceRefs: input.evidenceRefs,
      explanation:
        "Transfer-relevant third-party analytics or behavioral tracking endpoints were observed, and associated runtime vendors were not clearly matched in retained public disclosure evidence.",
      label: input.definition.label,
      status: "Gap observed" as const
    };
  }

  if (input.definition.id === "reject_all_path_availability" && input.status === "Observed") {
    return {
      evidenceRefs: input.evidenceRefs,
      explanation: "A reject-all or equivalent refusal path was observed from the consent surface in the tested context.",
      label: input.definition.label,
      status: "Observed" as const
    };
  }

  if (input.definition.id === "sensitive_surfaces_third_party_tracking" && input.status === "Not observed") {
    return {
      evidenceRefs: input.evidenceRefs,
      explanation:
        "Sensitive-field correlation completed and did not retain eligible sensitive fields alongside third-party tracking in the tested context.",
      label: input.definition.label,
      status: "Not observed" as const
    };
  }

  if (input.definition.id === "accessibility_consent_controls" && input.status === "Not observed") {
    return {
      evidenceRefs: input.evidenceRefs,
      explanation:
        "No automated accessibility issue was retained for the consent banner, preference center, or privacy-choice controls in the tested context.",
      label: input.definition.label,
      status: "Not observed" as const
    };
  }

  return {
    evidenceRefs: input.evidenceRefs,
    explanation: input.definition.explanation,
    label: input.definition.label,
    status: input.status
  };
}

function isFindingEligibleForCoverageRow(rowId: string, finding: UnifiedFindingDisplayPacket) {
  if (rowId === "post_reject_tracking_reduction") {
    return hasConfirmedPostRejectEvidence(finding);
  }

  if (rowId === "cross_border_endpoint_review" && finding.unifiedFindingId === "cross_border_vendor_disclosure_gap") {
    return isCrossBorderDisclosureGapEvidence(rowId, finding);
  }

  if (rowId === "cross_border_endpoint_review" && finding.unifiedFindingId === "missing_transfer_disclosure") {
    return isCrossBorderDisclosureGapEvidence(rowId, finding);
  }

  return true;
}

function isProjectedFindingEligibleForCoverageRow(
  rowId: string,
  finding: NonNullable<GdprEprivacyCoverageChecklistInput["projectedFindings"]>[number]
) {
  if (rowId === "post_reject_tracking_reduction") {
    return hasConfirmedProjectedPostRejectEvidence(finding);
  }

  if (rowId === "cross_border_endpoint_review" && finding.id === "missing_transfer_disclosure") {
    return false;
  }

  return true;
}

function getRecordValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function getNestedRecord(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = getRecordValue(record?.[key]);
    if (value) {
      return value;
    }
  }
  return null;
}

function getNestedBoolean(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "boolean") {
      return value;
    }
  }
  return null;
}

function parseEntityRecords(values: unknown) {
  if (!Array.isArray(values)) {
    return [];
  }
  return values.flatMap((value): Record<string, unknown>[] => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return [value as Record<string, unknown>];
    }
    if (typeof value !== "string") {
      return [];
    }
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? [parsed as Record<string, unknown>]
        : [];
    } catch {
      return [];
    }
  });
}

function postRejectEvidenceHasConfirmedWindow(evidence: Record<string, unknown> | null | undefined) {
  if (!evidence) {
    return false;
  }
  const reductionEvidence = getNestedRecord(evidence, [
    "postRejectTrackingReductionEvidence",
    "post_reject_tracking_reduction_evidence",
    "postRejectEvidence",
    "post_reject_evidence"
  ]) ?? evidence;
  return (
    getNestedBoolean(reductionEvidence, ["rejectInteractionConfirmed", "reject_interaction_confirmed"]) === true &&
    getNestedBoolean(reductionEvidence, ["postRejectWindowAvailable", "post_reject_window_available"]) === true
  );
}

function hasConfirmedPostRejectEvidence(finding: UnifiedFindingDisplayPacket) {
  if (!(finding.evidence?.flags ?? []).includes("reject_evidence_confirmed")) {
    return false;
  }
  const entities = finding.evidence?.entities ?? {};
  return (
    postRejectEvidenceHasConfirmedWindow(entities as Record<string, unknown>) ||
    parseEntityRecords(entities.postRejectTrackingReductionEvidence).some(postRejectEvidenceHasConfirmedWindow) ||
    parseEntityRecords(entities.postRejectEvidence).some(postRejectEvidenceHasConfirmedWindow)
  );
}

function hasConfirmedProjectedPostRejectEvidence(
  finding: NonNullable<GdprEprivacyCoverageChecklistInput["projectedFindings"]>[number]
) {
  return postRejectEvidenceHasConfirmedWindow(finding.evidenceDetails as Record<string, unknown> | undefined);
}

function hasLimitedDisclosureSnippetEvidence(findings: UnifiedFindingDisplayPacket[]) {
  const rows = getFindingEntityRows(findings, ["runtimeVendorDisclosureEvidence"]);
  const snippets = rows.flatMap((row) => {
    const policySurfaces = Array.isArray(row.policySurfacesSearched)
      ? row.policySurfacesSearched
      : Array.isArray(row.policy_surfaces_searched)
        ? row.policy_surfaces_searched
        : [];
    return policySurfaces.flatMap((surface) => {
      if (!surface || typeof surface !== "object" || Array.isArray(surface)) {
        return [];
      }
      const record = surface as Record<string, unknown>;
      const snippet = getStringValue(record.snippet) ?? getStringValue(record.textSnippet) ?? getStringValue(record.text_snippet);
      return snippet ? [snippet] : [];
    });
  });
  return snippets.length > 0 && snippets.every((snippet) => snippet.length < 220);
}

function makeSourceSignalGap(
  field: string,
  expected: unknown,
  actual: unknown,
  whyNeeded: string,
  source: "WS01" | "WC01" = "WC01"
): GdprEprivacyCoverageSourceSignalGap {
  return { actual, expected, field, source, whyNeeded };
}

function getFindingEntityPreview(finding: UnifiedFindingDisplayPacket) {
  const entities = finding.evidence?.entities ?? {};
  return Object.fromEntries(
    Object.entries(entities)
      .filter(([, values]) => Array.isArray(values) && values.length > 0)
      .slice(0, 5)
      .map(([key, values]) => [key, values.slice(0, 5)])
  );
}

function getUnifiedFindingCriticalEvidence(
  status: GdprEprivacyCoverageChecklistStatus,
  statusBasis: string,
  rowId: string,
  findings: UnifiedFindingDisplayPacket[],
  projectedFindings: NonNullable<GdprEprivacyCoverageChecklistInput["projectedFindings"]> = []
): GdprEprivacyCoverageCriticalEvidence {
  const insufficientPresentationFindings = findings.filter(
    (finding) => !isFindingPresentationStatusSufficientForCoverageRow(rowId, finding)
  );

  return {
    missingOrIncompleteSourceSignals: insufficientPresentationFindings.length > 0
      ? [
          makeSourceSignalGap(
            "WC01.unifiedFinding.presentationDecision.status",
            "surface",
            insufficientPresentationFindings.map((finding) => finding.presentationDecision.status),
            "Required to treat a matched canonical finding as fully surfaced evidence for this checklist row."
          )
        ]
      : [],
    pipeline: {
      concernPolicyKey: `gdpr_eprivacy_coverage.${rowId}.${status.toLowerCase().replaceAll(" ", "_")}`,
      projectionStage: "unified_finding",
      wc01NormalizedConcernKey: `gdpr_eprivacy.coverage.${rowId}`,
      ws01EvidenceRole: "observed runtime signal identification, evidence capture, and logging"
    },
    projectedFindings: findings.map((finding) => ({
      id: finding.unifiedFindingId,
      label: finding.presentation?.findingName || finding.title,
      severity: finding.severity
    })),
    retainedEvidence: {
      evidenceHighlights: getRowEvidenceHighlights({ findings, projectedFindings, rowId }),
      evidenceRefs: getEvidenceRefs(findings),
      findingEntities: findings.map((finding) => ({
        id: finding.unifiedFindingId,
        entities: getFindingEntityPreview(finding),
        evidenceFlags: (finding.evidence?.flags ?? []).slice(0, 5),
        sourceRefs: (finding.sourceRefs ?? []).flatMap((sourceRef) => {
          const formatted = formatSourceRef(sourceRef);
          return formatted ? [formatted] : [];
        }).slice(0, 5)
      })),
      status
    },
    statusBasis
  };
}

function getProjectedFindingCriticalEvidence(
  status: GdprEprivacyCoverageChecklistStatus,
  statusBasis: string,
  rowId: string,
  findings: NonNullable<GdprEprivacyCoverageChecklistInput["projectedFindings"]>
): GdprEprivacyCoverageCriticalEvidence {
  return {
    missingOrIncompleteSourceSignals: [],
    pipeline: {
      concernPolicyKey: `gdpr_eprivacy_coverage.${rowId}.${status.toLowerCase().replaceAll(" ", "_")}`,
      projectionStage: "executive_projection",
      wc01NormalizedConcernKey: `gdpr_eprivacy.coverage.${rowId}`,
      ws01EvidenceRole: "observed runtime signal identification, evidence capture, and logging"
    },
    projectedFindings: findings.map((finding) => ({
      id: finding.id,
      label: finding.label
    })),
    retainedEvidence: {
      evidenceHighlights: findings.flatMap(buildRegulatoryChecklistEvidenceHighlights).slice(0, 3),
      evidenceRefs: getProjectedEvidenceRefs(findings),
      projectedFindingPreview: findings.map((finding) => ({
        id: finding.id,
        evidencePreview: (finding.evidencePreview ?? []).slice(0, 5),
        label: finding.label
      })),
      status
    },
    statusBasis
  };
}

function getFallbackCriticalEvidence(
  status: GdprEprivacyCoverageChecklistStatus,
  statusBasis: string,
  rowId: string,
  missingOrIncompleteSourceSignals: GdprEprivacyCoverageSourceSignalGap[] = []
): GdprEprivacyCoverageCriticalEvidence {
  return {
    missingOrIncompleteSourceSignals,
    pipeline: {
      concernPolicyKey: `gdpr_eprivacy_coverage.${rowId}.${status.toLowerCase().replaceAll(" ", "_")}`,
      projectionStage: "coverage_fallback",
      wc01NormalizedConcernKey: `gdpr_eprivacy.coverage.${rowId}`,
      ws01EvidenceRole: "observed runtime signal identification, evidence capture, and logging"
    },
    projectedFindings: [],
    retainedEvidence: {
      status
    },
    statusBasis
  };
}

export function deriveGdprEprivacyCoverageChecklist(
  input: GdprEprivacyCoverageChecklistInput
): GdprEprivacyCoverageChecklistItem[] {
  const findingsById = new Map(input.unifiedFindings.map((finding) => [finding.unifiedFindingId, finding]));
  const projectedFindingsById = new Map((input.projectedFindings ?? []).map((finding) => [finding.id, finding]));
  const publicCoverageIsTestable = input.scanCompleted && !input.coverageLimited;

  const rows = CHECKLIST_ROWS.map((definition) => {
    const coverageOutcome = input.coverageOutcomes?.[definition.id];
    const matchingFindings = definition.findingIds.flatMap((id) => {
      const finding = findingsById.get(id);
      return finding && isFindingEligibleForCoverageRow(definition.id, finding) ? [finding] : [];
    });
    const matchingProjectedFindings = definition.findingIds.flatMap((id) => {
      const finding = projectedFindingsById.get(id);
      return finding && isProjectedFindingEligibleForCoverageRow(definition.id, finding) ? [finding] : [];
    });

    if (matchingFindings.length > 0) {
      const status = normalizeFindingStatus(definition, matchingFindings);
      const evidenceRefs = getEvidenceRefs(matchingFindings);
      const specialized = specializeChecklistRow({
        coverageOutcome,
        definition,
        evidenceRefs,
        findings: matchingFindings,
        status
      });
      return buildChecklistItem({
        criticalEvidence: getUnifiedFindingCriticalEvidence(
          specialized.status,
          `Canonical unified finding${matchingFindings.length === 1 ? "" : "s"} projected for this row.`,
          definition.id,
          matchingFindings,
          matchingProjectedFindings
        ),
        evidenceRefs: specialized.evidenceRefs,
        explanation: specialized.explanation,
        id: definition.id,
        label: specialized.label,
        status: specialized.status
      });
    }

    if (matchingProjectedFindings.length > 0) {
      const status = definition.defaultFindingStatus;
      const evidenceRefs = getProjectedEvidenceRefs(matchingProjectedFindings);
      const specialized = specializeChecklistRow({
        coverageOutcome,
        definition,
        evidenceRefs,
        findings: [],
        status
      });
      return buildChecklistItem({
        criticalEvidence: getProjectedFindingCriticalEvidence(
          specialized.status,
          `Executive/regulatory projection already retained finding evidence for this row.`,
          definition.id,
          matchingProjectedFindings
        ),
        evidenceRefs: specialized.evidenceRefs,
        explanation: specialized.explanation,
        id: definition.id,
        label: specialized.label,
        status: specialized.status
      });
    }

    if (coverageOutcome) {
      const specialized = specializeChecklistRow({
        coverageOutcome,
        definition,
        evidenceRefs: coverageOutcome.evidenceRefs,
        findings: [],
        status: coverageOutcome.status
      });
      return buildChecklistItem({
        criticalEvidence: coverageOutcome.criticalEvidence,
        evidenceRefs: specialized.evidenceRefs,
        explanation: specialized.explanation,
        id: definition.id,
        label: specialized.label,
        limitation: coverageOutcome.limitation,
        status: specialized.status,
      });
    }

    if (definition.requiresPublicWebCoverage && !publicCoverageIsTestable) {
      return buildChecklistItem({
        criticalEvidence: getFallbackCriticalEvidence(
          "Not testable",
          input.scanCompleted
            ? "Public-web coverage was limited, so this row cannot be evaluated from the retained scan context."
            : "The scan has not completed, so row evidence is not available yet.",
          definition.id,
          [
            makeSourceSignalGap(
              "WC01.coverageOutcomes." + definition.id,
              "row-specific retained policy outcome or projected finding",
              "missing",
              "Required to render row-grade critical evidence without relying on display-layer inference."
            )
          ]
        ),
        evidenceRefs: [],
        explanation: definition.explanation,
        id: definition.id,
        label: definition.label,
        limitation: input.scanCompleted
          ? "Public-web coverage was limited, so absence of a finding is not treated as a clean observation."
          : "The scan has not completed, so this coverage row is not testable yet.",
        status: "Not testable" as const,
      });
    }

    return buildChecklistItem({
      criticalEvidence: getFallbackCriticalEvidence(
        "Not observed",
        definition.notObservedText,
        definition.id,
        [
          makeSourceSignalGap(
            "WC01.coverageOutcomes." + definition.id,
            "row-specific retained policy outcome or projected finding",
            "missing",
            "Required to prove this row status from retained canonical evidence rather than default checklist fallback."
          )
        ]
      ),
      evidenceRefs: [],
      explanation: definition.explanation,
      id: definition.id,
      label: definition.label,
      limitation: definition.notObservedText,
      status: "Not observed" as const,
    });
  });

  return rows;
}
