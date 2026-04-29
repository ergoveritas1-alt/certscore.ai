import { query, queryOne } from "@website-signal-risk-scanner/db";
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

type EventSample = {
  createdAt: string;
  eventType: string;
  message: string | null;
  metadataPreview: unknown;
  metadataBytes: number;
};

type EventTypeDiagnostic = {
  count: number;
  firstAt: string;
  lastAt: string;
  maxMetadataBytes: number;
  sampleMessages: string[];
  sampleMetadataKeys: string[];
  totalMetadataBytes: number;
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

function parsePositiveInt(value: string | null, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
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

function summarizeString(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1))}…`;
}

function buildMetadataPreview(value: unknown, maxLength: number): unknown {
  if (value == null) {
    return value;
  }

  if (typeof value === "string") {
    return summarizeString(value, maxLength);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 5).map((entry) => buildMetadataPreview(entry, maxLength));
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 10);
    return Object.fromEntries(entries.map(([key, entryValue]) => [key, buildMetadataPreview(entryValue, maxLength)]));
  }

  return String(value);
}

function getMetadataBytes(value: unknown) {
  if (value == null) {
    return 0;
  }

  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    return Buffer.byteLength(String(value), "utf8");
  }
}

function buildEventSamples(events: ScanEventRow[], sampleLimit: number, metadataPreviewLength: number) {
  const selectedEventTypes = new Set([
    "signals.nano_doc_retrieval_started",
    "signals.nano_doc_retrieval_completed",
    "signals.nano_doc_enrichment_started",
    "signals.nano_doc_enrichment_completed",
    "signals.merge_started",
    "signals.merge_completed",
    "findings.unified_derivation_started",
    "findings.unified_derivation_completed"
  ]);

  const samples: EventSample[] = [];
  const counts = new Map<string, number>();

  for (const event of events) {
    const currentCount = counts.get(event.event_type) ?? 0;
    if (!selectedEventTypes.has(event.event_type) || currentCount >= sampleLimit) {
      continue;
    }

    samples.push({
      createdAt: event.created_at,
      eventType: event.event_type,
      message: event.message ? summarizeString(event.message, 180) : null,
      metadataPreview: buildMetadataPreview(event.metadata_json, metadataPreviewLength),
      metadataBytes: getMetadataBytes(event.metadata_json)
    });
    counts.set(event.event_type, currentCount + 1);
  }

  return samples;
}

function buildEventTypeDiagnostics(events: ScanEventRow[]) {
  const diagnostics = new Map<string, EventTypeDiagnostic>();

  for (const event of events) {
    const metadataBytes = getMetadataBytes(event.metadata_json);
    const existing = diagnostics.get(event.event_type);
    const sampleMessages = existing?.sampleMessages ?? [];
    const sampleMetadataKeys = existing?.sampleMetadataKeys ?? [];
    const metadataKeys =
      event.metadata_json && typeof event.metadata_json === "object" && !Array.isArray(event.metadata_json)
        ? Object.keys(event.metadata_json as Record<string, unknown>)
        : [];

    if (event.message) {
      const candidate = summarizeString(event.message, 120);
      if (!sampleMessages.includes(candidate) && sampleMessages.length < 3) {
        sampleMessages.push(candidate);
      }
    }

    for (const key of metadataKeys) {
      if (!sampleMetadataKeys.includes(key) && sampleMetadataKeys.length < 8) {
        sampleMetadataKeys.push(key);
      }
    }

    diagnostics.set(event.event_type, {
      count: (existing?.count ?? 0) + 1,
      firstAt: existing?.firstAt ?? event.created_at,
      lastAt: event.created_at,
      maxMetadataBytes: Math.max(existing?.maxMetadataBytes ?? 0, metadataBytes),
      sampleMessages,
      sampleMetadataKeys,
      totalMetadataBytes: (existing?.totalMetadataBytes ?? 0) + metadataBytes
    });
  }

  return [...diagnostics.entries()]
    .map(([eventType, diagnostic]) => ({
      eventType,
      ...diagnostic
    }))
    .sort((left, right) => right.totalMetadataBytes - left.totalMetadataBytes || right.count - left.count || left.eventType.localeCompare(right.eventType));
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

function getExtractionSkipCounts(rows: Array<Record<string, unknown>>) {
  const counts = new Map<string, number>();

  for (const row of rows) {
    const extractionStatus = typeof row.extraction_status === "string" ? row.extraction_status : null;
    const metadata = row.metadata_json;
    const reason =
      extractionStatus === "insufficient" &&
      metadata &&
      typeof metadata === "object" &&
      !Array.isArray(metadata) &&
      typeof (metadata as Record<string, unknown>).extraction_skip_reason === "string"
        ? ((metadata as Record<string, unknown>).extraction_skip_reason as string)
        : null;

    if (!reason) {
      continue;
    }

    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }

  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

async function main() {
  const scanId = getArgValue("--scan-id");
  const eventsOnly = hasFlag("--events-only");
  const json = hasFlag("--json");
  const summary = hasFlag("--summary");
  const sampleLimit = parsePositiveInt(getArgValue("--sample-limit"), 2);

  if (!scanId) {
    throw new Error("Provide --scan-id.");
  }

  const documentSourcesResult = await query<Record<string, unknown>>(
    `
      select id, source, source_status, document_type, extraction_status, semantic_confidence, source_url, canonical_url, created_at, metadata_json
      from scan_document_sources
      where scan_id = $1
      order by created_at asc
    `,
    [scanId],
    { readOnly: true }
  )
    .then((result) => ({ data: result.rows, error: null as { code?: string | null; message?: string | null } | null }))
    .catch((error) => ({ data: [] as Array<Record<string, unknown>>, error: { message: error instanceof Error ? error.message : String(error) } }));
  const documentSourcesError = documentSourcesResult.error;

  const [scan, events, signalRowsInitial, findingsResult] = await Promise.all([
    queryOne<Record<string, unknown>>(
      `select id, status, created_at, started_at, completed_at, error_message from scans where id = $1`,
      [scanId],
      { readOnly: true }
    ),
    query<ScanEventRow>(
      `
        select id, event_type, message, metadata_json, created_at
        from scan_events
        where scan_id = $1
        order by created_at asc
      `,
      [scanId],
      { readOnly: true }
    ).then((result) => result.rows),
    query<ScanSignalRow>(
      `
        select signal_key, population_source
        from scan_signals
        where scan_id = $1
        order by signal_key asc
      `,
      [scanId],
      { readOnly: true }
    )
      .then((result) => ({ data: result.rows, error: null as { code?: string | null; message?: string | null } | null }))
      .catch((error) => ({ data: [] as ScanSignalRow[], error: { message: error instanceof Error ? error.message : String(error) } })),
    query<{ id: string }>(
      `
        select id
        from validation_run_findings
        where scan_id = $1
      `,
      [scanId],
      { readOnly: true }
    )
      .then((result) => ({ data: result.rows, error: null as { code?: string | null; message?: string | null } | null }))
      .catch((error) => ({ data: [] as Array<{ id: string }>, error: { message: error instanceof Error ? error.message : String(error) } }))
  ]);

  if (!scan) {
    throw new Error(`Failed to load scan ${scanId}: Not found`);
  }
  if (documentSourcesError && !isMissingOptionalTableError(documentSourcesError)) {
    throw new Error(`Failed to load document sources ${scanId}: ${documentSourcesError.message}`);
  }
  let signals = signalRowsInitial.data;
  let signalsError = signalRowsInitial.error;
  if (signalsError && isMissingColumnError(signalsError, "population_source")) {
    const fallback = await query<{ signal_key: string }>(
      `
        select signal_key
        from scan_signals
        where scan_id = $1
        order by signal_key asc
      `,
      [scanId],
      { readOnly: true }
    ).then((result) => result.rows);
    signals = fallback.map((row) => ({
      ...row,
      population_source: null
    }));
    signalsError = null;
  }

  if (signalsError) {
    throw new Error(`Failed to load signals ${scanId}: ${signalsError.message}`);
  }
  let findings = findingsResult.data;
  let findingsError = findingsResult.error;
  if (findingsError && isMissingColumnError(findingsError, "scan_id")) {
    const runs = await query<{ id: string }>(
      `
        select id
        from validation_runs
        where scan_id = $1
      `,
      [scanId],
      { readOnly: true }
    ).then((result) => result.rows);

    const runIds = (runs ?? [])
      .map((row) => (row && typeof row === "object" ? (row as { id?: unknown }).id : null))
      .filter((value): value is string => typeof value === "string");

    if (runIds.length === 0) {
      findings = [];
      findingsError = null;
    } else {
      findings = await query<{ id: string }>(
        `
          select id
          from validation_run_findings
          where validation_run_id = any($1::uuid[])
        `,
        [runIds],
        { readOnly: true }
      ).then((result) => result.rows);
      findingsError = null;
    }
  }

  if (findingsError) {
    throw new Error(`Failed to load validation findings ${scanId}: ${findingsError.message}`);
  }

  const eventRows = events.map((event) => ({
    createdAt: event.created_at,
    eventType: event.event_type
  }));
  const signalRows = signals as ScanSignalRow[];
  const documentRows = (documentSourcesError ? [] : documentSourcesResult.data) as Array<Record<string, unknown>>;
  const findingRows = (findings ?? []) as Array<Record<string, unknown>>;
  const readyDocumentSourceCount = getDocumentSourceStatusCount(documentRows, "ready");
  const rejectedDocumentSourceCount = getDocumentSourceStatusCount(documentRows, "rejected");
  const reusedExtractionCount = getExtractionReuseCount(documentRows);
  const skippedExtractionReasons = getExtractionSkipCounts(documentRows);
  const skippedExtractionCount = Object.values(skippedExtractionReasons).reduce((sum, count) => sum + count, 0);
  const freshExtractionCount = documentRows.filter((row) => {
    const extractionStatus = typeof row.extraction_status === "string" ? row.extraction_status : null;
    return extractionStatus === "ready";
  }).length - reusedExtractionCount;

  const scannerSignalCount = signalRows.filter((row) => !row.population_source || row.population_source === "scanner").length;
  const nanoSignalCount = signalRows.filter((row) => row.population_source === "nano").length;
  const validationSignalCount = signalRows.filter((row) => row.population_source === "validation").length;
  const eventTypeDiagnostics = buildEventTypeDiagnostics(events);
  const eventSamples = buildEventSamples(events, sampleLimit, 180);
  const workflow = deriveSignalEnrichmentWorkflowState({
    documentSourceCount: readyDocumentSourceCount,
    events: eventRows,
    freshExtractionCount: Math.max(0, freshExtractionCount),
    findingsCount: findingRows.length,
    mergedSignalCount: signalRows.length,
    nanoSignalCount,
    policyDocumentCount: documentRows.length,
    reusedExtractionCount,
    skippedExtractionCount,
    skippedExtractionReasons,
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
      signalSourceColumnAvailable: !(signalsError && isMissingColumnError(signalsError, "population_source")),
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
      reused: reusedExtractionCount,
      skipped: skippedExtractionCount,
      skippedByReason: skippedExtractionReasons
    },
    documentSourcesByExtractionStatus: countBy(documentRows, (row) => String(row.extraction_status ?? "unknown")),
    documentSourcesByType: countBy(documentRows, (row) => String(row.document_type ?? "unknown")),
    eventCounts: countBy(eventRows, (row) => row.eventType),
    eventDiagnostics: {
      sampleLimit,
      totalEventCount: events.length,
      totalMetadataBytes: eventTypeDiagnostics.reduce((sum, row) => sum + row.totalMetadataBytes, 0),
      uniqueEventTypes: eventTypeDiagnostics.length,
      topEventTypesByMetadataBytes: eventTypeDiagnostics.slice(0, 8),
      samples: eventSamples
    },
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

  if (eventsOnly) {
    printHeader("Signal Event Summary");
    console.log(`scanId: ${payload.scan.id}`);
    console.log(`status: ${payload.scan.status}`);
    console.log(`events: total=${payload.eventDiagnostics.totalEventCount} | types=${payload.eventDiagnostics.uniqueEventTypes} | metadataBytes=${payload.eventDiagnostics.totalMetadataBytes}`);

    printHeader("Top Event Types");
    for (const row of payload.eventDiagnostics.topEventTypesByMetadataBytes) {
      console.log(
        `- ${row.eventType}: count=${row.count} | metadataBytes=${row.totalMetadataBytes} | maxMetadataBytes=${row.maxMetadataBytes} | firstAt=${row.firstAt} | lastAt=${row.lastAt}`
      );
      if (row.sampleMetadataKeys.length > 0) {
        console.log(`  metadataKeys=${row.sampleMetadataKeys.join(",")}`);
      }
      if (row.sampleMessages.length > 0) {
        console.log(`  sampleMessages=${JSON.stringify(row.sampleMessages)}`);
      }
    }

    if (payload.eventDiagnostics.samples.length > 0) {
      printHeader("Representative Event Samples");
      for (const sample of payload.eventDiagnostics.samples) {
        console.log(
          `- ${sample.createdAt} | ${sample.eventType} | metadataBytes=${sample.metadataBytes} | message=${sample.message ?? "null"}`
        );
        console.log(`  metadataPreview=${JSON.stringify(sample.metadataPreview)}`);
      }
    }

    return;
  }

  if (summary) {
    printHeader("Signal Enrichment Summary");
    console.log(`scanId: ${payload.scan.id}`);
    console.log(`status: ${payload.scan.status}`);
    console.log(`actualMode: ${payload.workflow.actualMode}`);
    console.log(`mergedSignalsReady: ${payload.workflow.mergedSignalsReady}`);
    console.log(`findingsReady: ${payload.workflow.findingsReady}`);
    console.log(
      `documents: ready=${readyDocumentSourceCount} | rejected=${rejectedDocumentSourceCount} | total=${documentRows.length}`
    );
    console.log(
      `signals: nano=${nanoSignalCount} | scanner=${scannerSignalCount} | validation=${validationSignalCount} | total=${signalRows.length}`
    );
    console.log(
      `events: total=${payload.eventDiagnostics.totalEventCount} | types=${payload.eventDiagnostics.uniqueEventTypes} | metadataBytes=${payload.eventDiagnostics.totalMetadataBytes}`
    );
    console.log(
      `timings: scanner=${formatDurationMs(payload.workflow.timings.scannerDurationMs)} | docRetrieval=${formatDurationMs(payload.workflow.timings.nanoDocRetrievalDurationMs)} | docSignals=${formatDurationMs(payload.workflow.timings.nanoDocSignalsDurationMs)} | merge=${formatDurationMs(payload.workflow.timings.signalMergeDurationMs)} | findings=${formatDurationMs(payload.workflow.timings.unifiedFindingsDurationMs)}`
    );

    printHeader("Top Event Types");
    for (const row of payload.eventDiagnostics.topEventTypesByMetadataBytes) {
      console.log(
        `- ${row.eventType}: count=${row.count} | metadataBytes=${row.totalMetadataBytes} | maxMetadataBytes=${row.maxMetadataBytes} | firstAt=${row.firstAt} | lastAt=${row.lastAt}`
      );
    }

    if (payload.nanoDocRetrievalDiagnostics) {
      printHeader("Retrieval Diagnostics");
      console.log(JSON.stringify(payload.nanoDocRetrievalDiagnostics, null, 2));
    }

    if (payload.eventDiagnostics.samples.length > 0) {
      printHeader("Representative Event Samples");
      for (const sample of payload.eventDiagnostics.samples) {
        console.log(
          `- ${sample.createdAt} | ${sample.eventType} | metadataBytes=${sample.metadataBytes} | message=${sample.message ?? "null"}`
        );
        console.log(`  metadataPreview=${JSON.stringify(sample.metadataPreview)}`);
      }
    }

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
  if (payload.workflow.extractionMetrics.skippedExtractions > 0) {
    console.log(
      `skipped: total=${payload.workflow.extractionMetrics.skippedExtractions} | reasons=${JSON.stringify(payload.workflow.extractionMetrics.skippedByReason)}`
    );
  }
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

  printHeader("Event Diagnostics");
  console.log(
    JSON.stringify(
      {
        sampleLimit: payload.eventDiagnostics.sampleLimit,
        totalEventCount: payload.eventDiagnostics.totalEventCount,
        totalMetadataBytes: payload.eventDiagnostics.totalMetadataBytes,
        uniqueEventTypes: payload.eventDiagnostics.uniqueEventTypes,
        topEventTypesByMetadataBytes: payload.eventDiagnostics.topEventTypesByMetadataBytes,
        samples: payload.eventDiagnostics.samples
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
