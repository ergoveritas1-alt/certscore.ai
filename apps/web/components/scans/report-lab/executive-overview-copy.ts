export const EXECUTIVE_OVERVIEW_MIN_LENGTH = 340;
export const EXECUTIVE_OVERVIEW_MAX_LENGTH = 430;

type ExecutiveOverviewInput = {
  controls: {
    accept: string;
    options: string;
    reject: string;
  };
  findings: Array<{
    summary: string;
    title: string;
  }>;
  limitedCount: number;
  limitedItems: string[];
  positiveCount: number;
  timeline: Array<{
    at: string;
    label: string;
  }>;
  transportPositiveCount: number;
};

function formatList(values: string[]) {
  if (values.length <= 1) return values[0] ?? "the retained findings";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

function fitExecutiveOverview(sentences: string[]) {
  let copy = sentences.filter(Boolean).join(" ");
  const context = [
    "This overview reflects retained automated evidence and is a practical review aid, not a legal conclusion.",
    "Open the supporting evidence for the detail behind each projected item.",
  ];
  for (const sentence of context) {
    if (copy.length >= EXECUTIVE_OVERVIEW_MIN_LENGTH) break;
    copy = `${copy} ${sentence}`;
  }
  if (copy.length <= EXECUTIVE_OVERVIEW_MAX_LENGTH) return copy;

  const clipped = copy.slice(0, EXECUTIVE_OVERVIEW_MAX_LENGTH - 1);
  const sentenceBoundary = clipped.lastIndexOf(". ");
  if (sentenceBoundary >= EXECUTIVE_OVERVIEW_MIN_LENGTH) {
    return clipped.slice(0, sentenceBoundary + 1);
  }
  const wordBoundary = clipped.lastIndexOf(" ");
  return `${clipped.slice(0, wordBoundary).replace(/[,:;]$/, "")}.`;
}

export function buildExecutiveOverview(input: ExecutiveOverviewInput) {
  const findingCount = input.findings.length;
  const evidenceText = input.findings.map((finding) => `${finding.title} ${finding.summary}`).join(" ");
  const hasConsentConcern = /consent|decline|reject|options/i.test(evidenceText);
  const hasTrackingConcern = /tracking|embedded|third-party/i.test(evidenceText);
  const hasStorageConcern = /cookie|storage/i.test(evidenceText);
  const consentEvent = input.timeline.find((event) => /consent/i.test(event.label));
  const exactFirstLayerPattern = input.controls.accept === "Observed"
    && input.controls.reject === "Not observed"
    && input.controls.options === "Not observed";
  const limitedItems = [...new Set(input.limitedItems.map((item) => item.trim()).filter(Boolean))];
  const limitation = (() => {
    if (input.limitedCount === 0) return "No checklist items were technically limited in this retained scan.";
    if (input.limitedCount === 1 && limitedItems[0] === "Post-choice tracking reduction") {
      return "Post-choice tracking was not tested because consent controls are not clicked; it remains unassessed.";
    }
    if (input.limitedCount === 1 && limitedItems[0]) {
      return `Limited evidence remains for ${limitedItems[0]}; verify that row manually.`;
    }
    if (limitedItems.length > 0) {
      const examples = limitedItems.slice(0, 2);
      const remainder = Math.max(0, input.limitedCount - examples.length);
      return `Limited evidence remains for ${formatList(examples)}${remainder > 0 ? ` and ${remainder} more row${remainder === 1 ? "" : "s"}` : ""}; verify those rows manually.`;
    }
    return `${input.limitedCount} checklist item${input.limitedCount === 1 ? " remains" : "s remain"} technically limited and should be verified manually.`;
  })();

  if (findingCount === 0) {
    return fitExecutiveOverview([
      "Overall, this scan did not surface a priority issue in the retained evidence.",
      "That is encouraging, but it is not a legal conclusion or proof that every site behavior was observed.",
      "Captured consent, runtime, policy, and transport signals should still be read alongside the underlying evidence before decisions are made.",
      limitation,
    ]);
  }

  const opening = findingCount <= 2
    ? "Overall, the results point to a narrow review, not a broad pattern of concern."
    : findingCount <= 4
      ? "Overall, this scan points to a focused review rather than a site-wide breakdown."
      : "Overall, several projected issues deserve a coordinated review across the affected areas.";
  const concernAreas = [
    hasConsentConcern ? "visitor choice" : null,
    hasTrackingConcern ? "pre-consent third-party activity" : null,
    hasStorageConcern ? "pre-consent storage" : null,
  ].filter((value): value is string => Boolean(value));
  const focus = exactFirstLayerPattern && hasConsentConcern
    ? "The clearest issue is visitor choice: Accept was retained on the first layer, while Reject and Options were not."
    : `The review centers on ${formatList(concernAreas)}.`;
  const activityLabel = hasTrackingConcern && hasStorageConcern
    ? "Tracking activity and cookies/storage"
    : hasTrackingConcern
      ? "Third-party activity"
      : hasStorageConcern
        ? "Cookies/storage"
        : null;
  const activity = activityLabel
    ? `${activityLabel} also appeared before the first consent surface${consentEvent ? ` at ${consentEvent.at}` : ""}.`
    : null;
  const positive = input.transportPositiveCount > 0
    ? "Transport security checks were observed."
    : input.positiveCount > 0
      ? "Other retained checks included positive observations."
      : null;
  return fitExecutiveOverview([opening, focus, activity ?? "", positive ?? "", limitation]);
}
