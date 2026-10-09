import { postAcceptReportProjectionSchema, postRefusalReportProjectionSchema, reconcilePostAcceptFormInventory } from "@certscore/contracts";
import { isAfterActionReportEligible } from "./after-action-report-eligibility";
import { readChoicePathExecution } from "./choice-path-execution";
import type { RuntimeObservationTimelineEvent } from "../../components/scans/runtime-observation-sections";

export type ActionTimelineProjection = {
  clockLabel: string;
  events: RuntimeObservationTimelineEvent[];
  coverage: "complete" | "limited";
};

/** Descriptive timing from the persisted typed action projection. No findings or score effects. */
export function projectRetainedActionTimeline(value: unknown, assessment: unknown, action: "accept" | "reject", activityTone: "neutral" | "concern" = "neutral"): ActionTimelineProjection | null {
  if (!isAfterActionReportEligible(assessment, action)) return null;
  const parsed = action === "accept" ? postAcceptReportProjectionSchema.safeParse(value) : postRefusalReportProjectionSchema.safeParse(value);
  if (!parsed.success) return null;
  const projection = parsed.data;
  const execution = readChoicePathExecution(projection, action);
  if (!execution?.clickCompleted) return null;
  const completion = projection.registeredObservationCompletion;
  const capture = projection.afterActionCapture;
  const timing = projection.retainedActionTiming;
  if (!capture && !timing && !execution.consentConfirmed) return null;
  const start = timing?.actionDispatchedAtMs ?? capture?.actionDispatchedAtMs ?? completion?.startedAtMs;
  const end = timing?.observationEndedAtMs ?? capture?.captureEndedAtMs ?? completion?.completedAtMs;
  if (start === undefined || (end !== undefined && end < start)) return null;
  const usesClickClock = !!timing || !!capture;
  const coverage = execution.observationCompleted ? "complete" : "limited";
  const label = action === "accept" ? "Accept" : "Reject";
  const events: RuntimeObservationTimelineEvent[] = [];
  const add = (atMs: number, eventLabel: string, detail: string, tone: RuntimeObservationTimelineEvent["tone"] = "neutral") => {
    if (atMs < 0) return;
    events.push({ at: `${Math.round(atMs / 10) / 100}s`, atMs, label: eventLabel, detail, tone });
  };
  add(0, usesClickClock ? `${label} click` : `${label} confirmed`, usesClickClock ? `The ${label} control was activated` : `The ${label} decision was confirmed`, "positive");
  // Keep one milestone per activity type, retaining its earliest observed time.
  const activities = "postAcceptActivity" in projection ? projection.postAcceptActivity.map(row => ({ ...row, offset: row.msAfterAccept }))
    : projection.postRefusalActivity.map(row => ({ ...row, offset: row.msAfterReject }));
  const registeredAt = "acceptanceRegisteredAtMs" in projection ? projection.acceptanceRegisteredAtMs
    : "refusalRegisteredAtMs" in projection ? projection.refusalRegisteredAtMs : undefined;
  if (usesClickClock && execution.consentConfirmed && registeredAt !== undefined) {
    add(registeredAt - start, `${label} confirmed`, `The ${label} decision was confirmed`, "positive");
  }
  if (registeredAt !== undefined) {
    for (const type of ["network_request", "storage_write"] as const) {
      const first = activities.filter(row => row.activityType === type).sort((a, b) => a.offset - b.offset)[0];
      if (first) add(registeredAt + first.offset - start, type === "network_request" ? "Non-essential request" : "Non-essential storage write",
        [first.vendor, first.hostname, first.storageName].filter(Boolean).join(" · "), action === "reject" ? activityTone : "neutral");
    }
  }
  if (timing?.firstRequest) {
    add(timing.firstRequest.startedAtMs - start, "Request observed", timing.firstRequest.hostname ?? "After-click request retained");
  }
  if (capture) {
    const request = projection.afterActionRequests?.slice().sort((a, b) => a.startedAtMs - b.startedAtMs)[0];
    if (request && !timing?.firstRequest) add(request.startedAtMs - start, "Request observed", request.hostname ?? "After-click request retained");
    const write = capture.storageWrites.slice().sort((a, b) => a.observedAtMs - b.observedAtMs)[0];
    if (write) add(write.observedAtMs - start, "Storage write observed", [write.vendor, write.hostname].filter(Boolean).join(" · ") || "After-click storage write retained");
  }
  if ("formSnapshotCapture" in projection && projection.formSnapshotCapture) {
    const forms = projection.formSnapshotCapture;
    const reconciled = reconcilePostAcceptFormInventory(forms,projection.formCapture);
    if (reconciled) {
      const count = reconciled.inventory.forms.length + reconciled.additionalFormRefs.length;
      const capturedAtMs = reconciled.structuredFrame?.capturedAtMs ?? ("postCaptureInventory" in forms ? forms.postCaptureInventory.capturedAtMs : forms.capturedAtMs);
      if (count) add(capturedAtMs - start, "Forms captured", `${count} form${count === 1 ? "" : "s"} retained after the Accept click`);
    }
  }
  const exactCaptureEnd = timing?.observationEndedAtMs !== undefined || capture?.captureEndedAtMs !== undefined;
  if (end !== undefined) add(end - start, coverage === "complete" ? exactCaptureEnd ? "Observation end" : "Worker complete" : "Capture stopped",
    coverage === "complete" ? exactCaptureEnd ? "Retained action capture closed" : "Retained action worker completed" : "Limited capture");
  events.sort((a, b) => a.atMs - b.atMs);
  return { coverage, clockLabel: usesClickClock ? `Times from the ${label} click` : `Times from confirmed ${label}`, events };
}
