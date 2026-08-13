"use server";

import { createHash, timingSafeEqual } from "node:crypto";
import { query, queryOne } from "@website-signal-risk-scanner/db";

type RequestRow = {
  organization_id: string | null;
  status: "pending" | "completed" | "terminal_failure";
  token_sha256: string;
};

type RetryScheduleRow = {
  retry_after_seconds: number;
  status: "pending" | "terminal_failure";
};

export type ScoreMaterializationRetrySchedule = {
  retryAfterSeconds: number;
  retryable: boolean;
};

function tokenSha256(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function authorizeScoreMaterializationRequest(input: {
  scanId: string;
  token: string;
}) {
  const row = await queryOne<RequestRow>(
    `select request.token_sha256,
            request.status,
            scan.organization_id
       from public.scan_score_materialization_requests request
       join public.scans scan on scan.id = request.scan_id
      where request.scan_id = $1::uuid
      limit 1`,
    [input.scanId],
    { readOnly: true }
  );
  if (!row || row.status !== "pending") return null;
  const received = Buffer.from(tokenSha256(input.token), "hex");
  const expected = Buffer.from(row.token_sha256, "hex");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  return { organizationId: row.organization_id };
}

export async function completeScoreMaterializationRequest(scanId: string) {
  await query(
    `update public.scan_score_materialization_requests
        set status = 'completed',
            completed_at = coalesce(completed_at, now()),
            last_error = null
      where scan_id = $1::uuid
        and status = 'pending'`,
    [scanId]
  );
}

export async function recordScoreMaterializationRequestError(scanId: string, error: unknown) {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
  const row = await queryOne<RetryScheduleRow>(
    `with retry_state as (
       select request.scan_id,
              request.attempt_count,
              coalesce(request.first_failed_at, now()) as first_failed_at,
              least(
                1800,
                10 * power(2, least(8, greatest(0, request.attempt_count - 1)))
              )::integer as retry_after_seconds
         from public.scan_score_materialization_requests request
        where request.scan_id = $1::uuid
          and request.status = 'pending'
        for update
     ), updated as (
       update public.scan_score_materialization_requests request
          set first_failed_at = retry.first_failed_at,
              status = case
                when retry.attempt_count >= 24
                  or retry.first_failed_at <= now() - interval '24 hours'
                  then 'terminal_failure'
                else 'pending'
              end,
              completed_at = case
                when retry.attempt_count >= 24
                  or retry.first_failed_at <= now() - interval '24 hours'
                  then coalesce(request.completed_at, now())
                else request.completed_at
              end,
              next_attempt_at = case
                when retry.attempt_count >= 24
                  or retry.first_failed_at <= now() - interval '24 hours'
                  then now()
                else now() + make_interval(secs => retry.retry_after_seconds)
              end,
              last_error = case
                when retry.attempt_count >= 24
                  or retry.first_failed_at <= now() - interval '24 hours'
                  then left('retry_exhausted:' || $2, 500)
                else $2
              end
         from retry_state retry
        where request.scan_id = retry.scan_id
        returning request.status, retry.retry_after_seconds, request.next_attempt_at
     )
     select status,
            case
              when status = 'pending'
                then greatest(1, ceil(extract(epoch from (next_attempt_at - now())))::integer)
              else 0
            end as retry_after_seconds
       from updated`,
    [scanId, message]
  );
  return {
    retryAfterSeconds: row?.retry_after_seconds ?? 0,
    retryable: row?.status === "pending",
  } satisfies ScoreMaterializationRetrySchedule;
}

export async function failScoreMaterializationRequest(scanId: string, diagnostic: string) {
  await query(
    `update public.scan_score_materialization_requests
        set status = 'terminal_failure',
            completed_at = coalesce(completed_at, now()),
            last_error = $2
      where scan_id = $1::uuid
        and status = 'pending'`,
    [scanId, diagnostic.slice(0, 500)]
  );
}
