import { assessChoicePathExecution, assessConsentActionStages, postAcceptReportProjectionSchema, postRefusalReportProjectionSchema } from "@certscore/contracts";

/** Bounded public view of the existing canonical stage engine. A later terminal
 * witness never rewrites initial registration or finding eligibility. */
export function deriveChoiceConfirmationSummary(value: unknown, action: "accept" | "reject") {
  const parsed = action === "accept"
    ? postAcceptReportProjectionSchema.safeParse(value)
    : postRefusalReportProjectionSchema.safeParse(value);
  if (!parsed.success || !parsed.data.packetSha256) return undefined;
  const stages = assessConsentActionStages({ ...parsed.data,
    execution: parsed.data.execution ?? assessChoicePathExecution(parsed.data, action),
  }, "consent_action_stages.v2");
  const evidence = stages.evidenceStages;
  return {
    policyVersion: "choice_confirmation_summary.v2" as const,
    sourcePacketSha256: parsed.data.packetSha256,
    initialRegistrationStatus: parsed.data.registrationStatus,
    initialDecisionVerified: evidence.initialChoiceRegistrationSupported,
    terminalDecisionVerified: evidence.terminalChoiceStateVerified,
    notificationAcknowledged: evidence.notificationAcknowledged,
    categoryCheck: stages.categoryCheck,
    categoryDiagnostics: stages.categoryDiagnostics!,
    readDiagnostics: stages.readDiagnostics ?? null,
    receiptAvailability: stages.receiptAvailability ?? null,
    diagnosticReasons: stages.diagnosticReasons.slice(0, 24).map(reason => reason.slice(0, 160)),
    executionStages: {
      controlResolved: stages.measures.controlResolved,
      clickCompleted: stages.measures.clickCompleted,
      observationCompleted: stages.measures.observationCompleted,
    },
    phaseDiagnostics: {
      initialReasons: evidence.initialDiagnosticReasons,
      terminalReasons: evidence.terminalDiagnosticReasons,
      reasonsTruncated: parsed.data.confirmationDiagnostics && "reasonsTruncated" in parsed.data.confirmationDiagnostics
        ? parsed.data.confirmationDiagnostics.reasonsTruncated : null,
    },
  };
}

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
