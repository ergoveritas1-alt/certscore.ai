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
    { data: signals, error: signalsError },
    { data: findings, error: findingsError }
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
      .select("id, source, source_status, document_type, extraction_status, semantic_confidence, source_url, canonical_url, created_at")
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
  if (documentSourcesError) {
    throw new Error(`Failed to load document sources ${scanId}: ${documentSourcesError.message}`);
  }
  if (signalsError) {
    throw new Error(`Failed to load signals ${scanId}: ${signalsError.message}`);
  }
  if (findingsError) {
    throw new Error(`Failed to load validation findings ${scanId}: ${findingsError.message}`);
  }

  const eventRows = ((events ?? []) as ScanEventRow[]).map((event) => ({
    createdAt: event.created_at,
    eventType: event.event_type
  }));
  const signalRows = (signals ?? []) as ScanSignalRow[];
  const documentRows = (documentSources ?? []) as Array<Record<string, unknown>>;
  const findingRows = (findings ?? []) as Array<Record<string, unknown>>;

  const scannerSignalCount = signalRows.filter((row) => !row.population_source || row.population_source === "scanner").length;
  const nanoSignalCount = signalRows.filter((row) => row.population_source === "nano").length;
  const validationSignalCount = signalRows.filter((row) => row.population_source === "validation").length;
  const workflow = deriveSignalEnrichmentWorkflowState({
    documentSourceCount: documentRows.length,
    events: eventRows,
    findingsCount: findingRows.length,
    mergedSignalCount: signalRows.length,
    nanoSignalCount,
    policyDocumentCount: documentRows.length,
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
      documentSources: documentRows.length,
      findings: findingRows.length,
      nanoSignals: nanoSignalCount,
      scannerSignals: scannerSignalCount,
      totalSignals: signalRows.length,
      validationSignals: validationSignalCount
    },
    documentSourcesByExtractionStatus: countBy(documentRows, (row) => String(row.extraction_status ?? "unknown")),
    documentSourcesByType: countBy(documentRows, (row) => String(row.document_type ?? "unknown")),
    eventCounts: countBy(eventRows, (row) => row.eventType),
    signalCountsBySource: countBy(signalRows, (row) => String(row.population_source ?? "scanner"))
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
  for (const stage of payload.workflow.stages) {
    console.log(
      `- ${stage.id}: ${stage.status} | items=${stage.itemCount} | startedAt=${stage.startedAt ?? "null"} | completedAt=${stage.completedAt ?? "null"}`
    );
  }

  printHeader("Counts");
  console.log(JSON.stringify(payload.counts, null, 2));

  printHeader("Document Sources By Type");
  console.log(JSON.stringify(payload.documentSourcesByType, null, 2));

  printHeader("Document Sources By Extraction Status");
  console.log(JSON.stringify(payload.documentSourcesByExtractionStatus, null, 2));

  printHeader("Signal Counts By Source");
  console.log(JSON.stringify(payload.signalCountsBySource, null, 2));

  printHeader("Event Counts");
  console.log(JSON.stringify(payload.eventCounts, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
