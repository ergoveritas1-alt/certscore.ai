import { postAcceptReportProjectionSchema, postRefusalReportProjectionSchema } from "@certscore/contracts";

/** Read only the validated persisted projection; never derive findings or registration. */
export function deriveAfterActionSummary(value: unknown, action: "accept" | "reject") {
  const parsed = action === "accept"
    ? postAcceptReportProjectionSchema.safeParse(value)
    : postRefusalReportProjectionSchema.safeParse(value);
  if (!parsed.success || !parsed.data.packetSha256 || !parsed.data.afterActionCapture) return undefined;
  const capture = parsed.data.afterActionCapture;
  return {
    policyVersion: capture.policyVersion,
    action: capture.action,
    activationStatus: capture.activationStatus,
    stopReason: capture.stopReason,
    requestsDropped: capture.requestsDropped,
    requestCount: capture.requestIds.length,
    storageWriteCount: capture.storageWrites.length,
    storageSnapshotRetained: capture.storageSnapshotRetained,
  };
}

export function afterActionInterpretation(summary: ReturnType<typeof deriveAfterActionSummary>) {
  if (!summary) return undefined;
  const label = summary.action === "accept" ? "Accept" : "Reject";
  if (summary.activationStatus !== "completed") return `${label} activation was uncertain; retained capture does not establish a completed click.`;
  const capture = summary.stopReason === "window_elapsed" && summary.requestsDropped === 0
    ? "The bounded after-click window completed."
    : "After-click capture was limited.";
  return `${label} was clicked. ${summary.requestCount} requests and ${summary.storageWriteCount} storage writes were retained afterward. ${capture} Consent registration is reported separately.`;
}
