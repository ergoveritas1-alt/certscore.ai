import { NextResponse } from "next/server";
import { createDomainRequestSchema, parseDomainBatchInput } from "@website-signal-risk-scanner/shared";
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
    const rawDomain = typeof payload?.domain === "string" ? payload.domain : "";
    const parsedBatch = parseDomainBatchInput(rawDomain);

    if (parsedBatch.valid.length === 0) {
      const singleResult = createDomainRequestSchema.safeParse(payload);
      return NextResponse.json(
        {
          error:
            singleResult.success
              ? "Invalid full scan request."
              : singleResult.error.issues[0]?.message ?? "Invalid full scan request."
        },
        { status: 400 }
      );
    }

    const scans = await Promise.all(
      parsedBatch.valid.map((item) =>
        createOrQueueDomainScan({
          allowExistingDomainRescan: true,
          domain: item.domain
        })
      )
    );
    const queuedScans = scans.filter((scan) => !scan.error && scan.scanId);

    if (queuedScans.length === 0) {
      return NextResponse.json(
        {
          error: scans.find((scan) => scan.error)?.error ?? "The full scan could not be started."
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        queuedCount: queuedScans.length,
        scanId: queuedScans[0]?.scanId ?? null,
        scanUrl: queuedScans.length === 1 ? `/app/scans/${queuedScans[0]?.scanId}` : "/app/scans"
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
