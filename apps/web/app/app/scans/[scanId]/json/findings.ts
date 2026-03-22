import { normalizeFindingName } from "../../../../../lib/scans/canonical-review-finding";
import { compactEvidenceJsonForDisplay } from "../../../../../lib/scans/compact-evidence-json";
import { getReviewFindingPresentation } from "../../../../../lib/scans/review-finding-presentation";

export type JsonViewFindingInput = {
  evidence: Record<string, unknown> | null;
  id: string;
  pageUrl: string | null;
  ruleKey: string;
  severity: string | null;
  title: string;
};

export type JsonViewFindingRow = {
  evidenceJson: string;
  id: string;
  pageLabel: string;
  ruleSummary: string;
  summaryJson: string;
  title: string;
};

function getFindingPriority(finding: {
  ruleKey: string;
  title: string;
}) {
  const normalizedTitle = normalizeFindingName(finding.title);

  if (normalizedTitle === "Trackers observed before consent") {
    if (/preconsent_violation_count/i.test(finding.ruleKey)) {
      return 400;
    }
    if (/preconsent_tracker_evidence_urls/i.test(finding.ruleKey)) {
      return 390;
    }
    if (/preconsent_tracker_vendors/i.test(finding.ruleKey)) {
      return 380;
    }
    if (/preconsent_tracking_detected/i.test(finding.ruleKey)) {
      return 370;
    }
    return 360;
  }

  if (normalizedTitle === "WCAG errors") {
    return 320;
  }
  if (normalizedTitle === "Contrast failures detected") {
    return 310;
  }
  if (normalizedTitle === "Link name issues detected") {
    return 300;
  }
  if (normalizedTitle === "Landmark issues") {
    return 290;
  }
  if (normalizedTitle === "Bounded key-page discovery unresolved") {
    return 280;
  }

  return 0;
}

export function mapFindingsForJsonView(input: {
  domainHostname: string | null;
  findings: JsonViewFindingInput[];
}) {
  return input.findings
    .map((finding) => {
      const presentation = getReviewFindingPresentation({
        evidence: finding.evidence ?? {},
        findingTitle: finding.title,
        keyOrTitle: finding.ruleKey,
        siblingFindingKeysOrTitles: []
      });
      const pageLabel = finding.pageUrl ?? input.domainHostname ?? "Unknown website";
      const summaryJson = {
        url: pageLabel,
        findingName: normalizeFindingName(finding.title),
        confidenceScore: presentation.confidenceScore ?? "NA",
        whyThisMatters: presentation.whyThisMatters,
        suggestedFix: presentation.suggestedFix,
        suggestedBestPractice: presentation.bestPracticeLink
          ? {
              organization: presentation.bestPracticeLink.label,
              title: presentation.bestPracticeLink.title,
              url: presentation.bestPracticeLink.url
            }
          : null
      };

      return {
        evidenceJson: JSON.stringify(compactEvidenceJsonForDisplay(finding.evidence ?? {}), null, 2),
        id: finding.id,
        pageLabel,
        ruleSummary: `${finding.ruleKey} · ${finding.severity ?? "unknown"} · ${input.domainHostname ?? "unknown host"}`,
        sortPriority: getFindingPriority({
          ruleKey: finding.ruleKey,
          title: finding.title
        }),
        summaryJson: JSON.stringify(summaryJson, null, 2),
        title: normalizeFindingName(finding.title)
      };
    })
    .sort((left, right) => {
      if (left.sortPriority !== right.sortPriority) {
        return right.sortPriority - left.sortPriority;
      }

      if (left.title !== right.title) {
        return left.title.localeCompare(right.title);
      }

      return left.id.localeCompare(right.id);
    })
    .map(({ sortPriority: _sortPriority, ...finding }) => finding satisfies JsonViewFindingRow);
}
