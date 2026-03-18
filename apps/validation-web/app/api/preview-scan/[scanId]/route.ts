import { NextResponse } from "next/server";
import { getPreviewScan } from "../../../../server/preview-scan/get-preview-scan";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    scanId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { scanId } = await context.params;
  const scan = await getPreviewScan(scanId);

  if (!scan) {
    return NextResponse.json(
      {
        error: "Preview scan not found."
      },
      {
        status: 404
      }
    );
  }

  return NextResponse.json(scan, {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}
