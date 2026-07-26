import type { GdprEprivacyCoverageChecklistItem } from "./gdpr-eprivacy-coverage-checklist";
import type { UnifiedFindingDisplayPacket } from "./unified-findings";
import type {
  CanonicalShadowCoverageRow,
  CanonicalShadowScoreFinding
} from "./canonical-shadow-score";

export const GDPR_EPRIVACY_SHADOW_SCORE_ELIGIBLE_FAMILIES = [
  "consent_tracking",
  "contradiction",
  "rights_gap",
  "sensitive_data"
] as const;

export const GDPR_EPRIVACY_SHADOW_SCORE_COVERAGE_ROW_REGISTRY = [
  { required: true, rowId: "accessibility_consent_controls" },
  { required: true, rowId: "accept_consent_control" },
  { required: true, rowId: "advertising_retargeting_vendor_signal_observed" },
  { required: true, rowId: "analytics_vendor_observed" },
  { required: false, rowId: "automated_decision_making_profiling_disclosure" },
  { required: true, rowId: "cmp_framework_signal_observed" },
  { required: true, rowId: "consent_choice_quality" },
  { required: true, rowId: "consent_surface_observed" },
  { required: true, rowId: "controller_contact_disclosure" },
  { required: true, rowId: "cookie_notice_policy_availability" },
  { required: true, rowId: "cross_border_endpoint_review" },
  { required: true, rowId: "data_subject_rights_disclosure" },
  { required: true, rowId: "device_identification_fingerprinting_signal_observed" },
  { required: true, rowId: "dpo_contact_point_disclosure" },
  { required: true, rowId: "embedded_content_pre_consent" },
  { required: true, rowId: "international_transfers_disclosure" },
  { required: true, rowId: "legal_basis_disclosure_observed" },
  { required: true, rowId: "options_settings_preferences_control" },
  { required: true, rowId: "post_reject_tracking_reduction" },
  { required: true, rowId: "pre_consent_cookies_storage" },
  { required: true, rowId: "pre_consent_third_party_tracking" },
  { required: true, rowId: "preference_withdrawal_control" },
  { required: true, rowId: "privacy_notice_availability" },
  { required: true, rowId: "processing_purposes_disclosure" },
  { required: true, rowId: "recipients_vendor_categories_disclosure" },
  { required: true, rowId: "reject_all_path_availability" },
  { required: true, rowId: "retention_disclosure_observed" },
  { required: true, rowId: "retargeting_behavioral_advertising_signal_observed" },
  { required: true, rowId: "sensitive_surfaces_third_party_tracking" },
  { required: true, rowId: "session_replay_fingerprinting_review" },
  { required: true, rowId: "social_media_embed_pre_consent" },
  { required: true, rowId: "supervisory_authority_complaint_disclosure" },
  { required: true, rowId: "third_party_iframe_pre_consent" },
  { required: true, rowId: "transport_security_form_transport" },
  { required: true, rowId: "transport_security_http_redirect" },
  { required: true, rowId: "transport_security_https_delivery" },
  { required: true, rowId: "transport_security_mixed_content" },
  { required: true, rowId: "transport_security_tls_certificate" }
] as const;

export const GDPR_EPRIVACY_SHADOW_SCORE_COVERAGE_ROW_IDS =
  GDPR_EPRIVACY_SHADOW_SCORE_COVERAGE_ROW_REGISTRY.map((entry) => entry.rowId);

const GDPR_EPRIVACY_SHADOW_SCORE_ELIGIBLE_FAMILY_SET = new Set<string>(
  GDPR_EPRIVACY_SHADOW_SCORE_ELIGIBLE_FAMILIES
);
const GDPR_EPRIVACY_SHADOW_SCORE_COVERAGE_ROW_ID_SET = new Set<string>(
  GDPR_EPRIVACY_SHADOW_SCORE_COVERAGE_ROW_IDS
);
const GDPR_EPRIVACY_SHADOW_SCORE_REQUIRED_COVERAGE_ROW_IDS =
  GDPR_EPRIVACY_SHADOW_SCORE_COVERAGE_ROW_REGISTRY
    .filter((entry) => entry.required)
    .map((entry) => entry.rowId);

export function buildCanonicalShadowScoreInput(input: {
  checklistRows: GdprEprivacyCoverageChecklistItem[];
  unifiedFindings: UnifiedFindingDisplayPacket[];
}): {
  coverageRows: CanonicalShadowCoverageRow[];
  findings: CanonicalShadowScoreFinding[];
} {
  const inputCoverageRowIds = input.checklistRows.map((row) => row.id);
  const duplicateCoverageRowIds = [...new Set(
    inputCoverageRowIds.filter((rowId, index) => inputCoverageRowIds.indexOf(rowId) !== index)
  )].sort();
  const unknownCoverageRowIds = [...new Set(
    inputCoverageRowIds.filter((rowId) => !GDPR_EPRIVACY_SHADOW_SCORE_COVERAGE_ROW_ID_SET.has(rowId))
  )].sort();
  const inputCoverageRowIdSet = new Set(inputCoverageRowIds);
  const missingRequiredCoverageRowIds = GDPR_EPRIVACY_SHADOW_SCORE_REQUIRED_COVERAGE_ROW_IDS
    .filter((rowId) => !inputCoverageRowIdSet.has(rowId))
    .sort();
  const registryIssues = [
    ...(duplicateCoverageRowIds.length > 0 ? [`duplicate:${duplicateCoverageRowIds.join(",")}`] : []),
    ...(unknownCoverageRowIds.length > 0 ? [`unknown:${unknownCoverageRowIds.join(",")}`] : []),
    ...(missingRequiredCoverageRowIds.length > 0 ? [`missing:${missingRequiredCoverageRowIds.join(",")}`] : [])
  ];
  if (registryIssues.length > 0) {
    throw new Error(`Canonical shadow coverage row registry mismatch: ${registryIssues.join("; ")}`);
  }

  return {
    coverageRows: input.checklistRows.map((row) => ({
      assessmentStatus: row.assessmentStatus,
      evidenceState: row.evidenceState,
      rowId: row.id
    })),
    findings: input.unifiedFindings.flatMap((packet) => {
      if (!packet.surfacingDecision.reportable || packet.presentationDecision.status !== "surface") {
        return [];
      }
      const family = packet.surfacingDecision.family.trim();
      if (!family || !GDPR_EPRIVACY_SHADOW_SCORE_ELIGIBLE_FAMILY_SET.has(family)) {
        return [];
      }
      return [{
        family,
        findingId: packet.unifiedFindingId,
        severity: packet.severity
      }];
    })
  };
}
