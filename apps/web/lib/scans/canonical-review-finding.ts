import { getReviewFindingPresentation, type ReviewFindingBestPracticeLink } from "./review-finding-presentation";
import type { ScanValidationFinding } from "./validation-review-linking";

export type CanonicalReviewFindingPresentation = {
  confidenceScore?: string | null;
  findingName: string;
  suggestedBestPractice?: ReviewFindingBestPracticeLink;
  suggestedFix: string;
  whyThisMatters: string;
};

export type ReviewFindingSeverity = "high" | "medium" | "low";

export type ReviewFindingPresentationSource = {
  evidence?: string[];
  fallbackEvidence?: Record<string, unknown> | null;
  linkedValidationFinding?: Pick<ScanValidationFinding, "evidence" | "pageUrl" | "ruleKey" | "title"> | null;
  observedValue: string | null;
  severity: ReviewFindingSeverity;
  title: string;
};

export function normalizeFindingName(title: string | null | undefined | unknown) {
  const safeTitle = typeof title === "string" ? title : "";
  const normalized = safeTitle
    .replace(/^(high|low)-confidence\s+/i, "")
    .replace(/^high confidence on\s+/i, "")
    .replace(/^low confidence on\s+/i, "")
    .replace(/^low extraction confidence$/i, "Extraction issue")
    .trim();

  if (!normalized) {
    return normalized;
  }

  if (/^automated accessibility issues detected$/i.test(normalized)) {
    return "WCAG errors";
  }

  if (
    /^(trackers observed before consent|pre-consent tracking detected|pre-consent tracking activity|pre-consent tracker evidence urls|pre-consent tracker vendors|pre-consent tracker violations)$/i.test(
      normalized
    ) ||
    /^possible pre-consent tracking signals on first load$/i.test(normalized) ||
    /^privacy\.preconsent_/i.test(normalized)
  ) {
    return "Trackers observed before consent";
  }

  if (/^(trackers persisted after reject|reject path may not fully suppress non-essential activity)$/i.test(normalized)) {
    return "Trackers persisted after reject";
  }

  if (/^(reject-all control missing|reject path appears less direct than accept path)$/i.test(normalized)) {
    return "Reject-all control missing";
  }

  if (/^(gpc signal ignored|global privacy control signal not honored|browser-level privacy signal effect not evident)$/i.test(normalized)) {
    return "GPC signal not honored";
  }

  if (/^bounded key-page discovery unresolved$/i.test(normalized)) {
    return "Bounded key-page discovery unresolved";
  }

  if (
    /^(session replay without disclosure detected|possible replay\/disclosure mismatch)(?:\s+(privacy policy|tos|terms of service))?$/i.test(
      normalized
    )
  ) {
    return "Possible replay/disclosure mismatch";
  }

  if (
    /^(missing dsar high exposure|possible missing privacy-rights path)(?:\s+(privacy policy|tos|terms of service))?$/i.test(
      normalized
    )
  ) {
    return "Possible missing privacy-rights path";
  }

  if (/^high-sensitivity data collection detected$/i.test(normalized)) {
    return "Potential high-sensitivity data collection risk";
  }

  if (/^contrast failures$/i.test(normalized)) {
    return "Contrast failures detected";
  }

  if (/^form label issues$/i.test(normalized)) {
    return "Form label issues detected";
  }

  if (/^link name issues$/i.test(normalized)) {
    return "Link name issues detected";
  }

  if (/^cookie policy unavailable$/i.test(normalized)) {
    return "Cookie policy not retrievable";
  }

  if (/^privacy policy page unavailable$/i.test(normalized)) {
    return "Privacy policy not retrievable";
  }

  if (/^terms page unavailable$/i.test(normalized)) {
    return "Terms page not retrievable";
  }

  if (/^accessibility statement unavailable$/i.test(normalized)) {
    return "Accessibility statement not retrievable";
  }

  if (/^contact page unavailable$/i.test(normalized)) {
    return "Contact page not retrievable";
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function buildFallbackEvidence(input: ReviewFindingPresentationSource) {
  const pageUrls = (input.evidence ?? []).filter((entry) => /^https?:\/\//i.test(entry.trim()));

  return {
    ...(input.fallbackEvidence ?? {}),
    observedValue: input.observedValue,
    pageUrls,
    severity: input.severity,
    sourceEvidence: input.evidence ?? []
  } satisfies Record<string, unknown>;
}

function buildPresentationEvidence(input: ReviewFindingPresentationSource) {
  return {
    ...(input.linkedValidationFinding?.evidence ?? {}),
    ...buildFallbackEvidence(input)
  } satisfies Record<string, unknown>;
}

export function buildCanonicalReviewFindingPresentation(
  finding: ReviewFindingPresentationSource,
  siblingFindings: ReviewFindingPresentationSource[]
): CanonicalReviewFindingPresentation {
  const siblingFindingKeysOrTitles = siblingFindings.flatMap((candidate) => {
    const values = [candidate.linkedValidationFinding?.ruleKey, candidate.linkedValidationFinding?.title, candidate.title];
    return values.filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  });

  const presentation = getReviewFindingPresentation({
    evidence: buildPresentationEvidence(finding),
    findingTitle: finding.linkedValidationFinding?.title ?? finding.title,
    keyOrTitle: finding.linkedValidationFinding?.ruleKey ?? finding.title,
    siblingFindingKeysOrTitles
  });

  return {
    confidenceScore: presentation.confidenceScore ?? null,
    findingName: normalizeFindingName(finding.linkedValidationFinding?.title ?? finding.title),
    suggestedBestPractice: presentation.bestPracticeLink,
    suggestedFix: presentation.suggestedFix,
    whyThisMatters: presentation.whyThisMatters
  };
}
