import type { UnifiedFindingDisplayPacket } from "./unified-findings";
import type { CertScoreFindingEvidenceDetails } from "./finding-registry";
import type {
  GdprEprivacyCoverageCriticalEvidence,
  GdprEprivacyCoverageOutcome,
  GdprEprivacyCoverageSourceSignalGap
} from "./gdpr-eprivacy-coverage-policy";
import type { RuntimeCookieEvidenceRow } from "./runtime-cookie-evidence";
import {
  buildRuntimeCookiePriorityGroups,
  compareRuntimeCookiePriorityRows,
  type RuntimeCookiePriorityGroupRow,
  type RuntimeCookieReviewPriority
} from "./runtime-cookie-priority";
import { buildRegulatoryChecklistEvidenceHighlights } from "./regulatory-checklist-evidence-highlights";
import { runtimeVendorDisclosureRowHasPromotionCategory } from "./runtime-vendor-disclosure";

export type GdprEprivacyCoverageChecklistStatus =
  | "Observed"
  | "Not confirmed"
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

export type RegulatoryChecklistDebugConfidence = {
  improveConfidence: string[];
  score: number;
};

export type RegulatoryChecklistSubcheck = {
  assessmentStatus: RegulatoryAssessmentStatus;
  evidenceRefs?: string[];
  evidenceState: RegulatoryEvidenceState;
  id: string;
  label: string;
  note: string;
  status: GdprEprivacyCoverageChecklistStatus;
};

export type GdprEprivacyCoverageChecklistItem = {
  assessmentStatus: RegulatoryAssessmentStatus;
  criticalEvidence: GdprEprivacyCoverageCriticalEvidence;
  debugConfidence?: RegulatoryChecklistDebugConfidence;
  evidenceState: RegulatoryEvidenceState;
  id: string;
  label: string;
  note: string;
  status: GdprEprivacyCoverageChecklistStatus;
  tone: GdprEprivacyCoverageChecklistTone;
  explanation: string;
  evidenceRefs: string[];
  limitation?: string;
  subchecks?: RegulatoryChecklistSubcheck[];
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
  runtimeCookieRows?: RuntimeCookieEvidenceRow[];
  runtimeTrackerPriorityRows?: Array<{
    domains?: string[];
    firstSeenMs: number | null;
    party: string;
    priority: RuntimeCookieReviewPriority;
    purpose: string;
    requestCount?: number | null;
    regulatoryRelevance?: string[] | null;
    vendor: string;
  }>;
  scanCompleted: boolean;
  unifiedFindings: UnifiedFindingDisplayPacket[];
};

type ProjectedGdprFinding = NonNullable<GdprEprivacyCoverageChecklistInput["projectedFindings"]>[number];

const CHECKLIST_ROWS: ChecklistRowDefinition[] = [
  {
    id: "consent_surface_observed",
    label: "Consent mechanism",
    explanation: "Whether an actionable cookie/consent banner or CMP preference surface was observed in the tested context.",
    findingIds: [],
    defaultFindingStatus: "Observed",
    notObservedText: "No actionable GDPR/ePrivacy consent banner or CMP preference surface was retained in this scan context.",
    requiresPublicWebCoverage: true
  },
  {
    id: "cmp_framework_signal_observed",
    label: "CMP framework",
    explanation: "Whether a consent-management framework, CMP vendor, or CMP runtime signal was observed in the pre-consent/public-web context.",
    findingIds: ["consent_surface_observed"],
    defaultFindingStatus: "Observed",
    notObservedText: "No CMP, consent framework, or consent-management runtime signal was retained in this scan context.",
    requiresPublicWebCoverage: true
  },
  {
    id: "reject_all_path_availability",
    label: "Decline consent control",
    explanation: "Whether a first-layer reject, necessary-only, decline, refuse, or equivalent refusal option was observed on a sufficiently retained consent surface.",
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
    id: "accept_consent_control",
    label: "Accept consent control",
    explanation: "Whether a first-layer accept, accept-all, allow-all, or agree control was observed on the retained consent surface.",
    findingIds: [],
    defaultFindingStatus: "Gap observed",
    notObservedText: "No accept consent control finding was surfaced in this scan context.",
    requiresPublicWebCoverage: true
  },
  {
    id: "options_settings_preferences_control",
    label: "Options / settings / preferences control",
    explanation: "Whether a first-layer options, settings, preferences, or manage-preferences control was observed on the retained consent surface.",
    findingIds: [],
    defaultFindingStatus: "Gap observed",
    notObservedText: "No options/settings/preferences control finding was surfaced in this scan context.",
    requiresPublicWebCoverage: true
  },
  {
    id: "cookie_notice_policy_availability",
    label: "Cookie notice / cookie policy availability",
    explanation: "Whether a cookie notice, cookie policy, cookie settings surface, or equivalent cookie disclosure surface was retained.",
    findingIds: ["cookie_policy_present"],
    defaultFindingStatus: "Observed",
    notObservedText: "No reachable cookie notice, cookie policy, or cookie-settings disclosure surface was retained in this scan context.",
    requiresPublicWebCoverage: true
  },
  {
    id: "pre_consent_cookies_storage",
    label: "Non-essential pre-consent cookies/storage",
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
    label: "Pre-consent non-essential tracking",
    explanation: "Whether classified non-essential analytics, advertising, measurement, replay, or similar requests were observed before recorded consent. Site relationship and entity ownership are reported separately.",
    findingIds: [
      "preconsent_tracking",
      "pre_consent_tracking_detected",
      "third_party_tracking_pre_consent"
    ],
    defaultFindingStatus: "Gap observed",
    notObservedText: "No eligible pre-consent non-essential tracking finding was surfaced in this scan context.",
    requiresPublicWebCoverage: true
  },
  {
    id: "advertising_retargeting_vendor_signal_observed",
    label: "Advertising vendor signal",
    explanation: "Whether ad serving, ad measurement, ad verification, programmatic, contextual, or other advertising infrastructure signals were observed in retained pre-consent/public-web runtime evidence.",
    findingIds: [
      "adtech_cookie_pre_consent",
      "preconsent_tracking",
      "pre_consent_tracking_detected",
      "third_party_tracking_pre_consent"
    ],
    defaultFindingStatus: "Review signal",
    notObservedText: "No advertising infrastructure vendor signal was retained in this scan context.",
    requiresPublicWebCoverage: true
  },
  {
    id: "retargeting_behavioral_advertising_signal_observed",
    label: "Retargeting / behavioral advertising signal",
    explanation: "Whether retargeting pixels, remarketing tags, audience-building, cross-site behavioral advertising, identity sync, audience matching, or profile activation signals were observed in retained pre-consent/public-web runtime evidence.",
    findingIds: [
      "adtech_cookie_pre_consent",
      "preconsent_tracking",
      "pre_consent_tracking_detected",
      "third_party_tracking_pre_consent"
    ],
    defaultFindingStatus: "Review signal",
    notObservedText: "No retargeting or behavioral advertising vendor signal was retained in this scan context.",
    requiresPublicWebCoverage: true
  },
  {
    id: "analytics_vendor_observed",
    label: "Analytics vendor signal",
    explanation: "Whether analytics or measurement vendors were observed in retained pre-consent/public-web runtime evidence.",
    findingIds: [
      "analytics_cookie_pre_consent",
      "preconsent_tracking",
      "pre_consent_tracking_detected",
      "third_party_tracking_pre_consent"
    ],
    defaultFindingStatus: "Review signal",
    notObservedText: "No analytics or measurement vendor finding was surfaced in this scan context.",
    requiresPublicWebCoverage: true
  },
  {
    id: "third_party_iframe_pre_consent",
    label: "3rd party iframes before consent",
    explanation: "Whether retained scanner evidence showed known 3rd party iframe embeds before a recorded consent action.",
    findingIds: [],
    defaultFindingStatus: "Gap observed",
    notObservedText: "No known 3rd party iframe embed was retained before a recorded consent action.",
    requiresPublicWebCoverage: true
  },
  {
    id: "social_media_embed_pre_consent",
    label: "Social/media embeds or plugins loaded before consent",
    explanation: "Whether retained network/runtime evidence showed a social, video, media embed, social pixel, or plugin provider loading before a recorded consent action.",
    findingIds: [],
    defaultFindingStatus: "Gap observed",
    notObservedText: "No social/media 3rd party embed, plugin, widget, or pixel request was retained before a recorded consent action.",
    requiresPublicWebCoverage: true
  },
  {
    id: "embedded_content_pre_consent",
    label: "Embedded third-party services before consent",
    explanation: "Whether retained scanner evidence showed iframe, embed, widget, or visibly integrated third-party services before a recorded consent action. This row does not represent all background analytics or network requests.",
    findingIds: [],
    defaultFindingStatus: "Gap observed",
    notObservedText: "No known embedded 3rd party service was retained before a recorded consent action.",
    requiresPublicWebCoverage: true
  },
  {
    id: "transport_security_https_delivery",
    label: "HTTPS delivery for scanned pages",
    explanation: "Whether the retained scanned page was served over HTTPS.",
    findingIds: [],
    defaultFindingStatus: "Gap observed",
    notObservedText: "No typed HTTPS delivery observation was retained in this scan context.",
    requiresPublicWebCoverage: true
  },
  {
    id: "transport_security_tls_certificate",
    label: "Valid SSL/TLS certificate",
    explanation: "Whether a strict TLS probe verified the HTTPS origin certificate separately from the normal scanner runtime.",
    findingIds: [],
    defaultFindingStatus: "Gap observed",
    notObservedText: "No strict TLS certificate probe was retained in this scan context.",
    requiresPublicWebCoverage: true
  },
  {
    id: "transport_security_http_redirect",
    label: "HTTP redirects to HTTPS",
    explanation: "Whether an explicit HTTP-origin probe redirected to HTTPS.",
    findingIds: [],
    defaultFindingStatus: "Gap observed",
    notObservedText: "No explicit HTTP-to-HTTPS redirect probe was retained in this scan context.",
    requiresPublicWebCoverage: true
  },
  {
    id: "transport_security_mixed_content",
    label: "Mixed content",
    explanation: "Whether HTTP subresources were observed or blocked on a retained HTTPS page.",
    findingIds: [],
    defaultFindingStatus: "Gap observed",
    notObservedText: "No mixed-content transport observation was retained in this scan context.",
    requiresPublicWebCoverage: true
  },
  {
    id: "transport_security_form_transport",
    label: "Observed form transport",
    explanation: "Whether observed forms resolved to HTTPS transport without submitting form data.",
    findingIds: [],
    defaultFindingStatus: "Gap observed",
    notObservedText: "No observed-form transport evidence was retained in this scan context.",
    requiresPublicWebCoverage: true
  },
  {
    id: "session_replay_fingerprinting_review",
    label: "Session replay signal",
    explanation: "Whether session replay, behavioral recording, or behavioral analytics signals were observed in the tested pre-consent/public-web context.",
    findingIds: [
      "possible_session_replay_on_sensitive_input_surface",
      "session_replay_observed",
      "session_replay_present_with_sensitive_surfaces_observed",
      "session_recording_services_detected"
    ],
    defaultFindingStatus: "Review signal",
    notObservedText: "No session replay or fingerprinting-related finding was surfaced in this scan context.",
    requiresPublicWebCoverage: true
  },
  {
    id: "device_identification_fingerprinting_signal_observed",
    label: "Device identification / fingerprinting signal",
    explanation: "Whether browser/device entropy, fingerprinting, or identifier-like device collection signals were observed in retained runtime evidence.",
    findingIds: [
      "device_data_collection_detected",
      "fingerprinting_observed",
      "fingerprinting_related_signals_observed",
      "probable_fingerprinting",
      "telemetry_rich_identification_observed"
    ],
    defaultFindingStatus: "Review signal",
    notObservedText: "No device identification, entropy, or fingerprinting-related finding was surfaced in this scan context.",
    requiresPublicWebCoverage: true
  },
  {
    id: "privacy_notice_availability",
    label: "Privacy notice link/surface discovered",
    explanation: "Whether a reachable privacy notice or privacy policy link/surface was retained. This row does not by itself confirm that substantive notice content was available.",
    findingIds: ["privacy_policy_present"],
    defaultFindingStatus: "Observed",
    notObservedText: "No reachable privacy notice or privacy policy finding was surfaced in this scan context.",
    requiresPublicWebCoverage: true
  },
  {
    id: "legal_basis_disclosure_observed",
    label: "Legal basis disclosure",
    explanation: "Whether retained privacy-policy evidence included a canonical legal-basis disclosure signal.",
    findingIds: ["legal_basis_disclosure_present"],
    defaultFindingStatus: "Observed",
    notObservedText: "No canonical legal-basis disclosure evidence was retained for this scan context.",
    requiresPublicWebCoverage: true
  },
  {
    id: "retention_disclosure_observed",
    label: "Retention disclosure",
    explanation: "Whether retained privacy-policy evidence included a data-retention disclosure signal.",
    findingIds: ["retention_disclosure_present"],
    defaultFindingStatus: "Observed",
    notObservedText: "No canonical retention disclosure evidence was retained for this scan context.",
    requiresPublicWebCoverage: true
  },
  {
    id: "consent_choice_quality",
    label: "Consent choice quality",
    explanation: "Whether retained cookie-banner evidence supports review of the available consent choices and their presentation.",
    findingIds: ["consent_dark_patterns_detected", "asymmetric_consent_ui"],
    defaultFindingStatus: "Review signal",
    notObservedText: "No consent-choice quality concern was surfaced from retained canonical evidence.",
    requiresPublicWebCoverage: true
  },
  {
    id: "post_reject_tracking_reduction",
    label: "Post-choice tracking reduction",
    explanation: "Deferred from the current production core scanner; retained post-choice tracking evidence is review context, not a production gap conclusion.",
    findingIds: [
      "reject_did_not_reduce_tracking",
      "reject_did_not_reduce_third_party_cookies",
      "reject_tracking_persists_after_reject"
    ],
    defaultFindingStatus: "Review signal",
    notObservedText: "Post-choice tracking reduction is deferred from the current production core scanner.",
    requiresPublicWebCoverage: true
  },
  {
    id: "preference_withdrawal_control",
    label: "Post-choice consent controls",
    explanation: "Deferred from the current production core scanner; retained post-choice control evidence is review context, not production consent-path validation.",
    findingIds: [
      "consent_control_not_reopenable",
      "consent_preference_reopen_control_not_observed"
    ],
    defaultFindingStatus: "Gap observed",
    notObservedText: "No consent preference reopen-control finding was surfaced in this scan context.",
    requiresPublicWebCoverage: true
  },
  {
    id: "sensitive_surfaces_third_party_tracking",
    label: "Sensitive surfaces with 3rd party tracking",
    explanation: "Whether forms or sensitive flows appeared alongside 3rd party tracking or measurement scripts.",
    findingIds: [
      "sensitive_collection_surface_observed",
      "sensitive_data_collection_with_third_party_tracking_present"
    ],
    defaultFindingStatus: "Review signal",
    notObservedText: "No sensitive-surface 3rd party tracking finding was surfaced in this scan context.",
    requiresPublicWebCoverage: true
  },
  {
    id: "cross_border_endpoint_review",
    label: "Cross-border analytics / tracking endpoint review",
    explanation: "Whether transfer-relevant analytics, behavioral tracking, adtech, or identifier-bearing 3rd party endpoints were observed.",
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
    label: "Accessibility of privacy/consent controls",
    explanation: "Whether privacy or consent controls appeared reachable and understandable through basic automated accessibility checks.",
    findingIds: [],
    defaultFindingStatus: "Review signal",
    notObservedText: "No privacy/consent-control accessibility finding was surfaced in this scan context.",
    requiresPublicWebCoverage: true
  },
  {
    id: "controller_contact_disclosure",
    label: "Controller/contact disclosure",
    explanation: "Whether retained privacy-policy evidence included a controller, privacy contact, or equivalent contact point.",
    findingIds: ["privacy_contact_path_present"],
    defaultFindingStatus: "Observed",
    notObservedText: "No canonical controller or privacy-contact disclosure evidence was retained for this scan context.",
    requiresPublicWebCoverage: true
  },
  {
    id: "processing_purposes_disclosure",
    label: "Processing purposes disclosure",
    explanation: "Whether retained privacy-policy evidence described the purposes for processing personal data.",
    findingIds: ["purpose_of_use_disclosure_missing"],
    defaultFindingStatus: "Gap observed",
    notObservedText: "No canonical processing-purpose disclosure evidence was retained for this scan context.",
    requiresPublicWebCoverage: true
  },
  {
    id: "recipients_vendor_categories_disclosure",
    label: "Recipients/vendor categories disclosed",
    explanation: "Whether retained privacy-policy evidence described recipient, vendor, or 3rd party categories.",
    findingIds: [
      "third_party_advertising_disclosure_present",
      "third_party_recipient_disclosure_missing",
      "tracking_technologies_disclosure_present"
    ],
    defaultFindingStatus: "Review signal",
    notObservedText: "No canonical recipient or vendor-category disclosure evidence was retained for this scan context.",
    requiresPublicWebCoverage: true
  },
  {
    id: "data_subject_rights_disclosure",
    label: "Data subject rights disclosure",
    explanation: "Whether retained privacy-policy evidence described data subject rights or a rights request path.",
    findingIds: ["privacy_rights_path_present", "missing_dsar_mechanism", "missing_dsar_high_exposure"],
    defaultFindingStatus: "Observed",
    notObservedText: "No canonical data-subject-rights disclosure evidence was retained for this scan context.",
    requiresPublicWebCoverage: true
  },
  {
    id: "international_transfers_disclosure",
    label: "International transfer disclosure",
    explanation: "Whether retained privacy-policy evidence described international transfers or transfer-relevant endpoint/vendor context.",
    findingIds: [
      "cross_border_endpoint_transfer_review_signal",
      "cross_border_vendor_disclosure_gap",
      "missing_transfer_disclosure"
    ],
    defaultFindingStatus: "Review signal",
    notObservedText: "No canonical international-transfer disclosure or endpoint review evidence was retained for this scan context.",
    requiresPublicWebCoverage: true
  },
  {
    id: "dpo_contact_point_disclosure",
    label: "Privacy contact point",
    explanation: "Whether retained privacy-policy evidence identified a privacy officer, privacy office, privacy contact, DPO, or data-protection contact point.",
    findingIds: ["privacy_contact_path_present"],
    defaultFindingStatus: "Observed",
    notObservedText: "No canonical privacy or data-protection contact point evidence was retained for this scan context.",
    requiresPublicWebCoverage: true
  },
  {
    id: "supervisory_authority_complaint_disclosure",
    label: "Supervisory authority complaint",
    explanation: "Whether retained privacy-policy evidence referenced a right to complain to a supervisory authority.",
    findingIds: ["supervisory_authority_disclosure_present"],
    defaultFindingStatus: "Observed",
    notObservedText: "No canonical supervisory-authority complaint disclosure evidence was retained for this scan context.",
    requiresPublicWebCoverage: true
  },
  {
    id: "automated_decision_making_profiling_disclosure",
    label: "Automated decision-making / profiling disclosure",
    explanation: "Whether adapter-approved Article 13 evidence retained automated decision-making or profiling disclosure context for review.",
    findingIds: [],
    defaultFindingStatus: "Review signal",
    notObservedText: "No adapter-approved automated decision-making or profiling disclosure evidence was retained for this scan context.",
    requiresPublicWebCoverage: true
  }
];

export function getGdprEprivacyCoverageChecklistRowIds() {
  return CHECKLIST_ROWS.map((row) => row.id);
}

const SESSION_REPLAY_PARENT_ROW_ID = "session_replay_fingerprinting_review";
const SESSION_REPLAY_CHILD_ROW_LABELS = new Map([
  ["session_replay_before_consent", "Before consent"],
  ["session_replay_disclosure_alignment", "Disclosure alignment"],
  ["session_replay_sensitive_surface", "Sensitive surfaces"],
  ["session_replay_after_refusal", "Post-choice persistence"]
]);
const SESSION_REPLAY_CHILD_ROW_IDS = new Set(SESSION_REPLAY_CHILD_ROW_LABELS.keys());
const VISUAL_NO_GO_UI_DEPENDENT_ROW_IDS = new Set([
  "accept_consent_control",
  "options_settings_preferences_control"
]);

function getChecklistTone(status: GdprEprivacyCoverageChecklistStatus): GdprEprivacyCoverageChecklistTone {
  switch (status) {
      case "Gap observed":
      case "Review signal":
      case "Not confirmed":
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
      case "Not confirmed":
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
  if (input.status === "Insufficient evidence") {
    return "observed";
  }
  if (input.status === "Not testable" || input.assessmentStatus === "coverage_limitation") {
    return "not_testable";
  }
  if (input.status === "Out of scope" || input.assessmentStatus === "not_applicable") {
    return "not_applicable";
  }
    if (input.status === "Not observed" || input.status === "Not confirmed") {
      return "not_observed";
    }
  if (
    input.status === "Gap observed" &&
    (
      input.id === "reject_all_path_availability" ||
      input.id === "accept_consent_control" ||
      input.id === "options_settings_preferences_control" ||
      input.id === "preference_withdrawal_control"
    )
  ) {
    return "not_observed";
  }

  return "observed";
}

type ChecklistEvidenceSelection = {
  missingEvidenceNeeded: string[];
  selectedEvidenceArtifactId: string;
  selectedEvidenceReason: string;
  selectedEvidenceStrength: "strong" | "moderate" | "limited" | "missing";
  weakerArtifactsIgnored: Array<{
    artifactId: string;
    reason: string;
  }>;
};

function hasRetainedEvidenceKey(record: Record<string, unknown>, keys: string[]) {
  return keys.some((key) => {
    const value = record[key];
    if (value === null || value === undefined) {
      return false;
    }
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    return true;
  });
}

function getMissingEvidenceNeeded(input: {
  criticalEvidence: GdprEprivacyCoverageCriticalEvidence;
  retained: Record<string, unknown>;
  rowId: string;
  status: GdprEprivacyCoverageChecklistStatus;
}) {
  const fromSourceGaps = input.criticalEvidence.missingOrIncompleteSourceSignals
    .map((gap) => `${gap.field}: ${gap.whyNeeded}`)
    .slice(0, 4);

  if (input.status === "Gap observed" || input.status === "Observed" || input.status === "Not observed") {
    return fromSourceGaps;
  }

  const retainedMissingEvidenceNeeded = retainedStringArray(input.retained, [
    "missingEvidenceNeeded",
    "missing_evidence_needed"
  ]);
  if (retainedMissingEvidenceNeeded.length > 0) {
    return [...retainedMissingEvidenceNeeded, ...fromSourceGaps].slice(0, 8);
  }

  const rowSpecific = (() => {
    switch (input.rowId) {
    case "consent_surface_observed":
      return "Confirmed first-layer GDPR/ePrivacy cookie banner with uncontaminated DOM/control evidence.";
    case "reject_all_path_availability":
      return "Confirmed first-layer GDPR/ePrivacy cookie banner and same-surface accept/reject control inventory.";
    case "accept_consent_control":
      return "Confirmed first-layer GDPR/ePrivacy cookie banner and structured accept/accept-all control inventory.";
    case "options_settings_preferences_control":
      return "Confirmed first-layer GDPR/ePrivacy cookie banner and structured options/settings/preferences control inventory.";
    case "consent_choice_quality":
      return "Confirmed granular preference center evidence, purpose/vendor choices, default toggle states, save choices, and accept/reject visual parity.";
    case "post_reject_tracking_reduction":
      return "Post-choice consent-flow automation is deferred from the production core scanner; use retained evidence only as analyst review context.";
    case "preference_withdrawal_control":
      return "Cookie preference center, cookie-category controls, or consent-withdrawal control tied to GDPR/ePrivacy cookie consent.";
    case "sensitive_surfaces_third_party_tracking":
      return "Eligible sensitive field plus direct or moderate-confidence same-context 3rd party tracking correlation.";
    case "cross_border_endpoint_review":
      return "Endpoint geography plus usable disclosure mismatch for transfer-relevant vendors before rendering a gap.";
    case "accessibility_consent_controls":
      return "Control-specific accessibility issue tied to a retained cookie-consent or privacy-choice control.";
    default:
      return null;
    }
  })();

  return rowSpecific ? [rowSpecific, ...fromSourceGaps] : fromSourceGaps;
}

function selectChecklistEvidenceArtifact(input: {
  criticalEvidence: GdprEprivacyCoverageCriticalEvidence;
  retained: Record<string, unknown>;
  rowId: string;
  status: GdprEprivacyCoverageChecklistStatus;
}): ChecklistEvidenceSelection {
  const weakerArtifactsIgnored: ChecklistEvidenceSelection["weakerArtifactsIgnored"] = [];
  const missingEvidenceNeeded = getMissingEvidenceNeeded(input);
  const selection = (
    selectedEvidenceArtifactId: string,
    selectedEvidenceStrength: ChecklistEvidenceSelection["selectedEvidenceStrength"],
    selectedEvidenceReason: string
  ): ChecklistEvidenceSelection => ({
    missingEvidenceNeeded,
    selectedEvidenceArtifactId,
    selectedEvidenceReason,
    selectedEvidenceStrength,
    weakerArtifactsIgnored
  });

  if (input.rowId === "preference_withdrawal_control") {
    if (retainedEvidenceHasCookieConsentWithdrawal(input.retained)) {
      return selection(
        "consentControlLifecycleEvidence.cookieConsentWithdrawal",
        "strong",
        "Selected retained cookie-preference, cookie-category, withdrawal, manage-cookies, or cookie-consent CMP reopen evidence."
      );
    }
    if (retainedEvidenceIsAdChoiceOnly(input.retained)) {
      weakerArtifactsIgnored.push({
        artifactId: "consentControlLifecycleEvidence.privacyAdChoiceOnly",
        reason: "Footer privacy/ad-choice, sale/share, targeted-ad, vendor opt-out, or analytics opt-out controls do not prove GDPR/ePrivacy cookie-consent withdrawal."
      });
      return selection(
        "consentControlLifecycleEvidence.privacyAdChoiceOnly",
        "limited",
        "Privacy/ad-choice controls were retained, but cookie-consent withdrawal evidence was not confirmed."
      );
    }
  }

  if (input.rowId === "consent_choice_quality") {
    const selectedEvidenceStrength = readRetainedString(input.retained, ["selectedEvidenceStrength", "selected_evidence_strength"]);
    const explicitStrength =
      selectedEvidenceStrength === "strong" ||
      selectedEvidenceStrength === "moderate" ||
      selectedEvidenceStrength === "limited" ||
      selectedEvidenceStrength === "missing"
        ? selectedEvidenceStrength
        : null;
    const firstLayerObserved = readRetainedBoolean(input.retained, [
      "firstLayerCookieConsentBannerObserved",
      "first_layer_cookie_consent_banner_observed"
    ]) === true;
    const managePreferencesObserved = readRetainedBoolean(input.retained, ["managePreferencesObserved", "manage_preferences_observed"]) === true;
    const purposeCategoryControlsObserved = readRetainedBoolean(input.retained, [
      "purposeCategoryControlsObserved",
      "purpose_category_controls_observed"
    ]) === true;
    const vendorControlsObserved = readRetainedBoolean(input.retained, ["vendorControlsObserved", "vendor_controls_observed"]) === true;
    const defaultToggleStatesObserved = readRetainedBoolean(input.retained, [
      "defaultToggleStatesObserved",
      "default_toggle_states_observed"
    ]) === true;
    const nonEssentialDefaultsOff = readRetainedBoolean(input.retained, ["nonEssentialDefaultsOff", "non_essential_defaults_off"]) === true;
    const saveChoicesObserved = readRetainedBoolean(input.retained, ["saveChoicesObserved", "save_choices_observed"]) === true;
    const visualParityEvidenceObserved = readRetainedBoolean(input.retained, [
      "visualParityEvidenceObserved",
      "visual_parity_evidence_observed"
    ]) === true;
    const qualitySignals = [
      firstLayerObserved,
      managePreferencesObserved,
      purposeCategoryControlsObserved,
      vendorControlsObserved,
      defaultToggleStatesObserved && nonEssentialDefaultsOff,
      saveChoicesObserved,
      visualParityEvidenceObserved
    ].filter(Boolean).length;

    if (input.status === "Observed" && qualitySignals >= 5) {
      return selection(
        "consentChoiceQualityEvidence.strongQuality",
        explicitStrength ?? "strong",
        "Selected retained first-layer choice-quality evidence with granular preferences, default-state, save-control, and visual-parity support."
      );
    }
    if (input.status === "Gap observed") {
      return selection(
        "consentChoiceQualityEvidence.directGap",
        explicitStrength ?? "strong",
        "Selected retained direct evidence of poor consent choice quality."
      );
    }
    return selection(
      "consentChoiceQualityEvidence",
      explicitStrength ?? (input.status === "Not testable" ? "missing" : "limited"),
      "Selected retained first-layer consent choice evidence; granular preference quality evidence was incomplete or missing."
    );
  }

  if (input.rowId === "consent_surface_observed") {
    const confirmed = hasConfirmedFirstLayerGdprBanner(input.retained);
    return selection(
      confirmed === true ? "consentControlLifecycleEvidence.firstLayerCookieConsentBanner" : "consentControlLifecycleEvidence.surfaceClassification",
      confirmed === true ? "strong" : confirmed === false ? "limited" : "missing",
      confirmed === true
        ? "Selected retained first-layer GDPR/ePrivacy cookie/CMP surface evidence."
        : "Retained evidence did not confirm an uncontaminated first-layer GDPR/ePrivacy cookie/CMP consent surface."
    );
  }

  if (
    input.rowId === "reject_all_path_availability" ||
    input.rowId === "accept_consent_control" ||
    input.rowId === "options_settings_preferences_control" ||
    input.rowId === "post_reject_tracking_reduction"
  ) {
    return selection(
      input.rowId === "post_reject_tracking_reduction"
        ? "postRejectTrackingReductionEvidence"
        : input.rowId === "accept_consent_control"
          ? "firstLayerConsentChoices.acceptControl"
        : input.rowId === "options_settings_preferences_control"
          ? "firstLayerConsentChoices.optionsControl"
          : "rejectPathDepthAndAvailability",
      input.status === "Observed" || input.status === "Gap observed" ? "strong" : "limited",
      input.status === "Not testable"
        ? input.rowId === "accept_consent_control"
          ? "Accept consent control evidence is not selected as testable unless a first-layer GDPR/ePrivacy cookie banner and structured control inventory are confirmed."
          : input.rowId === "options_settings_preferences_control"
          ? "Options/settings/preferences control evidence is not selected as testable unless a first-layer GDPR/ePrivacy cookie banner and structured control inventory are confirmed."
          : "Reject-path evidence is not selected as testable unless a first-layer GDPR/ePrivacy cookie banner and valid reject state are confirmed."
        : input.rowId === "accept_consent_control"
          ? "Selected retained same-surface accept consent control evidence."
          : input.rowId === "options_settings_preferences_control"
          ? "Selected retained same-surface options/settings/preferences control evidence."
          : "Selected retained same-surface reject-path or post-reject comparison evidence."
    );
  }

  if (input.rowId === "sensitive_surfaces_third_party_tracking") {
    const fallbackOnly = readRetainedBoolean(input.retained, ["fallbackOrPolicyOnly", "fallback_or_policy_only"]) === true;
    const sameContext =
      readRetainedBoolean(input.retained, ["sameContext", "same_context"]) === true ||
      readRetainedBoolean(input.retained, ["samePageOrFlow", "same_page_or_flow"]) === true;
    const eligibleCount = readRetainedNumber(input.retained, ["eligibleSensitiveFieldCount", "eligible_sensitive_field_count"]) ?? 0;
    return selection(
      "sensitiveThirdPartyTrackingCorrelation",
      input.status === "Gap observed" && eligibleCount > 0 && sameContext && !fallbackOnly ? "strong" : input.status === "Not observed" ? "moderate" : "limited",
      input.status === "Gap observed" && eligibleCount > 0 && sameContext && !fallbackOnly
        ? "Selected same-context sensitive-field and 3rd party tracking correlation evidence."
        : "Retained sensitive-surface evidence does not conclusively establish direct same-context sensitive-field tracking correlation."
    );
  }

  if (input.rowId === "cross_border_endpoint_review") {
    if (hasUsableVendorDisclosureMismatchEvidence({
      assessmentStatus: "checked",
      criticalEvidence: input.criticalEvidence,
      evidenceRefs: [],
      evidenceState: "observed",
      explanation: "",
      id: input.rowId,
      label: "",
      note: "",
      status: input.status,
      tone: "neutral"
    })) {
      return selection(
        "endpointJurisdictionEvidence+runtimeVendorDisclosureEvidence",
        "strong",
        "Selected transfer-relevant endpoint evidence together with usable vendor-disclosure mismatch evidence."
      );
    }
    return selection(
      "endpointJurisdictionEvidence",
      "moderate",
      "Endpoint geography is retained as a transfer-review signal; gap-level status requires a usable transfer-relevant disclosure mismatch."
    );
  }

  if (input.rowId === "accessibility_consent_controls") {
    const cookieIssue = readRetainedBoolean(input.retained, ["cookieConsentAccessibilityIssueObserved", "cookie_consent_accessibility_issue_observed"]) === true;
    const privacyChoiceIssue = readRetainedBoolean(input.retained, ["privacyChoiceAccessibilityIssueObserved", "privacy_choice_accessibility_issue_observed"]) === true;
    const generalOnly = readRetainedBoolean(input.retained, ["examplesAreGeneralPageOnly", "examples_are_general_page_only"]) === true;
    return selection(
      cookieIssue ? "privacyControlAccessibility.cookieConsentControlIssue" : privacyChoiceIssue ? "privacyControlAccessibility.privacyChoiceControlIssue" : "privacyControlAccessibility.scopeClassification",
      cookieIssue || privacyChoiceIssue ? "strong" : generalOnly ? "moderate" : input.status === "Not testable" ? "missing" : "limited",
      cookieIssue || privacyChoiceIssue
        ? "Selected control-specific retained accessibility issue evidence tied to cookie-consent or privacy-choice controls."
        : "Retained accessibility evidence was not tied to a consent/privacy-control-specific issue."
    );
  }

  if (input.rowId === "pre_consent_cookies_storage") {
    const hasConcreteStorageArtifacts = hasRetainedEvidenceKey(input.retained, [
      "evidenceHighlights",
      "findingEntities",
      "preconsent_cookie_evidence",
      "preConsentCookieExamples",
      "storageEvidence",
      "storageSummary"
    ]);
    return selection(
      hasConcreteStorageArtifacts
        ? "preConsentCookieOrStorageEvidence.concreteStorageArtifacts"
        : "preConsentCookieOrStorageEvidence.missing",
      input.status === "Gap observed" ? "strong" : input.status === "Not observed" ? "moderate" : "limited",
      "Selected retained concrete cookie/storage evidence for storage timing; request-only tracking evidence is not used as storage proof."
    );
  }

  if (input.rowId === "pre_consent_third_party_tracking") {
    return selection(
      hasRetainedEvidenceKey(input.retained, ["findingEntities", "evidenceHighlights", "preconsent_tracker_vendor_evidence", "representativeRequests"])
        ? "preConsentTrackingRequestEvidence"
        : "preConsentTrackingRequestEvidence.missing",
      input.status === "Gap observed" ? "strong" : input.status === "Not observed" ? "moderate" : "limited",
      "Selected retained pre-consent request/vendor timing evidence; storage evidence is evaluated separately."
    );
  }

  return selection(
    input.criticalEvidence.pipeline.projectionStage,
    input.status === "Gap observed" || input.status === "Observed" ? "moderate" : missingEvidenceNeeded.length > 0 ? "limited" : "missing",
    "Selected the strongest retained canonical coverage evidence available for this row."
  );
}

function getSelectionAwareStatusBasis(input: {
  currentStatusBasis: string;
  rowId: string;
  selection: ChecklistEvidenceSelection;
  status: GdprEprivacyCoverageChecklistStatus;
}) {
  const genericBasis = /canonical unified finding(?:s)? projected for this row/i.test(input.currentStatusBasis);
  const weakSelection =
    input.selection.selectedEvidenceStrength === "limited" ||
    input.selection.selectedEvidenceStrength === "missing" ||
    input.status === "Insufficient evidence";

  if (!weakSelection || (!genericBasis && input.status !== "Insufficient evidence")) {
    return input.currentStatusBasis;
  }

  return input.selection.selectedEvidenceReason;
}

function enrichCriticalEvidenceWithSelection(input: {
  criticalEvidence: GdprEprivacyCoverageCriticalEvidence;
  rowId: string;
  status: GdprEprivacyCoverageChecklistStatus;
}) {
  const retained = getRecordValue(input.criticalEvidence.retainedEvidence) ?? {};
  const selection = selectChecklistEvidenceArtifact({
    criticalEvidence: input.criticalEvidence,
    retained,
    rowId: input.rowId,
    status: input.status
  });
  return {
    ...input.criticalEvidence,
    retainedEvidence: {
      ...retained,
      ...selection
    },
    statusBasis: getSelectionAwareStatusBasis({
      currentStatusBasis: input.criticalEvidence.statusBasis,
      rowId: input.rowId,
      selection,
      status: input.status
    })
  };
}

function getCoverageOutcomePreconsentTimingRetainedEvidence(
  rowId: string,
  coverageOutcome?: GdprEprivacyCoverageOutcome
) {
  if (rowId !== "pre_consent_cookies_storage" && rowId !== "pre_consent_third_party_tracking") {
    return {};
  }

  const retained = getRecordValue(coverageOutcome?.criticalEvidence.retainedEvidence) ?? {};
  const preconsentTimingEvidence = getRecordValue(retained.preconsentTimingEvidence);
  if (rowId === "pre_consent_cookies_storage") {
    return {
      firstPreconsentCookieOrStorageObservedMs: retained.firstPreconsentCookieOrStorageObservedMs,
      firstPreconsentCookieOrStorageObservationBasis: retained.firstPreconsentCookieOrStorageObservationBasis,
      preconsentCookieOrStorageExactTimingRetained: retained.preconsentCookieOrStorageExactTimingRetained,
      preconsentCookieOrStorageInitialInventoryObserved: retained.preconsentCookieOrStorageInitialInventoryObserved,
      preconsentCookieOrStorageObservedMs: retained.preconsentCookieOrStorageObservedMs,
      preconsentCookieOrStorageTimedObservationCount: retained.preconsentCookieOrStorageTimedObservationCount,
      preconsentCookieOrStorageUntimedObservationCount: retained.preconsentCookieOrStorageUntimedObservationCount,
      preconsentTimingEvidence: preconsentTimingEvidence
        ? { cookieOrStorage: getRecordValue(preconsentTimingEvidence.cookieOrStorage) ?? {} }
        : undefined
    };
  }

  return {
    firstPreconsentThirdPartyTrackingObservedMs: retained.firstPreconsentThirdPartyTrackingObservedMs,
    firstPreconsentThirdPartyTrackingObservationBasis: retained.firstPreconsentThirdPartyTrackingObservationBasis,
    preconsentThirdPartyTrackingObservedMs: retained.preconsentThirdPartyTrackingObservedMs,
    preconsentThirdPartyTrackingTimedObservationCount: retained.preconsentThirdPartyTrackingTimedObservationCount,
    preconsentTimingEvidence: preconsentTimingEvidence
      ? { thirdPartyTracking: getRecordValue(preconsentTimingEvidence.thirdPartyTracking) ?? {} }
      : undefined
  };
}

function mergeCoverageOutcomePreconsentTimingEvidence(input: {
  coverageOutcome?: GdprEprivacyCoverageOutcome;
  criticalEvidence: GdprEprivacyCoverageCriticalEvidence;
  rowId: string;
}) {
  if (
    input.coverageOutcome &&
    (
      (
        input.rowId === "pre_consent_cookies_storage" &&
        input.coverageOutcome.criticalEvidence.retainedEvidence.cookieStoragePriority
      ) ||
      (
        input.rowId === "pre_consent_third_party_tracking" &&
        input.coverageOutcome.criticalEvidence.retainedEvidence.trackerPriority
      )
    )
  ) {
    return input.coverageOutcome.criticalEvidence;
  }

  if (input.rowId === "session_replay_fingerprinting_review" && input.coverageOutcome) {
    const outcomeRetained = input.coverageOutcome.criticalEvidence.retainedEvidence;
    const sessionReplayEvidence = getSessionReplayEvidenceFromOutcome(input.coverageOutcome);
    const browserDeviceEntropyEvidence = getBrowserDeviceEntropyEvidenceFromOutcome(input.coverageOutcome);
    if (sessionReplayEvidence || browserDeviceEntropyEvidence) {
      return {
        ...input.criticalEvidence,
        retainedEvidence: {
          ...input.criticalEvidence.retainedEvidence,
          ...(sessionReplayEvidence ? { sessionReplayEvidence } : {}),
          ...(browserDeviceEntropyEvidence ? { browserDeviceEntropyEvidence } : {}),
          ...(outcomeRetained.sessionReplayObserved !== undefined
            ? { sessionReplayObserved: outcomeRetained.sessionReplayObserved }
            : {})
        }
      };
    }
  }

  const retainedTiming = getCoverageOutcomePreconsentTimingRetainedEvidence(input.rowId, input.coverageOutcome);
  const retainedTimingEntries = Object.entries(retainedTiming).filter(([, value]) => {
    if (value === null || value === undefined) {
      return false;
    }
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    if (typeof value === "object") {
      return Object.keys(value).length > 0;
    }
    return true;
  });
  const timingRefs = (input.coverageOutcome?.evidenceRefs ?? []).filter((ref) =>
    /(?:ms|s) after scan start|exact observation\/write time not retained/i.test(ref)
  );
  if (retainedTimingEntries.length === 0 && timingRefs.length === 0) {
    return input.criticalEvidence;
  }

  const evidenceRefs = [
    ...timingRefs,
    ...retainedStringArray(input.criticalEvidence.retainedEvidence, ["evidenceRefs", "evidence_refs"])
  ];
  const evidenceHighlights = [
    ...timingRefs,
    ...retainedStringArray(input.criticalEvidence.retainedEvidence, ["evidenceHighlights", "evidence_highlights"])
  ].slice(0, 3);
  return {
    ...input.criticalEvidence,
    retainedEvidence: {
      ...input.criticalEvidence.retainedEvidence,
      ...Object.fromEntries(retainedTimingEntries),
      ...(timingRefs.length > 0 ? { evidenceHighlights } : {}),
      evidenceRefs: [...new Set(evidenceRefs)].slice(0, 6)
    }
  };
}

function mergeCoverageOutcomePreconsentTimingEvidenceRefs(
  rowId: string,
  evidenceRefs: string[],
  coverageOutcome?: GdprEprivacyCoverageOutcome
) {
  if (rowId !== "pre_consent_cookies_storage" && rowId !== "pre_consent_third_party_tracking") {
    return evidenceRefs;
  }

  const timingRefs = (coverageOutcome?.evidenceRefs ?? []).filter((ref) =>
    /(?:ms|s) after scan start|exact observation\/write time not retained/i.test(ref)
  );
  return [...new Set([...evidenceRefs, ...timingRefs])].slice(0, 6);
}

function formatCookiePriorityFirstSeen(value: number | null) {
  return typeof value === "number" && Number.isFinite(value)
    ? formatElapsedSeconds(value)
    : "time not retained";
}

function formatElapsedSeconds(value: number) {
  const seconds = Math.max(0, value) / 1000;
  return `${seconds.toPrecision(3)}s`;
}

function formatCookiePriorityEvidence(rows: RuntimeCookiePriorityGroupRow[]) {
  return rows
    .slice(0, 4)
    .map((row) => `${row.vendor} - ${row.purpose} (${formatCookiePriorityFirstSeen(row.firstSeenMs)})`)
    .join(", ");
}

function formatCookiePriorityLabel(priority: RuntimeCookieReviewPriority) {
  switch (priority) {
    case "high":
      return "High";
    case "medium":
      return "Medium";
    case "review_needed":
      return "Review";
    case "contextual":
    default:
      return "Contextual";
  }
}

function getCookiePriorityChecklistStatus(priority: RuntimeCookieReviewPriority): GdprEprivacyCoverageOutcome["status"] {
  switch (priority) {
    case "high":
      return "Gap observed";
    case "medium":
    case "review_needed":
      return "Review signal";
    case "contextual":
    default:
      return "Observed";
  }
}

function compareRuntimePriorityEvidenceRows(
  left: { firstSeenMs: number | null; priority: RuntimeCookieReviewPriority; vendor: string },
  right: { firstSeenMs: number | null; priority: RuntimeCookieReviewPriority; vendor: string }
) {
  const priorityDelta = runtimeCookiePrioritySortWeight(right.priority) - runtimeCookiePrioritySortWeight(left.priority);
  if (priorityDelta !== 0) {
    return priorityDelta;
  }
  if (left.firstSeenMs !== null || right.firstSeenMs !== null) {
    if (left.firstSeenMs === null) {
      return 1;
    }
    if (right.firstSeenMs === null) {
      return -1;
    }
    const firstSeenDelta = left.firstSeenMs - right.firstSeenMs;
    if (firstSeenDelta !== 0) {
      return firstSeenDelta;
    }
  }
  return left.vendor.localeCompare(right.vendor);
}

function runtimeCookiePrioritySortWeight(priority: RuntimeCookieReviewPriority) {
  return { contextual: 1, medium: 2, review_needed: 3, high: 4 }[priority];
}

function runtimeCookieStorageSelectionWeight(priority: RuntimeCookieReviewPriority) {
  return { contextual: 1, review_needed: 2, medium: 3, high: 4 }[priority];
}

function compareRuntimeCookieStorageEvidenceRows(
  left: RuntimeCookiePriorityGroupRow,
  right: RuntimeCookiePriorityGroupRow
) {
  const priorityDelta = runtimeCookieStorageSelectionWeight(right.priority) - runtimeCookieStorageSelectionWeight(left.priority);
  if (priorityDelta !== 0) {
    return priorityDelta;
  }
  return compareRuntimeCookiePriorityRows(left, right);
}

function synthesizePreconsentThirdPartyCookieOutcome(rows: RuntimeCookieEvidenceRow[] | undefined) {
  const thirdPartyGroups = buildRuntimeCookiePriorityGroups(
    (rows ?? []).filter((row) =>
      row.party === "third_party" &&
      row.timingEvidence === "before_consent_cookie_write" &&
      row.nonEssential === true
    )
  )
    .sort(compareRuntimeCookieStorageEvidenceRows);
  if (thirdPartyGroups.length === 0) {
    return undefined;
  }

  const selectedPriority = thirdPartyGroups[0]?.priority ?? "review_needed";
  const selectedRows = thirdPartyGroups.filter((row) => row.priority === selectedPriority);
  const selectedEvidence = formatCookiePriorityEvidence(selectedRows);
  const status = getCookiePriorityChecklistStatus(selectedPriority);
  const priorityLabel = formatCookiePriorityLabel(selectedPriority);
  const firstSeenMs = selectedRows
    .map((row) => row.firstSeenMs)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    .sort((left, right) => left - right)[0] ?? null;
  const vendors = selectedRows.map((row) => row.vendor);

  return {
    criticalEvidence: {
      missingOrIncompleteSourceSignals: [],
      pipeline: {
        concernPolicyKey: `gdpr_eprivacy.pre_consent_cookies_storage.cookie_inventory.${selectedPriority}`,
        projectionStage: "coverage_fallback",
        wc01NormalizedConcernKey: "pre_consent_third_party_cookie_storage",
        ws01EvidenceRole: "retained_pre_consent_cookie_inventory"
      },
      projectedFindings: [],
      retainedEvidence: {
        cookieStoragePriority: selectedPriority,
        cookieStoragePriorityLabel: priorityLabel,
        firstPreconsentThirdPartyCookieOrStorageObservedMs: firstSeenMs,
        preconsentThirdPartyCookieStorageGroups: thirdPartyGroups.slice(0, 24).map((row) => ({
          firstSeenMs: row.firstSeenMs,
          party: row.party,
          priority: row.priority,
          purpose: row.purpose,
          vendor: row.vendor
        })),
        preconsentThirdPartyCookieStorageGroupCount: thirdPartyGroups.length,
        selectedPreconsentThirdPartyCookieStorageVendors: vendors,
        preconsentThirdPartyCookieStorageVendors: vendors
      },
      statusBasis:
        selectedEvidence.length > 0
          ? `${priorityLabel} priority pre-consent 3rd party cookie/storage evidence: ${selectedEvidence}.`
          : `${priorityLabel} priority pre-consent 3rd party cookie/storage evidence was retained.`
    } satisfies GdprEprivacyCoverageCriticalEvidence,
    evidenceRefs: selectedRows
      .map((row) => `${row.vendor} ${row.purpose} cookie/storage first seen ${formatCookiePriorityFirstSeen(row.firstSeenMs)}`)
      .slice(0, 6),
    limitation:
      selectedEvidence.length > 0
        ? `${priorityLabel} priority pre-consent 3rd party cookie/storage evidence was retained for ${selectedEvidence}.`
        : `${priorityLabel} priority pre-consent 3rd party cookie/storage evidence was retained.`,
    rowId: "pre_consent_cookies_storage",
    status
  } satisfies GdprEprivacyCoverageOutcome;
}

function synthesizePreconsentThirdPartyTrackingOutcome(
  rows: GdprEprivacyCoverageChecklistInput["runtimeTrackerPriorityRows"] | undefined
) {
  const trackingRelevanceTokens = new Set([
    "a_b_testing",
    "ad_measurement",
    "advertising",
    "advertising_measurement",
    "analytics",
    "audience_measurement",
    "behavioral_tracking",
    "conversion_tracking",
    "cross_site_tracking",
    "event_tracking",
    "experimentation",
    "fingerprinting",
    "identifier_sync",
    "marketing_attribution",
    "retargeting",
    "session_replay",
    "tracking",
  ]);
  const normalizeToken = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const isTrackingRelevant = (row: NonNullable<typeof rows>[number]) =>
    [row.purpose, ...(row.regulatoryRelevance ?? [])]
      .flatMap((value) => [value, ...value.split(/[,;|/]+/)])
      .map(normalizeToken)
      .some((token) => trackingRelevanceTokens.has(token));
  const thirdPartyRows = (rows ?? [])
    .filter((row) => row.party === "3rd" || row.party === "mixed" || row.party === "third_party")
    .filter(isTrackingRelevant)
    .sort(compareRuntimePriorityEvidenceRows);
  if (thirdPartyRows.length === 0) {
    return undefined;
  }

  const selectedPriority = thirdPartyRows[0]?.priority ?? "review_needed";
  const selectedRows = thirdPartyRows.filter((row) => row.priority === selectedPriority);
  const selectedEvidence = selectedRows
    .slice(0, 4)
    .map((row) => `${row.vendor} - ${row.purpose} (${formatCookiePriorityFirstSeen(row.firstSeenMs)})`)
    .join(", ");
  const status = "Not confirmed" as const;
  const priorityLabel = formatCookiePriorityLabel(selectedPriority);
  const firstSeenMs = selectedRows
    .map((row) => row.firstSeenMs)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    .sort((left, right) => left - right)[0] ?? null;
  const vendors = selectedRows.map((row) => row.vendor);
  const serviceConnectionOnly = thirdPartyRows.every((row) =>
    /tag management|tag_manager|advertising library|configuration/i.test(row.purpose) ||
    row.regulatoryRelevance?.some((value) => /advertising_library|configuration/i.test(value)) === true
  );
  const contextualInfrastructureOnly = thirdPartyRows.every((row) =>
    row.priority === "contextual" &&
    /cdn|content delivery|security|bot|fraud|infrastructure|necessary|functional/i.test(
      `${row.purpose} ${(row.regulatoryRelevance ?? []).join(" ")}`
    )
  );

  return {
    criticalEvidence: {
      missingOrIncompleteSourceSignals: contextualInfrastructureOnly ? [] : [
        makeSourceSignalGap(
          "CertScore.unifiedFinding.preconsent_tracking",
          "promotion-eligible normalized concern and unified finding",
          "tracker inventory only",
          "Grouped tracker inventory remains review evidence unless the canonical promotion-grade sequence contract passes."
        )
      ],
      pipeline: {
        concernPolicyKey: `gdpr_eprivacy.pre_consent_third_party_tracking.tracker_inventory.${selectedPriority}`,
        projectionStage: "coverage_fallback",
        wc01NormalizedConcernKey: "pre_consent_third_party_tracking",
        ws01EvidenceRole: "retained_pre_consent_tracker_inventory"
      },
      projectedFindings: [],
      retainedEvidence: {
        firstPreconsentThirdPartyTrackingObservedMs: firstSeenMs,
        preconsentThirdPartyTrackerGroups: thirdPartyRows.slice(0, 24).map((row) => ({
          firstSeenMs: row.firstSeenMs,
          party: row.party,
          priority: row.priority,
          purpose: row.purpose,
          vendor: row.vendor
        })),
        preconsentThirdPartyTrackerGroupCount: thirdPartyRows.length,
        selectedPreconsentThirdPartyTrackingVendors: vendors,
        preconsentThirdPartyTrackingVendors: vendors,
        contextualInfrastructureOnly,
        serviceConnectionOnly,
        tagManagerOnly: serviceConnectionOnly && thirdPartyRows.every((row) => /tag management|tag_manager/i.test(row.purpose)),
        trackingEvidenceAssessment: {
          result: "not_confirmed_from_grouped_inventory",
          scoreEffect: "none"
        },
        trackerPriority: selectedPriority,
        trackerPriorityLabel: priorityLabel
      },
      statusBasis:
        contextualInfrastructureOnly
          ? `Only contextual CDN/security infrastructure was retained before consent: ${selectedEvidence || vendors.join(", ")}. These rows remain neutral inventory and do not establish tracking.`
        : serviceConnectionOnly && thirdPartyRows.every((row) => /tag management|tag_manager/i.test(row.purpose))
          ? `A pre-consent tag-manager load was retained for review without a concrete downstream analytics/advertising request, cookie, or storage write: ${selectedEvidence || vendors.join(", ")}.`
        : serviceConnectionOnly
          ? `Pre-consent advertising/analytics service connections were retained for review without a concrete ad, analytics-event, identifier, or storage-write event: ${selectedEvidence || vendors.join(", ")}.`
          : selectedEvidence.length > 0
          ? `${priorityLabel} priority pre-consent tracker inventory was retained without a promotion-eligible normalized concern or unified finding: ${selectedEvidence}. Tracking is not confirmed from grouped inventory alone.`
          : `${priorityLabel} priority pre-consent tracker inventory was retained without a promotion-eligible normalized concern or unified finding. Tracking is not confirmed from grouped inventory alone.`,
    } satisfies GdprEprivacyCoverageCriticalEvidence,
    evidenceRefs: selectedRows
      .map((row) => `${row.vendor} ${row.purpose} at ${row.domains?.join(", ") || "retained request host"}, first seen ${formatCookiePriorityFirstSeen(row.firstSeenMs)}${row.requestCount ? `, ${row.requestCount} request${row.requestCount === 1 ? "" : "s"}` : ""}`)
      .slice(0, 6),
    limitation:
      selectedEvidence.length > 0
        ? `${priorityLabel} priority pre-consent tracker inventory was retained for ${selectedEvidence}; promotion-grade tracking evidence was not confirmed.`
        : `${priorityLabel} priority pre-consent tracker inventory was retained; promotion-grade tracking evidence was not confirmed.`,
    rowId: "pre_consent_third_party_tracking",
    status: contextualInfrastructureOnly ? "Not observed" as const : status
  } satisfies GdprEprivacyCoverageOutcome;
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
  const policyEvidenceAssessment = getRecordValue(input.criticalEvidence.retainedEvidence.policyEvidenceAssessment);
  const neutralPolicyRetrievalLimitation =
    input.status === "Not confirmed" &&
    getStringValue(policyEvidenceAssessment?.scoreEffect ?? policyEvidenceAssessment?.score_effect) === "none";
  const trackingEvidenceAssessment = getRecordValue(input.criticalEvidence.retainedEvidence.trackingEvidenceAssessment);
  const neutralTrackingInventoryLimitation =
    input.id === "pre_consent_third_party_tracking" &&
    input.status === "Not confirmed" &&
    getStringValue(trackingEvidenceAssessment?.scoreEffect ?? trackingEvidenceAssessment?.score_effect) === "none";
  const neutralEvidenceLimitation = neutralPolicyRetrievalLimitation || neutralTrackingInventoryLimitation;
  const assessmentStatus = neutralEvidenceLimitation
    ? "coverage_limitation"
    : input.id === "consent_choice_quality" && input.status === "Not confirmed"
      ? "coverage_limitation"
      : getAssessmentStatus(input.status);
  const evidenceState = getEvidenceState({
    assessmentStatus,
    id: input.id,
    status: input.status
  });

  return {
    assessmentStatus,
    criticalEvidence: enrichCriticalEvidenceWithSelection({
      criticalEvidence: input.criticalEvidence,
      rowId: input.id,
      status: input.status
    }),
    evidenceRefs: input.evidenceRefs,
    evidenceState,
    explanation: input.explanation,
    id: input.id,
    label: input.label,
    limitation: input.limitation,
    note: input.explanation,
    status: input.status,
    tone: neutralEvidenceLimitation ? "neutral" : getChecklistTone(input.status)
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
    refs.add(
      finding.unifiedFindingId === "consent_dark_patterns_detected"
        ? "Consent choice quality"
        : finding.presentation?.findingName || finding.title || finding.unifiedFindingId
    );

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
    refs.add(
      finding.id === "consent_dark_patterns_detected"
        ? "Consent choice quality"
        : finding.label
    );
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

  return isSensitiveSurfaceReviewEvidence(rowId, finding);
}

function getSessionReplayEvidenceFromOutcome(outcome: GdprEprivacyCoverageOutcome | undefined) {
  const evidence = outcome?.criticalEvidence.retainedEvidence.sessionReplayEvidence;
  return evidence && typeof evidence === "object" && !Array.isArray(evidence)
    ? evidence as Record<string, unknown>
    : null;
}

function getBrowserDeviceEntropyEvidenceFromOutcome(outcome: GdprEprivacyCoverageOutcome | undefined) {
  const evidence = outcome?.criticalEvidence.retainedEvidence.browserDeviceEntropyEvidence;
  return evidence && typeof evidence === "object" && !Array.isArray(evidence)
    ? evidence as Record<string, unknown>
    : null;
}

function isApprovedMultilingualArticle13ConcernOutcome(outcome: GdprEprivacyCoverageOutcome | undefined) {
  const concern = outcome?.criticalEvidence.retainedEvidence.gdprTransparencyArticle13Concern;
  return concern && typeof concern === "object" && !Array.isArray(concern);
}

function shouldIncludeChecklistRowDefinition(
  definition: ChecklistRowDefinition,
  coverageOutcome: GdprEprivacyCoverageOutcome | undefined
) {
  if (definition.id !== "automated_decision_making_profiling_disclosure") {
    return true;
  }

  return isApprovedMultilingualArticle13ConcernOutcome(coverageOutcome);
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

function normalizeEvidenceVendorName(value: string) {
  if (/cloudflare/i.test(value)) {
    return null;
  }
  if (/linkedin insight|linkedin ads|px\.ads\.linkedin|snap\.licdn/i.test(value)) {
    return "LinkedIn Insight Tag";
  }
  if (/meta pixel|facebook pixel|connect\.facebook|facebook\.com\/tr/i.test(value)) {
    return "Meta Pixel";
  }
  if (/google tag manager|googletagmanager|\bgtm\b/i.test(value)) {
    return "Google Tag Manager";
  }
  if (/google analytics|google-analytics|analytics\.google|google\.com\/g\/collect|^_ga/i.test(value)) {
    return "Google Analytics";
  }
  if (/reddit/i.test(value)) {
    return "Reddit Pixel";
  }
  if (/heap/i.test(value)) {
    return "Heap";
  }
  if (/zoominfo|zi-scripts/i.test(value)) {
    return "ZoomInfo";
  }
  return value.trim();
}

function getCanonicalVendors(values: Array<string | null | undefined>) {
  return uniqueEntityStrings(values.flatMap((value) => {
    if (!value) {
      return [];
    }
    const normalized = normalizeEvidenceVendorName(value);
    return normalized ? [normalized] : [];
  }));
}

function getPreconsentTrackingVendors(findings: UnifiedFindingDisplayPacket[]) {
  return getCanonicalVendors([
    ...getFindingEntityStrings(findings, [
      "preconsent_tracker_vendors",
      "runtimeVendors",
      "runtime_vendors",
      "vendors"
    ]),
    ...getFindingEntityRows(findings, [
      "preconsent_tracker_vendor_evidence",
      "representativeRequests",
      "runtimeVendorEvidence"
    ]).flatMap((row) => [
      getStringValue(row.name),
      getStringValue(row.vendor),
      getStringValue(row.vendorName),
      getStringValue(row.vendor_name),
      getStringValue(row.representativeUrl),
      getStringValue(row.representative_url),
      getStringValue(row.requestUrl),
      getStringValue(row.request_url),
      getStringValue(row.url)
    ])
  ]);
}

function getRecordRows(record: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!record) {
    return [];
  }

  return keys.flatMap((key) => {
    const value = record[key];
    return Array.isArray(value)
      ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
      : [];
  });
}

function getProjectedFindingEntityRows(findings: ProjectedGdprFinding[], keys: string[]) {
  return findings.flatMap((finding) => {
    const evidenceDetails = finding.evidenceDetails && typeof finding.evidenceDetails === "object"
      ? finding.evidenceDetails as Record<string, unknown>
      : null;
    return getRecordRows(evidenceDetails, keys);
  });
}

function getPreconsentTrackingRows(input: {
  findings: UnifiedFindingDisplayPacket[];
  projectedFindings?: ProjectedGdprFinding[];
}) {
  const keys = [
    "preconsent_tracker_vendor_evidence",
    "representativeRequests",
    "runtimeVendorEvidence",
    "vendors"
  ];
  return [
    ...getFindingEntityRows(input.findings, keys),
    ...getProjectedFindingEntityRows(input.projectedFindings ?? [], keys)
  ];
}

type PreconsentPurposeBucket =
  | "advertising"
  | "analytics"
  | "performance"
  | "security"
  | "functional"
  | "session_replay"
  | "tag_management"
  | "unknown";

function normalizePreconsentPurposeBucket(row: Record<string, unknown>): PreconsentPurposeBucket {
  const category = [
    getStringValue(row.category),
    getStringValue(row.vendorCategory),
    getStringValue(row.vendor_category),
    getStringValue(row.purpose),
    getStringValue(row.vendorPurpose),
    getStringValue(row.vendor_purpose)
  ].filter(Boolean).join(" ").toLowerCase();
  const label = [
    getStringValue(row.name),
    getStringValue(row.vendor),
    getStringValue(row.vendorName),
    getStringValue(row.vendor_name),
    getStringValue(row.product),
    getStringValue(row.requestUrl),
    getStringValue(row.request_url),
    getStringValue(row.representativeUrl),
    getStringValue(row.representative_url),
    getStringValue(row.url)
  ].filter(Boolean).join(" ").toLowerCase();
  const categoryHas = (pattern: RegExp) => pattern.test(category);
  const labelHas = (pattern: RegExp) => pattern.test(label);
  const haystack = `${category} ${label}`;

  if (labelHas(/security|fraud|bot|bot manager|akamai bot|perimeterx|human bot|datadome|forter|cloudflare bot|infrastructure|_abck|bm_sz|ak_bmsc/)) {
    return "security";
  }
  if (labelHas(/performance|rum|real user monitoring|mpulse|go-mpulse|boomerang|new relic|datadog|sentry/)) {
    return "performance";
  }
  if (labelHas(/functional|strictly necessary|necessary|consent_management|cmp|customer_support|cdn|delivery/)) {
    return "functional";
  }
  if (labelHas(/google tag manager|googletagmanager|\bgtm\b/) || categoryHas(/tag[_ -]?management|tag[_ -]?manager/)) {
    return "tag_management";
  }
  if (labelHas(/session_replay|session replay|behavioral_analytics|contentsquare|fullstory|hotjar|logrocket|clarity/) || categoryHas(/session_replay|session replay|behavioral_analytics/)) {
    return "session_replay";
  }
  if (labelHas(/advertis|retarget|adtech|targeting|marketing_pixel|social_pixel|doubleclick|google ads|meta pixel|facebook pixel|linkedin insight|tiktok|reddit pixel/) || categoryHas(/advertis|retarget|adtech|targeting|marketing_pixel|social_pixel/)) {
    return "advertising";
  }
  if (categoryHas(/security|fraud|bot|bot manager|akamai bot|perimeterx|human bot|datadome|forter|cloudflare bot|infrastructure/)) {
    return "security";
  }
  if (categoryHas(/performance|rum|real user monitoring|mpulse|go-mpulse|new relic|datadog|sentry/)) {
    return "performance";
  }
  if (labelHas(/analytics|measurement|product_analytics|customer_data_platform|google analytics|adobe analytics|mixpanel|amplitude|posthog/) || categoryHas(/analytics|measurement|product_analytics|customer_data_platform/)) {
    return "analytics";
  }
  if (categoryHas(/functional|strictly necessary|necessary|consent_management|cmp|customer_support|cdn|delivery/)) {
    return "functional";
  }
  return "unknown";
}

function getPreconsentPurposeMix(input: {
  findings: UnifiedFindingDisplayPacket[];
  projectedFindings?: ProjectedGdprFinding[];
}) {
  const rows = getPreconsentTrackingRows(input);
  const mix = new Map<PreconsentPurposeBucket, string[]>();
  for (const row of rows) {
    const bucket = normalizePreconsentPurposeBucket(row);
    const vendor = getCanonicalVendors([
      getStringValue(row.name),
      getStringValue(row.vendor),
      getStringValue(row.vendorName),
      getStringValue(row.vendor_name),
      getStringValue(row.product),
      getStringValue(row.representativeUrl),
      getStringValue(row.representative_url),
      getStringValue(row.requestUrl),
      getStringValue(row.request_url),
      getStringValue(row.url)
    ])[0];
    mix.set(bucket, uniqueEntityStrings([...(mix.get(bucket) ?? []), vendor]));
  }
  return mix;
}

function buildPreconsentTrackingExplanation(input: {
  findings: UnifiedFindingDisplayPacket[];
  projectedFindings?: ProjectedGdprFinding[];
}) {
  const purposeMix = getPreconsentPurposeMix(input);
  const vendorFallback = getPreconsentTrackingVendors(input.findings).slice(0, 8);
  const advertisingVendors = purposeMix.get("advertising") ?? [];
  const sessionReplayVendors = purposeMix.get("session_replay") ?? [];
  const analyticsVendors = purposeMix.get("analytics") ?? [];
  const performanceVendors = purposeMix.get("performance") ?? [];
  const securityVendors = purposeMix.get("security") ?? [];
  const unknownVendors = purposeMix.get("unknown") ?? [];
  const functionalVendors = purposeMix.get("functional") ?? [];
  const tagManagementVendors = purposeMix.get("tag_management") ?? [];

  if (advertisingVendors.length > 0 || sessionReplayVendors.length > 0) {
    const vendors = uniqueEntityStrings([...advertisingVendors, ...sessionReplayVendors]).slice(0, 8);
    return `Advertising/retargeting or behavioral-tracking requests fired before a recorded consent choice${vendors.length > 0 ? `, including ${formatVendorPhrase(vendors)}` : ""}. This is a consent timing/enforcement gap when supported by the retained request evidence.`;
  }

  if (analyticsVendors.length > 0) {
    const vendors = uniqueEntityStrings([...analyticsVendors, ...performanceVendors]).slice(0, 8);
    return `Analytics or performance-measurement requests fired before a recorded consent choice${vendors.length > 0 ? `, including ${formatVendorPhrase(vendors)}` : ""}. Review whether the retained evidence reflects non-essential measurement rather than strictly necessary site operation.`;
  }

  if (tagManagementVendors.length > 0) {
    return `Tag-management infrastructure was observed before a recorded consent choice, including ${formatVendorPhrase(tagManagementVendors.slice(0, 8))}. Review downstream tags before treating this as confirmed analytics, advertising, or retargeting activity.`;
  }

  if (performanceVendors.length > 0 || securityVendors.length > 0 || functionalVendors.length > 0) {
    const vendors = uniqueEntityStrings([...securityVendors, ...performanceVendors, ...functionalVendors]).slice(0, 8);
    return `Security/performance vendor activity was observed before a recorded consent choice${vendors.length > 0 ? `, including ${formatVendorPhrase(vendors)}` : ""}. This preserves the timing evidence without classifying the activity as advertising or retargeting.`;
  }

  if (unknownVendors.length > 0) {
    return `3rd party vendor activity with unresolved purpose was observed before a recorded consent choice, including ${formatVendorPhrase(unknownVendors.slice(0, 8))}. Review purpose and essentiality before treating it as advertising or retargeting.`;
  }

  return `3rd party vendor activity was observed before a recorded consent choice${vendorFallback.length > 0 ? `, including ${formatVendorPhrase(vendorFallback)}` : ""}. Review retained request categories before treating it as advertising or retargeting.`;
}

function hasHighRiskPreconsentTrackingPurpose(input: {
  findings: UnifiedFindingDisplayPacket[];
  projectedFindings?: ProjectedGdprFinding[];
}) {
  if (getPreconsentTrackingRows(input).length === 0) {
    return true;
  }
  const purposeMix = getPreconsentPurposeMix(input);
  return (
    (purposeMix.get("advertising")?.length ?? 0) > 0 ||
    (purposeMix.get("session_replay")?.length ?? 0) > 0 ||
    (purposeMix.get("analytics")?.length ?? 0) > 0
  );
}

function getPreconsentStorageSummary(findings: UnifiedFindingDisplayPacket[]) {
  const rows = getFindingEntityRows(findings, [
    "preconsent_cookie_evidence",
    "preConsentCookieExamples",
    "cookieEvidence",
    "storageEvidence"
  ]);
  const names = getFindingEntityStrings(findings, [
    "preconsent_cookie_names",
    "preconsent_nonessential_cookie_names"
  ]);
  const domains = uniqueEntityStrings(rows.flatMap((row) => [
    getStringValue(row.domain),
    getStringValue(row.hostname),
    getStringValue(row.host),
    getStringValue(row.cookieDomain),
    getStringValue(row.cookie_domain)
  ]));
  const vendors = getCanonicalVendors([
    ...getFindingEntityStrings(findings, [
      "preconsent_cookie_initiator_vendors"
    ]),
    ...rows.flatMap((row) => [
      getStringValue(row.vendor),
      getStringValue(row.vendorName),
      getStringValue(row.vendor_name),
      getStringValue(row.initiatorVendor),
      getStringValue(row.initiator_vendor),
      getStringValue(row.cookieInitiatorVendor),
      getStringValue(row.cookie_initiator_vendor),
      getStringValue(row.cookieName),
      getStringValue(row.cookie_name)
    ]),
    ...names
  ]);
  return {
    domains,
    names: uniqueEntityStrings(names),
    vendors
  };
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
    `Transfer-relevant advertising, analytics, or behavioral tracking endpoints were observed for ${formatVendorPhrase(vendors.slice(0, 6))}. Additional 3rd party asset endpoints were retained as supporting runtime context.`
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
  if (input.definition.id !== SESSION_REPLAY_PARENT_ROW_ID) {
    return {
      evidenceRefs: input.evidenceRefs,
      explanation: input.definition.explanation,
      label: input.definition.label,
      status: input.status
    };
  }

  const outcomeEvidence = getSessionReplayEvidenceFromOutcome(input.coverageOutcome);
  const entropyEvidence = getBrowserDeviceEntropyEvidenceFromOutcome(input.coverageOutcome);
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
  const entropyOnlyReview =
    Boolean(entropyEvidence) &&
    vendors.length === 0 &&
    input.coverageOutcome?.criticalEvidence.retainedEvidence.sessionReplayObserved === false;

  if (gapObserved) {
    return {
      evidenceRefs: input.evidenceRefs,
      explanation: preConsentObserved
        ? "Session replay or behavioral analytics was observed before a recorded consent action. Review disclosure, masking, sensitive-page coverage, and refusal behavior as supporting subchecks."
        : "CertScore.ai observed session replay or behavioral analytics in a higher-risk context, such as sensitive-surface co-presence, disclosure mismatch, post-reject persistence, or retained payload exposure. Review consent timing, disclosure, masking/exclusion settings, sensitive-page coverage, and withdrawal controls.",
      label: input.definition.label,
      status: "Gap observed" as const
    };
  }

  if (entropyOnlyReview && input.status === "Review signal") {
    return {
      evidenceRefs: input.evidenceRefs,
      explanation: "No eligible session replay or behavioral recording vendor was observed in the tested context. Browser/device entropy evidence is evaluated separately in the device identification row.",
      label: input.definition.label,
      status: "Not observed" as const
    };
  }

  if (input.coverageOutcome?.status === "Observed" && postConsentOrNotPreConsent) {
    const timingPhrase = sessionReplayEvidenceHasPostConsentSignal(outcomeEvidence)
      ? "observed after the pre-consent phase"
      : "not observed pre-consent in retained evidence";
    return {
      evidenceRefs: input.evidenceRefs,
      explanation: `CertScore.ai observed session replay or behavioral analytics vendors ${timingPhrase}${vendorPhrase ? `, including ${vendorPhrase}` : ""}.`,
      label: input.definition.label,
      status: "Observed" as const
    };
  }

  if (input.status === "Observed" || input.status === "Review signal" || postConsentOrNotPreConsent) {
    const timingPhrase = sessionReplayEvidenceHasPostConsentSignal(outcomeEvidence)
      ? "observed after the pre-consent phase"
      : "not observed pre-consent in retained evidence";
    return {
      evidenceRefs: input.evidenceRefs,
      explanation: `CertScore.ai observed session replay or behavioral analytics vendors ${timingPhrase}${vendorPhrase ? `, including ${vendorPhrase}` : ""}. Because these tools can capture user interaction behavior, review consent timing, disclosure, masking/exclusion settings, sensitive-page coverage, and withdrawal controls.`,
      label: input.definition.label,
      status: "Review signal" as const
    };
  }

  if (input.status === "Not observed") {
    return {
      evidenceRefs: input.evidenceRefs,
      explanation: "No eligible session replay, behavioral recording, or fingerprinting-like signal was observed in the tested context.",
      label: input.definition.label,
      status: input.status
    };
  }

  if (input.status === "Not testable") {
    return {
      evidenceRefs: input.evidenceRefs,
      explanation: "Session replay and behavioral analytics review was not testable from retained runtime evidence for this scan context.",
      label: input.definition.label,
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
  projectedFindings?: ProjectedGdprFinding[];
  status: GdprEprivacyCoverageChecklistStatus;
  coverageOutcome?: GdprEprivacyCoverageOutcome;
}) {
  if (input.definition.id === "session_replay_fingerprinting_review") {
    return specializeSessionReplayChecklistRow(input);
  }

  if (
    input.definition.id === "consent_choice_quality" &&
    input.coverageOutcome?.criticalEvidence.retainedEvidence.controlInventoryComplete === false
  ) {
    return {
      evidenceRefs: input.evidenceRefs,
      explanation: "The first-layer control inventory was incomplete, so consent choice quality and dark-pattern characteristics were not confirmed from the retained evidence.",
      label: input.definition.label,
      status: "Not confirmed" as const
    };
  }

  if (input.definition.id === "consent_surface_observed" && input.status === "Observed") {
    return {
      evidenceRefs: input.evidenceRefs,
      explanation: "An actionable cookie/consent banner or preference surface was observed in the tested context. This confirms CMP availability; consent-enforcement timing is assessed separately.",
      label: input.definition.label,
      status: "Observed" as const
    };
  }

    if (
      input.definition.id === "consent_surface_observed" &&
      (input.status === "Review signal" || input.status === "Not confirmed")
    ) {
      return {
        evidenceRefs: input.evidenceRefs,
        explanation:
          input.coverageOutcome?.limitation ??
          "A privacy-choice or preference control was retained, but the retained evidence did not confirm a first-layer cookie consent banner or CMP preference surface.",
        label:
          /privacy notice gate with privacy-choice link/i.test(input.coverageOutcome?.limitation ?? "")
            ? "Privacy notice gate with privacy-choice link observed; GDPR/ePrivacy consent surface not confirmed."
            : /legal\/privacy notice gate/i.test(input.coverageOutcome?.limitation ?? "")
              ? "Legal/privacy notice gate observed; GDPR/ePrivacy consent surface not confirmed."
              : /privacy\/ad-choice|ad-choice|footer privacy|vendor opt-out/i.test(input.coverageOutcome?.limitation ?? "")
            ? "Privacy/ad-choice controls observed; GDPR/ePrivacy consent banner not confirmed."
            : input.definition.label,
        status: "Not confirmed" as const
      };
    }

  if (input.definition.id === "pre_consent_third_party_tracking" && input.coverageOutcome?.criticalEvidence.retainedEvidence.trackerPriority) {
    const statusBasis = input.coverageOutcome.criticalEvidence.statusBasis;
    const tagManagerOnly = input.coverageOutcome.criticalEvidence.retainedEvidence.tagManagerOnly === true;
    const serviceConnectionOnly = input.coverageOutcome.criticalEvidence.retainedEvidence.serviceConnectionOnly === true;
    return {
      evidenceRefs: input.evidenceRefs,
      explanation:
        `${statusBasis} This row is limited to concrete 3rd party tracker/request evidence retained before a recorded consent choice.`,
      label: tagManagerOnly
        ? "Pre-consent tag-manager load"
        : serviceConnectionOnly
          ? "Pre-consent advertising/analytics service connections"
          : input.definition.label,
      status: input.coverageOutcome.status
    };
  }

  if (input.definition.id === "pre_consent_third_party_tracking" && input.status === "Gap observed") {
    const highRiskPurposeRetained = hasHighRiskPreconsentTrackingPurpose({
      findings: input.findings,
      projectedFindings: input.projectedFindings
    });
    return {
      evidenceRefs: input.evidenceRefs,
      explanation: buildPreconsentTrackingExplanation({
        findings: input.findings,
        projectedFindings: input.projectedFindings
      }),
      label: input.definition.label,
      status: highRiskPurposeRetained ? "Gap observed" as const : "Review signal" as const
    };
  }

  if (input.definition.id === "pre_consent_cookies_storage" && input.coverageOutcome?.criticalEvidence.retainedEvidence.cookieStoragePriority) {
    const statusBasis = input.coverageOutcome.criticalEvidence.statusBasis;
    return {
      evidenceRefs: input.evidenceRefs,
      explanation:
        `${statusBasis} This row is limited to concrete 3rd party cookie/storage evidence retained before a recorded consent choice.`,
      label: input.definition.label,
      status: input.coverageOutcome.status
    };
  }

  if (input.definition.id === "pre_consent_cookies_storage" && input.status === "Gap observed") {
    const storage = getPreconsentStorageSummary(input.findings);
    const vendorPhrase = formatVendorPhrase(storage.vendors.slice(0, 4));
    const domainPhrase = formatVendorPhrase(storage.domains.slice(0, 3));
    return {
      evidenceRefs: input.evidenceRefs,
      explanation:
        `Storage or cookie evidence was observed before a recorded consent choice${vendorPhrase ? ` for ${vendorPhrase}` : ""}${domainPhrase ? ` on ${domainPhrase}` : ""}. This row is limited to concrete storage/cookie evidence and does not imply every observed runtime vendor wrote storage.`,
      label: input.definition.label,
      status: "Gap observed" as const
    };
  }

  if (input.definition.id === "device_identification_fingerprinting_signal_observed" && input.status === "Review signal") {
    return {
      evidenceRefs: input.evidenceRefs,
      explanation:
        input.coverageOutcome?.limitation ??
        "Coordinated browser/device signal evidence was retained across multiple attribute families; the retained record is not sufficient to confirm fingerprinting.",
      label: input.definition.label,
      status: "Review signal" as const
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

  if (input.definition.id === "preference_withdrawal_control" && input.status === "Review signal") {
    return {
      evidenceRefs: input.evidenceRefs,
      explanation:
        input.coverageOutcome?.limitation ??
        "Footer privacy/ad-choice and vendor opt-out links were observed, but CertScore.ai did not confirm a GDPR/ePrivacy cookie preference center or consent-withdrawal control.",
      label: input.definition.label,
      status: "Review signal" as const
    };
  }

  if (input.definition.id === "cross_border_endpoint_review" && input.status === "Gap observed") {
    return {
      evidenceRefs: input.evidenceRefs,
      explanation:
        "Endpoint geography creates a transfer-review signal. The gap status is based on retained disclosure mismatch for transfer-relevant advertising, analytics, or tag-management vendors.",
      label: "Transfer-relevant vendor disclosure gap",
      status: "Gap observed" as const
    };
  }

  if (input.definition.id === "cross_border_endpoint_review" && input.status === "Review signal") {
    return {
      evidenceRefs: input.evidenceRefs,
      explanation:
        "Endpoint geography creates a transfer-review signal. The gap status requires retained disclosure mismatch for transfer-relevant advertising, analytics, or tag-management vendors.",
      label: "Cross-border endpoint transfer review signal",
      status: "Review signal" as const
    };
  }

  if (input.definition.id === "reject_all_path_availability" && input.status === "Observed") {
    return {
      evidenceRefs: input.evidenceRefs,
      explanation: "A reject-all or equivalent refusal path was observed from the consent surface in the tested context. This positive control is assessed separately from pre-consent tracking enforcement.",
      label: input.definition.label,
      status: "Observed" as const
    };
  }

  if (input.definition.id === "accept_consent_control" && input.status === "Observed") {
    return {
      evidenceRefs: input.evidenceRefs,
      explanation: "An accept, accept-all, or allow-all control was observed from structured first-layer consent-surface evidence. This confirms availability, not the result of clicking it.",
      label: input.definition.label,
      status: "Observed" as const
    };
  }

  if (input.definition.id === "post_reject_tracking_reduction" && input.status === "Observed") {
    return {
      evidenceRefs: input.evidenceRefs,
      explanation: "A reject interaction was confirmed and retained evidence showed non-essential tracking decreased after refusal. This positive control does not neutralize pre-consent tracking observed before any choice.",
      label: input.definition.label,
      status: "Observed" as const
    };
  }

  if (input.definition.id === "sensitive_surfaces_third_party_tracking" && input.status === "Not observed") {
    return {
      evidenceRefs: input.evidenceRefs,
      explanation:
        "Sensitive-field correlation completed and did not retain eligible sensitive fields alongside 3rd party tracking in the tested context.",
      label: input.definition.label,
      status: "Not observed" as const
    };
  }

  if (input.definition.id === "accessibility_consent_controls" && input.status === "Not observed") {
    return {
      evidenceRefs: input.evidenceRefs,
      explanation:
        "No consent/privacy-control accessibility issue retained. Automated accessibility issues may exist elsewhere in the tested page context, but scanner did not tie retained examples to the consent banner, preference center, or privacy-choice controls.",
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

function shouldPreferCoverageOutcomeForMissingReject(
  rowId: string,
  coverageOutcome: GdprEprivacyCoverageOutcome | undefined
) {
  if (
    rowId !== "reject_all_path_availability" ||
    (coverageOutcome?.status !== "Gap observed" && coverageOutcome?.status !== "Review signal")
  ) {
    return false;
  }

  const retained = getRecordValue(coverageOutcome.criticalEvidence.retainedEvidence) ?? {};
  return (
    readRetainedBoolean(retained, [
      "preconsentCookieOrTrackingActivityObserved",
      "preconsent_cookie_or_tracking_activity_observed"
    ]) === true &&
    readRetainedBoolean(retained, ["rejectControlObserved", "reject_control_observed"]) === false
  );
}

function shouldPreferCoverageOutcomeForConsentChoiceQuality(
  rowId: string,
  coverageOutcome: GdprEprivacyCoverageOutcome | undefined
) {
  if (
    rowId !== "consent_choice_quality" ||
    !coverageOutcome ||
    coverageOutcome.status === "Not testable" ||
    coverageOutcome.status === "Insufficient evidence"
  ) {
    return false;
  }

  const retained = getRecordValue(coverageOutcome.criticalEvidence.retainedEvidence) ?? {};
  const visibleChoiceLabels = retainedStringArray(retained, ["visibleChoiceLabels", "visible_choice_labels"]);
  const directGapReasons = retainedStringArray(retained, ["directGapReasons", "direct_gap_reasons"]);
  const missingEvidenceNeeded = retainedStringArray(retained, ["missingEvidenceNeeded", "missing_evidence_needed"]);
  return (
    readRetainedBoolean(retained, [
      "firstLayerCookieConsentBannerObserved",
      "first_layer_cookie_consent_banner_observed"
    ]) === true &&
    (visibleChoiceLabels.length > 0 || directGapReasons.length > 0 || missingEvidenceNeeded.length > 0)
  );
}

function shouldPreferCoverageOutcomeForContextualInfrastructure(
  rowId: string,
  coverageOutcome: GdprEprivacyCoverageOutcome | undefined
) {
  if (rowId !== "pre_consent_third_party_tracking" || coverageOutcome?.status !== "Not observed") {
    return false;
  }

  const retained = getRecordValue(coverageOutcome.criticalEvidence.retainedEvidence) ?? {};
  return readRetainedBoolean(retained, ["contextualInfrastructureOnly", "contextual_infrastructure_only"]) === true;
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
  source: "scanner" | "CertScore.ai" = "CertScore.ai"
): GdprEprivacyCoverageSourceSignalGap {
  return { actual, expected, field, source, whyNeeded };
}

const RUNTIME_TIMING_ROW_ENTITY_DENYLIST = new Set([
  "consentGovernanceCookiePolicyUrls",
  "consentGovernanceDisclosureEvidence",
  "consentGovernancePolicyUrls",
  "consentGovernancePreferenceCenterUrls",
  "consentGovernanceTextAnchors",
  "findingSubtype",
  "runtimeVendorDisclosureEvidence"
]);

const RUNTIME_TIMING_ROW_FLAG_ALLOWLIST = [
  /direct_runtime/i,
  /pre[_ -]?consent/i,
  /privacy\.session_replay/i,
  /session_replay/i,
  /tracking/i
];

function isRuntimeTimingRow(rowId: string) {
  return (
    rowId === "pre_consent_third_party_tracking" ||
    rowId === "session_replay_fingerprinting_review" ||
    rowId === "device_identification_fingerprinting_signal_observed"
  );
}

function getFindingEntityPreview(rowId: string, finding: UnifiedFindingDisplayPacket) {
  const entities = finding.evidence?.entities ?? {};
  return Object.fromEntries(
    Object.entries(entities)
      .filter(([key, values]) =>
        Array.isArray(values) &&
        values.length > 0 &&
        (!isRuntimeTimingRow(rowId) || !RUNTIME_TIMING_ROW_ENTITY_DENYLIST.has(key))
      )
      .slice(0, 5)
      .map(([key, values]) => [key, values.slice(0, 5)])
  );
}

function getFindingEvidenceFlagPreview(rowId: string, finding: UnifiedFindingDisplayPacket) {
  const flags = finding.evidence?.flags ?? [];
  if (!isRuntimeTimingRow(rowId)) {
    return flags.slice(0, 5);
  }

  return flags
    .filter((flag) => RUNTIME_TIMING_ROW_FLAG_ALLOWLIST.some((pattern) => pattern.test(flag)))
    .slice(0, 5);
}

function getUnifiedFindingStatusBasis(input: {
  fallbackStatusBasis: string;
  findings: UnifiedFindingDisplayPacket[];
  projectedFindings: NonNullable<GdprEprivacyCoverageChecklistInput["projectedFindings"]>;
  rowId: string;
  status: GdprEprivacyCoverageChecklistStatus;
}) {
  const highlights = getRowEvidenceHighlights({
    findings: input.findings,
    projectedFindings: input.projectedFindings,
    rowId: input.rowId
  });
  const firstHighlight = highlights[0];

  if (input.rowId === "pre_consent_third_party_tracking" && input.status === "Gap observed") {
    return firstHighlight
      ? `${firstHighlight} Consent action was not recorded before these requests.`
      : "Classified non-essential tracking request timing evidence was retained before a recorded consent action.";
  }

  if (input.rowId === "session_replay_fingerprinting_review" && input.status === "Gap observed") {
    return firstHighlight
      ? `Session replay or behavioral analytics runtime evidence was retained before a recorded consent action: ${firstHighlight}.`
      : "Session replay or behavioral analytics runtime evidence was retained before a recorded consent action.";
  }

  return input.fallbackStatusBasis;
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
            "CertScore.unifiedFinding.presentationDecision.status",
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
        entities: getFindingEntityPreview(rowId, finding),
        evidenceFlags: getFindingEvidenceFlagPreview(rowId, finding),
        sourceRefs: (finding.sourceRefs ?? []).flatMap((sourceRef) => {
          const formatted = formatSourceRef(sourceRef);
          return formatted ? [formatted] : [];
        }).slice(0, 5)
      })),
      status
    },
    statusBasis: getUnifiedFindingStatusBasis({
      fallbackStatusBasis: statusBasis,
      findings,
      projectedFindings,
      rowId,
      status
    })
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

function getRetainedEvidenceRecord(item: GdprEprivacyCoverageChecklistItem) {
  return getRecordValue(item.criticalEvidence.retainedEvidence) ?? {};
}

function readRetainedBoolean(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") {
      return value;
    }
  }
  return null;
}

function readRetainedString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = getStringValue(record[key]);
    if (value) {
      return value;
    }
  }
  return null;
}

function readRetainedNumber(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function retainedStringArray(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
    }
  }
  return [];
}

function hasConfirmedFirstLayerGdprBanner(record: Record<string, unknown>) {
  const firstLayerObserved = readRetainedBoolean(record, [
    "firstLayerCookieConsentBannerObserved",
    "first_layer_cookie_consent_banner_observed"
  ]);
  const gdprSurfaceObservedRaw =
    record.gdprEprivacyConsentSurfaceObserved ??
    record.gdpr_eprivacy_consent_surface_observed;
  const gdprSurfaceObserved = typeof gdprSurfaceObservedRaw === "boolean"
    ? gdprSurfaceObservedRaw
    : getStringValue(gdprSurfaceObservedRaw);
  if (
    firstLayerObserved === false ||
    gdprSurfaceObserved === false ||
    gdprSurfaceObserved === "unconfirmed" ||
    gdprSurfaceObserved === "unknown" ||
    gdprSurfaceObserved === "false"
  ) {
    return false;
  }
  if (firstLayerObserved === true && (gdprSurfaceObserved === true || gdprSurfaceObserved === "true")) {
    return true;
  }
  return null;
}

function retainedEvidenceHasCookieConsentWithdrawal(record: Record<string, unknown>) {
  const labels = retainedStringArray(record, ["observedControlLabels", "observed_control_labels"]);
  return (
    readRetainedBoolean(record, ["cookiePreferencesLinkObserved", "cookie_preferences_link_observed"]) === true ||
    readRetainedBoolean(record, ["withdrawalTextObserved", "withdrawal_text_observed"]) === true ||
    readRetainedBoolean(record, ["confirmedCookieCategoryControlsObserved", "confirmed_cookie_category_controls_observed"]) === true ||
    readRetainedBoolean(record, ["manageConsentSurfaceObserved", "manage_consent_surface_observed"]) === true ||
    readRetainedBoolean(record, ["manageCookiesSurfaceObserved", "manage_cookies_surface_observed"]) === true ||
    (
      readRetainedBoolean(record, ["cmpReopenControlObserved", "cmp_reopen_control_observed"]) === true &&
      labels.some(isCookieConsentWithdrawalControlLabel) &&
      !labels.every((label) => /ad choices|your privacy choices|google analytics opt-out|vendor opt-out|targeted ads|sale\/share/i.test(label))
    )
  );
}

function isCookieConsentWithdrawalControlLabel(label: string) {
  const normalized = label.trim();
  return (
    /\b(?:cookie\s+(?:settings|preferences|choices|center)|customi[sz]e\s+cookies?|manage\s+(?:consent|cookies|preferences)|consent\s+preferences?|preference\s+center|withdraw\s+consent|change\s+your\s+consent|revoke\s+consent)\b/i.test(normalized) &&
    !/\b(?:close|dismiss|cancel|back|continue|learn\s+more|privacy\s+policy|terms|notice)\b/i.test(normalized)
  );
}

function retainedEvidenceIsAdChoiceOnly(record: Record<string, unknown>) {
  const labels = retainedStringArray(record, ["observedControlLabels", "observed_control_labels"]);
  return (
    readRetainedBoolean(record, ["privacyAdChoiceOnlyControlObserved", "privacy_ad_choice_only_control_observed"]) === true ||
    readRetainedBoolean(record, ["footerPreferenceLinkObserved", "footer_preference_link_observed"]) === true ||
    labels.some((label) => /ad choices|your privacy choices|google analytics opt-out|vendor opt-out|targeted ads|sale\/share/i.test(label))
  );
}

function hasDirectSameContextSensitiveTrackingEvidence(record: Record<string, unknown>) {
  const eligibleObserved =
    readRetainedBoolean(record, ["eligibleSensitiveFieldObserved", "eligible_sensitive_field_observed"]) === true ||
    (readRetainedNumber(record, ["eligibleSensitiveFieldCount", "eligible_sensitive_field_count"]) ?? 0) > 0;
  const sensitiveFieldTypes = retainedStringArray(record, ["sensitiveFieldTypes", "sensitive_field_types"]);
  const sensitiveFieldLabels = retainedStringArray(record, ["sensitiveFieldLabels", "sensitive_field_labels"]);
  const pageUrls = retainedStringArray(record, [
    "pageUrls",
    "page_urls",
    "sensitiveFormUrls",
    "sensitive_form_urls",
    "formUrls",
    "form_urls"
  ]);
  const sameContext =
    readRetainedBoolean(record, ["samePageOrFlow", "same_page_or_flow"]) === true ||
    readRetainedBoolean(record, ["sameContext", "same_context"]) === true;
  const trackingActiveInSameContext =
    readRetainedBoolean(record, [
      "thirdPartyTrackingActiveInSameContext",
      "third_party_tracking_active_in_same_context"
    ]) === true ||
    (sameContext && readRetainedBoolean(record, ["trackingObserved", "tracking_observed"]) === true);
  const trackingVendors = retainedStringArray(record, ["thirdPartyTrackingVendors", "third_party_tracking_vendors"]);
  const trackingDomains = retainedStringArray(record, ["thirdPartyTrackingDomains", "third_party_tracking_domains"]);
  const correlationMethod = readRetainedString(record, ["correlationMethod", "correlation_method"]);
  const directVsInferred = readRetainedString(record, ["directVsInferred", "direct_vs_inferred"]);
  const evidenceConfidence = readRetainedString(record, ["evidenceConfidence", "evidence_confidence"]);
  const correlationDirectOrModerate =
    correlationMethod === "direct" ||
    correlationMethod === "moderate" ||
    (
      directVsInferred !== "inferred" &&
      (evidenceConfidence === "high" || evidenceConfidence === "moderate")
    );
  const payloadExposureKnown =
    readRetainedBoolean(record, ["payloadExposureObserved", "payload_exposure_observed"]) !== null;
  const sensitiveValueKnown =
    readRetainedBoolean(record, [
      "sensitiveValueInThirdPartyRequest",
      "sensitive_value_in_third_party_request"
    ]) !== null;

  return (
    eligibleObserved &&
    (sensitiveFieldTypes.length > 0 || sensitiveFieldLabels.length > 0) &&
    pageUrls.length > 0 &&
    sameContext &&
    trackingActiveInSameContext &&
    (trackingVendors.length > 0 || trackingDomains.length > 0) &&
    correlationDirectOrModerate &&
    payloadExposureKnown &&
    sensitiveValueKnown
  );
}

function getRetainedVendorDisclosureRows(retained: Record<string, unknown>) {
  return [
    ...(
      Array.isArray(retained.runtimeVendorDisclosureEvidence)
        ? retained.runtimeVendorDisclosureEvidence
        : []
    ),
    ...(
      Array.isArray(retained.findingEntities)
        ? retained.findingEntities.flatMap((entity) => {
            const record = getRecordValue(entity);
            const entities = getRecordValue(record?.entities);
            return Array.isArray(entities?.runtimeVendorDisclosureEvidence)
              ? entities.runtimeVendorDisclosureEvidence
              : [];
          })
        : []
    )
  ].flatMap((row) => {
    if (row && typeof row === "object" && !Array.isArray(row)) {
      return [row as Record<string, unknown>];
    }
    if (typeof row === "string") {
      return parseEntityRecords([row]);
    }
    return [];
  });
}

function hasUsableVendorDisclosureMismatchEvidence(item: GdprEprivacyCoverageChecklistItem) {
  const retained = getRetainedEvidenceRecord(item);
  const retainedRows = getRetainedVendorDisclosureRows(retained);
  const retainedRowHasUsableMismatch = retainedRows.some((row) => {
    const coverageStatus = readRetainedString(row, ["coverageStatus", "coverage_status"]);
    const directVsInferred = readRetainedString(row, ["directVsInferred", "direct_vs_inferred"]);
    const evidenceConfidence = readRetainedString(row, ["evidenceConfidence", "evidence_confidence"]);
    const mismatchRationale = readRetainedString(row, ["mismatchRationale", "mismatch_rationale"]);
    const unmatchedVendors = retainedStringArray(row, ["unmatchedRuntimeVendors", "unmatched_runtime_vendors"]);
    const unmatchedDomains = retainedStringArray(row, ["unmatchedRuntimeDomains", "unmatched_runtime_domains"]);
    const observedVendors = retainedStringArray(row, ["observedRuntimeVendors", "observed_runtime_vendors"]);
    const observedDomains = retainedStringArray(row, ["observedRuntimeDomains", "observed_runtime_domains"]);
    const unmatchedDisclosureCount = readRetainedNumber(row, [
      "unmatchedVendorDisclosureCount",
      "unmatched_vendor_disclosure_count"
    ]);
    const policySurfaces = Array.isArray(row.policySurfacesSearched)
      ? row.policySurfacesSearched
      : Array.isArray(row.policy_surfaces_searched)
        ? row.policy_surfaces_searched
        : [];
    const reachedPolicySurfaces = policySurfaces.filter((surface) => {
      const surfaceRecord = getRecordValue(surface);
      return (
        surfaceRecord &&
        readRetainedBoolean(surfaceRecord, ["reached"]) === true &&
        Boolean(readRetainedString(surfaceRecord, ["url"])) &&
        Boolean(readRetainedString(surfaceRecord, ["snippet", "textSnippet", "text_snippet"])) &&
        retainedStringArray(surfaceRecord, ["searchedTerms", "searched_terms"]).length > 0
      );
    }).length;
    const directOrModerate =
      directVsInferred !== "inferred" &&
      (directVsInferred === "direct" || evidenceConfidence === "moderate" || evidenceConfidence === "high");
    return (
      coverageStatus === "usable" &&
      directOrModerate &&
      observedVendors.length + observedDomains.length > 0 &&
      unmatchedVendors.length + unmatchedDomains.length > 0 &&
      (unmatchedDisclosureCount ?? 0) > 0 &&
      reachedPolicySurfaces > 0 &&
      Boolean(mismatchRationale) &&
      runtimeVendorDisclosureRowHasPromotionCategory({
        coverageStatus: "usable",
        directVsInferred: directVsInferred === "direct" || directVsInferred === "mixed" ? directVsInferred : "inferred",
        evidenceConfidence:
          evidenceConfidence === "strong" || evidenceConfidence === "moderate" || evidenceConfidence === "limited"
            ? evidenceConfidence
            : "limited",
        matchedVendorDisclosureCount: 0,
        mismatchRationale: mismatchRationale ?? "",
        observedRuntimeDomains: observedDomains,
        observedRuntimeVendors: observedVendors,
        policySurfacesSearched: [],
        subtype: "runtime_vendor_not_disclosed",
        unmatchedRuntimeDomains: unmatchedDomains,
        unmatchedRuntimeVendors: unmatchedVendors,
        unmatchedVendorDisclosureCount: unmatchedDisclosureCount ?? 0
      })
    );
  });
  if (retainedRowHasUsableMismatch) {
    return true;
  }
  const coverageStatus = readRetainedString(retained, ["coverageStatus", "coverage_status"]);
  const directVsInferred = readRetainedString(retained, ["directVsInferred", "direct_vs_inferred"]);
  const unmatchedCount =
    readRetainedNumber(retained, ["unmatchedRuntimeVendorOrDomainCount", "unmatched_runtime_vendor_or_domain_count"]) ??
    readRetainedNumber(retained, ["unmatchedVendorDisclosureCount", "unmatched_vendor_disclosure_count"]) ??
    0;
  return coverageStatus === "usable" && directVsInferred !== "inferred" && unmatchedCount > 0;
}

function addDeducibilityDemotion(
  item: GdprEprivacyCoverageChecklistItem,
  status: GdprEprivacyCoverageChecklistStatus,
  explanation: string,
  reason: string,
  evidenceState?: RegulatoryEvidenceState
) {
  const guarded = buildChecklistItem({
    criticalEvidence: {
      ...item.criticalEvidence,
      missingOrIncompleteSourceSignals: [
        ...item.criticalEvidence.missingOrIncompleteSourceSignals,
        makeSourceSignalGap(
          "CertScore.gdprEprivacyChecklist.evidenceDeducibility",
          "mutually consistent row status, assessment, findings, statusBasis, evidenceState, and retainedEvidence",
          reason,
          "Required before CertScore.ai can render this GDPR/ePrivacy checklist row as checked, observed, or gap-level evidence without overclaiming."
        )
      ],
      projectedFindings: [],
      retainedEvidence: {
        ...getRetainedEvidenceRecord(item),
        deducibilityDemotionReason: reason
      },
      statusBasis: explanation
    },
    evidenceRefs: item.evidenceRefs,
    explanation,
    id: item.id,
    label: item.label,
    limitation: explanation,
    status
  });
  return evidenceState ? { ...guarded, evidenceState } : guarded;
}

function scanQualityVisualNoGoObserved(input: GdprEprivacyCoverageChecklistInput) {
  return input.unifiedFindings.some((finding) => finding.unifiedFindingId === "scan_quality_visual_no_go") ||
    (input.projectedFindings ?? []).some((finding) => finding.id === "scan_quality_visual_no_go");
}

function applyVisualNoGoUiControlGuard(
  item: GdprEprivacyCoverageChecklistItem,
  visualNoGoObserved: boolean
) {
  if (!visualNoGoObserved || !VISUAL_NO_GO_UI_DEPENDENT_ROW_IDS.has(item.id)) {
    return item;
  }
  if (item.status === "Not testable" && item.evidenceState === "not_testable") {
    return item;
  }
  return addDeducibilityDemotion(
    item,
    "Not testable",
    item.id === "accept_consent_control"
      ? "Accept consent control availability could not be evaluated because the retained scan context indicates the normal public site was not reached. Treat this as a scan-quality coverage limitation rather than an ordinary missing accept-control finding."
      : "Options/settings/preferences control availability could not be evaluated because the retained scan context indicates the normal public site was not reached. Treat this as a scan-quality coverage limitation rather than an ordinary missing options-control finding.",
    "scan_quality_visual_no_go_normal_public_site_not_reached",
    "not_testable"
  );
}

function applyChecklistEvidenceDeducibilityGuard(item: GdprEprivacyCoverageChecklistItem) {
  const retained = getRetainedEvidenceRecord(item);
  const firstLayerGdprBannerConfirmed = hasConfirmedFirstLayerGdprBanner(retained);

  if (
    item.id === "consent_surface_observed" &&
    item.status === "Observed" &&
    firstLayerGdprBannerConfirmed === false
  ) {
    return addDeducibilityDemotion(
      item,
      "Not confirmed",
      "Privacy/ad-choice controls were observed, but a first-layer GDPR/ePrivacy cookie consent banner was not confirmed.",
      "no_confirmed_first_layer_gdpr_eprivacy_cookie_consent_banner",
      "not_observed"
    );
  }

  if (
    item.id === "preference_withdrawal_control" &&
    item.status === "Observed" &&
    !retainedEvidenceHasCookieConsentWithdrawal(retained) &&
    retainedEvidenceIsAdChoiceOnly(retained)
  ) {
    return addDeducibilityDemotion(
      item,
      "Review signal",
      "Footer privacy/ad-choice and vendor opt-out links were observed, but CertScore.ai did not confirm a GDPR/ePrivacy cookie preference center or consent-withdrawal control.",
      "privacy_ad_choice_only_controls_do_not_confirm_gdpr_cookie_consent_withdrawal",
      "observed"
    );
  }

  if (
    (
      item.id === "reject_all_path_availability" ||
      item.id === "accept_consent_control" ||
      item.id === "options_settings_preferences_control" ||
      item.id === "post_reject_tracking_reduction"
    ) &&
    (item.status === "Observed" || item.status === "Gap observed" || item.status === "Review signal") &&
    firstLayerGdprBannerConfirmed === false
  ) {
    const noRejectRetainedWithPreconsentActivity =
      item.id === "reject_all_path_availability" &&
      (item.status === "Gap observed" || item.status === "Review signal") &&
      readRetainedBoolean(retained, [
        "preconsentCookieOrTrackingActivityObserved",
        "preconsent_cookie_or_tracking_activity_observed"
      ]) === true &&
      readRetainedBoolean(retained, ["rejectControlObserved", "reject_control_observed"]) === false;
    const noOptionsRetainedWithPreconsentActivity =
      item.id === "options_settings_preferences_control" &&
      (item.status === "Gap observed" || item.status === "Review signal") &&
      readRetainedBoolean(retained, [
        "preconsentCookieOrTrackingActivityObserved",
        "preconsent_cookie_or_tracking_activity_observed"
      ]) === true &&
      readRetainedBoolean(retained, ["optionsControlObserved", "options_control_observed"]) === false;
    const noAcceptRetainedWithPreconsentActivity =
      item.id === "accept_consent_control" &&
      (item.status === "Gap observed" || item.status === "Review signal") &&
      readRetainedBoolean(retained, [
        "preconsentCookieOrTrackingActivityObserved",
        "preconsent_cookie_or_tracking_activity_observed"
      ]) === true &&
      readRetainedBoolean(retained, ["acceptControlObserved", "accept_control_observed"]) === false;

    if (noRejectRetainedWithPreconsentActivity || noAcceptRetainedWithPreconsentActivity || noOptionsRetainedWithPreconsentActivity) {
      return item;
    }

    return addDeducibilityDemotion(
      item,
      "Not testable",
      item.id === "post_reject_tracking_reduction"
        ? "Post-reject tracking could not be tested because no first-layer GDPR/ePrivacy consent banner and no valid reject action were confirmed. Footer privacy/ad-choice controls were observed, but they do not establish a reject state for comparison."
        : item.id === "accept_consent_control"
          ? "Accept consent control availability could not be evaluated because no first-layer GDPR/ePrivacy cookie consent banner was confirmed. CertScore.ai did not retain a place where an accept control could appear, so the missing control is treated as part of the missing or unconfirmed consent surface rather than as a standalone accept-control finding."
        : item.id === "options_settings_preferences_control"
          ? "Options/settings/preferences control availability could not be evaluated because no first-layer GDPR/ePrivacy cookie consent banner was confirmed. CertScore.ai did not retain a place where an options/settings/preferences control could appear, so the missing control is treated as part of the missing or unconfirmed consent surface rather than as a standalone options-control finding."
        : "Reject-path availability could not be evaluated because no first-layer GDPR/ePrivacy cookie consent banner was confirmed. CertScore.ai did not retain a place where a reject option could appear, so the missing reject option is treated as part of the missing or unconfirmed consent surface rather than as a standalone reject-path finding.",
      "no_confirmed_first_layer_gdpr_eprivacy_consent_banner_or_reject_state",
      "not_testable"
    );
  }

  if (
    item.id === "cross_border_endpoint_review" &&
    item.status === "Gap observed" &&
    !hasUsableVendorDisclosureMismatchEvidence(item)
  ) {
    return addDeducibilityDemotion(
      item,
      "Review signal",
      "Endpoint geography creates a transfer-review signal. The gap status requires retained disclosure mismatch for transfer-relevant advertising, analytics, or tag-management vendors.",
      "endpoint_geography_without_transfer_relevant_vendor_disclosure_mismatch",
      "observed"
    );
  }

  if (item.id === "sensitive_surfaces_third_party_tracking" && item.status === "Gap observed") {
    const eligibleCount = readRetainedNumber(retained, ["eligibleSensitiveFieldCount", "eligible_sensitive_field_count"]);
    const rawCount = readRetainedNumber(retained, ["rawSensitiveFieldCount", "raw_sensitive_field_count"]);
    const fallbackOnly = readRetainedBoolean(retained, ["fallbackOrPolicyOnly", "fallback_or_policy_only"]) === true;
    const sameContext =
      readRetainedBoolean(retained, ["sameContext", "same_context"]) === true ||
      readRetainedBoolean(retained, ["samePageOrFlow", "same_page_or_flow"]) === true;
    const payloadExposure = readRetainedBoolean(retained, ["payloadExposureObserved", "payload_exposure_observed"]) === true;
    const selectedEvidenceReason = readRetainedString(retained, ["selectedEvidenceReason", "selected_evidence_reason"]) ?? "";
    const selectedEvidenceStrength = readRetainedString(retained, ["selectedEvidenceStrength", "selected_evidence_strength"]);
    const directSameContextEvidence = hasDirectSameContextSensitiveTrackingEvidence(retained);
    if (
      (eligibleCount === 0 && (rawCount === 0 || rawCount === null)) ||
      fallbackOnly ||
      (!sameContext && !payloadExposure) ||
      /does not conclusively establish direct same-context/i.test(selectedEvidenceReason) ||
      selectedEvidenceStrength === "limited" ||
      !directSameContextEvidence
    ) {
      return addDeducibilityDemotion(
        item,
        eligibleCount === 0 && (rawCount === 0 || rawCount === null) ? "Not observed" : "Review signal",
        eligibleCount === 0 && (rawCount === 0 || rawCount === null)
          ? "Sensitive-field correlation completed and did not retain eligible sensitive fields alongside 3rd party tracking in the tested context."
          : "Sensitive-surface/tracking correlation requires review. Retained evidence indicates possible sensitive data context and 3rd party tracking, but CertScore.ai did not surface direct same-context sensitive-field and tracking correlation evidence.",
        fallbackOnly
          ? "fallback_or_policy_only_sensitive_tracking_evidence"
          : "missing_direct_same_context_sensitive_tracking_or_payload_evidence",
        eligibleCount === 0 && (rawCount === 0 || rawCount === null) ? "not_observed" : "observed"
      );
    }
  }

  return item;
}

function getSessionReplayParentNote(input: {
  children: GdprEprivacyCoverageChecklistItem[];
  parent: GdprEprivacyCoverageChecklistItem;
}) {
  const childWithGap = input.children.find((child) => child.status === "Gap observed");
  if (childWithGap?.id === "session_replay_before_consent") {
    return "Session replay or behavioral analytics was observed before a recorded consent action. Review disclosure, masking, sensitive-page coverage, and refusal behavior as supporting subchecks.";
  }
  if (childWithGap?.id === "session_replay_disclosure_alignment") {
    return "Session replay or behavioral analytics was observed and a disclosure-alignment gap was retained. Review whether the public notice clearly explains the observed replay vendor or domain.";
  }
  if (childWithGap?.id === "session_replay_sensitive_surface") {
    return "Session replay or behavioral analytics was observed on a retained sensitive surface. Review masking, exclusion rules, and collection minimization.";
  }
  if (childWithGap?.id === "session_replay_after_refusal") {
    return "Session replay or behavioral analytics persisted after a confirmed reject or opt-out action. Review whether refusal suppresses behavioral recording.";
  }
  if (/entropy/i.test(input.parent.label)) {
    return input.parent.explanation;
  }
  if (input.parent.status === "Review signal") {
    return input.children.some((child) => child.status === "Not observed" || child.status === "Observed")
      ? "Session replay or behavioral analytics was observed. No strict session-replay gap was proven from the retained subchecks, but disclosure, masking, sensitive-page coverage, and refusal behavior still warrant review."
      : "Session replay or behavioral analytics was observed, but the retained scan context did not resolve the stricter timing, disclosure, sensitive-surface, or refusal subchecks.";
  }
  return input.parent.explanation;
}

function mergeSessionReplayParentStatus(input: {
  children: GdprEprivacyCoverageChecklistItem[];
  parent: GdprEprivacyCoverageChecklistItem;
}) {
  if (input.children.some((child) => child.status === "Gap observed")) {
    return "Gap observed" as const;
  }
  return input.parent.status;
}

function collapseSessionReplayDiagnosticRows(items: GdprEprivacyCoverageChecklistItem[]) {
  const parent = items.find((item) => item.id === SESSION_REPLAY_PARENT_ROW_ID);
  const children = items.filter((item) => SESSION_REPLAY_CHILD_ROW_IDS.has(item.id));
  if (!parent || children.length === 0) {
    return items.filter((item) => !SESSION_REPLAY_CHILD_ROW_IDS.has(item.id));
  }

  const status = mergeSessionReplayParentStatus({ children, parent });
  const parentSessionReplayEvidence = getRecordValue(getRetainedEvidenceRecord(parent).sessionReplayEvidence);
  const parentHasPreConsentSignal =
    sessionReplayEvidenceHasPreConsentSignal(parentSessionReplayEvidence) ||
    /before a recorded consent action/i.test(parent.explanation);
  const assessmentStatus = getAssessmentStatus(status);
  const evidenceState = getEvidenceState({
    assessmentStatus,
    id: parent.id,
    status
  });
  const explanation = getSessionReplayParentNote({ children, parent });
  const subchecks = children.map((child): RegulatoryChecklistSubcheck => {
    const childStatus =
      child.id === "session_replay_before_consent" && parentHasPreConsentSignal
        ? "Gap observed"
        : child.status;
    const childAssessmentStatus = getAssessmentStatus(childStatus);
    return {
      assessmentStatus: childAssessmentStatus,
      evidenceRefs: child.evidenceRefs.length > 0 ? child.evidenceRefs : parent.evidenceRefs,
      evidenceState: getEvidenceState({
        assessmentStatus: childAssessmentStatus,
        id: child.id,
        status: childStatus
      }),
      id: child.id,
      label: SESSION_REPLAY_CHILD_ROW_LABELS.get(child.id) ?? child.label,
      note:
        child.id === "session_replay_before_consent" && parentHasPreConsentSignal
          ? "Session replay or behavioral recording collection was retained before a recorded consent action."
          : child.explanation,
      status: childStatus
    };
  });

  return items
    .map((item) => item.id === parent.id
      ? {
        ...parent,
        assessmentStatus,
        evidenceRefs: [...new Set([...parent.evidenceRefs, ...children.flatMap((child) => child.evidenceRefs)])].slice(0, 6),
        evidenceState,
        explanation,
        label: parent.label,
        note: explanation,
        status,
        subchecks,
        tone: getChecklistTone(status)
      }
      : item)
    .filter((item) => !SESSION_REPLAY_CHILD_ROW_IDS.has(item.id));
}

export function deriveGdprEprivacyCoverageChecklist(
  input: GdprEprivacyCoverageChecklistInput
): GdprEprivacyCoverageChecklistItem[] {
  const findingsById = new Map(input.unifiedFindings.map((finding) => [finding.unifiedFindingId, finding]));
  const projectedFindingsById = new Map((input.projectedFindings ?? []).map((finding) => [finding.id, finding]));
  const publicCoverageIsTestable = input.scanCompleted && !input.coverageLimited;
  const visualNoGoObserved = scanQualityVisualNoGoObserved(input);

  const rows = CHECKLIST_ROWS
    .filter((definition) => shouldIncludeChecklistRowDefinition(definition, input.coverageOutcomes?.[definition.id]))
    .map((definition) => {
    const directCoverageOutcome = input.coverageOutcomes?.[definition.id];
    const canonicalPreconsentStorageOutcome =
      definition.id === "pre_consent_cookies_storage" &&
      typeof directCoverageOutcome?.criticalEvidence.retainedEvidence.preConsentStorageAssessmentStatus === "string"
        ? directCoverageOutcome
        : undefined;
    const synthesizedPreconsentCookieOutcome =
      definition.id === "pre_consent_cookies_storage"
        ? synthesizePreconsentThirdPartyCookieOutcome(input.runtimeCookieRows)
        : undefined;
    const synthesizedPreconsentTrackingOutcome =
      definition.id === "pre_consent_third_party_tracking"
        ? synthesizePreconsentThirdPartyTrackingOutcome(input.runtimeTrackerPriorityRows)
        : undefined;
    const combinedReplayFingerprintingOutcome = input.coverageOutcomes?.[SESSION_REPLAY_PARENT_ROW_ID];
    const coverageOutcome =
      definition.id === "device_identification_fingerprinting_signal_observed" &&
      !directCoverageOutcome &&
      (
        Boolean(getBrowserDeviceEntropyEvidenceFromOutcome(combinedReplayFingerprintingOutcome)) ||
        combinedReplayFingerprintingOutcome?.criticalEvidence.retainedEvidence.fingerprintingObserved === true
      )
        ? combinedReplayFingerprintingOutcome
        : canonicalPreconsentStorageOutcome ??
          synthesizedPreconsentCookieOutcome ??
          synthesizedPreconsentTrackingOutcome ??
          directCoverageOutcome;
    const matchingFindings = definition.findingIds.flatMap((id) => {
      const finding = findingsById.get(id);
      return finding && isFindingEligibleForCoverageRow(definition.id, finding) ? [finding] : [];
    });
    const matchingProjectedFindings = definition.findingIds.flatMap((id) => {
      const finding = projectedFindingsById.get(id);
      return finding && isProjectedFindingEligibleForCoverageRow(definition.id, finding) ? [finding] : [];
    });

    if (
      coverageOutcome &&
      (
        shouldPreferCoverageOutcomeForMissingReject(definition.id, coverageOutcome) ||
        shouldPreferCoverageOutcomeForConsentChoiceQuality(definition.id, coverageOutcome) ||
        shouldPreferCoverageOutcomeForContextualInfrastructure(definition.id, coverageOutcome)
      )
    ) {
      const specialized = specializeChecklistRow({
        coverageOutcome,
        definition,
        evidenceRefs: coverageOutcome.evidenceRefs,
        findings: [],
        projectedFindings: [],
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

    if (matchingFindings.length > 0) {
      const status = normalizeFindingStatus(definition, matchingFindings);
      const evidenceRefs = mergeCoverageOutcomePreconsentTimingEvidenceRefs(
        definition.id,
        getEvidenceRefs(matchingFindings),
        coverageOutcome
      );
      const specialized = specializeChecklistRow({
        coverageOutcome,
        definition,
        evidenceRefs,
        findings: matchingFindings,
        projectedFindings: matchingProjectedFindings,
        status
      });
      return buildChecklistItem({
        criticalEvidence: mergeCoverageOutcomePreconsentTimingEvidence({
          coverageOutcome,
          criticalEvidence: getUnifiedFindingCriticalEvidence(
            specialized.status,
            `Canonical unified finding${matchingFindings.length === 1 ? "" : "s"} projected for this row.`,
            definition.id,
            matchingFindings,
            matchingProjectedFindings
          ),
          rowId: definition.id
        }),
        evidenceRefs: specialized.evidenceRefs,
        explanation: specialized.explanation,
        id: definition.id,
        label: specialized.label,
        status: specialized.status
      });
    }

    if (matchingProjectedFindings.length > 0) {
      const status = definition.defaultFindingStatus;
      const evidenceRefs = mergeCoverageOutcomePreconsentTimingEvidenceRefs(
        definition.id,
        getProjectedEvidenceRefs(matchingProjectedFindings),
        coverageOutcome
      );
      const specialized = specializeChecklistRow({
        coverageOutcome,
        definition,
        evidenceRefs,
        findings: [],
        projectedFindings: matchingProjectedFindings,
        status
      });
      return buildChecklistItem({
        criticalEvidence: mergeCoverageOutcomePreconsentTimingEvidence({
          coverageOutcome,
          criticalEvidence: getProjectedFindingCriticalEvidence(
            specialized.status,
            `Executive/regulatory projection already retained finding evidence for this row.`,
            definition.id,
            matchingProjectedFindings
          ),
          rowId: definition.id
        }),
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
        projectedFindings: [],
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
              "CertScore.coverageOutcomes." + definition.id,
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
            "CertScore.coverageOutcomes." + definition.id,
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

  return collapseSessionReplayDiagnosticRows(rows
    .map((item) => applyVisualNoGoUiControlGuard(item, visualNoGoObserved))
    .map(applyChecklistEvidenceDeducibilityGuard));
}
