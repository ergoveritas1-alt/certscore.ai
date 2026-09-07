import { CALIFORNIA_GPC_NO_SUPPRESSION_DEDUCTION_POINTS } from "./california-gpc-response-policy";

/** Owner-approved September 6, 2026. Numeric policy shared by scoring and review UI. */
export const SCORING_POLICY_VERSION = "gdpr-eprivacy-posture.v14";
export const FULL_SITE_SCORING_POLICY_VERSION = "full-site-distinct-findings.v2";
export const SCORE_FLOOR = 0;
export const SCORE_BASE = 100;
export const SCORING_FAMILIES = {
  pre_consent_storage: { label: "Storage", cap: 40 },
  pre_consent_tracking: { label: "Tracking", cap: 40 },
  consent_controls: { label: "Consent controls", cap: 22 },
  post_refusal_enforcement: { label: "Post-refusal", cap: 15 },
  sensitive_runtime: { label: "Sensitive runtime", cap: 25 },
  tracking_technology: { label: "Fingerprinting", cap: 25 },
  embedded_third_party: { label: "Embeds", cap: 20 },
  policy_transparency: { label: "Policy transparency", cap: 12 },
  transport_security: { label: "Transport", cap: 20 },
  gpc: { label: "GPC", cap: CALIFORNIA_GPC_NO_SUPPRESSION_DEDUCTION_POINTS },
} as const;
export type ScoringRule = {
  id: string; anchor: string; label: string; family: keyof typeof SCORING_FAMILIES;
  siteWide: boolean; points: number;
  identity?: { first: number; second: number; subsequentEach: number; unit: string };
};
export const SCORING_RULES: readonly ScoringRule[] = [
  {"id": "pre_consent_cookies_storage", "anchor": "storage", "label": "Non-essential pre-consent cookies / storage", "family": "pre_consent_storage", "siteWide": true, "points": 8, "identity": {"first": 8, "second": 4, "subsequentEach": 2, "unit": "identity"}},
  {"id": "pre_consent_third_party_tracking", "anchor": "tracking", "label": "Pre-consent tracking", "family": "pre_consent_tracking", "siteWide": true, "points": 8, "identity": {"first": 8, "second": 4, "subsequentEach": 2, "unit": "vendor"}},
  {"id": "reject_all_path_availability", "anchor": "decline", "label": "Decline / Reject path", "family": "consent_controls", "siteWide": false, "points": 12},
  {"id": "post_reject_tracking_reduction", "anchor": "post-reject", "label": "Post-Reject activity", "family": "post_refusal_enforcement", "siteWide": false, "points": 15},
  {"id": "session_replay_fingerprinting_review", "anchor": "replay", "label": "Session replay", "family": "sensitive_runtime", "siteWide": true, "points": 6, "identity": {"first": 6, "second": 4, "subsequentEach": 1, "unit": "identity"}},
  {"id": "sensitive_surfaces_third_party_tracking", "anchor": "sensitive", "label": "Sensitive surfaces with third-party tracking", "family": "sensitive_runtime", "siteWide": true, "points": 12},
  {"id": "device_identification_fingerprinting_signal_observed", "anchor": "fingerprinting", "label": "Fingerprinting", "family": "tracking_technology", "siteWide": true, "points": 6, "identity": {"first": 6, "second": 4, "subsequentEach": 1, "unit": "identity"}},
  {"id": "embedded_content_pre_consent", "anchor": "embedded-content", "label": "Embedded third-party content before consent", "family": "embedded_third_party", "siteWide": true, "points": 5},
  {"id": "social_media_embed_pre_consent", "anchor": "social", "label": "Social-media embeds before consent", "family": "embedded_third_party", "siteWide": true, "points": 5},
  {"id": "third_party_iframe_pre_consent", "anchor": "iframes", "label": "Third-party iframes before consent", "family": "embedded_third_party", "siteWide": true, "points": 5},
  {"id": "privacy_notice_availability", "anchor": "privacy-notice", "label": "Privacy-notice availability", "family": "policy_transparency", "siteWide": false, "points": 12},
  {"id": "transport_security_https_delivery", "anchor": "https", "label": "HTTPS delivery", "family": "transport_security", "siteWide": false, "points": 12},
  {"id": "transport_security_tls_certificate", "anchor": "tls", "label": "TLS certificate", "family": "transport_security", "siteWide": false, "points": 12},
  {"id": "transport_security_form_transport", "anchor": "forms", "label": "Insecure form transport", "family": "transport_security", "siteWide": false, "points": 10},
  {"id": "transport_security_mixed_content", "anchor": "mixed-content", "label": "Mixed content", "family": "transport_security", "siteWide": false, "points": 8},
  {"id": "transport_security_http_redirect", "anchor": "redirect", "label": "HTTP redirect handling", "family": "transport_security", "siteWide": false, "points": 2},
  {"id": "gpc_response", "anchor": "gpc", "label": "Eligible California GPC finding", "family": "gpc", "siteWide": false, "points": CALIFORNIA_GPC_NO_SUPPRESSION_DEDUCTION_POINTS},
 ];
export const SCORING_RULE_BY_ID = new Map(SCORING_RULES.map(rule => [rule.id, rule]));
export function scoringRuleDescription(rule: ScoringRule) {
  const identity = rule.identity;
  return identity ? `First ${identity.unit}: ${identity.first} · second: ${identity.second} · each additional: ${identity.subsequentEach}` : String(rule.points);
}
