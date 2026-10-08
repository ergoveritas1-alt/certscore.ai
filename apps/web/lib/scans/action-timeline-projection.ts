import { postAcceptReportProjectionSchema, postRefusalReportProjectionSchema } from "@certscore/contracts";
import { isAfterActionReportEligible } from "./after-action-report-eligibility";
import { readChoicePathExecution } from "./choice-path-execution";
import type { RuntimeObservationTimelineEvent } from "../../components/scans/runtime-observation-sections";

export type ActionTimelineProjection = {
  clockLabel: string;
  events: RuntimeObservationTimelineEvent[];
};

/** Descriptive timing from the persisted typed action projection. No findings or score effects. */
export function projectSuccessfulActionTimeline(value: unknown, assessment: unknown, action: "accept" | "reject", activityTone: "neutral" | "concern" = "neutral"): ActionTimelineProjection | null {
  if (!isAfterActionReportEligible(assessment, action)) return null;
  const parsed = action === "accept" ? postAcceptReportProjectionSchema.safeParse(value) : postRefusalReportProjectionSchema.safeParse(value);
  if (!parsed.success) return null;
  const projection = parsed.data;
  const execution = readChoicePathExecution(projection, action);
  if (!execution || !["succeeded", "succeeded_with_confirmation"].includes(execution.status)) return null;
  const completion = projection.registeredObservationCompletion;
  const capture = projection.afterActionCapture;
  if (!capture && !execution.consentConfirmed) return null;
  const start = capture?.actionDispatchedAtMs ?? completion?.startedAtMs;
  const end = capture?.captureEndedAtMs ?? completion?.completedAtMs;
  if (start === undefined || end === undefined || end < start) return null;
  const label = action === "accept" ? "Accept" : "Reject";
  const events: RuntimeObservationTimelineEvent[] = [];
  const add = (atMs: number, eventLabel: string, detail: string, tone: RuntimeObservationTimelineEvent["tone"] = "neutral") => {
    if (atMs < 0 || atMs > end - start) return;
    events.push({ at: `${Math.round(atMs / 10) / 100}s`, atMs, label: eventLabel, detail, tone });
  };
  add(0, capture ? `${label} click` : `${label} confirmed`, capture ? `The ${label} control was activated` : `The ${label} decision was confirmed`, "positive");
  // Keep one milestone per activity type, retaining its earliest observed time.
  const activities = "postAcceptActivity" in projection ? projection.postAcceptActivity.map(row => ({ ...row, offset: row.msAfterAccept }))
    : projection.postRefusalActivity.map(row => ({ ...row, offset: row.msAfterReject }));
  const registeredAt = "acceptanceRegisteredAtMs" in projection ? projection.acceptanceRegisteredAtMs
    : "refusalRegisteredAtMs" in projection ? projection.refusalRegisteredAtMs : undefined;
  if (registeredAt !== undefined) {
    for (const type of ["network_request", "storage_write"] as const) {
      const first = activities.filter(row => row.activityType === type).sort((a, b) => a.offset - b.offset)[0];
      if (first) add(registeredAt + first.offset - start, type === "network_request" ? "Non-essential request" : "Non-essential storage write",
        [first.vendor, first.hostname, first.storageName].filter(Boolean).join(" · "), action === "reject" ? activityTone : "neutral");
    }
  }
  if (capture) {
    const request = projection.afterActionRequests?.slice().sort((a, b) => a.startedAtMs - b.startedAtMs)[0];
    if (request) add(request.startedAtMs - start, "Request observed", request.hostname ?? "After-click request retained");
    const write = capture.storageWrites.slice().sort((a, b) => a.observedAtMs - b.observedAtMs)[0];
    if (write) add(write.observedAtMs - start, "Storage write observed", [write.vendor, write.hostname].filter(Boolean).join(" · ") || "After-click storage write retained");
  }
  if ("formSnapshotCapture" in projection && projection.formSnapshotCapture) {
    const forms = projection.formSnapshotCapture;
    const inventory = "postCaptureInventory" in forms ? forms.postCaptureInventory : { capturedAtMs: forms.capturedAtMs, inventory: forms.inventory };
    if (inventory.inventory.forms.length) add(inventory.capturedAtMs - start, "Forms captured", `${inventory.inventory.forms.length} form${inventory.inventory.forms.length === 1 ? "" : "s"} retained after the Accept click`);
  }
  add(end - start, "Observation end", "Retained action capture closed");
  events.sort((a, b) => a.atMs - b.atMs);
  return { clockLabel: capture ? `Times from the ${label} click` : `Times from confirmed ${label}`, events };
}
