import type { SignalEnrichmentWorkflowState } from "@website-signal-risk-scanner/shared";

export function hasPendingPostCompletionFindingWork(input: {
  signalEnrichmentWorkflow: SignalEnrichmentWorkflowState;
  status: string;
}) {
  const unifiedFindingsStage =
    input.signalEnrichmentWorkflow.stages.find((stage) => stage.id === "unified_findings") ?? null;

  return (
    input.status === "completed" &&
    !input.signalEnrichmentWorkflow.findingsReady &&
    unifiedFindingsStage?.status !== "failed"
  );
}
