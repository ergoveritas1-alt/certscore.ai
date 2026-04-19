import { query } from "@website-signal-risk-scanner/db";
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
  const scanId = getArgValue("--scan-id");
  const limit = Math.max(1, Number.parseInt(getArgValue("--limit") ?? "500", 10) || 500);
  const dryRun = hasFlag("--dry-run");
  const scanIds = scanId ? [scanId] : [];

  let runtimeArtifactRows: ScanRuntimeArtifactRow[] = [];
  if (scanIds.length > 0) {
    for (const batch of chunkValues(scanIds, 100)) {
      const data = await query<ScanRuntimeArtifactRow>(
        `select * from scan_runtime_artifacts where scan_id = any($1::uuid[])`,
        [batch],
        { readOnly: true }
      ).then((result) => result.rows);

      runtimeArtifactRows.push(...data);
    }
  } else {
    runtimeArtifactRows = await query<ScanRuntimeArtifactRow>(
      `select * from scan_runtime_artifacts order by updated_at desc limit $1`,
      [limit],
      { readOnly: true }
    ).then((result) => result.rows);
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

    const observedAt = new Date().toISOString();

    await query(
      `
        insert into scan_signals (
          category, confidence, domain_id, evidence_refs, observed_at, organization_id,
          population_source, population_status, provenance_json, scan_id, signal_key,
          signal_label, signal_value_json, value_type
        )
        select
          value->>'category',
          nullif(value->>'confidence', '')::float8,
          nullif(value->>'domain_id', '')::uuid,
          coalesce(array(select jsonb_array_elements_text(value->'evidence_refs')), ARRAY[]::text[]),
          coalesce(nullif(value->>'observed_at', '')::timestamptz, $2::timestamptz),
          nullif(value->>'organization_id', '')::uuid,
          value->>'population_source',
          value->>'population_status',
          value->'provenance_json',
          nullif(value->>'scan_id', '')::uuid,
          value->>'signal_key',
          value->>'signal_label',
          value->'signal_value_json',
          value->>'value_type'
        from jsonb_array_elements($1::jsonb) as value
        on conflict (scan_id, signal_key, population_source) do update
          set category = excluded.category,
              confidence = excluded.confidence,
              domain_id = excluded.domain_id,
              evidence_refs = excluded.evidence_refs,
              observed_at = excluded.observed_at,
              organization_id = excluded.organization_id,
              population_status = excluded.population_status,
              provenance_json = excluded.provenance_json,
              signal_label = excluded.signal_label,
              signal_value_json = excluded.signal_value_json,
              value_type = excluded.value_type
      `,
      [JSON.stringify(payload), observedAt]
    );

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
