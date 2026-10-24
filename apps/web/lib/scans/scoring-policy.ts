
/** Owner-approved September 6/17 and October 10/11, 2026. Shared by scoring and review UI. */
export const SCORING_POLICY_VERSION = "gdpr-eprivacy-posture.v24";
export const FULL_SITE_SCORING_POLICY_VERSION = "full-site-distinct-findings.v12";
export type GdprEprivacyScoringPolicyVersion = typeof SCORING_POLICY_VERSION | "gdpr-eprivacy-posture.v23" | "gdpr-eprivacy-posture.v22" | "gdpr-eprivacy-posture.v21" | "gdpr-eprivacy-posture.v20" | "gdpr-eprivacy-posture.v19" | "gdpr-eprivacy-posture.v18";
export const POST_REJECT_ENTITY_TOTALS = [0, 15, 20, 23, 25, 27, 28, 29, 30] as const;
/** Initial effect includes the first entity; unknown ownership cannot add increments. */
export function postRejectEntityPoints(entityIds: readonly string[], supported: boolean) {
  return POST_REJECT_ENTITY_TOTALS[Math.min(8, Math.max(new Set(entityIds).size, supported ? 1 : 0))]!;
}
export const POST_REJECT_SCORING_TIERS = { high_risk: 15, measurement: 5, performance_only: 0, review: 0 } as const;
export const SCORE_FLOOR = 0;
export const SCORE_BASE = 100;
export const SCORING_FAMILIES = {
  pre_consent_storage: { label: "Storage", cap: 40 },
  pre_consent_tracking: { label: "Tracking", cap: 40 },
  consent_controls: { label: "Consent controls", cap: 22 },
  post_refusal_enforcement: { label: "Post-refusal", cap: POST_REJECT_ENTITY_TOTALS[8] },
  sensitive_runtime: { label: "Sensitive runtime", cap: 25 },
  tracking_technology: { label: "Fingerprinting", cap: 25 },
  embedded_third_party: { label: "Embeds", cap: 20 },
  policy_transparency: { label: "Policy transparency", cap: 12 },
  transport_security: { label: "Transport", cap: 20 },
  site_integrity: { label: "Site integrity", cap: 40 },
  accessibility: { label: "Accessibility (WCAG)", cap: 12 },
  gpc: { label: "GPC (California posture only)", cap: 0 },
} as const;
export type ScoringRule = {
  id: string; anchor: string; label: string; family: keyof typeof SCORING_FAMILIES;
  siteWide: boolean; points: number;
  tiers?: typeof POST_REJECT_SCORING_TIERS;
  entityTotals?: readonly number[];
  identity?: { first: number; second: number; subsequentEach: number; unit: string };
};
export const SCORING_RULES: readonly ScoringRule[] = [
  { id: "outdated_transfer_framework_reference", anchor: "outdated-transfer-disclosure", label: "Obsolete transfer framework presented as current guidance", family: "policy_transparency", siteWide: true, points: 3 },
  {"id": "pre_consent_cookies_storage", "anchor": "storage", "label": "Pre-consent cookies / storage", "family": "pre_consent_storage", "siteWide": true, "points": 8, "identity": {"first": 8, "second": 4, "subsequentEach": 2, "unit": "identity"}},
  {"id": "pre_consent_third_party_tracking", "anchor": "tracking", "label": "Pre-consent tracking", "family": "pre_consent_tracking", "siteWide": true, "points": 8, "identity": {"first": 8, "second": 4, "subsequentEach": 2, "unit": "vendor"}},
  {"id": "reject_all_path_availability", "anchor": "decline", "label": "Decline / Reject path", "family": "consent_controls", "siteWide": false, "points": 12},
  {"id": "post_reject_tracking_reduction", "anchor": "post-reject", "label": "Non-essential cookies or services after Reject", "family": "post_refusal_enforcement", "siteWide": false, "points": POST_REJECT_SCORING_TIERS.high_risk, entityTotals: POST_REJECT_ENTITY_TOTALS.slice(1)},
  {"id": "session_replay_fingerprinting_review", "anchor": "replay", "label": "Session replay", "family": "sensitive_runtime", "siteWide": true, "points": 6, "identity": {"first": 6, "second": 4, "subsequentEach": 1, "unit": "identity"}},
  {"id": "sensitive_surfaces_third_party_tracking", "anchor": "sensitive", "label": "Sensitive surfaces with third-party tracking", "family": "sensitive_runtime", "siteWide": true, "points": 12},
  {"id": "device_identification_fingerprinting_signal_observed", "anchor": "fingerprinting", "label": "Fingerprinting", "family": "tracking_technology", "siteWide": true, "points": 6, "identity": {"first": 6, "second": 4, "subsequentEach": 1, "unit": "identity"}},
  {"id": "embedded_content_pre_consent", "anchor": "embedded-content", "label": "Embedded third-party content before consent", "family": "embedded_third_party", "siteWide": true, "points": 5},
  {"id": "social_media_embed_pre_consent", "anchor": "social", "label": "Social-media embeds before consent", "family": "embedded_third_party", "siteWide": true, "points": 5},
  {"id": "third_party_iframe_pre_consent", "anchor": "iframes", "label": "Third-party iframes before consent", "family": "embedded_third_party", "siteWide": true, "points": 5},
  {"id": "privacy_notice_availability", "anchor": "privacy-notice", "label": "Privacy policy not found", "family": "policy_transparency", "siteWide": false, "points": 9},
  {"id": "transport_security_https_delivery", "anchor": "https", "label": "HTTPS delivery", "family": "transport_security", "siteWide": false, "points": 12},
  {"id": "transport_security_tls_certificate", "anchor": "tls", "label": "TLS certificate", "family": "transport_security", "siteWide": false, "points": 12},
  {"id": "transport_security_form_transport", "anchor": "forms", "label": "Insecure form transport", "family": "transport_security", "siteWide": false, "points": 10},
  {"id": "transport_security_mixed_content", "anchor": "mixed-content", "label": "Mixed content", "family": "transport_security", "siteWide": false, "points": 8},
  {"id": "transport_security_http_redirect", "anchor": "redirect", "label": "HTTP redirect handling", "family": "transport_security", "siteWide": false, "points": 2},
  { id: "site_integrity_hidden_outbound_links", anchor: "hidden-links", label: "Hidden outbound links", family: "site_integrity", siteWide: true, points: 17, identity: { first: 17, second: 5, subsequentEach: 5, unit: "link occurrence" } },
  { id: "text_alternative_accessibility_issue", anchor: "accessibility-evidence", label: "Text alternatives", family: "accessibility", siteWide: true, points: 3 },
  { id: "semantic_labeling_accessibility_issue", anchor: "accessibility-evidence", label: "Accessible names, labels and semantics", family: "accessibility", siteWide: true, points: 4 },
  { id: "visual_contrast_accessibility_issue", anchor: "accessibility-evidence", label: "Visual contrast", family: "accessibility", siteWide: true, points: 3 },
  { id: "zoom_restriction_accessibility_issue", anchor: "accessibility-evidence", label: "Author-declared zoom restrictions", family: "accessibility", siteWide: true, points: 2 },
  { id: "target_size_accessibility_issue", anchor: "accessibility-evidence", label: "Pointer-target size and spacing", family: "accessibility", siteWide: true, points: 2 },
  { id: "keyboard_navigation_accessibility_issue", anchor: "accessibility-evidence", label: "Keyboard navigation and reproduced focus barriers", family: "accessibility", siteWide: true, points: 6 },
 ];
export const SCORING_RULE_BY_ID = new Map(SCORING_RULES.map(rule => [rule.id, rule]));
export function scoringRuleDescription(rule: ScoringRule) {
  if (rule.entityTotals) return `Distinct non-essential entities: ${rule.entityTotals.join(" / ")} (1–8+, capped at 30)`;
  if (rule.tiers) return `Optional tracking: ${rule.tiers.high_risk} · storage-denied measurement: ${rule.tiers.measurement} · verified performance or unresolved review: ${rule.tiers.performance_only}`;
  const identity = rule.identity;
  return identity ? `First ${identity.unit}: ${identity.first} · second: ${identity.second} · each additional: ${identity.subsequentEach}` : String(rule.points);
}

/** California posture has an independent registry. Historical schedules are
 * retained; new disclosure deductions apply only to v4 typed inspections. */
export const CALIFORNIA_OPT_OUT_COLLECTION_POINTS = 15 as const;
export const CALIFORNIA_SCORING_POLICY_VERSION = "california-regulatory-posture.v12-observed" as const;
export const CALIFORNIA_SCORING_RULES_V1 = [
  {findingId:"california_sale_sharing_opt_out_activity",policyKey:"california.opt_out_activity",points:18,label:"Activity after a recorded sale/sharing opt-out"},
  {findingId:"california_privacy_choice_destination_error",policyKey:"california.choice_destination_error",points:14,label:"Privacy-choice destination unavailable"},
  {findingId:"california_notice_at_collection_destination_error",policyKey:"california.notice_destination_error",points:10,label:"Notice-at-collection destination unavailable"},
  {findingId:"california_rights_information_destination_error",policyKey:"california.rights_destination_error",points:10,label:"California rights-information destination unavailable"},
  {findingId:"california_privacy_choice_not_observed",policyKey:"california.named_choice_not_observed",points:6,label:"Named sale/sharing choice not identified in a complete inspection"},
] as const;
export const CALIFORNIA_SCORING_RULES_V2_V3 = CALIFORNIA_SCORING_RULES_V1.filter(row=>row.findingId !== "california_privacy_choice_not_observed");
export const CALIFORNIA_SCORING_RULES_V4_V7 = [...CALIFORNIA_SCORING_RULES_V2_V3,
  {findingId:"california_rights_disclosure_not_observed",policyKey:"california.rights_disclosure_not_observed",points:12,
    label:"Core rights disclosure not found in completely inspected policy text"},
] as const;
export const CALIFORNIA_SHARED_NOTICE_POINTS = 10;

/** Advertising-classified contacts remain review evidence. Only verified
 * collection carries the shared California choice-enforcement risk weight. */
export const CALIFORNIA_SCORING_RULES = [...CALIFORNIA_SCORING_RULES_V4_V7.filter(
  row => row.findingId !== "california_sale_sharing_opt_out_activity"),
  {findingId:"california_sale_sharing_opt_out_activity",policyKey:"california.opt_out_collection",points:CALIFORNIA_OPT_OUT_COLLECTION_POINTS,
    label:"Verified advertising collection after a sale/sharing opt-out"},
] as const;

/** Explicitly marked new captures only; all preceding registries stay frozen. */
export const CALIFORNIA_DISCLOSURE_CHOICE_SCORE_VERSION = "california-regulatory-posture.v18-disclosure-choice" as const;
export const CALIFORNIA_RUNTIME_LINK_SCORE_VERSION = "california-regulatory-posture.v19-runtime-link" as const;
export const CALIFORNIA_NON_DISCRIMINATION_ONLY_POINTS = 3;
export const CALIFORNIA_DISCLOSURE_CHOICE_SCORING_RULES = [
  ...CALIFORNIA_SCORING_RULES.map(rule => ({...rule, ...(rule.findingId === "california_rights_disclosure_not_observed"
    ? {nonDiscriminationOnlyPoints: CALIFORNIA_NON_DISCRIMINATION_ONLY_POINTS} : {})})),
  {findingId:"california_privacy_choice_not_observed",policyKey:"california.required_choice_link_not_observed",points:6,
    label:"Required sale/sharing opt-out link not found after permitted-alternative assessment"},
] as const;
