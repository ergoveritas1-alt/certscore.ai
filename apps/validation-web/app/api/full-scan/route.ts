import { NextResponse } from "next/server";
import { createDomainRequestSchema } from "@website-signal-risk-scanner/shared";
import { getCurrentUser } from "../../../server/auth";
import { createOrQueueDomainScan } from "../../../server/domains/create-domain";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        {
          error: "Sign in first to run a full scan."
        },
        { status: 401 }
      );
    }

    const payload = await request.json();
    const result = createDomainRequestSchema.safeParse(payload);

    if (!result.success) {
      return NextResponse.json(
        {
          error: result.error.issues[0]?.message ?? "Invalid full scan request."
        },
        { status: 400 }
      );
    }

    const scan = await createOrQueueDomainScan({
      allowExistingDomainRescan: true,
      domain: result.data.domain
    });

    if (scan.error || !scan.scanId) {
      return NextResponse.json(
        {
          error: scan.error ?? "The full scan could not be started."
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        scanId: scan.scanId,
        scanUrl: `/app/scans/${scan.scanId}`
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
        error: error instanceof Error ? error.message : "Full scan could not be created."
      },
      {
        status: 500
      }
    );
  }
}
