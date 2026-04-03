export type SignalEnrichmentWorkflowMode = "serial_bridge" | "parallelized";

export type SignalEnrichmentWorkflowStageId =
  | "scanner"
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
  id: SignalEnrichmentWorkflowStageId;
  itemCount: number | null;
  label: string;
  startedAt: string | null;
  status: SignalEnrichmentWorkflowStageStatus;
};

export type SignalEnrichmentWorkflowState = {
  actualMode: SignalEnrichmentWorkflowMode;
  findingsReady: boolean;
  mergedSignalsReady: boolean;
  preferredMode: "parallel_evidence_collection";
  stages: SignalEnrichmentWorkflowStage[];
};
