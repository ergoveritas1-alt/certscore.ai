import type {
  CertScoreFinding,
  CertScoreFindingConfidence,
  CertScoreFindingDirectness,
  CertScoreFindingSeverity
} from "./finding-registry";

const SEVERITY_WEIGHT: Record<CertScoreFindingSeverity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1
};

const CONFIDENCE_WEIGHT: Record<CertScoreFindingConfidence, number> = {
  strong: 3,
  good: 2,
  moderate: 1
};

const DIRECTNESS_WEIGHT: Record<CertScoreFindingDirectness, number> = {
  direct: 3,
  mixed: 2,
  inferred: 1
};

const TOP_FINDING_EXCLUDED_IDS = new Set<string>([
  "blocking_overlay_observed",
  "consent_dark_patterns_detected",
  "content_obstructed_by_overlay",
  "identifier_transmission_detected",
  "multi_vendor_tracking_detected",
  "non_cookie_tracking_detected",
  "telemetry_rich_identification_observed",
  "reject_option_missing_or_hidden"
]);

export function getFindingSurfaceScore(finding: CertScoreFinding) {
  return (
    SEVERITY_WEIGHT[finding.severity] * 100 +
    CONFIDENCE_WEIGHT[finding.confidence] * 20 +
    DIRECTNESS_WEIGHT[finding.directVsInferred] * 8 +
    finding.defaultSurfacePriority
  );
}

export function rankFindings(findings: CertScoreFinding[]) {
  return [...findings].sort((left, right) => getFindingSurfaceScore(right) - getFindingSurfaceScore(left));
}

export function selectTopFindings(findings: CertScoreFinding[], limit = 5) {
  const ranked = rankFindings(findings).filter((finding) => !TOP_FINDING_EXCLUDED_IDS.has(finding.id));
  const sectionCounts = new Map<string, number>();
  const selected: CertScoreFinding[] = [];
  const suppressedIds = new Set<string>();

  if (ranked.some((finding) => finding.id === "pre_consent_tracking_detected")) {
    suppressedIds.add("third_party_tracking_pre_consent");
  }

  const forcedIds = new Set<string>();
  if (ranked.some((finding) => finding.id === "pre_consent_tracking_detected")) {
    forcedIds.add("pre_consent_tracking_detected");
  }
  if (ranked.some((finding) => finding.id === "cookie_disclosure_gap")) {
    forcedIds.add("cookie_disclosure_gap");
  }
  if (ranked.some((finding) => finding.id === "probable_fingerprinting")) {
    forcedIds.add("probable_fingerprinting");
  }
  if (ranked.some((finding) => finding.id === "session_recording_services_detected")) {
    forcedIds.add("session_recording_services_detected");
  }
  if (ranked.some((finding) => finding.id === "cross_domain_identifier_sharing_observed")) {
    forcedIds.add("cross_domain_identifier_sharing_observed");
  }
  if (
    ranked.some(
      (finding) =>
        finding.id === "reject_tracking_persists_after_reject" &&
        (finding.severity === "critical" || finding.severity === "high")
    )
  ) {
    forcedIds.add("reject_tracking_persists_after_reject");
  }
  if (ranked.some((finding) => finding.id === "blocking_overlay_observed")) {
    forcedIds.add("blocking_overlay_observed");
  }

  for (const finding of ranked) {
    if (suppressedIds.has(finding.id)) {
      continue;
    }
    if (!forcedIds.has(finding.id)) {
      continue;
    }
    const count = sectionCounts.get(finding.section) ?? 0;
    sectionCounts.set(finding.section, count + 1);
    selected.push(finding);
    if (selected.length >= limit) {
      return selected;
    }
  }

  for (const finding of ranked) {
    if (suppressedIds.has(finding.id)) {
      continue;
    }
    if (selected.some((entry) => entry.id === finding.id)) {
      continue;
    }
    const count = sectionCounts.get(finding.section) ?? 0;
    if (count >= 2) {
      continue;
    }
    sectionCounts.set(finding.section, count + 1);
    selected.push(finding);
    if (selected.length >= limit) {
      break;
    }
  }

  return selected;
}
