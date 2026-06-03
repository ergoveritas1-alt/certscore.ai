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

export type GdprEprivacyCoverageChecklistItem = {
  criticalEvidence: GdprEprivacyCoverageCriticalEvidence;
  id: string;
  label: string;
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
    label: "Consent surface observed",
    explanation: "Whether an actionable cookie/consent banner or preference surface was visible in the tested context.",
    findingIds: [
      "accept_more_prominent_than_reject",
      "accept_only_banner",
      "consent_control_not_reopenable",
      "dismiss_without_reject",
      "forced_consent_wall",
      "reject_button_missing"
    ],
    defaultFindingStatus: "Observed",
    notObservedText: "No actionable consent surface issue was surfaced from the canonical report findings.",
    requiresPublicWebCoverage: true
  },
  {
    id: "pre_consent_cookies_storage",
    label: "Pre-consent cookies / storage",
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
    label: "Reject-all path availability",
    explanation: "Whether a reject-all or equivalent refusal path was available from the observed consent surface.",
    findingIds: [
      "accept_only_banner",
      "dismiss_without_reject",
      "forced_consent_wall",
      "reject_button_missing",
      "reject_option_missing_or_hidden"
    ],
    defaultFindingStatus: "Gap observed",
    notObservedText: "No reject-path availability finding was surfaced in this scan context.",
    requiresPublicWebCoverage: true
  },
  {
    id: "post_reject_tracking_reduction",
    label: "Post-reject tracking reduction",
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
    label: "Preference / withdrawal control",
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
    label: "Runtime vendor disclosure alignment",
    explanation: "Whether observed runtime vendors appeared to align with reviewed public privacy/cookie disclosures.",
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
    label: "Session replay / fingerprinting review",
    explanation: "Whether session replay, behavioral recording, or fingerprinting-like signals were observed or partially indicated.",
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
    label: "Cross-border endpoint review",
    explanation: "Whether observed third-party endpoints created a public-web international transfer review signal.",
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

function isFindingEligibleForCoverageRow(rowId: string, finding: UnifiedFindingDisplayPacket) {
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
  if (rowId === "cross_border_endpoint_review" && finding.id === "missing_transfer_disclosure") {
    return false;
  }

  return true;
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
      evidenceHighlights: projectedFindings.flatMap(buildRegulatoryChecklistEvidenceHighlights).slice(0, 3),
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
      return {
        criticalEvidence: getUnifiedFindingCriticalEvidence(
          status,
          `Canonical unified finding${matchingFindings.length === 1 ? "" : "s"} projected for this row.`,
          definition.id,
          matchingFindings,
          matchingProjectedFindings
        ),
        id: definition.id,
        label: definition.label,
        status,
        tone: getChecklistTone(status),
        explanation: definition.explanation,
        evidenceRefs
      };
    }

    if (matchingProjectedFindings.length > 0) {
      const status = definition.defaultFindingStatus;
      const evidenceRefs = getProjectedEvidenceRefs(matchingProjectedFindings);
      return {
        criticalEvidence: getProjectedFindingCriticalEvidence(
          status,
          `Executive/regulatory projection already retained finding evidence for this row.`,
          definition.id,
          matchingProjectedFindings
        ),
        id: definition.id,
        label: definition.label,
        status,
        tone: getChecklistTone(status),
        explanation: definition.explanation,
        evidenceRefs
      };
    }

    const coverageOutcome = input.coverageOutcomes?.[definition.id];
    if (coverageOutcome) {
      return {
        criticalEvidence: coverageOutcome.criticalEvidence,
        id: definition.id,
        label: definition.label,
        status: coverageOutcome.status,
        tone: getChecklistTone(coverageOutcome.status),
        explanation: definition.explanation,
        evidenceRefs: coverageOutcome.evidenceRefs,
        limitation: coverageOutcome.limitation
      };
    }

    if (definition.requiresPublicWebCoverage && !publicCoverageIsTestable) {
      return {
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
        id: definition.id,
        label: definition.label,
        status: "Not testable" as const,
        tone: getChecklistTone("Not testable"),
        explanation: definition.explanation,
        evidenceRefs: [],
        limitation: input.scanCompleted
          ? "Public-web coverage was limited, so absence of a finding is not treated as a clean observation."
          : "The scan has not completed, so this coverage row is not testable yet."
      };
    }

    return {
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
      id: definition.id,
      label: definition.label,
      status: "Not observed" as const,
      tone: getChecklistTone("Not observed"),
      explanation: definition.explanation,
      evidenceRefs: [],
      limitation: definition.notObservedText
    };
  });

  return rows;
}
