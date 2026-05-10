import { query } from "@website-signal-risk-scanner/db";
import { processNanoSignalEnrichmentJob } from "../src/validation/pipeline";

type BackfillInput = {
  notes?: string;
  scanIds?: string[];
};

type BackfillSummaryRow = {
  nano_completed_count: number;
  nano_failed_count: number;
  nano_started_count: number;
  rtb_validation_finding_count: number;
  scan_id: string;
  unified_completed_count: number;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function decodeInput() {
  const encoded = process.env.OPS_NANO_SIGNAL_BACKFILL_INPUT_BASE64?.trim();
  const inline = process.env.OPS_NANO_SIGNAL_BACKFILL_INPUT_JSON?.trim();
  const raw = encoded ? Buffer.from(encoded, "base64").toString("utf8") : inline;
  if (!raw) {
    throw new Error("OPS_NANO_SIGNAL_BACKFILL_INPUT_BASE64 or OPS_NANO_SIGNAL_BACKFILL_INPUT_JSON is required.");
  }

  const parsed = JSON.parse(raw) as BackfillInput;
  const scanIds = [...new Set(parsed.scanIds ?? [])];
  if (scanIds.length === 0) {
    throw new Error("Backfill input must include a non-empty scanIds array.");
  }
  if (scanIds.length > 250) {
    throw new Error("Backfill input is limited to 250 scans per task.");
  }
  for (const scanId of scanIds) {
    if (!UUID_PATTERN.test(scanId)) {
      throw new Error(`Invalid scanId in backfill input: ${scanId}`);
    }
  }

  return {
    notes: parsed.notes ?? null,
    scanIds
  };
}

async function summarize(scanIds: string[]) {
  const result = await query<BackfillSummaryRow>(
    `
      with event_counts as (
        select
          scan_id,
          count(*) filter (where event_type = 'signals.nano_doc_enrichment_started')::int as nano_started_count,
          count(*) filter (where event_type = 'signals.nano_doc_enrichment_completed')::int as nano_completed_count,
          count(*) filter (where event_type = 'signals.nano_doc_enrichment_failed')::int as nano_failed_count,
          count(*) filter (where event_type = 'findings.unified_derivation_completed')::int as unified_completed_count
        from scan_events
        where scan_id = any($1::uuid[])
        group by scan_id
      ),
      finding_counts as (
        select
          runs.scan_id,
          count(*) filter (where findings.rule_key = 'runtime_privacy.rtb_cookie_sync_observed')::int as rtb_validation_finding_count
        from validation_runs runs
        join validation_run_findings findings on findings.validation_run_id = runs.id
        where runs.scan_id = any($1::uuid[])
        group by runs.scan_id
      )
      select
        scans.id::text as scan_id,
        coalesce(event_counts.nano_started_count, 0)::int as nano_started_count,
        coalesce(event_counts.nano_completed_count, 0)::int as nano_completed_count,
        coalesce(event_counts.nano_failed_count, 0)::int as nano_failed_count,
        coalesce(event_counts.unified_completed_count, 0)::int as unified_completed_count,
        coalesce(finding_counts.rtb_validation_finding_count, 0)::int as rtb_validation_finding_count
      from scans
      left join event_counts on event_counts.scan_id = scans.id
      left join finding_counts on finding_counts.scan_id = scans.id
      where scans.id = any($1::uuid[])
      order by scans.id::text
    `,
    [scanIds],
    { readOnly: true }
  );

  return result.rows;
}

async function main() {
  if (!process.env.DATABASE_URL?.trim() && !process.env.DATABASE_READ_URL?.trim()) {
    throw new Error("DATABASE_READ_URL or DATABASE_URL is required.");
  }

  const input = decodeInput();
  const before = await summarize(input.scanIds);
  const rows: Array<{ error: string | null; scanId: string; status: "processed" | "failed" }> = [];

  for (const scanId of input.scanIds) {
    try {
      await processNanoSignalEnrichmentJob({ scanId });
      rows.push({ error: null, scanId, status: "processed" });
    } catch (error) {
      rows.push({
        error: error instanceof Error ? error.message : String(error),
        scanId,
        status: "failed"
      });
    }
  }

  const after = await summarize(input.scanIds);
  const result = {
    generatedAt: new Date().toISOString(),
    notes: input.notes,
    readWriteScope: {
      scanCount: input.scanIds.length,
      tables: [
        "scan_events",
        "scan_signals",
        "validation_runs",
        "validation_run_findings",
        "scan_snapshots"
      ]
    },
    before,
    after,
    rows
  };

  console.log("__NANO_SIGNAL_BACKFILL_JSON_START__");
  console.log(JSON.stringify(result, null, 2));
  console.log("__NANO_SIGNAL_BACKFILL_JSON_END__");
}

void main().catch((error) => {
  console.error(`Nano signal backfill failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
