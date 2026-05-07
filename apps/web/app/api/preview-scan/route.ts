import { NextResponse } from "next/server";
import { previewScanRequestSchema } from "@website-signal-risk-scanner/shared";
import { createPreviewScan } from "../../../server/preview-scan/create-preview-scan";
import { validateScanUrl } from "../../../server/scan-intake/url-preflight";

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

    const preflight = await validateScanUrl(result.data.domain);
    const confirmedFinalUrl = typeof payload?.confirmedFinalUrl === "string" ? payload.confirmedFinalUrl : null;

    if (preflight.status !== "ok") {
      if (
        preflight.status === "redirected_to_different_domain" &&
        preflight.finalUrl &&
        confirmedFinalUrl === preflight.finalUrl
      ) {
        const preview = await createPreviewScan({
          hostname: preflight.finalHostname ?? result.data.hostname,
          normalizedUrl: preflight.finalUrl
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
      }

      return NextResponse.json(
        {
          code: preflight.status,
          error: preflight.message,
          preflight
        },
        { status: 400 }
      );
    }

    const preview = await createPreviewScan({
      hostname: preflight.finalHostname ?? result.data.hostname,
      normalizedUrl: preflight.finalUrl ?? preflight.normalizedUrl ?? result.data.normalizedUrl
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
