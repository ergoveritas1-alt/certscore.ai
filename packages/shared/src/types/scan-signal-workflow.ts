export type SignalEnrichmentWorkflowMode = "serial_bridge" | "parallelized";

export type SignalEnrichmentWorkflowStageId =
  | "scanner"
  | "nano_doc_retrieval"
  | "nano_doc_signals"
  | "signal_merge"
  | "unified_findings";

export type SignalEnrichmentWorkflowStageStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "blocked";

export type SignalEnrichmentWorkflowStage = {
  completedAt: string | null;
  dependsOn: SignalEnrichmentWorkflowStageId[];
  description: string;
  durationMs: number | null;
  id: SignalEnrichmentWorkflowStageId;
  itemCount: number | null;
  label: string;
  startedAt: string | null;
  status: SignalEnrichmentWorkflowStageStatus;
  waitMs?: number | null;
};

export type SignalEnrichmentWorkflowState = {
  actualMode: SignalEnrichmentWorkflowMode;
  extractionMetrics: {
    freshExtractions: number;
    reusedExtractions: number;
    skippedExtractions: number;
    skippedByReason: Record<string, number>;
  };
  findingsReady: boolean;
  mergedSignalsReady: boolean;
  timings: {
    nanoDocRetrievalDurationMs: number | null;
    nanoDocSignalsDurationMs: number | null;
    queuePickupLatencyMs: number | null;
    signalMergeDurationMs: number | null;
    scannerDurationMs: number | null;
    scannerRuntimeMs: number | null;
    projectionRecoveryLatencyMs: number | null;
    projectionRecoveryMode: string | null;
    timeToFinalReportMs: number | null;
    timeToFirstUsefulReportMs: number | null;
    unifiedFindingsDurationMs: number | null;
    timeToMergedSignalsMs: number | null;
    timeToFindingsMs: number | null;
  };
  preferredMode: "parallel_evidence_collection";
  stages: SignalEnrichmentWorkflowStage[];
};
