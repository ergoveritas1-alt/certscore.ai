import { NextResponse } from "next/server";
import { previewScanRequestSchema } from "@website-signal-risk-scanner/shared";
import { checkDomainDns } from "../../../server/domains/domain-dns";
import {
  normalizeLocalV2DagRunViaLambda,
  normalizeLocalV2DagScanProfile
} from "../../../server/scans/local-v2-dag-scan-config";
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

    const localV2DagScanProfile = normalizeLocalV2DagScanProfile(payload?.localV2ScanProfile ?? payload?.v2ScanProfile);
    const localV2DagRunViaLambda = normalizeLocalV2DagRunViaLambda(
      payload?.localV2RunViaLambda ?? payload?.localV2DagRunViaLambda ?? payload?.v2RunViaLambda
    );
    const dnsStatus = await checkDomainDns(result.data.hostname);

    if (!dnsStatus.exists) {
      return NextResponse.json(
        {
          code: "domain_not_found",
          error: dnsStatus.reason
        },
        { status: 400 }
      );
    }

    const preview = await createPreviewScan({
      hostname: result.data.hostname,
      localV2DagScanProfile,
      localV2DagRunViaLambda,
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
