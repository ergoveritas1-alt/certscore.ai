import type { SignalEnrichmentWorkflowState } from "@website-signal-risk-scanner/shared";

type ScanAutoRefreshEvent = {
  eventType: string;
};

export function hasPendingPostCompletionFindingWork(input: {
  reportFindingsDerived?: boolean;
  signalEnrichmentWorkflow: SignalEnrichmentWorkflowState;
  status: string;
}) {
  if (input.reportFindingsDerived) {
    return false;
  }

  const unifiedFindingsStage =
    input.signalEnrichmentWorkflow.stages.find((stage) => stage.id === "unified_findings") ?? null;

  return (
    input.status === "completed" &&
    !input.signalEnrichmentWorkflow.findingsReady &&
    unifiedFindingsStage?.status !== "failed"
  );
}

export function hasPendingBrowserExtensionNormalization(input: {
  events: ScanAutoRefreshEvent[];
  scanType: string;
  status: string;
}) {
  if (input.scanType !== "browser_extension" || input.status !== "completed") {
    return false;
  }

  const eventTypes = new Set(input.events.map((event) => event.eventType));

  return (
    eventTypes.has("browser_extension.normalization_requested") &&
    !eventTypes.has("browser_extension.observed_signals_ingested") &&
    !eventTypes.has("browser_extension.normalization_failed")
  );
}
