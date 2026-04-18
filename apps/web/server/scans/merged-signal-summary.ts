import { query } from "@website-signal-risk-scanner/db";
import type { PopulatedSignalRecord } from "@website-signal-risk-scanner/shared";
import { buildMergedSignalRecords } from "../../lib/scans/merged-signals";

type SummarySignalRow = {
  confidence?: number | null;
  evidence_refs?: string[] | null;
  observed_at?: string | null;
  population_source?: string | null;
  population_status?: string | null;
  provenance_json?: unknown;
  scan_id: string;
  signal_key: string;
  signal_label: string;
  signal_value_json: boolean | number | string | string[];
  value_type: string;
};

function chunkValues<T>(values: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function buildStoredSignalPopulationRecords(input: {
  observedAtByScanId: Map<string, string | null>;
  rows: SummarySignalRow[];
  source: "nano" | "validation";
}) {
  return input.rows.flatMap((row) => {
    const populationStatus =
      row.population_status === "present" ||
      row.population_status === "missing" ||
      row.population_status === "conflicting" ||
      row.population_status === "insufficient"
        ? row.population_status
        : "present";

    return [
      {
        confidence: typeof row.confidence === "number" ? row.confidence : null,
        evidenceRefs: Array.isArray(row.evidence_refs) ? row.evidence_refs.filter((value): value is string => typeof value === "string") : [],
        key: row.signal_key,
        label: row.signal_label,
        observedAt: row.observed_at ?? input.observedAtByScanId.get(row.scan_id) ?? null,
        populationStatus,
        provenance: Array.isArray(row.provenance_json)
          ? row.provenance_json.filter(
              (
                value
              ): value is { detail: string; kind: "document" | "runtime" | "signal" | "validation" } =>
                Boolean(value) &&
                typeof value === "object" &&
                typeof (value as { detail?: unknown }).detail === "string" &&
                ((value as { kind?: unknown }).kind === "document" ||
                  (value as { kind?: unknown }).kind === "runtime" ||
                  (value as { kind?: unknown }).kind === "signal" ||
                  (value as { kind?: unknown }).kind === "validation")
            )
          : [],
        reportSignalSource: "document_semantic_signal",
        source: input.source,
        value: row.signal_value_json,
        valueType:
          row.value_type === "boolean" || row.value_type === "number" || row.value_type === "text" || row.value_type === "string_array"
            ? row.value_type
            : Array.isArray(row.signal_value_json)
              ? "string_array"
              : typeof row.signal_value_json === "boolean"
                ? "boolean"
                : typeof row.signal_value_json === "number"
                  ? "number"
                  : "text"
      } satisfies PopulatedSignalRecord
    ];
  });
}

export async function loadMergedSignalsByScanId(input: {
  observedAtByScanId: Map<string, string | null>;
  scanIds: string[];
  db?: unknown;
}) {
  const mergedSignalsByScanId = new Map<string, ReturnType<typeof buildMergedSignalRecords>>();
  if (input.scanIds.length === 0) {
    return mergedSignalsByScanId;
  }

  const rawRows: SummarySignalRow[] = [];
  for (const scanIdBatch of chunkValues(input.scanIds, 100)) {
    try {
      const rows = await query<SummarySignalRow>(
        `
          select
            scan_id,
            signal_key,
            signal_label,
            signal_value_json,
            value_type,
            population_source,
            population_status,
            confidence,
            evidence_refs,
            provenance_json,
            observed_at
          from scan_signals
          where scan_id = any($1::uuid[])
        `,
        [scanIdBatch],
        { readOnly: true }
      ).then((result) => result.rows);

      rawRows.push(...rows);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to load merged signals: ${message}`);
    }
  }

  const rowsByScanId = new Map<string, SummarySignalRow[]>();
  for (const row of rawRows) {
    const existing = rowsByScanId.get(row.scan_id) ?? [];
    existing.push(row);
    rowsByScanId.set(row.scan_id, existing);
  }

  for (const scanId of input.scanIds) {
    const rows = rowsByScanId.get(scanId) ?? [];
    const scannerSignals = rows
      .filter((row) => !row.population_source || row.population_source === "scanner")
      .flatMap((row) => {
        const valueType =
          row.value_type === "boolean" || row.value_type === "number" || row.value_type === "text" || row.value_type === "string_array"
            ? row.value_type
            : Array.isArray(row.signal_value_json)
              ? "string_array"
              : typeof row.signal_value_json === "boolean"
                ? "boolean"
                : typeof row.signal_value_json === "number"
                  ? "number"
                  : "text";

        return [
          {
            confidence: typeof row.confidence === "number" ? row.confidence : null,
            evidenceRefs: Array.isArray(row.evidence_refs)
              ? row.evidence_refs.filter((value): value is string => typeof value === "string")
              : [],
            key: row.signal_key,
            label: row.signal_label,
            observedAt: row.observed_at ?? input.observedAtByScanId.get(scanId) ?? null,
            populationStatus:
              row.population_status === "present" ||
              row.population_status === "missing" ||
              row.population_status === "conflicting" ||
              row.population_status === "insufficient"
                ? row.population_status
                : "present",
            provenance: [],
            reportSignalSource:
              row.population_source === "validation"
                ? null
                : row.population_source === "nano"
                  ? "document_semantic_signal"
                  : "snapshot_signal",
            source: "scanner" as const,
            value: row.signal_value_json,
            valueType
          } satisfies PopulatedSignalRecord
        ];
      });

    const mergedSignals = buildMergedSignalRecords({
      nanoSignals: buildStoredSignalPopulationRecords({
        observedAtByScanId: input.observedAtByScanId,
        rows: rows.filter((row) => row.population_source === "nano"),
        source: "nano"
      }),
      scannerSignals,
      validationSignals: buildStoredSignalPopulationRecords({
        observedAtByScanId: input.observedAtByScanId,
        rows: rows.filter((row) => row.population_source === "validation"),
        source: "validation"
      })
    });
    mergedSignalsByScanId.set(scanId, mergedSignals);
  }

  return mergedSignalsByScanId;
}
