import { query } from "@website-signal-risk-scanner/db";
import { isProductionLoadTestBatchId } from "@website-signal-risk-scanner/shared";

function getArgValue(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

async function main() {
  const batchId = getArgValue("--batch-id");
  const apply = process.argv.includes("--apply");

  if (!batchId || !isProductionLoadTestBatchId(batchId)) {
    throw new Error("Provide --batch-id with a canonical prod-manifest-<start>-<end>-load-test-YYYYMMDD-HHMM id.");
  }

  const preview = await query<{
    count: string;
    running_count: string;
    queued_count: string;
  }>(
    `select count(*)::text as count,
            count(*) filter (where status = 'running')::text as running_count,
            count(*) filter (where status = 'queued')::text as queued_count
       from scans
      where queue_origin = 'production_load_test'
        and scan_config_json->>'source' like $1
        and status in ('queued', 'running')`,
    [`${batchId};%`],
    { readOnly: true }
  );

  const row = preview.rows[0];
  console.log(
    JSON.stringify(
      {
        apply,
        batchId,
        matchedActiveScans: Number(row?.count ?? 0),
        queued: Number(row?.queued_count ?? 0),
        running: Number(row?.running_count ?? 0)
      },
      null,
      2
    )
  );

  if (!apply) {
    console.log("Dry run only. Re-run with --apply to cancel queued/running scans in this batch.");
    return;
  }

  const canceled = await query<{ id: string }>(
    `update scans
        set status = 'canceled',
            completed_at = timezone('utc', now()),
            error_message = 'Canceled by batch-scoped production load-test safety tool.'
      where queue_origin = 'production_load_test'
        and scan_config_json->>'source' like $1
        and status in ('queued', 'running')
      returning id`,
    [`${batchId};%`]
  );

  console.log(JSON.stringify({ canceledScanIds: canceled.rows.map((scan) => scan.id) }, null, 2));
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

