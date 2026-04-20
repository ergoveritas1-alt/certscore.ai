import { SCAN_EVENT_TYPES } from "../constants/queue";
import type {
  SignalEnrichmentWorkflowStage,
  SignalEnrichmentWorkflowStageStatus,
  SignalEnrichmentWorkflowState
} from "../types/scan-signal-workflow";

type WorkflowEventRecord = {
  createdAt: string;
  eventType: string;
};

type WorkflowTimestampMap = {
  completedAt: string | null;
  startedAt: string | null;
};

function diffMs(startedAt: string | null, completedAt: string | null) {
  if (!startedAt || !completedAt) {
    return null;
  }

  const start = Date.parse(startedAt);
  const end = Date.parse(completedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return null;
  }

  return end - start;
}

function getLatestEventTimestamp(events: WorkflowEventRecord[], eventTypes: string[]) {
  const matches = events
    .filter((event) => eventTypes.includes(event.eventType))
    .map((event) => event.createdAt)
    .sort((left, right) => left.localeCompare(right));

  return matches.at(-1) ?? null;
}

function getEarliestEventTimestamp(events: WorkflowEventRecord[], eventTypes: string[]) {
  const matches = events
    .filter((event) => eventTypes.includes(event.eventType))
    .map((event) => event.createdAt)
    .sort((left, right) => left.localeCompare(right));

  return matches[0] ?? null;
}

function deriveLifecycleTimestamps(input: {
  completedEventTypes: string[];
  events: WorkflowEventRecord[];
  failedEventTypes?: string[];
  startedEventTypes: string[];
}): WorkflowTimestampMap & { failedAt: string | null } {
  return {
    completedAt: getLatestEventTimestamp(input.events, input.completedEventTypes),
    failedAt: input.failedEventTypes ? getLatestEventTimestamp(input.events, input.failedEventTypes) : null,
    startedAt: getEarliestEventTimestamp(input.events, input.startedEventTypes)
  };
}

function deriveStageStatus(input: {
  blocked?: boolean;
  completedAt: string | null;
  failedAt?: string | null;
  startedAt: string | null;
}): SignalEnrichmentWorkflowStageStatus {
  if (input.failedAt) {
    return "failed";
  }

  if (input.completedAt) {
    return "completed";
  }

  if (input.startedAt) {
    return "running";
  }

  return input.blocked ? "blocked" : "queued";
}

export function deriveSignalEnrichmentWorkflowState(input: {
  documentSourceCount?: number;
  events: WorkflowEventRecord[];
  freshExtractionCount?: number;
  findingsCount: number;
  mergedSignalCount: number;
  nanoSignalCount: number;
  policyDocumentCount: number;
  reusedExtractionCount?: number;
  skippedExtractionCount?: number;
  skippedExtractionReasons?: Record<string, number>;
  scanCompletedAt?: string | null;
  scanStatus: string | null;
  scannerSignalCount: number;
}) : SignalEnrichmentWorkflowState {
  const scannerCompletedAt =
    getLatestEventTimestamp(input.events, [SCAN_EVENT_TYPES.fullCompleted, SCAN_EVENT_TYPES.previewCompleted]) ??
    input.scanCompletedAt ??
    null;
  const scannerStartedAt =
    getEarliestEventTimestamp(input.events, [SCAN_EVENT_TYPES.fullStarted, SCAN_EVENT_TYPES.previewStarted]) ??
    null;
  const scannerFailedAt = getLatestEventTimestamp(input.events, [SCAN_EVENT_TYPES.fullFailed, SCAN_EVENT_TYPES.previewFailed]);

  const nanoTimestamps = deriveLifecycleTimestamps({
    completedEventTypes: [SCAN_EVENT_TYPES.nanoSignalEnrichmentCompleted],
    events: input.events,
    failedEventTypes: [SCAN_EVENT_TYPES.nanoSignalEnrichmentFailed],
    startedEventTypes: [SCAN_EVENT_TYPES.nanoSignalEnrichmentStarted]
  });
  const docRetrievalTimestamps = deriveLifecycleTimestamps({
    completedEventTypes: [SCAN_EVENT_TYPES.nanoDocRetrievalCompleted],
    events: input.events,
    failedEventTypes: [SCAN_EVENT_TYPES.nanoDocRetrievalFailed],
    startedEventTypes: [SCAN_EVENT_TYPES.nanoDocRetrievalStarted]
  });
  const mergeTimestamps = deriveLifecycleTimestamps({
    completedEventTypes: [SCAN_EVENT_TYPES.signalMergeCompleted],
    events: input.events,
    failedEventTypes: [SCAN_EVENT_TYPES.signalMergeFailed],
    startedEventTypes: [SCAN_EVENT_TYPES.signalMergeStarted]
  });
  const findingsTimestamps = deriveLifecycleTimestamps({
    completedEventTypes: [SCAN_EVENT_TYPES.unifiedFindingsDerivedCompleted],
    events: input.events,
    failedEventTypes: [SCAN_EVENT_TYPES.unifiedFindingsDerivedFailed],
    startedEventTypes: [SCAN_EVENT_TYPES.unifiedFindingsDerivedStarted]
  });

  const actualMode =
    (docRetrievalTimestamps.startedAt && scannerCompletedAt && docRetrievalTimestamps.startedAt < scannerCompletedAt) ||
    (nanoTimestamps.startedAt && scannerCompletedAt && nanoTimestamps.startedAt < scannerCompletedAt)
      ? "parallelized"
      : "serial_bridge";

  const scannerStatus =
    input.scanStatus === "failed"
      ? "failed"
      : input.scanStatus === "completed"
        ? "completed"
        : input.scanStatus === "running" || input.scanStatus === "processing"
          ? "running"
          : "queued";
  const hasPersistedMergedSignals = input.mergedSignalCount > 0;
  const hasPersistedFindings = input.findingsCount > 0;
  const docRetrievalRecoveredFromNanoCompletion =
    !docRetrievalTimestamps.startedAt &&
    !docRetrievalTimestamps.completedAt &&
    !docRetrievalTimestamps.failedAt &&
    nanoTimestamps.completedAt !== null;
  const docRetrievalCompletedAt = docRetrievalRecoveredFromNanoCompletion
    ? nanoTimestamps.completedAt
    : docRetrievalTimestamps.completedAt;

  const docRetrievalStatus = deriveStageStatus({
    completedAt: docRetrievalCompletedAt,
    failedAt: docRetrievalTimestamps.failedAt,
    startedAt: docRetrievalTimestamps.startedAt
  });
  const nanoStatus = deriveStageStatus({
    blocked:
      (actualMode === "serial_bridge" && scannerStatus !== "completed" && scannerStatus !== "failed") ||
      docRetrievalStatus === "running",
    completedAt: nanoTimestamps.completedAt,
    failedAt: nanoTimestamps.failedAt,
    startedAt: nanoTimestamps.startedAt
  });
  const mergeLifecycleStatus = deriveStageStatus({
    blocked: nanoStatus !== "completed" || scannerStatus !== "completed",
    completedAt: mergeTimestamps.completedAt,
    failedAt: mergeTimestamps.failedAt,
    startedAt: mergeTimestamps.startedAt
  });
  const mergeStatus =
    mergeLifecycleStatus === "failed"
      ? "failed"
      : mergeLifecycleStatus === "completed" || (scannerStatus === "completed" && hasPersistedMergedSignals)
        ? "completed"
        : mergeLifecycleStatus;
  const findingsLifecycleStatus = deriveStageStatus({
    blocked: mergeStatus !== "completed",
    completedAt: findingsTimestamps.completedAt,
    failedAt: findingsTimestamps.failedAt,
    startedAt: findingsTimestamps.startedAt
  });
  const findingsStatus =
    findingsLifecycleStatus === "failed"
      ? "failed"
      : findingsLifecycleStatus === "completed" || (mergeStatus === "completed" && hasPersistedFindings)
        ? "completed"
        : findingsLifecycleStatus;

  const stages: SignalEnrichmentWorkflowStage[] = [
    {
      completedAt: scannerStatus === "completed" ? scannerCompletedAt : null,
      dependsOn: [],
      description: "WS01 scanner evidence collection and direct scanner-owned signal population.",
      durationMs: diffMs(scannerStartedAt, scannerStatus === "completed" ? scannerCompletedAt : null),
      id: "scanner",
      itemCount: input.scannerSignalCount,
      label: "Scanner",
      startedAt: scannerStartedAt,
      status: scannerStatus,
    },
    {
      completedAt: docRetrievalCompletedAt,
      dependsOn: [],
      description: "Nano-owned legal document retrieval and raw document persistence.",
      durationMs: diffMs(docRetrievalTimestamps.startedAt, docRetrievalCompletedAt),
      id: "nano_doc_retrieval",
      itemCount: input.documentSourceCount ?? input.policyDocumentCount,
      label: "Nano Doc Retrieval",
      startedAt: docRetrievalTimestamps.startedAt,
      status: docRetrievalStatus
    },
    {
      completedAt: nanoTimestamps.completedAt,
      dependsOn: ["nano_doc_retrieval"],
      description: "Nano-owned document and disclosure signal enrichment.",
      durationMs: diffMs(nanoTimestamps.startedAt, nanoTimestamps.completedAt),
      id: "nano_doc_signals",
      itemCount: input.nanoSignalCount > 0 ? input.nanoSignalCount : input.policyDocumentCount,
      label: "Nano Doc Signals",
      startedAt: nanoTimestamps.startedAt,
      status: nanoStatus
    },
    {
      completedAt: mergeTimestamps.completedAt,
      dependsOn: ["scanner", "nano_doc_signals"],
      description: "Canonical merge of scanner, nano, and validation populations into merged signals.",
      durationMs: diffMs(mergeTimestamps.startedAt, mergeTimestamps.completedAt),
      id: "signal_merge",
      itemCount: input.mergedSignalCount,
      label: "Merged Signals",
      startedAt: mergeTimestamps.startedAt,
      status: mergeStatus
    },
    {
      completedAt: findingsTimestamps.completedAt,
      dependsOn: ["signal_merge"],
      description: "Concern and unified-finding derivation from the merged signal set.",
      durationMs: diffMs(findingsTimestamps.startedAt, findingsTimestamps.completedAt),
      id: "unified_findings",
      itemCount: input.findingsCount,
      label: "Unified Findings",
      startedAt: findingsTimestamps.startedAt,
      status: findingsStatus
    }
  ];

  return {
    actualMode,
    extractionMetrics: {
      freshExtractions: input.freshExtractionCount ?? 0,
      reusedExtractions: input.reusedExtractionCount ?? 0,
      skippedExtractions: input.skippedExtractionCount ?? 0,
      skippedByReason: input.skippedExtractionReasons ?? {}
    },
    findingsReady: findingsStatus === "completed" || hasPersistedFindings,
    mergedSignalsReady: mergeStatus === "completed" || hasPersistedMergedSignals,
    timings: {
      scannerDurationMs: diffMs(scannerStartedAt, scannerCompletedAt),
      nanoDocRetrievalDurationMs: diffMs(docRetrievalTimestamps.startedAt, docRetrievalTimestamps.completedAt),
      nanoDocSignalsDurationMs: diffMs(nanoTimestamps.startedAt, nanoTimestamps.completedAt),
      signalMergeDurationMs: diffMs(mergeTimestamps.startedAt, mergeTimestamps.completedAt),
      unifiedFindingsDurationMs: diffMs(findingsTimestamps.startedAt, findingsTimestamps.completedAt),
      timeToMergedSignalsMs: diffMs(scannerStartedAt, mergeTimestamps.completedAt),
      timeToFindingsMs: diffMs(scannerStartedAt, findingsTimestamps.completedAt)
    },
    preferredMode: "parallel_evidence_collection",
    stages
  };
}
