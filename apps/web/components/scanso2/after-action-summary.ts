import { afterActionCaptureSchema } from "@certscore/contracts";

/** Display already-retained after-click facts without treating them as granted consent. */
export function afterClickCoverage(projection: Record<string, unknown>, action: "accept" | "reject"): "complete" | "partial" | undefined {
  const parsed = afterActionCaptureSchema.safeParse(projection.afterActionCapture);
  if (!parsed.success || parsed.data.action !== action || parsed.data.activationStatus !== "completed") return undefined;
  return parsed.data.stopReason === "window_elapsed" && parsed.data.requestsDropped === 0 ? "complete" : "partial";
}

export function afterClickSummary(projection: Record<string, unknown>, action: "accept" | "reject"): string {
  const parsed = afterActionCaptureSchema.safeParse(projection.afterActionCapture);
  if (!parsed.success || parsed.data.action !== action || parsed.data.activationStatus !== "completed") return "";
  const capture = parsed.data;
  const seconds = Math.round((capture.captureEndedAtMs - capture.actionDispatchedAtMs) / 10) / 100;
  const writes = capture.storageWrites;
  const names = [...new Set(writes.map(write => write.name))].slice(0, 3);
  const requestCount = capture.requestIds.length;
  return ` During ${seconds}s of after-click observation, ${requestCount} request${requestCount === 1 ? " was" : "s were"} retained and ${writes.length} main-document storage write${writes.length === 1 ? " was" : "s were"} observed${names.length ? ` (${names.join(", ")})` : ""}.` +
    (capture.storageSnapshotRetained ? " A post-click storage snapshot was retained." : " No post-click storage snapshot was retained.") +
    (capture.stopReason !== "window_elapsed" ? " Capture stopped early; coverage is partial." : "") +
    (capture.requestsDropped > 0 ? ` ${capture.requestsDropped} requests were dropped; retained counts are partial.` : "") +
    " Request totals include all retained after-click requests; tracking classifications are shown in the findings.";
}

/** Presentation of persisted observations, independent of decision eligibility. */
export function afterClickCoverageLabel(coverage: "complete" | "partial" | undefined): string {
  return coverage === "complete" ? "Observation recorded" : coverage === "partial" ? "Partial observation" : "Limited";
}
