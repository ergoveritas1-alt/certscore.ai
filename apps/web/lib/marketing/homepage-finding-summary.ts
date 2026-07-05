import type { FindingReferenceItem } from "./finding-atlas";

export type HomepageFindingSummary = {
  id: string;
  title: string;
  category: FindingReferenceItem["category"];
  criticality: FindingReferenceItem["criticality"];
  overview: string;
  prevalenceLabel: string;
  regulatoryLabel?: string;
  regulatoryCopy?: string;
  reviewLensBadges: string[];
  evidence: {
    title: string;
    lines: string[];
  } | null;
  reviewPrompts: string[];
};

function getCondensedEvidence(finding: FindingReferenceItem): HomepageFindingSummary["evidence"] {
  const example = finding.exampleEvidence[0];

  if (!example) {
    return null;
  }

  return {
    title: example.title,
    lines: example.code.split("\n").slice(0, 3)
  };
}

function getReviewLensBadges(finding: FindingReferenceItem) {
  const context = finding.regulatoryContext;

  if (!context) {
    return [];
  }

  const labels = [
    context.primaryConcern.label,
    ...context.technicalStandards.map((item) => item.label),
    ...context.jurisdictionalContexts.map((item) => item.label)
  ].join(" ");
  const badges: string[] = [];

  if (/gdpr|eprivacy|pecr|ico|edpb/i.test(labels)) {
    badges.push("GDPR / ePrivacy");
  }

  if (/ftc|consumer protection|dark-pattern|privacy claim/i.test(labels)) {
    badges.push("FTC");
  }

  if (/ada|wcag|section 508|accessibility|doj|en 301 549/i.test(labels)) {
    badges.push("DOJ / ADA");
  }

  return badges;
}

export function createHomepageFindingSummaries(findings: FindingReferenceItem[]): HomepageFindingSummary[] {
  return findings.map((finding) => ({
    id: finding.id,
    title: finding.title,
    category: finding.category,
    criticality: finding.criticality,
    overview: finding.observed,
    prevalenceLabel: finding.benchmark.contextLabel,
    regulatoryLabel: finding.regulatoryContext?.primaryConcern.label,
    regulatoryCopy: finding.regulatoryContext?.primaryConcern.displayCopy,
    reviewLensBadges: getReviewLensBadges(finding),
    evidence: getCondensedEvidence(finding),
    reviewPrompts: finding.reviewQuestions.slice(0, 2)
  }));
}
