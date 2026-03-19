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
  linkedValidationFinding?: Pick<ScanValidationFinding, "evidence" | "modelConfidence" | "pageUrl" | "ruleKey" | "title"> | null;
  observedValue: string | null;
  severity: ReviewFindingSeverity;
  title: string;
};

function formatValidationConfidence(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  const rounded = Math.round(value * 100) / 100;
  const hundredths = Math.round(rounded * 100);
  return hundredths % 10 === 0 ? rounded.toFixed(1) : rounded.toFixed(2);
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
  const confidenceScore = formatValidationConfidence(finding.linkedValidationFinding?.modelConfidence ?? null);

  return {
    confidenceScore,
    findingName: finding.linkedValidationFinding?.title ?? finding.title,
    suggestedBestPractice: presentation.bestPracticeLink,
    suggestedFix: presentation.suggestedFix,
    whyThisMatters: presentation.whyThisMatters
  };
}
