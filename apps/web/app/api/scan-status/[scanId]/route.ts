import { after, NextResponse } from "next/server";
import {
  getPublicOpsScanStatus
} from "../../../../server/scans/ops-status";
import {
  buildLightweightScanStatusResponse,
  getPublicScanStatusProjection
} from "../../../../server/scans/scan-status-projection";
import { publishCanonicalScanReportProjection } from "../../../../server/scans/canonical-scan-report-publisher";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ScanStatusRouteContext = {
  params: Promise<{
    scanId: string;
  }>;
};

export async function GET(request: Request, context: ScanStatusRouteContext) {
  const { scanId } = await context.params;
  const url = new URL(request.url);
  const includeFindingsParam = url.searchParams.get("includeFindings");
  const includeFindings =
    includeFindingsParam === null ? true : /^(?:1|true)$/i.test(includeFindingsParam);

  if (!/^[0-9a-f-]{32,36}$/i.test(scanId)) {
    return NextResponse.json(
      {
        code: "invalid_scan_id",
        error: "Invalid scan id."
      },
      { status: 400 }
    );
  }

  const projection = await getPublicScanStatusProjection(scanId);
  if (!projection) {
    return NextResponse.json(
      { code: "scan_not_found", error: "Scan not found." },
      { status: 404 }
    );
  }

  if (!includeFindings) {
    console.info(JSON.stringify({
      event: "scan.progress_status_request",
      scanId,
      status: projection.status
    }));
    if (
      projection.reportProjectionRequired &&
      projection.reportInputsReady &&
      !projection.reportReady &&
      (projection.status === "completed" || projection.status === "completed_limited")
    ) {
      after(async () => {
        await publishCanonicalScanReportProjection({
          organizationId: projection.organizationId,
          scanId
        }).then((publication) => {
          console.info(JSON.stringify({
            event: "scan.report_projection.status_recovery",
            reason: publication.reason,
            scanId,
            status: publication.status
          }));
        }).catch((error) => {
          console.error(JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
            event: "scan.report_projection.status_recovery_failed",
            scanId
          }));
        });
      });
    }
    return NextResponse.json(buildLightweightScanStatusResponse(projection), {
      headers: { "Cache-Control": "no-store" }
    });
  }

  const status = await getPublicOpsScanStatus({ includeFindings: true, scanId });

  if (!status) {
    return NextResponse.json(
      {
        code: "scan_not_found",
        error: "Scan not found."
      },
      { status: 404 }
    );
  }

  return NextResponse.json(status, {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}
