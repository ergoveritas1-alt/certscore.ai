import {
  GDPR_EPRIVACY_CHECKLIST_ROWS,
  type GdprEprivacyChecklistRowDefinition
} from "../scans/gdpr-eprivacy-coverage-checklist";

export type GdprEprivacyChecklistReferenceCategory =
  | "Consent controls"
  | "Pre-consent tracking and storage"
  | "Policy and disclosure evidence"
  | "Vendor and endpoint review"
  | "Session replay and fingerprinting"
  | "Transport and security evidence";

export type GdprEprivacyChecklistStatusReference = {
  status: "Observed" | "Gap observed" | "Review signal" | "Not observed" | "Not testable" | "Insufficient evidence";
  meaning: string;
};

export type GdprEprivacyChecklistReferenceItem = {
  category: GdprEprivacyChecklistReferenceCategory;
  defaultStatus: GdprEprivacyChecklistRowDefinition["defaultFindingStatus"];
  explanation: string;
  findingIds: string[];
  id: string;
  label: string;
  missingEvidenceExamples: string[];
  notObservedText: string;
  path: string;
  regulatoryGapFindingId: string;
  requiresPublicWebCoverage: boolean;
  retainedEvidenceExamples: string[];
  reviewerNotes: string[];
  statusReference: GdprEprivacyChecklistStatusReference[];
};

export const GDPR_EPRIVACY_CHECKLIST_REFERENCE_CATEGORIES: GdprEprivacyChecklistReferenceCategory[] = [
  "Consent controls",
  "Pre-consent tracking and storage",
  "Policy and disclosure evidence",
  "Vendor and endpoint review",
  "Session replay and fingerprinting",
  "Transport and security evidence"
];

export const GDPR_EPRIVACY_CHECKLIST_STATUS_REFERENCE: GdprEprivacyChecklistStatusReference[] = [
  {
    status: "Observed",
    meaning: "Retained evidence supports the row or confirms that the expected public-web signal was present in the tested context."
  },
  {
    status: "Gap observed",
    meaning: "Retained evidence indicates a possible implementation, consent, disclosure, or coverage gap that needs review."
  },
  {
    status: "Review signal",
    meaning: "CertScore retained relevant evidence, but the row should be reviewed before operational or legal reliance."
  },
  {
    status: "Not observed",
    meaning: "The scan did not retain the relevant signal in the tested public-web context."
  },
  {
    status: "Not testable",
    meaning: "Coverage limitations prevented CertScore from selecting reliable evidence for this row."
  },
  {
    status: "Insufficient evidence",
    meaning: "Some evidence was retained, but source signals were missing or incomplete for a stronger status."
  }
];

const CATEGORY_BY_ROW_ID: Record<string, GdprEprivacyChecklistReferenceCategory> = {
  consent_surface_observed: "Consent controls",
  cmp_framework_signal_observed: "Consent controls",
  reject_all_path_availability: "Consent controls",
  accept_consent_control: "Consent controls",
  options_settings_preferences_control: "Consent controls",
  consent_choice_quality: "Consent controls",
  post_reject_tracking_reduction: "Consent controls",
  preference_withdrawal_control: "Consent controls",
  accessibility_consent_controls: "Consent controls",
  pre_consent_cookies_storage: "Pre-consent tracking and storage",
  pre_consent_third_party_tracking: "Pre-consent tracking and storage",
  advertising_retargeting_vendor_signal_observed: "Pre-consent tracking and storage",
  retargeting_behavioral_advertising_signal_observed: "Pre-consent tracking and storage",
  analytics_vendor_observed: "Pre-consent tracking and storage",
  third_party_service_connection_pre_consent: "Pre-consent tracking and storage",
  third_party_iframe_pre_consent: "Pre-consent tracking and storage",
  social_media_embed_pre_consent: "Pre-consent tracking and storage",
  embedded_content_pre_consent: "Pre-consent tracking and storage",
  privacy_notice_availability: "Policy and disclosure evidence",
  cookie_notice_policy_availability: "Policy and disclosure evidence",
  legal_basis_disclosure_observed: "Policy and disclosure evidence",
  retention_disclosure_observed: "Policy and disclosure evidence",
  controller_contact_disclosure: "Policy and disclosure evidence",
  processing_purposes_disclosure: "Policy and disclosure evidence",
  recipients_vendor_categories_disclosure: "Policy and disclosure evidence",
  data_subject_rights_disclosure: "Policy and disclosure evidence",
  international_transfers_disclosure: "Policy and disclosure evidence",
  dpo_contact_point_disclosure: "Policy and disclosure evidence",
  supervisory_authority_complaint_disclosure: "Policy and disclosure evidence",
  automated_decision_making_profiling_disclosure: "Policy and disclosure evidence",
  sensitive_surfaces_third_party_tracking: "Vendor and endpoint review",
  cross_border_endpoint_review: "Vendor and endpoint review",
  session_replay_fingerprinting_review: "Session replay and fingerprinting",
  device_identification_fingerprinting_signal_observed: "Session replay and fingerprinting",
  transport_security_https_delivery: "Transport and security evidence",
  transport_security_tls_certificate: "Transport and security evidence",
  transport_security_http_redirect: "Transport and security evidence",
  transport_security_mixed_content: "Transport and security evidence",
  transport_security_form_transport: "Transport and security evidence"
};

export function getGdprEprivacyChecklistReferencePath(rowId: string) {
  return `/findings/gdpr-eprivacy/${rowId}`;
}

export function getRegulatoryGapFindingId(rowId: string) {
  return `regulatory_gap__gdpr_eprivacy__${rowId}`;
}

export function getGdprEprivacyChecklistReferenceItems(): GdprEprivacyChecklistReferenceItem[] {
  return GDPR_EPRIVACY_CHECKLIST_ROWS.map((row) => {
    const category = CATEGORY_BY_ROW_ID[row.id] ?? "Vendor and endpoint review";
    return {
      category,
      defaultStatus: row.defaultFindingStatus,
      explanation: row.explanation,
      findingIds: row.findingIds,
      id: row.id,
      label: row.label,
      missingEvidenceExamples: getMissingEvidenceExamples(row, category),
      notObservedText: row.notObservedText,
      path: getGdprEprivacyChecklistReferencePath(row.id),
      regulatoryGapFindingId: getRegulatoryGapFindingId(row.id),
      requiresPublicWebCoverage: row.requiresPublicWebCoverage === true,
      retainedEvidenceExamples: getRetainedEvidenceExamples(row, category),
      reviewerNotes: getReviewerNotes(row, category),
      statusReference: GDPR_EPRIVACY_CHECKLIST_STATUS_REFERENCE
    };
  });
}

export function getGdprEprivacyChecklistReferenceItem(rowId: string) {
  return getGdprEprivacyChecklistReferenceItems().find((row) => row.id === rowId) ?? null;
}

export function getGdprEprivacyChecklistReferenceGroups() {
  const rows = getGdprEprivacyChecklistReferenceItems();
  return GDPR_EPRIVACY_CHECKLIST_REFERENCE_CATEGORIES.map((category) => ({
    category,
    rows: rows.filter((row) => row.category === category)
  })).filter((group) => group.rows.length > 0);
}

function getRetainedEvidenceExamples(
  row: GdprEprivacyChecklistRowDefinition,
  category: GdprEprivacyChecklistReferenceCategory
) {
  if (row.id.includes("pre_consent")) {
    return [
      "timed pre-consent request, cookie, storage, iframe, or embed observations",
      "classified vendor, purpose, party, URL, domain, or storage evidence",
      "coverage context showing whether a consent action or prior consent state was recorded"
    ];
  }
  if (category === "Consent controls") {
    return [
      "retained consent-surface classification and first-layer control inventory",
      "accept, reject, options, settings, or preference-control labels and path depth",
      "choice-quality evidence such as visual parity, granular preferences, default states, and save controls when available"
    ];
  }
  if (category === "Policy and disclosure evidence") {
    return [
      "retained privacy, cookie, policy, or preference-surface URLs",
      "canonical disclosure topic matches from public policy text",
      "policy coverage diagnostics and missing-topic evidence when the scan could not confirm a topic"
    ];
  }
  if (category === "Transport and security evidence") {
    return [
      "HTTPS, TLS, redirect, mixed-content, or form-transport observations",
      "strict probe results retained separately from normal page rendering",
      "page or form URLs with transport evidence scoped to the public scan"
    ];
  }
  if (category === "Session replay and fingerprinting") {
    return [
      "session replay, behavioral analytics, entropy, or device-identification runtime signals",
      "vendor, endpoint, script, or signal-cluster context where retained",
      "consent timing, sensitive-surface, or disclosure alignment context when available"
    ];
  }
  return [
    "vendor, endpoint, domain, request, or disclosure evidence retained by the scan",
    "runtime classification, geography, purpose, or sensitive-surface context where available",
    "coverage diagnostics showing whether evidence is direct, partial, or limited"
  ];
}

function getMissingEvidenceExamples(
  row: GdprEprivacyChecklistRowDefinition,
  category: GdprEprivacyChecklistReferenceCategory
) {
  if (row.id === "post_reject_tracking_reduction" || row.id === "preference_withdrawal_control") {
    return [
      "production core scanner does not currently treat post-choice behavior as a standalone gap conclusion",
      "retained post-choice evidence is review context unless stronger production evidence is available",
      "preference-center or withdrawal controls may require manual review of region, CMP state, and user journey"
    ];
  }
  if (category === "Consent controls") {
    return [
      "unconfirmed first-layer GDPR/ePrivacy cookie banner classification",
      "missing structured accept/reject/options control inventory",
      "prior consent state, localization, viewport, or CMP configuration that may hide controls"
    ];
  }
  if (category === "Policy and disclosure evidence") {
    return [
      "policy page not reached or not retained",
      "topic classifier could not confirm the expected disclosure",
      "policy text was ambiguous, incomplete, localized differently, or outside scanned coverage"
    ];
  }
  if (category === "Pre-consent tracking and storage") {
    return [
      "no exact pre-consent timing anchor for the request or storage artifact",
      "vendor or purpose classification unavailable or too weak",
      "scan coverage did not confirm consent state, prior consent state, or page readiness"
    ];
  }
  return [
    row.notObservedText,
    "source signals were missing, incomplete, blocked, or not retained strongly enough for this row",
    "manual review may be needed to confirm purpose, applicability, and implementation context"
  ];
}

function getReviewerNotes(
  row: GdprEprivacyChecklistRowDefinition,
  category: GdprEprivacyChecklistReferenceCategory
) {
  const common = [
    "Treat this row as automated public-web evidence for review, not a legal conclusion.",
    "Confirm jurisdiction, user journey, region, consent state, and business context before relying on the result."
  ];

  if (category === "Consent controls") {
    return [
      ...common,
      "Check whether the retained surface is actually a GDPR/ePrivacy cookie-consent surface rather than a generic modal, ad-choice link, or privacy preference surface."
    ];
  }
  if (category === "Pre-consent tracking and storage") {
    return [
      ...common,
      "Separate request timing from storage timing: a pre-consent request does not automatically prove a cookie/storage artifact, and storage evidence should not be inferred from request-only evidence."
    ];
  }
  if (row.id === "cross_border_endpoint_review" || row.id === "international_transfers_disclosure") {
    return [
      ...common,
      "Endpoint geography and vendor disclosure evidence are transfer-review signals; CertScore does not determine transfer legality or adequacy."
    ];
  }
  return common;
}
