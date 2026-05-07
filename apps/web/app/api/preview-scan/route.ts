import { NextResponse } from "next/server";
import { previewScanRequestSchema } from "@website-signal-risk-scanner/shared";
import { createPreviewScan } from "../../../server/preview-scan/create-preview-scan";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const result = previewScanRequestSchema.safeParse(payload);

    if (!result.success) {
      return NextResponse.json(
        {
          error: result.error.issues[0]?.message ?? "Invalid preview scan request."
        },
        { status: 400 }
      );
    }

    const preview = await createPreviewScan({
      hostname: result.data.hostname,
      normalizedUrl: result.data.normalizedUrl
    });

    return NextResponse.json(
      {
        previewUrl: `/scan/${preview.scan.id}`,
        scanId: preview.scan.id,
        statusUrl: `/api/preview-scan/${preview.scan.id}`
      },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 202
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Preview scan could not be created."
      },
      {
        status: 500
      }
    );
  }
}
