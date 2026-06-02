import type { UnifiedFindingDisplayPacket } from "./unified-findings";
import type { GdprEprivacyCoverageOutcome } from "./gdpr-eprivacy-coverage-policy";

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
    defaultFindingStatus: "Review signal",
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
    findingIds: [
      "focus_management_issue",
      "keyboard_navigation_accessibility_issue",
      "semantic_labeling_accessibility_issue",
      "visual_contrast_accessibility_issue"
    ],
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
    definition.id === "runtime_vendor_disclosure_alignment" &&
    findings.some((finding) =>
      finding.unifiedFindingId === "policy_behavior_conflict" &&
      (
        finding.evidence?.entities?.findingSubtype?.includes("runtime_vendor_not_disclosed") ||
        (finding.evidence?.entities?.runtimeVendorDisclosureEvidence?.length ?? 0) > 0
      )
    )
  ) {
    return "Review signal";
  }

  if (
    definition.defaultFindingStatus !== "Observed" &&
    findings.some((finding) => finding.presentationDecision.status !== "surface")
  ) {
    return "Insufficient evidence";
  }

  return definition.defaultFindingStatus;
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
      return finding ? [finding] : [];
    });
    const matchingProjectedFindings = definition.findingIds.flatMap((id) => {
      const finding = projectedFindingsById.get(id);
      return finding ? [finding] : [];
    });

    if (matchingFindings.length > 0) {
      const status = normalizeFindingStatus(definition, matchingFindings);
      return {
        id: definition.id,
        label: definition.label,
        status,
        tone: getChecklistTone(status),
        explanation: definition.explanation,
        evidenceRefs: getEvidenceRefs(matchingFindings)
      };
    }

    if (matchingProjectedFindings.length > 0) {
      const status = definition.defaultFindingStatus;
      return {
        id: definition.id,
        label: definition.label,
        status,
        tone: getChecklistTone(status),
        explanation: definition.explanation,
        evidenceRefs: getProjectedEvidenceRefs(matchingProjectedFindings)
      };
    }

    const coverageOutcome = input.coverageOutcomes?.[definition.id];
    if (coverageOutcome) {
      return {
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
