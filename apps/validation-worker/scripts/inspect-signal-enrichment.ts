import { createAdminClient } from "@website-signal-risk-scanner/db";
import { deriveSignalEnrichmentWorkflowState } from "@website-signal-risk-scanner/shared";

type ScanEventRow = {
  created_at: string;
  event_type: string;
  id: string;
  message: string | null;
  metadata_json: Record<string, unknown> | null;
};

type ScanSignalRow = {
  population_source: string | null;
  signal_key: string;
};

function isMissingOptionalTableError(error: { code?: string | null; message?: string | null } | null | undefined) {
  const message = error?.message ?? "";
  return error?.code === "PGRST205" || message.includes("schema cache") || message.includes("Could not find the table");
}

function isMissingColumnError(error: { code?: string | null; message?: string | null } | null | undefined, column: string) {
  const message = error?.message ?? "";
  return (
    message.includes(`Could not find the '${column}' column`) ||
    message.includes(`column "${column}"`) ||
    message.includes(`column ${column} does not exist`) ||
    (message.includes(column) && message.includes("does not exist"))
  );
}

function getArgValue(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return null;
  }

  return process.argv[index + 1] ?? null;
}

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function countBy<T>(values: T[], keyFn: (value: T) => string) {
  const counts = new Map<string, number>();

  for (const value of values) {
    const key = keyFn(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function printHeader(label: string) {
  console.log(`\n${label}`);
}

function formatDurationMs(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return "—";
  }

  if (value < 1000) {
    return `${value}ms`;
  }

  const totalSeconds = Math.round(value / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts: string[] = [];

  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0) {
    parts.push(`${minutes}m`);
  }
  if (seconds > 0 || parts.length === 0) {
    parts.push(`${seconds}s`);
  }

  return parts.join(" ");
}

function getRecordNumber(record: unknown, key: string) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return null;
  }

  const value = (record as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getDocumentSourceStatusCount(rows: Array<Record<string, unknown>>, status: string) {
  return rows.filter((row) => {
    const value = row.source_status;
    return typeof value === "string" ? value === status : false;
  }).length;
}

function getExtractionReuseCount(rows: Array<Record<string, unknown>>) {
  return rows.filter((row) => {
    const metadata = row.metadata_json;
    return Boolean(
      metadata &&
      typeof metadata === "object" &&
      !Array.isArray(metadata) &&
      typeof (metadata as Record<string, unknown>).extraction_reuse_reason === "string"
    );
  }).length;
}

async function main() {
  const scanId = getArgValue("--scan-id");
  const json = hasFlag("--json");

  if (!scanId) {
    throw new Error("Provide --scan-id.");
  }

  const supabase = createAdminClient();
  const [
    { data: scan, error: scanError },
    { data: events, error: eventsError },
    { data: documentSources, error: documentSourcesError },
    signalResult,
    findingsResult
  ] = await Promise.all([
    supabase
      .from("scans")
      .select("id, status, created_at, started_at, completed_at, error_message")
      .eq("id", scanId)
      .maybeSingle(),
    supabase
      .from("scan_events")
      .select("id, event_type, message, metadata_json, created_at")
      .eq("scan_id", scanId)
      .order("created_at", { ascending: true }),
    supabase
      .from("scan_document_sources")
      .select("id, source, source_status, document_type, extraction_status, semantic_confidence, source_url, canonical_url, created_at, metadata_json")
      .eq("scan_id", scanId)
      .order("created_at", { ascending: true }),
    supabase
      .from("scan_signals")
      .select("signal_key, population_source")
      .eq("scan_id", scanId)
      .order("signal_key", { ascending: true }),
    supabase
      .from("validation_run_findings")
      .select("id")
      .eq("scan_id", scanId)
  ]);

  if (scanError) {
    throw new Error(`Failed to load scan ${scanId}: ${scanError.message}`);
  }
  if (eventsError) {
    throw new Error(`Failed to load scan events ${scanId}: ${eventsError.message}`);
  }
  if (documentSourcesError && !isMissingOptionalTableError(documentSourcesError)) {
    throw new Error(`Failed to load document sources ${scanId}: ${documentSourcesError.message}`);
  }
  let signals = signalResult.data;
  let signalsError = signalResult.error;
  if (signalsError && isMissingColumnError(signalsError, "population_source")) {
    const fallback = await supabase
      .from("scan_signals")
      .select("signal_key")
      .eq("scan_id", scanId)
      .order("signal_key", { ascending: true });
    signals = (fallback.data ?? []).map((row) => ({
      ...row,
      population_source: null
    }));
    signalsError = fallback.error;
  }

  if (signalsError) {
    throw new Error(`Failed to load signals ${scanId}: ${signalsError.message}`);
  }
  let findings = findingsResult.data;
  let findingsError = findingsResult.error;
  if (findingsError && isMissingColumnError(findingsError, "scan_id")) {
    const { data: runs, error: runsError } = await supabase
      .from("validation_runs")
      .select("id")
      .eq("scan_id", scanId);
    if (runsError) {
      throw new Error(`Failed to load validation runs ${scanId}: ${runsError.message}`);
    }

    const runIds = (runs ?? [])
      .map((row) => (row && typeof row === "object" ? (row as { id?: unknown }).id : null))
      .filter((value): value is string => typeof value === "string");

    if (runIds.length === 0) {
      findings = [];
      findingsError = null;
    } else {
      const fallback = await supabase
        .from("validation_run_findings")
        .select("id")
        .in("validation_run_id", runIds);
      findings = fallback.data;
      findingsError = fallback.error;
    }
  }

  if (findingsError) {
    throw new Error(`Failed to load validation findings ${scanId}: ${findingsError.message}`);
  }

  const eventRows = ((events ?? []) as ScanEventRow[]).map((event) => ({
    createdAt: event.created_at,
    eventType: event.event_type
  }));
  const signalRows = (signals ?? []) as ScanSignalRow[];
  const documentRows = (documentSourcesError ? [] : documentSources ?? []) as Array<Record<string, unknown>>;
  const findingRows = (findings ?? []) as Array<Record<string, unknown>>;
  const readyDocumentSourceCount = getDocumentSourceStatusCount(documentRows, "ready");
  const rejectedDocumentSourceCount = getDocumentSourceStatusCount(documentRows, "rejected");
  const reusedExtractionCount = getExtractionReuseCount(documentRows);
  const freshExtractionCount = documentRows.filter((row) => {
    const extractionStatus = typeof row.extraction_status === "string" ? row.extraction_status : null;
    return extractionStatus === "ready";
  }).length - reusedExtractionCount;

  const scannerSignalCount = signalRows.filter((row) => !row.population_source || row.population_source === "scanner").length;
  const nanoSignalCount = signalRows.filter((row) => row.population_source === "nano").length;
  const validationSignalCount = signalRows.filter((row) => row.population_source === "validation").length;
  const workflow = deriveSignalEnrichmentWorkflowState({
    documentSourceCount: readyDocumentSourceCount,
    events: eventRows,
    freshExtractionCount: Math.max(0, freshExtractionCount),
    findingsCount: findingRows.length,
    mergedSignalCount: signalRows.length,
    nanoSignalCount,
    policyDocumentCount: documentRows.length,
    reusedExtractionCount,
    scanCompletedAt: typeof scan?.completed_at === "string" ? scan.completed_at : null,
    scanStatus: typeof scan?.status === "string" ? scan.status : null,
    scannerSignalCount
  });

  const payload = {
    scan: {
      completedAt: scan?.completed_at ?? null,
      createdAt: scan?.created_at ?? null,
      errorMessage: scan?.error_message ?? null,
      id: scan?.id ?? scanId,
      startedAt: scan?.started_at ?? null,
      status: scan?.status ?? null
    },
    workflow,
    counts: {
      documentSourcesAvailable: !documentSourcesError,
      signalSourceColumnAvailable: !(signalResult.error && isMissingColumnError(signalResult.error, "population_source")),
      documentSources: readyDocumentSourceCount,
      rejectedDocumentSources: rejectedDocumentSourceCount,
      totalDocumentSourceRows: documentRows.length,
      findings: findingRows.length,
      nanoSignals: nanoSignalCount,
      scannerSignals: scannerSignalCount,
      totalSignals: signalRows.length,
      validationSignals: validationSignalCount
    },
    extractionCounts: {
      fresh: Math.max(0, freshExtractionCount),
      reused: reusedExtractionCount
    },
    documentSourcesByExtractionStatus: countBy(documentRows, (row) => String(row.extraction_status ?? "unknown")),
    documentSourcesByType: countBy(documentRows, (row) => String(row.document_type ?? "unknown")),
    eventCounts: countBy(eventRows, (row) => row.eventType),
    signalCountsBySource: countBy(signalRows, (row) => String(row.population_source ?? "scanner")),
    nanoDocRetrievalDiagnostics: (() => {
      const event = [...((events ?? []) as ScanEventRow[])].reverse().find((row) => row.event_type === "signals.nano_doc_retrieval_completed");
      const metadata = event?.metadata_json ?? null;
      return metadata
        ? {
            candidateCount: getRecordNumber(metadata, "candidateCount"),
            documentSourceCount: getRecordNumber(metadata, "documentSourceCount"),
            duplicateCount: getRecordNumber(metadata, "duplicateCount"),
            errorCount: getRecordNumber(metadata, "errorCount"),
            insufficientCount: getRecordNumber(metadata, "insufficientCount"),
            intermediaryCount: getRecordNumber(metadata, "intermediaryCount"),
            nonOkCount: getRecordNumber(metadata, "nonOkCount"),
            rejectedCount: getRecordNumber(metadata, "rejectedCount")
          }
        : null;
    })()
  };

  if (json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  printHeader("Scan");
  console.log(`id: ${payload.scan.id}`);
  console.log(`status: ${payload.scan.status}`);
  console.log(`createdAt: ${payload.scan.createdAt}`);
  console.log(`startedAt: ${payload.scan.startedAt}`);
  console.log(`completedAt: ${payload.scan.completedAt}`);
  console.log(`errorMessage: ${payload.scan.errorMessage}`);

  printHeader("Workflow");
  console.log(`preferredMode: ${payload.workflow.preferredMode}`);
  console.log(`actualMode: ${payload.workflow.actualMode}`);
  console.log(`mergedSignalsReady: ${payload.workflow.mergedSignalsReady}`);
  console.log(`findingsReady: ${payload.workflow.findingsReady}`);
  console.log(
    `timings: scanner=${formatDurationMs(payload.workflow.timings.scannerDurationMs)} | docRetrieval=${formatDurationMs(payload.workflow.timings.nanoDocRetrievalDurationMs)} | docSignals=${formatDurationMs(payload.workflow.timings.nanoDocSignalsDurationMs)} | merge=${formatDurationMs(payload.workflow.timings.signalMergeDurationMs)} | findings=${formatDurationMs(payload.workflow.timings.unifiedFindingsDurationMs)}`
  );
  console.log(
    `timeToReady: mergedSignals=${formatDurationMs(payload.workflow.timings.timeToMergedSignalsMs)} | findings=${formatDurationMs(payload.workflow.timings.timeToFindingsMs)}`
  );
  console.log(
    `extractions: fresh=${payload.workflow.extractionMetrics.freshExtractions} | reused=${payload.workflow.extractionMetrics.reusedExtractions}`
  );
  for (const stage of payload.workflow.stages) {
    console.log(
      `- ${stage.id}: ${stage.status} | items=${stage.itemCount} | duration=${formatDurationMs(stage.durationMs)} | startedAt=${stage.startedAt ?? "null"} | completedAt=${stage.completedAt ?? "null"}`
    );
  }

  printHeader("Counts");
  console.log(JSON.stringify(payload.counts, null, 2));

  if (documentSourcesError) {
    printHeader("Document Sources");
    console.log("scan_document_sources is unavailable in this environment; counts are reported as 0.");
  }

  printHeader("Document Sources By Type");
  console.log(JSON.stringify(payload.documentSourcesByType, null, 2));

  printHeader("Document Sources By Extraction Status");
  console.log(JSON.stringify(payload.documentSourcesByExtractionStatus, null, 2));

  if (payload.nanoDocRetrievalDiagnostics) {
    printHeader("Nano Doc Retrieval Diagnostics");
    console.log(JSON.stringify(payload.nanoDocRetrievalDiagnostics, null, 2));
  }

  printHeader("Document Sources By Status");
  console.log(
    JSON.stringify(
      {
        ready: readyDocumentSourceCount,
        rejected: rejectedDocumentSourceCount,
        total: documentRows.length
      },
      null,
      2
    )
  );

  printHeader("Signal Counts By Source");
  console.log(JSON.stringify(payload.signalCountsBySource, null, 2));

  printHeader("Event Counts");
  console.log(JSON.stringify(payload.eventCounts, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
