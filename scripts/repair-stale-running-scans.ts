import { closePools, query } from "../packages/db/src/postgres";

type ScanRow = {
  completed_at: string | null;
  created_at: string;
  domain_hostname: string | null;
  domain_id: string | null;
  error_message: string | null;
  id: string;
  organization_id: string | null;
  scan_type: string;
  started_at: string | null;
  status: string;
  updated_at: string;
};

type EventRow = {
  created_at: string;
  event_type: string;
  message: string;
  metadata_json: unknown;
};

const DEFAULT_MIN_RUN_AGE_MINUTES = 6;
const DEFAULT_MIN_EVENT_STALE_MINUTES = 5;

function parseArgs(argv: string[]) {
  const scanRefs: string[] = [];
  let apply = false;
  let minRunAgeMinutes = DEFAULT_MIN_RUN_AGE_MINUTES;
  let minEventStaleMinutes = DEFAULT_MIN_EVENT_STALE_MINUTES;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") {
      apply = true;
    } else if (arg === "--min-run-age-minutes") {
      minRunAgeMinutes = Number(argv[index + 1]);
      index += 1;
    } else if (arg === "--min-event-stale-minutes") {
      minEventStaleMinutes = Number(argv[index + 1]);
      index += 1;
    } else if (arg?.startsWith("--min-run-age-minutes=")) {
      minRunAgeMinutes = Number(arg.slice("--min-run-age-minutes=".length));
    } else if (arg?.startsWith("--min-event-stale-minutes=")) {
      minEventStaleMinutes = Number(arg.slice("--min-event-stale-minutes=".length));
    } else if (arg && !arg.startsWith("--")) {
      scanRefs.push(arg);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (scanRefs.length === 0) {
    throw new Error("Pass at least one scan id or unique scan id prefix.");
  }
  if (!Number.isFinite(minRunAgeMinutes) || minRunAgeMinutes < 1) {
    throw new Error("--min-run-age-minutes must be a positive number.");
  }
  if (!Number.isFinite(minEventStaleMinutes) || minEventStaleMinutes < 1) {
    throw new Error("--min-event-stale-minutes must be a positive number.");
  }

  return { apply, minEventStaleMinutes, minRunAgeMinutes, scanRefs };
}

function ageMinutes(value: string | null) {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return Math.max(0, Math.round((Date.now() - timestamp) / 60_000));
}

async function resolveScan(ref: string) {
  const result = await query<ScanRow>(
    `
      select s.id::text,
             s.organization_id::text,
             s.domain_id::text,
             d.hostname as domain_hostname,
             s.scan_type,
             s.status,
             s.created_at::text,
             s.started_at::text,
             s.completed_at::text,
             s.updated_at::text,
             s.error_message
        from scans s
        left join domains d on d.id = s.domain_id
       where s.id::text = $1
          or s.id::text like ($1 || '%')
       order by s.created_at desc
    `,
    [ref],
    { readOnly: true }
  );

  if (result.rows.length !== 1) {
    return { matches: result.rows };
  }

  return { scan: result.rows[0] };
}

async function loadRecentEvents(scanId: string) {
  const result = await query<EventRow>(
    `
      select event_type, message, created_at::text, metadata_json
        from scan_events
       where scan_id = $1
       order by created_at desc
       limit 8
    `,
    [scanId],
    { readOnly: true }
  );
  return result.rows;
}

async function markScanFailed(input: {
  eventStaleMinutes: number | null;
  latestEvent: EventRow | null;
  minEventStaleMinutes: number;
  minRunAgeMinutes: number;
  runAgeMinutes: number | null;
  scan: ScanRow;
}) {
  const failedAt = new Date().toISOString();
  const errorMessage = "The scanner did not return a terminal result within the expected time. No result was inferred; start a new scan.";

  await query(
    `
      update scans
         set status = 'failed',
             completed_at = $2,
             error_message = $3,
             updated_at = now()
       where id = $1
         and status = 'running'
    `,
    [input.scan.id, failedAt, errorMessage]
  );

  await query(
    `
      insert into scan_events (scan_id, domain_id, organization_id, event_type, message, metadata_json)
      values ($1, $2, $3, 'ops.scan_marked_failed', $4, $5)
    `,
    [
      input.scan.id,
      input.scan.domain_id,
      input.scan.organization_id,
      "Ops reconciler marked an orphaned running scan as failed after no terminal Lambda result arrived.",
      {
        failedAt,
        lastEventAt: input.latestEvent?.created_at ?? null,
        lastEventMessage: input.latestEvent?.message ?? null,
        minEventStaleMinutes: input.minEventStaleMinutes,
        minRunAgeMinutes: input.minRunAgeMinutes,
        reason: "lambda_terminal_result_absent",
        runAgeMinutes: input.runAgeMinutes
      }
    ]
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const summaries: Array<Record<string, unknown>> = [];

  for (const ref of args.scanRefs) {
    const resolved = await resolveScan(ref);
    if (!resolved.scan) {
      summaries.push({
        matchCount: resolved.matches.length,
        matches: resolved.matches.map((row) => ({ domain: row.domain_hostname, id: row.id, status: row.status })),
        ref,
        status: resolved.matches.length === 0 ? "not_found" : "ambiguous"
      });
      continue;
    }

    const scan = resolved.scan;
    const events = await loadRecentEvents(scan.id);
    const latestEvent = events[0] ?? null;
    const runAge = ageMinutes(scan.started_at ?? scan.created_at);
    const eventStale = ageMinutes(latestEvent?.created_at ?? null);
    const eligible =
      scan.status === "running" &&
      (runAge ?? 0) >= args.minRunAgeMinutes &&
      (eventStale ?? 0) >= args.minEventStaleMinutes;

    if (eligible && args.apply) {
      await markScanFailed({
        eventStaleMinutes: eventStale,
        latestEvent,
        minEventStaleMinutes: args.minEventStaleMinutes,
        minRunAgeMinutes: args.minRunAgeMinutes,
        runAgeMinutes: runAge,
        scan
      });
    }

    summaries.push({
      action: eligible ? (args.apply ? "marked_failed" : "would_mark_failed") : "none",
      domain: scan.domain_hostname,
      eligible,
      latestEvents: events.slice(0, 4).map((event) => ({
        at: event.created_at,
        eventType: event.event_type,
        message: event.message
      })),
      ref,
      scanId: scan.id,
      scanType: scan.scan_type,
      status: scan.status,
      thresholds: {
        minEventStaleMinutes: args.minEventStaleMinutes,
        minRunAgeMinutes: args.minRunAgeMinutes
      },
      timing: {
        eventStaleMinutes: eventStale,
        runAgeMinutes: runAge,
        startedAt: scan.started_at
      }
    });
  }

  console.log(JSON.stringify({ apply: args.apply, scans: summaries }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePools();
  });
