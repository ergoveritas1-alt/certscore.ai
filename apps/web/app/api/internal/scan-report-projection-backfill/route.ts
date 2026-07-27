import { NextResponse } from "next/server";
import { query } from "@website-signal-risk-scanner/db";
import { getAnonymousScanById, getScanById } from "../../../../server/scans/get-scan-by-id";
import { materializeLocalV2DagScanDetail } from "../../../../server/scans/local-v2-dag-report";
import {
  persistScanReportProjection,
  SCAN_REPORT_PROJECTION_VERSION
} from "../../../../server/scans/scan-report-projection";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ScanRow = {
  id: string;
  organization_id: string | null;
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

  const body = await request.json().catch(() => ({})) as { limit?: unknown; scanId?: unknown };
  const requestedLimit = typeof body.limit === "number" && Number.isFinite(body.limit)
    ? Math.trunc(body.limit)
    : 100;
  const limit = Math.min(Math.max(requestedLimit, 1), 500);
  const scanId = typeof body.scanId === "string" && /^[0-9a-f-]{36}$/i.test(body.scanId)
    ? body.scanId
    : null;
  const rows = await query<ScanRow>(
    `select s.id, s.organization_id
       from public.scans s
       left join public.scan_snapshots ss on ss.scan_id = s.id
      where s.status = 'completed'
        and s.domain_id is not null
        and ($1::uuid is null or s.id = $1::uuid)
        and ($1::uuid is not null or
             ss.report_projection_version is distinct from $2 or
             ss.report_projection_status is distinct from 'ready')
      order by s.completed_at desc nulls last, s.created_at desc
      limit $3`,
    [scanId, SCAN_REPORT_PROJECTION_VERSION, limit],
    { readOnly: true }
  );

  let nextIndex = 0;
  let projected = 0;
  let failed = 0;
  const failures: Array<{ error: string; scanId: string }> = [];
  async function worker() {
    while (nextIndex < rows.rows.length) {
      const row = rows.rows[nextIndex++];
      if (!row) continue;
      try {
        const rawDetail = row.organization_id
          ? await getScanById({ organizationId: row.organization_id, scanId: row.id })
          : await getAnonymousScanById(row.id);
        if (!rawDetail) throw new Error("scan detail was unavailable");
        const materialized = await materializeLocalV2DagScanDetail(rawDetail, { requireBundle: false });
        await persistScanReportProjection(materialized, {
          snapshot: rawDetail.snapshot,
          runtimeArtifacts: rawDetail.runtimeArtifacts
        });
        projected += 1;
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
            where scan_id = $1::uuid`,
          [row.id, SCAN_REPORT_PROJECTION_VERSION, message]
        ).catch(() => undefined);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(4, rows.rows.length) }, () => worker()));
  return NextResponse.json({
    failed,
    failures: failures.slice(0, 20),
    limit,
    projected,
    selected: rows.rows.length,
    status: failed > 0 ? "partial" : "ok",
    projectionVersion: SCAN_REPORT_PROJECTION_VERSION
  });
}
