export const EXECUTIVE_OVERVIEW_MIN_LENGTH = 340;
export const EXECUTIVE_OVERVIEW_MAX_LENGTH = 430;

type ExecutiveOverviewInput = {
  acceptPath?: {
    note?: string | null;
    observationWindowMs: number | null;
    state: "activity_observed" | "review_signal" | "no_activity_observed" | "incomplete";
  } | null;
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
  rejectPath?: {
    note?: string | null;
    observationWindowMs: number | null;
    state: "issue_observed" | "review_signal" | "no_issue_observed" | "incomplete";
  } | null;
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
  const acceptOutcome = input.acceptPath?.state === "activity_observed"
    ? "The confirmed Accept path retained consent-dependent activity as the post-Accept comparison baseline."
    : input.acceptPath?.state === "review_signal"
      ? "The visitor clicked Accept, but the consent record saved afterward still showed analytics and advertising as denied. The saved record needs to be corrected so it matches the visitor’s choice."
      : input.acceptPath?.state === "no_activity_observed"
        ? "The confirmed Accept path retained no qualifying post-Accept activity in its bounded window."
        : input.acceptPath?.state === "incomplete"
          ? input.acceptPath.note?.trim()
            ? `Accept-path testing did not complete. ${input.acceptPath.note.trim()}`
            : "Accept-path testing did not complete."
          : null;
  const rejectObservationWindowMs = input.rejectPath?.observationWindowMs;
  const rejectIncompleteReason = input.rejectPath?.note?.trim();
  const rejectWindow = typeof rejectObservationWindowMs === "number"
    ? `${Number.isInteger(rejectObservationWindowMs / 1_000) ? rejectObservationWindowMs / 1_000 : Math.round(rejectObservationWindowMs / 100) / 10}-second`
    : "bounded";
  const rejectOutcome = input.rejectPath?.state === "issue_observed"
    ? `The confirmed Reject path did not stop qualifying non-essential activity during the retained ${rejectWindow} post-Reject window.`
    : input.rejectPath?.state === "review_signal"
      ? "The Reject test completed, but retained storage persistence remains a review signal rather than proof of active post-Refusal use."
      : input.rejectPath?.state === "no_issue_observed"
        ? `The confirmed Reject path completed without a qualifying issue in the retained ${rejectWindow} post-Reject window.`
        : input.rejectPath?.state === "incomplete"
          ? rejectIncompleteReason
            ? `Reject-path testing did not complete. ${rejectIncompleteReason}`
            : "Reject-path testing did not complete."
          : null;
  const limitation = (() => {
    if (input.limitedCount === 0) return "No checklist items were technically limited in this retained scan.";
    if (input.limitedCount === 1 && limitedItems[0] === "Post-choice tracking reduction") {
      return "Post-choice tracking was not tested and remains unassessed without a confirmed refusal state.";
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
  return fitExecutiveOverview([opening, focus, acceptOutcome ?? "", rejectOutcome ?? "", activity ?? "", positive ?? "", limitation]);
}
