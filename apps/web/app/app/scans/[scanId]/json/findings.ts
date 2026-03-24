import {
  buildCanonicalReviewFindingPresentation,
  normalizeFindingName
} from "../../../../../lib/scans/canonical-review-finding";
import { compactEvidenceJsonForDisplay } from "../../../../../lib/scans/compact-evidence-json";

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

function buildJsonPresentationEvidence(finding: JsonViewFindingInput) {
  const evidence = { ...(finding.evidence ?? {}) } as Record<string, unknown>;

  if (
    finding.ruleKey === "scan_snapshot.commerce.retargeting_pixel_detected" &&
    evidence.snapshotField === "retargeting_pixel_detected" &&
    evidence.value === true &&
    !Array.isArray(evidence.runtimeEvidence) &&
    !Array.isArray(evidence.runtimeEvidenceArtifacts) &&
    !Array.isArray(evidence.retargetingEvidenceUrls) &&
    !Array.isArray(evidence.retargeting_evidence_urls)
  ) {
    evidence.normalizedConcernMaxAssertionLevel = "weak";
    evidence.normalizedConcernNegativeEvidenceFlags = [
      ...new Set([
        ...(Array.isArray(evidence.normalizedConcernNegativeEvidenceFlags)
          ? evidence.normalizedConcernNegativeEvidenceFlags.filter((value): value is string => typeof value === "string")
          : []),
        "no_direct_runtime_retargeting_artifact_observed"
      ])
    ];
  }

  return evidence;
}

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

function deriveObservation(finding: JsonViewFindingInput) {
  const normalizedTitle = normalizeFindingName(finding.title);
  const evidence = finding.evidence ?? {};

  const getStringArray = (key: string) =>
    Array.isArray(evidence[key]) ? evidence[key].filter((entry): entry is string => typeof entry === "string") : [];

  if (normalizedTitle === "Trackers observed before consent") {
    const vendors = getStringArray("preconsent_tracker_vendors");
    if (vendors.length > 0) {
      return `The scan saw tracking vendors before a clear consent choice, including ${vendors.slice(0, 3).join(", ")}.`;
    }

    const runtimeEvidence = getStringArray("runtimeEvidence");
    if (runtimeEvidence.length > 0) {
      return runtimeEvidence[0] ?? "The scan saw tracking activity before a clear consent choice.";
    }

    return "The scan saw tracking activity before a clear consent choice.";
  }

  if (normalizedTitle === "WCAG errors") {
    return "The automated accessibility check found WCAG issues that could affect how people use the site.";
  }

  if (normalizedTitle === "Accessibility risk score") {
    return "The scan retained representative automated accessibility rule outputs that elevated the page's manual-review priority.";
  }

  if (/missing$/i.test(normalizedTitle)) {
    const missingPageLabel = normalizedTitle.toLowerCase().replace(/ missing$/i, "");
    if (evidence.keyPageGuessedOnly === true) {
      return `The scan could not confidently confirm a clear ${missingPageLabel} page because bounded discovery relied on guessed candidate paths rather than confirmed site links.`;
    }
    return `The scan could not find a clear ${missingPageLabel} page during its bounded discovery pass.`;
  }

  if (/unavailable$/i.test(normalizedTitle)) {
    const pageLabel = normalizedTitle.toLowerCase().replace(/ unavailable$/i, "");
    if (evidence.keyPageGuessedOnly === true) {
      return `The scan found candidate paths for a ${pageLabel} page, but discovery relied on guessed targets and the page could not be retrieved successfully.`;
    }
    return `The scan found what looked like a ${pageLabel} page, but it could not retrieve it successfully.`;
  }

  const runtimeEvidence = getStringArray("runtimeEvidence");
  if (runtimeEvidence.length > 0) {
    return runtimeEvidence[0] ?? `The scan observed behavior related to ${normalizedTitle.toLowerCase()}.`;
  }

  const supportingSignals = getStringArray("supportingSignals");
  if (supportingSignals.length > 0) {
    return `The scan picked up supporting signals related to ${normalizedTitle.toLowerCase()}.`;
  }

  return `The scan observed evidence related to ${normalizedTitle.toLowerCase()}.`;
}

export function mapFindingsForJsonView(input: {
  domainHostname: string | null;
  findings: JsonViewFindingInput[];
}) {
  return input.findings
    .map((finding) => {
      const presentationEvidence = buildJsonPresentationEvidence(finding);
      const presentation = buildCanonicalReviewFindingPresentation(
        {
          fallbackEvidence: presentationEvidence,
          linkedValidationFinding: {
            evidence: presentationEvidence,
            pageUrl: finding.pageUrl,
            ruleKey: finding.ruleKey,
            title: finding.title
          },
          observedValue: null,
          severity:
            finding.severity === "high" || finding.severity === "medium" || finding.severity === "low"
              ? finding.severity
              : "medium",
          title: finding.title
        },
        []
      );
      const pageLabel = finding.pageUrl ?? input.domainHostname ?? "Unknown website";
      const summaryJson = {
        url: pageLabel,
        findingName: presentation.findingName,
        observation: deriveObservation(finding),
        confidenceScore: presentation.confidenceScore ?? "NA",
        whyThisMatters: presentation.whyThisMatters,
        suggestedFix: presentation.suggestedFix,
        suggestedBestPractice: presentation.suggestedBestPractice
          ? {
              organization: presentation.suggestedBestPractice.label,
              title: presentation.suggestedBestPractice.title,
              url: presentation.suggestedBestPractice.url
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
