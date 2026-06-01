import { getFindingReferenceIdForReportFindingId } from "../marketing/finding-reference-links";
import {
  getFindingReferenceItems,
  getFindingReferenceCriticality,
  getFindingReferenceObservedCopy,
  getFindingReferenceTitle
} from "../marketing/finding-atlas";
import type { CertScoreFinding, CertScoreFindingConfidence, CertScoreFindingSeverity } from "./finding-registry";

export type PublicReportCriticality = CertScoreFindingSeverity;

type PublicReportFindingDisplayInput = {
  confidence?: CertScoreFindingConfidence | "high" | "moderate" | "low" | null;
  findingId: string;
  label?: string | null;
  remediation?: string | null;
  section?: string | null;
  severity?: string | null;
  title?: string | null;
};

const FINDING_REFERENCE_BY_ID = new Map(getFindingReferenceItems().map((finding) => [finding.id, finding]));

const ACCESSIBILITY_FINDING_IDS = new Set([
  "visual_contrast_accessibility_issue",
  "semantic_labeling_accessibility_issue",
  "text_alternative_accessibility_issue",
  "keyboard_navigation_accessibility_issue"
]);

const CONSENT_UI_FINDING_IDS = new Set([
  "reject_option_missing_or_hidden",
  "forced_consent_interaction",
  "asymmetric_consent_ui",
  "consent_dark_patterns_detected",
  "consent_preference_reopen_control_not_observed"
]);

const FINGERPRINTING_FINDING_IDS = new Set([
  "fingerprinting_related_signals_observed",
  "probable_fingerprinting"
]);

const SESSION_REPLAY_FINDING_IDS = new Set([
  "session_recording_services_detected",
  "possible_session_replay_on_sensitive_input_surface",
  "session_replay_present_with_sensitive_surfaces_observed",
  "sensitive_data_collection_with_third_party_tracking_present"
]);

const CPRA_PRIVACY_CHOICE_FINDING_IDS = new Set(["cpra_cba_opt_out_missing"]);

const SCAN_QUALITY_FINDING_IDS = new Set([
  "scan_quality_visual_artifact_missing",
  "scan_quality_visual_no_go",
  "scan_quality_visual_degraded"
]);

const SCAN_QUALITY_TITLE_COPY: Record<string, string> = {
  scan_quality_visual_artifact_missing: "Screenshot evidence missing",
  scan_quality_visual_no_go: "Captured page was not a normal public site",
  scan_quality_visual_degraded: "Captured page was degraded but usable"
};

const SCAN_QUALITY_OBSERVED_COPY: Record<string, string> = {
  scan_quality_visual_artifact_missing:
    "The scanner did not retain usable screenshot evidence for the initial public-page view. Treat this as a scan-quality limitation, not as a substantive privacy, consent, or accessibility finding.",
  scan_quality_visual_no_go:
    "Nano reviewed the captured screenshot and classified the visible page as a no-go state, such as a challenge, access block, unavailable page, blank page, wrong site, soft-404, or parked placeholder. Runtime signals from that session should be interpreted as access-limited until a normal public page is verified.",
  scan_quality_visual_degraded:
    "Nano reviewed the captured screenshot and classified the visible page as degraded but still usable. Findings may remain useful, but the report should be read with the captured-page condition in mind."
};

const REPORT_REMEDIATION_COPY: Record<string, string> = {
  pre_consent_tracking_detected:
    "Teams commonly review whether consent mode, CMP state, and tag-manager triggers prevent non-essential analytics, advertising, measurement, or replay requests from firing before the relevant consent state is available.",
  third_party_cookie_pre_consent:
    "Teams commonly review whether third-party cookie or storage writes are gated until consent state is available, and manually confirm purpose, necessity, exemption status, and vendor configuration.",
  reject_tracking_persists_after_reject:
    "Teams commonly replay the reject path with the browser network panel open, compare pre-reject and post-reject request timing, and review CMP-to-tag-manager propagation.",
  session_recording_services_detected:
    "Teams commonly review replay vendor configuration, consent gating, masking, sampling, and page-level exclusions to determine whether the retained runtime signal reflects intended behavior.",
  fingerprinting_related_signals_observed:
    "Teams commonly review the owning script or SDK, purpose, consent state, vendor role, and whether high-entropy browser or device signal collection can be minimized or limited to the stated purpose.",
  rtb_cookie_sync_observed:
    "Teams commonly review which adtech, header-bidding, audience-management, or identity-match integrations trigger sync-style requests, and whether those endpoints are suppressed until the relevant consent or opt-out state has been evaluated.",
  policy_behavior_contradiction_detected:
    "Teams commonly compare the retained policy claim, runtime anchor, and bridge rationale, then confirm whether implementation behavior, consent flow, and public disclosures need to be brought back into alignment.",
  probable_fingerprinting:
    "Teams commonly identify which script, SDK, or vendor owns the high-entropy signal cluster, then review purpose, necessity, consent state, and whether collection can be minimized or limited to the stated purpose.",
  sensitive_data_collection_with_third_party_tracking_present:
    "Teams commonly review page-level tag exclusions, masking, event suppression, and vendor configuration for sensitive form pages, account flows, application flows, and other high-review surfaces.",
  session_replay_present_with_sensitive_surfaces_observed:
    "Teams commonly review replay vendor configuration, masking, sampling, consent gating, and page-level exclusions for sensitive account, login, intake, payment, and application flows.",
  visual_contrast_accessibility_issue:
    "Teams commonly review the affected selector, color pair, component state, and applicable contrast threshold before adjusting design tokens or component styles.",
  scan_quality_visual_artifact_missing:
    "Retry the scan and confirm the initial-load screenshot artifact is retained before relying on scan-result interpretation.",
  scan_quality_visual_no_go:
    "Retry from a normal browsing path or allow scanner access, then compare the screenshot and retained runtime evidence before treating the underlying scan results as representative of the real public site.",
  scan_quality_visual_degraded:
    "Review the screenshot alongside retained evidence and rerun if the captured page condition could materially change the interpretation."
};

export function getPublicReportFindingReferenceId(findingId: string) {
  return getFindingReferenceIdForReportFindingId(findingId);
}

export function getPublicReportFindingDisplay(input: PublicReportFindingDisplayInput) {
  const referenceId = getPublicReportFindingReferenceId(input.findingId);
  const reference = referenceId ? FINDING_REFERENCE_BY_ID.get(referenceId) : null;
  const canonicalFindingId = referenceId ?? input.findingId;
  const title =
    SCAN_QUALITY_TITLE_COPY[canonicalFindingId] ??
    reference?.title ??
    getFindingReferenceTitle(canonicalFindingId) ??
    input.title ??
    input.label ??
    input.findingId.replaceAll("_", " ");
  const criticality = reference?.criticality ?? getFindingReferenceCriticality(canonicalFindingId) ?? normalizeCriticality(input.severity);
  const observedSummary = SCAN_QUALITY_OBSERVED_COPY[canonicalFindingId] ?? reference?.observed ?? getFindingReferenceObservedCopy(canonicalFindingId);
  const remediation = REPORT_REMEDIATION_COPY[referenceId ?? input.findingId] ?? softenReportRemediation(input.remediation ?? "");

  return {
    criticality,
    observedSummary,
    reference,
    referenceId,
    remediation,
    title
  };
}

export function getPublicReportFindingFallbackNote(findingId: string) {
  if (SCAN_QUALITY_FINDING_IDS.has(findingId)) {
    return "Scan-quality signal. Reference page not yet available.";
  }

  if (getPublicReportFindingReferenceId(findingId)) {
    return null;
  }

  return /policy|privacy|disclosure|cookie|terms|rights|gpc|sharing|sell/i.test(findingId)
    ? "Policy review signal. Reference page not yet available."
    : "Review signal. Reference page not yet available.";
}

export function getPublicReportConfidenceDefinition(input: {
  confidence?: CertScoreFindingConfidence | "high" | "moderate" | "low" | null;
  findingId: string;
  section?: string | null;
}) {
  const referenceId = getPublicReportFindingReferenceId(input.findingId) ?? input.findingId;

  if (SCAN_QUALITY_FINDING_IDS.has(referenceId)) {
    return "Review evidence means CertScore retained a screenshot-based scan-quality assessment for the captured page state. This limits how the scan should be interpreted; it does not by itself determine whether the real public site has a privacy, consent, accessibility, or disclosure issue.";
  }

  if (ACCESSIBILITY_FINDING_IDS.has(referenceId) || /accessibility/i.test(input.section ?? "")) {
    return "Review evidence means CertScore retained representative automated accessibility evidence such as rule ID, affected selector, page context, impact label, and reviewer context. Manual accessibility review is still needed before drawing operational or legal conclusions.";
  }

  if (CPRA_PRIVACY_CHOICE_FINDING_IDS.has(referenceId)) {
    return "Review evidence means CertScore retained public-surface and runtime context for privacy-choice review, without determining CPRA applicability, sale/share status, opt-out sufficiency, GPC handling, or compliance status.";
  }

  if (SESSION_REPLAY_FINDING_IDS.has(referenceId)) {
    return "Review evidence means CertScore retained runtime or page-surface evidence for replay, behavior analytics, or sensitive-surface context, without determining keystroke capture, screenshot capture, sensitive-value capture, or recording retention.";
  }

  if (FINGERPRINTING_FINDING_IDS.has(referenceId)) {
    return "Review evidence means CertScore retained browser or device signal context for manual review, without determining personal identity, identity resolution, persistent fingerprint creation, user singling-out, or a complete identity graph.";
  }

  if (CONSENT_UI_FINDING_IDS.has(referenceId)) {
    return "Review evidence means CertScore retained consent-surface observations such as visible controls, labels, path depth, overlays, or interaction-state context for manual review.";
  }

  if (input.confidence === "strong" || input.confidence === "high") {
    return "Strong evidence means CertScore retained direct runtime evidence such as timing, classified request or storage artifacts, vendor/category context, and coverage signals. Manual review is still needed for purpose, consent state, exemptions, and configuration.";
  }

  return "Review evidence means CertScore retained runtime evidence such as timing, classified request or storage artifacts, vendor/category context, and coverage signals. Manual review is still needed for purpose, consent state, exemptions, and configuration.";
}

function normalizeCriticality(value: string | null | undefined): PublicReportCriticality {
  switch ((value ?? "").toLowerCase()) {
    case "critical":
      return "critical";
    case "high":
      return "high";
    case "medium":
      return "medium";
    default:
      return "low";
  }
}

function softenReportRemediation(value: string) {
  return value
    .replace(/\bmust\b/gi, "should")
    .replace(/\bensure compliance\b/gi, "review compliance context")
    .replace(/\bremove the vendor\b/gi, "review whether the vendor should remain")
    .replace(/\bBlock\b/g, "Review gating for")
    .replace(/\bblock\b/g, "review gating for")
    .replace(/\bPrevent\b/g, "Review whether configuration prevents")
    .replace(/\bprevent\b/g, "review whether configuration prevents")
    .replace(/\bDelay\b/g, "Review whether teams should delay")
    .replace(/\bdelay\b/g, "review whether teams should delay");
}

export function getPublicReportFindingDisplayForCertFinding(finding: CertScoreFinding) {
  return getPublicReportFindingDisplay({
    confidence: finding.confidence,
    findingId: finding.id,
    label: finding.label,
    remediation: finding.remediation,
    section: finding.section,
    severity: finding.severity,
    title: finding.label
  });
}
