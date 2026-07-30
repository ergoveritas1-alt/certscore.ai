"use server";

import { createHash, timingSafeEqual } from "node:crypto";
import { query, queryOne } from "@website-signal-risk-scanner/db";

type RequestRow = {
  organization_id: string | null;
  status: "pending" | "completed" | "terminal_failure";
  token_sha256: string;
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
  await query(
    `update public.scan_score_materialization_requests
        set last_error = $2
      where scan_id = $1::uuid
        and status = 'pending'`,
    [scanId, message]
  );
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
