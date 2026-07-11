import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../server/auth";
import {
  getAnonymousOpsScanStatus,
  getOrganizationOpsScanStatus
} from "../../../../server/scans/ops-status";
import {
  buildLightweightScanStatusResponse,
  getViewerAccessibleScanStatusProjection
} from "../../../../server/scans/scan-status-projection";

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

  const user = await getCurrentUser();
  const projection = await getViewerAccessibleScanStatusProjection({
    scanId,
    viewerEmail: user?.email ?? null,
    viewerUserId: user?.id ?? null
  });
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
    return NextResponse.json(buildLightweightScanStatusResponse(projection), {
      headers: { "Cache-Control": "no-store" }
    });
  }

  const status = projection.organizationId === null
    ? await getAnonymousOpsScanStatus({ includeFindings: true, scanId })
    : await getOrganizationOpsScanStatus({
        includeFindings: true,
        organizationId: projection.organizationId,
        scanId,
        viewerEmail: user?.email ?? null
      });

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
