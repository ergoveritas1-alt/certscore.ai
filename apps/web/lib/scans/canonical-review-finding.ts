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
    /^privacy\.preconsent_/i.test(normalized)
  ) {
    return "Trackers observed before consent";
  }

  if (/^bounded key-page discovery unresolved$/i.test(normalized)) {
    return "Bounded key-page discovery unresolved";
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function buildFallbackEvidence(input: ReviewFindingPresentationSource) {
  const pageUrls = (input.evidence ?? []).filter((entry) => /^https?:\/\//i.test(entry.trim()));

  return {
    observedValue: input.observedValue,
    pageUrls,
    severity: input.severity,
    sourceEvidence: input.evidence ?? []
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
    evidence: finding.linkedValidationFinding?.evidence ?? buildFallbackEvidence(finding),
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
