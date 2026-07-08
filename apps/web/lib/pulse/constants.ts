export const PULSE_API_VERSION = "v1";
export const PULSE_SCHEMA_VERSION = "0.5.4";
export const PULSE_VERSION = "2026-05-18";
export const PULSE_PROJECTION_VERSION = "pulse-public-v1";
export const PULSE_SOURCE = "certscore.ai";
export const PULSE_FEEDBACK_EMAIL = "support@certscore.ai";
export const PULSE_MAX_RECOMMENDED_AGE_HOURS = 168;

export const PULSE_STANDARD_DISCLAIMER =
  "CertScore outputs are automated public-web observations for review. They are not legal advice, certification, or a compliance determination. Always review the underlying evidence and consult qualified experts where appropriate.";

export const PULSE_SHORT_DISCLAIMER =
  "Automated public-web observations for review. Not legal advice, certification, or a compliance determination.";

export const PULSE_REVIEW_CONTEXT_DISCLAIMER =
  "Current findings are organized around GDPR/ePrivacy privacy, consent, tracking, cookie, and disclosure review contexts. These are automated signals for review, not legal determinations.";

export const PULSE_COVERAGE_LIMITATION_COPY =
  "Coverage may be affected by bot defenses, geography, consent flow branching, lazy loading, protected routes, authenticated-only areas, or other runtime conditions. Absence of findings should not be interpreted as absence of risk.";

export const PULSE_CAPABILITIES = {
  method: "automated_runtime_analysis",
  observes: [
    "pre_consent_tracking",
    "cmp_load_order",
    "third_party_requests",
    "consent_enforcement_gaps",
    "cookie_activity",
    "disclosure_inconsistencies"
  ],
  doesNotProvide: ["legal_advice", "certification", "compliance_determination"]
} as const;

export const PULSE_AGENT_DO_NOT_CALL_THIS = ["legal_advice", "certification", "compliance_determination"] as const;

export const PULSE_PURPOSE_STATEMENT =
  "CertScore Pulse uses automated runtime analysis of public websites to detect GDPR/ePrivacy review signals around pre-consent tracking, third-party requests, consent enforcement gaps, cookie activity, and disclosure inconsistencies.";

export const PULSE_USAGE_GUIDANCE = {
  allowedSummary: "Automated scan surfaced review signals.",
  avoidClaims: [
    "Do not say CertScore determined the site violates law.",
    "Do not say the site is non-compliant.",
    "Do not say CertScore certified the site.",
    "Do not treat absence of findings as proof of compliance.",
    "Do not ignore coverage limitations or scan freshness."
  ]
} as const;

export const PULSE_STATUS_STEPS = [
  "queued",
  "url_normalized",
  "worker_started",
  "homepage_loading",
  "consent_surface_detection",
  "runtime_observation",
  "policy_surface_detection",
  "evidence_normalization",
  "finding_projection",
  "pulse_generation",
  "completed"
] as const;

export const PULSE_FEEDBACK_RATINGS = ["useful", "not_useful", "unclear", "incorrect", "too_limited"] as const;

export const PULSE_FEEDBACK_REASONS = [
  "incorrect_finding",
  "missing_evidence",
  "too_much_detail",
  "not_enough_detail",
  "coverage_limited",
  "hard_to_understand",
  "api_issue",
  "other"
] as const;
