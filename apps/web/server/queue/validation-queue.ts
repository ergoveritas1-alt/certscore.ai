import "server-only";

import { query, queryOne } from "@website-signal-risk-scanner/db";
import { SCAN_EVENT_TYPES } from "@website-signal-risk-scanner/shared";

type QueueCounts = {
  active: number;
  delayed: number;
  failed: number;
  paused: number;
  waiting: number;
};

type ValidationQueueHealth = {
  collect: QueueCounts;
  nanoDocRetrieval: QueueCounts;
  nanoSignals: QueueCounts;
  rank: QueueCounts;
};

export function getValidationQueueAvailability() {
  return {
    enabled: true,
    reason: null
  } as const;
}

export async function enqueueValidationCollectJob(_validationRunId: string) {
  return;
}

export async function enqueueNanoSignalEnrichmentJob(scanId: string) {
  await query(
    `
      insert into scan_events (scan_id, domain_id, organization_id, event_type, message, metadata_json)
      values ($1, null, null, $2, $3, $4)
    `,
    [
      scanId,
      SCAN_EVENT_TYPES.nanoSignalEnrichmentQueued,
      "Nano document signal enrichment requested.",
      { stage: "nano_doc_signals" }
    ]
  );
}

export async function getValidationQueueHealth(): Promise<ValidationQueueHealth> {
  const counts = await queryOne<{
    collecting: number;
    queued: number;
    ranking: number;
    validating: number;
    waiting_for_scan: number;
  }>(
    `
      select
        count(*) filter (where status = 'queued')::int as queued,
        count(*) filter (where status = 'waiting_for_scan')::int as waiting_for_scan,
        count(*) filter (where status = 'collecting')::int as collecting,
        count(*) filter (where status = 'ranking')::int as ranking,
        count(*) filter (where status = 'validating')::int as validating
      from validation_runs
      where status in ('queued', 'waiting_for_scan', 'collecting', 'ranking', 'validating')
    `,
    [],
    { readOnly: true }
  );

  const collectWaiting = (counts?.queued ?? 0) + (counts?.waiting_for_scan ?? 0);
  const collectActive = counts?.collecting ?? 0;
  const rankActive = (counts?.ranking ?? 0) + (counts?.validating ?? 0);

  return {
    collect: {
      active: collectActive,
      delayed: 0,
      failed: 0,
      paused: 0,
      waiting: collectWaiting
    },
    nanoDocRetrieval: {
      active: 0,
      delayed: 0,
      failed: 0,
      paused: 0,
      waiting: 0
    },
    nanoSignals: {
      active: 0,
      delayed: 0,
      failed: 0,
      paused: 0,
      waiting: 0
    },
    rank: {
      active: rankActive,
      delayed: 0,
      failed: 0,
      paused: 0,
      waiting: 0
    }
  };
}
