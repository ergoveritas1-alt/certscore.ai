import { NextResponse } from "next/server";
import { getAnonymousOpsScanStatus } from "../../../../server/scans/ops-status";

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
  const includeFindings = url.searchParams.get("includeFindings") === "1";

  if (!/^[0-9a-f-]{32,36}$/i.test(scanId)) {
    return NextResponse.json(
      {
        code: "invalid_scan_id",
        error: "Invalid scan id."
      },
      { status: 400 }
    );
  }

  const status = await getAnonymousOpsScanStatus({ includeFindings, scanId });

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
