import { NextResponse } from "next/server";
import { query } from "@website-signal-risk-scanner/db";
import { publishCanonicalScanReportProjection } from "../../../../server/scans/canonical-scan-report-publisher";
import { LOCAL_V2_DAG_SCAN_PROCESSOR } from "../../../../server/scans/local-v2-dag-scan-config";
import { SCAN_REPORT_PROJECTION_VERSION } from "../../../../server/scans/scan-report-projection-contract";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ScanRow = {
  canonical_inputs_ready: boolean;
  id: string;
  organization_id: string | null;
  report_projection_payload_sha256: string | null;
  report_projection_source_hash: string | null;
  report_projection_status: string | null;
  report_projection_version: string | null;
};

type ProjectionAuditRow = {
  report_projection_payload_sha256: string | null;
  report_projection_source_hash: string | null;
  report_projection_status: string | null;
  report_projection_version: string | null;
};

function authorized(request: Request) {
  const expected = process.env.SCAN_PROJECTION_BACKFILL_SECRET?.trim() ?? null;
  const provided = request.headers.get("x-scan-projection-backfill-secret")?.trim() ?? null;
  if (expected) {
    return provided === expected;
  }
  return process.env.NODE_ENV !== "production";
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as { dryRun?: unknown; limit?: unknown; scanId?: unknown };
  const dryRun = body.dryRun === true;
  const requestedLimit = typeof body.limit === "number" && Number.isFinite(body.limit)
    ? Math.trunc(body.limit)
    : 100;
  const limit = Math.min(Math.max(requestedLimit, 1), 500);
  const scanId = typeof body.scanId === "string" && /^[0-9a-f-]{36}$/i.test(body.scanId)
    ? body.scanId
    : null;
  const rows = await query<ScanRow>(
    `select s.id,
            s.organization_id,
            ss.report_projection_payload_sha256,
            ss.report_projection_source_hash,
            ss.report_projection_status,
            ss.report_projection_version,
            exists (
              select 1 from public.scan_events merged
               where merged.scan_id = s.id and merged.event_type = 'signals.merge_completed'
            ) and exists (
              select 1 from public.scan_events findings
               where findings.scan_id = s.id and findings.event_type = 'findings.unified_derivation_completed'
            ) as canonical_inputs_ready
       from public.scans s
       left join public.scan_snapshots ss on ss.scan_id = s.id
      where s.status = 'completed'
        and s.domain_id is not null
        and ($1::uuid is null or s.id = $1::uuid)
        and ($1::uuid is not null or
             ss.report_projection_version is distinct from $2 or
             ss.report_projection_status is distinct from 'ready' or
             (s.scan_config_json ->> 'processor' = '${LOCAL_V2_DAG_SCAN_PROCESSOR}' and
              (ss.scan_outcome is null or ss.access_posture_class is null)))
      order by s.completed_at desc nulls last, s.created_at desc
      limit $3`,
    [scanId, SCAN_REPORT_PROJECTION_VERSION, limit],
    { readOnly: true }
  );

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      projectionVersion: SCAN_REPORT_PROJECTION_VERSION,
      scans: rows.rows.map((row) => ({
        canonicalInputsReady: row.canonical_inputs_ready,
        oldPayloadHash: row.report_projection_payload_sha256,
        oldSourceHash: row.report_projection_source_hash,
        oldStatus: row.report_projection_status,
        oldVersion: row.report_projection_version,
        scanId: row.id
      })),
      selected: rows.rows.length,
      status: "ok"
    });
  }

  let nextIndex = 0;
  let projected = 0;
  let finalizing = 0;
  let failed = 0;
  const failures: Array<{ error: string; scanId: string }> = [];
  const outcomes: Array<Record<string, unknown>> = [];
  async function worker() {
    while (nextIndex < rows.rows.length) {
      const row = rows.rows[nextIndex++];
      if (!row) continue;
      try {
        const publication = await publishCanonicalScanReportProjection({
          organizationId: row.organization_id,
          scanId: row.id
        });
        if (publication.status === "ready") {
          projected += 1;
          const current = await query<ProjectionAuditRow>(
            `select report_projection_payload_sha256,
                    report_projection_source_hash,
                    report_projection_status,
                    report_projection_version
               from public.scan_snapshots
              where scan_id = $1::uuid
              limit 1`,
            [row.id],
            { readOnly: true }
          );
          const next = current.rows[0] ?? null;
          outcomes.push({
            eventCount: publication.eventCount,
            latestEventId: publication.latestEventId,
            newPayloadHash: next?.report_projection_payload_sha256 ?? null,
            newSourceHash: next?.report_projection_source_hash ?? null,
            newStatus: next?.report_projection_status ?? null,
            newVersion: next?.report_projection_version ?? null,
            oldPayloadHash: row.report_projection_payload_sha256,
            oldSourceHash: row.report_projection_source_hash,
            oldStatus: row.report_projection_status,
            oldVersion: row.report_projection_version,
            scanId: row.id
          });
        } else {
          finalizing += 1;
          outcomes.push({ reason: publication.reason, scanId: row.id, status: publication.status });
        }
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        failures.push({ error: message, scanId: row.id });
        await query(
          `update public.scan_snapshots
              set report_projection_version = $2,
                  report_projection_status = 'failed',
                  report_projection_computed_at = timezone('utc', now()),
                  report_projection_error = $3
            where scan_id = $1::uuid
              and (
                report_projection_version is distinct from $2
                or report_projection_status is distinct from 'ready'
              )`,
          [row.id, SCAN_REPORT_PROJECTION_VERSION, message]
        ).catch(() => undefined);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(4, rows.rows.length) }, () => worker()));
  return NextResponse.json({
    failed,
    failures: failures.slice(0, 20),
    finalizing,
    limit,
    outcomes: outcomes.slice(0, 100),
    projected,
    selected: rows.rows.length,
    status: failed > 0 ? "partial" : "ok",
    projectionVersion: SCAN_REPORT_PROJECTION_VERSION
  });
}
