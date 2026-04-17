import { createDatabaseClient } from "@website-signal-risk-scanner/db";
import { getHybridNanoSignalPopulations } from "../../web/lib/scans/hybrid-runtime-evidence";

type ScanRuntimeArtifactRow = {
  domain_id: string;
  organization_id: string;
  scan_id: string;
  [key: string]: unknown;
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

function chunkValues<T>(values: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

function deriveSignalCategory(key: string) {
  if (key.startsWith("commerce.")) {
    return "commerce";
  }
  if (key.startsWith("disclosure.")) {
    return "disclosure";
  }
  if (key.startsWith("accessibility.")) {
    return "accessibility";
  }

  return "privacy";
}

async function main() {
  const db = createDatabaseClient();
  const scanId = getArgValue("--scan-id");
  const limit = Math.max(1, Number.parseInt(getArgValue("--limit") ?? "500", 10) || 500);
  const dryRun = hasFlag("--dry-run");
  const scanIds = scanId ? [scanId] : [];

  let runtimeArtifactRows: ScanRuntimeArtifactRow[] = [];
  if (scanIds.length > 0) {
    for (const batch of chunkValues(scanIds, 100)) {
      const { data, error } = await db
        .from("scan_runtime_artifacts")
        .select("*")
        .in("scan_id", batch);

      if (error) {
        throw new Error(`Failed to load runtime artifacts: ${error.message}`);
      }

      runtimeArtifactRows.push(...((data ?? []) as ScanRuntimeArtifactRow[]));
    }
  } else {
    const { data, error } = await db
      .from("scan_runtime_artifacts")
      .select("*")
      .limit(limit)
      .order("updated_at", { ascending: false });

    if (error) {
      throw new Error(`Failed to load runtime artifacts: ${error.message}`);
    }

    runtimeArtifactRows = (data ?? []) as ScanRuntimeArtifactRow[];
  }

  let scansVisited = 0;
  let scansWithLegacyNanoRows = 0;
  let upsertedRows = 0;

  for (const row of runtimeArtifactRows) {
    scansVisited += 1;
    const nanoRows = getHybridNanoSignalPopulations(row);
    if (nanoRows.length === 0) {
      continue;
    }

    scansWithLegacyNanoRows += 1;
    const payload = nanoRows.map((signal) => ({
      category: deriveSignalCategory(signal.key),
      confidence: signal.confidence,
      domain_id: row.domain_id,
      evidence_refs: signal.evidenceRefs,
      observed_at: signal.observedAt,
      organization_id: row.organization_id,
      population_source: "nano",
      population_status: signal.populationStatus,
      provenance_json: signal.provenance,
      scan_id: row.scan_id,
      signal_key: signal.key,
      signal_label: signal.label,
      signal_value_json: signal.value,
      value_type: signal.valueType
    }));

    if (dryRun) {
      upsertedRows += payload.length;
      continue;
    }

    const { error } = await db.from("scan_signals").upsert(payload, {
      onConflict: "scan_id,signal_key,population_source"
    });

    if (error) {
      throw new Error(`Failed to upsert nano signals for scan ${row.scan_id}: ${error.message}`);
    }

    upsertedRows += payload.length;
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        scansVisited,
        scansWithLegacyNanoRows,
        upsertedRows
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error("[backfill-nano-signal-populations]", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
