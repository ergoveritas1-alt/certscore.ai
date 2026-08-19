import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { hydrateChecklistPolicyEvidence } from "../../../../../../lib/scans/checklist-evidence-index";
import { getPersistedCanonicalReportProjection } from "../../../../../../server/scans/persisted-canonical-report-projection";
import { loadPersistedScanReportProjection } from "../../../../../../server/scans/scan-report-projection";
import { getPublicScanStatusProjection } from "../../../../../../server/scans/scan-status-projection";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_ROW_IDS = 40;

type RouteContext = {
  params: Promise<{ scanId: string }>;
};

function jsonError(status: number, message: string) {
  return NextResponse.json(
    { error: message },
    {
      headers: {
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
      status,
    },
  );
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { scanId } = await context.params;
  const generation = request.nextUrl.searchParams.get("generation")?.trim() ?? "";
  const rowIds = [
    ...new Set(
      (request.nextUrl.searchParams.get("rowIds") ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];

  if (!/^[a-f0-9]{64}$/i.test(generation)) {
    return jsonError(400, "A valid report generation is required.");
  }
  if (
    !/^[a-f0-9-]{36}$/i.test(scanId) ||
    rowIds.length < 1 ||
    rowIds.length > MAX_ROW_IDS ||
    rowIds.some((rowId) => !/^[a-z0-9_]{1,96}$/.test(rowId))
  ) {
    return jsonError(400, "The requested report detail rows are invalid.");
  }

  const status = await getPublicScanStatusProjection(scanId);
  if (!status || !status.reportReady) {
    return jsonError(404, "The completed report is not available.");
  }
  if (status.reportGeneration !== generation) {
    return jsonError(409, "The report generation changed. Reload the report and try again.");
  }

  const scanRecord = await loadPersistedScanReportProjection({ generation, scanId });
  if (!scanRecord) {
    return jsonError(404, "The completed report projection is not available.");
  }
  const canonicalProjection = getPersistedCanonicalReportProjection(scanRecord);
  if (!canonicalProjection) {
    return jsonError(409, "Canonical report details are not available for this generation.");
  }
  const requested = new Set(rowIds);
  const rows = hydrateChecklistPolicyEvidence(
    canonicalProjection.checklistRows.filter((row) => requested.has(row.id)),
    canonicalProjection.evidenceIndex,
  );
  if (rows.length !== rowIds.length) {
    return jsonError(404, "One or more canonical report detail rows were not found.");
  }
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const orderedRows = rowIds.flatMap((rowId) => rowsById.get(rowId) ?? []);
  const etag = createHash("sha256")
    .update(`${generation}:${rowIds.join(",")}`)
    .digest("hex");

  return NextResponse.json(
    {
      artifactVersion: "gdpr-eprivacy-checklist-detail-v1",
      generation,
      rows: orderedRows,
      scanId,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        ETag: `"${etag}"`,
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
